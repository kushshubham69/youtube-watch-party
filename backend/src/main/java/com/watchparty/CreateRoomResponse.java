package com.watchparty;

public record CreateRoomResponse(
        String roomId,
        String hostUserId,
        String hostUsername,
        String hostRole,
        String videoId,
        boolean playing,
        double currentTime
) {}