# Local ChatGPT Clone Implementation Plan (Phase 1)

We will build a sleek, premium, ChatGPT-like web application using **Next.js** and **JavaScript** that securely communicates with your local Ollama instance running the `qwen2.5-coder:32b` model. 

## Next.js Architecture & Streaming Support
We will use **Web Streams**:
1. **Backend**: The `ollama` SDK will be called with `stream: true`. We will pipe the resulting asynchronous stream into a standard Next.js `ReadableStream` response.
2. **Frontend**: The React frontend will use `response.body.getReader()` to decode the stream chunk-by-chunk and append the text to the chat UI in real-time.

## Database & Persistent Chat History (SQLite + Prisma)
We will use **SQLite** (a local, file-based database) combined with **Prisma ORM** to persist chat sessions and messages securely on your local disk. 

**Database Schema (`prisma/schema.prisma`):**
- `Chat`: Represents a chat session.
  - `id`: String (UUID)
  - `title`: String
  - `createdAt`, `updatedAt`: DateTime
- `Message`: Represents an individual message within a chat.
  - `id`: String (UUID)
  - `chatId`: String (Foreign Key to Chat)
  - `role`: String ('user' or 'assistant')
  - `content`: String
  - `createdAt`: DateTime

## Proposed Changes
We will execute the following steps within your current workspace `/Users/karan/Desktop/Code/qwen3_5_model_prompting`.

### Core Application Setup
- **Initialize Next.js**: Run `npx create-next-app@latest` in the current directory.
- **Dependencies**: Install `ollama`, `prisma`, `@prisma/client`, `marked`, `highlight.js`, `uuid`.

### Database Setup
- **Initialize Prisma**: Run `npx prisma init --datasource-provider sqlite`.
- **Define Schema**: Create the `Chat` and `Message` models.
- **Migrate Database**: Run `npx prisma db push` to create the SQLite database file.
- **Database Client**: Create `src/lib/prisma.js` for the singleton Prisma client.

### Application Structure

#### [NEW] src/app/api/chats/route.js
- Handle `GET` to fetch all chats (for a sidebar).
- Handle `POST` to create a new chat session.

#### [NEW] src/app/api/chats/[chatId]/route.js
- Handle `GET` to fetch all messages for a specific chat.

#### [NEW] src/app/api/chat/route.js
- Receive the `chatId` and the new user `message`.
- **Save User Message**: Insert the user message into the database.
- **Fetch Context**: Fetch previous messages for this chat from the database.
- **Stream Response**: Call `ollama.chat({ stream: true })`.
- **Save Assistant Message**: Intercept the stream on the backend, accumulate the chunks, and when the stream finishes, insert the full assistant message into the database.
- Return the stream to the frontend.

#### [MODIFY] src/app/page.js & Components
- **Sidebar Component**: Displays a list of previous chats fetched from `/api/chats`.
- **Chat Interface**: 
  - Loads messages when a chat is selected.
  - Appends new user messages.
  - Streams new assistant messages via `getReader()`.
- **Styling**: Premium Dark Mode using Vanilla CSS (`globals.css`), glassmorphism, and syntax highlighting.

## Verification Plan
- Start `npm run dev`.
- Ensure new chats are created and saved locally in `prisma/dev.db`.
- Use the browser subagent to verify streaming works and history persists across page reloads.
