/**
* Core Library: lib.js
* Handles Card creation, caching, and lifecycle management.
*/

class Card {
    /**
    * @param {CardContainer} parent - The orchestrating container.
    * @param {Object} options - Configuration for the card instance.
    */
    constructor(parent, options) {
        this.parent = parent;
        this.options = options;
        this.cacheKey = options.cacheKey;
        this.fullKey = `${this.parent.config.namespace}${this.cacheKey}`;
        this.options.ttl = (options.ttl) ? Math.min(options.ttl, this.parent.config.ttl) : this.parent.config.ttl;
        this.isLoading = false;
        
        // Setup DOM element
        this.element = this._createMarkup();
        this._setupEvents();
    }
    
    /** @private */
    _createMarkup() {
        const section = document.createElement('section');
        const title = this.options.url ? `<a href="${this.options.url}">${this.options.title}</a>` : this.options.title;
        section.className = 'ui-card';
        section.innerHTML = `
            <div class="card-header"><button class="refresh-btn">↻</button><h2 class="card-title">${title}</h2></div>
            <div class="card-content"><span class="empty-state">Initialising...</span></div>
            <p class="update-label">Last updated: <span class="timestamp">Never</span></p>`;
        return section;
    }
    
    /** @private */
    _setupEvents() {
        this.element.querySelector('.refresh-btn').onclick = () => this.refresh(true);
    }
    
    /**
    * Updates card content. Handles DOM Node returns from transformValue.
    * @param {boolean} force - Skip TTL check.
    */
    async refresh(force = false) {
        if (this.isLoading) return;
        this.isLoading = true;
        
        const contentArea = this.element.querySelector('.card-content');
        const timeArea = this.element.querySelector('.timestamp');
        this.element.classList.remove('animate-refresh');
        try {
            const rawCache = this.parent.config.storage.getItem(this.fullKey);
            let data = null;
            let skipFetch = false;
            let cachedEnvelope = null;
            
            // 1. Safe Cache Retrieval (Self-Healing)
            if (rawCache) {
                try {
                    cachedEnvelope = JSON.parse(rawCache);
                    
                    const age = (Date.now() - (new Date(cachedEnvelope.timestamp)).getTime()) / 1000 / 60;
                    
                    if (!force && age < this.options.ttl) {
                        data = cachedEnvelope.data;
                        skipFetch = true;
                    }
                } catch (parseErr) {
                    this.parent.config.storage.removeItem(this.fullKey);
                }
            }
            
            // 2. Data Acquisition
            if (!skipFetch) {
                try {
                    data = await this.options.createValue(this.options);
                    cachedEnvelope = {
                        timestamp: new Date().toISOString(),
                        data: data
                    };
                    this.parent.config.storage.setItem(this.fullKey, JSON.stringify(cachedEnvelope));
                } catch (fetchError) {
                    if (cachedEnvelope) {
                        data = cachedEnvelope.data;
                    } else {
                        throw fetchError;
                    }
                }
            }
            
            // 3. Rendering Logic (Supports String or Element Node)
            const view = this.options.transformValue(data, this.options);
                
            if (view instanceof Node) {
                contentArea.replaceChildren(view);
            } else {
                contentArea.innerHTML = view;
            }
            if (cachedEnvelope && cachedEnvelope.timestamp) {
                timeArea.innerText = new Date(cachedEnvelope.timestamp).toLocaleTimeString();
            } else {
                timeArea.innerText = new Date().toLocaleTimeString();
            }
        } catch (err) {
            contentArea.innerHTML = `<span class="error">Error: ${err.message}</span>`;
        } finally {
            this.element.classList.add('animate-refresh');
            this.isLoading = false;
        }
    }
}

/**
* Main Orchestrator Class
*/
export default class CardContainer {
    /**
    * @param {string} mountId - Target element ID.
    * @param {Object} config - Global configuration.
    * @param {number} [config.ttl=5] - Freshness in minutes.
    * @param {number} [config.heartbeat=5] - Polling interval in minutes.
    * @param {Object} [config.storage=window.localStorage] - Storage-like mechanism. (getItem, setItem, removeItem)
    * @param {string} [config.namespace='card_app_'] - Storage prefix.
    */
    constructor(mountId, config = {}) {
        const container = document.getElementById(mountId);
        if (!container) throw new Error(`Mount point #${mountId} not found.`);
        
        this.container = container;
        this.config = {
            ttl: config.ttl || 5,
            heartbeat: config.heartbeat || 5,
            namespace: config.namespace || 'card_app_',
            storage: config.storage || window.localStorage,
            ...config
        };
        // Logic: max(heartbeat, ttl) ensures we don't pulse faster than data expires.
        this.config.heartbeat = Math.max(this.config.heartbeat, this.config.ttl);
        this.registry = new Map();
        this.cards = [];
        this.container.classList.add('card-container');
        
        this.timer = setInterval(() => {
            this.cards.forEach(card => card.refresh(false));
        }, this.config.heartbeat * 60000); 
    }
    
    /**
    * Registers a new card. Atomic and synchronous.
    * @param {Object} options - Configuration for the card instance.
    * @returns {Card}
    */
    add(options) {
        if (!options.cacheKey) throw new Error("cacheKey is required.");
        if (this.registry.has(options.cacheKey)) return this.registry.get(options.cacheKey);
        
        const card = new Card(this, options);
        this.registry.set(options.cacheKey, card);
        this.cards.push(card);
        this.container.appendChild(card.element);
        
        card.refresh();
        return card;
    }
    
    remove(card) {
        if (this.registry.has(card.cacheKey)) {
            this.registry.delete(card.cacheKey);
            this.config.storage.removeItem(card.fullKey);
            this.cards = this.cards.filter(c => c !== card);
            card.element.remove();
        }
    }
    
    /**
    * Total teardown for clean memory.
    * Cleans up the UI and wipes the associated storage entries.
    */
    destroy() {
        if (this.timer) clearInterval(this.timer);
        
        // Wipe the cache for every card registered in this container
        this.cards.forEach(card => {
            this.config.storage.removeItem(card.fullKey);
            card.element.remove();
        });
        
        this.registry.clear();
        this.cards = [];
        this.container.innerHTML = '';
    }
}