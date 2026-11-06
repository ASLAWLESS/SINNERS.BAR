const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const esc = t => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
const money = n => '$' + Number(n || 0).toFixed(2);
const S = { user: null, master: false, tab: 'menu', products: [], orders: [], cart: {}, edit: null, who: '', note: '' };
const ic = n => `<i class="ti ti-${n}"></i> `;
const LABEL = { nuevo: 'Nuevo', preparando: 'Preparando', listo: 'Listo', entregado: 'Entregado' };
const NEXT = { nuevo: 'preparando', preparando: 'listo', listo: 'entregado' };
const NEXTTXT = { preparando: 'Preparar', listo: 'Marcar listo', entregado: 'Entregado' };
const NEXTICO = { preparando: 'flame', listo: 'check', entregado: 'package' };
const TABICO = { tickets: 'ticket', catalog: 'list-details', menu: 'glass-cocktail', mine: 'receipt' };
let channel = null;

async function init() {
  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user);
  sb.auth.onAuthStateChange((_e, s) => { if ((s?.user?.id || null) !== (S.user?.id || null)) setUser(s?.user); });
}
async function setUser(u) {
  S.user = u || null;
  if (channel) { sb.removeChannel(channel); channel = null; }
  if (!u) { S.master = false; return render(); }
  const { data } = await sb.from('profiles').select('role').eq('id', u.id).single();
  S.master = data?.role === 'master';
  S.tab = S.master ? 'tickets' : 'menu';
  await Promise.all([loadProducts(), loadOrders()]);
  channel = sb.channel('orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async p => {
    await loadOrders();
    if (S.master && p.eventType === 'INSERT') beep();
  }).subscribe();
  render();
}
async function loadProducts() { const { data } = await sb.from('products').select('*').order('name'); S.products = data || []; }
async function loadOrders() {
  const { data } = await sb.from('orders').select('*, order_items(*)').order('created_at');
  S.orders = data || []; render();
}
function beep() { try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + .18); } catch (e) {} }

function render() {
  $('#logout').hidden = !S.user;
  $('#role').textContent = !S.user ? '' : S.master ? 'MASTER' : 'CLIENTE';
  if (!S.user) { $('#nav').innerHTML = ''; $('#cartbar').innerHTML = ''; return loginView(); }
  const tabs = S.master ? [['tickets', 'Tickets'], ['catalog', 'Catálogo'], ['menu', 'Ver menú']] : [['menu', 'Menú'], ['mine', 'Mis pedidos']];
  const n = S.orders.filter(o => o.status === 'nuevo').length;
  $('#nav').innerHTML = tabs.map(t => `<button data-t="${t[0]}" class="${S.tab === t[0] ? 'on' : ''}">${ic(TABICO[t[0]])}${t[1]}${t[0] === 'tickets' && n ? ' (' + n + ')' : ''}</button>`).join('');
  $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; render(); });
  const m = $('#main');
  m.innerHTML = S.tab === 'menu' ? menuHTML() : S.tab === 'mine' ? listHTML(S.orders.filter(o => o.user_id === S.user.id).reverse(), false) : S.tab === 'tickets' ? ticketsHTML() : catalogHTML();
  bind(); cartBar();
}

function loginView() {
  $('#main').innerHTML = `<div class="login card"><b>Entrar o crear cuenta</b><div style="height:8px"></div>
  <input id="em" type="email" placeholder="Correo"><input id="pw" type="password" placeholder="Contraseña (mín. 6)">
  <div class="acts"><button class="btn" id="in">${ic('login')}Entrar</button><button class="btn g" id="up">${ic('user-plus')}Registrarme</button></div><div class="mu" id="msg"></div></div>`;
  const go = async mode => {
    const email = $('#em').value.trim(), password = $('#pw').value;
    const { data, error } = mode === 'in' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    $('#msg').textContent = error ? error.message : (mode === 'up' && !data.session ? 'Revisa tu correo para confirmar la cuenta.' : '');
  };
  $('#in').onclick = () => go('in'); $('#up').onclick = () => go('up');
}
$('#logout').onclick = () => sb.auth.signOut();

