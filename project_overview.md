# QuickChat — Full Project Overview

> **Purpose of this document**: A complete, self-contained reference to hand off to any model/developer so they can understand the existing codebase and know exactly where to continue building.

---

## 1. Architecture: Is It Monolithic?

**No — it is a separated (two-repo) monolith, NOT a microservices app.**

| Concern | Answer |
|---|---|
| Single deployable backend? | ✅ Yes — one Node.js process |
| Separate frontend/backend repos? | ✅ Yes — `Client/` and `Server/` are two independent apps |
| Microservices? | ❌ No |
| Monorepo? | Partially — both live under one root folder but are **not** linked via a workspace manager |

The backend is a **classic monolith**: Express + Socket.IO + Mongoose all in one process. The frontend is a standalone **Angular 21 SPA**. They communicate via:
- **REST API** (HTTP) for CRUD operations  
- **Socket.IO** (WebSocket) for real-time messaging

---

## 2. Tech Stack

### Backend (`/Server`)
| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | LTS |
| Framework | Express.js | ^4.18 |
| Real-time | Socket.IO (server) | ^4.6 |
| Database | MongoDB via Mongoose | ^8.0 |
| Auth | JWT (jsonwebtoken) | ^9.0 |
| Password hashing | bcryptjs | ^2.4 |
| Translation | Google Translate (free `gtx` endpoint, no key) | — |
| AI Moderation | TensorFlow.js (`@tensorflow/tfjs`) | ^4.22 |
| Language detection | `franc-min` | ^6.2 |
| HTTP client | axios | ^1.13 |
| Config | dotenv | ^16 |
| Dev server | nodemon | ^3.0 |

### Frontend (`/Client`)
| Layer | Technology | Version |
|---|---|---|
| Framework | Angular | ^21.1 |
| Language | TypeScript | ~5.9 |
| Real-time | socket.io-client | ^4.6 |
| State | Angular Signals (built-in) | — |
| HTTP | Angular HttpClient | — |
| Routing | Angular Router | — |
| Testing | Vitest | ^4.0 |
| Build | `@angular/build` (esbuild-based) | ^21.1 |

---

## 3. Folder Structure (Annotated)

```
Chatting app/
├── Client/                        # Angular 21 Zoneless SPA
│   └── src/
│       ├── index.html
│       ├── main.ts                # Bootstrap entry with provideZonelessChangeDetection
│       ├── styles.css             # Global WhatsApp Dark Design Tokens
│       ├── environments/          # Environment configs (dev / prod)
│       └── app/
│           ├── app.component.ts   # Root shell component
│           ├── app.routes.ts      # All SPA routes
│           ├── app.config.ts      # provideRouter, provideHttpClient, interceptors
│           ├── auth/
│           │   ├── login/         # Login page component
│           │   └── signup/        # Signup page component
│           ├── chat/
│           │   ├── chat-layout/   # Main chat page wrapper & header triggers
│           │   ├── chat-window/   # Message thread, pagination, hover actions, translation
│           │   ├── create-group-modal/ # Interactive group creation modal
│           │   ├── room-list/     # Left sidebar (DMs + Groups, pins, unread)
│           │   └── user-search/   # Instant user search
│           ├── landing/           # Public product showcase
│           ├── profile/           # User profile editor & language selector
│           ├── settings/          # Password management & account deletion
│           ├── guards/
│           │   └── auth.guard.ts  # Protects chat/profile/settings routes
│           ├── interceptors/      # HTTP interceptor (adds JWT header, 401 auto-logout)
│           └── services/
│               ├── auth.service.ts       # Login/signup/token management
│               ├── chat.service.ts       # Socket.IO + REST chat logic, room-created listener
│               ├── translation.service.ts # Translation gateway & client cache
│               └── user.service.ts       # Profile/user operations
│
└── Server/                        # Express + Socket.IO Backend Engine
    ├── server.js                  # Entry point — wires REST, Socket.IO, Winston & Redis
    ├── .env                       # Environment variables
    ├── .env.example               # Template environment configuration
    ├── generateTokens.js          # JWT utility
    ├── routes/
    │   ├── authRoutes.js          # /api/auth/*
    │   ├── chatRoutes.js          # /api/chat/*
    │   ├── userRoutes.js          # /api/users/*
    │   └── moderationRoutes.js    # /api/moderation/*
    ├── controllers/
    │   ├── authController.js      # Register, Login, Me
    │   ├── chatController.js      # Rooms, Messages, Groups, Pin, Delete, Pagination
    │   ├── userController.js      # Profile get/update, Password, Soft delete
    │   └── moderationController.js# Moderation logs & metrics
    ├── models/
    │   ├── User.js                # Mongoose schema (indexes, warningCount, mutedUntil)
    │   ├── Message.js             # Mongoose schema (compound index {room, createdAt})
    │   ├── Room.js                # Mongoose schema (participants index, isGroup, createdBy)
    │   └── ModerationLog.js       # Mongoose schema (audit logs)
    ├── middleware/
    │   ├── authMiddleware.js      # JWT verify for REST + adminOnly guard
    │   ├── roomAuthMiddleware.js  # IDOR guard & room participant verification
    │   ├── validationMiddleware.js# express-validator schemas
    │   └── rateLimiter.js         # Multi-tier rate limiters (auth, translate, api)
    ├── socket/
    │   └── socketHandler.js       # Real-time event coordinator, presence & spam throttler
    ├── services/
    │   ├── translationService.js  # Google Translate (gtx), detect + retry backoff
    │   └── contentModerationService.js  # TensorFlow.js AI model inference wrapper
    ├── utils/
    │   └── logger.js              # Winston structured request & error logger
    ├── tests/                     # 18 Automated Jest Unit Tests
    │   ├── groupChat.test.js
    │   ├── roomAuth.test.js
    │   ├── messageDelete.test.js
    │   ├── moderation.test.js
    │   └── securityValidation.test.js
    └── ai-model/
        ├── train.js               # Training script (JavaScript/TensorFlow.js)
        ├── train_python.py        # Alternative training script (Python/Keras)
        ├── training-data/         # CSV/JSON datasets for training
        └── trained-model/         # Output: model.json + weight shards + config.json
```

