# Data Show – code structure

`app/src/main/assets/index.html` was one 584 KB file. It is now split into plain
CSS/JS files. **No logic was rewritten**: the code is the same, only moved.
There is still no build step (no npm, no bundler); files are normal `<script>` /
`<link>` tags, so all top-level names stay global exactly as before.

```
assets/
  index.html              page markup + <link>/<script> tags (load order matters)
  css/
    base.css              main theme and layout
    tools.css             Tools screen
    card-styles.css       card style variants
    preview.css           preview box, camera, video, reader, panels
    daily-cards.css       daily / future cards
    live-table.css        live DSE price table
  js/
    seed-demo.js          demo data on first run (runs first, in <head>)
    core/state-libs.js    global state, lazy library loader (libs/)
    data/import.js        file import and parsers (xlsx, pdf, docx, csv, json, paste)
    data/rows.js          row cleaning, dates, header detection, sorting
    cards/engine.js       card engine, daily/future cards, layout options
    cards/design.js       design, theme, fields, presets
    pages/compare-show.js tabs, Compare, Cards page, charts, Buy/Sell typing
    pages/projects.js     projects, merge, Files list, main render()
    export/export.js      share, image/PDF export
    docs/library.js       stored originals (IndexedDB), file library, + menu, viewer
    pages/selection-customize.js  row selection, Customize panel, startup restore
    app/files-page.js     Files page, bottom nav, scan/preview box, web link, share
    app/tools-grid.js     Tools grid
    app/home-layout.js    show/hide Home sections
    app/updater-button.js update button
    app/nav-home.js       Home/Files tab behaviour
    app/notes.js          Notes
    app/pdf-reader.js     PDF reader/editor
    app/photo-editor.js   opens the photo editor (HTML for it is `#peSrc` in index.html)
    app/live-table.js     live DSE price table
    app/portfolio.js      My portfolio (Table page): portfolio PDF, Buy/Sell PDF, Gmail import, Send to Cards
  libs/                   third-party libraries (pdf.js, xlsx, jspdf, jszip, qr)
```

## Rules
1. **Load order = order of the tags in `index.html`.** A file may use functions
   from files above it at load time. Functions used only inside event handlers can
   live anywhere. Example: `docs/library.js` must load before
   `pages/selection-customize.js`, because startup calls `merge()` → `renderLibrary()`.
2. Top-level `let/const/function` are shared by all files (same as the old single script).
3. `#peSrc` (the photo editor's own HTML page, ~95 KB) is kept inline at the bottom of
   `index.html` because `photo-editor.js` reads it with `getElementById('peSrc').textContent`.
4. Never inline `libs/*` into `index.html`.

## Checks used for this split
- `node --check` on every JS file.
- Headless Chrome, original vs split: same number of CSS rules and selectors, same set of
  global names, same startup state, same result of clicking every visible button on all
  pages, zero page errors.

## In-app update (PatchEngine)
`@@WRITE js/app/notes.js … @@END` and `@@FILE js/cards/engine.js` now work on the module
files. Old patch files that use `@@FILE index.html` + `@@FIND <code>` target the old
single file and will not match any more; re-aim them at the module that holds the code.
Updated files are served by `Updater.intercept`; `index.html` is passed to the WebView
directly. Check on a real phone before relying on it for `.js`/`.css` files.

`js/app/back-nav.js` (loaded last): `window.__appBack()` closes the top-most pop-up/page, else goes to the previous tab; `MainActivity.onBackPressed` calls it and exits only on a double press.

## DSE market snapshot (v17)
`data/import.js` → `dseSnapshot(text)`: a table copied from the DSE site (Code / Name, Price, Change %, Volume, Market Cap, P/E, Div Yield) becomes columns Name | Cat | Company | Price | Change % | Volume | Market Cap | P/E | Div Yield. Rows with price 0 and volume 0 (bonds, T-bills, suspended) are dropped. `cards/market.js` draws these as market cards (green/red/grey); `render()` in `pages/projects.js` calls `mktIs()` / `mktCards()`. The Projected chart page sends such text to Cards (`__prDse`) instead of charting it.

## Saved history (v17)
`js/app/history.js`: IndexedDB `dsHistory` (one record per trading day). Sources: live table after 16:00 Dhaka (`ltdata` + 60 s tick, catch-up on next start), pasted DSE table, pasted price history (Projected page / Home). Projected page gets a "📚 Saved" bar; picking a share feeds `__prOpen` with Date/Name/Open/High/Low/Close/Volume text. Drive: `Android.driveOp(put|get|info)` → `window.__drRes`; file `DataShow-history.json.gz`.

