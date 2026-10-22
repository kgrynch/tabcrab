// Saves options to chrome.storage
const saveOptions = () => {
    const showTabCount = document.getElementById('show-tab-count').checked;

    chrome.storage.local.set(
        { showTabCount: showTabCount },
        () => {
            // Update status to let user know options were saved.
            const status = document.getElementById('status');
            status.textContent = 'Options saved!';
            status.style.opacity = 1;
            setTimeout(() => {
                status.style.opacity = 0;
            }, 1500);
        }
    );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
    chrome.storage.local.get(
        { showTabCount: true }, // Default value
        (items) => {
            document.getElementById('show-tab-count').checked = items.showTabCount;
        }
    );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('show-tab-count').addEventListener('change', saveOptions);
