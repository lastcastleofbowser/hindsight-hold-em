import { useState } from 'react';
import { PlayView } from './components/PlayView';
import { ReviewBuilder } from './components/ReviewBuilder';
import { ReviewChat } from './components/ReviewChat';
import { SettingsDrawer } from './components/SettingsDrawer';
import type { HandReview } from './engine/review';
import { useOnline } from './hooks/useOnline';
import { ITERATIONS, useSettings } from './hooks/useSettings';

type Tab = 'play' | 'review';

export default function App() {
  const [settings, update] = useSettings();
  const [tab, setTab] = useState<Tab>('play');
  const [showSettings, setShowSettings] = useState(false);
  const [review, setReview] = useState<{ data: HandReview; origin: string } | null>(null);
  const online = useOnline();
  const claudeReady = settings.claudeEnabled && !!settings.apiKey && online;

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          <div>
            Hindsight Hold'em
            <small>Poker trainer</small>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sections">
          <button className="tab" role="tab" aria-selected={tab === 'play'} onClick={() => setTab('play')}>
            Play & Train
          </button>
          <button className="tab" role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>
            Hand Review
          </button>
        </nav>
        <div className="header-right">
          <span className={`status-pill${online ? '' : ' offline'}`} title={online ? 'Online' : 'Offline — everything except the Claude chat still works'}>
            <span className="dot" />
            {online ? (claudeReady ? 'Online · Claude on' : 'Online') : 'Offline'}
          </span>
          <button className="icon-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      <main>
        {/* Play stays mounted so switching tabs doesn't lose the current hand. */}
        <div hidden={tab !== 'play'}>
          <PlayView
            settings={settings}
            onDiscuss={(data, handNumber) => {
              setReview({ data, origin: `Table hand #${handNumber}` });
              setTab('review');
            }}
          />
        </div>
        <div hidden={tab !== 'review'} className="review-layout">
          <ReviewBuilder iterations={ITERATIONS[settings.accuracy]} onAnalyse={(data) => setReview({ data, origin: 'Your recreated hand' })} />
          <ReviewChat review={review?.data ?? null} origin={review?.origin ?? ''} claudeReady={claudeReady} apiKey={settings.apiKey} />
        </div>
      </main>

      {showSettings && <SettingsDrawer settings={settings} update={update} onClose={() => setShowSettings(false)} />}
    </>
  );
}
