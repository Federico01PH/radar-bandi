const ENTI = {
  storiedipiazza: 'Storie di Piazza APS',
  marcofalco: 'Fondazione Marco Falco',
  videoastolfo: 'VideoAstolfoSullaLuna Srl',
};

const LIVELLI = {
  europeo: 'Europeo', statale: 'Statale', mic: 'Ministero della Cultura',
  regionale: 'Regionale', provinciale: 'Provinciale', comunale: 'Comunale',
  fondazione: 'Fondazioni', terzosettore: 'Terzo settore',
};

const AMMISSIBILITA = {
  verde: 'Possiamo presentare', giallo: 'Serve un requisito',
  rosso: 'Fuori portata', ignota: 'Da verificare',
};

const CHIAVE_ULTIMA_VISITA = 'radar-ultima-visita';
const CHIAVE_SALVATI = 'radar-salvati';

// Oltre questo ritardo il controllo automatico si e' probabilmente fermato.
const ORE_CONTROLLO_VECCHIO = 36;

let bandi = [];
let salute = {};
let meta = { ultimoControllo: null, soglia: 10, fonti: [] };
const filtri = { tipo: 'bando', livello: null, ammissibilita: null, stato: null, cerca: '' };

// In testa cio' che conta di piu', non l'ultimo decreto pubblicato.
let ordine = 'pertinenza';
const ORDINAMENTI = {
  pertinenza: (a, b) => b.pertinenza - a.pertinenza || b.dataPubblicazione.localeCompare(a.dataPubblicazione),
  data: (a, b) => b.dataPubblicazione.localeCompare(a.dataPubblicazione),
};

function leggiArchivio(chiave, riserva) {
  try { return JSON.parse(localStorage.getItem(chiave) ?? 'null') ?? riserva; } catch { return riserva; }
}

function scriviArchivio(chiave, valore) {
  try { localStorage.setItem(chiave, JSON.stringify(valore)); } catch { /* modalita' privata */ }
}

// Letta una volta sola all'apertura: e' il confine fra "gia' visto" e "nuovo"
// per tutta la sessione, anche dopo che la visita corrente viene registrata.
const visitaPrecedente = leggiArchivio(CHIAVE_ULTIMA_VISITA, null);
const salvati = new Set(leggiArchivio(CHIAVE_SALVATI, []));

function eNuovo(bando) {
  return visitaPrecedente !== null && bando.vistoIl > visitaPrecedente;
}

