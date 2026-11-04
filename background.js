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

// Track new tabs until their initial URL is available. The navigation-target
// listener below also catches links opened with target="_blank" or equivalent.
const tabsAwaitingInitialUrl = new Set();
const duplicateChecksInProgress = new Set();

const getHttpUrl = (tab) => {
    const url = tab?.pendingUrl || tab?.url || '';
    return /^https?:\/\//i.test(url) ? url : '';
};

const getHostname = (url) => {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
};

const getSitePatterns = (rawText = '') => (rawText || '')
    .split(/\r?\n/)
    .map(line => line.trim().toLowerCase())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
        const wildcard = line.startsWith('*.');
        const value = wildcard ? line.slice(2) : line;
        try {
            const hostname = new URL(value.includes('://') ? value : `https://${value}`).hostname;
            return hostname.toLowerCase().replace(/^www\./, '');
        } catch {
            return '';
        }
    })
    .filter(Boolean);

const isDuplicateReuseAllowed = (url, settings) => {
    if (settings.duplicateTabReuseEnabled !== true) return false;

    const hostname = getHostname(url);
    if (!hostname) return false;

    const patterns = getSitePatterns(settings.duplicateTabReuseSites);
    const hasMatch = patterns.some(pattern => hostname === pattern || hostname.endsWith(`.${pattern}`));
    return settings.duplicateTabReuseMode === 'only-listed' ? hasMatch : !hasMatch;
};

const reuseExistingExactUrlTab = async (newTabId, requestedUrl = '') => {
    if (newTabId == null || duplicateChecksInProgress.has(newTabId)) return;

    duplicateChecksInProgress.add(newTabId);
    try {
        let newTab;
        try {
            newTab = await chrome.tabs.get(newTabId);
        } catch {
            return;
        }

        // For link-created tabs use the exact URL reported by Chrome's
        // navigation-target event; otherwise use the tab's initial URL.
        const url = /^https?:\/\//i.test(requestedUrl) ? requestedUrl : getHttpUrl(newTab);
        if (!url) return;

        const settings = await chrome.storage.local.get([
            'duplicateTabReuseEnabled',
            'duplicateTabReuseMode',
            'duplicateTabReuseSites'
        ]);
        if (!isDuplicateReuseAllowed(url, settings)) return;

        const allTabs = await chrome.tabs.query({});
        const duplicate = allTabs
            .filter(tab => tab.id !== newTabId && (tab.url || tab.pendingUrl) === url)
            .sort((a, b) => {
                if (a.active !== b.active) return a.active ? -1 : 1;
                return (b.lastAccessed || 0) - (a.lastAccessed || 0);
            })[0];
        if (!duplicate) return;

        // The newly opened tab marks the intended window and approximate
        // position. Ungroup the reused tab so moving one tab does not move its
        // entire Chrome tab group along with it.
        if (duplicate.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
            await chrome.tabs.ungroup(duplicate.id);
        }

        let targetIndex = newTab.index;
        if (duplicate.windowId === newTab.windowId && duplicate.index < newTab.index) {
            targetIndex -= 1;
        }
        await chrome.tabs.move(duplicate.id, {
            windowId: newTab.windowId,
            index: Math.max(0, targetIndex)
        });

        try {
            await chrome.tabs.remove(newTabId);
        } catch (removeError) {
            // The user may have closed the newly created tab before the move completed.
            if (removeError?.message) console.warn('Could not close the duplicate tab:', removeError.message);
        }

        await chrome.tabs.update(duplicate.id, { active: true });
        await chrome.windows.update(newTab.windowId, { focused: true });
    } catch (e) {
        console.error('Failed to reuse an already-open exact-URL tab:', e);
    } finally {
        tabsAwaitingInitialUrl.delete(newTabId);
        duplicateChecksInProgress.delete(newTabId);
    }
};

chrome.tabs.onCreated.addListener((tab) => {
    if (tab?.id == null) return;
    tabsAwaitingInitialUrl.add(tab.id);
    if (getHttpUrl(tab)) reuseExistingExactUrlTab(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!tabsAwaitingInitialUrl.has(tabId)) return;
    if (changeInfo.url || changeInfo.status === 'complete') {
        reuseExistingExactUrlTab(tabId, changeInfo.url || '');
    }
});

// This event specifically identifies a new tab opened by following a link,
// including target="_blank" links where onCreated may initially expose no URL.
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    if (details.tabId == null || !/^https?:\/\//i.test(details.url || '')) return;
    tabsAwaitingInitialUrl.add(details.tabId);
    reuseExistingExactUrlTab(details.tabId, details.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    tabsAwaitingInitialUrl.delete(tabId);
    duplicateChecksInProgress.delete(tabId);
});

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
