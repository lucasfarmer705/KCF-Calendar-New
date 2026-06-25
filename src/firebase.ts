import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Test Connection constraints
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Error Handling Infrastructure
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Convert user-friendly UI fields to the strict backend fields required by the spec
function mapUiToDbFields(data: any): any {
  const { date, startTime, endTime, notes, visibility, title, ...rest } = data;

  const notesVal = notes || '';
  const isAllDay = !startTime;
  const isPublished = visibility !== 'private';

  // Parse Date strings to Timestamp
  let computedStartDate = new Date();
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    computedStartDate = new Date(y, m - 1, d);
  }
  if (startTime) {
    const [hours, minutes] = startTime.split(':').map(Number);
    computedStartDate.setHours(hours, minutes, 0, 0);
  } else {
    computedStartDate.setHours(0, 0, 0, 0);
  }

  let computedEndDate = new Date(computedStartDate);
  if (endTime) {
    const [hours, minutes] = endTime.split(':').map(Number);
    computedEndDate.setHours(hours, minutes, 0, 0);
  } else {
    computedEndDate.setHours(23, 59, 59, 999);
  }

  return {
    ...rest,
    title: title || 'Untitled Event',
    description: notesVal,
    startDate: Timestamp.fromDate(computedStartDate),
    endDate: Timestamp.fromDate(computedEndDate),
    location: data.location || 'KCF Center',
    allDay: isAllDay,
    published: isPublished,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'system',
    // Preserve UI helper fields in the document structure so the user's rendering works out-of-the-box
    date: date || '',
    startTime: startTime || null,
    endTime: endTime || null,
    notes: notesVal,
    visibility: visibility || 'public',
  };
}

// ── Reusable Functions required by Spec ──

/**
 * 1. Subscribe to published events
 */
export function subscribeToPublishedEvents(callback: (events: any[]) => void) {
  const eventsCol = collection(db, 'events');
  const q = query(
    eventsCol, 
    where('published', '==', true),
    orderBy('startDate', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const events: any[] = [];
    snapshot.forEach((docSnap) => {
      const dbData = docSnap.data();
      events.push({
        id: docSnap.id,
        ...dbData,
        // Ensure UI date parses are robust
        date: dbData.date || (dbData.startDate ? (dbData.startDate as Timestamp).toDate().toISOString().substring(0, 10) : '')
      });
    });
    callback(events);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'events?published=true');
  });
}

/**
 * 2. Subscribe to all events for admin (live listener)
 */
export function subscribeToAllEventsForAdmin(callback: (events: any[]) => void) {
  const eventsCol = collection(db, 'events');
  const q = query(eventsCol, orderBy('startDate', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const events: any[] = [];
    snapshot.forEach((docSnap) => {
      const dbData = docSnap.data();
      events.push({
        id: docSnap.id,
        ...dbData,
        date: dbData.date || (dbData.startDate ? (dbData.startDate as Timestamp).toDate().toISOString().substring(0, 10) : '')
      });
    });
    callback(events);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'events?all=true');
  });
}

/**
 * 3. Create a new event
 */
export async function createEvent(data: any) {
  const eventsCol = collection(db, 'events');
  const finalPayload = {
    ...mapUiToDbFields(data),
    createdAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(eventsCol, finalPayload);
    return { id: docRef.id, ...finalPayload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'events');
  }
}

/**
 * 4. Update an existing event
 */
export async function updateEvent(id: string, data: any) {
  const docRef = doc(db, 'events', id);
  const finalPayload = mapUiToDbFields(data);

  try {
    await updateDoc(docRef, finalPayload);
    return { id, ...finalPayload };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${id}`);
  }
}

/**
 * 5. Delete an event
 */
export async function deleteEvent(id: string) {
  const docRef = doc(db, 'events', id);
  try {
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `events/${id}`);
  }
}

// ── Role check and Admin user seeding helper ──

/**
 * Check if current user is an admin by looking up the "admins" collection.
 * When the bootsrapped admin (email: lucasfarmer2008@gmail.com) logs in,
 * we automatically register them as an admin in Firestore so the rule 'exists(/databases/$(database)/documents/admins/$(uid))' passes.
 */
export async function setupAdminProfileIfRequired(user: any) {
  if (!user) return false;
  
  const isBootstrappedAdmin = user.email && user.email.toLowerCase() === 'lucasfarmer2008@gmail.com';
  const adminDocRef = doc(db, 'admins', user.uid);
  
  if (isBootstrappedAdmin) {
    try {
      await setDoc(adminDocRef, {
        email: user.email,
        seededAt: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('Seeding admin document failed (User might not have write access yet or DB syncing items): ', e);
    }
  }
  return isBootstrappedAdmin;
}

export async function signInWithGooglePopup() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    await setupAdminProfileIfRequired(result.user);
    return result.user;
  } catch (error) {
    console.error('Google Sign-in failed: ', error);
    throw error;
  }
}