## v19 (Nov 3)
- Projected page info cards (inside the `prSrc` template in index.html, info IIFE): tap a tile label (EPS, P/E, Price/NAV, Free Float, Beta, ROE, NAV, DIV, 52W, CIR, shareholding, returns, quarterly EPS/NOCFPS ...) -> floating note `#knp` with 'what it is', 'how it affects the price', and a verdict computed from THIS share's own data (`ctx()` reads the parsed info `lastO`; P/E and P/B are derived from LTP+EPS/NAV when the tile is missing, marked '(হিসাব করা)'). Texts live in the `KB` table; tiles that have a note get dotted underline (class `kn`). Data comes from the share's saved quote page (`ds_pr_infos_v1`) or the live-table fallback; if data is missing the note says to Send/Paste the quote page. Tested in Chromium with a sample quote text.
- Daily data `Avg` column (live-table.js): `view()` fills `r.avg` from `window.__pfAvg()` (portfolio.js: code -> average buy price of shares still held, from `calc()` of the ACTIVE account). Column sits after LTP, visible by default (migration flag `avgV` in `ds_lt_prefs`); shows – for shares not held.
- `js/app/dse-archive.js` (loaded after dse-fetch.js): DSE Day End Archive importer, `old.dsebd.org/day_end_archive.php?startDate&endDate&inst=All%20Instrument&archive=data`. Columns `# | DATE | TRADING CODE | LTP | HIGH | LOW | OPENP | CLOSEP | YCP | TRADE | VALUE(mn) | VOLUME` (order is re-learned from the header line if present; `(mn)` suffix ignored). Input = pasted table text or page HTML. Skips G-Sec/T-bond codes and rows with no trade. Writes via `__hist.saveDay(date,recs,'archive','fill')` (never overwrites). Fetch = `Android.fetchUrl` (ids prefix `da`), 7-day chunks, done chunks remembered in `localStorage ds_arc_done` so it can resume. UI: History sheet > 📥 DSE Archive. API: `window.__dseArc={parse,saveText,fetchRange,open}`. NOTE: the live page was not reachable from the build sandbox (robots), so the parser was tested on the screenshot format only.
- `js/app/dse-fetch.js` (loaded after history.js): Projected page search bar. Share code -> `Android.fetchUrl` -> `https://www.dse.com.bd/api/live/data-archive/day-end?from&to&inst&page` (2 years, up to 8 pages of 500 rows). Reply parsed by key names (date/code/open/high/low/close/volume, also `{cols,rows}` shape), result goes to `__prOpen` as Date/Name/Open/High/Low/Close/Volume. CSV button loads a longer file. NOTE: API shape was NOT verified from the build sandbox (no internet); if "kono data paini" shows, the toast prints the first 80 chars of the reply.
- `MainActivity.fetchUrl`: dse.com.bd gets JSON Accept + Referer data-archives.
- `projected.js`: `__prWaiting()` stays true for 5 min after leaving Projected, so preview ➤ Send lands in Projected.
- Preview ⧉ button is now a menu (`files-page.js` copyMenu): Copy selected / Copy table / Copy all text / Table → Projected / Table → Cards. Native live preview uses new `Android.pvLiveCopy(mode)` -> `window.__pvLiveCopy(mode,text)`.
- versionCode 11.
- v19b: preview ➤ Send is a menu (Projected / Cards) unless Projected is already waiting. `projected.js` `__prOpen(text,{replace})` merges new price-history text into the chart's current data when header and share name match: union by date+name, no double dates, sorted by date (`mergeTxt`). DSE Fetch uses `{replace:1}`. versionCode 12.

- v30: Projected chart timeframe bar moved under the chart (one scrollable row: 1D 1W 2W 1M 3M | Pivot R/S Fib | Zoom 1M 3M 6M 1Y All, pro style); preview toolbar: Select toggle + DSSel panel (chars, +, -, Clear, Exit, Copy, Send to Data Show, Translate, Share, Search), Table, Search, Text, Send text. smartsel.js init is now once-per-page and has DSSel.all().

## v33
- `projected.js`: anything sent to Cards through `pasteData()` (browser/preview "Send to Data Show", Paste) is also remembered in localStorage `ds_pr_stash_v1` as a price history (`h`, Date + CP/Close/Price + Vol rows) or a quote page (`i`, LTP/YCP/52W...). Bottom menu Chart / Projected with no new text now fills an EMPTY chart page from that stash (history first, quote tiles last), else from the app's own rows (`__prAppText`). Before this the pages opened empty.
- A leading `blob:` (page URL scheme at the start of an in-app-browser copy) is stripped in `pasteData` and `__prOpen`.
- versionCode 14.
- v33b: chart Buy/Sell candles (`trMap`) need a share name. Name order: Name column / picker (`prNm`) -> `TRPICK` (new select `#trSel` under the chart note, shown when the data has no name, e.g. bullbd Price Table copy) -> code from the quote info tiles (`ds_pr_info`).

