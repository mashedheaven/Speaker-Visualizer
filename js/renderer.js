import { renderMarkdown } from './utils.js';

export class TileRenderer {
  constructor(gridElement, tileManager) {
    this.grid = gridElement; // .main-grid element
    this.tileManager = tileManager;
    this._tileElements = new Map(); // tileId → DOM element
    this._overlayEl = null;
    
    // Listen to tile events
    tileManager.on('tileAdded', tile => this._addTile(tile));
    tileManager.on('tileUpdated', tile => this._updateTile(tile));
    tileManager.on('tileRemoved', id => this._removeTile(id));
  }
  
  _addTile(tile) {
    const el = this._createTileElement(tile);
    // Add at the beginning of the grid
    this.grid.prepend(el);
    this._tileElements.set(tile.id, el);
    // Trigger entrance animation
    requestAnimationFrame(() => el.classList.add('animate-tile-enter'));
    this._updateEmptyState();
  }
  
  _updateTile(tile) {
    const el = this._tileElements.get(tile.id);
    if (!el) return;
    // Update body content based on status
    const body = el.querySelector('.tile__body');
    if (tile.status === 'ready' && tile.data) {
      while (body.firstChild) body.removeChild(body.firstChild); // Clear loading skeletons
      body.appendChild(this._renderTileBody(tile));
    } else if (tile.status === 'error') {
      while (body.firstChild) body.removeChild(body.firstChild);
      body.appendChild(this._renderError(tile.error));
    }
    // Update pin button state
    const pinBtn = el.querySelector('.tile__pin');
    if (pinBtn) {
      pinBtn.classList.toggle('tile__action-btn--pinned', tile.pinned);
      pinBtn.textContent = tile.pinned ? '📌' : '📍';
    }
    // Handle expanded state
    el.classList.toggle('tile--expanded', tile.expanded);
    this._toggleOverlay(tile.expanded);
  }
  
  _removeTile(id) {
    const el = this._tileElements.get(id);
    if (!el) return;
    el.classList.add('animate-tile-exit');
    el.addEventListener('animationend', () => {
      el.remove();
      this._tileElements.delete(id);
      this._updateEmptyState();
    }, { once: true });
    // Fallback removal if animation doesn't fire
    setTimeout(() => {
      if (this._tileElements.has(id)) {
        el.remove();
        this._tileElements.delete(id);
        this._updateEmptyState();
      }
    }, 600);
  }
  
