import { state, dom, groupColorAssignments, groupBackgroundColors } from './state.js';
import { formatDateTime, getModelCategory } from './utils.js';

export const formInputClasses = "w-full p-2 border border-slate-300 rounded text-slate-900 placeholder-slate-400";
export const formLabelClasses = "block text-sm font-medium text-slate-700 mb-1";

export const formFieldsTemplates = {
    qa: `
        <div class="md:col-span-2"><label class="${formLabelClasses}">Q&A Title</label><input name="title" type="text" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Q&A Question ID</label><input name="qaId" type="text" pattern="\\d{8}" title="8 digits" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Model Number</label><input name="modelNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Serial Number</label><input name="serialNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Service Order Number</label><input name="serviceOrderNumber" type="text" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Salesforce Case Number</label><input name="salesforceCaseNumber" type="text" class="${formInputClasses}"></div>
        <div class="md:col-span-2"><label class="${formLabelClasses}">Description</label><textarea name="description" class="${formInputClasses}" rows="4"></textarea></div>`,
    'common-fault': `
        <div class="md:col-span-2"><label class="${formLabelClasses}">Title</label><input name="title" type="text" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Model Number</label><input name="modelNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Serial Number</label><input name="serialNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Service Order Number</label><input name="serviceOrderNumber" type="text" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Salesforce Case Number</label><input name="salesforceCaseNumber" type="text" class="${formInputClasses}"></div>
        <div class="md:col-span-2"><label class="${formLabelClasses}">Description</label><textarea name="description" class="${formInputClasses}" rows="4"></textarea></div>
        <div class="md:col-span-2"><label class="flex items-center mt-2"><input type="checkbox" name="onSamsungTracker" class="rounded mr-2"> On Samsung Action Tracker</label></div>`,
    general: `
        <div class="md:col-span-2"><label class="${formLabelClasses}">Title</label><input name="title" type="text" class="${formInputClasses}" required></div>
        <div><label class="${formLabelClasses}">Model Number</label><input name="modelNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Serial Number</label><input name="serialNumber" type="text" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Service Order Number</label><input name="serviceOrderNumber" type="text" pattern="\\d{10}" title="10 digits" class="${formInputClasses}"></div>
        <div><label class="${formLabelClasses}">Salesforce Case Number</label><input name="salesforceCaseNumber" type="text" class="${formInputClasses}"></div>
        <div class="md:col-span-2"><label class="${formLabelClasses}">Description</label><textarea name="description" class="${formInputClasses}" rows="4"></textarea></div>
        <div class="md:col-span-2"><label class="flex items-center mt-2"><input type="checkbox" name="onSamsungTracker" class="rounded mr-2"> On Samsung Action Tracker</label></div>`
};

export function setFormCategory(category, container, record = {}) {
    state.currentFormCategory = category;
    container.innerHTML = formFieldsTemplates[category];
    for (const key in record) {
        const input = container.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') input.checked = !!record[key];
            else input.value = record[key];
        }
    }
    if (container.id === 'form-fields-container') {
        dom.formCategorySelector.querySelectorAll('.form-category-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
    }
}

export function groupCommonFaults() {
    const recordMap = new Map(state.allCommonFaults.map(r => [r.id, r]));
    state.groupedFaults.clear();
    const visited = new Set();

    for (const fault of state.allCommonFaults) {
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
                state.groupedFaults.set(rootRecord.id, { title: rootRecord.title, records: groupRecords });
             }
        }
    }

    let colorIndex = 0;
    state.groupedFaults.forEach((group, groupId) => {
        if (!groupColorAssignments.has(groupId)) {
            groupColorAssignments.set(groupId, groupBackgroundColors[colorIndex % groupBackgroundColors.length]);
            colorIndex++;
        }
    });
}

export function updateActiveFilterButtons() {
    dom.categoryFilterBar.querySelectorAll('.control-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === state.currentCategory);
    });
    dom.categoryMenu.querySelectorAll('.menu-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === state.currentCategory);
    });
}