function menuHTML() {
  const items = S.products.filter(p => p.available);
  if (!items.length) return `<div class="empty">${S.master ? 'Aún no hay bebidas. Agrégalas en «Catálogo».' : 'El menú está vacío por ahora.'}</div>`;
  const cats = {}; items.forEach(p => (cats[p.category || 'Otros'] ||= []).push(p));
  return Object.keys(cats).sort().map(c => `<h2>${esc(c)}</h2>` + cats[c].map(p => `<div class="card row"><div><b>${esc(p.name)}</b><div class="mu">${esc(p.description)}</div><div class="pr">${money(p.price)}</div></div>
  <div class="qty"><button data-dec="${p.id}">−</button><b>${S.cart[p.id] || 0}</b><button data-inc="${p.id}">+</button></div></div>`).join('')).join('');
}
function cartBar() {
  const el = $('#cartbar'), ids = Object.keys(S.cart).filter(k => S.cart[k] > 0);
  if (S.tab !== 'menu' || !ids.length) return el.innerHTML = '';
  let tot = 0, cnt = 0; ids.forEach(k => { const p = S.products.find(x => x.id == k); if (p) { tot += p.price * S.cart[k]; cnt += S.cart[k]; } });
  el.innerHTML = `<div class="cart"><input id="who" placeholder="Tu nombre o número de mesa" value="${esc(S.who)}"><input id="note" placeholder="Notas (sin hielo…)" value="${esc(S.note)}">
  <div class="row"><b>${cnt} bebida(s) · ${money(tot)}</b><button class="btn" id="send">${ic('send')}Pedir</button></div></div>`;
  $('#who').oninput = e => S.who = e.target.value; $('#note').oninput = e => S.note = e.target.value;
  $('#send').onclick = sendOrder;
}
async function sendOrder() {
  if (!S.who.trim()) return $('#who').focus();
  const items = Object.keys(S.cart).filter(k => S.cart[k] > 0).map(k => { const p = S.products.find(x => x.id == k); return p && { product_name: p.name, qty: S.cart[k], price: p.price }; }).filter(Boolean);
  const btn = $('#send'); btn.disabled = true;
  const { data: o, error } = await sb.from('orders').insert({ who: S.who.trim(), note: S.note.trim() }).select().single();
  if (error) { btn.disabled = false; return alert('No se pudo enviar: ' + error.message); }
  const { error: e2 } = await sb.from('order_items').insert(items.map(i => ({ ...i, order_id: o.id })));
  if (e2) { await sb.from('orders').delete().eq('id', o.id); btn.disabled = false; return alert('No se pudo enviar: ' + e2.message); }
  S.cart = {}; S.note = ''; S.tab = 'mine'; loadOrders();
}

function ticketCard(o, master) {
  const items = o.order_items || [], tot = items.reduce((a, i) => a + i.qty * i.price, 0), nx = NEXT[o.status];
  return `<div class="card ticket ${o.status}"><div class="row"><b>#${o.id} · ${esc(o.who)}</b><span class="st s-${o.status}">${LABEL[o.status]}</span></div>
  <ul>${items.map(i => `<li>${i.qty}× ${esc(i.product_name)}</li>`).join('')}</ul>${o.note ? `<div class="mu">${ic('note')}${esc(o.note)}</div>` : ''}
  <div class="row mu"><span>${new Date(o.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span><b class="pr">${money(tot)}</b></div>
  <div class="acts">${master && nx ? `<button class="btn" data-st="${o.id}" data-to="${nx}">${ic(NEXTICO[nx])}${NEXTTXT[nx]}</button>` : ''}
  ${master ? `<button class="btn d" data-del="${o.id}">${ic('trash')}Borrar</button>` : o.status === 'nuevo' ? `<button class="btn d" data-del="${o.id}">${ic('x')}Cancelar pedido</button>` : ''}</div></div>`;
}
function ticketsHTML() {
  const act = S.orders.filter(o => o.status !== 'entregado'), done = S.orders.filter(o => o.status === 'entregado').reverse().slice(0, 10);
  return (act.length ? act.map(o => ticketCard(o, true)).join('') : '<div class="empty">Sin tickets pendientes 🍹</div>') + (done.length ? '<h2>Entregados</h2>' + done.map(o => ticketCard(o, true)).join('') : '');
}
const listHTML = l => l.length ? l.map(o => ticketCard(o, false)).join('') : '<div class="empty">Todavía no has pedido nada.</div>';

