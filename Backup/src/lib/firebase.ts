
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { 
  initializeAuth, 
  getAuth, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  type Auth 
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { getFirestore, type Firestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "firebase/firestore";

// Explicitly read environment variables
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

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
  // Ensure the authDomain is correct for both dev and prod
  authDomain: authDomain || `${projectId}.firebaseapp.com`,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
};

let app: FirebaseApp = undefined as any;
let db: Firestore = undefined as any;
let auth: Auth = undefined as any;

if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    // Initialize Firestore, potentially with a specific database ID
    db = getFirestore(app);
    // Custom Auth Initialization for Capacitor / Web
    if (Capacitor.isNativePlatform()) {
      auth = initializeAuth(app, {
        persistence: indexedDBLocalPersistence
      });
      console.log("Firebase Auth initialized with indexedDBLocalPersistence (Native)");
    } else {
      auth = getAuth(app);
      console.log("Firebase Auth initialized with default persistence (Web)");
    }
    if (typeof window !== 'undefined') { // Ensure this only runs on the client
      // Commenting out enableIndexedDbPersistence to debug potential issues with offline persistence
      // enableIndexedDbPersistence(db, { // Pass the specific db instance here
      //  cacheSizeBytes: CACHE_SIZE_UNLIMITED
      // })
      // .then(() => {
      //   console.log(`Firestore offline persistence enabled successfully.`);
      // })
      // .catch((err) => {
      //   if (err.code === 'failed-precondition') {
      //     console.warn(`Firestore offline persistence failed: Multiple tabs open or other precondition not met. Data will not be synced offline across tabs.`);
      //   } else if (err.code === 'unimplemented') {
      //     console.warn(`Firestore offline persistence failed: The current browser does not support all of the features required to enable persistence.`);
      //   } else {
      //     console.error(`Firestore offline persistence failed with error: `, err);
      //   }
      // }
      // );
    }
  } catch (error) {
    console.error("An error occurred during Firebase initialization:", error);
    // Ensure db and auth are potentially null or handled if initialization fails critically
    // Depending on the error, you might want to throw it or set a global error state
  }
} else {
  app = getApps()[0];
  // Ensure db is initialized with the specific database ID in this path too
  db = getFirestore(app, (databaseId as string)); // Use databaseId here as well
  if (Capacitor.isNativePlatform()) {
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    });
  } else {
    auth = getAuth(app);
  }
}

// Fallback if db somehow didn't get initialized (e.g. critical error during init)
// This is a defensive measure; ideally, critical init errors should be handled more robustly.
if (!db && app) {
    console.warn("Firestore db was not initialized during the primary block, attempting fallback initialization for database:", databaseId);
    db = getFirestore(app, (databaseId as string));
}
if (!auth && app) {
    console.warn("Firebase Auth was not initialized during the primary block, attempting fallback initialization.");
    auth = getAuth(app);
}


export { app, auth, db };
