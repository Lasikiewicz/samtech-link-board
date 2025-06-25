import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, arrayUnion, arrayRemove, Timestamp, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "__API_KEY__", authDomain: "__AUTH_DOMAIN__", projectId: "__PROJECT_ID__", storageBucket: "__STORAGE_BUCKET__", messagingSenderId: "__MESSAGING_SENDER_ID__", appId: "__APP_ID__" };
const appId = 'samtech-record-board';
const SHARED_PASSWORD = "__SHARED_PASSWORD__" || "samtech";

let app, db, recordsUnsubscribe;
let allRecords = []; // This will hold the full dataset from the current main filter
let groupedFaults = new Map();
let currentSort = 'newest', currentSearch = '', currentCategory = '', currentFilter = 'all', currentUserDisplayName = '';
let recordToDelete = null;
let expandedRecordIds = new Set();
let pendingRecordData = null;
let isInitialLoad = true;

try { app = getApps().length ? getApp() : initializeApp(firebaseConfig); db = getFirestore(app); } catch (e) { console.error("Firebase init failed:", e); }

const dom = {
    authContainer: document.getElementById('auth-container'), appContainer: document.getElementById('app-container'),
    addRecordForm: document.getElementById('add-record-form'), addRecordModal: document.getElementById('add-record-modal'),
    addNewRecordBtn: document.getElementById('add-new-record-btn'), cancelAdd: document.getElementById('cancel-add'),
    recordsContainer: document.getElementById('records-container'), loadingState: document.getElementById('loading-state'),
    searchInput: document.getElementById('search-input'), sortControls: document.getElementById('sort-controls'),
    filterControls: document.getElementById('filter-controls'), userNameDisplay: document.getElementById('user-name-display'),
    logoutBtn: document.getElementById('logout-btn'),
    authForm: document.getElementById('auth-form'), authPasswordInput: document.getElementById('auth-password'), authErrorEl: document.getElementById('auth-error'),
    darkModeToggle: document.getElementById('dark-mode-toggle'), sunIcon: document.getElementById('sun-icon'), moonIcon: document.getElementById('moon-icon'),
    categoryMenu: document.getElementById('category-menu'),
    formCategorySelector: document.getElementById('form-category-selector'), formFieldsContainer: document.getElementById('form-fields-container'),
    editRecordModal: document.getElementById('edit-record-modal'), editRecordForm: document.getElementById('edit-record-form'),
    editFormFieldsContainer: document.getElementById('edit-form-fields-container'), cancelEdit: document.getElementById('cancel-edit'),
    deleteRecordBtn: document.getElementById('delete-record-btn'),
    editTimeModal: document.getElementById('edit-time-modal'), editTimeForm: document.getElementById('edit-time-form'), cancelTimeEdit: document.getElementById('cancel-time-edit'),
    namePromptModal: document.getElementById('name-prompt-modal'), namePromptForm: document.getElementById('name-prompt-form'),
    confirmDeleteModal: document.getElementById('confirm-delete-modal'), cancelDelete: document.getElementById('cancel-delete'), confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    linkFaultModal: document.getElementById('link-fault-modal'), existingFaultsList: document.getElementById('existing-faults-list'), skipLinkBtn: document.getElementById('skip-link-btn'), confirmLinkBtn: document.getElementById('confirm-link-btn')
};

const formInputClasses = "w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500";
const formFieldsTemplates = {
    qa: `<input name="title" type="text" placeholder="Q&A Title" class="${formInputClasses}" required><input name="qaId" type="text" placeholder="Q&A Question ID" pattern="\\d{8}" title="8 digits" class="${formInputClasses}" required><input name="modelNumber" type="text" placeholder="Model Number" class="${formInputClasses}"><input name="serialNumber" type="text" placeholder="Serial Number" class="${formInputClasses}"><input name="serviceOrderNumber" type="text" placeholder="Service Order Number" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"><input name="salesforceCaseNumber" type="text" placeholder="Salesforce Case Number" class="${formInputClasses}"><textarea name="description" placeholder="Description" class="${formInputClasses}" rows="4"></textarea>`,
    'common-fault': `<input name="title" type="text" placeholder="Title" class="${formInputClasses}" required><input name="modelNumber" type="text" placeholder="Model Number" class="${formInputClasses}"><input name="serialNumber" type="text" placeholder="Serial Number" class="${formInputClasses}"><input name="serviceOrderNumber" type="text" placeholder="Service Order Number" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"><input name="salesforceCaseNumber" type="text" placeholder="Salesforce Case Number" class="${formInputClasses}"><textarea name="description" placeholder="Description" class="${formInputClasses}" rows="4"></textarea><label class="flex items-center mt-4"><input type="checkbox" name="onSamsungTracker" class="rounded mr-2"> On Samsung Action Tracker</label>`,
    general: `<input name="title" type="text" placeholder="Title" class="${formInputClasses}" required><input name="modelNumber" type="text" placeholder="Model Number" class="${formInputClasses}"><input name="serialNumber" type="text" placeholder="Serial Number" class="${formInputClasses}"><input name="serviceOrderNumber" type="text" placeholder="Service Order Number" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"><input name="salesforceCaseNumber" type="text" placeholder="Salesforce Case Number" class="${formInputClasses}"><textarea name="description" placeholder="Description" class="${formInputClasses}" rows="4"></textarea>`
};

