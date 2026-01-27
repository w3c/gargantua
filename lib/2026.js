import { config as newConfig } from 'https://www.w3.org/PM/Groups/lib/config.js';
import { addExportButton, Logger } from 'https://www.w3.org/PM/Groups/lib/ui-utils.js';
import { json, html } from 'https://www.w3.org/PM/Groups/lib/fetch.js';
import { hal } from 'https://www.w3.org/PM/Groups/lib/hal.js';

const config = newConfig();

const logger = (config.debug)? new Logger('', false, false) : new Logger('', true);

if (config.group) {
    let match = config.group.match(/^(wg|ig)\/([^/]+)$/);
    if (match) {
        config.group = { identifier: `${match[1]}/${match[2]}` };
    } else {
        logger.warn(`Invalid group= parameter: ${config.group}`);
        config.group = null;
        alert('Unrecognized group parameter. Use "wg/<shortname>" or "ig/<shortname>".');
    }
}

async function fetchGroupData() {
    const group = await json(`https://api.w3.org/groups/${config.group.identifier}/`).catch(err => err);
    if (group instanceof Error || !['working group', 'interest group'].includes(group.type)) {
        throw new Error(`Could not fetch group data for ${config.group.identifier}`);
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

if (!config.group) {
    alert("Can't find group");
} else {
    generate();
}

function generate() {
    fetchGroupData().then(async group => {
        const doc = await html('https://w3c.github.io/charter-drafts/charter-template.html');
        return {
            group: group,
            doc: doc
        };
    }).then((r) => {
        template(r);
        return r;
    }).then((r) => {
        r.doc.querySelectorAll('.remove').forEach(s => s.remove());
        document.documentElement.replaceWith(r.doc.documentElement);
        addExportButton(`charter-${config.group.identifier}-${new Date().getFullYear()}.html`);
    }).catch(err => {
        document.querySelectorAll('script.remove').forEach(s => s.remove());
        addExportButton(`charter-template-${new Date().getFullYear()}.html`);
        console.log(err);
    });
}

/**
* Template replacements
*/


function template(r) {
    const group = r.group;
    const doc = r.doc;
    console.log(doc);
    // title
    doc.title = group.longname + ' Charter';
    // mission
    const mission = doc.querySelector(`.mission`);
    if (mission) {
        mission.innerHTML = group.description;
    }
    // navbar
    const navBar = doc.querySelector(`#navbar`);
    if (navBar) {
        const patentPolicySection = doc.getElementById(`patentpolicy`);
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
    const status = doc.getElementById(`Status`);
    if (status) {
        const anchor = status.querySelector('a.todo');
        if (anchor) {
            replaceAnchor(group, status);
            anchor.classList.remove('todo');
        }
    }
    const chairs = doc.getElementById(`Chairs`);
    if (chairs) {
        chairs.children[1].textContent = group.chairs.sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`).join(', ');
    }
    const teamContacts = doc.getElementById(`TeamContacts`);
    if (teamContacts) {
        teamContacts.children[1].textContent = group["team-contacts"].sort((a, b) => a.name.localeCompare(b.name)).map(c => `${c.name} (${c.organization})`).join(', ');
    }
    const calendar = doc.getElementById(`MeetingSchedule`);
    if (calendar) {
        const anchor = calendar.querySelector('a.todo');
        if (anchor) {
            replaceAnchor(group, calendar);
            anchor.classList.remove('todo');
        }
    }

    // deliverables for an IG
    const deliverables = doc.getElementById(`deliverables`);
    if (deliverables && group['group-type'] === 'ig') {
        Array.from(deliverables.querySelectorAll('p, ul, section')).forEach(p => p.remove());
    }

    // success criteria for IG should be written from scratch
    const successCriteria = doc.getElementById(`success-criteria`);
    if (successCriteria && group['group-type'] === 'ig') {
        Array.from(successCriteria.querySelectorAll('p, ul')).forEach(p => p.remove());
    }

    // Coordination
    const coordination = doc.getElementById("coordination");
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
    const publicName = doc.getElementById("public-name");
    if (publicName && group.publicList) {
        publicName.textContent = `${group.publicList.shortdesc}@w3.org`;
        publicName.href = `mailto:${group.publicList.shortdesc}@w3.org`;
        publicName.classList.remove('todo');
        const archive = publicName.nextElementSibling;
        archive.href = group.publicList.link;
        archive.classList.remove('todo');
    }
    const publicGithub = doc.getElementById("public-github");
    if (publicGithub) {
        publicGithub.href = `${group.url}tools/#repositories`;
        publicGithub.classList.remove('todo');
    }

    // footer 
    const teamContact = doc.querySelector("a[href='mailto:']");
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
    replaceAnchor(group, doc);
    
    // todos
    replaceTodo(group, doc);
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