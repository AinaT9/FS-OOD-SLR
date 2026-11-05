/*
 * Reads the CSV named in js/config.js and builds every page from it.
 * You should not need to edit this file to change the data or the wording.
 */
(function () {
  'use strict';

  const C = window.SITE_CONFIG;
  const app = document.getElementById('app');
  const main = document.getElementById('main');
  const PAGE_SIZE = 25;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  const state = {
    data: null,
    current: '',
    q: '',
    sort: 'newest',
    filters: {},
    visible: PAGE_SIZE,
    facetOpen: new Set(C.facetsOpenByDefault),
    facetExpanded: new Set(),
    filtersOpen: false,
    lastPapers: '#/papers',
    lastPaperHref: '',
    scroll: {},
    dim: null,
    figNo: 0,
    searchTimer: null,
  };

  /* ---------- Small helpers ---------- */

  const ICONS = {
    arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };

  function icon(name) {
    return `<svg class="od-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fold(value) {
    return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function normHeader(value) {
    return fold(value).replace(/[^a-z0-9]/g, '');
  }

  function plural(count, one, many) {
    return `${count.toLocaleString('en')} ${count === 1 ? one : (many || one + 's')}`;
  }

  function pad(n) {
    return String(n).padStart(3, '0');
  }

  function headline(before, emphasis, after) {
    const lead = before ? `${esc(before)} ` : '';
    return `${lead}<em>${esc(emphasis)}</em>${esc(after || '')}<span class="dot">.</span>`;
  }

  function label(key) {
    return C.fields[key] ? C.fields[key].label : key;
  }

  function prettyUrl(url) {
    return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  }

  /* ---------- CSV parsing ---------- */

  function detectDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (ch === '\n') break;
      if (ch in counts) counts[ch] += 1;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  function parseCsv(input) {
    const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') { field += ch; continue; }
        if (text[i + 1] === '"') { field += '"'; i += 1; continue; }
        quoted = false;
        continue;
      }
      if (ch === '"' && field === '') { quoted = true; continue; }
      if (ch === delimiter) { row.push(field); field = ''; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  }

  // Excel often saves CSVs in an older encoding, which would garble accented names.
  function decodeBytes(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (err) {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  /* ---------- Turning rows into papers ---------- */

  function clean(value) {
    const text = String(value == null ? '' : value).trim();
    return C.missingValues.includes(text.toLowerCase()) ? '' : text;
  }

  function splitter(chars) {
    const escaped = chars.replace(/[\\\]^-]/g, '\\$&');
    return new RegExp(`[${escaped}\\n]`);
  }

  function findUrls(value) {
    return value.match(/https?:\/\/[^\s;,"'<>]+/gi) || [];
  }

  function isAffirmative(value) {
    const first = fold(value).split(/[\s,.;:()-]+/)[0];
    return C.affirmativeWords.includes(first);
  }

  function doiUrl(value) {
    const doi = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
    if (!/^10\.\d+\//.test(doi)) return { doi: value, url: '' };
    return { doi, url: `https://doi.org/${encodeURI(doi).replace(/[?#]/g, encodeURIComponent)}` };
  }

  function buildDataset(text, source) {
    const rows = parseCsv(text);
    if (rows.length < 2) {
      throw new Error('The file has no paper rows. It needs a header line and at least one paper.');
    }

    const headers = rows[0].map((h) => h.trim());
    const positions = new Map();
    headers.forEach((h, i) => {
      const norm = normHeader(h);
      if (norm && !positions.has(norm)) positions.set(norm, i);
    });

    const columns = {};
    const used = new Set();
    const missing = [];
    Object.keys(C.fields).forEach((key) => {
      const def = C.fields[key];
      const index = positions.get(normHeader(def.column));
      if (index === undefined) {
        missing.push(def.column);
      } else {
        columns[key] = index;
        used.add(index);
      }
    });

    if (columns.title === undefined) {
      throw new Error(`No "${C.fields.title.column}" column was found. The first line of the file should hold your column names. It starts with: ${headers.slice(0, 4).join(', ') || 'nothing'}.`);
    }

    const extras = headers
      .map((name, index) => ({ name, index }))
      .filter((col) => col.name && !used.has(col.index));

    const canon = {};
    const usedIds = new Set();
    const papers = [];

    rows.slice(1).forEach((row, rowIndex) => {
      const paper = { f: {}, m: {}, extras: [] };

      Object.keys(C.fields).forEach((key) => {
        const def = C.fields[key];
        const value = columns[key] === undefined ? '' : clean(row[columns[key]]);
        paper.f[key] = value;
        const parts = def.split ? value.split(splitter(def.split)) : [value];
        const seen = new Set();
        const map = canon[key] || (canon[key] = new Map());
        paper.m[key] = [];
        parts.forEach((part) => {
          const item = clean(part);
          if (!item) return;
          const id = fold(item);
          if (!map.has(id)) map.set(id, item);
          if (seen.has(id)) return;
          seen.add(id);
          paper.m[key].push(map.get(id));
        });
      });

      if (!paper.f.title) return;

      const yearMatch = paper.f.year.match(/\b(1[89]|20)\d{2}\b/);
      paper.year = yearMatch ? Number(yearMatch[0]) : null;
      paper.m.year = paper.year ? [String(paper.year)] : [];

      const citeText = paper.f.citations.replace(/[,\s]/g, '');
      paper.citations = citeText !== '' && Number.isFinite(Number(citeText)) ? Number(citeText) : null;

      const doi = doiUrl(paper.f.doi);
      paper.doi = doi.doi;
      paper.doiUrl = doi.url;
      paper.sourceUrl = findUrls(paper.f.link)[0] || '';
      paper.codeUrls = findUrls(paper.f.codeLink);
      paper.dataUrls = findUrls(paper.f.datasetLink);
      paper.hasCode = paper.codeUrls.length > 0 || isAffirmative(paper.f.code);
      paper.hasData = paper.dataUrls.length > 0 || isAffirmative(paper.f.datasetsOpen);

      extras.forEach((col) => {
        const value = clean(row[col.index]);
        if (value) paper.extras.push({ name: col.name, value });
      });

      let uid = paper.f.id || `row-${rowIndex + 2}`;
      if (usedIds.has(uid)) uid = `${uid}-${rowIndex + 2}`;
      usedIds.add(uid);
      paper.uid = uid;
      paper.href = `#/paper/${encodeURIComponent(uid)}`;

      paper.search = fold(['title', 'authors', 'abstract', 'keywords', 'methods', 'category', 'category2', 'venue', 'conference', 'institution', 'country', 'applications', 'metrics', 'year']
        .map((key) => paper.f[key]).join(' '));

      papers.push(paper);
    });

    if (!papers.length) {
      throw new Error('Rows were found, but none of them has a title.');
    }

    return {
      papers,
      headers,
      missing,
      extras,
      recognised: used.size,
      isSample: papers.some((p) => /^SAMPLE-/i.test(p.f.id)),
      source,
    };
  }

  /* ---------- Counting ---------- */

  function tally(papers, key) {
    const counts = new Map();
    papers.forEach((p) => (p.m[key] || []).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    return Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  function reported(papers, key) {
    return papers.filter((p) => (p.m[key] || []).length).length;
  }

  function hasData(key) {
    return state.data.papers.some((p) => (p.m[key] || []).length);
  }

  function yearSpan(papers) {
    const years = papers.map((p) => p.year).filter(Boolean);
    if (!years.length) return '';
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? String(min) : `${min}–${max}`;
  }

  /* ---------- Links between pages ---------- */

  function filterHref(filters) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
      [].concat(filters[key]).forEach((value) => params.append(key, value));
    });
    return `#/papers?${params.toString()}`;
  }

  function currentPapersHash() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    Object.keys(state.filters).forEach((key) => {
      state.filters[key].forEach((value) => params.append(key, value));
    });
    if (state.sort !== 'newest') params.set('sort', state.sort);
    const query = params.toString();
    return `#/papers${query ? `?${query}` : ''}`;
  }

  function parseHash(hash) {
    const text = (hash || '').replace(/^#/, '');
    const cut = text.indexOf('?');
    return {
      path: cut < 0 ? text : text.slice(0, cut),
      params: new URLSearchParams(cut < 0 ? '' : text.slice(cut + 1)),
    };
  }

  function setUrl(method, hash) {
    try {
      history[method](null, '', hash);
    } catch (err) {
      /* Some preview frames block URL changes. Pages still render from local state. */
    }
  }

  function routeKey(hash) {
    return parseHash(hash).path;
  }

  function navigate(hash, options) {
    const opts = options || {};
    state.scroll[routeKey(state.current)] = window.scrollY;
    state.current = hash;
    setUrl(opts.replace ? 'replaceState' : 'pushState', hash);
    renderRoute(opts);
  }

  function onExternalNavigation() {
    const hash = location.hash || '#/overview';
    if (hash === state.current) return;
    state.scroll[routeKey(state.current)] = window.scrollY;
    state.current = hash;
    renderRoute({ restore: true });
  }

  /* ---------- Shared fragments ---------- */

  function renderSections(list) {
    const items = list.filter((s) => s.body && s.body.trim());
    return items.map((s, i) => `
      <section class="section" aria-labelledby="section-${i}">
        <div class="container">
          <div class="sec-rule">
            <span class="sec-roman">${ROMAN[i] || i + 1}.</span>
            <span>${esc(s.meta)}</span>
            <span class="sec-page">${pad(i + 1)} / ${pad(items.length)}</span>
          </div>
          <div class="section-head">
            <h2 class="section-title" id="section-${i}">${s.title}</h2>
            ${s.intro ? `<p class="intro">${s.intro}</p>` : ''}
          </div>
          ${s.body}
        </div>
      </section>`).join('');
  }

  function pageHead(eyebrow, title, intro) {
    return `
      <div class="container page-head">
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1 class="display" tabindex="-1">${title}</h1>
        ${intro ? `<p class="lead">${intro}</p>` : ''}
      </div>`;
  }

  function barRow(item, max, href, unit) {
    const one = unit || 'paper';
    return `
      <li>
        <a class="bar-row" href="${esc(href)}" aria-label="${esc(item.value)}: ${esc(plural(item.count, one))}">
          <span class="bar-label">${esc(item.value)}</span>
          <span class="bar-value">${item.count.toLocaleString('en')}</span>
          <span class="bar-track"><span class="bar-fill" style="--w:${max ? (item.count / max) * 100 : 0}"></span></span>
        </a>
      </li>`;
  }

  function figure(key, options) {
    const opts = options || {};
    const papers = state.data.papers;
    const items = tally(papers, key);
    if (!items.length) return '';
    const limit = opts.limit || 10;
    const shown = items.slice(0, limit);
    const hidden = items.length - shown.length;
    state.figNo += 1;

    return `
      <figure class="fig">
        <figcaption class="fig-head">
          <span class="fig-no">Fig. ${String(state.figNo).padStart(2, '0')}</span>
          <h3 class="fig-title">${esc(label(key))}</h3>
        </figcaption>
        <ol class="bar-list">
          ${shown.map((item) => barRow(item, shown[0].count, filterHref({ [key]: item.value }))).join('')}
        </ol>
        ${hidden > 0 ? `<p class="fig-more fig-note">Showing the top ${shown.length} of ${items.length} values.${C.facets.includes(key) ? ' <a href="#/papers">See them all in the filters</a>.' : ''}</p>` : ''}
      </figure>`;
  }

  function yearCounts() {
    const counts = new Map();
    state.data.papers.forEach((p) => {
      if (p.year) counts.set(p.year, (counts.get(p.year) || 0) + 1);
    });
    if (!counts.size) return [];
    const years = Array.from(counts.keys());
    const out = [];
    for (let y = Math.min(...years); y <= Math.max(...years); y += 1) {
      out.push({ year: y, count: counts.get(y) || 0 });
    }
    return out;
  }

  function yearColumns() {
    const data = yearCounts();
    if (!data.length) return '';
    const peak = Math.max(...data.map((d) => d.count));
    const step = data.length <= 8 ? 1 : data.length <= 16 ? 2 : Math.ceil(data.length / 8);
    const lastIndex = data.length - 1;

    const cols = data.map((d, i) => {
      const showYear = (lastIndex - i) % step === 0;
      const showValue = d.count > 0;
      const inner = `
        ${d.count ? `<span class="col-tip">${d.year}: ${plural(d.count, 'paper')}</span>` : ''}
        <span class="col-plot">
          ${showValue ? `<span class="col-val">${d.count}</span>` : ''}
          <span class="col-bar" style="--h:${(d.count / peak) * 88}"></span>
        </span>
        <span class="col-year">${showYear ? d.year : ''}</span>`;
      return `<li class="col-item">${d.count
        ? `<a class="col" href="${esc(filterHref({ year: String(d.year) }))}" aria-label="${d.year}: ${esc(plural(d.count, 'paper'))}">${inner}</a>`
        : `<span class="col">${inner}</span>`}</li>`;
    }).join('');

    const table = `
      <details class="fig-table">
        <summary>View as a table</summary>
        <table class="data-table">
          <thead><tr><th scope="col">Year</th><th scope="col">Papers</th></tr></thead>
          <tbody>${data.map((d) => `<tr><td class="num">${d.year}</td><td class="num">${d.count}</td></tr>`).join('')}</tbody>
        </table>
      </details>`;

    return `<ol class="cols" aria-label="Papers per year">${cols}</ol>${table}`;
  }

  function miniList(papers, metaFn) {
    return `<ol class="mini-list">${papers.map((p) => `
      <li>
        <a class="mini-row" href="${esc(p.href)}">
          <span class="mini-year">${p.year || ''}</span>
          <span class="mini-text">${esc(p.f.title)}</span>
          <span class="mini-meta">${esc(metaFn(p))}</span>
        </a>
      </li>`).join('')}</ol>`;
  }

  function citationText(p) {
    return p.citations === null ? '' : plural(p.citations, 'citation');
  }

  function byCitations(a, b) {
    return (b.citations === null ? -1 : b.citations) - (a.citations === null ? -1 : a.citations);
  }

  function valueChips(key, values, withCounts) {
    const canFilter = C.facets.includes(key);
    return `<div class="chips">${values.map((entry) => {
      const value = withCounts ? entry.value : entry;
      const count = withCounts ? `<span class="chip-count">${entry.count}</span>` : '';
      return canFilter
        ? `<a class="chip" href="${esc(filterHref({ [key]: value }))}">${esc(value)}${count}</a>`
        : `<span class="chip">${esc(value)}${count}</span>`;
    }).join('')}</div>`;
  }

  /* ---------- Overview ---------- */

  function viewOverview() {
    const papers = state.data.papers;
    const span = yearSpan(papers);
    const stats = [
      [papers.length.toLocaleString('en'), papers.length === 1 ? 'paper reviewed' : 'papers reviewed'],
      [span, 'publication years'],
      [tally(papers, 'category').length, 'method categories'],
      [tally(papers, 'country').length, 'countries'],
      [tally(papers, 'institution').length, 'institutions'],
    ].filter((s) => s[0]);

    const columns = yearColumns();
    const plate = columns ? `
      <figure class="plate">
        <i class="bracket bracket-tl"></i><i class="bracket bracket-tr"></i><i class="bracket bracket-bl"></i><i class="bracket bracket-br"></i>
        <figcaption class="plate-head">
          <span class="plate-title">Papers per year</span>
          <span class="mono">Plate Nº 01 / n = ${papers.filter((p) => p.year).length}</span>
        </figcaption>
        ${columns}
      </figure>` : '';

    const hero = `
      <div class="hero">
        <div class="container hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Literature review</p>
            <h1 class="display" tabindex="-1">${headline(C.hero.before, C.hero.emphasis, C.hero.after)}</h1>
            <p class="lead">${esc(C.hero.lead)}</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#/papers">Browse the papers ${icon('arrow')}</a>
            </div>
          </div>
          ${plate}
        </div>
      </div>
      <div class="container">
        <div class="stat-strip">
          ${stats.map((s) => `<div class="od-stat stat"><span class="stat-num od-nowrap">${esc(s[0])}</span><span class="stat-label">${esc(s[1])}</span></div>`).join('')}
        </div>
      </div>`;

    const charts = C.overviewCharts.map((key) => figure(key, { limit: 5 })).join('');
    const cited = papers.filter((p) => p.citations !== null).sort(byCitations).slice(0, 5);
    const latest = papers.filter((p) => p.year).sort((a, b) => b.year - a.year || byCitations(a, b)).slice(0, 5);

    const lists = (cited.length || latest.length) ? `
      <div class="lists-grid">
        ${cited.length ? `<div><h3 class="mini-title-head">Most cited</h3>${miniList(cited, citationText)}</div>` : ''}
        ${latest.length ? `<div><h3 class="mini-title-head">Most recent</h3>${miniList(latest, (p) => p.f.type)}</div>` : ''}
      </div>` : '';

    return hero + renderSections([
      {
        meta: 'At a glance',
        title: headline('What the review', 'found', ''),
        intro: 'The most common answers to the main research questions. Select any bar to see the papers behind it.',
        body: charts ? `<div class="fig-grid">${charts}</div>` : '',
      },
      {
        meta: 'Reading list',
        title: headline('Where to', 'start', ''),
        body: lists,
      },
    ]);
  }

  /* ---------- Papers ---------- */

  function viewPapersShell() {
    return `
      ${pageHead('Papers', headline('Every', 'paper', ' in the review'), 'Search the full text of the coded data, or narrow the list with the filters. Values within a filter widen the results, and each extra filter narrows them.')}
      <div class="container papers-layout">
        <aside class="filters${state.filtersOpen ? ' is-open' : ''}" id="filters-panel" aria-label="Filter papers">
          <div class="filters-head"><h2 class="filters-title">Filters</h2></div>
          <div id="facets"></div>
        </aside>
        <div class="papers-main">
          <div class="toolbar">
            <div class="field field-grow">
              <label class="field-label" for="paper-search">Search papers</label>
              <div class="input-wrap">
                <input class="input" id="paper-search" type="search" autocomplete="off" placeholder="Title, author, method, keyword" value="${esc(state.q)}" />
                <button class="input-clear" type="button" id="search-clear" data-action="clear-search" aria-label="Clear search"${state.q ? '' : ' hidden'}>${icon('x')}</button>
              </div>
            </div>
            <div class="field">
              <label class="field-label" for="sort-select">Sort by</label>
              <select class="select" id="sort-select">
                ${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['cited', 'Most cited'], ['title', 'Title A to Z']]
                  .map(([value, text]) => `<option value="${value}"${state.sort === value ? ' selected' : ''}>${text}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-ghost filter-toggle" type="button" id="filter-toggle" data-action="toggle-filters" aria-expanded="${state.filtersOpen}" aria-controls="filters-panel">Filters</button>
          </div>
          <div id="active-filters"></div>
          <h2 class="result-count" id="result-count" aria-live="polite"></h2>
          <div id="results"></div>
        </div>
      </div>`;
  }

  function matchesPapers(paper, tokens, exceptKey) {
    if (tokens.some((token) => !paper.search.includes(token))) return false;
    return Object.keys(state.filters).every((key) => {
      if (key === exceptKey) return true;
      const selected = state.filters[key];
      if (!selected.size) return true;
      return (paper.m[key] || []).some((value) => selected.has(value));
    });
  }

  function searchTokens() {
    return fold(state.q).split(/\s+/).filter(Boolean);
  }

  function sortPapers(list) {
    const copy = list.slice();
    const title = (a, b) => a.f.title.localeCompare(b.f.title);
    if (state.sort === 'newest') copy.sort((a, b) => (b.year || 0) - (a.year || 0) || title(a, b));
    if (state.sort === 'oldest') copy.sort((a, b) => (a.year || 9999) - (b.year || 9999) || title(a, b));
    if (state.sort === 'cited') copy.sort((a, b) => byCitations(a, b) || title(a, b));
    if (state.sort === 'title') copy.sort(title);
    return copy;
  }

  function facetsHtml(tokens) {
    const all = state.data.papers;
    const keys = C.facets.filter((key) => hasData(key));
    return keys.map((key) => {
      const selected = state.filters[key] || new Set();
      const subset = all.filter((p) => matchesPapers(p, tokens, key));
      const items = tally(subset, key);
      selected.forEach((value) => {
        if (!items.some((item) => item.value === value)) items.push({ value, count: 0 });
      });
      if (key === 'year') items.sort((a, b) => Number(b.value) - Number(a.value));
      if (!items.length) return '';

      const expanded = state.facetExpanded.has(key);
      const shown = expanded ? items : items.filter((item, i) => i < 8 || selected.has(item.value));
      const open = state.facetOpen.has(key) || selected.size > 0;

      return `
        <details class="facet" data-facet="${esc(key)}"${open ? ' open' : ''}>
          <summary>${esc(label(key))}${selected.size ? `<span class="facet-active">${selected.size} on</span>` : ''}</summary>
          <div class="facet-body">
            <ul>
              ${shown.map((item) => `
                <li>
                  <label class="check">
                    <input type="checkbox" data-facet-key="${esc(key)}" data-value="${esc(item.value)}" data-fk="${esc(`${key}::${item.value}`)}"${selected.has(item.value) ? ' checked' : ''} />
                    <span class="check-label">${esc(item.value)}</span>
                    <span class="check-count">${item.count}</span>
                  </label>
                </li>`).join('')}
            </ul>
            ${items.length > 8 ? `<button class="text-btn" type="button" data-action="facet-more" data-key="${esc(key)}" data-fk="${esc(`more::${key}`)}">${expanded ? 'Show fewer' : `Show all ${items.length}`}</button>` : ''}
          </div>
        </details>`;
    }).join('');
  }

  function activeFiltersHtml() {
    const chips = [];
    Object.keys(state.filters).forEach((key) => {
      state.filters[key].forEach((value) => {
        chips.push(`<button class="chip chip-active" type="button" data-action="remove-filter" data-key="${esc(key)}" data-value="${esc(value)}" aria-label="Remove filter ${esc(label(key))}: ${esc(value)}">${esc(label(key))}: ${esc(value)} ${icon('x')}</button>`);
      });
    });
    if (!chips.length) return '';
    return `<div class="active-filters">${chips.join('')}<button class="text-btn" type="button" data-action="clear-filters">Clear all</button></div>`;
  }

  function resultRow(p) {
    const venue = p.f.venue || p.f.conference;
    const tags = [
      ...(p.m.category || []),
      p.hasCode ? 'Code' : '',
      p.hasData ? 'Open data' : '',
    ].filter(Boolean);
    return `
      <li class="result">
        <a class="result-link" href="${esc(p.href)}">
          <span class="result-year">${p.year || ''}</span>
          <div class="result-body">
            <h3 class="result-title">${esc(p.f.title)}</h3>
            ${p.f.authors ? `<p class="result-sub od-truncate">${esc(p.m.authors.join('; '))}</p>` : ''}
            ${venue ? `<p class="result-sub od-truncate">${esc(venue)}</p>` : ''}
            ${tags.length ? `<div class="result-tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          ${p.citations === null ? '<span></span>' : `<div class="od-stat result-cites"><span class="result-cites-num od-nowrap">${p.citations.toLocaleString('en')}</span><span class="result-cites-label">${p.citations === 1 ? 'citation' : 'citations'}</span></div>`}
        </a>
      </li>`;
  }

  function updatePapers(focusOptions) {
    const previous = document.activeElement;
    const focusKey = previous && previous.dataset ? previous.dataset.fk : '';
    const fromChip = previous && previous.closest && previous.closest('#active-filters');
    const tokens = searchTokens();

    const results = sortPapers(state.data.papers.filter((p) => matchesPapers(p, tokens)));
    const count = results.length;
    const total = state.data.papers.length;

    document.getElementById('facets').innerHTML = facetsHtml(tokens);
    document.getElementById('active-filters').innerHTML = activeFiltersHtml();
    document.getElementById('search-clear').hidden = !state.q;

    const activeCount = Object.keys(state.filters).reduce((sum, key) => sum + state.filters[key].size, 0);
    document.getElementById('filter-toggle').textContent = activeCount ? `Filters (${activeCount})` : 'Filters';
    document.getElementById('result-count').textContent = count === total
      ? plural(total, 'paper')
      : `${count.toLocaleString('en')} of ${plural(total, 'paper')}`;

    const holder = document.getElementById('results');
    if (!count) {
      holder.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">No papers match.</p>
          <p class="state-text">Remove a filter or change your search to see more results.</p>
          <button class="btn btn-ghost" type="button" data-action="clear-filters">Clear search and filters</button>
        </div>`;
    } else {
      const shown = results.slice(0, state.visible);
      holder.innerHTML = `
        <ol id="result-list">${shown.map(resultRow).join('')}</ol>
        ${count > shown.length ? `<div class="load-more"><button class="btn btn-ghost" type="button" data-action="more-results">Show ${Math.min(PAGE_SIZE, count - shown.length)} more</button></div>` : ''}`;
    }

    const hash = currentPapersHash();
    if (hash !== state.current) {
      state.current = hash;
      setUrl('replaceState', hash);
    }
    state.lastPapers = hash;

    if (focusOptions && focusOptions.afterIndex !== undefined) {
      const links = holder.querySelectorAll('.result-link');
      if (links[focusOptions.afterIndex]) links[focusOptions.afterIndex].focus();
    } else if (focusKey) {
      const target = Array.from(document.querySelectorAll('[data-fk]')).find((el) => el.dataset.fk === focusKey);
      if (target) target.focus();
    } else if (fromChip || (focusOptions && focusOptions.toSearch)) {
      document.getElementById('paper-search').focus();
    }
  }

  function readPapersParams(params, opts) {
    state.q = params.get('q') || '';
    state.sort = params.get('sort') || 'newest';
    state.filters = {};
    Object.keys(C.fields).forEach((key) => {
      const values = params.getAll(key);
      if (values.length) state.filters[key] = new Set(values);
    });
    if (!opts.restore) state.visible = PAGE_SIZE;
  }

  /* ---------- A single paper ---------- */

  function recordRow(key, body) {
    return `<div class="rec-row"><dt>${esc(label(key))}</dt><dd>${body}</dd></div>`;
  }

  const NOT_REPORTED = '<span class="rec-none">Not reported</span>';

  function recordValues(paper, key) {
    const values = paper.m[key] || [];
    if (!state.data.missing.includes(C.fields[key].column) || values.length) {
      return recordRow(key, values.length ? valueChips(key, values) : NOT_REPORTED);
    }
    return '';
  }

  function recordText(paper, key, value) {
    if (state.data.missing.includes(C.fields[key].column)) return '';
    return recordRow(key, value ? esc(value) : NOT_REPORTED);
  }

  function linkList(urls) {
    return urls.map((url) => `
      <a class="ext-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
        <span class="od-truncate">${esc(prettyUrl(url))}</span>${icon('arrow')}
      </a>`).join('');
  }

  function viewPaper(uid) {
    const paper = state.data.papers.find((p) => p.uid === uid);
    if (!paper) {
      return `
        <div class="container state-block">
          <p class="eyebrow">Not found</p>
          <h1 class="state-title" tabindex="-1">This paper isn't in the current data.</h1>
          <p class="state-text">It may have been removed or renamed in the latest update.</p>
          <a class="btn btn-ghost" href="#/papers">Browse all papers</a>
        </div>`;
    }

    state.lastPaperHref = paper.href;

    const citationValue = paper.citations === null ? '' : paper.citations.toLocaleString('en');
    const related = state.data.papers
      .filter((p) => p !== paper && (p.m.category || []).some((c) => paper.m.category.includes(c)))
      .sort(byCitations)
      .slice(0, 4);

    const extras = paper.extras.length ? `
      <div class="record-group">
        <h2 class="record-group-title">Other details</h2>
        <dl>${paper.extras.map((e) => `<div class="rec-row"><dt>${esc(e.name)}</dt><dd>${esc(e.value)}</dd></div>`).join('')}</dl>
      </div>` : '';

    const hasLinks = paper.codeUrls.length || paper.dataUrls.length;

    return `
      <article class="container record">
        <a class="text-link back-link" href="${esc(state.lastPapers)}" data-restore>${icon('back')} Back to papers</a>
        <p class="eyebrow">${esc([paper.f.type, paper.year].filter(Boolean).join(' / ') || 'Paper')}</p>
        <h1 class="record-title" tabindex="-1">${esc(paper.f.title)}</h1>
        ${paper.m.authors.length ? `<p class="record-authors">${esc(paper.m.authors.join('; '))}</p>` : ''}
        ${paper.doiUrl || paper.sourceUrl ? `
          <div class="record-actions">
            ${paper.doiUrl ? `<a class="btn btn-primary" href="${esc(paper.doiUrl)}" target="_blank" rel="noopener noreferrer">Open via DOI ${icon('arrow')}</a>` : ''}
            ${paper.sourceUrl ? `<a class="btn btn-ghost" href="${esc(paper.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source page ${icon('arrow')}</a>` : ''}
          </div>` : ''}

        <div class="record-grid">
          <div>
            ${paper.f.abstract ? `<div class="record-group"><h2 class="record-group-title">Abstract</h2><p class="abstract">${esc(paper.f.abstract)}</p></div>` : ''}
            <div class="record-group">
              <h2 class="record-group-title">Coded findings</h2>
              <dl>
                ${recordText(paper, 'purposeText', paper.f.purposeText)}
                ${recordValues(paper, 'purpose')}
                ${recordValues(paper, 'methods')}
                ${recordValues(paper, 'category')}
                ${recordValues(paper, 'category2')}
                ${recordValues(paper, 'tasks')}
                ${recordValues(paper, 'oodRange')}
                ${recordValues(paper, 'compares')}
                ${recordValues(paper, 'covariate')}
                ${recordValues(paper, 'semantic')}
                ${recordValues(paper, 'metrics')}
                ${recordValues(paper, 'applications')}
              </dl>
            </div>
            ${extras}
          </div>

          <div class="side-rec">
            <div class="record-group">
              <h2 class="record-group-title">Publication</h2>
              <dl>
                ${recordValues(paper, 'venue')}
                ${recordText(paper, 'conference', paper.f.conference)}
                ${recordText(paper, 'citations', citationValue)}
                ${recordText(paper, 'references', paper.f.references)}
                ${recordText(paper, 'doi', paper.doi)}
                ${recordValues(paper, 'country')}
                ${recordValues(paper, 'institution')}
                ${recordValues(paper, 'keywords')}
              </dl>
            </div>
            <div class="record-group">
              <h2 class="record-group-title">Open science</h2>
              <dl>
                ${recordValues(paper, 'code')}
                ${paper.codeUrls.length ? recordRow('codeLink', linkList(paper.codeUrls)) : ''}
                ${recordValues(paper, 'datasetsOpen')}
                ${paper.dataUrls.length ? recordRow('datasetLink', linkList(paper.dataUrls)) : ''}
              </dl>
              ${hasLinks ? '' : '<p class="rec-none">No code or dataset links are recorded for this paper.</p>'}
            </div>
            ${related.length ? `<div class="record-group"><h2 class="record-group-title">In the same category</h2>${miniList(related, citationText)}</div>` : ''}
          </div>
        </div>
      </article>`;
  }

  /* ---------- Methods ---------- */

  function crosstabHtml(dim) {
    const papers = state.data.papers;
    const rows = tally(papers, 'category');
    const cols = tally(papers, dim).slice(0, 8);
    if (!rows.length || !cols.length) {
      return '<p class="state-text">There are no values to compare for this choice.</p>';
    }
    const count = (row, col) => papers.filter((p) => p.m.category.includes(row) && p.m[dim].includes(col)).length;
    const cells = rows.map((row) => cols.map((col) => count(row.value, col.value)));
    const max = Math.max(1, ...cells.flat());

    return `
      <div class="table-scroll" role="region" aria-label="Method categories compared with ${esc(label(dim))}" tabindex="0">
        <table class="crosstab">
          <thead>
            <tr><th scope="col">Method category</th>${cols.map((col) => `<th scope="col">${esc(col.value)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((row, r) => `
              <tr>
                <th scope="row">${esc(row.value)}</th>
                ${cols.map((col, c) => {
                  const n = cells[r][c];
                  if (!n) return '<td><span class="cell cell-0">0</span></td>';
                  const level = Math.max(1, Math.ceil((n / max) * 5));
                  return `<td><a class="cell cell-${level}" href="${esc(filterHref({ category: row.value, [dim]: col.value }))}" aria-label="${esc(row.value)} and ${esc(col.value)}: ${esc(plural(n, 'paper'))}">${n}</a></td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="crosstab-note">Darker cells hold more papers. Select a number to see them.${tally(papers, dim).length > cols.length ? ' Only the eight most common values are shown.' : ''}</p>`;
  }

  function methodBlock(item, index) {
    const members = state.data.papers.filter((p) => p.m.category.includes(item.value));
    const profile = C.methodProfile.map((key) => {
      const values = tally(members, key).slice(0, 5);
      return values.length
        ? `<div class="profile-row"><dt>${esc(label(key))}</dt><dd>${valueChips(key, values, true)}</dd></div>`
        : '';
    }).join('');
    const named = tally(members, 'methods').slice(0, 10);
    const span = yearSpan(members);
    const listed = members.slice().sort(byCitations).slice(0, 6);

    return `
      <details class="method-block"${index === 0 ? ' open' : ''}>
        <summary class="method-summary">
          <span class="method-no">${String(index + 1).padStart(2, '0')}</span>
          <span class="method-name">${esc(item.value)}</span>
          <span class="method-meta">${esc(plural(item.count, 'paper'))}${span ? ` / ${esc(span)}` : ''} / <span class="method-toggle"></span></span>
        </summary>
        <div class="method-body">
          <dl>${profile}</dl>
          <div>
            ${named.length ? `<h3 class="method-sub">Methods named</h3>${valueChips('methods', named, true)}` : ''}
            <h3 class="method-sub">Papers</h3>
            ${miniList(listed, citationText)}
            <p class="fig-more"><a class="text-link" href="${esc(filterHref({ category: item.value }))}">See all ${esc(plural(item.count, 'paper'))} ${icon('arrow')}</a></p>
          </div>
        </div>
      </details>`;
  }

  function viewMethods() {
    const papers = state.data.papers;
    const categories = tally(papers, 'category');
    const dims = C.crosstabDimensions.filter((key) => hasData(key));
    if (!dims.includes(state.dim)) state.dim = dims.includes('secondDimension') ? 'secondDimension' : (dims[0] || null);

    const crosstab = categories.length && state.dim ? `
      <div class="field crosstab-controls">
        <label class="field-label" for="dim-select">Compare categories by</label>
        <select class="select" id="dim-select">
          ${dims.map((key) => `<option value="${esc(key)}"${key === state.dim ? ' selected' : ''}>${esc(label(key))}</option>`).join('')}
        </select>
      </div>
      <div id="crosstab">${crosstabHtml(state.dim)}</div>` : '';

    const head = pageHead('Methods', headline('How the', 'methods', ' compare'), categories.length
      ? `${esc(plural(categories.length, 'method category', 'method categories'))} across ${esc(plural(papers.length, 'paper'))}, grouped as coded in the review.`
      : '');

    return head + renderSections([
      {
        meta: 'Landscape',
        title: headline('The', 'landscape', ' at a glance'),
        intro: 'See how each method category lines up against OOD settings, applications, metrics and more.',
        body: crosstab,
      },
    ]);
  }

  /* ---------- Routing and rendering ---------- */

  const TITLES = {
    overview: 'Overview',
    papers: 'Papers',
    methods: 'Methods',
  };

  function viewNotFound() {
    return `
      <div class="container state-block">
        <p class="eyebrow">Not found</p>
        <h1 class="state-title" tabindex="-1">This page doesn't exist.</h1>
        <p class="state-text">The link may be out of date. Everything on the site starts from the overview.</p>
        <a class="btn btn-ghost" href="#/overview">Go to the overview</a>
      </div>`;
  }

  function renderRoute(options) {
    const opts = options || {};
    if (!state.data) return;

    const { path, params } = parseHash(state.current);
    const segments = path.split('/').filter(Boolean);
    const view = segments[0] || 'overview';
    state.figNo = 0;

    if (view === 'papers') {
      readPapersParams(params, opts);
      app.innerHTML = viewPapersShell();
      updatePapers();
    } else if (view === 'paper') {
      let uid = segments.slice(1).join('/');
      try { uid = decodeURIComponent(uid); } catch (err) { /* keep the raw value */ }
      app.innerHTML = viewPaper(uid);
    } else if (view === 'overview') {
      app.innerHTML = viewOverview();
    } else if (view === 'methods') {
      app.innerHTML = viewMethods();
    } else {
      app.innerHTML = viewNotFound();
    }

    document.querySelectorAll('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === view || (view === 'paper' && link.dataset.nav === 'papers');
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    const section = view === 'paper' ? 'Paper' : TITLES[view];
    document.title = section ? `${C.siteTitle} — ${section}` : C.siteTitle;

    window.scrollTo(0, opts.restore ? (state.scroll[routeKey(state.current)] || 0) : 0);

    if (!opts.initial) {
      const previousPaper = opts.restore && view === 'papers' && state.lastPaperHref
        ? Array.from(app.querySelectorAll('.result-link')).find((a) => a.getAttribute('href') === state.lastPaperHref)
        : null;
      const target = previousPaper || app.querySelector('h1');
      if (target) target.focus({ preventScroll: true });
    }
  }

  function renderChrome() {
    const data = state.data;
    document.getElementById('brand-name').textContent = C.siteTitle;
    document.getElementById('strip-volume').textContent = C.volume;
    document.getElementById('strip-filed').textContent = C.filedUnder;
    document.getElementById('rail-left').textContent = C.siteTitle;
    document.getElementById('footer-word').textContent = C.footerWord;
    document.getElementById('footer-review').textContent = 'A literature review';

    const status = document.getElementById('strip-status');
    const notice = document.getElementById('notice');
    if (!data) {
      notice.innerHTML = '';
      return;
    }

    const span = yearSpan(data.papers);
    document.getElementById('rail-right').textContent = span ? `Papers ${span}` : 'Literature review';
    status.textContent = data.updated
      ? `${plural(data.papers.length, 'paper')} / updated ${data.updated}`
      : plural(data.papers.length, 'paper');

    if (data.isSample) {
      notice.innerHTML = `
        <div class="notice" role="note">
          <div class="container notice-inner">
            <span class="notice-label">Sample data</span>
            <p class="notice-text">These records are placeholders, not findings from the review. Replace <code>${esc(C.dataFile)}</code> with your CSV and this notice disappears.</p>
            <label class="btn btn-ghost btn-small file-pick">Preview my CSV<input type="file" accept=".csv,.tsv,text/csv" data-csv-picker aria-label="Preview my CSV" /></label>
          </div>
        </div>`;
    } else if (data.isLocalPreview) {
      notice.innerHTML = `
        <div class="notice" role="note">
          <div class="container notice-inner">
            <span class="notice-label">Preview</span>
            <p class="notice-text">Showing <code>${esc(data.source)}</code> from your computer. Nothing was uploaded, and this view ends when you reload. To publish it, replace <code>${esc(C.dataFile)}</code>.</p>
            <label class="btn btn-ghost btn-small file-pick">Choose another file<input type="file" accept=".csv,.tsv,text/csv" data-csv-picker aria-label="Choose another CSV file" /></label>
          </div>
        </div>`;
    } else {
      notice.innerHTML = '';
    }
  }

  function showLoadError(title, message) {
    state.data = null;
    renderChrome();
    document.getElementById('strip-status').textContent = 'Data unavailable';
    app.innerHTML = `
      <div class="container state-block" role="alert">
        <p class="eyebrow">Data problem</p>
        <h1 class="state-title" tabindex="-1">${esc(title)}</h1>
        <p class="state-text">${esc(message)}</p>
        <div class="state-actions">
          <button class="btn btn-ghost" type="button" data-action="retry">Try again</button>
          <label class="btn btn-ghost file-pick">Open a CSV from my computer<input type="file" accept=".csv,.tsv,text/csv" data-csv-picker aria-label="Open a CSV from my computer" /></label>
        </div>
      </div>`;
  }

  function useDataset(dataset) {
    state.data = dataset;
    state.dim = null;
    renderChrome();
    renderRoute({ initial: true });
  }

  function loadFile(file) {
    file.arrayBuffer()
      .then((buffer) => {
        const dataset = buildDataset(decodeBytes(buffer), file.name);
        dataset.isLocalPreview = true;
        useDataset(dataset);
        window.scrollTo(0, 0);
      })
      .catch((err) => showLoadError(`${file.name} couldn't be read.`, err.message));
  }

  function isHostedPage() {
    return /^https?:$/.test(location.protocol) && location.origin !== 'null';
  }

  function loadFromServer() {
    fetch(C.dataFile, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) {
          const err = new Error(`The server answered ${response.status} for ${C.dataFile}. Check that the file is in the repository at exactly that path, including capital letters.`);
          err.isServerAnswer = true;
          throw err;
        }
        const modified = response.headers.get('last-modified');
        return response.arrayBuffer().then((buffer) => ({ buffer, modified }));
      })
      .then(({ buffer, modified }) => {
        const dataset = buildDataset(decodeBytes(buffer), C.dataFile);
        if (modified && !Number.isNaN(Date.parse(modified))) {
          dataset.updated = new Date(modified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        useDataset(dataset);
      })
      .catch((err) => {
        // Pages opened directly from disk can't read neighbouring files, so show the sample there.
        // A published site never falls back to sample data.
        if (!isHostedPage() && window.SAMPLE_CSV) {
          useDataset(buildDataset(window.SAMPLE_CSV, 'the built-in sample'));
          return;
        }
        showLoadError('The review data could not be loaded.', err.isServerAnswer || err.name !== 'TypeError'
          ? err.message
          : `The browser couldn't reach ${C.dataFile}. Check your connection and try again.`);
      });
  }

  /* ---------- Events ---------- */

  const actions = {
    skip(el, event) {
      event.preventDefault();
      main.focus();
    },
    retry() {
      loadFromServer();
    },
    'toggle-filters'(el) {
      state.filtersOpen = !state.filtersOpen;
      el.setAttribute('aria-expanded', String(state.filtersOpen));
      document.getElementById('filters-panel').classList.toggle('is-open', state.filtersOpen);
    },
    'facet-more'(el) {
      const key = el.dataset.key;
      if (state.facetExpanded.has(key)) state.facetExpanded.delete(key);
      else state.facetExpanded.add(key);
      updatePapers();
    },
    'remove-filter'(el) {
      const set = state.filters[el.dataset.key];
      if (set) {
        set.delete(el.dataset.value);
        if (!set.size) delete state.filters[el.dataset.key];
      }
      state.visible = PAGE_SIZE;
      updatePapers();
    },
    'clear-filters'() {
      state.filters = {};
      state.q = '';
      state.visible = PAGE_SIZE;
      document.getElementById('paper-search').value = '';
      updatePapers({ toSearch: true });
    },
    'clear-search'() {
      state.q = '';
      state.visible = PAGE_SIZE;
      document.getElementById('paper-search').value = '';
      updatePapers({ toSearch: true });
    },
    'more-results'() {
      const first = state.visible;
      state.visible += PAGE_SIZE;
      updatePapers({ afterIndex: first });
    },
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#/"]');
    if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      navigate(link.getAttribute('href'), { restore: link.hasAttribute('data-restore') });
      return;
    }
    const trigger = event.target.closest('[data-action]');
    if (trigger && actions[trigger.dataset.action]) {
      actions[trigger.dataset.action](trigger, event);
    }
  });

  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.matches('[data-facet-key]')) {
      const key = el.dataset.facetKey;
      const set = state.filters[key] || (state.filters[key] = new Set());
      if (el.checked) set.add(el.dataset.value);
      else set.delete(el.dataset.value);
      if (!set.size) delete state.filters[key];
      state.visible = PAGE_SIZE;
      updatePapers();
    } else if (el.id === 'sort-select') {
      state.sort = el.value;
      state.visible = PAGE_SIZE;
      updatePapers();
    } else if (el.id === 'dim-select') {
      state.dim = el.value;
      document.getElementById('crosstab').innerHTML = crosstabHtml(state.dim);
    } else if (el.matches('[data-csv-picker]') && el.files && el.files[0]) {
      loadFile(el.files[0]);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id !== 'paper-search') return;
    const value = event.target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.q = value.trim();
      state.visible = PAGE_SIZE;
      updatePapers();
    }, 150);
  });

  // "toggle" doesn't bubble, so listen during capture to remember which filter groups are open.
  document.addEventListener('toggle', (event) => {
    const key = event.target && event.target.dataset ? event.target.dataset.facet : null;
    if (!key) return;
    if (event.target.open) state.facetOpen.add(key);
    else state.facetOpen.delete(key);
  }, true);

  window.addEventListener('popstate', onExternalNavigation);
  window.addEventListener('hashchange', onExternalNavigation);

  /* ---------- Start ---------- */

  state.current = location.hash || '#/overview';
  renderChrome();
  loadFromServer();
}());
