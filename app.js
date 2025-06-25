import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, arrayUnion, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = { apiKey: "__API_KEY__", authDomain: "__AUTH_DOMAIN__", projectId: "__PROJECT_ID__", storageBucket: "__STORAGE_BUCKET__", messagingSenderId: "__MESSAGING_SENDER_ID__", appId: "__APP_ID__" };
const appId = 'samtech-record-board';
const SHARED_PASSWORD = "__SHARED_PASSWORD__" || "samtech";

// --- GLOBAL STATE ---
let app, db, recordsUnsubscribe;
let allRecords = [];
let currentUserDisplayName = '';

// --- DOM ELEMENTS ---
const dom = {
    authContainer: document.getElementById('auth-container'),
    appContainer: document.getElementById('app-container'),
    recordsContainer: document.getElementById('records-container'),
    loadingState: document.getElementById('loading-state'),
    authForm: document.getElementById('auth-form'),
    authPasswordInput: document.getElementById('auth-password'),
    authErrorEl: document.getElementById('auth-error'),
    logoutBtn: document.getElementById('logout-btn'),
    userNameDisplay: document.getElementById('user-name-display'),
    namePromptModal: document.getElementById('name-prompt-modal'),
    namePromptForm: document.getElementById('name-prompt-form'),
};

// --- INITIALIZATION ---
try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase initialization failed:", e);
    dom.authErrorEl.textContent = 'CRITICAL: Firebase init failed. Check API Keys.';
}

// --- CORE FUNCTIONS ---

/**
 * Renders all records to the page.
 */
const renderRecords = () => {
    dom.recordsContainer.innerHTML = '';
    if (allRecords.length === 0) {
        dom.recordsContainer.innerHTML = `<p class="text-slate-500 dark:text-slate-400">No records found.</p>`;
        return;
    }
    allRecords.forEach(record => {
        const card = renderRecordCard(record);
        dom.recordsContainer.appendChild(card);
    });
};

/**
 * Creates the HTML for a single record card.
 * @param {object} record - The record data from Firestore.
 * @returns {HTMLElement} The card element.
 */
const renderRecordCard = (record) => {
    const card = document.createElement('div');
    card.dataset.id = record.id;
    card.className = "record-card bg-white dark:bg-slate-800 p-5 rounded-xl shadow-lg";

    card.innerHTML = `
        <h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400">${record.title || 'No Title'}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400">${record.description || ''}</p>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-2">Added by: ${record.addedBy}</p>
        <div class="comments-section mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"></div>
    `;
    
    renderComments(card.querySelector('.comments-section'), record);

    return card;
};

/**
 * Renders the comments section for a single record.
 * @param {HTMLElement} container - The element to render the comments into.
 * @param {object} record - The record data.
 */
const renderComments = (container, record) => {
    container.innerHTML = `<h4 class="text-sm font-semibold mb-2">Comments</h4><div class="comments-list space-y-2"></div><form class="add-comment-form mt-3 flex items-start gap-2"><textarea placeholder="Add a comment..." class="flex-grow w-full text-sm p-2 border rounded"></textarea><button type="submit" class="bg-slate-600 text-white font-semibold px-4 py-2 rounded-lg">Post</button></form>`;

    const commentsList = container.querySelector('.comments-list');
    if (record.comments && record.comments.length > 0) {
        const sortedComments = [...record.comments].sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
        sortedComments.forEach(comment => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'bg-slate-100 dark:bg-slate-700 p-3 rounded-lg text-sm';
            commentDiv.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 mb-1">By: ${comment.addedBy} on ${new Date(comment.createdAt.seconds * 1000).toLocaleDateString()}</p><p>${comment.text}</p>`;
            commentsList.appendChild(commentDiv);
        });
    } else {
        commentsList.innerHTML = `<p class="text-xs text-slate-400">No comments yet.</p>`;
    }
};

/**
 * Sets up the real-time listener for records from Firestore.
 */
const setupRecordsListener = () => {
    if (recordsUnsubscribe) recordsUnsubscribe();
    dom.loadingState.style.display = 'block';

    const recordsCollection = collection(db, `/artifacts/${appId}/public/data/records`);
    const q = query(recordsCollection, orderBy("createdAt", "desc"));

    recordsUnsubscribe = onSnapshot(q, (snapshot) => {
        dom.loadingState.style.display = 'none';
        allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRecords();
    }, (error) => {
        console.error("Firestore error:", error);
        dom.loadingState.innerHTML = `<p class="text-red-500">Error loading data. Check console (F12) for details.</p>`;
    });
};

const showApp = () => {
    dom.authContainer.style.display = 'none';
    dom.namePromptModal.classList.add('hidden');
    dom.appContainer.style.display = 'block';
    dom.userNameDisplay.textContent = currentUserDisplayName;
    setupRecordsListener();
};

const showLogin = () => {
    dom.authContainer.style.display = 'flex';
    dom.appContainer.style.display = 'none';
    if (recordsUnsubscribe) recordsUnsubscribe();
};

// --- EVENT LISTENERS ---

dom.authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    dom.authErrorEl.textContent = '';
    if (dom.authPasswordInput.value === SHARED_PASSWORD) {
        sessionStorage.setItem('isLoggedIn', 'true');
        const storedName = sessionStorage.getItem('displayName');
        if (storedName) {
            currentUserDisplayName = storedName;
            showApp();
        } else {
            dom.namePromptModal.classList.remove('hidden');
        }
    } else {
        dom.authErrorEl.textContent = 'Incorrect password.';
    }
});

dom.namePromptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('user-display-name').value.trim();
    if (name) {
        currentUserDisplayName = name;
        sessionStorage.setItem('displayName', name);
        showApp();
    }
});

dom.logoutBtn.addEventListener('click', () => {
    sessionStorage.clear();
    showLogin();
});

dom.recordsContainer.addEventListener('submit', async (e) => {
    if (e.target.classList.contains('add-comment-form')) {
        e.preventDefault();
        const form = e.target;
        const textarea = form.querySelector('textarea');
        const text = textarea.value.trim();
        const submitBtn = form.querySelector('button');
        const recordId = form.closest('.record-card').dataset.id;
        
        if (!text) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '...';

        try {
            const comment = {
                text: text,
                addedBy: currentUserDisplayName,
                createdAt: Timestamp.now() 
            };
            await updateDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordId), {
                comments: arrayUnion(comment)
            });
            textarea.value = '';
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
    }
});

// --- INITIAL PAGE LOAD ---
if (sessionStorage.getItem('isLoggedIn') === 'true' && sessionStorage.getItem('displayName')) {
    currentUserDisplayName = sessionStorage.getItem('displayName');
    showApp();
} else {
    showLogin();
}
