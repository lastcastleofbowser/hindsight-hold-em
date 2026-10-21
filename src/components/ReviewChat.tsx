import { useEffect, useRef, useState } from 'react';
import { offlineReply, walkthrough } from '../engine/chat';
import type { HandReview } from '../engine/review';
import { RichText } from './RichText';

interface Message {
  id: number;
  role: 'coach' | 'user';
  text: string;
}

interface Props {
  review: HandReview | null;
  /** Label for where the hand came from, e.g. "Table hand #12". */
  origin: string;
  beginner: boolean;
}

const SUGGESTIONS = ['Who should have won?', 'What should I have done on the turn?', 'How many outs did I have?', 'Explain the pot odds'];

let nextId = 1;

/** Chat with the built-in coach about a recreated or table hand. Works fully offline. */
export function ReviewChat({ review, origin, beginner }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  // A new hand resets the conversation.
  useEffect(() => {
    setMessages(review ? walkthrough(review, { beginner }).map((text) => ({ id: nextId++, role: 'coach', text })) : []);
  }, [review, beginner]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || !review) return;
    setInput('');
    setMessages((m) => [
      ...m,
      { id: nextId++, role: 'user', text: q },
      { id: nextId++, role: 'coach', text: offlineReply(q, review, { beginner }) },
    ]);
  };

  return (
    <section className="panel chat" aria-label="Coach chat" data-tour="review-chat">
      <h2>Coach chat</h2>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            Recreate a hand on the left — or press <b>Discuss with coach</b> after a hand at the table — and I'll walk you through every decision.
          </div>
        ) : (
          <>
            <div className="small muted" style={{ textAlign: 'center' }}>
              {origin}
            </div>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'coach' && <div className="source">Coach</div>}
                <RichText text={m.text} />
              </div>
            ))}
          </>
        )}
      </div>
      {review && (
        <>
          <div className="suggestions" data-tour="review-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip-btn" onClick={() => send(s)}>
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
            <button type="submit" className="btn primary" disabled={!input.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </section>
  );
}
