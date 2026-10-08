/*
  Hero background: little chocolate chunks, cocoa flakes, warm glows and gold sparkles that
  float on one <canvas> behind the hero, coloured from the current theme's CSS variables.
  The motion engine is adapted from fx.js on SleepyMie's portfolio site (sleepymiemoo.github.io):
  seeded drift from layered sine waves, a scroll speed-up that eases back afterwards, a soft
  inertia spring for parallax and about 30fps in Lite. The particles and renderer are new.

  Settings (see js/settings.js): Full = every particle, scroll speed-up and parallax.
  Lite = about half the particles, ~30fps, 1x pixel ratio, no scroll speed-up.
  Off = no canvas at all. Reduce motion = one still frame. The loop also stops while the tab
  is hidden or the hero is off screen. The canvas is absolutely positioned, so it never
  changes the layout.

  Text stays readable: colours that would lower text contrast (for example gold on a dark
  theme) fade out near the hero's text, and the big glows are capped so text, muted text and
  accent ink keep WCAG AA (4.5:1) on top of them, even where two overlap.
*/
(function () {
  var root = document.documentElement;
  var host = document.querySelector(".hero, .profile-hero");
  if (!host || !window.requestAnimationFrame) return;
  var probe = document.createElement("canvas");
  if (!probe.getContext || !probe.getContext("2d")) return;

  var TAU = Math.PI * 2, seed = 1;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function between(a, b) { return a + (b - a) * rnd(); }

  /* ---- colours ---- */
  function hex(v) {
    var m = /^#([0-9a-f]{6})$/i.exec((v || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function lum(c) {
    var a = c.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function blend(fg, bg, a) { return [0, 1, 2].map(function (i) { return bg[i] + (fg[i] - bg[i]) * a; }); }
  function css(c, a) { return "rgba(" + c.map(Math.round).join(",") + "," + (a == null ? 1 : a) + ")"; }
  // Highest alpha (up to `want`) that keeps every ink at AA, or at its current ratio if lower,
  // on every background, counting `layers` overlapping copies (default 2).
  function cap(c, want, bgs, inks, layers) {
    for (var a = want; a > 0.01; a *= 0.85) {
      var eff = 1 - Math.pow(1 - a, layers || 2), ok = true;
      for (var i = 0; i < bgs.length && ok; i++) {
        for (var j = 0; j < inks.length && ok; j++) {
          ok = ratio(inks[j], blend(c, bgs[i], eff)) >= Math.min(4.55, ratio(inks[j], bgs[i])) - 0.005;
        }
      }
      if (ok) return a;
    }
    return 0;
  }

  var pal = null;
  function readPalette() {
    var cs = getComputedStyle(root), v = function (n) { return hex(cs.getPropertyValue(n)); };
    var deep = v("--deep"), text = v("--text");
    if (!deep || !text) return null;
    var dark = lum(text) > lum(deep);
    var inks = [text, v("--muted"), v("--accent-ink")].filter(Boolean);
    var bgs = [deep, v("--glow") || deep];
    var gold = v("--accent"), cream = v("--elevated"), flake = v("--border");
    // glows use the theme's soft spot colour (already AA-checked by tools/sync-themes.py),
    // so stacking them can never go past that colour
    var glow = v("--glow") || cream, glowWant = 0.85;
    var glowA = cap(glow, glowWant, bgs, inks, 3);     // up to three glows can overlap
    var under = bgs.concat(bgs.map(function (b) { return blend(glow, b, 1 - Math.pow(1 - glowA, 3)); }));
    var safe = function (c, want) { return !!c && cap(c, want, under, inks) >= want; };
    var milk = v("--border") || cream, shine = v("--shine") || gold, edge = v("--edge") || deep;
    var away = dark ? edge : cream;          // darker than the hero on dark themes, lighter on light ones
    return {
      milk: milk, milkGroove: blend(edge, milk, 0.6), shine: shine,
      away: away, awayGroove: blend(deep, away, 0.45),
      gold: gold, glow: glow, glowA: glowA,
      // safe = may pass behind text (faded); otherwise the particle fades out before it reaches text
      safe: {
        milk: safe(milk, 0.9) && safe(shine, 0.6), away: safe(away, 0.9),
        flake: safe(milk, 0.6), spark: safe(gold, 0.95)
      }
    };
  }

  /* ---- sprites (pre-rendered once per theme and pixel ratio) ---- */
  var dpr = 1, sprites = {};
  function sprite(size, draw) {
    var c = document.createElement("canvas"), s = Math.ceil(size * dpr);
    c.width = c.height = s;
    var g = c.getContext("2d");
    g.scale(dpr, dpr);
    draw(g, size);
    return c;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function chunk(fill, groove, shine) {
    return function (g) {                  // a chocolate square with a pressed groove
      g.fillStyle = css(fill); roundRect(g, 2, 2, 28, 28, 7); g.fill();
      g.strokeStyle = css(groove); g.lineWidth = 2.4; roundRect(g, 8, 8, 16, 16, 4); g.stroke();
      if (shine) {
        g.strokeStyle = css(shine, 0.6); g.lineWidth = 1.6; g.lineCap = "round";
        g.beginPath(); g.moveTo(6, 15); g.lineTo(6, 9); g.quadraticCurveTo(6, 6, 9, 6); g.lineTo(15, 6); g.stroke();
      }
    };
  }
  function buildSprites() {
    sprites = {
      milk: sprite(32, chunk(pal.milk, pal.milkGroove, pal.shine)),
      away: sprite(32, chunk(pal.away, pal.awayGroove)),
      flake: sprite(16, function (g) {      // a rounded cocoa flake
        g.fillStyle = css(pal.milk);
        g.beginPath(); g.moveTo(3, 8); g.quadraticCurveTo(4, 2, 9, 3); g.quadraticCurveTo(14, 5, 12, 10);
        g.quadraticCurveTo(9, 15, 5, 12); g.closePath(); g.fill();
      }),
      spark: sprite(32, function (g) {      // four-point sparkle with a soft halo
        var h = g.createRadialGradient(16, 16, 0, 16, 16, 15);
        h.addColorStop(0, css(pal.gold, 0.45)); h.addColorStop(1, css(pal.gold, 0));
        g.fillStyle = h; g.fillRect(0, 0, 32, 32);
        g.fillStyle = css(pal.gold);
        g.beginPath(); g.moveTo(16, 3); g.quadraticCurveTo(17.4, 14.6, 29, 16); g.quadraticCurveTo(17.4, 17.4, 16, 29);
        g.quadraticCurveTo(14.6, 17.4, 3, 16); g.quadraticCurveTo(14.6, 14.6, 16, 3); g.fill();
      }),
      glow: sprite(128, function (g) {
        var r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        r.addColorStop(0, css(pal.glow, 1)); r.addColorStop(0.45, css(pal.glow, 0.45)); r.addColorStop(1, css(pal.glow, 0));
        g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      })
    };
  }

  /* ---- particles ---- */
  var cv = null, ctx = null, W = 0, H = 0, parts = [], keep = [];
  function build() {
    seed = 20261008;
    var lite = state.fx === "lite";
    var n = Math.round(W * H / (lite ? 44000 : 22000));
    n = Math.max(lite ? 7 : 14, Math.min(lite ? 16 : 34, n));
    parts = [];
    var glows = lite ? 2 : 3;
    for (var g = 0; g < glows; g++) parts.push(make("glow", between(150, 260)));
    var mix = ["milk", "spark", "flake", "away", "milk", "spark", "flake"];
    for (var i = 0; i < n; i++) {
      var k = mix[i % mix.length];
      parts.push(make(k, k === "flake" ? between(7, 12) : k === "spark" ? between(16, 26) : between(13, 24)));
    }
  }
  function make(kind, size) {
    return {
      kind: kind, size: size,
      x0: between(0, 1), y0: between(0, 1),
      rise: kind === "glow" ? 0 : between(6, 16) / (size / 10 + 1),          // px per second, smaller = faster
      ax: kind === "glow" ? between(30, 70) : between(8, 22), ay: kind === "glow" ? between(20, 50) : between(4, 10),
      fx1: TAU / between(11, 22), fx2: TAU / between(5, 10), fy: TAU / between(9, 18),
      px1: between(0, TAU), px2: between(0, TAU), py: between(0, TAU),
      rot: between(0, TAU), spin: between(-0.35, 0.35),
      fo: TAU / between(2.5, 5), po: between(0, TAU),
      depth: kind === "glow" ? between(0.05, 0.1) : between(0.12, 0.3),
      alpha: kind === "glow" ? 1 : kind === "flake" ? between(0.45, 0.6) : kind === "spark" ? 0.95 : between(0.7, 0.9)
    };
  }
  // Line boxes of the text that sits straight on the hero background (canvas coordinates),
  // measured on resize only. Pills and filled buttons have their own opaque background.
  function measureKeep() {
    var hb = host.getBoundingClientRect(), range = document.createRange();
    keep = [];
    Array.prototype.forEach.call(host.querySelectorAll("h1, p, .btn-ghost"), function (el) {
      range.selectNodeContents(el);
      var rs = el.classList.contains("btn") ? [el.getBoundingClientRect()] : range.getClientRects();
      for (var i = 0; i < rs.length; i++) {
        if (rs[i].width && rs[i].height) keep.push([rs[i].left - hb.left, rs[i].top - hb.top, rs[i].right - hb.left, rs[i].bottom - hb.top]);
      }
    });
  }
  // 0 inside a text box, rising to 1 at `pad` px away from every box.
  function clearance(x, y, pad) {
    var m = 1;
    for (var i = 0; i < keep.length; i++) {
      var k = keep[i];
      var dx = Math.max(k[0] - x, 0, x - k[2]), dy = Math.max(k[1] - y, 0, y - k[3]);
      var d = Math.sqrt(dx * dx + dy * dy) / pad;
      if (d < m) m = d;
    }
    return m;
  }

  /* ---- loop (adapted from the portfolio engine) ---- */
  var state = { fx: "full", rm: false, on: false, inView: true };
  var running = false, raf = 0, last = 0, lastDraw = 0, sy = window.pageYOffset || 0, lastSy = sy, T = 0;
  var vel = 0, boost = 0, inY = 0, inV = 0;

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var full = state.fx === "full";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], s = p.size, img = sprites[p.kind];
      var span = H + s * 2;
      var x = p.x0 * W + p.ax * (0.7 * Math.sin(p.fx1 * T + p.px1) + 0.3 * Math.sin(p.fx2 * T + p.px2));
      var y = p.y0 * span - p.rise * T + p.ay * Math.sin(p.fy * T + p.py);
      if (full) y += inY * p.depth * 2 - sy * p.depth;
      y = ((y % span) + span) % span - s;
      var a = p.alpha;
      if (p.kind === "glow") {
        a = pal.glowA * (0.75 + 0.25 * Math.sin(p.fo * T * 0.2 + p.po));
      } else {
        if (p.kind === "spark") a *= 0.55 + 0.45 * Math.sin(p.fo * T + p.po);
        var unsafe = !pal.safe[p.kind];
        var c = clearance(x, y, unsafe ? 28 + s : 40);
        a *= unsafe ? (c >= 1 ? 1 : c <= 0.35 ? 0 : (c - 0.35) / 0.65) : 0.35 + 0.65 * c;
      }
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (p.kind === "glow") { ctx.drawImage(img, x - s / 2, y - s / 2, s, s); continue; }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.spin * T);
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(now - last, 50) : 16;
    last = now;
    var full = state.fx === "full";
    var v = (sy - lastSy) / dt;
    lastSy = sy;
    v = v > 6 ? 6 : v < -6 ? -6 : v;
    vel += (v - vel) * 0.25;
    if (!full) vel = 0;
    var target = Math.min(Math.abs(vel) * 2.4, 6);
    boost += (target - boost) * (target > boost ? 0.2 : 1 - Math.exp(-dt / 900));
    var s = dt / 1000, goal = Math.max(-60, Math.min(60, vel * 26));
    inV += ((goal - inY) * 36 - inV * 8.5) * s;
    inY += inV * s;
    T += s * (1 + boost);
    if (full || now - lastDraw > 30) { draw(); lastDraw = now; }   // Lite: about 30fps
    if (state.on) raf = requestAnimationFrame(frame); else running = false;
  }
  function start() {
    if (running) return;
    running = true; last = 0; lastSy = sy;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; running = false;
  }

  function size() {
    if (!cv) return;
    var w = host.clientWidth, h = host.clientHeight;
    var ratio2 = state.fx === "full" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    if (w === W && h === H && ratio2 === dpr && cv.width) { measureKeep(); return; }
    W = w; H = h;
    if (ratio2 !== dpr || !sprites.chunk) { dpr = ratio2; buildSprites(); }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    measureKeep();
    build();
  }
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement("canvas");
    cv.className = "fx-canvas";
    cv.setAttribute("aria-hidden", "true");
    host.insertBefore(cv, host.firstChild);
    ctx = cv.getContext("2d");
    W = H = 0;
  }
  function removeCanvas() {
    stop();
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    cv = ctx = null; W = H = 0;
  }

  var lastFx = null;
  function update() {
    state.fx = root.getAttribute("data-fx") || "full";
    state.rm = root.getAttribute("data-motion") === "reduce";
    if (state.fx === "off") { removeCanvas(); lastFx = state.fx; return; }
    var np = readPalette();
    if (!np) { removeCanvas(); return; }
    var fresh = !cv;
    ensureCanvas();
    var themeChanged = !pal || JSON.stringify(np) !== JSON.stringify(pal);
    pal = np;
    if (themeChanged) buildSprites();
    if (lastFx !== state.fx) { W = 0; }   // particle count and pixel ratio depend on Lite/Full
    lastFx = state.fx;
    size();
    if (!state.rm && state.fx !== "full") { vel = boost = inY = inV = 0; }
    state.on = !state.rm && !document.hidden && state.inView;
    if (state.rm) { stop(); vel = boost = inY = inV = 0; draw(); return; }
    draw();
    if (state.on) start(); else stop();
    if (fresh) requestAnimationFrame(function () { if (cv) cv.classList.add("fx-in"); });
  }

  window.addEventListener("scroll", function () { sy = window.pageYOffset || 0; }, { passive: true });
  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (cv) { size(); draw(); } }, 120);
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(host);
  else window.addEventListener("resize", onResize, { passive: true });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { state.inView = en[en.length - 1].isIntersecting; update(); }).observe(host);
  }
  document.addEventListener("visibilitychange", update);
  if (window.MutationObserver) {
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["data-fx", "data-motion", "data-theme"] });
  }
  if (window.matchMedia) {
    var dark = window.matchMedia("(prefers-color-scheme: dark)");
    if (dark.addEventListener) dark.addEventListener("change", update); else if (dark.addListener) dark.addListener(update);
  }
  update();
  // tiny read-only status for tests
  window.chocoFx = {
    running: function () { return running; },
    canvas: function () { return cv; },
    count: function () { return parts.length; },
    palette: function () { return pal; },
    pixelRatio: function () { return dpr; }
  };
})();
