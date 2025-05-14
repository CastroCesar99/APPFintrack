
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore"; // Import Firestore

// Explicitly read environment variables
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

// Check if all required Firebase environment variables are set
if (
  !apiKey ||
  !authDomain ||
  !projectId ||
  !storageBucket ||
  !messagingSenderId ||
  !appId
) {
  console.error(
    "CRITICAL Firebase Configuration Error: One or more Firebase environment variables are missing. " +
    "Please ensure your .env.local file is correctly created in the root of your project and contains all the following variables prefixed with NEXT_PUBLIC_:\n" +
    "  NEXT_PUBLIC_FIREBASE_API_KEY\n" +
    "  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN\n" +
    "  NEXT_PUBLIC_FIREBASE_PROJECT_ID\n" +
    "  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET\n" +
    "  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID\n" +
    "  NEXT_PUBLIC_FIREBASE_APP_ID\n" +
    "Values should be copied exactly from your Firebase project settings.\n" +
    "IMPORTANT: After creating or updating the .env.local file, you MUST restart your Next.js development server for the changes to take effect."
  );
}

const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
};

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app); // Initialize Firestore

export { app, auth, db }; // Export db
