import { api } from '../config/api';
import type { AppNotification } from '../types';
import { registerLoader } from '../utils/pollManager';
import { reportError } from '../utils/errorBus';

function deserializeNotif(n: AppNotification): AppNotification {
  return { ...n, createdAt: new Date(n.createdAt) };
}

export function subscribeToUnreadNotifications(
  _userId: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  let active = true;
  let errors = 0;
  const seenIds = new Set<string>();
  let firstLoad = true;
  async function load() {
    try {
      const notifs = await api.get<AppNotification[]>('/notifications?unreadOnly=true');
      const deserialized = notifs.map(deserializeNotif);
      errors = 0;
      if (active) callback(deserialized);
      if (firstLoad) {
        deserialized.forEach(n => seenIds.add(n.id));
        firstLoad = false;
        return;
      }
      for (const n of deserialized) {
        if (!seenIds.has(n.id)) {
          seenIds.add(n.id);
          showBookingNotification(n.groupName || 'Kistle', n.message);
        }
      }
    } catch {
      if (++errors === 1) reportError('Benachrichtigungen konnten nicht geladen werden');
    }
  }
  load();
  const unregister = registerLoader(load);
  return () => { active = false; unregister(); };
}

export async function markAllNotificationsRead(_userId: string): Promise<void> {
  await api.put('/notifications/read-all', {});
}

export async function createNotification(
  notif: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
): Promise<void> {
  await api.post('/notifications', notif);
}

export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationsEnabled(): boolean {
  return localStorage.getItem('notificationsEnabled') === 'true';
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem('notificationsEnabled', String(enabled));
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await api.post('/notifications/subscribe', existing.toJSON());
      return true;
    }
    const { publicKey } = await api.get<{ publicKey: string }>('/notifications/vapid-key');
    if (!publicKey) return false;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
    await api.post('/notifications/subscribe', subscription.toJSON());
    return true;
  } catch (err) {
    console.error('Push subscription failed:', err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await api.delete('/notifications/subscribe', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function showBookingNotification(title: string, body: string): Promise<void> {
  if (getNotificationsEnabled() && Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, {
      body,
      icon: '/icon-192-v2.png',
      badge: '/icon-192-v2.png',
    });
  }
}
