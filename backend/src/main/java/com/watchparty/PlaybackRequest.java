package com.watchparty;

public record PlaybackRequest(
        String userId,
        PlaybackAction action,
        String videoId,
        Double currentTime
) {}