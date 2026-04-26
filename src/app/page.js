'use client';

import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked to use highlight.js
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-'
});

export default function Home() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [stagedFiles, setStagedFiles] = useState([]); // { id, name, status: 'uploading'|'ready'|'error', documentId }
  const isUploading = stagedFiles.some((f) => f.status === 'uploading');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const [isDeleting, setIsDeleting] = useState(null); // documentId

  const selectChat = async (id) => {
    setActiveChatId(id);
    const res = await fetch(`/api/chats/${id}`);
    const data = await res.json();
    setMessages(data.messages || []);
    
    // Hydrate staged files from persistent storage
    if (data.documents) {
      const hydratedFiles = data.documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        status: 'ready',
        documentId: doc.documentId
      }));
      setStagedFiles(hydratedFiles);
    } else {
      setStagedFiles([]);
    }
  };

  const fetchChats = async () => {
    const res = await fetch('/api/chats');
    const data = await res.json();
    setChats(data);
    if (data.length > 0 && !activeChatId) {
      selectChat(data[0].id);
    }
  };

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto scroll
  useEffect(() => {
    if (isAutoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isAutoScrollEnabled]);

  // Clear staged files when switching chats
  useEffect(() => {
    setStagedFiles([]);
  }, [activeChatId]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    
    if (scrollTop < lastScrollTopRef.current) {
      // User scrolled up
      setIsAutoScrollEnabled(false);
    } else if (scrollHeight - scrollTop - clientHeight <= 10) {
      // User reached the bottom
      setIsAutoScrollEnabled(true);
    }
    
    lastScrollTopRef.current = scrollTop;
  };

  const scrollToBottom = () => {
    setIsAutoScrollEnabled(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const openLibrary = async () => {
    setIsLibraryOpen(true);
    const res = await fetch('/api/documents/list');
    const data = await res.json();
    setLibraryDocs(data);
  };

  const deleteDocumentGlobally = async (documentId) => {
    if (!confirm('Are you sure? This will remove the document from ALL chats.')) return;
    setIsDeleting(documentId);
    try {
      await fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
      setLibraryDocs(prev => prev.filter(d => d.documentId !== documentId));
      // Also remove from current staged files if present
      setStagedFiles(prev => prev.filter(f => f.documentId !== documentId));
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(null);
    }
  };



  const createNewChat = async () => {
    const res = await fetch('/api/chats', { method: 'POST' });
    const newChat = await res.json();
    setChats([newChat, ...chats]);
    setActiveChatId(newChat.id);
    setMessages([]);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';

    for (const file of files) {
      const stagingId = `${file.name}-${Date.now()}`;

      // Immediately show pill in 'uploading' state
      setStagedFiles((prev) => [
        ...prev,
        { id: stagingId, name: file.name, status: 'uploading', documentId: null },
      ]);

      // Background upload
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/documents', { method: 'POST', body: formData });
        const data = await res.json();

        if (res.ok && data.documentId) {
          setStagedFiles((prev) =>
            prev.map((f) =>
              f.id === stagingId ? { ...f, status: 'ready', documentId: data.documentId } : f
            )
          );
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch {
        setStagedFiles((prev) =>
          prev.map((f) => (f.id === stagingId ? { ...f, status: 'error' } : f))
        );
      }
    }
  };

  const removeStagedFile = (stagingId) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== stagingId));
  };

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    let currentChatId = activeChatId;
    if (!currentChatId) {
      const res = await fetch('/api/chats', { method: 'POST' });
      const newChat = await res.json();
      currentChatId = newChat.id;
      setChats([newChat, ...chats]);
      setActiveChatId(currentChatId);
    }

    const readyDocuments = stagedFiles
      .filter((f) => f.status === 'ready')
      .map((f) => ({ documentId: f.documentId, name: f.name }));

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    // setStagedFiles([]); // REMOVED: keep files attached for follow-up questions
    setIsTyping(true);

    // Prepare assistant message stub
    const assistantMessage = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMessage]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: currentChatId,
          content: userMessage.content,
          documents: readyDocuments,
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let textContent = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: !done });
        textContent += chunkValue;

        // Update the last message (the assistant stub)
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = textContent;
          return newMessages;
        });
      }

      // Refresh chat list to update title
      fetchChats();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Generation stopped by user');
      } else {
        console.error('Streaming error:', error);
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex].role === 'assistant' && !newMessages[lastIndex].content) {
            newMessages[lastIndex].content = "⚠️ **Qwen is sleeping.** The local AI server is unreachable or encountered an error. Please make sure Ollama is running.";
          }
          return newMessages;
        });
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <button className="new-chat-btn" onClick={createNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          New Chat
        </button>
        <div className="chat-list">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
              onClick={() => selectChat(chat.id)}
            >
              {chat.title}
            </div>
          ))}
        </div>
        <button className="library-btn" onClick={openLibrary}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          Manage Library
        </button>
      </aside>

      {/* Main Chat Area */}
      <main className="main-chat">
        <header className="chat-header">
          {chats.find(c => c.id === activeChatId)?.title || 'Local Qwen-2.5 32B'}
        </header>

        <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
          {!isAutoScrollEnabled && isTyping && (
            <button className="scroll-popout" onClick={scrollToBottom}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
              Response generating ↓
            </button>
          )}

          {messages.length === 0 ? (
            <div className="empty-state">
              <h1>What can I help you with?</h1>
              <p>Type a message to start a new conversation.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div className="avatar">
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div 
                  className={`message-content markdown`}
                  dangerouslySetInnerHTML={{ __html: msg.role === 'assistant' ? marked.parse(msg.content || '...') : msg.content }}
                />
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="input-area">
          {/* Staged file pills */}
          {stagedFiles.length > 0 && (
            <div className="staged-files">
              {stagedFiles.map((f) => (
                <div
                  key={f.id}
                  className={`file-pill ${
                    f.status === 'uploading' ? 'uploading' : f.status === 'error' ? 'error' : 'ready'
                  }`}
                  title={
                    f.status === 'uploading' ? 'Processing & embedding file...' :
                    f.status === 'ready'    ? '✓ File embedded and ready for RAG' :
                                             '✗ Upload failed — click × to dismiss and try again'
                  }
                >
                  {/* Status icon */}
                  {f.status === 'uploading' && (
                    <span className="pill-spinner" aria-label="Uploading" />
                  )}
                  {f.status === 'ready' && (
                    // Checkmark
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  )}
                  {f.status === 'error' && (
                    // Warning triangle — distinct from the remove ×
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  )}

                  <span className="pill-name">{f.name}</span>

                  {/* Remove button — hidden while uploading so there's only ever one × */}
                  {f.status !== 'uploading' && (
                    <button
                      className="pill-remove"
                      onClick={() => removeStagedFile(f.id)}
                      title="Remove"
                      aria-label="Remove file"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div className="input-container">
            {/* Attach button */}
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach a file"
              aria-label="Attach a file"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => !isUploading && handleKeyDown(e)}
              placeholder={isUploading ? 'Waiting for upload to finish...' : 'Message Qwen...'}
              rows={1}
            />
            {isTyping ? (
              <button className="send-btn stop-btn" onClick={stopGeneration} title="Stop generation">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={!input.trim() || isUploading}
                title={isUploading ? 'Waiting for file to finish uploading...' : undefined}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Library Modal */}
      {isLibraryOpen && (
        <div className="modal-overlay" onClick={() => setIsLibraryOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Local Knowledge Base</h2>
              <button className="close-btn" onClick={() => setIsLibraryOpen(false)}>&times;</button>
            </header>
            <div className="modal-body">
              {libraryDocs.length === 0 ? (
                <div className="empty-library">No documents ingested yet.</div>
              ) : (
                <div className="library-list">
                  {libraryDocs.map(doc => (
                    <div key={doc.documentId} className="library-item">
                      <div className="doc-info">
                        <span className="doc-name">{doc.name}</span>
                        <span className="doc-date">Added on {new Date(doc.createdAt).toLocaleDateString()}</span>
                      </div>
                      <button 
                        className="delete-doc-btn" 
                        onClick={() => deleteDocumentGlobally(doc.documentId)}
                        disabled={isDeleting === doc.documentId}
                      >
                        {isDeleting === doc.documentId ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
