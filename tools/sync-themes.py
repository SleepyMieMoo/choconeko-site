#!/usr/bin/env python3
"""Regenerate the site's theme files from the game's UI theme definitions.

Usage:
    python3 tools/sync-themes.py PATH/TO/THEME-FILE.luau           write the files
    python3 tools/sync-themes.py PATH/TO/THEME-FILE.luau --check   compare only

Plain Python 3, no dependencies. Run it from anywhere; it works on the site
folder that contains this script.

What it generates
  * css/themes.css: one CSS custom-property block per theme, the "System"
    mapping (dark device -> the game's default theme, light device ->
    LIGHT_SYSTEM_THEME below) and the theme list used by the picker.
  * In every HTML page: the early inline <head> script's list of valid theme
    ids, and the two System <meta name="theme-color"> tags.
It also prints a WCAG contrast report for every theme.

--check writes nothing. It exits with status 1 if a generated file would
differ from the one on disk, or if any contrast pair is below its target.

Input: the parser is small and pattern-based. It expects one table of
Color3.fromRGB(...) values per theme, plus the game's theme order, display
labels, id-to-table lookup and default theme. If the game's file changes shape
and the script stops with an error, update parse_theme_file().
"""
import hashlib
import pathlib
import re
import sys

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "css" / "themes.css"

# "System (match device)": a dark device uses the game's default theme,
# a light device uses this one.
LIGHT_SYSTEM_THEME = "Vanilla"

# Base for the focus ring on light themes (the game's brand blue).
BRAND_BLUE = (99, 140, 255)

REQUIRED = ["panelBg", "elevatedBg", "buttonBg", "accordionHeaderBg", "navActiveBg",
            "navActiveText", "borderColor", "textColor", "textMuted"]


# ---------------------------------------------------------------- parsing
def strip_comments(src):
    src = re.sub(r"--\[(=*)\[.*?\]\1\]", "", src, flags=re.S)  # block comments
    out = []
    for line in src.splitlines():
        # drop "-- comment" unless the dashes are inside a string
        in_str = None
        for i, ch in enumerate(line):
            if in_str:
                if ch == in_str and line[i - 1] != "\\":
                    in_str = None
            elif ch in "\"'":
                in_str = ch
            elif line.startswith("--", i):
                line = line[:i]
                break
        out.append(line)
    return "\n".join(out)


def braced(src, start):
    """Return the text inside the {...} that opens at src[start]."""
    assert src[start] == "{"
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1:i]
    raise SystemExit("error: unbalanced braces in theme file")


def split_top(body):
    """Split a table body on top-level commas/semicolons."""
    parts, depth, cur = [], 0, []
    for ch in body:
        if ch in "({":
            depth += 1
        elif ch in ")}":
            depth -= 1
        if ch in ",;" and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def parse_color(expr):
    m = re.fullmatch(r"Color3\.fromRGB\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)", expr)
    if m:
        return tuple(int(round(float(v))) for v in m.groups())
    m = re.fullmatch(r"Color3\.new\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)", expr)
    if m:
        return tuple(int(round(float(v) * 255)) for v in m.groups())
    m = re.fullmatch(r"Color3\.fromHex\(\s*[\"']#?([0-9a-fA-F]{6})[\"']\s*\)", expr)
    if m:
        h = m.group(1)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return None


def parse_table(body, tables):
    result = {}
    for item in split_top(body):
        m = re.fullmatch(r"(?:\[\s*[\"'](\w+)[\"']\s*\]|(\w+))\s*=\s*(.+)", item, flags=re.S)
        if not m:
            continue
        key = m.group(1) or m.group(2)
        val = m.group(3).strip()
        color = parse_color(val)
        if color:
            result[key] = color
        elif val.startswith("{"):
            result[key] = parse_table(braced(val, 0), tables)
        elif re.fullmatch(r"\w+", val) and val in tables:
            result[key] = tables[val]
    return result


