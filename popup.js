document.addEventListener('DOMContentLoaded', () => {
    const tabListContainer = document.getElementById('tab-list');
    const nativeGroupsContainer = document.getElementById('native-groups-list');
    const savedGroupsContainer = document.getElementById('saved-groups-list');
    const emptyState = document.getElementById('empty-state');
    const consolidateBtn = document.getElementById('consolidate-btn');
    const sortBtn = document.getElementById('sort-btn');
    const toggleAllBtn = document.getElementById('toggle-all-btn');
    const searchInput = document.getElementById('search-input');
    const viewToggle = document.getElementById('view-toggle');
    const dedupeBtn = document.getElementById('dedupe-btn');
    const autoGroupBtn = document.getElementById('auto-group-btn');
    const smartGroupBtn = document.getElementById('smart-group-btn');
    const saveGroupsBtn = document.getElementById('save-groups-btn');

    const getSavedGroups = async () => {
        const { savedTabGroups = [] } = await chrome.storage.local.get(['savedTabGroups']);
        return savedTabGroups;
    };

    const setSavedGroups = async (groups) => {
        await chrome.storage.local.set({ savedTabGroups: groups });
    };

    const buildSavedGroupFromTabs = (name, tabs) => ({
        id: `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        memberUrls: tabs.map(tab => tab.url).filter(Boolean),
        isLocked: false,
        createdAt: Date.now()
    });

    const renderSavedGroups = async (allTabs) => {
        const savedGroups = await getSavedGroups();
        savedGroupsContainer.innerHTML = '';
        savedGroupsContainer.classList.toggle('hidden', savedGroups.length === 0);

        for (const group of savedGroups) {
            const groupTabs = allTabs.filter(tab => tab && tab.url && group.memberUrls.includes(tab.url));

            const groupEl = document.createElement('div');
            groupEl.className = 'group bg-cyan-50 rounded-lg shadow-sm overflow-hidden collapsible open';

            const header = document.createElement('div');
            header.className = 'group-header flex items-center p-2 cursor-pointer bg-cyan-100';

            const title = document.createElement('span');
            title.className = 'font-semibold text-slate-700 truncate mx-2';
            title.textContent = group.name;

            const state = document.createElement('span');
            state.className = 'text-xs font-medium bg-slate-200 text-slate-600 rounded-full px-2 py-0.5';
            state.textContent = `${groupTabs.length} open`;

            const lockBtn = document.createElement('button');
            lockBtn.className = 'action-btn-text px-2 py-1 ml-2';
            lockBtn.textContent = group.isLocked ? 'Unlock' : 'Lock';
            lockBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const groups = await getSavedGroups();
                const next = groups.map(item => item.id === group.id ? { ...item, isLocked: !item.isLocked } : item);
                await setSavedGroups(next);
                renderUI();
            });

            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'action-btn-text px-2 py-1';
            restoreBtn.textContent = 'Restore';
            restoreBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const allOpenTabs = await chrome.tabs.query({});
                const ids = allOpenTabs
                    .filter(tab => group.memberUrls.includes(tab.url))
                    .map(tab => tab.id);
                if (ids.length > 1) {
                    const newGroupId = await chrome.tabs.group({ tabIds: ids });
                    await chrome.tabGroups.update(newGroupId, { title: group.name });
                }
                renderUI();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn-text px-2 py-1';
            deleteBtn.textContent = 'Remove';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const groups = await getSavedGroups();
                await setSavedGroups(groups.filter(item => item.id !== group.id));
                renderUI();
            });

            header.append(title, state, lockBtn, restoreBtn, deleteBtn);

            const items = document.createElement('div');
            items.className = 'tab-items';

            if (groupTabs.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'p-2 text-xs text-slate-500';
                empty.textContent = 'No matching tabs are open right now.';
                items.appendChild(empty);
            } else {
                groupTabs.forEach(tab => items.appendChild(createTabItem(tab, false)));
            }

            groupEl.appendChild(header);
            groupEl.appendChild(items);
            savedGroupsContainer.appendChild(groupEl);
        }
    };

    const renderUI = async () => {
        const settings = await chrome.storage.local.get(['viewModeAllTabs', 'advancedMode', 'groupAliases']);
        const isAllTabsView = viewToggle.checked;
        const advancedMode = settings.advancedMode === true;

        consolidateBtn.disabled = !isAllTabsView;
        consolidateBtn.style.opacity = isAllTabsView ? '1' : '0.5';
        smartGroupBtn.classList.toggle('hidden', !advancedMode);
        saveGroupsBtn.classList.toggle('hidden', !advancedMode);

        const queryInfo = isAllTabsView ? {} : { currentWindow: true };
        const allTabs = await chrome.tabs.query(queryInfo);

        tabListContainer.innerHTML = '';
        nativeGroupsContainer.innerHTML = '';

        if (allTabs.length === 0) {
            emptyState.classList.remove('hidden');
            savedGroupsContainer.innerHTML = '';
            savedGroupsContainer.classList.add('hidden');
            return;
        }
        emptyState.classList.add('hidden');

        const currentWindowId = (await chrome.windows.getCurrent({ populate: false })).id;
        const nativeGroupsQuery = isAllTabsView ? {} : { windowId: currentWindowId };
        const nativeGroups = await chrome.tabGroups.query(nativeGroupsQuery);
        const tabsInNativeGroups = new Set();

        for (const group of nativeGroups) {
            const groupTabs = allTabs.filter(t => t.groupId === group.id);
            if (groupTabs.length === 0) continue;
            groupTabs.forEach(t => tabsInNativeGroups.add(t.id));

            const groupEl = createCollapsibleGroup({
                id: group.id,
                title: group.title || 'Untitled Group',
                itemCount: groupTabs.length,
                type: 'native',
                color: group.color
            });

            const itemsContainer = groupEl.querySelector('.tab-items');
            groupTabs.sort((a, b) => a.index - b.index).forEach(tab => itemsContainer.appendChild(createTabItem(tab, false)));
            nativeGroupsContainer.appendChild(groupEl);
        }

        const tabsNotInGroups = allTabs.filter(tab => !tabsInNativeGroups.has(tab.id));
        const customGroups = advancedMode ? groupTabsByCustomRules(tabsNotInGroups, settings.groupAliases || '') : {};
        const customTabIds = new Set();

        for (const [groupName, tabs] of Object.entries(customGroups).sort(([a], [b]) => a.localeCompare(b))) {
            if (tabs.length === 0) continue;
            tabs.forEach(tab => customTabIds.add(tab.id));

            if (tabs.length === 1) {
                tabListContainer.appendChild(createTabItem(tabs[0], true));
            } else {
                const groupEl = createCollapsibleGroup({
                    id: `custom-${groupName}`,
                    title: groupName,
                    itemCount: tabs.length,
                    type: 'custom'
                });
                const itemsContainer = groupEl.querySelector('.tab-items');
                tabs.forEach(tab => itemsContainer.appendChild(createTabItem(tab, false)));
                tabListContainer.appendChild(groupEl);
            }
        }

        const remainingTabs = tabsNotInGroups.filter(tab => !customTabIds.has(tab.id));
        const tabsByDomain = groupTabsByDomain(remainingTabs);
        const sortedDomains = Object.keys(tabsByDomain).sort();

        for (const domain of sortedDomains) {
            const tabs = tabsByDomain[domain];

            if (tabs.length === 1) {
                const singleTab = tabs[0];
                tabListContainer.appendChild(createTabItem(singleTab, true));
            } else {
                const groupEl = createCollapsibleGroup({
                    id: `domain-${domain}`,
                    title: domain,
                    itemCount: tabs.length,
                    type: 'domain',
                    iconUrl: tabs[0].favIconUrl
                });
                const itemsContainer = groupEl.querySelector('.tab-items');
                tabs.forEach(tab => itemsContainer.appendChild(createTabItem(tab, false)));
                tabListContainer.appendChild(groupEl);
            }
        }

        await renderSavedGroups(allTabs);
    };

    function createTabItem(tab, isStandalone = false) {
        const item = document.createElement('div');
        item.dataset.tabId = tab.id;
        item.dataset.windowId = tab.windowId;

        const closeButtonHTML = `
            <button class="close-btn" title="Close Tab">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18"/>
                    <path d="m6 6 12 12"/>
                </svg>
            </button>
        `;

        if (isStandalone) {
            item.className = 'tab-item flex items-center p-2 bg-white hover:bg-slate-50 cursor-pointer rounded-lg shadow-sm overflow-hidden mb-2';
            const domain = safeHostname(tab.url);
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
        groupWrapper.className = 'group bg-slate-100 rounded-lg shadow-sm overflow-hidden collapsible';

        const header = document.createElement('div');
        header.className = `group-header flex items-center p-2 cursor-pointer ${type === 'native' ? 'bg-slate-200' : 'bg-slate-100'}`;

        const indicator = document.createElement('span');
        indicator.className = 'indicator';
        if (type === 'native') indicator.className += ` native-group-color bg-group-${color}`;
        else if (type === 'custom') indicator.innerHTML = '<span class="native-group-color bg-cyan-100" style="display:inline-block;border-radius:9999px"></span>';
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
                    .map(item => parseInt(item.dataset.tabId, 10));

                if (tabsToClose.length > 0) {
                    await chrome.tabs.remove(tabsToClose);
                    groupWrapper.classList.add('removing');
                    setTimeout(() => groupWrapper.remove(), 300);
                }
            }
        });

        return groupWrapper;
    }

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

    viewToggle.addEventListener('change', () => {
        chrome.storage.local.set({ viewModeAllTabs: viewToggle.checked });
        renderUI();
    });

    saveGroupsBtn.addEventListener('click', async () => {
        const settings = await chrome.storage.local.get(['advancedMode']);
        if (!settings.advancedMode) return;

        const allTabs = await chrome.tabs.query({});
        const groups = [];

        const currentWindowId = (await chrome.windows.getCurrent({ populate: false })).id;
        const nativeGroups = await chrome.tabGroups.query({ windowId: currentWindowId });
        for (const group of nativeGroups) {
            const tabs = allTabs.filter(tab => tab.groupId === group.id && tab.url);
            if (tabs.length > 0) {
                groups.push(buildSavedGroupFromTabs(group.title || 'Saved Group', tabs));
            }
        }

        const byDomain = groupTabsByDomain(allTabs.filter(tab => tab.url && !(tab.groupId > -1)));
        for (const [domain, tabs] of Object.entries(byDomain)) {
            if (tabs.length > 0) groups.push(buildSavedGroupFromTabs(domain, tabs));
        }

        const existing = await getSavedGroups();
        const merged = [...existing, ...groups].filter(Boolean);
        await setSavedGroups(merged);
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

    autoGroupBtn.addEventListener('click', async () => {
        const isAllTabsView = viewToggle.checked;
        const queryInfo = isAllTabsView ? {} : { currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE };
        const tabsToGroup = await chrome.tabs.query(queryInfo);

        const tabsByDomain = groupTabsByDomain(tabsToGroup);

        for (const domain in tabsByDomain) {
            const tabs = tabsByDomain[domain];
            if (tabs.length > 1) {
                const tabIds = tabs.map(t => t.id);
                const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
                await chrome.tabGroups.update(newGroupId, { title: domain });
            }
        }
        renderUI();
    });

    smartGroupBtn.addEventListener('click', async () => {
        const settings = await chrome.storage.local.get(['advancedMode', 'groupAliases']);
        const allTabs = await chrome.tabs.query({});
        const grouped = groupTabsByCustomRules(allTabs, settings.groupAliases || '');

        for (const [groupName, tabs] of Object.entries(grouped)) {
            if (tabs.length > 1) {
                const tabIds = tabs.map(t => t.id);
                const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
                await chrome.tabGroups.update(newGroupId, { title: groupName });
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
            const title = item.querySelector('.truncate:last-child')?.textContent.toLowerCase();
            const domain = item.querySelector('.truncate:first-child')?.textContent.toLowerCase();
            item.style.display = (title?.includes(query) || domain?.includes(query)) ? 'flex' : 'none';
        });
        document.querySelectorAll('.group').forEach(group => {
            let groupVisible = false;
            const tabsInGroup = group.querySelectorAll('.tab-item');

            tabsInGroup.forEach(tab => {
                const title = tab.querySelector('.truncate')?.textContent.toLowerCase();
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

    function parseGroupAliasText(rawText = '') {
        const aliases = {};
        const lines = (rawText || '').split(/\n/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const match = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);
            if (!match) continue;

            const groupName = match[1].trim();
            const patterns = match[2].split(',').map(part => part.trim()).filter(Boolean);
            if (groupName && patterns.length) aliases[groupName] = patterns;
        }

        return aliases;
    }

    function groupTabsByCustomRules(tabs, rawText = '') {
        const aliases = parseGroupAliasText(rawText);
        const groups = {};

        for (const [groupName, patterns] of Object.entries(aliases)) {
            groups[groupName] = [];
        }

        for (const tab of tabs) {
            if (!tab.url || !(tab.url.startsWith('http:') || tab.url.startsWith('https:'))) continue;
            const hostname = safeHostname(tab.url);
            if (!hostname) continue;

            for (const [groupName, patterns] of Object.entries(aliases)) {
                if (patterns.some(pattern => matchesAlias(hostname, pattern))) {
                    groups[groupName].push(tab);
                }
            }
        }

        return Object.fromEntries(Object.entries(groups).filter(([, tabsForGroup]) => tabsForGroup.length > 0));
    }

    function matchesAlias(hostname, pattern) {
        const normalizedHostname = normalizeHostname(hostname);
        const normalizedPattern = normalizeHostname(pattern);

        if (!normalizedPattern) return false;

        if (normalizedPattern.includes('*')) {
            const regex = new RegExp('^' + normalizedPattern.split('*').map(escapeRegex).join('.*') + '$');
            return regex.test(normalizedHostname);
        }

        return normalizedHostname === normalizedPattern || normalizedHostname.endsWith(`.${normalizedPattern}`);
    }

    function normalizeHostname(value) {
        try {
            const url = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
            return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            return value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
        }
    }

    function escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function groupTabsByDomain(tabs) {
        return tabs.reduce((acc, tab) => {
            if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
                try {
                    const domain = safeHostname(tab.url);
                    if (domain) {
                        if (!acc[domain]) acc[domain] = [];
                        acc[domain].push(tab);
                    }
                } catch (e) { }
            }
            return acc;
        }, {});
    }

    function safeHostname(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    }

    function getFaviconUrl(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=16`;
        } catch { return 'icons/icon16.png'; }
    }

    async function initialize() {
        try {
            const data = await chrome.storage.local.get(['viewModeAllTabs', 'advancedMode']);
            viewToggle.checked = data.viewModeAllTabs !== false;
            if (smartGroupBtn) smartGroupBtn.classList.toggle('hidden', data.advancedMode !== true);
            if (saveGroupsBtn) saveGroupsBtn.classList.toggle('hidden', data.advancedMode !== true);
        } catch (e) {
            console.error('Error loading state:', e);
            viewToggle.checked = true;
        }
        renderUI();
        setTimeout(() => searchInput.focus(), 100);
    }

    initialize();
});
