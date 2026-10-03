'use strict';

// ---------- utilidades ----------
const RETORNO_DIAS = 30;   // depois de quantos dias sem vir o cliente aparece em "Chamar de volta"
const STATUS = { agendado: 'Agendado', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Cancelado' };

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => crypto.randomUUID();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => isoDate(new Date());
const fmtData = iso => iso ? iso.split('-').reverse().join('/') : '—';
const somaDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); };
const diasDesde = iso => Math.round((new Date(hoje()) - new Date(iso)) / 864e5);
const minutos = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const porHora = (a, b) => (a.data + a.hora).localeCompare(b.data + b.hora);
const soma = lista => lista.reduce((t, a) => t + (+a.valor || 0), 0);
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;

function whats(tel, msg = '') {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.length <= 11) d = '55' + d;   // sem código do país: assume Brasil
  return `https://wa.me/${d}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}
const linkWhats = (tel, msg) => {
  const url = whats(tel, msg);
  return url ? `<a class="wa" href="${url}" target="_blank" rel="noopener">WhatsApp</a>` : '';
};
const primeiroNome = nome => String(nome).trim().split(/\s+/)[0];

// ---------- dados (Supabase) ----------
// Tudo fica em memória em `db` (camelCase); cada alteração é gravada no banco (snake_case).
// Mudanças feitas por outros aparelhos chegam pelo canal em tempo real e recarregam a tela.
const TABELAS = ['barbeiros', 'servicos', 'clientes', 'agendamentos'];   // ordem respeita as chaves estrangeiras
const cfg = window.CRM_CONFIG || {};
const configurado = window.supabase && cfg.supabaseUrl && !cfg.supabaseUrl.includes('SEU-PROJETO');
const sb = configurado ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

let db = { clientes: [], agendamentos: [], barbeiros: [], servicos: [] };
const valido = d => d && TABELAS.every(k => Array.isArray(d[k]));

const paraLinha = obj => Object.fromEntries(Object.entries(obj)
  .map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v === '' ? null : v]));
const deLinha = row => Object.fromEntries(Object.entries(row)
  .map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

async function buscarTudo(tabela) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {   // o Supabase devolve no máximo 1000 linhas por consulta
    const { data, error } = await sb.from(tabela).select('*').order('id').range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

async function carregar() {
  const res = await Promise.all(TABELAS.map(buscarTudo));
  TABELAS.forEach((t, i) => db[t] = res[i].map(deLinha));
}

async function gravar(tabela, objs) {
  const { error } = await sb.from(tabela).upsert([].concat(objs).map(paraLinha));
  if (error) falhou(error);
}
async function apagar(tabela, id) {
  const { error } = await sb.from(tabela).delete().eq('id', id);
  if (error) falhou(error);
}
function falhou(err) {
  console.error(err);
  alert(`Não foi possível salvar no servidor (${err.message}). Verifique a internet; os dados serão recarregados.`);
  recarregar();
}

async function recarregar() {
  try { await carregar(); } catch (e) { console.error(e); return; }
  // não redesenha Configurações enquanto alguém digita lá (o campo perderia o foco)
  if (view === 'config' && $('#config').contains(document.activeElement)) return;
  render();
}

async function semear() {
  await gravar('barbeiros', { id: uid(), nome: 'Barbeiro 1' });
  await gravar('servicos', [
    { id: uid(), nome: 'Corte', preco: 40, duracao: 30 },
    { id: uid(), nome: 'Barba', preco: 30, duracao: 30 },
    { id: uid(), nome: 'Corte + Barba', preco: 60, duracao: 60 },
    { id: uid(), nome: 'Sobrancelha', preco: 15, duracao: 15 },
  ]);
  await carregar();
}

const byId = (lista, id) => db[lista].find(x => x.id === id);
const nomeCliente = id => byId('clientes', id)?.nome || 'Cliente removido';

function statsCliente(id) {
  const feitos = db.agendamentos.filter(a => a.clienteId === id && a.status === 'concluido').sort(porHora);
  return { visitas: feitos.length, total: soma(feitos), ultima: feitos.at(-1)?.data || null };
}
const temHorarioMarcado = id => db.agendamentos.some(a => a.clienteId === id && a.status === 'agendado' && a.data >= hoje());

// ---------- navegação ----------
let view = 'painel';
function go(v) {
  view = v;
  $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $$('main > section').forEach(s => s.hidden = s.id !== v);
  render();
}
function render() {
  ({ painel: renderPainel, agenda: renderAgenda, clientes: renderClientes, config: renderConfig })[view]();
}
$$('nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

// ---------- painel ----------
const card = (rotulo, valor, sub = '') =>
  `<div class="card"><span>${rotulo}</span><b>${valor}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const vazio = txt => `<li class="vazio">${txt}</li>`;

