package com.watchparty;

public record PendingPlaybackRequest(
        String requestId,
        String userId,
        String username,
        PlaybackAction action,
        String videoId,
        Double currentTime
) {}
