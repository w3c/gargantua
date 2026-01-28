import { config as newConfig } from './config.js';
import { addExportButton } from './ui-utils.js';
import { json, html } from './fetch.js';
import { hal } from './hal.js';

// Get configuration, including URL parameters
const config = newConfig();

// Define sources for fetching data
//  Except for group, W3C API calls uses hal.js instead of direct fetch
function sources(type) {
    switch (type) {
        case 'template':
        return `https://w3c.github.io/charter-drafts/charter-template.html`;
        case 'group':
        return `${config.w3cAPI}/groups/${config.group}/`;
        case 'deliverables':
        return `https://www.w3.org/groups/${config.group}/deliverables/`;
        case 'charter':
        return `https://www.w3.org/groups/${config.group}/charters/active/`;
        default:
        throw new Error(`Unknown source document type: ${type}`);
    }
}

let hasFailed = false;
function status(message) {
    if (hasFailed) return; // goes silent after failure
    let statusLog = document.getElementById('status');
    if (statusLog)
        statusLog.textContent += message + '\n';
}
function failed(reason='') {
    const initialize = document.getElementById('initialize');
    if (initialize) initialize.remove();
    const crash = document.getElementById('crash');
    if (crash) crash.classList.remove('hidden');
    status("Aborted: " +reason);
    hasFailed = true;
}

function init() {
    if (config.group) {
        // sanitize input group= parameter
        let match = config.group.match(/^(wg|ig|cg|other)\/([^/]+)$/);
        if (match) {
            config.group = `${match[1]}/${match[2]}`;
            // start generation of the charter
            generate();
        } else {
            failed(`Invalid group= parameter: ${config.group}`);
            config.group = null;
        }
    }
}
window.addEventListener('load', init);

function loadSources() {
    return Promise.all([
        fetchGroupData(),
        html(sources('template')),
        html(sources('deliverables'), { credentials: 'include' }).then(doc => {
            return doc.getElementById('deliverables').parentNode.querySelectorAll('dl');
        }),
        html(sources('charter'), { credentials: 'include' }),
    ]);
}

function generate() {
    loadSources().then(([group, template, deliverables, charter]) => {
        return compute({ group, template, deliverables, charter });
    }).then((draft) => {
        draft.querySelectorAll('.remove').forEach(s => s.remove());
        document.documentElement.replaceWith(draft.documentElement);
        addExportButton(`charter-${config.group}-${new Date().getFullYear()}.html`);
    }).catch(err => {
        failed(`${err.message}${err.cause ? ' -- Cause: ' + err.cause.message : ''}`);
        console.log(err);
    });
}

/**
* Template replacements
*/


function compute(r) {
    const { group, template, deliverables, charter } = r;

    if (config.debug) console.log(r);

    status('Generating charter document...');

    // copy the template to avoid side effects
    const draft = template.cloneNode(true);

    // title
    draft.title = group.longname + ' Charter';
    // mission
    const mission = draft.querySelector(`.mission`);
    if (mission) {
        mission.innerHTML = group.description;
    }
    // navbar
    const navBar = draft.querySelector(`#navbar`);
    if (navBar) {
        const patentPolicySection = draft.getElementById(`patentpolicy`);
        const patentChildren = patentPolicySection? Array.from(patentPolicySection.children) : [];
        const patentPolicies = Array.from(navBar.querySelectorAll(`a[href="#patentpolicy"]`));
        
        if (patentPolicies.length === 2 && patentChildren.length === 5) {
            if (group['group-type'] === 'wg') {
                patentPolicies[1].remove();
                patentChildren[0].remove();
                patentChildren[3].remove();
                patentChildren[4].remove();
                
            } else if (group['group-type'] === 'ig') {
                patentPolicies[0].remove();
                patentChildren[0].remove();
                patentChildren[1].remove();
                patentChildren[2].remove();
            }
        }
    }
    
    // Summary table
    const statusSection = draft.getElementById(`Status`);
    if (statusSection) {
        const anchor = statusSection.querySelector('a.todo');
        if (anchor) {
            replaceAnchor(group, statusSection);
            anchor.classList.remove('todo');
        }
    }
    const chairs = draft.getElementById(`Chairs`);
    if (chairs) {
        chairs.children[1].textContent = group.chairs.sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`).join(', ');
    }
    const teamContacts = draft.getElementById(`TeamContacts`);
    if (teamContacts) {
        teamContacts.children[1].textContent = group["team-contacts"].sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`).join(', ');
    }
    const calendar = draft.getElementById(`MeetingSchedule`);
    if (calendar) {
        const anchor = calendar.querySelector('a.todo');
        if (anchor) {
            replaceAnchor(group, calendar);
            anchor.classList.remove('todo');
        }
    }
    
    // background
    const background = draft.getElementById("background");
    const oldbackground = charter.getElementById("background");
    if (background && oldbackground) {
        draft.adoptNode(oldbackground);
        background.replaceWith(oldbackground);
    }
    
    // scope
    const scope = draft.getElementById("scope");
    const oldscope = charter.getElementById("scope");
    if (scope && oldscope) {
        draft.adoptNode(oldscope);
        scope.replaceWith(oldscope);
    }
    
    // deliverables
    const templateDeliverables = draft.getElementById(`deliverables`);
    if (templateDeliverables && group['group-type'] === 'ig') {
        Array.from(templateDeliverables.querySelectorAll('p, ul, section')).forEach(p => p.remove());
        // @@grab from active charter and deliverables API list ?
    } else {
        const normative = draft.getElementById(`normative`);
        if (normative) {
            const dl = normative.querySelector('dl');
            draft.adoptNode(deliverables[0]);
            dl.replaceWith(deliverables[0]);
        }
    }
    
    // success criteria for IG should be written from scratch
    const successCriteria = draft.getElementById(`success-criteria`);
    if (successCriteria && group['group-type'] === 'ig') {
        Array.from(successCriteria.querySelectorAll('p, ul')).forEach(p => p.remove());
    }
    
    // Coordination
    const coordination = draft.getElementById("coordination");
    if (coordination) {
        const children = Array.from(coordination.children);
        if (group["group-type"] === "wg") {
            children[1].remove();
            children[3].remove();
            children[4].remove();
        } else {
            children[1].remove();
            children[2].remove();
            children[3].remove();
        }
    }
    
    // Participation
    const publicName = draft.getElementById("public-name");
    if (publicName && group.publicList) {
        publicName.textContent = `${group.publicList.shortdesc}@w3.org`;
        publicName.href = `mailto:${group.publicList.shortdesc}@w3.org`;
        publicName.classList.remove('todo');
        const archive = publicName.nextElementSibling;
        archive.href = group.publicList.link;
        archive.classList.remove('todo');
    }
    const publicGithub = draft.getElementById("public-github");
    if (publicGithub) {
        publicGithub.href = `${group.url}tools/#repositories`;
        publicGithub.classList.remove('todo');
    }
    
    // history
    const history = draft.querySelector("table.history");
    const oldhistory = charter.querySelector("table.history");
    if (history && oldhistory) {
        draft.adoptNode(oldhistory);
        history.replaceWith(oldhistory);
        // enhance with charter history from W3C API
    }
    
    // footer
    const teamContact = draft.querySelector("a[href='mailto:']");
    if (teamContact) {
        const first = group["team-contacts"][0];
        teamContact.textContent = first.name;
        teamContact.href = `mailto:${first.email || ''}`;
        if (teamContact.href !== 'mailto:') {
            teamContact.classList.remove('todo');
        }
    }
    
    // deals with the rest of replacements
    
    // anchors
    replaceAnchor(group, draft);
    
    // todos
    replaceTodo(group, draft);

    return draft;
}


