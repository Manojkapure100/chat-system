# Ephemeral Chat System - API Documentation

## Overview
The Ephemeral Chat System is a no-login, peer-to-peer real-time messaging platform. Users are auto-assigned unique 5-character IDs, can pair with other users via their IDs, exchange messages and images, and all data is ephemeral—cleared when the connection closes.

---

## WebSocket Connection

### Endpoint
```
ws://[backend-host]/api/v1/chat/ws
wss://[backend-host]/api/v1/chat/ws  (for HTTPS)
```

### Connection Lifecycle
1. Client connects to the WebSocket endpoint
2. Server sends `assign_id` with a unique 5-character ID
3. Client can now send `pair_request` to connect with another user
4. Messages are exchanged in real-time between paired users
5. Connection closes on disconnect or explicit `leave` message

---

## WebSocket Messages

### 1. Server → Client: Assign ID
**Type:** `assign_id`

Sent immediately after a new connection is established.

```json
{
  "type": "assign_id",
  "id": "ABC12"
}
```

**Description:**
- Provides the client with their unique 5-character chat ID
- ID is valid for the duration of the connection
- Store this ID to share with peers

---

### 2. Client → Server: Pair Request
**Type:** `pair_request`

Request to pair with another user by their ID.

```json
{
  "type": "pair_request",
  "target": "XYZ99"
}
```

**Fields:**
- `target` (string): The 5-character ID of the peer to connect with

**Validation:**
- Target must be a valid string
- Cannot pair with yourself
- Both users must be active and not already in a chat
- Target must be actively connected to the server

**Response:** See `Pair Status` below

---

### 3. Server → Client: Pair Status
**Type:** `pair_status`

Response to a pair request or status notification.

```json
{
  "type": "pair_status",
  "status": "accepted",
  "message": "Chat paired successfully.",
  "peer": "XYZ99",
  "sessionId": "a1b2c3d4e5f6..."
}
```

**Status Values:**

| Status | Meaning | Description |
|--------|---------|-------------|
| `accepted` | Pairing succeeded | Both users are now connected and can chat |
| `rejected` | Pairing failed | One user is already in a chat or pairing attempt failed |
| `peer_not_found` | Peer unavailable | The target ID doesn't exist or isn't actively connected |
| `waiting` | Pairing in progress | (Reserved for future use) |

**Fields (when status = "accepted"):**
- `peer` (string): The ID of the paired peer
- `sessionId` (string): Unique session identifier for this chat

---

### 4. Client → Server: Chat Message
**Type:** `chat_message`

Send a text message to the paired peer.

```json
{
  "type": "chat_message",
  "text": "Hello, peer!"
}
```

**Fields:**
- `text` (string): Message content (non-empty after trimming)

**Validation:**
- Message must be a string
- Cannot be empty or whitespace-only
- User must be in an active pairing
- Peer must remain connected

**Response:** Message is echoed back to both sender and receiver with added metadata

---

### 5. Server → Client: Chat Message (Echo)
**Type:** `chat_message`

Delivered to both sender and receiver.

```json
{
  "type": "chat_message",
  "from": "ABC12",
  "text": "Hello, peer!",
  "timestamp": "2026-07-25T14:30:45.123456"
}
```

**Fields:**
- `from` (string): Sender's user ID
- `text` (string): Message content
- `timestamp` (ISO 8601): Server-side timestamp

---

### 6. Client → Server: Leave Chat
**Type:** `leave`

Explicitly close the current chat session.

```json
{
  "type": "leave"
}
```

**Effect:**
- Closes the chat session immediately
- Peer receives `peer_left` notification
- Chat history is archived to the database
- User can initiate a new pairing

---

### 7. Server → Client: Peer Left
**Type:** `peer_left`

Notifies that the connected peer has left or disconnected.

```json
{
  "type": "peer_left",
  "message": "Your peer has left the chat."
}
```

**Triggers:**
- Peer sends explicit `leave` message
- Peer's WebSocket disconnects
- Server error or session timeout

---

### 8. Server → Client: File Notification
**Type:** `file_notify`

Notifies that the peer has uploaded a file/image.

```json
{
  "type": "file_notify",
  "from": "ABC12",
  "filename": "photo.jpg",
  "url": "http://backend/api/v1/chat/files/uuid-here",
  "fileId": "uuid-here",
  "timestamp": "2026-07-25T14:30:45.123456"
}
```

**Fields:**
- `from` (string): Uploader's user ID
- `filename` (string): Original filename
- `url` (string): Download URL with random UUID (non-guessable)
- `fileId` (string): Unique file identifier
- `timestamp` (ISO 8601): Upload timestamp

