# QuickChat — System Workflows & Sequence Specifications

> **Project**: QuickChat — Multilingual Real-Time Chat Platform with In-Process Edge AI Moderation  
> **Academic Scope**: Major Project / Capstone Engineering Documentation  
> **Version**: 2.0 (Production Hardened)

---

## 1. Message Transmission & Moderation Lifecycle

This sequence illustrates the end-to-end processing of an outgoing chat message, from client dispatch through rate limiting, mute verification, multilingual translation pre-pass, AI neural inference, recipient-targeted translation, database persistence, and real-time WebSocket delivery.

```mermaid
sequenceDiagram
    autonumber
    actor Sender as Sender (Client SPA)
    participant Socket as Socket.IO Gateway
    participant Throttler as Rate Throttler
    participant Auth as Auth & Room Guard
    participant AI as AI Moderation Service
    participant Trans as Translation Service
    participant DB as MongoDB Atlas
    actor Recipient as Recipient (Client SPA)

    Sender->>Socket: emit('send-message', { roomId, text })
    Socket->>Throttler: Check message rate (Max 10/2s) & length (<= 5000 chars)
    
    alt Rate limit or length exceeded
        Throttler-->>Sender: emit('error', { message: 'Too many messages / too long' })
    else Within valid limits
        Socket->>Auth: Validate user membership in Room
        Auth->>DB: Query user disciplinary status (mutedUntil)
        
        alt User is currently muted
            DB-->>Socket: mutedUntil > Date.now()
            Socket-->>Sender: emit('message-moderated', { action: 'muted', remainingMinutes })
        else Disciplinary check passed
            Socket->>AI: moderateMessage(text)
            
            opt Text contains Non-ASCII / Non-English
                AI->>Trans: translateText(text, 'en', 'auto')
                Trans-->>AI: return englishText
            end
            
            AI->>AI: Vectorize & run TensorFlow.js CNN Inference
            AI-->>Socket: return { action, label, confidence }
            
            alt Action is BLOCKED
                Socket->>DB: Increment user.warningCount, Log violation
                Socket-->>Sender: emit('message-moderated', { action: 'blocked', message })
            else Action is WARNED or CLEAN
                Socket->>Trans: detectLanguage(text) & translateForRecipients(...)
                Trans-->>Socket: return [{ language, text }]
                Socket->>DB: Message.create({ originalText, translations, moderation })
                DB-->>Socket: savedMessage
                Socket->>DB: Room.findByIdAndUpdate(roomId, { lastMessage })
                
                Socket->>Sender: emit('new-message', savedMessage)
                Socket->>Recipient: io.to(roomId).emit('new-message', savedMessage)
                Socket->>Recipient: io.to('user:id').emit('room-updated', { roomId, lastMessage })
            end
        end
    end
```

---

## 2. Progressive Disciplinary State Machine

QuickChat implements an automated progressive discipline system for content safety. Violations increment warning counts; reaching the threshold triggers a temporary 15-minute mute. Once the mute elapses, the system automatically cools down and resets disciplinary records.

```mermaid
stateDiagram-v2
    [*] --> CleanUser: User Registered

    CleanUser --> Warning1: 1st Violation (Warned / Blocked Content)
    note right of Warning1
        warningCount: 1
        User notified with explanation
    end note

    Warning1 --> CleanUser: Good Behavior / Active Participation
    Warning1 --> Warning2: 2nd Violation
    note right of Warning2
        warningCount: 2
        Warning banner with progress bar displayed
    end note

    Warning2 --> TemporaryMute: 3rd Violation (Threshold Reached)
    
    state TemporaryMute {
        [*] --> MutedActive
        note right of MutedActive
            warningCount: 3
            mutedUntil: Date.now() + 15 mins
            Socket prevents message sending
            Countdown displayed on client
        end note
        MutedActive --> MuteExpired: 15 Minutes Elapse
    }

    TemporaryMute --> CooldownReset: Next User Activity / Attempted Action
    note right of CooldownReset
        warningCount reset to 0
        mutedUntil cleared to null
        Full chat privileges restored
    end note

    CooldownReset --> CleanUser
```

