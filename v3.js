/* Offcourse v3 — intelligence, mystery, memory and learning layer */
(() => {
  'use strict';

  const V3 = {
    version: '3.0.0',
    ratingTags: [
      ['scenic','🌅','Scenic'], ['remote','🛣️','Remote'], ['quiet','🌿','Quiet'],
      ['water','🌊','Water'], ['active','🥾','Active'], ['food','🍜','Good food'],
      ['weird','🛸','Weird'], ['romantic','♥','Romantic'], ['busy','👥','Too busy'],
      ['far','🕒','Too far']
    ],
    kindVibes: {
      beach:['coast','romantic','chill','wild'],
      viewpoint:['adventure','romantic','chill'],
      reserve:['adventure','chill','wild'],
      park:['chill','romantic'],
      village:['weird','wild','chill'],
      historic:['weird','adventure'],
      attraction:['weird','adventure'],
      food:['chill','romantic','weird'],
      picnic:['romantic','chill','coast'],
      other:['wild','weird']
    },
    positiveTags: new Set(['scenic','remote','quiet','water','active','food','weird','romantic']),
    ensureData() {
      store.data.learning ||= { ratings: [], kindWeights: {}, vibeWeights: {}, tagWeights: {} };
      store.data.learning.ratings ||= [];
      store.data.learning.kindWeights ||= {};
      store.data.learning.vibeWeights ||= {};
      store.data.learning.tagWeights ||= {};
      store.data.coupleVotes ||= { mine: {}, partner: {} };
      store.data.offlinePacks ||= [];
      store.data.quickCaptures ||= [];
      store.data.explored ||= [];
      store.data.settings ||= {};
      if (!('adventureMode' in store.data.settings)) store.data.settings.adventureMode = 'smart';
      store.save();
    },
    e(v='') {
      return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    },
    a(v='') { return this.e(v); },
    date(ts) {
      if (!ts) return '';
      return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(ts));
    },
    clamp(n,min,max){ return Math.min(max,Math.max(min,n)); },
    random(arr){ return arr?.length ? arr[Math.floor(Math.random()*arr.length)] : null; },
    cardinal(fromLat,fromLng,toLat,toLng) {
      const dLon=(toLng-fromLng)*Math.PI/180, a=fromLat*Math.PI/180, b=toLat*Math.PI/180;
      const y=Math.sin(dLon)*Math.cos(b);
      const x=Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dLon);
      const deg=(Math.atan2(y,x)*180/Math.PI+360)%360;
      const dirs=['north','north-east','east','south-east','south','south-west','west','north-west'];
      return dirs[Math.round(deg/45)%8];
    },
    placeSeen(p) {
      return store.data.adventures.some(a => a.destination && (
        a.destination.id === p.id ||
        (Number.isFinite(a.destination.lat) && haversine(a.destination.lat,a.destination.lng,p.lat,p.lng) < 0.8)
      ));
    },
    learningWeight(bucket,key) {
      return Number(store.data.learning?.[bucket]?.[key] || 0);
    },
    scorePlace(p, config={}, weather=null, mode='smart') {
      const range=Math.max(10,Number(config.range||40));
      const vibe=config.vibe||'adventure';
      let score=50, reasons=[];
      const seen=this.placeSeen(p);
      if (seen) { score-=26; reasons.push('you have already been here'); }
      else { score+=13; reasons.push('new to you'); }

      const sweet=p.distance/range;
      if (sweet>=0.18 && sweet<=0.72) { score+=12; reasons.push('good distance'); }
      else if (p.distance<2) score-=9;
      else if (sweet>0.9) score-=5;

      const kindWeight=this.learningWeight('kindWeights',p.kind);
      const vibeWeight=this.learningWeight('vibeWeights',vibe);
      const vibeFit=(this.kindVibes[p.kind]||[]).includes(vibe);
      if (vibeFit) { score+=14; reasons.push(`fits ${vibe}`); }
      score += kindWeight*5 + vibeWeight*2;

      if (mode==='outside') {
        score -= kindWeight*9;
        if (!vibeFit) score+=13;
        if (!seen) score+=8;
        reasons.unshift('outside your usual picks');
      }

      if (weather) {
        const rain=Number(weather.rainChance??weather.precipitation_probability??0);
        const wind=Number(weather.wind??weather.windSpeed??0);
        const temp=Number(weather.temp??weather.temperature??20);
        if (rain>=60 && ['beach','viewpoint','reserve','park','picnic'].includes(p.kind)) { score-=18; reasons.push('rain may work against it'); }
        else if (rain<=20 && ['beach','viewpoint','reserve','park'].includes(p.kind)) { score+=7; reasons.push('conditions suit being outside'); }
        if (wind>=35 && ['beach','viewpoint'].includes(p.kind)) { score-=14; reasons.push('windy'); }
        if (temp>=15 && temp<=27 && ['reserve','park','beach','viewpoint'].includes(p.kind)) score+=4;
      }

      // Give saved curiosity near the place a nudge.
      const nearSeed=store.data.seeds.some(s => Number.isFinite(s.lat) && haversine(s.lat,s.lng,p.lat,p.lng)<2);
      if (nearSeed) { score+=8; reasons.push('near one of your saved curiosities'); }

      score += (Math.random()*8)-4; // avoid always choosing the same mathematically perfect point
      return {score:Math.round(this.clamp(score,0,100)),reasons:reasons.slice(0,3)};
    },
    rankPlaces(places,config,weather,mode='smart') {
      return [...(places||[])].map(p=>({...p,_v3:this.scorePlace(p,config,weather,mode)}))
        .sort((a,b)=>b._v3.score-a._v3.score);
    },
    pickWeighted(ranked) {
      const top=ranked.slice(0,Math.min(6,ranked.length));
      if (!top.length) return null;
      const floor=Math.max(1,Math.min(...top.map(p=>p._v3.score))-15);
      const weights=top.map(p=>Math.max(1,p._v3.score-floor));
      const total=weights.reduce((a,b)=>a+b,0);
      let n=Math.random()*total;
      for (let i=0;i<top.length;i++){ n-=weights[i]; if(n<=0)return top[i]; }
      return top[0];
    },
    kindHint(kind) {
      return ({
        beach:'somewhere the land meets the water',
        viewpoint:'somewhere chosen for the view',
        reserve:'somewhere with more nature than buildings',
        park:'an open green place',
        village:'a small settlement rather than a major destination',
        historic:'somewhere with a story older than your visit',
        attraction:'a mapped point people stop for',
        food:'somewhere you can stop for food or a drink',
        picnic:'somewhere made for stopping rather than passing through',
        other:'a named place worth investigating'
      })[kind] || 'a named place worth investigating';
    },
    weatherLine(w) {
      if (!w) return 'Live conditions unavailable — use common sense for what to bring.';
      const bits=[];
      if (Number.isFinite(Number(w.temp))) bits.push(`${Math.round(w.temp)}°`);
      if (Number.isFinite(Number(w.wind))) bits.push(`${Math.round(w.wind)} km/h wind`);
      if (Number.isFinite(Number(w.rainChance))) bits.push(`${Math.round(w.rainChance)}% rain`);
      if (w.sunset) bits.push(`sunset ${w.sunset}`);
      return bits.join(' · ') || 'Live conditions loaded';
    },
    makeMysteryAdventure(destination,config,weather,source='smart') {
      const v=vibes[config.vibe]||vibes.adventure;
      const loc=app.context.location;
      const direction=loc ? this.cardinal(loc.lat,loc.lng,destination.lat,destination.lng) : 'away from your usual route';
      const dist=Math.max(1,Math.round(destination.distance||0));
      const reason=destination._v3?.reasons?.[0] || 'it looks worth investigating';
      const revealIndex=4;
      return {
        id:uid(), number:store.data.adventures.length+1,
        title: source==='outside' ? 'The one you would not pick' : 'Unknown destination',
        subtitle:`${v.icon} ${v.label} · mystery destination · ${dist} km`,
        vibe:config.vibe, config, source, destination:{...destination}, step:1, revealIndex,
        startedAt:Date.now(),
        live: weather ? [this.weatherLine(weather), `Offcourse score ${destination._v3?.score ?? '—'}/100`] : [],
        steps:[
          {heading:'Before you leave',text:`You have ${config.time>=8?'the day':`${config.time} hours`} and up to ${config.range} km to roam. ${v.prompt}`,tip:this.weatherLine(weather)},
          {heading:'First bearing',text:`Head generally ${direction}. Your target is roughly ${dist} km away. Do not open Maps yet.`,choices:['Commit to it','Take one detour','Let chance choose a turn']},
          {heading:'What you are looking for',text:`You are heading toward ${this.kindHint(destination.kind)}. I picked it because ${reason}.`,tip:'If something genuinely better appears on the way, stopping is allowed.'},
          {heading:'Reveal',text:`Your destination is ${destination.name}. Get close, then stop navigating and explore it on your own terms.`,lat:destination.lat,lng:destination.lng,reveal:true},
          {heading:'Make it yours',text:v.tasks[1]||'Spend long enough here to discover one thing a map would not tell you.',choices:['Explore further','Find food','Slow down']},
          {heading:'Leave a breadcrumb',text:'Before you go, decide whether this was genuinely your kind of place. Offcourse will use your answer to get better next time.',tip:'Save any unfinished thought as an Adventure Seed.'}
        ]
      };
    },
    tasteSummary() {
      const ratings=store.data.learning.ratings||[];
      if (!ratings.length) return 'Offcourse has not learned your taste yet.';
      const kinds=Object.entries(store.data.learning.kindWeights||{}).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>0).slice(0,3);
      const disliked=Object.entries(store.data.learning.kindWeights||{}).sort((a,b)=>a[1]-b[1]).filter(x=>x[1]<0).slice(0,2);
      const good=kinds.length?`Leaning toward ${kinds.map(x=>placeKindLabel?.(x[0])||x[0]).join(', ')}.`:'Still exploring what you like.';
      const avoid=disliked.length?` Less keen on ${disliked.map(x=>placeKindLabel?.(x[0])||x[0]).join(', ')}.`:'';
      return `${good}${avoid} Based on ${ratings.length} rated adventure${ratings.length===1?'':'s'}.`;
    },
    updateLearning(a,score,tags=[]) {
      const learn=store.data.learning;
      const delta=score===2?2:score===1?1:-2;
      const kind=a.destination?.kind;
      if (kind) learn.kindWeights[kind]=this.clamp((learn.kindWeights[kind]||0)+delta,-5,5);
      if (a.vibe) learn.vibeWeights[a.vibe]=this.clamp((learn.vibeWeights[a.vibe]||0)+delta,-5,5);
      tags.forEach(t=>{
        const sign=this.positiveTags.has(t)?1:-1;
        learn.tagWeights[t]=this.clamp((learn.tagWeights[t]||0)+(delta>0?sign:-sign),-5,5);
      });
      learn.ratings.push({adventureId:a.id,score,tags,kind,vibe:a.vibe,at:Date.now()});
      if (learn.ratings.length>80) learn.ratings=learn.ratings.slice(-80);
    },
    ensureTopbarCapture() {
      const top=document.querySelector('.topbar');
      if (!top || document.getElementById('quickCaptureBtn')) return;
      const b=document.createElement('button');
      b.className='icon-btn'; b.id='quickCaptureBtn'; b.dataset.action='quickCapture';
      b.setAttribute('aria-label','Quick capture this place'); b.textContent='⌖';
      top.appendChild(b);
    },
    encodeVotes(role='mine') {
      const payload={v:3,votes:store.data.coupleVotes?.[role]||{}};
      return 'OFFCOURSE3-'+btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    },
    decodeVotes(code) {
      const raw=String(code||'').trim().replace(/^OFFCOURSE3-/,'');
      const data=JSON.parse(decodeURIComponent(escape(atob(raw))));
      return data?.votes||{};
    }
  };

  V3.ensureData();

  // Preserve working v2 functions so unknown actions and fallbacks remain available.
  const v2Action=app.action.bind(app);
  const v2SettingsView=app.settingsView?.bind(app);
  const v2OpenSeedDetail=app.openSeedDetail?.bind(app);

  app.v3=V3;

  app.homeView=function() {
    const active=store.data.activeAdventure;
    const returns=this.returnQuestCandidatesV3();
    const matches=this.coupleMatchesV3();
    const taste=V3.tasteSummary();
    const lastRated=[...store.data.adventures].reverse().find(a=>a.rating);
    return `
      <section class="hero">
        <div class="eyebrow">Offcourse v3 · learns what you love</div>
        <h1>Don't plan it.<br><em>Go find it.</em></h1>
        <p class="lede">Mystery adventures that learn your taste, remember unfinished curiosity, and deliberately get you somewhere worth going.</p>
      </section>
      ${active?`<div class="card highlight clickable adventure-card" data-action="resumeAdventure">
        <div class="eyebrow">Adventure in progress</div><h2>${V3.e(active.title)}</h2><p>${V3.e(active.subtitle)}</p>
        <div class="progress"><span style="width:${Math.round((active.step/active.steps.length)*100)}%"></span></div><p class="note">Tap to continue →</p>
      </div>`:''}
      <div class="grid two section">
        <article class="card clickable big-action highlight" data-action="startDisappear"><div class="icon">🧭</div><div><strong>Disappear</strong><p>Smart-scored mystery destination. Reveal it piece by piece.</p></div></article>
        <article class="card clickable big-action" data-action="outsideComfort"><div class="icon">↯</div><div><strong>Not my usual</strong><p>Deliberately choose something outside what Offcourse thinks you normally pick.</p></div></article>
      </div>
      <div class="grid two section">
        <article class="card clickable v3-quick" data-action="quickCapture"><div class="eyebrow">ONE TAP</div><h3>⌖ Remember this place</h3><p>Save your current location now. Explain why later.</p></article>
        <article class="card clickable v3-quick" data-action="discoverNearbyV3"><div class="eyebrow">SMART DISCOVERY</div><h3>✦ Score what's nearby</h3><p>Rank nearby places using novelty, weather, distance and what you've liked before.</p></article>
      </div>
      <section class="section">
        <div class="section-head"><div><div class="eyebrow">YOUR ADVENTURE TASTE</div><h2>Offcourse is learning</h2></div><span class="taste-count">${store.data.learning.ratings.length} ratings</span></div>
        <div class="card taste-card"><p>${V3.e(taste)}</p>${lastRated?`<small>Last rated: ${V3.e(lastRated.title)} · ${ratingLabel(lastRated.rating)}</small>`:''}</div>
      </section>
      ${returns[0]?`<section class="section"><div class="section-head"><div><div class="eyebrow">RETURN QUEST</div><h2>${V3.e(returns[0].title)}</h2></div><button class="pill" data-route="returns">See all</button></div>
        <article class="card clickable return-card" data-action="startReturnQuestV3" data-id="${V3.a(returns[0].seed.id)}"><div class="return-icon">↩</div><div><p>${V3.e(returns[0].reason)}</p><small>${V3.e(returns[0].condition)}</small></div></article></section>`:''}
      <div class="stat-row">
        <div class="stat"><b>${store.data.seeds.length}</b><small>Seeds</small></div>
        <div class="stat"><b>${store.data.adventures.length}</b><small>Adventures</small></div>
        <div class="stat"><b>${matches.hard.length}</b><small>Couple matches</small></div>
      </div>
      <section class="section"><div class="section-head"><div><div class="eyebrow">UNFINISHED CURIOSITY</div><h2>Adventure Seeds</h2></div><button class="pill" data-action="newSeed">＋ Add</button></div>${this.seedList(store.data.seeds.slice(0,3))}</section>
    `;
  };

  app.disappearView=function() {
    const preferred=store.data.settings.adventureMode||'smart';
    return `
      <section class="hero"><div class="eyebrow">Mystery engine v3</div><h1>How far off-course?</h1><p class="lede">Offcourse scores real places, hides the destination, and reveals just enough to keep you moving.</p></section>
      <form id="disappearForm" class="card" onsubmit="return false;">
        <div class="field"><label>How much time?</label><div class="pill-row">${this.choicePills('time',[['2','2 hours'],['4','Half day'],['8','Full day'],['24','Overnight']],'4')}</div></div>
        <div class="field"><label>Maximum spend</label><div class="pill-row">${this.choicePills('budget',[['0','$0'],['50','$50'],['100','$100'],['250','$250+']],'100')}</div></div>
        <div class="field"><label>How far can you roam?</label><div class="pill-row">${this.choicePills('range',[['10','10 km'],['40','40 km'],['100','100 km'],['250','Anywhere']],'40')}</div></div>
        <div class="field"><label>Today's vibe</label><div class="pill-row">${Object.entries(vibes).map(([k,v],i)=>`<button type="button" class="pill ${i===0?'active':''}" data-choice-group="vibe" data-value="${k}">${v.icon} ${V3.e(v.label)}</button>`).join('')}</div></div>
        <div class="field"><label>How should Offcourse choose?</label><div class="pill-row">
          <button type="button" class="pill ${preferred==='smart'?'active':''}" data-choice-group="adventureMode" data-value="smart">✦ Best fit</button>
          <button type="button" class="pill ${preferred==='outside'?'active':''}" data-choice-group="adventureMode" data-value="outside">↯ Outside my usual</button>
        </div></div>
        <button class="btn wide" data-action="generateAdventureV3">Choose my mystery destination</button>
        <p class="note">The destination name and Maps button stay hidden until the reveal stage. Live discovery needs internet; saved/offline adventures do not.</p>
      </form>`;
  };

  app.activeView=function() {
    const a=store.data.activeAdventure;
    if(!a){ setTimeout(()=>this.go('home'),0); return ''; }
    const current=a.steps[a.step-1], progress=Math.round((a.step/a.steps.length)*100);
    const canProximity=a.destination && a.step<a.revealIndex;
    const packSaved=store.data.offlinePacks.some(p=>p.adventureId===a.id);
    return `
      <section class="hero"><div class="eyebrow">Adventure ${String(a.number).padStart(3,'0')}</div><h1>${V3.e(a.title)}</h1><p class="lede">${V3.e(a.subtitle)}</p></section>
      ${a.live?.length?`<div class="live-strip">${a.live.map(x=>`<span>${V3.e(x)}</span>`).join('')}</div>`:''}
      <div class="card adventure-card v3-clue">
        <div class="section-head"><div><div class="eyebrow">CLUE ${a.step} OF ${a.steps.length}</div><h2>${V3.e(current.heading)}</h2></div><b>${progress}%</b></div>
        <p class="clue-text">${V3.e(current.text)}</p>${current.tip?`<p class="note">${V3.e(current.tip)}</p>`:''}
        ${current.reveal&&a.destination?`<div class="reveal-box"><span>DESTINATION UNLOCKED</span><strong>${V3.e(a.destination.name)}</strong><button class="btn secondary wide" data-action="openInMaps" data-lat="${a.destination.lat}" data-lng="${a.destination.lng}">Open in Maps</button></div>`:''}
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
      ${canProximity?`<button class="btn secondary wide section" data-action="checkProximity">⌖ Am I close enough to reveal it?</button>`:''}
      ${current.choices?`<section class="section"><div class="eyebrow">Choose what happens next</div><div class="choice-grid">${current.choices.map(c=>`<button class="choice" data-action="advanceAdventure" data-choice="${V3.a(c)}">${V3.e(c)}</button>`).join('')}</div></section>`:`<div class="section"><button class="btn wide" data-action="advanceAdventure">${a.step===a.steps.length?'Rate & finish':'Done — reveal next clue'}</button></div>`}
      <div class="row section">
        <button class="btn ghost grow" data-action="saveOfflinePack">${packSaved?'✓ Offline pack saved':'⇩ Save offline pack'}</button>
        <button class="btn ghost" data-action="finishAdventureV3">Finish</button>
      </div>`;
  };

  app.nearbyView=function() {
    const config={range:40,vibe:'adventure'};
    const ranked=V3.rankPlaces(store.data.nearby||[],config,this.context.weather,'smart');
    return `<section class="hero"><div class="eyebrow">Smart discovery</div><h1>Worth going, not just nearby.</h1><p class="lede">Each place gets an Offcourse score based on novelty, distance, live conditions and what you've liked before.</p></section>
      <button class="btn wide" data-action="discoverNearbyV3">⌖ Rescore nearby places</button>
      ${this.context.weather?this.weatherCard(this.context.weather):''}
      <section class="section">${ranked.length?`<div class="discovery-grid">${ranked.map(p=>this.placeCardV3(p)).join('')}</div>`:this.empty('⌖','Nothing loaded yet','Tap refresh and allow location access.')}</section>`;
  };

  app.placeCardV3=function(p) {
    const reasons=(p._v3?.reasons||[]).map(x=>`<span>${V3.e(x)}</span>`).join('');
    return `<article class="card place-card scored-place">
      <div class="place-top"><span class="place-icon">${placeIcon(p.kind)}</span><div><div class="eyebrow">${V3.e(p.kindLabel||'DISCOVERY')}</div><h3>${V3.e(p.name)}</h3></div><div class="score-ring">${p._v3?.score??'—'}</div></div>
      <p>${V3.e(p.description||placeDescription(p.kind))}</p><div class="reason-chips">${reasons}</div>
      <div class="row"><button class="btn secondary grow" data-action="startPlaceAdventureV3" data-id="${V3.a(p.id)}">Make this a mystery</button><button class="btn secondary" data-action="savePlaceSeed" data-id="${V3.a(p.id)}">＋ Seed</button></div>
    </article>`;
  };

  app.historyView=function() {
    const arr=[...store.data.adventures].sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
    return `<section class="hero"><div class="eyebrow">Adventure memory</div><h1>Your world, remembered.</h1><p class="lede">The useful bit is not the streak. It is remembering what was actually worth doing again.</p></section>
      ${arr.length?`<div class="memory-timeline">${arr.map(a=>`
        <article class="card memory-card">
          <div class="memory-line"><span>${vibes[a.vibe]?.icon||'🧭'}</span></div>
          <div class="grow"><div class="eyebrow">${V3.date(a.completedAt||a.startedAt)} ${a.destination?`· ${V3.e(a.destination.kindLabel||placeKindLabel(a.destination.kind)||'place')}`:''}</div>
          <h3>${V3.e(a.destination?.name||a.title)}</h3><p>${V3.e(a.subtitle||'')}</p>
          ${a.rating?`<div class="memory-rating">${ratingLabel(a.rating)} ${(a.ratingTags||[]).map(t=>`<span>${V3.e(V3.ratingTags.find(x=>x[0]===t)?.[2]||t)}</span>`).join('')}</div>`:`<button class="pill mini" data-action="ratePastAdventure" data-id="${V3.a(a.id)}">Rate this</button>`}
          </div>
          ${a.destination?`<button class="icon-btn" data-action="chainAdventure" data-id="${V3.a(a.id)}" title="Continue from here">↗</button>`:''}
        </article>`).join('')}</div>`:this.empty('🧭','No adventures yet','Finish an adventure and it becomes part of your personal map.')}`;
  };

  app.worldView=function() {
    const geoSeeds=store.data.seeds.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));
    const trips=store.data.adventures.filter(a=>Number.isFinite(a.destination?.lat)&&Number.isFinite(a.destination?.lng));
    return `<section class="hero"><div class="eyebrow">Your world</div><h1>Reveal your own map.</h1><p class="lede">Seeds are unfinished curiosity. Glowing zones are places you've actually explored.</p></section>
      <div class="world-legend"><span>✦ ${geoSeeds.length} seeds</span><span>◉ ${trips.length} explored</span><span>⇩ ${store.data.offlinePacks.length} offline packs</span></div>
      <div id="map" class="map"></div>
      <section class="section"><div class="section-head"><div><h2>${trips.length} explored places</h2><p>Every completed destination reveals another piece of your map.</p></div></div>
      ${trips.slice(-5).reverse().map(a=>`<article class="card compact-trip"><strong>${V3.e(a.destination.name)}</strong><span>${ratingLabel(a.rating)||'Not rated yet'}</span></article>`).join('')}</section>`;
  };

  app.initMap=function() {
    const container=$('#map');
    if(!container||typeof L==='undefined'){ if(container)container.innerHTML='<div class="empty">Map needs an internet connection the first time it loads.</div>'; return; }
    if(this.map){ this.map.remove(); this.map=null; }
    const seeds=store.data.seeds.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));
    const trips=store.data.adventures.filter(a=>Number.isFinite(a.destination?.lat)&&Number.isFinite(a.destination?.lng));
    const first=trips.at(-1)?.destination||seeds[0]||{lat:-34.9285,lng:138.6007};
    this.map=L.map('map',{zoomControl:false}).setView([first.lat,first.lng],(seeds.length||trips.length)?9:7);
    L.control.zoom({position:'bottomright'}).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(this.map);
    const bounds=[];
    trips.forEach(a=>{
      const d=a.destination, loved=a.rating===2;
      L.circle([d.lat,d.lng],{radius:loved?2600:1600,weight:1,fillOpacity:loved?.18:.1}).addTo(this.map)
        .bindPopup(`<b>${V3.e(d.name)}</b><br>${ratingLabel(a.rating)||'Explored'}`);
      bounds.push([d.lat,d.lng]);
    });
    seeds.forEach(s=>{ L.marker([s.lat,s.lng]).addTo(this.map).bindPopup(`<b>${V3.e(s.title)}</b><br>${V3.e(s.note||'Adventure Seed')}`); bounds.push([s.lat,s.lng]); });
    if(bounds.length>1)this.map.fitBounds(bounds,{padding:[30,30]});
  };

  app.coupleView=function() {
    const ideas=(typeof coupleIdeas!=='undefined'?coupleIdeas:[]);
    const role=this.coupleRole||'mine';
    const mine=store.data.coupleVotes.mine||{}, partner=store.data.coupleVotes.partner||{};
    const matches=this.coupleMatchesV3();
    return `<section class="hero"><div class="eyebrow">Private matching</div><h1>What would you actually both do?</h1><p class="lede">Vote Keen, Maybe or No. Hard matches only appear when you both independently choose Keen.</p></section>
      <div class="segmented"><button class="${role==='mine'?'active':''}" data-action="setCoupleRoleV3" data-role="mine">${V3.e(store.data.profile.name||'Me')}</button><button class="${role==='partner'?'active':''}" data-action="setCoupleRoleV3" data-role="partner">${V3.e(store.data.profile.partner||'Partner')}</button></div>
      ${matches.hard.length?`<div class="card highlight section"><div class="eyebrow">MATCHED</div><h2>${matches.hard.length} things you both want</h2><div class="match-wrap">${matches.hard.map(id=>{const i=ideas.find(x=>x[0]===id);return i?`<button class="match-chip" data-action="startCoupleMatch" data-id="${id}">${i[1]} ${V3.e(i[2])}</button>`:''}).join('')}</div></div>`:''}
      ${matches.soft.length?`<div class="card section"><div class="eyebrow">ALMOST</div><p>${matches.soft.map(id=>ideas.find(x=>x[0]===id)?.[2]).filter(Boolean).map(V3.e.bind(V3)).join(' · ')}</p></div>`:''}
      <div class="vote-grid section">${ideas.map(([id,icon,label])=>{
        const vote=store.data.coupleVotes[role]?.[id]||'';
        return `<article class="card vote-card"><span class="vote-icon">${icon}</span><strong>${V3.e(label)}</strong><div class="vote-buttons">
          <button class="${vote==='keen'?'selected':''}" data-action="coupleVote" data-id="${id}" data-vote="keen">Keen</button>
          <button class="${vote==='maybe'?'selected':''}" data-action="coupleVote" data-id="${id}" data-vote="maybe">Maybe</button>
          <button class="${vote==='no'?'selected no':''}" data-action="coupleVote" data-id="${id}" data-vote="no">No</button>
        </div></article>`;
      }).join('')}</div>
      <div class="card section"><div class="eyebrow">TWO-PHONE MODE</div><p class="note">Share only your vote code. Your partner can import it on their phone; no account is required.</p>
      <div class="row"><button class="btn secondary grow" data-action="shareVotesV3">Share my picks</button><button class="btn secondary grow" data-action="importVotesV3">Import partner picks</button></div></div>`;
  };

  app.coupleMatchesV3=function() {
    const a=store.data.coupleVotes.mine||{}, b=store.data.coupleVotes.partner||{};
    const ids=new Set([...Object.keys(a),...Object.keys(b)]), hard=[],soft=[];
    ids.forEach(id=>{
      if(a[id]==='keen'&&b[id]==='keen')hard.push(id);
      else if((a[id]==='keen'&&b[id]==='maybe')||(a[id]==='maybe'&&b[id]==='keen'))soft.push(id);
    });
    return {hard,soft};
  };

  app.returnsView=function() {
    const q=this.returnQuestCandidatesV3();
    return `<section class="hero"><div class="eyebrow">Return Quests 2.0</div><h1>The right reason to go back.</h1><p class="lede">Older saved thoughts rise when they have enough age, curiosity and—when live conditions are known—the right weather.</p></section>
      ${q.length?`<div class="list">${q.map(x=>`<article class="card clickable return-card" data-action="startReturnQuestV3" data-id="${V3.a(x.seed.id)}"><div class="return-icon">${iconForSeed(x.seed.category)}</div><div><div class="eyebrow">SCORE ${x.score}</div><h3>${V3.e(x.title)}</h3><p>${V3.e(x.reason)}</p><small>${V3.e(x.condition)}</small></div></article>`).join('')}</div>`:this.empty('↩','No Return Quests yet','Save places you want to revisit and Offcourse will bring them back later.')}`;
  };

  app.returnQuestCandidatesV3=function() {
    const now=Date.now(), w=this.context.weather;
    return store.data.seeds.map(seed=>{
      const ageDays=Math.max(0,(now-(seed.updatedAt||seed.createdAt||now))/86400000);
      let score=Math.min(45,ageDays/3), reason='You saved this and never closed the loop.', condition='Good whenever you have the time.';
      const text=`${seed.title||''} ${seed.note||''}`.toLowerCase();
      if(seed.category==='question'||/\?|wonder|where|what|check|explore/.test(text)){score+=24;reason='This is an unanswered question, not just a saved pin.';}
      if(/tide|low tide/.test(text)){score+=18;condition='Tide-aware timing is not live yet — check the local tide before leaving.';}
      if(/sunset|golden|sunrise/.test(text)){score+=14;condition=w?.sunset?`Today’s sunset: ${w.sunset}.`:'Best timed around changing light.';}
      if(w){
        if(Number(w.rainChance||0)<=20){score+=5;condition=condition==='Good whenever you have the time.'?'Dry conditions favour a return today.':condition;}
        if(Number(w.wind||0)>=35 && seed.category==='coast'){score-=12;condition='Wind is high; a calmer day may suit this coastal return better.';}
      }
      const already=store.data.adventures.some(a=>a.sourceSeedId===seed.id);
      if(already)score-=25;
      return {seed,score:Math.round(V3.clamp(score,0,100)),title:`Go back to ${seed.title}`,reason,condition};
    }).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score);
  };

  app.settingsView=function() {
    const base=v2SettingsView?v2SettingsView():'';
    const insert=`<section class="section"><div class="card"><div class="eyebrow">V3 LEARNING</div><h3>Your adventure taste</h3><p>${V3.e(V3.tasteSummary())}</p>
      <div class="row"><button class="btn secondary grow" data-action="clearLearning">Reset taste learning</button><button class="btn secondary grow" data-route="couple">Couple preferences</button></div></div>
      <div class="card section"><div class="eyebrow">OFFLINE PACKS</div><h3>${store.data.offlinePacks.length} saved</h3><p class="note">An offline pack stores the full mystery adventure and asks the service worker to cache a small map area around the destination.</p></div></section>`;
    return base+insert;
  };

  app.generateAdventureV3=async function(forceMode=null) {
    const config={time:+this.selected('time')||4,budget:+this.selected('budget')||100,range:+this.selected('range')||40,vibe:this.selected('vibe')||'adventure'};
    const mode=forceMode||this.selected('adventureMode')||store.data.settings.adventureMode||'smart';
    store.data.settings.adventureMode=mode; store.save();
    this.toast(mode==='outside'?'Finding something you would not normally choose…':'Scoring real places…');
    try{
      const loc=await this.getLocation(); this.context.location=loc;
      const [weather,places]=await Promise.all([this.fetchWeather(loc.lat,loc.lng),this.fetchNearbyPlaces(loc.lat,loc.lng,Math.min(config.range,45))]);
      this.context.weather=weather;
      const ranked=V3.rankPlaces(places,config,weather,mode);
      const chosen=V3.pickWeighted(ranked);
      if(!chosen) throw new Error('no-places');
      store.data.nearby=ranked.map(({_v3,...p})=>p);
      store.data.activeAdventure=V3.makeMysteryAdventure(chosen,config,weather,mode);
      store.save(); this.go('active');
    }catch(err){
      console.warn(err);
      this.toast('Live discovery failed — using an offline mystery');
      this.makeInstantAdventure();
    }
  };

  app.discoverNearbyV3=async function() {
    this.toast('Scoring nearby places…');
    try{
      const loc=await this.getLocation(); this.context.location=loc;
      const [weather,places]=await Promise.all([this.fetchWeather(loc.lat,loc.lng),this.fetchNearbyPlaces(loc.lat,loc.lng,40)]);
      this.context.weather=weather;
      store.data.nearby=V3.rankPlaces(places,{range:40,vibe:'adventure'},weather,'smart').map(({_v3,...p})=>p);
      store.save(); this.route='nearby'; this.render();
    }catch(e){ console.warn(e); this.toast('Could not load live discovery'); this.go('nearby'); }
  };

  app.startPlaceAdventureV3=function(id) {
    const p=(store.data.nearby||[]).find(x=>x.id===id); if(!p)return;
    const scored={...p,_v3:V3.scorePlace(p,{range:Math.max(10,p.distance*1.4),vibe:'adventure'},this.context.weather,'smart')};
    const config={time:4,budget:50,range:Math.ceil(Math.max(10,p.distance*1.3)),vibe:'adventure'};
    store.data.activeAdventure=V3.makeMysteryAdventure(scored,config,this.context.weather,'chosen');
    store.save(); this.go('active');
  };

  app.startReturnQuestV3=function(id) {
    const s=store.data.seeds.find(x=>x.id===id); if(!s)return;
    if(!Number.isFinite(s.lat))return this.toast('This seed needs a saved location first');
    const p={id:`seed-${s.id}`,name:s.title,lat:s.lat,lng:s.lng,distance:this.context.location?haversine(this.context.location.lat,this.context.location.lng,s.lat,s.lng):0,kind:s.category==='coast'?'beach':s.category==='food'?'food':'other',kindLabel:'Return Quest',description:s.note||'Finish what you started.'};
    p._v3={score:90,reasons:['unfinished curiosity']};
    const config={time:4,budget:50,range:Math.max(10,Math.ceil(p.distance*1.3)),vibe:s.category==='together'?'romantic':s.category==='coast'?'coast':'adventure'};
    const a=V3.makeMysteryAdventure(p,config,this.context.weather,'return');
    a.title='Return Quest'; a.sourceSeedId=s.id;
    a.steps[2].text=s.note?`You wrote: “${s.note}”. Go back and actually answer that thought.`:'You saved this place for a reason. Go back and work out what that reason was.';
    store.data.activeAdventure=a; store.save(); this.go('active');
  };

  app.checkProximityV3=async function() {
    const a=store.data.activeAdventure; if(!a?.destination)return;
    try{
      const loc=await this.getLocation(), d=haversine(loc.lat,loc.lng,a.destination.lat,a.destination.lng);
      if(d<=2.2){ a.step=Math.max(a.step,a.revealIndex||4); store.save(); this.haptic(); this.toast(`You're ${d<1?Math.round(d*1000)+' m':d.toFixed(1)+' km'} away — destination revealed`); this.render(); }
      else this.toast(`Still about ${Math.round(d)} km away`);
    }catch{ this.toast('Could not check your location'); }
  };

  app.finishAdventureV3=function(pastId=null) {
    const a=pastId?store.data.adventures.find(x=>x.id===pastId):store.data.activeAdventure;
    if(!a)return;
    this.openRatingSheetV3(a,!!pastId);
  };

  app.openRatingSheetV3=function(a,isPast=false) {
    this.openSheet(`<div class="sheet-head"><div><div class="eyebrow">Teach Offcourse</div><h2>How was it?</h2></div><button class="close" data-action="closeSheet">×</button></div>
      <p class="sheet-note">${V3.e(a.destination?.name||a.title)}</p>
      <div class="rating-big"><button data-action="saveRatingV3" data-id="${V3.a(a.id)}" data-score="2" data-past="${isPast?'1':'0'}">♥<b>Loved it</b></button><button data-action="saveRatingV3" data-id="${V3.a(a.id)}" data-score="1" data-past="${isPast?'1':'0'}">✓<b>Good</b></button><button data-action="saveRatingV3" data-id="${V3.a(a.id)}" data-score="-2" data-past="${isPast?'1':'0'}">×<b>Not for me</b></button></div>
      <div class="field"><label>What made it that way? <span class="note">optional</span></label><div class="rate-tags">${V3.ratingTags.map(([id,ic,label])=>`<button type="button" data-action="toggleRateTag" data-tag="${id}">${ic} ${V3.e(label)}</button>`).join('')}</div></div>
      ${!isPast?`<button class="btn ghost wide" data-action="finishWithoutRating">Skip rating</button>`:''}`);
  };

  app.saveRatingV3=function(id,score,isPast=false) {
    let a=isPast?store.data.adventures.find(x=>x.id===id):store.data.activeAdventure;
    if(!a)return;
    const tags=$$('.rate-tags button.selected').map(b=>b.dataset.tag);
    a.rating=Number(score); a.ratingTags=tags;
    if(!a.completedAt)a.completedAt=Date.now();
    // Avoid teaching twice when re-rating.
    if(!a._learningApplied){ V3.updateLearning(a,Number(score),tags); a._learningApplied=true; }
    if(!isPast){
      store.data.adventures.push(a); store.data.activeAdventure=null;
      if(a.destination)store.data.explored.push({lat:a.destination.lat,lng:a.destination.lng,name:a.destination.name,at:a.completedAt,rating:a.rating});
    }
    store.save(); this.closeSheet(); this.toast('Offcourse learned from that'); this.go('history');
  };

  app.finishWithoutRatingV3=function() {
    const a=store.data.activeAdventure;if(!a)return;
    a.completedAt=Date.now(); store.data.adventures.push(a); store.data.activeAdventure=null; store.save(); this.closeSheet(); this.go('history');
  };

  app.quickCaptureV3=async function() {
    this.toast('Saving this spot…');
    try{
      const loc=await this.getLocation(), now=Date.now();
      const s={id:uid(),title:'Spotted this',note:'Quick-captured here. Add why it caught your attention later.',category:'question',lat:loc.lat,lng:loc.lng,photoId:null,createdAt:now,updatedAt:now,quick:true};
      store.data.seeds.unshift(s); store.data.quickCaptures.unshift(s.id); store.save(); this.haptic(); this.toast('Saved. Explain it later.');
      if(this.route==='seeds'||this.route==='home')this.render();
    }catch{ this.toast('Location is needed for one-tap capture'); }
  };

  app.saveOfflinePackV3=function() {
    const a=store.data.activeAdventure;if(!a)return;
    if(!store.data.offlinePacks.some(p=>p.adventureId===a.id)){
      store.data.offlinePacks.unshift({id:uid(),adventureId:a.id,title:a.destination?.name||a.title,destination:a.destination,steps:a.steps,live:a.live||[],savedAt:Date.now()});
      store.save();
      if(navigator.serviceWorker?.controller && a.destination) navigator.serviceWorker.controller.postMessage({type:'CACHE_TILES',lat:a.destination.lat,lng:a.destination.lng});
      this.toast('Offline pack saved'); this.render();
    }else this.toast('Already saved offline');
  };

  app.chainAdventureV3=async function(id) {
    const a=store.data.adventures.find(x=>x.id===id); if(!a?.destination)return;
    this.toast('Finding the next chapter…');
    try{
      const places=await this.fetchNearbyPlaces(a.destination.lat,a.destination.lng,25);
      const config={time:3,budget:50,range:25,vibe:a.vibe||'adventure'};
      const ranked=V3.rankPlaces(places.filter(p=>p.id!==a.destination.id),config,this.context.weather,'smart');
      const next=V3.pickWeighted(ranked);
      if(!next)throw new Error();
      const n=V3.makeMysteryAdventure(next,config,this.context.weather,'chain'); n.parentAdventureId=a.id; n.title='Continue from here';
      store.data.activeAdventure=n;store.save();this.go('active');
    }catch{this.toast('Could not find a new nearby chapter right now');}
  };

  app.coupleVoteV3=function(id,vote) {
    store.data.coupleVotes[this.coupleRole||'mine'] ||= {};
    store.data.coupleVotes[this.coupleRole||'mine'][id]=vote; store.save(); this.haptic(); this.render();
  };

  app.startCoupleMatchV3=function(id) {
    const idea=(typeof coupleIdeas!=='undefined'?coupleIdeas:[]).find(x=>x[0]===id);
    const map={ 'sunset-drive':'romantic','beach-picnic':'coast','camp-night':'adventure','new-town':'wild','snorkel':'coast','fishing':'coast','hike':'adventure','weird-roadside':'weird','food-mission':'chill','photo-walk':'chill','no-plan':'wild','sunrise':'adventure' };
    this.go('disappear');
    setTimeout(()=>{
      const vibe=map[id]||'adventure';
      $$('[data-choice-group="vibe"]').forEach(b=>b.classList.toggle('active',b.dataset.value===vibe));
      this.toast(`${idea?.[2]||'Match'} loaded — choose the boundaries`);
    },0);
  };

  app.savePlaceSeedV3=function(id) {
    const p=(store.data.nearby||[]).find(x=>x.id===id);if(!p)return;
    const now=Date.now();
    store.data.seeds.unshift({id:uid(),title:p.name,note:'Found through Offcourse discovery. Come back and investigate properly.',category:p.kind==='beach'?'coast':p.kind==='food'?'food':'explore',lat:p.lat,lng:p.lng,photoId:null,createdAt:now,updatedAt:now});
    store.save();this.toast('Saved as an Adventure Seed');
  };

  const originalAdvance=app.advanceAdventure?.bind(app);
  app.advanceAdventure=function(choice) {
    const a=store.data.activeAdventure;if(!a)return;
    if(choice)a.lastChoice=choice;
    if(a.step<a.steps.length){a.step++;store.save();this.haptic();this.render();}
    else this.finishAdventureV3();
  };

  const originalAction=app.action.bind(app);
  app.action=async function(name,el) {
    const h={
      generateAdventureV3:()=>this.generateAdventureV3(),
      outsideComfort:()=>{store.data.settings.adventureMode='outside';store.save();this.go('disappear');},
      discoverNearbyV3:()=>this.discoverNearbyV3(),
      startPlaceAdventureV3:()=>this.startPlaceAdventureV3(el.dataset.id),
      startReturnQuestV3:()=>this.startReturnQuestV3(el.dataset.id),
      checkProximity:()=>this.checkProximityV3(),
      finishAdventureV3:()=>this.finishAdventureV3(),
      ratePastAdventure:()=>this.finishAdventureV3(el.dataset.id),
      toggleRateTag:()=>{el.classList.toggle('selected');},
      saveRatingV3:()=>this.saveRatingV3(el.dataset.id,Number(el.dataset.score),el.dataset.past==='1'),
      finishWithoutRating:()=>this.finishWithoutRatingV3(),
      quickCapture:()=>this.quickCaptureV3(),
      saveOfflinePack:()=>this.saveOfflinePackV3(),
      chainAdventure:()=>this.chainAdventureV3(el.dataset.id),
      setCoupleRoleV3:()=>{this.coupleRole=el.dataset.role||'mine';this.render();},
      coupleVote:()=>this.coupleVoteV3(el.dataset.id,el.dataset.vote),
      startCoupleMatch:()=>this.startCoupleMatchV3(el.dataset.id),
      savePlaceSeed:()=>this.savePlaceSeedV3(el.dataset.id),
      shareVotesV3:async()=>{
        const code=V3.encodeVotes(this.coupleRole||'mine');
        try{ if(navigator.share)await navigator.share({title:'Offcourse picks',text:code}); else {await navigator.clipboard.writeText(code);this.toast('Vote code copied');} }catch{}
      },
      importVotesV3:()=>{
        const code=prompt('Paste your partner’s OFFCOURSE3 code');if(!code)return;
        try{store.data.coupleVotes.partner=V3.decodeVotes(code);store.save();this.toast('Partner picks imported');this.render();}catch{this.toast('That code could not be read');}
      },
      clearLearning:()=>{if(confirm('Reset what Offcourse has learned from your ratings?')){store.data.learning={ratings:[],kindWeights:{},vibeWeights:{},tagWeights:{}};store.save();this.toast('Taste learning reset');this.render();}}
    };
    if(h[name])return h[name]();
    // Redirect v2 finish into rating flow.
    if(name==='finishAdventure')return this.finishAdventureV3();
    if(name==='startPlaceAdventure')return this.startPlaceAdventureV3(el.dataset.id);
    if(name==='startReturnQuest')return this.startReturnQuestV3(el.dataset.id);
    if(name==='discoverNearby')return this.discoverNearbyV3();
    return originalAction(name,el);
  };

  // Utility labels kept local to the overlay.
  function ratingLabel(r) {
    return r===2?'♥ Loved it':r===1?'✓ Good':r===-2?'× Not for me':'';
  }

  V3.ensureTopbarCapture();
  // Re-render after patching views/actions. Existing app event listeners keep working.
  app.render();
})();
