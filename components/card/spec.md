This final **Technical Specification** summarizes the refined architecture we've built. It includes the "Max Logic" for polling efficiency, DOM Node rendering capabilities, and the robust self-healing cache mechanism.

You can use this prompt to re-generate the library in the future or to brief another developer on how the system works.

---

## Technical Specification: Card.js (v2.0)

### 1. Core Objective

A lightweight, dependency-free JavaScript library for building dashboards with self-updating cards. It prioritizes **efficiency** (via synchronized TTL/Heartbeat), **flexibility** (via DOM Node rendering), and **resilience** (via stale-while-revalidate and self-healing cache).

### 2. Architecture & State Management

* **CardContainer (Orchestrator)**:
* **Constructor Configuration**: Configures `ttl` (minutes), `heartbeat` (minutes), `storage` (Storage-like) and `namespace` globally.
* **Efficiency Logic**: Implements a centralized pulse using `Math.max(config.heartbeat, config.ttl)`. This ensures background polling never occurs more frequently than the data's fresh lifespan.
* **Atomic Registry**: Uses a synchronous `Map` in the `add()` method to prevent duplicate card initialization during rapid batch execution.


* **Card (UI Component)**:
* Manages internal `isLoading` flags to prevent request overlapping.
* Handles the visual state transitions (Initialising -> Data/Node -> Error).



### 3. Data Lifecycle & Rendering

* **Fetch Strategy**:
* **Stale-While-Revalidate**: If `createValue` fails, the library attempts to revert to the last known valid cache entry.
* **Self-Healing Cache**: If `JSON.parse` fails on a retrieved cache string, the specific `storage` key is immediately removed to prevent persistent crashes.


* **Rendering (transformValue)**:
* Supports **String** returns (via `innerHTML`).
* Supports **DOM Node** returns (via `appendChild`). This allows cards to host complex elements like Canvases, Charts, or elements with pre-attached event listeners.


### 4. Method Signatures

* **`createValue(options)`**: An async function that fetches raw data. It receives the card's `options` object for context-aware fetching (e.g., using a specific ID or URL provided in the options).
* **`transformValue(data, options)`**: A synchronous function that prepares the UI. It receives both the fetched `data` and the card's `options`.

### 5. Design & Accessibility

* **Theme**: Optimized for high-contrast palettes (e.g., Black Cards `#000000` on Cream Background `#FFF6E0`).
* **Typography**: Uses off-white text (`#F8F9FA`) on black cards to reduce visual vibration while maintaining AAA contrast ratios.
* **Responsiveness**: Designed for an auto-filling CSS grid.

---

### File Manifest

1. **`lib.js`**: The core logic with the `Math.max` pulse and DOM Node support.
2. **`card.css`**: The design tokens for the Cream/Black accessible theme.
3. **`demo.html`**: A production-ready implementation example.