---

## 3. Real-Time Read Receipts & Presence Tracking

```mermaid
sequenceDiagram
    autonumber
    actor UserA as User A (Online)
    participant Socket as Socket.IO Engine
    participant DB as MongoDB Atlas
    actor UserB as User B (Connecting)

    Note over UserB,Socket: Connection & Presence Lifecycle
    UserB->>Socket: Connect with JWT Handshake Auth
    Socket->>Socket: Add socket.id to activeSockets Map
    Socket->>DB: User.findByIdAndUpdate(userId, { isOnline: true })
    Socket-->>UserB: emit('initial-online-users', [activeUserIds])
    Socket-->>UserA: io.emit('user-online', { userId: UserB.id })

    Note over UserA,UserB: Read Receipts Flow
    UserA->>Socket: User A sends message to room
    Socket->>UserB: emit('new-message', message)
    
    UserB->>Socket: emit('mark-read', { roomId })
    Socket->>DB: Message.updateMany({ room: roomId, readBy: { $ne: UserB.id } }, { $addToSet: { readBy: UserB.id } })
    Socket-->>UserA: io.to(roomId).emit('messages-read', { roomId, userId: UserB.id })
    Note over UserA: Double blue ticks (✓✓) rendered in chat window
```

---

## 4. Cursor-Based Message Pagination

To preserve performance and support rooms with thousands of historical messages, QuickChat implements timestamp-based cursor pagination.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Angular Client
    participant Service as ChatService
    participant Controller as ChatController
    participant DB as MongoDB (Message Collection)

    Client->>Service: User enters chat room
    Service->>Controller: GET /api/chat/rooms/:roomId/messages?limit=50
    Controller->>DB: Message.find({ room: roomId }).sort({ createdAt: -1 }).limit(50)
    DB-->>Controller: Return 50 latest messages
    Controller-->>Service: { status: 'success', messages, hasMore: true, oldestTimestamp }
    Service-->>Client: Render messages, scroll to bottom

    Note over Client: User scrolls up & clicks "Load earlier messages"
    Client->>Service: loadOlderMessages(roomId)
    Service->>Controller: GET /api/chat/rooms/:roomId/messages?before=2026-09-01T12:00:00Z&limit=50
    Controller->>DB: Message.find({ room: roomId, createdAt: { $lt: beforeDate } }).sort({ createdAt: -1 }).limit(50)
    DB-->>Controller: Return next batch of 50 older messages
    Controller-->>Service: { status: 'success', messages: olderMessages, hasMore }
    Service-->>Client: Prepend older messages & maintain viewport scroll position
```

---

## 5. User Authentication & 401 Session Eviction

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Angular as Angular Client SPA
    participant Interceptor as AuthInterceptor
    participant API as Express Auth API
    participant DB as MongoDB Atlas

    User->>Angular: Enters credentials & clicks Login
    Angular->>API: POST /api/auth/login (Checked by RateLimiter & Validator)
    API->>DB: User.findOne({ email }).select('+password')
    DB-->>API: userDocument
    API->>API: bcrypt.compare(password, hash)
    API->>API: jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })
    API-->>Angular: { status: 'success', token, user }
    Angular->>Angular: Store token in localStorage & update Signals

    Note over User,Angular: Subsequent Authenticated Requests
    Angular->>Interceptor: HTTP GET /api/chat/rooms
    Interceptor->>API: Header: Authorization: Bearer <token>
    
    alt Token is Valid
        API-->>Angular: 200 OK + Data
    else Token Expired or Revoked
        API-->>Interceptor: 401 Unauthorized ({ message: 'Invalid token' })
        Interceptor->>Angular: authService.logout()
        Angular->>Angular: Clear localStorage token & reset user Signal
        Angular->>User: Redirect smoothly to /login with notification
    end
```

