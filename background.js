// --- Tab Count Badge Logic ---

// Function to update the badge
const updateBadge = async () => {
    try {
        const settings = await chrome.storage.local.get(['showTabCount']);
        if (settings.showTabCount) {
            const tabs = await chrome.tabs.query({});
            chrome.action.setBadgeText({ text: tabs.length.toString() });
            // Optional: Set a color for the badge
            chrome.action.setBadgeBackgroundColor({ color: '#0e7490' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    } catch (e) {
        console.error("Error updating badge:", e);
    }
};

// Update the badge when a tab is created, removed, or the extension starts
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

// Also update when a setting is changed in the options page
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.showTabCount) {
        updateBadge();
    }
});

// Initial update
updateBadge();


// --- Keyboard Shortcut (Commands) Logic ---

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "consolidate-windows") {
        await consolidateWindows();
    } else if (command === "sort-tabs") {
        await sortTabsInCurrentWindow();
    }
});

async function consolidateWindows() {
    try {
        const currentWindow = await chrome.windows.getCurrent();
        const allTabs = await chrome.tabs.query({});
        const tabsToMove = allTabs.filter(tab => tab.windowId !== currentWindow.id);

        if (tabsToMove.length > 0) {
            const tabIdsToMove = tabsToMove.map(tab => tab.id);
            await chrome.tabs.move(tabIdsToMove, { windowId: currentWindow.id, index: -1 });
        }
    } catch (e) {
        console.error("Failed to consolidate windows:", e);
    }
}

async function sortTabsInCurrentWindow() {
    try {
        const currentWindowId = (await chrome.windows.getCurrent()).id;
        const tabsInWindow = await chrome.tabs.query({ windowId: currentWindowId, pinned: false });
        
        const sortableTabs = tabsInWindow.filter(t => t.groupId === -1);
        if (sortableTabs.length < 2) return;

        const firstSortableIndex = Math.min(...sortableTabs.map(t => t.index));

        const sortedTabsById = sortableTabs
            .sort((a, b) => {
                try { return new URL(a.url).hostname.localeCompare(new URL(b.url).hostname); } 
                catch { return 0; }
            })
            .map(t => t.id);
        
        await chrome.tabs.move(sortedTabsById, { index: firstSortableIndex });
    } catch (e) {
        console.error("Failed to sort tabs:", e);
    }
}
