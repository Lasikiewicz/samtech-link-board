import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, arrayUnion, arrayRemove, Timestamp, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "__API_KEY__", authDomain: "__AUTH_DOMAIN__", projectId: "__PROJECT_ID__", storageBucket: "__STORAGE_BUCKET__", messagingSenderId: "__MESSAGING_SENDER_ID__", appId: "__APP_ID__" };
const appId = 'samtech-record-board';
const SHARED_PASSWORD = "__SHARED_PASSWORD__" || "samtech";

let app, db, recordsUnsubscribe;
let allRecords = [];
let groupedFaults = new Map();
let currentSort = 'newest', currentSearch = '', currentCategory = 'all-open', currentUserDisplayName = '';
let recordToDelete = null;
let expandedRecordIds = new Set();
let pendingRecordData = null;
let isInitialLoad = true;
let recentlySavedCommentInfo = null;
let recordForLinking = null;

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
    deleteRecordBtn: document.getElementById('delete-record-btn'), manageLinksBtn: document.getElementById('manage-links-btn'),
    editTimeModal: document.getElementById('edit-time-modal'), editTimeForm: document.getElementById('edit-time-form'), cancelTimeEdit: document.getElementById('cancel-time-edit'),
    namePromptModal: document.getElementById('name-prompt-modal'), namePromptForm: document.getElementById('name-prompt-form'),
    confirmDeleteModal: document.getElementById('confirm-delete-modal'), cancelDelete: document.getElementById('cancel-delete'), confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    linkFaultModal: document.getElementById('link-fault-modal'), existingFaultsList: document.getElementById('existing-faults-list'), skipLinkBtn: document.getElementById('skip-link-btn'), confirmLinkBtn: document.getElementById('confirm-link-btn'),
    linkUnlinkModal: document.getElementById('link-unlink-modal'), closeLinkUnlinkModal: document.getElementById('close-link-unlink-modal'),
    unlinkList: document.getElementById('unlink-list'), linkList: document.getElementById('link-list'),
};

const formInputClasses = "w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500";
const formLabelClasses = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

const formFieldsTemplates = {
    qa: `
        <div><label class="${formLabelClasses}">Q&A Title</label><input name="title" type="text" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Q&A Question ID</label><input name="qaId" type="text" pattern="\\d{8}" title="8 digits" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Model Number</label><input name="modelNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Serial Number</label><input name="serialNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Service Order Number</label><input name="serviceOrderNumber" type="text" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Salesforce Case Number</label><input name="salesforceCaseNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Description</label><textarea name="description" class="${formInputClasses}" rows="4"></textarea></div>`,
    'common-fault': `
        <div><label class="${formLabelClasses}">Title</label><input name="title" type="text" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Model Number</label><input name="modelNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Serial Number</label><input name="serialNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Service Order Number</label><input name="serviceOrderNumber" type="text" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Salesforce Case Number</label><input name="salesforceCaseNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Description</label><textarea name="description" class="${formInputClasses}" rows="4"></textarea></div>
        <label class="flex items-center mt-4"><input type="checkbox" name="onSamsungTracker" class="rounded mr-2"> On Samsung Action Tracker</label>`,
    general: `
        <div><label class="${formLabelClasses}">Title</label><input name="title" type="text" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Model Number</label><input name="modelNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Serial Number</label><input name="serialNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Service Order Number</label><input name="serviceOrderNumber" type="text" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Salesforce Case Number</label><input name="salesforceCaseNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Description</label><textarea name="description" class="${formInputClasses}" rows="4"></textarea></div>`
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
    const recordMap = new Map(allRecords.map(r => [r.id, r]));
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
        
        const groupRecords = Array.from(currentGroupIds).map(id => recordMap.get(id)).filter(Boolean);
        if (groupRecords.length > 1) {
             groupRecords.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
             const rootRecord = groupRecords[0];
             if (rootRecord) {
                groups.set(rootRecord.id, { title: rootRecord.title, records: groupRecords });
             }
        }
    }
    groupedFaults = groups;
};