function catalogHTML() {
  const f = S.edit || {};
  return `<div class="card"><b>${f.id ? 'Editar bebida' : 'Nueva bebida'}</b><div style="height:8px"></div>
  <input id="f-name" placeholder="Nombre" value="${esc(f.name)}"><input id="f-cat" placeholder="Categoría" value="${esc(f.category)}">
  <input id="f-price" type="number" step="0.25" min="0" placeholder="Precio" value="${f.price ?? ''}"><textarea id="f-desc" rows="2" placeholder="Descripción">${esc(f.description)}</textarea>
  <div class="acts"><button class="btn" id="f-save">${ic('device-floppy')}Guardar</button>${f.id ? `<button class="btn g" id="f-cancel">${ic('x')}Cancelar</button>` : ''}</div></div>` +
  (S.products.length ? `<h2>Catálogo (${S.products.length})</h2>` : '') + S.products.map(p => `<div class="card"><div class="row ${p.available ? '' : 'off'}"><div><b>${esc(p.name)}</b> <span class="mu">· ${esc(p.category)}</span><div class="mu">${esc(p.description)}</div></div><span class="pr">${money(p.price)}</span></div>
  <div class="acts"><button class="btn g" data-av="${p.id}">${p.available ? ic('ban') + 'Agotado' : ic('check') + 'Activar'}</button><button class="btn g" data-ed="${p.id}">${ic('pencil')}Editar</button><button class="btn d" data-rm="${p.id}">${ic('trash')}Eliminar</button></div></div>`).join('');
}

function bind() {
  const q = (a, fn) => document.querySelectorAll(`[${a}]`).forEach(b => b.onclick = () => fn(b.getAttribute(a), b));
  const run = async p => { const { error } = await p; if (error) alert(error.message); };
  q('data-inc', id => { S.cart[id] = (S.cart[id] || 0) + 1; render(); });
  q('data-dec', id => { S.cart[id] = Math.max(0, (S.cart[id] || 0) - 1); render(); });
  q('data-st', async (id, b) => { await run(sb.from('orders').update({ status: b.dataset.to }).eq('id', id)); loadOrders(); });
  q('data-del', async id => { if (confirm('¿Borrar este pedido?')) { await run(sb.from('orders').delete().eq('id', id)); loadOrders(); } });
  q('data-av', async id => { const p = S.products.find(x => x.id == id); await run(sb.from('products').update({ available: !p.available }).eq('id', id)); loadProducts().then(render); });
  q('data-ed', id => { S.edit = S.products.find(x => x.id == id); render(); scrollTo(0, 0); });
  q('data-rm', async id => { if (confirm('¿Eliminar esta bebida?')) { await run(sb.from('products').delete().eq('id', id)); loadProducts().then(render); } });
  const sv = $('#f-save');
  if (sv) sv.onclick = async () => {
    const d = { name: $('#f-name').value.trim(), category: $('#f-cat').value.trim() || 'Otros', price: parseFloat($('#f-price').value) || 0, description: $('#f-desc').value.trim() };
    if (!d.name) return $('#f-name').focus();
    await run(S.edit?.id ? sb.from('products').update(d).eq('id', S.edit.id) : sb.from('products').insert(d));
    S.edit = null; loadProducts().then(render);
  };
  const cn = $('#f-cancel'); if (cn) cn.onclick = () => { S.edit = null; render(); };
}
init();