import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, dom } from './js/state.js';
import { initializeEventListeners } from './js/events.js';
import { setupRecordsListener, setupCommonFaultsListener, setupPresence, removePresence } from './js/firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    // This is a placeholder that will be replaced by the build process.
    // It's defined here to avoid "not defined" errors if config.js fails to load.
    window.SHARED_PASSWORD = window.SHARED_PASSWORD || "__SHARED_PASSWORD__";

    // Populate the DOM object in the state module
    Object.assign(dom, {
        authContainer: document.getElementById('auth-container'), 
        appContainer: document.getElementById('app-container'),
        addRecordForm: document.getElementById('add-record-form'), 
        addRecordModal: document.getElementById('add-record-modal'),
        addNewRecordBtn: document.getElementById('add-new-record-btn'), 
        cancelAdd: document.getElementById('cancel-add'),
        recordsContainer: document.getElementById('records-container'), 
        loadingState: document.getElementById('loading-state'),
        searchInput: document.getElementById('search-input'),
        filterControls: document.getElementById('filter-controls'),
        userNameDisplay: document.getElementById('user-name-display'),
        logoutBtn: document.getElementById('logout-btn'),
        authForm: document.getElementById('auth-form'), 
        authPasswordInput: document.getElementById('auth-password'), 
        authErrorEl: document.getElementById('auth-error'),
        categoryMenu: document.getElementById('category-menu'),
        categoryFilterBar: document.getElementById('category-filter-bar'),
        formCategorySelector: document.getElementById('form-category-selector'), 
        formFieldsContainer: document.getElementById('form-fields-container'),
        editRecordModal: document.getElementById('edit-record-modal'), 
        editRecordForm: document.getElementById('edit-record-form'),
        editFormFieldsContainer: document.getElementById('edit-form-fields-container'), 
        cancelEdit: document.getElementById('cancel-edit'),
        deleteRecordBtn: document.getElementById('delete-record-btn'), 
        manageLinksBtn: document.getElementById('manage-links-btn'),
        editTimeModal: document.getElementById('edit-time-modal'), 
        editTimeForm: document.getElementById('edit-time-form'), 
        cancelTimeEdit: document.getElementById('cancel-time-edit'),
        namePromptModal: document.getElementById('name-prompt-modal'), 
        namePromptForm: document.getElementById('name-prompt-form'),
        confirmDeleteModal: document.getElementById('confirm-delete-modal'), 
        cancelDelete: document.getElementById('cancel-delete'), 
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        linkFaultModal: document.getElementById('link-fault-modal'), 
        existingFaultsList: document.getElementById('existing-faults-list'), 
        skipLinkBtn: document.getElementById('skip-link-btn'), 
        confirmLinkBtn: document.getElementById('confirm-link-btn'),
        linkUnlinkModal: document.getElementById('link-unlink-modal'), 
        closeLinkUnlinkModal: document.getElementById('close-link-unlink-modal'),
        unlinkList: document.getElementById('unlink-list'), 
        linkList: document.getElementById('link-list'),
        activeUsersList: document.getElementById('active-users-list'),
        logoImg: document.getElementById('logo-img'),
        editCommentModal: document.getElementById('edit-comment-modal'),
        editCommentForm: document.getElementById('edit-comment-form'),
        cancelCommentEdit: document.getElementById('cancel-comment-edit'),
    });

    // Initialize Firebase and Firestore
    try { 
        state.app = getApps().length ? getApp() : initializeApp(window.firebaseConfig); 
        state.db = getFirestore(state.app); 
    } catch (e) { 
        console.error("Firebase init failed:", e); 
        if (dom.loadingState) {
            dom.loadingState.innerHTML = `<p class="text-red-500">Could not connect to the database. Please check your Firebase configuration and ensure the Firestore API is enabled in your Google Cloud project.</p>`;
        }
        return; // Stop execution if Firebase fails
    }

    initializeEventListeners();

    // Initial check for authentication state
    if (sessionStorage.getItem('isLoggedIn') === 'true' && sessionStorage.getItem('displayName')) {
        state.currentUserDisplayName = sessionStorage.getItem('displayName');
        showApp();
    } else {
        showLogin();
    }
});

export function showApp() { 
    dom.authContainer.style.display = 'none'; 
    dom.namePromptModal.classList.add('hidden'); 
    dom.appContainer.style.display = 'block'; 
    dom.userNameDisplay.textContent = state.currentUserDisplayName; 
    setupRecordsListener(); 
    setupCommonFaultsListener();
    setupPresence();
}

export function showLogin() { 
    dom.authContainer.style.display = 'flex'; 
    dom.appContainer.style.display = 'none'; 
    removePresence(); // This will also unsubscribe listeners
}
