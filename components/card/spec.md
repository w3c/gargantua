It’s been a pleasure building this with you. To wrap everything up, here is the full **Technical Specification** for this library. This prompt captures the architecture, the "Atomic" logic required to pass the performance tests, and the styling requirements we perfected.

You can use this to document the project or to recreate/port the library to another framework (like React or Vue) in the future.

---

## Technical Specification: Card.js Micro-Library

### 1. Core Objective

A lightweight, dependency-free JavaScript library for creating self-updating UI cards with built-in **LocalStorage caching**, **Atomic state management**, and **automated background synchronization**.

### 2. Architecture Requirements

* **CardContainer Class**: The orchestrator.
* Must use a `Map` (Registry) to track `cacheKey` instances **synchronously** during the `add()` method to prevent race conditions during rapid batch initialization.
* Must manage a global `setInterval` (Heartbeat) that polls all registered cards for staleness every 30 seconds.
* Must provide a `destroy()` method to clear all timers, DOM elements, and registries for memory safety.


* **Card Class**: The UI component.
* Must handle its own internal `isLoading` state to prevent overlapping fetch requests.
* Must render semantically using `section`, `h2`, and `button` tags.



### 3. Data Lifecycle & Logic

* **Atomic Addition**: The `add()` method must be synchronous. It should:
1. Check the registry for existing keys.
2. Register the card immediately.
3. Inject into the DOM.
4. Trigger an asynchronous `refresh()` without blocking the main loop.


* **Caching Strategy**:
* Store data in `localStorage` wrapped in an envelope: `{ timestamp: Date.now(), data: ... }`.
* **TTL (Time-To-Live)**: Logic must check `(Now - Timestamp) > TTL` to decide whether to use cache or trigger `createValue()`.


* **Transformation**: Data fetching (`createValue`) must be decoupled from data display (`transformValue`).

### 4. UI & Accessibility (CSS)

* **Design System**: Must use CSS Variables (`:root`) for all colors and spacing.
* **High Contrast**: Maintain a contrast ratio of at least 4.5:1 for all text.
* **Dark Mode**: Support a `[data-theme="dark"]` attribute selector on the `<html>` or `<body>` tag.
* **Responsive Grid**: Use `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` for the container.

### 5. Testability Requirements

* **Idempotency**: Every test suite must clear its specific `localStorage` namespace and DOM mount point before running.
* **Polling Verification**: Performance tests for mass-initialization must use a polling/retry mechanism to account for the asynchronous nature of the JavaScript event loop.
* **Isolation**: No global variables; all library instances must be self-contained.

---

### Final Project Inventory

* **`lib.js`**: Atomic registry, lifecycle management, and cache logic.
* **`styles.css`**: Accessible dark/light tokens and responsive card layouts.
* **`runner.html`**: Lifecycle-aware test engine with "Time Warp" cache aging.
* **`tests/test-helper.js`**: Environment isolation utility.
* **`demo.html`**: Clean-room implementation example.