---

## 4. Database Schemas

### `User`
```js
{
  username:          String (unique, required),
  email:             String (unique, required),
  password:          String (hashed via bcrypt, not returned by default),
  preferredLanguage: String (default: 'en'),
  avatar:            String (URL or base64),
  about:             String (default: "Hey there! I am using QuickChat"),
  isOnline:          Boolean,
  lastSeen:          Date,
  timestamps:        true
}
```

### `Room`
```js
{
  name:         String (required),
  participants: [ObjectId → User],
  isGroup:      Boolean (false = DM, true = group),
  lastMessage:  ObjectId → Message,
  createdBy:    ObjectId → User,
  pinnedBy:     [ObjectId → User],   // per-user pin
  timestamps:   true
}
```

### `Message`
```js
{
  room:             ObjectId → Room,
  sender:           ObjectId → User,
  originalText:     String,
  originalLanguage: String (e.g. 'en', 'hi'),
  translations:     [{ language: String, text: String }],
  readBy:           [ObjectId → User],
  moderation: {
    status:           'clean' | 'warned' | 'blocked',
    score:            Number (0–1),
    primaryCategory:  String ('sexual' | 'hate_cultural' | 'threat'),
    wasSanitized:     Boolean,
    violationMessage: String
  },
  timestamps: true
}
```

### `ModerationLog`
```js
{
  room:            ObjectId → Room,
  sender:          ObjectId → User,
  originalText:    String,
  action:          'blocked' | 'warned',
  score:           Number,
  primaryCategory: String,
  timestamps:      true
}
```

---

## 5. REST API Reference

**Base URL**: `http://localhost:5001/api`

### Auth — `/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Get JWT token |

### Chat — `/chat`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/chat/rooms` | JWT | Get user's rooms (sorted, pinned first) |
| POST | `/chat/rooms` | JWT | Create DM or group room |
| GET | `/chat/rooms/:roomId/messages` | JWT | Get last 100 messages |
| DELETE | `/chat/rooms/:roomId/messages` | JWT | Clear all messages in room |
| DELETE | `/chat/rooms/:roomId` | JWT | Delete room + messages |
| POST | `/chat/rooms/:roomId/pin` | JWT | Toggle pin for this user |
| GET | `/chat/users/search?q=` | JWT | Search users by username/email |
| GET | `/chat/languages` | JWT | Get supported languages list |
| POST | `/chat/translate` | JWT | Translate a message on demand |