let currentFormCategory = 'qa';
const setFormCategory = (category, container, record = {}) => {
    currentFormCategory = category;
    container.innerHTML = formFieldsTemplates[category];
    for (const key in record) {
        const input = container.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') input.checked = !!record[key];
            else input.value = record[key];
        }
    }
    if (container.id === 'form-fields-container') dom.formCategorySelector.querySelectorAll('.form-category-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.category === category));
};

const formatDateTime = (timestamp) => timestamp?.seconds ? new Date(timestamp.seconds * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

const groupCommonFaults = () => {
    const commonFaults = allRecords.filter(r => r.category === 'common-fault');
    const recordMap = new Map(commonFaults.map(r => [r.id, r]));
    const groups = new Map();
    const visited = new Set();

    for (const fault of commonFaults) {
        if (visited.has(fault.id)) continue;
        
        let currentGroupIds = new Set([fault.id]);
        let queue = [fault];
        visited.add(fault.id);

        while (queue.length > 0) {
            const currentFault = queue.shift();
            const allRelated = [...(currentFault.relatedTo || []), ...(currentFault.relatedBy || [])];
            for(const related of allRelated) {
                 if (recordMap.has(related.id) && !visited.has(related.id)) {
                    visited.add(related.id);
                    currentGroupIds.add(related.id);
                    queue.push(recordMap.get(related.id));
                }
            }
        }
        
        const groupRecords = Array.from(currentGroupIds).map(id => recordMap.get(id));
        groupRecords.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        const rootRecord = groupRecords[0];
        if (rootRecord) {
            groups.set(rootRecord.id, { title: rootRecord.title, records: groupRecords });
        }
    }
    groupedFaults = groups;
};

const renderCategoryMenu = () => {
    dom.categoryMenu.innerHTML = '';
    const categories = { '': 'All Records', qa: 'Q&A', 'common-fault': 'Common Faults', general: 'General' };

    const createBtn = (id, text, level = 0, isGroupTitle = false) => {
        const btn = document.createElement('button');
        btn.dataset.id = id;
        btn.textContent = text;
        btn.title = text;
        btn.className = `category-menu-item w-full text-left px-3 py-2 rounded-md text-sm truncate hover:bg-slate-200 dark:hover:bg-slate-700`;
        if (level > 0) btn.style.paddingLeft = `${0.75 + (level * 0.75)}rem`;
        if (isGroupTitle) btn.classList.add('font-semibold');
        if (currentCategory === id) btn.classList.add('active');
        btn.addEventListener('click', () => { 
            currentCategory = id; 
            currentFilter = 'all'; 
            dom.filterControls.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
            dom.filterControls.querySelector(`[data-filter="all"]`).classList.add('active');
            setupRecordsListener();
        });
        return btn;
    }

    dom.categoryMenu.appendChild(createBtn('', 'All Records'));
    dom.categoryMenu.appendChild(createBtn('qa', 'Q&A'));
    dom.categoryMenu.appendChild(createBtn('common-fault', 'Common Faults'));

    if (groupedFaults.size > 0) {
        const details = document.createElement('details');
        details.className = 'pl-4';
        details.innerHTML = `<summary class="cursor-pointer text-sm font-medium py-1">Linked Faults</summary>`;
        if (groupedFaults.has(currentCategory)) {
            details.open = true;
        }
        const subList = document.createElement('div');
        subList.className = 'ml-2 border-l border-slate-200 dark:border-slate-700';
        groupedFaults.forEach((group, groupId) => {
            const groupBtn = createBtn(groupId, group.title, 1, true);
            subList.appendChild(groupBtn);
        });
        details.appendChild(subList);
        dom.categoryMenu.appendChild(details);
    }
    dom.categoryMenu.appendChild(createBtn('general', 'General'));
};

const getRecordGroupId = (recordId) => {
    for (const [groupId, group] of groupedFaults.entries()) {
        if(group.records.some(r => r.id === recordId)) {
            return groupId;
        }
    }
    return null;
};

const renderRecordCard = (record) => {
    const card = document.createElement('div');
    card.dataset.id = record.id;
    card.className = `record-card bg-white dark:bg-slate-800 p-5 rounded-xl shadow-lg transition-all ${record.isClosed ? 'opacity-60' : ''}`;
    if (expandedRecordIds.has(record.id)) card.classList.add('expanded');
    
    const detailsHtml = `${record.qaId?`<div><dt class="font-semibold">Q&A ID:</dt><dd class="break-all">${record.qaId}</dd></div>`:''}${record.modelNumber?`<div><dt class="font-semibold">Model Number:</dt><dd class="break-all">${record.modelNumber}</dd></div>`:''}${record.serialNumber?`<div><dt class="font-semibold">Serial Number:</dt><dd class="break-all">${record.serialNumber}</dd></div>`:''}${record.serviceOrderNumber?`<div><dt class="font-semibold">Service Order Number:</dt><dd class="break-all">${record.serviceOrderNumber}</dd></div>`:''}${record.salesforceCaseNumber?`<div><dt class="font-semibold">Salesforce Case Number:</dt><dd class="break-all">${record.salesforceCaseNumber}</dd></div>`:''}`;
    const categoryDisplayNames = { qa: 'Q&A', 'common-fault': 'Common Fault', general: 'General' };
    const categoryColors = { qa: '#5fcae2', 'common-fault': '#4892cf', general: '#3f57ab' };
    const groupId = getRecordGroupId(record.id);
    const linkedRecordsHtml = groupId ? `<div class="mt-2"><dt class="font-semibold">Linked Faults:</dt><dd><button class="linked-fault-btn text-indigo-600 dark:text-indigo-400 underline" data-group-id="${groupId}">View Group</button></dd></div>` : '';

    card.innerHTML = `<div class="collapsible-header flex justify-between items-start cursor-pointer record-header"><div class="flex items-center gap-3"><span class="text-xs capitalize text-white px-2 py-0.5 rounded-full" style="background-color: ${categoryColors[record.category] || '#64748b'}">${categoryDisplayNames[record.category] || record.category}</span><h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400 break-all">${record.title}</h3></div><div class="flex items-center gap-2">${record.onSamsungTracker ? '<span class="text-xs font-bold bg-green-500 text-white px-2 py-1 rounded-full">Samsung Action Tracker</span>' : ''}${record.isClosed?'<span class="text-xs font-bold bg-slate-500 text-white px-2 py-1 rounded-full">CLOSED</span>':''}<div class="actions flex-shrink-0 ml-4 space-x-2"></div><svg class="chevron h-5 w-5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg></div></div><div class="collapsible-content details-container"><div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-sm space-y-2"><dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">${detailsHtml}${linkedRecordsHtml}</dl>${record.description?`<div class="pt-2"><p class="whitespace-pre-wrap">${record.description}</p></div>`:''}</div><div class="comments-section mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"></div><p class="text-xs text-slate-400 dark:text-slate-500 mt-4">Added by <span class="font-mono">${record.addedBy}</span> on ${formatDateTime(record.createdAt)}</p></div>`;
    
    return card;
};

const renderComments = (container, record) => {
    container.innerHTML = `<div class="collapsible-header flex justify-between items-center cursor-pointer"><h4 class="text-sm font-semibold">Updates & Comments</h4><svg class="chevron h-5 w-5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg></div><div class="collapsible-content"><div class="comments-list mt-2 space-y-3 pr-2"></div>${!record.isClosed ? '<form class="add-comment-form mt-3 flex items-start gap-2"><textarea placeholder="Add a comment..." class="flex-grow w-full text-sm px-3 py-2 border rounded" rows="2"></textarea><button type="submit" class="bg-slate-600 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-slate-700 flex-shrink-0 disabled:opacity-50">Post</button></form>' : ''}</div>`;
    
    const commentsList = container.querySelector('.comments-list');
    if (record.comments && record.comments.length > 0) {
         const sortedComments = record.comments.map(c => ({...c, date: c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : new Date() })).sort((a,b) => a.date - b.date);
        sortedComments.forEach((comment, index) => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'bg-slate-100 dark:bg-slate-700 p-3 rounded-lg text-sm';
            commentDiv.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 mb-1">By: <span class="font-mono">${comment.addedBy}</span> at ${formatDateTime(comment.createdAt)}</p><div class="comment-body flex justify-between items-start"><p class="comment-text break-words whitespace-pre-wrap flex-grow">${comment.text || ''}</p><div class="comment-actions flex-shrink-0 ml-2 space-x-2"><button class="edit-comment-btn" data-index="${index}" title="Edit">&#9998;</button><button class="delete-comment-btn" data-index="${index}" title="Delete">&#10006;</button></div></div>`;
            commentsList.appendChild(commentDiv);
        });
    } else { commentsList.innerHTML = '<p class="text-xs text-slate-400 dark:text-slate-500">No comments yet.</p>'; }
};

