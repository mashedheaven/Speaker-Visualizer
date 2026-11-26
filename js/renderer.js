import { renderMarkdown, bindModalDialogDismiss, closeTopLayer } from './utils.js';

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
    // Restored persisted tiles (already 'ready' or 'error') must render immediately
    if (tile.status !== 'loading') {
      this._updateTile(tile);
    }
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
      el.classList.remove('tile--loading');
      while (body.firstChild) body.removeChild(body.firstChild);
      body.appendChild(this._renderError(tile.error));
    }
    // Update pin button state
    const pinBtn = el.querySelector('.tile__pin');
    if (pinBtn) {
      pinBtn.classList.toggle('tile__action-btn--pinned', tile.pinned);
      pinBtn.textContent = tile.pinned ? '📌' : '📍';
      pinBtn.title = tile.pinned ? 'Unpin tile' : 'Pin tile';
    }
    // Update expand button state & clear inline parallax transform when expanded
    const expandBtn = el.querySelector('.tile__expand');
    if (expandBtn) {
      expandBtn.textContent = tile.expanded ? '⤡' : '⤢';
      expandBtn.title = tile.expanded ? 'Collapse tile' : 'Expand tile';
    }
    if (tile.expanded) {
      el.style.transform = '';
      el.style.removeProperty('--glare-x');
      el.style.removeProperty('--glare-y');
    }
    el.classList.toggle('tile--expanded', tile.expanded);
    const anyExpanded = this.tileManager.getTiles().some(t => t.expanded);
    this._toggleOverlay(anyExpanded);
  }
  
  _removeTile(id) {
    const anyExpanded = this.tileManager.getTiles().some(t => t.expanded);
    this._toggleOverlay(anyExpanded);

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
    const el = document.createElement('article');
    el.className = `tile tile--${tile.type} tile--loading`;
    el.dataset.tileId = tile.id;

    el.addEventListener('click', () => {
      window.app?.setFocusedTile?.(tile.id);
    });
    
    // Holographic scanline sweep
    const scanline = document.createElement('div');
    scanline.className = 'tile__scanline';
    scanline.addEventListener('animationend', () => scanline.remove(), { once: true });
    el.appendChild(scanline);

    // Dynamic holographic glare overlay
    const glare = document.createElement('div');
    glare.className = 'tile__glare';
    el.appendChild(glare);

    // 3D Parallax Tilt
    this._attachParallax(el);

    // Header
    const header = document.createElement('header');
    header.className = 'tile__header';
    
    const indicator = document.createElement('div');
    indicator.className = 'tile__type-indicator';
    
    const title = document.createElement('h3');
    title.className = 'tile__title';
    title.textContent = tile.title;
    
    const actions = document.createElement('div');
    actions.className = 'tile__actions';

    // Brief Aloud button
    const speakBtn = document.createElement('button');
    speakBtn.type = 'button';
    speakBtn.className = 'tile__action-btn tile__speak';
    speakBtn.textContent = '🔊';
    speakBtn.title = 'Ask JARVIS to brief this tile';
    speakBtn.setAttribute('aria-label', `Ask JARVIS to explain ${tile.title}`);
    speakBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.app?.briefTile?.(tile.id);
    });
    
    // Export Markdown button
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'tile__action-btn tile__export';
    exportBtn.textContent = '📋';
    exportBtn.title = 'Copy as Markdown';
    exportBtn.setAttribute('aria-label', `Copy ${tile.title} as Markdown`);
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._exportTileMarkdown(tile);
    });

    // Pin button
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'tile__action-btn tile__pin';
    pinBtn.textContent = '📍';
    pinBtn.title = 'Pin tile';
    pinBtn.setAttribute('aria-label', `Pin ${tile.title}`);
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileManager.togglePin(tile.id);
    });
    
    // Expand button
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'tile__action-btn tile__expand';
    expandBtn.textContent = '⤢';
    expandBtn.title = 'Expand tile';
    expandBtn.setAttribute('aria-label', `Expand ${tile.title}`);
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileManager.toggleExpand(tile.id);
      window.app?.setFocusedTile?.(tile.id);
    });
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tile__action-btn tile__close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close tile';
    closeBtn.setAttribute('aria-label', `Close ${tile.title}`);
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileManager.removeTile(tile.id);
    });
    
    actions.append(speakBtn, exportBtn, pinBtn, expandBtn, closeBtn);
    header.append(indicator, title, actions);
    
    // Body (loading state)
    const body = document.createElement('div');
    body.className = 'tile__body';
    body.appendChild(this._renderLoadingSkeleton(tile.type));
    
    el.append(header, body);
    return el;
  }

  setFocusedTile(id) {
    this._tileElements.forEach((el, tileId) => {
      el.classList.toggle('tile--focused', tileId === id);
    });
  }

  pulseSpeakingTile(id) {
    const el = this._tileElements.get(id);
    if (!el) return;
    el.classList.remove('tile--speaking');
    void el.offsetWidth; // restart brief pulse cleanly
    el.classList.add('tile--speaking');
    clearTimeout(el._speakingTimer);
    el._speakingTimer = setTimeout(() => {
      el.classList.remove('tile--speaking');
    }, 2600);
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
      case 'fact': return this._renderFact(tile.data, tile.title);
      case 'brainstorm': return this._renderBrainstorm(tile.data, tile.title);
      case 'timer': return this._renderTimer(tile, tile.data);
      case 'system': return this._renderSystem(tile.data);
      case 'finance': return this._renderFinance(tile.data);
      case 'news': return this._renderNews(tile.data);
      case 'calculator': return this._renderCalculator(tile.data);
      case 'music': return this._renderMusic(tile.data);
      case 'calendar': return this._renderCalendar(tile.data);
      case 'webSearch': return this._renderWebSearch(tile.data);
      case 'imageSearch': return this._renderImageSearch(tile.data);
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
        dayTemp.className = 'weather__forecast-day-temp';
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
    const layout = document.createElement('div');
    layout.className = 'place__layout';
    
    if (data.image) {
      const img = document.createElement('img');
      img.className = 'place__image';
      img.src = data.image;
      img.alt = data.title || '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.style.display = 'none'; });
      layout.appendChild(img);
    }

    const textCol = document.createElement('div');
    textCol.className = 'place__body';
    
    if (data.summary) {
      const summary = document.createElement('p');
      summary.className = 'place__summary';
      summary.textContent = data.summary;
      textCol.appendChild(summary);
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
      textCol.appendChild(factsContainer);
    }

    if (data.title) {
      const placeFooter = document.createElement('footer');
      placeFooter.className = 'place__actions';

      const galleryBtn = document.createElement('button');
      galleryBtn.type = 'button';
      galleryBtn.className = 'btn--tell-more';
      galleryBtn.textContent = '🖼️ View Gallery';
      galleryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.app?.processText?.(`Show me pictures of ${data.title}`, true);
      });

      const webBtn = document.createElement('button');
      webBtn.type = 'button';
      webBtn.className = 'btn--tell-more';
      webBtn.textContent = '🌐 Web Dossier';
      webBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.app?.processText?.(`Search the web for ${data.title}`, true);
      });

      placeFooter.append(galleryBtn, webBtn);
      textCol.appendChild(placeFooter);
    }

    layout.appendChild(textCol);
    frag.appendChild(layout);
    
    return frag;
  }
  
  _renderFact(data, title) {
    // data: { content (markdown string) }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'fact__content';
    container.appendChild(renderMarkdown(data.content));
    
    // Holographic inquiry follow-up button
    const tellMoreBtn = document.createElement('button');
    tellMoreBtn.className = 'btn--tell-more';
    tellMoreBtn.textContent = '⚡ Tell me more';
    tellMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.app?.processText) {
        window.app.processText(`Tell me more about ${title || 'this'}`, true);
      }
    });
    container.appendChild(tellMoreBtn);

    frag.appendChild(container);
    return frag;
  }
  
  _renderBrainstorm(data, title) {
    // data: { ideas: [string] }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'brainstorm__ideas';
    const starredSet = new Set();

    (data.ideas || []).forEach((idea, i) => {
      const card = document.createElement('div');
      card.className = 'brainstorm__idea';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'brainstorm__idea-header';

      const num = document.createElement('span');
      num.className = 'brainstorm__idea-number';
      num.textContent = `#${i + 1}`;

      const starBtn = document.createElement('button');
      starBtn.className = 'idea__star';
      starBtn.textContent = '☆';
      starBtn.title = 'Star idea';
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (starredSet.has(idea)) {
          starredSet.delete(idea);
          starBtn.textContent = '☆';
          starBtn.classList.remove('idea__star--active');
        } else {
          starredSet.add(idea);
          starBtn.textContent = '★';
          starBtn.classList.add('idea__star--active');
        }
      });

      cardHeader.append(num, starBtn);

      const text = document.createElement('p');
      text.textContent = idea;

      card.append(cardHeader, text);
      container.appendChild(card);
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn--export-ideas';
    exportBtn.textContent = '✨ Export Ideas to Clipboard';
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const listToExport = starredSet.size > 0 
        ? Array.from(starredSet) 
        : (data.ideas || []);
      const md = `### Brainstorm: ${title || 'Ideas'}\n\n` + listToExport.map((it, idx) => `${idx + 1}. ${it}`).join('\n');
      navigator.clipboard.writeText(md).then(() => {
        if (window.app?._showNotification) {
          window.app._showNotification(`Copied ${listToExport.length} ideas to clipboard!`, 'success');
        }
      });
    });

    frag.append(container, exportBtn);
    return frag;
  }

  _renderTimer(tile, data) {
    // data: { label, totalSeconds, remainingSeconds, startTime, endTime }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'timer__container';

    const gauge = document.createElement('div');
    gauge.className = 'timer__gauge';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'timer__svg');
    svg.setAttribute('viewBox', '0 0 140 140');

    const radius = 56;
    const circumference = 2 * Math.PI * radius;

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('class', 'timer__circle-bg');
    bgCircle.setAttribute('cx', '70');
    bgCircle.setAttribute('cy', '70');
    bgCircle.setAttribute('r', radius);

    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('class', 'timer__circle-progress');
    progressCircle.setAttribute('cx', '70');
    progressCircle.setAttribute('cy', '70');
    progressCircle.setAttribute('r', radius);
    progressCircle.setAttribute('stroke-dasharray', `${circumference}`);
    progressCircle.setAttribute('stroke-dashoffset', '0');

    svg.append(bgCircle, progressCircle);

    const center = document.createElement('div');
    center.className = 'timer__center';

    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'timer__time';

    const labelDisplay = document.createElement('div');
    labelDisplay.className = 'timer__label';
    labelDisplay.textContent = data.label || 'COUNTDOWN';

    center.append(timeDisplay, labelDisplay);
    gauge.append(svg, center);
    container.append(gauge);

    const formatTime = (secs) => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const targetEnd = data.endTime || (Date.now() + data.totalSeconds * 1000);
    const computeRemaining = () => Math.max(0, Math.ceil((targetEnd - Date.now()) / 1000));

    let remaining = computeRemaining();
    timeDisplay.textContent = formatTime(remaining);
    if (remaining >= 3600) timeDisplay.classList.add('timer__time--long');

    // Live countdown interval synchronized to wall clock (prevents timer drift)
    let mounted = false;
    const interval = setInterval(() => {
      if (mounted && !container.isConnected) {
        clearInterval(interval);
        observer.disconnect();
        return;
      }
      mounted = container.isConnected;
      remaining = computeRemaining();
      timeDisplay.classList.toggle('timer__time--long', remaining >= 3600);

      if (remaining <= 0) {
        clearInterval(interval);
        observer.disconnect();
        timeDisplay.textContent = '00:00';
        progressCircle.style.strokeDashoffset = `${circumference}`;
        timeDisplay.classList.add('timer__completed');
        if (window.app?.jarvis) {
          window.app.jarvis.playChime('complete');
          window.app.jarvis.speak(`Sir, your timer for ${data.label || 'countdown'} has expired.`);
        }
      } else {
        timeDisplay.textContent = formatTime(remaining);
        const offset = circumference * (1 - remaining / data.totalSeconds);
        progressCircle.style.strokeDashoffset = `${offset}`;
      }
    }, 500);

    // Clean up timer immediately if tile is removed from grid
    const observer = new MutationObserver(() => {
      if (mounted && !container.isConnected) {
        clearInterval(interval);
        observer.disconnect();
      } else if (container.isConnected) {
        mounted = true;
      }
    });
    observer.observe(this.grid, { childList: true });

    frag.appendChild(container);
    return frag;
  }

  _createSystemMetricCard(labelText, valueText, pct, fillBackground = '', valueColor = '') {
    const card = document.createElement('div');
    card.className = 'system__card';

    const header = document.createElement('div');
    header.className = 'system__card-header';

    const label = document.createElement('span');
    label.className = 'system__card-label';
    label.textContent = labelText;

    const value = document.createElement('span');
    value.className = 'system__card-value';
    value.textContent = valueText;
    if (valueColor) value.style.color = valueColor;

    header.append(label, value);

    const track = document.createElement('div');
    track.className = 'system__bar-track';

    const fill = document.createElement('div');
    fill.className = 'system__bar-fill';
    const clampedPct = Math.max(0, Math.min(100, Number(pct) || 0));
    fill.style.width = `${clampedPct}%`;
    if (fillBackground) fill.style.background = fillBackground;

    track.appendChild(fill);
    card.append(header, track);
    return card;
  }

  _renderSystem(data) {
    // data: { cpu: {cores, loadPct}, memory: {usedGB, totalGB, pct}, battery: {level, charging}, reactor: {output, temp, status} }
    const frag = document.createDocumentFragment();
    const grid = document.createElement('div');
    grid.className = 'system__grid';

    const cpuCard = this._createSystemMetricCard(
      `CPU (${data.cpu.cores} Cores)`,
      `${data.cpu.loadPct}%`,
      data.cpu.loadPct
    );
    const memCard = this._createSystemMetricCard(
      'Memory',
      `${data.memory.usedGB} / ${data.memory.totalGB} GB`,
      data.memory.pct
    );
    const batCard = this._createSystemMetricCard(
      `Power ${data.battery.charging ? '⚡ Charging' : '🔋 Battery'}`,
      `${data.battery.level}%`,
      data.battery.level,
      data.battery.level < 20 ? '#ef4444' : 'linear-gradient(90deg, #10b981, #34d399)'
    );
    const coreCard = this._createSystemMetricCard(
      'Arc Core Output',
      `${data.reactor.output}%`,
      data.reactor.output,
      'linear-gradient(90deg, #00d4ff, #a855f7)',
      '#00d4ff'
    );

    grid.append(cpuCard, memCard, batCard, coreCard);
    frag.appendChild(grid);
    return frag;
  }

  _renderFinance(data) {
    // data: { symbol, name, price, changePct, isPositive, high24h, low24h, sparkline }
    const frag = document.createDocumentFragment();
    const main = document.createElement('div');
    main.className = 'finance__main';

    const header = document.createElement('div');
    header.className = 'finance__header';

    const nameHeading = document.createElement('h4');
    nameHeading.style.cssText = 'font-size:var(--text-base);font-weight:600;color:var(--text-primary)';
    nameHeading.textContent = data.name;

    const symSpan = document.createElement('span');
    symSpan.className = 'finance__symbol';
    symSpan.textContent = data.symbol;
    header.append(nameHeading, symSpan);

    const priceRow = document.createElement('div');
    priceRow.className = 'finance__price-row';
    const priceEl = document.createElement('span');
    priceEl.className = 'finance__price';
    priceEl.style.color = data.isPositive ? '#10b981' : '#ef4444';
    priceEl.textContent = data.price;

    const changeEl = document.createElement('span');
    changeEl.className = `finance__change ${data.isPositive ? 'finance__change--up' : 'finance__change--down'}`;
    changeEl.textContent = data.changePct;
    priceRow.append(priceEl, changeEl);

    // Mini SVG Sparkline
    const sparklineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sparklineSvg.setAttribute('class', 'finance__sparkline');
    sparklineSvg.setAttribute('viewBox', '0 0 280 48');
    sparklineSvg.setAttribute('preserveAspectRatio', 'none');

    if (data.sparkline && data.sparkline.length > 1) {
      const min = Math.min(...data.sparkline);
      const max = Math.max(...data.sparkline);
      const range = (max - min) || 1;
      const step = 280 / (data.sparkline.length - 1);

      const points = data.sparkline.map((val, idx) => {
        const x = idx * step;
        const y = 44 - ((val - min) / range) * 38;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', data.isPositive ? '#10b981' : '#ef4444');
      polyline.setAttribute('stroke-width', '2.5');
      polyline.setAttribute('stroke-linecap', 'round');
      polyline.setAttribute('stroke-linejoin', 'round');
      sparklineSvg.appendChild(polyline);
    }

    const stats = document.createElement('div');
    stats.className = 'finance__stats';

    const highSpan = document.createElement('span');
    highSpan.textContent = '24h High: ';
    const highStrong = document.createElement('strong');
    highStrong.textContent = data.high24h;
    highSpan.appendChild(highStrong);

    const lowSpan = document.createElement('span');
    lowSpan.textContent = '24h Low: ';
    const lowStrong = document.createElement('strong');
    lowStrong.textContent = data.low24h;
    lowSpan.appendChild(lowStrong);

    stats.append(highSpan, lowSpan);

    main.append(header, priceRow, sparklineSvg, stats);
    frag.appendChild(main);
    return frag;
  }

  _renderNews(data) {
    // data: { topic, articles: [{source, title, time}] }
    const frag = document.createDocumentFragment();
    const list = document.createElement('div');
    list.className = 'news__list';

    (data.articles || []).forEach(art => {
      const item = document.createElement('div');
      item.className = 'news__item';

      const artHeader = document.createElement('div');
      artHeader.className = 'news__header';

      const src = document.createElement('span');
      src.className = 'news__source';
      src.textContent = art.source;

      const time = document.createElement('span');
      time.className = 'news__time';
      time.textContent = art.time;

      artHeader.append(src, time);

      const title = document.createElement('div');
      title.className = 'news__title';
      title.textContent = art.title;

      item.append(artHeader, title);
      list.appendChild(item);
    });

    frag.appendChild(list);
    return frag;
  }

  _renderCalculator(data) {
    // data: { expression, result, steps, spokenResult }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'calc__container';

    const display = document.createElement('div');
    display.className = 'calc__display';

    const expr = document.createElement('div');
    expr.className = 'calc__expression';
    expr.textContent = data.expression || '';

    const res = document.createElement('div');
    res.className = 'calc__result';
    res.textContent = data.result || '0';

    display.append(expr, res);

    const stepsList = document.createElement('div');
    stepsList.className = 'calc__steps';
    (data.steps || []).forEach(step => {
      const s = document.createElement('div');
      s.textContent = `• ${step}`;
      stepsList.appendChild(s);
    });

    container.append(display, stepsList);
    frag.appendChild(container);
    return frag;
  }

  _renderMusic(data) {
    // data: { title, artist, album, albumArt, previewUrl, genre, year }
    const frag = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'music__container';

    const card = document.createElement('div');
    card.className = 'music__card';

    if (data.albumArt) {
      const img = document.createElement('img');
      img.className = 'music__art';
      img.src = data.albumArt;
      img.alt = data.title;
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.style.display = 'none'; });
      card.appendChild(img);
    }

    const details = document.createElement('div');
    details.className = 'music__details';

    const track = document.createElement('div');
    track.className = 'music__track';
    track.textContent = data.title;

    const artist = document.createElement('div');
    artist.className = 'music__artist';
    artist.textContent = data.artist;

    const album = document.createElement('div');
    album.className = 'music__album';
    album.textContent = `${data.album} (${data.year || ''}) • ${data.genre || 'Rock'}`;

    details.append(track, artist, album);
    card.appendChild(details);
    container.appendChild(card);

    if (data.previewUrl) {
      const audio = document.createElement('audio');
      audio.className = 'music__audio-ctrl';
      audio.controls = true;
      audio.preload = 'none';
      audio.src = data.previewUrl;
      container.appendChild(audio);
    } else {
      const note = document.createElement('div');
      note.className = 'music__no-preview';
      note.textContent = 'Offline track metadata — audio stream unavailable';
      container.appendChild(note);
    }

    frag.appendChild(container);
    return frag;
  }

  _renderCalendar(data) {
    // data: { date, summary, events: [{ time, title, category, urgent }] }
    const frag = document.createDocumentFragment();
    
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);font-size:var(--text-xs);color:var(--text-muted);font-family:var(--font-mono)';

    const dateSpan = document.createElement('span');
    dateSpan.textContent = `📅 ${data.date || 'Today'}`;
    const countSpan = document.createElement('span');
    countSpan.textContent = `${data.events?.length || 0} Briefings`;
    header.append(dateSpan, countSpan);

    const timeline = document.createElement('div');
    timeline.className = 'cal__timeline';

    (data.events || []).forEach(evt => {
      const item = document.createElement('div');
      item.className = `cal__event ${evt.urgent ? 'cal__event--urgent' : ''}`;
      
      const time = document.createElement('span');
      time.className = 'cal__time';
      time.textContent = `${evt.time} [${evt.category || 'Strategic'}]`;

      const title = document.createElement('span');
      title.className = 'cal__title';
      title.textContent = evt.title;

      item.append(time, title);
      timeline.appendChild(item);
    });

    frag.append(header, timeline);
    return frag;
  }

  _isSafeHttpUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  _renderWebSearch(data) {
    // data: { query, results: [{ title, snippet, url, source }] }
    const frag = document.createDocumentFragment();
    const list = document.createElement('div');
    list.className = 'websearch__list';

    (data.results || []).forEach(res => {
      const hasValidUrl = this._isSafeHttpUrl(res.url);
      const card = document.createElement(hasValidUrl ? 'a' : 'div');
      card.className = 'websearch__card';

      if (hasValidUrl) {
        card.href = res.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.addEventListener('click', (e) => {
          if (window.electronAPI?.openExternal) {
            e.preventDefault();
            window.electronAPI.openExternal(res.url);
          }
        });
      }

      const title = document.createElement('span');
      title.className = 'websearch__card-title';
      title.textContent = hasValidUrl ? `${res.title} ↗` : res.title;

      const snippet = document.createElement('span');
      snippet.className = 'websearch__card-snippet';
      snippet.textContent = res.snippet;

      card.append(title, snippet);
      list.appendChild(card);
    });

    frag.appendChild(list);
    return frag;
  }

  _renderImageSearch(data) {
    // data: { query, images: [{ url, thumb, title, author }] }
    const frag = document.createDocumentFragment();
    const grid = document.createElement('div');
    grid.className = 'imagesearch__grid';

    (data.images || []).forEach(imgData => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'imagesearch__item';
      item.setAttribute('aria-label', `Inspect image: ${imgData.title || data.query}`);

      const img = document.createElement('img');
      img.className = 'imagesearch__img';
      img.src = imgData.thumb || imgData.url;
      img.alt = imgData.title || data.query;
      img.loading = 'lazy';
      img.addEventListener('error', () => { item.style.display = 'none'; });

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openImageLightbox(imgData, data.query);
      });

      item.appendChild(img);
      grid.appendChild(item);
    });

    frag.appendChild(grid);
    return frag;
  }

  _openImageLightbox(imgData, query) {
    let dialog = document.getElementById('image-lightbox');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'image-lightbox';
      dialog.className = 'image-lightbox';
      dialog.setAttribute('closedby', 'any');
      dialog.setAttribute('aria-labelledby', 'image-lightbox-title');
      document.body.appendChild(dialog);
      bindModalDialogDismiss(dialog);
    }

    while (dialog.firstChild) dialog.removeChild(dialog.firstChild);

    const frame = document.createElement('div');
    frame.className = 'image-lightbox__frame';

    const srTitle = document.createElement('h1');
    srTitle.id = 'image-lightbox-title';
    srTitle.className = 'visually-hidden';
    srTitle.textContent = imgData.title || query || 'Visual Preview';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.autofocus = true;
    closeBtn.className = 'btn btn--ghost btn--sm image-lightbox__close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close preview';
    closeBtn.setAttribute('aria-label', 'Close image preview');
    closeBtn.addEventListener('click', () => closeTopLayer(dialog));

    const img = document.createElement('img');
    img.className = 'image-lightbox__img';
    img.src = imgData.url || imgData.thumb;
    img.alt = imgData.title || query || '';

    const footer = document.createElement('div');
    footer.className = 'image-lightbox__footer';

    const caption = document.createElement('div');
    caption.className = 'imagesearch__caption';
    caption.textContent = `${imgData.title || query} — ${imgData.author || 'Archive'}`;

    footer.appendChild(caption);

    if (this._isSafeHttpUrl(imgData.url)) {
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn--secondary btn--sm';
      openBtn.textContent = 'Open Original ↗';
      openBtn.addEventListener('click', () => {
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(imgData.url);
        }
      });
      footer.appendChild(openBtn);
    }

    frame.append(srTitle, closeBtn, img, footer);
    dialog.appendChild(frame);
    dialog.showModal();
  }

  _exportTileMarkdown(tile) {
    let md = `# [JARVIS INTELLIGENCE] ${tile.title}\n`;
    md += `**Classification**: ${tile.type.toUpperCase()}\n`;
    md += `**Timestamp**: ${new Date(tile.createdAt).toISOString()}\n\n`;

    if (tile.type === 'weather' && tile.data) {
      md += `**Location**: ${tile.data.location}\n`;
      md += `**Temperature**: ${Math.round(tile.data.temp)}°C (Feels like ${Math.round(tile.data.feelsLike)}°C)\n`;
      md += `**Condition**: ${tile.data.condition}\n`;
      md += `**Humidity**: ${tile.data.humidity}% | **Wind**: ${tile.data.windSpeed} m/s\n`;
    } else if (tile.type === 'place' && tile.data) {
      md += `${tile.data.summary || ''}\n\n`;
      if (tile.data.facts?.length) {
        md += `### Strategic Intelligence:\n` + tile.data.facts.map(f => `- ${f}`).join('\n') + '\n';
      }
    } else if (tile.type === 'fact' && tile.data) {
      md += `${tile.data.content}\n`;
    } else if (tile.type === 'brainstorm' && tile.data) {
      md += `### Strategic Concepts:\n` + (tile.data.ideas || []).map((idea, i) => `${i + 1}. ${idea}`).join('\n') + '\n';
    } else if (tile.type === 'timer' && tile.data) {
      md += `**Timer Label**: ${tile.data.label}\n**Duration**: ${tile.data.totalSeconds} seconds\n`;
    } else if (tile.type === 'system' && tile.data) {
      md += `### Stark Telemetry:\n`;
      md += `- CPU Cores: ${tile.data.cpu?.cores} (${tile.data.cpu?.loadPct}% load)\n`;
      md += `- Memory: ${tile.data.memory?.usedGB} / ${tile.data.memory?.totalGB} GB\n`;
      md += `- Power: ${tile.data.battery?.level}%\n`;
      md += `- Arc Reactor Output: ${tile.data.reactor?.output}%\n`;
    } else if (tile.type === 'finance' && tile.data) {
      md += `### Financial Telemetry:\n`;
      md += `- Asset: ${tile.data.name} (${tile.data.symbol})\n`;
      md += `- Price: ${tile.data.price} (${tile.data.changePct})\n`;
    } else if (tile.type === 'news' && tile.data) {
      md += `### Intelligence Wire:\n`;
      (tile.data.articles || []).forEach(a => {
        md += `- [${a.source}] ${a.title} (${a.time})\n`;
      });
    } else if (tile.type === 'calculator' && tile.data) {
      md += `**Formula**: ${tile.data.expression}\n**Result**: ${tile.data.result}\n`;
    } else if (tile.type === 'music' && tile.data) {
      md += `**Track**: ${tile.data.title}\n**Artist**: ${tile.data.artist}\n**Album**: ${tile.data.album}\n`;
    } else if (tile.type === 'calendar' && tile.data) {
      md += `### Agenda for ${tile.data.date}:\n`;
      (tile.data.events || []).forEach(e => {
        md += `- ${e.time}: ${e.title} [${e.category}]\n`;
      });
    } else if (tile.type === 'webSearch' && tile.data) {
      md += `### Web Index for: ${tile.data.query}\n`;
      (tile.data.results || []).forEach(r => {
        md += `- [${r.title}](${r.url}): ${r.snippet}\n`;
      });
    } else if (tile.type === 'imageSearch' && tile.data) {
      md += `### Visual Archive for: ${tile.data.query}\n`;
      (tile.data.images || []).forEach(img => {
        md += `![${img.title}](${img.url})\n`;
      });
    }

    navigator.clipboard.writeText(md).then(() => {
      if (window.app?._showNotification) {
        window.app._showNotification('Copied tile intelligence to clipboard as Markdown', 'success');
      }
    }).catch(err => {
      console.warn('Clipboard write failed:', err);
    });
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
  
  _attachParallax(el) {
    let ticking = false;

    el.addEventListener('mousemove', (e) => {
      if (el.classList.contains('tile--expanded')) return;
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;

        const rotX = ((y - cy) / cy) * -6; // max 6 deg
        const rotY = ((x - cx) / cx) * 6;  // max 6 deg

        el.style.transform = `perspective(800px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-2px)`;
        el.style.setProperty('--glare-x', `${(x / rect.width * 100).toFixed(1)}%`);
        el.style.setProperty('--glare-y', `${(y / rect.height * 100).toFixed(1)}%`);
        ticking = false;
      });
    });

    el.addEventListener('mouseleave', () => {
      if (el.classList.contains('tile--expanded')) return;
      el.style.transform = '';
      el.style.removeProperty('--glare-x');
      el.style.removeProperty('--glare-y');
    });
  }

  _updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
      emptyState.style.display = this._tileElements.size === 0 ? 'flex' : 'none';
    }
  }
}
