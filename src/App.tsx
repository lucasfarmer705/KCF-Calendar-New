import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db,
  subscribeToPublishedEvents, 
  subscribeToAllEventsForAdmin, 
  createEvent, 
  updateEvent, 
  deleteEvent, 
  signInWithGooglePopup,
  setupAdminProfileIfRequired,
  handleFirestoreError,
  OperationType
} from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  Users, 
  Printer, 
  Moon, 
  Sun, 
  LogOut, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  Share2, 
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Trash2,
  Lock,
  Globe,
  Copy,
  FolderPlus,
  ArrowRight,
  LayoutDashboard,
  RefreshCw,
  Search
} from 'lucide-react';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
const CHURCH_LOGO_URL = "https://images.unsplash.com/photo-1438217314312-d6d7506c8b9d?auto=format&fit=crop&w=120&h=120&q=80"; // Premium church graphic as fallback placeholder

function ChurchLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={`${className} select-none rounded-full shadow-xs shrink-0`} 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="50" fill="#203656" />
      <path d="M17.5 69 H82.5" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M43.5 69 V61 A6.5 6.5 0 0 1 56.5 61 V69" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 68.5 L50 48.5 L76 68.5" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 57 V45 L50 32.5 L63 45 V57" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 32.5 V17.5 M45 23.5 H55" stroke="white" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  // Routes & Themes
  const [hash, setHash] = useState(window.location.hash || '#/');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('kcf_theme') as 'light' | 'dark') || 'light';
  });

  // Auth States
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [authReady, setAuthReady] = useState<boolean>(false);

  // Live Sync States
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [invites, setInvites] = useState<any[]>([]);

  // Toast System
  const [toasts, setToasts] = useState<any[]>([]);

  // UI States
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(2026); // Set default to 2026 calendar as requested by the original application
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Trigger Routing changes
  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Theme Syncing
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('kcf_theme', theme);
  }, [theme]);

  // Auth Syncing with Firestore Admin setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const adminStatus = await setupAdminProfileIfRequired(currentUser);
        setIsAdmin(adminStatus);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  // Live Subscriptions based on Auth Status
  useEffect(() => {
    setEventsLoading(true);
    let unsubscribeEvents: () => void;

    if (isAdmin) {
      // Admin: subscribe to ALL events (including unpublished drafts)
      unsubscribeEvents = subscribeToAllEventsForAdmin((allEvents) => {
        setEvents(allEvents);
        setEventsLoading(false);
      });
    } else {
      // Public / Non-admin: subscribe to only published == true events
      unsubscribeEvents = subscribeToPublishedEvents((publishedEvents) => {
        setEvents(publishedEvents);
        setEventsLoading(false);
      });
    }

    return () => {
      if (unsubscribeEvents) unsubscribeEvents();
    };
  }, [isAdmin]);

  // Live Subscription to active Invite URLs for Admin Dashboards
  useEffect(() => {
    if (!isAdmin) {
      setInvites([]);
      return;
    }

    const invitesCol = collection(db, 'invites');
    const unsubscribe = onSnapshot(invitesCol, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setInvites(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invites');
    });

    return unsubscribe;
  }, [isAdmin]);

  // Toast trigger helper
  const addToast = (title: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, title, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  if (!authReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-500 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-600 dark:text-zinc-400">Loading KCF Calendar...</p>
        </div>
      </div>
    );
  }

  // Route Dispatcher
  if (hash.startsWith('#/invite/')) {
    const token = hash.replace('#/invite/', '');
    return <AcceptInviteView token={token} onAccept={(role) => {
      addToast("Invite accepted!", "success");
      window.location.hash = "#/dashboard";
    }} />;
  }

  if (hash === '#/dashboard' || hash === '#/admin-calendar') {
    if (!isAdmin) {
      return <LoginScreen onLoginSuccess={() => { window.location.hash = "#/dashboard"; }} addToast={addToast} />;
    }
    return (
      <AdminInteractiveView 
        user={user}
        events={events}
        invites={invites}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        theme={theme}
        setTheme={setTheme}
        addToast={addToast}
        logout={() => signOut(auth)}
        toasts={toasts}
      />
    );
  }

  if (hash === '#/admin-controls' || hash === '#/admin-users') {
    if (!isAdmin) {
      return <LoginScreen onLoginSuccess={() => { window.location.hash = hash; }} addToast={addToast} />;
    }
    return (
      <AdminDashboardView 
        user={user}
        events={events}
        invites={invites}
        initialTab={hash === '#/admin-users' ? 'invites' : 'events'}
        addToast={addToast}
        logout={() => signOut(auth)}
        theme={theme}
        setTheme={setTheme}
        toasts={toasts}
      />
    );
  }

  // Default / Root View: Always render PublicCalendarView (for both visitors & admins)
  return (
    <PublicCalendarView 
      events={events}
      theme={theme}
      setTheme={setTheme}
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      selectedYear={selectedYear}
      setSelectedYear={setSelectedYear}
      addToast={addToast}
      toasts={toasts}
      user={user}
      isAdmin={isAdmin}
    />
  );
}

