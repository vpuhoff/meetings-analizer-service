import { collection, doc, setDoc, getDocs, getDoc, query, where, orderBy, deleteDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { MeetingAnalysis } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  context: string;
  team?: string;
  openai_vector_store_id?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
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
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Meeting {
  id: string;
  userId: string;
  projectId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  techStackTags: string[];
  projectTags: string[];
}

export interface MeetingVersion {
  id: string;
  userId: string;
  meetingId: string;
  createdAt: string;
  feedback?: string;
  analysis: string; // JSON stringified MeetingAnalysis
}

export async function saveMeeting(meeting: Partial<Meeting> & { id: string }) {
  const path = `meetings/${meeting.id}`;
  try {
    await setDoc(doc(db, 'meetings', meeting.id), meeting, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveMeetingVersion(version: MeetingVersion) {
  const path = `meetings/${version.meetingId}/versions/${version.id}`;
  try {
    await setDoc(doc(db, 'meetings', version.meetingId, 'versions', version.id), version);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getMeetings(userId: string): Promise<Meeting[]> {
  const path = 'meetings';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Meeting);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const path = `meetings/${meetingId}`;
  try {
    const snap = await getDoc(doc(db, 'meetings', meetingId));
    return snap.exists() ? (snap.data() as Meeting) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function getMeetingVersions(meetingId: string): Promise<MeetingVersion[]> {
  const path = `meetings/${meetingId}/versions`;
  try {
    const q = query(collection(db, path));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as MeetingVersion).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function deleteMeeting(meetingId: string) {
  const path = `meetings/${meetingId}`;
  try {
    // Note: In a real app, you'd want to delete versions first or use a Cloud Function.
    // For simplicity, we'll just delete the meeting document here.
    await deleteDoc(doc(db, 'meetings', meetingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Project CRUD functions
export async function saveProject(project: Partial<Project> & { id: string }) {
  const path = `projects/${project.id}`;
  try {
    await setDoc(doc(db, 'projects', project.id), project, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getProjects(userId: string): Promise<Project[]> {
  const path = 'projects';
  try {
    const q = query(collection(db, path), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Project);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getProject(projectId: string): Promise<Project | null> {
  const path = `projects/${projectId}`;
  try {
    const snap = await getDoc(doc(db, 'projects', projectId));
    return snap.exists() ? (snap.data() as Project) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function deleteProject(projectId: string) {
  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// User Settings
export interface UserSettings {
  userId: string;
  openaiApiKey?: string;
  openaiAssistantId?: string;
  autoSaveToIndex?: boolean;
  updatedAt: string;
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const path = `userSettings/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'userSettings', userId));
    return snap.exists() ? (snap.data() as UserSettings) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveUserSettings(settings: UserSettings) {
  const path = `userSettings/${settings.userId}`;
  try {
    await setDoc(doc(db, 'userSettings', settings.userId), settings, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Knowledge Base
export interface KBDocument {
  id: string;
  userId: string;
  meeting_id: string;
  project_id: string;
  project_name?: string;
  title: string;
  content: string;
  systems: string[];
  topics: string[];
  sync_status: 'synced' | 'pending' | 'out_of_sync' | 'failed';
  openai_file_id: string | null;
  last_synced_at?: number;
  created_at: number;
  updated_at: number;
}

export function subscribeKBDocuments(userId: string, onChange: (docs: KBDocument[]) => void): Unsubscribe {
  const q = query(collection(db, 'knowledge_base'), where('userId', '==', userId), orderBy('updated_at', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(d => d.data() as KBDocument));
  });
}

export async function saveKBDocument(doc_: KBDocument) {
  const path = `knowledge_base/${doc_.id}`;
  try {
    await setDoc(doc(db, 'knowledge_base', doc_.id), doc_, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteKBDocument(docId: string) {
  const path = `knowledge_base/${docId}`;
  try {
    await deleteDoc(doc(db, 'knowledge_base', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Chat Threads
export interface ChatThread {
  id: string;
  userId: string;
  project_id: string;
  openai_thread_id: string;
  openai_conversation_id?: string;
  api_version?: 'responses_v1';
  title: string;
  created_at: number;
  updated_at: number;
}

export async function saveChatThread(thread: ChatThread): Promise<void> {
  const path = `chat_threads/${thread.id}`;
  try {
    await setDoc(doc(db, 'chat_threads', thread.id), thread, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getChatThreads(userId: string, projectId: string): Promise<ChatThread[]> {
  const path = 'chat_threads';
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', userId),
      where('project_id', '==', projectId),
      orderBy('updated_at', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ChatThread);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const path = `chat_threads/${threadId}`;
  try {
    await deleteDoc(doc(db, 'chat_threads', threadId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
