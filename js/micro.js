/*
  Micro-interactions: cards glow along their edge where the pointer is, below-the-fold content
  fades up as it scrolls in, the primary button gets a shine, buttons squish when pressed and
  text links get a sliding underline (the last three are CSS in css/style.css).
  Adapted from micro.js on SleepyMie's portfolio site (sleepymiemoo.github.io).

  Runs only while Interactive touches is On, Effects is not Off and Reduce motion is off
  (html data-touches / data-fx / data-motion, see js/settings.js); otherwise it removes its
  listeners and observers and shows everything. Nothing is hidden without JavaScript: only
  elements that start below the fold are hidden, and only once this script runs.
*/
(function () {
  var root = document.documentElement;
  function active() {
    return root.getAttribute("data-touches") !== "off" && root.getAttribute("data-motion") !== "reduce" &&
      root.getAttribute("data-fx") !== "off";
  }
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  var CARDS = ".step, .member-card, .link-card";

  /* 1. Fade up on scroll (below-the-fold items only). */
  var io = null, items = [], timers = [];
  function setupReveal() {
    if (io || !active() || !("IntersectionObserver" in window)) return;
    var sel = "main section:not(.hero):not(.profile-hero) .wrap > :not(.steps):not(.team-grid):not(.link-grid):not(noscript), " + CARDS;
    var fold = window.innerHeight;   // anything already peeking into view stays visible
    items = Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
      return el.getBoundingClientRect().top > fold;
    });
    if (!items.length) return;
    root.classList.add("reveal-on");
    io = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, delay = Math.min(n++, 4) * 80;
        io.unobserve(el);
        el.style.transitionDelay = delay + "ms";
        el.classList.add("rv-in");
        timers.push(setTimeout(function () { el.classList.remove("rv", "rv-in"); el.style.transitionDelay = ""; }, 900 + delay));
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    items.forEach(function (el) { el.classList.add("rv"); io.observe(el); });
  }
  function teardownReveal() {
    if (!io) return;
    io.disconnect(); io = null;
    timers.forEach(clearTimeout); timers = [];
    items.forEach(function (el) { el.classList.remove("rv", "rv-in"); el.style.transitionDelay = ""; });
    items = [];
    root.classList.remove("reveal-on");
  }

  /* 2. Card edge glow follows the pointer (fine pointers only; one rect read per frame). */
  var px = 0, py = 0, target = null, raf = 0, pointerOn = false;
  function frame() {
    raf = 0;
    var card = target && target.closest ? target.closest(CARDS) : null;
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", (px - r.left).toFixed(0) + "px");
    card.style.setProperty("--my", (py - r.top).toFixed(0) + "px");
  }
  function onMove(e) {
    if (e.pointerType === "touch") return;
    px = e.clientX; py = e.clientY; target = e.target;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function setupPointer() {
    if (pointerOn || !active() || !finePointer || !finePointer.matches) return;
    pointerOn = true;
    root.classList.add("glow-on");
    document.addEventListener("pointermove", onMove, { passive: true });
  }
  function teardownPointer() {
    if (!pointerOn) return;
    pointerOn = false;
    root.classList.remove("glow-on");
    document.removeEventListener("pointermove", onMove, { passive: true });
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  /* 3. Follow the settings live. */
  function sync() {
    if (active()) { setupPointer(); setupReveal(); } else { teardownPointer(); teardownReveal(); }
    if (finePointer && !finePointer.matches) teardownPointer();
  }
  sync();
  if (window.MutationObserver) {
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-touches", "data-motion", "data-fx"] });
  }
  if (finePointer) {
    if (finePointer.addEventListener) finePointer.addEventListener("change", sync);
    else if (finePointer.addListener) finePointer.addListener(sync);
  }
})();
