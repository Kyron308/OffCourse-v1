const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const store = {
  key: 'offcourse:v1',
  defaults: {
    profile: { name: '', partner: '', home: null },
    seeds: [],
    adventures: [],
    activeAdventure: null,
    settings: { units: 'km', haptics: true },
    couple: { mine: [], partner: [] },
    nearby: []
  },
  data: null,
  load() {
    let parsed = {};
    try { parsed = JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (e) { console.warn(e); }
    this.data = {
      ...this.defaults,
      ...parsed,
      profile: { ...this.defaults.profile, ...(parsed.profile || {}) },
      settings: { ...this.defaults.settings, ...(parsed.settings || {}) },
      couple: { ...this.defaults.couple, ...(parsed.couple || {}) },
      seeds: Array.isArray(parsed.seeds) ? parsed.seeds : [],
      adventures: Array.isArray(parsed.adventures) ? parsed.adventures : [],
      nearby: Array.isArray(parsed.nearby) ? parsed.nearby : []
    };
  },
  save() { localStorage.setItem(this.key, JSON.stringify(this.data)); },
  reset() { localStorage.removeItem(this.key); location.reload(); }
};
store.load();

const vibes = {
  adventure: { icon: '🥾', label: 'Adventure', prompt: 'Choose the less obvious way.', tasks: ['Take the path or street you would normally skip', 'Get somewhere with a view or a sense of arrival', 'Take one photo that proves you went off-course'] },
  coast: { icon: '🌊', label: 'Coast', prompt: 'Keep water somewhere in the plan.', tasks: ['Find a shoreline access point', 'Walk until the car disappears from view', 'Stop somewhere you would normally drive past'] },
  weird: { icon: '🛸', label: 'Weird', prompt: 'Prioritise places that make you ask “why is that here?”', tasks: ['Find the strangest named place nearby', 'Try something you normally would not', 'Collect one ridiculous photo'] },
  romantic: { icon: '♥', label: 'Romantic', prompt: 'Make the day feel different from a normal date.', tasks: ['Go somewhere neither of you has taken the other', 'Get one small thing to share', 'Stay long enough to watch the light change'] },
  wild: { icon: '🎲', label: 'Wildcard', prompt: 'Let chance make at least one decision.', tasks: ['Flip a coin at a safe real choice', 'Take the second-best-looking turn', 'Do one thing without checking reviews first'] },
  chill: { icon: '☁', label: 'Chill', prompt: 'Low effort, high atmosphere.', tasks: ['Find somewhere quiet', 'Get something good to eat or drink', 'Sit somewhere for 20 minutes with no plan'] }
};

const missionBank = [
  { title: 'The road you always ignore', clue: 'Pick a road or turn-off you have passed before but never taken. Follow it until it becomes interesting.', tags: ['wild','adventure'] },
  { title: 'End of the line', clue: 'Choose one direction and keep going until the road, track or shoreline gives you a reason to stop.', tags: ['adventure','coast'] },
  { title: 'No reviews allowed', clue: 'Find food, coffee or a lookout without reading a single review first.', tags: ['weird','romantic','chill'] },
  { title: 'Tiny town rule', clue: 'Head toward a small place nearby. Your next decision happens there.', tags: ['wild','weird'] },
  { title: 'Water magnet', clue: 'Navigate generally toward water you have not visited together.', tags: ['coast','romantic','chill'] },
  { title: 'The wrong turn', clue: 'At a safe intersection, let a coin choose left or right. Repeat once. Then find something worth stopping for.', tags: ['wild','adventure','weird'] },
  { title: 'Golden-hour mission', clue: 'Build the whole trip around being somewhere open and beautiful near sunset.', tags: ['romantic','coast','chill'] },
  { title: 'Question mark', clue: 'Choose one unfinished place or question and go answer it.', tags: ['adventure','wild'] }
];

const coupleIdeas = [
  ['sunset-drive','🌅','Sunset drive'], ['beach-picnic','🌊','Beach picnic'], ['camp-night','⛺','One-night camp'],
  ['new-town','🛣️','Tiny-town mission'], ['snorkel','🤿','Snorkel somewhere new'], ['fishing','🎣','Fishing mission'],
  ['hike','🥾','Hike / long walk'], ['weird-roadside','🛸','Weird roadside stop'], ['food-mission','🍜','Food roulette'],
  ['photo-walk','📷','Photo walk'], ['no-plan','🎲','No-plan day'], ['sunrise','🌄','Sunrise mission']
];

const app = {
  route: 'home',
  deferredPrompt: null,
  tempPhotoBlob: null,
  tempPhotoUrl: null,
  map: null,
  coupleRole: 'mine',
  seedFilter: 'all',
  context: { location: null, weather: null },

  init() {
    this.bindGlobal();
    this.render();
    this.registerSW();
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;
      if ($('#installBtn')) $('#installBtn').hidden = false;
    });
  },

  bindGlobal() {
    document.addEventListener('click', e => {
      const choice = e.target.closest('[data-choice-group]');
      if (choice) {
        e.preventDefault();
        $$(`[data-choice-group="${choice.dataset.choiceGroup}"]`).forEach(x => x.classList.remove('active'));
        choice.classList.add('active');
        return;
      }
      const routeEl = e.target.closest('[data-route]');
      if (routeEl) { this.go(routeEl.dataset.route); return; }
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) this.action(actionEl.dataset.action, actionEl);
    });
    $('#installBtn')?.addEventListener('click', async () => {
      if (!this.deferredPrompt) return this.installHelp();
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      $('#installBtn').hidden = true;
    });
    $('#photoPicker')?.addEventListener('change', e => this.handlePhoto(e.target.files?.[0]));
    $('#sheet')?.addEventListener('click', e => { if (e.target === $('#sheet')) this.closeSheet(); });
  },

  go(route) {
    this.route = route;
    this.closeSheet();
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  render() {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === this.route));
    const routes = {
      home: this.homeView, seeds: this.seedsView, world: this.worldView, history: this.historyView,
      settings: this.settingsView, disappear: this.disappearView, active: this.activeView,
      nearby: this.nearbyView, couple: this.coupleView, returns: this.returnsView
    };
    $('#view').innerHTML = (routes[this.route] || this.homeView).call(this);
    if (this.route === 'world') setTimeout(() => this.initMap(), 0);
    if (['home','seeds','world','returns'].includes(this.route)) setTimeout(() => this.hydrateThumbs(), 0);
  },

  homeView() {
    const active = store.data.activeAdventure;
    const returns = this.returnQuestCandidates();
    const topReturn = returns[0];
    const matches = this.coupleMatches();
    return `
      <section class="hero">
        <div class="eyebrow">Get a little lost</div>
        <h1>Don't plan it.<br><em>Go find it.</em></h1>
        <p class="lede">Real nearby places, live conditions, mystery adventures, and the unfinished places you keep meaning to return to.</p>
      </section>
      ${active ? `<div class="card highlight clickable adventure-card" data-action="resumeAdventure">
        <div class="eyebrow">Adventure in progress</div><h2>${esc(active.title)}</h2><p>${esc(active.subtitle)}</p>
        <div class="progress"><span style="width:${Math.round((active.step / active.steps.length) * 100)}%"></span></div><p class="note">Tap to continue →</p>
      </div>` : ''}
      <div class="grid two section">
        <article class="card clickable big-action highlight" data-action="startDisappear"><div class="icon">🧭</div><div><strong>Disappear</strong><p>Build a mystery trip around real places nearby.</p></div></article>
        <article class="card clickable big-action" data-action="surpriseMe"><div class="icon">🎲</div><div><strong>Surprise me</strong><p>Instant wildcard. No setup.</p></div></article>
      </div>
      <div class="grid two section">
        <article class="card clickable v2-card" data-action="discoverNearby"><div class="eyebrow">LIVE DISCOVERY</div><h3>⌖ What's around me?</h3><p>Find beaches, lookouts, small towns, reserves, historic spots and food without opening a tourist list.</p></article>
        <article class="card clickable v2-card" data-route="couple"><div class="eyebrow">YOU TWO</div><h3>♥ ${matches.length ? `${matches.length} match${matches.length===1?'':'es'}` : 'Private matching'}</h3><p>Save things you each want to do. Offcourse only cares when they overlap.</p></article>
      </div>
      ${topReturn ? `<section class="section"><div class="section-head"><div><div class="eyebrow">RETURN QUEST</div><h2>Finish an old thought</h2></div><button class="pill" data-route="returns">See all</button></div>
        <article class="card clickable return-card" data-action="startReturnQuest" data-id="${escAttr(topReturn.seed.id)}"><div class="return-icon">↩</div><div><h3>${esc(topReturn.title)}</h3><p>${esc(topReturn.reason)}</p><small>${iconForSeed(topReturn.seed.category)} ${esc(topReturn.seed.title)}</small></div></article></section>` : ''}
      <div class="stat-row">
        <div class="stat"><b>${store.data.seeds.length}</b><small>Adventure seeds</small></div>
        <div class="stat"><b>${store.data.adventures.length}</b><small>Adventures</small></div>
        <div class="stat"><b>${matches.length}</b><small>Couple matches</small></div>
      </div>
      <section class="section"><div class="section-head"><div><div class="eyebrow">Unfinished curiosity</div><h2>Adventure Seeds</h2></div><button class="pill" data-action="newSeed">＋ Add</button></div>${this.seedList(store.data.seeds.slice(0,3))}</section>`;
  },

  disappearView() {
    return `
      <section class="hero"><div class="eyebrow">Mystery mode · live when available</div><h1>How far off-course?</h1><p class="lede">Choose the boundaries. Offcourse can use your location to find an actual destination and shape the trip around weather and sunset.</p></section>
      <form id="disappearForm" class="card" onsubmit="return false;">
        <div class="field"><label>How much time?</label><div class="pill-row">${this.choicePills('time', [['2','2 hours'],['4','Half day'],['8','Full day'],['24','Overnight']], '4')}</div></div>
        <div class="field"><label>Maximum spend</label><div class="pill-row">${this.choicePills('budget', [['0','$0'],['50','$50'],['100','$100'],['250','$250+']], '100')}</div></div>
        <div class="field"><label>How far can you roam?</label><div class="pill-row">${this.choicePills('range', [['10','10 km'],['40','40 km'],['100','100 km'],['250','Anywhere']], '40')}</div></div>
        <div class="field"><label>Today's vibe</label><div class="pill-row">${Object.entries(vibes).map(([k,v],i)=>`<button type="button" class="pill ${i===0?'active':''}" data-choice-group="vibe" data-value="${k}">${v.icon} ${v.label}</button>`).join('')}</div></div>
        <button class="btn wide" data-action="generateAdventure">Find somewhere & disappear</button>
        <p class="note">Location is requested only after you tap the button. If live discovery fails, Offcourse falls back to a normal mystery mission.</p>
      </form>`;
  },

  activeView() {
    const a = store.data.activeAdventure;
    if (!a) { setTimeout(() => this.go('home'), 0); return ''; }
    const current = a.steps[a.step - 1];
    const progress = Math.round((a.step / a.steps.length) * 100);
    return `
      <section class="hero"><div class="eyebrow">Adventure ${String(a.number).padStart(3,'0')}</div><h1>${esc(a.title)}</h1><p class="lede">${esc(a.subtitle)}</p></section>
      ${a.live ? `<div class="live-strip">${a.live.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
      <div class="card adventure-card">
        <div class="section-head"><div><div class="eyebrow">Current clue</div><h2>${esc(current.heading)}</h2></div><b>${progress}%</b></div>
        <p class="clue-text">${esc(current.text)}</p>${current.tip?`<p class="note">${esc(current.tip)}</p>`:''}
        ${Number.isFinite(current.lat) ? `<button class="btn secondary wide" data-action="openInMaps" data-lat="${current.lat}" data-lng="${current.lng}" style="margin-top:12px">Open destination in Maps</button>`:''}
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
      ${current.choices ? `<section class="section"><div class="eyebrow">Choose what happens next</div><div class="choice-grid">${current.choices.map(c=>`<button class="choice" data-action="advanceAdventure" data-choice="${escAttr(c)}">${esc(c)}</button>`).join('')}</div></section>` : `<div class="section"><button class="btn wide" data-action="advanceAdventure">I've done this — reveal next clue</button></div>`}
      <button class="btn ghost wide section" data-action="finishAdventure">Finish adventure here</button>`;
  },

  nearbyView() {
    const places = store.data.nearby || [];
    return `<section class="hero"><div class="eyebrow">Live discovery</div><h1>What's around you?</h1><p class="lede">No star ratings. Just real nearby places that could turn into an afternoon.</p></section>
      <button class="btn wide" data-action="discoverNearby">⌖ Refresh nearby places</button>
      ${this.context.weather ? this.weatherCard(this.context.weather) : ''}
      <section class="section">${places.length ? `<div class="discovery-grid">${places.map(p=>this.placeCard(p)).join('')}</div>` : this.empty('⌖','Nothing loaded yet','Tap refresh and allow location access. Offcourse will search OpenStreetMap around you.')}</section>`;
  },

  placeCard(p) {
    return `<article class="card place-card"><div class="place-top"><span class="place-icon">${placeIcon(p.kind)}</span><div><div class="eyebrow">${esc(p.kindLabel || 'DISCOVERY')}</div><h3>${esc(p.name)}</h3></div><b>${Math.round(p.distance*10)/10} km</b></div>
      <p>${esc(p.description || placeDescription(p.kind))}</p><div class="row"><button class="btn secondary" data-action="startPlaceAdventure" data-id="${escAttr(p.id)}">Go here</button><button class="btn secondary" data-action="saveNearbySeed" data-id="${escAttr(p.id)}">＋ Seed</button></div></article>`;
  },

  weatherCard(w) {
    return `<div class="card live-card section"><div><div class="eyebrow">RIGHT NOW</div><h3>${esc(w.icon)} ${Math.round(w.temp)}° · ${esc(w.label)}</h3><p>${esc(w.advice)}</p></div><div class="weather-meta"><span>Sunset<br><b>${esc(w.sunsetText)}</b></span><span>Rain<br><b>${Math.round(w.rainChance)}%</b></span><span>Wind<br><b>${Math.round(w.wind)} km/h</b></span></div></div>`;
  },

  returnsView() {
    const quests = this.returnQuestCandidates();
    return `<section class="hero"><div class="eyebrow">Return quests</div><h1>Go back for a reason.</h1><p class="lede">Offcourse turns old saved thoughts into excuses to actually return.</p></section>
      ${quests.length ? `<div class="list">${quests.map(q=>`<article class="card return-card"><div class="return-icon">↩</div><div class="grow"><h3>${esc(q.title)}</h3><p>${esc(q.reason)}</p><small>${iconForSeed(q.seed.category)} ${esc(q.seed.title)} · saved ${fmtDate(q.seed.createdAt)}</small></div><button class="pill" data-action="startReturnQuest" data-id="${escAttr(q.seed.id)}">Go</button></article>`).join('')}</div>` : this.empty('↩','No return quests yet','Save a few Adventure Seeds. The older unfinished ones will start resurfacing here.')}`;
  },

  coupleView() {
    const mine = new Set(store.data.couple.mine || []);
    const partner = new Set(store.data.couple.partner || []);
    const roleSet = this.coupleRole === 'mine' ? mine : partner;
    const roleLabel = this.coupleRole === 'mine' ? (store.data.profile.name || 'Me') : (store.data.profile.partner || 'Partner');
    const matches = this.coupleMatches();
    return `<section class="hero"><div class="eyebrow">Us</div><h1>Want the same thing?</h1><p class="lede">Each person saves what sounds fun. Matches appear when both lists overlap. No guilt, no giant shared wishlist.</p></section>
      ${matches.length ? `<div class="card highlight"><div class="eyebrow">MATCHED</div><div class="match-wrap">${matches.map(id=>{const x=coupleIdeas.find(i=>i[0]===id);return `<span class="match-chip">${x?.[1]||'♥'} ${esc(x?.[2]||id)}</span>`}).join('')}</div></div>`:''}
      <div class="segmented section"><button class="${this.coupleRole==='mine'?'active':''}" data-action="coupleRole" data-role="mine">${esc(store.data.profile.name || 'Me')}</button><button class="${this.coupleRole==='partner'?'active':''}" data-action="coupleRole" data-role="partner">${esc(store.data.profile.partner || 'Partner')}</button></div>
      <div class="section-head"><div><div class="eyebrow">PRIVATE PICKS</div><h2>${esc(roleLabel)} wants to…</h2></div><span class="note">${roleSet.size} saved</span></div>
      <div class="interest-grid">${coupleIdeas.map(([id,icon,label])=>`<button class="interest ${roleSet.has(id)?'selected':''}" data-action="toggleCoupleIdea" data-id="${id}"><span>${icon}</span><b>${esc(label)}</b></button>`).join('')}</div>
      <section class="section card"><div class="eyebrow">TWO-PHONE MODE</div><h3>Keep your picks on your own phones</h3><p>Share a tiny Offcourse code containing only your selected adventure ideas. Import your partner's code to reveal matches. No account or server required.</p><div class="row"><button class="btn secondary" data-action="shareCouplePicks">Share my picks</button><button class="btn secondary" data-action="importPartnerPicks">Import partner</button></div></section>`;
  },

  seedsView() {
    const filtered = this.seedFilter==='all' ? store.data.seeds : store.data.seeds.filter(s=>s.category===this.seedFilter);
    return `<section class="hero"><div class="eyebrow">Unfinished curiosity</div><h1>Adventure Seeds</h1><p class="lede">Save the “come back here”, “what's down there?” and “we should do that” thoughts before they disappear.</p></section>
      <div class="pill-row seed-filters">${[['all','All'],['coast','🌊 Coast'],['explore','🥾 Explore'],['together','♥ Together'],['question','❓ Question']].map(([v,l])=>`<button class="chip ${this.seedFilter===v?'active':''}" data-action="filterSeeds" data-category="${v}">${l}</button>`).join('')}</div>
      ${this.seedList(filtered)}<button class="fab" data-action="newSeed" aria-label="Add seed">＋</button>`;
  },

  worldView() {
    const geo = store.data.seeds.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));
    return `<section class="hero"><div class="eyebrow">Your world</div><h1>A map of what matters.</h1><p class="lede">Not reviews. Just your unfinished curiosity and places worth remembering.</p></section><div id="map" class="map"></div>
      <section class="section"><div class="section-head"><div><h2>${geo.length} pinned places</h2><p>Seeds with a saved location.</p></div></div>${this.seedList(geo.slice(0,8))}</section>`;
  },

  historyView() {
    const arr=[...store.data.adventures].sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
    return `<section class="hero"><div class="eyebrow">The good kind of history</div><h1>Where you went.</h1><p class="lede">A timeline of days that actually turned into something.</p></section>${arr.length?`<div class="list">${arr.map(a=>`<div class="item"><div class="thumb">${vibes[a.vibe]?.icon||'🧭'}</div><div><h3>${esc(a.title)}</h3><p>${fmtDate(a.completedAt)} · ${esc(a.subtitle||'')}</p></div><span class="go">›</span></div>`).join('')}</div>`:this.empty('🧭','No completed adventures yet','Your finished missions will collect here.')}`;
  },

  settingsView() {
    return `<section class="hero"><div class="eyebrow">Offcourse v2</div><h1>Keep it yours.</h1><p class="lede">Seeds, history, photos and couple picks stay on your device unless you deliberately export or share them.</p></section>
      <div class="card"><div class="field"><label>Your name</label><input class="input" id="profileName" value="${escAttr(store.data.profile.name||'')}" placeholder="Optional"></div><div class="field"><label>Partner's name</label><input class="input" id="partnerName" value="${escAttr(store.data.profile.partner||'')}" placeholder="Optional"></div><button class="btn wide" data-action="saveProfile">Save</button></div>
      <section class="section grid"><button class="btn secondary wide" data-action="exportData">Export backup</button><button class="btn secondary wide" data-action="importData">Import backup</button><button class="btn secondary wide" data-action="installHelp">Install on iPhone</button><button class="btn danger wide" data-action="resetData">Reset local data</button></section>
      <input id="importPicker" type="file" accept="application/json" hidden>
      <div class="card section"><div class="eyebrow">LIVE SOURCES</div><p class="note">Nearby discovery uses OpenStreetMap data through Overpass. Weather and sunrise/sunset use Open-Meteo. Live features need internet; core adventures and saved data still work offline.</p></div>`;
  },

  async action(name, el) {
    const handlers = {
      startDisappear:()=>this.go('disappear'), surpriseMe:()=>this.makeInstantAdventure(), resumeAdventure:()=>this.go('active'),
      discoverNearby:()=>this.discoverNearby(), newSeed:()=>this.openSeedSheet(), saveSeed:()=>this.saveSeed(), viewSeed:()=>this.openSeedDetail(el.dataset.id),
      editSeed:()=>this.openSeedSheet(store.data.seeds.find(s=>s.id===el.dataset.id)), deleteSeed:()=>this.deleteSeed(el.dataset.id), useCurrentLocation:()=>this.useCurrentLocation(),
      pickPhoto:()=>$('#photoPicker').click(), generateAdventure:()=>this.generateAdventure(el), advanceAdventure:()=>this.advanceAdventure(el.dataset.choice), finishAdventure:()=>this.finishAdventure(),
      saveProfile:()=>this.saveProfile(), exportData:()=>this.exportData(), importData:()=>this.importData(), installHelp:()=>this.installHelp(), resetData:()=>this.resetData(),
      closeSheet:()=>this.closeSheet(), openInMaps:()=>this.openInMaps(+el.dataset.lat,+el.dataset.lng), startPlaceAdventure:()=>this.startPlaceAdventure(el.dataset.id),
      saveNearbySeed:()=>this.saveNearbySeed(el.dataset.id), startReturnQuest:()=>this.startReturnQuest(el.dataset.id), coupleRole:()=>{this.coupleRole=el.dataset.role;this.render();},
      toggleCoupleIdea:()=>this.toggleCoupleIdea(el.dataset.id), shareCouplePicks:()=>this.shareCouplePicks(), importPartnerPicks:()=>this.importPartnerPicks(),
      filterSeeds:()=>{this.seedFilter=el.dataset.category;this.render();}
    };
    if (handlers[name]) await handlers[name]();
  },

  choicePills(group, choices, selected) { return choices.map(([v,l])=>`<button type="button" class="pill ${v===selected?'active':''}" data-choice-group="${group}" data-value="${v}">${l}</button>`).join(''); },
  selected(group) { return $(`[data-choice-group="${group}"].active`)?.dataset.value; },

  async generateAdventure(button) {
    const config={time:+this.selected('time'),budget:+this.selected('budget'),range:+this.selected('range'),vibe:this.selected('vibe')||'adventure'};
    const original=button?.textContent; if(button){button.disabled=true;button.textContent='Finding somewhere…';}
    let location=null, weather=null, places=[];
    try {
      location=await this.getLocation(); this.context.location=location;
      [weather,places]=await Promise.all([this.fetchWeather(location.lat,location.lng),this.fetchNearbyPlaces(location.lat,location.lng,config.range)]);
      if(weather) this.context.weather=weather;
      if(places.length){ store.data.nearby=places; store.save(); }
    } catch(e) { console.warn('Live adventure fallback',e); }
    const v=vibes[config.vibe];
    const missionPool=missionBank.filter(m=>m.tags.includes(config.vibe));
    const mission=pick(missionPool.length?missionPool:missionBank);
    const destination=this.chooseDestination(places,config.vibe,config.range);
    const seedCandidates=store.data.seeds.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));
    const chosenSeed=!destination&&seedCandidates.length?pick(seedCandidates):null;
    const steps=[{heading:'Before you leave',text:`You have ${config.time>=8?'the day':`${config.time} hours`}, about $${config.budget||0} to spend and up to ${config.range} km to roam. ${v.prompt}`,tip:this.conditionTip(weather)}];
    if(destination) steps.push({heading:'First destination',text:`Head toward ${destination.name}. It is about ${destination.distance.toFixed(1)} km away. You do not have to make it there if something better steals your attention.`,lat:destination.lat,lng:destination.lng,choices:['Go straight there','Take one detour','Let chance decide']});
    else if(chosenSeed) steps.push({heading:'First destination',text:`Start with one of your unfinished places: “${chosenSeed.title}”. Head that way, but stop early if something better steals your attention.`,lat:chosenSeed.lat,lng:chosenSeed.lng,choices:['Follow the seed','Take a detour','Let chance decide']});
    else steps.push({heading:'First move',text:mission.clue,choices:['Follow it','Take a detour','Let chance decide']});
    steps.push({heading:'Lose the itinerary',text:v.tasks[0],tip:'The point is not to optimise the route. Notice what you normally pass.'});
    if(weather?.sunsetText) steps.push({heading:'Race the light — gently',text:`Sunset is around ${weather.sunsetText}. Decide whether you want to be somewhere open for it or deliberately finish before then.`,choices:['Chase sunset','Find food','Keep wandering']});
    else steps.push({heading:'Do one thing properly',text:v.tasks[1],choices:['Keep exploring','Find food','Slow down']});
    steps.push({heading:'Leave a breadcrumb',text:v.tasks[2],tip:'If somewhere gives you a “come back here” feeling, save it as an Adventure Seed.'});
    const live=[]; if(weather){live.push(`${weather.icon} ${Math.round(weather.temp)}°`,`${Math.round(weather.rainChance)}% rain`,`Sunset ${weather.sunsetText}`);} if(destination)live.push(`${destination.distance.toFixed(1)} km to first stop`);
    store.data.activeAdventure={id:uid(),number:store.data.adventures.length+1,title:destination?destination.name:mission.title,subtitle:`${v.icon} ${v.label} · ${config.time}h · ${config.range} km max${destination?' · live place':''}`,vibe:config.vibe,config,step:1,steps,live,startedAt:Date.now(),destination};
    store.save(); if(button){button.disabled=false;button.textContent=original;} this.go('active');
  },

  makeInstantAdventure() {
    const vibe=pick(Object.keys(vibes)), v=vibes[vibe], mission=pick(missionBank);
    store.data.activeAdventure={id:uid(),number:store.data.adventures.length+1,title:mission.title,subtitle:`${v.icon} Instant wildcard`,vibe,config:{time:3,budget:50,range:40,vibe},step:1,startedAt:Date.now(),steps:[
      {heading:'Leave now',text:mission.clue,tip:'You are allowed to abandon this clue for something more interesting.'},{heading:'Second move',text:v.tasks[0],choices:['Go further','Find food','Change direction']},{heading:'Final rule',text:v.tasks[2],tip:'Save any place you want to return to as an Adventure Seed.'}
    ]}; store.save(); this.go('active');
  },

  async discoverNearby() {
    this.toast('Finding interesting places…');
    try {
      const loc=await this.getLocation(); this.context.location=loc;
      const [weather,places]=await Promise.all([this.fetchWeather(loc.lat,loc.lng),this.fetchNearbyPlaces(loc.lat,loc.lng,40)]);
      this.context.weather=weather; store.data.nearby=places; store.save(); this.route='nearby'; this.render();
      if(!places.length)this.toast('No mapped places found nearby');
    } catch(e) { console.warn(e); this.toast(e.message==='location-denied'?'Location permission is needed':'Could not load nearby places right now'); this.go('nearby'); }
  },

  async fetchNearbyPlaces(lat,lng,rangeKm=40) {
    if(!navigator.onLine) return [];
    const radius=Math.max(3000,Math.min(rangeKm*1000,45000));
    const q=`[out:json][timeout:14];(nwr(around:${radius},${lat},${lng})["name"]["tourism"~"viewpoint|attraction|picnic_site"];nwr(around:${radius},${lat},${lng})["name"]["natural"="beach"];nwr(around:${radius},${lat},${lng})["name"]["leisure"~"nature_reserve|park"];node(around:${radius},${lat},${lng})["name"]["place"~"village|hamlet"];nwr(around:${radius},${lat},${lng})["name"]["historic"];nwr(around:${radius},${lat},${lng})["name"]["amenity"~"cafe|pub"];);out center tags 80;`;
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
    try {
      const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q),signal:controller.signal});
      if(!res.ok) throw new Error('overpass');
      const data=await res.json(); const seen=new Set();
      return (data.elements||[]).map(el=>{
        const plat=el.lat??el.center?.lat, plng=el.lon??el.center?.lon, name=el.tags?.name;
        if(!name||!Number.isFinite(plat)||!Number.isFinite(plng))return null;
        const kind=classifyPlace(el.tags||{}); const distance=haversine(lat,lng,plat,plng);
        return {id:`osm-${el.type}-${el.id}`,name,lat:plat,lng:plng,distance,kind,kindLabel:placeKindLabel(kind),description:placeDescription(kind)};
      }).filter(Boolean).filter(p=>p.distance<=rangeKm).filter(p=>{const k=`${p.name.toLowerCase()}-${p.kind}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.distance-b.distance).slice(0,30);
    } finally { clearTimeout(timer); }
  },

  async fetchWeather(lat,lng) {
    if(!navigator.onLine) return null;
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,weather_code,wind_speed_10m&daily=sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=1`;
    try {
      const res=await fetch(url); if(!res.ok)return null; const d=await res.json();
      const code=d.current?.weather_code??0, info=weatherInfo(code), sunset=d.daily?.sunset?.[0];
      const w={temp:d.current?.temperature_2m??0,wind:d.current?.wind_speed_10m??0,rainChance:d.daily?.precipitation_probability_max?.[0]??0,sunset:sunset||null,sunsetText:sunset?formatTime(sunset):'—',icon:info.icon,label:info.label};
      w.advice=this.conditionTip(w); return w;
    } catch { return null; }
  },

  conditionTip(w) {
    if(!w)return 'Bring water, charge your phone, and take whatever the weather obviously demands.';
    if(w.rainChance>=60)return `Rain is fairly likely (${Math.round(w.rainChance)}%). Favour short walks, food stops, lookouts near the car, or embrace getting wet.`;
    if(w.wind>=35)return `It is windy (${Math.round(w.wind)} km/h). Exposed cliffs and beach stops may be less pleasant than sheltered places.`;
    if(w.temp>=32)return `It is hot (${Math.round(w.temp)}°). Keep the adventure near shade or water and carry more water than usual.`;
    if(w.temp<=12)return `It is cool (${Math.round(w.temp)}°). A walk plus a warm food stop is probably the move.`;
    return `Conditions look decent: ${Math.round(w.temp)}°, about ${Math.round(w.rainChance)}% rain chance.`;
  },

  chooseDestination(places,vibe,range) {
    if(!places?.length)return null;
    const preferred={coast:['beach','viewpoint'],romantic:['viewpoint','beach','reserve','cafe'],weird:['historic','attraction','village'],chill:['cafe','reserve','beach','viewpoint'],adventure:['viewpoint','reserve','historic','village'],wild:['village','historic','attraction','viewpoint']}[vibe]||[];
    const ranked=places.map(p=>({p,score:(preferred.includes(p.kind)?5:0)+(p.distance>2?2:0)+(p.distance<Math.max(8,range*.8)?1:0)+Math.random()*4})).sort((a,b)=>b.score-a.score);
    return ranked[0]?.p||pick(places);
  },

  startPlaceAdventure(id) {
    const p=store.data.nearby.find(x=>x.id===id); if(!p)return;
    const vibe=p.kind==='beach'?'coast':p.kind==='cafe'?'chill':'adventure', v=vibes[vibe];
    store.data.activeAdventure={id:uid(),number:store.data.adventures.length+1,title:p.name,subtitle:`${v.icon} Real nearby discovery · ${p.distance.toFixed(1)} km away`,vibe,config:{time:3,budget:50,range:Math.ceil(p.distance),vibe},step:1,startedAt:Date.now(),destination:p,live:this.context.weather?[`${this.context.weather.icon} ${Math.round(this.context.weather.temp)}°`,`Sunset ${this.context.weather.sunsetText}`]:[],steps:[
      {heading:'Go somewhere real',text:`Head toward ${p.name}. You can bail out for a better-looking stop on the way.`,lat:p.lat,lng:p.lng,choices:['Go straight there','Take one detour','Flip a coin']},
      {heading:'Do not just arrive',text:v.tasks[0],tip:'Spend at least ten minutes actually looking around.'},{heading:'Make it yours',text:v.tasks[2],tip:'If this place deserves a return visit, save it as a Seed.'}
    ]}; store.save(); this.go('active');
  },

  saveNearbySeed(id) {
    const p=store.data.nearby.find(x=>x.id===id); if(!p)return;
    if(store.data.seeds.some(s=>Math.abs((s.lat||0)-p.lat)<.0001&&Math.abs((s.lng||0)-p.lng)<.0001))return this.toast('Already in your Seeds');
    store.data.seeds.unshift({id:uid(),title:p.name,note:`Found nearby · ${placeDescription(p.kind)}`,category:p.kind==='beach'?'coast':'explore',lat:p.lat,lng:p.lng,photoId:null,createdAt:Date.now(),updatedAt:Date.now()}); store.save(); this.toast('Saved as an Adventure Seed'); this.render();
  },

  returnQuestCandidates() {
    const now=Date.now();
    return store.data.seeds.map(seed=>{
      const ageDays=Math.max(0,(now-(seed.updatedAt||seed.createdAt||now))/86400000); let score=ageDays;
      let title=`Go back to ${seed.title}`, reason=seed.note||'You saved it for a reason. Go find out whether it still deserves the question mark.';
      if(seed.category==='question'){score+=20;title=`Answer: ${seed.title}`;reason=seed.note||'You left a question here. This time, answer it.';}
      if(seed.category==='coast'){score+=12;title=`Return to ${seed.title}`;reason=(seed.note||'Go back with different light, weather or tide and see if the place changes.');}
      if(seed.category==='camp'){score+=10;reason=seed.note||'Scout it properly before committing to a night there.';}
      if(/sunset|golden|light/i.test(seed.note||'')){score+=15;reason=`You mentioned the light here. Go back late enough to see whether you were right.`;}
      if(/low tide|tide/i.test(seed.note||'')){score+=15;reason=`You saved a tide-related reason to return. Offcourse can remember that intention; check local tide information before setting off.`;}
      return {seed,title,reason,score};
    }).sort((a,b)=>b.score-a.score).slice(0,10);
  },

  async startReturnQuest(id) {
    const seed=store.data.seeds.find(s=>s.id===id); if(!seed)return;
    let weather=null; if(Number.isFinite(seed.lat)&&navigator.onLine)weather=await this.fetchWeather(seed.lat,seed.lng);
    const live=weather?[`${weather.icon} ${Math.round(weather.temp)}°`,`${Math.round(weather.rainChance)}% rain`,`Sunset ${weather.sunsetText}`]:[];
    const steps=[{heading:'Why this one?',text:seed.note||`You saved “${seed.title}”. That is enough of a reason to go back.`,tip:weather?this.conditionTip(weather):'Return quests work offline too.'}];
    if(Number.isFinite(seed.lat))steps.push({heading:'Go back',text:`Head toward ${seed.title}. Do one thing differently from the last time you were there.`,lat:seed.lat,lng:seed.lng,choices:['Take the direct route','Detour once','Arrive near sunset']});
    else steps.push({heading:'Find it again',text:`Work out where “${seed.title}” was and go looking for it again.`,choices:['I know the way','Search my photos','Choose another route']});
    steps.push({heading:'Close the loop',text:'Decide whether this place becomes a favourite, creates a new question, or can finally leave your unfinished list.'});
    store.data.activeAdventure={id:uid(),number:store.data.adventures.length+1,title:`Return: ${seed.title}`,subtitle:`↩ Return Quest · saved ${fmtDate(seed.createdAt)}`,vibe:seed.category==='coast'?'coast':'adventure',config:{time:3,budget:50,range:40,vibe:'adventure'},step:1,steps,live,startedAt:Date.now(),returnSeedId:id};store.save();this.go('active');
  },

  coupleMatches() { const b=new Set(store.data.couple.partner||[]); return (store.data.couple.mine||[]).filter(x=>b.has(x)); },
  toggleCoupleIdea(id) {
    const key=this.coupleRole; const set=new Set(store.data.couple[key]||[]); set.has(id)?set.delete(id):set.add(id); store.data.couple[key]=[...set]; store.save(); this.haptic(); this.render();
  },
  async shareCouplePicks() {
    const payload={v:1,picks:store.data.couple[this.coupleRole]||[]}; const code='OFFCOURSE-PICKS:'+btoa(JSON.stringify(payload));
    const text=`My private Offcourse adventure picks:\n${code}`;
    try { if(navigator.share)await navigator.share({title:'Offcourse picks',text}); else {await navigator.clipboard.writeText(code);this.toast('Pick code copied');} } catch(e){ if(e?.name!=='AbortError')this.toast('Could not share picks'); }
  },
  importPartnerPicks() {
    const raw=prompt('Paste your partner’s OFFCOURSE-PICKS code:'); if(!raw)return;
    const match=raw.match(/OFFCOURSE-PICKS:([A-Za-z0-9+/=]+)/); if(!match)return this.toast('That does not look like an Offcourse code');
    try { const data=JSON.parse(atob(match[1])); if(!Array.isArray(data.picks))throw 0; store.data.couple.partner=data.picks.filter(id=>coupleIdeas.some(x=>x[0]===id)); store.save(); this.toast(`${this.coupleMatches().length} match${this.coupleMatches().length===1?'':'es'} found`); this.render(); } catch { this.toast('Could not read that code'); }
  },

  advanceAdventure(choice) { const a=store.data.activeAdventure;if(!a)return;if(choice)a.lastChoice=choice;if(a.step<a.steps.length){a.step++;store.save();this.haptic();this.render();}else this.finishAdventure(); },
  finishAdventure() { const a=store.data.activeAdventure;if(!a)return;a.completedAt=Date.now();store.data.adventures.push(a);store.data.activeAdventure=null;store.save();this.toast('Adventure saved');this.go('history'); },

  seedList(seeds) {
    if(!seeds.length)return this.empty('✦','Nothing saved yet','Next time you think “we should come back here”, save it as a Seed.');
    return `<div class="list">${seeds.map(s=>`<article class="item clickable" data-action="viewSeed" data-id="${escAttr(s.id)}"><div class="thumb" ${s.photoId?`data-photo-id="${escAttr(s.photoId)}"`:''}>${s.photoId?'':iconForSeed(s.category)}</div><div class="grow"><h3>${esc(s.title)}</h3><p>${esc(s.note||labelForCategory(s.category))}</p></div><span class="go">›</span></article>`).join('')}</div>`;
  },
  empty(icon,title,text){return `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;},

  openSeedSheet(seed=null) {
    this.tempPhotoBlob=null;this.tempPhotoUrl=null;
    this.openSheet(`<div class="sheet-head"><div><div class="eyebrow">Adventure Seed</div><h2>${seed?'Edit':'Save the thought'}</h2></div><button class="close" data-action="closeSheet">×</button></div>
      <div id="photoSlot">${seed?.photoId?`<div class="photo-preview" data-full-photo-id="${seed.photoId}"></div>`:''}</div><div class="row" style="margin-bottom:16px"><button class="btn secondary" data-action="pickPhoto">📸 Photo</button><button class="btn secondary" data-action="useCurrentLocation">⌖ Location</button></div>
      <input type="hidden" id="seedId" value="${seed?.id||''}"><input type="hidden" id="seedLat" value="${seed?.lat??''}"><input type="hidden" id="seedLng" value="${seed?.lng??''}">
      <div class="field"><label>What is it?</label><input class="input" id="seedTitle" value="${escAttr(seed?.title||'')}" placeholder="That beach past the dirt track"></div><div class="field"><label>Why save it?</label><textarea id="seedNote" placeholder="Come back at low tide / see where that road goes / camp here someday">${esc(seed?.note||'')}</textarea></div>
      <div class="field"><label>Type</label><select id="seedCategory"><option value="explore">🥾 Explore</option><option value="coast">🌊 Coast</option><option value="together">♥ Together</option><option value="question">❓ Question</option><option value="food">◉ Food</option><option value="camp">⛺ Camp</option></select></div>
      <div id="locationStatus" class="note">${seed?.lat?`Location saved: ${seed.lat.toFixed(4)}, ${seed.lng.toFixed(4)}`:'No location saved yet.'}</div><button class="btn wide" style="margin-top:18px" data-action="saveSeed">Save seed</button>`);
    if(seed)$('#seedCategory').value=seed.category||'explore';setTimeout(()=>this.hydrateFullPhotos(),0);
  },
  async handlePhoto(file){if(!file)return;this.tempPhotoBlob=file;if(this.tempPhotoUrl)URL.revokeObjectURL(this.tempPhotoUrl);this.tempPhotoUrl=URL.createObjectURL(file);const slot=$('#photoSlot');if(slot)slot.innerHTML=`<img class="photo-preview" src="${this.tempPhotoUrl}" alt="Selected photo">`;},
  async useCurrentLocation(){const status=$('#locationStatus');if(status)status.textContent='Finding your location…';try{const p=await this.getLocation();$('#seedLat').value=p.lat;$('#seedLng').value=p.lng;if(status)status.textContent=`Location saved: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;this.haptic();}catch{if(status)status.textContent='Location permission was not granted.';}},
  async saveSeed(){const title=$('#seedTitle')?.value.trim();if(!title)return this.toast('Give this seed a name');const existingId=$('#seedId').value,existing=store.data.seeds.find(s=>s.id===existingId);let photoId=existing?.photoId||null;if(this.tempPhotoBlob){photoId=photoId||uid();await OffcourseDB.putPhoto(photoId,this.tempPhotoBlob);}const seed={id:existingId||uid(),title,note:$('#seedNote').value.trim(),category:$('#seedCategory').value,lat:parseFloat($('#seedLat').value),lng:parseFloat($('#seedLng').value),photoId,createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};if(!Number.isFinite(seed.lat)){seed.lat=null;seed.lng=null;}if(existing)Object.assign(existing,seed);else store.data.seeds.unshift(seed);store.save();this.closeSheet();this.tempPhotoBlob=null;this.toast('Adventure Seed saved');this.render();},
  openSeedDetail(id){const s=store.data.seeds.find(x=>x.id===id);if(!s)return;this.openSheet(`<div class="sheet-head"><div><div class="eyebrow">Adventure Seed</div><h2>${esc(s.title)}</h2></div><button class="close" data-action="closeSheet">×</button></div>${s.photoId?`<div class="photo-preview" data-full-photo-id="${s.photoId}"></div>`:''}<p class="sheet-note">${esc(s.note||'No note yet.')}</p><p class="note">${iconForSeed(s.category)} ${labelForCategory(s.category)} · saved ${fmtDate(s.createdAt)}</p>${s.lat?`<button class="btn secondary wide" data-action="openInMaps" data-lat="${s.lat}" data-lng="${s.lng}">Open location in Maps</button>`:''}<div class="row" style="margin-top:10px"><button class="btn secondary" data-action="editSeed" data-id="${s.id}">Edit</button><button class="btn danger" data-action="deleteSeed" data-id="${s.id}">Delete</button></div>`);setTimeout(()=>this.hydrateFullPhotos(),0);},
  async deleteSeed(id){const s=store.data.seeds.find(x=>x.id===id);if(!s)return;if(!confirm(`Delete “${s.title}”?`))return;if(s.photoId)await OffcourseDB.deletePhoto(s.photoId).catch(()=>{});store.data.seeds=store.data.seeds.filter(x=>x.id!==id);store.save();this.closeSheet();this.toast('Seed deleted');this.render();},
  async hydrateThumbs(){for(const el of $$('[data-photo-id]')){const blob=await OffcourseDB.getPhoto(el.dataset.photoId).catch(()=>null);if(!blob)continue;const url=URL.createObjectURL(blob);el.innerHTML=`<img src="${url}" alt="">`; }},
  async hydrateFullPhotos(){for(const el of $$('[data-full-photo-id]')){const blob=await OffcourseDB.getPhoto(el.dataset.fullPhotoId).catch(()=>null);if(!blob)continue;const url=URL.createObjectURL(blob);el.outerHTML=`<img class="photo-preview" src="${url}" alt="Adventure seed photo">`; }},

  initMap(){const c=$('#map');if(!c||typeof L==='undefined'){if(c)c.innerHTML='<div class="empty">Map needs an internet connection the first time it loads.</div>';return;}if(this.map){this.map.remove();this.map=null;}const seeds=store.data.seeds.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));const center=seeds[0]?[seeds[0].lat,seeds[0].lng]:[-34.9285,138.6007];this.map=L.map('map',{zoomControl:false}).setView(center,seeds.length?10:7);L.control.zoom({position:'bottomright'}).addTo(this.map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(this.map);const bounds=[];seeds.forEach(s=>{L.marker([s.lat,s.lng]).addTo(this.map).bindPopup(`<b>${esc(s.title)}</b><br>${esc(s.note||labelForCategory(s.category))}`);bounds.push([s.lat,s.lng]);});if(bounds.length>1)this.map.fitBounds(bounds,{padding:[28,28]});},
  getLocation(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('location-unavailable'));navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),()=>reject(new Error('location-denied')),{enableHighAccuracy:true,timeout:10000,maximumAge:120000});});},
  openInMaps(lat,lng){window.open(`https://maps.apple.com/?ll=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`,'_blank');},
  openSheet(html){const d=$('#sheet');$('#sheetContent').innerHTML=html;if(!d.open)d.showModal();},closeSheet(){const d=$('#sheet');if(d?.open)d.close();},
  saveProfile(){store.data.profile.name=$('#profileName').value.trim();store.data.profile.partner=$('#partnerName').value.trim();store.save();this.toast('Saved');this.render();},
  exportData(){const blob=new Blob([JSON.stringify(store.data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`offcourse-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);},
  importData(){const input=$('#importPicker');input.onchange=async()=>{const f=input.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());store.data={...store.data,...d,profile:{...store.data.profile,...(d.profile||{})},settings:{...store.data.settings,...(d.settings||{})},couple:{...store.data.couple,...(d.couple||{})}};store.save();this.toast('Backup imported');this.render();}catch{this.toast('That backup could not be read');}};input.click();},
  installHelp(){this.openSheet(`<div class="sheet-head"><h2>Install on iPhone</h2><button class="close" data-action="closeSheet">×</button></div><div class="card"><p><b>1.</b> Open Offcourse in Safari.</p><p><b>2.</b> Tap Share.</p><p><b>3.</b> Choose <b>Add to Home Screen</b>.</p><p><b>4.</b> Open it once while online so the core files cache for offline use.</p></div>`);},
  resetData(){if(confirm('Reset all Offcourse data on this device? This cannot be undone unless you exported a backup.'))store.reset();},
  toast(text){$('.toast')?.remove();const t=document.createElement('div');t.className='toast';t.textContent=text;document.body.appendChild(t);setTimeout(()=>t.remove(),2400);},
  haptic(){if(store.data.settings.haptics&&navigator.vibrate)navigator.vibrate(18);},
  registerSW(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);}
};

function uid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escAttr(v=''){return esc(v);}
function fmtDate(ts){if(!ts)return 'recently';return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(ts));}
function formatTime(iso){return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(iso));}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function haversine(a,b,c,d){const R=6371,toRad=x=>x*Math.PI/180,x=toRad(c-a),y=toRad(d-b),q=Math.sin(x/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function classifyPlace(t){if(t.natural==='beach')return'beach';if(t.tourism==='viewpoint')return'viewpoint';if(t.place==='village'||t.place==='hamlet')return'village';if(t.historic)return'historic';if(t.amenity==='cafe'||t.amenity==='pub')return'cafe';if(t.leisure==='nature_reserve'||t.leisure==='park')return'reserve';return'attraction';}
function placeIcon(k){return({beach:'🌊',viewpoint:'◉',village:'🛣️',historic:'⌛',cafe:'☕',reserve:'🌿',attraction:'✦'})[k]||'✦';}
function placeKindLabel(k){return({beach:'BEACH',viewpoint:'LOOKOUT',village:'SMALL PLACE',historic:'HISTORIC',cafe:'FOOD STOP',reserve:'RESERVE',attraction:'ODDITY'})[k]||'DISCOVERY';}
function placeDescription(k){return({beach:'A mapped beach or shoreline stop worth checking out.',viewpoint:'A mapped viewpoint — good candidate for a detour or sunset.',village:'A small mapped settlement. Useful when you want somewhere rather than an itinerary.',historic:'A historic place that may be more interesting than its popularity suggests.',cafe:'A food or drink stop that can anchor the middle of an adventure.',reserve:'A park or reserve that gives you somewhere to wander.',attraction:'A mapped attraction or point of interest. Decide for yourself whether it deserves the label.'})[k]||'A real mapped place nearby.';}
function weatherInfo(code){if(code===0)return{icon:'☀️',label:'Clear'};if(code<=3)return{icon:'🌤️',label:'Partly cloudy'};if(code<=48)return{icon:'🌫️',label:'Foggy'};if(code<=67)return{icon:'🌧️',label:'Rain'};if(code<=77)return{icon:'🌨️',label:'Snow'};if(code<=82)return{icon:'🌦️',label:'Showers'};if(code<=86)return{icon:'🌨️',label:'Snow showers'};return{icon:'⛈️',label:'Stormy'};}
function iconForSeed(c){return({explore:'🥾',coast:'🌊',together:'♥',question:'❓',food:'◉',camp:'⛺'})[c]||'✦';}
function labelForCategory(c){return({explore:'Explore',coast:'Coast',together:'Together',question:'Question',food:'Food',camp:'Camp'})[c]||'Seed';}

window.app=app;
app.init();
