
import * as admin from 'firebase-admin';

// This function will be responsible for initializing the admin app
// to ensure it's only called once and handles errors gracefully.
const initializeAdminApp = () => {
  // If the app is already initialized, return the existing instance
  if (admin.apps.length > 0) {
    console.log("Firebase Admin SDK already initialized.");
    return admin.app();
  }

  // Ensure the service account key is available as an environment variable
  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountString) {
    console.error('CRITICAL_ERROR: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. The Admin SDK cannot be initialized.');
    return null; // Return null if the key is missing
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountString);
  } catch (error) {
    console.error('CRITICAL_ERROR: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string. The Admin SDK cannot be initialized.', error);
    return null; // Return null if parsing fails
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully.");
    return app;
  } catch (error) {
    console.error("Firebase Admin SDK initialization error:", error);
    return null; // Return null on initialization failure
  }
};

// Call the initialization function and export the app instance.
// It will be null if initialization fails.
const adminApp = initializeAdminApp();

export { adminApp };