def tidy_name(theme_id):
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", theme_id).replace("_", " ").strip()


def slug(theme_id):
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", theme_id)
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def string_list(src, name):
    m = re.search(re.escape(name) + r"\s*=\s*{", src)
    if not m:
        return None
    return re.findall(r"[\"'](\w+)[\"']", braced(src, m.end() - 1))


def parse_theme_file(path):
    src = strip_comments(pathlib.Path(path).read_text(encoding="utf-8"))

    # every top-level `local NAME[: Type] = { ... }`, in file order
    tables = {}
    for m in re.finditer(r"^local\s+(\w+)\s*(?::\s*[\w.]+)?\s*=\s*{", src, flags=re.M):
        tables[m.group(1)] = parse_table(braced(src, m.end() - 1), tables)

    ids = string_list(src, "UITheme.THEME_ORDER")
    if not ids:
        m = re.search(r"export\s+type\s+ThemeId\s*=\s*((?:\s*\|?\s*\"\w+\")+)", src)
        ids = re.findall(r"\"(\w+)\"", m.group(1)) if m else []
    if not ids:
        raise SystemExit("error: no theme ids found (THEME_ORDER or ThemeId type)")

    labels = {}
    m = re.search(r"UITheme\.THEME_LABELS\s*=\s*{", src)
    if m:
        for k1, k2, v in re.findall(r"(?:\[\s*[\"'](\w+)[\"']\s*\]|(\w+))\s*=\s*[\"']([^\"']+)[\"']",
                                    braced(src, m.end() - 1)):
            labels[k1 or k2] = v

    mapping, fallback = {}, None
    m = re.search(r"function\s+UITheme\.getPalette\s*\(.*?\n(.*?)\nend", src, flags=re.S)
    if m:
        body = m.group(1)
        for tid, tname in re.findall(r"themeId\s*==\s*\"(\w+)\"\s*then\s*return\s+(\w+)", body):
            mapping[tid] = tname
        rets = re.findall(r"^\s*return\s+(\w+)\s*$", body, flags=re.M)
        fallback = rets[-1] if rets else None

    default = None
    m = re.search(r"function\s+UITheme\.resolveThemeId\s*\(.*?\n(.*?)\nend", src, flags=re.S)
    if m:
        rets = re.findall(r"return\s+\"(\w+)\"", m.group(1))
        default = rets[-1] if rets else None
    default = default or ids[0]

    themes = []
    for tid in ids:
        tname = mapping.get(tid)
        if not tname:
            guess = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", tid).upper()
            tname = guess if guess in tables else fallback
        pal = tables.get(tname)
        if not pal:
            raise SystemExit(f"error: no palette table found for theme {tid!r}")
        missing = [f for f in REQUIRED if f not in pal]
        grad = pal.get("accentGradient") or {}
        if "Center" not in grad:
            missing.append("accentGradient.Center")
        if missing:
            raise SystemExit(f"error: theme {tid!r} ({tname}) is missing: {', '.join(missing)}")
        themes.append({"id": tid, "slug": slug(tid), "name": labels.get(tid) or tidy_name(tid),
                       "table": tname, "pal": pal})
    if default not in ids:
        raise SystemExit(f"error: default theme {default!r} is not in the theme list")
    if LIGHT_SYSTEM_THEME not in ids:
        raise SystemExit(f"error: LIGHT_SYSTEM_THEME {LIGHT_SYSTEM_THEME!r} is not in the theme list")
    return themes, default


# ---------------------------------------------------------------- colour maths
def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def mix(a, b, t):
    """t=0 -> a, t=1 -> b"""
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


# Derived colours aim a little above the WCAG minimum so they are not razor-thin.
MARGIN = 0.1


