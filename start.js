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

function renderGroup(url, cb) {
  JSDOM.fromURL(url).then(dom => {
    const document = dom.window.document;

    function save() {
      let scripts = document.querySelectorAll("script");
      for (let script of scripts) script.parentNode.removeChild(script);
      cb(dom.serialize());
    }
    setW3CKey(document.documentElement.getAttribute("data-apiary-key"));
    subscribe("done", save);

    let gid = document.documentElement.getAttribute("data-gid");


    fetchGroup(gid).then(group => {
      let elts = document.querySelectorAll("*.group-data");
      for (let element of elts) jsonrender({ group: group }, element);
    });
  }).catch(console.error);
}


export { renderGroup };