function itemAg(a) {
  const s = byId('servicos', a.servicoId), b = byId('barbeiros', a.barbeiroId);
  const acoes = a.status === 'agendado'
    ? `<button class="btn sm" data-act="status" data-st="concluido" data-id="${a.id}">✔ Concluir</button>
       <button class="btn ghost sm" data-act="status" data-st="faltou" data-id="${a.id}">Faltou</button>`
    : `<button class="btn ghost sm" data-act="status" data-st="agendado" data-id="${a.id}" title="Voltar para agendado">↺</button>`;
  return `<li class="st-${a.status}">
    <div class="ag-hora">${a.hora}</div>
    <div class="info">
      <b>${esc(nomeCliente(a.clienteId))}</b>
      <span>${esc(s?.nome || '—')} · ${esc(b?.nome || '—')} · ${brl(a.valor)}</span>
      ${a.obs ? `<em>${esc(a.obs)}</em>` : ''}
    </div>
    <span class="badge">${STATUS[a.status]}</span>
    <div class="acoes-li">${acoes}
      <button class="btn ghost sm" data-act="editar-ag" data-id="${a.id}" title="Editar">✎</button>
    </div>
  </li>`;
}

function renderPainel() {
  const h = hoje(), mes = h.slice(0, 7), mesNum = h.slice(5, 7);
  const doDia = db.agendamentos.filter(a => a.data === h && a.status !== 'cancelado').sort(porHora);
  const concluidosMes = db.agendamentos.filter(a => a.status === 'concluido' && a.data.startsWith(mes));
  const fat = soma(concluidosMes);
  const novos = db.clientes.filter(c => (c.criadoEm || '').startsWith(mes)).length;

  $('#pn-cards').innerHTML =
    card('Agendamentos hoje', doDia.length, plural(doDia.filter(a => a.status === 'concluido').length, 'concluído')) +
    card('Faturamento do mês', brl(fat), plural(concluidosMes.length, 'atendimento')) +
    card('Ticket médio', brl(concluidosMes.length ? fat / concluidosMes.length : 0), 'por atendimento no mês') +
    card('Clientes', db.clientes.length, `${plural(novos, 'novo')} no mês`);

  $('#pn-hoje').innerHTML = doDia.map(itemAg).join('') || vazio('Nenhum horário marcado para hoje.');

  const aniver = db.clientes.filter(c => c.nascimento?.slice(5, 7) === mesNum)
    .sort((a, b) => a.nascimento.slice(8).localeCompare(b.nascimento.slice(8)));
  $('#pn-aniver').innerHTML = aniver.map(c => {
    const ehHoje = c.nascimento.slice(5) === h.slice(5);
    const msg = `Feliz aniversário, ${primeiroNome(c.nome)}! 🎉 Que tal comemorar com um corte novo? É só responder aqui que a gente agenda seu horário. ✂`;
    return `<li><div class="info"><b>${ehHoje ? '🎂 ' : ''}${esc(c.nome)}</b>
      <span>${fmtData(c.nascimento).slice(0, 5)}${ehHoje ? ' · é hoje!' : ''}</span></div>${linkWhats(c.telefone, msg)}</li>`;
  }).join('') || vazio('Ninguém faz aniversário este mês.');

  const sumidos = db.clientes
    .map(c => ({ c, s: statsCliente(c.id) }))
    .filter(({ c, s }) => s.ultima && diasDesde(s.ultima) > RETORNO_DIAS && !temHorarioMarcado(c.id))
    .sort((a, b) => a.s.ultima.localeCompare(b.s.ultima));
  $('#pn-sumidos').innerHTML = sumidos.map(({ c, s }) => {
    const msg = `Olá, ${primeiroNome(c.nome)}! Faz um tempinho que você não passa aqui na barbearia. Bora agendar seu próximo corte? ✂`;
    return `<li><div class="info"><b>${esc(c.nome)}</b>
      <span>Última visita em ${fmtData(s.ultima)} · há ${diasDesde(s.ultima)} dias</span></div>
      ${linkWhats(c.telefone, msg)}
      <button class="btn ghost sm" data-act="agendar-cli" data-id="${c.id}">Agendar</button></li>`;
  }).join('') || vazio('Todos os clientes estão em dia. 👌');
}