## v36
- Projected page: the info cards (`#ic`: LTP/AVGP/YCP..., returns, quarterly EPS/NOCFPS, fundamentals, dividend, shareholding) moved to just AFTER the Projected price (`#tp`), proj view only (hidden in chart view).
- Info is now stored PER SHARE in localStorage `ds_pr_infos_v1` ({CODE:{r:rawText,t:time}}, max 300 shares). `projected.js` `remember()` saves every quote page that arrives via preview/browser Send, Paste or Projected Send (`__prInfoPut`, code read from the "CODE / Company Limited" header lines). The iframe `refresh()` shows the card for the share currently open in the chart and HIDES it when that share has no saved info. Old `ds_pr_info` (last page) is still written because `trName()` uses it.
- versionCode 17.

## v37 – LankaBangla ledger in My portfolio
- `js/app/portfolio.js`: new **Ledger PDF** support ("CLIENT'S LEDGER DETAILS"). Pick it with Buy/Sell PDF (or Holdings PDF, or Gmail AUTO): `isLedger(cells)` → `parseLedger(cells)` → `addLedger()`. Rows: `DATE Buy|Sale CODE QTY RATE AMOUNT COMM DEBIT CREDIT BALANCE`; some pages glue date + type (`02-May-2024Buy`), long codes wrap onto the next line (`ONEBANKPL` + `C`). Buy rate = Debit/Qty, Sale rate = Credit/Qty (brokerage included = the statement's Cost price). `LEDGER_ALIAS` renames codes the broker changed (LHBL→LHB). Trades are stored with `src:'L'`; importing a newer ledger replaces them; Buy/Sell confirmations inside the ledger period are dropped/skipped. Account flag `A.lg=1`.
- Share transfer from another broker (not in the ledger): add that broker's portfolio PDF (Bank Asia layout) with Holdings PDF → preview → **Add as transfer-in** (`#gpXf`): Buy rows with `src:'X'`, dated on the statement date, priced at the statement's MARKET price (the broker books transfers at market value: Bank Asia 11-Jun-2024 market value 9,269.80 = LankaBangla "Share Transfer In 9,270").
- Cards rows of a ledger portfolio = `cardRowsLots(A)`: the FULL history, one row per trade (Buy + Sell, so the Cards filter All / Buy / Sell works). Against the NEWEST portfolio statement: a Sell row (dated on the statement) for shares it no longer has / has fewer of, a Buy row for missing ones, and the prices of lots still held are scaled per share so qty × price = the statement's Cost Amount. The Cards **Net** view (FIFO, `netRows` in compare-show.js; same order: date, Buy first) then equals the statement exactly (45 shares, qty 4,356, cost 35,279.08, verified). Sold lots keep their real prices. Trades dated after the statement are added on top. Transfer lots carry `old` = the other broker's avg cost → 6th column **Bank Asia cost**.
- Holdings preview keeps the exact avg cost (box shows 4 decimals) unless the line was edited (`precise`), so totals match the PDF to the paisa.

## Mini bars (v23)
`js/app/mini-bars.js` (loaded after dse-fetch.js): a 4-bar icon (last 4 day-end closes, green/red vs previous day) is added after the share name in Table > Daily data, Table > My portfolio and the Daily card. Data: `__hist.series` if it has 5+ days, else `__dseLast(code,5)` (DSE day-end API, one page, ~18 days) cached in `ds_mb_v1` per day; fetched lazily for icons on screen (IntersectionObserver, 2 at a time). Tap = `__shareGo(code)` -> DSE Fetch (2 yrs) -> `__prOpen(txt,{view:'both'})`: new Projected view `both` = chart + projected part on one page (falls back to saved history if offline). Icons are injected by a MutationObserver, so the existing renderers were not touched.

## Calculator + Favorites (v24)
- `js/app/calculator.js` + `css/calc.css`: floating, draggable, minimizable calculator (never full screen). Opened from the + menu (`data-add="calc"`, next to Settings → `docAdd('calc')` → `window.__calcToggle()`). Position is saved in `ds_calc_pos`. Own expression parser, no `eval`; `100+10%` = 110.
- While it is open, a tap on any number in the page is taken by a capture-phase click listener and sent to the calculator (the card's own tap/select/long-press handlers are bypassed). A number that is calculated carries `data-calc="<formula>"` (helper `fxA(formula)` in `cards/engine.js`), e.g. BT.AMT `200×5.0702`, T.AMT `200×5.0702+50×4.8192`, T.AVG `1255÷250`, F.Avg `5.0702×(1+26%)`, gain, Total qty/amount/avg on the summary card, Future and Daily cards. Formula terms are collected in `render()` (`runQ`, `runD.at/gf/q`, `stats.t*` arrays). Numbers without a formula are read from the text under the finger (`caretRangeFromPoint`).
- Favorites: `design.favs = {SHARE_NAME_UPPER:1}` (saved with the design). Star on Daily / Future / Total cards and a "☆ Favorite" button in the row tools (tap a card). `toggleFav()` in `cards/engine.js`; `favFirst()` in `data/rows.js` moves favorite shares to the front after every sort.
