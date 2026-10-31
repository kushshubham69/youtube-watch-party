package com.watchparty;

import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = {"http://localhost:5173", "http://localhost:5174"})
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomManager roomManager;
    private final RoomWebSocketHandler webSocketHandler;

    public RoomController(
            RoomManager roomManager,
            RoomWebSocketHandler webSocketHandler) {

        this.roomManager = roomManager;
        this.webSocketHandler = webSocketHandler;
    }

    @PostMapping
    public CreateRoomResponse createRoom(
            @RequestBody CreateRoomRequest request) {

        String username = request.username();

        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("Username cannot be empty");
        }

        Room room = roomManager.createRoom(username);

        Participant host = room.getParticipants().values().stream()
                .filter(p -> p.getRole() == Role.HOST)
                .findFirst()
                .orElseThrow();

        return new CreateRoomResponse(
                room.getRoomId(),
                host.getUserId(),
                host.getUsername(),
                host.getRole().name(),
                room.getVideoId(),
                room.isPlaying(),
                room.getCurrentTime()
        );
    }

    @PostMapping("/{roomId}/join")
    public JoinRoomResponse joinRoom(
            @PathVariable String roomId,
            @RequestBody JoinRoomRequest request) {

        String username = request.username();

        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("Username cannot be empty");
        }

        Participant participant =
                roomManager.joinRoom(roomId, username);

        Room room = roomManager.getRoom(roomId);

        webSocketHandler.broadcastRoomUpdate(roomId);

        return new JoinRoomResponse(
                room.getRoomId(),
                participant.getUserId(),
                participant.getUsername(),
                participant.getRole().name(),
                room.getVideoId(),
                room.isPlaying(),
                room.getCurrentTime()
        );
    }

    @GetMapping("/{roomId}")
    public GetRoomResponse getRoom(@PathVariable String roomId) {

        Room room = roomManager.getRoom(roomId);

        if (room == null) {
            throw new IllegalArgumentException("Room not found!");
        }

        return toRoomResponse(room);
    }

    @PutMapping("/{roomId}/playback")
    public GetRoomResponse updatePlayback(
            @PathVariable String roomId,
            @RequestBody PlaybackRequest request) {

        Room room = roomManager.updatePlayback(roomId, request);

        webSocketHandler.broadcastRoomUpdate(roomId);

        return toRoomResponse(room);
    }


    @PostMapping("/{roomId}/playback-requests")
    public GetRoomResponse requestPlaybackApproval(
            @PathVariable String roomId,
            @RequestBody PlaybackApprovalRequest request) {
        roomManager.requestPlaybackApproval(roomId, request);
        Room room = roomManager.getRoom(roomId);
        webSocketHandler.broadcastRoomUpdate(roomId);
        return toRoomResponse(room);
    }

    @PutMapping("/{roomId}/playback-requests/{requestId}/approve")
    public GetRoomResponse approvePlaybackRequest(
            @PathVariable String roomId,
            @PathVariable String requestId,
            @RequestBody ApprovalDecisionRequest request) {
        Room room = roomManager.approvePlaybackRequest(roomId, request.approverId(), requestId);
        webSocketHandler.broadcastRoomUpdate(roomId);
        return toRoomResponse(room);
    }

    @PutMapping("/{roomId}/playback-requests/{requestId}/reject")
    public GetRoomResponse rejectPlaybackRequest(
            @PathVariable String roomId,
            @PathVariable String requestId,
            @RequestBody ApprovalDecisionRequest request) {
        Room room = roomManager.rejectPlaybackRequest(roomId, request.approverId(), requestId);
        webSocketHandler.broadcastRoomUpdate(roomId);
        return toRoomResponse(room);
    }

    @PutMapping("/{roomId}/role")
    public GetRoomResponse changeRole(
            @PathVariable String roomId,
            @RequestBody ChangeRoleRequest request) {

        roomManager.changeRole(roomId, request);

        Room room = roomManager.getRoom(roomId);

        webSocketHandler.broadcastRoomUpdate(roomId);

        return toRoomResponse(room);
    }

    @DeleteMapping("/{roomId}/participants")
    public GetRoomResponse removeParticipant(
            @PathVariable String roomId,
            @RequestBody RemoveParticipantRequest request) {

        roomManager.removeParticipant(roomId, request);

        // Removed user should not remain connected to this room's WebSocket.
        webSocketHandler.disconnectParticipant(roomId, request.targetUserId());

        Room room = roomManager.getRoom(roomId);

        webSocketHandler.broadcastRoomUpdate(roomId);

        return toRoomResponse(room);
    }

    private GetRoomResponse toRoomResponse(Room room) {

        var participants = room.getParticipants().values().stream()
                .map(p -> new ParticipantResponse(
                        p.getUserId(),
                        p.getUsername(),
                        p.getRole().name()
                ))
                .toList();

        return new GetRoomResponse(
                room.getRoomId(),
                room.getVideoId(),
                room.isPlaying(),
                room.getCurrentTime(),
                participants,
                room.getPendingRequests().values().stream().toList(),
                room.getChatMessages()
        );
    }
}