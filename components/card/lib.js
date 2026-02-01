/**
* Core Library: lib.js
* Handles Card creation, caching, and lifecycle management.
*/

class Card {
    constructor(parent, options) {
        this.parent = parent;
        this.options = options;
        this.cacheKey = options.cacheKey;
        this.isLoading = false;
        
        // Setup DOM element
        this.element = this._createMarkup();
        this._setupEvents();
    }
    
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
    
    _setupEvents() {
        this.element.querySelector('.refresh-btn').onclick = () => this.refresh(true);
    }
    
    async refresh(force = false) {
        if (this.isLoading) return;
        this.isLoading = true;
        
        const contentArea = this.element.querySelector('.card-content');
        const timeArea = this.element.querySelector('.timestamp');
        
        try {
            // Check cache first if not forced
            const fullKey = `${this.parent.config.namespace}${this.cacheKey}`;
            const cached = localStorage.getItem(fullKey);
            
            let data;
            let skipFetch = false;
            
            let envelope;
            if (cached) {
                try {
                    envelope = JSON.parse(cached);
                    data = envelope.data;
                } catch (e) {
                    // Corrupted cache, ignore
                    localStorage.removeItem(fullKey);
                    cached = null;
                }
            }
            
            if (!force && cached) {
                const age = (Date.now() - envelope.timestamp) / 1000 / 60; // mins
                if (age < this.parent.config.ttl) {
                    data = envelope.data;
                    skipFetch = true;
                }
            }
            
            if (!skipFetch) {
                data = await this.options.createValue(this.options);
                localStorage.setItem(fullKey, JSON.stringify({
                    timestamp: Date.now(),
                    data: data
                }));                
            }
            
            // Update UI
            data = this.options.transformValue(data, this.options);
            if (data instanceof HTMLElement) {
                contentArea.replaceChildren(data);
            } else if (data) {
                contentArea.innerHTML = data;
            } else {
                contentArea.innerHTML = '<span class="empty-state">(none)</span>';
            }
            timeArea.innerText = new Date().toLocaleTimeString();
            
            // Trigger animation reset
            contentArea.style.animation = 'none';
            contentArea.offsetHeight; // trigger reflow
            contentArea.style.animation = null;
            
        } catch (err) {
            contentArea.innerHTML = `<span class="error">Failed to sync: ${err.message}</span>`;
        } finally {
            this.isLoading = false;
        }
    }
}

export default class CardContainer {
    constructor(mountId, config = {}) {
        this.container = document.getElementById(mountId);
        if (!this.container) throw new Error(`Mount point #${mountId} not found.`);
        
        this.config = {
            ttl: config.ttl || 5,
            namespace: config.namespace || 'card_app_',
            heartbeat: config.hearbeat || 30,
            ...config
        };
        
        // The Registry: Essential for preventing collisions
        this.registry = new Map();
        this.cards = [];
        
        // Start Global Heartbeat (30s)
        this.heartbeat = setInterval(() => this.checkStaleCards(), this.config.heartbeat * 1000);
        
        this.container.classList.add('card-container');
    }
    
    add(options) {
        // ATOMIC CHECK: Stop duplicates before they start
        if (this.registry.has(options.cacheKey)) {
            return this.registry.get(options.cacheKey);
        }
        
        const card = new Card(this, options);
        
        // ATOMIC REGISTRATION: Synchronous tracking
        this.registry.set(options.cacheKey, card);
        this.cards.push(card);
        
        this.container.appendChild(card.element);
        
        // Start async lifecycle
        card.refresh();
        
        return card;
    }
    
    remove(card) {
        if (this.registry.has(card.cacheKey)) {
            this.registry.delete(card.cacheKey);
            localStorage.removeItem(card.cacheKey);
            this.cards = this.cards.filter(c => c !== card);
            card.element.remove();
        }
    }
    
    checkStaleCards() {
        this.cards.forEach(card => card.refresh(false));
    }
    
    destroy() {
        clearInterval(this.heartbeat);
        this.cards.forEach(card => this.remove(card));
        this.container.innerHTML = '';
        this.registry.clear();
    }
}