// ---------- agenda ----------
let agendaData = hoje(), agendaBarbeiro = '';

function renderAgenda() {
  $('#ag-data').value = agendaData;
  if (agendaBarbeiro && !byId('barbeiros', agendaBarbeiro)) agendaBarbeiro = '';
  $('#ag-barbeiro').innerHTML = '<option value="">Todos os barbeiros</option>' +
    db.barbeiros.map(b => `<option value="${b.id}">${esc(b.nome)}</option>`).join('');
  $('#ag-barbeiro').value = agendaBarbeiro;

  const lista = db.agendamentos
    .filter(a => a.data === agendaData && (!agendaBarbeiro || a.barbeiroId === agendaBarbeiro)).sort(porHora);
  const ativos = lista.filter(a => a.status === 'agendado' || a.status === 'concluido');
  const [y, m, d] = agendaData.split('-').map(Number);
  const dia = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#ag-resumo').innerHTML = `<b>${dia}</b> · ${plural(ativos.length, 'atendimento')} · ` +
    `previsto <b>${brl(soma(ativos))}</b> · realizado <b>${brl(soma(lista.filter(a => a.status === 'concluido')))}</b>`;
  $('#ag-lista').innerHTML = lista.map(itemAg).join('') || vazio('Nenhum agendamento neste dia.');
}
$('#ag-data').addEventListener('change', e => { agendaData = e.target.value || hoje(); renderAgenda(); });
$('#ag-barbeiro').addEventListener('change', e => { agendaBarbeiro = e.target.value; renderAgenda(); });

// ---------- formulário de agendamento ----------
const formAg = $('#form-ag');
let agEditando = null;

function preencherSelects() {
  const opts = (lista, rotulo) => lista.map(x => `<option value="${x.id}">${esc(rotulo(x))}</option>`).join('');
  const el = formAg.elements, antes = { c: el.clienteId.value, s: el.servicoId.value, b: el.barbeiroId.value };
  const clientes = [...db.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  el.clienteId.innerHTML = '<option value="">Selecione o cliente…</option>' + opts(clientes, c => c.nome);
  el.servicoId.innerHTML = opts(db.servicos, s => `${s.nome} — ${brl(s.preco)}`);
  el.barbeiroId.innerHTML = opts(db.barbeiros, b => b.nome);
  el.clienteId.value = antes.c; el.servicoId.value = antes.s || db.servicos[0]?.id; el.barbeiroId.value = antes.b || db.barbeiros[0]?.id;
}

function proximaHora() {
  const d = new Date();
  const m = Math.min(Math.ceil((d.getHours() * 60 + d.getMinutes()) / 30) * 30, 23 * 60 + 30);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function abrirAg(id = null, preset = {}) {
  if (!db.servicos.length || !db.barbeiros.length) {
    alert('Cadastre pelo menos um serviço e um barbeiro em Configurações.');
    return go('config');
  }
  agEditando = id;
  const a = id && byId('agendamentos', id);
  formAg.reset();
  preencherSelects();
  const s0 = db.servicos[0];
  const v = a || {
    clienteId: '', servicoId: s0.id, barbeiroId: agendaBarbeiro || db.barbeiros[0].id,
    data: view === 'agenda' ? agendaData : hoje(), hora: proximaHora(), valor: s0.preco, status: 'agendado', obs: '',
    ...preset,
  };
  for (const k of ['clienteId', 'servicoId', 'barbeiroId', 'data', 'hora', 'valor', 'status', 'obs']) formAg.elements[k].value = v[k] ?? '';
  $('#ag-titulo').textContent = a ? 'Editar agendamento' : 'Novo agendamento';
  $('#ag-excluir').hidden = $('#ag-status-wrap').hidden = !a;
  $('#dlg-ag').showModal();
}

formAg.elements.servicoId.addEventListener('change', e => {
  const s = byId('servicos', e.target.value);
  if (s) formAg.elements.valor.value = s.preco;
});

function acharConflito(n, ignorarId) {
  if (n.status !== 'agendado' && n.status !== 'concluido') return null;
  const dur = a => byId('servicos', a.servicoId)?.duracao || 30;
  const ini = minutos(n.hora), fim = ini + dur(n);
  return db.agendamentos.find(a => {
    if (a.id === ignorarId || a.barbeiroId !== n.barbeiroId || a.data !== n.data) return false;
    if (a.status !== 'agendado' && a.status !== 'concluido') return false;
    const i = minutos(a.hora);
    return ini < i + dur(a) && i < fim;
  });
}

formAg.addEventListener('submit', e => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(formAg));
  dados.valor = +dados.valor || 0;
  if (!agEditando) dados.status = 'agendado';
  const c = acharConflito(dados, agEditando);
  if (c && !confirm(`${byId('barbeiros', dados.barbeiroId).nome} já tem ${nomeCliente(c.clienteId)} às ${c.hora} nesse dia. Salvar mesmo assim?`)) return;
  let a = agEditando && byId('agendamentos', agEditando);
  if (a) Object.assign(a, dados);
  else db.agendamentos.push(a = { id: uid(), criadoEm: new Date().toISOString(), ...dados });
  $('#dlg-ag').close();
  render();
  gravar('agendamentos', a);
});

