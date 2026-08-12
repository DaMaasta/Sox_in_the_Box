import { api } from '../config/api';
import type { Space, RawSpace } from '../types';
import { createCachedStore } from '../utils/cachedStore';
import { reportError } from '../utils/errorBus';

function deserializeSpace(s: RawSpace): Space {
  return { ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) };
}

const store = createCachedStore<RawSpace, Space>({
  lsPrefix: 'kistle_sc2_',
  deserialize: deserializeSpace,
});

export function generateAccessCode(length: number): string {
  return Array.from({ length }, () => String(Math.floor(Math.random() * 10))).join('');
}

const now = () => new Date();

// ── Subscriptions ─────────────────────────────────────────────────────────────
export function subscribeToUserSpaces(
  _userId: string,
  callback: (spaces: Space[]) => void
): () => void {
  return store.subscribe('user', () => api.get<RawSpace[]>('/spaces'), 'Lager konnten nicht geladen werden', callback);
}

export function subscribeToSpace(
  spaceId: string,
  callback: (space: Space | null) => void
): () => void {
  return store.subscribeSingle(
    `space:${spaceId}`,
    async () => {
      try { return await api.get<RawSpace>(`/spaces/${spaceId}`); }
      catch { return null; }
    },
    'Lager konnte nicht geladen werden',
    callback
  );
}

export function subscribeToChildSpaces(
  parentId: string,
  callback: (spaces: Space[]) => void
): () => void {
  return store.subscribe(
    `children:${parentId}`,
    () => api.get<RawSpace[]>(`/spaces?parentId=${parentId}`),
    'Boxen konnten nicht geladen werden',
    callback
  );
}

export function subscribeToSpacesByParentIds(
  parentIds: string[],
  callback: (spaces: Space[]) => void
): () => void {
  return store.subscribe(
    `parents:${parentIds.sort().join(',')}`,
    () => api.get<RawSpace[]>(`/spaces?parentIds=${parentIds.join(',')}`),
    'Daten konnten nicht geladen werden',
    callback
  );
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export async function createSpace(
  _userId: string,
  _userEmail: string,
  _userDisplayName: string,
  data: Partial<Omit<Space, 'id' | 'ownerId' | 'memberIds' | 'members' | 'createdAt' | 'updatedAt'>>
): Promise<string> {
  const id = crypto.randomUUID();
  const optimistic: Space = {
    id, ownerId: '', memberIds: [], members: {},
    createdAt: now(), updatedAt: now(),
    name: '', type: 'other', description: '', icon: '📦',
    color: '#2C2926', isGroup: false, parentId: null,
    ...data,
  };
  store.setCreate(id, optimistic);
  try {
    await api.post('/spaces', { id, ...data });
    return id;
  } catch (err) {
    reportError('Lager konnte nicht erstellt werden');
    throw err;
  } finally {
    store.clearCreate(id);
    store.triggerReload();
  }
}

export async function updateSpace(spaceId: string, data: Partial<Space>): Promise<void> {
  store.setUpdate(spaceId, data);
  try {
    await api.put(`/spaces/${spaceId}`, data);
  } catch (err) {
    reportError('Änderung konnte nicht gespeichert werden');
    throw err;
  } finally {
    store.clearUpdate(spaceId);
    store.triggerReload();
  }
}

export async function deleteSpace(spaceId: string): Promise<void> {
  store.setDelete(spaceId);
  try {
    await api.delete(`/spaces/${spaceId}`);
  } catch (err) {
    reportError('Lager konnte nicht gelöscht werden');
    throw err;
  } finally {
    store.clearDelete(spaceId);
    store.triggerReload();
  }
}

export async function getSpace(spaceId: string): Promise<Space | null> {
  try {
    const space = await api.get<RawSpace>(`/spaces/${spaceId}`);
    return deserializeSpace(space);
  } catch {
    return null;
  }
}

export async function getSpaceContentCount(
  spaceId: string
): Promise<{ boxes: number; products: number }> {
  return api.get(`/spaces/${spaceId}/content-count`);
}

export async function joinGroup(
  spaceId: string,
  _userId: string,
  _userEmail: string,
  _userDisplayName: string
): Promise<void> {
  await api.post(`/spaces/${spaceId}/join`, {});
}

export async function regenerateAccessCode(spaceId: string, length: number): Promise<void> {
  await api.post(`/spaces/${spaceId}/access-code`, { length });
}

export async function ensureAccessCode(spaceId: string): Promise<void> {
  const space = await getSpace(spaceId);
  if (!space?.accessCode) await api.post(`/spaces/${spaceId}/access-code`, { length: 4 });
}

export async function removeAccessCode(spaceId: string): Promise<void> {
  await api.delete(`/spaces/${spaceId}/access-code`);
}

export async function addMember(spaceId: string, userId: string, displayName: string, email: string, role: string): Promise<void> {
  await api.post(`/spaces/${spaceId}/members`, { userId, displayName, email, role });
}

export async function updateMemberRole(spaceId: string, userId: string, role: string): Promise<void> {
  await api.put(`/spaces/${spaceId}/members/${userId}`, { role });
}

export async function removeMember(spaceId: string, userId: string): Promise<void> {
  await api.delete(`/spaces/${spaceId}/members/${userId}`);
}
