/*
  Site settings (the gear button next to the Theme picker): Effects (Full / Lite / Off),
  Interactive touches (On / Off) and Reduce motion. Adapted from settings.js on SleepyMie's
  portfolio site (sleepymiemoo.github.io).

  Saved in localStorage: "choconeko-fx" (full|lite|off), "choconeko-touches" (only "off" is
  stored) and "choconeko-motion" (reduce|ok; nothing stored = follow the device). Junk values
  and blocked storage fall back to the defaults. The inline <head> script applies the same
  rules before first paint and sets <html data-fx data-touches data-motion>; this file keeps
  them in sync and draws the panel. Effects default to Lite on phones, devices with four or
  fewer CPU cores and Data Saver, otherwise Full. Reduce motion follows prefers-reduced-motion
  until the visitor picks a value here.
*/
(function () {
  var root = document.documentElement;
  var FX = ["full", "lite", "off"];
  var FX_NAME = { full: "Full", lite: "Lite", off: "Off" };
  var K_FX = "choconeko-fx", K_TOUCH = "choconeko-touches", K_MOTION = "choconeko-motion";
  var rmQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var mem = {};   // keeps choices for this page view when storage is blocked

  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  function load(k) {
    try { var v = localStorage.getItem(k); return v === null && k in mem ? mem[k] : v; } catch (e) { return k in mem ? mem[k] : null; }
  }
  function save(k, v) {
    mem[k] = v;
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked */ }
  }
  function autoFx() {
    var n = navigator, c = n.connection;
    return mq("(max-width: 600px)") || n.hardwareConcurrency <= 4 || (c && c.saveData) ? "lite" : "full";
  }
  function state() {
    var f = load(K_FX), r = load(K_MOTION), fxSet = FX.indexOf(f) > -1, rmSet = r === "reduce" || r === "ok";
    return {
      fx: fxSet ? f : autoFx(),
      fxAuto: !fxSet,
      touches: load(K_TOUCH) !== "off",
      rm: rmSet ? r === "reduce" : !!(rmQuery && rmQuery.matches),
      rmAuto: !rmSet
    };
  }
  function apply() {
    var s = state();
    root.setAttribute("data-fx", s.fx);
    if (s.fxAuto) root.setAttribute("data-fx-auto", s.fx); else root.removeAttribute("data-fx-auto");
    root.setAttribute("data-touches", s.touches ? "on" : "off");
    root.setAttribute("data-motion", s.rm ? "reduce" : "ok");
    return s;
  }

  var btn = document.getElementById("settings-toggle");
  var box = btn && btn.parentNode;
  if (!btn || !box) { apply(); return; }

  var panel = document.createElement("div");
  panel.className = "settings-panel";
  panel.id = "site-settings";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "sp-title");
  panel.hidden = true;
  var radios = FX.map(function (f) {
    return '<label><input type="radio" name="sp-fx" value="' + f + '"><span>' + FX_NAME[f] + "</span></label>";
  }).join("");
  function row(cls, label) {
    return '<div class="sp-row"><span class="sp-label" id="sp-' + cls + '-label">' + label + "</span>" +
      '<button type="button" class="switch sp-' + cls + '" role="switch" aria-checked="false" aria-labelledby="sp-' + cls +
      '-label" aria-describedby="sp-' + cls + '-hint"></button></div><p class="sp-hint" id="sp-' + cls + '-hint"></p>';
  }
  panel.innerHTML =
    '<div class="sp-head"><p class="sp-title" id="sp-title">Site settings</p>' +
    '<button type="button" class="sp-close" aria-label="Close settings"><span aria-hidden="true">\u00d7</span></button></div>' +
    '<fieldset class="sp-group" aria-describedby="sp-fx-hint"><legend>Effects</legend><div class="seg">' + radios + "</div>" +
    '<p class="sp-hint" id="sp-fx-hint"></p></fieldset>' +
    row("tc", "Interactive touches") + row("rm", "Reduce motion") +
    '<div class="sp-foot"><button type="button" class="sp-reset">Reset to defaults</button></div>';
  box.appendChild(panel);

  var fxInputs = panel.querySelectorAll('input[name="sp-fx"]');
  var tcSwitch = panel.querySelector(".sp-tc"), rmSwitch = panel.querySelector(".sp-rm");
  var fxHint = panel.querySelector("#sp-fx-hint"), tcHint = panel.querySelector("#sp-tc-hint"), rmHint = panel.querySelector("#sp-rm-hint");

  function render() {
    var s = apply();
    for (var i = 0; i < fxInputs.length; i++) fxInputs[i].checked = fxInputs[i].value === s.fx;
    tcSwitch.setAttribute("aria-checked", s.touches ? "true" : "false");
    rmSwitch.setAttribute("aria-checked", s.rm ? "true" : "false");
    fxHint.textContent = "Floating cocoa and sparkles at the top of the page. " + (s.rm
      ? "They stay still while Reduce motion is on."
      : s.fxAuto ? FX_NAME[s.fx] + " suits this device." : "Saved in this browser.");
    tcHint.textContent = s.rm ? "Paused while Reduce motion is on."
      : s.fx === "off" ? "Paused while Effects is Off."
      : "Card glow, button shine and fade-in as you scroll.";
    rmHint.textContent = s.rmAuto
      ? (s.rm ? "On because this device asks for less motion." : "Following this device's setting.")
      : "Saved in this browser.";
  }

  for (var j = 0; j < fxInputs.length; j++) {
    fxInputs[j].addEventListener("change", function (e) { if (e.target.checked) { save(K_FX, e.target.value); render(); } });
  }
  tcSwitch.addEventListener("click", function () {
    save(K_TOUCH, tcSwitch.getAttribute("aria-checked") === "true" ? "off" : null);
    render();
  });
  rmSwitch.addEventListener("click", function () {
    save(K_MOTION, rmSwitch.getAttribute("aria-checked") === "true" ? "ok" : "reduce");
    render();
  });
  panel.querySelector(".sp-reset").addEventListener("click", function () {
    save(K_FX, null); save(K_TOUCH, null); save(K_MOTION, null);
    render();
  });

  function isOpen() { return !panel.hidden; }
  function open() {
    render();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    (panel.querySelector('input[name="sp-fx"]:checked') || fxInputs[0]).focus();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
  }
  function close(returnFocus) {
    if (!isOpen()) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
    if (returnFocus) btn.focus();
  }
  // Esc closes only the panel (not the mobile menu around it) and returns focus to the gear.
  function onKey(e) {
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); e.stopPropagation(); close(true); }
  }
  function onPointer(e) {
    if (!panel.contains(e.target) && !btn.contains(e.target)) close(false);
  }
  panel.addEventListener("focusout", function (e) {
    var to = e.relatedTarget;
    if (to && !panel.contains(to) && to !== btn) close(false);
  });
  panel.querySelector(".sp-close").addEventListener("click", function () { close(true); });
  btn.addEventListener("click", function () { if (isOpen()) close(true); else open(); });
  // The mobile menu closing hides the panel too, so close it properly.
  var navToggle = document.querySelector(".nav-toggle");
  if (navToggle && window.MutationObserver) {
    new MutationObserver(function () {
      if (navToggle.getAttribute("aria-expanded") !== "true" && box.offsetParent === null) close(false);
    }).observe(navToggle, { attributes: true, attributeFilter: ["aria-expanded"] });
  }

  window.addEventListener("storage", function (e) {
    if (e.key === K_FX || e.key === K_TOUCH || e.key === K_MOTION || e.key === null) render();
  });
  if (rmQuery) {
    if (rmQuery.addEventListener) rmQuery.addEventListener("change", render);
    else if (rmQuery.addListener) rmQuery.addListener(render);
  }

  btn.setAttribute("aria-controls", panel.id);
  render();
  btn.hidden = false;
})();
