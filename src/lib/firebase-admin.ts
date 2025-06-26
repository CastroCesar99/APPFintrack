
import * as admin from 'firebase-admin';

// Ensure the service account key is available as an environment variable
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountString) {
  // In a production/deployed environment, this should be a hard error.
  // In development, you might see this if the .env.local is not set up.
  console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
}

let serviceAccount;
if (serviceAccountString) {
  try {
      // Attempt to parse the JSON string from the environment variable
      serviceAccount = JSON.parse(serviceAccountString);
  } catch (error) {
      console.error('CRITICAL: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string without extra quotes.');
      // If parsing fails, we cannot initialize admin, so we throw an error or handle it gracefully.
      // For this app, we'll let it fail loudly during server startup if misconfigured.
      throw new Error('Failed to parse Firebase service account key.');
  }
}

let adminApp: admin.app.App;

// Initialize the Admin SDK only if it hasn't been initialized yet
if (!admin.apps.length && serviceAccount) {
  try {
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully.");
  } catch(error) {
    console.error("Firebase Admin SDK initialization error:", error);
  }
} else if (admin.apps.length > 0) {
  adminApp = admin.app(); // Use the already initialized app
} else {
  // This case is reached if serviceAccount is undefined.
  // We need a placeholder or a way to handle this to avoid crashing server-side components that import this.
  console.warn("Firebase Admin SDK not initialized because service account key is missing.");
  // A "dummy" app could be created, but it's better to ensure the key is present.
  // For now, we'll let adminApp be undefined, and flows that need it will fail with a clear error.
  // @ts-ignore
  adminApp = undefined;
}


export { adminApp };