const renderCategoryMenu = () => {
    dom.categoryMenu.innerHTML = '';
    const isGroupId = (id) => id.length === 20 && /^[a-zA-Z0-9]+$/.test(id);
    
    const createMenuButton = (id, text, className = '') => {
        const btn = document.createElement('button');
        btn.dataset.id = id;
        btn.textContent = text;
        // --- TASK 1: Ensure menu items are block-level and text-left ---
        btn.className = `menu-item block w-full text-left truncate ${className}`;
        if (currentCategory === id) btn.classList.add('active');
        btn.addEventListener('click', (e) => { 
            e.stopPropagation();
            currentCategory = id;
            setupRecordsListener();
        });
        return btn;
    };
    
    const createSortButton = (id, text) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        // --- TASK 1: Ensure sort buttons are also block-level and text-left ---
        btn.className = `menu-item block w-full text-left level-2 ${currentSort === id ? 'active' : ''}`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentSort = id;
            setupRecordsListener();
        });
        return btn;
    };

    const createAccordion = (id, title, children) => {
        const details = document.createElement('details');
        details.className = 'menu-accordion-item';
        details.innerHTML = `
            <summary class="menu-summary level-1">
                <span>${title}</span>
                <svg class="chevron h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </summary>
            <div class="space-y-1 mt-1"></div>`;
        
        const content = details.querySelector('div');
        children.forEach(child => content.appendChild(child));
        
        details.querySelector('.menu-summary').addEventListener('click', (e) => {
            if (details.open) {
                e.preventDefault();
                details.removeAttribute('open');
            } else {
                document.querySelectorAll('.menu-accordion-item').forEach(d => {
                    if (d !== details) d.removeAttribute('open');
                });
            }
        });

        if (currentCategory.startsWith(id) || (id === 'common-fault' && isGroupId(currentCategory))) {
            details.open = true;
        }

        return details;
    };
    
    dom.categoryMenu.appendChild(createMenuButton('all', 'All Records', 'level-1'));
    dom.categoryMenu.appendChild(createMenuButton('my', 'My Records', 'level-1'));
    
    const commonFaultsChildren = [];
    if (groupedFaults.size > 0) {
        const linkedIssuesDetails = document.createElement('details');
        linkedIssuesDetails.innerHTML = `
            <summary class="menu-summary level-2">
                <span>Linked Issues</span>
                <svg class="chevron h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </summary>
            <div class="space-y-1 mt-1"></div>`;
        const linkedContent = linkedIssuesDetails.querySelector('div');
        groupedFaults.forEach((group, groupId) => {
            linkedContent.appendChild(createMenuButton(groupId, group.records[0].title, 'level-3 font-normal'));
        });
        commonFaultsChildren.push(linkedIssuesDetails);
        if (isGroupId(currentCategory)) linkedIssuesDetails.open = true;
    }
    commonFaultsChildren.push(createMenuButton('common-fault-open', 'Open', 'level-2'));
    commonFaultsChildren.push(createMenuButton('common-fault-closed', 'Closed', 'level-2'));

    const generalChildren = [ createMenuButton('general-open', 'Open', 'level-2'), createMenuButton('general-closed', 'Closed', 'level-2') ];
    const qaChildren = [ createMenuButton('qa-open', 'Open', 'level-2'), createMenuButton('qa-closed', 'Closed', 'level-2') ];
    const satChildren = [ createMenuButton('samsung-action-tracker-open', 'Open', 'level-2'), createMenuButton('samsung-action-tracker-closed', 'Closed', 'level-2') ];
    
    dom.categoryMenu.appendChild(createAccordion('common-fault', 'Common Faults', commonFaultsChildren));
    dom.categoryMenu.appendChild(createAccordion('general', 'General', generalChildren));
    dom.categoryMenu.appendChild(createAccordion('qa', 'Q&A', qaChildren));
    dom.categoryMenu.appendChild(createAccordion('samsung-action-tracker', 'Samsung Action Tracker', satChildren));

    const divider = document.createElement('hr');
    divider.className = "my-2 border-slate-200 dark:border-slate-700";
    dom.categoryMenu.appendChild(divider);

    const sortContainer = document.createElement('div');
    const sortHeader = document.createElement('div');
    sortHeader.textContent = 'Sort Order';
    sortHeader.className = 'menu-header px-3 !pt-0';
    sortContainer.appendChild(sortHeader);
    sortContainer.appendChild(createSortButton('newest', 'Newest'));
    sortContainer.appendChild(createSortButton('oldest', 'Oldest'));
    sortContainer.appendChild(createSortButton('alpha', 'A-Z'));
    dom.categoryMenu.appendChild(sortContainer);
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
    
    const subTitleHtml = `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">By <span class="font-semibold">${record.addedBy}</span> on ${formatDateTime(record.createdAt)}</p>`;
    const samsungTrackerHtml = record.onSamsungTracker ? `<button class="filter-sat-btn text-xs font-bold bg-green-500 text-white px-2 py-1 rounded-full transition-transform hover:scale-105">Samsung Action Tracker</button>` : '';
    
    const isLinked = record.category === 'common-fault' && ((record.relatedTo && record.relatedTo.length > 0) || (record.relatedBy && record.relatedBy.length > 0));
    const linkIcon = isLinked ? `<svg class="h-4 w-4 text-cyan-500 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="This fault is linked to others."><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>` : '';
    
    const detailsHtml = `${record.qaId?`<div><dt class="font-semibold">Q&A ID:</dt><dd class="break-all">${record.qaId}</dd></div>`:''}${record.modelNumber?`<div><dt class="font-semibold">Model Number:</dt><dd class="break-all">${record.modelNumber}</dd></div>`:''}${record.serialNumber?`<div><dt class="font-semibold">Serial Number:</dt><dd class="break-all">${record.serialNumber}</dd></div>`:''}${record.serviceOrderNumber?`<div><dt class="font-semibold">Service Order Number:</dt><dd class="break-all">${record.serviceOrderNumber}</dd></div>`:''}${record.salesforceCaseNumber?`<div><dt class="font-semibold">Salesforce Case Number:</dt><dd class="break-all">${record.salesforceCaseNumber}</dd></div>`:''}`;
    const categoryDisplayNames = { qa: 'Q&A', 'common-fault': 'Common Fault', general: 'General' };
    const categoryColors = { qa: '#5fcae2', 'common-fault': '#4892cf', general: '#3f57ab' };
    const groupId = getRecordGroupId(record.id);
    const linkedRecordsHtml = groupId ? `<div class="mt-2"><dt class="font-semibold">Linked Faults:</dt><dd><button class="linked-fault-btn text-indigo-600 dark:text-indigo-400 underline" data-group-id="${groupId}">View Group</button></dd></div>` : '';
    const actionsHtml = `<div class="actions flex-shrink-0 ml-4 space-x-1"><button title="Edit Record" class="edit-record-btn p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600">&#9998;</button><button title="Edit Timestamp" class="edit-time-btn p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600">&#128337;</button><button title="${record.isClosed ? 'Re-open Record' : 'Close Record'}" class="toggle-close-btn p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600">${record.isClosed ? '&#128275;' : '&#128274;'}</button></div>`;

    card.innerHTML = `<div class="collapsible-header flex justify-between items-start cursor-pointer record-header">
        <div>
            <div class="flex items-center gap-1"><span class="text-xs capitalize text-white px-2 py-0.5 rounded-full" style="background-color: ${categoryColors[record.category] || '#64748b'}">${categoryDisplayNames[record.category] || record.category}</span><h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400 break-all">${record.title}</h3>${linkIcon}</div>
            ${subTitleHtml}
        </div>
        <div class="flex items-center gap-2">${samsungTrackerHtml}${record.isClosed?'<span class="text-xs font-bold bg-slate-500 text-white px-2 py-1 rounded-full">CLOSED</span>':''}${actionsHtml}<svg class="chevron h-5 w-5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg></div>
    </div>
    <div class="collapsible-content details-container"><div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 text-sm space-y-2"><dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">${detailsHtml}${linkedRecordsHtml}</dl>${record.description?`<div class="pt-2"><p class="whitespace-pre-wrap">${record.description}</p></div>`:''}</div><div class="comments-section mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"></div></div>`;
    
    if (expandedRecordIds.has(record.id)) {
        renderComments(card.querySelector('.comments-section'), record);
    }
    
    return card;
};