---

## 6. Single Message & Entire Chat Deletion Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as Participant A
    participant Angular as Angular Client
    participant Controller as ChatController
    participant Socket as Socket.IO Engine
    participant DB as MongoDB
    actor Other as Participant B

    Note over User,Other: Single Message Deletion
    User->>Angular: Clicks trash icon on individual message bubble
    Angular->>Controller: DELETE /api/chat/messages/:messageId
    Controller->>DB: Message.findByIdAndDelete(messageId)
    Controller-->>Angular: 200 OK ({ status: 'success' })
    Angular->>Socket: emit('delete-message', { messageId, roomId })
    Socket->>Other: io.to(roomId).emit('message-deleted', { messageId, roomId })
    Socket->>DB: Message.findOne({ room: roomId }).sort('-createdAt')
    Socket->>Other: io.to('user:B').emit('room-updated', { roomId, lastMessage })
    Note over User,Other: Message instantly disappears from both screens without reload

    Note over User,Other: Entire Chat Thread Deletion
    User->>Angular: Clicks "Delete chat" in dropdown menu
    Angular->>Controller: DELETE /api/chat/rooms/:roomId
    Controller->>DB: Message.deleteMany({ room: roomId })
    Controller->>DB: Room.findByIdAndDelete(roomId)
    Controller-->>Angular: 200 OK ({ status: 'success' })
    Angular->>Angular: Remove room from sidebar & reset active view
```

---

## 7. Group Creation & Multi-User Real-Time Synchronization

This sequence details the interactive group creation process, participant selection, backend room initialization, and real-time Socket.IO fanout to all member dashboards.

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Group Creator (User A)
    participant Modal as CreateGroupModalComponent
    participant Service as ChatService
    participant API as Express Chat Controller
    participant DB as MongoDB Atlas
    participant Socket as Socket.IO Engine
    actor Member1 as Member (User B)
    actor Member2 as Member (User C)

    Creator->>Modal: Clicks "+ New Group" button
    Modal->>Modal: Opens modal UI
    Creator->>Modal: Types in Search Input ("alice", "bob")
    Modal->>Service: searchUsers(query)
    Service->>API: GET /api/chat/users/search?q=query
    API->>DB: User.find({ username: /query/i })
    DB-->>API: Matching user list
    API-->>Modal: Display search results
    Creator->>Modal: Clicks to select User B & User C
    Modal->>Modal: Adds removable chips for User B & User C
    Creator->>Modal: Enters Group Name ("Core Team") & clicks "Create Group"

    Modal->>Service: createGroup("Core Team", [idB, idC])
    Service->>API: POST /api/chat/rooms { name: "Core Team", participantIds: [idB, idC], isGroup: true }
    API->>API: Deduplicate & validate IDs: [idA, idB, idC]
    API->>DB: Room.create({ name: "Core Team", isGroup: true, createdBy: idA, participants: [idA, idB, idC] })
    DB-->>API: Created Room document
    API->>DB: room.populate('participants', 'username avatar isOnline lastSeen')
    DB-->>API: Populated Room

    Note over API,Socket: Real-Time Multi-Channel Broadcast
    API->>Socket: io.to('user:idA').emit('room-created', populatedRoom)
    API->>Socket: io.to('user:idB').emit('room-created', populatedRoom)
    API->>Socket: io.to('user:idC').emit('room-created', populatedRoom)

    API-->>Service: 201 Created ({ status: 'success', room: populatedRoom })
    Service->>Service: Prepend new group to rooms signal & selectRoom(room)
    Modal-->>Creator: Closes modal & navigates to new group chat window

    Socket-->>Member1: Emits 'room-created' on personal channel
    Member1->>Member1: chat.service prepends group to rooms list without reload
    Socket-->>Member2: Emits 'room-created' on personal channel
    Member2->>Member2: chat.service prepends group to rooms list without reload
```