def ensure(fg, bgs, target, toward):
    """Move fg toward `toward` in 1% steps until it reaches target (+MARGIN) on every bg."""
    target += MARGIN
    for step in range(101):
        c = mix(fg, toward, step / 100)
        if min(ratio(c, bg) for bg in bgs) >= target:
            return c, step
    return mix(fg, toward, 1), 100


def hexc(c):
    return "#%02X%02X%02X" % c


# ---------------------------------------------------------------- mapping
def site_colors(pal):
    """Map game palette fields to the site's CSS variables.

    Base values are copied from the game unchanged. Derived values are the
    site's own, nudged only as far as needed to pass WCAG AA."""
    panel, elevated, button = pal["panelBg"], pal["elevatedBg"], pal["buttonBg"]
    deep, nav_active, border = pal["accordionHeaderBg"], pal["navActiveBg"], pal["borderColor"]
    text, muted_base = pal["textColor"], pal["textMuted"]
    accent = pal["accentGradient"]["Center"]
    accent_start = pal["accentGradient"].get("Start", accent)
    dark = lum(panel) < 0.18
    away = (255, 255, 255) if dark else (0, 0, 0)   # direction that adds contrast
    surfaces = [panel, elevated, deep]
    notes = []

    muted, n = ensure(muted_base, surfaces, 4.5, text)
    if n:
        notes.append(f"muted text: game textMuted {hexc(muted_base)} moved {n}% toward textColor -> {hexc(muted)}")

    if dark:
        ink, n = ensure(accent, surfaces + [button], 4.5, away)
        if n:
            notes.append(f"accent ink: {n}% lighter")
    else:
        # gold is too light for text on light themes: warm it toward the
        # accent's red end (caramel) and darken until AA.
        warm = mix(accent, accent_start, 0.3)
        ink, n = ensure(warm, surfaces + [button], 4.5, away)
        notes.append(f"accent ink (links, 'Neko'): accent {hexc(accent)} warmed 30% toward {hexc(accent_start)}, then darkened {n}% -> {hexc(ink)}")

    darker = min((text, panel), key=lum)
    on_accent, n = ensure(darker, [accent], 4.5, (0, 0, 0))
    if n:
        notes.append(f"text on accent: darkened {n}%")

    control, n = ensure(border, surfaces + [button], 3.0, text)
    if n:
        notes.append(f"control borders: game borderColor {hexc(border)} moved {n}% toward textColor -> {hexc(control)}")

    if dark:
        edge = mix(panel, (0, 0, 0), 0.45)
        focus, n = ensure(accent, surfaces + [button, nav_active], 3.0, away)
    else:
        edge, _ = ensure(border, surfaces, 3.0, text)
        focus, n = ensure(BRAND_BLUE, surfaces + [button, nav_active], 3.0, (0, 0, 0))
        notes.append(f"focus ring: brand blue {hexc(BRAND_BLUE)} darkened {n}% -> {hexc(focus)}")

    nav_text = pal["navActiveText"]
    if ratio(nav_text, nav_active) < 4.5:
        nav_text, n = ensure(nav_text, [nav_active], 4.5, away)
        notes.append(f"active nav text: adjusted {n}%")

    for name, c in (("textColor", text),):
        worst = min(ratio(c, bg) for bg in surfaces + [button])
        if worst < 4.5:
            notes.append(f"WARNING: game {name} is only {worst:.2f}:1 on a surface")

    v = {
        "panel": panel, "elevated": elevated, "button": button, "deep": deep,
        "nav-active": nav_active, "nav-active-text": nav_text, "border": border,
        "text": text, "muted": muted, "accent": accent, "accent-ink": ink,
        "on-accent": on_accent, "control-border": control, "edge": edge, "focus": focus,
    }
    return v, dark, notes


