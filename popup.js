document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const tabListContainer = document.getElementById('tab-list');
    const nativeGroupsContainer = document.getElementById('native-groups-list');
    const emptyState = document.getElementById('empty-state');
    const consolidateBtn = document.getElementById('consolidate-btn');
    const sortBtn = document.getElementById('sort-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    const searchInput = document.getElementById('search-input');
    const viewToggle = document.getElementById('view-toggle');
    const dedupeBtn = document.getElementById('dedupe-btn');
    const autoGroupBtn = document.getElementById('auto-group-btn'); // New button

    // --- Main Render Function ---
    const renderUI = async () => {
        const isAllTabsView = viewToggle.checked;
        consolidateBtn.disabled = !isAllTabsView;
        consolidateBtn.style.opacity = isAllTabsView ? '1' : '0.5';

        const queryInfo = isAllTabsView ? {} : { currentWindow: true };
        const allTabs = await chrome.tabs.query(queryInfo);

        tabListContainer.innerHTML = '';
        nativeGroupsContainer.innerHTML = '';

        if (allTabs.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }
        emptyState.classList.add('hidden');

        const currentWindowId = (await chrome.windows.getCurrent({populate: false})).id;
        const nativeGroupsQuery = isAllTabsView ? {} : { windowId: currentWindowId };
        const nativeGroups = await chrome.tabGroups.query(nativeGroupsQuery);
        const tabsInNativeGroups = new Set();

        for (const group of nativeGroups) {
            const groupTabs = allTabs.filter(t => t.groupId === group.id);
            if (groupTabs.length === 0) continue;
            groupTabs.forEach(t => tabsInNativeGroups.add(t.id));

            const groupEl = createCollapsibleGroup({
                id: group.id, title: group.title || 'Untitled Group',
                itemCount: groupTabs.length, type: 'native', color: group.color
            });

            const itemsContainer = groupEl.querySelector('.tab-items');
            groupTabs.sort((a,b) => a.index - b.index).forEach(tab => itemsContainer.appendChild(createTabItem(tab, false)));
            nativeGroupsContainer.appendChild(groupEl);
        }

        const tabsNotInGroups = allTabs.filter(tab => !tabsInNativeGroups.has(tab.id));
        const tabsByDomain = groupTabsByDomain(tabsNotInGroups);
        const sortedDomains = Object.keys(tabsByDomain).sort();

        for (const domain of sortedDomains) {
            const tabs = tabsByDomain[domain];

            if (tabs.length === 1) {
                const singleTab = tabs[0];
                const tabItemEl = createTabItem(singleTab, true);
                tabListContainer.appendChild(tabItemEl);
            } else {
                const groupEl = createCollapsibleGroup({
                    id: `domain-${domain}`, title: domain, itemCount: tabs.length,
                    type: 'domain', iconUrl: tabs[0].favIconUrl
                });
                const itemsContainer = groupEl.querySelector('.tab-items');
                tabs.forEach(tab => itemsContainer.appendChild(createTabItem(tab, false)));
                tabListContainer.appendChild(groupEl);
            }
        }
    };

    // --- UI Element Creation ---
    function createTabItem(tab, isStandalone = false) {
        const item = document.createElement('div');
        item.dataset.tabId = tab.id;
        item.dataset.windowId = tab.windowId;

        const closeButtonHTML = `
            <button class="close-btn" title="Close Tab">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        if (isStandalone) {
             item.className = 'tab-item flex items-center p-2 bg-white hover:bg-slate-50 cursor-pointer rounded-lg shadow-sm overflow-hidden mb-2';
             const domain = new URL(tab.url).hostname.replace('www.', '');
             item.innerHTML = `
                <img src="${tab.favIconUrl || getFaviconUrl(tab.url)}" class="w-4 h-4 mr-2 flex-shrink-0" alt="favicon">
                <div class="flex-grow overflow-hidden">
                    <div class="font-semibold text-slate-700 truncate">${domain}</div>
                    <div class="text-xs text-slate-500 truncate">${tab.title}</div>
                </div>
                ${closeButtonHTML}
             `;
        } else {
            item.className = 'tab-item flex items-center p-2 pl-4 bg-white hover:bg-slate-50 cursor-pointer border-t border-slate-100 last:border-b-0';
            item.innerHTML = `
                <img src="${tab.favIconUrl || getFaviconUrl(tab.url)}" class="w-4 h-4 mr-2 flex-shrink-0" alt="favicon">
                <span class="truncate text-slate-700 text-sm pointer-events-none flex-grow">${tab.title}</span>
                ${closeButtonHTML}
            `;
        }

        item.addEventListener('click', (e) => {
            if (!e.target.closest('.close-btn')) {
                e.stopPropagation();
                handleTabClick(tab.id, tab.windowId);
            }
        });
        
        item.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                handleTabMiddleClick(tab.id, item);
            }
        });

        item.querySelector('.close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleTabMiddleClick(tab.id, item);
        });

        return item;
    }

    function createCollapsibleGroup({ id, title, itemCount, type, color, iconUrl }) {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = `group bg-slate-100 rounded-lg shadow-sm overflow-hidden collapsible`;
        
        const header = document.createElement('div');
        header.className = `group-header flex items-center p-2 cursor-pointer ${type === 'native' ? 'bg-slate-200' : 'bg-slate-100'}`;
        
        const indicator = document.createElement('span');
        indicator.className = 'indicator';
        if (type === 'native') indicator.className += ` native-group-color bg-group-${color}`;
        else indicator.innerHTML = `<img src="${iconUrl || getFaviconUrl(`http://${title}`)}" class="w-4 h-4 flex-shrink-0" alt="favicon">`;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'font-semibold text-slate-700 truncate mx-2';
        titleSpan.textContent = title;
        
        const countSpan = document.createElement('span');
        countSpan.className = 'ml-auto text-xs font-medium bg-slate-200 text-slate-600 rounded-full px-2 py-0.5';
        countSpan.textContent = itemCount;

        header.append(indicator, titleSpan, countSpan);

        const tabItemsContainer = document.createElement('div');
        tabItemsContainer.className = 'tab-items';

        groupWrapper.appendChild(header);
        groupWrapper.appendChild(tabItemsContainer);

        header.addEventListener('click', () => groupWrapper.classList.toggle('open'));
        
        header.addEventListener('mousedown', async (e) => {
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();

                const tabsToClose = Array.from(groupWrapper.querySelectorAll('.tab-item'))
                                         .map(item => parseInt(item.dataset.tabId));

                if (tabsToClose.length > 0) {
                    await chrome.tabs.remove(tabsToClose);
                    groupWrapper.classList.add('removing');
                    setTimeout(() => groupWrapper.remove(), 300);
                }
            }
        });
        
        return groupWrapper;
    }

    // --- Event Handlers ---
    function handleTabClick(tabId, windowId) {
        chrome.windows.update(windowId, { focused: true });
        chrome.tabs.update(tabId, { active: true });
        window.close();
    }

    function handleTabMiddleClick(tabId, element) {
        chrome.tabs.remove(tabId);
        
        element.classList.add('removing');
        
        setTimeout(() => {
            const parentGroup = element.closest('.group');
            element.remove();

            if (parentGroup) {
                const remainingTabs = parentGroup.querySelectorAll('.tab-item').length;
                const countSpan = parentGroup.querySelector('.group-header .ml-auto span');
                
                if (remainingTabs > 0) {
                    countSpan.textContent = remainingTabs;
                } else {
                    parentGroup.remove();
                }
            }
        }, 300);
    }
    
    // --- Button & Toggle Handlers ---
    viewToggle.addEventListener('change', () => {
        chrome.storage.local.set({ viewModeAllTabs: viewToggle.checked });
        renderUI();
    });
    
    consolidateBtn.addEventListener('click', async () => {
        const currentWindow = await chrome.windows.getCurrent();
        const allTabs = await chrome.tabs.query({});
        const tabsToMove = allTabs.filter(tab => tab.windowId !== currentWindow.id);

        if (tabsToMove.length > 0) {
            const tabIdsToMove = tabsToMove.map(tab => tab.id);
            await chrome.tabs.move(tabIdsToMove, { windowId: currentWindow.id, index: -1 });
            renderUI();
        }
    });

    sortBtn.addEventListener('click', async () => {
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
        renderUI();
    });
    
    dedupeBtn.addEventListener('click', async () => {
        const isAllTabsView = viewToggle.checked;
        const queryInfo = isAllTabsView ? {} : { currentWindow: true };
        const tabs = await chrome.tabs.query(queryInfo);

        const urls = new Map();
        const duplicates = [];

        for (const tab of tabs) {
            if (urls.has(tab.url)) {
                duplicates.push(tab.id);
            } else {
                urls.set(tab.url, tab.id);
            }
        }

        if (duplicates.length > 0) {
            await chrome.tabs.remove(duplicates);
            renderUI();
        }
    });

    // --- NEW: Auto-Group Button Logic ---
    autoGroupBtn.addEventListener('click', async () => {
        const isAllTabsView = viewToggle.checked;
        const queryInfo = isAllTabsView ? {} : { currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE };
        const tabsToGroup = await chrome.tabs.query(queryInfo);

        const tabsByDomain = groupTabsByDomain(tabsToGroup);

        for (const domain in tabsByDomain) {
            const tabs = tabsByDomain[domain];
            if (tabs.length > 1) { // Only create a group if there's more than one tab
                const tabIds = tabs.map(t => t.id);
                const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
                await chrome.tabGroups.update(newGroupId, { title: domain });
            }
        }
        renderUI();
    });

    toggleAllBtn.addEventListener('click', () => {
        const allCollapsible = document.querySelectorAll('.group.collapsible');
        const anyOpen = [...allCollapsible].some(el => el.classList.contains('open'));
        allCollapsible.forEach(group => group.classList.toggle('open', !anyOpen));
    });
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#tab-list > .tab-item').forEach(item => {
             const title = item.querySelector('.truncate:last-child').textContent.toLowerCase();
             const domain = item.querySelector('.truncate:first-child').textContent.toLowerCase();
             item.style.display = (title.includes(query) || domain.includes(query)) ? 'flex' : 'none';
        });
        document.querySelectorAll('.group').forEach(group => {
            let groupVisible = false;
            const tabsInGroup = group.querySelectorAll('.tab-item');
            
            tabsInGroup.forEach(tab => {
                const title = tab.querySelector('.truncate').textContent.toLowerCase();
                const isMatch = title.includes(query);
                tab.style.display = isMatch ? 'flex' : 'none';
                if (isMatch) groupVisible = true;
            });
            const groupTitle = (group.querySelector('.group-header .truncate')?.textContent || '').toLowerCase();
            if (groupTitle.includes(query)) {
                groupVisible = true;
                tabsInGroup.forEach(tab => tab.style.display = 'flex');
            }
            group.style.display = groupVisible ? 'block' : 'none';
        });
    });

    // --- Utility Functions ---
    function groupTabsByDomain(tabs) {
        return tabs.reduce((acc, tab) => {
            // Only group valid http/https tabs
            if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
                try {
                    const domain = new URL(tab.url).hostname.replace('www.', '');
                    if (!acc[domain]) acc[domain] = [];
                    acc[domain].push(tab);
                } catch (e) { /* ignore invalid URLs */ }
            }
            return acc;
        }, {});
    }

    function getFaviconUrl(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=16`;
        } catch { return 'icons/icon16.png'; }
    }

    // --- Initial Load ---
    async function initialize() {
        try {
            const data = await chrome.storage.local.get(['viewModeAllTabs']);
            viewToggle.checked = data.viewModeAllTabs !== false;
        } catch (e) {
            console.error("Error loading state:", e);
            viewToggle.checked = true;
        }
        renderUI();
        setTimeout(() => searchInput.focus(), 100);
    }

    initialize();
});

