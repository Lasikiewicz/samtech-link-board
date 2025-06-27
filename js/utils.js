// This module contains pure utility functions.

export const formatDateTime = (timestamp) => timestamp?.seconds ? new Date(timestamp.seconds * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

export const getModelCategory = (modelNumber) => {
    if (!modelNumber) return null;
    const model = modelNumber.toUpperCase();
    if (model.startsWith('RB')) return 'REF';
    if (model.startsWith('DW')) return 'DW';
    if (['WW', 'WM', 'WF', 'WD'].some(prefix => model.startsWith(prefix))) return 'WSM';
    if (model.startsWith('TD')) return 'TD';
    return null;
};
