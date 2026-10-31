import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8081";

const API = `${API_BASE}/api/rooms`;
const WS = `${WS_BASE}/ws/rooms`;

function extractYouTubeVideoId(value) {
  const input = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }

  return null;
}

let youtubeApiPromise;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === "function") previousCallback();
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        youtubeApiPromise = null;
        reject(new Error("YouTube IFrame API could not be loaded."));
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

async function readResponse(response, fallbackMessage) {
  if (response.ok) return response.json();

  let message = fallbackMessage;
  try {
    const data = await response.json();
    if (data.message) message = data.message;
    else if (data.error) message = data.error;
  } catch {
    // Keep the fallback message if the server did not return JSON.
  }
  throw new Error(message);
}

function App() {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoChannel, setVideoChannel] = useState("");
  const [seekTime, setSeekTime] = useState("0");
  const [busyParticipantId, setBusyParticipantId] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [decisionBusyId, setDecisionBusyId] = useState("");
  const [playerStatus, setPlayerStatus] = useState("Waiting for a video");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const socketRef = useRef(null);
  const playerMountRef = useRef(null);
  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);
  const roomSnapshotRef = useRef(room);

  roomSnapshotRef.current = room;

  async function loadRoomDetails(id) {
    const response = await fetch(`${API}/${id}`);
    const data = await readResponse(response, "Room not found.");
    setParticipants(data.participants || []);
    setChatMessages(data.chatMessages || []);
    setRoom((previous) => previous ? { ...previous, ...data } : previous);
  }

  async function createRoom() {
    if (!username.trim()) {
      setError("Please enter your name.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await readResponse(response, "Unable to create room.");

      setRoom({
        ...data,
        userId: data.hostUserId,
        username: data.hostUsername,
        role: data.hostRole,
      });
      setRoomId(data.roomId);
      await loadRoomDetails(data.roomId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!username.trim() || !roomId.trim()) {
      setError("Enter your name and room ID.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${API}/${roomId.trim()}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await readResponse(response, "Unable to join room. Check the room ID.");

      setRoom({
        ...data,
        userId: data.userId,
        username: data.username,
        role: data.role,
      });
      setRoomId(data.roomId);
      await loadRoomDetails(data.roomId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Connect this browser to its room's WebSocket.
  useEffect(() => {
    if (!room?.roomId || !room?.userId) return undefined;

    const socket = new WebSocket(
      `${WS}/${room.roomId}?userId=${encodeURIComponent(room.userId)}`
    );
    socketRef.current = socket;

    socket.onopen = () => setConnectionStatus("connected");

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.removed) {
          setError(data.error || "You have been removed from this room.");
          setRoom(null);
          setParticipants([]);
          socket.close();
          return;
        }

        if (data.error) {
          setError(data.error);
          return;
        }

        if (Array.isArray(data.chatMessages)) setChatMessages(data.chatMessages);
        const latestParticipants = data.participants || [];
        setParticipants(latestParticipants);
        const currentUser = latestParticipants.find(
          (person) => person.userId === room.userId
        );

        if (!currentUser) {
          setError("You are no longer a member of this room.");
          setRoom(null);
          socket.close();
          return;
        }

        setRoom((previous) => previous
          ? { ...previous, ...data, role: currentUser.role }
          : previous
        );
      } catch {
        console.error("Invalid WebSocket message received.");
      }
    };

    socket.onerror = () => setConnectionStatus("error");
    socket.onclose = () => setConnectionStatus("disconnected");

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
      setConnectionStatus("disconnected");
    };
  }, [room?.roomId, room?.userId]);

  function updateVideoMetadata() {
    const player = playerRef.current;
    if (!player || !playerReadyRef.current) return;
    try {
      const data = player.getVideoData();
      if (data?.video_id) {
        setVideoTitle(data.title || "YouTube video");
        setVideoChannel(data.author || "");
      }
    } catch {
      // Metadata may not be available until YouTube finishes loading the video.
    }
  }

  const applyRoomSnapshot = useCallback((snapshot) => {
    if (!snapshot?.videoId || !playerReadyRef.current || !playerRef.current) return;

    const player = playerRef.current;
    const currentVideoId = player.getVideoData()?.video_id;
    const videoChanged = currentVideoId !== snapshot.videoId;
    const targetTime = Math.max(0, Number(snapshot.currentTime) || 0);

    try {
      if (videoChanged) {
        if (snapshot.playing) {
          player.loadVideoById({ videoId: snapshot.videoId, startSeconds: targetTime });
        } else {
          player.cueVideoById({ videoId: snapshot.videoId, startSeconds: targetTime });
        }
      } else {
        const actualTime = player.getCurrentTime() || 0;
        if (Math.abs(actualTime - targetTime) > 1.5) player.seekTo(targetTime, true);

        if (snapshot.playing && player.getPlayerState() !== window.YT.PlayerState.PLAYING) {
          player.playVideo();
        } else if (!snapshot.playing && player.getPlayerState() !== window.YT.PlayerState.PAUSED) {
          player.pauseVideo();
        }
      }
      setPlayerStatus(snapshot.playing ? "Playing" : "Paused");
    } catch (playerError) {
      console.error("Could not synchronize YouTube player:", playerError);
    }
  }, []);

  // Create the official YouTube player once the user enters a room.
  // The API replaces its target element with an iframe, so give it a dedicated
  // child element rather than the React-owned mount element itself.
  useEffect(() => {
    if (!room?.roomId || !playerMountRef.current) return undefined;
    let cancelled = false;
    let createdPlayer = null;
    const mount = playerMountRef.current;
    mount.replaceChildren();
    const playerElement = document.createElement("div");
    playerElement.style.width = "100%";
    playerElement.style.height = "100%";
    mount.appendChild(playerElement);

    loadYouTubeApi().then((YT) => {
      if (cancelled || !mount.isConnected) return;

      createdPlayer = new YT.Player(playerElement, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = createdPlayer;
            playerReadyRef.current = true;
            const latestRoom = roomSnapshotRef.current;
            setPlayerStatus(latestRoom?.videoId ? "Player ready" : "Waiting for a video");
            applyRoomSnapshot(latestRoom);
            window.setTimeout(updateVideoMetadata, 700);
          },
          onStateChange: () => {
            window.setTimeout(updateVideoMetadata, 250);
          },
          onError: (event) => {
            const messages = {
              2: "Invalid YouTube video ID.",
              5: "This video cannot be played in the HTML5 player.",
              100: "This YouTube video was not found or is private.",
              101: "The owner does not allow this video to be embedded.",
              150: "The owner does not allow this video to be embedded.",
              153: "YouTube could not verify the request. Check the page origin/referrer settings.",
            };
            setError(messages[event.data] || `YouTube player error (${event.data}).`);
            setPlayerStatus("Player error");
          },
        },
      });
    }).catch(() => setError("Unable to load the YouTube player. Check your internet connection."));

    return () => {
      cancelled = true;
      playerReadyRef.current = false;
      if (playerRef.current === createdPlayer || !createdPlayer) playerRef.current = null;
      if (createdPlayer) {
        try { createdPlayer.destroy(); } catch { /* Player may not have finished loading. */ }
      }
      if (mount.isConnected) mount.replaceChildren();
    };
  }, [room?.roomId]);

  useEffect(() => {
    setVideoTitle("");
    setVideoChannel("");
  }, [room?.videoId]);

  // Apply every new backend snapshot to this browser's YouTube player.
  useEffect(() => {
    applyRoomSnapshot(room);
  }, [applyRoomSnapshot, room?.videoId, room?.playing, room?.currentTime]);

  async function sendPlaybackAction(action, seekOverride = null) {
    if (!room) return;

    let selectedVideoId = null;
    if (action === "CHANGE_VIDEO") {
      selectedVideoId = extractYouTubeVideoId(videoId);
      if (!selectedVideoId) {
        setError("Enter a valid YouTube URL or 11-character video ID.");
        return;
      }
    }

    if (action === "SEEK" &&
        (!Number.isFinite(Number(seekTime)) || Number(seekTime) < 0)) {
      setError("Enter a valid video time.");
      return;
    }

    const currentPlayerTime = playerReadyRef.current && playerRef.current
      ? playerRef.current.getCurrentTime()
      : Number(room.currentTime) || 0;

    const request = {
      userId: room.userId,
      action,
      videoId: selectedVideoId,
      currentTime: action === "SEEK"
        ? (seekOverride === null ? Number(seekTime) : seekOverride)
        : (action === "PLAY" || action === "PAUSE") ? currentPlayerTime : null,
    };

    setError("");
    // Send the command to the backend's existing playback endpoint. The backend
    // validates the user's role, updates room state, and broadcasts the new
    // room snapshot to every connected browser over the existing WebSocket.
    // Using the API response also updates the Host immediately, even if its
    // WebSocket has not finished connecting yet.
    try {
      const response = await fetch(`${API}/${room.roomId}/playback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await readResponse(response, "Unable to update playback.");
      setParticipants(data.participants || []);
      const currentUser = (data.participants || []).find(
        (person) => person.userId === room.userId
      );
      setRoom((previous) => previous
        ? { ...previous, ...data, role: currentUser?.role || previous.role }
        : previous
      );
    } catch (err) {
      setError(err.message);
    }
  }

  function sendChatMessage(event) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || message.length > 500) return;

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Chat is unavailable because the room connection is not ready.");
      return;
    }

    socket.send(JSON.stringify({ type: "CHAT_MESSAGE", message }));
    setChatInput("");
    setError("");
  }

  async function submitPlaybackRequest(action) {
    if (!room || requestBusy) return;

    let requestedVideoId = null;
    if (action === "CHANGE_VIDEO") {
      requestedVideoId = extractYouTubeVideoId(videoId);
      if (!requestedVideoId) {
        setError("Enter a valid YouTube URL or 11-character video ID.");
        return;
      }
    }

    if (action === "SEEK" &&
        (!Number.isFinite(Number(seekTime)) || Number(seekTime) < 0)) {
      setError("Enter a valid video time.");
      return;
    }

    const currentPlayerTime = playerReadyRef.current && playerRef.current
      ? playerRef.current.getCurrentTime()
      : Number(room.currentTime) || 0;

    const request = {
      userId: room.userId,
      action,
      videoId: requestedVideoId,
      currentTime: action === "SEEK" ? Number(seekTime)
        : (action === "PLAY" || action === "PAUSE") ? currentPlayerTime : null,
    };

    try {
      setRequestBusy(true);
      setError("");
      const response = await fetch(`${API}/${room.roomId}/playback-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await readResponse(response, "Unable to submit playback request.");
      setParticipants(data.participants || []);
      setRoom((previous) => previous ? { ...previous, ...data } : previous);
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestBusy(false);
    }
  }

  async function decidePlaybackRequest(requestId, decision) {
    if (!room || decisionBusyId) return;

    try {
      setDecisionBusyId(requestId);
      setError("");
      const response = await fetch(
        `${API}/${room.roomId}/playback-requests/${requestId}/${decision.toLowerCase()}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approverId: room.userId }),
        }
      );
      const data = await readResponse(response, `Unable to ${decision.toLowerCase()} request.`);
      setParticipants(data.participants || []);
      setRoom((previous) => previous ? { ...previous, ...data } : previous);
    } catch (err) {
      setError(err.message);
    } finally {
      setDecisionBusyId("");
    }
  }

  async function manageParticipant(person, action) {
    if (!room || busyParticipantId) return;

    if (action === "REMOVE" &&
        !window.confirm(`Remove ${person.username} from this room?`)) {
      return;
    }

    const isRoleChange = action === "MODERATOR" || action === "PARTICIPANT";
    const url = isRoleChange
      ? `${API}/${room.roomId}/role`
      : `${API}/${room.roomId}/participants`;

    const body = isRoleChange
      ? { requesterId: room.userId, targetUserId: person.userId, newRole: action }
      : { requesterId: room.userId, targetUserId: person.userId };

    try {
      setBusyParticipantId(person.userId);
      setError("");
      const response = await fetch(url, {
        method: isRoleChange ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readResponse(
        response,
        isRoleChange ? "Unable to change participant role." : "Unable to remove participant."
      );

      setParticipants(data.participants || []);
      const currentUser = (data.participants || []).find(
        (item) => item.userId === room.userId
      );
      if (currentUser) {
        setRoom((previous) => previous
          ? { ...previous, ...data, role: currentUser.role }
          : previous
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyParticipantId("");
    }
  }

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(room.roomId);
      setError("");
    } catch {
      setError("Unable to copy room ID.");
    }
  }

  if (room) {
    const currentParticipant = participants.find(
      (person) => person.userId === room.userId
    );
    const currentRole = currentParticipant?.role || room.role;
    const canControl = currentRole === "HOST" || currentRole === "MODERATOR";
    const isHost = currentRole === "HOST";
    const isModerator = currentRole === "MODERATOR";

    return (
      <div className="app">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">w.</span>
            watchparty
          </a>
          <div className="room-header-right">
            <span className="topbar-note">Room {room.roomId}</span>
          </div>
        </header>

        <main className="dashboard">
          <section className="video-section">
            <h1>You're in, {room.username}.</h1>
            <p className="intro-description room-video-subtitle">
              {room.videoId
                ? <>Watching: <strong>{videoTitle || "Loading video title…"}</strong>{videoChannel ? ` · ${videoChannel}` : ""}</>
                : "Choose a YouTube video to watch together."}
            </p>

            <div className="video-player">
              <div className="youtube-player-frame">
                <div ref={playerMountRef} id="youtube-player"></div>
                {!room.videoId && (
                  <div className="player-empty-state">
                    <span className="play-symbol">▶</span>
                    <h2>Your shared screen</h2>
                    <p>Enter a YouTube URL or video ID to start watching.</p>
                  </div>
                )}
              </div>
              <div className="playback-state">
                <span>{room.videoId ? playerStatus : "No video selected"}</span>
                <span>{Number(room.currentTime || 0).toFixed(1)} sec</span>
              </div>
            </div>

            <section className="controls-section">
              <div className="section-heading">
                <h2>Playback controls</h2>
                <span>{canControl ? currentRole : "VIEW ONLY"}</span>
              </div>

              <label htmlFor="videoId">YOUTUBE URL OR VIDEO ID</label>
              <div className="video-input-row">
                <input
                  id="videoId"
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={false}
                />
                <button className="secondary-button" onClick={() => sendPlaybackAction("CHANGE_VIDEO")} disabled={!canControl}>
                  Change video
                </button>
              </div>

              <div className="control-buttons">
                <button className="control-button" onClick={() => sendPlaybackAction("PLAY")} disabled={!canControl || !room.videoId}>▶ Play</button>
                <button className="control-button" onClick={() => sendPlaybackAction("PAUSE")} disabled={!canControl || !room.videoId}>II Pause</button>
              </div>

              <label htmlFor="seekTime">SEEK TO (SECONDS)</label>
              <div className="video-input-row">
                <input id="seekTime" type="number" min="0" value={seekTime} onChange={(e) => setSeekTime(e.target.value)} disabled={!room.videoId} />
                <button className="secondary-button" onClick={() => sendPlaybackAction("SEEK")} disabled={!canControl || !room.videoId}>Seek</button>
              </div>
              <div className="skip-controls">
                <button className="secondary-button" onClick={() => {
                  const current = playerReadyRef.current && playerRef.current
                    ? playerRef.current.getCurrentTime() : Number(room.currentTime) || 0;
                  const target = Math.max(0, current - 10);
                  setSeekTime(String(Math.floor(target)));
                  sendPlaybackAction("SEEK", target);
                }} disabled={!canControl || !room.videoId}>−10 seconds</button>
                <button className="secondary-button" onClick={() => {
                  const current = playerReadyRef.current && playerRef.current
                    ? playerRef.current.getCurrentTime() : Number(room.currentTime) || 0;
                  const target = current + 10;
                  setSeekTime(String(Math.floor(target)));
                  sendPlaybackAction("SEEK", target);
                }} disabled={!canControl || !room.videoId}>+10 seconds</button>
              </div>

              {!canControl && (
                <div className="approval-request-panel">
                  <p className="permission-note">Playback is controlled by the Host and Moderators. You can request an action for approval.</p>
                  <div className="request-actions">
                    <button className="secondary-button" onClick={() => submitPlaybackRequest("PLAY")} disabled={requestBusy || !room.videoId}>Request play</button>
                    <button className="secondary-button" onClick={() => submitPlaybackRequest("PAUSE")} disabled={requestBusy || !room.videoId}>Request pause</button>
                    <button className="secondary-button" onClick={() => submitPlaybackRequest("SEEK")} disabled={requestBusy || !room.videoId}>Request seek</button>
                    <button className="secondary-button" onClick={() => submitPlaybackRequest("CHANGE_VIDEO")} disabled={requestBusy}>Request video change</button>
                  </div>
                  {(room.pendingRequests || []).some((item) => item.userId === room.userId) && (
                    <p className="request-pending-note">Your request is waiting for Host or Moderator approval.</p>
                  )}
                </div>
              )}
            </section>

            {(canControl && (room.pendingRequests || []).length > 0) && (
              <section className="approval-inbox">
                <div className="section-heading">
                  <h2>Playback requests</h2>
                  <span>{room.pendingRequests.length} PENDING</span>
                </div>
                {room.pendingRequests.map((request) => (
                  <div className="approval-request" key={request.requestId}>
                    <div>
                      <strong>{request.username}</strong>
                      <p>Requested: {request.action.replace("_", " ").toLowerCase()}
                        {request.action === "SEEK" ? ` to ${request.currentTime} sec` : ""}
                        {request.action === "CHANGE_VIDEO" ? ` (${request.videoId})` : ""}
                      </p>
                    </div>
                    <div className="approval-actions">
                      <button className="approve-button" disabled={Boolean(decisionBusyId)} onClick={() => decidePlaybackRequest(request.requestId, "approve")}>Approve</button>
                      <button className="reject-button" disabled={Boolean(decisionBusyId)} onClick={() => decidePlaybackRequest(request.requestId, "reject")}>Reject</button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {error && <p className="error-message">{error}</p>}
          </section>

          <aside className="room-sidebar">
            <section className="sidebar-card room-details-card">
              <p className="panel-label">ROOM DETAILS</p>
              <h2>{room.roomId}</h2>
              <p className="panel-description">Share this ID with your friends.</p>
              <button className="join-button" onClick={copyRoomId}>Copy room ID →</button>
            </section>

            <section className="sidebar-card participants-card">
              <div className="sidebar-section-heading">
                <h3>Participants</h3>
                <span>{participants.length}</span>
              </div>
            {participants.map((person) => {
              const isSelf = person.userId === room.userId;
              const canPromote = isHost && person.role === "PARTICIPANT";
              const canDemote = isHost && person.role === "MODERATOR";
              const canRemove = !isSelf && person.role !== "HOST" &&
                (isHost || (isModerator && person.role === "PARTICIPANT"));

              return (
                <div className="participant participant-managed" key={person.userId}>
                  <div className="participant-info">
                    <span className="participant-name">{person.username}{isSelf ? " (You)" : ""}</span>
                    <span className="role">{person.role}</span>
                  </div>
                  {(canPromote || canDemote || canRemove) && (
                    <div className="participant-actions">
                      {canPromote && <button className="text-action" disabled={Boolean(busyParticipantId)} onClick={() => manageParticipant(person, "MODERATOR")}>Promote</button>}
                      {canDemote && <button className="text-action" disabled={Boolean(busyParticipantId)} onClick={() => manageParticipant(person, "PARTICIPANT")}>Demote</button>}
                      {canRemove && <button className="text-action remove-action" disabled={Boolean(busyParticipantId)} onClick={() => manageParticipant(person, "REMOVE")}>Remove</button>}
                    </div>
                  )}
                </div>
              );
            })}

            </section>

            <section className="sidebar-card chat-card">
            <section className="room-chat">
              <div className="chat-heading">
                <h3>Room chat</h3>
                <span>LIVE</span>
              </div>
              <div className="chat-messages" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <p className="chat-empty">No messages yet. Say hello to your room.</p>
                ) : chatMessages.map((item) => (
                  <article className="chat-message" key={item.messageId}>
                    <div className="chat-message-meta">
                      <strong>{item.username}</strong>
                      <time dateTime={item.sentAt}>{new Date(item.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                    <p>{item.message}</p>
                  </article>
                ))}
              </div>
              <form className="chat-compose" onSubmit={sendChatMessage}>
                <input
                  aria-label="Chat message"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Write a message..."
                  maxLength={500}
                />
                <button type="submit" disabled={!chatInput.trim() || connectionStatus !== "connected"}>Send</button>
              </form>
              <p className="chat-limit">Messages are visible to everyone in this room. Latest 50 are kept.</p>
            </section>
            </section>
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">w.</span>watchparty</a>
        <span className="topbar-note">A little better together.</span>
      </header>

      <main className="landing">
        <section className="intro">
          <p className="eyebrow">WATCH TOGETHER, FROM ANYWHERE</p>
          <h1>Same screen.<br /><span>Different places.</span></h1>
          <p className="intro-description">Bring your people, pick a video, and enjoy it together. No complicated setup.</p>
          <div className="preview">
            <div className="preview-top"><span>YOUR NEXT WATCH PARTY</span><span>ROOM READY</span></div>
            <div className="preview-content"><span className="play-symbol">▶</span><p>Your next shared moment starts here.</p></div>
            <div className="preview-bottom"><span>ONE ROOM</span><span>YOUR PEOPLE</span><span>YOUR VIDEO</span></div>
          </div>
        </section>

        <section className="entry-panel">
          <p className="panel-label">GET STARTED</p>
          <h2>Join the room.</h2>
          <p className="panel-description">Enter your details to start watching.</p>
          <label htmlFor="username">YOUR NAME</label>
          <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="How should we call you?" />
          <button className="create-button" onClick={createRoom} disabled={loading}>{loading ? "Creating..." : "Create a room"}<span>↗</span></button>
          <div className="separator"><span>OR JOIN AN EXISTING ROOM</span></div>
          <label htmlFor="roomId">ROOM ID</label>
          <input id="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter room code" />
          <button className="join-button" onClick={joinRoom} disabled={loading}>{loading ? "Joining..." : "Join room"}<span>→</span></button>
          {error && <p className="error-message">{error}</p>}
          <p className="privacy-note">No account required. Just you and your people.</p>
        </section>
      </main>

      <footer className="footer"><span>WATCHPARTY © 2026</span><span>MADE FOR SHARED MOMENTS</span></footer>
    </div>
  );
}

export default App;