const renderRecords = () => {
     let recordsToDisplay = [...allRecords];
    if (currentCategory) {
        if(groupedFaults.has(currentCategory)) {
             recordsToDisplay = groupedFaults.get(currentCategory).records;
        } else {
            recordsToDisplay = recordsToDisplay.filter(r => r.category === currentCategory);
        }
    }
    if (currentSearch) recordsToDisplay = recordsToDisplay.filter(r => Object.values(r).join(' ').toLowerCase().includes(currentSearch));
    
    dom.recordsContainer.innerHTML = '';
    if (recordsToDisplay.length === 0) { dom.recordsContainer.innerHTML = `<p class="text-slate-500 dark:text-slate-400">No records match your current filters.</p>`; return; }
    recordsToDisplay.forEach(recordData => dom.recordsContainer.appendChild(renderRecordCard(recordData)));
};

const openEditModal = (record) => { dom.editRecordForm.querySelector('[name="id"]').value = record.id; setFormCategory(record.category, dom.editFormFieldsContainer, record); dom.editRecordModal.classList.remove('hidden'); };
const openTimeEditModal = (record) => {
    const form = dom.editTimeForm;
    form.querySelector('[name="id"]').value = record.id;
    const date = record.createdAt.seconds ? new Date(record.createdAt.seconds * 1000) : new Date();
    const localISOString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    form.querySelector('#edit-time-input').value = localISOString;
    dom.editTimeModal.classList.remove('hidden');
};

