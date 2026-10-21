import { useEffect, useRef, useState } from 'react';
import { type CoachTurn, CoachError, askClaude } from '../claude';
import { handFacts, offlineReply, walkthrough } from '../engine/chat';
import type { HandReview } from '../engine/review';
import { RichText } from './RichText';

interface Message {
  id: number;
  role: 'coach' | 'user';
  text: string;
  source: 'offline' | 'claude';
  pending?: boolean;
}

interface Props {
  review: HandReview | null;
  /** Label for where the hand came from, e.g. "Table hand #12". */
  origin: string;
  claudeReady: boolean;
  apiKey: string;
  beginner: boolean;
}

const SUGGESTIONS = ['Who should have won?', 'What should I have done on the turn?', 'How many outs did I have?', 'Explain the pot odds'];

let nextId = 1;

export function ReviewChat({ review, origin, claudeReady, apiKey, beginner }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const claudeTurns = useRef<CoachTurn[]>([]);
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // A new hand resets the conversation.
  useEffect(() => {
    abort.current?.abort();
    claudeTurns.current = [];
    setMessages(review ? walkthrough(review, { beginner }).map((text) => ({ id: nextId++, role: 'coach', text, source: 'offline' })) : []);
  }, [review, beginner]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || !review || busy) return;
    setInput('');
    const userMsg: Message = { id: nextId++, role: 'user', text: q, source: 'offline' };

    if (!claudeReady) {
      setMessages((m) => [...m, userMsg, { id: nextId++, role: 'coach', text: offlineReply(q, review, { beginner }), source: 'offline' }]);
      return;
    }

    const replyId = nextId++;
    setMessages((m) => [...m, userMsg, { id: replyId, role: 'coach', text: '', source: 'claude', pending: true }]);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const turns: CoachTurn[] = [...claudeTurns.current, { role: 'user', content: q }];
    try {
      const result = await askClaude({
        apiKey,
        handFacts: handFacts(review),
        beginner,
        history: turns,
        signal: controller.signal,
        onText: (text) => setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text } : x))),
      });
      claudeTurns.current = [...turns, { role: 'assistant', content: result.content }];
      setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: result.text, pending: false } : x)));
    } catch (err) {
      const reason = err instanceof CoachError ? err.message : "Couldn't reach Claude.";
      setMessages((m) =>
        m.map((x) =>
          x.id === replyId ? { ...x, source: 'offline', pending: false, text: `*${reason} Here's the offline coach instead.*\n\n${offlineReply(q, review, { beginner })}` } : x,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel chat" aria-label="Coach chat">
      <h2>
        Coach chat
        <span className="small muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {claudeReady ? 'Claude (online)' : 'Offline coach'}
        </span>
      </h2>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            Recreate a hand on the left — or press <b>Discuss with coach</b> after a hand at the table — and I'll walk you through every decision.
          </div>
        ) : (
          <>
            <div className="small muted" style={{ textAlign: 'center' }}>{origin}</div>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'coach' && <div className="source">{m.source === 'claude' ? 'Claude' : 'Coach'}</div>}
                {m.pending && !m.text ? <span className="muted">Thinking…</span> : <RichText text={m.text} />}
              </div>
            ))}
          </>
        )}
      </div>
      {review && (
        <>
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip-btn" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label className="sr-only" htmlFor="chat-q">
              Ask the coach
            </label>
            <textarea
              id="chat-q"
              value={input}
              placeholder="Ask about this hand…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn ghost" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={!input.trim()}>
                Send
              </button>
            )}
          </form>
        </>
      )}
    </section>
  );
}
