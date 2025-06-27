// This module holds the shared state of the application.
export const state = {
    app: null,
    db: null,
    recordsUnsubscribe: null,
    commonFaultsUnsubscribe: null,
    allRecords: [],
    allCommonFaults: [],
    groupedFaults: new Map(),
    currentSearch: '',
    currentCategory: 'all',
    currentUserDisplayName: '',
    currentStatusFilter: 'open',
    recordToDelete: null,
    expandedRecordIds: new Set(),
    pendingRecordData: null,
    isInitialLoad: true,
    recentlySavedCommentInfo: null,
    recordForLinking: null,
};

// Centralized DOM element references
export const dom = {};

// For styling grouped faults
export const groupColorAssignments = new Map();
export const groupBackgroundColors = ['#f0f9ff', '#f7fee7', '#fefce8', '#fff7ed', '#fdf2f8', '#faf5ff'];
