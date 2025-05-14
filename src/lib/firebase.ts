
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "firebase/firestore";

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
let db: Firestore;
let auth: Auth;

// Define the specific database ID you want to use
const databaseId = "fintrackdatabase";

if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    // Initialize Firestore with the specific database ID
    db = getFirestore(app, databaseId);
    auth = getAuth(app);
    if (typeof window !== 'undefined') { // Ensure this only runs on the client
      enableIndexedDbPersistence(db, { // Pass the specific db instance here
          synchronizeTabs: true,
          cacheSizeBytes: CACHE_SIZE_UNLIMITED
        })
        .then(() => {
          console.log(`Firestore offline persistence enabled successfully for database '${databaseId}'.`);
        })
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn(`Firestore offline persistence for database '${databaseId}' failed: Multiple tabs open or other precondition not met. Data will not be synced offline across tabs.`);
          } else if (err.code === 'unimplemented') {
            console.warn(`Firestore offline persistence for database '${databaseId}' failed: The current browser does not support all of the features required to enable persistence.`);
          } else {
            console.error(`Firestore offline persistence for database '${databaseId}' failed with error: `, err);
          }
        }
      );
    }
  } catch (error) {
    console.error("An error occurred during Firebase initialization:", error);
    // Ensure db and auth are potentially null or handled if initialization fails critically
    // Depending on the error, you might want to throw it or set a global error state
  }
} else {
  app = getApps()[0];
  // Ensure db is initialized with the specific database ID in this path too
  db = getFirestore(app, databaseId);
  auth = getAuth(app);
}

// Fallback if db somehow didn't get initialized (e.g. critical error during init)
// This is a defensive measure; ideally, critical init errors should be handled more robustly.
if (!db && app) {
    console.warn("Firestore db was not initialized during the primary block, attempting fallback initialization for database:", databaseId);
    db = getFirestore(app, databaseId);
}
if (!auth && app) {
    console.warn("Firebase Auth was not initialized during the primary block, attempting fallback initialization.");
    auth = getAuth(app);
}


export { app, auth, db };
