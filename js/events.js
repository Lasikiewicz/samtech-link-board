import { state, dom } from './state.js';
import { showApp, showLogin } from '../app.js';
import { setFormCategory, openEditModal, openTimeEditModal, openEditCommentModal, renderComments, renderRecords, updateActiveFilterButtons, openLinkUnlinkModal } from './ui.js';
import { setupRecordsListener, removePresence } from './firestore.js';
import { getFirestore, doc, getDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, arrayUnion, arrayRemove, Timestamp, getDocs, runTransaction, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = 'samtech-record-board';

export function initializeEventListeners() {
    dom.logoImg.addEventListener('click', () => {
        state.currentCategory = 'all';
        state.currentStatusFilter = 'open';
        dom.searchInput.value = '';
        state.currentSearch = '';
        dom.filterControls.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
        dom.filterControls.querySelector('[data-filter="open"]').classList.add('active');
        updateActiveFilterButtons();
        renderRecords();
    });

    dom.searchInput.addEventListener('input', (e) => { 
        state.currentSearch = e.target.value.toLowerCase(); 
        renderRecords(); 
    });

    dom.addNewRecordBtn.addEventListener('click', () => { 
        setFormCategory('qa', dom.formFieldsContainer); 
        dom.addRecordModal.classList.remove('hidden'); 
    });
    
    dom.formCategorySelector.addEventListener('click', (e) => {
        if (e.target.matches('.form-category-btn')) {
            setFormCategory(e.target.dataset.category, dom.formFieldsContainer);
        }
    });

    dom.cancelAdd.addEventListener('click', () => dom.addRecordModal.classList.add('hidden'));
    dom.cancelEdit.addEventListener('click', () => dom.editRecordModal.classList.add('hidden'));
    dom.cancelTimeEdit.addEventListener('click', () => dom.editTimeModal.classList.add('hidden'));
    dom.cancelCommentEdit.addEventListener('click', () => dom.editCommentModal.classList.add('hidden'));
    dom.closeLinkUnlinkModal.addEventListener('click', () => dom.linkUnlinkModal.classList.add('hidden'));

    dom.editRecordForm.addEventListener('click', (e) => {
        if (e.target.id === 'edit-timestamp-btn') {
            const recordId = dom.editRecordForm.querySelector('[name="id"]').value;
            const record = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordId);
            if (record) openTimeEditModal(record);
        }
    });

    // ADDED: Event listener for the delete button in the edit modal
    dom.deleteRecordBtn.addEventListener('click', () => {
        const recordId = dom.editRecordForm.querySelector('[name="id"]').value;
        const record = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordId);
        if (record) {
            state.recordToDelete = record;
            document.getElementById('delete-record-title').textContent = record.title;
            dom.confirmDeleteModal.classList.remove('hidden');
        }
    });
    
    // ADDED: Event listener for the final delete confirmation
    dom.confirmDeleteBtn.addEventListener('click', async () => {
        if (state.recordToDelete) {
            await deleteDoc(doc(state.db, `/artifacts/${appId}/public/data/records`, state.recordToDelete.id));
            dom.confirmDeleteModal.classList.add('hidden');
            dom.editRecordModal.classList.add('hidden');
            state.recordToDelete = null;
        }
    });

    // ADDED: Event listener to cancel deletion
    dom.cancelDelete.addEventListener('click', () => {
        dom.confirmDeleteModal.classList.add('hidden');
        state.recordToDelete = null;
    });


    dom.manageLinksBtn.addEventListener('click', () => {
        const recordId = dom.editRecordForm.querySelector('[name="id"]').value;
        state.recordForLinking = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordId);
        if (state.recordForLinking) openLinkUnlinkModal(state.recordForLinking);
    });

    dom.linkUnlinkModal.addEventListener('click', async (e) => {
        const target = e.target;
        if (!state.recordForLinking) return;

        const linkId = target.dataset.id;
        const linkTitle = target.dataset.title;

        if (target.matches('.link-fault-btn')) {
            target.disabled = true;
            await runTransaction(state.db, async (transaction) => {
                const sourceRef = doc(state.db, `/artifacts/${appId}/public/data/records`, state.recordForLinking.id);
                const targetRef = doc(state.db, `/artifacts/${appId}/public/data/records`, linkId);
                transaction.update(sourceRef, { relatedTo: arrayUnion({ id: linkId, title: linkTitle }) });
                transaction.update(targetRef, { relatedBy: arrayUnion({ id: state.recordForLinking.id, title: state.recordForLinking.title }) });
            });
            const updatedRecord = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === state.recordForLinking.id);
            if(updatedRecord) openLinkUnlinkModal(updatedRecord);
        } else if (target.matches('.unlink-fault-btn')) {
            target.disabled = true;
            await runTransaction(state.db, async (transaction) => {
                const sourceRef = doc(state.db, `/artifacts/${appId}/public/data/records`, state.recordForLinking.id);
                const targetRef = doc(state.db, `/artifacts/${appId}/public/data/records`, linkId);
                const sourceDoc = await transaction.get(sourceRef);
                const sourceData = sourceDoc.data();
                
                transaction.update(sourceRef, { 
                    relatedTo: arrayRemove({ id: linkId, title: linkTitle }),
                    relatedBy: arrayRemove({ id: linkId, title: linkTitle })
                });
                transaction.update(targetRef, { 
                    relatedTo: arrayRemove({ id: state.recordForLinking.id, title: sourceData.title }),
                    relatedBy: arrayRemove({ id: state.recordForLinking.id, title: sourceData.title })
                });
            });
            const updatedRecord = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === state.recordForLinking.id);
            if(updatedRecord) openLinkUnlinkModal(updatedRecord);
        }
    });

    dom.filterControls.addEventListener('click', (e) => {
        const btn = e.target.closest('.control-btn');
        if (btn) {
            state.currentStatusFilter = btn.dataset.filter;
            dom.filterControls.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setupRecordsListener();
        }
    });

    dom.categoryFilterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.control-btn');
        if (btn && btn.dataset.category) {
            state.currentCategory = btn.dataset.category;
            updateActiveFilterButtons();
            renderRecords();
        }
    });

    let recordToClose = null;
    dom.recordsContainer.addEventListener('click', async (e) => {
        const recordCard = e.target.closest('.record-card');
        if (!recordCard) return;

        const recordId = recordCard.dataset.id;
        
        if (e.target.closest('.toggle-close-btn')) {
            recordToClose = recordId;
            const record = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordId);
            document.getElementById('close-record-title').textContent = record.title;
            dom.confirmCloseModal.classList.remove('hidden');
            return;
        }

        if (e.target.closest('.record-filter-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.record-filter-btn');
            const filterType = btn.dataset.filterType;
            const filterValue = btn.dataset.filterValue;

            if (filterType === 'category') {
                state.currentCategory = filterValue;
            } else if (filterType === 'model') {
                state.currentCategory = `model-${filterValue}`;
            } else if (filterType === 'sat') {
                state.currentCategory = 'samsung-action-tracker';
            }
            updateActiveFilterButtons();
            renderRecords();
            return;
        }

        if (e.target.closest('.edit-comment-btn')) {
            const commentIndex = parseInt(e.target.dataset.index);
            openEditCommentModal(recordId, commentIndex);
            return;
        }

        if (e.target.closest('.linked-fault-btn')) {
            e.preventDefault();
            const groupId = e.target.dataset.groupId;
            if (groupId) {
                state.currentCategory = groupId;
                renderRecords();
            }
            return;
        }

        let record = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordId);
        if (!record) return;

        if (e.target.closest('.edit-record-btn')) {
            openEditModal(record);
            return;
        }

        if (e.target.closest('.record-header')) {
            recordCard.classList.toggle('expanded');
            const isExpanded = recordCard.classList.contains('expanded');
            if (isExpanded) {
                state.expandedRecordIds.add(recordId);
                renderComments(recordCard.querySelector('.comments-section'), record);
            } else {
                state.expandedRecordIds.delete(recordId);
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
                await updateDoc(doc(state.db, `/artifacts/${appId}/public/data/records`, recordId), { 
                    comments: arrayUnion({ text, addedBy: state.currentUserDisplayName, createdAt: Timestamp.now() }) 
                });
                textarea.value = '';
                state.expandedRecordIds.add(recordId);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Post';
            }
            return;
        }
        
        if(e.target.classList.contains('delete-comment-btn')) {
            const commentIndex = parseInt(e.target.dataset.index);
            const isConfirmed = confirm('Are you sure you want to delete this comment?');
            if(isConfirmed) {
                await runTransaction(state.db, async (transaction) => {
                     const recordRef = doc(state.db, `/artifacts/${appId}/public/data/records`, recordId);
                     const recordDoc = await transaction.get(recordRef);
                     if(!recordDoc.exists()) throw "Document does not exist!";
                     const comments = recordDoc.data().comments;
                     comments.splice(commentIndex, 1);
                     transaction.update(recordRef, { comments });
                 });
            }
             return;
        }
    });

    dom.confirmCloseBtn.addEventListener('click', async () => {
        if(recordToClose) {
            const record = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordToClose);
            await updateDoc(doc(state.db, `/artifacts/${appId}/public/data/records`, recordToClose), { isClosed: !record.isClosed });
            dom.confirmCloseModal.classList.add('hidden');
            recordToClose = null;
        }
    });
    dom.cancelClose.addEventListener('click', () => {
        dom.confirmCloseModal.classList.add('hidden');
        recordToClose = null;
    });

    dom.authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        dom.authErrorEl.textContent = '';

        if (typeof window.SHARED_PASSWORD === 'undefined' || window.SHARED_PASSWORD.includes('__')) {
            dom.authErrorEl.textContent = 'Configuration Error: Password not set during deployment.';
            return;
        }

        if (dom.authPasswordInput.value === window.SHARED_PASSWORD) {
            sessionStorage.setItem('isLoggedIn', 'true');
            if (sessionStorage.getItem('displayName')) {
                state.currentUserDisplayName = sessionStorage.getItem('displayName');
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
            state.currentUserDisplayName = name; 
            sessionStorage.setItem('displayName', name); 
            showApp(); 
        }
    });

    dom.logoutBtn.addEventListener('click', () => { 
        sessionStorage.clear(); 
        removePresence();
        showLogin();
    });

    // All other form submissions...
    dom.addRecordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(dom.addRecordForm);
        let recordData = Object.fromEntries(formData.entries());
        recordData.onSamsungTracker = recordData.onSamsungTracker === 'on';

        if (!recordData.title || !state.currentUserDisplayName) return;

        const submitBtn = dom.addRecordForm.querySelector('#add-record-submit');
        submitBtn.disabled = true; 
        submitBtn.textContent = '...';
        
        try {
            await addDoc(collection(state.db, `/artifacts/${appId}/public/data/records`), { 
                ...recordData, 
                category: state.currentFormCategory, 
                addedBy: state.currentUserDisplayName, 
                createdAt: serverTimestamp(), 
                isClosed: false, 
                comments: [], 
                relatedTo: [], 
                relatedBy: [] 
            });
            dom.addRecordForm.reset(); 
            dom.addRecordModal.classList.add('hidden');
        } catch (error) {
            console.error("Error adding record: ", error);
        } finally {
            submitBtn.disabled = false; 
            submitBtn.textContent = 'Add Record';
        }
    });

    dom.editRecordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('#edit-record-submit');
        const formData = new FormData(dom.editRecordForm);
        const recordData = Object.fromEntries(formData.entries());
        recordData.onSamsungTracker = recordData.onSamsungTracker === 'on';
        const recordId = recordData.id;
        delete recordData.id;
        if (recordId && recordData.title) {
            submitBtn.disabled = true;
            submitBtn.textContent = '...';
            try {
                await updateDoc(doc(state.db, `/artifacts/${appId}/public/data/records`, recordId), recordData);
                dom.editRecordModal.classList.add('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save';
            }
        }
    });
    
    dom.editTimeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const id = formData.get('id');
        const newDateValue = formData.get('timestamp');
        const newAddedBy = formData.get('addedBy').trim();

        if (id && newDateValue && newAddedBy) {
             await updateDoc(doc(state.db, `/artifacts/${appId}/public/data/records`, id), { 
                 createdAt: Timestamp.fromDate(new Date(newDateValue)),
                 addedBy: newAddedBy
             });
             dom.editTimeModal.classList.add('hidden');
        }
    });

    dom.editCommentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const recordId = form.querySelector('[name="recordId"]').value;
        const commentIndex = parseInt(form.querySelector('[name="commentIndex"]').value);
        const newText = form.querySelector('[name="commentText"]').value;
        const newAddedBy = form.querySelector('[name="addedBy"]').value;
        const newTimestampValue = form.querySelector('[name="timestamp"]').value;

        const recordRef = doc(state.db, `/artifacts/${appId}/public/data/records`, recordId);
        try {
            await runTransaction(state.db, async (transaction) => {
                const recordDoc = await transaction.get(recordRef);
                if (!recordDoc.exists()) throw "Document does not exist!";
                
                const comments = recordDoc.data().comments || [];
                if(comments[commentIndex]) {
                    comments[commentIndex].text = newText;
                    comments[commentIndex].addedBy = newAddedBy;
                    comments[commentIndex].createdAt = Timestamp.fromDate(new Date(newTimestampValue));
                }
                transaction.update(recordRef, { comments });
            });
            dom.editCommentModal.classList.add('hidden');
        } catch (error) {
            console.error("Failed to save comment:", error);
            alert("Error saving comment. Please try again.");
        }
    });
}