function replaceTodo(group, element=document) {
    const todos = element.querySelectorAll(`.todo`);
    
    todos.forEach(todo => {
        let oText = todo.textContent;
        let newText = oText;
        let changed = true;
        while (changed) {
            changed = false;
            if (newText.includes('(Working|Interest)')) {
                newText = newText.replace('(Working|Interest)', group.type.split(' ')[0]);
                changed = true;
            }
            if (newText.includes('[name]')) {
                newText = newText.replace('[name]', group.name);
                changed = true;
            }
            if (newText.includes('[yyyy]')) {
                newText = newText.replace('[yyyy]', new Date().getFullYear());
                changed = true;
            }
        }
        if (newText !== oText) {
            todo.replaceWith(newText);
        }
    });
}

function replaceAnchor(group, element=document) {
    const anchors = element.querySelectorAll("a[href]");
    
    anchors.forEach(anchor => {
        let oText = anchor.href;
        let newText = oText;
        let changed = true;
        while (changed) {
            changed = false;
            if (newText.includes('[type]')) {
                newText = newText.replace('[type]', group["group-type"]);
                changed = true;
            }
            if (newText.includes('[shortname]')) {
                newText = newText.replace('[shortname]', group.shortname);
                changed = true;
            }
        }
        if (newText !== oText) {
            anchor.href = newText;
        }
    });
}

// Fetch group data from W3C Groups API and enrich it

async function fetchGroupData() {
    status('Loading group data...');
    const group = await json(sources('group')).catch(err => err);
    if (group instanceof Error) {
        failed(`Could not load group data from W3C Groups API: ${group.message}`);
        throw new Error('abort', { cause: group });
    }
    if (!['working group', 'interest group'].includes(group.type)) {
        failed(`This tool only works with working groups and interest groups.`);
        throw new Error('abort');
    }
    // we adapt to the charter template
    group.identifier = config.group;
    group["group-type"] = (group.type === "working group") ? "wg" : "ig";
    group.longname = group.name;
    group.name = group.longname.slice(0, 0-(group.type.length)).trim();
    group.type = group.longname.slice(group.name.length).trim();
    
    status(`Found Group: ${group.longname}`);
    
    group.url = `https://www.w3.org/groups/${group.identifier}/`;
    group.description = group.description
    .replace('mission', '<strong>mission</strong>')
    .replace(group.longname, `<a href="${group.url}">${group.longname}</a>`);    
    
    async function extend(targetObject, targetProperty, postFunction) {
        const entry = targetObject._links[targetProperty];
        const url = entry.href || null;
        if (url) {
            targetObject[targetProperty] = [];
            try {
                const items = await hal(targetProperty, url, true, postFunction);
                for await (const service of items) {
                    targetObject[targetProperty].push(service);
                }
            } catch (err) {
                failed(`Could not load ${targetProperty} data from W3C API: ${err.message}`);
                throw new Error('abort', { cause: err });
            }
            return targetObject[targetProperty];
        }
    }
    await Promise.all(["chairs", "team-contacts" ].map((i) => {
        status("Loading " + i + "...");
        extend(group, i, async (individual) => {
            status("Loading affiliation(s) for " + individual.name + "...");
            let affs =  await extend(individual, "affiliations");
            affs = affs.filter(a => a["is-member"] !== false);
            if (affs.length > 0) {
                individual.organization = affs[0].name;
            }
            return {
                name: individual.name,
                organization: individual.organization,
                email: individual.email || null
            };
        })
    }));
    await Promise.all(["services" ].map((i) => extend(group, i)));
    const publiclists = group.services.filter(s => s.type === "lists" && s.closed === false && s.link.startsWith("https://lists.w3.org/Archives/Public/"));
    if (publiclists.length > 0) {
        group.publicList = publiclists[0];
    }
    return group;
}
