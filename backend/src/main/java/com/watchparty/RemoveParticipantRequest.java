package com.watchparty;

public record RemoveParticipantRequest(
        String requesterId,
        String targetUserId
) {}