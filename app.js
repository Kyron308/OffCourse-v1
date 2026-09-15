const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const store = {
  key: 'offcourse:v1',
  data: {
    profile: { name: '', partner: '', home: null },
    seeds: [],
    adventures: [],
    activeAdventure: null,
    settings: { units: 'km', haptics: true }
  },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch (e) { console.warn(e); }
  },
  save() { localStorage.setItem(this.key, JSON.stringify(this.data)); },
  reset() { localStorage.removeItem(this.key); location.reload(); }
};
store.load();

const vibes = {
  adventure: { icon: '🥾', label: 'Adventure', prompt: 'Choose the less obvious way.', tasks: ['Find a track you have never taken', 'Get somewhere with a view', 'Take one photo that proves you went off-course'] },
  coast: { icon: '🌊', label: 'Coast', prompt: 'Keep water somewhere in the plan.', tasks: ['Find a shoreline access point', 'Walk until the car disappears from view', 'Stop somewhere you would normally drive past'] },
  weird: { icon: '🛸', label: 'Weird', prompt: 'Pick places that make you ask “why is that here?”', tasks: ['Find the strangest nearby landmark', 'Order or try something you normally would not', 'Collect one ridiculous photo'] },
  romantic: { icon: '♥', label: 'Romantic', prompt: 'Make the day feel different from a normal date.', tasks: ['Go somewhere neither of you has taken the other', 'Buy one small thing to share', 'Stay long enough to watch the light change'] },
  wild: { icon: '🎲', label: 'Wildcard', prompt: 'Let chance make at least one decision.', tasks: ['Flip a coin at the next real choice', 'Take the second-best-looking road', 'Do one thing without checking reviews first'] },
  chill: { icon: '☁', label: 'Chill', prompt: 'Low effort, high atmosphere.', tasks: ['Find somewhere quiet', 'Get something good to eat or drink', 'Sit somewhere for 20 minutes with no plan'] }
};

const missionBank = [
  { title: 'The road you always ignore', clue: 'Pick a road or turn-off you have passed before but never taken. Follow it until it becomes interesting.', tags: ['wild','adventure'] },
  { title: 'End of the line', clue: 'Choose one direction and keep going until the road, track or shoreline gives you a reason to stop.', tags: ['adventure','coast'] },
  { title: 'No reviews allowed', clue: 'Find food, coffee or a lookout without reading a single review first.', tags: ['weird','romantic','chill'] },
  { title: 'Tiny town rule', clue: 'Head toward the smallest place on the map within your range. Your next decision happens there.', tags: ['wild','weird'] },
  { title: 'Water magnet', clue: 'Navigate generally toward the nearest coast, river, lake or reservoir you have not visited together.', tags: ['coast','romantic','chill'] },
  { title: 'The wrong turn', clue: 'At a safe intersection, let a coin choose left or right. Repeat once. Then find something worth stopping for.', tags: ['wild','adventure','weird'] },
  { title: 'Golden-hour mission', clue: 'Build the whole trip around being somewhere open and beautiful near sunset.', tags: ['romantic','coast','chill'] },
  { title: 'Question mark', clue: 'Open your saved Adventure Seeds and choose the one that has the biggest unanswered question.', tags: ['adventure','wild'] }
];

