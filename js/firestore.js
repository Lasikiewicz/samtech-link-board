import { getFirestore, doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, arrayUnion, arrayRemove, Timestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
