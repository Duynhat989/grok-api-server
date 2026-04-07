const grokDataStore = require('../services/GrokDataStore');

// ===== LOAD DATA KHI START =====
function loadData() {
    const dataGrok = grokDataStore.readAccounts();
    console.log("✅ Loaded data:", dataGrok.length, "accounts");
    return dataGrok;
}

// ===== ADD ACCOUNT =====
function addAccount(data) {
    return grokDataStore.addAccount(data);
}

// ===== UPDATE ACCOUNT =====
function updateAccount(id, newData) {
    return grokDataStore.updateAccountById(id, newData);
}

// ===== DELETE ACCOUNT =====
function deleteAccount(id) {
    return grokDataStore.deleteAccountById(id);
}

// ===== GET ALL =====
function getAllAccounts() {
    return grokDataStore.readAccounts();
}

// ===== TOGGLE ACTIVE =====
function toggleActive(id) {
    return grokDataStore.updateAccountById(id, current => ({
        active: !current.active
    }));
}

// ===== SET LIVE/DIE =====
function setStatus(id, status) {
    return grokDataStore.updateAccountById(id, {
        status: status || ''
    });
}

loadData();

// ===== EXPORT =====
module.exports = {
    loadData,
    getAllAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    toggleActive,
    setStatus
};