const renderComments = (container, record) => {
    container.innerHTML = `<h4 class="text-sm font-semibold mb-2">Updates & Comments</h4><div class="comments-list mt-2 space-y-3 pr-2"></div>${!record.isClosed ? '<form class="add-comment-form mt-3 flex items-start gap-2"><textarea placeholder="Add a comment..." class="flex-grow w-full text-sm px-3 py-2 border rounded" rows="2"></textarea><button type="submit" class="bg-slate-600 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-slate-700 flex-shrink-0 disabled:opacity-50">Post</button></form>' : ''}`;
    
    const commentsList = container.querySelector('.comments-list');
    if (record.comments && record.comments.length > 0) {
         const sortedComments = record.comments.map(c => ({...c, date: c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : new Date() })).sort((a,b) => a.date - b.date);
        sortedComments.forEach((comment, index) => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'bg-slate-100 dark:bg-slate-700 p-3 rounded-lg text-sm transition-all duration-300';
            
            if (recentlySavedCommentInfo && recentlySavedCommentInfo.recordId === record.id && recentlySavedCommentInfo.commentIndex === index) {
                commentDiv.classList.add('bg-green-200', 'dark:bg-green-800');
                setTimeout(() => {
                    commentDiv.classList.remove('bg-green-200', 'dark:bg-green-800');
                    recentlySavedCommentInfo = null; 
                }, 2000);
            }
            
            commentDiv.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 mb-1">By: <span class="font-mono">${comment.addedBy}</span> at ${formatDateTime(comment.createdAt)}</p><div class="comment-body flex justify-between items-start"><p class="comment-text break-words whitespace-pre-wrap flex-grow">${comment.text || ''}</p><div class="comment-actions flex-shrink-0 ml-2 space-x-2"><button class="edit-comment-btn" data-index="${index}" title="Edit">&#9998;</button><button class="delete-comment-btn" data-index="${index}" title="Delete">&#10006;</button></div></div>`;
            commentsList.appendChild(commentDiv);
        });
    } else { commentsList.innerHTML = '<p class="text-xs text-slate-400 dark:text-slate-500">No comments yet.</p>'; }
};