const setupRecordsListener = () => {
    if (recordsUnsubscribe) recordsUnsubscribe();
    dom.loadingState.style.display = 'block';
    
    const constraints = [];
    if (currentFilter === 'my') constraints.push(where('addedBy', '==', currentUserDisplayName));
    else if (currentFilter === 'open') constraints.push(where('isClosed', '==', false));
    else if (currentFilter === 'closed') constraints.push(where('isClosed', '==', true));
    
    const sortField = currentSort === 'alpha' ? 'title' : 'createdAt';
    const sortDirection = currentSort === 'oldest' ? 'asc' : 'desc';
    constraints.push(orderBy(sortField, sortDirection));

    const q = query(collection(db, `/artifacts/${appId}/public/data/records`), ...constraints);
    
    recordsUnsubscribe = onSnapshot(q, (snapshot) => {
        dom.loadingState.style.display = 'none';
        allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        groupCommonFaults();
        renderRecords();
        renderCategoryMenu();
        if (isInitialLoad && currentSort === 'newest' && allRecords.length > 0) {
            expandedRecordIds.add(allRecords[0].id);
            renderRecords();
            isInitialLoad = false;
        }
    }, (error) => { console.error("Firestore error:", error); dom.loadingState.innerHTML = `<p class="text-red-500">Error loading data. A required index is likely missing. Check console (F12) for a link.</p>`; });
};

const showApp = () => { dom.authContainer.style.display = 'none'; dom.namePromptModal.classList.add('hidden'); dom.appContainer.style.display = 'block'; dom.userNameDisplay.textContent = currentUserDisplayName; setupRecordsListener(); };
const showLogin = () => { dom.authContainer.style.display = 'flex'; dom.appContainer.style.display = 'none'; if (recordsUnsubscribe) recordsUnsubscribe(); };

