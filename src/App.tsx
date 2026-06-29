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
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  updateDoc,
  setDoc,
  getDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  Users, 
  UserPlus,
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
  Search,
  MapPin,
  Shield,
  Key,
  MoreVertical,
  X
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
      <path d="M17.5 69 H82.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 69 V64.5 A5 5 0 0 1 55 64.5 V69" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 68.5 L50 48.5 L76 68.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 57 V45 L50 32.5 L63 45 V57" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 32.5 V17.5 M45 23.5 H55" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  // Routes & Themes
  const [hash, setHash] = useState(window.location.hash || '#/');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Force the app back to 'light' mode as requested, but allow toggle.
    const saved = localStorage.getItem('kcf_theme');
    if (saved === 'dark') {
      localStorage.setItem('kcf_theme', 'light');
      return 'light';
    }
    return (saved as 'light' | 'dark') || 'light';
  });

  // Auth States
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'editor' | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  // Live Sync States
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [invites, setInvites] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

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
        // Boostrap if needed
        await setupAdminProfileIfRequired(currentUser);
        
        // Fetch Admin/Editor Profile
        try {
          const adminDocRef = doc(db, 'admins', currentUser.uid);
          const adminDocSnap = await getDoc(adminDocRef);
          if (adminDocSnap.exists()) {
            const data = adminDocSnap.data();
            const role = data.role || (currentUser.email?.toLowerCase() === 'lucasfarmer2008@gmail.com' ? 'owner' : 'admin');
            setUserRole(role);
            setIsAdmin(true);
            
            // Periodically refresh/update activeAt field for user activity tracking
            await updateDoc(adminDocRef, { activeAt: serverTimestamp() }).catch(() => {});
          } else {
            // Check if bootstrapped email fallback
            if (currentUser.email?.toLowerCase() === 'lucasfarmer2008@gmail.com') {
              setUserRole('owner');
              setIsAdmin(true);
            } else {
              setUserRole(null);
              setIsAdmin(false);
            }
          }
        } catch (e) {
          console.error("Error loading admin role:", e);
          if (currentUser.email?.toLowerCase() === 'lucasfarmer2008@gmail.com') {
            setUserRole('owner');
            setIsAdmin(true);
          } else {
            setUserRole(null);
            setIsAdmin(false);
          }
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setUserRole(null);
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

  // Live Subscription to authorized admin users
  useEffect(() => {
    if (!isAdmin) {
      setAdmins([]);
      return;
    }

    const adminsCol = collection(db, 'admins');
    const unsubscribe = onSnapshot(adminsCol, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAdmins(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admins');
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

  const [copiedEvent, setCopiedEvent] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('kcf_copied_event');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleCopyEvent = (event: any) => {
    if (!event) return;
    const cleanEvent = {
      title: event.title || '',
      description: event.description || event.notes || '',
      startTime: event.startTime || null,
      endTime: event.endTime || null,
      color: event.color || 'blue',
      notes: event.notes || event.description || '',
      type: event.type || 'event',
      visibility: event.visibility || 'public',
      location: event.location || '',
      allDay: event.allDay ?? !event.startTime,
      published: event.published ?? true
    };
    setCopiedEvent(cleanEvent);
    localStorage.setItem('kcf_copied_event', JSON.stringify(cleanEvent));
    addToast("Event copied to clipboard!", "success");
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
        userRole={userRole}
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
        copiedEvent={copiedEvent}
        setCopiedEvent={setCopiedEvent}
        onCopyEvent={handleCopyEvent}
      />
    );
  }

  if (hash === '#/admin-controls' || hash === '#/admin-users') {
    if (!isAdmin) {
      return <LoginScreen onLoginSuccess={() => { window.location.hash = hash; }} addToast={addToast} />;
    }
    // Block editor from accessing admin-users
    if (hash === '#/admin-users' && userRole === 'editor') {
      window.location.hash = '#/dashboard';
      return null;
    }
    return (
      <AdminDashboardView 
        user={user}
        userRole={userRole}
        events={events}
        invites={invites}
        admins={admins}
        initialTab={hash === '#/admin-users' ? 'users' : 'events'}
        addToast={addToast}
        logout={() => signOut(auth)}
        theme={theme}
        setTheme={setTheme}
        toasts={toasts}
        copiedEvent={copiedEvent}
        setCopiedEvent={setCopiedEvent}
        onCopyEvent={handleCopyEvent}
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      addToast("Please enter both email and password.", "error");
      return;
    }
    setSigningIn(true);
    const trimmedEmail = email.toLowerCase().trim();
    const cleanPassword = password.trim();

    try {
      // 1. Try standard sign-in first (if user is already created in Firebase Auth)
      try {
        const result = await signInWithEmailAndPassword(auth, trimmedEmail, cleanPassword);
        if (result.user) {
          addToast("Logged in successfully!", "success");
          onLoginSuccess();
          return;
        }
      } catch (authError: any) {
        // If user not found, or invalid-credential, check if they have a pending custom invite matching the credentials
        if (
          authError.code === 'auth/user-not-found' || 
          authError.code === 'auth/invalid-credential' || 
          authError.code === 'auth/invalid-email' ||
          authError.code === 'auth/user-disabled'
        ) {
          const invitesCol = collection(db, 'invites');
          const q = query(invitesCol, where('email', '==', trimmedEmail), where('password', '==', cleanPassword));
          const snap = await getDocs(q);

          let foundInvite: any = null;
          for (const d of snap.docs) {
            const data = d.data();
            if (!data.usedAt) {
              foundInvite = { id: d.id, ...data };
              break;
            }
          }

          if (foundInvite) {
            // Found a matching unused invite. Provision their account.
            const signupResult = await createUserWithEmailAndPassword(auth, trimmedEmail, cleanPassword);
            const newUser = signupResult.user;

            // Mark invite as used
            await updateDoc(doc(db, 'invites', foundInvite.id), {
              usedAt: serverTimestamp(),
              usedBy: newUser.uid
            });

            // Create admin profile matching the invite role
            await setDoc(doc(db, 'admins', newUser.uid), {
              email: trimmedEmail,
              name: foundInvite.name || trimmedEmail.split('@')[0],
              role: foundInvite.role || 'editor',
              status: 'Active',
              invitedBy: foundInvite.id,
              assignedAt: serverTimestamp(),
              photoURL: ''
            });

            addToast("Account registered and logged in successfully!", "success");
            onLoginSuccess();
            return;
          }
        }
        // If we didn't find a matching invite, throw the original auth error
        throw authError;
      }
    } catch (e: any) {
      let friendlyMessage = e.message || "Authentication failed.";
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        friendlyMessage = "Incorrect email or password. Please verify your credentials and try again.";
      } else if (e.code === 'auth/user-not-found') {
        friendlyMessage = "No registered account or pending invite found with this email.";
      } else if (e.code === 'auth/weak-password') {
        friendlyMessage = "The password generated is too weak. Please contact an administrator.";
      }
      addToast(friendlyMessage, 'error');
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
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Sign in with your email or Google account to access your calendar dashboard</p>
          </div>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailSignIn} className="mt-8 space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              disabled={signingIn}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-sky-400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={signingIn}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-sky-400"
            />
          </div>

          <button
            type="submit"
            disabled={signingIn}
            className="flex w-full items-center justify-center rounded-lg bg-[#0091ff] px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#007ee6] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {signingIn ? "Please wait..." : "Sign In with Email & Password"}
          </button>
        </form>

        <div className="my-6 flex items-center justify-center gap-3">
          <div className="h-[1px] flex-1 bg-slate-200 dark:bg-zinc-800"></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">or</span>
          <div className="h-[1px] flex-1 bg-slate-200 dark:bg-zinc-800"></div>
        </div>

        <div className="space-y-4">
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
            Continue with Google
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
        const inviteSnap = await getDoc(inviteRef);
        let role = 'editor';
        let name = '';
        if (inviteSnap.exists()) {
          const invData = inviteSnap.data();
          role = invData.role || 'editor';
          name = invData.name || '';
        }

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
            assignedAt: serverTimestamp(),
            role: role,
            name: name,
            status: 'Active',
            photoURL: auth.currentUser.photoURL || ''
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
    blue: 'border-blue-500 bg-blue-50/40 text-blue-950 dark:bg-blue-950/20 dark:text-blue-200',
    teal: 'border-teal-500 bg-teal-50/40 text-teal-950 dark:bg-teal-950/20 dark:text-teal-200',
    green: 'border-green-500 bg-green-50/40 text-green-950 dark:bg-green-950/20 dark:text-green-200',
    amber: 'border-amber-500 bg-amber-50/40 text-amber-950 dark:bg-amber-950/20 dark:text-amber-200',
    rose: 'border-rose-500 bg-rose-50/40 text-rose-950 dark:bg-rose-950/20 dark:text-rose-200',
    purple: 'border-purple-500 bg-purple-50/40 text-purple-950 dark:bg-purple-950/20 dark:text-purple-200',
  };

  const badgeColor = colors[event.color || 'blue'] || colors.blue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Header section with Badge & Date */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-start bg-slate-50/50 dark:bg-zinc-900/50">
          <div>
            <span className="font-display text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-md bg-zinc-200/60 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400">
              {event.type || 'Event'}
            </span>
            <p className="font-display font-medium text-xs text-slate-400 dark:text-zinc-500 mt-2">{event.date}</p>
          </div>
          <button 
            onClick={onClose} 
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 text-sm font-medium transition cursor-pointer p-1"
          >
            ✕
          </button>
        </div>

        {/* Core Content Body */}
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-zinc-50 leading-snug tracking-tight">
              {event.title}
            </h3>
          </div>

          {/* Time block */}
          {event.startTime && (
            <div className="space-y-1">
              <span className="block font-display text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                Time
              </span>
              <p className="font-sans text-sm font-semibold text-sky-600 dark:text-sky-400">
                {formatTime(event.startTime)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ''}
              </p>
            </div>
          )}

          {/* Description Block */}
          {(event.description || event.notes) && (
            <div className="space-y-1.5 pt-1">
              <span className="block font-display text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                Details
              </span>
              <div className={`p-3.5 rounded-xl border-l-3 font-sans text-xs leading-relaxed ${badgeColor}`}>
                <p className="whitespace-pre-line">{event.description || event.notes}</p>
              </div>
            </div>
          )}

          {/* Location Block */}
          {event.location && (
            <div className="space-y-1 pt-1">
              <span className="block font-display text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                Location
              </span>
              <p className="font-sans text-sm font-semibold text-slate-800 dark:text-zinc-200">
                {event.location}
              </p>
            </div>
          )}
        </div>

        {/* Footer Area with premium button */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/30 flex justify-end">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 bg-slate-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-bold font-display rounded-xl hover:opacity-90 active:scale-[0.98] transition shadow-xs cursor-pointer"
          >
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
                onClick={() => setTheme((t: 'light' | 'dark') => t === 'dark' ? 'light' : 'dark')} 
                aria-label="Toggle theme" 
                title="Toggle theme" 
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius)", border: "1px solid hsl(var(--color-border))", background: "hsl(var(--color-surface-offset, var(--color-surface)))", color: "hsl(var(--color-text-muted))", cursor: "pointer", flexShrink: 0 }}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="h-4 w-4 text-slate-500" />
                )}
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
                  onClick={() => { window.location.hash = "#/dashboard"; }}
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
  userRole = 'admin',
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
            </div>
          </div>

          {userRole !== 'editor' && (
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
          )}
        </div>
      </div>

      {/* Profile area & Sign out */}
      <div className="flex flex-col gap-3 pt-5 border-t border-[#1e293b]/45">
        <div className="flex items-center gap-2.5 px-1">
          {user.photoURL ? (
            <img 
              src={user.photoURL} 
              alt={user.displayName || "Avatar"} 
              className="h-8 w-8 rounded-full shrink-0 border border-[#1e293b]/50"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-[#1e293b] text-[#0091ff] flex items-center justify-center font-bold text-xs select-none uppercase shadow-inner shrink-0 border border-[#1e293b]/50">
              {user.email ? user.email.slice(0, 1) : 'A'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate leading-none">
              {user.displayName || "Administrator"}
            </p>
            <span className="text-[10px] text-[#0091ff] font-bold tracking-wider block mt-1 uppercase">
              {userRole === 'owner' ? 'Owner / Creator' : userRole === 'admin' ? 'Administrator' : 'Editor Access'}
            </span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={logout}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-[#1e293b] bg-transparent hover:bg-[#1e293b]/50 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition duration-200 cursor-pointer ease-in-out"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </button>
          
          <button
            type="button"
            onClick={() => setTheme((t: 'light' | 'dark') => t === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="px-3 rounded-lg border border-[#1e293b] bg-transparent hover:bg-[#1e293b]/50 text-slate-400 hover:text-white transition duration-200 cursor-pointer ease-in-out flex items-center justify-center"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── SUB-COMPONENT: Admin Interactive View ──
function AdminInteractiveView({
  user,
  userRole = 'admin',
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
  toasts,
  copiedEvent,
  setCopiedEvent,
  onCopyEvent
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
        userRole={userRole}
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
        <main className="max-w-[1400px] w-full mx-auto p-4 md:p-6 lg:p-8 flex-1 flex flex-col justify-start">
          {/* Mobile menu trigger */}
          <div className="lg:hidden mb-4">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1624] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#111c2a] transition-all duration-200 cursor-pointer shadow-xs"
            >
              <Menu className="h-4 w-4" />
              <span>Menu</span>
            </button>
          </div>
          
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
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {copiedEvent && (
                              <button
                                type="button"
                                title={`Paste copied event: "${copiedEvent.title}"`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const pastedPayload = {
                                      ...copiedEvent,
                                      date: dateStr,
                                    };
                                    await createEvent(pastedPayload);
                                    addToast(`Event "${copiedEvent.title}" pasted successfully!`, "success");
                                  } catch (err: any) {
                                    addToast(err.message || "Failed to paste event", "error");
                                  }
                                }}
                                className="p-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-[#0091ff] dark:text-sky-400 border border-sky-100 dark:border-sky-900/30 hover:scale-105 active:scale-95 transition cursor-pointer"
                              >
                                <FolderPlus className="h-3 w-3" />
                              </button>
                            )}
                            <span className="p-0.5 rounded bg-slate-100/50 dark:bg-[#111c2a] text-slate-500 dark:text-slate-400 border border-slate-200/30 dark:border-slate-800">
                              <Plus className="h-3 w-3" />
                            </span>
                          </div>
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
          copiedEvent={copiedEvent}
          setCopiedEvent={setCopiedEvent}
          onCopyEvent={onCopyEvent}
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
function EventEditModal({ 
  date, 
  event, 
  onClose, 
  addToast, 
  allEvents = [],
  copiedEvent,
  setCopiedEvent,
  onCopyEvent
}: { 
  date: string, 
  event: any, 
  onClose: () => void, 
  addToast: any, 
  allEvents?: any[],
  copiedEvent?: any,
  setCopiedEvent?: any,
  onCopyEvent?: any
}) {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startTime, setStartTime] = useState(event?.startTime || '');
  const [endTime, setEndTime] = useState(event?.endTime || '');
  const [color, setColor] = useState(event?.color || 'blue');
  const [notes, setNotes] = useState(event?.notes || '');
  const [type, setType] = useState<string>(event?.type || 'event');
  const [visibility, setVisibility] = useState<string>(event?.visibility || 'public');
  const [location, setLocation] = useState(event?.location || '');

  const ON_SITE_LOCATIONS = [
    "Sanctuary",
    "Fellowship Hall",
    "Hospitality Room",
    "South Classroom",
    "North Classroom"
  ];

  const [locationType, setLocationType] = useState<'onsite' | 'custom'>(() => {
    if (!event?.location) return 'onsite';
    return ON_SITE_LOCATIONS.includes(event.location) ? 'onsite' : 'custom';
  });

  const handleLocationTypeChange = (type: 'onsite' | 'custom') => {
    setLocationType(type);
    if (type === 'onsite') {
      setLocation('Sanctuary');
    } else {
      setLocation('');
    }
  };

  useEffect(() => {
    if (location) {
      const isOnSite = ON_SITE_LOCATIONS.includes(location);
      setLocationType(isOnSite ? 'onsite' : 'custom');
    }
  }, [location]);

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState('weekly');
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [deleteMode, setDeleteMode] = useState<'prompt' | null>(null);
  const [saveMode, setSaveMode] = useState<'prompt' | null>(null);

  const [saving, setSaving] = useState(false);

  // Auto layout date picker
  const [selectedDate, setSelectedDate] = useState(event?.date || date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast("Title is required", "error");
      return;
    }

    if (event && event.recurrenceGroupId) {
      setSaveMode('prompt');
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
      date: selectedDate,
      location: location.trim()
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

  const handleSaveSingle = async () => {
    if (!event) return;
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
      date: selectedDate,
      location: location.trim(),
      recurrenceGroupId: event.recurrenceGroupId
    };

    try {
      await updateEvent(event.id, payload);
      addToast("This event was updated successfully!");
      onClose();
    } catch (e: any) {
      addToast(e.message || "Failed to update event", "error");
    } finally {
      setSaving(false);
      setSaveMode(null);
    }
  };

  const handleSaveSeries = async () => {
    if (!event || !event.recurrenceGroupId) return;
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
      location: location.trim(),
      recurrenceGroupId: event.recurrenceGroupId
    };

    try {
      const seriesEvents = allEvents.filter((e: any) => e.recurrenceGroupId === event.recurrenceGroupId);
      for (const seriesEv of seriesEvents) {
        const seriesPayload = {
          ...payload,
          date: seriesEv.date || (seriesEv.startDate ? seriesEv.startDate.toDate().toISOString().substring(0, 10) : '')
        };
        await updateEvent(seriesEv.id, seriesPayload);
      }
      addToast(`All ${seriesEvents.length} events in this series updated successfully!`);
      onClose();
    } catch (e: any) {
      addToast(e.message || "Failed to update series", "error");
    } finally {
      setSaving(false);
      setSaveMode(null);
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
          {copiedEvent && !event && (
            <button
              type="button"
              onClick={() => {
                setTitle(copiedEvent.title || '');
                setDescription(copiedEvent.description || '');
                setStartTime(copiedEvent.startTime || '');
                setEndTime(copiedEvent.endTime || '');
                setColor(copiedEvent.color || 'blue');
                setNotes(copiedEvent.notes || '');
                setType(copiedEvent.type || 'event');
                setVisibility(copiedEvent.visibility || 'public');
                setLocation(copiedEvent.location || '');
                addToast("Event details pasted from clipboard!", "success");
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-sky-300 dark:border-sky-800/80 bg-sky-50/50 dark:bg-sky-950/10 text-sky-600 dark:text-sky-400 rounded-lg text-xs font-semibold hover:bg-sky-50 dark:hover:bg-sky-950/20 cursor-pointer transition duration-150"
            >
              <Copy className="h-3.5 w-3.5" /> Paste Event Details from Clipboard
            </button>
          )}
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

          <div className="flex flex-col gap-2">
            <label className="text-2xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-slate-400" /> Location / Room
            </label>
            
            {/* Segmented toggle for location type */}
            <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-zinc-850 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleLocationTypeChange('onsite')}
                className={`flex-1 py-1.5 rounded-md transition duration-150 cursor-pointer text-center ${
                  locationType === 'onsite' 
                    ? 'bg-white shadow dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 font-bold' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
                }`}
              >
                On-Site Room
              </button>
              <button
                type="button"
                onClick={() => handleLocationTypeChange('custom')}
                className={`flex-1 py-1.5 rounded-md transition duration-150 cursor-pointer text-center ${
                  locationType === 'custom' 
                    ? 'bg-white shadow dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 font-bold' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300'
                }`}
              >
                Custom Address / Off-Site
              </button>
            </div>

            {locationType === 'onsite' ? (
              <div className="grid grid-cols-2 gap-2 mt-1">
                {ON_SITE_LOCATIONS.map((loc, idx) => {
                  const isSelected = location === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocation(loc)}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-semibold text-center transition-all cursor-pointer ${
                        idx === 4 ? 'col-span-2' : ''
                      } ${
                        isSelected 
                          ? 'bg-sky-50/70 dark:bg-sky-950/20 border-sky-400 dark:border-sky-800 text-sky-600 dark:text-sky-400 font-bold shadow-xs'
                          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-750/50'
                      }`}
                    >
                      {loc}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input 
                type="text" 
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. 123 Main St, or Zoom Link..."
                className="w-full px-4 py-2.5 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none text-sm font-medium focus:border-sky-500 transition"
              />
            )}
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
            {event && event.recurrenceGroupId && saveMode === 'prompt' ? (
              <div className="w-full bg-slate-50 dark:bg-zinc-950/30 p-4 rounded-xl border border-slate-200 dark:border-zinc-850 text-center space-y-3 animate-in fade-in duration-150">
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  This is a recurring event. How would you like to save your edits?
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveSingle}
                    disabled={saving}
                    className="px-3.5 py-1.5 bg-[#0091ff] hover:bg-[#007ee6] text-white text-xs font-semibold rounded-md transition cursor-pointer"
                  >
                    Only This Event
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSeries}
                    disabled={saving}
                    className="px-3.5 py-1.5 bg-sky-800 hover:bg-sky-900 text-white text-xs font-semibold rounded-md transition cursor-pointer"
                  >
                    All Recurring Events ({allEvents.filter((e: any) => e.recurrenceGroupId === event.recurrenceGroupId).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveMode(null)}
                    className="px-3 py-1.5 border dark:border-zinc-800 text-xs font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : event && event.recurrenceGroupId && deleteMode === 'prompt' ? (
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onCopyEvent) {
                          onCopyEvent(event);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-850 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold cursor-pointer transition"
                    >
                      <Copy className="h-4 w-4" /> Copy
                    </button>
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
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 dark:border-red-900/30 dark:hover:bg-red-950/20 text-xs font-semibold cursor-pointer transition"
                    >
                      <Trash2 className="h-4 w-4" /> Delete Item
                    </button>
                  </div>
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
  userRole = 'admin',
  events,
  invites,
  admins = [],
  initialTab = 'events',
  addToast,
  logout,
  theme,
  setTheme,
  toasts,
  copiedEvent,
  setCopiedEvent,
  onCopyEvent
}: any) {
  const [activeTab, setActiveTab] = useState<'events' | 'users'>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [csvPreview, setCsvPreview] = useState<any[] | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  const [activeModal, setActiveModal] = useState<any>(null); // { date, event } or null
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom states for refined User Tab
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'editor'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Pending'>('all');
  
  // Custom Invite Modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor'>('editor');
  const [inviteNote, setInviteNote] = useState('');
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [generatedInvitePassword, setGeneratedInvitePassword] = useState<string | null>(null);

  // Edit / Role / Transfer States
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newSelectedRole, setNewSelectedRole] = useState<'admin' | 'editor'>('editor');
  const [transferTargetEmail, setTransferTargetEmail] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleRevokeUser = async (uid: string, email: string) => {
    if (uid === user.uid) {
      addToast("You cannot revoke your own admin access!", "error");
      return;
    }
    if (window.confirm(`Are you sure you want to revoke admin access for ${email}?`)) {
      try {
        await deleteDoc(doc(db, 'admins', uid));
        addToast(`Admin access revoked for ${email}`);
      } catch (err: any) {
        addToast("Failed to revoke access: " + err.message, "error");
      }
    }
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = 'KCF-';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleOpenInviteModal = () => {
    setInviteName('');
    setInviteEmail('');
    setInvitePassword(generateRandomPassword());
    setInviteRole('editor');
    setInviteNote('');
    setGeneratedInviteUrl(null);
    setGeneratedInvitePassword(null);
    setShowInviteModal(true);
  };

  const handleCreateCustomInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()) {
      addToast("Please fill in all required fields (*).", "error");
      return;
    }
    try {
      const inviteToken = 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await setDoc(doc(db, 'invites', inviteToken), {
        token: inviteToken,
        createdAt: serverTimestamp(),
        usedAt: null,
        usedBy: null,
        name: inviteName.trim(),
        email: inviteEmail.toLowerCase().trim(),
        password: invitePassword.trim(),
        role: inviteRole,
        notes: inviteNote.trim(),
      });
      
      const inviteUrl = `${window.location.origin}/#/invite/${inviteToken}`;
      setGeneratedInviteUrl(inviteUrl);
      setGeneratedInvitePassword(invitePassword.trim());
      addToast("Custom user invite created successfully!", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to generate custom invite.", 'error');
    }
  };

  const handleUpdateUserRole = async (targetUser: any, newRole: 'admin' | 'editor') => {
    try {
      const userRef = doc(db, 'admins', targetUser.id);
      await updateDoc(userRef, { role: newRole });
      addToast(`Access role for ${targetUser.email} updated to ${newRole}!`, "success");
      setEditingUser(null);
    } catch (err: any) {
      addToast("Failed to update role: " + err.message, "error");
    }
  };

  const handleTransferOwnershipSubmit = async (targetUser: any) => {
    if (!targetUser || !targetUser.email) return;
    
    // Safety check: only owners can transfer ownership
    if (userRole !== 'owner') {
      addToast("Only the Owner can transfer ownership!", "error");
      return;
    }

    if (window.confirm(`CRITICAL WARNING:\n\nAre you sure you want to transfer total ownership to ${targetUser.email}?\n\nOnce complete, you will be demoted to an Admin and lose the ability to transfer ownership.`)) {
      try {
        // Demote current owner to admin, and promote target to owner
        const currentOwnerRef = doc(db, 'admins', user.uid);
        const targetUserRef = doc(db, 'admins', targetUser.id);
        
        await updateDoc(currentOwnerRef, { role: 'admin' });
        await updateDoc(targetUserRef, { role: 'owner' });
        
        addToast(`Ownership successfully transferred to ${targetUser.email}! You are now an Administrator.`, "success");
        setEditingUser(null);
        // Let the route refresh
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err: any) {
        addToast("Failed to transfer ownership: " + err.message, "error");
      }
    }
  };

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
        userRole={userRole}
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
        <main className="max-w-6xl mx-auto w-full p-4 md:p-6 flex-1">
          {/* Mobile menu trigger */}
          <div className="lg:hidden mb-4">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1624] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#111c2a] transition-all duration-200 cursor-pointer shadow-xs"
            >
              <Menu className="h-4 w-4" />
              <span>Menu</span>
            </button>
          </div>
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
        ) : (() => {
          // Compute combined directory
          const combinedMembers = [
            ...admins.map((adm: any) => ({
              id: adm.id,
              isInvite: false,
              name: adm.name || (adm.email && adm.email.split('@')[0]) || 'Authorized User',
              email: adm.email || 'No Email',
              role: adm.role || (adm.email?.toLowerCase() === 'lucasfarmer2008@gmail.com' ? 'owner' : 'admin'),
              status: 'Active',
              photoURL: adm.photoURL || '',
              invitedAt: adm.assignedAt || adm.seededAt || null,
              activeAt: adm.activeAt || adm.assignedAt || adm.seededAt || null,
              notes: adm.notes || '',
            })),
            ...invites.filter((inv: any) => !inv.usedAt).map((inv: any) => ({
              id: inv.id,
              isInvite: true,
              name: inv.name || 'Pending Invite',
              email: inv.email || 'No Email Specified',
              role: inv.role || 'editor',
              status: 'Pending',
              photoURL: '',
              invitedAt: inv.createdAt || null,
              activeAt: null,
              notes: inv.notes || '',
              token: inv.token,
              password: inv.password || '',
            }))
          ];

          // Filter combined directory
          const filteredMembers = combinedMembers.filter((m: any) => {
            const matchesRole = roleFilter === 'all' || m.role === roleFilter;
            const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
            const matchesSearch = !search.trim() || 
              m.email.toLowerCase().includes(search.toLowerCase()) || 
              m.name.toLowerCase().includes(search.toLowerCase());
            return matchesRole && matchesStatus && matchesSearch;
          });

          const formatAdminDate = (ts: any) => {
            if (!ts) return "Never";
            if (ts.toDate) return ts.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
          };

          return (
            <div className="space-y-6">
              {/* Header card with Invitation Launchpad */}
              <div className="bg-white dark:bg-[#0d1624] p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/60 flex flex-col md:flex-row gap-5 items-start md:items-center justify-between shadow-[0_4px_20px_rgba(15,23,42,0.02)]">
                <div className="flex gap-4 items-start">
                  <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0 text-[#0091ff]">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50 tracking-tight">
                      Users & Access Control
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                      Invite colleagues, configure role permissions, and manage console access controls securely. Only owners and administrators can dispatch invites.
                    </p>
                  </div>
                </div>
                {userRole !== 'editor' && (
                  <button 
                    onClick={handleOpenInviteModal}
                    className="w-full md:w-auto h-11 px-5 flex items-center justify-center gap-2 rounded-xl bg-[#0091ff] text-white hover:bg-[#007ee6] text-xs font-semibold tracking-tight shadow-[0_2px_8px_rgba(0,145,255,0.22)] hover:shadow-[0_4px_12px_rgba(0,145,255,0.32)] transition-all duration-200 active:scale-[0.98] cursor-pointer"
                  >
                    <UserPlus className="h-4 w-4" /> Invite User
                  </button>
                )}
              </div>

              {/* Filtering Controls & Live Stats */}
              <div className="bg-white dark:bg-[#0d1624] p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/60 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-xs">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  {/* Search inside Directory */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input 
                      type="text" 
                      placeholder="Filter by name or email..." 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 h-9 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white focus:bg-white dark:focus:bg-[#162231] focus:border-[#0091ff]/80 transition"
                    />
                  </div>

                  {/* Role filter */}
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#111c2a] border border-slate-200/50 dark:border-slate-800/80 px-2.5 h-9 rounded-lg">
                    <span className="text-[10px] text-slate-450 dark:text-slate-500 font-bold tracking-wider uppercase">Role:</span>
                    <select
                      value={roleFilter}
                      onChange={e => setRoleFilter(e.target.value as any)}
                      className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-350 outline-none cursor-pointer pr-1"
                    >
                      <option value="all">All Roles</option>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>

                  {/* Status filter */}
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#111c2a] border border-slate-200/50 dark:border-slate-800/80 px-2.5 h-9 rounded-lg">
                    <span className="text-[10px] text-slate-450 dark:text-slate-500 font-bold tracking-wider uppercase">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as any)}
                      className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-350 outline-none cursor-pointer pr-1"
                    >
                      <option value="all">All Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                </div>

                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-[#111c2a] border border-slate-200/50 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
                    Count: {filteredMembers.length} / {combinedMembers.length} Records
                  </span>
                </div>
              </div>

              {/* Directory directory table */}
              <div className="bg-white dark:bg-[#0d1624] rounded-2xl border border-slate-200/50 dark:border-slate-800/60 overflow-hidden shadow-[0_4px_20px_rgba(15,23,42,0.02)]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#111c2a] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-widest text-[9px] select-none">
                        <th className="px-6 py-4">User Details</th>
                        <th className="px-6 py-4">Access Role</th>
                        <th className="px-6 py-4">Invited Status</th>
                        <th className="px-6 py-4">Activity Times</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/60">
                      {filteredMembers.map((m: any) => {
                        const isSelf = m.id === user.uid;
                        const isOwner = m.role === 'owner';
                        
                        // Access level controls
                        // Owner can edit anyone (except themselves)
                        // Admin can edit editors/admins, but NOT owners
                        const canModify = !isSelf && (
                          userRole === 'owner' || 
                          (userRole === 'admin' && m.role !== 'owner')
                        );

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/25 dark:hover:bg-[#111c2a]/20 transition duration-150">
                            {/* User Details */}
                            <td className="px-6 py-4.5">
                              <div className="flex items-center gap-3">
                                {m.photoURL ? (
                                  <img 
                                    src={m.photoURL} 
                                    alt={m.name} 
                                    className="h-8 w-8 rounded-full border border-slate-150 dark:border-slate-800"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-[#111c2a] flex items-center justify-center font-bold text-xs text-[#0091ff] select-none border border-slate-200/40 dark:border-slate-800">
                                    {m.email ? m.email.slice(0, 2).toUpperCase() : 'PE'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-800 dark:text-white text-xs truncate max-w-[150px]">
                                      {m.name}
                                    </span>
                                    {isSelf && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30 uppercase tracking-wider select-none">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-2xs text-slate-450 dark:text-slate-500 font-mono block mt-0.5 max-w-[200px] truncate" title={m.email}>
                                    {m.email}
                                  </span>
                                  {m.notes && (
                                    <span className="text-[10px] text-slate-400 italic block mt-1 max-w-[220px] truncate">
                                      Note: "{m.notes}"
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Access Role */}
                            <td className="px-6 py-4.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium text-[10px] border tracking-tight select-none ${
                                m.role === 'owner' 
                                  ? 'bg-purple-50/40 dark:bg-purple-950/10 border-purple-100 dark:border-purple-900/40 text-purple-600 dark:text-purple-400 font-bold'
                                  : m.role === 'admin'
                                  ? 'bg-blue-50/40 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/40 text-[#0091ff] font-semibold'
                                  : 'bg-teal-50/40 dark:bg-teal-950/10 border-teal-100 dark:border-teal-900/40 text-teal-600 dark:text-teal-400 font-semibold'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${m.role === 'owner' ? 'bg-purple-500' : m.role === 'admin' ? 'bg-[#0091ff]' : 'bg-teal-500'}`} />
                                {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Editor'}
                              </span>
                            </td>

                            {/* Invited Status */}
                            <td className="px-6 py-4.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-tight border select-none ${
                                m.status === 'Active'
                                  ? 'bg-emerald-50/20 border-emerald-100/50 dark:border-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-50/20 border-amber-100/50 dark:border-amber-950/30 text-amber-600 dark:text-amber-400'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${m.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                {m.status}
                              </span>
                              {m.status === 'Pending' && m.password && (
                                <div className="text-[10px] text-slate-450 font-mono mt-1">
                                  PW: <span className="font-semibold text-slate-600 dark:text-slate-300">{m.password}</span>
                                </div>
                              )}
                            </td>

                            {/* Activity Times */}
                            <td className="px-6 py-4.5 text-slate-500 dark:text-slate-400">
                              <div className="space-y-0.5 leading-none">
                                <div className="text-[10px]">
                                  <span className="text-slate-400 font-medium">Invited: </span>
                                  <span className="font-semibold text-slate-600 dark:text-slate-300">{formatAdminDate(m.invitedAt)}</span>
                                </div>
                                <div className="text-[10px]">
                                  <span className="text-slate-400 font-medium">Active: </span>
                                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                                    {m.status === 'Pending' ? 'Pending Acceptance' : formatAdminDate(m.activeAt)}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* If pending invite, allow copying URL */}
                                {m.isInvite && (
                                  <button 
                                    onClick={() => {
                                      const invUrl = `${window.location.origin}/#/invite/${m.token}`;
                                      navigator.clipboard.writeText(invUrl);
                                      addToast("Invite Link copied to clipboard!", "success");
                                    }}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111c2a] hover:bg-slate-50 dark:hover:bg-[#162231] text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                                    title="Copy Invitation Link"
                                  >
                                    Copy Link
                                  </button>
                                )}

                                {/* Edit Role Button */}
                                {canModify && (
                                  <button 
                                    onClick={() => {
                                      setEditingUser(m);
                                      setNewSelectedRole(m.role === 'owner' ? 'admin' : m.role);
                                    }}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111c2a] hover:bg-slate-50 dark:hover:bg-[#162231] text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                                  >
                                    Edit Role
                                  </button>
                                )}

                                {/* Delete / Revoke Action */}
                                {canModify && (
                                  <button 
                                    onClick={() => {
                                      if (m.isInvite) {
                                        handleDeleteInvite(m.id);
                                      } else {
                                        handleRevokeUser(m.id, m.email);
                                      }
                                    }}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 text-red-600 hover:bg-red-100 hover:text-red-700 transition-all cursor-pointer"
                                  >
                                    {m.isInvite ? 'Delete Invite' : 'Revoke'}
                                  </button>
                                )}

                                {!canModify && (
                                  <span className="text-[10px] text-slate-400 italic">Protected</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredMembers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 italic">
                            No users or invites found in directory matching active filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MODAL 1: Invite New Dashboard Member */}
              {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                  <div className="w-full max-w-lg bg-white dark:bg-[#0d1624] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                      <h3 className="font-bold text-slate-900 dark:text-zinc-50 text-sm flex items-center gap-2">
                        <UserPlus className="h-4.5 w-4.5 text-[#0091ff]" />
                        Invite New Dashboard Member
                      </h3>
                      <button 
                        onClick={() => setShowInviteModal(false)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#111c2a] rounded-lg text-slate-450 dark:text-slate-500 transition cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {generatedInviteUrl ? (
                      /* SUCCESS STATE IN MODAL */
                      <div className="p-6 space-y-5">
                        <div className="flex flex-col items-center text-center space-y-2">
                          <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <CheckCircle className="h-6 w-6" />
                          </div>
                          <h4 className="font-bold text-slate-900 dark:text-zinc-50 text-sm">Invitation Generated Successfully!</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-450">
                            The invite is recorded in the directory. Manually copy the login details below to share with your new member.
                          </p>
                        </div>

                        <div className="bg-slate-50 dark:bg-[#111c2a] p-4 rounded-xl border border-slate-200/55 dark:border-slate-800 space-y-3 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-450 font-medium">Invited Name:</span>
                            <span className="font-bold text-slate-800 dark:text-zinc-200">{inviteName}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-450 font-medium">Username / Email:</span>
                            <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono">{inviteEmail}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-450 font-medium">Assigned Role:</span>
                            <span className="font-bold text-[#0091ff] uppercase tracking-wider">{inviteRole}</span>
                          </div>
                          <div className="border-t border-slate-200/50 dark:border-slate-800/60 pt-3 flex justify-between items-center gap-3">
                            <div>
                              <span className="text-slate-450 font-medium block">Login Password:</span>
                              <code className="font-bold text-slate-800 dark:text-zinc-200 font-mono text-sm">{generatedInvitePassword}</code>
                            </div>
                            <button 
                              onClick={() => {
                                if (generatedInvitePassword) {
                                  navigator.clipboard.writeText(generatedInvitePassword);
                                  addToast("Temporary login password copied!", "success");
                                }
                              }}
                              className="px-2.5 py-1 text-2xs font-bold rounded bg-[#0091ff]/10 hover:bg-[#0091ff]/20 text-[#0091ff] border border-[#0091ff]/20 transition cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Manual Invitation Link:</label>
                          <div className="flex gap-2">
                            <code className="flex-1 p-2 bg-slate-50 dark:bg-[#111c2a] rounded-lg border border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-350 font-mono text-[11px] truncate">
                              {generatedInviteUrl}
                            </code>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(generatedInviteUrl);
                                addToast("Invitation link copied to clipboard!", "success");
                              }}
                              className="px-3.5 py-2 bg-[#0091ff] hover:bg-[#007ee6] text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                            >
                              Copy Link
                            </button>
                          </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button 
                            onClick={() => setShowInviteModal(false)}
                            className="px-5 py-2 bg-slate-100 dark:bg-[#111c2a] hover:bg-slate-200 dark:hover:bg-[#162231] text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* INPUT FORM STATE IN MODAL */
                      <form onSubmit={handleCreateCustomInviteSubmit} className="p-6 space-y-4 text-left">
                        {/* Full Name */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest block">
                            User's Full Name *
                          </label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. John Doe"
                            value={inviteName}
                            onChange={e => setInviteName(e.target.value)}
                            className="w-full px-3 h-10 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white focus:bg-white focus:border-[#0091ff]/85 transition"
                          />
                        </div>

                        {/* Email Address */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest block">
                            Username or Email Address *
                          </label>
                          <input 
                            type="email" 
                            required
                            placeholder="e.g. user@example.com"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            className="w-full px-3 h-10 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white focus:bg-white focus:border-[#0091ff]/85 transition"
                          />
                        </div>

                        {/* Login Password Creator */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest block">
                            Create Login Password *
                          </label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              required
                              value={invitePassword}
                              onChange={e => setInvitePassword(e.target.value)}
                              className="flex-1 px-3 h-10 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white font-mono focus:bg-white focus:border-[#0091ff]/85 transition"
                            />
                            <button 
                              type="button"
                              onClick={() => setInvitePassword(generateRandomPassword())}
                              className="h-10 px-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-[#111c2a] hover:bg-slate-100 text-slate-600 dark:text-slate-350 transition flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
                              title="Regenerate password"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Regenerate</span>
                            </button>
                          </div>
                        </div>

                        {/* Role Dropdown Selector */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest block">
                            Dashboard Role Permissions *
                          </label>
                          <select
                            value={inviteRole}
                            onChange={e => setInviteRole(e.target.value as any)}
                            className="w-full px-3 h-10 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white focus:bg-white focus:border-[#0091ff]/85 transition cursor-pointer"
                          >
                            <option value="editor">Editor (Can create and edit calendar events)</option>
                            <option value="admin">Admin (Can invite users, manage permissions, edit calendar)</option>
                          </select>
                        </div>

                        {/* Optional Notes */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest block">
                            Note (Optional)
                          </label>
                          <textarea 
                            rows={2}
                            placeholder="e.g. Freelance marketing copywriter..."
                            value={inviteNote}
                            onChange={e => setInviteNote(e.target.value)}
                            className="w-full p-3 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white focus:bg-white focus:border-[#0091ff]/85 transition resize-none"
                          />
                        </div>

                        <div className="bg-blue-50/40 dark:bg-blue-950/10 p-3.5 rounded-xl border border-blue-100/60 dark:border-blue-900/30 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          No automatic emails will be dispatched to this address. An invitation URL will be generated next for you to copy and send manually.
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-2.5">
                          <button 
                            type="button"
                            onClick={() => setShowInviteModal(false)}
                            className="px-4.5 py-2.5 border dark:border-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit"
                            className="px-5 py-2.5 bg-[#0091ff] hover:bg-[#007ee6] text-white font-semibold rounded-lg text-xs shadow-md transition cursor-pointer"
                          >
                            Create & Get Link
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* MODAL 2: Edit Access Role & Transfer Ownership (Danger Zone) */}
              {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                  <div className="w-full max-w-md bg-white dark:bg-[#0d1624] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-left animate-in slide-in-from-bottom-4 duration-300">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                      <h3 className="font-bold text-slate-900 dark:text-zinc-50 text-sm flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-[#0091ff]" />
                        Configure Member Access: {editingUser.email}
                      </h3>
                      <button 
                        onClick={() => setEditingUser(null)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#111c2a] rounded-lg text-slate-450 dark:text-slate-500 transition cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Only show role selector if the editing user is not the owner */}
                      {editingUser.role !== 'owner' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest block">
                            Assign Access Privilege Level
                          </label>
                          <select
                            value={newSelectedRole}
                            onChange={e => setNewSelectedRole(e.target.value as any)}
                            className="w-full px-3 h-10 border rounded-lg bg-slate-50/50 dark:bg-[#111c2a] border-slate-200/60 dark:border-slate-800 outline-none text-xs text-slate-800 dark:text-white focus:bg-white focus:border-[#0091ff]/85 transition cursor-pointer"
                          >
                            <option value="editor">Editor (Can only edit/create calendar events)</option>
                            <option value="admin">Administrator (Can invite users & manage roles)</option>
                          </select>
                        </div>
                      )}

                      {/* DANGER ZONE: Ownership Transfer (Only accessible if current logged-in user is Owner, and targeting an active registered user) */}
                      {userRole === 'owner' && !editingUser.isInvite && editingUser.role !== 'owner' && (
                        <div className="p-4 bg-red-50/40 dark:bg-red-950/10 border border-red-150/55 dark:border-red-900/30 rounded-xl space-y-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-red-600 dark:text-red-400 font-bold uppercase tracking-wider text-2xs block">
                              👑 Permanent Ownership Transfer
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-550 dark:text-slate-400 leading-relaxed">
                            Relinquish total 100% account ownership of this console permanently to <span className="font-bold text-slate-800 dark:text-zinc-200">{editingUser.email}</span>. You will be instantly demoted to an Administrator. This transfer is permanent and cannot be undone.
                          </p>
                          <button 
                            type="button"
                            onClick={() => handleTransferOwnershipSubmit(editingUser)}
                            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shadow-sm hover:shadow-md transition cursor-pointer text-center"
                          >
                            Transfer Ownership to {editingUser.name}
                          </button>
                        </div>
                      )}

                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                        <button 
                          onClick={() => setEditingUser(null)}
                          className="px-4.5 py-2.5 border dark:border-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        {editingUser.role !== 'owner' && (
                          <button 
                            onClick={() => handleUpdateUserRole(editingUser, newSelectedRole)}
                            className="px-5 py-2.5 bg-[#0091ff] hover:bg-[#007ee6] text-white font-semibold rounded-lg text-xs shadow-md transition cursor-pointer"
                          >
                            Save Changes
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
          copiedEvent={copiedEvent}
          setCopiedEvent={setCopiedEvent}
          onCopyEvent={onCopyEvent}
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
