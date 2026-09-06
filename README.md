# Local Qwen Chat

A premium, fully local ChatGPT clone built with **Next.js**, **SQLite**, and **Ollama**. It features real-time streaming, persistent chat history, and a modern glassmorphic dark-mode UI. 

This project allows you to run large language models (like `qwen2.5-coder:32b` and `qwen3.6:27b`) completely offline on your own hardware, with zero reliance on paid APIs.

## Quick Start (One-Command Launch)

If you already have Node.js and Ollama installed, you can start all services (Ollama AI server & Next.js frontend) with a single command:

```bash
./start.sh
# or
npm run start:services
```

The startup script automatically checks if Ollama is running (starting `ollama serve` if needed), verifies the local Prisma SQLite database setup, and starts the Next.js development server at [http://localhost:3000](http://localhost:3000).

---

## Prerequisites

Before starting, ensure you have the following installed on your machine:
1. **Node.js** (v18 or higher)
2. **Ollama** (The local AI engine)

### 1. Install and Start Ollama
If you haven't installed Ollama, download it from [ollama.com](https://ollama.com/) or install it via Homebrew on macOS:
```bash
brew install ollama
brew services start ollama
```
*(Alternatively, you can manually start the Ollama server anytime by running `ollama serve`)*

### 2. Download the Models
This application supports dynamic model switching. It is configured out-of-the-box to use `qwen2.5-coder:32b` and `qwen3.6:27b`. Pull them to your local machine:
```bash
ollama pull qwen2.5-coder:32b
ollama pull qwen3.6:27b
```

---

## Step-by-Step Installation & Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/jumppack/qwen-chat.git
   cd qwen-chat
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up the Local Database**
   This app uses SQLite and Prisma to save your chat history locally.
   - Run the Prisma migration to generate the `dev.db` file and build the Prisma client:
     ```bash
     npx prisma db push
     npx prisma generate
     ```

4. **Start the Application**
   - **Option A: Automated Startup Script**
     ```bash
     ./start.sh
     ```
   - **Option B: Manual Startup**
     - Terminal 1 (Ollama AI Server):
       ```bash
       ollama serve
       ```
     - Terminal 2 (Next.js Dev Server):
       ```bash
       npm run dev
       ```

5. **Open the Application**
   Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Features & Usage
- **New Chat**: Click "New Chat" in the sidebar to start a fresh conversation.
- **Local RAG & Document Uploads**: Upload PDF, TXT, or CSV files to the chat. The app uses an embedded LanceDB vector database to securely chunk and store document embeddings locally.
- **Inline Citations**: The model actively understands document context and will naturally cite specific file names inline when drawing information from attached documents.
- **Dynamic Model Switching**: Switch seamlessly between available local models (like `qwen2.5-coder:32b` and `qwen3.6:27b`) directly from the top menu. Your selected model is saved independently for each chat session.
- **Smart Auto-Scroll**: The app automatically scrolls down as the AI types. If you scroll up to read previous messages, the auto-scroll intelligently pauses and a "Response generating ↓" button appears.
- **Markdown & Code Highlighting**: Code blocks are automatically formatted and highlighted for readability.
- **Persistent Memory**: All your chats are securely saved to the `prisma/dev.db` SQLite file on your local hard drive. They will be there even if you restart your computer!
