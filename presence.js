/*
 * Painel de presença na TV do ranking: QR do Amparo + quem está na roleta hoje.
 * O QR é do período (troca automática às 08:30 e às 17:30, definida no Amparo): o painel confere a cada
 * 30 s e logo após o horário de troca. Sem a chave configurada no servidor, o painel fica oculto e a TV
 * continua igual.
 */
(function () {
  'use strict';
  var POLL_MS = 30000;
  var panel = document.getElementById('presence');
  if (!panel) return;
  var qrBox = panel.querySelector('.qr');
  var img = qrBox.querySelector('img');
  var until = panel.querySelector('[data-until]');
  var countEl = panel.querySelector('[data-count]');
  var list = panel.querySelector('ul');
  var msg = panel.querySelector('.msg');
  var current = null;
  var expiresAt = 0;
  var timer = null;
  var busy = false;
  var failures = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hhmm(iso) {
    try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
    catch (e) { return ''; }
  }
  function shortName(name) { return String(name || '').trim().split(/\s+/).slice(0, 2).join(' '); }
  function setVisible(on) {
    panel.hidden = !on;
    document.body.classList.toggle('has-presence', on);
  }
  function setMsg(text) { msg.textContent = text || ''; msg.hidden = !text; }

  function renderTeam(d) {
    var c = d.counts || {};
    var total = (c.present || 0) + (c.paused || 0) + (c.checked_out || 0) + (c.absent || 0);
    countEl.textContent = (c.present || 0) + ' de ' + total + ' na roleta' + (c.paused ? ' · ' + c.paused + ' em pausa' : '');
    var rows = (d.team || []).filter(function (p) { return p.status !== 'absent'; }).slice(0, 12);
    list.innerHTML = rows.length ? rows.map(function (p) {
      var note = p.status === 'present' ? hhmm(p.checked_in_at) : p.status === 'paused' ? 'pausa' : 'saiu';
      return '<li class="' + esc(p.status) + '"><i></i><span>' + esc(shortName(p.name)) + '</span><small>' + esc(note) + '</small></li>';
    }).join('') : '<li class="empty">Ninguém registrou presença ainda</li>';
  }

  function render(d) {
    setVisible(true);
    renderTeam(d);
    if (d.configured === false) {
      qrBox.hidden = true; until.textContent = '';
      setMsg('Presença ainda não configurada no Amparo.');
      return;
    }
    if (d.rotate && d.qr_svg) img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.qr_svg);
    if (d.display_id && (d.rotate ? d.qr_svg : true)) current = d.display_id;
    expiresAt = Date.parse(d.expires_at) || 0;
    qrBox.hidden = !img.getAttribute('src');
    until.textContent = expiresAt ? 'Código válido até ' + hhmm(d.expires_at) : '';
    setMsg('');
  }

  function nextDelay() {
    if (failures) return Math.min(300000, 15000 * Math.pow(2, Math.min(failures - 1, 4)));
    var untilSwitch = expiresAt - Date.now();
    return untilSwitch > 0 && untilSwitch < POLL_MS ? untilSwitch + 1500 : POLL_MS;
  }
  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(poll, ms);
  }

  async function poll() {
    timer = null;
    if (busy) return;
    if (document.hidden) return; // retoma no visibilitychange
    busy = true;
    var delay = POLL_MS;
    try {
      var r = await fetch('/api/presenca?' + (current ? 'current=' + encodeURIComponent(current) + '&' : '') + '_=' + Date.now(), { cache: 'no-store' });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 503 && d.code === 'not_configured') { failures = 0; setVisible(false); delay = 300000; return; }
      if (d.code === 'invalid_key') {
        failures = 0; setVisible(true); qrBox.hidden = true; until.textContent = '';
        setMsg('Chave da TV inválida ou revogada. Gere outra em Amparo › Presença e roleta › Telas de TV.');
        delay = 300000; return;
      }
      if (!r.ok || !d.ok) throw new Error(d.code || 'HTTP ' + r.status);
      failures = 0;
      render(d);
      delay = nextDelay();
    } catch (e) {
      failures += 1;
      // Mantém o último código enquanto ele vale; depois da troca, não exibe um QR vencido.
      if (expiresAt && Date.now() > expiresAt) { qrBox.hidden = true; current = null; }
      if (!panel.hidden) setMsg('Sem conexão com o Amparo. Tentando novamente…');
      delay = nextDelay();
    } finally {
      busy = false;
      schedule(delay);
    }
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(500); });
  poll();
})();