function setStatus(id, st) {
  const a = byId('agendamentos', id);
  if (!a) return;
  a.status = st;
  render();
  gravar('agendamentos', a);
}

function excluirAg() {
  if (!confirm('Excluir este agendamento?')) return;
  const id = agEditando;
  db.agendamentos = db.agendamentos.filter(a => a.id !== id);
  $('#dlg-ag').close(); render();
  apagar('agendamentos', id);
}

// ---------- clientes ----------
const formCli = $('#form-cli');
let cliEditando = null, aposSalvarCli = null;

function renderClientes() {
  const q = $('#cli-busca').value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  const lista = db.clientes
    .filter(c => !q || c.nome.toLowerCase().includes(q) || (qd && String(c.telefone || '').replace(/\D/g, '').includes(qd)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#cli-tabela').innerHTML = lista.map(c => {
    const s = statsCliente(c.id);
    return `<tr data-act="ver-cli" data-id="${c.id}">
      <td><b>${esc(c.nome)}</b></td>
      <td>${esc(c.telefone) || '—'} ${linkWhats(c.telefone)}</td>
      <td>${fmtData(s.ultima)}</td><td>${s.visitas}</td><td>${brl(s.total)}</td></tr>`;
  }).join('') || `<tr><td colspan="5" class="vazio">${db.clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda. Clique em “+ Cliente”.'}</td></tr>`;
}
$('#cli-busca').addEventListener('input', renderClientes);

function extraCliente(c) {
  const s = statsCliente(c.id);
  const hist = db.agendamentos.filter(a => a.clienteId === c.id).sort(porHora).reverse();
  return `<div class="stats">
      <div><b>${s.visitas}</b>visitas</div>
      <div><b>${brl(s.total)}</b>total gasto</div>
      <div><b>${brl(s.visitas ? s.total / s.visitas : 0)}</b>ticket médio</div>
      <div><b>${fmtData(s.ultima)}</b>última visita</div>
      ${whats(c.telefone) ? `<div><b>&nbsp;</b>${linkWhats(c.telefone)}</div>` : ''}
    </div>
    <h2>Histórico</h2>
    <ul class="lista hist">${hist.map(a => `<li class="st-${a.status}"><div class="info">
        <b>${fmtData(a.data)} às ${a.hora}</b>
        <span>${esc(byId('servicos', a.servicoId)?.nome || '—')} · ${esc(byId('barbeiros', a.barbeiroId)?.nome || '—')} · ${brl(a.valor)}</span>
      </div><span class="badge">${STATUS[a.status]}</span></li>`).join('') || vazio('Nenhum atendimento ainda.')}</ul>`;
}

function abrirCli(id = null, callback = null) {
  cliEditando = id; aposSalvarCli = callback;
  const c = id ? byId('clientes', id) : {};
  for (const k of ['nome', 'telefone', 'nascimento', 'obs']) formCli.elements[k].value = c[k] || '';
  $('#cli-titulo').textContent = id ? c.nome : 'Novo cliente';
  $('#cli-extra').innerHTML = id ? extraCliente(c) : '';
  $('#cli-excluir').hidden = $('#cli-agendar').hidden = !id;
  $('#cli-agendar').dataset.id = id || '';
  $('#dlg-cli').showModal();
  formCli.elements.nome.focus();
}

