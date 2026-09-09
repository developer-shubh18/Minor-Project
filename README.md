# QuickChat - Real-Time Multilingual Chat

Welcome to **QuickChat**, a modern, real-time messaging application designed to break down language barriers. This project was developed as a final semester project to showcase real-time web technologies, automatic translation integration, and modern frontend architecture.

## 🚀 Features

- **Real-Time Communication:** Instant messaging powered by WebSockets.
- **Automatic Translation:** Messages are automatically detected and translated into the recipient's preferred language on the fly.
- **Broad Language Support:** Supports over 30 languages and dialects seamlessly.
- **Modern User Interface:** Sleek, responsive, WhatsApp-inspired dark mode UI.
- **Robust Backend:** Secure handling of connections, disconnections, and real-time state synchronization.

## 🛠️ Technology Stack

- **Frontend:** Angular 17 (TypeScript, HTML, CSS)
- **Backend:** Node.js, Express.js
- **Real-time Engine:** Socket.IO
- **Database:** MongoDB (via Mongoose)
- **Translation:** External Translation API (Google Translate)

## ⚙️ Prerequisites

Before you begin, ensure you have met the following requirements:
* Node.js (v18 or higher recommended)
* Angular CLI installed globally (`npm install -g @angular/cli`)
* MongoDB running locally or a MongoDB Atlas URI

## 💻 Installation & Setup

1. **Clone the repository** (if not already local):
   ```bash
   git clone <repository-url>
   cd Minproj
   ```

2. **Setup the Backend (Server):**
   ```bash
   cd Server
   npm install
   ```
   Create a `.env` file in the `Server` directory with the following variables (refer to `.env.example`):
   ```env
   PORT=5001
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   CLIENT_URL=http://localhost:4200
   ```
   Start the backend server in development mode:
   ```bash
   npm run dev
   ```

3. **Setup the Frontend (Client):**
   Open a new terminal window:
   ```bash
   cd Client
   npm install
   ```
   Start the Angular development server:
   ```bash
   npm start
   ```

4. **Access the Application:**
   Open your browser and navigate to `http://localhost:4200`

## 🏗️ Architecture Overview

The application utilizes a **MEAN stack** (MongoDB, Express, Angular, Node) enhanced with **Socket.IO** for event-driven, real-time communication. 

1. When a user sends a message, it is emitted via Socket.IO to the Express backend.
2. The backend detects the original language of the text.
3. The backend iterates over the recipients in the chat room, checks their preferred languages, and concurrently fetches translations.
4. The translated payloads are broadcasted back to the respective clients in real-time, ensuring zero UI lag.

## 📝 License

This project was built for educational purposes as a university final semester project.
