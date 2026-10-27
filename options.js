// Saves options to chrome.storage
const DEFAULT_GROUP_ALIASES = `# Example aliases (one group per line)
# Format: Group Name = domain1.com, domain2.com, *.domain3.com
Formative = app.formative.com, goformative.com
Learning = app.canvas.com, *.instructure.com`;

const saveOptions = () => {
    const showTabCount = document.getElementById('show-tab-count').checked;
    const advancedMode = document.getElementById('advanced-mode').checked;
    const groupAliases = document.getElementById('group-aliases').value;

    chrome.storage.local.set(
        { showTabCount, advancedMode, groupAliases },
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
            groupAliases: ''
        },
        (items) => {
            document.getElementById('show-tab-count').checked = items.showTabCount;
            document.getElementById('advanced-mode').checked = items.advancedMode;
            document.getElementById('group-aliases').value = items.groupAliases || '';
            document.getElementById('group-aliases').placeholder = DEFAULT_GROUP_ALIASES;
        }
    );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('show-tab-count').addEventListener('change', saveOptions);
document.getElementById('advanced-mode').addEventListener('change', saveOptions);
document.getElementById('group-aliases').addEventListener('input', saveOptions);
