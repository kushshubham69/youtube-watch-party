package com.watchparty;

public record ChatMessage(
        String messageId,
        String userId,
        String username,
        String message,
        String sentAt
) {}