dom.searchInput.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); renderRecords(); });
[dom.sortControls, dom.filterControls].forEach(container => {
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.control-btn');
        if (btn) {
            if (btn.dataset.sort) currentSort = btn.dataset.sort;
            if (btn.dataset.filter) currentFilter = btn.dataset.filter;
            dom.searchInput.value = ''; currentSearch = '';
            container.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            isInitialLoad = true;
            setupRecordsListener();
        }
    });
});

dom.addNewRecordBtn.addEventListener('click', () => { setFormCategory('qa', dom.formFieldsContainer); dom.addRecordModal.classList.remove('hidden'); });
dom.cancelAdd.addEventListener('click', () => dom.addRecordModal.classList.add('hidden'));
dom.cancelEdit.addEventListener('click', () => dom.editRecordModal.classList.add('hidden'));
dom.cancelTimeEdit.addEventListener('click', () => dom.editTimeModal.classList.add('hidden'));
dom.deleteRecordBtn.addEventListener('click', () => { recordToDelete = dom.editRecordForm.querySelector('[name="id"]').value; dom.confirmDeleteModal.classList.remove('hidden'); });
dom.cancelDelete.addEventListener('click', () => { recordToDelete = null; dom.confirmDeleteModal.classList.add('hidden'); });
dom.confirmDeleteBtn.addEventListener('click', async () => { if (recordToDelete) { await deleteDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordToDelete)); dom.editRecordModal.classList.add('hidden'); dom.confirmDeleteModal.classList.add('hidden'); recordToDelete = null; } });

// --- MAIN EVENT DELEGATION LISTENER ---
dom.recordsContainer.addEventListener('click', async (e) => {
    const recordCard = e.target.closest('.record-card');
    if (!recordCard) return;
    const recordId = recordCard.dataset.id;
    const record = allRecords.find(r => r.id === recordId);
    if (!record) return;

    // Handle record expansion/collapse
    if (e.target.closest('.record-header') && !e.target.closest('.actions')) {
        const isCurrentlyExpanded = recordCard.classList.contains('expanded');
        
        dom.recordsContainer.querySelectorAll('.record-card').forEach(c => c.classList.remove('expanded'));
        expandedRecordIds.clear();

        if (!isCurrentlyExpanded) {
            recordCard.classList.add('expanded');
            recordCard.querySelector('.comments-section')?.classList.add('expanded');
            expandedRecordIds.add(recordId);
        }
        return;
    }
    
    // Handle comments section collapse/expand
    if(e.target.closest('.comments-section > .collapsible-header')) {
        e.target.closest('.comments-section').classList.toggle('expanded');
        return;
    }

    // Handle submitting a new comment
    if (e.target.closest('.add-comment-form') && e.target.tagName === 'BUTTON') {
        e.preventDefault();
        const form = e.target.closest('form');
        const textarea = form.querySelector('textarea');
        const text = textarea.value.trim();
        const submitBtn = form.querySelector('button');
        
        if (!text) return;
        submitBtn.disabled = true;
        submitBtn.textContent = '...';
        try {
            await updateDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordId), { 
                comments: arrayUnion({ text, addedBy: currentUserDisplayName, createdAt: Timestamp.now() }) 
            });
            textarea.value = '';
            expandedRecordIds.add(recordId); // Ensure it stays open
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
        return;
    }

    // Handle editing a comment
    if(e.target.classList.contains('edit-comment-btn')) {
        const commentBody = e.target.closest('.comment-body');
        const commentIndex = parseInt(e.target.dataset.index);
        const currentText = commentBody.querySelector('.comment-text').textContent;
        commentBody.innerHTML = `<textarea class="edit-comment-textarea flex-grow w-full text-sm p-2 border rounded">${currentText}</textarea><div class="flex flex-col ml-2 space-y-1"><button class="save-comment-btn text-xs bg-green-500 text-white px-2 py-1 rounded" data-index="${commentIndex}">Save</button><button class="cancel-comment-btn text-xs bg-gray-500 text-white px-2 py-1 rounded">Cancel</button></div>`;
        return;
    }

    // Handle saving an edited comment
    if(e.target.classList.contains('save-comment-btn')) {
        const commentIndex = parseInt(e.target.dataset.index);
        const newText = e.target.closest('.comment-body').querySelector('.edit-comment-textarea').value;
        const recordRef = doc(db, `/artifacts/${appId}/public/data/records`, recordId);
        await runTransaction(db, async (transaction) => {
            const recordDoc = await transaction.get(recordRef);
            if (!recordDoc.exists()) throw "Document does not exist!";
            const comments = recordDoc.data().comments;
            comments[commentIndex].text = newText;
            transaction.update(recordRef, { comments });
        });
        return;
    }
    
    // Handle deleting a comment
    if(e.target.classList.contains('delete-comment-btn')) {
        const commentIndex = parseInt(e.target.dataset.index);
        await runTransaction(db, async (transaction) => {
             const recordRef = doc(db, `/artifacts/${appId}/public/data/records`, recordId);
             const recordDoc = await transaction.get(recordRef);
             if(!recordDoc.exists()) throw "Document does not exist!";
             const comments = recordDoc.data().comments;
             comments.splice(commentIndex, 1);
             transaction.update(recordRef, { comments });
         });
         return;
    }
    
    // Handle canceling a comment edit
    if (e.target.classList.contains('cancel-comment-btn')) {
        renderComments(e.target.closest('.comments-section'), record);
        return;
    }
});


