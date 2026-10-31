package com.watchparty;

import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomManager {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    // Naya room create karne ke liye
    public Room createRoom(String username) {
        String roomId = UUID.randomUUID().toString().substring(0, 8);

        Room room = new Room(roomId);

        Participant host = new Participant(
                UUID.randomUUID().toString(),
                username,
                Role.HOST
        );

        room.addParticipant(host);
        rooms.put(roomId, room);

        return room;
    }

    // Room ki details find karne ke liye
    public Room getRoom(String roomId) {
        return rooms.get(roomId);
    }

    // Room delete karne ke liye
    public boolean removeRoom(String roomId) {
        return rooms.remove(roomId) != null;
    }

    // Existing room mein new participant add karne ke liye
    public Participant joinRoom(String roomId, String username) {
        Room room = rooms.get(roomId);

        if (room == null) {
            throw new IllegalArgumentException("Room not found!");
        }

        Participant participant = new Participant(
                UUID.randomUUID().toString(),
                username,
                Role.PARTICIPANT
        );

        room.addParticipant(participant);

        return participant;
    }

    // Room ki playback state update karne ke liye
    public Room updatePlayback(String roomId, PlaybackRequest request) {
        Room room = rooms.get(roomId);

        if (room == null) {
            throw new IllegalArgumentException("Room not found!");
        }

        Participant participant =
                room.getParticipants().get(request.userId());

        if (participant == null) {
            throw new IllegalArgumentException(
                    "User is not a member of this room!"
            );
        }

        if (participant.getRole() == Role.PARTICIPANT) {
            throw new IllegalArgumentException(
                    "You don't have permission to control playback!"
            );
        }

        if (request.action() == null) {
            throw new IllegalArgumentException(
                    "Playback action is required!"
            );
        }

        applyPlaybackAction(room, request.action(), request.videoId(), request.currentTime());
        return room;
    }

    // Participant can ask Host/Moderator to perform a playback action.
    public PendingPlaybackRequest requestPlaybackApproval(
            String roomId, PlaybackApprovalRequest request) {
        Room room = rooms.get(roomId);
        if (room == null) throw new IllegalArgumentException("Room not found!");

        Participant requester = room.getParticipants().get(request.userId());
        if (requester == null) throw new IllegalArgumentException("User is not a member of this room!");
        if (requester.getRole() != Role.PARTICIPANT) {
            throw new IllegalArgumentException("Only Participants need to request playback approval.");
        }

        validatePlaybackAction(request.action(), request.videoId(), request.currentTime());

        boolean alreadyPending = room.getPendingRequests().values().stream()
                .anyMatch(pending -> pending.userId().equals(request.userId()));
        if (alreadyPending) {
            throw new IllegalArgumentException("You already have a pending playback request.");
        }

        PendingPlaybackRequest pending = new PendingPlaybackRequest(
                UUID.randomUUID().toString(), requester.getUserId(), requester.getUsername(),
                request.action(), request.videoId(), request.currentTime());
        room.getPendingRequests().put(pending.requestId(), pending);
        return pending;
    }

    // Only Host/Moderator can approve. The action is applied on behalf of the room,
    // after checking that the requester is still a Participant in this room.
    public Room approvePlaybackRequest(String roomId, String approverId, String requestId) {
        Room room = rooms.get(roomId);
        if (room == null) throw new IllegalArgumentException("Room not found!");

        Participant approver = room.getParticipants().get(approverId);
        if (approver == null || approver.getRole() == Role.PARTICIPANT) {
            throw new IllegalArgumentException("Only Host or Moderator can approve requests!");
        }

        PendingPlaybackRequest pending = room.getPendingRequests().get(requestId);
        if (pending == null) throw new IllegalArgumentException("Pending request not found!");

        Participant requester = room.getParticipants().get(pending.userId());
        if (requester == null || requester.getRole() != Role.PARTICIPANT) {
            room.getPendingRequests().remove(requestId);
            throw new IllegalArgumentException("Requester is no longer a Participant in this room.");
        }

        applyPlaybackAction(room, pending.action(), pending.videoId(), pending.currentTime());
        room.getPendingRequests().remove(requestId);
        return room;
    }

    public Room rejectPlaybackRequest(String roomId, String approverId, String requestId) {
        Room room = rooms.get(roomId);
        if (room == null) throw new IllegalArgumentException("Room not found!");

        Participant approver = room.getParticipants().get(approverId);
        if (approver == null || approver.getRole() == Role.PARTICIPANT) {
            throw new IllegalArgumentException("Only Host or Moderator can reject requests!");
        }

        if (room.getPendingRequests().remove(requestId) == null) {
            throw new IllegalArgumentException("Pending request not found!");
        }
        return room;
    }

    private void applyPlaybackAction(Room room, PlaybackAction action, String videoId, Double currentTime) {
        validatePlaybackAction(action, videoId, currentTime);
        switch (action) {
            case PLAY:
                if (currentTime != null) room.setCurrentTime(currentTime);
                room.setPlaying(true);
                break;
            case PAUSE:
                if (currentTime != null) room.setCurrentTime(currentTime);
                room.setPlaying(false);
                break;
            case SEEK:
                room.setCurrentTime(currentTime);
                break;
            case CHANGE_VIDEO:
                room.setVideoId(videoId);
                room.setCurrentTime(0.0);
                room.setPlaying(false);
                break;
        }
    }

    private void validatePlaybackAction(PlaybackAction action, String videoId, Double currentTime) {
        if (action == null) throw new IllegalArgumentException("Playback action is required!");
        if ((action == PlaybackAction.SEEK || action == PlaybackAction.PLAY || action == PlaybackAction.PAUSE)
                && currentTime != null && currentTime < 0) {
            throw new IllegalArgumentException("Valid video time is required!");
        }
        if (action == PlaybackAction.SEEK && currentTime == null) {
            throw new IllegalArgumentException("Valid video time is required!");
        }
        if (action == PlaybackAction.CHANGE_VIDEO && (videoId == null || videoId.isBlank())) {
            throw new IllegalArgumentException("Video ID is required!");
        }
    }

    // Host ke through participant ka role change karne ke liye
    public Participant changeRole(
            String roomId,
            ChangeRoleRequest request) {

        Room room = rooms.get(roomId);

        if (room == null) {
            throw new IllegalArgumentException("Room not found!");
        }

        Participant requester =
                room.getParticipants().get(request.requesterId());

        if (requester == null) {
            throw new IllegalArgumentException("Requester not found!");
        }

        if (requester.getRole() != Role.HOST) {
            throw new IllegalArgumentException(
                    "Only Host can change participant roles!"
            );
        }

        Participant target =
                room.getParticipants().get(request.targetUserId());

        if (target == null) {
            throw new IllegalArgumentException("Target user not found!");
        }

        if (requester.getUserId().equals(target.getUserId())) {
            throw new IllegalArgumentException(
                    "Host cannot change their own role!"
            );
        }

        if (request.newRole() == null ||
                request.newRole() == Role.HOST) {
            throw new IllegalArgumentException("Invalid role assignment!");
        }

        target.setRole(request.newRole());
        if (request.newRole() != Role.PARTICIPANT) {
            room.getPendingRequests().values().removeIf(p -> p.userId().equals(target.getUserId()));
        }

        return target;
    }

    // Room se participant ko remove karne ke liye
    public void removeParticipant(
            String roomId,
            RemoveParticipantRequest request) {

        Room room = rooms.get(roomId);

        if (room == null) {
            throw new IllegalArgumentException("Room not found!");
        }

        Participant requester =
                room.getParticipants().get(request.requesterId());

        if (requester == null) {
            throw new IllegalArgumentException("Requester not found!");
        }

        Participant target =
                room.getParticipants().get(request.targetUserId());

        if (target == null) {
            throw new IllegalArgumentException("Target user not found!");
        }

        // Sirf Host aur Moderator participant ko remove kar sakte hain
        if (requester.getRole() == Role.PARTICIPANT) {
            throw new IllegalArgumentException(
                    "You don't have permission to remove participants!"
            );
        }

        // Host ko remove nahi kar sakte
        if (target.getRole() == Role.HOST) {
            throw new IllegalArgumentException("Host cannot be removed!");
        }

        // Moderator sirf normal Participant ko remove kar sakta hai
        if (requester.getRole() == Role.MODERATOR &&
                target.getRole() != Role.PARTICIPANT) {
            throw new IllegalArgumentException(
                    "Moderator can only remove participants!"
            );
        }

        room.removeParticipant(target.getUserId());
        room.getPendingRequests().values().removeIf(p -> p.userId().equals(target.getUserId()));
    }
}