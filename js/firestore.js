import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, arrayUnion, arrayRemove, Timestamp, getDocs, runTransaction, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, dom } from './state.js';
import { renderRecords, renderCategoryMenu, groupCommonFaults } from './ui.js';

const appId = 'samtech-record-board';

export function setupCommonFaultsListener() {
    if (!state.db) return;
    if(state.commonFaultsUnsubscribe) state.commonFaultsUnsubscribe();

    const q = query(collection(state.db, `/artifacts/${appId}/public/data/records`), where('category', '==', 'common-fault'));
    state.commonFaultsUnsubscribe = onSnapshot(q, (snapshot) => {
        state.allCommonFaults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        groupCommonFaults();
        renderCategoryMenu();
        renderRecords();
    });
}
    
export function setupRecordsListener() {
    if (!state.db) return; 
    if (state.recordsUnsubscribe) state.recordsUnsubscribe();
    dom.loadingState.style.display = 'block';
    
    const constraints = [];
    if (state.currentStatusFilter === 'closed') {
        constraints.push(where('isClosed', '==', true));
    } else if (state.currentStatusFilter === 'open') {
        constraints.push(where('isClosed', '==', false));
    }
    
    constraints.push(orderBy('createdAt', 'desc'));

    const q = query(collection(state.db, `/artifacts/${appId}/public/data/records`), ...constraints);
    
    state.recordsUnsubscribe = onSnapshot(q, (snapshot) => {
        dom.loadingState.style.display = 'none';
        state.allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRecords();
    }, (error) => { console.error("Firestore error:", error); dom.loadingState.innerHTML = `<p class="text-red-500">Error loading data. A required index is likely missing. Check console (F12) for a link.</p>`; });
}

export async function cleanupInactiveUsers() {
    const twoMinutesAgo = Timestamp.fromMillis(Date.now() - 2 * 60 * 1000);
    const q = query(collection(state.db, 'presence'), where('lastSeen', '<', twoMinutesAgo));
    const snapshot = await getDocs(q);
    const batch = writeBatch(state.db);
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}
    
export function setupPresence() {
    if (!state.db || !state.currentUserDisplayName) return; 
    state.presenceRef = doc(state.db, 'presence', state.currentUserDisplayName);

    const updatePresence = () => {
        if(state.presenceRef) {
            setDoc(state.presenceRef, { name: state.currentUserDisplayName, lastSeen: serverTimestamp() }, { merge: true });
        }
    };
    
    updatePresence();
    setInterval(updatePresence, 60 * 1000);
    setInterval(cleanupInactiveUsers, 5 * 60 * 1000);

    if(state.presenceUnsubscribe) state.presenceUnsubscribe();
    state.presenceUnsubscribe = onSnapshot(query(collection(state.db, 'presence')), (snapshot) => {
        const users = new Set();
        snapshot.docs.forEach(doc => {
            const user = doc.data();
            if (user.name !== state.currentUserDisplayName) {
                users.add(user.name);
            }
        });
        
        dom.activeUsersList.innerHTML = '';
        if (users.size > 0) {
            users.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                dom.activeUsersList.appendChild(li);
            });
        } else {
            dom.activeUsersList.innerHTML = `<li class="text-slate-400">Only you</li>`;
        }
    });

    window.addEventListener('beforeunload', () => {
        if(state.presenceRef) deleteDoc(state.presenceRef);
    });
}

export async function removePresence() {
    if (state.presenceUnsubscribe) {
        state.presenceUnsubscribe();
        state.presenceUnsubscribe = null;
    }
    if (state.recordsUnsubscribe) {
        state.recordsUnsubscribe();
        state.recordsUnsubscribe = null;
    }
     if (state.commonFaultsUnsubscribe) {
        state.commonFaultsUnsubscribe();
        state.commonFaultsUnsubscribe = null;
    }
    if (state.presenceRef) {
        await deleteDoc(state.presenceRef);
        state.presenceRef = null;
    }
}
