import 'jsdom-global/register.js';
import jsdom from "jsdom";
const { JSDOM } = jsdom;
import { fetchGroup, setW3CKey } from './w3c.js';
import jsonrender, { subscribe } from './jsonrender.js';
import fetch from 'node-fetch';

class DOMParser {
  constructor() {
    // nothing
  }
  parseFromString(text, type) {
    return JSDOM.fragment(text);
  }
}

global.DOMParser = DOMParser;
global.fetch = fetch;

const functions =
{
  filterOpenIssues: function (issues) {
    let openIssues = issues.filter(i => i.state === "open" && !i.pull_request);
    return { length: openIssues.length };
  },
  filterOpenPRs: function (issues) {
    let openPRs = issues.filter(i => i.state === "open" && i.pull_request);
    return { length: openPRs.length };
  },
  activeSpecs: async function (specs) {
    return (await Promise.all(specs.map(spec =>
      spec["latest-status"].then(s => (s !== "Retired") ? spec : undefined)))).filter(spec => spec);
  },
  milestones: function (milestones) {
    return Object.entries(milestones).map(s => s[0] + " " + s[1]);
  },
  mlConfig: function (confs) {
    return Object.keys(confs).map(c => " " + c);
  },
};

function renderGroup(url) {
  return new Promise((resolve, reject) => {
    JSDOM.fromURL(url).then(dom => {
      const document = dom.window.document;

      function done() {
        let scripts = document.querySelectorAll("script");
        for (let script of scripts) script.parentNode.removeChild(script);
        resolve(dom.serialize());
      }
      setW3CKey(document.documentElement.getAttribute("data-apiary-key"));
      subscribe("done", done);

      let gid = document.documentElement.getAttribute("data-gid");

      fetchGroup(gid).then(group => {
        let elts = document.querySelectorAll("*.group-data");
        for (let element of elts) jsonrender({ group: group }, element, functions);
      });
    }).catch(reject);
  });
}


export { renderGroup };
