/* CAVELUX REASON reel. Frame-addressable composition: 900 frames / 30 fps / 1080 x 1920.
   The Clawd is drawn only through film.js renderCharacterPreview (character-only mode);
   this file never reads or edits sprite pixels. Every word comes from register.json. */
(() => {
  'use strict';
  const W = 1080, H = 1920, FPS = 30;
  const BG = '#000000', INK = '#FFFFFF', DIM = '#B9BDB4', MUTED = '#737984', BORDER = '#555C68';
  const LIME = '#92FA11', RED = '#FF2D3F', PANEL = '#0B0C0F', SIDEBAR = '#08090B', ROW = '#101216';
  const CAPTION_SIZE = 54, CAPTION_FONT = `500 ${CAPTION_SIZE}px Bahnschrift, Arial, sans-serif`;
  const MONO = size => `${size}px Consolas, monospace`;
  // Captions stay inside the Reels safe zone and left of the right-side action rail (x > 936).
  // CAPTION_X 84 = the chat panel's and card's left edge (one left edge across beats).
  const CAPTION_X = 84, CAPTION_MAX = 800, CAPTION_TOP = 1180, ROW_H = 68, LINE_GAP = 18, CAPTION_RIGHT = 936, CAPTION_BOTTOM = 1490;
  // The hook eye fills the empty space above the captions: the mark's visible part is about 760 px wide.
  const EYE_HOOK = {x: 540, y: 712, w: 1160};
  const FLOOR = 1060, DOOR = {x0: 700, x1: 900, top: 640}, EYE_MOUNT = {x: 800, y: 474, w: 112};
  const canvas = document.getElementById('reel');
  // alpha:true on purpose: Chromium draws subpixel (LCD) text on opaque canvases, and those colour fringes
  // survive 4:2:0. Every frame is filled black first, so the output stays fully opaque.
  const ctx = canvas.getContext('2d', {alpha: true, willReadFrequently: true});
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const out3 = t => 1 - Math.pow(1 - clamp(t), 3);
  const inout = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const rng = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const img = {};
  const mascotCanvas = document.createElement('canvas'); mascotCanvas.width = 280; mascotCanvas.height = 400;
  let register, timeline, beats, claims, labels, claimLines, plan = [], cues, sceneAlpha = 1;
  window.reelText = null; // optional array a checker installs to log every drawn string

  // ---- text guard: claim lines (or a typed part of one) and the closed label set only ----
  function allowed(s) { return labels.has(s) || claimLines.some(line => line.includes(s)); }
  function guard(s) {
    if (!s) return false;
    if (!allowed(s)) throw new Error('Text outside the claims register and label set: ' + JSON.stringify(s));
    if (window.reelText) window.reelText.push(s);
    return true;
  }
  // Typography applied after the register check: curly quotes for ASCII ', and a hair space between
  // 'r' and ':' (Bahnschrift's r arm otherwise fuses with the colon's top dot). The words never change.
  function display(s) {
    return s.replace(/(^|\s)'/g, '$1\u2018\u200A').replace(/'\?/g, '\u2019\u200A?').replace(/'/g, '\u2019').replace(/r:/g, 'r\u200A:');
  }
  function write(s, x, y, font, color, alpha = 1, align = 'left') {
    if (!guard(s)) return;
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.fillStyle = color; ctx.font = font;
    ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(display(s), x, y); ctx.restore();
  }
  const measure = (s, font) => { ctx.save(); ctx.font = font; const w = ctx.measureText(display(s)).width; ctx.restore(); return w; };
  function rect(x, y, w, h, color, alpha = 1) { ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.restore(); }
  function line(x1, y1, x2, y2, color, width = 2, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  function roundRect(x, y, w, h, r, fill, stroke, alpha = 1, width = 2) {
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    ctx.restore();
  }
  function image(name, cx, cy, w, alpha = 1, sy = 1) {
    const a = img[name]; if (!a) return; const h = w * a.naturalHeight / a.naturalWidth;
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.translate(cx, cy); ctx.scale(1, sy);
    ctx.drawImage(a, -w / 2, -h / 2, w, h); ctx.restore();
  }
  // Polyline drawn up to a fraction of its length: the engraved art "draws itself".
  function stroke(points, progress, color = INK, width = 2.4, alpha = 1) {
    if (progress <= 0) return;
    let total = 0; for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    let left = total * clamp(progress);
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length && left > 0; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i], d = Math.hypot(bx - ax, by - ay), k = Math.min(1, left / d);
      ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); left -= d;
    }
    ctx.stroke(); ctx.restore();
  }
  function arcPoints(cx, cy, r, a0, a1, n = 24) { const p = []; for (let i = 0; i <= n; i++) { const a = mix(a0, a1, i / n); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }

  // ---- original 5x7 bitmap capitals, drawn as blocks (no font file) ----
  const GLYPHS = {
    A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'], B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
    C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'], E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
    F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '], G: [' ####', '#    ', '#    ', '# ###', '#   #', '#   #', ' ### '],
    I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'], L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
    N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'], O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
    P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '], R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
    S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '], T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
    U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  };
  function pixelText(s, cx, top, px, color = INK, alpha = 1) {
    if (!labels.has(s)) throw new Error('Pixel label outside the label set: ' + JSON.stringify(s));
    if (window.reelText) window.reelText.push(s);
    const width = s.length * 6 * px - px, x0 = Math.round(cx - width / 2);
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.fillStyle = color;
    [...s].forEach((ch, i) => { const g = GLYPHS[ch]; if (!g) throw new Error('No glyph for ' + ch);
      g.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') ctx.fillRect(x0 + (i * 6 + x) * px, top + y * px, px, px); }); });
    ctx.restore();
  }

  // ---- typed captions ----
  function wrap(text, font, maxWidth, breaks) {
    if (breaks) { // hand-set phrase breaks from timeline.json; they must rebuild the line exactly
      if (breaks.join(' ') !== text) throw new Error('Row breaks do not rebuild the line: ' + JSON.stringify(breaks));
      let start = 0; return breaks.map(row => { const r = {text: row, start}; start += row.length + 1; return r; });
    }
    const words = text.split(' '), rows = []; let start = 0, current = '';
    words.forEach((word, i) => {
      const candidate = current ? current + ' ' + word : word;
      if (current && measure(candidate, font) > maxWidth) { rows.push({text: current, start}); start += current.length + 1; current = word; }
      else current = candidate;
      if (i === words.length - 1) rows.push({text: current, start});
    });
    return rows;
  }
  function planCaptions() {
    plan = timeline.captions.map(cap => {
      const claim = claims.get(cap.claim), beat = beats.get(cap.beat), lines = claim.lines;
      if (lines.join(' ') !== claim.text) throw new Error(`${claim.id} lines do not rebuild the registered text`);
      const total = lines.reduce((sum, text) => sum + text.length, 0);
      let starts, rates;
      if (cap.window) {
        const [w0, w1] = cap.window, rate = total / (w1 - w0 - timeline.holdSeconds * (lines.length - 1));
        starts = []; rates = []; let t0 = w0;
        for (const text of lines) { starts.push(t0); rates.push(rate); t0 += text.length / rate + timeline.holdSeconds; }
      } else { starts = cap.lineStarts.slice(); rates = lines.map(() => cap.cps); }
      const font = cap.layout === 'center' ? MONO(46) : CAPTION_FONT;
      let y = cap.top ?? CAPTION_TOP;
      const planned = lines.map((text, i) => {
        const glyphFrames = [...text].map((_, c) => Math.ceil((starts[i] + c / rates[i]) * FPS - 1e-6));
        let rows;
        if (cap.layout === 'center') {
          rows = [{text, start: 0, x: Math.round(540 - measure(text, font) / 2), y: 1052}];
        } else {
          const breaks = timeline.rowBreaks?.[`${claim.id}.${i}`];
          rows = wrap(text, font, cap.maxWidth ?? CAPTION_MAX, breaks).map(row => { y += ROW_H; return {...row, x: cap.x ?? CAPTION_X, y: y - ROW_H + CAPTION_SIZE}; });
          y += LINE_GAP;
        }
        for (const row of rows) {
          row.right = Math.ceil(row.x + measure(row.text, font) + CAPTION_SIZE * .6); // includes the cursor block
          if (row.right > CAPTION_RIGHT || row.y + 16 > CAPTION_BOTTOM || row.y - CAPTION_SIZE < 250 || measure(row.text, font) > (cap.maxWidth ?? CAPTION_MAX) + 1)
            throw new Error(`${claim.id} row outside the Reels caption zone: ${JSON.stringify(row)}`);
        }
        return {text, rows, start: starts[i], rate: rates[i], glyphFrames, lastFrame: glyphFrames[glyphFrames.length - 1]};
      });
      return {claim: claim.id, beat, font, lines: planned};
    });
  }
  function drawCaptions(f, t) {
    for (const cap of plan) {
      if (t < cap.beat.in || t >= cap.beat.out) continue;
      // captions fade on the same curve as the scene envelope (0.12 s at cuts, 0.1 s into the final black)
      const fade = cap.beat.id === 'B8' ? smooth((timeline.blackFrom - t) / .1) : smooth((cap.beat.out - t) / timeline.captionFadeSeconds);
      let active = null;
      for (const ln of cap.lines) {
        let n = 0; while (n < ln.glyphFrames.length && ln.glyphFrames[n] <= f) n++;
        if (!n) continue; active = {ln, n};
        for (const row of ln.rows) { const visible = clamp(n - row.start, 0, row.text.length); if (visible > 0) write(row.text.slice(0, visible), row.x, row.y, cap.font, INK, fade); }
      }
      if (!active) continue;
      const {ln, n} = active, typing = f <= ln.lastFrame;
      if (!typing && Math.floor(t * 4) % 2 === 1) continue; // 2 Hz blink once the line is complete
      let row = ln.rows[0]; for (const r of ln.rows) if (n - r.start >= 0 && n - r.start <= r.text.length) row = r;
      const visible = clamp(n - row.start, 0, row.text.length);
      const x = row.x + measure(row.text.slice(0, visible), cap.font) + 6;
      const size = cap.font === CAPTION_FONT ? CAPTION_SIZE : 46;
      rect(x, row.y - size * .78, size * .48, size * .92, INK, fade);
    }
  }

  // ---- the Clawd, through film.js only ----
  function clawd(state, time, cx, alpha = 1) {
    const d = window.renderCharacterPreview(state, time, mascotCanvas, {background: 'transparent', workingActive: false, aura: false});
    const b = d.heroBounds, x = Math.round(cx - b.width / 2), y = Math.round(FLOOR - b.height);
    ctx.save(); ctx.globalAlpha = alpha * sceneAlpha; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mascotCanvas, b.x, b.y, b.width, b.height, x, y, b.width, b.height); ctx.restore();
    return {x, y, w: b.width, h: b.height};
  }

  // ---- beats ----
  function eyeBlink(t) { let sy = 1; for (const at of timeline.eyeBlinks) { const p = (t - at) / .15; if (p > 0 && p < 1) sy = Math.min(sy, 1 - .9 * Math.sin(Math.PI * p)); } return sy; }
  // Hard cut-in: the eye is at full brightness on frame 0 (the feed's first impression and the loop seam);
  // only its scale settles.
  function hook(t, u) {
    const settle = mix(.94, 1, out3(u / 1.1));
    image('eye', EYE_HOOK.x, EYE_HOOK.y, EYE_HOOK.w * settle, 1, eyeBlink(t));
  }

  // raised 40 px and moved 66 px left: the gavel clears the action rail and the column base lands on x 84,
  // the shared left edge of the captions, the chat panel and the card
  function law(t, u) { ctx.save(); ctx.translate(-66, -40); lawArt(t, u); ctx.restore(); }
  function lawArt(t, u) {
    const p = k => clamp((u - k) / .9);
    // column: shaft, capital, base, fluting
    stroke([[190, 470], [190, 1000]], p(.05)); stroke([[290, 470], [290, 1000]], p(.05));
    stroke([[160, 470], [320, 470], [320, 440], [160, 440], [160, 470]], p(.15)); stroke([[150, 1000], [330, 1000], [330, 1035], [150, 1035], [150, 1000]], p(.15));
    for (let i = 0; i < 5; i++) stroke([[206 + i * 17, 482], [206 + i * 17, 988]], p(.3 + i * .06), INK, 1.2, .7);
    // scales: post, base, beam settling, strings, pans
    const settle = .2 * Math.exp(-1.7 * Math.max(0, u - .6)) * Math.cos(4.2 * Math.max(0, u - .6));
    const cx = 640, beamY = 520, half = 210, ca = Math.cos(settle), sa = Math.sin(settle);
    stroke([[cx, 480], [cx, 990]], p(.1), INK, 3); stroke([[cx - 110, 1030], [cx + 110, 1030], [cx + 60, 990], [cx - 60, 990], [cx - 110, 1030]], p(.2));
    ctx.save(); ctx.beginPath(); ctx.moveTo(cx - 110, 1030); ctx.lineTo(cx + 110, 1030); ctx.lineTo(cx + 60, 990); ctx.lineTo(cx - 60, 990); ctx.closePath(); ctx.clip(); // hatch stays inside the base
    for (let i = 0; i < 6; i++) stroke([[cx - 92 + i * 30, 1026], [cx - 70 + i * 30, 996]], p(.45 + i * .04), INK, 1.1, .6);
    ctx.restore();
    const L = [cx - half * ca, beamY - half * sa], R = [cx + half * ca, beamY + half * sa];
    stroke([L, R], p(.25), INK, 3); stroke(arcPoints(cx, 480, 14, 0, Math.PI * 2, 18), p(.25));
    for (const [px, py] of [L, R]) {
      const panY = py + 190;
      stroke([[px, py], [px - 70, panY]], p(.4), INK, 1.4); stroke([[px, py], [px + 70, panY]], p(.4), INK, 1.4);
      stroke(arcPoints(px, panY, 70, 0, Math.PI, 20), p(.5)); stroke([[px - 70, panY], [px + 70, panY]], p(.5));
      for (let i = 1; i < 5; i++) stroke([[px - 70 + i * 28, panY + 4], [px - 58 + i * 28, panY + 26]], p(.65), INK, 1, .55);
    }
    // gavel at rest on its block
    const g = p(.7);
    stroke([[800, 1035], [960, 1035], [960, 1005], [800, 1005], [800, 1035]], g); for (let i = 0; i < 6; i++) stroke([[812 + i * 24, 1030], [828 + i * 24, 1010]], p(.85), INK, 1, .55);
    stroke([[818, 960], [918, 960], [918, 1000], [818, 1000], [818, 960]], g); stroke([[918, 978], [990, 986]], g, INK, 3); stroke([[918, 990], [990, 994]], g, INK, 1.4, .7);
  }

  // Chat panel spans x 84-920 so nothing framed sits under the Reels action rail (x > 936, y 1000-1700).
  function chatPanel(t, lines, extras = {}) {
    roundRect(84, 300, 836, 820, 18, PANEL, BORDER, 1, 2);
    rect(84 + 2, 302, 178, 816, SIDEBAR, 1); line(264, 302, 264, 1118, BORDER, 1.5, .8);
    for (let i = 0; i < 5; i++) roundRect(108, 380 + i * 54, 120 - (i % 3) * 22, 14, 7, MUTED, null, .45);
    rect(110, 336, 10, 10, LIME, .9);
    for (let i = 0; i < 3; i++) rect(300 + i * 22, 330, 10, 10, BORDER, .9);
    // one user message, wordless
    roundRect(500, 366, 380, 92, 16, ROW, BORDER, 1, 1.5);
    roundRect(528, 394, 300, 12, 6, DIM, null, .55); roundRect(528, 422, 200, 12, 6, DIM, null, .55);
    // THINKING block
    const collapse = extras.collapse ?? 0, open = 1 - collapse;
    const chevronY = 516; ctx.save(); ctx.globalAlpha = sceneAlpha; ctx.translate(314, chevronY - 12); ctx.rotate(open * Math.PI / 2);
    ctx.fillStyle = DIM; ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(9, 0); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill(); ctx.restore(); // narrow (depth 16 > base 12): the 90-degree turn reads as one flip
    write('THINKING', 338, chevronY, MONO(34), DIM, 1);
    const shown = lines * open, top = 548, pitch = 32; // 32 px pitch leaves room above the EFFORT dial
    line(318, top - 10, 318, top - 10 + Math.max(0, shown) * pitch, BORDER, 2, .9 * open);
    for (let i = 0; i < Math.ceil(shown); i++) {
      const a = clamp(shown - i) * open, w = 180 + rng(i + 7) * 360;
      roundRect(340, top + i * pitch, w * clamp((shown - i) * 1.4), 12, 6, DIM, null, .5 * a);
    }
    // 'checking...' always sits below the last bar drawn (ceil, the same count the bars use)
    if (extras.checking > 0) { const y = top + Math.ceil(shown) * pitch + 18; write('checking...', 340, y, MONO(30), DIM, extras.checking); rect(540, y - 16, 12, 12, LIME, extras.checking * (.6 + .4 * Math.sin(t * 9))); }
  }
  function dial(t, position, alpha = 1) {
    const y = 1030, x0 = 340, x1 = 860;
    write('EFFORT', 300, 984, MONO(34), INK, alpha);
    line(x0, y, x1, y, BORDER, 4, alpha);
    for (let i = 0; i <= 8; i++) line(mix(x0, x1, i / 8), y - 10, mix(x0, x1, i / 8), y + 10, BORDER, 2, alpha * .8);
    line(x0, y, mix(x0, x1, position), y, LIME, 4, alpha);
    write('LOW', x0, y + 50, MONO(30), DIM, alpha, 'center'); write('HIGH', x1, y + 50, MONO(30), DIM, alpha, 'center');
    const kx = mix(x0, x1, position); roundRect(kx - 16, y - 16, 32, 32, 16, INK, null, alpha);
  }
  function model(t, u) { sceneAlpha = smooth(u / .2); chatPanel(t, clamp((u - .3) / 2.6) * 5); }
  function effort(t, u) {
    const pos = inout((u - .3) / 1.3);
    chatPanel(t, 5 + pos * 4 + clamp((u - 1.6) / .4), {checking: smooth((u - 1.9) / .3)});
    dial(t, pos, smooth(u / .25));
  }
  function agent(t, u) {
    // 'checking...' leaves first (0.1 s), then the thinking block collapses
    const collapse = smooth((u - .08) / .35);
    chatPanel(t, 10, {collapse, checking: 1 - smooth(u / .1)});
    dial(t, 1, mix(1, .35, collapse));
    ['read', 'run', 'edit', 'verify'].forEach((name, k) => {
      // rows start once the thinking block has finished collapsing (u ~ .43)
      const a = smooth((u - .45 - k * .45) / .25), y = 580 + k * 92; if (a <= 0) return;
      roundRect(300, y + (1 - a) * 18, 600, 70, 10, ROW, BORDER, a, 1.5);
      write(name, 330, y + 48 + (1 - a) * 18, MONO(34), INK, a);
      roundRect(480, y + 30 + (1 - a) * 18, 150 + rng(k + 3) * 150, 12, 6, DIM, null, .45 * a); // ends by x 780, clear of the tick
      const c = smooth((u - .75 - k * .45) / .2);
      if (c > 0) stroke([[846, y + 36], [859, y + 50], [883, y + 20]], c, LIME, 5, a);
    });
  }

  function doorScene(t, u) {
    const d = timeline.door;
    line(0, FLOOR, 920, FLOOR, INK, 2, .35); // from the left edge (mascots walk in on it) to the right post
    // the door leaf slides up into the lintel while open
    let open = 0;
    d.scanStarts.forEach(s0 => { const s = u - s0; open = Math.max(open, smooth((s - d.doorOpen[0]) / (d.doorOpen[1] - d.doorOpen[0])) * (1 - smooth((s - d.doorClose[0]) / (d.doorClose[1] - d.doorClose[0])))); });
    const leafH = (FLOOR - DOOR.top) * (1 - open);
    rect(DOOR.x0, DOOR.top, DOOR.x1 - DOOR.x0, leafH, '#15171B'); for (let i = 1; i < 6; i++) line(DOOR.x0 + 10, DOOR.top + leafH * i / 6, DOOR.x1 - 10, DOOR.top + leafH * i / 6, BORDER, 1.5, .8 * (1 - open));
    // mascots
    // front slot 585 keeps even the wider rainbow sprite clear of the left post (x 684)
    const queueX = [585, 405, 225], enter = out3(u / d.queueSeconds), drawn = [];
    for (const name of d.slotsLeftToRight) {
      // queue index k: 0 stands at the door; each later scan start moves everyone up one place
      const k = d.order.indexOf(name); let x = queueX[k], walking = u < d.queueSeconds;
      for (let j = 1; j <= k; j++) { const p = smooth((u - d.scanStarts[j] - d.advance[0]) / (d.advance[1] - d.advance[0])); x = mix(x, queueX[k - j], p); if (p > 0 && p < 1) walking = true; }
      x -= 760 * (1 - enter);
      const s = u - d.scanStarts[k], ultra = s >= d.ultracodeAt;
      if (s >= d.walkOut[0]) { const p = clamp((s - d.walkOut[0]) / (d.walkOut[1] - d.walkOut[0])); x = mix(queueX[0], 1260, p * p); if (p < 1) walking = true; }
      if (x > 1200) continue;
      const bob = walking ? -Math.abs(Math.sin(u * 11 + k)) * 7 : 0;
      // walking out, the mascot passes THROUGH the doorway: clipped at the opening's right edge (x 900),
      // so it never runs past the floor or under the Reels action rail
      ctx.save(); if (s >= d.walkOut[0]) { ctx.beginPath(); ctx.rect(0, 0, DOOR.x1, H); ctx.clip(); }
      ctx.translate(0, bob); const box = clawd(ultra ? 'ultracode' : 'normal', t, x); ctx.restore();
      // the name fades in as the queue arrives and out once its mascot turns ultracode, before the door posts
      const labelAlpha = smooth((u - .35) / .35) * (1 - smooth((s - d.ultracodeAt) / .15));
      drawn.push({name, k, s, labelAlpha, cx: x, box: {...box, y: box.y + bob}});
    }
    // red laser grid: down then up over the mascot at the door. Drawn before the opaque posts (so the beams
    // pass behind the door frame) and clipped above the floor (no glow below it).
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, FLOOR - 1); ctx.clip();
    let scanning = 0;
    for (const m of drawn) {
      const s = m.s; let p = -1;
      if (s >= d.sweepDown[0] && s < d.sweepDown[1]) p = (s - d.sweepDown[0]) / (d.sweepDown[1] - d.sweepDown[0]);
      else if (s >= d.sweepUp[0] && s < d.sweepUp[1]) p = 1 - (s - d.sweepUp[0]) / (d.sweepUp[1] - d.sweepUp[0]);
      // the door eye glows red from just before the sweep until just after it
      scanning = Math.max(scanning, smooth((s - d.sweepDown[0] + .08) / .08) * (1 - smooth((s - d.sweepUp[1]) / .12)));
      if (p < 0) continue;
      // fitted to the sprite: heroBounds already carries about 7 px of transparent margin, so +1 px here
      // gives about 8 px from the visible pixels; lines stay between the sprite's top and the floor
      const b = m.box, gx0 = b.x - 1, gx1 = b.x + b.w + 1, cy = mix(b.y + 12, b.y + b.h - 12, inout(p));
      ctx.save(); ctx.shadowColor = RED; ctx.shadowBlur = 14;
      for (let i = 0; i < 4; i++) { const y = clamp(cy - 21 + i * 14, b.y + 2, FLOOR - 3); line(gx0, y, gx1, y, RED, 3, .95); }
      ctx.restore();
      const ty0 = clamp(cy - 28, b.y, FLOOR), ty1 = clamp(cy + 28, b.y, FLOOR);
      rect(gx0, ty0, gx1 - gx0, ty1 - ty0, RED, .07);
    }
    ctx.restore();
    // frame posts and lintel in front of the walk and the beams, fully opaque so the pass-through is clean
    rect(DOOR.x0 - 16, DOOR.top - 22, 16, FLOOR - DOOR.top + 22, INK, 1); rect(DOOR.x1, DOOR.top - 22, 16, FLOOR - DOOR.top + 22, INK, 1);
    rect(DOOR.x0 - 16, DOOR.top - 22, DOOR.x1 - DOOR.x0 + 32, 16, INK, 1);
    // names after the laser (never tinted by it), in ink-dim so the door label stays the dominant word
    for (const m of drawn) if (m.labelAlpha > 0) pixelText(m.name, m.cx, m.box.y - 50, 4, DIM, m.labelAlpha);
    pixelText('SUPERINTELLIGENCE', 800, 570, 4, INK, 1);
    // a red backlight behind the door eye while it scans (drawn under the mark; the mark itself is untouched)
    if (scanning > 0) {
      const g = ctx.createRadialGradient(EYE_MOUNT.x, EYE_MOUNT.y, 8, EYE_MOUNT.x, EYE_MOUNT.y, 96);
      g.addColorStop(0, 'rgba(255,45,63,0.75)'); g.addColorStop(1, 'rgba(255,45,63,0)');
      ctx.save(); ctx.globalAlpha = scanning * sceneAlpha; ctx.fillStyle = g; ctx.fillRect(EYE_MOUNT.x - 96, EYE_MOUNT.y - 96, 192, 192); ctx.restore();
    }
    image('eye', EYE_MOUNT.x, EYE_MOUNT.y, EYE_MOUNT.w, 1);
  }
  function doorBeat(t, u) { sceneAlpha = smooth(u / .18); doorScene(t, u); }

  function brief(t, u) {
    const dx = 760 * (1 - out3(u / .35));
    ctx.save(); ctx.translate(dx, 0);
    // card shares the chat panel's frame (x 84-920): left of the Reels action rail, one left edge across beats
    roundRect(84, 300, 836, 1190, 6, '#0C0D10', BORDER, 1, 2);
    write('CAVELUX / BRIEF', 124, 384, MONO(34), INK, 1);
    line(124, 412, 880, 412, BORDER, 2, 1);
    // stylised crest: the voxel eye inside a drawn ring
    ctx.save(); ctx.globalAlpha = sceneAlpha; ctx.strokeStyle = BORDER; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(812, 520, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(812, 520, 60, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    image('eye', 812, 520, 96, 1);
    for (let i = 0; i < 4; i++) roundRect(124, 470 + i * 40, 420 - rng(i + 21) * 150, 12, 6, MUTED, null, .5);
    const r1 = smooth((u - .35) / .15), r2 = smooth((u - .55) / .15);
    rect(124, 680, 620 * r1, 46, INK, .92); rect(124, 750, 460 * r2, 46, INK, .92);
    for (let i = 0; i < 5; i++) roundRect(124, 840 + i * 40, 680 - rng(i + 31) * 240, 12, 6, MUTED, null, .4);
    ctx.restore();
  }

  function close(t, u) {
    image('eye', 540, 650, 190, smooth(u / .3), eyeBlink(t));
    const a = img.wordmark, w = 820, h = w * a.naturalHeight / a.naturalWidth, glitch = 1 - smooth((u - .05) / .55);
    const slices = 12;
    for (let i = 0; i < slices; i++) {
      const sy = a.naturalHeight * i / slices, sh = a.naturalHeight / slices, off = (rng(i * 13 + Math.floor(u * 20)) - .5) * 90 * glitch;
      ctx.save(); ctx.globalAlpha = sceneAlpha * smooth(u / .25); ctx.drawImage(a, 0, sy, a.naturalWidth, sh, 540 - w / 2 + off, 880 - h / 2 + h * i / slices, w, h / slices); ctx.restore();
    }
  }

  const drawers = {B1: hook, B2: law, B3: model, B4: effort, B5: agent, B6: doorBeat, B7: brief, B8: close};
  function beatAt(t) { return timeline.beats.find(b => t >= b.in && t < b.out) ?? timeline.beats[timeline.beats.length - 1]; }
  function envelope(b, t) {
    const fadeIn = ['B1', 'B4', 'B5'].includes(b.id) ? 1 : smooth((t - b.in) / .15);
    const fadeOut = ['B3', 'B4'].includes(b.id) ? 1 : b.id === 'B8' ? smooth((timeline.blackFrom - t) / .1) : smooth((b.out - t) / .12);
    return Math.min(fadeIn, fadeOut);
  }
  function renderFrame(frame) {
    if (!Number.isFinite(frame)) throw new TypeError('frame must be finite');
    const f = clamp(Math.floor(frame), 0, timeline.frames - 1), t = f / FPS;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    const b = beatAt(t);
    window.currentFrame = f; window.currentBeat = t >= timeline.blackFrom ? 'BLACK' : b.id;
    if (t >= timeline.blackFrom) return {frame: f, beat: 'BLACK'};
    sceneAlpha = 1; drawers[b.id](t, t - b.in, b); const env = envelope(b, t);
    if (env < 1) { sceneAlpha = 1; rect(0, 0, W, H, BG, 1 - env); }
    sceneAlpha = 1; drawCaptions(f, t);
    return {frame: f, beat: b.id, width: W, height: H};
  }

  function buildCues() {
    const clicks = [], captions = [];
    for (const cap of plan) cap.lines.forEach((ln, i) => {
      ln.glyphFrames.forEach((frame, c) => clicks.push({frame, time: frame / FPS, claim: cap.claim, line: i, char: ln.text[c]}));
      captions.push({claim: cap.claim, beat: cap.beat.id, line: i, text: ln.text, chars: ln.text.length,
        rateCharsPerSecond: Number(ln.rate.toFixed(3)), firstGlyph: ln.glyphFrames[0] / FPS, lastGlyph: ln.lastFrame / FPS,
        out: cap.beat.id === 'B8' ? timeline.blackFrom : cap.beat.out, rows: ln.rows.map(r => ({text: r.text, x: r.x, right: r.right, baseline: r.y}))});
    });
    const d = timeline.door, b6 = beats.get('B6').in, scans = d.scanStarts.map((s0, k) => ({mascot: d.order[k],
      sweeps: [b6 + s0 + d.sweepDown[0], b6 + s0 + d.sweepUp[0]], ultracode: b6 + s0 + d.ultracodeAt,
      doorOpen: b6 + s0 + d.doorOpen[0], doorClose: b6 + s0 + d.doorClose[0]}));
    return {fps: FPS, frames: timeline.frames, durationSeconds: timeline.durationSeconds, blackFrom: timeline.blackFrom,
      beats: timeline.beats, transitions: timeline.beats.slice(1).map(b => ({time: b.in, into: b.id})),
      scans, eyeBlinks: timeline.eyeBlinks, captions, clicks: clicks.sort((a, z) => a.frame - z.frame)};
  }

  async function load(url) { const r = await fetch(url); if (!r.ok) throw new Error('Failed ' + url); return r.json(); }
  function picture(name, url) { return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => { img[name] = i; resolve(); }; i.onerror = () => reject(new Error('Failed ' + url)); i.src = url; }); }
  window.reelReady = (async () => {
    [register, timeline] = await Promise.all([load('register.json'), load('timeline.json'), window.filmReady,
      picture('eye', '/brand/CVL_mark_voxel_eye.png'), picture('wordmark', '/brand/CAVELUX_wordmark_glitch.png'),
      document.fonts.load(CAPTION_FONT), document.fonts.load(MONO(26))]);
    beats = new Map(timeline.beats.map(b => [b.id, b])); claims = new Map(register.claims.map(c => [c.id, c]));
    labels = new Set(register.labels); claimLines = register.claims.flatMap(c => c.lines);
    planCaptions(); cues = buildCues();
    window.renderFrame = renderFrame; window.reelCues = cues;
    window.reelSpec = {width: W, height: H, fps: FPS, durationInFrames: timeline.frames, safeTop: 250, safeBottom: H - 420};
    renderFrame(90); return window.reelSpec;
  })();
})();
