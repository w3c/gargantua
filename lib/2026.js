import { config as newConfig } from 'https://www.w3.org/PM/Groups/lib/config.js';
import { addExportButton, Logger } from 'https://www.w3.org/PM/Groups/lib/ui-utils.js';
import { json, html } from 'https://www.w3.org/PM/Groups/lib/fetch.js';
import { hal } from 'https://www.w3.org/PM/Groups/lib/hal.js';

const config = newConfig();

const logger = (config.debug)? new Logger('', false, false) : new Logger('', true);

let reasonSet = false;
function failed(reason='') {
    const init = document.getElementById('initialize');
    if (init) init.remove();
    document.getElementById('crash').classList.remove('hidden');
    if (reason && !reasonSet) {
        document.getElementById('reason').textContent = "Reason: " +reason;
        reasonSet = true;
    }
}

if (config.group) {
    let match = config.group.match(/^(wg|ig|cg|other)\/([^/]+)$/);
    if (match) {
        config.group = { identifier: `${match[1]}/${match[2]}` };
    } else {
        failed(`Invalid group= parameter: ${config.group}`);
        config.group = null;
    }
}

async function fetchGroupData() {
    const group = await json(`https://api.w3.org/groups/${config.group.identifier}/`).catch(err => err);
    if (group instanceof Error) {
        failed(`Could not load group data from W3C Groups API: ${group.message}`);
        throw group;
    }
    if (!['working group', 'interest group'].includes(group.type)) {
        failed(`This tool only works with working groups and interest groups.`);
        throw new Error('abort');
    }
    // we adapt to the charter template
    group.identifier = config.group.identifier;
    group["group-type"] = (group.type === "working group") ? "wg" : "ig";    
    group.longname = group.name;
    group.name = group.longname.slice(0, 0-(group.type.length)).trim();
    group.type = group.longname.slice(group.name.length).trim();

    logger.log("Group: ", group.name);
    logger.log("Group longname: ", group.longname);
    logger.log("Group type: ", group.type);
    logger.log("Group identifier: ", group.identifier);
    logger.log("Group group-type: ", group["group-type"]);

    group.url = `https://www.w3.org/groups/${group.identifier}/`;
    group.description = group.description
    .replace('mission', '<strong>mission</strong>')
    .replace(group.longname, `<a href="${group.url}">${group.longname}</a>`);

    logger.log("Group url: ", group.url);
    logger.log("Group description: ", group.description);


    async function extend(targetObject, targetProperty, postFunction) {
        const entry = targetObject._links[targetProperty];
        const url = entry.href || null;
        if (url) {
            targetObject[targetProperty] = [];
            const items = await hal(targetProperty, url, true, postFunction);
            for await (const service of items) {
                targetObject[targetProperty].push(service);
            }
        }
        return targetObject[targetProperty];
    }
    await Promise.all(["chairs", "team-contacts" ].map((i) => extend(group, i, async (individual) => {
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
    })));
    await Promise.all(["services" ].map((i) => extend(group, i)));
    const publiclists = group.services.filter(s => s.type === "lists" && s.closed === false && s.link.startsWith("https://lists.w3.org/Archives/Public/"));
    if (publiclists.length > 0) {
        group.publicList = publiclists[0];
    }
    return group;
}

if (config.group) {
    window.onload = generate;
}

function generate() {
    fetchGroupData().then(async group => {
        logger.log("Loading charter template...");
        const doc = await html('https://w3c.github.io/charter-drafts/charter-template.html').catch(err => err);

        if (doc instanceof Error) {
            failed(`Could not load charter template: ${doc.message}`);
            throw doc;
        }
        return {
            group: group,
            template: doc
        };
    }).then(async (r) => {
        const docdev = await html(`https://www.w3.org/groups/${config.group.identifier}/deliverables/`, { credentials: 'include' }).catch(err => err);
        if (docdev instanceof Error) {
            failed(`Could not load deliverables: ${docdev.message}`);
            throw docdev;
        }
        r.deliverables = docdev.getElementById('deliverables').parentNode.querySelectorAll('dl');
        return r;
    }).then(async (r) => {
        const docdev = await html(`https://www.w3.org/groups/${config.group.identifier}/charters/active/`, { credentials: 'include' }).catch(err => err);
        if (docdev instanceof Error) {
            failed(`Could not load active charter: ${docdev.message}`);
            throw docdev;
        }
        r.charter = docdev;
        return r;
    }).then((r) => {
        compute(r);
        return r;
    }).then((r) => {
        r.template.querySelectorAll('.remove').forEach(s => s.remove());
        document.documentElement.replaceWith(r.template.documentElement);
        addExportButton(`charter-${config.group.identifier}-${new Date().getFullYear()}.html`);
    }).catch(err => {
        failed(`Error generating charter: ${err.message}`);
        console.log(err);
    });
}

