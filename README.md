# Local Qwen Chat

A premium, fully local ChatGPT clone built with **Next.js**, **SQLite**, and **Ollama**. It features real-time streaming, persistent chat history, and a modern glassmorphic dark-mode UI. 

This project allows you to run large language models (like `qwen2.5-coder:32b`) completely offline on your own hardware, with zero reliance on paid APIs.

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

### 2. Download the Model
This application is configured to use the `qwen2.5-coder:32b` model. Pull it to your local machine:
```bash
ollama pull qwen2.5-coder:32b
```

## Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/qwen-chat.git
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

4. **Start the Development Server**
   ```bash
   npm run dev
   ```

5. **Open the Application**
   Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.

## Features & Usage
- **New Chat**: Click "New Chat" in the sidebar to start a fresh conversation.
- **Smart Auto-Scroll**: The app automatically scrolls down as the AI types. If you scroll up to read previous messages, the auto-scroll intelligently pauses and a "Response generating ↓" button appears.
- **Markdown & Code Highlighting**: Code blocks are automatically formatted and highlighted for readability.
- **Persistent Memory**: All your chats are securely saved to the `prisma/dev.db` SQLite file on your local hard drive. They will be there even if you restart your computer!