export function renderCategoryMenu() {
    dom.categoryMenu.innerHTML = '';
    
    const createMenuButton = (id, text, className = '') => {
        const btn = document.createElement('button');
        btn.dataset.id = id;
        btn.textContent = text;
        btn.className = `menu-item block w-full text-left truncate ${className}`;
        btn.addEventListener('click', (e) => { 
            e.stopPropagation();
            state.currentCategory = id;
            updateActiveFilterButtons();
            renderRecords();
        });
        return btn;
    };
    
    dom.categoryMenu.appendChild(createMenuButton('all', 'All Records', 'level-1'));
    
    const catHeader = document.createElement('div');
    catHeader.textContent = 'Categories';
    catHeader.className = 'menu-header';
    dom.categoryMenu.appendChild(catHeader);
    dom.categoryMenu.appendChild(createMenuButton('common-fault', 'Common Faults', 'level-2'));
    if(state.groupedFaults.size > 0) {
        const sortedGroups = Array.from(state.groupedFaults.entries()).sort(([, groupA], [, groupB]) => {
            const timeA = groupA.records[0]?.createdAt?.seconds || 0;
            const timeB = groupB.records[0]?.createdAt?.seconds || 0;
            return timeB - timeA;
        });
        sortedGroups.forEach(([groupId, group]) => {
            dom.categoryMenu.appendChild(createMenuButton(groupId, group.records[0].title, 'level-3 font-normal'));
        });
    }
    dom.categoryMenu.appendChild(createMenuButton('general', 'General', 'level-2'));
    dom.categoryMenu.appendChild(createMenuButton('qa', 'Q&A', 'level-2'));
    
    const otherHeader = document.createElement('div');
    otherHeader.textContent = 'Other Filters';
    otherHeader.className = 'menu-header';
    dom.categoryMenu.appendChild(otherHeader);
    dom.categoryMenu.appendChild(createMenuButton('samsung-action-tracker', 'Samsung Action Tracker', 'level-2'));
    
    const modelHeader = document.createElement('div');
    modelHeader.textContent = 'Model Type';
    modelHeader.className = 'menu-header';
    dom.categoryMenu.appendChild(modelHeader);
    dom.categoryMenu.appendChild(createMenuButton('model-REF', 'REF Models', 'level-2'));
    dom.categoryMenu.appendChild(createMenuButton('model-DW', 'DW Models', 'level-2'));
    dom.categoryMenu.appendChild(createMenuButton('model-WSM', 'WSM Models', 'level-2'));
    dom.categoryMenu.appendChild(createMenuButton('model-TD', 'TD Models', 'level-2'));

    updateActiveFilterButtons();
}

export const getRecordGroupId = (recordId) => {
    for (const [groupId, group] of state.groupedFaults.entries()) {
        if(group.records.some(r => r.id === recordId)) {
            return groupId;
        }
    }
    return null;
};