/**
* Template replacements
*/


function compute(r) {
    const { group, template, deliverables, charter } = r;
    
    console.log(r);
    // title
    template.title = group.longname + ' Charter';
    // mission
    const mission = template.querySelector(`.mission`);
    if (mission) {
        mission.innerHTML = group.description;
    }
    // navbar
    const navBar = template.querySelector(`#navbar`);
    if (navBar) {
        const patentPolicySection = template.getElementById(`patentpolicy`);
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
    const status = template.getElementById(`Status`);
    if (status) {
        const anchor = status.querySelector('a.todo');
        if (anchor) {
            replaceAnchor(group, status);
            anchor.classList.remove('todo');
        }
    }
    const chairs = template.getElementById(`Chairs`);
    if (chairs) {
        chairs.children[1].textContent = group.chairs.sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`).join(', ');
    }
    const teamContacts = template.getElementById(`TeamContacts`);
    if (teamContacts) {
        teamContacts.children[1].textContent = group["team-contacts"].sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`).join(', ');
    }
    const calendar = template.getElementById(`MeetingSchedule`);
    if (calendar) {
        const anchor = calendar.querySelector('a.todo');
        if (anchor) {
            replaceAnchor(group, calendar);
            anchor.classList.remove('todo');
        }
    }

    // background
    const background = template.getElementById("background");
    const oldbackground = charter.getElementById("background");
    if (background && oldbackground) {
        template.adoptNode(oldbackground);
        background.replaceWith(oldbackground);
    }

    // scope
    const scope = template.getElementById("scope");
    const oldscope = charter.getElementById("scope");
    if (scope && oldscope) {
        template.adoptNode(oldscope);
        scope.replaceWith(oldscope);
    }


    // deliverables
    const templateDeliverables = template.getElementById(`deliverables`);
    if (templateDeliverables && group['group-type'] === 'ig') {
        Array.from(templateDeliverables.querySelectorAll('p, ul, section')).forEach(p => p.remove());
        // @@grab from active charter and deliverables API list ?
    } else {
        const normative = template.getElementById(`normative`);
        if (normative) {
            const dl = normative.querySelector('dl');
            template.adoptNode(deliverables[0]);
            dl.replaceWith(deliverables[0]);
        }
    }

    // success criteria for IG should be written from scratch
    const successCriteria = template.getElementById(`success-criteria`);
    if (successCriteria && group['group-type'] === 'ig') {
        Array.from(successCriteria.querySelectorAll('p, ul')).forEach(p => p.remove());
    }

    // Coordination
    const coordination = template.getElementById("coordination");
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
    const publicName = template.getElementById("public-name");
    if (publicName && group.publicList) {
        publicName.textContent = `${group.publicList.shortdesc}@w3.org`;
        publicName.href = `mailto:${group.publicList.shortdesc}@w3.org`;
        publicName.classList.remove('todo');
        const archive = publicName.nextElementSibling;
        archive.href = group.publicList.link;
        archive.classList.remove('todo');
    }
    const publicGithub = template.getElementById("public-github");
    if (publicGithub) {
        publicGithub.href = `${group.url}tools/#repositories`;
        publicGithub.classList.remove('todo');
    }

    // history
    const history = template.querySelector("table.history");
    const oldhistory = charter.querySelector("table.history");
    if (history && oldhistory) {
        template.adoptNode(oldhistory);
        history.replaceWith(oldhistory);
        // enhance with charter history from W3C API
    }

    // footer 
    const teamContact = template.querySelector("a[href='mailto:']");
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
    replaceAnchor(group, template);
    
    // todos
    replaceTodo(group, template);
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