def contrast_rows(v, dark):
    """(label, ratio, target) for every text/UI pair the site uses."""
    rows = []
    for bg in ("panel", "elevated", "deep", "button"):
        rows.append((f"text on {bg}", ratio(v["text"], v[bg]), 4.5))
    rows.append(("active nav text on nav-active", ratio(v["nav-active-text"], v["nav-active"]), 4.5))
    for bg in ("panel", "elevated", "deep"):
        rows.append((f"muted on {bg}", ratio(v["muted"], v[bg]), 4.5))
    for bg in ("panel", "elevated", "deep", "button"):
        rows.append((f"link/accent ink on {bg}", ratio(v["accent-ink"], v[bg]), 4.5))
    rows.append(("text on accent (buttons, role pill)", ratio(v["on-accent"], v["accent"]), 4.5))
    for bg in ("panel", "elevated", "deep", "button", "nav-active"):
        rows.append((f"focus outline vs {bg}", ratio(v["focus"], v[bg]), 3.0))
    for bg in ("panel", "elevated", "deep", "button"):
        rows.append((f"control border vs {bg}", ratio(v["control-border"], v[bg]), 3.0))
    for bg in ("panel", "deep"):
        # the primary button is visible by its fill or its outline
        rows.append((f"primary button boundary vs {bg}",
                     max(ratio(v["accent"], v[bg]), ratio(v["edge"], v[bg])), 3.0))
    return rows


# ---------------------------------------------------------------- output
def block(selector, v, dark, indent=""):
    lines = [f"{indent}{selector} {{", f"{indent}  color-scheme: {'dark' if dark else 'light'};"]
    for k, c in v.items():
        lines.append(f"{indent}  --{k}: {hexc(c)};")
    lines.append(f"{indent}  --text-rgb: {v['text'][0]} {v['text'][1]} {v['text'][2]};")
    lines.append(f"{indent}  --accent-rgb: {v['accent'][0]} {v['accent'][1]} {v['accent'][2]};")
    lines.append(f"{indent}  --theme-color: {hexc(v['deep'])};")
    lines.append(f"{indent}}}")
    return "\n".join(lines)