export function renderRecordCard(record) {
    const card = document.createElement('div');
    card.dataset.id = record.id;
    
    const groupId = getRecordGroupId(record.id);
    const groupColor = groupId ? groupColorAssignments.get(groupId) : null;

    card.className = `record-card p-4 rounded-xl shadow-lg transition-all ${record.isClosed ? 'opacity-60' : 'bg-white'}`;
    if (groupColor) {
        card.style.backgroundColor = groupColor;
    }

    if (state.expandedRecordIds.has(record.id)) card.classList.add('expanded');
    
    const categoryDisplayNames = { qa: 'Q&A', 'common-fault': 'Common Fault', general: 'General' };
    
    let sublineItems = [];
    const buttonClasses = "record-filter-btn bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-1 px-2 rounded-md shadow";

    sublineItems.push(`<button class="${buttonClasses}" data-filter-type="category" data-filter-value="${record.category}">${categoryDisplayNames[record.category] || record.category}</button>`);

    const modelCategory = getModelCategory(record.modelNumber);
    if(modelCategory) {
        sublineItems.push(`<button class="${buttonClasses}" data-filter-type="model" data-filter-value="${modelCategory}">${modelCategory}</button>`);
    }

    if(record.onSamsungTracker) {
        sublineItems.push(`<button class="${buttonClasses}" data-filter-type="sat">Samsung Action Tracker</button>`);
    }
    
    let daysOpenHtml = '';
    if (!record.isClosed && record.createdAt?.seconds) {
        const now = new Date();
        const createdAtDate = new Date(record.createdAt.seconds * 1000);
        const diffTime = Math.abs(now - createdAtDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysOpenHtml = `<span class="text-xs font-semibold text-red-600">(${diffDays} day${diffDays !== 1 ? 's' : ''} open)</span>`;
    }

    const creationHtml = `<p class="text-xs text-slate-500">By <span class="font-semibold">${record.addedBy}</span> on ${formatDateTime(record.createdAt)}</p>`;
    
    const isLinked = record.category === 'common-fault' && ((record.relatedTo && record.relatedTo.length > 0) || (record.relatedBy && record.relatedBy.length > 0));
    const linkIcon = isLinked ? `<svg class="h-4 w-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" title="This fault is linked to others."><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>` : '';
    
    const detailsHtml = `${record.qaId?`<div><dt class="font-semibold">Q&A ID:</dt><dd class="break-all">${record.qaId}</dd></div>`:''}${record.modelNumber?`<div><dt class="font-semibold">Model Number:</dt><dd class="break-all">${record.modelNumber}</dd></div>`:''}${record.serialNumber?`<div><dt class="font-semibold">Serial Number:</dt><dd class="break-all">${record.serialNumber}</dd></div>`:''}${record.serviceOrderNumber?`<div><dt class="font-semibold">Service Order Number:</dt><dd class="break-all">${record.serviceOrderNumber}</dd></div>`:''}${record.salesforceCaseNumber?`<div><dt class="font-semibold">Salesforce Case Number:</dt><dd class="break-all">${record.salesforceCaseNumber}</dd></div>`:''}`;
    
    const linkedGroupId = getRecordGroupId(record.id);
    const linkedRecordsHtml = linkedGroupId ? `<div class="mt-2"><dt class="font-semibold">Linked Faults:</dt><dd><button class="linked-fault-btn text-indigo-600 underline" data-group-id="${linkedGroupId}">View Group</button></dd></div>` : '';
    
    const actionsHtml = `
        <div class="actions flex-shrink-0 ml-4 flex items-center space-x-1 text-slate-500">
            <button title="Edit Record" class="edit-record-btn p-1.5 rounded-full hover:bg-slate-200 hover:text-slate-800">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
            </button>
            <button title="Edit Timestamp" class="edit-time-btn p-1.5 rounded-full hover:bg-slate-200 hover:text-slate-800">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            <button title="${record.isClosed ? 'Re-open Record' : 'Close Record'}" class="toggle-close-btn p-1.5 rounded-full hover:bg-slate-200 hover:text-slate-800">
                ${record.isClosed 
                    ? `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v3m-6-3h12a2 2 0 002-2v-4a2 2 0 00-2-2H6a2 2 0 00-2 2v4a2 2 0 002 2z" /></svg>` 
                    : `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>`
                }
            </button>
        </div>`;

    card.innerHTML = `
        <div class="collapsible-header flex justify-between items-start cursor-pointer record-header">
            <div class="flex-grow min-w-0">
                <h3 class="text-md font-semibold text-indigo-700">${record.title} ${daysOpenHtml}</h3>
                <div class="flex items-center gap-x-2 flex-wrap text-xs text-slate-500 mt-1">
                    ${sublineItems.join('')}
                    ${linkIcon}
                </div>
                <div class="mt-1">
                    ${creationHtml}
                </div>
            </div>
            <div class="flex flex-col items-end">
                ${record.isClosed ? '<span class="text-xs font-bold bg-slate-500 text-white px-2 py-1 rounded-full mb-1">CLOSED</span>' : ''}
                ${actionsHtml}
            </div>
            <svg class="chevron h-5 w-5 transition-transform text-slate-400 ml-2 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
        </div>
        <div class="collapsible-content details-container">
            <div class="mt-4 pt-4 border-t border-slate-200 text-sm space-y-2">
                <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">${detailsHtml}${linkedRecordsHtml}</dl>
                ${record.description ? `<div class="pt-2"><p class="whitespace-pre-wrap">${record.description}</p></div>` : ''}
            </div>
            <div class="comments-section mt-4 pt-4 border-t border-slate-200"></div>
        </div>`;
    
    if (state.expandedRecordIds.has(record.id)) {
        renderComments(card.querySelector('.comments-section'), record);
    }
    
    return card;
}

export function renderComments(container, record) {
    container.innerHTML = `<h4 class="text-sm font-semibold mb-2">Updates & Comments</h4><div class="comments-list mt-2 space-y-3 pr-2"></div>${!record.isClosed ? '<form class="add-comment-form mt-3 flex items-start gap-2"><textarea placeholder="Add a comment..." class="flex-grow w-full text-sm px-3 py-2 border rounded" rows="4"></textarea><button type="submit" class="bg-slate-600 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-slate-700 flex-shrink-0 disabled:opacity-50">Post</button></form>' : ''}`;
    
    const commentsList = container.querySelector('.comments-list');
    if (record.comments && record.comments.length > 0) {
         const sortedComments = record.comments.map(c => ({...c, date: c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : new Date() })).sort((a,b) => a.date - b.date);
        sortedComments.forEach((comment, index) => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'bg-slate-100 p-3 rounded-lg text-sm transition-all duration-300';
            
            if (state.recentlySavedCommentInfo && state.recentlySavedCommentInfo.recordId === record.id && state.recentlySavedCommentInfo.commentIndex === index) {
                commentDiv.classList.add('bg-green-200');
                setTimeout(() => {
                    commentDiv.classList.remove('bg-green-200');
                    state.recentlySavedCommentInfo = null; 
                }, 2000);
            }
            
            commentDiv.innerHTML = `<p class="text-xs text-slate-500 mb-1">By: <span class="font-mono">${comment.addedBy}</span> at ${formatDateTime(comment.createdAt)}</p><div class="comment-body flex justify-between items-start"><p class="comment-text break-words whitespace-pre-wrap flex-grow">${comment.text || ''}</p><div class="comment-actions flex-shrink-0 ml-2 space-x-2"><button class="edit-comment-btn" data-index="${index}" title="Edit">&#9998;</button><button class="delete-comment-btn" data-index="${index}" title="Delete">&#10006;</button></div></div>`;
            commentsList.appendChild(commentDiv);
        });
    } else { commentsList.innerHTML = '<p class="text-xs text-slate-400">No comments yet.</p>'; }
}