  _createTileElement(tile) {
    const el = document.createElement('div');
    el.className = `tile tile--${tile.type} tile--loading`;
    el.dataset.tileId = tile.id;
    
    // Header
    const header = document.createElement('div');
    header.className = 'tile__header';
    
    const indicator = document.createElement('div');
    indicator.className = 'tile__type-indicator';
    
    const title = document.createElement('h3');
    title.className = 'tile__title';
    title.textContent = tile.title;
    
    const actions = document.createElement('div');
    actions.className = 'tile__actions';
    
    // Pin button
    const pinBtn = document.createElement('button');
    pinBtn.className = 'tile__action-btn tile__pin';
    pinBtn.textContent = '📍';
    pinBtn.title = 'Pin tile';
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileManager.togglePin(tile.id);
    });
    
    // Expand button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tile__action-btn tile__expand';
    expandBtn.textContent = '⤢';
    expandBtn.title = 'Expand tile';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileManager.toggleExpand(tile.id);
    });
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tile__action-btn tile__close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close tile';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileManager.removeTile(tile.id);
    });
    
    actions.append(pinBtn, expandBtn, closeBtn);
    header.append(indicator, title, actions);
    
    // Body (loading state)
    const body = document.createElement('div');
    body.className = 'tile__body';
    body.appendChild(this._renderLoadingSkeleton(tile.type));
    
    el.append(header, body);
    return el;
  }
  
  _renderLoadingSkeleton(type) {
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = 'var(--space-3)';
    
    if (type === 'weather') {
      // Temperature + icon row skeleton
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = 'var(--space-4)';
      const circle = document.createElement('div');
      circle.className = 'skeleton skeleton--circle';
      const lines = document.createElement('div');
      lines.style.display = 'flex';
      lines.style.flexDirection = 'column';
      lines.style.gap = 'var(--space-2)';
      lines.style.flex = '1';
      const l1 = document.createElement('div');
      l1.className = 'skeleton skeleton--narrow';
      l1.style.height = '32px';
      const l2 = document.createElement('div');
      l2.className = 'skeleton skeleton--wide';
      lines.append(l1, l2);
      row.append(circle, lines);
      container.append(row);
    } else if (type === 'place') {
      const imgSkel = document.createElement('div');
      imgSkel.className = 'skeleton';
      imgSkel.style.height = '140px';
      imgSkel.style.width = '100%';
      imgSkel.style.borderRadius = 'var(--radius-md)';
      container.append(imgSkel);
      for (let i = 0; i < 3; i++) {
        const line = document.createElement('div');
        line.className = `skeleton ${i === 2 ? 'skeleton--narrow' : 'skeleton--wide'}`;
        container.append(line);
      }
    } else {
      // Generic skeleton for fact/brainstorm
      for (let i = 0; i < 4; i++) {
        const line = document.createElement('div');
        line.className = `skeleton ${i % 2 === 0 ? 'skeleton--wide' : 'skeleton--narrow'}`;
        container.append(line);
      }
    }
    
    frag.appendChild(container);
    return frag;
  }
  
  _renderTileBody(tile) {
    // Remove loading class
    const el = this._tileElements.get(tile.id);
    if (el) el.classList.remove('tile--loading');
    
    switch (tile.type) {
      case 'weather': return this._renderWeather(tile.data);
      case 'place': return this._renderPlace(tile.data);
      case 'fact': return this._renderFact(tile.data);
      case 'brainstorm': return this._renderBrainstorm(tile.data);
      default: return document.createDocumentFragment();
    }
  }
  
  _renderWeather(data) {
    // data: { temp, feelsLike, condition, icon, location, humidity, windSpeed, forecast: [{ day, temp, icon }] }
    const frag = document.createDocumentFragment();
    
    const main = document.createElement('div');
    main.className = 'weather__main';
    
    const iconImg = document.createElement('img');
    iconImg.className = 'weather__icon';
    iconImg.src = `https://openweathermap.org/img/wn/${data.icon}@2x.png`;
    iconImg.alt = data.condition;
    
    const info = document.createElement('div');
    info.className = 'weather__details';
    
    const temp = document.createElement('div');
    temp.className = 'weather__temp';
    temp.textContent = `${Math.round(data.temp)}°C`;
    
    const condition = document.createElement('div');
    condition.className = 'weather__condition';
    condition.textContent = data.condition;
    
    const location = document.createElement('div');
    location.className = 'weather__location';
    location.textContent = data.location;
    
    const details = document.createElement('div');
    details.className = 'weather__extra';
    
    const humiditySpan = document.createElement('span');
    humiditySpan.textContent = `💧 ${data.humidity}%`;
    const windSpan = document.createElement('span');
    windSpan.textContent = `💨 ${data.windSpeed} m/s`;
    const feelsSpan = document.createElement('span');
    feelsSpan.textContent = `🌡️ Feels ${Math.round(data.feelsLike)}°C`;
    details.append(humiditySpan, windSpan, feelsSpan);
    
    info.append(temp, condition, location, details);
    main.append(iconImg, info);
    frag.appendChild(main);
    
    // Forecast
    if (data.forecast && data.forecast.length > 0) {
      const forecastRow = document.createElement('div');
      forecastRow.className = 'weather__forecast';
      data.forecast.forEach(day => {
        const dayEl = document.createElement('div');
        dayEl.className = 'weather__forecast-day';
        const dayName = document.createElement('span');
        dayName.textContent = day.day;
        const dayIcon = document.createElement('img');
        dayIcon.src = `https://openweathermap.org/img/wn/${day.icon}.png`;
        dayIcon.alt = day.condition || '';
        dayIcon.style.width = '32px';
        const dayTemp = document.createElement('span');
        dayTemp.textContent = `${Math.round(day.temp)}°`;
        dayEl.append(dayName, dayIcon, dayTemp);
        forecastRow.appendChild(dayEl);
      });
      frag.appendChild(forecastRow);
    }
    
    return frag;
  }
  
  _renderPlace(data) {
    // data: { image, title, summary, facts: [string] }
    const frag = document.createDocumentFragment();
    
    if (data.image) {
      const img = document.createElement('img');
      img.className = 'place__image';
      img.src = data.image;
      img.alt = data.title || '';
      img.loading = 'lazy';
      frag.appendChild(img);
    }
    
    if (data.summary) {
      const summary = document.createElement('p');
      summary.className = 'place__summary';
      summary.textContent = data.summary;
      frag.appendChild(summary);
    }
    
    if (data.facts && data.facts.length > 0) {
      const factsContainer = document.createElement('div');
      factsContainer.className = 'place__facts';
      data.facts.forEach(fact => {
        const chip = document.createElement('span');
        chip.className = 'place__fact-chip';
        chip.textContent = fact;
        factsContainer.appendChild(chip);
      });
      frag.appendChild(factsContainer);
    }
    
    return frag;
  }
  
  _renderFact(data) {
    // data: { content (markdown string) }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'fact__content';
    container.appendChild(renderMarkdown(data.content));
    frag.appendChild(container);
    return frag;
  }
  
  _renderBrainstorm(data) {
    // data: { ideas: [string] }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'brainstorm__ideas';
    (data.ideas || []).forEach((idea, i) => {
      const card = document.createElement('div');
      card.className = 'brainstorm__idea';
      const num = document.createElement('span');
      num.className = 'brainstorm__idea-number';
      num.textContent = `#${i + 1}`;
      const text = document.createElement('p');
      text.textContent = idea;
      card.append(num, text);
      container.appendChild(card);
    });
    frag.appendChild(container);
    return frag;
  }
  
  _renderError(error) {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-3);padding:var(--space-4);text-align:center';
    const icon = document.createElement('span');
    icon.style.fontSize = '2rem';
    icon.textContent = '⚠️';
    const msg = document.createElement('p');
    msg.style.cssText = 'color:var(--text-muted);font-size:var(--text-sm)';
    msg.textContent = error || 'Something went wrong';
    container.append(icon, msg);
    return container;
  }
  
  _toggleOverlay(show) {
    if (!this._overlayEl) {
      this._overlayEl = document.getElementById('tile-overlay');
      this._overlayEl?.addEventListener('click', () => {
        // Collapse all expanded tiles
        this.tileManager.getTiles().forEach(t => {
          if (t.expanded) this.tileManager.toggleExpand(t.id);
        });
      });
    }
    this._overlayEl?.classList.toggle('tile-overlay--visible', show);
  }
  
  _updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
      emptyState.style.display = this._tileElements.size === 0 ? 'flex' : 'none';
    }
  }
}