dom.formCategorySelector.addEventListener('click', (e) => { if (e.target.matches('.form-category-btn')) setFormCategory(e.target.dataset.category, dom.formFieldsContainer); });

const findSimilarFaults = (newTitle, modelNumber) => {
    const modelNum = modelNumber?.toLowerCase() || '';
    return allRecords.filter(r => {
        if (r.category !== 'common-fault') return false;
        if (r.modelNumber && modelNumber && r.modelNumber.toLowerCase() === modelNum) return true;
        const newWords = newTitle.toLowerCase().split(' ').filter(w => w.length > 3);
        if(newWords.length === 0) return false;
        const existingWords = r.title.toLowerCase().split(' ');
        const matchCount = newWords.filter(word => existingWords.includes(word)).length;
        return matchCount >= 2;
    });
};

const createRecord = async (recordData, relatedTo = []) => {
     const submitBtn = dom.addRecordForm.querySelector('#add-record-submit');
     submitBtn.disabled = true; submitBtn.textContent = '...';
     try {
        recordData.onSamsungTracker = recordData.onSamsungTracker === 'on';
        const newRecordRef = await addDoc(collection(db, `/artifacts/${appId}/public/data/records`), { ...recordData, category: currentFormCategory, addedBy: currentUserDisplayName, createdAt: serverTimestamp(), isClosed: false, comments: [], relatedTo: relatedTo, relatedBy: [] });
        for(const related of relatedTo) {
            const relatedDocRef = doc(db, `/artifacts/${appId}/public/data/records`, related.id);
            await updateDoc(relatedDocRef, { relatedBy: arrayUnion({ id: newRecordRef.id, title: recordData.title }) });
        }
         dom.addRecordForm.reset(); dom.addRecordModal.classList.add('hidden');
     } finally { submitBtn.disabled = false; submitBtn.textContent = 'Add Record'; }
};

dom.addRecordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(dom.addRecordForm); const recordData = Object.fromEntries(formData.entries());
    if (!recordData.title || !currentUserDisplayName) return;
    
    if (currentFormCategory === 'common-fault') {
        const similarFaults = findSimilarFaults(recordData.title, recordData.modelNumber);
        if (similarFaults.length > 0) {
            pendingRecordData = recordData;
            dom.existingFaultsList.innerHTML = '';
            similarFaults.forEach(fault => {
                const isLinked = fault.relatedTo?.length > 0 || fault.relatedBy?.length > 0;
                dom.existingFaultsList.innerHTML += `<label class="flex items-center space-x-2"><input type="checkbox" value="${fault.id}" data-title="${fault.title}" class="related-fault-checkbox rounded"><span>${fault.title}${isLinked ? ' (Part of a group)' : ''}</span></label>`;
            });
            dom.linkFaultModal.classList.remove('hidden'); return;
        }
    }
    createRecord(recordData);
});

dom.skipLinkBtn.addEventListener('click', () => { if(pendingRecordData) createRecord(pendingRecordData); dom.linkFaultModal.classList.add('hidden'); });
dom.confirmLinkBtn.addEventListener('click', () => {
    const relatedTo = Array.from(dom.existingFaultsList.querySelectorAll('.related-fault-checkbox:checked')).map(cb => ({ id: cb.value, title: cb.dataset.title }));
    if(pendingRecordData) createRecord(pendingRecordData, relatedTo);
    dom.linkFaultModal.classList.add('hidden');
});

