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

async function sortTabsInCurrentWindow() {
    try {
        const currentWindowId = (await chrome.windows.getCurrent()).id;
        await sortUngroupedTabsInWindow(currentWindowId);
    } catch (e) {
        console.error("Failed to sort tabs:", e);
    }
}

async function sortUngroupedTabsInWindow(windowId) {
    const tabsInWindow = await chrome.tabs.query({ windowId, pinned: false });
    const sortableTabs = tabsInWindow.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE && t.url);
    if (sortableTabs.length < 2) return;

    const firstSortableIndex = Math.min(...sortableTabs.map(t => t.index));
    const sortedTabsById = sortableTabs
        .slice()
        .sort((a, b) => {
            const aHost = safeHostname(a.url);
            const bHost = safeHostname(b.url);
            if (!aHost && !bHost) return 0;
            if (!aHost) return 1;
            if (!bHost) return -1;
            return aHost.localeCompare(bHost);
        })
        .map(t => t.id);

    await chrome.tabs.move(sortedTabsById, { index: firstSortableIndex });
}

function safeHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

async function consolidateWindows() {
    try {
        const currentWindow = await chrome.windows.getCurrent();
        const allTabs = await chrome.tabs.query({});
        const tabsToMove = allTabs.filter(tab => tab.windowId !== currentWindow.id && tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);

        const otherWindows = [...new Set(allTabs.filter(tab => tab.windowId !== currentWindow.id).map(tab => tab.windowId))];

        for (const sourceWindowId of otherWindows) {
            try {
                const windowGroups = await chrome.tabGroups.query({ windowId: sourceWindowId });
                for (const group of windowGroups) {
                    try {
                        await chrome.tabGroups.move(group.id, { windowId: currentWindow.id, index: -1 });
                    } catch (groupError) {
                        console.error('Failed to move Chrome group:', groupError);
                    }
                }
            } catch (e) {
                console.error('Failed to query groups for window:', sourceWindowId, e);
            }
        }

        if (tabsToMove.length > 0) {
            const tabIdsToMove = tabsToMove.map(tab => tab.id);
            await chrome.tabs.move(tabIdsToMove, { windowId: currentWindow.id, index: -1 });
        }
    } catch (e) {
        console.error("Failed to consolidate windows:", e);
    }
}