def css_string(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__.split("\n\n")[1])
        return 2
    src_path = pathlib.Path(args[0])
    if not src_path.is_file():
        print(f"error: {src_path} not found")
        return 2
    themes, default = parse_theme_file(src_path)
    digest = hashlib.sha256(src_path.read_bytes()).hexdigest()[:12]

    by_id = {t["id"]: t for t in themes}
    for t in themes:
        t["vars"], t["dark"], t["notes"] = site_colors(t["pal"])

    manifest = ";".join(f"{t['slug']}={t['name']}" for t in themes)
    d, l = by_id[default], by_id[LIGHT_SYSTEM_THEME]
    out = [
        "/*",
        "  ChocoNeko site themes. GENERATED by tools/sync-themes.py from the game's",
        "  theme definitions. Do not edit by hand: change the game, then re-run the script.",
        f"  Source fingerprint: sha256 {digest}",
        "",
        "  Game field -> site variable (base values, copied unchanged):",
        "    panelBg -> --panel (page)            elevatedBg -> --elevated (alt sections, cards)",
        "    buttonBg -> --button (chips, pills)  accordionHeaderBg -> --deep (header, hero, footer, lead card)",
        "    navActiveBg/Text -> --nav-active(-text)   borderColor -> --border   textColor -> --text",
        "    accentGradient.Center -> --accent (the shared gold)",
        "  Derived by the site (adjusted only as far as WCAG AA needs):",
        "    --muted (textMuted), --accent-ink (links, wordmark), --on-accent, --control-border,",
        "    --edge (outlines/shadows), --focus (focus outline), --theme-color (browser UI).",
        f"  System (match device): dark -> {d['name']}, light -> {l['name']}.",
        "*/",
        "",
        ":root {",
        f"  --theme-list: {css_string(manifest)};",
        "}",
        "",
    ]
    for t in themes:
        sel = f':root[data-theme="{t["slug"]}"]'
        if t["id"] == default:
            # also the fallback (no JavaScript, unknown id, System on a dark device)
            sel = f":root,\n{sel}"
        out.append(f"/* {t['name']} */")
        out.append(block(sel, t["vars"], t["dark"]))
        out.append("")
    out.append(f"/* System (match device), light device: {l['name']} */")
    out.append("@media (prefers-color-scheme: light) {")
    out.append(block(':root:not([data-theme]),\n  :root[data-theme="system"]', l["vars"], l["dark"], "  "))
    out.append("}")
    outputs = {OUT: "\n".join(out) + "\n"}

    # System defaults for the browser UI colour before JavaScript runs
    metas = (f'<meta name="theme-color" content="{hexc(d["vars"]["deep"])}" media="(prefers-color-scheme: dark)">\n'
             f'  <meta name="theme-color" content="{hexc(l["vars"]["deep"])}" media="(prefers-color-scheme: light)">')
    meta_pat = re.compile(r'<meta name="theme-color"[^>]*media="\(prefers-color-scheme: dark\)">\s*'
                          r'<meta name="theme-color"[^>]*media="\(prefers-color-scheme: light\)">')
    # Early <head> script: applies the saved theme before CSS paints. A saved id
    # that is not in this list (e.g. a removed theme) falls back to System.
    ids = " ".join(["system"] + [t["slug"] for t in themes])
    inline = ('<script>(function(){var ok=" ' + ids + ' ",t;'
              'try{t=localStorage.getItem("choconeko-theme")}catch(e){}'
              'document.documentElement.setAttribute("data-theme",'
              't&&ok.indexOf(" "+t+" ")>=0?t:"system")})();</script>')
    script_pat = re.compile(r'<script>\(function\(\)\{var [^<]*?"choconeko-theme"[^<]*?</script>')
    problems = []
    for html in sorted(SITE.rglob("*.html")):
        s = html.read_text(encoding="utf-8")
        if "themes.css" not in s:
            continue
        new, n_script = script_pat.subn(lambda m: inline, s)
        new, n_meta = meta_pat.subn(lambda m: metas, new)
        if n_script != 1 or n_meta != 1:
            problems.append(f"{html.relative_to(SITE)}: expected one early theme script and one "
                            f"pair of theme-color tags, found {n_script} and {n_meta}")
        outputs[html] = new

    check = "--check" in argv
    stale = []
    for path, content in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == content:
            continue
        stale.append(path.relative_to(SITE))
        if not check:
            path.write_text(content, encoding="utf-8")
    if check:
        print(f"check: {len(outputs)} generated files compared, "
              + (f"OUT OF DATE: {', '.join(map(str, stale))}" if stale else "all up to date"))
    else:
        print(f"{len(themes)} themes, default {default}, system light {LIGHT_SYSTEM_THEME}; "
              + (f"updated: {', '.join(map(str, stale))}" if stale else "no files changed"))
    for msg in problems:
        print(f"error: {msg}")
    fails = 0
    for t in themes:
        rows = contrast_rows(t["vars"], t["dark"])
        bad = [r for r in rows if r[1] < r[2]]
        fails += len(bad)
        worst_text = min(r[1] for r in rows if r[2] == 4.5)
        worst_ui = min(r[1] for r in rows if r[2] == 3.0)
        print(f"\n{t['name']} ({t['slug']}, {'dark' if t['dark'] else 'light'}): "
              f"lowest text {worst_text:.2f}:1, lowest UI {worst_ui:.2f}:1, {len(bad)} below target")
        if "--verbose" in argv or bad:
            for label, r, target in rows:
                print(f"    {label:40s} {r:5.2f}:1  (needs {target}){'  FAIL' if r < target else ''}")
        for n in t["notes"]:
            print(f"    adjusted: {n}")
    print(f"\ncontrast: {'all pairs pass WCAG AA' if not fails else f'{fails} pair(s) below target'}")
    if problems:
        return 1
    return 1 if (check and (fails or stale)) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