function esc(testo) {
  return String(testo ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// L'indirizzo arriva da un feed di terzi: solo http e https diventano link.
function hrefSicuro(url) {
  return /^https?:\/\//i.test(String(url ?? '').trim()) ? url : '#';
}

function giorniAllaScadenza(iso) {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
}

function schedaHtml(b) {
  const etichette = (eNuovo(b) ? '<span class="etichetta nuovo">nuovo</span>' : '')
    + (b.tipo === 'notizia' ? '<span class="etichetta notizia">notizia</span>' : '');
  const ente = ENTI[b.entePropostoId] ?? null;
  const data = new Date(b.dataPubblicazione).toLocaleDateString('it-IT');
  const giorni = giorniAllaScadenza(b.scadenza);
  const messaggio = encodeURIComponent(`${b.titolo}\n${b.ente}\n${b.url}`);
  const salvato = salvati.has(b.id);

  return `
    <article class="scheda ${esc(b.ammissibilita)} ${b.tipo === 'notizia' ? 'notizia' : ''}">
      <h3>${esc(b.titolo)}${etichette}</h3>
      <p class="meta">
        ${esc(b.ente)} · ${esc(LIVELLI[b.livello] ?? b.livello)}
        · pubblicato il ${data}${b.dataIncerta ? ' (data non dichiarata dalla fonte)' : ''}
        · pertinenza ${b.pertinenza}/100${giorni !== null ? ` · scade fra ${giorni} giorni` : ''}
      </p>
      ${b.descrizioneBreve ? `<p class="descrizione">${esc(b.descrizioneBreve)}</p>` : ''}
      ${b.tipo === 'bando' ? `<p class="presenta ${esc(b.ammissibilita)}">
        ${ente ? `Presenta: ${esc(ente)}` : esc(AMMISSIBILITA[b.ammissibilita])}
      </p>` : ''}
      ${b.motivoAmmissibilita
        ? `<p class="citazione">Dal bando: «${esc(b.motivoAmmissibilita)}»</p>` : ''}
      <div class="azioni">
        <a href="${esc(hrefSicuro(b.url))}" target="_blank" rel="noopener">Apri l'originale</a>
        <button type="button" data-salva="${esc(b.id)}" aria-pressed="${salvato}">${salvato ? 'Salvato' : 'Salva'}</button>
        <a href="https://wa.me/?text=${messaggio}" target="_blank" rel="noopener">Inoltra su WhatsApp</a>
      </div>
    </article>`;
}

function filtra() {
  const q = filtri.cerca.trim().toLowerCase();
  return bandi.filter((b) => {
    if (filtri.tipo && b.tipo !== filtri.tipo) return false;
    if (filtri.livello && b.livello !== filtri.livello) return false;
    if (filtri.ammissibilita && b.ammissibilita !== filtri.ammissibilita) return false;
    if (filtri.stato === 'nuovi' && !eNuovo(b)) return false;
    if (filtri.stato === 'salvati' && !salvati.has(b.id)) return false;
    if (q && !`${b.titolo} ${b.ente}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort(ORDINAMENTI[ordine]);
}

function creaOrdinamento() {
  const contenitore = document.getElementById('ordine');
  const voci = [['pertinenza', 'Più pertinenti'], ['data', 'Più recenti']];
  const aggiorna = () => {
    contenitore.innerHTML = voci
      .map(([valore, etichetta]) =>
        `<button type="button" data-ordine="${valore}" aria-pressed="${ordine === valore}">${etichetta}</button>`)
      .join('');
  };
  aggiorna();
  contenitore.addEventListener('click', (evento) => {
    const bottone = evento.target.closest('button');
    if (!bottone) return;
    ordine = bottone.dataset.ordine;
    aggiorna();
    disegna();
  });
}

function disegna() {
  const visibili = filtra();
  document.getElementById('conteggio').textContent =
    `${visibili.length} su ${bandi.length} in archivio`;
  document.getElementById('elenco').innerHTML = visibili.length === 0
    ? '<p class="vuoto">Nessun elemento corrisponde ai filtri.</p>'
    : visibili.map(schedaHtml).join('');
}

function creaFiltri(idContenitore, voci, campo) {
  const contenitore = document.getElementById(idContenitore);
  contenitore.innerHTML = voci
    .map(([valore, etichetta]) =>
      `<button type="button" data-valore="${esc(valore)}" aria-pressed="${filtri[campo] === valore}">${esc(etichetta)}</button>`)
    .join('');
  contenitore.addEventListener('click', (evento) => {
    const bottone = evento.target.closest('button');
    if (!bottone) return;
    const valore = bottone.dataset.valore;
    filtri[campo] = filtri[campo] === valore ? null : valore;
    for (const b of contenitore.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.valore === filtri[campo]));
    }
    disegna();
  });
}

function mostraAggiornamento() {
  const riga = document.getElementById('aggiornamento');
  if (!meta.ultimoControllo) {
    riga.textContent = 'Nessun controllo automatico ancora eseguito.';
    return;
  }
  const quando = new Date(meta.ultimoControllo);
  const ore = (Date.now() - quando.getTime()) / 3600000;
  riga.textContent = `Ultimo controllo: ${quando.toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })}`;
  // Il sito deve dire quando il sistema si e' fermato, non solo quando funziona.
  if (ore > ORE_CONTROLLO_VECCHIO) {
    riga.textContent += ` — attenzione: nessun controllo da ${Math.floor(ore / 24)} giorni, l'automazione potrebbe essersi fermata`;
    riga.classList.add('vecchio');
  }
}

function coloreFonte(esiti) {
  if (!esiti || esiti.length === 0) return 'var(--ignota)';
  const ultimi = esiti.slice(-3);
  if (ultimi.length >= 3 && ultimi.every((e) => !e.ok || e.risultati === 0)) return 'var(--rosso)';
  return esiti[esiti.length - 1].ok ? 'var(--verde)' : 'var(--giallo)';
}

function disegnaSalute() {
  const fonti = meta.fonti.length > 0
    ? meta.fonti
    : Object.keys(salute).map((id) => ({ id, nome: id }));
  document.getElementById('salute').innerHTML = fonti.length === 0
    ? '<p class="nota">Nessun dato ancora.</p>'
    : fonti.map(({ id, nome }) => {
      const esiti = salute[id] ?? [];
      const ultimo = esiti[esiti.length - 1];
      const dettaglio = ultimo
        ? (ultimo.ok ? `${ultimo.risultati} risultati` : `errore: ${ultimo.errore}`)
        : 'mai controllata';
      return `<p class="fonte"><span class="pallino" style="background:${coloreFonte(esiti)}"></span>
        <span>${esc(nome)} — ${esc(dettaglio)}</span></p>`;
    }).join('');
}

function mostraPopup() {
  if (visitaPrecedente === null) return;
  const nuovi = bandi
    .filter((b) => eNuovo(b) && b.tipo === 'bando' && b.pertinenza >= meta.soglia && b.ammissibilita !== 'rosso')
    .sort((a, b) => b.pertinenza - a.pertinenza);
  if (nuovi.length === 0) return;

  document.getElementById('popup-titolo').textContent = nuovi.length === 1
    ? '1 nuovo bando dall\'ultima visita'
    : `${nuovi.length} nuovi bandi dall'ultima visita`;
  document.getElementById('popup-elenco').innerHTML = nuovi.slice(0, 8)
    .map((b) => `<p><strong>${esc(b.titolo)}</strong><br>
      <span class="meta">${esc(b.ente)}${ENTI[b.entePropostoId] ? ` · presenta ${esc(ENTI[b.entePropostoId])}` : ''}</span></p>`)
    .join('');
  document.getElementById('popup').showModal();
}

async function caricaJson(percorso, riserva) {
  try {
    const risposta = await fetch(percorso, { cache: 'no-store' });
    return risposta.ok ? await risposta.json() : riserva;
  } catch {
    return riserva;
  }
}

async function avvia() {
  [bandi, salute, meta] = await Promise.all([
    caricaJson('bandi.json', []),
    caricaJson('salute.json', {}),
    caricaJson('meta.json', meta),
  ]);

  mostraAggiornamento();
  creaOrdinamento();
  creaFiltri('filtro-tipo', [['bando', 'Solo bandi'], ['notizia', 'Solo notizie']], 'tipo');
  creaFiltri('filtro-livello', Object.entries(LIVELLI), 'livello');
  creaFiltri('filtro-ammissibilita', Object.entries(AMMISSIBILITA), 'ammissibilita');
  creaFiltri('filtro-stato', [['nuovi', 'Nuovi dall\'ultima visita'], ['salvati', 'Salvati']], 'stato');

  document.getElementById('cerca').addEventListener('input', (e) => {
    filtri.cerca = e.target.value;
    disegna();
  });
  document.getElementById('elenco').addEventListener('click', (evento) => {
    const bottone = evento.target.closest('[data-salva]');
    if (!bottone) return;
    const id = bottone.dataset.salva;
    if (salvati.has(id)) salvati.delete(id); else salvati.add(id);
    scriviArchivio(CHIAVE_SALVATI, [...salvati]);
    disegna();
  });
  document.getElementById('popup-chiudi').addEventListener('click', () => {
    document.getElementById('popup').close();
  });

  disegna();
  disegnaSalute();
  mostraPopup();
  scriviArchivio(CHIAVE_ULTIMA_VISITA, new Date().toISOString());
}

avvia();
