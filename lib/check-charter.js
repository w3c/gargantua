import { addExportButton } from './ui-utils.js';

function getScriptSettings() {
    try {
        const v = JSON.parse(document.getElementById('charter-assistant-settings').textContent);
        if (v.template.date)
            return v;
    } catch (e) {        
    }
    // return undefined if not found or invalid
    return undefined;
}

const settings = getScriptSettings();

let DIV;
function getLogDiv() {
    if (!DIV) {
        DIV = document.createElement('div');
        DIV.style.maxWidth = '40rem';
        DIV.className = 'todo remove';
        document.body.insertBefore(DIV, document.body.firstChild);
    }
    return DIV;
}

function check() {
    const title = document.querySelector('h1').textContent || '';
    if (!(title.includes('DRAFT') || title.includes('PROPOSED'))) {
        const checker = document.getElementById('charter-assistant-checker');
        const url = checker ? checker.src : 'check-charter.js';
        getLogDiv().innerHTML = `<p>Document title does not include "DRAFT" or "PROPOSED"; skipping charter template check since this is a final charter.<p>Consider updating the document this check by removing the script ${url}`;
        return;
    }
    
    fetch(`https://api.github.com/repos/w3c/charter-drafts/commits?path=charter-template.html`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        return response.json();
    }).then(data => data.filter(c => c.commit.author.date > settings.template.date))
    .then(data => {
        let latest = (data && data.length > 0)? data[0] : null;
        if (!latest) return;
        
        const templateDate = latest.commit.author.date;
        const charterDate = settings.template.date;
        if (charterDate < templateDate) {
            
            let text = '';
            text += `<p>Warning: The charter template used is of ${charterDate.slice(0, 10).split('T')[0]}, which is before the latest template update on ${templateDate.slice(0, 10).split('T')[0]}. <p>Commits to consider:`;
            text += "<ul>";
            data.forEach(c => {
                const date = c.commit.author.date.slice(0, 10).split('T')[0];
                const message = c.commit.message.split('\n')[0];
                const url = c.html_url;
                text += `<li><a href="${url}">${message}</a> (${date})</li>`;
            });
            text += "</ul>";
            text += `<p>Save this new snapshot, update with the latest charter template changes (see also <a href="https://github.com/w3c/charter-drafts/compare/${settings.template.sha.slice(0, 10)}..${latest.sha.slice(0, 10)}">compare</a>), then remove this message.`;
            getLogDiv().innerHTML = text;
            settings.template.date = latest.commit.author.date;
            settings.template.sha = latest.sha;
            document.getElementById('charter-assistant-settings').textContent = JSON.stringify(settings, null, 2);
            addExportButton(`charter-${settings.group.replace('/', '-')}-${new Date().getFullYear()}.html`);
        }  
    });
}

function init() {
    check();
}

if (settings) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }
}