package com.watchparty;

public record ParticipantResponse(
        String userId,
        String username,
        String role
) {
}