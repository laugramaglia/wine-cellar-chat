CREATE SCHEMA IF NOT EXISTS chat;
SET search_path TO chat;

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    message_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient_id ON chat_messages(recipient_id);

-- Stored procedure for bulk inserting messages using parallel arrays
-- This is much safer and faster for pgx than composite types which require manual string formatting
CREATE OR REPLACE PROCEDURE bulk_insert_messages(
    sender_ids INT[],
    recipient_ids INT[],
    contents TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO chat_messages (sender_id, recipient_id, message_content)
    SELECT unnest(sender_ids), unnest(recipient_ids), unnest(contents);
END;
$$;

-- Function for fast reads by user (sender or recipient)
CREATE OR REPLACE FUNCTION get_user_messages(
    user_id INT,
    limit_val INT DEFAULT 50,
    offset_val INT DEFAULT 0
)
RETURNS TABLE (
    id INT,
    sender_id INT,
    recipient_id INT,
    message_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT cm.id, cm.sender_id, cm.recipient_id, cm.message_content, cm.created_at
    FROM chat_messages cm
    WHERE cm.sender_id = user_id OR cm.recipient_id = user_id
    ORDER BY cm.created_at DESC
    LIMIT limit_val OFFSET offset_val;
END;
$$;
