// --- Tab Count Badge Logic ---

const updateBadge = async () => {
    try {
        const settings = await chrome.storage.local.get(['showTabCount']);
        if (settings.showTabCount) {
            const tabs = await chrome.tabs.query({});
            chrome.action.setBadgeText({ text: tabs.length.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#0e7490' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    } catch (e) {
        console.error('Error updating badge:', e);
    }
};

chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.showTabCount) {
        updateBadge();
    }
});

updateBadge();

chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'consolidate-windows') {
        await consolidateWindows();
    } else if (command === 'sort-tabs') {
        await sortTabsInCurrentWindow();
    }
});

function getTabBucketLabel(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.hostname.replace(/^www\./, '').toLowerCase();
        }

        const scheme = (parsed.protocol || '').replace(/:$/, '') || 'Other';
        if (scheme === 'chrome') return 'Chrome pages';
        if (scheme === 'chrome-extension') return 'Extensions';
        if (scheme === 'file') return 'File pages';
        if (scheme === 'about') return 'About pages';
        return `${scheme.charAt(0).toUpperCase()}${scheme.slice(1)} pages`;
    } catch {
        return 'Other pages';
    }
}

async function moveTabsToWindow(targetWindowId) {
    try {
        const allTabs = await chrome.tabs.query({});
        const sourceWindowIds = new Set(allTabs.filter(tab => tab.windowId !== targetWindowId).map(tab => tab.windowId));

        for (const sourceWindowId of sourceWindowIds) {
            try {
                const groups = await chrome.tabGroups.query({ windowId: sourceWindowId });
                for (const group of groups) {
                    try {
                        await chrome.tabGroups.move(group.id, { windowId: targetWindowId, index: -1 });
                    } catch (groupError) {
                        console.error('Failed to move Chrome group:', groupError);
                    }
                }
            } catch (windowError) {
                console.error('Failed to query tab groups for source window:', sourceWindowId, windowError);
            }
        }

        const remainingTabs = allTabs.filter(tab => tab.windowId !== targetWindowId && tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
        if (remainingTabs.length > 0) {
            const tabIdsToMove = remainingTabs.map(tab => tab.id);
            try {
                await chrome.tabs.move(tabIdsToMove, { windowId: targetWindowId, index: -1 });
            } catch (moveError) {
                console.error('Failed to move remaining tabs:', moveError);
            }
        }
    } catch (e) {
        console.error('Failed to consolidate windows:', e);
    }
}

async function consolidateWindows() {
    try {
        const currentWindow = await chrome.windows.getCurrent();
        await moveTabsToWindow(currentWindow.id);
    } catch (e) {
        console.error('Failed to consolidate windows:', e);
    }
}

async function sortUngroupedTabsInWindow(windowId) {
    const tabsInWindow = await chrome.tabs.query({ windowId, pinned: false });
    const sortableTabs = tabsInWindow.filter(tab => tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE && tab.url);
    if (sortableTabs.length < 2) return;

    const firstSortableIndex = Math.min(...sortableTabs.map(tab => tab.index));
    const sortedTabsById = sortableTabs
        .slice()
        .sort((a, b) => {
            const aHost = getTabBucketLabel(a.url);
            const bHost = getTabBucketLabel(b.url);
            if (!aHost && !bHost) return 0;
            if (!aHost) return 1;
            if (!bHost) return -1;
            return aHost.localeCompare(bHost);
        })
        .map(tab => tab.id);

    await chrome.tabs.move(sortedTabsById, { index: firstSortableIndex });
}

async function sortTabsInCurrentWindow() {
    try {
        const currentWindowId = (await chrome.windows.getCurrent()).id;
        await sortUngroupedTabsInWindow(currentWindowId);
    } catch (e) {
        console.error('Failed to sort tabs:', e);
    }
}
