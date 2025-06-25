// config.js

// This object contains all the secret keys for your Firebase project.
// The placeholders (__API_KEY__, etc.) are replaced by your GitHub Actions
// deployment script.
const firebaseConfig = { 
    apiKey: "__API_KEY__", 
    authDomain: "__AUTH_DOMAIN__", 
    projectId: "__PROJECT_ID__", 
    storageBucket: "__STORAGE_BUCKET__", 
    messagingSenderId: "__MESSAGING_SENDER_ID__", 
    appId: "__APP_ID__" 
};

// This is your application's unique ID used for the database path.
const appId = 'samtech-record-board';

// This holds the shared password for the application.
// The placeholder is replaced by the SHARED_PASSWORD secret in GitHub.
const SHARED_PASSWORD = "__SHARED_PASSWORD__" || "samtech";