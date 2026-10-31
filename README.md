# youtube watch party

this is a web application where people can join a room and watch youtube videos together. the host controls the video, and other participants can watch along in real time. the application also supports moderators, playback requests and room chat.

## live application

- frontend: https://youtube-watch-party-lime.vercel.app/
- backend: https://youtube-watch-party-backend-92as.onrender.com
- backend health: https://youtube-watch-party-backend-92as.onrender.com/api/health

## features

- create a room and share its room code with others
- join an existing room
- three roles: host, moderator and participant
- host can promote or demote participants and remove them from the room
- host and moderators can control video playback
- participants can request permission to play, pause, seek or change the video
- host or moderator can approve or reject these requests
- video playback is synchronized between room participants
- youtube videos are played using the youtube iframe player
- participants can send messages in the room chat

## technologies used

- frontend: react and vite
- backend: java and spring boot
- real-time communication: websocket
- video player: youtube iframe player api
- room management: java collections using concurrenthashmap

## system architecture

the application uses a react frontend and a spring boot backend.

1. the react frontend provides the room interface, participant controls, chat and youtube player.
2. the spring boot backend manages rooms, participants, roles, playback requests and chat-related operations.
3. rest api endpoints handle room operations and playback requests.
4. websocket connections handle real-time updates between participants in the same room.
5. the youtube iframe player api is used to play and control youtube videos in the browser.

room information and related state are currently maintained in backend application memory.

## running the project locally

### backend setup

open a terminal and move into the backend folder.

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

the backend runs at:

`http://localhost:8081`

you can check whether the backend is running using:

`http://localhost:8081/api/health`

### frontend setup

open another terminal and move into the frontend folder.

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --port 5174
```

the frontend runs at:

`http://localhost:5174`

if powershell cannot find node.js, add it to the current terminal path:

```powershell
$env:Path += ";C:\Program Files\nodejs"
```

## how playback requests work

participants cannot directly control the video. they have to send a request to the host or moderator.

the available actions are:

- `PLAY`
- `PAUSE`
- `SEEK`
- `CHANGE_VIDEO`

the host or moderator can approve or reject a request. if approved, the backend updates the playback state and sends the updated information to everyone in the room through websocket.

### playback request endpoints

- `POST /api/rooms/{roomId}/playback-requests` to submit a request.
- `PUT /api/rooms/{roomId}/playback-requests/{requestId}/approve` to approve a request.
- `PUT /api/rooms/{roomId}/playback-requests/{requestId}/reject` to reject a request.

## room chat

the application also includes a basic chat feature. participants can send messages to other people in the same room.

- messages are sent through the existing websocket connection
- each message is associated with the participant's session
- messages can contain up to 500 characters
- the latest 50 messages are kept in room memory
- messages are only shared with participants in the same room
- removed participants cannot continue sending messages through the room connection

## testing

the following steps can be used to check the main features:

1. create a room using one browser.
2. join the same room using another browser.
3. check whether both users can see each other in the participant list.
4. promote a participant to moderator and check the role update.
5. try controlling playback as a participant and submit a request.
6. approve the request as host or moderator.
7. check whether playback changes for both users.
8. send messages from both browsers and check whether they appear correctly.
9. try removing a participant and check whether they are disconnected.

## current limitations

- room information, participant details and chat messages are stored in application memory.
- this information is lost if the backend restarts.
- the application currently does not have a login system or persistent database.
- the backend uses a single running instance for room management.

## project status

the application is deployed and available for testing.

the project was developed as part of a full-stack technical assessment.