export function openEditModal(record) {
    document.getElementById('edit-record-title').textContent = record.title;
    const form = dom.editRecordForm;
    form.querySelector('[name="id"]').value = record.id;
    setFormCategory(record.category, dom.editFormFieldsContainer, record);
    dom.manageLinksBtn.classList.toggle('hidden', record.category !== 'common-fault');
    dom.editRecordModal.classList.remove('hidden');
}

export function openTimeEditModal(record) {
    document.getElementById('edit-time-title').textContent = record.title;
    const form = dom.editTimeForm;
    form.querySelector('[name="id"]').value = record.id;
    
    const date = record.createdAt.seconds ? new Date(record.createdAt.seconds * 1000) : new Date();
    const localISOString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    form.querySelector('[name="timestamp"]').value = localISOString;

    form.querySelector('#added-by-container')?.remove(); 
    const addedByDiv = document.createElement('div');
    addedByDiv.id = 'added-by-container';
    addedByDiv.innerHTML = `<label class="${formLabelClasses} mt-4">Added By</label><input name="addedBy" value="${record.addedBy}" class="${formInputClasses}">`;
    form.querySelector('.space-y-4').appendChild(addedByDiv);

    dom.editTimeModal.classList.remove('hidden');
}

export function openEditCommentModal(recordId, commentIndex) {
    const record = [...state.allRecords, ...state.allCommonFaults].find(r => r.id === recordId);
    if (!record || !record.comments || !record.comments[commentIndex]) return;

    const comment = record.comments[commentIndex];
    const form = dom.editCommentForm;

    form.querySelector('[name="recordId"]').value = recordId;
    form.querySelector('[name="commentIndex"]').value = commentIndex;
    form.querySelector('[name="commentText"]').value = comment.text;
    form.querySelector('[name="addedBy"]').value = comment.addedBy;

    const date = comment.createdAt.seconds ? new Date(comment.createdAt.seconds * 1000) : new Date();
    const localISOString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    form.querySelector('[name="timestamp"]').value = localISOString;

    dom.editCommentModal.classList.remove('hidden');
}

export function openLinkUnlinkModal(record) {
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
    const availableToLink = state.allCommonFaults.filter(fault => 
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
}

export function renderRecords() {
    let recordsToDisplay = [...state.allRecords];

    const isGroupId = state.currentCategory.length === 20 && /^[a-zA-Z0-9]+$/.test(state.currentCategory);

    if (isGroupId && state.groupedFaults.has(state.currentCategory)) {
        const groupRecords = state.groupedFaults.get(state.currentCategory).records;
        recordsToDisplay = [...groupRecords].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    } else if (state.currentCategory.startsWith('model-')) {
        const prefix = state.currentCategory.split('-')[1];
        if (prefix === 'WSM') {
            const wsmPrefixes = ['WW', 'WM', 'WF', 'WD'];
            recordsToDisplay = recordsToDisplay.filter(r => 
                r.modelNumber && wsmPrefixes.some(p => r.modelNumber.toUpperCase().startsWith(p))
            );
        } else {
             const modelPrefix = prefix === 'REF' ? 'RB' : prefix;
             recordsToDisplay = recordsToDisplay.filter(r => r.modelNumber && r.modelNumber.toUpperCase().startsWith(modelPrefix));
        }
    } else if (state.currentCategory === 'samsung-action-tracker') {
        recordsToDisplay = recordsToDisplay.filter(r => r.onSamsungTracker);
    } else if (state.currentCategory !== 'all') {
        recordsToDisplay = recordsToDisplay.filter(r => r.category === state.currentCategory);
    }
    
    if (state.currentSearch) {
        recordsToDisplay = recordsToDisplay.filter(r => 
            Object.values(r).some(val => 
                String(val).toLowerCase().includes(state.currentSearch)
            )
        );
    }
    
    dom.recordsContainer.innerHTML = '';
    if (recordsToDisplay.length === 0) { 
        dom.recordsContainer.innerHTML = `<p class="text-slate-500">No records match your current filters.</p>`;
        return;
    }
    recordsToDisplay.forEach(recordData => dom.recordsContainer.appendChild(renderRecordCard(recordData)));
}