const renderRecords = () => {
    let recordsToDisplay;
    const isGroupId = currentCategory.length === 20 && /^[a-zA-Z0-9]+$/.test(currentCategory);

    if (isGroupId && groupedFaults.has(currentCategory)) {
        recordsToDisplay = groupedFaults.get(currentCategory).records;
    } else {
        recordsToDisplay = [...allRecords];
    }
    
    if (currentSearch) {
        recordsToDisplay = recordsToDisplay.filter(r => Object.values(r).join(' ').toLowerCase().includes(currentSearch));
    }
    
    dom.recordsContainer.innerHTML = '';
    if (recordsToDisplay.length === 0) { dom.recordsContainer.innerHTML = `<p class="text-slate-500 dark:text-slate-400">No records match your current filters.</p>`; return; }
    recordsToDisplay.forEach(recordData => dom.recordsContainer.appendChild(renderRecordCard(recordData)));
};

const openEditModal = (record) => {
    document.getElementById('edit-record-title').textContent = record.title;
    const form = dom.editRecordForm;
    form.querySelector('[name="id"]').value = record.id;
    setFormCategory(record.category, dom.editFormFieldsContainer, record);

    const addedByDiv = document.createElement('div');
    addedByDiv.innerHTML = `<label class="${formLabelClasses}">Added By</label><input name="addedBy" value="${record.addedBy}" class="${formInputClasses}">`;
    dom.editFormFieldsContainer.prepend(addedByDiv);

    dom.manageLinksBtn.classList.toggle('hidden', record.category !== 'common-fault');
    dom.editRecordModal.classList.remove('hidden');
};

