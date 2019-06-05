import LazyPromise from './lazypromise.js';
import { fetchHTML } from "./fetch-utils.js";

/*
 * Gather editor's draft configuration, if any
 */

async function specConfig(repo) {
  let config;
  if (!repo.prpreview && !repo.prpreview.type) { // some shorthands
    return; // not yet supported so give up
  }
  const type = repo.prpreview.type;
  const src = repo.prpreview.src_file;

  if (type === "respec" && src) {
    config = new LazyPromise(() => loadRespec(repo));
  }
  // we only support respec for now... @@TODO bikeshed
  if (config) {
    repo["editors-draft-config"] = config;
  }
}

function JSONize(str) {
  return str
    // remove comments
    .replace(new RegExp("[ \t]+//[^\n]+", 'g'), "")
    // wrap keys without quote with valid double quote
    .replace(/([\$\w]+)\s*:/g, function(_, $1){return '"'+$1+'":'})
    // replacing single quote wrapped ones to double quote
    .replace(/'([^']+)'/g, function(_, $1){return '"'+$1+'"'})
    // readjust http links
    .replace(/"http(s?)":/g, "http$1:")
    // remove extra commas
    .replace(new RegExp(",[ \t\n]+}", 'g'), "}")
    .replace(new RegExp(",[ \t\n]+\]", 'g'), "]")
    .replace("};", "}")
}

async function loadRespec(repo) {
  const type = repo.prpreview.type;
  const src = repo.prpreview.src_file;

  const file = `https://${repo.owner.login}.github.io/${repo.name}/${src}`;

  // console.log(`${repo.owner.login}/${repo.name} is ${type} with ${src}`);
  return fetchHTML(file).then(doc => {
    const title = doc.querySelector("title").textContent;
    let respecScripts = doc.querySelectorAll("script.remove");
    if (respecScripts.length === 0) {
      console.warn(`${title} has no respec script elements`);
    }
    let config;
    for (const script of respecScripts) {
      if (!config) {
        if (script.src) {
          // skip
        } else {
          let text = script.textContent;
          let index = text.indexOf("respecConfig");
          if (index != 1) {
            text = JSONize(text.substring(text.indexOf('{', index)));
            try {
              config = JSON.parse(text);
            } catch (e) {
              console.warn(`${file} Failed to parse respec config`);
            }
          } else {
            console.warn(`${file} script elements without a respecConfig`);
          }
        }
      }
    }
    return config;
  }).catch(console.error);
}

export default specConfig;
