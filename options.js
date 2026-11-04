// Saves options to chrome.storage
const DEFAULT_GROUP_ALIASES = `# Example aliases (one group per line)
# Format: Group Name = domain1.com, domain2.com, *.domain3.com
Formative = app.formative.com, goformative.com
Learning = app.canvas.com, *.instructure.com`;

const updateGroupedBehaviorAvailability = () => {
    const reuseEnabled = document.getElementById('duplicate-tab-reuse-enabled').checked;
    document.getElementById('duplicate-tab-reuse-grouped-behavior').disabled = !reuseEnabled;
};

const saveOptions = () => {
    const showTabCount = document.getElementById('show-tab-count').checked;
    const advancedMode = document.getElementById('advanced-mode').checked;
    const groupAliases = document.getElementById('group-aliases').value;
    const duplicateTabReuseEnabled = document.getElementById('duplicate-tab-reuse-enabled').checked;
    const duplicateTabReuseMode = document.getElementById('duplicate-tab-reuse-mode').value;
    const duplicateTabReuseSites = document.getElementById('duplicate-tab-reuse-sites').value;
    const duplicateTabReuseGroupedBehavior = document.getElementById('duplicate-tab-reuse-grouped-behavior').value;

    chrome.storage.local.set(
        {
            showTabCount,
            advancedMode,
            groupAliases,
            duplicateTabReuseEnabled,
            duplicateTabReuseMode,
            duplicateTabReuseSites,
            duplicateTabReuseGroupedBehavior
        },
        () => {
            const status = document.getElementById('status');
            status.textContent = 'Options saved!';
            status.style.opacity = 1;
            setTimeout(() => {
                status.style.opacity = 0;
            }, 1500);
        }
    );
};

const restoreOptions = () => {
    chrome.storage.local.get(
        {
            showTabCount: true,
            advancedMode: false,
            groupAliases: '',
            duplicateTabReuseEnabled: false,
            duplicateTabReuseMode: 'all-except',
            duplicateTabReuseSites: '',
            duplicateTabReuseGroupedBehavior: 'focus-in-place'
        },
        (items) => {
            document.getElementById('show-tab-count').checked = items.showTabCount;
            document.getElementById('advanced-mode').checked = items.advancedMode;
            document.getElementById('group-aliases').value = items.groupAliases || '';
            document.getElementById('group-aliases').placeholder = DEFAULT_GROUP_ALIASES;
            document.getElementById('duplicate-tab-reuse-enabled').checked = items.duplicateTabReuseEnabled === true;
            document.getElementById('duplicate-tab-reuse-mode').value = items.duplicateTabReuseMode || 'all-except';
            document.getElementById('duplicate-tab-reuse-sites').value = items.duplicateTabReuseSites || '';
            document.getElementById('duplicate-tab-reuse-grouped-behavior').value =
                items.duplicateTabReuseGroupedBehavior === 'pull-out' ? 'pull-out' : 'focus-in-place';
            updateGroupedBehaviorAvailability();
        }
    );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('show-tab-count').addEventListener('change', saveOptions);
document.getElementById('advanced-mode').addEventListener('change', saveOptions);
document.getElementById('group-aliases').addEventListener('input', saveOptions);
document.getElementById('duplicate-tab-reuse-enabled').addEventListener('change', () => {
    updateGroupedBehaviorAvailability();
    saveOptions();
});
document.getElementById('duplicate-tab-reuse-mode').addEventListener('change', saveOptions);
document.getElementById('duplicate-tab-reuse-sites').addEventListener('input', saveOptions);
document.getElementById('duplicate-tab-reuse-grouped-behavior').addEventListener('change', saveOptions);