dom.editRecordForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const submitBtn = e.target.querySelector('#edit-record-submit');
    const formData = new FormData(dom.editRecordForm); const recordData = Object.fromEntries(formData.entries());
    recordData.onSamsungTracker = recordData.onSamsungTracker === 'on';
    const recordId = recordData.id;
    delete recordData.id; // Remove ID from data to be updated

    if (!recordId) {
        console.error("Edit record: No record ID found for update.");
        return; // Stop execution if no ID
    }
    // The 'title' field is marked as 'required' in HTML, but adding a JS check for robustness.
    if (!recordData.title) {
        console.error("Edit record: Title is empty. Please ensure the title field is filled.");
        return; // Stop execution if title is empty
    }

    submitBtn.disabled = true; submitBtn.textContent = '...';
    try { await updateDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordId), recordData); dom.editRecordModal.classList.add('hidden');
    } catch (error) {
        console.error("Error updating record:", error);
        // Optionally, provide user feedback here, e.g., alert("Failed to save changes. Check console for details.");
    } finally { submitBtn.disabled = false; submitBtn.textContent = 'Save Changes'; }
});
 dom.editTimeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.querySelector('[name="id"]').value;
    const newDate = new Date(e.target.querySelector('#edit-time-input').value);
    if (id && newDate) {
         await updateDoc(doc(db, `/artifacts/${appId}/public/data/records`, id), { createdAt: Timestamp.fromDate(newDate) });
         dom.editTimeModal.classList.add('hidden');
    }
});

dom.editRecordModal.addEventListener('click', (e) => {
    if(e.target.classList.contains('unlink-btn')) {
        const recordId = dom.editRecordForm.querySelector('[name="id"]').value;
        const unlinkId = e.target.dataset.unlinkId;
        const unlinkTitle = e.target.dataset.unlinkTitle;
        runTransaction(db, async (transaction) => {
            const recordRef = doc(db, `/artifacts/${appId}/public/data/records`, recordId);
            const unlinkRef = doc(db, `/artifacts/${appId}/public/data/records`, unlinkId);

            const recordDoc = await transaction.get(recordRef);
            if(!recordDoc.exists()) throw "Document does not exist!";
            
            transaction.update(recordRef, {
                relatedTo: arrayRemove({id: unlinkId, title: unlinkTitle}),
                relatedBy: arrayRemove({id: unlinkId, title: unlinkTitle})
            });

            transaction.update(unlinkRef, {
                relatedTo: arrayRemove({id: recordId, title: recordDoc.data().title}),
                relatedBy: arrayRemove({id: recordId, title: recordDoc.data().title})
            });
        }).then(() => {
            dom.editRecordModal.classList.add('hidden');
        }).catch(err => console.error("Unlink transaction failed: ", err));
    }
});

dom.authForm.addEventListener('submit', (e) => {
    e.preventDefault(); dom.authErrorEl.textContent = '';
    if (dom.authPasswordInput.value === SHARED_PASSWORD) {
        sessionStorage.setItem('isLoggedIn', 'true');
        if (sessionStorage.getItem('displayName')) { currentUserDisplayName = sessionStorage.getItem('displayName'); showApp(); } 
        else { dom.namePromptModal.classList.remove('hidden'); }
    } else { dom.authErrorEl.textContent = 'Incorrect password.'; }
});

dom.namePromptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('user-display-name').value.trim();
    if (name) { currentUserDisplayName = name; sessionStorage.setItem('displayName', name); showApp(); }
});

dom.logoutBtn.addEventListener('click', () => { sessionStorage.clear(); showLogin(); });

const applyTheme = () => {
    if (localStorage.getItem('theme') === 'dark') { document.documentElement.classList.add('dark'); dom.sunIcon.classList.add('hidden'); dom.moonIcon.classList.remove('hidden'); } 
    else { document.documentElement.classList.remove('dark'); dom.sunIcon.classList.remove('hidden'); dom.moonIcon.classList.add('hidden'); }
};
dom.darkModeToggle.addEventListener('click', () => { localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'light' : 'dark'); applyTheme(); });

if (sessionStorage.getItem('isLoggedIn') === 'true' && sessionStorage.getItem('displayName')) { currentUserDisplayName = sessionStorage.getItem('displayName'); showApp(); } 
else { showLogin(); }
applyTheme();