### Users — `/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/profile` | JWT | Get own profile |
| PATCH | `/users/profile` | JWT | Update profile (avatar, about, preferredLanguage) |

### Moderation — `/moderation`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/moderation/logs` | JWT | Get moderation logs |

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Server health check |

---

## 6. Socket.IO Real-Time Events

**Connection**: Client connects with `{ auth: { token: "<JWT>" } }`. Server verifies token via middleware before allowing connection.

### Client → Server (emit)
| Event | Payload | Description |
|---|---|---|
| `join-room` | `roomId: string` | Join a room's socket channel |
| `leave-room` | `roomId: string` | Leave a room's channel |
| `send-message` | `{ roomId, text }` | Send a message (triggers AI moderation + translation) |
| `typing` | `{ roomId, isTyping }` | Broadcast typing indicator |

### Server → Client (listen)
| Event | Payload | Description |
|---|---|---|
| `new-message` | Full populated `Message` object | Broadcast to all room members |
| `user-joined` | `{ userId, username }` | Someone joined the room |
| `user-typing` | `{ userId, username, isTyping }` | Typing indicator |
| `message-moderated` | `{ action: 'warned'|'blocked', message: string }` | Sent ONLY to the sender when their message is flagged |
| `user-online` | `{ userId }` | Presence event |
| `user-offline` | `{ userId }` | Presence event |
| `error` | `{ message }` | Server-side error |

---

## 7. AI Content Moderation Pipeline

Every message goes through this pipeline **before** being saved or broadcast:

```
User sends message
       ↓
  moderateMessage(text)           ← TensorFlow.js model inference
       ↓
  Result: { action, label, confidence, scores }
       ↓
  ┌─────────────────────────────────────┐
  │  action = 'blocked' (conf ≥ 0.65)  │ → Log to ModerationLog
  │    → emit 'message-moderated'       │   → STOP, message not delivered
  │    → return                         │
  ├─────────────────────────────────────┤
  │  action = 'warned' (conf ≥ 0.40)   │ → Log to ModerationLog
  │    → emit 'message-moderated'       │   → CONTINUE to delivery
  │    → (proceed)                      │
  ├─────────────────────────────────────┤
  │  action = 'clean'                   │ → No alert, proceed normally
  └─────────────────────────────────────┘
       ↓
  detectLanguage(text)            ← Google Translate (free gtx endpoint)
       ↓
  translateForRecipients(...)     ← Parallel translation for each participant's preferred language
       ↓
  Message.create(...)             ← Saved to MongoDB with translations + moderation result
       ↓
  io.to(roomId).emit('new-message', message)  ← Broadcast to all room members
```

**AI Model details:**
- Framework: TensorFlow.js (runs in Node.js, no GPU needed)
- Architecture: Embedding → LSTM/Dense layers (trained on toxic content datasets)
- Categories: `clean`, `sexual`, `hate_cultural`, `threat`
- Model files: `Server/ai-model/trained-model/model.json` + weight shards + `config.json`
- Training: `node ai-model/train.js` or `python ai-model/train_python.py`

---

## 8. Angular Frontend — Routes & Components

```
/              → LandingComponent      (public)
/login         → LoginComponent        (public)
/signup        → SignupComponent       (public)
/chat          → ChatLayoutComponent   (🔒 auth required)
/profile       → ProfileComponent      (🔒 auth required)
/settings      → SettingsComponent     (🔒 auth required)
```

**Key Angular Services:**

| Service | Responsibility |
|---|---|
| `AuthService` | Login, signup, JWT storage, `currentUser` signal, `token` signal |
| `ChatService` | Socket.IO lifecycle, rooms/messages signals, send/join/leave, pin/clear/delete |
| `TranslationService` | On-demand translate endpoint calls |
| `UserService` | Profile get/update |

**State Management**: Uses Angular 21 **Signals** (`signal()`, `.update()`, `.set()`) — no NgRx or BehaviorSubjects.

**Auth Guard** (`auth.guard.ts`): Checks `AuthService.currentUser()` signal; redirects to `/login` if not authenticated.

**HTTP Interceptor** (`interceptors/`): Injects `Authorization: Bearer <token>` header on all outgoing HTTP requests.

---

## 9. Environment Variables (`Server/.env`)