formCli.addEventListener('submit', async e => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(formCli));
  dados.nome = dados.nome.trim();
  if (!dados.nome) return;
  let c = cliEditando && byId('clientes', cliEditando);
  if (c) Object.assign(c, dados);
  else db.clientes.push(c = { id: uid(), criadoEm: new Date().toISOString(), ...dados });
  const callback = aposSalvarCli;
  $('#dlg-cli').close();
  render();
  await gravar('clientes', c);   // espera gravar: um agendamento novo depende do cliente já existir no banco
  if (callback) callback(c.id);
});

function excluirCli() {
  const c = byId('clientes', cliEditando);
  if (!c || !confirm(`Excluir ${c.nome}? Os atendimentos já feitos continuam contando no faturamento.`)) return;
  db.clientes = db.clientes.filter(x => x.id !== c.id);
  $('#dlg-cli').close(); render();
  apagar('clientes', c.id);
}

// ---------- configurações ----------
function renderConfig() {
  const del = (lista, id) => `<button class="btn ghost sm" data-act="del" data-list="${lista}" data-id="${id}" title="Remover">✕</button>`;
  const inp = (lista, x, campo, extra = '') =>
    `<input data-list="${lista}" data-id="${x.id}" data-campo="${campo}" value="${esc(x[campo])}" ${extra}>`;
  $('#cfg-servicos').innerHTML = db.servicos.map(s => `<tr>
    <td>${inp('servicos', s, 'nome')}</td>
    <td>${inp('servicos', s, 'preco', 'type="number" min="0" step="0.01"')}</td>
    <td>${inp('servicos', s, 'duracao', 'type="number" min="5" step="5"')}</td>
    <td>${del('servicos', s.id)}</td></tr>`).join('');
  $('#cfg-barbeiros').innerHTML = db.barbeiros.map(b => `<tr>
    <td>${inp('barbeiros', b, 'nome')}</td><td>${del('barbeiros', b.id)}</td></tr>`).join('');
}

$('#config').addEventListener('change', e => {
  const i = e.target, item = i.dataset.list && byId(i.dataset.list, i.dataset.id);
  if (!item) return;
  const valor = i.type === 'number' ? (+i.value || 0) : i.value.trim();
  if (i.dataset.campo === 'nome' && !valor) { i.value = item.nome; return; }   // nome não pode ficar vazio
  item[i.dataset.campo] = valor;
  gravar(i.dataset.list, item);
});

function adicionar(lista) {
  const novo = lista === 'servicos'
    ? { id: uid(), nome: 'Novo serviço', preco: 0, duracao: 30 }
    : { id: uid(), nome: `Barbeiro ${db.barbeiros.length + 1}` };
  db[lista].push(novo);
  renderConfig();
  $$(`#cfg-${lista} input[data-campo="nome"]`).at(-1).select();
  gravar(lista, novo);
}

function remover(lista, id) {
  const x = byId(lista, id);
  if (!x || !confirm(`Remover “${x.nome}”? Os agendamentos antigos continuam salvos.`)) return;
  db[lista] = db[lista].filter(y => y.id !== id);
  renderConfig();
  apagar(lista, id);
}

