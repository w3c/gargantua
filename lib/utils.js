import { e, id as idFunc } from './dom.js';
import { json, html } from './fetch.js';
import { formatDate as formatDateFunc } from './date.js';
import { config as configFunc } from './config.js';
import { github, hrLinkTo as hrLinkToFunc } from './github.js';

export 
const el = e;

export 
const id = idFunc;

export
const fetchJSON = json;

export
const fetchHTML = html;

export
const formatDate = formatDateFunc;

export
const config = configFunc;

export
const hrLinkTo = hrLinkToFunc;

export
const ghRequest = github;

