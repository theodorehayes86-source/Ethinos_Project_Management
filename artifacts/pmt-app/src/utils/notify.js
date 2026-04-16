const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function sendNotification(type, data) {
  try {
    await fetch(`${API_BASE}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
  } catch {
    // Silently ignore — notifications are non-critical and should never interrupt user workflow
  }
}
