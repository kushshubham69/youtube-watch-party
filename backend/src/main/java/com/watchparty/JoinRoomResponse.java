package com.watchparty;

public record JoinRoomResponse(
        String roomId,
        String userId,
        String username,
        String role,
        String videoId,
        boolean playing,
        double currentTime
) {
}