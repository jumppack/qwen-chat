# Implementation Plan 2: Scroll Fix and Stop Generation

## Goal Description
Fix the jittering and auto-scroll logic during text generation, and implement a "Stop Generation" button to allow users to cancel ongoing AI responses.

## User Review Required
> [!IMPORTANT]
> Please review this plan before I proceed. This will add client-side abort controllers and slightly modify the backend streaming logic to listen for disconnects.

## Proposed Changes

### 1. Fix Auto-Scroll Logic
The current implementation checks the total distance from the bottom. When text streams in quickly, the container size grows faster than the scroll can catch up, causing `scrollHeight` to increase and triggering false auto-scroll re-enabling, which results in jitter.

#### [MODIFY] src/app/page.js
- Introduce `lastScrollTopRef` to track the *direction* of the user's scroll.
- If `scrollTop < lastScrollTopRef.current`, the user has actively scrolled up. We immediately set `isAutoScrollEnabled = false`.
- If the user scrolls to the absolute bottom (`scrollHeight - scrollTop - clientHeight <= 10`), we set `isAutoScrollEnabled = true`.
- Change `scrollIntoView({ behavior: 'smooth' })` to `behavior: 'auto'` (instant) if smooth scrolling still fights with the user's manual scroll, though tracking direction usually fixes this. We will test with 'smooth' first.

### 2. Implement "Stop Generation"
If the AI is generating gibberish or the user simply wants to interrupt, they should have a button to halt the response.

#### [MODIFY] src/app/page.js
- Create an `abortControllerRef` using `useRef(null)`.
- When `sendMessage` is called, initialize `new AbortController()` and pass `signal: abortControllerRef.current.signal` to the `fetch` request.
- Create a `stopGeneration` function that calls `abortControllerRef.current.abort()`.
- Update the UI input area: when `isTyping` is true, render a "Stop" button (square icon) with `onClick={stopGeneration}` instead of the "Send" button.
- Catch the `AbortError` in the `try/catch` block of `sendMessage` to gracefully handle the cancellation without throwing unhandled exceptions.

#### [MODIFY] src/app/api/chat/route.js
- Within the `for await (const chunk of responseStream)` loop, add a check for `req.signal.aborted`.
- If `req.signal.aborted` is true, `break` the loop immediately.
- The `finally` block will then execute, saving the partial response generated so far to the SQLite database and gracefully closing the connection to Ollama.

## Verification Plan
1. **Automated/Manual Verification**:
   - Start a response and scroll up slowly. Verify that auto-scroll immediately disengages and the screen does not jitter.
   - Start a response and click the "Stop" button. Verify that the response halts immediately on the frontend.
   - Reload the page to check the database. Verify that the partial message before the stop was correctly persisted to SQLite.
