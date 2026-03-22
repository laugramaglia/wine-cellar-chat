CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(255) NOT NULL,
    recipient_id VARCHAR(255) NOT NULL,
    message_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient_id ON chat_messages(recipient_id);

-- Create a type for bulk ingestion of messages
CREATE TYPE chat_message_type AS (
    sender_id VARCHAR(255),
    recipient_id VARCHAR(255),
    message_content TEXT
);

-- Stored procedure for bulk inserting messages
CREATE OR REPLACE PROCEDURE bulk_insert_messages(
    messages chat_message_type[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO chat_messages (sender_id, recipient_id, message_content)
    SELECT m.sender_id, m.recipient_id, m.message_content
    FROM unnest(messages) AS m;
END;
$$;

-- Function for fast reads by user (sender or recipient)
CREATE OR REPLACE FUNCTION get_user_messages(
    user_id VARCHAR(255),
    limit_val INT DEFAULT 50,
    offset_val INT DEFAULT 0
)
RETURNS TABLE (
    id INT,
    sender_id VARCHAR(255),
    recipient_id VARCHAR(255),
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