**Note:** File is automatically stored in the chat history for the session.

---

### 9. Server → Client: Error
**Type:** `error`

Notifies of an error condition.

```json
{
  "type": "error",
  "message": "You are not currently paired with anyone."
}
```

**Common Error Messages:**
- `"You are not currently paired with anyone."` - Attempted action outside an active chat
- `"Peer is not connected."` - Peer disconnected mid-chat
- `"Your chat session is no longer available."` - Session was closed
- `"Target peer ID is required."` - Malformed pair request
- `"Unsupported message type."` - Unknown message type sent

---

## HTTP Endpoints

### 1. File Upload
**Endpoint:** `POST /api/v1/chat/upload`

Upload an image to share in the current chat.

**Request:**
```
Content-Type: multipart/form-data

sender_id: ABC12
session_id: a1b2c3d4e5f6...
file: [binary file data]
```

**Form Fields:**
- `sender_id` (string): Your 5-character user ID
- `session_id` (string): Active chat session ID (from `pair_status`)
- `file` (file): Image file (MIME type must start with `image/`)

**Constraints:**
- File size: Maximum 5 MB
- Mime type: Must be `image/*` (e.g., `image/jpeg`, `image/png`, `image/gif`)
- User must be part of the active session
- Session must still be active in the database

**Response (Success - 200):**
```json
{
  "body": {
    "fileId": "uuid-here",
    "url": "http://backend/api/v1/chat/files/uuid-here",
    "filename": "photo.jpg"
  },
  "message": "File uploaded successfully."
}
```

**Response (Error - 400/413/500):**
```json
{
  "detail": "File exceeds maximum size of 5MB."
}
```

**Note:** Peer is notified via `file_notify` WebSocket message, and the file metadata is logged in the chat history.

---

### 2. File Download
**Endpoint:** `GET /api/v1/chat/files/{file_id}`

Download a shared file/image by its ID.

**Parameters:**
- `file_id` (path): UUID of the file to download

**Response (Success - 200):**
- Raw file content with appropriate `Content-Type` header
- `Content-Disposition: attachment` (for download)

**Response (Error - 404):**
```json
{
  "detail": "File not found or has been cleaned up."
}
```

**Note:** 
- File URLs use random UUIDs (not sequential) to prevent enumeration
- Files are automatically cleaned up when the chat session ends
- If the file is missing from disk but metadata exists, a 404 is returned

---

### 3. Active Users & Sessions
**Endpoint:** `GET /api/v1/chat/active`

Get a snapshot of active users and ongoing chat sessions (for monitoring/debugging).

**Response (200):**
```json
{
  "body": {
    "activeIds": [
      {"id": "ABC12", "paired": true},
      {"id": "XYZ99", "paired": false},
      {"id": "DEF45", "paired": true}
    ],
    "pairs": [
      {"sessionId": "a1b2c3d4...", "user1": "ABC12", "user2": "XYZ99"},
      {"sessionId": "e5f6g7h8...", "user1": "DEF45", "user2": "GHI78"}
    ]
  }
}
```

**Fields:**
- `activeIds`: List of currently active users
  - `id`: User's 5-character ID
  - `paired`: Whether user is in an active chat
- `pairs`: List of active chat sessions
  - `sessionId`: Unique session identifier
  - `user1`, `user2`: IDs of both users

---

### 4. Health Check
**Endpoint:** `GET /api/v1/chat/`

Get general health and metrics of the chat system.

**Response (200):**
```json
{
  "body": {
    "activeConnections": 5,
    "activeChats": 2
  }
}
```

**Fields:**
- `activeConnections`: Total number of active WebSocket connections
- `activeChats`: Number of ongoing 1:1 chat sessions

---

## Data Models

### ChatUser (Database)
```
Id: String(5) [PRIMARY KEY]
Active: Boolean
SessionId: String(36) [nullable]
PeerId: String(5) [nullable]
Ip: String(45) [nullable]
ConnectedAt: DateTime
UpdatedAt: DateTime
```

Represents an actively connected user. Rows are created on connection and marked inactive on disconnect.

---

### ChatSession (Database)
```
Id: String(36) [PRIMARY KEY]
User1: String(5)
User2: String(5)
User1Ip: String(45) [nullable]
User2Ip: String(45) [nullable]
Messages: JSON (array)
Active: Boolean
CreatedAt: DateTime
EndedAt: DateTime [nullable]
```

Represents an active or historical chat session between two users. Messages are appended as JSON objects.

---