const openTimeEditModal = (record) => {
    document.getElementById('edit-time-title').textContent = record.title;
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
    const isGroupId = currentCategory.length === 20 && /^[a-zA-Z0-9]+$/.test(currentCategory);
    let [mainCategory, subCategory] = currentCategory.split('-');
    
    let effectiveCategory = mainCategory;
    if (isGroupId) {
        effectiveCategory = 'common-fault';
    }
    
    if (effectiveCategory === 'my') {
        constraints.push(where('addedBy', '==', currentUserDisplayName));
    } else if (effectiveCategory === 'samsung-action-tracker') {
        constraints.push(where('onSamsungTracker', '==', true));
    } else if (effectiveCategory !== 'all') {
        constraints.push(where('category', '==', effectiveCategory));
    }
    
    if (!isGroupId) {
        if (subCategory === 'closed') {
            constraints.push(where('isClosed', '==', true));
        } else if (subCategory === 'open') {
             constraints.push(where('isClosed', '==', false));
        }
    }
    
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
        if (isInitialLoad) {
            if (currentSort === 'newest' && allRecords.length > 0) {
                 expandedRecordIds.add(allRecords[0].id);
                 renderRecords(); 
            }
            isInitialLoad = false;
        }
    }, (error) => { console.error("Firestore error:", error); dom.loadingState.innerHTML = `<p class="text-red-500">Error loading data. A required index is likely missing. Check console (F12) for a link.</p>`; });
};


const showApp = () => { dom.authContainer.style.display = 'none'; dom.namePromptModal.classList.add('hidden'); dom.appContainer.style.display = 'block'; dom.userNameDisplay.textContent = currentUserDisplayName; setupRecordsListener(); };
const showLogin = () => { dom.authContainer.style.display = 'flex'; dom.appContainer.style.display = 'none'; if (recordsUnsubscribe) recordsUnsubscribe(); };

dom.searchInput.addEventListener('input', (e) => { currentSearch = e.target.value.toLowerCase(); renderRecords(); });

dom.addNewRecordBtn.addEventListener('click', () => { setFormCategory('qa', dom.formFieldsContainer); dom.addRecordModal.classList.remove('hidden'); });
dom.cancelAdd.addEventListener('click', () => dom.addRecordModal.classList.add('hidden'));
dom.cancelEdit.addEventListener('click', () => dom.editRecordModal.classList.add('hidden'));
dom.cancelTimeEdit.addEventListener('click', () => dom.editTimeModal.classList.add('hidden'));
dom.deleteRecordBtn.addEventListener('click', () => {
    recordToDelete = dom.editRecordForm.querySelector('[name="id"]').value;
    const record = allRecords.find(r => r.id === recordToDelete);
    if (record) {
        document.getElementById('delete-record-title').textContent = record.title;
    }
    dom.confirmDeleteModal.classList.remove('hidden');
});
dom.cancelDelete.addEventListener('click', () => { recordToDelete = null; dom.confirmDeleteModal.classList.add('hidden'); });
dom.confirmDeleteBtn.addEventListener('click', async () => { if (recordToDelete) { await deleteDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordToDelete)); dom.editRecordModal.classList.add('hidden'); dom.confirmDeleteModal.classList.add('hidden'); recordToDelete = null; } });

dom.manageLinksBtn.addEventListener('click', () => {
    const recordId = dom.editRecordForm.querySelector('[name="id"]').value;
    recordForLinking = allRecords.find(r => r.id === recordId);
    if (recordForLinking) openLinkUnlinkModal(recordForLinking);
});

dom.closeLinkUnlinkModal.addEventListener('click', () => {
    dom.linkUnlinkModal.classList.add('hidden');
    recordForLinking = null;
});

