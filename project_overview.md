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
├── Client/                        # Angular 21 SPA
│   └── src/
│       ├── index.html
│       ├── main.ts                # Bootstrap entry
│       ├── styles.css             # Global styles
│       └── app/
│           ├── app.component.ts   # Root shell component
│           ├── app.routes.ts      # All SPA routes
│           ├── app.config.ts      # provideRouter, provideHttpClient
│           ├── auth/
│           │   ├── login/         # Login page component
│           │   └── signup/        # Signup page component
│           ├── chat/
│           │   ├── chat-layout/   # Main chat page wrapper
│           │   ├── chat-window/   # Message thread UI
│           │   ├── room-list/     # Left sidebar (DMs + Groups)
│           │   └── user-search/   # Search to start new chat
│           ├── landing/           # Public home/landing page
│           ├── profile/           # User profile page
│           ├── settings/          # App settings page
│           ├── guards/
│           │   └── auth.guard.ts  # Protects chat/profile/settings routes
│           ├── interceptors/      # HTTP interceptor (adds JWT header)
│           └── services/
│               ├── auth.service.ts       # Login/signup/token management
│               ├── chat.service.ts       # Socket.IO + REST chat logic
│               ├── translation.service.ts # On-demand message translation
│               └── user.service.ts       # Profile/user operations
│
└── Server/                        # Express + Socket.IO monolith
    ├── server.js                  # Entry point — wires everything together
    ├── .env                       # Environment variables
    ├── generateTokens.js          # JWT utility
    ├── routes/
    │   ├── authRoutes.js          # /api/auth/*
    │   ├── chatRoutes.js          # /api/chat/*
    │   ├── userRoutes.js          # /api/users/*
    │   └── moderationRoutes.js    # /api/moderation/*
    ├── controllers/
    │   ├── authController.js      # Register, Login
    │   ├── chatController.js      # Rooms, Messages, Pin, Clear, Delete, Translate
    │   ├── userController.js      # Profile get/update
    │   └── moderationController.js# Moderation logs
    ├── models/
    │   ├── User.js                # Mongoose schema
    │   ├── Message.js             # Mongoose schema (with moderation fields)
    │   ├── Room.js                # Mongoose schema
    │   └── ModerationLog.js       # Mongoose schema
    ├── middleware/
    │   └── authMiddleware.js      # JWT verify for REST + Socket.IO
    ├── socket/
    │   └── socketHandler.js       # All Socket.IO event handlers
    ├── services/
    │   ├── translationService.js  # Google Translate (gtx), detect + translate
    │   └── contentModerationService.js  # TensorFlow.js AI model wrapper
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

- [x] User registration & login with JWT
- [x] JWT auth middleware for REST and Socket.IO
- [x] DM and Group room creation
- [x] Real-time messaging via Socket.IO
- [x] Per-message AI content moderation (block/warn/clean)
- [x] Auto language detection per message
- [x] Auto translation for each room participant's preferred language
- [x] On-demand translation endpoint (translate any message to any language)
- [x] Typing indicators
- [x] Online/offline presence tracking
- [x] Pin/unpin rooms (per user)
- [x] Clear chat / delete chat
- [x] User profile (avatar, about, preferred language)
- [x] Angular routing with auth guard
- [x] Angular Signals-based state management
- [x] Moderation logs stored in DB

---

## 12. What Is NOT Built / Needs Work ⚠️

- [ ] **AI model files** — `trained-model/` folder may be empty; need to run `node train.js` to generate `model.json`
- [ ] **Read receipts** — `readBy` field exists in Message schema but UI logic for marking messages as read is likely incomplete
- [ ] **Group chat management** — Adding/removing participants from groups, group name editing
- [ ] **File/image sharing** — No file upload support (text-only currently)
- [ ] **Push notifications** — No notification system outside the app
- [ ] **Message search** — No in-room search functionality
- [ ] **Pagination for messages** — Hardcoded `limit(100)` in `getMessages`, no infinite scroll
- [ ] **Settings page** — Route exists but functionality unknown (likely placeholder)
- [ ] **Profile page** — Route exists; update functionality exists in `userController` but UI completeness is unknown
- [ ] **Landing page** — Public marketing page exists but content is minimal
- [ ] **Error handling UI** — Global error handling in the frontend is minimal
- [ ] **Production deployment config** — No Docker, no nginx config, no CI/CD

---

## 13. Key Design Decisions to Know

1. **Translation is automatic per recipient** — When a message is sent, it's translated to each participant's `preferredLanguage` and stored in the `translations` array on the Message document. The frontend picks the right translation to display.

2. **Google Translate is used free** — The `gtx` client endpoint is used (no API key). This is rate-limited and unofficial. The `.env` has a `GOOGLE_TRANSLATE_API_KEY` but it is **not currently used**.

3. **AI model is local** — TensorFlow.js runs in-process in Node.js. No external AI API calls for moderation. The model must be trained first (`node ai-model/train.js`).

4. **Moderation happens server-side only** — Clients cannot bypass moderation. The server runs inference before saving/broadcasting.

5. **Signals, not RxJS subjects** — The Angular frontend uses modern Angular 21 Signals for all state. No NgRx, no BehaviorSubject for app state.

6. **No message editing or deletion** — The API has `clearRoom` and `deleteRoom` but no per-message delete/edit.
