
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "firebase/firestore"; // Import Firestore and persistence

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

if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    if (typeof window !== 'undefined') { // Ensure this only runs on the client
      enableIndexedDbPersistence(db, {
          synchronizeTabs: true,
          cacheSizeBytes: CACHE_SIZE_UNLIMITED
        })
        .then(() => {
          console.log("Firestore offline persistence enabled successfully.");
        })
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn("Firestore offline persistence failed: Multiple tabs open or other precondition not met. Data will not be synced offline across tabs.");
          } else if (err.code === 'unimplemented') {
            console.warn("Firestore offline persistence failed: The current browser does not support all of the features required to enable persistence.");
          } else {
            console.error("Firestore offline persistence failed with error: ", err);
          }
        }
      );
    }
  } catch (error) {
    console.error("An error occurred during Firebase initialization:", error);
  }
} else {
  app = getApps()[0];
  db = getFirestore(app); // Ensure db is initialized in this path too
  auth = getAuth(app);   // Ensure auth is initialized in this path too
}


export { app, auth, db }; // Export db
