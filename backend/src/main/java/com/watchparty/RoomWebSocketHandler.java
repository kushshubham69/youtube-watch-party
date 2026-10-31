package com.watchparty;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RoomWebSocketHandler extends TextWebSocketHandler {

    private final RoomManager roomManager;
    private final ObjectMapper objectMapper;

    private final ConcurrentHashMap<String, Set<WebSocketSession>> sessions =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<WebSocketSession, String> sessionUsers =
            new ConcurrentHashMap<>();

    public RoomWebSocketHandler(RoomManager roomManager, ObjectMapper objectMapper) {
        this.roomManager = roomManager;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String roomId = getRoomId(session);
        String userId = getQueryParameter(session, "userId");
        Room room = roomManager.getRoom(roomId);

        if (room == null || userId == null ||
                !room.getParticipants().containsKey(userId)) {
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        sessions.computeIfAbsent(roomId, id -> ConcurrentHashMap.newKeySet()).add(session);
        sessionUsers.put(session, userId);

        // Send the latest room state immediately after the user connects.
        sendRoomSnapshot(session, room);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message)
            throws Exception {
        String roomId = getRoomId(session);
        String connectedUserId = sessionUsers.get(session);

        try {
            if (connectedUserId == null) {
                throw new IllegalArgumentException("Your room connection is no longer valid.");
            }

            JsonNode payload = objectMapper.readTree(message.getPayload());
            String type = payload.hasNonNull("type") ? payload.get("type").asText() : "PLAYBACK";

            if ("CHAT_MESSAGE".equals(type)) {
                Room room = roomManager.getRoom(roomId);
                Participant sender = room == null ? null : room.getParticipants().get(connectedUserId);
                if (sender == null) {
                    throw new IllegalArgumentException("You are no longer a member of this room.");
                }

                String text = payload.hasNonNull("message") ? payload.get("message").asText().trim() : "";
                if (text.isBlank()) throw new IllegalArgumentException("Message cannot be empty.");
                if (text.length() > 500) throw new IllegalArgumentException("Messages must be 500 characters or fewer.");

                room.addChatMessage(new ChatMessage(
                        UUID.randomUUID().toString(), sender.getUserId(), sender.getUsername(), text, Instant.now().toString()));
                broadcastRoomUpdate(roomId);
            } else {
                PlaybackRequest request = objectMapper.treeToValue(payload, PlaybackRequest.class);
                // Do not trust a userId supplied in the message; use the connected session identity.
                if (!connectedUserId.equals(request.userId())) {
                    throw new IllegalArgumentException("Invalid WebSocket user!");
                }
                roomManager.updatePlayback(roomId, request);
                broadcastRoomUpdate(roomId);
            }
        } catch (Exception e) {
            String error = e.getMessage() == null
                    ? "Invalid WebSocket message" : e.getMessage();
            sendMessage(session, objectMapper.writeValueAsString(Map.of("error", error)));
        }
    }

    public void broadcastRoomUpdate(String roomId) {
        Room room = roomManager.getRoom(roomId);
        if (room == null) return;

        GetRoomResponse response = toRoomResponse(room);
        try {
            String json = objectMapper.writeValueAsString(response);
            Set<WebSocketSession> roomSessions = sessions.get(roomId);
            if (roomSessions == null) return;

            for (WebSocketSession client : roomSessions) {
                if (client.isOpen()) sendMessage(client, json);
            }
        } catch (IOException e) {
            System.err.println("Unable to broadcast room update: " + e.getMessage());
        }
    }

    public void disconnectParticipant(String roomId, String userId) {
        Set<WebSocketSession> roomSessions = sessions.get(roomId);
        if (roomSessions == null) return;

        for (WebSocketSession session : roomSessions) {
            if (userId.equals(sessionUsers.get(session))) {
                try {
                    sendMessage(session, objectMapper.writeValueAsString(
                            Map.of("removed", true,
                                   "error", "You have been removed from this room.")));
                    session.close(CloseStatus.NORMAL);
                } catch (IOException e) {
                    System.err.println("Unable to close removed participant session: " +
                            e.getMessage());
                }
            }
        }
    }

    private void sendRoomSnapshot(WebSocketSession session, Room room) throws IOException {
        sendMessage(session, objectMapper.writeValueAsString(toRoomResponse(room)));
    }

    private GetRoomResponse toRoomResponse(Room room) {
        List<ParticipantResponse> participants = room.getParticipants().values().stream()
                .map(p -> new ParticipantResponse(
                        p.getUserId(), p.getUsername(), p.getRole().name()))
                .toList();

        return new GetRoomResponse(
                room.getRoomId(), room.getVideoId(), room.isPlaying(),
                room.getCurrentTime(), participants,
                room.getPendingRequests().values().stream().toList(),
                room.getChatMessages());
    }

    private void sendMessage(WebSocketSession session, String message) throws IOException {
        synchronized (session) {
            if (session.isOpen()) session.sendMessage(new TextMessage(message));
        }
    }

    private String getRoomId(WebSocketSession session) {
        String path = session.getUri().getPath();
        return path.substring(path.lastIndexOf('/') + 1);
    }

    private String getQueryParameter(WebSocketSession session, String key) {
        String query = session.getUri().getQuery();
        if (query == null) return null;

        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 &&
                    URLDecoder.decode(parts[0], StandardCharsets.UTF_8).equals(key)) {
                return URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessionUsers.remove(session);
        String roomId = getRoomId(session);
        Set<WebSocketSession> roomSessions = sessions.get(roomId);

        if (roomSessions != null) {
            roomSessions.remove(session);
            if (roomSessions.isEmpty()) sessions.remove(roomId, roomSessions);
        }
    }
}
