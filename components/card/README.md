Here is a comprehensive `README.md` template for your library. It combines the technical specifications with clear installation and usage guides to make the library "plug-and-play" for you or other developers.

---

# CardLibrary.js

A modular, object-oriented JavaScript library for creating semantic UI cards with persistent caching, provenance linking, and automated minute-based refreshing.

## Features

* **Semantic HTML5:** Uses `<section>` for containers and `<article>` for cards.
* **Hierarchical TTL:** Set expiration globally at the container level or specifically for each card (in minutes).
* **Persistence:** Automatically syncs with `localStorage` so data survives page reloads.
* **Auto-Refresh:** Integrated heartbeat checks for stale data every 30 seconds.
* **Provenance Support:** Titles automatically become hyperlinks if an origin URL is provided.

---

## Installation

Simply import the classes into your ES Module project:

```javascript
import CardContainer, { Card } from './path/to/CardLibrary.js';

```

---

## Technical Specification

| Feature | Specification |
| --- | --- |
| **Container Element** | `<section class="card-container">` |
| **Card Element** | `<article class="ui-card">` |
| **Storage Engine** | `localStorage` |
| **Time Unit** | Minutes (converted to ms internally) |
| **Heartbeat Interval** | 30 Seconds |
| **TTL Priority** | Card Config > Container Options > 60min Default |

---

## Usage Example

### 1. Initialize the Container

Define a global TTL (e.g., 30 minutes) for all cards in this section.

```javascript
const dashboard = new CardContainer('app-root', {
  ttl: 30, // Default 30 minutes
  namespace: 'my_dashboard_'
});

```

### 2. Add a Card

Create a card with a specific 5-minute override for fast-changing data.

```javascript
const githubCard = dashboard.add({
  title: 'W3C Transitions Issues',
  url: 'https://github.com/w3c/transitions/issues',
  cacheKey: 'w3c-issues',
  ttl: 5, // Override global TTL to 5 minutes
  createValue: async () => {
    const res = await fetch('https://api.github.com/repos/w3c/transitions/issues');
    return res.json();
  },
  transformValue: (data) => {
    return `<ul>${data.slice(0, 3).map(i => `<li>${i.title}</li>`).join('')}</ul>`;
  }
});

```

### 3. Remove a Card

Remove the card and automatically kill its background refresh timer.

```javascript
// Later in your app logic:
dashboard.remove(githubCard);

```

---

## Lifecycle & Memory Management

The library is designed to be leak-proof. When `dashboard.remove(cardInstance)` is called, the library executes:

1. `clearInterval()` on the card's internal heartbeat.
2. `element.remove()` to clear the DOM.
3. `Set.delete()` to free up memory.

---
