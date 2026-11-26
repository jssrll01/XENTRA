import { Capacitor } from '@capacitor/core';

const FALLBACK = 'https://xentra.onrender.com';

export const isNative = () => Capacitor.isNativePlatform();

// Public web address used to build share, invite and QR links. Inside the iOS and Android apps
// the page origin is a local address, so the app build sets VITE_PUBLIC_URL (or uses the fallback).
export const appOrigin = () => String(import.meta.env.VITE_PUBLIC_URL || (isNative() ? FALLBACK : window.location.origin)).replace(/\/+$/, '');