const app = {
  route: 'home',
  deferredPrompt: null,
  tempPhotoBlob: null,
  tempPhotoUrl: null,
  map: null,
  markers: [],

  init() {
    this.bindGlobal();
    this.render();
    this.registerSW();
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;
      $('#installBtn').hidden = false;
    });
  },

  bindGlobal() {
    document.addEventListener('click', e => {
      const routeEl = e.target.closest('[data-route]');
      if (routeEl) { this.go(routeEl.dataset.route); return; }
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) this.action(actionEl.dataset.action, actionEl);
    });
    $('#installBtn').addEventListener('click', async () => {
      if (!this.deferredPrompt) return;
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      $('#installBtn').hidden = true;
    });
    $('#photoPicker').addEventListener('change', e => this.handlePhoto(e.target.files?.[0]));
    $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) this.closeSheet(); });
  },

  go(route) {
    this.route = route;
    this.closeSheet();
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  render() {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === this.route));
    const view = $('#view');
    const routes = { home: this.homeView, seeds: this.seedsView, world: this.worldView, history: this.historyView, settings: this.settingsView, disappear: this.disappearView, active: this.activeView };
    view.innerHTML = (routes[this.route] || this.homeView).call(this);
    if (this.route === 'world') setTimeout(() => this.initMap(), 0);
    if (this.route === 'seeds' || this.route === 'world') setTimeout(() => this.hydrateThumbs(), 0);
  },

  homeView() {
    const count = store.data.seeds.length;
    const done = store.data.adventures.length;
    const active = store.data.activeAdventure;
    return `
      <section class="hero">
        <div class="eyebrow">Get a little lost</div>
        <h1>Don't plan it.<br><em>Go find it.</em></h1>
        <p class="lede">Turn spare time into a mystery adventure, then remember the places you still want to come back to.</p>
      </section>

      ${active ? `<div class="card highlight clickable adventure-card" data-action="resumeAdventure">
        <div class="eyebrow">Adventure in progress</div>
        <h2>${esc(active.title)}</h2>
        <p>${esc(active.subtitle)}</p>
        <div class="progress"><span style="width:${Math.round((active.step / active.steps.length) * 100)}%"></span></div>
        <p class="note" style="margin:10px 0 0">Tap to continue →</p>
      </div>` : ''}

      <div class="grid two section">
        <article class="card clickable big-action highlight" data-action="startDisappear">
          <div class="icon">🧭</div>
          <div><strong>Disappear</strong><p>Give it your time, budget and vibe. See only the next clue.</p></div>
        </article>
        <article class="card clickable big-action" data-action="surpriseMe">
          <div class="icon">🎲</div>
          <div><strong>Surprise me</strong><p>Skip the setup and get an instant wildcard mission.</p></div>
        </article>
      </div>

      <div class="stat-row">
        <div class="stat"><b>${count}</b><small>Adventure seeds</small></div>
        <div class="stat"><b>${done}</b><small>Adventures</small></div>
        <div class="stat"><b>${count ? Math.min(count, 7) : 0}</b><small>Worth revisiting</small></div>
      </div>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">Unfinished curiosity</div><h2>Adventure Seeds</h2></div><button class="pill" data-action="newSeed">＋ Add</button></div>
        ${this.seedList(store.data.seeds.slice(0,3), true)}
      </section>
    `;
  },

  disappearView() {
    return `
      <section class="hero"><div class="eyebrow">Mystery mode</div><h1>How far off-course?</h1><p class="lede">You set the boundaries. Offcourse decides what happens inside them.</p></section>
      <form id="disappearForm" class="card" onsubmit="return false;">
        <div class="field"><label>How much time?</label><div class="pill-row" data-group="time">
          ${this.choicePills('time', [['2','2 hours'],['4','Half day'],['8','Full day'],['24','Overnight']], '4')}
        </div></div>
        <div class="field"><label>Maximum spend</label><div class="pill-row" data-group="budget">
          ${this.choicePills('budget', [['0','$0'],['50','$50'],['100','$100'],['250','$250+']], '100')}
        </div></div>
        <div class="field"><label>How far can you roam?</label><div class="pill-row" data-group="range">
          ${this.choicePills('range', [['10','10 km'],['40','40 km'],['100','100 km'],['250','Anywhere']], '40')}
        </div></div>
        <div class="field"><label>Today's vibe</label><div class="pill-row" data-group="vibe">
          ${Object.entries(vibes).map(([k,v], i) => `<button type="button" class="pill ${i===0?'active':''}" data-choice-group="vibe" data-value="${k}">${v.icon} ${v.label}</button>`).join('')}
        </div></div>
        <button class="btn wide" data-action="generateAdventure">Build my mystery adventure</button>
        <p class="note" style="margin:12px 3px 0">Offcourse can use your saved places and location if you choose to share it.</p>
      </form>
    `;
  },

  activeView() {
    const a = store.data.activeAdventure;
    if (!a) { setTimeout(() => this.go('home'), 0); return ''; }
    const current = a.steps[a.step - 1];
    const progress = Math.round((a.step / a.steps.length) * 100);
    return `
      <section class="hero"><div class="eyebrow">Adventure ${String(a.number).padStart(3,'0')}</div><h1>${esc(a.title)}</h1><p class="lede">${esc(a.subtitle)}</p></section>
      <div class="card adventure-card">
        <div class="section-head"><div><div class="eyebrow">Current clue</div><h2>${esc(current.heading)}</h2></div><b>${progress}%</b></div>
        <p style="font-size:20px;line-height:1.45">${esc(current.text)}</p>
        ${current.tip ? `<p class="note">${esc(current.tip)}</p>` : ''}
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
      ${current.choices ? `<section class="section"><div class="eyebrow">Choose what happens next</div><div class="choice-grid">${current.choices.map(c => `<button class="choice" data-action="advanceAdventure" data-choice="${escAttr(c)}">${esc(c)}</button>`).join('')}</div></section>` : `
      <div class="section"><button class="btn wide" data-action="advanceAdventure">I've done this — reveal next clue</button></div>`}
      <button class="btn ghost wide section" data-action="finishAdventure">Finish adventure here</button>
    `;
  },

  seedsView() {
    return `
      <section class="hero"><div class="eyebrow">Unfinished curiosity</div><h1>Adventure Seeds</h1><p class="lede">Save the places, questions and “we should come back here” moments before they disappear into your camera roll.</p></section>
      <div class="pill-row" style="margin-bottom:16px"><button class="chip active">All</button><button class="chip">🌊 Coast</button><button class="chip">🥾 Explore</button><button class="chip">♥ Together</button><button class="chip">❓ Question</button></div>
      ${this.seedList(store.data.seeds)}
      <button class="fab" data-action="newSeed" aria-label="Add seed">＋</button>
    `;
  },

  worldView() {
    const geo = store.data.seeds.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    return `
      <section class="hero"><div class="eyebrow">Your world</div><h1>A map of what matters.</h1><p class="lede">Not ratings. Not tourist lists. Just places that mean something to you or still have a question attached.</p></section>
      <div id="map" class="map"></div>
      <section class="section"><div class="section-head"><div><h2>${geo.length} pinned places</h2><p>Seeds with a saved location.</p></div></div>${this.seedList(geo.slice(0,6))}</section>
    `;
  },

  historyView() {
    const arr = [...store.data.adventures].sort((a,b)=>b.completedAt-a.completedAt);
    return `
      <section class="hero"><div class="eyebrow">The good kind of history</div><h1>Where you went.</h1><p class="lede">A timeline of days that actually turned into something.</p></section>
      ${arr.length ? `<div class="list">${arr.map(a=>`<div class="item"><div class="thumb">${vibes[a.vibe]?.icon || '🧭'}</div><div><h3>${esc(a.title)}</h3><p>${fmtDate(a.completedAt)} · ${esc(a.subtitle || '')}</p></div><span class="go">›</span></div>`).join('')}</div>` : this.empty('🧭','No completed adventures yet','Your finished Disappear missions will collect here.')}
    `;
  },

  settingsView() {
    return `
      <section class="hero"><div class="eyebrow">Offcourse</div><h1>Keep it yours.</h1><p class="lede">Your current build stores its data on this device. Export a backup whenever you like.</p></section>
      <div class="card">
        <div class="field"><label>Your name</label><input class="input" id="profileName" value="${escAttr(store.data.profile.name || '')}" placeholder="Optional"></div>
        <div class="field"><label>Partner's name</label><input class="input" id="partnerName" value="${escAttr(store.data.profile.partner || '')}" placeholder="Optional"></div>
        <button class="btn wide" data-action="saveProfile">Save</button>
      </div>
      <section class="section grid">
        <button class="btn secondary wide" data-action="exportData">Export backup</button>
        <button class="btn secondary wide" data-action="importData">Import backup</button>
        <button class="btn secondary wide" data-action="installHelp">Install on iPhone</button>
        <button class="btn danger wide" data-action="resetData">Reset all local data</button>
      </section>
      <input id="importPicker" type="file" accept="application/json" hidden>
      <p class="note section">V1 is local-first and works offline after it has loaded once. Cross-device couple sync can be added later with Supabase without changing the core app.</p>
    `;
  },

  choicePills(group, choices, selected) {
    return choices.map(([v,l]) => `<button type="button" class="pill ${v===selected?'active':''}" data-choice-group="${group}" data-value="${v}">${l}</button>`).join('');
  },

  seedList(seeds, compact = false) {
    if (!seeds.length) return this.empty('✦','Nothing saved yet','Next time you think “we should come back here”, save it as a seed.');
    return `<div class="list">${seeds.map(s=>`<div class="item clickable" data-action="viewSeed" data-id="${s.id}">
      <div class="thumb" data-photo-id="${s.photoId || ''}">${s.photoId ? '' : iconForSeed(s.category)}</div>
      <div><h3>${esc(s.title)}</h3><p>${esc(s.note || labelForCategory(s.category))}${s.lat ? ' · location saved' : ''}</p></div>
      <span class="go">›</span>
    </div>`).join('')}</div>${compact && store.data.seeds.length>3?`<button class="btn ghost wide" style="margin-top:10px" data-route="seeds">See all ${store.data.seeds.length}</button>`:''}`;
  },

  empty(icon, title, text) { return `<div class="empty"><span class="emoji">${icon}</span><strong>${title}</strong><p>${text}</p></div>`; },

  async action(name, el) {
    const handlers = {
      startDisappear: () => this.go('disappear'),
      surpriseMe: () => this.makeInstantAdventure(),
      resumeAdventure: () => this.go('active'),
      newSeed: () => this.openSeedSheet(),
      saveSeed: () => this.saveSeed(),
      viewSeed: () => this.openSeedDetail(el.dataset.id),
      deleteSeed: () => this.deleteSeed(el.dataset.id),
      useCurrentLocation: () => this.useCurrentLocation(),
      pickPhoto: () => $('#photoPicker').click(),
      generateAdventure: () => this.generateAdventure(),
      advanceAdventure: () => this.advanceAdventure(el.dataset.choice),
      finishAdventure: () => this.finishAdventure(),
      saveProfile: () => this.saveProfile(),
      exportData: () => this.exportData(),
      importData: () => this.importData(),
      installHelp: () => this.installHelp(),
      resetData: () => this.resetData(),
      closeSheet: () => this.closeSheet(),
      openInMaps: () => this.openInMaps(el.dataset.lat, el.dataset.lng)
    };
    if (handlers[name]) await handlers[name]();
  },

  selected(group) { return $(`[data-choice-group="${group}"].active`)?.dataset.value; },

  generateAdventure() {
    const config = { time:+this.selected('time'), budget:+this.selected('budget'), range:+this.selected('range'), vibe:this.selected('vibe') || 'adventure' };
    const candidates = store.data.seeds.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    const chosenSeed = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : null;
    const missionChoices = missionBank.filter(m => m.tags.includes(config.vibe));
    const mission = (missionChoices.length? missionChoices:missionBank)[Math.floor(Math.random()*(missionChoices.length||missionBank.length))];
    const v = vibes[config.vibe];
    const num = store.data.adventures.length + 1;
    const steps = [
      { heading:'Before you leave', text:`You have ${config.time >= 8 ? 'the day' : `${config.time} hours`}, about $${config.budget || 0} to spend and up to ${config.range} km to roam. ${v.prompt}`, tip:'Bring water, charge your phone, and take anything the weather obviously demands.' },
      chosenSeed ? { heading:'First destination', text:`Start with one of your own unfinished places: “${chosenSeed.title}”. Head that way, but stop early if something better steals your attention.`, choices:['Follow the seed','Take a detour','Let chance decide'] } : { heading:'First move', text:mission.clue, choices:['Follow it','Take a detour','Let chance decide'] },
      { heading:'Lose the itinerary', text:v.tasks[0], tip:'The point is not to optimise the route. Notice what you normally pass.' },
      { heading:'Do one thing properly', text:v.tasks[1], choices:['Keep exploring','Find food','Slow down'] },
      { heading:'Leave a breadcrumb', text:v.tasks[2], tip:'If somewhere gives you a “come back here” feeling, save it as an Adventure Seed.' }
    ];
    store.data.activeAdventure = { id:uid(), number:num, title:mission.title, subtitle:`${v.icon} ${v.label} · ${config.time}h · ${config.range} km max`, vibe:config.vibe, config, step:1, steps, startedAt:Date.now() };
    store.save(); this.go('active');
  },

  makeInstantAdventure() {
    const vibeKeys = Object.keys(vibes); const vibe = vibeKeys[Math.floor(Math.random()*vibeKeys.length)];
    const mission = missionBank[Math.floor(Math.random()*missionBank.length)];
    const v = vibes[vibe]; const num = store.data.adventures.length+1;
    store.data.activeAdventure = { id:uid(), number:num, title:mission.title, subtitle:`${v.icon} Instant wildcard`, vibe, config:{time:3,budget:50,range:40,vibe}, step:1, startedAt:Date.now(), steps:[
      { heading:'Leave now', text:mission.clue, tip:'You are allowed to abandon this clue for something more interesting.' },
      { heading:'Second move', text:v.tasks[0], choices:['Go further','Find food','Change direction'] },
      { heading:'Final rule', text:v.tasks[2], tip:'Save any place you want to return to as an Adventure Seed.' }
    ]}; store.save(); this.go('active');
  },

  advanceAdventure(choice) {
    const a = store.data.activeAdventure; if (!a) return;
    if (choice) a.lastChoice = choice;
    if (a.step < a.steps.length) { a.step++; store.save(); this.haptic(); this.render(); }
    else this.finishAdventure();
  },

  finishAdventure() {
    const a = store.data.activeAdventure; if (!a) return;
    a.completedAt = Date.now();
    store.data.adventures.push(a); store.data.activeAdventure = null; store.save();
    this.toast('Adventure saved'); this.go('history');
  },

  openSeedSheet(seed = null) {
    this.tempPhotoBlob = null; this.tempPhotoUrl = null;
    this.openSheet(`
      <div class="sheet-head"><div><div class="eyebrow">Adventure Seed</div><h2>${seed?'Edit':'Save the thought'}</h2></div><button class="close" data-action="closeSheet">×</button></div>
      <div id="photoSlot">${seed?.photoId ? `<div class="photo-preview" data-full-photo-id="${seed.photoId}"></div>`:''}</div>
      <div class="row" style="margin-bottom:16px"><button class="btn secondary" data-action="pickPhoto">📸 Photo</button><button class="btn secondary" data-action="useCurrentLocation">⌖ Location</button></div>
      <input type="hidden" id="seedId" value="${seed?.id||''}"><input type="hidden" id="seedLat" value="${seed?.lat??''}"><input type="hidden" id="seedLng" value="${seed?.lng??''}">
      <div class="field"><label>What is it?</label><input class="input" id="seedTitle" value="${escAttr(seed?.title||'')}" placeholder="That beach past the dirt track"></div>
      <div class="field"><label>Why save it?</label><textarea id="seedNote" placeholder="Come back at low tide / see where that road goes / camp here someday">${esc(seed?.note||'')}</textarea></div>
      <div class="field"><label>Type</label><select id="seedCategory"><option value="explore">🥾 Explore</option><option value="coast">🌊 Coast</option><option value="together">♥ Together</option><option value="question">❓ Question</option><option value="food">◉ Food</option><option value="camp">⛺ Camp</option></select></div>
      <div id="locationStatus" class="note">${seed?.lat ? `Location saved: ${seed.lat.toFixed(4)}, ${seed.lng.toFixed(4)}`:'No location saved yet.'}</div>
      <button class="btn wide" style="margin-top:18px" data-action="saveSeed">Save seed</button>
    `);
    if (seed) $('#seedCategory').value = seed.category || 'explore';
    setTimeout(() => this.hydrateFullPhotos(), 0);
  },

  async handlePhoto(file) {
    if (!file) return;
    this.tempPhotoBlob = file;
    if (this.tempPhotoUrl) URL.revokeObjectURL(this.tempPhotoUrl);
    this.tempPhotoUrl = URL.createObjectURL(file);
    const slot = $('#photoSlot'); if (slot) slot.innerHTML = `<img class="photo-preview" src="${this.tempPhotoUrl}" alt="Selected photo">`;
  },

  useCurrentLocation() {
    if (!navigator.geolocation) return this.toast('Location is not available on this device');
    const status = $('#locationStatus'); if (status) status.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(pos => {
      $('#seedLat').value = pos.coords.latitude; $('#seedLng').value = pos.coords.longitude;
      if (status) status.textContent = `Location saved: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      this.haptic();
    }, () => { if (status) status.textContent = 'Location permission was not granted.'; }, { enableHighAccuracy:true, timeout:10000 });
  },

  async saveSeed() {
    const title = $('#seedTitle')?.value.trim(); if (!title) return this.toast('Give this seed a name');
    const existingId = $('#seedId').value; const existing = store.data.seeds.find(s=>s.id===existingId);
    let photoId = existing?.photoId || null;
    if (this.tempPhotoBlob) { photoId = photoId || uid(); await OffcourseDB.putPhoto(photoId, this.tempPhotoBlob); }
    const seed = { id:existingId||uid(), title, note:$('#seedNote').value.trim(), category:$('#seedCategory').value, lat:parseFloat($('#seedLat').value), lng:parseFloat($('#seedLng').value), photoId, createdAt:existing?.createdAt||Date.now(), updatedAt:Date.now() };
    if (!Number.isFinite(seed.lat)) { seed.lat=null; seed.lng=null; }
    if (existing) Object.assign(existing, seed); else store.data.seeds.unshift(seed);
    store.save(); this.closeSheet(); this.tempPhotoBlob=null; this.toast('Adventure Seed saved'); this.render();
  },

  openSeedDetail(id) {
    const s = store.data.seeds.find(x=>x.id===id); if (!s) return;
    this.openSheet(`<div class="sheet-head"><div><div class="eyebrow">Adventure Seed</div><h2>${esc(s.title)}</h2></div><button class="close" data-action="closeSheet">×</button></div>
      ${s.photoId ? `<div class="photo-preview" data-full-photo-id="${s.photoId}"></div>`:''}
      <p style="font-size:18px;line-height:1.5">${esc(s.note || 'No note yet.')}</p>
      <p class="note">${iconForSeed(s.category)} ${labelForCategory(s.category)} · saved ${fmtDate(s.createdAt)}</p>
      ${s.lat ? `<button class="btn secondary wide" data-action="openInMaps" data-lat="${s.lat}" data-lng="${s.lng}">Open location in Maps</button>`:''}
      <div class="row" style="margin-top:10px"><button class="btn secondary" onclick="app.openSeedSheet(store.data.seeds.find(s=>s.id==='${s.id}'))">Edit</button><button class="btn danger" data-action="deleteSeed" data-id="${s.id}">Delete</button></div>`);
    setTimeout(()=>this.hydrateFullPhotos(),0);
  },

  async deleteSeed(id) {
    const s = store.data.seeds.find(x=>x.id===id); if (!s) return;
    if (!confirm(`Delete “${s.title}”?`)) return;
    if (s.photoId) await OffcourseDB.deletePhoto(s.photoId).catch(()=>{});
    store.data.seeds = store.data.seeds.filter(x=>x.id!==id); store.save(); this.closeSheet(); this.toast('Seed deleted'); this.render();
  },

  async hydrateThumbs() {
    for (const el of $$('[data-photo-id]')) {
      const id = el.dataset.photoId; if (!id) continue;
      const blob = await OffcourseDB.getPhoto(id).catch(()=>null); if (!blob) continue;
      const url = URL.createObjectURL(blob); el.innerHTML = `<img src="${url}" alt="">`;
    }
  },

  async hydrateFullPhotos() {
    for (const el of $$('[data-full-photo-id]')) {
      const blob = await OffcourseDB.getPhoto(el.dataset.fullPhotoId).catch(()=>null); if (!blob) continue;
      const url = URL.createObjectURL(blob); el.outerHTML = `<img class="photo-preview" src="${url}" alt="Adventure seed photo">`;
    }
  },

  initMap() {
    const container = $('#map'); if (!container || typeof L === 'undefined') { if(container) container.innerHTML='<div class="empty">Map needs an internet connection the first time it loads.</div>'; return; }
    if (this.map) { this.map.remove(); this.map = null; }
    const seeds = store.data.seeds.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));
    const center = seeds[0] ? [seeds[0].lat, seeds[0].lng] : [-34.9285, 138.6007];
    this.map = L.map('map', { zoomControl:false }).setView(center, seeds.length?10:7);
    L.control.zoom({position:'bottomright'}).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(this.map);
    const bounds=[];
    seeds.forEach(s=>{ const m=L.marker([s.lat,s.lng]).addTo(this.map).bindPopup(`<b>${esc(s.title)}</b><br>${esc(s.note||labelForCategory(s.category))}`); bounds.push([s.lat,s.lng]); });
    if (bounds.length>1) this.map.fitBounds(bounds,{padding:[28,28]});
  },

  openInMaps(lat,lng) { window.open(`https://maps.apple.com/?ll=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`,'_blank'); },

  openSheet(html) { const d=$('#sheet'); $('#sheetContent').innerHTML=html; if(!d.open)d.showModal(); },
  closeSheet() { const d=$('#sheet'); if(d.open)d.close(); },

  saveProfile() { store.data.profile.name=$('#profileName').value.trim(); store.data.profile.partner=$('#partnerName').value.trim(); store.save(); this.toast('Saved'); },
  exportData() {
    const blob=new Blob([JSON.stringify(store.data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`offcourse-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  },
  importData() {
    const input=$('#importPicker'); input.onchange=async()=>{ const f=input.files?.[0]; if(!f)return; try{ const data=JSON.parse(await f.text()); store.data={...store.data,...data};store.save();this.toast('Backup imported');this.render(); }catch{ this.toast('That backup could not be read'); } }; input.click();
  },
  installHelp() { this.openSheet(`<div class="sheet-head"><h2>Install on iPhone</h2><button class="close" data-action="closeSheet">×</button></div><div class="card"><p><b>1.</b> Open your Offcourse GitHub Pages link in Safari.</p><p><b>2.</b> Tap the Share button.</p><p><b>3.</b> Choose <b>Add to Home Screen</b>.</p><p><b>4.</b> Open Offcourse from the new icon once while online. After that, the core app works offline.</p></div>`); },
  resetData() { if(confirm('Reset all Offcourse data on this device? This cannot be undone unless you exported a backup.')) store.reset(); },

  toast(text) { const old=$('.toast'); if(old)old.remove(); const t=document.createElement('div'); t.className='toast'; t.textContent=text; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); },
  haptic(){ if(store.data.settings.haptics && navigator.vibrate) navigator.vibrate(18); },
  registerSW(){ if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn); }
};

function uid(){ return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`); }
function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escAttr(v=''){ return esc(v); }
function fmtDate(ts){ return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(ts)); }
function iconForSeed(c){ return ({explore:'🥾',coast:'🌊',together:'♥',question:'❓',food:'◉',camp:'⛺'})[c]||'✦'; }
function labelForCategory(c){ return ({explore:'Explore',coast:'Coast',together:'Together',question:'Question',food:'Food',camp:'Camp'})[c]||'Seed'; }

// Clickable segmented controls.
document.addEventListener('click', e=>{
  const b=e.target.closest('[data-choice-group]'); if(!b)return;
  const group=b.dataset.choiceGroup;
  $$(`[data-choice-group="${group}"]`).forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
});

window.app = app;
app.init();
