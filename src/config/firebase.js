import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let initialized = false;

export const initFirebase = () => {
  if (initialized) return;

  try {
    // Attempt to load from JSON file if present
    const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized with service account file');
      initialized = true;
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      // Alternative: Load from Base64 env variable
      const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized with base64 env');
      initialized = true;
    } else {
      console.warn('Firebase Admin NOT initialized: No credentials found (firebase-service-account.json or FIREBASE_SERVICE_ACCOUNT_BASE64). FCM will be disabled.');
    }
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

export const getFirebaseAdmin = () => {
  return initialized ? admin : null;
};
