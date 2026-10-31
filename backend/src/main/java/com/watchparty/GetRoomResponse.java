package com.watchparty;

import java.util.List;

public record GetRoomResponse(
        String roomId,
        String videoId,
        boolean playing,
        double currentTime,
        List<ParticipantResponse> participants,
        List<PendingPlaybackRequest> pendingRequests,
        List<ChatMessage> chatMessages
) {}