// ── SUB-COMPONENT: Custom Toast List component ──
function ToastNotificationArea({ toasts }: { toasts: any[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div 
          key={toast.id} 
          className={`flex items-center gap-3 rounded-lg p-4 shadow-xl border animate-in slide-in-from-bottom duration-300 ${
            toast.type === 'error' 
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-900 dark:text-red-200' 
              : 'bg-white border-slate-100 text-slate-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-5 w-5 text-red-500" />
          ) : (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          )}
          <span className="text-sm font-medium">{toast.title}</span>
        </div>
      ))}
    </div>
  );
}

// ── SUB-COMPONENT: Print View component ──
function PrintMonthLayout({ month, year, events }: { month: number, year: number, events: any[] }) {
  const startDayOfWeek = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const calendarCells = [...Array(startDayOfWeek).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null);
  }

  const eventsByDate: Record<string, any[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) {
      eventsByDate[e.date] = [];
    }
    eventsByDate[e.date].push(e);
  });

  return (
    <div className="print-view-root">
      <div className="print-page">
        <div className="print-header">
          <ChurchLogo className="print-logo" />
          <div className="print-title-block">
            <h1 className="print-month-name">{MONTH_NAMES[month]}</h1>
            <p className="print-year">{year} Calendar</p>
          </div>
          <div className="print-header-spacer"></div>
        </div>
        <div className="print-dow-row">
          {DAY_NAMES.map(day => (
            <div key={day} className="print-dow-cell">{day}</div>
          ))}
        </div>
        <div className="print-grid">
          {calendarCells.map((dayNum, idx) => {
            const dateStr = dayNum ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : '';
            const dayEvents = dayNum ? eventsByDate[dateStr] || [] : [];
            const isToday = dayNum ? (new Date().getDate() === dayNum && new Date().getMonth() === month && new Date().getFullYear() === year) : false;

            return (
              <div 
                key={idx} 
                className={`print-day-cell ${!dayNum ? 'print-day-empty' : ''} ${isToday ? 'print-day-today' : ''}`}
              >
                {dayNum && (
                  <>
                    <div className="print-day-number">
                      <span className={isToday ? "print-day-number-today" : ""}>{dayNum}</span>
                    </div>
                    <div className="print-events-list">
                      {dayEvents.map(ev => {
                        const colors: Record<string, string> = {
                          blue: 'bg-blue-100 text-blue-800 border-blue-200',
                          teal: 'bg-teal-100 text-teal-800 border-teal-200',
                          green: 'bg-green-100 text-green-800 border-green-200',
                          amber: 'bg-amber-100 text-amber-800 border-amber-200',
                          rose: 'bg-rose-100 text-rose-800 border-rose-200',
                          purple: 'bg-purple-100 text-purple-800 border-purple-200',
                        };
                        return (
                          <div key={ev.id} className={`print-event-chip ${colors[ev.color || 'blue']}`}>
                            {ev.startTime && <span className="print-event-time">{formatTime(ev.startTime)}</span>}
                            <span className="print-event-title">{ev.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: Login Screen ──
function LoginScreen({ onLoginSuccess, addToast }: { onLoginSuccess: () => void, addToast: any }) {
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const loggedUser = await signInWithGooglePopup();
      if (loggedUser) {
        addToast(`Welcome ${loggedUser.displayName || loggedUser.email}!`, 'success');
        onLoginSuccess();
      }
    } catch (e: any) {
      addToast(e.message || "Sign in failed.", 'error');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 transition-colors">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-4 text-center">
          <ChurchLogo className="h-16 w-16" />
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-50">KCF Calendar Portal</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Sign in with your Google account to access your calendar dashboard</p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <button 
            onClick={handleSignIn}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            {signingIn ? "Signing In..." : "Continue with Google"}
          </button>

          <button 
            onClick={() => { window.location.hash = "#/public"; }}
            className="flex w-full items-center justify-center font-medium text-sm text-slate-500 hover:text-slate-700 transition"
          >
            Go to Public Calendar View →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: Accept Invite Screen ──
function AcceptInviteView({ token, onAccept }: { token: string, onAccept: (role: string) => void }) {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleAccept = async () => {
      // Validate invite doc in firestore
      try {
        const inviteRef = doc(db, 'invites', token);
        // We write usedAt and relate it to current auth user.
        await updateDoc(inviteRef, {
          usedAt: serverTimestamp(),
          usedBy: auth.currentUser?.uid || 'anon'
        });

        // Add user uid to admins collection to persist authorization check
        if (auth.currentUser) {
          const adminDocRef = doc(db, 'admins', auth.currentUser.uid);
          await setDoc(adminDocRef, {
            email: auth.currentUser.email,
            invitedBy: token,
            assignedAt: serverTimestamp()
          });
        }
        setState('success');
      } catch (err: any) {
        setErrorMsg(err.message || 'Verification of invite link failed.');
        setState('error');
      }
    };

    handleAccept();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 p-8 rounded-2xl border dark:border-zinc-800 shadow-xl text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50 mb-4">Accepting Dashboard Invite</h1>
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-500 border-t-transparent"></div>
            <p className="text-sm text-slate-500">Verifying invite link...</p>
          </div>
        )}
        {state === 'error' && (
          <div>
            <p className="text-sm text-red-500 mb-6">{errorMsg || "The invite link is invalid or already consumed."}</p>
            <button onClick={() => { window.location.hash = "#/"; }} className="px-5 py-2.5 bg-slate-900 text-white rounded-lg text-sm select-none hover:bg-slate-800">
              Back to Portal
            </button>
          </div>
        )}
        {state === 'success' && (
          <div>
            <p className="text-sm text-emerald-600 font-medium mb-6">Success! You are now designated as an authorized editor/administrator.</p>
            <button onClick={() => onAccept('admin')} className="px-5 py-2.5 bg-[#0091ff] text-white font-semibold rounded-lg text-sm select-none hover:bg-[#007ee6] transition-colors duration-200 shadow-[0_2px_8px_rgba(0,145,255,0.22)] hover:shadow-[0_4px_12px_rgba(0,145,255,0.32)]">
              Access Calendar Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: Public Event Details drawer modal ──
function PublicEventDetailModal({ event, onClose }: { event: any, onClose: () => void }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50/50 text-blue-900 dark:bg-blue-950/20 dark:text-blue-100',
    teal: 'border-teal-500 bg-teal-50/50 text-teal-900 dark:bg-teal-950/20 dark:text-teal-100',
    green: 'border-green-500 bg-green-50/50 text-green-900 dark:bg-green-950/20 dark:text-green-100',
    amber: 'border-amber-500 bg-amber-50/50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100',
    rose: 'border-rose-500 bg-rose-50/50 text-rose-900 dark:bg-rose-950/20 dark:text-rose-100',
    purple: 'border-purple-500 bg-purple-50/50 text-purple-900 dark:bg-purple-950/20 dark:text-purple-100',
  };

  const badgeColor = colors[event.color || 'blue'] || colors.blue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="px-5 py-4 border-b dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-900/50">
          <div>
            <span className="text-3xs font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              {event.type || 'Event'}
            </span>
            <p className="text-xs text-slate-500 mt-1">{event.date}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-200 dark:bg-zinc-800 text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-slate-950 dark:text-zinc-50 leading-snug">{event.title}</h3>
            {event.startTime && (
              <p className="text-xs font-semibold text-[#0091ff] dark:text-sky-400 flex items-center gap-1.5 mt-1">
                📅 &nbsp;{formatTime(event.startTime)} {event.endTime ? `to ${formatTime(event.endTime)}` : ''}
              </p>
            )}
          </div>

          {(event.description || event.notes) && (
            <div className={`p-3.5 rounded-xl border-l-4 text-xs ${badgeColor}`}>
              <p className="whitespace-pre-line leading-relaxed">{event.description || event.notes}</p>
            </div>
          )}

          {event.location && (
            <div className="text-3xs text-slate-500 dark:text-zinc-400 flex items-center gap-1 mt-1 font-mono">
              📍 &nbsp;SITE: <span className="font-semibold">{event.location}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/30 flex justify-end">
          <button onClick={onClose} className="px-3.5 py-1.5 bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-bold rounded-lg hover:opacity-90">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: Public Calendar View ──
function PublicCalendarView({ 
  events, 
  theme, 
  setTheme, 
  selectedMonth, 
  setSelectedMonth, 
  selectedYear, 
  setSelectedYear,
  addToast,
  toasts,
  user,
  isAdmin
}: any) {
  const [activeDetail, setActiveDetail] = useState<any>(null);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  // Close the year dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setYearDropdownOpen(false);
      }
    }
    if (yearDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [yearDropdownOpen]);

  const startDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay();
  const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const calendarCells = [...Array(startDayOfWeek).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null);
  }

  const eventsByDate: Record<string, any[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) {
      eventsByDate[e.date] = [];
    }
    eventsByDate[e.date].push(e);
  });

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--color-bg))", color: "hsl(var(--color-text))" }}>
      {/* HEADER SECTION */}
      <header style={{ background: "hsl(var(--color-surface))", borderBottom: "1px solid hsl(var(--color-border))", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1rem" }}>
          <div className="pub-header-inner">
            <div className="pub-logo-title">
              <ChurchLogo className="h-9 w-9 shadow-xs shrink-0" />
              <span className="pub-title-text">{selectedYear} Calendar</span>
              <span className="pub-badge" style={{ marginLeft: "0.5rem" }}>View only</span>
            </div>
            <div className="pub-controls" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              
              {/* Print Button */}
              <button 
                onClick={() => window.print()} 
                aria-label="Print this month" 
                title="Print this month" 
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0 0.75rem", height: 34, borderRadius: "var(--radius)", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-surface-offset, var(--color-surface)))", color: "hsl(var(--color-text-muted))", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
              >
                <Printer className="h-4 w-4 text-slate-400 dark:text-zinc-400" />
                <span className="pub-print-label">Print</span>
              </button>

              {/* Theme Toggle Button */}
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                aria-label="Toggle dark mode" 
                style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-surface-offset, var(--color-surface)))", color: "hsl(var(--color-text-muted))", cursor: "pointer", flexShrink: 0 }}
                className="flex items-center justify-center"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Original Admin Login or Dashboard Access Point */}
              {user && isAdmin ? (
                <button 
                  onClick={() => { window.location.hash = "#/dashboard"; }}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0 0.75rem", height: 34, borderRadius: "var(--radius)", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-primary))", color: "hsl(var(--color-text-inverse))", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                >
                  <Lock className="h-3.5 w-3.5" /> Dashboard
                </button>
              ) : (
                <button 
                  onClick={async () => {
                    try {
                      const loggedUser = await signInWithGooglePopup();
                      if (loggedUser) {
                        addToast(`Signed in successfully as ${loggedUser.displayName || loggedUser.email}!`, 'success');
                        const adminStatus = await setupAdminProfileIfRequired(loggedUser);
                        if (adminStatus) {
                          window.location.hash = "#/dashboard";
                        } else {
                          addToast("You are logged in, but your account is not an admin. Contact an administrator for invite routing.", 'info');
                        }
                      }
                    } catch (err: any) {
                      addToast(err.message || "Google Authentication failed.", 'error');
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0 0.75rem", height: 34, borderRadius: "var(--radius)", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-surface-offset, var(--color-surface)))", color: "hsl(var(--color-text-muted))", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                >
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span>Admin Login</span>
                </button>
              )}

            </div>
          </div>
        </div>
      </header>

      {/* MAIN BODY AREA */}
      <main className="pub-main">
        {/* MONTH HEADLINE NAVIGATION BLOCK */}
        <div className="pub-month-nav">
          {/* Previous Month */}
          <button 
            onClick={() => setSelectedMonth((m: number) => m === 0 ? 11 : m - 1)}
            disabled={selectedMonth === 0} 
            style={{ width: 38, height: 38, borderRadius: "var(--radius)", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-surface))", color: selectedMonth === 0 ? "hsl(var(--color-text-faint))" : "hsl(var(--color-text))", display: "flex", alignItems: "center", justifyContent: "center", cursor: selectedMonth === 0 ? "not-allowed" : "pointer", boxShadow: "var(--shadow-sm)", flexShrink: 0 }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          {/* Centered Large Title and Interactive Year Dropdown */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.4rem, 5vw, 2.25rem)", fontWeight: 700, color: "hsl(var(--color-text))", lineHeight: 1 }}>
              {MONTH_NAMES[selectedMonth]}
            </h1>
            <div ref={yearDropdownRef} style={{ position: "relative", display: "inline-block" }}>
              <button 
                onClick={() => setYearDropdownOpen(o => !o)} 
                style={{ fontSize: "0.8rem", color: "hsl(var(--color-text-muted))", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: "0.15rem 0.4rem", borderRadius: "var(--radius)", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                onMouseEnter={s => { const e = s.currentTarget; e.style.background = "hsl(var(--color-primary-highlight))", e.style.color = "hsl(var(--color-primary))" }}
                onMouseLeave={s => { const e = s.currentTarget; e.style.background = "none", e.style.color = "hsl(var(--color-text-muted))" }}
              >
                {selectedYear}
                <span style={{ opacity: .7 }} className="text-[10px] ml-1">▼</span>
              </button>
              
              {yearDropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", background: "hsl(var(--color-surface))", border: "1px solid hsl(var(--color-border))", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", zIndex: 60, overflow: "hidden", minWidth: 90 }}>
                  {YEAR_OPTIONS.map(O => (
                    <button 
                      key={O}
                      onClick={() => { setSelectedYear(O); setYearDropdownOpen(false); }} 
                      style={{ display: "block", width: "100%", padding: "0.5rem 1rem", textAlign: "center", fontSize: "0.875rem", fontWeight: O === selectedYear ? 700 : 400, background: O === selectedYear ? "hsl(var(--color-primary))" : "transparent", color: O === selectedYear ? "hsl(var(--color-text-inverse))" : "hsl(var(--color-text))", border: "none", cursor: "pointer" }}
                      onMouseEnter={E => { O !== selectedYear && (E.currentTarget.style.background = "hsl(var(--color-primary-highlight))") }}
                      onMouseLeave={E => { O !== selectedYear && (E.currentTarget.style.background = "transparent") }}
                    >
                      {O}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Next Month */}
          <button 
            onClick={() => setSelectedMonth((m: number) => m === 11 ? 0 : m + 1)}
            disabled={selectedMonth === 11} 
            style={{ width: 38, height: 38, borderRadius: "var(--radius)", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-surface))", color: selectedMonth === 11 ? "hsl(var(--color-text-faint))" : "hsl(var(--color-text))", display: "flex", alignItems: "center", justifyContent: "center", cursor: selectedMonth === 11 ? "not-allowed" : "pointer", boxShadow: "var(--shadow-sm)", flexShrink: 0 }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* HORIZONTAL CAPSULE PILL MONTH LIST */}
        <div className="pub-month-pills">
          {MONTH_NAMES.map((S, E) => (
            <button 
              key={S}
              onClick={() => setSelectedMonth(E)} 
              className="pub-month-pill" 
              style={{ fontWeight: E === selectedMonth ? 600 : 400, borderColor: E === selectedMonth ? "hsl(var(--color-primary))" : "hsl(var(--color-border))", background: E === selectedMonth ? "hsl(var(--color-primary))" : "transparent", color: E === selectedMonth ? "hsl(var(--color-text-inverse))" : "hsl(var(--color-text-muted))" }}
            >
              {S.slice(0, 3)}
            </button>
          ))}
        </div>

        {/* CALENDAR MAIN GRID STRUCTURE */}
        <div style={{ background: "hsl(var(--color-surface))", borderRadius: "var(--radius-lg)", border: "1px solid hsl(var(--color-border))", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          {/* Day Names Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid hsl(var(--color-border))" }}>
            {DAY_NAMES.map(O => (
              <div 
                key={O}
                className="pub-day-header" 
                style={{ color: O === "Sun" || O === "Sat" ? "hsl(var(--color-text-muted))" : "hsl(var(--color-text))", borderRight: O !== "Sat" ? "1px solid hsl(var(--color-divider))" : "none" }}
              >
                {O}
              </div>
            ))}
          </div>
          
          {/* Day Cells grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {calendarCells.map((dayNum, E) => {
              const cellColIndex = E % 7;
              const isWeekend = cellColIndex === 0 || cellColIndex === 6;
              const dateStr = dayNum ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : '';
              const dayEvents = dayNum ? eventsByDate[dateStr] || [] : [];
              const isToday = dayNum ? (new Date().getDate() === dayNum && new Date().getMonth() === selectedMonth && new Date().getFullYear() === selectedYear) : false;
              const isLastRow = E >= calendarCells.length - 7;
              
              return (
                <div 
                  key={E}
                  className="pub-day-cell text-left" 
                  style={{ minWidth: 0, borderRight: (E + 1) % 7 !== 0 ? "1px solid hsl(var(--color-divider))" : "none", borderBottom: isLastRow ? "none" : "1px solid hsl(var(--color-divider))", background: isToday ? "hsl(var(--color-today-bg))" : dayNum ? (isWeekend ? "hsl(var(--color-surface-offset, var(--color-surface)))" : "hsl(var(--color-surface))") : "hsl(var(--color-surface-offset, var(--color-bg)))" }}
                >
                  {dayNum && (
                    <>
                      <div className="pub-day-num" style={{ fontWeight: isToday ? 700 : 400, background: isToday ? "hsl(var(--color-primary))" : "transparent", color: isToday ? "hsl(var(--color-text-inverse))" : isWeekend ? "hsl(var(--color-text-muted))" : "hsl(var(--color-text))" }}>
                        {dayNum}
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                        {dayEvents.slice(0, 3).map(ev => (
                          <button 
                            key={ev.id}
                            onClick={Ct => { Ct.stopPropagation(); setActiveDetail(ev); }} 
                            className="pub-event-row text-left font-medium overflow-hidden" 
                            style={{ display: "block", cursor: "pointer" }}
                          >
                            {ev.recurrence && <span style={{ color: "hsl(var(--color-text-faint))", marginRight: "0.15rem", fontSize: "0.6rem" }}>↻</span>}
                            {ev.title}
                            {ev.startTime && <span style={{ color: "hsl(var(--color-text-muted))", marginLeft: "0.2rem" }}>{formatTime(ev.startTime)}</span>}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <span style={{ fontSize: "0.65rem", color: "hsl(var(--color-text-muted))" }}>
                            +{dayEvents.length - 3} more
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* FOOTER AREA */}
      <footer className="border-t border-slate-205 py-6 text-center text-xs text-slate-400 bg-white dark:bg-zinc-900 dark:border-zinc-800/80">
        <p>© {selectedYear} KCF Community Calendar. Managed dynamically in real-time.</p>
      </footer>

      {/* Pop-up view details modal */}
      {activeDetail && (
        <PublicEventDetailModal event={activeDetail} onClose={() => setActiveDetail(null)} />
      )}

      {/* Embedded print stylesheet layout rendering */}
      <PrintMonthLayout month={selectedMonth} year={selectedYear} events={events} />

      {toasts && <ToastNotificationArea toasts={toasts} />}
    </div>
  );
}

// ── SHAREABLE SUB-COMPONENT: Admin Dashboard Sidebar ──
function AdminSidebar({
  user,
  logout,
  theme,
  setTheme,
  mobileMenuOpen,
  setMobileMenuOpen
}: any) {
  const hash = window.location.hash || '#/';
  
  return (
    <aside className={`fixed inset-y-0 left-0 z-45 w-64 transform bg-[#111d2a] text-slate-400 transition-transform duration-300 lg:translate-x-0 flex flex-col h-screen justify-between p-6 flex-shrink-0 border-r border-[#1e293b]/40 ${
      mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div className="flex flex-col gap-6">
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-1 py-1">
          <ChurchLogo className="h-8 w-8 text-[#0091ff]" />
          <div className="min-w-0">
            <span className="font-display font-semibold text-sm tracking-tight text-white block leading-none">
              Admin Dashboard
            </span>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex flex-col gap-6 mt-2">
          <div>
            <h2 className="text-[10px] tracking-widest uppercase text-slate-500 font-bold mb-3 px-3">
              Navigation
            </h2>
            <div className="flex flex-col gap-1">
              {/* Calendar */}
              <button
                onClick={() => { window.location.hash = "#/dashboard"; setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition duration-200 text-left cursor-pointer ease-in-out ${
                  (hash === "#/dashboard" || hash === "#/admin-calendar")
                    ? 'bg-[#1e293b] text-white shadow-xs border border-[#1e293b]'
                    : 'text-slate-400 hover:text-white hover:bg-[#1e293b]/40'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-white" />
                <span>Calendar</span>
              </button>

              {/* Events */}
              <button
                onClick={() => { window.location.hash = "#/admin-controls"; setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition duration-200 text-left cursor-pointer ease-in-out ${
                  (hash === "#/admin-controls")
                    ? 'bg-[#1e293b] text-white shadow-xs border border-[#1e293b]'
                    : 'text-slate-400 hover:text-white hover:bg-[#1e293b]/40'
                }`}
              >
                <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-white" />
                <span>Events</span>
              </button>

              {/* Print */}
              <button
                onClick={() => window.print()}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium tracking-tight text-slate-400 hover:text-white hover:bg-[#1e293b]/40 transition duration-200 text-left cursor-pointer ease-in-out"
              >
                <Printer className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>Print</span>
              </button>

              {/* Dark Mode */}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium tracking-tight text-slate-400 hover:text-white hover:bg-[#1e293b]/40 transition duration-200 text-left cursor-pointer ease-in-out"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <Moon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <span>Dark Mode</span>
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-[10px] tracking-widest uppercase text-slate-500 font-bold mb-3 px-3">
              Admin
            </h2>
            <div className="flex flex-col gap-1">
              {/* Users */}
              <button
                onClick={() => { window.location.hash = "#/admin-users"; setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium tracking-tight transition duration-200 text-left cursor-pointer ease-in-out ${
                  (hash === "#/admin-users")
                    ? 'bg-[#1e293b] text-white shadow-xs border border-[#1e293b]'
                    : 'text-slate-400 hover:text-white hover:bg-[#1e293b]/40'
                }`}
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-white" />
                <span>Users</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile area & Sign out */}
      <div className="flex flex-col gap-3 pt-5 border-t border-[#1e293b]/45">
        <div className="flex items-center gap-2.5 px-1">
          <div className="h-8 w-8 rounded-full bg-[#1e293b] text-[#0091ff] flex items-center justify-center font-bold text-xs select-none uppercase shadow-inner shrink-0 border border-[#1e293b]/50">
            {user.email ? user.email.slice(0, 1) : 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate leading-none">
              {user.displayName || "Administrator"}
            </p>
            <span className="text-[10px] text-slate-500 font-semibold tracking-wide block mt-1">
              Admin Access
            </span>
          </div>
        </div>
        
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1e293b] bg-transparent hover:bg-[#1e293b]/50 py-2 text-xs font-semibold text-slate-400 hover:text-white transition duration-200 cursor-pointer ease-in-out"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign Out
        </button>
      </div>
    </aside>
  );
}

// ── SUB-COMPONENT: Admin Interactive View ──
function AdminInteractiveView({
  user,
  events,
  invites,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  mobileMenuOpen,
  setMobileMenuOpen,
  theme,
  setTheme,
  addToast,
  logout,
  toasts
}: any) {
  const [activeModal, setActiveModal] = useState<any>(null); // { date, event } or null
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  const startDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay();
  const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const calendarCells = [...Array(startDayOfWeek).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null);
  }

  const eventsByDate: Record<string, any[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) {
      eventsByDate[e.date] = [];
    }
    eventsByDate[e.date].push(e);
  });

  // Close the year dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setYearDropdownOpen(false);
      }
    }
    if (yearDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [yearDropdownOpen]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0b131f] dark:text-slate-200 flex flex-col lg:flex-row transition-colors">
      
      {/* Real-time unified Sidebar */}
      <AdminSidebar
        user={user}
        logout={logout}
        theme={theme}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <header className="border-b border-slate-200 dark:border-slate-800/60 bg-white/95 dark:bg-[#0d1624] text-slate-900 dark:text-white backdrop-blur-md px-8 py-5 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 lg:hidden hover:bg-slate-50 dark:hover:bg-[#111c2a] transition-all duration-200 cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display font-semibold text-lg md:text-xl tracking-tight text-slate-900 dark:text-white leading-none">Admin Dashboard</h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-semibold tracking-tight bg-slate-50 dark:bg-[#162231]/85 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0091ff] animate-pulse" />
              {events.length} Live Events
            </span>
          </div>
        </header>

        <main className="max-w-[1400px] w-full mx-auto p-4 md:p-6 lg:p-8 flex-1 flex flex-col justify-start">
          
          {/* Calendar Header with Navigation on the Sides */}
          <div className="w-full max-w-[1400px] mx-auto mb-8">
            <div className="flex items-center justify-between gap-4">
              <button 
                onClick={() => setSelectedMonth(m => m === 0 ? 11 : m - 1)}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1624] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#111c2a] hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition shadow-2xs"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <h2 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight text-slate-900 dark:text-white select-none leading-none">
                  {MONTH_NAMES[selectedMonth]}
                </h2>

                {/* Interactive Year drop selector */}
                <div ref={yearDropdownRef} className="relative inline-block mt-2">
                  <button 
                    onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition bg-transparent px-2 py-0.5 rounded cursor-pointer select-none"
                  >
                    {selectedYear}
                    <span className="opacity-70 text-[8px] ml-0.5">▼</span>
                  </button>

                  {yearDropdownOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-24 bg-white dark:bg-[#0d1624] border border-slate-200 dark:border-slate-800 shadow-xl rounded-lg py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                      {YEAR_OPTIONS.map(y => (
                        <button
                          key={y}
                          onClick={() => {
                            setSelectedYear(y);
                            setYearDropdownOpen(false);
                          }}
                          className={`w-full text-center px-3 py-1.5 text-xs transition font-semibold block cursor-pointer ${y === selectedYear ? 'bg-slate-100 dark:bg-[#111c2a] text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1c2a3d]/40'}`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={() => setSelectedMonth(m => m === 11 ? 0 : m + 1)}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1624] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#111c2a] hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition shadow-2xs"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Month capsules list switcher */}
            <div className="flex gap-1 overflow-x-auto pb-1 max-w-full scrollbar-none mt-6 justify-center">
              {MONTH_NAMES.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(idx)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition cursor-pointer select-none ${
                    idx === selectedMonth 
                      ? 'bg-[#0091ff] border-transparent text-white font-semibold shadow-sm shadow-[#0091ff]/10' 
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1624] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#111c2a] hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Rounded Grid Card for Calendar */}
          <div className="bg-white dark:bg-[#0d1624] rounded-[20px] border border-slate-200/50 dark:border-slate-800/85 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200/50 dark:border-slate-800/85 bg-white dark:bg-[#0d1624]">
              {DAY_NAMES.map((day, dIdx) => (
                <div 
                  key={day} 
                  className={`py-3.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 ${
                    dIdx % 7 === 6 ? '' : 'border-r border-slate-200/50 dark:border-r-slate-800/85'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 bg-slate-100/5 dark:bg-[#0b131f]">
              {calendarCells.map((dayNum, idx) => {
                const dateStr = dayNum ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : '';
                const dayEvents = dayNum ? eventsByDate[dateStr] || [] : [];
                const isToday = dayNum ? (new Date().getDate() === dayNum && new Date().getMonth() === selectedMonth && new Date().getFullYear() === selectedYear) : false;
                const isWeekend = (idx % 7 === 0) || (idx % 7 === 6);

                return (
                  <div 
                    key={idx} 
                    onClick={() => {
                      if (dayNum) {
                        setActiveModal({ date: dateStr, event: null });
                      }
                    }}
                    className={`min-h-[100px] sm:min-h-[135px] p-2.5 sm:p-3.5 border-b border-slate-200/50 dark:border-b-slate-800/85 transition flex flex-col justify-between cursor-pointer group ${
                      (idx % 7 === 6) ? '' : 'border-r border-slate-200/50 dark:border-r-slate-800/85'
                    } ${
                      !dayNum 
                        ? 'bg-slate-50/70 dark:bg-[#090e16] text-transparent' 
                        : isWeekend 
                          ? 'bg-slate-50/50 dark:bg-[#111c2a]/30 hover:bg-slate-100/30 dark:hover:bg-[#111c2a]/50' 
                          : 'bg-white dark:bg-[#0d1624] hover:bg-slate-50/50 dark:hover:bg-[#111c2a]/60'
                    } ${isToday ? 'bg-sky-50/30 dark:bg-[#0091ff]/10' : ''}`}
                  >
                    {dayNum && (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`inline-flex items-center justify-center rounded-full h-6 w-6 text-2xs sm:text-xs font-semibold leading-none ${
                            isToday ? 'bg-slate-900 text-white dark:bg-[#0091ff]' : 'text-slate-600 dark:text-slate-300'
                          }`}>
                            {dayNum}
                          </span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded bg-slate-100/50 dark:bg-[#111c2a] text-slate-500 dark:text-slate-400 border border-slate-200/30 dark:border-slate-800">
                            <Plus className="h-3 w-3" />
                          </span>
                        </div>
                        <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[65px] sm:max-h-[85px] scrollbar-none pr-0">
                          {dayEvents.map(ev => {
                            const chipClasses: Record<string, string> = {
                              blue: 'chip-blue',
                              teal: 'chip-teal',
                              green: 'chip-green',
                              amber: 'chip-amber',
                              rose: 'chip-rose',
                              purple: 'chip-purple',
                            };
                            return (
                              <div 
                                key={ev.id} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveModal({ date: dateStr, event: ev });
                                }}
                                className={`rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold border overflow-hidden text-ellipsis whitespace-nowrap flex items-center justify-between hover:brightness-95 active:scale-[0.98] transition ${chipClasses[ev.color || 'blue']}`}
                              >
                                <span className="truncate">
                                  {ev.startTime && <span className="opacity-75 mr-1 font-bold">{formatTime(ev.startTime)}</span>}
                                  <span>{ev.title}</span>
                                </span>
                                {!ev.published && <Lock className="h-2.5 w-2.5 opacity-55 shrink-0 ml-1" />}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Form Dialog Modal */}
      {activeModal && (
        <EventEditModal 
          date={activeModal.date}
          event={activeModal.event}
          onClose={() => setActiveModal(null)}
          addToast={addToast}
          allEvents={events}
        />
      )}

      {/* Embedded print stylesheet layout rendering */}
      <PrintMonthLayout month={selectedMonth} year={selectedYear} events={events} />

      <ToastNotificationArea toasts={toasts} />
    </div>
  );
}

// ── RECURRING EVENT DATE GENERATORS ──
function getDayOfNthWeek(year: number, month: number, dayOfWeek: number, weekIndex: number): Date {
  const d = new Date(year, month, 1);
  const actualMonth = d.getMonth();
  let count = 0;
  let lastFound: Date | null = null;
  
  while (d.getMonth() === actualMonth) {
    if (d.getDay() === dayOfWeek) {
      count++;
      lastFound = new Date(d);
      if (count === weekIndex) {
        return d;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return lastFound || new Date(year, month, 1);
}

function getRecurringDates(startDateStr: string, pattern: string, count: number): string[] {
  const dates: string[] = [startDateStr];
  if (count <= 1) return dates;

  const [y, m, d] = startDateStr.split('-').map(Number);
  const baseDate = new Date(y, m - 1, d);
  const dayOfWeek = baseDate.getDay();

  if (pattern === 'weekly') {
    for (let i = 1; i < count; i++) {
      const next = new Date(baseDate);
      next.setDate(baseDate.getDate() + 7 * i);
      dates.push(next.toISOString().substring(0, 10));
    }
  } else if (pattern === 'biweekly') {
    for (let i = 1; i < count; i++) {
      const next = new Date(baseDate);
      next.setDate(baseDate.getDate() + 14 * i);
      dates.push(next.toISOString().substring(0, 10));
    }
  } else if (pattern === 'monthly') {
    for (let i = 1; i < count; i++) {
      const targetMonth = baseDate.getMonth() + i;
      const maxDays = new Date(baseDate.getFullYear(), targetMonth + 1, 0).getDate();
      const targetDay = Math.min(baseDate.getDate(), maxDays);
      const next = new Date(baseDate.getFullYear(), targetMonth, targetDay);
      dates.push(next.toISOString().substring(0, 10));
    }
  } else if (pattern.startsWith('week_')) {
    const weekIndex = parseInt(pattern.split('_')[1], 10);
    for (let i = 1; i < count; i++) {
      const targetMonth = baseDate.getMonth() + i;
      const targetYear = baseDate.getFullYear();
      const next = getDayOfNthWeek(targetYear, targetMonth, dayOfWeek, weekIndex);
      dates.push(next.toISOString().substring(0, 10));
    }
  }

  return dates;
}

// ── SUB-COMPONENT: Live Event Edit / Creation Modal ──
function EventEditModal({ date, event, onClose, addToast, allEvents = [] }: { date: string, event: any, onClose: () => void, addToast: any, allEvents?: any[] }) {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startTime, setStartTime] = useState(event?.startTime || '');
  const [endTime, setEndTime] = useState(event?.endTime || '');
  const [color, setColor] = useState(event?.color || 'blue');
  const [notes, setNotes] = useState(event?.notes || '');
  const [type, setType] = useState<string>(event?.type || 'event');
  const [visibility, setVisibility] = useState<string>(event?.visibility || 'public');

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState('weekly');
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [deleteMode, setDeleteMode] = useState<'prompt' | null>(null);

  const [saving, setSaving] = useState(false);

  // Auto layout date picker
  const [selectedDate, setSelectedDate] = useState(event?.date || date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast("Title is required", "error");
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description || notes || '',
      startTime: startTime || null,
      endTime: endTime || null,
      color,
      notes: notes || description || '',
      type,
      visibility,
      date: selectedDate
    };

    try {
      if (event) {
        await updateEvent(event.id, payload);
        addToast("Event updated successfully!");
      } else {
        if (isRecurring) {
          const recurrenceGroupId = 'rec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const recurringDates = getRecurringDates(selectedDate, recurrencePattern, recurrenceCount);
          
          for (const dStr of recurringDates) {
            const singlePayload = {
              ...payload,
              date: dStr,
              recurrenceGroupId,
              recurringPattern: recurrencePattern,
            };
            await createEvent(singlePayload);
          }
          addToast(`Created ${recurringDates.length} recurring events successfully!`);
        } else {
          await createEvent(payload);
          addToast("New event created successfully!");
        }
      }
      onClose();
    } catch (e: any) {
      addToast(e.message || "Failed to commit operation", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSingle = async () => {
    if (!event) return;
    setSaving(true);
    try {
      await deleteEvent(event.id);
      addToast("Event deleted successfully!");
      onClose();
    } catch (e: any) {
      addToast(e.message || "Deletions failed", "error");
    } finally {
      setSaving(false);
      setDeleteMode(null);
    }
  };

  const handleDeleteSeries = async () => {
    if (!event || !event.recurrenceGroupId) return;
    setSaving(true);
    try {
      const seriesEvents = allEvents.filter((e: any) => e.recurrenceGroupId === event.recurrenceGroupId);
      for (const seriesEv of seriesEvents) {
        await deleteEvent(seriesEv.id);
      }
      addToast(`All ${seriesEvents.length} events in this series deleted successfully!`);
      onClose();
    } catch (e: any) {
      addToast(e.message || "Failed to delete series", "error");
    } finally {
      setSaving(false);
      setDeleteMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="px-6 py-4 border-b dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-900/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">{event ? "Edit Calendar Item" : "Create Calendar Item"}</h3>
            <p className="text-xs text-slate-500 mt-1">{date}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-200 dark:bg-zinc-800 text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Calendar type toggler */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-zinc-850 rounded-lg">
            <button 
              type="button" 
              onClick={() => setType('event')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${type === 'event' ? 'bg-white shadow dark:bg-zinc-800 text-slate-900 dark:text-zinc-50' : 'text-slate-500'}`}
            >
              Event
            </button>
            <button 
              type="button" 
              onClick={() => setType('birthday')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${type === 'birthday' ? 'bg-white shadow dark:bg-zinc-800 text-slate-900 dark:text-zinc-50' : 'text-slate-500'}`}
            >
              Birthday
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Date</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-sm"
              required 
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">{type === 'birthday' ? "Person's Name" : "Event Title"}</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={type === 'birthday' ? "Sarah" : "Congregational Gathering..."}
              className="w-full px-4 py-2.5 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-sm font-semibold"
              required 
            />
          </div>

          {type !== 'birthday' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Start Time</label>
                <input 
                  type="time" 
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">End Time</label>
                <input 
                  type="time" 
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-sm"
                />
              </div>
            </div>
          )}

          {/* Recurrence Options (Only when creating a new event) */}
          {!event && (
            <div className="border border-slate-100 dark:border-zinc-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-zinc-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={isRecurring}
                    onChange={e => setIsRecurring(e.target.checked)}
                    className="h-4 w-4 text-[#0091ff] focus:ring-[#0091ff] border-zinc-300 dark:border-zinc-700 rounded cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5"><RefreshCw className={`h-3 w-3 ${isRecurring ? 'animate-spin duration-1000' : ''}`} /> Make Recurring Event</span>
                </label>
              </div>

              {isRecurring && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/50 dark:border-zinc-800/60 animate-in fade-in duration-150">
                  <div className="flex flex-col gap-1">
                    <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Frequency</label>
                    <select 
                      value={recurrencePattern}
                      onChange={e => setRecurrencePattern(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-xs font-semibold"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Once a month</option>
                      <option value="week_1">Every first week of the month</option>
                      <option value="week_2">Every second week of the month</option>
                      <option value="week_3">Every third week of the month</option>
                      <option value="week_4">Every fourth week of the month</option>
                      <option value="week_5">Every fifth week of the month</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Repeat Count</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min={2}
                        max={52}
                        value={recurrenceCount}
                        onChange={e => setRecurrenceCount(Math.max(2, Math.min(52, parseInt(e.target.value) || 2)))}
                        className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-xs font-semibold text-center"
                      />
                      <span className="text-2xs text-slate-400 font-bold whitespace-nowrap">times</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Color Category</label>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {Object.keys($d).map(kColor => (
                <button
                  type="button"
                  key={kColor}
                  onClick={() => setColor(kColor)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    color === kColor ? 'border-[#0091ff] scale-110 shadow' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: $d[kColor as keyof typeof $d].border }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Visibility</label>
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-zinc-850 rounded-lg">
              <button 
                type="button"
                onClick={() => setVisibility('public')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
                  visibility === 'public' ? 'bg-white shadow dark:bg-zinc-800 text-slate-900 dark:text-zinc-50' : 'text-slate-500'
                }`}
              >
                <Globe className="h-3.5 w-3.5" /> Public
              </button>
              <button 
                type="button"
                onClick={() => setVisibility('private')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 ${
                  visibility === 'private' ? 'bg-white shadow dark:bg-zinc-800 text-slate-900 dark:text-zinc-50' : 'text-slate-500'
                }`}
              >
                <Lock className="h-3.5 w-3.5" /> Private
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-2xs font-bold uppercase tracking-wider text-slate-500">Event Notes</label>
            <textarea 
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Provide notes or coordinates..."
              className="w-full px-4 py-2 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-sm resize-none"
            />
          </div>

          <div className="pt-4 border-t dark:border-zinc-800 flex flex-col gap-3">
            {event && event.recurrenceGroupId && deleteMode === 'prompt' ? (
              <div className="w-full bg-slate-50 dark:bg-zinc-950/30 p-4 rounded-xl border border-slate-200 dark:border-zinc-850 text-center space-y-3">
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  This is a recurring event. How would you like to delete?
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteSingle}
                    disabled={saving}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition cursor-pointer"
                  >
                    Only This Event
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSeries}
                    disabled={saving}
                    className="px-3 py-1.5 bg-red-800 hover:bg-red-900 text-white text-xs font-semibold rounded-md transition cursor-pointer"
                  >
                    The Entire Series ({allEvents.filter((e: any) => e.recurrenceGroupId === event.recurrenceGroupId).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteMode(null)}
                    className="px-3 py-1.5 border dark:border-zinc-800 text-xs font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between gap-3 items-center w-full">
                {event && (
                  <button
                    type="button"
                    onClick={() => {
                      if (event.recurrenceGroupId) {
                        setDeleteMode('prompt');
                      } else {
                        handleDeleteSingle();
                      }
                    }}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 dark:border-red-900/30 dark:hover:bg-red-950/20 text-xs font-semibold cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Item
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg border dark:border-zinc-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-lg bg-[#0091ff] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(0,145,255,0.22)] hover:bg-[#007ee6] active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : event ? "Save Changes" : "Create Item"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: Admin Dashboard View (Full Admin Operations) ──
function AdminDashboardView({
  user,
  events,
  invites,
  initialTab = 'events',
  addToast,
  logout,
  theme,
  setTheme,
  toasts
}: any) {
  const [activeTab, setActiveTab] = useState<'events' | 'invites'>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [csvPreview, setCsvPreview] = useState<any[] | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  const [activeModal, setActiveModal] = useState<any>(null); // { date, event } or null
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Invite generation mutations
  const handleCreateInviteLink = async () => {
    try {
      const inviteToken = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await setDoc(doc(db, 'invites', inviteToken), {
        token: inviteToken,
        createdAt: serverTimestamp(),
        usedAt: null,
        usedBy: null,
      });
      addToast("New single-use editor invite created!");
    } catch (e: any) {
      addToast(e.message || "Failed to generate invite.", 'error');
    }
  };

  const handleDeleteInvite = async (docId: string) => {
    try {
      await deleteDoc(doc(db, 'invites', docId));
      addToast("Invite consumed/deleted successfully.");
    } catch (e: any) {
      addToast(e.message || "Delete failed.", 'error');
    }
  };

  // Bulk CSV parser
  const handleCsvFilePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const rows = parseCsvText(text);
        if (rows.length === 0) {
          addToast("The CSV contains no records or invalid headers", "error");
          return;
        }
        setCsvPreview(rows);
      } catch (err) {
        addToast("Error parsing CSV. Please check formatting.", "error");
      }
    };
    fileReader.readAsText(file);
  };

  const triggerBulkImport = async () => {
    if (!csvPreview || csvPreview.length === 0) return;
    setLoadingImport(true);
    let count = 0;
    try {
      for (const row of csvPreview) {
        await createEvent({
          date: row.date,
          title: row.title,
          notes: row.notes || row.description || '',
          startTime: row.startTime,
          endTime: row.endTime,
          type: row.type || 'event',
          color: row.color || 'blue',
          visibility: row.visibility || 'public'
        });
        count++;
      }
      addToast(`Imported ${count} items into Firestore!`, "success");
      setCsvPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      addToast(`Partially imported (${count} items). Error: ${e.message}`, "error");
    } finally {
      setLoadingImport(false);
    }
  };

  const getInviteUrlString = (token: string) => {
    return `${window.location.origin}/#/invite/${token}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0b131f] dark:text-slate-200 flex flex-col lg:flex-row transition-colors">
      
      {/* Real-time unified Sidebar */}
      <AdminSidebar
        user={user}
        logout={logout}
        theme={theme}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <header className="border-b border-slate-200 dark:border-slate-800/60 bg-white/95 dark:bg-[#0d1624] text-slate-900 dark:text-white backdrop-blur-md px-8 py-5 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 lg:hidden hover:bg-slate-50 dark:hover:bg-[#111c2a] transition-all duration-200 cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display font-semibold text-lg md:text-xl tracking-tight text-slate-900 dark:text-white leading-none">Admin Dashboard</h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-semibold tracking-tight bg-slate-50 dark:bg-[#162231]/85 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0091ff] animate-pulse" />
              {events.length} Live Events
            </span>
          </div>
        </header>



        <main className="max-w-6xl mx-auto w-full p-4 md:p-6 flex-1">
        {activeTab === 'events' ? (
          <div className="space-y-6">
            {/* Filter controls + CSV */}
            <div className="bg-white dark:bg-[#0d1624] p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/60 flex flex-col md:flex-row gap-4 items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.02)]">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-450 dark:text-slate-500 pointer-events-none transition-colors duration-200" />
                <input 
                  type="text" 
                  placeholder="Search events, names, dates..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 h-11 border rounded-xl bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-[#162231] focus:border-[#0091ff]/80 focus:ring-4 focus:ring-[#0091ff]/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                />
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleCsvFilePickerChange}
                />
                <button 
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setActiveModal({ date: todayStr, event: null });
                  }}
                  className="h-11 px-5 flex items-center justify-center gap-1.5 rounded-xl bg-[#0091ff] text-white hover:bg-[#007ee6] text-xs font-semibold tracking-tight shadow-[0_2px_8px_rgba(0,145,255,0.22)] hover:shadow-[0_4px_12px_rgba(0,145,255,0.32)] transition-all duration-200 active:scale-[0.98] cursor-pointer ease-in-out"
                >
                  <Plus className="h-4 w-4" /> Create Event
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 px-5 flex items-center justify-center gap-2 rounded-xl bg-slate-50 dark:bg-[#111c2a] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-[#1c2a3d] hover:text-slate-900 dark:hover:text-white text-xs font-semibold tracking-tight transition-all duration-200 active:scale-[0.98] cursor-pointer ease-in-out shadow-2xs"
                >
                  <FileSpreadsheet className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Import CSV
                </button>
              </div>
            </div>

            {/* CSV Parser Preview Modal */}
            {csvPreview && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom">
                  <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-900/50 border-b dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-extrabold text-slate-900 dark:text-zinc-50 text-sm">Bulk CSV Import Preview</h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-50 text-[#0091ff] dark:bg-sky-950/40 dark:text-sky-400 font-bold">{csvPreview.length} items parsed</span>
                  </div>
                  <div className="p-6 max-h-[50vh] overflow-y-auto space-y-4">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b dark:border-zinc-800">
                          <th className="py-2 font-bold text-slate-500">Date</th>
                          <th className="py-2 font-bold text-slate-500">Title</th>
                          <th className="py-2 font-bold text-slate-500">Time</th>
                          <th className="py-2 font-bold text-slate-500">Type</th>
                          <th className="py-2 font-bold text-slate-500">Visibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((item, index) => (
                          <tr key={index} className="border-b dark:border-zinc-800/50 last:border-0">
                            <td className="py-2 font-semibold">{item.date}</td>
                            <td className="py-2 truncate max-w-[150px]">{item.title}</td>
                            <td className="py-2 text-slate-500">{item.startTime ? formatTime(item.startTime) : 'All Day'}</td>
                            <td className="py-2 uppercase font-bold text-2xs tracking-wider">{item.type}</td>
                            <td className="py-2 uppercase font-bold text-2xs tracking-wider text-slate-400">{item.visibility || 'Public'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-4 border-t dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex justify-end gap-2">
                    <button 
                      onClick={() => setCsvPreview(null)} 
                      className="px-4 py-2 border dark:border-zinc-800 rounded-lg text-xs font-semibold"
                    >
                      Dismiss
                    </button>
                    <button 
                      onClick={triggerBulkImport} 
                      disabled={loadingImport}
                      className="px-5 py-2 rounded-lg bg-[#0091ff] text-white font-semibold text-xs shadow-[0_2px_8px_rgba(0,145,255,0.22)] hover:bg-[#007ee6] disabled:opacity-50"
                    >
                      {loadingImport ? "Processing..." : "Confirm & Import to Firestore"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* List Table of Firestore Items */}
            <div className="bg-white dark:bg-[#0d1624] rounded-2xl border border-slate-200/50 dark:border-slate-800/60 overflow-hidden shadow-[0_4px_20px_rgba(15,23,42,0.02)]">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#111c2a] text-slate-450 dark:text-slate-500 font-semibold uppercase tracking-widest text-[10px] sticky top-0 backdrop-blur-md">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Title</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Color</th>
                      <th className="px-6 py-4">Visibility</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events
                      .filter(ev => ev.title.toLowerCase().includes(search.toLowerCase()) || ev.date.includes(search))
                      .map(ev => (
                        <tr key={ev.id} className="border-b border-slate-100/50 dark:border-slate-800 hover:bg-slate-50/30 dark:hover:bg-[#111c2a]/40 transition-all duration-200">
                          <td className="px-6 py-5 font-semibold text-xs text-slate-700 dark:text-slate-300">{ev.date}</td>
                          <td className="px-6 py-5 max-w-[220px] truncate">
                            <span className="font-semibold text-xs text-slate-900 dark:text-white block truncate">{ev.title}</span>
                            {ev.startTime && (
                              <span className="text-[10px] text-slate-450 dark:text-slate-500 font-medium block mt-0.5">
                                {formatTime(ev.startTime)}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium text-[10px] border tracking-tight transition-colors ${
                              ev.type === 'birthday' 
                                ? 'bg-pink-50/30 dark:bg-pink-950/20 border-pink-100 dark:border-pink-900/55 text-pink-600 dark:text-pink-400' 
                                : 'bg-sky-50/30 dark:bg-[#162231]/85 border-sky-100 dark:border-slate-700 text-[#0091ff]'
                            }`}>
                              <span className={`h-1 w-1 rounded-full ${ev.type === 'birthday' ? 'bg-pink-500' : 'bg-[#0091ff]'}`} />
                              {ev.type === 'birthday' ? 'Birthday' : 'Event'}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center justify-start">
                              <span className={`inline-block h-3.5 w-3.5 rounded-full dot-${ev.color || 'blue'} shadow-[0_0_0_2px_rgba(255,255,255,1)] dark:shadow-[0_0_0_2px_#0d1624] ring-1 ring-slate-200 dark:ring-slate-800`} />
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 capitalize">
                              {(ev.published !== false && ev.visibility !== 'private') ? <Globe className="h-3.5 w-3.5 text-slate-400/80 dark:text-slate-500" /> : <Lock className="h-3.5 w-3.5 text-slate-400/80 dark:text-slate-500" />}
                              <span>{ev.visibility || (ev.published !== false ? 'public' : 'private')}</span>
                            </span>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => {
                                  setActiveModal({ date: ev.date, event: ev });
                                }}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-slate-50 dark:bg-[#111c2a] hover:bg-slate-100 dark:hover:bg-[#1c2a3d] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/50 dark:border-slate-800 transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={async () => {
                                  if (window.confirm(`Delete "${ev.title}"?`)) {
                                    try {
                                      await deleteEvent(ev.id);
                                      addToast("Successfully deleted from Firestore.");
                                    } catch (err: any) {
                                      addToast("Error during deletion: " + err.message, "error");
                                    }
                                  }
                                }}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-100 dark:border-red-900/40 transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#0d1624] p-6 rounded-xl border border-slate-200 dark:border-slate-800/60 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Active Single-Use Editor Invites</h3>
                <button 
                  onClick={handleCreateInviteLink}
                  className="px-4 py-2 bg-[#0091ff] hover:bg-[#007ee6] text-white font-semibold text-xs rounded-lg shadow-[0_2px_8px_rgba(0,145,255,0.22)] active:scale-[0.98] transition select-none"
                >
                  Create invite link
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Generate links to dispatch to community editors. Once accepted, they can add and edit listings dynamically. Links automatically self-delete upon consumption.</p>
            </div>

            <div className="space-y-3">
              {invites.map(invite => {
                const inviteUrl = getInviteUrlString(invite.token);
                return (
                  <div key={invite.id} className="bg-white dark:bg-[#0d1624] rounded-lg border border-slate-200 dark:border-slate-800/80 p-4 flex items-center justify-between gap-4 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <code className="text-slate-600 dark:text-slate-300 text-xs font-semibold block truncate bg-slate-50 dark:bg-[#111c2a] p-2 rounded border border-slate-200/60 dark:border-slate-800">
                        {inviteUrl}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(inviteUrl);
                          addToast("Invite URL copied to clipboard!");
                        }}
                        className="p-2 border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-[#111c2a] hover:bg-slate-50 dark:hover:bg-[#1c2a3d] text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="Copy to clipboard"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteInvite(invite.id)}
                        className="p-2 border border-red-200 dark:border-red-900/40 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 rounded transition cursor-pointer"
                        title="Delete Invite"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {invites.length === 0 && (
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 italic py-6">No pending invite links available in database.</p>
              )}
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Toast Render portal */}
      <ToastNotificationArea toasts={toasts} />

      {activeModal && (
        <EventEditModal 
          date={activeModal.date} 
          event={activeModal.event} 
          onClose={() => setActiveModal(null)} 
          addToast={addToast} 
          allEvents={events}
        />
      )}
    </div>
  );
}

// Time Formatter helper: converts "10:00" or similar to standard human display time like "10:00 AM"
function formatTime(rawTime: string | null | undefined): string {
  if (!rawTime) return '';
  if (/[a-zA-Z]/.test(rawTime)) {
    return rawTime;
  }
  const parts = rawTime.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const minutesStr = String(minutes).padStart(2, '0');
      return `${hours}:${minutesStr} ${ampm}`;
    }
  }
  return rawTime;
}

// ── CUSTOM UTILITY: Parse CSV String safely into array maps ──
function parseCsvText(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length < 2) return [];

  // Match columns
  const parseRowCells = (rowStr: string) => {
    const list: string[] = [];
    let cellStr = "";
    let isInsideQuotes = false;
    for (let cIdx = 0; cIdx < rowStr.length; cIdx++) {
      const char = rowStr[cIdx];
      if (char === '"') {
        if (isInsideQuotes && rowStr[cIdx + 1] === '"') {
          cellStr += '"';
          cIdx++;
        } else {
          isInsideQuotes = !isInsideQuotes;
        }
      } else if (char === ',' && !isInsideQuotes) {
        list.push(cellStr.trim());
        cellStr = "";
      } else {
        cellStr += char;
      }
    }
    list.push(cellStr.trim());
    return list;
  };

  const headers = parseRowCells(lines[0]).map(h => h.toLowerCase().trim().replace(/\s+/g, ''));
  
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name'));
  const typeIdx = headers.findIndex(h => h.includes('type'));
  const startIdx = headers.findIndex(h => h.includes('start'));
  const endIdx = headers.findIndex(h => h.includes('end'));
  const notesIdx = headers.findIndex(h => h.includes('notes') || h.includes('desc'));

  if (dateIdx === -1 || titleIdx === -1) return [];

  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRowCells(lines[i]);
    if (cells.length < Math.max(dateIdx, titleIdx) + 1) continue;

    const dateVal = cells[dateIdx];
    const parsedDate = cleanAndStandardizeDate(dateVal);
    if (!parsedDate) continue; // Skip invalid entries

    const titleVal = cells[titleIdx];
    const notesVal = notesIdx >= 0 ? cells[notesIdx] : '';
    const typeVal = typeIdx >= 0 && cells[typeIdx].toLowerCase().trim() === 'birthday' ? 'birthday' : 'event';
    
    // Time formatting cleanups
    const rawStart = startIdx >= 0 ? cells[startIdx] : '';
    const rawEnd = endIdx >= 0 ? cells[endIdx] : '';
    const startTimeVal = cleanAndStandardizeTime(rawStart);
    const endTimeVal = cleanAndStandardizeTime(rawEnd);

    results.push({
      date: parsedDate,
      title: titleVal,
      notes: notesVal,
      type: typeVal,
      startTime: startTimeVal,
      endTime: endTimeVal,
      color: typeVal === 'birthday' ? 'rose' : 'blue',
      visibility: 'public'
    });
  }

  return results;
}

// standardizes dates to YYYY-MM-DD
function cleanAndStandardizeDate(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // matches MM/DD/YYYY
  const usFormat = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usFormat) {
    let yearValue = usFormat[3];
    if (yearValue.length === 2) {
      yearValue = '20' + yearValue;
    }
    return `${yearValue}-${usFormat[1].padStart(2, '0')}-${usFormat[2].padStart(2, '0')}`;
  }

  const dateObj = new Date(cleaned);
  return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().slice(0, 10);
}

// standardizes times to HH:MM (24-hour style)
function cleanAndStandardizeTime(raw: string): string | null {
  if (!raw || raw.trim() === "" || raw === "—" || raw === "-") return null;
  const timeStr = raw.trim();

  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Matches 12:00 PM / AM
  const regexAMPM = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (regexAMPM) {
    let hourValue = parseInt(regexAMPM[1], 10);
    const minuteValue = regexAMPM[2];
    const ampmValue = regexAMPM[3].toUpperCase();

    if (ampmValue === 'PM' && hourValue !== 12) {
      hourValue += 12;
    }
    if (ampmValue === 'AM' && hourValue === 12) {
      hourValue = 0;
    }
    return `${String(hourValue).padStart(2, '0')}:${minuteValue}`;
  }

  return null;
}

const $d = {
  blue: { bg: '#dbeafe', text: '#1e3a8a', border: '#93c5fd' },
  teal: { bg: '#ccfbf1', text: '#134e4a', border: '#5eead4' },
  green: { bg: '#dcfce7', text: '#14532d', border: '#86efac' },
  amber: { bg: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  rose: { bg: '#ffe4e6', text: '#881337', border: '#fca5a5' },
  purple: { bg: '#f3e8ff', text: '#4c1d95', border: '#c084fc' }
};
