import admin from "firebase-admin";
import { logger } from "./logger";

let db: admin.database.Database | null = null;

function initFirebaseAdmin(): void {
  if (admin.apps.length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;

  if (!databaseURL) {
    throw new Error("VITE_FIREBASE_DATABASE_URL is not set");
  }

  if (!serviceAccountJson) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set — generate a service account key in Firebase Console → Project Settings → Service accounts"
    );
  }

  let serviceAccount: admin.ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL,
  });

  logger.info("Firebase Admin initialized");
}

export function getAdminDatabase(): admin.database.Database {
  if (db) return db;
  initFirebaseAdmin();
  db = admin.app().database();
  return db;
}

export function getAdminAuth(): admin.auth.Auth {
  initFirebaseAdmin();
  return admin.auth();
}

export async function readFirebasePath<T = unknown>(path: string): Promise<T> {
  const database = getAdminDatabase();
  const snap = await database.ref(path).once("value");
  return snap.val() as T;
}

export async function writeFirebasePath(path: string, value: unknown): Promise<void> {
  const database = getAdminDatabase();
  await database.ref(path).set(value);
}