const openLinkUnlinkModal = (record) => {
    document.getElementById('link-unlink-title').textContent = record.title;
    
    dom.unlinkList.innerHTML = '';
    const currentlyLinkedIds = new Set();
    const linkedFaults = [...(record.relatedTo || []), ...(record.relatedBy || [])];
    if (linkedFaults.length > 0) {
        linkedFaults.forEach(fault => {
            currentlyLinkedIds.add(fault.id);
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center';
            item.innerHTML = `<span>${fault.title}</span><button data-id="${fault.id}" data-title="${fault.title}" class="unlink-fault-btn text-red-500 hover:text-red-700 text-xs">Unlink</button>`;
            dom.unlinkList.appendChild(item);
        });
    } else {
        dom.unlinkList.innerHTML = `<p class="text-xs text-slate-400">Not linked to any faults.</p>`;
    }

    dom.linkList.innerHTML = '';
    const availableToLink = allRecords.filter(fault => 
        fault.category === 'common-fault' && 
        !fault.isClosed &&
        fault.id !== record.id && 
        !currentlyLinkedIds.has(fault.id)
    );
    
    if (availableToLink.length > 0) {
        availableToLink.forEach(fault => {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center';
            item.innerHTML = `<span>${fault.title}</span><button data-id="${fault.id}" data-title="${fault.title}" class="link-fault-btn text-green-500 hover:text-green-700 text-xs">Link</button>`;
            dom.linkList.appendChild(item);
        });
    } else {
         dom.linkList.innerHTML = `<p class="text-xs text-slate-400">No other open faults to link.</p>`;
    }

    dom.linkUnlinkModal.classList.remove('hidden');
};

dom.linkUnlinkModal.addEventListener('click', async (e) => {
    const target = e.target;
    if (!recordForLinking) return;

    const linkId = target.dataset.id;
    const linkTitle = target.dataset.title;

    if (target.matches('.link-fault-btn')) {
        target.disabled = true;
        await runTransaction(db, async (transaction) => {
            const sourceRef = doc(db, `/artifacts/${appId}/public/data/records`, recordForLinking.id);
            const targetRef = doc(db, `/artifacts/${appId}/public/data/records`, linkId);
            transaction.update(sourceRef, { relatedTo: arrayUnion({ id: linkId, title: linkTitle }) });
            transaction.update(targetRef, { relatedBy: arrayUnion({ id: recordForLinking.id, title: recordForLinking.title }) });
        });
        const updatedRecord = allRecords.find(r => r.id === recordForLinking.id);
        if(updatedRecord) openLinkUnlinkModal(updatedRecord);
    } else if (target.matches('.unlink-fault-btn')) {
        target.disabled = true;
        await runTransaction(db, async (transaction) => {
            const sourceRef = doc(db, `/artifacts/${appId}/public/data/records`, recordForLinking.id);
            const targetRef = doc(db, `/artifacts/${appId}/public/data/records`, linkId);
            const sourceDoc = await transaction.get(sourceRef);
            const sourceData = sourceDoc.data();
            
            transaction.update(sourceRef, { 
                relatedTo: arrayRemove({ id: linkId, title: linkTitle }),
                relatedBy: arrayRemove({ id: linkId, title: linkTitle })
            });
            transaction.update(targetRef, { 
                relatedTo: arrayRemove({ id: recordForLinking.id, title: sourceData.title }),
                relatedBy: arrayRemove({ id: recordForLinking.id, title: sourceData.title })
            });
        });
        const updatedRecord = allRecords.find(r => r.id === recordForLinking.id);
        if(updatedRecord) openLinkUnlinkModal(updatedRecord);
    }
});


