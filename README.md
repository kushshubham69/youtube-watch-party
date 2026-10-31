# YouTube Watch Party

A React + Spring Boot application for watching YouTube videos together in rooms. Room state is shared through WebSockets, while the backend checks permissions before applying playback changes.

## Features

- Create a room and join with a room code.
- Host, Moderator and Participant roles.
- Host can promote/demote participants and remove participants.
- Host and Moderator can control playback directly.
- Participants can request play, pause, seek or video changes.
- Host or Moderator can approve or reject participant playback requests.
- Approved playback actions update the room state and are broadcast to connected users.
- YouTube videos are embedded using the YouTube IFrame Player API.

## Technology

- Frontend: React + Vite
- Backend: Java + Spring Boot
- Real-time communication: WebSocket
- Video: YouTube IFrame Player API
- Room storage: in-memory `ConcurrentHashMap` (rooms are lost when the backend restarts)

## Run locally

### Backend

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Backend default URL: `http://localhost:8081`

Health check: `http://localhost:8081/api/health`

### Frontend

Open a second terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --port 5174
```

Frontend URL: `http://localhost:5174`

If PowerShell cannot find Node.js, add `C:\Program Files\nodejs` to PATH or run this in the current terminal:

```powershell
$env:Path += ";C:\Program Files\nodejs"
```

## Participant approval workflow

Participants cannot directly change playback. They can submit one pending request per participant for `PLAY`, `PAUSE`, `SEEK` or `CHANGE_VIDEO`.

A Host or Moderator can approve or reject the request. Approval applies the action to the room and broadcasts the updated room snapshot over WebSocket. Rejection removes the pending request without changing playback.

### Approval API endpoints

- `POST /api/rooms/{roomId}/playback-requests` — submit a participant request.
- `PUT /api/rooms/{roomId}/playback-requests/{requestId}/approve` — approve as Host/Moderator.
- `PUT /api/rooms/{roomId}/playback-requests/{requestId}/reject` — reject as Host/Moderator.

Request payload for submitting an action:

```json
{
  "userId": "PARTICIPANT_USER_ID",
  "action": "PAUSE",
  "videoId": null,
  "currentTime": 42.5
}
```

Approval/rejection payload:

```json
{
  "approverId": "HOST_OR_MODERATOR_USER_ID"
}
```

## Manual test checklist

1. Host creates a room and a Participant joins.
2. Participant submits a play/pause/seek/video-change request.
3. Host and Moderator see the pending request.
4. Approve the request and verify the room playback state changes for all connected users.
5. Submit another request and reject it; verify playback does not change.
6. Verify a Participant cannot approve or reject requests.
7. Verify Host/Moderator can still control playback directly.

## Current limitations

- Rooms and pending requests are stored in memory and are lost when the backend restarts.
- The current assessment build uses user IDs supplied by the frontend in REST request bodies. A production deployment should add authenticated sessions/tokens and derive user identity from the authenticated connection rather than trusting a client-supplied ID.
- A live public deployment URL has not yet been configured.

## Real-time room chat

A lightweight room chat is available in the room details panel. Messages are sent through the existing WebSocket connection, not a separate chat server.

- Each message is associated with the participant identity from the established WebSocket session; the client cannot choose another sender's user ID.
- Messages are limited to 500 characters.
- The room keeps the latest 50 messages in memory and includes them in the room snapshot for participants who join later.
- Chat messages are broadcast only to connected sessions in the same room.
- A removed participant is disconnected from the room WebSocket and cannot continue sending messages.

Client-to-server chat message:

```json
{
  "type": "CHAT_MESSAGE",
  "message": "Hello everyone!"
}
```

The server broadcasts an updated room snapshot containing `chatMessages` to the room. Chat history is in memory only and is lost when the backend restarts.

## Chat test checklist

1. Open two browser sessions and join the same room.
2. Send a message from Browser A; verify it appears in both sessions.
3. Reply from Browser B; verify it appears in both sessions with the correct username.
4. Open another participant session and verify recent messages are included when it connects.
5. Send a message longer than 500 characters and verify the server rejects it.
6. Remove a participant and verify their WebSocket closes and they can no longer send messages.
7. Open a separate room and verify its chat does not receive messages from the first room.
