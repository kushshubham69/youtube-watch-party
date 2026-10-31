
package com.watchparty;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class Room {

    private final String roomId;

    // i used ConcurrentHashMap to store Participant , where i use their Username as input and get Particpant Object as the value

    private final Map<String, Participant> participants =
            new ConcurrentHashMap<>();

    // Participant playback requests waiting for Host/Moderator approval.
    private final Map<String, PendingPlaybackRequest> pendingRequests =
            new ConcurrentHashMap<>();

    // Keep a small recent chat history for participants who join later.
    private final List<ChatMessage> chatMessages = new CopyOnWriteArrayList<>();

    private String videoId = "";
    private boolean playing = false;
    private double currentTime = 0.0;

    public Room(String roomId) {
        this.roomId = roomId;
    }

    public String getRoomId() {
        return roomId;
    }

    public Map<String, Participant> getParticipants() {
        return participants;
    }

    public Map<String, PendingPlaybackRequest> getPendingRequests() {
        return pendingRequests;
    }

    public List<ChatMessage> getChatMessages() {
        return List.copyOf(chatMessages);
    }

    public void addChatMessage(ChatMessage message) {
        chatMessages.add(message);
        while (chatMessages.size() > 50) {
            chatMessages.remove(0);
        }
    }

    public String getVideoId() {
        return videoId;
    }

    public boolean isPlaying() {
        return playing;
    }

    public double getCurrentTime() {
        return currentTime;
    }

    public void addParticipant(Participant participant) {
        participants.put(participant.getUserId(), participant);
    }

    public void removeParticipant(String userId) {
        participants.remove(userId);
    }

    public void setVideoId(String videoId) {
        this.videoId = videoId;
    }

    public void setPlaying(boolean playing) {
        this.playing = playing;
    }

    public void setCurrentTime(double currentTime) {
        this.currentTime = currentTime;
    }
}
