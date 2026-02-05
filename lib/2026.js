import { config as newConfig } from './config.js';
import { delay, signal } from './timeout.js';
import { addExportButton } from './ui-utils.js';
import { json, html } from './fetch.js';
import hal from './hal.js';

// Get configuration, including URL parameters
const config = newConfig();

// Define sources for fetching data
//  Except for group, W3C API calls uses hal.js instead of direct fetch
function sources(type, identifier='') {
    status(`Loading ${type}`);
    switch (type) {
        case 'groups':
        return 'https://w3c.github.io/groups/w3c-groups.json';
        case 'template':
        return `https://w3c.github.io/charter-drafts/charter-template.html`;
        case 'template-commits':
        return `https://api.github.com/repos/w3c/charter-drafts/commits?path=charter-template.html`;
        case 'deliverables':
        return `https://www.w3.org/groups/${identifier}/deliverables/`;
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
    if (config.gid) {
        // sanitize input group= parameter
        let match = config.gid.match(/^(wg|ig|cg|other)\/([^/]+)$/);
        if (match) {
            config.group = `${match[1]}/${match[2]}`;
            delete config.gid;
            // start generation of the charter
            generate(config.group);
        } else {
            failed(`Invalid gid= parameter: ${config.gid}`);
            config.gid = null;
        }
    } else {
        failed('No gid= parameter provided');
    }
}
window.addEventListener('load', init);

function loadSources(identifier) {
    return Promise.all([
        fetchGroupData(identifier),
        html(sources('template'), { signal: signal() }),
        (identifier.startsWith('wg/')) ? html(sources('deliverables', identifier), { credentials: 'include', signal: signal() }).then(doc => {
            return doc.getElementById('deliverables').parentNode.querySelectorAll('dl');
        }) : null, // note: ig/i18n doesn't exist
        json(sources('template-commits'), { signal: signal() }),
    ]);
}

function generate(identifier) {
    Promise.all([
        loadSources(identifier).then(([group, template, deliverables, templateCommits]) => compute(group, template, deliverables, templateCommits)),
        delay(5) // ensure the status is shown for a minimum amount of time
    ]).then(([draft, timeOut]) => {
        document.documentElement.replaceWith(draft.documentElement);
        addExportButton(`charter-${identifier.replace('/', '-')}-${new Date().getFullYear()}.html`);
    }).catch(err => {
        failed(`${err.message}${err.cause ? ' -- Cause: ' + err.cause.message : ''}`);
        console.log(err);
    });
}

/**
* Template replacements
*/

async function compute(group, template, deliverables, templateCommits) {
    
    const charter = group.charterDoc;
    if (config.debug) console.log({ group, template, deliverables, charter, templateCommits });
    
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
        const persons = group.chairs.sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`);
        if (persons.length === 1) {
            chairs.children[1].textContent = persons[0];
        } else {
            chairs.children[1].innerHTML = `<ul><li>${persons.join('</li><li>')}</li></ul>`;
        }
    }
    const teamContacts = draft.getElementById(`TeamContacts`);
    if (teamContacts) {
        const persons = group["team-contacts"].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<a href="mailto:${c.email}">${c.name}</a> <i class="todo">(0.1 <abbr title="Full-Time Equivalent">FTE</abbr>)</i>`);
        if (persons.length === 1) {
            teamContacts.children[1].innerHTML = persons[0];
        } else {
            teamContacts.children[1].innerHTML = `<ul><li>${persons.join('</li><li>')}</li></ul>`;
        }
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
        background.replaceWith(oldbackground.cloneNode(true));
    }
    
    // scope
    const scope = draft.getElementById("scope");
    const oldscope = charter.getElementById("scope");
    if (scope && oldscope) {
        scope.replaceWith(oldscope.cloneNode(true));
    }
    
    if (!config.workMode) {
        if (group['group-type'] === 'ig') {
            config.workMode = 'no-rec-track';
        } else { // else wg
            // determine from charter deliverables section
            const oldDeliverables = charter.getElementById("deliverables");
            if (oldDeliverables) {
                const draftState = oldDeliverables.querySelectorAll('p');
                for (let index = 0; index < draftState.length && !config.workMode; index++) {
                    const p = draftState.item(index).textContent.replace(/[\t\n ]+/g, ' ');
                    if (p.includes('projected to become a Recommendation')) {
                        config.workMode = 'rec';
                    } else if (p.includes('not intend to advance their documents to Recommendation')) {
                        config.workMode = 'cr-snapshot';
                    }
                }
                config.workModeFromDeliverables = (config.workMode)? config.workMode : 'unknown';
            }
            // determine from success-criteria section
            const oldSuccess = charter.getElementById("success-criteria");
            if (oldSuccess) {
                const draftState = oldSuccess.querySelectorAll('p');
                if (!config.workMode) {
                    for (let index = 0; index < draftState.length && !config.workMode; index++) {
                        const p = draftState.item(index).textContent.replace(/[\t\n ]+/g, ' ');
                        if (p.includes('advance beyond Candidate Recommendation')
                            || p.includes('advance beyond Proposed Recommendation')) {
                            config.workMode = 'rec';
                        } else if (p.includes('expressions of interest from at least two potential implementors')) {
                            config.workMode = 'cr-snapshot';
                        }
                    }
                }
                config.workModeFromSuccessCriteria = (config.workMode)? config.workMode : 'unknown';
            } else {
                config.workModeFromSuccessCriteria = 'skipped';
            }
            if (!config.workMode)
                config.workMode = 'unknown';
        }
    }
    
    // deliverables
    const templateDeliverables = draft.getElementById(`deliverables`);
    if (templateDeliverables && group['group-type'] === 'ig') {
        const oldDeliverables = charter.getElementById("deliverables");
        if (oldDeliverables) {
            templateDeliverables.replaceWith(oldDeliverables.cloneNode(true));
        } else {
            Array.from(templateDeliverables.querySelectorAll('p, ul, section')).forEach(p => p.remove());
        }
        // @@grab also from deliverables API list ?
    } else {
        const normative = draft.getElementById(`normative`);
        if (normative) {
            const dl = normative.querySelector('dl');
            const parentNode = dl.parentNode;
            parentNode.insertBefore(document.createComment(`  ${sources('deliverables', group.identifier)} `), dl);
            parentNode.insertBefore(document.createTextNode(`\n          `), dl);
            deliverables[0].setAttribute('data-timestamp', new Date().toISOString());
            dl.replaceWith(deliverables[0].cloneNode(true));
        }
    }
    
    // success criteria for IG should be written from scratch
    const successCriteria = draft.getElementById(`success-criteria`);
    config["a11y-impact"] = "unknown";
    if (successCriteria) {
        const oldSuccess = charter.getElementById("success-criteria");
        if (group['group-type'] === 'ig') {
            if (oldSuccess) {
                templateDeliverables.replaceWith(oldSuccess.cloneNode(true));
            } else {
                Array.from(successCriteria.querySelectorAll('p, ul')).forEach(p => p.remove());
            }
        } else if (oldSuccess) { // wg
            const a11y = oldSuccess.querySelectorAll('p');
            let hasA11y = false;
            for (let index = 0; index < a11y.length && !hasA11y; index++) {
                const p = a11y.item(index).textContent.replace(/[\t\n ]+/g, ' ');
                if (p.includes('should contain a section on accessibility')) {
                    hasA11y = true;
                }
            }
            const a11yP = draft.getElementById("a11y-section");
            if (a11yP) {
                if (!hasA11y) {
                    a11yP.parentNode.insertBefore(document.createComment(` Accessibility section (p#a11y-section) removed as not present in previous charter `), a11yP);
                    a11yP.remove();
                    config["a11y-impact"] = "false";
                } else {
                    const todos = a11yP.querySelectorAll('.todo');
                    todos.forEach(t => t.remove());
                    config["a11y-impact"] = "true";
                }
            }
        }
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
    
    // we might need to update some links
    const checkGroups = [];
    
    let w3cCoordination = draft.getElementById("w3c-coordination");
    let oldw3cCoordination = charter.getElementById("w3c-coordination");
    if (w3cCoordination && oldw3cCoordination) {
        if (w3cCoordination.tagName.toLowerCase() !== 'section') {
            w3cCoordination = w3cCoordination.parentNode;
        }
        if (oldw3cCoordination.tagName.toLowerCase() !== 'section') {
            oldw3cCoordination = oldw3cCoordination.parentNode;
        }
        Array.from(w3cCoordination.children).forEach(p => p.remove());
        Array.from(oldw3cCoordination.children).forEach(p => w3cCoordination.appendChild(p.cloneNode(true)));
        // now let's fix the anchors to prevent propagating old homepages
        Array.from(w3cCoordination.querySelectorAll('dt>a')).forEach(a => {
            if (a.href.startsWith('http://')) {
                a.href = a.href.replace('http://', 'https://');
                a.classList.add('todo');
            }
            // add all W3C Groups for further checks.
            checkGroups.push(a);
        });
    }
    
    let externalCoordination = draft.getElementById("external-coordination");
    let oldexternalCoordination = charter.getElementById("external-coordination");
    if (externalCoordination && oldexternalCoordination) {
        if (externalCoordination.tagName.toLowerCase() !== 'section') {
            externalCoordination = externalCoordination.parentNode;
        }
        if (oldexternalCoordination.tagName.toLowerCase() !== 'section') {
            oldexternalCoordination = oldexternalCoordination.parentNode;
        }
        Array.from(externalCoordination.children).forEach(p => p.remove());
        Array.from(oldexternalCoordination.children).forEach(p => externalCoordination.appendChild(p.cloneNode(true)));
        Array.from(w3cCoordination.querySelectorAll('dt>a')).forEach(a => {
            if (a.href.startsWith('http://')) {
                // flag those for further review
                a.classList.add('todo');
            }
            if (a.href.startsWith('https://www.w3.org/')) {
                checkGroups.push(a);
            }
        });
    }
    if (checkGroups.length > 0) {
        status('Checking W3C group homepages...');
        const groups = await w3cgroups();
        checkGroups.forEach(a => {
            const name = a.textContent.replace(/[\t\n ]+/g, ' ').replace(/ \([A-Z]+\)/g, '').trim();
            const href = a.href;
            let match = groups.find(g => g.name === name);
            if (!match) {
                // try to be more flexible
                match = groups.find(g => g.homepage === href || g["default-homepage"].startsWith(href));
            }
            if (match && match["_links"]["homepage"]) {
                a.href = `https://www.w3.org/groups/${match.identifier}/`;
                a.textContent = match.name;
                a.classList.remove('todo');
            } else {
                // the group might have been closed or changed name?
                console.warn(`Could not verify W3C group for coordination: [${name}](${href})`);
                a.classList.add('todo');
            }
        });
    }
    
    // Participation
    const publicName = draft.getElementById("public-name");
    const oldpublicName = charter.getElementById("public-name");
    const publicLists = group.services ? group.services.filter(s => s.isPublicList) : [];
    if (publicName) {
        const archive = publicName.nextElementSibling;
        if (oldpublicName) {
            const oldarchive = oldpublicName.nextElementSibling;
            publicName.replaceWith(oldpublicName.cloneNode(true));
            archive.replaceWith(oldarchive.cloneNode(true));
        } else if (publicLists.length > 0) {
            publicName.textContent = `${publicLists[0].shortdesc}@w3.org`;
            publicName.href = `mailto:${publicLists[0].shortdesc}@w3.org`;
            publicName.classList.remove('todo');
            archive.href = publicLists[0].link;
            archive.classList.remove('todo');
        }
    }
    const publicGithub = draft.getElementById("public-github");
    if (publicGithub) {
        publicGithub.href = `${group["default-homepage"]}tools/#repositories`;
        publicGithub.classList.remove('todo');
    }
    
    // Decision policy
    const cfc = draft.getElementById("cfc");
    const oldcfc = charter.getElementById("cfc");
    if (cfc && oldcfc) {
        cfc.replaceWith(oldcfc.cloneNode(true));
    }
    
    // history
    const history = draft.querySelector("table.history");
    const oldhistory = charter.querySelector("table.history");
    if (history && oldhistory) {
        history.replaceWith(oldhistory.cloneNode(true));
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
    
    // clean up if needed
    draft.querySelectorAll('.remove').forEach(s => s.remove());
    
    // add generator meta and config script
    
    const head = draft.querySelector('head');
    if (head) {
        const generatorMeta = draft.createElement('meta');
        generatorMeta.name = 'generator';
        generatorMeta.content = `w3c-charter-assistant`;
        head.appendChild(generatorMeta);
        const scriptConfig = draft.createElement('script');
        scriptConfig.type = 'application/json';
        scriptConfig.id = 'charter-assistant-settings';
        const copy = { };
        ["group", "workMode", "a11y-impact", "template"].forEach(k => { copy[k] = config[k]; });
        copy.timeStamp = new Date().toISOString();
        let commit = (templateCommits && templateCommits.length > 0)? templateCommits[0] : null;
        if (commit && commit.sha) {
            copy.template = {
                sha: commit.sha,
                date: commit.commit.author.date,
            };
        }
        scriptConfig.textContent = JSON.stringify(copy, null, 2);
        head.appendChild(scriptConfig);

        const scriptCheck = document.createElement('script');

        scriptCheck.src = 'https://www.w3.org/PM/Groups/lib/check-charter.js';
        scriptCheck.defer = true;
        scriptCheck.id = 'charter-assistant-checker';
        head.appendChild(scriptCheck);
        if (config.debug) console.log(config);
    }
    
    
    status('Done. Get ready to review the charter draft.');
    
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

let allGroups = null;
/**
* Return the list of all W3C groups
*/
async function w3cgroups() {
    if (allGroups) {
        return allGroups;
    }
    return json(sources('groups'), { signal: signal() }).then(all => {
        all.forEach(g => {
            g.homepage = g._links?.homepage?.href || null;
            g["default-homepage"] = g._links.self.href.replace(/^https:\/\/api.w3.org\/groups\//, `https://www.w3.org/groups/`) + '/';
        });
        allGroups = all;
        return all;
    });
}

async function w3cgroup(identifier) {
    const groups = await w3cgroups();
    const group = groups.find(g => g.identifier === identifier);
    if (!group) {
        throw new Error(`Group not found: ${identifier}`);
    }
    return group;
};

// Fetch group data from W3C Groups API and enrich it

async function fetchGroupData(identifier) {
    const orig_group = await w3cgroup(identifier).catch(err => err);
    if (orig_group instanceof Error) {
        failed(`Could not load group data from W3C Groups API: ${orig_group.message}`);
        throw new Error('abort', { cause: orig_group });
    }
    if (!['wg', 'ig'].includes(orig_group["group-type"])) {
        failed(`This tool only works with working groups and interest groups.`);
        throw new Error('abort');
    }
    const group = { ...orig_group }; // shallow copy to avoid modifying cached version
    
    // we adapt to the charter template
    group.longname = group.name;
    group.name = group.longname.slice(0, 0-(group.type.length)).trim();
    group.type = group.longname.slice(group.name.length).trim();
    
    status(`Found Group: ${group.longname}`);
    
    group.description = group.description
    .replace('mission', '<strong>mission</strong>')
    .replace(group.longname, `<a href="${group["default-homepage"]}">${group.longname}</a>`);
    
    async function extend(source, rel, postFunction) {
        const data = [];
        try {
            const items = await hal(source, rel, { embed: true, adapter: postFunction, fetch: { signal: signal() } } );
            for await (const item of items) {
                data.push(item);
            }
        } catch (err) {
            failed(`Could not load ${rel} data from W3C API: ${err.message}`);
            throw new Error('abort', { cause: err });
        }
        source[rel] = data;
        return source[rel];
    }
    
    await Promise.all(["chairs", "team-contacts" ].map(async (i) => {
        status("Loading " + i + "...");
        await extend(group, i, async (individual) => {
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
    if (!group.services) { // most likely, we already have services, so this gets skipped
        await Promise.all(["services" ].map(async (i) => await extend(group, i)));
    } else {
        // group-server gives raw data
        group.services = group.services.map(s => s.details);
    }
    
    group.services.forEach(s => {
        s.isPublicList = (s.type === "lists" && s.closed === false && s.link && s.link.startsWith("https://lists.w3.org/Archives/Public/"));
    });
    
    status(`Finding current charter ...`);
    await extend(group, "active-charter");
    group['active-charter'] = group['active-charter'][0]
    status(`Loading charter content ${group['active-charter'].uri} ...`);
    group.charterDoc = await html(group["active-charter"].uri, { credentials: 'include', signal: signal() });
    
    if (config.debug) console.log(group);
    return group;
}
