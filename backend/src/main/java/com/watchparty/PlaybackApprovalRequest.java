package com.watchparty;

public record PlaybackApprovalRequest(
        String userId,
        PlaybackAction action,
        String videoId,
        Double currentTime
) {}
