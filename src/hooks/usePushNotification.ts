'use client';
// ============================================================
// usePushNotification — Web Push (VAPID) Hook
// Registers Service Worker, requests permission, subscribes to push
// ============================================================

import { useState, useEffect, useCallback } from 'react';

type PermissionStatus = 'default' | 'granted' | 'denied' | 'unsupported';

interface PushState {
  permission: PermissionStatus;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotification(userId?: string) {
  const [state, setState] = useState<PushState>({
    permission: 'default',
    isSubscribed: false,
    isLoading: false,
    error: null,
  });

  // Check current state on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setState(prev => ({ ...prev, permission: 'unsupported' }));
      return;
    }

    setState(prev => ({
      ...prev,
      permission: Notification.permission as PermissionStatus,
    }));

    // Check if already subscribed
    checkSubscription();
  }, []);

  // Check existing subscription
  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setState(prev => ({ ...prev, isSubscribed: !!subscription }));
      }
    } catch {
      // Ignore errors
    }
  };

  // Get VAPID public key from server
  const getVapidKey = async (): Promise<string> => {
    const res = await fetch('/api/notifications/vapid');
    if (!res.ok) throw new Error('Failed to get VAPID key');
    const data = await res.json();
    return data.publicKey;
  };

  // Convert base64url to Uint8Array
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Subscribe to push notifications
  const subscribe = useCallback(async (currentUserId?: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check browser support
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('pushManager' in ServiceWorkerRegistration.prototype)) {
        setState(prev => ({ ...prev, isLoading: false, permission: 'unsupported', error: 'المتصفح لا يدعم الإشعارات' }));
        return false;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission: permission as PermissionStatus }));

      if (permission !== 'granted') {
        setState(prev => ({ ...prev, isLoading: false, error: permission === 'denied' ? 'تم رفض إذن الإشعارات' : null }));
        return false;
      }

      // Register Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[Push] Service Worker registered');

      // Get VAPID key
      const vapidKey = await getVapidKey();

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      console.log('[Push] Subscribed successfully');

      // Send subscription to server
      const uid = currentUserId || userId;
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid || 'anonymous',
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: Array.from(new Uint8Array(subscription.getKey('p256dh')!))
                .map(b => String.fromCharCode(b)).join(''),
              auth: Array.from(new Uint8Array(subscription.getKey('auth')!))
                .map(b => String.fromCharCode(b)).join(''),
            },
          },
          platform: 'web',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save subscription');
      }

      setState(prev => ({ ...prev, isLoading: false, isSubscribed: true }));
      return true;
    } catch (error: any) {
      console.error('[Push] Subscribe error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'فشل في الاشتراك في الإشعارات',
      }));
      return false;
    }
  }, [userId]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const registration = await navigator.serviceWorker?.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Unsubscribe from server
          await fetch('/api/notifications/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });

          // Unsubscribe from browser
          await subscription.unsubscribe();
          console.log('[Push] Unsubscribed successfully');
        }
      }

      setState(prev => ({ ...prev, isLoading: false, isSubscribed: false }));
    } catch (error: any) {
      console.error('[Push] Unsubscribe error:', error);
      setState(prev => ({ ...prev, isLoading: false, error: error.message }));
    }
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
    // Helpers
    canPrompt: state.permission === 'default',
    isSupported: state.permission !== 'unsupported',
    isDenied: state.permission === 'denied',
    isGranted: state.permission === 'granted',
  };
}
