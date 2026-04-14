import { collection, doc, setDoc, getDocs, getDoc, query, where, orderBy, deleteDoc, onSnapshot } from 'firebase/firestore';
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
