'use strict';
/* ============================================================
   APLIKASI LATIHAN CPNS — Logika Klien (SPA)
   Prinsip: navigasi 0ms (tanpa reload), cache lokal (stale-while-
   revalidate), timer & jawaban di perangkat, kirim sekali (batch).
   ============================================================ */
const S = { token: null, user: null, cfg: {}, page: '', params: {}, nav: 0, charts: {}, st: {}, imgs: {}, exam: null };
const ACT = {}, CHG = {}, INP = {}, SUB = {}, VIEWS = {};
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } };
const TZ = 'Asia/Jakarta';
const fmtDT = ms => ms ? new Date(+ms).toLocaleString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/(\d{2})\.(\d{2})$/, '$1:$2') + ' WIB' : '-';
const fmtD = ms => ms ? new Date(+ms).toLocaleDateString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtShort = ms => ms ? new Date(+ms).toLocaleDateString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short' }) : '-';
const nf = n => (n === null || n === undefined || n === '') ? '-' : new Intl.NumberFormat('id-ID').format(n);
const fmtMs = ms => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m + ' mnt ' + String(s % 60).padStart(2, '0') + ' dtk'; };
const toLocalInput = ms => { if (!ms) return ''; const d = new Date(+ms), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const isAdmin = () => S.user && S.user.role === 'Admin';

/* ---------- RPC ke backend (GitHub Pages -> GAS Web App via fetch) ---------- */
async function rpc(fn, ...args) {
  const url = (window.APP_CONFIG && window.APP_CONFIG.API_URL) ? window.APP_CONFIG.API_URL.trim() : '';
  if (!url || url.indexOf('ISI_URL_WEB_APP_GAS') >= 0) {
    throw new Error('URL Backend (API_URL) di js/config.js belum diisi.');
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn, args }),
      redirect: 'follow'
    });
  } catch (e) {
    throw new Error('Gagal terhubung ke server. Periksa koneksi internet atau URL Web App GAS Anda.');
  }
  if (!res.ok) throw new Error('Gagal terhubung ke server (HTTP ' + res.status + ').');
  return await res.json();
}
async function call(action, payload, opt) {
  opt = opt || {};
  let left = opt.retry || 0, n = 0;
  for (;;) {
    try {
      const r = await rpc('api', S.token, action, payload || {});
      if (!r || !r.success) {
        if (r && r.code === 'AUTH') forceLogout(r.message);
        const e = new Error((r && r.message) || 'Terjadi kesalahan.'); e.code = (r && r.code) || 'ERR'; throw e;
      }
      return r.data;
    } catch (e) {
      if (e.code || left-- <= 0) throw e;
      await sleep(1500 * (++n));
    }
  }
}
/** Tampilkan data tersimpan lebih dulu (instan), lalu segarkan dari server. */
function swr(key, action, payload, render) {
  const nav = S.nav, k = 'c_' + (S.user ? S.user.id : '') + '_' + key, c = lsGet(k);
  if (c) { try { render(JSON.parse(c), true); } catch (e) { /* cache rusak */ } }
  return call(action, payload).then(d => {
    if (nav !== S.nav) return d;
    lsSet(k, JSON.stringify(d)); render(d, false); return d;
  }).catch(e => { if (nav === S.nav && !c) viewError(e); });
}
function viewError(e) {
  const v = $('#view'); if (!v) return;
  v.innerHTML = '<div class="card empty"><i class="bi bi-wifi-off"></i><b>Gagal memuat data</b><p class="mb">' + esc(e.message) + '</p><button class="btn primary" data-act="reload">Coba Lagi</button></div>';
}
ACT.reload = () => go(S.page, S.params);

/* ---------- Komponen UI umum ---------- */
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.innerHTML = '<i class="bi ' + (type === 'ok' ? 'bi-check-circle-fill' : type === 'bad' ? 'bi-exclamation-circle-fill' : 'bi-info-circle-fill') + '"></i><span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800); setTimeout(() => el.remove(), 4300);
}
function showLoader(t) { $('#loaderTxt').textContent = t || 'Memuat…'; $('#loader').hidden = false; }
function hideLoader() { $('#loader').hidden = true; }
function openModal(o) {
  closeModal();
  $('#modalRoot').innerHTML = '<div class="mback"><div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><div class="mhead"><h3>' + esc(o.title) + '</h3><button class="icon-btn" data-act="closeModal" aria-label="Tutup"><i class="bi bi-x-lg"></i></button></div><div class="mbody">' + o.body + '</div>' + (o.foot ? '<div class="mfoot">' + o.foot + '</div>' : '') + '</div></div>';
  S.onClose = o.onClose || null; S.modalPersist = !!o.persist;
  document.body.classList.add('noscroll');
  if (o.onOpen) o.onOpen($('.modal'));
}
function closeModal() {
  const f = S.onClose; S.onClose = null;
  $('#modalRoot').innerHTML = ''; document.body.classList.remove('noscroll');
  if (f) f();
}
ACT.closeModal = () => closeModal();
function confirmBox(msg, o) {
  o = o || {};
  return new Promise(res => {
    S.cfm = res;
    openModal({ title: o.title || 'Konfirmasi', body: '<div class="pre">' + msg + '</div>', foot: '<button class="btn ghost" data-act="cfmNo">' + (o.no || 'Batal') + '</button><button class="btn ' + (o.danger ? 'danger-solid' : 'primary') + '" data-act="cfmYes">' + (o.yes || 'Ya') + '</button>', onClose: () => { if (S.cfm) { const r = S.cfm; S.cfm = null; r(false); } } });
  });
}
ACT.cfmYes = () => { const r = S.cfm; S.cfm = null; closeModal(); if (r) r(true); };
ACT.cfmNo = () => closeModal();
function setBusy(b, on, txt) { if (!b) return; if (on) { b.dataset.o = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin" style="width:16px;height:16px;border-width:2px"></span> ' + (txt || ''); } else { b.disabled = false; if (b.dataset.o) b.innerHTML = b.dataset.o; } }

/* delegasi event */
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el) return; const f = ACT[el.dataset.act]; if (f) { if (el.tagName === 'A') e.preventDefault(); f(el.dataset.arg, el, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el.type === 'checkbox' ? el.checked : el.value, el, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el && INP[el.dataset.inp]) INP[el.dataset.inp](el.value, el, e); });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-sub]'); if (f) { e.preventDefault(); if (SUB[f.dataset.sub]) SUB[f.dataset.sub](f, e); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('.mback') && !S.modalPersist) closeModal(); });

/* ---------- Grafik ---------- */
function chartTheme() { const d = document.documentElement.dataset.theme === 'dark'; return { tx: d ? '#b7d1c6' : '#688077', grid: d ? 'rgba(255,255,255,.08)' : 'rgba(46,184,126,.12)' }; }
function chartBox(id, h) { return '<div class="chartbox" style="height:' + (h || 260) + 'px"><canvas id="' + id + '" role="img" aria-label="Grafik"></canvas></div>'; }
function mkChart(id, cfg) {
  const c = document.getElementById(id); if (!c || !window.Chart) return;
  if (S.charts[id]) S.charts[id].destroy();
  const t = chartTheme(); Chart.defaults.font.family = "'Nunito Sans',sans-serif"; Chart.defaults.color = t.tx;
  cfg.options = cfg.options || {}; cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
  if (cfg.options.scales) Object.keys(cfg.options.scales).forEach(k => { const s = cfg.options.scales[k]; s.grid = s.grid || { color: t.grid }; });
  S.charts[id] = new Chart(c, cfg);
}
function destroyCharts() { Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { /* abaikan */ } }); S.charts = {}; }
const CK = { TWK: '#f59e0b', TIU: '#3b82f6', TKP: '#ec4899' };

