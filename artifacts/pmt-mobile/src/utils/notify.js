import { auth } from '../firebase.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function sendNotification(type, data) {
  try {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    await fetch(`${API_BASE}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ type, data }),
    });
  } catch {
    // Silently ignore — notifications are non-critical
  }
}