function exportar() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `crm-barbearia-backup-${hoje()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#cfg-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dados = JSON.parse(await file.text());
    if (!valido(dados)) throw new Error();
    if (!confirm(`Importar backup com ${plural(dados.clientes.length, 'cliente')} e ${plural(dados.agendamentos.length, 'agendamento')}? Registros com o mesmo código serão atualizados; nada é apagado.`)) return;
    for (const t of TABELAS)
      for (let i = 0; i < dados[t].length; i += 500) {
        const { error } = await sb.from(t).upsert(dados[t].slice(i, i + 500).map(paraLinha));
        if (error) throw error;
      }
    await carregar(); render();
    alert('Backup importado.');
  } catch (err) {
    console.error(err);
    alert(err?.message ? `Erro ao importar: ${err.message}` : 'Arquivo inválido. Use um backup exportado por este sistema.');
    recarregar();
  }
});

// ---------- ações (cliques) ----------
document.addEventListener('click', e => {
  if (e.target.closest('a')) return;   // links (WhatsApp) seguem normalmente
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  ({
    'novo-ag': () => abrirAg(),
    'editar-ag': () => abrirAg(id),
    'status': () => setStatus(id, el.dataset.st),
    'excluir-ag': excluirAg,
    'dia': () => { const d = +el.dataset.d; agendaData = d ? somaDias(agendaData, d) : hoje(); renderAgenda(); },
    'novo-cli': () => abrirCli(),
    'ver-cli': () => abrirCli(id),
    'novo-cli-rapido': () => abrirCli(null, novo => { preencherSelects(); formAg.elements.clienteId.value = novo; }),
    'agendar-cli': () => { $('#dlg-cli').close(); abrirAg(null, { clienteId: id }); },
    'excluir-cli': excluirCli,
    'fechar': () => el.closest('dialog').close(),
    'add': () => adicionar(el.dataset.list),
    'del': () => remover(el.dataset.list, id),
    'exportar': exportar,
    'importar': () => $('#cfg-import').click(),
    'sair': () => sb.auth.signOut(),
  })[el.dataset.act]?.();
});

// ---------- login e início ----------
function tela(qual, aviso = '') {
  $('#tela-login').hidden = qual !== 'login';
  $('#tela-aviso').hidden = qual !== 'aviso';
  $('header').hidden = $('main').hidden = qual !== 'app';
  if (aviso) $('#aviso-texto').innerHTML = aviso;
}

let ouvindo = false;
async function entrar(user) {
  tela('aviso', 'Carregando…');
  $('#aviso-sair').hidden = true;
  const { data: liberado, error } = await sb.rpc('eh_equipe');
  if (error || !liberado) {
    $('#aviso-sair').hidden = false;
    return tela('aviso', error
      ? `Não foi possível conectar ao banco (${esc(error.message)}). Confira se o arquivo <b>supabase.sql</b> foi executado.`
      : `O usuário <b>${esc(user.email)}</b> ainda não foi liberado. Peça ao dono para adicionar este e-mail na tabela <b>equipe</b> do Supabase.`);
  }
  try {
    await carregar();
    if (!db.servicos.length && !db.barbeiros.length) await semear();
  } catch (e) {
    $('#aviso-sair').hidden = false;
    return tela('aviso', `Erro ao carregar os dados: ${esc(e.message)}`);
  }
  $('#usuario').textContent = user.email;
  tela('app');
  go(view);
  if (!ouvindo) {
    ouvindo = true;
    let t;
    sb.channel('crm')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => { clearTimeout(t); t = setTimeout(recarregar, 400); })
      .subscribe();
  }
}

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, botao = f.querySelector('button'), erro = $('#login-erro'), ok = $('#login-ok');
  erro.hidden = ok.hidden = true;
  botao.disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email: f.email.value.trim(),
    // só quem já foi convidado recebe o link: ninguém cria conta sozinho por aqui
    options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
  });
  botao.disabled = false;
  if (error) {
    erro.textContent = /signups not allowed|not found/i.test(error.message)
      // o Supabase dá o mesmo erro para e-mail desconhecido e para convite ainda não aceito
      ? 'Não foi possível enviar o link. Se você recebeu um convite por e-mail, clique primeiro em “Accept the invite” nele. Se não recebeu, peça ao dono da barbearia para liberar seu acesso.'
      : /rate limit|security purposes/i.test(error.message)
        ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
        : error.message;
    erro.hidden = false;
    return;
  }
  ok.textContent = `Pronto! Abra o e-mail enviado para ${f.email.value.trim()} e clique no link para entrar.`;
  ok.hidden = false;
});

(async () => {
  if (!sb) return tela('aviso', 'Sistema ainda não configurado: preencha o arquivo <b>config.js</b> com os dados do seu projeto Supabase (veja o README).');
  let dentro = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_OUT') { dentro = false; db = { clientes: [], agendamentos: [], barbeiros: [], servicos: [] }; tela('login'); }
    // login feito pelo link em outra aba ou logo após o redirecionamento
    if (ev === 'SIGNED_IN' && session && !dentro) { dentro = true; setTimeout(() => entrar(session.user)); }
  });
  const { data: { session } } = await sb.auth.getSession();
  if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
  if (session && !dentro) { dentro = true; entrar(session.user); }
  else if (!session) tela('login');
})();