/* ---------- Helper tampilan ---------- */
const KAT = { TWK: 'Tes Wawasan Kebangsaan', TIU: 'Tes Inteligensia Umum', TKP: 'Tes Karakteristik Pribadi' };
const katChip = k => '<span class="chip k-' + String(k).toLowerCase() + '">' + esc(k) + '</span>';
const SC = { Aktif: 'ok', Selesai: 'ok', Lulus: 'ok', Terkirim: 'ok', Menunggu: 'warn', Antre: 'warn', Ditolak: 'bad', 'Tidak Lulus': 'bad', 'Belum Lulus': 'bad', Draft: 'draft', Nonaktif: 'off', Kedaluwarsa: 'off', Berjalan: 'info', Terjadwal: 'info', Berlangsung: 'live', Latihan: 'draft', Tryout: 'info' };
const stChip = s => '<span class="chip s-' + (SC[s] || (String(s).indexOf('Gagal') === 0 ? 'bad' : 'draft')) + '">' + esc(s) + '</span>';
const lulusChip = l => stChip(l ? 'Lulus' : 'Tidak Lulus');
function initials(n) { const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
const avatar = (n, cls) => '<span class="avatar ' + (cls || '') + '">' + esc(initials(n)) + '</span>';
function bar(p, color, marker) { p = Math.max(0, Math.min(100, p || 0)); return '<div class="bar"><i style="width:' + p + '%;background:' + color + '"></i>' + (marker != null ? '<b style="left:' + Math.min(100, marker) + '%" title="Passing grade"></b>' : '') + '</div>'; }
function ring(p, txt, sub, color) { return '<div class="ring" style="--p:' + Math.round(p) + ';--c:' + color + '"><div><b>' + txt + '</b><small>' + sub + '</small></div></div>'; }
function kpi(label, value, sub, icon, color) { return '<div class="card kpi"><div class="kpi-top"><span class="kpi-l">' + label + '</span><span class="kpi-i ' + (color || '') + '"><i class="bi ' + icon + '"></i></span></div><div class="kpi-v">' + value + '</div><div class="kpi-s">' + (sub || '&nbsp;') + '</div></div>'; }
function empty(icon, t, s) { return '<div class="empty"><i class="bi ' + icon + '"></i><b>' + t + '</b><span>' + (s || '') + '</span></div>'; }
function skel(n) { let h = '<div class="card pad skel">'; for (let i = 0; i < (n || 5); i++) h += '<i style="width:' + (60 + (i * 13) % 40) + '%"></i>'; return h + '</div>'; }
function pageHead(crumb, title, sub, actions) { return '<div class="ph"><div><div class="crumb">' + esc(crumb) + '</div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (actions ? '<div class="row wrap">' + actions + '</div>' : '') + '</div>'; }
function pager(total, page, size, act) {
  const pages = Math.max(1, Math.ceil(total / size)), a = (page - 1) * size + 1, b = Math.min(total, page * size);
  const list = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i); else if (list[list.length - 1] !== '…') list.push('…');
  return '<div class="pager"><span>' + (total ? 'Menampilkan ' + a + '–' + b + ' dari ' + nf(total) : 'Tidak ada data') + '</span><div class="row gap-s wrap"><label class="row gap-s sm">Baris <select class="sel" data-chg="' + act + 'Size" aria-label="Baris per halaman">' + [10, 25, 50].map(n => '<option ' + (n === size ? 'selected' : '') + '>' + n + '</option>').join('') + '</select></label><div class="pg"><button data-act="' + act + '" data-arg="' + (page - 1) + '" ' + (page <= 1 ? 'disabled' : '') + ' aria-label="Sebelumnya"><i class="bi bi-chevron-left"></i></button>' +
    list.map(i => i === '…' ? '<span>…</span>' : '<button class="' + (i === page ? 'on' : '') + '" data-act="' + act + '" data-arg="' + i + '">' + i + '</button>').join('') +
    '<button data-act="' + act + '" data-arg="' + (page + 1) + '" ' + (page >= pages ? 'disabled' : '') + ' aria-label="Berikutnya"><i class="bi bi-chevron-right"></i></button></div></div></div>';
}
function dlBlob(nama, parts, mime) { const url = URL.createObjectURL(new Blob(parts, { type: mime })); const a = document.createElement('a'); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
function dlBase64(nama, b64, mime) { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dlBlob(nama, [u8], mime || 'application/octet-stream'); }
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csvDownload(nama, rows) { dlBlob(nama, ['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], 'text/csv;charset=utf-8'); }
function fileToB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Gagal membaca berkas.')); r.readAsDataURL(file); }); }
function imgLoad(soalId) {
  if (S.imgs[soalId]) return S.imgs[soalId];
  return (S.imgs[soalId] = call('gambar', { soalId }, { retry: 2 }).then(r => r ? r.uri : null).catch(e => { delete S.imgs[soalId]; throw e; }));
}
ACT.showImg = async (id, el) => {
  const box = document.getElementById('img_' + id); if (!box) return;
  box.innerHTML = '<span class="muted sm">Memuat gambar…</span>';
  try { const u = await imgLoad(id); box.innerHTML = u ? '<img class="qi" alt="Gambar soal" src="' + u + '">' : ''; } catch (e) { box.innerHTML = '<span class="ferr">' + esc(e.message) + '</span>'; }
};

/* ---------- Tema ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  lsSet('cpns_theme', t);
  const mt = document.getElementById('metaTheme');
  if (mt) mt.setAttribute('content', t === 'dark' ? '#162821' : '#2eb87e');
}
ACT.theme = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); if (S.user && !S.exam) go(S.page, S.params); };

/* ============================================================
   AUTENTIKASI
   ============================================================ */
function authShell(inner) {
  const showBtn = !isStandalone() && !!deferredPwaPrompt;
  $('#app').innerHTML = '<div class="auth"><div class="auth-top"><div class="brand"><span class="brand-i"><img src="' + esc((window.APP_CONFIG && window.APP_CONFIG.LOGO_URL) || 'https://res.cloudinary.com/twobznku/image/upload/f_auto/q_auto/Menjaga_Tradisi_Menghasilkan_Kualitas_1_hurgyx.png') + '" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"></span><div><b>' + esc(S.cfg.nama_aplikasi || 'Latihan CPNS') + '</b><small>Portal Simulasi CAT & Evaluasi Kompetensi</small></div></div><div class="row gap-s"><button class="btn sm primary pwa-install-btn ' + (showBtn ? '' : 'hide') + '" data-act="pwaInstall"><i class="bi bi-download"></i> Instal Aplikasi</button><button class="icon-btn" data-act="theme" aria-label="Ganti tema"><i class="bi bi-moon-stars"></i></button></div></div><div class="auth-card card">' + inner + '</div><div class="auth-foot">© ' + new Date().getFullYear() + ' ' + esc(S.cfg.nama_aplikasi || 'Latihan CPNS') + ' · Akses terbatas untuk peserta yang disetujui admin</div></div>';
}
function fld(label, name, o) {
  o = o || {};
  return '<div class="fld"><label class="f" for="f_' + name + '">' + label + '</label><div class="inp-wrap">' + (o.icon ? '<i class="bi ' + o.icon + '"></i>' : '') + '<input class="inp" id="f_' + name + '" name="' + name + '" type="' + (o.type || 'text') + '" ' + (o.ph ? 'placeholder="' + esc(o.ph) + '"' : '') + ' ' + (o.req === false ? '' : 'required') + ' autocomplete="' + (o.ac || 'off') + '" ' + (o.attr || '') + '>' + (o.type === 'password' ? '<button type="button" class="icon-btn eye" data-act="eye" data-arg="f_' + name + '" aria-label="Tampilkan password"><i class="bi bi-eye"></i></button>' : '') + '</div>' + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '</div>';
}
ACT.eye = (id, el) => { const i = document.getElementById(id); i.type = i.type === 'password' ? 'text' : 'password'; el.innerHTML = '<i class="bi bi-eye' + (i.type === 'password' ? '' : '-slash') + '"></i>'; };
function mountAuth(mode, extra) {
  const ann = S.cfg.pengumuman ? '<div class="banner"><i class="bi bi-megaphone"></i><div>' + esc(S.cfg.pengumuman) + '</div></div>' : '';
  if (mode === 'login') {
    authShell('<h2>Masuk ke Akun</h2><p class="sub">Masuk untuk berlatih soal CPNS (TWK, TIU, TKP).</p>' + ann +
      '<form data-sub="login" novalidate><div class="ferr" role="alert"></div>' + fld('Email', 'email', { type: 'email', icon: 'bi-envelope', ph: 'nama@email.com', ac: 'username' }) + fld('Password', 'password', { type: 'password', icon: 'bi-lock', ph: 'Password Anda', ac: 'current-password' }) +
      '<div class="r mb sm"><button type="button" class="linkb" data-act="authGo" data-arg="forgot">Lupa password?</button></div><button class="btn primary block" type="submit">Masuk <i class="bi bi-arrow-right"></i></button></form>' +
      (S.cfg.registrasi_dibuka === 'Ya' ? '<p class="c sm mt">Belum punya akun? <button class="linkb" data-act="authGo" data-arg="register">Ajukan pendaftaran</button></p>' : '<p class="c sm mt muted">Pendaftaran sedang ditutup.</p>'));
  } else if (mode === 'register') {
    authShell('<h2>Ajukan Pendaftaran</h2><p class="sub">Akun aktif setelah disetujui admin; notifikasi dikirim ke email Anda.</p><form data-sub="register" novalidate><div class="ferr" role="alert"></div>' +
      fld('Nama Lengkap', 'nama', { icon: 'bi-person-vcard', ph: 'Contoh: Ahmad Rizky Pratama', ac: 'name' }) + fld('Email Aktif', 'email', { type: 'email', icon: 'bi-envelope', ph: 'ahmad@email.com', ac: 'email', hint: 'Untuk notifikasi persetujuan & hasil latihan' }) +
      fld('Instansi & Formasi Target <span class="muted">(opsional)</span>', 'instansi', { icon: 'bi-building', ph: 'Contoh: Kemenkeu — Analis Kebijakan', req: false }) +
      '<div class="grid2">' + fld('Password', 'password', { type: 'password', icon: 'bi-lock', ac: 'new-password', attr: 'minlength="8" data-inp="pwStrength"' }) + fld('Konfirmasi Password', 'password2', { type: 'password', icon: 'bi-lock-fill', ac: 'new-password' }) + '</div>' +
      '<div class="meter" id="meter"><i></i><i></i><i></i></div><div class="hint" id="meterTxt" style="margin-top:-8px;margin-bottom:12px">Minimal 8 karakter, kombinasi huruf dan angka.</div>' +
      '<label class="chk"><input type="checkbox" name="setuju" required><span>Saya setuju dengan ketentuan penggunaan dan kebijakan privasi aplikasi latihan CPNS.</span></label><button class="btn primary block mt-s" type="submit">Kirim Pendaftaran <i class="bi bi-arrow-right"></i></button></form>' +
      '<p class="c sm mt">Sudah punya akun? <button class="linkb" data-act="authGo" data-arg="login">Masuk</button></p>');
  } else if (mode === 'done') {
    authShell('<div class="ok-box"><i class="bi bi-check-circle-fill"></i><h2 class="mt-s">Pendaftaran Terkirim</h2><p class="muted mt-s">' + esc(extra) + '</p><button class="btn primary mt" data-act="authGo" data-arg="login">Kembali ke Halaman Masuk</button></div>');
  } else if (mode === 'forgot') {
    authShell('<h2>Reset Password</h2><p class="sub">Masukkan email akun; kami kirim kode verifikasi 6 digit.</p><form data-sub="forgot1" novalidate><div class="ferr" role="alert"></div>' + fld('Email', 'email', { type: 'email', icon: 'bi-envelope', ac: 'username' }) + '<button class="btn primary block" type="submit">Kirim Kode</button></form><p class="c sm mt"><button class="linkb" data-act="authGo" data-arg="login">Kembali masuk</button></p>');
  } else if (mode === 'forgot2') {
    authShell('<h2>Masukkan Kode</h2><p class="sub">Cek email <b>' + esc(extra) + '</b> untuk kode verifikasi (berlaku 15 menit).</p><form data-sub="forgot2" data-email="' + esc(extra) + '" novalidate><div class="ferr" role="alert"></div>' + fld('Kode Verifikasi', 'code', { ph: '6 digit', attr: 'inputmode="numeric" maxlength="6"' }) + fld('Password Baru', 'password', { type: 'password', icon: 'bi-lock', ac: 'new-password' }) + '<button class="btn primary block" type="submit">Ubah Password</button></form>');
  }
  const f = $('form'); if (f) { const i = $('input', f); if (i) i.focus(); }
}
ACT.authGo = m => mountAuth(m);
INP.pwStrength = v => {
  let s = 0; if (v.length >= 8) s++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++; if (v.length >= 12 || /[^A-Za-z0-9]/.test(v)) s++;
  $$('#meter i').forEach((e, i) => { e.className = i < s ? 'on' + s : ''; });
  const t = $('#meterTxt'); if (t) t.textContent = v ? ['Lemah', 'Cukup', 'Baik', 'Kuat'][s] + ' — minimal 8 karakter, kombinasi huruf dan angka.' : 'Minimal 8 karakter, kombinasi huruf dan angka.';
};
function ferr(f, m) { const e = $('.ferr', f); if (e) e.textContent = m || ''; }
SUB.login = async f => {
  const b = $('button[type=submit]', f); ferr(f, ''); setBusy(b, true, 'Masuk…');
  try {
    const r = await rpc('login', f.email.value, f.password.value);
    if (!r.success) throw new Error(r.message);
    S.token = r.data.token; S.user = r.data.user; S.cfg = r.data.config;
    lsSet('cpns_tok', S.token); lsSet('cpns_user', JSON.stringify(S.user));
    startApp();
  } catch (e) { ferr(f, e.message); setBusy(b, false); }
};
SUB.register = async f => {
  ferr(f, '');
  const pw = f.password.value;
  if (f.nama.value.trim().length < 3) return ferr(f, 'Nama minimal 3 karakter.');
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return ferr(f, 'Password minimal 8 karakter dan mengandung huruf serta angka.');
  if (pw !== f.password2.value) return ferr(f, 'Konfirmasi password tidak sama.');
  if (!f.setuju.checked) return ferr(f, 'Anda harus menyetujui ketentuan penggunaan.');
  const b = $('button[type=submit]', f); setBusy(b, true, 'Mengirim…');
  try {
    const r = await rpc('register', { nama: f.nama.value, email: f.email.value, instansi: f.instansi.value, password: pw });
    if (!r.success) throw new Error(r.message);
    mountAuth('done', r.message);
  } catch (e) { ferr(f, e.message); setBusy(b, false); }
};
SUB.forgot1 = async f => {
  const b = $('button[type=submit]', f); ferr(f, ''); setBusy(b, true, 'Mengirim…');
  try { const r = await rpc('forgotRequest', f.email.value); if (!r.success) throw new Error(r.message); toast(r.message, 'ok'); mountAuth('forgot2', f.email.value.trim()); }
  catch (e) { ferr(f, e.message); setBusy(b, false); }
};
SUB.forgot2 = async f => {
  const b = $('button[type=submit]', f); ferr(f, ''); setBusy(b, true, 'Memproses…');
  try { const r = await rpc('forgotConfirm', f.dataset.email, f.code.value, f.password.value); if (!r.success) throw new Error(r.message); toast(r.message, 'ok'); mountAuth('login'); }
  catch (e) { ferr(f, e.message); setBusy(b, false); }
};
function forceLogout(msg) {
  if (!S.token) return;
  lsDel('cpns_tok'); lsDel('cpns_user'); S.token = null; S.user = null; stopExamTimers(); S.exam = null;
  hideLoader(); closeModal(); destroyCharts(); mountAuth('login'); toast(msg || 'Sesi berakhir. Silakan masuk kembali.', 'bad');
}
ACT.logout = async () => {
  const t = S.token; try { await rpc('api', t, 'logout', {}); } catch (e) { /* abaikan */ }
  Object.keys(localStorage).filter(k => k.indexOf('c_') === 0).forEach(k => lsDel(k));
  lsDel('cpns_tok'); lsDel('cpns_user'); lsDel('cpns_exam_active'); S.token = null; S.user = null; destroyCharts(); mountAuth('login'); toast('Anda telah keluar.', 'ok');
};

/* ============================================================
   KERANGKA APLIKASI (SIDEBAR + TOPBAR) & ROUTER
   ============================================================ */
const MENU_P = [['beranda', 'Beranda', 'bi-house-door'], ['paket', 'Latihan & Paket', 'bi-journal-check'], ['riwayat', 'Riwayat', 'bi-clock-history'], ['peringkat', 'Peringkat', 'bi-trophy'], ['materi', 'Materi Belajar', 'bi-book'], ['profil', 'Profil', 'bi-person-circle']];
const MENU_A = [['adminDash', 'Dasbor', 'bi-grid'], ['peserta', 'Peserta', 'bi-people'], ['soal', 'Bank Soal', 'bi-question-circle'], ['paketAdmin', 'Paket & Tryout', 'bi-layers'], ['materiAdmin', 'Materi', 'bi-book'], ['peringkat', 'Peringkat', 'bi-trophy'], ['laporan', 'Laporan', 'bi-bar-chart-line'], ['pengaturan', 'Pengaturan', 'bi-gear'], ['paket', 'Uji Coba Latihan', 'bi-play-circle'], ['profil', 'Profil', 'bi-person-circle']];
const BNAV_P = [['beranda', 'Beranda', 'bi-house-door'], ['paket', 'Latihan', 'bi-journal-check'], ['riwayat', 'Riwayat', 'bi-clock-history'], ['peringkat', 'Peringkat', 'bi-trophy'], ['materi', 'Materi', 'bi-book']];
const BNAV_A = [['adminDash', 'Dasbor', 'bi-grid'], ['peserta', 'Peserta', 'bi-people'], ['soal', 'Soal', 'bi-question-circle'], ['paketAdmin', 'Paket', 'bi-layers']];
const TITLES = { beranda: 'Beranda', paket: 'Latihan & Paket', riwayat: 'Riwayat & Grafik', peringkat: 'Papan Peringkat', materi: 'Materi Belajar', profil: 'Profil', hasil: 'Hasil & Pembahasan', adminDash: 'Dasbor Administrasi', peserta: 'Peserta & Persetujuan', soal: 'Bank Soal', paketAdmin: 'Paket & Tryout', materiAdmin: 'Materi Belajar', laporan: 'Laporan & Analitik', pengaturan: 'Pengaturan Sistem' };
const PARENT = { hasil: 'riwayat' };
function syncPesertaBadge(n) {
  ['#bdgPeserta', '#bdgPesertaMob'].forEach(sel => {
    const bd = $(sel);
    if (bd) { bd.textContent = n; bd.classList.toggle('hide', !n); }
  });
}
function mountShell() {
  const menu = isAdmin() ? MENU_A : MENU_P;
  const bnav = isAdmin()
    ? BNAV_A.map(m => '<button data-act="nav" data-arg="' + m[0] + '" data-p="' + m[0] + '"><i class="bi ' + m[2] + '"></i><span>' + m[1] + '</span>' + (m[0] === 'peserta' ? '<b class="bnav-bdg hide" id="bdgPesertaMob"></b>' : '') + '</button>').join('') + '<button data-act="drawer" aria-label="Menu lainnya"><i class="bi bi-grid-3x3-gap"></i><span>Lainnya</span></button>'
    : BNAV_P.map(m => '<button data-act="nav" data-arg="' + m[0] + '" data-p="' + m[0] + '"><i class="bi ' + m[2] + '"></i><span>' + m[1] + '</span></button>').join('');
  $('#app').innerHTML = '<aside class="side" id="side"><div class="brand"><span class="brand-i"><img src="' + esc((window.APP_CONFIG && window.APP_CONFIG.LOGO_URL) || 'https://res.cloudinary.com/twobznku/image/upload/f_auto/q_auto/Menjaga_Tradisi_Menghasilkan_Kualitas_1_hurgyx.png') + '" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"></span><div><b>' + esc(S.cfg.nama_aplikasi || 'Latihan CPNS') + '</b><small>' + (isAdmin() ? 'Panel Admin' : 'Simulasi CAT') + '</small></div></div><nav class="nav" aria-label="Menu utama">' +
    menu.map(m => '<button data-act="nav" data-arg="' + m[0] + '" data-p="' + m[0] + '" title="' + m[1] + '"><i class="bi ' + m[2] + '"></i><span class="lbl">' + m[1] + '</span>' + (m[0] === 'peserta' ? '<span class="badge hide" id="bdgPeserta"></span>' : '') + '</button>').join('') +
    '</nav><div class="side-user">' + avatar(S.user.nama) + '<div><b>' + esc(S.user.nama) + '</b><small>' + (isAdmin() ? 'Superadmin' : 'Peserta Aktif') + '</small></div><button class="icon-btn" data-act="logout" aria-label="Keluar" title="Keluar"><i class="bi bi-box-arrow-right"></i></button></div></aside><div class="scrim" id="scrim" data-act="drawer"></div>' +
    '<div class="main"><header class="top"><button class="icon-btn menu" data-act="drawer" aria-label="Menu"><i class="bi bi-list" style="font-size:22px"></i></button><h4 id="ttl">Beranda</h4><button class="btn sm ghost pwa-install-btn ' + (!isStandalone() && deferredPwaPrompt ? '' : 'hide') + '" data-act="pwaInstall"><i class="bi bi-phone"></i><span class="pwa-lbl"> Instal</span></button><button class="icon-btn" data-act="theme" aria-label="Ganti tema"><i class="bi bi-moon-stars"></i></button><button class="icon-btn top-prof" data-act="nav" data-arg="profil" aria-label="Profil" title="Profil">' + avatar(S.user.nama) + '</button></header><main class="view" id="view"></main><nav class="bnav" id="bnav" aria-label="Navigasi bawah">' + bnav + '</nav></div>';
}
ACT.drawer = () => { $('#side').classList.toggle('open'); $('#scrim').classList.toggle('on'); };
ACT.nav = p => go(p);
const defaultPage = () => isAdmin() ? 'adminDash' : 'beranda';
function go(page, params) {
  if (!VIEWS[page]) page = defaultPage();
  if (!isAdmin() && ['adminDash', 'peserta', 'soal', 'paketAdmin', 'materiAdmin', 'laporan', 'pengaturan'].indexOf(page) >= 0) page = 'beranda';
  S.nav++; S.page = page; S.params = params || {}; destroyCharts();
  const side = $('#side'); if (side) { side.classList.remove('open'); $('#scrim').classList.remove('on'); }
  const act = PARENT[page] ? (isAdmin() ? 'laporan' : PARENT[page]) : page;
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.p === act));
  $$('#bnav button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === act));
  const t = $('#ttl'); if (t) t.textContent = TITLES[page] || '';
  const v = $('#view'); v.innerHTML = skel(6); window.scrollTo(0, 0);
  try { VIEWS[page](S.params); } catch (e) { viewError(e); }
}

/* ============================================================
   PENGENALAN (BOOT)
   ============================================================ */
function startApp() {
  mountShell(); go(defaultPage());
  const active = lsGet('cpns_exam_active');
  if (active) { try { const a = JSON.parse(active); startExam(a.paketId, true); } catch (e) { lsDel('cpns_exam_active'); } }
  call('me').then(d => { S.user = d.user; S.cfg = d.config; lsSet('cpns_user', JSON.stringify(S.user)); }).catch(() => {});
}
(async function init() {
  S.token = lsGet('cpns_tok');
  try { S.user = JSON.parse(lsGet('cpns_user') || 'null'); } catch (e) { S.user = null; }
  try { const r = await rpc('publicInit'); if (r && r.success) S.cfg = r.data; } catch (e) { /* tetap lanjut */ }
  if (S.token && S.user) startApp(); else mountAuth('login');
})();

/* ============================================================
   PESERTA — BERANDA
   ============================================================ */
const LET = ['A', 'B', 'C', 'D', 'E'];
const PGX = {}; // cache pengacak opsi per soal

VIEWS.beranda = () => swr('home', 'home', {}, (d, cached) => {
  if (S.page !== 'beranda') return;
  const nama = (S.user.nama || '').split(' ')[0];
  const last = d.terakhir;
  const v = $('#view');
  v.innerHTML = (d.pengumuman ? '<div class="banner mb"><i class="bi bi-megaphone"></i><div>' + esc(d.pengumuman) + '</div></div>' : '') +
    '<div class="hero mb"><div><h2>Halo, ' + esc(nama) + '! 👋</h2><p>' + (d.total ? 'Anda sudah menyelesaikan ' + d.total + ' sesi latihan. Terus tingkatkan skor menuju passing grade ' + d.pg_total + '.' : 'Mulai latihan pertama Anda — kerjakan paket TWK, TIU, dan TKP untuk melihat posisi Anda terhadap passing grade.') + '</p></div><button class="btn white" data-act="nav" data-arg="paket"><i class="bi bi-play-fill"></i> Mulai Latihan</button></div>' +
    '<div class="g4 keep2 mb">' + kpi('Sesi Selesai', nf(d.total), 'Latihan & tryout', 'bi-journal-check') + kpi('Rata-rata Skor', nf(d.rata), 'Dari semua sesi', 'bi-graph-up', 'tiu') + kpi('Skor Tertinggi', nf(d.tertinggi), 'Passing grade total ' + d.pg_total, 'bi-bullseye', 'twk') +
    kpi('Peringkat', d.peringkat ? '#' + d.peringkat : '-', d.peringkat ? 'dari ' + d.dari + ' peserta' : 'Belum ada skor', 'bi-trophy', 'tkp') + '</div>' +
    '<div class="g-main mb"><div class="card pad"><div class="row"><h4 class="sp">Perkembangan Skor</h4><span class="muted sm">8 sesi terakhir</span></div>' + (d.seri.length ? chartBox('chProg', 250) : empty('bi-graph-up', 'Belum ada data', 'Selesaikan satu sesi untuk melihat grafik.')) + '</div>' +
    '<div class="card pad"><div class="row mb"><h4 class="sp">Hasil Terakhir</h4>' + (last ? '<button class="linkb sm" data-act="lihat" data-arg="' + last.id + '">Lihat detail</button>' : '') + '</div>' +
    (last ? '<div class="muted sm mb">' + esc(last.paket) + ' · Total <b>' + last.total + '</b> ' + lulusChip(last.lulus) + '</div>' + last.kategori.map(k => '<div class="catrow"><div class="top">' + katChip(k.id) + '<b>' + k.skor + '</b><span class="muted sm">/ ' + k.max + ' · PG ' + k.pg + '</span><span class="sp"></span>' + (k.lulus ? stChip('Lulus') : stChip('Tidak Lulus')) + '</div>' + bar(k.max ? k.skor / k.max * 100 : 0, CK[k.id], k.max ? k.pg / k.max * 100 : null) + '</div>').join('') : empty('bi-clipboard-data', 'Belum ada hasil', 'Hasil sesi terakhir tampil di sini.')) + '</div></div>' +
    '<div class="g2"><div class="card pad"><h4 class="mb">Tryout Mendatang</h4>' + (d.mendatang.length ? d.mendatang.map(p => '<div class="row mb"><div class="sp"><b>' + esc(p.nama) + '</b><div class="muted sm">' + (p.tgl_mulai ? fmtDT(p.tgl_mulai) : 'Kapan saja') + ' · ' + p.durasi + ' menit · ' + p.jumlah + ' soal</div></div><button class="btn sm ghost" data-act="nav" data-arg="paket">Buka</button></div>').join('') : empty('bi-calendar-event', 'Belum ada tryout terjadwal', '')) + '</div>' +
    '<div class="card pad"><div class="row mb"><h4 class="sp">Riwayat Terbaru</h4><button class="linkb sm" data-act="nav" data-arg="riwayat">Semua</button></div>' + (d.riwayat.length ? d.riwayat.map(r => '<div class="row mb"><div class="sp"><b>' + esc(r.paket) + '</b><div class="muted sm">' + fmtDT(r.waktu) + '</div></div><b>' + r.skor + '</b>' + lulusChip(r.lulus) + '<button class="icon-btn" data-act="lihat" data-arg="' + r.id + '" aria-label="Lihat hasil"><i class="bi bi-chevron-right"></i></button></div>').join('') : empty('bi-clock-history', 'Belum ada riwayat', '')) + '</div></div>';
  if (d.seri.length) mkChart('chProg', { type: 'line', data: { labels: d.seri.map(x => fmtShort(x.t)), datasets: [{ label: 'Skor', data: d.seri.map(x => x.skor), borderColor: '#2eb87e', backgroundColor: 'rgba(46,184,126,.15)', fill: true, tension: .35, pointRadius: 4 }, { label: 'Passing grade', data: d.seri.map(() => d.pg_total), borderColor: '#f0625c', borderDash: [6, 4], pointRadius: 0 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } });
});

/* ============================================================
   PESERTA — LATIHAN & PAKET
   ============================================================ */
S.st.pk = 'Semua';
VIEWS.paket = () => swr('paket', 'paketList', {}, (d, cached) => {
  if (S.page !== 'paket') return;
  S.paketData = d; drawPaket();
});
function drawPaket() {
  const d = S.paketData || [], f = S.st.pk, now = Date.now();
  const list = d.filter(p => f === 'Semua' || p.jenis === f);
  const cnt = j => d.filter(p => j === 'Semua' || p.jenis === j).length;
  $('#view').innerHTML = pageHead('Latihan', 'Latihan & Paket', 'Pilih paket soal untuk dikerjakan. Timer berjalan di perangkat Anda dan jawaban tersimpan otomatis.') +
    '<div class="tabs mb">' + ['Semua', 'Latihan', 'Tryout'].map(t => '<button class="tab ' + (f === t ? 'on' : '') + '" data-act="pkTab" data-arg="' + t + '">' + t + '<span class="n">' + cnt(t) + '</span></button>').join('') + '</div>' +
    (list.length ? '<div class="pkgrid">' + list.map(p => {
      const belum = p.jenis === 'Tryout' && p.tgl_mulai && now < p.tgl_mulai, tutup = p.jenis === 'Tryout' && p.tgl_selesai && now > p.tgl_selesai;
      let btn;
      if (p.berjalan) btn = '<button class="btn primary sm" data-act="startPaket" data-arg="' + p.id + '"><i class="bi bi-play-fill"></i> Lanjutkan</button>';
      else if (belum) btn = '<button class="btn sm ghost" disabled>Belum dibuka</button>';
      else if (tutup) btn = '<button class="btn sm ghost" disabled>Ditutup</button>';
      else if (!p.bisaUlang) btn = '<button class="btn sm ghost" disabled>Sudah dikerjakan</button>';
      else btn = '<button class="btn primary sm" data-act="startPaket" data-arg="' + p.id + '"><i class="bi bi-play-fill"></i> ' + (p.pengerjaan ? 'Kerjakan Lagi' : 'Mulai') + '</button>';
      return '<div class="card pk"><div class="row">' + stChip(p.jenis) + (p.berjalan ? stChip('Berlangsung') : '') + '<span class="sp"></span>' + (p.pengerjaan ? '<span class="muted sm">' + p.pengerjaan + 'x dikerjakan</span>' : '') + '</div><h4>' + esc(p.nama) + '</h4><p>' + esc(p.deskripsi || '') + '</p>' +
        '<div class="row wrap gap-s">' + ['TWK', 'TIU', 'TKP'].filter(k => p.komp[k]).map(k => katChip(k) + '<span class="sm">' + p.komp[k] + '</span>').join(' ') + '</div>' +
        '<div class="meta"><span><i class="bi bi-list-check"></i>' + p.jumlah + ' soal</span><span><i class="bi bi-clock"></i>' + p.durasi + ' menit</span>' + (p.tgl_mulai ? '<span><i class="bi bi-calendar-event"></i>' + fmtShort(p.tgl_mulai) + (p.tgl_selesai ? ' – ' + fmtShort(p.tgl_selesai) : '') + '</span>' : '') + '</div>' +
        '<div class="foot">' + (p.terbaik !== null ? '<span class="best">Terbaik: ' + p.terbaik + ' ' + (p.lulus ? '<i class="bi bi-check-circle-fill" style="color:var(--ok)"></i>' : '') + '</span>' : '<span class="muted sm">Belum dikerjakan</span>') + '<span class="sp"></span>' + (p.lastSesi ? '<button class="btn sm ghost" data-act="lihat" data-arg="' + p.lastSesi + '">Hasil</button>' : '') + btn + '</div></div>';
    }).join('') + '</div>' : '<div class="card">' + empty('bi-journal-x', 'Belum ada paket', 'Paket akan muncul setelah dipublikasikan admin.') + '</div>');
}
ACT.pkTab = t => { S.st.pk = t; drawPaket(); };
ACT.startPaket = id => {
  const p = (S.paketData || []).find(x => x.id === id); if (!p) return;
  openModal({
    title: p.berjalan ? 'Lanjutkan Sesi' : 'Mulai ' + p.jenis,
    body: '<h4>' + esc(p.nama) + '</h4><div class="row wrap gap-s mt-s">' + ['TWK', 'TIU', 'TKP'].filter(k => p.komp[k]).map(k => katChip(k) + '<span class="sm">' + p.komp[k] + ' soal</span>').join(' ') + '</div>' +
      '<ul class="sm mt" style="padding-left:18px;line-height:24px"><li>Durasi <b>' + p.durasi + ' menit</b>' + (p.berjalan ? ' (waktu tetap berjalan sejak sesi dimulai)' : '') + '.</li><li>Timer terus berjalan meski Anda menutup halaman.</li><li>Jawaban tersimpan otomatis; sesi dapat dilanjutkan bila koneksi terputus.</li><li>Waktu habis → jawaban dikirim otomatis.</li></ul>',
    foot: '<button class="btn ghost" data-act="closeModal">Batal</button><button class="btn primary" data-act="startGo" data-arg="' + id + '"><i class="bi bi-play-fill"></i> ' + (p.berjalan ? 'Lanjutkan' : 'Mulai Sekarang') + '</button>'
  });
};
ACT.startGo = id => { closeModal(); startExam(id, false); };
ACT.lihat = id => go('hasil', { id });

/* ============================================================
   MESIN UJIAN
   ============================================================ */
let examTick = null, examSave = null;
function stopExamTimers() {
  clearInterval(examTick); clearTimeout(examSave); examTick = examSave = null;
  window.removeEventListener('beforeunload', onBeforeUnload); document.removeEventListener('keydown', examKeys);
}
function onBeforeUnload(e) { if (S.exam && !S.exam.submitting) { e.preventDefault(); e.returnValue = ''; } }
function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function optOrder(sesi, q) {
  const letters = LET.filter(l => String(q.o[l] == null ? '' : q.o[l]).trim() !== '');
  if (sesi.acakOpsi && q.kat !== 'TKP') {
    const r = rng(hashStr(sesi.id + q.id));
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = letters[i]; letters[i] = letters[j]; letters[j] = t; }
  }
  return letters;
}

async function startExam(paketId, auto) {
  let act = null; try { act = JSON.parse(lsGet('cpns_exam_active') || 'null'); } catch (e) { act = null; }
  // pemulihan sesi yang waktunya sudah lewat saat aplikasi tertutup
  if (auto && act && act.end && Date.now() > act.end + 2000 && act.sesiId) {
    let loc = null; try { loc = JSON.parse(lsGet('exam_' + act.sesiId) || 'null'); } catch (e) { loc = null; }
    showLoader('Mengirim jawaban sesi sebelumnya…');
    try { await call('submitSesi', { sesiId: act.sesiId, jawaban: loc ? loc.ans : {} }, { retry: 3 }); lsDel('exam_' + act.sesiId); lsDel('cpns_exam_active'); hideLoader(); toast('Waktu sesi sebelumnya telah habis; jawaban dikirim.', 'info'); go('hasil', { id: act.sesiId }); }
    catch (e) { hideLoader(); toast(e.message, 'bad'); }
    return;
  }
  showLoader('Menyiapkan soal…');
  try {
    const r = await call('mulaiSesi', { paketId }, { retry: 2 });
    hideLoader(); beginExam(r);
  } catch (e) {
    hideLoader(); if (auto) lsDel('cpns_exam_active'); toast(e.message, 'bad');
  }
}
function beginExam(r) {
  const sesi = r.sesi, soal = r.soal || [];
  let loc = null; try { loc = JSON.parse(lsGet('exam_' + sesi.id) || 'null'); } catch (e) { loc = null; }
  const valid = new Set(soal.map(q => q.id));
  const ans = {}; Object.keys(r.progress || {}).forEach(k => { if (valid.has(k)) ans[k] = r.progress[k]; });
  if (loc && loc.ans) Object.keys(loc.ans).forEach(k => { if (valid.has(k) && /^[A-E]$/.test(loc.ans[k])) ans[k] = loc.ans[k]; });
  const end = Date.now() + sesi.sisaDetik * 1000;
  S.exam = { sesi, soal, ans, flag: (loc && loc.flag) || {}, idx: Math.min((loc && +loc.idx) || 0, soal.length - 1), end, dirty: true, submitting: false, perm: {}, timeUp: false };
  soal.forEach(q => { S.exam.perm[q.id] = optOrder(sesi, q); });
  lsSet('cpns_exam_active', JSON.stringify({ sesiId: sesi.id, paketId: sesi.paketId, end }));
  persistExam();
  mountExam();
}
function persistExam() { const e = S.exam; if (!e) return; lsSet('exam_' + e.sesi.id, JSON.stringify({ ans: e.ans, flag: e.flag, idx: e.idx, end: e.end })); }
function mountExam() {
  const e = S.exam; destroyCharts(); closeModal(); window.scrollTo(0, 0);
  $('#app').innerHTML = '<div class="exam"><header class="ex-top"><div class="ex-title"><b>' + esc(e.sesi.nama) + '</b><small class="muted" id="exProg"></small></div><div class="timer" id="timer" role="timer" aria-live="off"><i class="bi bi-stopwatch"></i><span id="tmv">--:--:--</span></div>' +
    '<button class="btn ghost sm" data-act="exLeave" aria-label="Keluar sementara"><i class="bi bi-box-arrow-left"></i><span class="t"> Keluar</span></button><button class="btn primary sm" data-act="exFinish" aria-label="Selesai ujian"><i class="bi bi-send"></i><span class="t"> Selesai</span></button></header>' +
    '<div class="ex-scrim" id="exScrim" data-act="exSide"></div>' +
    '<div class="ex-body"><section class="card ex-main" id="exMain" aria-live="polite"></section><aside class="card ex-side" id="exSide"><div class="row"><h4 class="sp">Navigasi Soal</h4><button class="icon-btn fabx" data-act="exSide" aria-label="Tutup"><i class="bi bi-x-lg"></i></button></div><div class="muted sm" id="exCount"></div><div class="qgrid" id="qgrid"></div><div class="lg"><span><i style="background:var(--pri);border-color:var(--pri)"></i>Terjawab</span><span><i style="background:var(--warn);border-color:var(--warn)"></i>Ragu-ragu</span><span><i></i>Kosong</span></div><button class="btn primary block mt" data-act="exFinish"><i class="bi bi-send"></i> Selesai & Kirim</button></aside></div>' +
    '<div class="ex-bbar" id="exBbar">' +
      '<button class="btn ghost sm" id="mbPrev" data-act="exPrev" aria-label="Soal sebelumnya"><i class="bi bi-chevron-left"></i></button>' +
      '<button class="btn ghost sm" id="mbFlag" data-act="exFlag" aria-label="Ragu-ragu"><i class="bi bi-flag" id="mbFlagIco"></i><span>Ragu</span></button>' +
      '<button class="btn ghost sm ex-bgrid" data-act="exSide" aria-label="Navigasi nomor soal"><i class="bi bi-grid-3x3-gap"></i> <span id="fabTxt"></span></button>' +
      '<button class="btn primary sm" id="mbNext" data-act="exNext"><span id="mbNextTxt">Berikutnya</span> <i class="bi bi-chevron-right" id="mbNextIco"></i></button>' +
    '</div></div>';
  initExamSwipe();
  renderQ(); renderSide(); tickExam();
  clearInterval(examTick); examTick = setInterval(tickExam, 500);
  window.addEventListener('beforeunload', onBeforeUnload);
  document.removeEventListener('keydown', examKeys); document.addEventListener('keydown', examKeys);
  scheduleSave();
}
function initExamSwipe() {
  const box = $('#exMain'); if (!box) return;
  let sx = 0, sy = 0;
  box.addEventListener('touchstart', ev => {
    if (ev.touches.length === 1) { sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }
  }, { passive: true });
  box.addEventListener('touchend', ev => {
    if (!S.exam || !sx || ev.changedTouches.length !== 1) return;
    const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy;
    sx = 0; sy = 0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0 && S.exam.idx < S.exam.soal.length - 1) examGo(S.exam.idx + 1);
      else if (dx > 0 && S.exam.idx > 0) examGo(S.exam.idx - 1);
    }
  }, { passive: true });
}
function tickExam() {
  const e = S.exam; if (!e) return;
  const rem = Math.max(0, Math.round((e.end - Date.now()) / 1000)), h = Math.floor(rem / 3600), m = Math.floor(rem % 3600 / 60), s = rem % 60, p = n => String(n).padStart(2, '0');
  const t = $('#tmv'); if (t) t.textContent = p(h) + ':' + p(m) + ':' + p(s);
  const box = $('#timer'); if (box) box.className = 'timer' + (rem <= 60 ? ' crit' : rem <= 300 ? ' warn' : '');
  if (rem <= 0 && !e.timeUp) { e.timeUp = true; toast('Waktu habis. Jawaban dikirim otomatis.', 'info'); submitExam(true); }
}
function scheduleSave() {
  clearTimeout(examSave);
  examSave = setTimeout(async () => {
    const e = S.exam; if (!e || e.submitting) return;
    if (e.dirty) { e.dirty = false; try { await call('simpanProgress', { sesiId: e.sesi.id, jawaban: e.ans }); } catch (x) { e.dirty = true; } }
    scheduleSave();
  }, 45000 + Math.random() * 30000);
}
function qStatus(q) { const e = S.exam; return e.flag[q.id] ? 'flag' : e.ans[q.id] ? 'done' : ''; }
function renderSide() {
  const e = S.exam; if (!e) return;
  const n = e.soal.length, done = e.soal.filter(q => e.ans[q.id]).length;
  $('#exCount').textContent = done + ' dari ' + n + ' soal terjawab';
  $('#fabTxt').textContent = done + '/' + n;
  $('#qgrid').innerHTML = e.soal.map((q, i) => '<button class="qn ' + qStatus(q) + (i === e.idx ? ' cur' : '') + '" data-act="exGo" data-arg="' + i + '" aria-label="Soal ' + (i + 1) + (e.ans[q.id] ? ', terjawab' : '') + '">' + (i + 1) + '</button>').join('');
  $('#exProg').textContent = 'Soal ' + (e.idx + 1) + ' dari ' + n;
}
function renderQ() {
  const e = S.exam, q = e.soal[e.idx], ord = e.perm[q.id], sel = e.ans[q.id], n = e.soal.length, isFl = !!e.flag[q.id];
  $('#exMain').innerHTML = '<div class="row wrap"><span class="kbadge">' + (e.idx + 1) + '</span>' + katChip(q.kat) + (q.sub ? '<span class="chip s-draft">' + esc(q.sub) + '</span>' : '') + '<span class="sp"></span><button class="btn sm ' + (isFl ? 'primary' : 'ghost') + '" data-act="exFlag" aria-pressed="' + isFl + '"><i class="bi bi-flag' + (isFl ? '-fill' : '') + '"></i> Ragu-ragu</button></div>' +
    '<div class="qt">' + esc(q.q) + '</div>' + (q.img ? '<div id="img_' + q.id + '"><span class="muted sm">Memuat gambar…</span></div>' : '') +
    '<div role="radiogroup" aria-label="Pilihan jawaban">' + ord.map((L, i) => '<button class="opt ' + (sel === L ? 'on' : '') + '" role="radio" aria-checked="' + (sel === L) + '" data-act="exPick" data-arg="' + L + '"><span class="ol">' + LET[i] + '</span><span class="ot">' + esc(q.o[L]) + '</span></button>').join('') + '</div>' +
    '<div class="ex-nav"><button class="btn ghost" data-act="exPrev" ' + (e.idx === 0 ? 'disabled' : '') + '><i class="bi bi-chevron-left"></i> Sebelumnya</button><button class="btn ghost" data-act="exClear" ' + (sel ? '' : 'disabled') + '>Hapus Jawaban</button><span class="sp"></span>' +
    (e.idx < n - 1 ? '<button class="btn primary" data-act="exNext">Berikutnya <i class="bi bi-chevron-right"></i></button>' : '<button class="btn primary" data-act="exFinish"><i class="bi bi-send"></i> Selesai</button>') + '</div>' +
    '<div class="mob-swipe-hint"><i class="bi bi-arrow-left-right"></i> Geser kiri/kanan untuk pindah soal</div>';
  const mbPrev = $('#mbPrev'); if (mbPrev) mbPrev.disabled = (e.idx === 0);
  const mbFlag = $('#mbFlag'); if (mbFlag) { mbFlag.className = 'btn sm ' + (isFl ? 'flag-on' : 'ghost'); $('#mbFlagIco').className = 'bi bi-flag' + (isFl ? '-fill' : ''); }
  const mbNext = $('#mbNext'); if (mbNext) {
    const last = e.idx >= n - 1;
    mbNext.dataset.act = last ? 'exFinish' : 'exNext';
    $('#mbNextTxt').textContent = last ? 'Selesai' : 'Berikutnya';
    $('#mbNextIco').className = 'bi ' + (last ? 'bi-send' : 'bi-chevron-right');
  }
  if (q.img) ACT.showImg(q.id);
  const nx = e.soal[e.idx + 1]; if (nx && nx.img) imgLoad(nx.id).catch(() => {});
}
function examGo(i) {
  const e = S.exam; if (!e) return;
  e.idx = Math.max(0, Math.min(e.soal.length - 1, i)); persistExam(); renderQ(); renderSide();
  const m = $('#exMain'); if (m) { const r = m.getBoundingClientRect(); if (r.top < 0) window.scrollTo(0, 0); }
  const s = $('#exSide'), sc = $('#exScrim');
  if (s) s.classList.remove('open');
  if (sc) sc.classList.remove('on');
}
ACT.exGo = i => examGo(+i);
ACT.exPrev = () => examGo(S.exam.idx - 1);
ACT.exNext = () => examGo(S.exam.idx + 1);
ACT.exSide = () => { $('#exSide').classList.toggle('open'); const sc = $('#exScrim'); if (sc) sc.classList.toggle('on'); };
ACT.exPick = L => {
  const e = S.exam; if (!e || e.submitting) return; const q = e.soal[e.idx];
  e.ans[q.id] = L; e.dirty = true; persistExam();
  const ord = e.perm[q.id];
  $$('#exMain .opt').forEach((b, i) => { const on = ord[i] === L; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const c = $('[data-act=exClear]'); if (c) c.disabled = false;
  renderSide();
};
ACT.exClear = () => { const e = S.exam, q = e.soal[e.idx]; delete e.ans[q.id]; e.dirty = true; persistExam(); renderQ(); renderSide(); };
ACT.exFlag = () => { const e = S.exam, q = e.soal[e.idx]; if (e.flag[q.id]) delete e.flag[q.id]; else e.flag[q.id] = 1; persistExam(); renderQ(); renderSide(); };
function examKeys(ev) {
  const e = S.exam; if (!e || $('.mback') || /input|textarea|select/i.test((ev.target.tagName || ''))) return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const k = ev.key;
  if (k === 'ArrowRight') { ev.preventDefault(); examGo(e.idx + 1); }
  else if (k === 'ArrowLeft') { ev.preventDefault(); examGo(e.idx - 1); }
  else if (/^[a-eA-E]$/.test(k)) { const q = e.soal[e.idx], L = e.perm[q.id][k.toUpperCase().charCodeAt(0) - 65]; if (L) ACT.exPick(L); }
  else if (k === 'r' || k === 'R') ACT.exFlag();
}
ACT.exLeave = async () => {
  if (!await confirmBox('Keluar dari ujian sementara?<br><br><b>Timer tetap berjalan.</b> Anda dapat melanjutkan dari menu <i>Latihan & Paket</i> selama waktu belum habis.', { title: 'Keluar Sementara', yes: 'Keluar', no: 'Tetap Mengerjakan' })) return;
  const e = S.exam; persistExam();
  if (e && e.dirty) { call('simpanProgress', { sesiId: e.sesi.id, jawaban: e.ans }).catch(() => {}); }
  stopExamTimers(); S.exam = null; mountShell(); go('paket');
};
ACT.exFinish = async () => {
  const e = S.exam; if (!e || e.submitting) return;
  const n = e.soal.length, done = e.soal.filter(q => e.ans[q.id]).length, fl = e.soal.filter(q => e.flag[q.id]).length;
  const ok = await confirmBox('Anda menjawab <b>' + done + '</b> dari <b>' + n + '</b> soal.' + (n - done ? '<br><span style="color:var(--bad-tx)">' + (n - done) + ' soal masih kosong.</span>' : '') + (fl ? '<br>' + fl + ' soal ditandai ragu-ragu.' : '') + '<br><br>Setelah dikirim, jawaban tidak dapat diubah.', { title: 'Kirim Jawaban?', yes: 'Ya, Kirim', no: 'Periksa Lagi' });
  if (ok) submitExam(false);
};
async function submitExam(auto) {
  const e = S.exam; if (!e || e.submitting) return;
  e.submitting = true; closeModal();
  showLoader('Mengirim jawaban…');
  try {
    const r = await call('submitSesi', { sesiId: e.sesi.id, jawaban: e.ans }, { retry: 3 });
    lsDel('exam_' + e.sesi.id); lsDel('cpns_exam_active');
    stopExamTimers(); S.exam = null; hideLoader(); mountShell();
    toast('Jawaban terkirim.', 'ok'); go('hasil', { id: r.sesiId });
  } catch (err) {
    hideLoader();
    if (!S.exam) return; // sudah logout paksa
    e.submitting = false;
    openModal({ title: 'Gagal Mengirim', persist: true, body: '<p>' + esc(err.message) + '</p><p class="muted sm mt-s">Jawaban Anda aman tersimpan di perangkat. Periksa koneksi lalu coba kirim ulang.' + (auto ? ' Waktu sudah habis, jadi jawaban tidak dapat diubah lagi.' : '') + '</p>', foot: '<button class="btn primary" data-act="exRetry"><i class="bi bi-arrow-repeat"></i> Kirim Ulang</button>' });
  }
}
ACT.exRetry = () => { closeModal(); submitExam(true); };

/* ============================================================
   HASIL & PEMBAHASAN
   ============================================================ */
S.st.hf = 'Semua';
VIEWS.hasil = p => {
  S.st.hf = 'Semua';
  call('hasilSesi', { sesiId: p.id }).then(d => { if (S.page !== 'hasil') return; S.hasil = d; drawHasil(); }).catch(e => { if (S.page === 'hasil') viewError(e); });
};
function drawHasil() {
  const d = S.hasil, v = $('#view'), maxT = d.max || 1, pct = d.total / maxT * 100;
  const color = d.lulus ? 'var(--ok)' : 'var(--bad)';
  v.innerHTML = pageHead('Hasil', 'Hasil & Pembahasan', d.paket.nama + ' · ' + fmtDT(d.selesai),
    '<button class="btn ghost" data-act="nav" data-arg="riwayat"><i class="bi bi-arrow-left"></i> Riwayat</button><button class="btn ghost" data-act="pdfDl" data-arg="' + d.sesiId + '"><i class="bi bi-file-earmark-pdf"></i> Unduh PDF</button><button class="btn primary" data-act="startPaket" data-arg="' + d.paket.id + '"><i class="bi bi-arrow-repeat"></i> Ulangi</button>') +
    '<div class="g-main-r mb"><div class="card pad c"><div class="row" style="justify-content:center">' + ring(pct, d.total, 'dari ' + d.max, color) + '</div><div class="mt">' + lulusChip(d.lulus) + '</div><p class="muted sm mt-s">' + (d.lulus ? 'Selamat! Semua kategori memenuhi passing grade.' : 'Ada kategori di bawah passing grade. Pelajari pembahasan di bawah.') + '</p>' + (d.peringkat ? '<p class="mt-s"><i class="bi bi-trophy"></i> Peringkat <b>#' + d.peringkat + '</b> dari ' + d.dari + '</p>' : '') + '</div>' +
    '<div class="card pad"><div class="stat3 mb"><div><b style="color:var(--ok)">' + d.benar + '</b><small>Benar</small></div><div><b style="color:var(--bad)">' + d.salah + '</b><small>Salah</small></div><div><b>' + d.kosong + '</b><small>Kosong</small></div><div><b>' + Math.round(d.durasi / 60000) + '</b><small>Menit</small></div></div>' +
    d.kategori.map(k => '<div class="catrow"><div class="top">' + katChip(k.id) + '<b>' + k.skor + '</b><span class="muted sm">/ ' + k.max + ' · passing grade ' + k.pg + '</span><span class="sp"></span>' + (k.lulus ? stChip('Lulus') : stChip('Tidak Lulus')) + '</div>' + bar(k.max ? k.skor / k.max * 100 : 0, CK[k.id], k.max ? k.pg / k.max * 100 : null) + '<div class="muted sm" style="margin-top:4px">Benar ' + k.benar + ' · Salah ' + k.salah + ' · Kosong ' + k.kosong + '</div></div>').join('') + '</div></div>' +
    '<div id="review"></div>';
  drawReview();
}
function drawReview() {
  const d = S.hasil, box = $('#review'); if (!box) return;
  if (!d.bolehPembahasan) { box.innerHTML = '<div class="card">' + empty('bi-lock', 'Pembahasan belum dibuka', 'Pembahasan tryout ini ditampilkan setelah periode tryout ditutup.') + '</div>'; return; }
  const f = S.st.hf, all = d.soal || [];
  const flt = { Semua: () => true, Benar: q => q.benar, Salah: q => q.dipilih && !q.benar, Kosong: q => !q.dipilih, TWK: q => q.kat === 'TWK', TIU: q => q.kat === 'TIU', TKP: q => q.kat === 'TKP' };
  const list = all.filter(flt[f] || flt.Semua);
  const tabs = Object.keys(flt).filter(t => !['TWK', 'TIU', 'TKP'].includes(t) || all.some(q => q.kat === t));
  box.innerHTML = '<div class="row mb wrap"><h3 class="sp">Pembahasan Soal</h3></div><div class="tabs mb">' + tabs.map(t => '<button class="tab ' + (f === t ? 'on' : '') + '" data-act="hfTab" data-arg="' + t + '">' + t + '<span class="n">' + all.filter(flt[t]).length + '</span></button>').join('') + '</div>' +
    (list.length ? list.map(q => {
      const tkp = q.kat === 'TKP', mx = tkp && q.skors ? Math.max.apply(null, q.skors) : 0;
      const keyL = tkp && q.skors ? LET[q.skors.indexOf(mx)] : q.kunci;
      return '<div class="card qc"><div class="qh"><span class="no">No. ' + q.no + '</span>' + katChip(q.kat) + (q.sub ? '<span class="chip s-draft">' + esc(q.sub) + '</span>' : '') + (q.dipilih ? (q.benar ? stChip('Terjawab Benar') : '<span class="chip s-bad">' + (tkp ? 'Skor ' + q.skor : 'Salah') + '</span>') : '<span class="chip s-off">Kosong</span>') + '<span class="sp"></span><b>+' + q.skor + '</b></div>' +
        '<div style="white-space:pre-wrap;line-height:24px">' + esc(q.q) + '</div>' + (q.img ? '<div id="img_' + q.id + '" class="mt-s"><button class="btn sm ghost" data-act="showImg" data-arg="' + q.id + '"><i class="bi bi-image"></i> Tampilkan gambar</button></div>' : '') +
        '<div class="mt">' + LET.filter(L => String(q.o[L] || '').trim()).map((L, i) => {
          const isKey = L === keyL, isPick = L === q.dipilih;
          const cls = isKey ? 'key' : (isPick ? 'wrong' : '');
          const tag = isKey && isPick ? '<span class="tag" style="color:var(--ok)">Kunci · Jawaban Anda</span>' : isKey ? '<span class="tag" style="color:var(--ok)">' + (tkp ? 'Skor tertinggi' : 'Kunci') + '</span>' : isPick ? '<span class="tag" style="color:var(--bad)">Jawaban Anda</span>' : '';
          return '<div class="opt static ' + cls + '"><span class="ol">' + L + '</span><span class="ot">' + esc(q.o[L]) + '</span>' + (tkp && q.skors ? '<span class="tag muted">' + q.skors[LET.indexOf(L)] + ' poin</span>' : '') + tag + '</div>';
        }).join('') + '</div>' +
        '<div class="disc"><b><i class="bi bi-lightbulb"></i> Pembahasan</b>' + (q.pembahasan ? esc(q.pembahasan) : '<span class="muted">Belum ada pembahasan.</span>') + '</div>' +
        (q.materi && q.materi.judul ? '<div class="mt-s"><button class="btn sm ghost" data-act="nav" data-arg="materi"><i class="bi bi-book"></i> Pelajari: ' + esc(q.materi.judul) + '</button></div>' : '') + '</div>';
    }).join('') : '<div class="card">' + empty('bi-funnel', 'Tidak ada soal pada filter ini', '') + '</div>');
}
ACT.hfTab = t => { S.st.hf = t; drawReview(); };
ACT.pdfDl = async (id, el) => {
  setBusy(el, true, 'Menyiapkan…');
  try { const r = await call('pdfHasil', { sesiId: id }); dlBase64(r.nama, r.base64, 'application/pdf'); } catch (e) { toast(e.message, 'bad'); }
  setBusy(el, false);
};

/* ============================================================
   RIWAYAT
   ============================================================ */
VIEWS.riwayat = () => swr('riwayat', 'riwayat', {}, d => {
  if (S.page !== 'riwayat') return;
  const done = d.filter(x => x.status === 'Selesai'), asc = done.slice().reverse();
  $('#view').innerHTML = pageHead('Riwayat', 'Riwayat & Grafik', 'Pantau perkembangan skor dari waktu ke waktu.') +
    (d.length ? '<div class="card pad mb"><h4 class="mb">Tren Skor per Kategori</h4>' + chartBox('chRiw', 280) + '</div>' +
      '<div class="tw"><table class="tbl"><thead><tr><th>Paket</th><th>Selesai</th><th class="r">TWK</th><th class="r">TIU</th><th class="r">TKP</th><th class="r">Total</th><th>Status</th><th></th></tr></thead><tbody>' +
      d.map(r => '<tr><td><b>' + esc(r.paket) + '</b><div>' + stChip(r.jenis || 'Latihan') + '</div></td><td>' + fmtDT(r.waktu) + '</td><td class="r">' + nf(r.twk) + '</td><td class="r">' + nf(r.tiu) + '</td><td class="r">' + nf(r.tkp) + '</td><td class="r"><b>' + nf(r.skor) + '</b></td><td>' + (r.status === 'Selesai' ? lulusChip(r.lulus) : stChip(r.status)) + '</td><td class="r"><button class="btn sm ghost" data-act="lihat" data-arg="' + r.id + '">Detail</button></td></tr>').join('') + '</tbody></table></div>'
      : '<div class="card">' + empty('bi-clock-history', 'Belum ada riwayat', 'Selesaikan satu paket untuk melihat riwayat di sini.') + '</div>');
  if (d.length) mkChart('chRiw', { type: 'line', data: { labels: asc.map(x => fmtShort(x.waktu)), datasets: ['twk', 'tiu', 'tkp'].map(k => ({ label: k.toUpperCase(), data: asc.map(x => x[k] === '' ? null : +x[k]), borderColor: CK[k.toUpperCase()], backgroundColor: CK[k.toUpperCase()], tension: .3, spanGaps: true, pointRadius: 3 })) }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } });
});

/* ============================================================
   PERINGKAT
   ============================================================ */
S.st.rk = '';
VIEWS.peringkat = () => swr('rank_' + S.st.rk, 'peringkat', { paketId: S.st.rk }, d => {
  if (S.page !== 'peringkat') return;
  const top = d.list.slice(0, 3), ord = [top[1], top[0], top[2]], cls = ['p2', 'p1', 'p3'];
  $('#view').innerHTML = pageHead('Peringkat', 'Papan Peringkat', 'Skor tertinggi tiap peserta; seri diurutkan dari waktu pengerjaan tercepat.',
    '<select class="sel" data-chg="rkPaket" aria-label="Filter paket"><option value="">Semua Paket</option>' + d.paket.map(p => '<option value="' + p.id + '" ' + (p.id === S.st.rk ? 'selected' : '') + '>' + esc(p.nama) + '</option>').join('') + '</select>') +
    (d.me ? '<div class="banner mb"><i class="bi bi-person-check"></i><div>Peringkat Anda <b>#' + d.me.rank + '</b> dari ' + d.total + ' peserta · skor terbaik <b>' + d.me.skor + '</b></div></div>' : '') +
    (d.list.length >= 3 ? '<div class="podium">' + ord.map((x, i) => '<div class="card ' + cls[i] + '"><span class="rk">' + x.rank + '</span><div>' + avatar(x.nama) + '</div><h4>' + esc(x.nama) + (x.saya ? ' (Anda)' : '') + '</h4><div class="muted sm">' + esc(x.instansi || '-') + '</div><div class="sc">' + x.skor + '</div></div>').join('') + '</div>' : '') +
    (d.list.length ? '<div class="tw"><table class="tbl"><thead><tr><th>#</th><th>Peserta</th><th class="r">TWK</th><th class="r">TIU</th><th class="r">TKP</th><th class="r">Total</th><th class="r">Durasi</th><th>Status</th></tr></thead><tbody>' +
      d.list.map(x => '<tr class="' + (x.saya ? 'me' : '') + '"><td><b>' + x.rank + '</b></td><td><div class="row gap-s">' + avatar(x.nama) + '<div><b>' + esc(x.nama) + (x.saya ? ' · Anda' : '') + '</b><div class="muted sm">' + esc(x.instansi || '-') + '</div></div></div></td><td class="r">' + nf(x.twk) + '</td><td class="r">' + nf(x.tiu) + '</td><td class="r">' + nf(x.tkp) + '</td><td class="r"><b>' + x.skor + '</b></td><td class="r">' + fmtMs(x.durasi) + '</td><td>' + lulusChip(x.lulus) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="card">' + empty('bi-trophy', 'Belum ada peringkat', 'Peringkat muncul setelah ada sesi yang selesai.') + '</div>');
});
CHG.rkPaket = v => { S.st.rk = v; go('peringkat'); };

/* ============================================================
   MATERI BELAJAR + PEMBACA PDF
   ============================================================ */
S.st.mk = 'Semua'; S.st.mq = '';
VIEWS.materi = () => swr('materi', 'materiList', {}, d => {
  if (S.page !== 'materi') return;
  S.materiData = d; drawMateri(true);
});
function drawMateri(full) {
  const d = S.materiData || [];
  if (full) {
    $('#view').innerHTML = pageHead('Materi', 'Materi Belajar', 'Ringkasan materi dalam format PDF — baca langsung atau unduh.') +
      '<div class="toolbar mb"><div class="sr"><i class="bi bi-search"></i><input class="inp" placeholder="Cari judul atau bab…" data-inp="mq" value="' + esc(S.st.mq) + '" aria-label="Cari materi"></div><div class="tabs">' + ['Semua', 'TWK', 'TIU', 'TKP'].map(t => '<button class="tab ' + (S.st.mk === t ? 'on' : '') + '" data-act="mkTab" data-arg="' + t + '">' + t + '</button>').join('') + '</div></div><div id="materiList"></div>';
  }
  const q = S.st.mq.toLowerCase();
  const list = d.filter(m => (S.st.mk === 'Semua' || m.kategori === S.st.mk) && (!q || (m.judul + ' ' + m.bab).toLowerCase().indexOf(q) >= 0));
  const box = $('#materiList'); if (!box) return;
  box.innerHTML = list.length ? '<div class="pkgrid">' + list.map(m => '<div class="card pk"><div class="row">' + katChip(m.kategori) + '<span class="sp"></span><span class="muted sm">' + nf(m.kb) + ' KB</span></div><h4>' + esc(m.judul) + '</h4><div class="muted sm">' + esc(m.bab || '') + '</div><p>' + esc(m.deskripsi || '') + '</p><div class="foot"><span class="muted sm">' + fmtD(m.tgl) + '</span><span class="sp"></span><button class="btn sm ghost" data-act="materiDl" data-arg="' + m.id + '"><i class="bi bi-download"></i></button><button class="btn sm primary" data-act="materiBaca" data-arg="' + m.id + '"><i class="bi bi-book"></i> Baca</button></div></div>').join('') + '</div>' : '<div class="card">' + empty('bi-book', 'Materi tidak ditemukan', 'Coba kata kunci atau kategori lain.') + '</div>';
}
INP.mq = debounce(v => { S.st.mq = v; drawMateri(false); }, 200);
ACT.mkTab = t => { S.st.mk = t; drawMateri(true); const i = $('[data-inp=mq]'); if (i) i.value = S.st.mq; };
ACT.materiDl = async (id, el) => {
  setBusy(el, true, '');
  try { const r = await call('materiFile', { id }); dlBase64(r.nama, r.base64, 'application/pdf'); } catch (e) { toast(e.message, 'bad'); }
  setBusy(el, false);
};
let pdfLib = null;
function loadPdfJs() {
  if (pdfLib) return pdfLib;
  const V = '3.11.174', base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V + '/';
  return (pdfLib = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = base + 'pdf.min.js';
    s.onload = async () => {
      try { const t = await (await fetch(base + 'pdf.worker.min.js')).text(); window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([t], { type: 'text/javascript' })); res(window.pdfjsLib); }
      catch (e) { rej(e); }
    };
    s.onerror = () => rej(new Error('Pustaka PDF gagal dimuat.'));
    document.head.appendChild(s);
  }).catch(e => { pdfLib = null; throw e; }));
}
S.pdfTok = 0;
ACT.materiBaca = async id => {
  const m = (S.materiData || []).find(x => x.id === id), tok = ++S.pdfTok;
  openModal({ title: m ? m.judul : 'Materi', size: 'xl', body: '<div class="pdfv" id="pdfv"><div class="empty"><div class="spin" style="margin:auto"></div><span class="mt-s">Memuat dokumen…</span></div></div>', foot: '<span class="muted sm sp" id="pdfInfo"></span><button class="btn ghost" data-act="pdfSave"><i class="bi bi-download"></i> Unduh</button><button class="btn primary" data-act="closeModal">Tutup</button>', onClose: () => { S.pdfTok++; S.pdfData = null; } });
  try {
    const r = await call('materiFile', { id }, { retry: 1 }); if (tok !== S.pdfTok) return;
    S.pdfData = r;
    const bin = atob(r.base64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const lib = await loadPdfJs(); if (tok !== S.pdfTok) return;
    const doc = await lib.getDocument({ data: u8 }).promise, host = $('#pdfv'); if (!host || tok !== S.pdfTok) return;
    host.innerHTML = ''; $('#pdfInfo').textContent = doc.numPages + ' halaman';
    const w = Math.max(320, host.clientWidth - 28), dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= doc.numPages; n++) {
      if (tok !== S.pdfTok) return;
      const pg = await doc.getPage(n), vp0 = pg.getViewport({ scale: 1 }), sc = w / vp0.width, vp = pg.getViewport({ scale: sc * dpr });
      const cv = document.createElement('canvas'); cv.className = 'pdfpg'; cv.width = vp.width; cv.height = vp.height; cv.style.width = Math.round(vp.width / dpr) + 'px';
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Halaman ' + n); host.appendChild(cv);
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    if (tok !== S.pdfTok) return;
    const h = $('#pdfv'); if (h) h.innerHTML = '<div class="empty"><i class="bi bi-exclamation-triangle"></i><b>Tidak dapat menampilkan dokumen</b><span>' + esc(e.message) + '</span>' + (S.pdfData ? '<button class="btn primary mt" data-act="pdfSave">Unduh PDF</button>' : '') + '</div>';
  }
};
ACT.pdfSave = () => { if (S.pdfData) dlBase64(S.pdfData.nama, S.pdfData.base64, 'application/pdf'); else toast('Dokumen belum siap.', 'info'); };

/* ============================================================
   PROFIL
   ============================================================ */
VIEWS.profil = () => {
  const u = S.user;
  $('#view').innerHTML = pageHead('Akun', 'Profil', 'Kelola data diri dan keamanan akun.') +
    '<div class="g2"><div class="card pad"><div class="row mb">' + avatar(u.nama, 'lg') + '<div><h3>' + esc(u.nama) + '</h3><div class="muted sm">' + esc(u.email) + ' · ' + (isAdmin() ? 'Admin' : 'Peserta') + '</div></div></div>' +
    '<form data-sub="profil" novalidate><div class="ferr" role="alert"></div>' + fld('Nama Lengkap', 'nama', { icon: 'bi-person' }) + fld('Instansi & Formasi Target', 'instansi', { icon: 'bi-building', req: false }) + fld('Email', 'email', { type: 'email', icon: 'bi-envelope', attr: 'disabled', req: false, hint: 'Email tidak dapat diubah.' }) + '<button class="btn primary" type="submit">Simpan Perubahan</button></form></div>' +
    '<div class="card pad"><h3 class="mb">Ubah Password</h3><form data-sub="pw" novalidate><div class="ferr" role="alert"></div>' + fld('Password Saat Ini', 'lama', { type: 'password', icon: 'bi-lock', ac: 'current-password' }) + fld('Password Baru', 'baru', { type: 'password', icon: 'bi-lock-fill', ac: 'new-password', hint: 'Minimal 8 karakter, kombinasi huruf dan angka.' }) + fld('Ulangi Password Baru', 'baru2', { type: 'password', icon: 'bi-lock-fill', ac: 'new-password' }) + '<button class="btn primary" type="submit">Ubah Password</button></form>' +
    '<hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><button class="btn ghost danger" data-act="logout"><i class="bi bi-box-arrow-right"></i> Keluar dari Akun</button></div></div>';
  const f = $('form[data-sub=profil]'); f.nama.value = u.nama; f.instansi.value = u.instansi || ''; f.email.value = u.email;
};
SUB.profil = async f => {
  const b = $('button[type=submit]', f); ferr(f, ''); setBusy(b, true, 'Menyimpan…');
  try { const r = await call('profilSimpan', { nama: f.nama.value, instansi: f.instansi.value }); S.user.nama = r.nama; S.user.instansi = r.instansi; lsSet('cpns_user', JSON.stringify(S.user)); toast('Profil diperbarui.', 'ok'); mountShell(); go('profil'); }
  catch (e) { ferr(f, e.message); setBusy(b, false); }
};
SUB.pw = async f => {
  ferr(f, '');
  if (f.baru.value !== f.baru2.value) return ferr(f, 'Konfirmasi password baru tidak sama.');
  const b = $('button[type=submit]', f); setBusy(b, true, 'Menyimpan…');
  try { await call('ubahPassword', { lama: f.lama.value, baru: f.baru.value }); toast('Password berhasil diubah.', 'ok'); f.reset(); } catch (e) { ferr(f, e.message); }
  setBusy(b, false);
};

/* ============================================================
   ADMIN — HELPER FORM
   ============================================================ */
const optH = (o, val) => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(l) + '</option>'; };
const selH = (name, opts, val, attr) => '<select class="sel" name="' + name + '" ' + (attr || '') + '>' + opts.map(o => optH(o, val)).join('') + '</select>';
const fl = (label, inner, hint) => '<div class="fld"><label class="f">' + label + '</label>' + inner + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
const inpH = (name, val, attr) => '<input class="inp" name="' + name + '" value="' + esc(val == null ? '' : val) + '" ' + (attr || '') + '>';
const swH = (name, label, on, sub) => '<label class="chk"><input type="checkbox" name="' + name + '" ' + (on ? 'checked' : '') + '><span><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span></label>';
const trunc = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '', delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
const selCount = o => Object.keys(o).length;
function bulkBar(o, html) { const n = selCount(o); return n ? '<div class="bulk"><b>' + n + ' dipilih</b>' + html + '<button class="btn sm white" data-act="selClear">Batal</button></div>' : ''; }

/* ============================================================
   ADMIN — DASBOR
   ============================================================ */
VIEWS.adminDash = () => swr('adash', 'adminDash', {}, d => {
  if (S.page !== 'adminDash') return;
  syncPesertaBadge(d.menunggu);
  $('#view').innerHTML = pageHead('Dasbor', 'Dasbor Administrasi', 'Ringkasan aktivitas peserta dan kesehatan sistem.', '<button class="btn primary" data-act="soalForm"><i class="bi bi-plus-lg"></i> Tambah Soal</button>') +
    '<div class="g5 keep2 mb">' + kpi('Total Peserta', nf(d.totalPeserta), nf(d.aktif) + ' aktif', 'bi-people') + kpi('Menunggu Persetujuan', nf(d.menunggu), d.menunggu ? 'Perlu ditinjau' : 'Semua sudah diproses', 'bi-hourglass-split', 'twk') + kpi('Soal Aktif', nf(d.soalAktif), 'TWK ' + d.soalKat.TWK + ' · TIU ' + d.soalKat.TIU + ' · TKP ' + d.soalKat.TKP, 'bi-question-circle', 'tiu') + kpi('Latihan Hari Ini', nf(d.latihanHariIni), 'Sesi selesai', 'bi-lightning-charge', 'tkp') + kpi('Rata-rata Skor', nf(d.rata), 'Lulus ' + d.lulusPct + '%', 'bi-graph-up') + '</div>' +
    '<div class="g-main mb"><div class="card pad"><div class="row"><h4 class="sp">Aktivitas 7 Hari Terakhir</h4></div>' + chartBox('chAct', 260) + '</div><div class="card pad"><h4 class="mb">Rata-rata per Kategori</h4>' +
    ['TWK', 'TIU', 'TKP'].map(k => { const x = d.kategori[k]; return '<div class="catrow"><div class="top">' + katChip(k) + '<b>' + x.rata + '</b><span class="muted sm">/ ' + x.max + ' · PG ' + x.pg + '</span></div>' + bar(x.max ? x.rata / x.max * 100 : 0, CK[k], x.max ? x.pg / x.max * 100 : null) + '</div>'; }).join('') + '<p class="muted sm mt">Garis penanda = passing grade. Total PG: ' + d.pgTotal + '.</p></div></div>' +
    '<div class="g2"><div class="card pad"><div class="row mb"><h4 class="sp">Pendaftar Menunggu</h4><button class="linkb sm" data-act="nav" data-arg="peserta">Semua</button></div>' +
    (d.pendaftar.length ? d.pendaftar.map(x => '<div class="row mb">' + avatar(x.nama) + '<div class="sp"><b>' + esc(x.nama) + '</b><div class="muted sm">' + esc(x.email) + ' · ' + fmtD(x.tgl) + '</div></div><button class="btn sm ok-solid" data-act="pesertaAksi" data-arg="' + x.id + ':Aktif">Setujui</button><button class="btn sm danger" data-act="pesertaAksi" data-arg="' + x.id + ':Ditolak">Tolak</button></div>').join('') : empty('bi-check2-circle', 'Tidak ada pendaftar menunggu', '')) + '</div>' +
    '<div class="card pad"><div class="row mb"><h4 class="sp">Sesi Terbaru</h4><button class="linkb sm" data-act="nav" data-arg="laporan">Laporan</button></div>' +
    (d.sesiBaru.length ? d.sesiBaru.map(x => '<div class="row mb"><div class="sp"><b>' + esc(x.nama) + '</b><div class="muted sm">' + esc(x.paket) + ' · ' + fmtDT(x.waktu) + '</div></div><b>' + x.skor + '</b>' + lulusChip(x.lulus) + '<button class="icon-btn" data-act="lihat" data-arg="' + x.id + '" aria-label="Lihat hasil"><i class="bi bi-chevron-right"></i></button></div>').join('') : empty('bi-clipboard-data', 'Belum ada sesi', '')) +
    '<div class="muted sm mt"><i class="bi bi-envelope"></i> Sisa kuota email harian: <b>' + nf(d.emailKuota) + '</b></div></div></div>';
  mkChart('chAct', { type: 'bar', data: { labels: d.hari, datasets: [{ label: 'Latihan', data: d.latihan, backgroundColor: '#2eb87e', borderRadius: 6 }, { label: 'Tryout', data: d.simulasi, backgroundColor: '#3b82f6', borderRadius: 6 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
});
ACT.selClear = () => { const m = { peserta: selPs, soal: selSl }; const o = m[S.page]; if (o) { Object.keys(o).forEach(k => delete o[k]); S.page === 'peserta' ? drawPeserta() : drawSoal(); } };

/* ============================================================
   ADMIN — PESERTA
   ============================================================ */
S.st.ps = { status: 'Semua', q: '', page: 1, size: 10 };
let selPs = {};
VIEWS.peserta = () => {
  selPs = {};
  $('#view').innerHTML = pageHead('Peserta', 'Peserta & Persetujuan', 'Tinjau pendaftaran, kelola akun, dan pantau aktivitas peserta.', '<button class="btn primary" data-act="psTambah"><i class="bi bi-person-plus"></i> Tambah Akun</button>') +
    '<div class="toolbar mb"><div class="sr"><i class="bi bi-search"></i><input class="inp" placeholder="Cari nama, email, atau instansi…" data-inp="psQ" value="' + esc(S.st.ps.q) + '" aria-label="Cari peserta"></div></div><div id="psBox">' + skel(5) + '</div>';
  loadPeserta();
};
function loadPeserta() {
  const nav = S.nav;
  return call('pesertaList', S.st.ps).then(d => {
    if (nav !== S.nav) return; S.psData = d; drawPeserta();
    syncPesertaBadge(d.cnt.Menunggu);
  }).catch(e => { if (nav === S.nav) viewError(e); });
}
function drawPeserta() {
  const d = S.psData, box = $('#psBox'); if (!box) return;
  const allOn = d.rows.length && d.rows.every(r => selPs[r.id]);
  box.innerHTML = '<div class="tabs mb">' + ['Semua', 'Menunggu', 'Aktif', 'Ditolak', 'Nonaktif'].map(t => '<button class="tab ' + (S.st.ps.status === t ? 'on' : '') + '" data-act="psTab" data-arg="' + t + '">' + t + '<span class="n">' + d.cnt[t] + '</span></button>').join('') + '</div>' +
    bulkBar(selPs, '<button class="btn sm ok-solid" data-act="psBulk" data-arg="Aktif">Setujui</button><button class="btn sm danger-solid" data-act="psBulk" data-arg="Ditolak">Tolak</button><button class="btn sm ghost" style="color:#fff" data-act="psBulk" data-arg="Nonaktif">Nonaktifkan</button>') +
    (d.rows.length ? '<div class="tw"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" data-chg="psSelAll" ' + (allOn ? 'checked' : '') + ' aria-label="Pilih semua"></th><th>Peserta</th><th>Instansi</th><th>Status</th><th class="num">Latihan</th><th class="num">Rata-rata</th><th>Daftar</th><th class="act">Aksi</th></tr></thead><tbody>' +
      d.rows.map(r => '<tr><td><input type="checkbox" data-chg="psSel" data-id="' + r.id + '" ' + (selPs[r.id] ? 'checked' : '') + ' ' + (r.id === S.user.id ? 'disabled' : '') + ' aria-label="Pilih ' + esc(r.nama) + '"></td><td><div class="row gap-s">' + avatar(r.nama) + '<div><b>' + esc(r.nama) + '</b>' + (r.role === 'Admin' ? ' ' + stChip('Berjalan').replace('Berjalan', 'Admin') : '') + '<div class="muted sm">' + esc(r.email) + '</div></div></div></td><td>' + esc(r.instansi || '-') + '</td><td>' + stChip(r.status) + '</td><td class="num">' + r.latihan + '</td><td class="num">' + nf(r.rata) + '</td><td>' + fmtD(r.daftar) + '</td><td class="act">' +
        (r.status === 'Menunggu' ? '<button class="btn sm ok-solid" data-act="pesertaAksi" data-arg="' + r.id + ':Aktif">Setujui</button> <button class="btn sm danger" data-act="pesertaAksi" data-arg="' + r.id + ':Ditolak">Tolak</button> ' : '') + '<button class="btn sm ghost" data-act="psDetail" data-arg="' + r.id + '">Detail</button></td></tr>').join('') + '</tbody></table></div>' + pager(d.total, d.page, d.size, 'psPage')
      : '<div class="card">' + empty('bi-people', 'Tidak ada peserta', 'Ubah filter atau kata kunci pencarian.') + '</div>');
}
INP.psQ = debounce(v => { S.st.ps.q = v; S.st.ps.page = 1; loadPeserta(); }, 300);
ACT.psTab = t => { S.st.ps.status = t; S.st.ps.page = 1; selPs = {}; loadPeserta(); };
ACT.psPage = p => { S.st.ps.page = +p; loadPeserta(); };
CHG.psPageSize = v => { S.st.ps.size = +v; S.st.ps.page = 1; loadPeserta(); };
CHG.psSel = (on, el) => { if (on) selPs[el.dataset.id] = 1; else delete selPs[el.dataset.id]; drawPeserta(); };
CHG.psSelAll = on => { S.psData.rows.forEach(r => { if (r.id === S.user.id) return; if (on) selPs[r.id] = 1; else delete selPs[r.id]; }); drawPeserta(); };
async function setPesertaStatus(ids, status) {
  const ket = { Aktif: 'menyetujui/mengaktifkan', Ditolak: 'menolak', Nonaktif: 'menonaktifkan' }[status];
  if (status !== 'Aktif' && !await confirmBox('Yakin ' + ket + ' <b>' + ids.length + '</b> akun?', { danger: true, yes: 'Ya, Lanjutkan' })) return false;
  showLoader('Memproses…');
  try { const r = await call('pesertaStatus', { ids, status }); hideLoader(); toast(r.diubah + ' akun diperbarui' + (status === 'Aktif' || status === 'Ditolak' ? '; notifikasi email dikirim.' : '.'), 'ok'); return true; }
  catch (e) { hideLoader(); toast(e.message, 'bad'); return false; }
}
ACT.pesertaAksi = async arg => {
  const [id, st] = arg.split(':');
  if (await setPesertaStatus([id], st)) { if (S.page === 'adminDash') go('adminDash'); else { if ($('.mback')) closeModal(); loadPeserta(); } }
};
ACT.psBulk = async st => { if (await setPesertaStatus(Object.keys(selPs), st)) { selPs = {}; loadPeserta(); } };
ACT.psTambah = (arg, el, e, role) => {
  openModal({ title: 'Tambah Akun', body: '<form id="fTambah" data-sub="psTambah" novalidate><div class="ferr" role="alert"></div>' + fl('Nama Lengkap', inpH('nama', '', 'required')) + fl('Email', inpH('email', '', 'type="email" required autocomplete="off"')) + fl('Instansi (opsional)', inpH('instansi', '')) + '<div class="grid2">' + fl('Password Awal', inpH('password', '', 'type="text" required minlength="8" autocomplete="off"'), 'Min. 8 karakter, huruf & angka') + fl('Peran', selH('role', ['Peserta', 'Admin'], role || 'Peserta')) + '</div></form>', foot: '<button class="btn ghost" data-act="closeModal">Batal</button><button class="btn primary" type="submit" form="fTambah">Simpan Akun</button>' });
};
SUB.psTambah = async f => {
  ferr(f, ''); const b = $('button[type=submit]', $('.mfoot')); setBusy(b, true, 'Menyimpan…');
  try { await call('pesertaTambah', { nama: f.nama.value, email: f.email.value, instansi: f.instansi.value, password: f.password.value, role: f.role.value }); closeModal(); toast('Akun berhasil dibuat.', 'ok'); if (S.page === 'peserta') loadPeserta(); else if (S.page === 'pengaturan') go('pengaturan'); }
  catch (e) { ferr(f, e.message); setBusy(b, false); }
};
ACT.psDetail = async id => {
  showLoader('Memuat…');
  try {
    const d = await call('pesertaDetail', { id }); hideLoader(); const u = d.user;
    openModal({
      title: 'Detail Peserta', size: 'wide',
      body: '<div class="row mb">' + avatar(u.nama, 'lg') + '<div class="sp"><h3>' + esc(u.nama) + '</h3><div class="muted sm">' + esc(u.email) + '</div><div class="mt-s">' + stChip(u.status) + ' <span class="chip s-draft">' + u.role + '</span></div></div></div>' +
        '<div class="stat3 mb"><div><b>' + d.latihan + '</b><small>Sesi selesai</small></div><div><b>' + nf(d.rata) + '</b><small>Rata-rata</small></div><div><b style="font-size:13px">' + fmtD(u.daftar) + '</b><small>Terdaftar</small></div><div><b style="font-size:13px">' + (u.login ? fmtD(u.login) : '-') + '</b><small>Login terakhir</small></div></div>' +
        '<p class="sm mb"><b>Instansi:</b> ' + esc(u.instansi || '-') + '</p><h4 class="mb">Riwayat Terbaru</h4>' +
        (d.riwayat.length ? '<div class="tw"><table class="tbl" style="min-width:0"><thead><tr><th>Paket</th><th>Waktu</th><th class="num">Skor</th><th>Status</th><th></th></tr></thead><tbody>' + d.riwayat.map(r => '<tr><td>' + esc(r.paket) + '</td><td>' + fmtDT(r.waktu) + '</td><td class="num"><b>' + nf(r.skor) + '</b></td><td>' + (r.status === 'Selesai' ? lulusChip(r.lulus) : stChip(r.status)) + '</td><td class="act"><button class="btn sm ghost" data-act="lihatDari" data-arg="' + r.id + '">Lihat</button></td></tr>').join('') + '</tbody></table></div>' : '<div class="muted sm">Belum ada riwayat.</div>') +
        '<hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><h4 class="mb">Reset Password</h4><form id="fRst" data-sub="psReset" data-id="' + u.id + '" class="row wrap" novalidate><input class="inp sp" name="password" placeholder="Password baru (min. 8, huruf & angka)" autocomplete="off" style="min-width:220px"><button class="btn primary" type="submit">Reset</button></form><div class="ferr mt-s" id="rstErr"></div>',
      foot: (u.id !== S.user.id ? (u.status !== 'Aktif' ? '<button class="btn ok-solid" data-act="pesertaAksi" data-arg="' + u.id + ':Aktif">Aktifkan</button>' : '<button class="btn danger" data-act="pesertaAksi" data-arg="' + u.id + ':Nonaktif">Nonaktifkan</button>') : '') + '<button class="btn ghost" data-act="closeModal">Tutup</button>'
    });
  } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};
ACT.lihatDari = id => { closeModal(); go('hasil', { id }); };
SUB.psReset = async f => {
  const b = $('button', f), er = $('#rstErr'); er.textContent = ''; setBusy(b, true, '…');
  try { await call('pesertaPassword', { id: f.dataset.id, password: f.password.value }); toast('Password berhasil direset.', 'ok'); f.reset(); } catch (e) { er.textContent = e.message; }
  setBusy(b, false);
};

/* ============================================================
   ADMIN — BANK SOAL
   ============================================================ */
S.st.sl = { kategori: '', status: '', kesulitan: '', q: '', page: 1, size: 10 };
let selSl = {};
VIEWS.soal = () => {
  selSl = {};
  $('#view').innerHTML = pageHead('Konten', 'Bank Soal', 'Kelola soal TWK, TIU, dan TKP beserta kunci, skor, dan pembahasan.', '<button class="btn ghost" data-act="soalImpor"><i class="bi bi-filetype-csv"></i> Impor CSV</button><button class="btn primary" data-act="soalForm"><i class="bi bi-plus-lg"></i> Tambah Soal</button>') +
    '<div class="toolbar mb"><div class="sr"><i class="bi bi-search"></i><input class="inp" placeholder="Cari pertanyaan, ID, atau subtopik…" data-inp="slQ" value="' + esc(S.st.sl.q) + '" aria-label="Cari soal"></div>' +
    '<select class="sel" data-chg="slStatus" aria-label="Status">' + [['', 'Semua Status'], 'Aktif', 'Draft', 'Nonaktif'].map(o => optH(o, S.st.sl.status)).join('') + '</select>' +
    '<select class="sel" data-chg="slKes" aria-label="Kesulitan">' + [['', 'Semua Tingkat'], 'Mudah', 'Sedang', 'Sulit'].map(o => optH(o, S.st.sl.kesulitan)).join('') + '</select></div><div id="slBox">' + skel(6) + '</div>';
  loadSoal();
};
function loadSoal() {
  const nav = S.nav;
  return call('soalList', S.st.sl).then(d => { if (nav !== S.nav) return; S.slData = d; drawSoal(); }).catch(e => { if (nav === S.nav) viewError(e); });
}
function drawSoal() {
  const d = S.slData, box = $('#slBox'); if (!box) return;
  const allOn = d.rows.length && d.rows.every(r => selSl[r.id]);
  box.innerHTML = '<div class="tabs mb">' + [['', 'Semua', d.cnt.Semua], ['TWK', 'TWK', d.cnt.TWK], ['TIU', 'TIU', d.cnt.TIU], ['TKP', 'TKP', d.cnt.TKP]].map(t => '<button class="tab ' + (S.st.sl.kategori === t[0] ? 'on' : '') + '" data-act="slTab" data-arg="' + t[0] + '">' + t[1] + '<span class="n">' + t[2] + '</span></button>').join('') + '</div>' +
    bulkBar(selSl, '<button class="btn sm ok-solid" data-act="slBulk" data-arg="Aktif">Aktifkan</button><button class="btn sm ghost" style="color:#fff" data-act="slBulk" data-arg="Draft">Jadikan Draft</button><button class="btn sm ghost" style="color:#fff" data-act="slBulk" data-arg="Nonaktif">Nonaktifkan</button><button class="btn sm danger-solid" data-act="slHapusBulk">Hapus</button>') +
    (d.rows.length ? '<div class="tw"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" data-chg="slSelAll" ' + (allOn ? 'checked' : '') + ' aria-label="Pilih semua"></th><th>ID</th><th>Pertanyaan</th><th>Kategori</th><th>Kunci</th><th>Tingkat</th><th>Status</th><th class="act">Aksi</th></tr></thead><tbody>' +
      d.rows.map(r => '<tr><td><input type="checkbox" data-chg="slSel" data-id="' + r.id + '" ' + (selSl[r.id] ? 'checked' : '') + ' aria-label="Pilih ' + r.id + '"></td><td class="muted sm">' + esc(r.id) + '</td><td style="min-width:260px;max-width:420px">' + esc(trunc(r.q, 110)) + (r.img ? ' <i class="bi bi-image" title="Ada gambar"></i>' : '') + (r.sub ? '<div class="muted sm">' + esc(r.sub) + '</div>' : '') + '</td><td>' + katChip(r.kat) + '</td><td>' + (r.skors ? '<span class="muted sm">' + r.skors.join('·') + '</span>' : '<b>' + esc(r.kunci) + '</b>') + '</td><td>' + esc(r.kesulitan || '-') + '</td><td>' + stChip(r.status) + '</td><td class="act"><button class="icon-btn" data-act="soalLihat" data-arg="' + r.id + '" aria-label="Pratinjau" title="Pratinjau"><i class="bi bi-eye"></i></button><button class="icon-btn" data-act="soalForm" data-arg="' + r.id + '" aria-label="Ubah" title="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-act="slHapus" data-arg="' + r.id + '" aria-label="Hapus" title="Hapus"><i class="bi bi-trash"></i></button></td></tr>').join('') + '</tbody></table></div>' + pager(d.total, d.page, d.size, 'slPage')
      : '<div class="card">' + empty('bi-question-circle', 'Belum ada soal', 'Tambah soal baru atau impor dari CSV.') + '</div>');
}
INP.slQ = debounce(v => { S.st.sl.q = v; S.st.sl.page = 1; loadSoal(); }, 300);
CHG.slStatus = v => { S.st.sl.status = v; S.st.sl.page = 1; loadSoal(); };
CHG.slKes = v => { S.st.sl.kesulitan = v; S.st.sl.page = 1; loadSoal(); };
ACT.slTab = t => { S.st.sl.kategori = t; S.st.sl.page = 1; selSl = {}; loadSoal(); };
ACT.slPage = p => { S.st.sl.page = +p; loadSoal(); };
CHG.slPageSize = v => { S.st.sl.size = +v; S.st.sl.page = 1; loadSoal(); };
CHG.slSel = (on, el) => { if (on) selSl[el.dataset.id] = 1; else delete selSl[el.dataset.id]; drawSoal(); };
CHG.slSelAll = on => { S.slData.rows.forEach(r => { if (on) selSl[r.id] = 1; else delete selSl[r.id]; }); drawSoal(); };
ACT.slBulk = async st => {
  showLoader('Memproses…');
  try { const r = await call('soalStatus', { ids: Object.keys(selSl), status: st }); hideLoader(); toast(r.diubah + ' soal diperbarui.', 'ok'); selSl = {}; loadSoal(); } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};
async function hapusSoal(ids) {
  if (!await confirmBox('Hapus <b>' + ids.length + '</b> soal secara permanen?<br><span class="muted sm">Paket yang memuat soal ini akan kehilangan soal tersebut. Riwayat hasil lama tidak berubah.</span>', { danger: true, yes: 'Hapus' })) return;
  showLoader('Menghapus…');
  try { const r = await call('soalHapus', { ids }); hideLoader(); toast(r.dihapus + ' soal dihapus.', 'ok'); selSl = {}; loadSoal(); } catch (e) { hideLoader(); toast(e.message, 'bad'); }
}
ACT.slHapus = id => hapusSoal([id]);
ACT.slHapusBulk = () => hapusSoal(Object.keys(selSl));
ACT.soalLihat = async id => {
  showLoader('Memuat…');
  try {
    const q = await call('soalGet', { id }); hideLoader(); const tkp = q.kat === 'TKP', mx = Math.max.apply(null, q.skors);
    openModal({ title: 'Pratinjau Soal', size: 'wide', body: '<div class="row wrap mb">' + katChip(q.kat) + stChip(q.status) + '<span class="chip s-draft">' + esc(q.kesulitan) + '</span>' + (q.sub ? '<span class="muted sm">' + esc(q.sub) + '</span>' : '') + '</div><div style="white-space:pre-wrap;line-height:24px">' + esc(q.q) + '</div>' + (q.img ? '<div id="img_' + q.id + '" class="mt-s"><span class="muted sm">Memuat gambar…</span></div>' : '') +
      '<div class="mt">' + LET.map(L => { const key = tkp ? q.skors[LET.indexOf(L)] === mx : L === q.kunci; return '<div class="opt static ' + (key ? 'key' : '') + '"><span class="ol">' + L + '</span><span class="ot">' + esc(q.o[L]) + '</span>' + (tkp ? '<span class="tag muted">' + q.skors[LET.indexOf(L)] + ' poin</span>' : '') + (key ? '<span class="tag" style="color:var(--ok)">Kunci</span>' : '') + '</div>'; }).join('') + '</div><div class="disc"><b>Pembahasan</b>' + (q.pembahasan ? esc(q.pembahasan) : '<span class="muted">Belum ada pembahasan.</span>') + '</div>', foot: '<button class="btn ghost" data-act="closeModal">Tutup</button><button class="btn primary" data-act="soalForm" data-arg="' + q.id + '"><i class="bi bi-pencil"></i> Ubah</button>' });
    if (q.img) ACT.showImg(q.id);
  } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};
async function materiOpsi() {
  if (S.matOpt) return S.matOpt;
  try { S.matOpt = await call('materiList', { semua: true }); } catch (e) { S.matOpt = []; }
  return S.matOpt;
}
S.simg = null; S.simgDel = false;
ACT.soalForm = async id => {
  S.simg = null; S.simgDel = false; delete S.matOpt;
  showLoader('Memuat formulir…');
  let q = { id: '', kat: 'TWK', q: '', o: { A: '', B: '', C: '', D: '', E: '' }, kunci: 'A', skors: [1, 2, 3, 4, 5], pembahasan: '', status: 'Aktif', sub: '', kesulitan: 'Sedang', materi: '', img: 0 };
  try { if (id) q = await call('soalGet', { id }); } catch (e) { hideLoader(); return toast(e.message, 'bad'); }
  const mats = await materiOpsi(); hideLoader();
  const tkp = q.kat === 'TKP';
  openModal({
    title: id ? 'Ubah Soal' : 'Tambah Soal', size: 'xl', persist: true,
    body: '<form id="fSoal" data-sub="soalForm" data-id="' + esc(id || '') + '" class="' + (tkp ? 'tkp' : '') + '" novalidate><div class="ferr" role="alert"></div>' +
      '<div class="grid2">' + fl('Kategori', selH('kat', [['TWK', 'TWK — Wawasan Kebangsaan'], ['TIU', 'TIU — Inteligensia Umum'], ['TKP', 'TKP — Karakteristik Pribadi']], q.kat, 'data-chg="soalKat"')) + fl('Subtopik', inpH('sub', q.sub, 'maxlength="80" placeholder="Contoh: Pancasila, Deret Angka"')) + '</div>' +
      fl('Pertanyaan', '<textarea class="txa" name="q" rows="4" maxlength="2000" required>' + esc(q.q) + '</textarea>') +
      fl('Gambar pendukung <span class="muted">(opsional · PNG/JPG/WebP ≤ 2 MB)</span>', '<div class="drop" id="dropImg" data-act="pickImg" tabindex="0" role="button"><i class="bi bi-image" style="font-size:22px"></i><div class="sm">Klik untuk memilih gambar</div><div id="imgPrev">' + (q.img ? '<span class="muted sm">Memuat gambar saat ini…</span>' : '') + '</div></div><input type="file" id="fileImg" accept="image/png,image/jpeg,image/webp" hidden data-chg="soalImg">' + (q.img ? '<label class="chk"><input type="checkbox" name="hapusGambar" data-chg="soalImgDel"><span>Hapus gambar saat ini</span></label>' : '')) +
      '<div class="row mb"><b class="sp">Pilihan Jawaban</b><span class="muted sm only-kunci">Pilih satu kunci jawaban</span><span class="muted sm only-skor">TKP: beri skor 1–5 untuk tiap opsi</span></div>' +
      LET.map(L => '<div class="optrow"><span class="kbadge">' + L + '</span>' + inpH('o_' + L, q.o[L], 'maxlength="500" placeholder="Teks opsi ' + L + '" aria-label="Opsi ' + L + '"') + '<div class="only-kunci"><label class="kunci-pick"><input type="radio" name="kunci" value="' + L + '" ' + (q.kunci === L ? 'checked' : '') + '> Kunci</label></div><div class="only-skor">' + selH('s_' + L, [1, 2, 3, 4, 5].map(n => [n, 'Skor ' + n]), q.skors[LET.indexOf(L)], 'aria-label="Skor opsi ' + L + '"') + '</div></div>').join('') +
      '<div class="g3 mt" style="gap:0 14px">' + fl('Tingkat Kesulitan', selH('kesulitan', ['Mudah', 'Sedang', 'Sulit'], q.kesulitan)) + fl('Status', selH('status', ['Aktif', 'Draft', 'Nonaktif'], q.status)) + fl('Materi Terkait', selH('materi', [['', '— Tidak ada —']].concat(mats.map(m => [m.id, m.judul])), q.materi)) + '</div>' +
      fl('Pembahasan', '<textarea class="txa" name="pembahasan" rows="4" maxlength="4000" placeholder="Jelaskan alasan jawaban benar…">' + esc(q.pembahasan) + '</textarea>') + '</form>',
    foot: '<button class="btn ghost" data-act="soalTutup">Batal</button><button class="btn primary" type="submit" form="fSoal"><i class="bi bi-check2"></i> Simpan Soal</button>',
    onOpen: () => { if (q.img) imgLoad(q.id).then(u => { const p = $('#imgPrev'); if (p && u && !S.simg) p.innerHTML = '<img src="' + u + '" alt="Gambar saat ini">'; }).catch(() => {}); }
  });
};
ACT.soalTutup = async () => { if (await confirmBox('Tutup formulir? Perubahan yang belum disimpan akan hilang.', { yes: 'Tutup', no: 'Lanjut Mengedit' })) closeModal(); };
CHG.soalKat = v => { const f = $('#fSoal'); if (f) f.classList.toggle('tkp', v === 'TKP'); };
ACT.pickImg = () => { const f = $('#fileImg'); if (f) f.click(); };
CHG.soalImg = async (v, el) => {
  const f = el.files[0]; if (!f) return; const er = $('#fSoal .ferr');
  if (['image/png', 'image/jpeg', 'image/webp'].indexOf(f.type) < 0) { er.textContent = 'Format gambar harus PNG, JPG, atau WebP.'; el.value = ''; return; }
  if (f.size > 2 * 1024 * 1024) { er.textContent = 'Ukuran gambar maksimal 2 MB.'; el.value = ''; return; }
  er.textContent = '';
  const b64 = await fileToB64(f); S.simg = { mime: f.type, base64: b64 }; S.simgDel = false;
  $('#imgPrev').innerHTML = '<img src="data:' + f.type + ';base64,' + b64 + '" alt="Pratinjau gambar baru">';
  const c = $('#fSoal [name=hapusGambar]'); if (c) c.checked = false;
};
CHG.soalImgDel = on => { S.simgDel = on; if (on) { S.simg = null; $('#imgPrev').innerHTML = ''; } };
SUB.soalForm = async f => {
  ferr(f, '');
  const kat = f.kat.value, o = {}; LET.forEach(L => { o[L] = f['o_' + L].value.trim(); });
  if (!f.q.value.trim()) return ferr(f, 'Pertanyaan wajib diisi.');
  const kosong = LET.filter(L => !o[L]); if (kosong.length) return ferr(f, 'Opsi ' + kosong.join(', ') + ' belum diisi.');
  const d = { id: f.dataset.id || undefined, kat, q: f.q.value, o, pembahasan: f.pembahasan.value, status: f.status.value, sub: f.sub.value, kesulitan: f.kesulitan.value, materi: f.materi.value };
  if (kat === 'TKP') d.skors = LET.map(L => +f['s_' + L].value); else { const k = f.querySelector('[name=kunci]:checked'); if (!k) return ferr(f, 'Pilih kunci jawaban.'); d.kunci = k.value; }
  if (S.simg) d.gambar = S.simg; if (S.simgDel) d.hapusGambar = true;
  const b = $('button[type=submit]', $('.mfoot')); setBusy(b, true, 'Menyimpan…');
  try { await call('soalSimpan', d); S.modalPersist = false; closeModal(); toast('Soal tersimpan.', 'ok'); if (S.page === 'soal') loadSoal(); else if (S.page === 'adminDash') go('adminDash'); delete S.soalRingkas; }
  catch (e) { ferr(f, e.message); setBusy(b, false); const m = $('.mbody'); if (m) m.scrollTop = 0; }
};
/* ---- Impor CSV ---- */
const CSV_HEAD = ['kategori', 'pertanyaan', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'kunci', 'skor_a', 'skor_b', 'skor_c', 'skor_d', 'skor_e', 'pembahasan', 'subtopik', 'kesulitan', 'status'];
ACT.soalImpor = () => {
  S.csvRows = null;
  openModal({ title: 'Impor Soal dari CSV', size: 'wide', body: '<p class="sm">Unduh templat, isi data, lalu unggah. Kolom <b>kunci</b> (A–E) untuk TWK/TIU; kolom <b>skor_a…skor_e</b> (1–5) untuk TKP. Maksimal 1000 baris. Gambar ditambahkan manual setelah impor.</p><p class="mt-s"><button class="btn sm ghost" data-act="csvTpl"><i class="bi bi-download"></i> Unduh Templat CSV</button></p><div class="drop mt" data-act="pickCsv" tabindex="0" role="button"><i class="bi bi-filetype-csv" style="font-size:26px"></i><div class="sm">Klik untuk memilih berkas .csv</div></div><input type="file" id="fileCsv" accept=".csv,text/csv" hidden data-chg="csvFile"><div id="csvInfo" class="mt"></div>', foot: '<button class="btn ghost" data-act="closeModal">Batal</button><button class="btn primary" id="btnCsv" data-act="csvGo" disabled>Impor</button>' });
};
ACT.csvTpl = () => csvDownload('templat_soal.csv', [CSV_HEAD, ['TWK', 'Contoh pertanyaan TWK?', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E', 'B', '', '', '', '', '', 'Penjelasan jawaban', 'Pancasila', 'Sedang', 'Aktif'], ['TKP', 'Contoh situasi TKP…', 'Sikap 1', 'Sikap 2', 'Sikap 3', 'Sikap 4', 'Sikap 5', '', '1', '3', '5', '4', '2', 'Alasan skor', 'Pelayanan Publik', 'Sedang', 'Aktif']]);
ACT.pickCsv = () => $('#fileCsv').click();
CHG.csvFile = async (v, el) => {
  const f = el.files[0]; if (!f) return; const info = $('#csvInfo');
  if (f.size > 3 * 1024 * 1024) { info.innerHTML = '<span class="ferr">Berkas terlalu besar (maks 3 MB).</span>'; return; }
  const rows = parseCsv(await f.text());
  if (rows.length < 2) { info.innerHTML = '<span class="ferr">Berkas kosong atau tanpa baris data.</span>'; return; }
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_')), ix = n => head.indexOf(n);
  const miss = ['kategori', 'pertanyaan', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e'].filter(n => ix(n) < 0);
  if (miss.length) { info.innerHTML = '<span class="ferr">Kolom wajib tidak ditemukan: ' + miss.join(', ') + '</span>'; return; }
  const g = (r, n) => ix(n) >= 0 ? String(r[ix(n)] == null ? '' : r[ix(n)]).trim() : '';
  S.csvRows = rows.slice(1, 1001).map(r => ({ kat: g(r, 'kategori').toUpperCase(), q: g(r, 'pertanyaan'), o: { A: g(r, 'opsi_a'), B: g(r, 'opsi_b'), C: g(r, 'opsi_c'), D: g(r, 'opsi_d'), E: g(r, 'opsi_e') }, kunci: g(r, 'kunci').toUpperCase(), skors: ['a', 'b', 'c', 'd', 'e'].map(x => +g(r, 'skor_' + x)), pembahasan: g(r, 'pembahasan'), sub: g(r, 'subtopik'), kesulitan: g(r, 'kesulitan') ? g(r, 'kesulitan')[0].toUpperCase() + g(r, 'kesulitan').slice(1).toLowerCase() : 'Sedang', status: g(r, 'status') ? g(r, 'status')[0].toUpperCase() + g(r, 'status').slice(1).toLowerCase() : 'Draft' }));
  info.innerHTML = '<div class="banner"><i class="bi bi-file-earmark-check"></i><div><b>' + S.csvRows.length + ' baris</b> siap diimpor dari <i>' + esc(f.name) + '</i>. Baris tidak valid akan dilewati dan dilaporkan.</div></div>';
  $('#btnCsv').disabled = false;
};
ACT.csvGo = async el => {
  const rows = S.csvRows; if (!rows) return; setBusy(el, true, 'Mengimpor…');
  let ok = 0, bad = 0; const msgs = [];
  try {
    for (let i = 0; i < rows.length; i += 150) {
      const r = await call('soalImpor', { rows: rows.slice(i, i + 150) }, { retry: 1 });
      ok += r.berhasil; bad += r.jumlahGalat; r.galat.forEach(m => { if (msgs.length < 15) msgs.push(m.replace(/^Baris (\d+)/, (a, n) => 'Baris ' + (+n + i))); });
    }
    $('#csvInfo').innerHTML = '<div class="banner"><i class="bi bi-check-circle"></i><div><b>' + ok + ' soal berhasil diimpor</b>' + (bad ? ', ' + bad + ' baris dilewati.' : '.') + '</div></div>' + (msgs.length ? '<ul class="sm ferr" style="padding-left:18px;margin-top:8px">' + msgs.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '');
    el.hidden = true; S.csvRows = null; delete S.soalRingkas; if (S.page === 'soal') loadSoal();
  } catch (e) { toast(e.message, 'bad'); setBusy(el, false); }
};

/* ============================================================
   ADMIN — PAKET & TRYOUT
   ============================================================ */
VIEWS.paketAdmin = () => swr('padm', 'paketAdmin', {}, d => {
  if (S.page !== 'paketAdmin') return;
  S.padm = d;
  $('#view').innerHTML = pageHead('Konten', 'Paket & Tryout', 'Susun paket latihan dan jadwalkan tryout.', '<button class="btn primary" data-act="paketForm"><i class="bi bi-plus-lg"></i> Buat Paket</button>') +
    (d.length ? '<div class="pkgrid">' + d.map(p => '<div class="card pk"><div class="row">' + stChip(p.jenis) + stChip(p.status) + (p.live ? stChip('Berlangsung') : '') + '</div><h4>' + esc(p.nama) + '</h4><p>' + esc(p.deskripsi || '') + '</p><div class="row wrap gap-s">' + ['TWK', 'TIU', 'TKP'].filter(k => p.komp[k]).map(k => katChip(k) + '<span class="sm">' + p.komp[k] + '</span>').join(' ') + '</div>' +
      '<div class="meta"><span><i class="bi bi-list-check"></i>' + p.jumlah + ' soal</span><span><i class="bi bi-clock"></i>' + p.durasi + ' mnt</span><span><i class="bi bi-people"></i>' + p.peserta + ' peserta</span><span><i class="bi bi-graph-up"></i>rata ' + nf(p.rata) + '</span></div>' + (p.jenis === 'Tryout' ? '<div class="muted sm"><i class="bi bi-calendar-event"></i> ' + fmtDT(p.tgl_mulai) + ' → ' + fmtDT(p.tgl_selesai) + '</div>' : '') +
      '<div class="foot"><button class="btn sm ghost" data-act="paketStatus" data-arg="' + p.id + ':' + (p.status === 'Aktif' ? 'Nonaktif' : 'Aktif') + '">' + (p.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan') + '</button><span class="sp"></span><button class="icon-btn" data-act="paketForm" data-arg="' + p.id + '" aria-label="Ubah" title="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-act="paketHapus" data-arg="' + p.id + '" aria-label="Hapus" title="Hapus"><i class="bi bi-trash"></i></button></div></div>').join('') + '</div>' : '<div class="card">' + empty('bi-layers', 'Belum ada paket', 'Buat paket pertama dari soal di bank soal.') + '</div>');
});
ACT.paketStatus = async arg => {
  const [id, st] = arg.split(':'); showLoader('Memproses…');
  try { await call('paketStatus', { id, status: st }); hideLoader(); toast('Status paket diperbarui.', 'ok'); go('paketAdmin'); } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};
ACT.paketHapus = async id => {
  const p = (S.padm || []).find(x => x.id === id);
  if (!await confirmBox('Hapus paket <b>' + esc(p ? p.nama : '') + '</b>?<br><span class="muted sm">Riwayat hasil peserta tetap tersimpan.</span>', { danger: true, yes: 'Hapus' })) return;
  showLoader('Menghapus…');
  try { await call('paketHapus', { id }); hideLoader(); toast('Paket dihapus.', 'ok'); go('paketAdmin'); } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};
S.pb = { ids: [], q: '', kat: '' };
ACT.paketForm = async id => {
  showLoader('Memuat…');
  try { if (!S.soalRingkas) S.soalRingkas = await call('soalRingkas', {}); } catch (e) { hideLoader(); return toast(e.message, 'bad'); }
  hideLoader();
  const p = (id && (S.padm || []).find(x => x.id === id)) || { id: '', nama: '', deskripsi: '', jenis: 'Latihan', durasi: +(S.cfg.durasi_default) || 100, status: 'Draft', tgl_mulai: '', tgl_selesai: '', tampil: 'Langsung', acak_soal: 'Ya', acak_opsi: 'Ya', kuota: '', ids: [] };
  S.pb = { ids: (p.ids || []).slice(), q: '', kat: '' };
  openModal({
    title: id ? 'Ubah Paket' : 'Buat Paket Baru', size: 'xl', persist: true,
    body: '<form id="fPaket" data-sub="paketForm" data-id="' + esc(id || '') + '" novalidate><div class="ferr" role="alert"></div><div class="g-main-r" style="gap:1.5rem"><div>' +
      fl('Nama Paket', inpH('nama', p.nama, 'required maxlength="120"')) + fl('Deskripsi', '<textarea class="txa" name="deskripsi" rows="2" maxlength="400">' + esc(p.deskripsi) + '</textarea>') +
      '<div class="grid2">' + fl('Jenis', selH('jenis', ['Latihan', 'Tryout'], p.jenis, 'data-chg="pkJenis"')) + fl('Durasi (menit)', inpH('durasi', p.durasi, 'type="number" min="1" max="300" required')) + '</div>' +
      '<div id="pkJadwal" class="grid2 ' + (p.jenis === 'Tryout' ? '' : 'hide') + '">' + fl('Mulai Akses', inpH('tgl_mulai', toLocalInput(p.tgl_mulai), 'type="datetime-local"')) + fl('Tutup Akses', inpH('tgl_selesai', toLocalInput(p.tgl_selesai), 'type="datetime-local"')) + '</div>' +
      '<div class="grid2">' + fl('Status', selH('status', ['Aktif', 'Draft', 'Nonaktif'], p.status)) + fl('Kuota Peserta Tryout', inpH('kuota', p.kuota, 'type="number" min="0" placeholder="Kosong = tanpa batas"')) + '</div>' +
      fl('Tampilkan Pembahasan', selH('tampil', [['Langsung', 'Langsung setelah selesai'], ['Setelah Ditutup', 'Setelah tryout ditutup']], p.tampil)) + swH('acak_soal', 'Acak urutan soal', p.acak_soal !== 'Tidak', 'Urutan diacak di dalam tiap kategori') + swH('acak_opsi', 'Acak urutan opsi', p.acak_opsi !== 'Tidak', 'Hanya TWK & TIU; TKP tidak diacak') +
      '</div><div><div class="row mb"><b class="sp">Pilih Soal</b><span class="chip s-ok" id="pbCount"></span></div><div class="toolbar mb"><div class="sr"><i class="bi bi-search"></i><input class="inp" placeholder="Cari soal…" data-inp="pbQ" aria-label="Cari soal"></div><select class="sel" data-chg="pbKat" aria-label="Kategori">' + [['', 'Semua'], 'TWK', 'TIU', 'TKP'].map(o => optH(o, '')).join('') + '</select></div><div class="row gap-s mb"><button type="button" class="btn sm ghost" data-act="pbAll">Pilih semua hasil</button><button type="button" class="btn sm ghost" data-act="pbNone">Kosongkan pilihan</button></div><div class="pick" id="pbList"></div></div></div></form>',
    foot: '<button class="btn ghost" data-act="paketTutup">Batal</button><button class="btn primary" type="submit" form="fPaket"><i class="bi bi-check2"></i> Simpan Paket</button>',
    onOpen: drawPick
  });
};
ACT.paketTutup = async () => { if (await confirmBox('Tutup formulir? Perubahan yang belum disimpan akan hilang.', { yes: 'Tutup', no: 'Lanjut Mengedit' })) closeModal(); };
CHG.pkJenis = v => { const j = $('#pkJadwal'); if (j) j.classList.toggle('hide', v !== 'Tryout'); };
function pbFiltered() { const q = S.pb.q.toLowerCase(); return (S.soalRingkas || []).filter(s => (!S.pb.kat || s.kat === S.pb.kat) && (!q || (s.q + ' ' + s.sub + ' ' + s.id).toLowerCase().indexOf(q) >= 0)); }
function drawPick() {
  const box = $('#pbList'); if (!box) return;
  const set = new Set(S.pb.ids), list = pbFiltered().slice(0, 300);
  box.innerHTML = list.length ? list.map(s => '<label><input type="checkbox" data-chg="pbSel" data-id="' + s.id + '" ' + (set.has(s.id) ? 'checked' : '') + '><span>' + katChip(s.kat) + ' ' + esc(trunc(s.q, 90)) + (s.sub ? ' <span class="muted sm">· ' + esc(s.sub) + '</span>' : '') + '</span></label>').join('') + (pbFiltered().length > 300 ? '<div class="muted sm" style="padding:10px">Menampilkan 300 pertama — persempit pencarian.</div>' : '') : '<div class="empty" style="padding:20px">Tidak ada soal aktif yang cocok.</div>';
  const map = {}; (S.soalRingkas || []).forEach(s => { map[s.id] = s.kat; });
  const c = { TWK: 0, TIU: 0, TKP: 0 }; S.pb.ids.forEach(i => { if (c[map[i]] !== undefined) c[map[i]]++; });
  const el = $('#pbCount'); if (el) el.textContent = S.pb.ids.length + ' soal (TWK ' + c.TWK + ' · TIU ' + c.TIU + ' · TKP ' + c.TKP + ')';
}
INP.pbQ = debounce(v => { S.pb.q = v; drawPick(); }, 200);
CHG.pbKat = v => { S.pb.kat = v; drawPick(); };
CHG.pbSel = (on, el) => { const i = el.dataset.id, k = S.pb.ids.indexOf(i); if (on && k < 0) S.pb.ids.push(i); if (!on && k >= 0) S.pb.ids.splice(k, 1); drawPick(); };
ACT.pbAll = () => { const set = new Set(S.pb.ids); pbFiltered().forEach(s => { if (!set.has(s.id)) S.pb.ids.push(s.id); }); drawPick(); };
ACT.pbNone = () => { const f = new Set(pbFiltered().map(s => s.id)); S.pb.ids = S.pb.ids.filter(i => !f.has(i)); drawPick(); };
SUB.paketForm = async f => {
  ferr(f, '');
  const jenis = f.jenis.value, d = { id: f.dataset.id || undefined, nama: f.nama.value, deskripsi: f.deskripsi.value, jenis, durasi: +f.durasi.value, status: f.status.value, ids: S.pb.ids, tampil: f.tampil.value, acak_soal: f.acak_soal.checked ? 'Ya' : 'Tidak', acak_opsi: f.acak_opsi.checked ? 'Ya' : 'Tidak', kuota: f.kuota.value };
  if (!d.nama.trim()) return ferr(f, 'Nama paket wajib diisi.');
  if (jenis === 'Tryout') { d.tgl_mulai = f.tgl_mulai.value ? new Date(f.tgl_mulai.value).getTime() : 0; d.tgl_selesai = f.tgl_selesai.value ? new Date(f.tgl_selesai.value).getTime() : 0; if (!d.tgl_mulai || !d.tgl_selesai) return ferr(f, 'Tryout wajib memiliki jadwal mulai dan tutup akses.'); if (d.tgl_selesai <= d.tgl_mulai) return ferr(f, 'Tutup akses harus setelah waktu mulai.'); }
  const b = $('button[type=submit]', $('.mfoot')); setBusy(b, true, 'Menyimpan…');
  try { await call('paketSimpan', d); S.modalPersist = false; closeModal(); toast('Paket tersimpan.', 'ok'); go('paketAdmin'); }
  catch (e) { ferr(f, e.message); setBusy(b, false); const m = $('.mbody'); if (m) m.scrollTop = 0; }
};

/* ============================================================
   ADMIN — MATERI
   ============================================================ */
VIEWS.materiAdmin = () => call('materiList', { semua: true }).then(d => {
  if (S.page !== 'materiAdmin') return; S.matAdm = d; S.matOpt = d;
  $('#view').innerHTML = pageHead('Konten', 'Materi Belajar', 'Unggah ringkasan materi (PDF) untuk peserta.', '<button class="btn primary" data-act="materiForm"><i class="bi bi-cloud-arrow-up"></i> Unggah Materi</button>') +
    (d.length ? '<div class="tw"><table class="tbl"><thead><tr><th>Judul</th><th>Kategori</th><th>Bab</th><th class="num">Ukuran</th><th>Diunggah</th><th>Status</th><th class="act">Aksi</th></tr></thead><tbody>' + d.map(m => '<tr><td><b>' + esc(m.judul) + '</b><div class="muted sm">' + esc(trunc(m.deskripsi, 80)) + '</div></td><td>' + katChip(m.kategori) + '</td><td>' + esc(m.bab || '-') + '</td><td class="num">' + nf(m.kb) + ' KB</td><td>' + fmtD(m.tgl) + '</td><td>' + stChip(m.status) + '</td><td class="act"><button class="icon-btn" data-act="matLihat" data-arg="' + m.id + '" aria-label="Baca" title="Baca"><i class="bi bi-eye"></i></button><button class="icon-btn" data-act="materiForm" data-arg="' + m.id + '" aria-label="Ubah" title="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-act="matHapus" data-arg="' + m.id + '" aria-label="Hapus" title="Hapus"><i class="bi bi-trash"></i></button></td></tr>').join('') + '</tbody></table></div>' : '<div class="card">' + empty('bi-book', 'Belum ada materi', 'Unggah PDF pertama Anda.') + '</div>');
}).catch(viewError);
ACT.matLihat = id => { S.materiData = S.matAdm; ACT.materiBaca(id); };
ACT.matHapus = async id => {
  const m = (S.matAdm || []).find(x => x.id === id);
  if (!await confirmBox('Hapus materi <b>' + esc(m ? m.judul : '') + '</b> beserta berkasnya?', { danger: true, yes: 'Hapus' })) return;
  showLoader('Menghapus…');
  try { await call('materiHapus', { id }); hideLoader(); toast('Materi dihapus.', 'ok'); delete S.matOpt; go('materiAdmin'); } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};
S.mfile = null;
ACT.materiForm = id => {
  const m = (id && (S.matAdm || []).find(x => x.id === id)) || { judul: '', kategori: 'TWK', bab: '', deskripsi: '', status: 'Aktif' };
  S.mfile = null;
  openModal({ title: id ? 'Ubah Materi' : 'Unggah Materi', size: 'wide', persist: true, body: '<form id="fMateri" data-sub="materiForm" data-id="' + esc(id || '') + '" novalidate><div class="ferr" role="alert"></div>' + fl('Judul Materi', inpH('judul', m.judul, 'required maxlength="120"')) + '<div class="grid2">' + fl('Kategori', selH('kategori', ['TWK', 'TIU', 'TKP'], m.kategori)) + fl('Bab / Topik', inpH('bab', m.bab, 'maxlength="120"')) + '</div>' + fl('Deskripsi singkat', '<textarea class="txa" name="deskripsi" rows="2" maxlength="400">' + esc(m.deskripsi) + '</textarea>') + fl('Status', selH('status', ['Aktif', 'Draft'], m.status)) +
    fl('Berkas PDF ' + (id ? '<span class="muted">(kosongkan bila tidak diganti)</span>' : ''), '<div class="drop" data-act="pickPdf" tabindex="0" role="button"><i class="bi bi-file-earmark-pdf" style="font-size:26px"></i><div class="sm" id="pdfName">Klik untuk memilih PDF (maks. 10 MB)</div></div><input type="file" id="filePdf" accept="application/pdf" hidden data-chg="pdfFile">') + '</form>', foot: '<button class="btn ghost" data-act="closeModalForce">Batal</button><button class="btn primary" type="submit" form="fMateri"><i class="bi bi-cloud-arrow-up"></i> Simpan</button>' });
};
ACT.closeModalForce = () => { S.modalPersist = false; closeModal(); };
ACT.pickPdf = () => $('#filePdf').click();
CHG.pdfFile = async (v, el) => {
  const f = el.files[0], er = $('#fMateri .ferr'); if (!f) return;
  if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { er.textContent = 'Berkas harus berformat PDF.'; el.value = ''; return; }
  if (f.size > 10 * 1024 * 1024) { er.textContent = 'Ukuran PDF maksimal 10 MB.'; el.value = ''; return; }
  er.textContent = ''; S.mfile = { base64: await fileToB64(f) }; $('#pdfName').innerHTML = '<b>' + esc(f.name) + '</b> · ' + Math.round(f.size / 1024) + ' KB';
  const j = $('#fMateri [name=judul]'); if (j && !j.value) j.value = f.name.replace(/\.pdf$/i, '');
};
SUB.materiForm = async f => {
  ferr(f, ''); if (!f.dataset.id && !S.mfile) return ferr(f, 'Berkas PDF wajib dipilih.');
  const b = $('button[type=submit]', $('.mfoot')); setBusy(b, true, 'Mengunggah…');
  try { await call('materiSimpan', { id: f.dataset.id || undefined, judul: f.judul.value, kategori: f.kategori.value, bab: f.bab.value, deskripsi: f.deskripsi.value, status: f.status.value, file: S.mfile || undefined }); S.modalPersist = false; closeModal(); toast('Materi tersimpan.', 'ok'); delete S.matOpt; go('materiAdmin'); }
  catch (e) { ferr(f, e.message); setBusy(b, false); }
};

/* ============================================================
   ADMIN — LAPORAN & ANALITIK
   ============================================================ */
S.st.lp = { tab: 'ringkas', hari: 14 }; S.st.nl = { q: '', paketId: '', status: '', page: 1, size: 10 }; S.st.ab = '';
VIEWS.laporan = () => {
  $('#view').innerHTML = pageHead('Laporan', 'Laporan & Analitik', 'Analisis performa peserta, nilai, dan kualitas butir soal.') +
    '<div class="tabs mb">' + [['ringkas', 'Ringkasan', 'bi-bar-chart'], ['nilai', 'Nilai Peserta', 'bi-table'], ['butir', 'Analisis Butir Soal', 'bi-bullseye']].map(t => '<button class="tab ' + (S.st.lp.tab === t[0] ? 'on' : '') + '" data-act="lpTab" data-arg="' + t[0] + '"><i class="bi ' + t[2] + '"></i>' + t[1] + '</button>').join('') + '</div><div id="lpBox">' + skel(6) + '</div>';
  loadLaporan();
};
ACT.lpTab = t => { S.st.lp.tab = t; go('laporan'); };
function loadLaporan() { const t = S.st.lp.tab; (t === 'nilai' ? lpNilai : t === 'butir' ? lpButir : lpRingkas)(); }
function lpRingkas() {
  const nav = S.nav;
  swr('lap' + S.st.lp.hari, 'laporan', { hari: S.st.lp.hari }, d => {
    if (nav !== S.nav || S.st.lp.tab !== 'ringkas') return;
    $('#lpBox').innerHTML = '<div class="row mb wrap"><span class="muted sm sp">Periode analisis</span><select class="sel" style="width:auto" data-chg="lpHari" aria-label="Periode">' + [[7, '7 hari'], [14, '14 hari'], [30, '30 hari'], [90, '90 hari']].map(o => optH(o, S.st.lp.hari)).join('') + '</select></div>' +
      '<div class="g4 keep2 mb">' + kpi('Sesi Selesai', nf(d.total), d.aktifBerlatih + ' peserta aktif', 'bi-journal-check') + kpi('Rata-rata Skor', nf(d.rata), 'Simpangan baku ' + d.sd, 'bi-graph-up', 'tiu') + kpi('Tingkat Kelulusan', d.lulusPct + '%', d.lulus + ' lulus · ' + d.tidakLulus + ' tidak', 'bi-patch-check', 'twk') + kpi('Rentang Skor', nf(d.terendah) + '–' + nf(d.tertinggi), 'Rata-rata harian', 'bi-arrows-expand', 'tkp') + '</div>' +
      '<div class="g-main mb"><div class="card pad"><h4>Tren Rata-rata Skor Harian</h4>' + chartBox('chLap1', 260) + '</div><div class="card pad"><h4 class="mb">Rata-rata per Kategori</h4>' + ['TWK', 'TIU', 'TKP'].map(k => { const x = d.kategori[k]; return '<div class="catrow"><div class="top">' + katChip(k) + '<b>' + x.rata + '</b><span class="muted sm">/ ' + x.max + ' · PG ' + x.pg + ' · gagal ' + d.gagal[k] + 'x</span></div>' + bar(x.max ? x.rata / x.max * 100 : 0, CK[k], x.max ? x.pg / x.max * 100 : null) + '</div>'; }).join('') + '</div></div>' +
      '<div class="g2"><div class="card pad"><h4>Volume Sesi Harian</h4>' + chartBox('chLap2', 240) + '</div><div class="card pad"><h4>Kelulusan</h4>' + chartBox('chLap3', 240) + '</div></div>';
    mkChart('chLap1', { type: 'line', data: { labels: d.hari, datasets: [{ label: 'Rata-rata skor', data: d.seri, borderColor: '#2eb87e', backgroundColor: 'rgba(46,184,126,.15)', fill: true, tension: .3, spanGaps: true, pointRadius: 3 }, { label: 'Passing grade', data: d.hari.map(() => d.pgTotal), borderColor: '#f0625c', borderDash: [6, 4], pointRadius: 0 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } });
    mkChart('chLap2', { type: 'bar', data: { labels: d.hari, datasets: [{ label: 'Latihan', data: d.latihan, backgroundColor: '#2eb87e', borderRadius: 5 }, { label: 'Tryout', data: d.simulasi, backgroundColor: '#3b82f6', borderRadius: 5 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
    mkChart('chLap3', { type: 'doughnut', data: { labels: ['Lulus', 'Tidak Lulus'], datasets: [{ data: [d.lulus, d.tidakLulus], backgroundColor: ['#4cc26b', '#f0625c'], borderWidth: 0 }] }, options: { cutout: '65%', plugins: { legend: { position: 'bottom' } } } });
  });
}
CHG.lpHari = v => { S.st.lp.hari = +v; lpRingkas(); };
async function lpNilai() {
  const nav = S.nav;
  if (!S.paketOpt) { try { S.paketOpt = await call('paketAdmin', {}); } catch (e) { S.paketOpt = []; } }
  if (nav !== S.nav) return;
  const b = $('#lpBox'); if (!b) return;
  b.innerHTML = '<div class="toolbar mb"><div class="sr"><i class="bi bi-search"></i><input class="inp" placeholder="Cari nama, email, atau paket…" data-inp="nlQ" value="' + esc(S.st.nl.q) + '" aria-label="Cari"></div><select class="sel" data-chg="nlPaket" aria-label="Paket">' + [['', 'Semua Paket']].concat(S.paketOpt.map(p => [p.id, p.nama])).map(o => optH(o, S.st.nl.paketId)).join('') + '</select><select class="sel" data-chg="nlStatus" aria-label="Status">' + [['', 'Semua Status'], 'Lulus', 'Tidak Lulus'].map(o => optH(o, S.st.nl.status)).join('') + '</select><button class="btn ghost" data-act="nlCsv"><i class="bi bi-download"></i> Ekspor CSV</button></div><div id="nlBox">' + skel(5) + '</div>';
  loadNilai();
}
function loadNilai() {
  const nav = S.nav;
  call('nilaiSemua', S.st.nl).then(d => {
    if (nav !== S.nav) return; const box = $('#nlBox'); if (!box) return;
    box.innerHTML = d.rows.length ? '<div class="tw"><table class="tbl"><thead><tr><th class="num">#</th><th>Peserta</th><th>Paket</th><th>Waktu</th><th class="num">TWK</th><th class="num">TIU</th><th class="num">TKP</th><th class="num">Total</th><th>Status</th><th class="act"></th></tr></thead><tbody>' + d.rows.map(r => '<tr><td class="num">' + r.no + '</td><td><b>' + esc(r.nama) + '</b><div class="muted sm">' + esc(r.email) + '</div></td><td>' + esc(r.paket) + '</td><td>' + fmtDT(r.waktu) + '</td><td class="num">' + nf(r.twk) + '</td><td class="num">' + nf(r.tiu) + '</td><td class="num">' + nf(r.tkp) + '</td><td class="num"><b>' + r.total + '</b></td><td>' + lulusChip(r.lulus) + '</td><td class="act"><button class="btn sm ghost" data-act="lihat" data-arg="' + r.id + '">Detail</button></td></tr>').join('') + '</tbody></table></div>' + pager(d.total, d.page, d.size, 'nlPage') : '<div class="card">' + empty('bi-table', 'Belum ada data nilai', 'Data muncul setelah peserta menyelesaikan sesi.') + '</div>';
  }).catch(e => { if (nav === S.nav) toast(e.message, 'bad'); });
}
INP.nlQ = debounce(v => { S.st.nl.q = v; S.st.nl.page = 1; loadNilai(); }, 300);
CHG.nlPaket = v => { S.st.nl.paketId = v; S.st.nl.page = 1; loadNilai(); };
CHG.nlStatus = v => { S.st.nl.status = v; S.st.nl.page = 1; loadNilai(); };
ACT.nlPage = p => { S.st.nl.page = +p; loadNilai(); };
CHG.nlPageSize = v => { S.st.nl.size = +v; S.st.nl.page = 1; loadNilai(); };
ACT.nlCsv = async el => {
  setBusy(el, true, 'Menyiapkan…');
  try {
    const d = await call('nilaiSemua', Object.assign({}, S.st.nl, { semua: true }));
    csvDownload('nilai_peserta_' + new Date().toISOString().slice(0, 10) + '.csv', [['No', 'Nama', 'Email', 'Instansi', 'Paket', 'Waktu Selesai', 'TWK', 'TIU', 'TKP', 'Total', 'Status']].concat(d.rows.map(r => [r.no, r.nama, r.email, r.instansi, r.paket, fmtDT(r.waktu), r.twk, r.tiu, r.tkp, r.total, r.lulus ? 'Lulus' : 'Tidak Lulus'])));
    toast(d.rows.length + ' baris diekspor.', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  setBusy(el, false);
};
function lpButir() {
  const nav = S.nav;
  $('#lpBox').innerHTML = '<div class="row mb wrap"><div class="muted sm sp">Indeks daya beda (D) membandingkan kelompok skor atas 27% vs bawah 27%. Akurasi = persentase peserta yang menjawab benar. Menampilkan 100 butir dengan D terendah.</div><select class="sel" style="width:auto" data-chg="abKat" aria-label="Kategori">' + [['', 'Semua Kategori'], 'TWK', 'TIU', 'TKP'].map(o => optH(o, S.st.ab)).join('') + '</select></div><div id="abBox">' + skel(5) + '</div>';
  call('analisisButir', { kategori: S.st.ab }).then(d => {
    if (nav !== S.nav) return; const box = $('#abBox'); if (!box) return;
    const RC = { 'Sangat Baik': 'ok', Baik: 'ok', Cukup: 'info', Revisi: 'warn', 'Revisi Butir': 'bad' };
    box.innerHTML = d.length ? '<div class="tw"><table class="tbl"><thead><tr><th>Soal</th><th>Kategori</th><th class="num">Dijawab</th><th style="min-width:150px">Akurasi</th><th class="num">D</th><th>Tingkat</th><th>Rekomendasi</th></tr></thead><tbody>' + d.map(r => '<tr><td style="min-width:240px"><b>' + esc(r.id) + '</b> ' + esc(r.q) + (r.topik ? '<div class="muted sm">' + esc(r.topik) + '</div>' : '') + '</td><td>' + katChip(r.kat) + '</td><td class="num">' + r.n + '</td><td><div class="row gap-s"><div class="sp">' + bar(r.akurasi, CK[r.kat]) + '</div><b class="sm">' + r.akurasi + '%</b></div></td><td class="num"><b>' + r.d.toFixed(2) + '</b></td><td>' + r.kesulitan + '</td><td><span class="chip s-' + (RC[r.rek] || 'draft') + '">' + r.rek + '</span></td><td class="act"><button class="icon-btn" data-act="soalForm" data-arg="' + r.id + '" aria-label="Ubah soal"><i class="bi bi-pencil"></i></button></td></tr>').join('') + '</tbody></table></div>' : '<div class="card">' + empty('bi-bullseye', 'Belum ada data analisis', 'Analisis tersedia setelah peserta menjawab soal.') + '</div>';
  }).catch(e => { if (nav === S.nav) toast(e.message, 'bad'); });
}
CHG.abKat = v => { S.st.ab = v; lpButir(); };

/* ============================================================
   ADMIN — PENGATURAN
   ============================================================ */
VIEWS.pengaturan = () => call('configGet', {}).then(d => {
  if (S.page !== 'pengaturan') return;
  const c = d.config;
  $('#view').innerHTML = pageHead('Sistem', 'Pengaturan Sistem', 'Konfigurasi aplikasi, passing grade, email, dan akun admin.', '<button class="btn primary" type="submit" form="fCfg"><i class="bi bi-check2"></i> Simpan Pengaturan</button>') +
    '<form id="fCfg" data-sub="cfg" novalidate><div class="ferr mb" role="alert"></div><div class="g2 mb"><div class="stack"><div class="card pad"><h4 class="mb">Umum</h4>' + fl('Nama Aplikasi', inpH('nama_aplikasi', c.nama_aplikasi, 'maxlength="80"')) + fl('Pengumuman <span class="muted">(tampil di beranda & login)</span>', '<textarea class="txa" name="pengumuman" rows="2" maxlength="300">' + esc(c.pengumuman) + '</textarea>') + '<div class="grid2">' + fl('Durasi Bawaan (menit)', inpH('durasi_default', c.durasi_default, 'type="number" min="1" max="300"')) + fl('Skor per Jawaban Benar', inpH('skor_benar', c.skor_benar, 'type="number" min="1" max="10"'), 'TWK & TIU') + '</div>' + swH('registrasi_dibuka', 'Pendaftaran peserta dibuka', c.registrasi_dibuka === 'Ya') + swH('izinkan_ulang_tryout', 'Izinkan tryout dikerjakan ulang', c.izinkan_ulang_tryout === 'Ya') + '</div>' +
    '<div class="card pad"><h4 class="mb">Passing Grade (SKD)</h4>' + d.kategori.map(k => '<div class="row mb">' + katChip(k.id) + '<span class="sp sm">' + esc(k.nama) + '</span><label class="sm muted">PG</label><input class="inp" style="width:84px" type="number" min="0" max="500" name="pg_' + k.id + '" value="' + esc(k.passing_grade) + '" aria-label="Passing grade ' + k.id + '"><label class="sm muted">Soal</label><input class="inp" style="width:84px" type="number" min="1" max="300" name="n_' + k.id + '" value="' + esc(k.jumlah_soal_default) + '" aria-label="Jumlah soal ' + k.id + '"></div>').join('') + fl('Total Passing Grade (informasi)', inpH('pg_total', c.pg_total, 'type="number" min="0" max="1000"'), 'Ditampilkan sebagai garis target di grafik.') + '<p class="hint">Jika paket memuat soal lebih sedikit dari jumlah default, passing grade disesuaikan proporsional.</p></div></div>' +
    '<div class="stack"><div class="card pad"><h4 class="mb">Email (Gmail)</h4>' + fl('Email Admin', inpH('email_admin', c.email_admin, 'type="email" placeholder="admin@gmail.com"'), 'Penerima notifikasi pendaftar baru.') + swH('kirim_email_hasil', 'Kirim hasil latihan ke email peserta', c.kirim_email_hasil === 'Ya', 'Dilampiri PDF hasil') + swH('notif_admin_pendaftar', 'Beri tahu admin saat ada pendaftar baru', c.notif_admin_pendaftar === 'Ya') +
    '<div class="muted sm mt-s">Sisa kuota email harian: <b>' + nf(d.emailKuota) + '</b></div><div class="row mt wrap"><input class="inp sp" id="emUji" type="email" placeholder="Kirim email uji ke…" value="' + esc(S.user.email) + '" style="min-width:200px"><button type="button" class="btn ghost" data-act="emailUji"><i class="bi bi-send"></i> Uji Kirim</button><button type="button" class="btn ghost" data-act="emailLog"><i class="bi bi-list-ul"></i> Log</button></div></div>' +
    '<div class="card pad"><div class="row mb"><h4 class="sp">Akun Admin</h4><button type="button" class="btn sm ghost" data-act="psTambah" data-arg="" data-role="Admin"><i class="bi bi-person-plus"></i> Tambah</button></div>' + d.admins.map(a => '<div class="row mb">' + avatar(a.nama) + '<div class="sp"><b>' + esc(a.nama) + '</b><div class="muted sm">' + esc(a.email) + '</div></div>' + stChip(a.status) + '</div>').join('') + '</div>' +
    '<div class="card pad"><h4 class="mb">Penyimpanan</h4><p class="sm">Data tersimpan di Google Sheets dan file di Google Drive milik pemilik skrip.</p><div class="row wrap mt-s">' + (d.ssUrl ? '<a class="btn ghost" href="' + esc(d.ssUrl) + '" target="_blank" rel="noopener"><i class="bi bi-file-earmark-spreadsheet"></i> Buka Spreadsheet</a>' : '') + (d.driveFolder ? '<a class="btn ghost" href="' + esc(d.driveFolder) + '" target="_blank" rel="noopener"><i class="bi bi-folder2-open"></i> Folder Drive</a>' : '') + '</div></div></div></div></form>';
}).catch(viewError);
ACT.psTambah = ((orig) => (arg, el, e) => orig(arg, el, e, el && el.dataset.role))(ACT.psTambah);
SUB.cfg = async f => {
  ferr(f, '');
  const keys = ['nama_aplikasi', 'pengumuman', 'durasi_default', 'skor_benar', 'pg_total', 'email_admin'], cfg = {};
  keys.forEach(k => { cfg[k] = f[k].value; });
  ['registrasi_dibuka', 'izinkan_ulang_tryout', 'kirim_email_hasil', 'notif_admin_pendaftar'].forEach(k => { cfg[k] = f[k].checked ? 'Ya' : 'Tidak'; });
  const kategori = ['TWK', 'TIU', 'TKP'].map(k => ({ id: k, passing_grade: f['pg_' + k].value, jumlah_soal_default: f['n_' + k].value }));
  showLoader('Menyimpan pengaturan…');
  try { await call('configSet', { config: cfg, kategori }); hideLoader(); S.cfg.nama_aplikasi = cfg.nama_aplikasi; S.cfg.pengumuman = cfg.pengumuman; S.cfg.pg_total = cfg.pg_total; Object.keys(localStorage).filter(k => k.indexOf('c_') === 0).forEach(k => lsDel(k)); S.paketOpt = null; toast('Pengaturan tersimpan.', 'ok'); mountShell(); go('pengaturan'); }
  catch (e) { hideLoader(); ferr(f, e.message); const t = $('#fCfg'); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
};
ACT.emailUji = async el => {
  const to = $('#emUji').value; setBusy(el, true, 'Mengirim…');
  try { await call('emailUji', { to }); toast('Email uji dikirim ke ' + to + '.', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  setBusy(el, false);
};
ACT.emailLog = async () => {
  showLoader('Memuat log…');
  try {
    const d = await call('logEmail', {}); hideLoader();
    openModal({ title: 'Log Email Terbaru', size: 'wide', body: d.length ? '<div class="tw"><table class="tbl" style="min-width:0"><thead><tr><th>Waktu</th><th>Tujuan</th><th>Jenis</th><th>Status</th></tr></thead><tbody>' + d.map(r => '<tr><td>' + fmtDT(r.waktu) + '</td><td>' + esc(r.tujuan) + '</td><td>' + esc(r.jenis) + '</td><td>' + stChip(r.status) + '</td></tr>').join('') + '</tbody></table></div>' : empty('bi-envelope', 'Belum ada email', ''), foot: '<button class="btn primary" data-act="closeModal">Tutup</button>' });
  } catch (e) { hideLoader(); toast(e.message, 'bad'); }
};


/* ---------- PWA & Instalasi Aplikasi di HP ---------- */
let deferredPwaPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=4').then(reg => {
      reg.update();
    }).catch(() => {});
  });
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing && !S.exam) { refreshing = true; window.location.reload(); }
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPwaPrompt = e;
  syncPwaBtn();
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  syncPwaBtn();
  toast('Aplikasi berhasil diinstal di perangkat Anda!', 'ok');
});

function syncPwaBtn() {
  $$('.pwa-install-btn').forEach(b => {
    b.classList.toggle('hide', isStandalone() || !deferredPwaPrompt);
  });
}

ACT.pwaInstall = async () => {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const { outcome } = await deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') deferredPwaPrompt = null;
    syncPwaBtn();
  } else {
    openModal({
      title: 'Instal Aplikasi di HP',
      body: '<p class="sm">Untuk menginstal aplikasi ini di layar utama HP Anda:</p>' +
        '<ul class="sm mt-s" style="padding-left:18px;line-height:24px">' +
        '<li><b>Android (Chrome):</b> Ketuk ikon menu <b>⋮</b> di pojok kanan atas browser, lalu pilih <b>Tambahkan ke layar utama (Install app)</b>.</li>' +
        '<li><b>iPhone / iPad (Safari):</b> Ketuk ikon <b>Bagikan (Share)</b> di bagian bawah layar, lalu pilih <b>Tambah ke Layar Utama (Add to Home Screen)</b>.</li>' +
        '</ul>',
      foot: '<button class="btn primary" data-act="closeModal">Mengerti</button>'
    });
  }
};
