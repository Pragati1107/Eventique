import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';

/* Server address: set EXPO_PUBLIC_API_URL, or "extra.apiUrl" in app.json.
   On a real phone use your computer's LAN IP (e.g. http://192.168.1.10:4000), not localhost. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000').replace(/\/$/, '');
export const img = (name) => `${API_URL}/img/${name}.webp`;

let token = null;
export async function loadToken() { token = await SecureStore.getItemAsync('evq-token'); return token; }
export async function setToken(t) { token = t; if (t) await SecureStore.setItemAsync('evq-token', t); else await SecureStore.deleteItemAsync('evq-token'); }

export async function api(method, path, body, isForm) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  } catch (e) {
    throw new Error(`Can't reach the Eventique server at ${API_URL}. Check your connection.`);
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong. Please try again.'); err.status = res.status; throw err; }
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b || {});
export const patch = (p, b) => api('PATCH', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);

/** Upload a local image (from expo-image-picker) as multipart form data. */
export function upload(path, uri, field = 'file', extra = {}) {
  const form = new FormData();
  const name = uri.split('/').pop() || 'photo.jpg';
  const type = /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg';
  form.append(field, { uri, name, type });
  Object.entries(extra).forEach(([k, v]) => form.append(k, String(v)));
  return api('POST', path, form, true);
}

let socket = null;
export function connectSocket(handlers) {
  if (socket) socket.disconnect();
  if (!token) return null;
  socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
  Object.entries(handlers).forEach(([evt, fn]) => socket.on(evt, fn));
  return socket;
}
export function disconnectSocket() { if (socket) socket.disconnect(); socket = null; }

export const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} hr` : fmtDate(String(d).slice(0, 10)); };
