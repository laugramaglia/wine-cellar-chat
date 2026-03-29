CREATE SCHEMA IF NOT EXISTS chat;
SET search_path TO chat;

-- Enums
CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'document', 'audio');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
CREATE TYPE group_role AS ENUM ('admin', 'member');

CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    profile_picture_url VARCHAR(1024)
);

CREATE TABLE IF NOT EXISTS conversations (
    conversation_id BIGSERIAL PRIMARY KEY,
    type conversation_type NOT NULL,
    last_message_id BIGINT
);

CREATE TABLE IF NOT EXISTS messages (
    message_id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL,
    conversation_id BIGINT NOT NULL,
    message_type message_type NOT NULL DEFAULT 'text',
    message_content TEXT,
    media_url VARCHAR(1024),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status message_status NOT NULL DEFAULT 'sent',
    FOREIGN KEY (sender_id) REFERENCES users(user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Foreign key constraints loop fix: messages -> conversations and conversations -> messages
ALTER TABLE conversations ADD CONSTRAINT fk_last_message FOREIGN KEY (last_message_id) REFERENCES messages(message_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS groups (
    group_id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(255) NOT NULL,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    profile_picture_url VARCHAR(1024),
    is_public BOOLEAN DEFAULT false,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role group_role NOT NULL DEFAULT 'member',
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(group_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Stored procedure for bulk inserting messages using parallel arrays
-- This is much safer and faster for pgx than composite types which require manual string formatting
CREATE OR REPLACE PROCEDURE bulk_insert_messages(
    sender_ids BIGINT[],
    conversation_ids BIGINT[],
    message_types text[],
    message_contents TEXT[],
    media_urls text[],
    statuses text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO messages (sender_id, conversation_id, message_type, message_content, media_url, status)
    SELECT
        unnest(sender_ids),
        unnest(conversation_ids),
        CAST(unnest(message_types) AS message_type),
        unnest(message_contents),
        unnest(media_urls),
        CAST(unnest(statuses) AS message_status);
END;
$$;

-- Function for fast reads by user (sender or recipient)
-- Now reads messages by conversation
CREATE OR REPLACE FUNCTION get_conversation_messages(
    conv_id BIGINT,
    limit_val INT DEFAULT 50,
    offset_val INT DEFAULT 0
)
RETURNS TABLE (
    message_id BIGINT,
    sender_id BIGINT,
    conversation_id BIGINT,
    message_type message_type,
    message_content TEXT,
    media_url VARCHAR,
    sent_at TIMESTAMP WITH TIME ZONE,
    status message_status
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT m.message_id, m.sender_id, m.conversation_id, m.message_type, m.message_content, m.media_url, m.sent_at, m.status
    FROM messages m
    WHERE m.conversation_id = conv_id
    ORDER BY m.sent_at DESC
    LIMIT limit_val OFFSET offset_val;
END;
$$;
