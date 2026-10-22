import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BeginnerView } from './components/BeginnerView';
import { FriendsView } from './components/FriendsView';
import { LearnView } from './components/LearnView';
import { PlayView } from './components/PlayView';
import { ProfileView } from './components/ProfileView';
import { QuizView } from './components/QuizView';
import { RangesView } from './components/RangesView';
import { ReviewBuilder } from './components/ReviewBuilder';
import { ReviewChat } from './components/ReviewChat';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TourProvider, useAutoTour, useTour } from './components/Tour';
import type { HandReview } from './engine/review';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ITERATIONS, type SaveResult, type Settings, useSettings } from './hooks/useSettings';

type Tab = 'play' | 'beginner' | 'review' | 'quiz' | 'ranges' | 'friends' | 'profile' | 'learn';

// Always visible in the header. Profile is reached through the account button.
const TABS: { id: Tab; label: string }[] = [
  { id: 'play', label: 'Play & Train' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'friends', label: 'Friends' },
];

// Less-used sections, tucked behind the burger menu.
const MENU_TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Hand Review' },
  { id: 'quiz', label: 'Which Hand Wins?' },
  { id: 'ranges', label: 'Ranges' },
  { id: 'learn', label: 'Learn' },
];

export default function App() {
  const { settings, save } = useSettings();
  return (
    <AuthProvider>
      <TourProvider enabled={settings.tutorial} onTurnOff={() => save({ ...settings, tutorial: false })}>
        <Shell settings={settings} save={save} />
      </TourProvider>
    </AuthProvider>
  );
}

function Shell({ settings, save }: { settings: Settings; save: (next: Settings) => SaveResult }) {
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('reset') || params.has('verify') ? 'profile' : 'play';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [review, setReview] = useState<{ data: HandReview; origin: string } | null>(null);
  const tour = useTour();
  const { user, logout } = useAuth();
  const header = useRef<HTMLElement>(null);

  useAutoTour('review', tab === 'review');
  useAutoTour('review-chat', tab === 'review' && !!review);
  useAutoTour('learn', tab === 'learn');
  useAutoTour('settings', showSettings);

  // The playing tabs size the table to the space left under the header (see .tab-pane.fit).
  useLayoutEffect(() => {
    const el = header.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="app">
      <header className="app-header" ref={header}>
        <div className="brand">
          <img src="./icon.svg" alt="" />
          <div>
            Hindsight Hold'em
            <small>Texas Hold'em trainer</small>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sections" data-tour="tabs">
          {TABS.map((t) => (
            <button key={t.id} className="tab" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <BurgerMenu tab={tab} onSelect={setTab} onTour={tour.enabled ? tour.replay : undefined} />
        <div className="header-right">
          <AccountMenu user={user} onProfile={() => setTab('profile')} onLogout={() => void logout()} />
          <button className="icon-btn" onClick={() => setShowSettings(true)} data-tour="settings-button">
            Settings
          </button>
        </div>
      </header>

      <main>
        {/* Tabs with a game in progress stay mounted so switching doesn't lose the hand. */}
        <div hidden={tab !== 'play'} className="tab-pane fit">
          <PlayView
            settings={settings}
            active={tab === 'play' && !showSettings}
            onDiscuss={(data, handNumber) => {
              setReview({ data, origin: `Table hand #${handNumber}` });
              setTab('review');
            }}
          />
        </div>
        <div hidden={tab !== 'beginner'} className="tab-pane fit">
          <BeginnerView settings={settings} active={tab === 'beginner' && !showSettings} />
        </div>
        <div hidden={tab !== 'review'} className="review-layout">
          <ReviewBuilder iterations={ITERATIONS[settings.accuracy]} onAnalyse={(data) => setReview({ data, origin: 'Your recreated hand' })} />
          <ReviewChat review={review?.data ?? null} origin={review?.origin ?? ''} beginner={settings.beginnerMode} />
        </div>
        <div hidden={tab !== 'quiz'}>
          <QuizView active={tab === 'quiz' && !showSettings} />
        </div>
        <div hidden={tab !== 'ranges'}>
          <RangesView active={tab === 'ranges' && !showSettings} />
        </div>
        {/* Friends stays mounted so a seat at a friends' table survives switching tabs. */}
        <div hidden={tab !== 'friends'} className="tab-pane fit">
          <FriendsView active={tab === 'friends' && !showSettings} />
        </div>
        {tab === 'profile' && <ProfileView active={!showSettings} />}
        {tab === 'learn' && <LearnView />}
      </main>

      {showSettings && <SettingsDrawer settings={settings} save={save} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function AccountMenu({ user, onProfile, onLogout }: { user: { username: string } | null; onProfile: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) {
    return <button className="icon-btn" onClick={onProfile} title="Log in or create an account">Log in</button>;
  }

  return (
    <div className="account-menu" ref={root}>
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} title="Account options">
        {user.username} <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="burger-menu" role="menu">
          <button role="menuitem" onClick={() => { onProfile(); setOpen(false); }}>Profile</button>
          <button role="menuitem" onClick={() => { onLogout(); setOpen(false); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

function BurgerMenu({ tab, onSelect, onTour }: { tab: Tab; onSelect: (t: Tab) => void; onTour?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = MENU_TABS.find((t) => t.id === tab);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="burger" ref={root}>
      <button
        className={`burger-btn${current ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-tour="more-menu"
        title="More sections"
      >
        <span className="burger-icon" aria-hidden="true">☰</span>
        {current ? current.label : 'More'}
      </button>
      {open && (
        <div className="burger-menu" role="menu">
          {MENU_TABS.map((t) => (
            <button key={t.id} role="menuitem" aria-current={tab === t.id} onClick={() => pick(() => onSelect(t.id))}>
              {t.label}
            </button>
          ))}
          {onTour && (
            <>
              <hr />
              <button role="menuitem" onClick={() => pick(onTour)} title="Replay the tutorial for this screen">
                Replay tour
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