// --- MAIN EVENT DELEGATION LISTENER ---
dom.recordsContainer.addEventListener('click', async (e) => {
    const recordCard = e.target.closest('.record-card');
    if (!recordCard) return;
    const recordId = recordCard.dataset.id;
    let record = allRecords.find(r => r.id === recordId);
    if (!record) return;

    if (e.target.closest('.edit-record-btn')) {
        openEditModal(record);
        return;
    }
    if (e.target.closest('.edit-time-btn')) {
        openTimeEditModal(record);
        return;
    }
    if (e.target.closest('.toggle-close-btn')) {
        await updateDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordId), { isClosed: !record.isClosed });
        return;
    }
    
    if (e.target.closest('.filter-sat-btn')) {
        e.stopPropagation();
        currentCategory = 'samsung-action-tracker-open';
        setupRecordsListener();
        return;
    }

    if (e.target.closest('.record-header')) {
        const wasExpanded = recordCard.classList.contains('expanded');
        if (recordCard.classList.toggle('expanded')) {
            expandedRecordIds.add(recordId);
            if (!wasExpanded) {
                renderComments(recordCard.querySelector('.comments-section'), record);
            }
        } else {
            expandedRecordIds.delete(recordId);
        }
        return;
    }

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
            expandedRecordIds.add(recordId);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
        return;
    }

    if(e.target.classList.contains('edit-comment-btn')) {
        const commentBody = e.target.closest('.comment-body');
        const commentIndex = parseInt(e.target.dataset.index);
        const currentText = commentBody.querySelector('.comment-text').textContent;
        commentBody.innerHTML = `<textarea class="edit-comment-textarea flex-grow w-full text-sm p-2 border rounded">${currentText}</textarea><div class="flex flex-col ml-2 space-y-1"><button class="save-comment-btn text-xs bg-green-500 text-white px-2 py-1 rounded" data-index="${commentIndex}">Save</button><button class="cancel-comment-btn text-xs bg-gray-500 text-white px-2 py-1 rounded">Cancel</button></div>`;
        return;
    }

    if(e.target.classList.contains('save-comment-btn')) {
        const saveBtn = e.target;
        saveBtn.disabled = true;
        saveBtn.textContent = '...';
        
        const commentIndex = parseInt(e.target.dataset.index);
        const newText = e.target.closest('.comment-body').querySelector('.edit-comment-textarea').value;
        const recordRef = doc(db, `/artifacts/${appId}/public/data/records`, recordId);
        
        try {
            await runTransaction(db, async (transaction) => {
                const recordDoc = await transaction.get(recordRef);
                if (!recordDoc.exists()) throw "Document does not exist!";
                const comments = recordDoc.data().comments;
                comments[commentIndex].text = newText;
                transaction.update(recordRef, { comments });
            });
            recentlySavedCommentInfo = { recordId: recordId, commentIndex: commentIndex };
        } catch (error) {
            console.error("Failed to save comment:", error);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
        return;
    }
    
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
    
    if (e.target.classList.contains('cancel-comment-btn')) {
        const fullRecord = allRecords.find(r => r.id === recordId);
        if (fullRecord) {
            renderComments(e.target.closest('.comments-section'), fullRecord);
        }
        return;
    }
});


dom.formCategorySelector.addEventListener('click', (e) => { if (e.target.matches('.form-category-btn')) setFormCategory(e.target.dataset.category, dom.formFieldsContainer); });

const findSimilarFaults = (title, modelNumber) => {
    const titleWords = title.toLowerCase().split(' ').filter(w => w.length > 3);
    const modelNum = modelNumber?.toLowerCase().trim() || '';

    return allRecords.filter(r => {
        if (r.category !== 'common-fault') return false;
        
        if (modelNum && r.modelNumber && r.modelNumber.toLowerCase().trim() === modelNum) return true;
        
        if(titleWords.length === 0) return false;
        const existingWords = r.title.toLowerCase().split(' ');
        const matchCount = titleWords.filter(word => existingWords.includes(word)).length;
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
    const formData = new FormData(dom.addRecordForm);
    const recordData = Object.fromEntries(formData.entries());
    if (!recordData.title || !currentUserDisplayName) return;

    if (recordData.serialNumber) {
        const sn = recordData.serialNumber.trim().toLowerCase();
        if (sn) {
            const existingRecord = allRecords.find(r => r.serialNumber && r.serialNumber.trim().toLowerCase() === sn);
            if (existingRecord) {
                createRecord(recordData, [{ id: existingRecord.id, title: existingRecord.title }]);
                alert(`Record created and automatically linked to existing record with the same serial number:\n"${existingRecord.title}"`);
                return; 
            }
        }
    }
    
    if (currentFormCategory === 'common-fault') {
        const similarFaults = findSimilarFaults(recordData.title, recordData.modelNumber);
        if (similarFaults.length > 0) {
            pendingRecordData = recordData;
            document.getElementById('link-fault-title').textContent = `New Fault: ${recordData.title}`;
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
    const recordId = recordData.id; delete recordData.id;
    if (recordId && recordData.title) {
        submitBtn.disabled = true; submitBtn.textContent = '...';
        try { await updateDoc(doc(db, `/artifacts/${appId}/public/data/records`, recordId), recordData); dom.editRecordModal.classList.add('hidden');
        } finally { submitBtn.disabled = false; submitBtn.textContent = 'Save Changes'; }
    }
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