### ChatFile (Database)
```
Id: String(36) [PRIMARY KEY]
SessionId: String(36)
SenderId: String(5)
Filename: String(1024)
Path: String(1024)
ContentType: String(100)
UploadedAt: DateTime
```

Stores metadata about uploaded files. Files are deleted when the session ends.

---

### ChatHistory (Database)
```
Id: Integer [PRIMARY KEY, AUTO_INCREMENT]
User1: String(10)
User2: String(10)
Ip1: String(45) [nullable]
Ip2: String(45) [nullable]
ChatHistory: JSON
ConnectionActive: Boolean
CreatedAt: DateTime
EndedAt: DateTime [nullable]
```

Archive of completed chat sessions, stored for compliance/record-keeping.

---

## Error Handling

### WebSocket Errors
- Malformed JSON: Connection closed or error message sent
- Unsupported message type: Error message returned
- Missing required fields: Error message or ignore (depends on type)

### HTTP Errors

| Status | Meaning |
|--------|---------|
| `400` | Bad request (invalid session, not in session, wrong MIME type) |
| `404` | File not found or expired |
| `413` | File too large (exceeds 5 MB) |
| `429` | Rate limited (> 50 requests/minute per IP) |
| `500` | Server error |

---

## Rate Limiting

- **Limit:** 50 requests per minute per IP address
- **Headers Returned:**
  - `X-RateLimit-Limit`: `50`
  - `X-RateLimit-Remaining`: Requests remaining in current window
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## File Lifecycle

1. **Upload:** Client uploads image via `POST /api/v1/chat/upload`
2. **Storage:** File saved to `/tmp/chat_files/{sessionId}/{fileId}_{filename}`
3. **Notification:** Peer receives `file_notify` over WebSocket with download URL
4. **Download:** Either user can download via `GET /api/v1/chat/files/{file_id}`
5. **Cleanup:** When session ends, entire session folder is deleted from disk

---

## Security Considerations

1. **No Authentication:** Any user with a valid ID can access their paired session
2. **File URLs:** Use random UUIDs to prevent guessing other users' files
3. **File Validation:** MIME types restricted to `image/*`; server-side size validation
4. **IP Logging:** Both users' IPs are recorded in chat history for compliance
5. **Ephemeral by Design:** Data is purged on disconnect; no persistent storage except history archive

---

## Example Client Flow

```javascript
// 1. Connect to WebSocket
const ws = new WebSocket('ws://backend/api/v1/chat/ws');

// 2. Receive assigned ID
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'assign_id') {
    console.log('My ID:', msg.id);
  }
};

// 3. Request to pair with peer
ws.send(JSON.stringify({
  type: 'pair_request',
  target: 'XYZ99'
}));

// 4. Receive pair acceptance
// Now you have sessionId and peerID, can start chatting

// 5. Send a message
ws.send(JSON.stringify({
  type: 'chat_message',
  text: 'Hello!'
}));

// 6. Receive messages (from peer and echo of own)
// 7. Upload a file
const formData = new FormData();
formData.append('sender_id', myId);
formData.append('session_id', sessionId);
formData.append('file', fileInput.files[0]);
fetch('/api/v1/chat/upload', { method: 'POST', body: formData });

// 8. Leave chat
ws.send(JSON.stringify({ type: 'leave' }));
```

---

## Limitations & Known Behaviors

1. **Single-Server Only:** IDs and sessions only work on the same server instance (no horizontal scaling)
2. **In-Memory WebSocket Map:** Actual socket connections are kept in memory; state is DB-backed
3. **Grace Period:** On unexpected disconnects, state is cleaned up immediately (no grace period)
4. **File Storage:** Temporary files are stored locally in `/tmp`; use cloud storage integration for production scalability
5. **No Encryption:** Messages are not end-to-end encrypted; transport security via HTTPS/WSS is recommended
6. **No Typing Indicators:** No real-time "user is typing" feature

---

## Testing the API

### cURL Examples

**Health Check:**
```bash
curl http://localhost:8000/api/v1/chat/
```

**Get Active State:**
```bash
curl http://localhost:8000/api/v1/chat/active
```

**Upload File (after pairing):**
```bash
curl -F "sender_id=ABC12" \
     -F "session_id=a1b2c3d4e5f6..." \
     -F "file=@/path/to/image.jpg" \
     http://localhost:8000/api/v1/chat/upload
```

**Download File:**
```bash
curl http://localhost:8000/api/v1/chat/files/[file_id] -O
```

### WebSocket via `websocat` or JavaScript
```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/chat/ws');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'pair_request', target: 'ABC12' }));
```
