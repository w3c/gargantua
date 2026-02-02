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
        this.isLoading = false;
        
        // Setup DOM element
        this.element = this._createMarkup();
        this._setupEvents();
    }
    
    /** @private */
    _createMarkup() {
        const section = document.createElement('section');
        section.className = 'ui-card';
        section.innerHTML = `
            <h2 class="card-title">
                <button class="refresh-btn">↻</button>
                ${this.options.url ? `<a href="${this.options.url}" target="_blank">${this.options.title}</a>` : this.options.title}
            </h2>
            <p class="update-label">Last updated: <span class="timestamp">Never</span></p>
            <div class="card-content">
                <span class="empty-state">Initialising...</span>
            </div>
           
        `;
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
            const rawCache = localStorage.getItem(this.fullKey);
            let data = null;
            let skipFetch = false;
            let cachedEnvelope = null;
            
            // 1. Safe Cache Retrieval (Self-Healing)
            if (rawCache) {
                try {
                    cachedEnvelope = JSON.parse(rawCache);
                    
                    const age = (Date.now() - (new Date(cachedEnvelope.timestamp)).getTime()) / 1000 / 60;
                    
                    if (!force && age < this.parent.config.ttl) {
                        data = cachedEnvelope.data;
                        skipFetch = true;
                    }
                } catch (parseErr) {
                    localStorage.removeItem(this.fullKey);
                }
            }
            
            // 2. Data Acquisition
            if (!skipFetch) {
                try {
                    data = await this.options.createValue(this.options);
                    localStorage.setItem(this.fullKey, JSON.stringify({
                        timestamp: new Date().toISOString(),
                        data: data}));
                    } catch (fetchError) {
                        if (cachedEnvelope) {
                            data = cachedEnvelope.data;
                        } else {
                            throw fetchError;
                        }
                    }
                }
                
                // 3. Rendering Logic (Supports String or Element Node)
                if (data) {
                    const view = this.options.transformValue(data, this.options);
                    
                    if (view instanceof Node) {
                        contentArea.replaceChildren(view);
                    } else {
                        contentArea.innerHTML = view;
                    }
                } else {
                    contentArea.innerHTML = '<span class="empty-state">(no data)</span>';
                }
                timeArea.innerText = new Date().toLocaleTimeString();
                
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
                ...config
            };
            this.config.heartbeat = Math.max(this.config.heartbeat, this.config.ttl);
            this.registry = new Map();
            this.cards = [];
            this.container.classList.add('card-container');
            
            // Logic: max(heartbeat, ttl) ensures we don't pulse faster than data expires.
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
                localStorage.removeItem(card.fullKey);
                this.cards = this.cards.filter(c => c !== card);
                card.element.remove();
            }
        }
        
        /**
        * Total teardown for clean memory.
        * Cleans up the UI and wipes the associated localStorage entries.
        */
        destroy() {
            if (this.timer) clearInterval(this.timer);
            
            // Wipe the cache for every card registered in this container
            this.cards.forEach(card => {
                localStorage.removeItem(card.fullKey);
                card.element.remove();
            });
            
            this.registry.clear();
            this.cards = [];
            this.container.innerHTML = '';
        }
    }