```env
PORT=5001
MONGO_URI=mongodb://localhost:27017/bilingual-chat
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRES_IN=7d
GOOGLE_TRANSLATE_API_KEY=your_google_translate_api_key_here   # Not actively used (free gtx is used instead)
CLIENT_URL=http://localhost:4200
LIBRE_TRANSLATE_URL=https://libretranslate.de                 # Not actively used
```

---

## 10. How to Run Locally

```bash
# 1. Start MongoDB
mongod

# 2. Start Backend
cd Server
npm install
npm run dev        # nodemon server.js → http://localhost:5001

# 3. (Optional) Train AI model if model.json doesn't exist
node ai-model/train.js

# 4. Start Frontend
cd Client
npm install
npm start          # ng serve → http://localhost:4200
```

---

## 11. What Is Already Built ✅

- [x] **JWT Authentication & Security**: Register, Login, Auto-401 Logout Interceptor, bcrypt password hashing (12 rounds).
- [x] **In-Process Edge AI Moderation**: Local TensorFlow.js CNN text classification (<15ms latency, 4 categories).
- [x] **Multilingual Pre-Moderation**: Non-English messages translated before moderation classification.
- [x] **Progressive Disciplinary State Machine**: 2 warnings → 15-minute temporary mute with automatic cooldown reset.
- [x] **Direct Messages & Group Chats**: Dynamic DM generation + Interactive Group Creation Modal with custom naming.
- [x] **Real-Time Group Sync**: Socket.IO `room-created` broadcast across member notification channels (`user:<id>`).
- [x] **Real-Time Messaging**: Bidirectional Socket.IO event pipeline with delivery confirmation.
- [x] **Cursor-Based Pagination**: `GET /messages?before=<timestamp>&limit=50` with "Load earlier messages" UI button.
- [x] **Message Deletion**: Single message deletion (`DELETE /messages/:id`) & full chat thread deletion.
- [x] **Read Receipts & Presence**: Double-blue ticks (`✓✓`), multi-tab socket tracking, online/offline status, `lastSeen`.
- [x] **Dual-Tier Translation**: Recipient-filtered background translation + on-demand client translation toggles.
- [x] **IDOR & Security Guards**: `roomAuthMiddleware` participant checks, `express-validator` schemas, rate limiting tiers.
- [x] **Production Infrastructure**: `docker-compose.yml`, compound MongoDB indexes, Winston structured logging, Redis cluster adapter.
- [x] **Automated Test Suite**: 18 passing Jest unit tests across 5 test suites.

---

## 12. Future Scope & Roadmap 🚀

- [ ] **Media & File Attachments**: S3 / Cloudinary upload integration for images, PDFs, documents, and voice clips.
- [ ] **Inline Message Reactions**: Emoji reaction picker (❤️, 👍, 😂, 🎉) attached to message bubbles.
- [ ] **Browser Web Push**: Service Worker Web Push API for background notifications when tabs are closed.
- [ ] **Granular Group Admin Panel**: Kicking members, assigning co-admins, and updating group icons.
- [ ] **End-to-End Encryption (E2EE)**: Signal Protocol (Double Ratchet Algorithm) for client-side cryptographic privacy.
- [ ] **WebRTC Audio / Video Calling**: Peer-to-peer audio/video streaming via WebRTC mesh / SFU.
- [ ] **Admin Analytics Dashboard**: Live metrics dashboard for viewing moderation logs and banning toxic users.

---

## 13. Key Design Decisions to Know

1. **In-Process AI Moderation** — TensorFlow.js runs in-process directly within Node.js. No external cloud AI API calls are made, guaranteeing sub-15ms inference and 100% data privacy.
2. **Dynamic Group Broadcast** — Creating a group sends a `room-created` event to each participant's dedicated room (`user:<id>`), syncing their sidebar list immediately without requiring manual refresh.
3. **Signals-Based Reactivity** — The Angular 21 frontend uses native Signals for all state management with zoneless change detection, avoiding NgRx complexity and `zone.js` overhead.
4. **IDOR Prevention** — All room and message operations verify user membership inside `Room.participants` before executing queries.
5. **Cursor Pagination** — Messages are fetched in slices of 50 using `createdAt: { $lt: beforeTimestamp }` against a compound MongoDB index (`{ room: 1, createdAt: 1 }`).
6. **Graceful Translation Fallback** — Translation calls use exponential backoff retry and automatically fallback to original text if the gateway experiences transient delays.
