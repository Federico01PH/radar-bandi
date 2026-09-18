# Radar Bandi — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire una piattaforma che ogni mattina controlla in automatico sette fonti di bandi, tiene solo quelli pubblicati negli ultimi 7 giorni, li valuta per pertinenza e ammissibilità rispetto agli enti della produzione "Se finissero le parole", li pubblica su un sito con filtri e ne manda notifica via email.

**Architecture:** Raccolta in TypeScript eseguita da GitHub Actions su cron. Ogni fonte è un adattatore isolato con interfaccia unica. I risultati passano per una pipeline che normalizza, deduplica e filtra per data, poi per uno scoring che assegna pertinenza e ammissibilità. L'esito è un file JSON versionato in Git che un sito statico legge direttamente. Nessun database, nessun server.

**Tech Stack:** Node 24, TypeScript ESM, vitest, rss-parser, nodemailer. Frontend in HTML e JavaScript puri, senza framework né build.

**Spec di riferimento:** `docs/superpowers/specs/2026-09-18-piattaforma-bandi-design.md`

---

## Struttura dei file

```
package.json                     dipendenze e script
tsconfig.json                    configurazione TypeScript ESM
vitest.config.ts                 configurazione test

src/
  tipi.ts                        tipi condivisi da tutto il progetto
  config.ts                      profilo produzione, enti, soglie, parole chiave
  pipeline/
    impronta.ts                  id stabile di un bando
    finestra.ts                  filtro sulla data di pubblicazione
    archivio.ts                  fusione con l'archivio senza perdere lo stato
  scoring/
    pertinenza.ts                punteggio 0-100 su due corsie
    ammissibilita.ts             quale ente puo' firmare la domanda
  sources/
    tipi.ts                      interfaccia Adattatore
    rss.ts                       fabbrica di adattatori RSS
    wordpress.ts                 fabbrica di adattatori WordPress REST
    registro.ts                  elenco delle fonti attive
  health/
    salute.ts                    stato per fonte e regola dei 3 giorni
  notify/
    formatta.ts                  testo e HTML di un bando
    email.ts                     invio SMTP
  raccolta.ts                    orchestratore, punto di ingresso

web/
  index.html                     pagina unica
  app.js                         filtri, schede, popup, salvataggi
  stile.css                      grafica

data/
  bandi.json                     archivio versionato in Git
  salute.json                    stato delle fonti

test/
  fixtures/                      copie reali di feed e risposte API

.github/workflows/raccolta.yml   cron giornaliero
```

**Confini:** un adattatore non conosce punteggi, notifiche o interfaccia — restituisce solo risultati grezzi. La pipeline non conosce le fonti. Lo scoring non conosce l'archivio. Il frontend non conosce nulla della raccolta: legge un JSON.

**Fuori da questo piano**, in un piano successivo: gli adattatori HTML (Fondazione CRB Biella, FCTP, Comune di Biella, Fondazione Con i Bambini, MIM, Europa Creativa), le notifiche push con PWA e Cloudflare Worker, i promemoria scadenza. Al termine di questo piano la piattaforma è già in funzione con sette fonti, sito ed email.

---

## Task 1: Impalcatura del progetto

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Creare `package.json`**

```json
{
  "name": "radar-bandi",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "raccolta": "node --experimental-strip-types src/raccolta.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "rss-parser": "^3.13.0",
    "nodemailer": "^6.9.14"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@types/nodemailer": "^6.4.15",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Creare `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Creare `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Creare `.gitignore`**

```
node_modules/
.env
*.log
.DS_Store
```

- [ ] **Step 5: Installare e verificare**

Run: `npm install && npx tsc --noEmit`
Expected: installazione completata, `tsc` esce senza errori (nessun file sorgente ancora, quindi nessun output).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "Impalcatura del progetto: TypeScript ESM, vitest, dipendenze"
```

---

## Task 2: Tipi condivisi

**Files:**
- Create: `src/tipi.ts`

Nessun test: è un file di soli tipi, verificato dal typecheck e dai task che lo usano.

- [ ] **Step 1: Creare `src/tipi.ts`**

```ts
export type Livello =
  | 'europeo'
  | 'statale'
  | 'mic'
  | 'regionale'
  | 'provinciale'
  | 'comunale'
  | 'fondazione'
  | 'terzosettore';

export type Corsia = 'audiovisiva' | 'giovani';

export type Ammissibilita = 'verde' | 'giallo' | 'rosso' | 'ignota';

/** Quello che un adattatore restituisce, prima di qualunque elaborazione. */
export type RisultatoGrezzo = {
  titolo: string;
  url: string;
  descrizione: string;
  /** null quando la fonte non espone una data affidabile. */
  dataPubblicazione: Date | null;
  fonteId: string;
};

export type Bando = {
  id: string;
  titolo: string;
  ente: string;
  livello: Livello;
  corsie: Corsia[];
  /** ISO 8601. */
  dataPubblicazione: string;
  /** true quando la data e' stata inferita e non letta dalla fonte. */
  dataIncerta: boolean;
  scadenza: string | null;
  importo: string | null;
  descrizioneBreve: string;
  requisiti: string[];
  chiPuoPartecipare: string | null;
  ammissibilita: Ammissibilita;
  /** id dell'ente della produzione che puo' firmare la domanda. */
  entePropostoId: string | null;
  motivoAmmissibilita: string | null;
  pertinenza: number;
  url: string;
  fonteId: string;
  /** ISO 8601 del primo avvistamento. */
  vistoIl: string;
  salvato: boolean;
};

export type EsitoFonte = {
  fonteId: string;
  ok: boolean;
  risultati: number;
  durataMs: number;
  errore: string | null;
  quando: string;
};
```

- [ ] **Step 2: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/tipi.ts
git commit -m "Definisce i tipi condivisi del dominio bandi"
```

---

## Task 3: Impronta stabile per la deduplica

Due esecuzioni diverse devono produrre lo stesso id per lo stesso bando, anche se la fonte cambia il titolo o aggiunge parametri di tracciamento all'URL.

**Files:**
- Create: `src/pipeline/impronta.ts`
- Test: `test/pipeline/impronta.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/pipeline/impronta.test.ts
import { describe, it, expect } from 'vitest';
import { impronta, normalizzaUrl } from '../../src/pipeline/impronta.ts';

describe('normalizzaUrl', () => {
  it('rimuove i parametri di tracciamento', () => {
    expect(normalizzaUrl('https://x.it/bando?utm_source=news&id=7'))
      .toBe('https://x.it/bando?id=7');
  });

  it('rimuove la barra finale e abbassa il dominio', () => {
    expect(normalizzaUrl('https://X.IT/Bando/')).toBe('https://x.it/Bando');
  });

  it('restituisce la stringa originale se non e\' un URL valido', () => {
    expect(normalizzaUrl('non-un-url')).toBe('non-un-url');
  });
});

describe('impronta', () => {
  it('e\' stabile fra chiamate identiche', () => {
    expect(impronta('mic', 'https://x.it/a')).toBe(impronta('mic', 'https://x.it/a'));
  });

  it('ignora i parametri di tracciamento', () => {
    expect(impronta('mic', 'https://x.it/a?utm_medium=mail'))
      .toBe(impronta('mic', 'https://x.it/a'));
  });

  it('distingue fonti diverse sullo stesso URL', () => {
    expect(impronta('mic', 'https://x.it/a')).not.toBe(impronta('crt', 'https://x.it/a'));
  });

  it('non dipende dal titolo, che le fonti ritoccano', () => {
    const a = impronta('mic', 'https://x.it/a');
    const b = impronta('mic', 'https://x.it/a');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/pipeline/impronta.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/pipeline/impronta.ts"`.

- [ ] **Step 3: Implementare**

```ts
// src/pipeline/impronta.ts
import { createHash } from 'node:crypto';

const PARAMETRI_DA_SCARTARE = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid',
];

/** Porta un URL in forma canonica, cosi' lo stesso bando non genera due id. */
export function normalizzaUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  for (const p of PARAMETRI_DA_SCARTARE) u.searchParams.delete(p);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

/**
 * Identita' di un bando: fonte piu' URL canonico.
 * Il titolo e' escluso di proposito perche' le fonti lo correggono a posteriori.
 */
export function impronta(fonteId: string, url: string): string {
  return createHash('sha256').update(`${fonteId}::${normalizzaUrl(url)}`).digest('hex');
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/pipeline/impronta.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/impronta.ts test/pipeline/impronta.test.ts
git commit -m "Impronta stabile dei bandi, indipendente da titolo e tracciamento"
```

---

## Task 4: Finestra temporale

La regola richiesta dalla produzione: tenere solo ciò che è uscito il giorno del controllo o nei giorni immediatamente precedenti. Un bando senza data va tenuto e marcato, mai scartato in silenzio.

**Files:**
- Create: `src/pipeline/finestra.ts`
- Test: `test/pipeline/finestra.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/pipeline/finestra.test.ts
import { describe, it, expect } from 'vitest';
import { dentroLaFinestra } from '../../src/pipeline/finestra.ts';

const oggi = new Date('2026-09-18T08:00:00Z');

describe('dentroLaFinestra', () => {
  it('accetta un bando pubblicato oggi', () => {
    expect(dentroLaFinestra(new Date('2026-09-18T06:00:00Z'), oggi, 7)).toBe(true);
  });

  it('accetta un bando al limite esatto della finestra', () => {
    expect(dentroLaFinestra(new Date('2026-09-11T08:00:00Z'), oggi, 7)).toBe(true);
  });

  it('rifiuta un bando appena fuori finestra', () => {
    expect(dentroLaFinestra(new Date('2026-09-10T23:00:00Z'), oggi, 7)).toBe(false);
  });

  it('accetta un bando datato nel futuro, perche\' alcune fonti antidatano', () => {
    expect(dentroLaFinestra(new Date('2026-09-20T00:00:00Z'), oggi, 7)).toBe(true);
  });

  it('accetta un bando senza data: meglio un falso positivo di un bando perso', () => {
    expect(dentroLaFinestra(null, oggi, 7)).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/pipeline/finestra.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/pipeline/finestra.ts

const MS_PER_GIORNO = 24 * 60 * 60 * 1000;

/**
 * Un risultato entra nell'archivio se e' stato pubblicato entro `giorni`
 * dalla data di controllo.
 *
 * Due scelte deliberate, entrambe a favore del falso positivo:
 * - data assente: si tiene. Scartare in silenzio e' il modo esatto in cui
 *   questa produzione ha gia' perso dei bandi.
 * - data futura: si tiene. Diverse fonti pubblicano con data di decorrenza.
 */
export function dentroLaFinestra(
  dataPubblicazione: Date | null,
  adesso: Date,
  giorni: number,
): boolean {
  if (dataPubblicazione === null) return true;
  if (Number.isNaN(dataPubblicazione.getTime())) return true;
  if (dataPubblicazione.getTime() > adesso.getTime()) return true;
  return adesso.getTime() - dataPubblicazione.getTime() <= giorni * MS_PER_GIORNO;
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/pipeline/finestra.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/finestra.ts test/pipeline/finestra.test.ts
git commit -m "Filtro sulla finestra temporale, prudente sui casi incerti"
```

---

## Task 5: Configurazione — profilo della produzione

Il file che rende la piattaforma specifica per questo progetto. Tutto ciò che un domani potrebbe cambiare vive qui e in nessun altro posto.

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Creare `src/config.ts`**

```ts
import type { Corsia, Livello } from './tipi.ts';

/** Giorni indietro guardati a ogni controllo. */
export const FINESTRA_GIORNI = 7;

/** Giorni recuperati alla primissima esecuzione, per nascere con l'archivio pieno. */
export const FINESTRA_PRIMO_AVVIO = 30;

/** Sotto questa pertinenza non parte nessuna notifica. Vedi spec 5.3. */
export const SOGLIA_NOTIFICA = 35;

/** Giorni di silenzio di una fonte oltre i quali scatta l'allarme. */
export const GIORNI_ALLARME_FONTE = 3;

/** Gli enti della produzione che possono firmare una domanda. */
export type Ente = {
  id: string;
  nome: string;
  /** Termini che, trovati fra i soggetti ammessi, rendono questo ente idoneo. */
  forme: string[];
};

export const ENTI: Ente[] = [
  {
    id: 'storiedipiazza',
    nome: 'Storie di Piazza APS',
    forme: [
      'associazione di promozione sociale', 'aps', 'associazioni',
      'associazione', 'ente del terzo settore', 'enti del terzo settore',
      'ets', 'odv', 'organizzazione di volontariato', 'terzo settore',
      'no profit', 'non profit', 'senza scopo di lucro', 'ente non commerciale',
    ],
  },
  {
    id: 'marcofalco',
    nome: 'Fondazione Marco Falco',
    forme: ['fondazione', 'fondazioni', 'onlus', 'ente filantropico'],
  },
  {
    id: 'videoastolfo',
    nome: 'VideoAstolfoSullaLuna Srl',
    forme: [
      'impresa di produzione', 'imprese di produzione', 'societa di produzione',
      'produttore indipendente', 'produttori indipendenti', 'impresa audiovisiva',
      'impresa cinematografica', 'pmi', 'piccole e medie imprese', 'srl',
    ],
  },
];

/** Requisiti che nessuno degli enti disponibili puo' soddisfare. */
export const BLOCCHI: { termine: string; motivo: string }[] = [
  { termine: 'coproduzione internazionale', motivo: 'richiede una coproduzione internazionale' },
  { termine: 'coproduttore estero', motivo: 'richiede un coproduttore estero' },
  { termine: 'almeno tre opere', motivo: 'richiede almeno tre opere precedenti' },
  { termine: 'almeno due opere', motivo: 'richiede almeno due opere precedenti' },
  { termine: 'lungometraggio di finzione', motivo: 'riservato ai lungometraggi, non alle web serie' },
  { termine: 'distribuzione in sala', motivo: 'richiede la distribuzione cinematografica in sala' },
];

/**
 * Requisiti che si possono costruire con un partner: segnalati in giallo.
 *
 * I termini si confrontano con `includes` su testo appiattito, quindi vanno
 * scritti per intero nelle forme che le fonti usano davvero. Un troncone come
 * "istituzion scolastic" NON trova "istituzione scolastica", perche' fra
 * "istituzion" e "scolastic" c'e' una "e". Meglio elencare le varianti.
 */
export const CONDIZIONI: { termine: string; motivo: string }[] = [
  { termine: 'istituzione scolastica', motivo: 'serve un istituto scolastico come capofila o partner' },
  { termine: 'istituzioni scolastiche', motivo: 'serve un istituto scolastico come capofila o partner' },
  { termine: 'istituto scolastico', motivo: 'serve un istituto scolastico come capofila o partner' },
  { termine: 'capofila', motivo: 'serve un capofila con requisiti specifici' },
  { termine: 'partenariato', motivo: 'serve un partenariato formale' },
  { termine: 'associazione temporanea di scopo', motivo: 'serve la costituzione di un\'ATS' },
];

// Nota di dominio: l'iscrizione al RUNTS non e' una condizione da segnalare.
// Storie di Piazza e' un'APS, e un'APS e' iscritta al RUNTS per definizione:
// metterla fra le CONDIZIONI marcherebbe in giallo proprio i bandi del terzo
// settore, che sono quelli piu' alla portata della produzione.

/** Parole chiave con peso, per corsia. Vedi spec 5.3. */
export const PAROLE: Record<Corsia, { termine: string; peso: number }[]> = {
  audiovisiva: [
    { termine: 'web serie', peso: 12 }, { termine: 'webserie', peso: 12 },
    { termine: 'serie tv', peso: 10 }, { termine: 'audiovisiv', peso: 10 },
    { termine: 'cortometraggio', peso: 9 }, { termine: 'documentario', peso: 8 },
    { termine: 'cinema', peso: 8 }, { termine: 'sceneggiatura', peso: 7 },
    { termine: 'produzione video', peso: 7 }, { termine: 'riprese', peso: 5 },
    { termine: 'montaggio', peso: 5 }, { termine: 'festival', peso: 5 },
    { termine: 'opera prima', peso: 6 }, { termine: 'fiction', peso: 6 },
    { termine: 'distribuzione', peso: 4 }, { termine: 'cultura', peso: 3 },
  ],
  giovani: [
    { termine: 'bullismo', peso: 14 }, { termine: 'cyberbullismo', peso: 14 },
    { termine: 'disagio giovanile', peso: 13 }, { termine: 'adolescen', peso: 12 },
    { termine: 'poverta educativa', peso: 12 }, { termine: 'dispersione scolastica', peso: 11 },
    { termine: 'salute mentale', peso: 10 }, { termine: 'benessere psicologic', peso: 10 },
    { termine: 'giovani', peso: 8 }, { termine: 'under 35', peso: 8 },
    { termine: 'peer education', peso: 8 }, { termine: 'violenza di genere', peso: 7 },
    { termine: 'identita di genere', peso: 7 }, { termine: 'discriminazion', peso: 6 },
    { termine: 'disabilita', peso: 6 }, { termine: 'scuola', peso: 6 },
    { termine: 'scuole', peso: 6 }, { termine: 'studenti', peso: 6 },
    { termine: 'educazion', peso: 5 }, { termine: 'terzo settore', peso: 5 },
    { termine: 'inclusione', peso: 5 }, { termine: 'prevenzione', peso: 4 },
  ],
};

/** Bonus a chi sta nell'intersezione fra le due corsie: e' il bersaglio ideale. */
export const BONUS_INTERSEZIONE = 20;

// Nota successiva all'implementazione: i destinatari non stanno piu' qui ma nel
// segreto EMAIL_DESTINATARI di GitHub, perche' il repository e' pubblico.

export const NOMI_LIVELLO: Record<Livello, string> = {
  europeo: 'Europeo',
  statale: 'Statale',
  mic: 'Ministero della Cultura',
  regionale: 'Regionale',
  provinciale: 'Provinciale',
  comunale: 'Comunale',
  fondazione: 'Fondazioni',
  terzosettore: 'Terzo settore',
};
```

- [ ] **Step 2: Verificare**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "Configurazione: enti della produzione, soglie e parole chiave"
```

---

## Task 6: Punteggio di pertinenza

**Files:**
- Create: `src/scoring/pertinenza.ts`
- Test: `test/scoring/pertinenza.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/scoring/pertinenza.test.ts
import { describe, it, expect } from 'vitest';
import { calcolaPertinenza, appiattisci } from '../../src/scoring/pertinenza.ts';

describe('appiattisci', () => {
  it('abbassa e toglie gli accenti, per far combaciare le parole chiave', () => {
    expect(appiattisci('Povertà Educativa')).toBe('poverta educativa');
  });

  it('comprime gli spazi multipli e la punteggiatura', () => {
    expect(appiattisci('cinema,  e   audiovisivo')).toBe('cinema e audiovisivo');
  });
});

describe('calcolaPertinenza', () => {
  it('assegna zero a un bando fuori tema', () => {
    const r = calcolaPertinenza('Manutenzione strade provinciali', 'Asfaltatura tratti urbani');
    expect(r.punteggio).toBe(0);
    expect(r.corsie).toEqual([]);
  });

  it('riconosce la corsia audiovisiva', () => {
    const r = calcolaPertinenza('Bando cortometraggio', 'Sostegno alla produzione di cortometraggi');
    expect(r.corsie).toEqual(['audiovisiva']);
    expect(r.punteggio).toBeGreaterThan(0);
  });

  it('riconosce la corsia giovani', () => {
    const r = calcolaPertinenza('Contrasto alla poverta educativa', 'Progetti per adolescenti');
    expect(r.corsie).toEqual(['giovani']);
    expect(r.punteggio).toBeGreaterThan(0);
  });

  it('premia chi sta in entrambe le corsie', () => {
    const solo = calcolaPertinenza('Bando web serie', 'Produzione di una web serie');
    const doppio = calcolaPertinenza(
      'Bando web serie sul bullismo',
      'Produzione di una web serie sul bullismo con gli adolescenti',
    );
    expect(doppio.corsie.sort()).toEqual(['audiovisiva', 'giovani']);
    expect(doppio.punteggio).toBeGreaterThan(solo.punteggio);
  });

  it('non supera mai cento', () => {
    const r = calcolaPertinenza(
      'web serie bullismo cyberbullismo adolescenti audiovisivo cinema',
      'disagio giovanile poverta educativa scuola studenti documentario cortometraggio sceneggiatura',
    );
    expect(r.punteggio).toBeLessThanOrEqual(100);
  });

  it('conta una parola chiave una volta sola, anche se ripetuta', () => {
    const una = calcolaPertinenza('bullismo', '');
    const tre = calcolaPertinenza('bullismo bullismo bullismo', '');
    expect(tre.punteggio).toBe(una.punteggio);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/scoring/pertinenza.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/scoring/pertinenza.ts
import { PAROLE, BONUS_INTERSEZIONE } from '../config.ts';
import type { Corsia } from '../tipi.ts';

/**
 * Riduce un testo a una forma confrontabile: minuscolo, senza accenti,
 * senza punteggiatura, con spazi singoli. Le fonti italiane scrivono
 * "povertà" e "poverta" indifferentemente.
 */
export function appiattisci(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type EsitoPertinenza = {
  punteggio: number;
  corsie: Corsia[];
};

/**
 * Somma i pesi delle parole chiave presenti, una volta sola ciascuna.
 * Chi tocca entrambe le corsie riceve un bonus: il progetto vive
 * nell'intersezione fra audiovisivo e disagio giovanile, e i bandi
 * che stanno li' sono quelli con meno concorrenti.
 */
export function calcolaPertinenza(titolo: string, descrizione: string): EsitoPertinenza {
  const testo = appiattisci(`${titolo} ${descrizione}`);
  const corsie: Corsia[] = [];
  let punteggio = 0;

  for (const corsia of ['audiovisiva', 'giovani'] as Corsia[]) {
    let puntiCorsia = 0;
    for (const { termine, peso } of PAROLE[corsia]) {
      if (testo.includes(appiattisci(termine))) puntiCorsia += peso;
    }
    if (puntiCorsia > 0) {
      corsie.push(corsia);
      punteggio += puntiCorsia;
    }
  }

  if (corsie.length === 2) punteggio += BONUS_INTERSEZIONE;

  return { punteggio: Math.min(100, punteggio), corsie };
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/scoring/pertinenza.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/pertinenza.ts test/scoring/pertinenza.test.ts
git commit -m "Punteggio di pertinenza su due corsie, con bonus all'intersezione"
```

---

## Task 7: Ammissibilità — quale ente firma la domanda

**Files:**
- Create: `src/scoring/ammissibilita.ts`
- Test: `test/scoring/ammissibilita.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/scoring/ammissibilita.test.ts
import { describe, it, expect } from 'vitest';
import { valutaAmmissibilita } from '../../src/scoring/ammissibilita.ts';

describe('valutaAmmissibilita', () => {
  it('propone l\'APS quando il bando si rivolge al terzo settore', () => {
    const r = valutaAmmissibilita(
      'Bando per il terzo settore',
      'Possono partecipare le associazioni di promozione sociale iscritte al RUNTS.',
    );
    expect(r.esito).toBe('verde');
    expect(r.entePropostoId).toBe('storiedipiazza');
    expect(r.motivo).toContain('associazioni di promozione sociale');
  });

  it('propone la societa di produzione quando serve un\'impresa audiovisiva', () => {
    const r = valutaAmmissibilita(
      'Fondo per la produzione',
      'Sono ammesse le imprese di produzione audiovisiva con sede in Piemonte.',
    );
    expect(r.esito).toBe('verde');
    expect(r.entePropostoId).toBe('videoastolfo');
  });

  it('marca rosso un bando che pretende una coproduzione internazionale', () => {
    const r = valutaAmmissibilita(
      'Fondo europeo',
      'Ammesse le imprese di produzione in coproduzione internazionale con almeno due paesi.',
    );
    expect(r.esito).toBe('rosso');
    expect(r.motivo).toContain('coproduzione internazionale');
    expect(r.entePropostoId).toBeNull();
  });

  it('marca giallo un bando che richiede una scuola capofila', () => {
    const r = valutaAmmissibilita(
      'Bando scuole',
      'Le associazioni possono partecipare con un\'istituzione scolastica capofila.',
    );
    expect(r.esito).toBe('giallo');
    expect(r.entePropostoId).toBe('storiedipiazza');
    expect(r.motivo).toContain('istituto scolastico');
  });

  it('il blocco ha la precedenza sulla condizione', () => {
    const r = valutaAmmissibilita(
      'Bando misto',
      'Associazioni in partenariato, con coproduzione internazionale obbligatoria.',
    );
    expect(r.esito).toBe('rosso');
  });

  it('restituisce ignota quando non riconosce nessun soggetto', () => {
    const r = valutaAmmissibilita('Avviso', 'Comunicazione di servizio agli utenti.');
    expect(r.esito).toBe('ignota');
    expect(r.entePropostoId).toBeNull();
    expect(r.motivo).toBeNull();
  });

  it('riporta la frase originale del bando, non una parafrasi', () => {
    const r = valutaAmmissibilita(
      'Bando',
      'Premessa generale. Possono presentare domanda le fondazioni del territorio. Altre note.',
    );
    expect(r.motivo).toBe('Possono presentare domanda le fondazioni del territorio.');
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/scoring/ammissibilita.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/scoring/ammissibilita.ts
import { ENTI, BLOCCHI, CONDIZIONI } from '../config.ts';
import { appiattisci } from './pertinenza.ts';
import type { Ammissibilita } from '../tipi.ts';

export type EsitoAmmissibilita = {
  esito: Ammissibilita;
  entePropostoId: string | null;
  /** La frase del bando da cui l'esito e' dedotto, cosi' si puo' verificare. */
  motivo: string | null;
};

/** Spezza il testo in frasi, conservando la punteggiatura finale. */
function frasi(testo: string): string[] {
  return testo
    .split(/(?<=[.;:!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/** Prima frase che contiene il termine, per poterla mostrare all'utente. */
function fraseCon(testo: string, termine: string): string | null {
  const t = appiattisci(termine);
  for (const f of frasi(testo)) {
    if (appiattisci(f).includes(t)) return f;
  }
  return null;
}

/**
 * Non risponde a "possiamo partecipare?" ma a "chi di noi firma la domanda?".
 * La produzione dispone di un'APS, di una Fondazione e di una societa' di
 * produzione audiovisiva, quindi la domanda utile e' quale ente usare.
 */
export function valutaAmmissibilita(titolo: string, descrizione: string): EsitoAmmissibilita {
  const testo = `${titolo}. ${descrizione}`;
  const piatto = appiattisci(testo);

  for (const { termine, motivo } of BLOCCHI) {
    if (piatto.includes(appiattisci(termine))) {
      return { esito: 'rosso', entePropostoId: null, motivo: `${motivo}: "${fraseCon(testo, termine) ?? termine}"` };
    }
  }

  let entePropostoId: string | null = null;
  let motivo: string | null = null;

  cerca: for (const ente of ENTI) {
    for (const forma of ente.forme) {
      if (piatto.includes(appiattisci(forma))) {
        entePropostoId = ente.id;
        motivo = fraseCon(testo, forma);
        break cerca;
      }
    }
  }

  if (entePropostoId === null) {
    return { esito: 'ignota', entePropostoId: null, motivo: null };
  }

  for (const { termine, motivo: m } of CONDIZIONI) {
    if (piatto.includes(appiattisci(termine))) {
      return { esito: 'giallo', entePropostoId, motivo: m };
    }
  }

  return { esito: 'verde', entePropostoId, motivo };
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/scoring/ammissibilita.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/ammissibilita.ts test/scoring/ammissibilita.test.ts
git commit -m "Ammissibilita': quale ente della produzione puo' firmare la domanda"
```

---

## Task 8: Interfaccia degli adattatori e fabbrica RSS

Cinque delle sette fonti sono feed RSS. Una sola fabbrica le copre tutte: le differenze stanno nei dati di configurazione, non nel codice.

**Files:**
- Create: `src/sources/tipi.ts`
- Create: `src/sources/rss.ts`
- Create: `test/fixtures/rss-piemonte.xml`
- Test: `test/sources/rss.test.ts`

- [ ] **Step 1: Salvare un campione reale del feed**

```bash
curl -s "https://bandi.regione.piemonte.it/tutti/rss.xml" -o test/fixtures/rss-piemonte.xml
head -c 300 test/fixtures/rss-piemonte.xml
```

Expected: XML che inizia con `<?xml version="1.0" encoding="utf-8"?>` e contiene `<rss`.

Se la rete non è disponibile, creare a mano `test/fixtures/rss-piemonte.xml` con questo contenuto minimo:

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Bandi Regione Piemonte: tutti i bandi</title>
    <item>
      <title>Bando per la promozione della lettura</title>
      <link>https://bandi.regione.piemonte.it/contributi-finanziamenti/bando-lettura</link>
      <description>Contributi alle associazioni culturali del territorio.</description>
      <pubDate>Wed, 16 Sep 2026 09:00:00 +0000</pubDate>
    </item>
    <item>
      <title>Avviso senza data</title>
      <link>https://bandi.regione.piemonte.it/contributi-finanziamenti/avviso-x</link>
      <description>Descrizione breve.</description>
    </item>
  </channel>
</rss>
```

- [ ] **Step 2: Scrivere il test che fallisce**

```ts
// test/sources/rss.test.ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { creaAdattatoreRss, analizzaRss } from '../../src/sources/rss.ts';

const xml = await readFile('test/fixtures/rss-piemonte.xml', 'utf8');

describe('analizzaRss', () => {
  it('estrae titolo, link e descrizione di ogni voce', async () => {
    const voci = await analizzaRss(xml, 'piemonte');
    expect(voci.length).toBeGreaterThan(0);
    const prima = voci[0]!;
    expect(prima.titolo).toBeTruthy();
    expect(prima.url).toMatch(/^https?:\/\//);
    expect(prima.fonteId).toBe('piemonte');
  });

  it('converte pubDate in Date', async () => {
    const voci = await analizzaRss(xml, 'piemonte');
    const conData = voci.find((v) => v.dataPubblicazione !== null);
    expect(conData?.dataPubblicazione).toBeInstanceOf(Date);
  });

  it('mette null quando la voce non ha data, senza scartarla', async () => {
    const senzaData = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>T</title><link>https://x.it/a</link><description>D</description></item>
    </channel></rss>`;
    const voci = await analizzaRss(senzaData, 'x');
    expect(voci).toHaveLength(1);
    expect(voci[0]!.dataPubblicazione).toBeNull();
  });

  it('ripulisce l\'HTML dalla descrizione', async () => {
    const conHtml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>T</title><link>https://x.it/a</link>
      <description>&lt;p&gt;Testo &lt;b&gt;grassetto&lt;/b&gt;&lt;/p&gt;</description></item>
    </channel></rss>`;
    const voci = await analizzaRss(conHtml, 'x');
    expect(voci[0]!.descrizione).toBe('Testo grassetto');
  });
});

describe('creaAdattatoreRss', () => {
  it('costruisce un adattatore con i metadati della fonte', () => {
    const a = creaAdattatoreRss({
      id: 'piemonte',
      nome: 'Bandi Regione Piemonte',
      ente: 'Regione Piemonte',
      livello: 'regionale',
      url: 'https://bandi.regione.piemonte.it/tutti/rss.xml',
    });
    expect(a.id).toBe('piemonte');
    expect(a.livello).toBe('regionale');
    expect(typeof a.cerca).toBe('function');
  });
});
```

- [ ] **Step 3: Eseguire per verificare che fallisca**

Run: `npx vitest run test/sources/rss.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 4: Creare l'interfaccia degli adattatori**

```ts
// src/sources/tipi.ts
import type { Livello, RisultatoGrezzo } from '../tipi.ts';

/**
 * Ogni fonte e' un adattatore. Non conosce punteggi, notifiche o interfaccia:
 * restituisce risultati grezzi e basta. Aggiungere una fonte significa
 * scrivere un file nuovo e registrarlo, senza toccare altro.
 */
export type Adattatore = {
  id: string;
  nome: string;
  ente: string;
  livello: Livello;
  cerca(daQuando: Date): Promise<RisultatoGrezzo[]>;
};

export type FonteRss = {
  id: string;
  nome: string;
  ente: string;
  livello: Livello;
  url: string;
};
```

- [ ] **Step 5: Implementare la fabbrica RSS**

```ts
// src/sources/rss.ts
import Parser from 'rss-parser';
import type { RisultatoGrezzo } from '../tipi.ts';
import type { Adattatore, FonteRss } from './tipi.ts';

const parser = new Parser({ timeout: 25_000 });

/** Toglie i tag e normalizza gli spazi: le descrizioni RSS contengono HTML. */
function testoPulito(grezzo: string | undefined): string {
  if (!grezzo) return '';
  return grezzo
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function leggiData(voce: { isoDate?: string; pubDate?: string }): Date | null {
  const grezza = voce.isoDate ?? voce.pubDate;
  if (!grezza) return null;
  const d = new Date(grezza);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Separata dalla rete, cosi' si testa su campioni salvati. */
export async function analizzaRss(xml: string, fonteId: string): Promise<RisultatoGrezzo[]> {
  const feed = await parser.parseString(xml);
  const risultati: RisultatoGrezzo[] = [];
  for (const voce of feed.items ?? []) {
    if (!voce.link || !voce.title) continue;
    risultati.push({
      titolo: testoPulito(voce.title),
      url: voce.link,
      descrizione: testoPulito(voce.contentSnippet ?? voce.content ?? voce.summary),
      dataPubblicazione: leggiData(voce),
      fonteId,
    });
  }
  return risultati;
}

export function creaAdattatoreRss(fonte: FonteRss): Adattatore {
  return {
    id: fonte.id,
    nome: fonte.nome,
    ente: fonte.ente,
    livello: fonte.livello,
    async cerca(): Promise<RisultatoGrezzo[]> {
      const risposta = await fetch(fonte.url, {
        headers: { 'user-agent': 'RadarBandi/1.0 (monitoraggio bandi, uso interno)' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status} da ${fonte.url}`);
      return analizzaRss(await risposta.text(), fonte.id);
    },
  };
}
```

Nota: `cerca` ignora il parametro `daQuando` di proposito. Il filtro temporale è compito della pipeline, uguale per tutte le fonti: un adattatore che filtrasse per conto suo renderebbe la regola impossibile da cambiare in un punto solo.

- [ ] **Step 6: Eseguire per verificare che passi**

Run: `npx vitest run test/sources/rss.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 7: Commit**

```bash
git add src/sources/tipi.ts src/sources/rss.ts test/sources/rss.test.ts test/fixtures/rss-piemonte.xml
git commit -m "Interfaccia degli adattatori e fabbrica per le fonti RSS"
```

---

## Task 9: Adattatore WordPress REST per il Ministero della Cultura

Il sito del MiC non ha un feed utile per gli avvisi, ma espone l'API REST di WordPress con date e categorie. È l'aggancio più pulito disponibile per la fonte più importante.

**Files:**
- Create: `src/sources/wordpress.ts`
- Create: `test/fixtures/wp-mic.json`
- Test: `test/sources/wordpress.test.ts`

- [ ] **Step 1: Salvare un campione reale**

```bash
curl -s "https://cinema.cultura.gov.it/wp-json/wp/v2/posts?per_page=5&orderby=date&order=desc" -o test/fixtures/wp-mic.json
```

Se la rete non è disponibile, creare a mano `test/fixtures/wp-mic.json`:

```json
[
  {
    "date": "2026-09-17T15:20:53",
    "link": "https://cinema.cultura.gov.it/avvisi/tax-credit-apertura-sessione/",
    "title": { "rendered": "Tax credit &#8211; Apertura sessione 2025" },
    "excerpt": { "rendered": "<p>Si comunica l&#8217;apertura della sessione.</p>" },
    "categories": [4, 30]
  },
  {
    "date": "2026-09-14T10:11:58",
    "link": "https://cinema.cultura.gov.it/notizie/legge-cinema/",
    "title": { "rendered": "Legge Cinema" },
    "excerpt": { "rendered": "<p>Dichiarazione.</p>" },
    "categories": [9, 3]
  }
]
```

- [ ] **Step 2: Scrivere il test che fallisce**

```ts
// test/sources/wordpress.test.ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { analizzaWordpress, creaAdattatoreWordpress } from '../../src/sources/wordpress.ts';

const json = JSON.parse(await readFile('test/fixtures/wp-mic.json', 'utf8'));

describe('analizzaWordpress', () => {
  it('estrae titolo, link, data e descrizione', () => {
    const voci = analizzaWordpress(json, 'mic');
    expect(voci.length).toBeGreaterThan(0);
    const prima = voci[0]!;
    expect(prima.titolo).toBeTruthy();
    expect(prima.url).toMatch(/^https:\/\//);
    expect(prima.dataPubblicazione).toBeInstanceOf(Date);
    expect(prima.fonteId).toBe('mic');
  });

  it('decodifica le entita\' HTML nei titoli', () => {
    const voci = analizzaWordpress(
      [{ date: '2026-09-17T15:20:53', link: 'https://x.it/a',
         title: { rendered: 'Tax credit &#8211; sessione' },
         excerpt: { rendered: '<p>Testo</p>' }, categories: [4] }],
      'mic',
    );
    expect(voci[0]!.titolo).toBe('Tax credit – sessione');
  });

  it('toglie i tag dall\'estratto', () => {
    const voci = analizzaWordpress(
      [{ date: '2026-09-17T15:20:53', link: 'https://x.it/a',
         title: { rendered: 'T' },
         excerpt: { rendered: '<p>Si comunica l&#8217;apertura.</p>' }, categories: [4] }],
      'mic',
    );
    expect(voci[0]!.descrizione).toBe('Si comunica l’apertura.');
  });

  it('salta le voci senza link', () => {
    const voci = analizzaWordpress(
      [{ date: '2026-09-17T15:20:53', link: '', title: { rendered: 'T' },
         excerpt: { rendered: '' }, categories: [] }],
      'mic',
    );
    expect(voci).toHaveLength(0);
  });
});

describe('creaAdattatoreWordpress', () => {
  it('costruisce un adattatore con i metadati della fonte', () => {
    const a = creaAdattatoreWordpress({
      id: 'mic', nome: 'MiC Cinema', ente: 'Ministero della Cultura',
      livello: 'mic', base: 'https://cinema.cultura.gov.it',
    });
    expect(a.id).toBe('mic');
    expect(a.livello).toBe('mic');
  });
});
```

- [ ] **Step 3: Eseguire per verificare che fallisca**

Run: `npx vitest run test/sources/wordpress.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 4: Implementare**

```ts
// src/sources/wordpress.ts
import type { Livello, RisultatoGrezzo } from '../tipi.ts';
import type { Adattatore } from './tipi.ts';

export type FonteWordpress = {
  id: string;
  nome: string;
  ente: string;
  livello: Livello;
  /** Origine del sito, senza barra finale. */
  base: string;
};

type PostWordpress = {
  date?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  categories?: number[];
};

const ENTITA: Record<string, string> = {
  '&#8211;': '–', '&#8212;': '—', '&#8217;': '’', '&#8216;': '‘',
  '&#8220;': '“', '&#8221;': '”', '&#038;': '&', '&amp;': '&',
  '&nbsp;': ' ', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#039;': "'",
};

function decodifica(testo: string): string {
  let out = testo;
  for (const [entita, carattere] of Object.entries(ENTITA)) {
    out = out.split(entita).join(carattere);
  }
  return out.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

function testoPulito(grezzo: string | undefined): string {
  if (!grezzo) return '';
  return decodifica(grezzo.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Separata dalla rete, cosi' si testa su campioni salvati. */
export function analizzaWordpress(posts: PostWordpress[], fonteId: string): RisultatoGrezzo[] {
  const risultati: RisultatoGrezzo[] = [];
  for (const post of posts) {
    if (!post.link || !post.title?.rendered) continue;
    const data = post.date ? new Date(post.date) : null;
    risultati.push({
      titolo: testoPulito(post.title.rendered),
      url: post.link,
      descrizione: testoPulito(post.excerpt?.rendered),
      dataPubblicazione: data && !Number.isNaN(data.getTime()) ? data : null,
      fonteId,
    });
  }
  return risultati;
}

export function creaAdattatoreWordpress(fonte: FonteWordpress): Adattatore {
  return {
    id: fonte.id,
    nome: fonte.nome,
    ente: fonte.ente,
    livello: fonte.livello,
    async cerca(daQuando: Date): Promise<RisultatoGrezzo[]> {
      // L'API accetta un filtro sulla data: si scarica solo il necessario.
      const url = `${fonte.base}/wp-json/wp/v2/posts`
        + `?per_page=50&orderby=date&order=desc&after=${daQuando.toISOString()}`;
      const risposta = await fetch(url, {
        headers: { 'user-agent': 'RadarBandi/1.0 (monitoraggio bandi, uso interno)' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status} da ${url}`);
      return analizzaWordpress(await risposta.json() as PostWordpress[], fonte.id);
    },
  };
}
```

- [ ] **Step 5: Eseguire per verificare che passi**

Run: `npx vitest run test/sources/wordpress.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add src/sources/wordpress.ts test/sources/wordpress.test.ts test/fixtures/wp-mic.json
git commit -m "Adattatore WordPress REST per gli avvisi del Ministero della Cultura"
```

---

## Task 10: Registro delle sette fonti verificate

**Files:**
- Create: `src/sources/registro.ts`
- Test: `test/sources/registro.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/sources/registro.test.ts
import { describe, it, expect } from 'vitest';
import { ADATTATORI } from '../../src/sources/registro.ts';

describe('registro delle fonti', () => {
  it('contiene le sette fonti verificate', () => {
    expect(ADATTATORI).toHaveLength(7);
  });

  it('non ha id duplicati', () => {
    const ids = ADATTATORI.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ogni adattatore espone i metadati richiesti', () => {
    for (const a of ADATTATORI) {
      expect(a.id, 'id').toBeTruthy();
      expect(a.nome, `nome di ${a.id}`).toBeTruthy();
      expect(a.ente, `ente di ${a.id}`).toBeTruthy();
      expect(typeof a.cerca, `cerca di ${a.id}`).toBe('function');
    }
  });

  it('copre le corsie che contano per questo progetto', () => {
    const livelli = new Set(ADATTATORI.map((a) => a.livello));
    expect(livelli.has('terzosettore')).toBe(true);
    expect(livelli.has('mic')).toBe(true);
    expect(livelli.has('regionale')).toBe(true);
    expect(livelli.has('fondazione')).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/sources/registro.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/sources/registro.ts
import { creaAdattatoreRss } from './rss.ts';
import { creaAdattatoreWordpress } from './wordpress.ts';
import type { Adattatore } from './tipi.ts';

/**
 * Le sette fonti con aggancio verificato il 18 settembre 2026.
 * Gli adattatori HTML delle altre fonti arrivano in un piano successivo.
 */
export const ADATTATORI: Adattatore[] = [
  creaAdattatoreWordpress({
    id: 'mic',
    nome: 'MiC — Direzione generale Cinema e audiovisivo',
    ente: 'Ministero della Cultura',
    livello: 'mic',
    base: 'https://cinema.cultura.gov.it',
  }),
  creaAdattatoreRss({
    id: 'infobandi',
    nome: 'InfoBandi CSVnet',
    ente: 'CSVnet',
    livello: 'terzosettore',
    url: 'https://infobandi.csvnet.it/feed/',
  }),
  creaAdattatoreRss({
    id: 'ctvbiella',
    nome: 'CTV Biella–Vercelli',
    ente: 'Centro Territoriale per il Volontariato',
    livello: 'terzosettore',
    url: 'https://www.centroterritorialevolontariato.org/feed/',
  }),
  creaAdattatoreRss({
    id: 'piemonte',
    nome: 'Bandi Regione Piemonte',
    ente: 'Regione Piemonte',
    livello: 'regionale',
    url: 'https://bandi.regione.piemonte.it/tutti/rss.xml',
  }),
  creaAdattatoreRss({
    id: 'crt',
    nome: 'Fondazione CRT',
    ente: 'Fondazione CRT',
    livello: 'fondazione',
    url: 'https://www.fondazionecrt.it/feed/',
  }),
  creaAdattatoreRss({
    id: 'compagniasanpaolo',
    nome: 'Fondazione Compagnia di San Paolo',
    ente: 'Compagnia di San Paolo',
    livello: 'fondazione',
    url: 'https://www.compagniadisanpaolo.it/feed/',
  }),
  creaAdattatoreRss({
    id: 'ang',
    nome: 'Agenzia Nazionale Giovani',
    ente: 'Agenzia Nazionale Giovani',
    livello: 'statale',
    url: 'https://www.agenziagiovani.it/feed/',
  }),
];
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/sources/registro.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Verifica dal vivo — controllare che tutte e sette rispondano davvero**

```bash
node --experimental-strip-types -e "
import('./src/sources/registro.ts').then(async ({ ADATTATORI }) => {
  const da = new Date(Date.now() - 30*24*60*60*1000);
  for (const a of ADATTATORI) {
    try {
      const r = await a.cerca(da);
      console.log('OK  ', a.id.padEnd(20), r.length, 'risultati');
    } catch (e) {
      console.log('FAIL', a.id.padEnd(20), e.message);
    }
  }
});
"
```

Expected: sette righe `OK`, ciascuna con un numero di risultati maggiore di zero.
Se una fonte fallisce, annotarlo e proseguire: il Task 12 gestisce esattamente questo caso. Non bloccare il piano.

- [ ] **Step 6: Commit**

```bash
git add src/sources/registro.ts test/sources/registro.test.ts
git commit -m "Registro delle sette fonti con aggancio verificato"
```

---

## Task 11: Archivio — fusione senza perdere lo stato

Il punto delicato: quando la raccolta rigira, i bandi già noti non devono perdere il flag "salvato" né la data di primo avvistamento.

**Files:**
- Create: `src/pipeline/archivio.ts`
- Test: `test/pipeline/archivio.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/pipeline/archivio.test.ts
import { describe, it, expect } from 'vitest';
import { fondi, costruisciBando } from '../../src/pipeline/archivio.ts';
import type { Bando, RisultatoGrezzo } from '../../src/tipi.ts';

const adesso = new Date('2026-09-18T08:00:00Z');

function grezzo(over: Partial<RisultatoGrezzo> = {}): RisultatoGrezzo {
  return {
    titolo: 'Bando web serie sul bullismo',
    url: 'https://x.it/a',
    descrizione: 'Possono partecipare le associazioni di promozione sociale.',
    dataPubblicazione: new Date('2026-09-17T00:00:00Z'),
    fonteId: 'infobandi',
    ...over,
  };
}

describe('costruisciBando', () => {
  it('compila i campi derivati', () => {
    const b = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso);
    expect(b.id).toHaveLength(64);
    expect(b.ente).toBe('CSVnet');
    expect(b.livello).toBe('terzosettore');
    expect(b.pertinenza).toBeGreaterThan(0);
    expect(b.ammissibilita).toBe('verde');
    expect(b.entePropostoId).toBe('storiedipiazza');
    expect(b.salvato).toBe(false);
  });

  it('marca dataIncerta e usa il momento del controllo quando manca la data', () => {
    const b = costruisciBando(grezzo({ dataPubblicazione: null }), 'CSVnet', 'terzosettore', adesso);
    expect(b.dataIncerta).toBe(true);
    expect(b.dataPubblicazione).toBe(adesso.toISOString());
  });

  it('tronca la descrizione a 400 caratteri', () => {
    const b = costruisciBando(grezzo({ descrizione: 'x'.repeat(900) }), 'E', 'statale', adesso);
    expect(b.descrizioneBreve.length).toBeLessThanOrEqual(400);
  });
});

describe('fondi', () => {
  it('aggiunge i bandi mai visti', () => {
    const nuovo = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso);
    const { tutti, nuovi } = fondi([], [nuovo]);
    expect(tutti).toHaveLength(1);
    expect(nuovi).toHaveLength(1);
  });

  it('non duplica un bando gia\' presente', () => {
    const b = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso);
    const { tutti, nuovi } = fondi([b], [{ ...b }]);
    expect(tutti).toHaveLength(1);
    expect(nuovi).toHaveLength(0);
  });

  it('conserva il flag salvato quando il bando torna dalla fonte', () => {
    const esistente: Bando = { ...costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso), salvato: true };
    const rivisto = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', new Date('2026-09-25T08:00:00Z'));
    const { tutti } = fondi([esistente], [rivisto]);
    expect(tutti[0]!.salvato).toBe(true);
  });

  it('conserva la data di primo avvistamento', () => {
    const esistente = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso);
    const rivisto = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', new Date('2026-09-25T08:00:00Z'));
    const { tutti } = fondi([esistente], [rivisto]);
    expect(tutti[0]!.vistoIl).toBe(esistente.vistoIl);
  });

  it('aggiorna i campi che la fonte puo\' correggere', () => {
    const esistente = costruisciBando(grezzo({ titolo: 'Titolo vecchio' }), 'CSVnet', 'terzosettore', adesso);
    const rivisto = costruisciBando(grezzo({ titolo: 'Titolo corretto' }), 'CSVnet', 'terzosettore', adesso);
    const { tutti } = fondi([esistente], [rivisto]);
    expect(tutti[0]!.titolo).toBe('Titolo corretto');
  });

  it('ordina dal piu\' recente al piu\' vecchio', () => {
    const vecchio = costruisciBando(
      grezzo({ url: 'https://x.it/v', dataPubblicazione: new Date('2026-09-01T00:00:00Z') }),
      'E', 'statale', adesso);
    const recente = costruisciBando(
      grezzo({ url: 'https://x.it/r', dataPubblicazione: new Date('2026-09-17T00:00:00Z') }),
      'E', 'statale', adesso);
    const { tutti } = fondi([vecchio], [recente]);
    expect(tutti[0]!.url).toBe('https://x.it/r');
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/pipeline/archivio.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/pipeline/archivio.ts
import { impronta } from './impronta.ts';
import { calcolaPertinenza } from '../scoring/pertinenza.ts';
import { valutaAmmissibilita } from '../scoring/ammissibilita.ts';
import type { Bando, Livello, RisultatoGrezzo } from '../tipi.ts';

const MAX_DESCRIZIONE = 400;

export function costruisciBando(
  grezzo: RisultatoGrezzo,
  ente: string,
  livello: Livello,
  adesso: Date,
): Bando {
  const pertinenza = calcolaPertinenza(grezzo.titolo, grezzo.descrizione);
  const ammissibilita = valutaAmmissibilita(grezzo.titolo, grezzo.descrizione);
  const dataIncerta = grezzo.dataPubblicazione === null;

  return {
    id: impronta(grezzo.fonteId, grezzo.url),
    titolo: grezzo.titolo,
    ente,
    livello,
    corsie: pertinenza.corsie,
    dataPubblicazione: (grezzo.dataPubblicazione ?? adesso).toISOString(),
    dataIncerta,
    scadenza: null,
    importo: null,
    descrizioneBreve: grezzo.descrizione.slice(0, MAX_DESCRIZIONE),
    requisiti: [],
    chiPuoPartecipare: ammissibilita.motivo,
    ammissibilita: ammissibilita.esito,
    entePropostoId: ammissibilita.entePropostoId,
    motivoAmmissibilita: ammissibilita.motivo,
    pertinenza: pertinenza.punteggio,
    url: grezzo.url,
    fonteId: grezzo.fonteId,
    vistoIl: adesso.toISOString(),
    salvato: false,
  };
}

export type EsitoFusione = {
  tutti: Bando[];
  nuovi: Bando[];
};

/**
 * Fonde i risultati di oggi con l'archivio.
 *
 * Regola: i campi che descrivono il bando si aggiornano (la fonte puo'
 * correggere un titolo), i campi che rappresentano la nostra relazione con
 * il bando no. Perdere un "salvato" perche' la fonte ha ripubblicato
 * l'avviso sarebbe un difetto grave e silenzioso.
 */
export function fondi(archivio: Bando[], raccolti: Bando[]): EsitoFusione {
  const perId = new Map(archivio.map((b) => [b.id, b]));
  const nuovi: Bando[] = [];

  for (const bando of raccolti) {
    const esistente = perId.get(bando.id);
    if (esistente === undefined) {
      perId.set(bando.id, bando);
      nuovi.push(bando);
      continue;
    }
    perId.set(bando.id, {
      ...bando,
      vistoIl: esistente.vistoIl,
      salvato: esistente.salvato,
    });
  }

  const tutti = [...perId.values()].sort(
    (a, b) => Date.parse(b.dataPubblicazione) - Date.parse(a.dataPubblicazione),
  );
  return { tutti, nuovi };
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/pipeline/archivio.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/archivio.ts test/pipeline/archivio.test.ts
git commit -m "Archivio: fusione che preserva salvataggi e primo avvistamento"
```

---

## Task 12: Salute delle fonti

Il componente che impedisce il ritorno del problema originale: una fonte che smette di funzionare in silenzio.

**Files:**
- Create: `src/health/salute.ts`
- Test: `test/health/salute.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/health/salute.test.ts
import { describe, it, expect } from 'vitest';
import { fonteSospetta, aggiornaStorico } from '../../src/health/salute.ts';
import type { EsitoFonte } from '../../src/tipi.ts';

function esito(over: Partial<EsitoFonte> = {}): EsitoFonte {
  return { fonteId: 'mic', ok: true, risultati: 3, durataMs: 100, errore: null,
           quando: '2026-09-18T08:00:00Z', ...over };
}

describe('fonteSospetta', () => {
  it('non segnala una fonte che porta risultati', () => {
    expect(fonteSospetta([esito(), esito(), esito()], 3)).toBe(false);
  });

  it('segnala tre errori consecutivi', () => {
    const ko = esito({ ok: false, risultati: 0, errore: 'HTTP 500' });
    expect(fonteSospetta([ko, ko, ko], 3)).toBe(true);
  });

  it('segnala tre esecuzioni a zero risultati anche senza errori', () => {
    // E' il sintomo di un sito rifatto: il parser gira ma non trova piu' nulla.
    const vuoto = esito({ ok: true, risultati: 0 });
    expect(fonteSospetta([vuoto, vuoto, vuoto], 3)).toBe(true);
  });

  it('non segnala se un successo interrompe la serie', () => {
    const vuoto = esito({ risultati: 0 });
    expect(fonteSospetta([vuoto, esito(), vuoto], 3)).toBe(false);
  });

  it('guarda solo le ultime N esecuzioni', () => {
    const vuoto = esito({ risultati: 0 });
    expect(fonteSospetta([vuoto, vuoto, vuoto, esito()], 3)).toBe(false);
  });

  it('non segnala prima di avere abbastanza storico', () => {
    const vuoto = esito({ risultati: 0 });
    expect(fonteSospetta([vuoto, vuoto], 3)).toBe(false);
  });
});

describe('aggiornaStorico', () => {
  it('accoda il nuovo esito in coda', () => {
    const s = aggiornaStorico({}, [esito({ fonteId: 'mic' })], 10);
    expect(s['mic']).toHaveLength(1);
  });

  it('tiene solo le ultime N esecuzioni per fonte', () => {
    let s: Record<string, EsitoFonte[]> = {};
    for (let i = 0; i < 15; i++) s = aggiornaStorico(s, [esito({ fonteId: 'mic' })], 10);
    expect(s['mic']).toHaveLength(10);
  });

  it('tiene le fonti separate', () => {
    const s = aggiornaStorico({}, [esito({ fonteId: 'mic' }), esito({ fonteId: 'crt' })], 10);
    expect(Object.keys(s).sort()).toEqual(['crt', 'mic']);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/health/salute.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/health/salute.ts
import type { EsitoFonte } from '../tipi.ts';

export type Storico = Record<string, EsitoFonte[]>;

/**
 * Una fonte e' sospetta se le ultime `soglia` esecuzioni non hanno portato
 * nulla, per errore o per silenzio.
 *
 * Lo zero senza errore conta quanto l'errore: e' il sintomo tipico di un sito
 * rifatto, dove il parser gira senza lamentarsi ma non trova piu' niente.
 * E' esattamente il modo in cui un monitoraggio muore senza che nessuno
 * se ne accorga.
 */
export function fonteSospetta(esiti: EsitoFonte[], soglia: number): boolean {
  if (esiti.length < soglia) return false;
  const ultimi = esiti.slice(-soglia);
  return ultimi.every((e) => !e.ok || e.risultati === 0);
}

export function aggiornaStorico(
  storico: Storico,
  esiti: EsitoFonte[],
  massimo: number,
): Storico {
  const out: Storico = { ...storico };
  for (const esito of esiti) {
    const precedenti = out[esito.fonteId] ?? [];
    out[esito.fonteId] = [...precedenti, esito].slice(-massimo);
  }
  return out;
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/health/salute.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add src/health/salute.ts test/health/salute.test.ts
git commit -m "Salute delle fonti: lo zero silenzioso conta quanto l'errore"
```

---

## Task 13: Formattazione delle notifiche

**Files:**
- Create: `src/notify/formatta.ts`
- Test: `test/notify/formatta.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/notify/formatta.test.ts
import { describe, it, expect } from 'vitest';
import { daNotificare, oggetto, corpoHtml } from '../../src/notify/formatta.ts';
import type { Bando } from '../../src/tipi.ts';

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: 'a'.repeat(64), titolo: 'Bando web serie', ente: 'CSVnet',
    livello: 'terzosettore', corsie: ['audiovisiva', 'giovani'],
    dataPubblicazione: '2026-09-17T00:00:00.000Z', dataIncerta: false,
    scadenza: null, importo: null, descrizioneBreve: 'Descrizione.',
    requisiti: [], chiPuoPartecipare: 'Possono partecipare le associazioni.',
    ammissibilita: 'verde', entePropostoId: 'storiedipiazza',
    motivoAmmissibilita: 'Possono partecipare le associazioni.',
    pertinenza: 60, url: 'https://x.it/a', fonteId: 'infobandi',
    vistoIl: '2026-09-18T08:00:00.000Z', salvato: false,
    ...over,
  };
}

describe('daNotificare', () => {
  it('tiene i bandi sopra soglia', () => {
    expect(daNotificare([bando({ pertinenza: 60 })], 35)).toHaveLength(1);
  });

  it('scarta i bandi sotto soglia', () => {
    expect(daNotificare([bando({ pertinenza: 10 })], 35)).toHaveLength(0);
  });

  it('scarta i rossi anche se molto pertinenti', () => {
    expect(daNotificare([bando({ pertinenza: 95, ammissibilita: 'rosso' })], 35)).toHaveLength(0);
  });

  it('tiene gli ignota sopra soglia: nel dubbio si avvisa', () => {
    expect(daNotificare([bando({ pertinenza: 60, ammissibilita: 'ignota' })], 35)).toHaveLength(1);
  });

  it('ordina per pertinenza decrescente', () => {
    const out = daNotificare(
      [bando({ id: 'b'.repeat(64), pertinenza: 40 }), bando({ pertinenza: 90 })], 35);
    expect(out[0]!.pertinenza).toBe(90);
  });
});

describe('oggetto', () => {
  it('usa il singolare per un bando solo', () => {
    expect(oggetto([bando()])).toBe('Radar Bandi: 1 nuovo bando');
  });

  it('usa il plurale per piu\' bandi', () => {
    expect(oggetto([bando(), bando({ id: 'b'.repeat(64) })])).toBe('Radar Bandi: 2 nuovi bandi');
  });
});

describe('corpoHtml', () => {
  it('include titolo, ente e link', () => {
    const html = corpoHtml([bando()]);
    expect(html).toContain('Bando web serie');
    expect(html).toContain('CSVnet');
    expect(html).toContain('https://x.it/a');
  });

  it('dice quale ente deve firmare la domanda', () => {
    expect(corpoHtml([bando()])).toContain('Storie di Piazza APS');
  });

  it('riporta la frase da cui e\' dedotta l\'ammissibilita\'', () => {
    expect(corpoHtml([bando()])).toContain('Possono partecipare le associazioni.');
  });

  it('protegge dai caratteri speciali nei titoli', () => {
    const html = corpoHtml([bando({ titolo: 'Bando <script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/notify/formatta.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/notify/formatta.ts
import { ENTI, NOMI_LIVELLO } from '../config.ts';
import type { Bando } from '../tipi.ts';

/**
 * Chi merita una notifica: sopra soglia e non escluso in partenza.
 * Gli 'ignota' passano di proposito — nel dubbio si avvisa. Una notifica
 * di troppo costa trenta secondi, un bando perso costa il bando.
 */
export function daNotificare(bandi: Bando[], soglia: number): Bando[] {
  return bandi
    .filter((b) => b.pertinenza >= soglia && b.ammissibilita !== 'rosso')
    .sort((a, b) => b.pertinenza - a.pertinenza);
}

export function oggetto(bandi: Bando[]): string {
  return bandi.length === 1
    ? 'Radar Bandi: 1 nuovo bando'
    : `Radar Bandi: ${bandi.length} nuovi bandi`;
}

function esc(testo: string): string {
  return testo
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nomeEnte(id: string | null): string | null {
  return ENTI.find((e) => e.id === id)?.nome ?? null;
}

const COLORI: Record<string, string> = {
  verde: '#1a7f37', giallo: '#9a6700', rosso: '#cf222e', ignota: '#57606a',
};

function scheda(b: Bando): string {
  const ente = nomeEnte(b.entePropostoId);
  const data = new Date(b.dataPubblicazione).toLocaleDateString('it-IT');
  const righe: string[] = [
    `<h2 style="margin:0 0 4px;font-size:17px;">${esc(b.titolo)}</h2>`,
    `<p style="margin:0 0 10px;color:#57606a;font-size:13px;">`
      + `${esc(b.ente)} · ${esc(NOMI_LIVELLO[b.livello])} · pubblicato il ${data}`
      + `${b.dataIncerta ? ' (data non dichiarata dalla fonte)' : ''}</p>`,
  ];
  if (b.descrizioneBreve) {
    righe.push(`<p style="margin:0 0 10px;">${esc(b.descrizioneBreve)}</p>`);
  }
  if (ente !== null) {
    righe.push(`<p style="margin:0 0 6px;color:${COLORI[b.ammissibilita]};">`
      + `<strong>Presenta: ${esc(ente)}</strong></p>`);
  }
  if (b.motivoAmmissibilita !== null) {
    righe.push(`<p style="margin:0 0 10px;color:#57606a;font-size:13px;">`
      + `Dal bando: «${esc(b.motivoAmmissibilita)}»</p>`);
  }
  righe.push(`<p style="margin:0;"><a href="${esc(b.url)}">Apri il bando originale</a>`
    + ` · pertinenza ${b.pertinenza}/100</p>`);

  return `<div style="border-left:3px solid ${COLORI[b.ammissibilita]};`
    + `padding:0 0 0 14px;margin:0 0 26px;">${righe.join('')}</div>`;
}

export function corpoHtml(bandi: Bando[]): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;`
    + `max-width:640px;line-height:1.5;color:#1f2328;">`
    + `<p style="margin:0 0 22px;color:#57606a;">`
    + `Controllo del ${new Date().toLocaleDateString('it-IT')}.</p>`
    + bandi.map(scheda).join('')
    + `</div>`;
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/notify/formatta.test.ts`
Expected: PASS, 11 test.

- [ ] **Step 5: Commit**

```bash
git add src/notify/formatta.ts test/notify/formatta.test.ts
git commit -m "Formattazione delle notifiche, con l'ente proponente in evidenza"
```

---

## Task 14: Invio email

**Files:**
- Create: `src/notify/email.ts`
- Test: `test/notify/email.test.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// test/notify/email.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invii: unknown[] = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async (opzioni: unknown) => { invii.push(opzioni); return { messageId: 'x' }; },
    }),
  },
}));

const { inviaEmail } = await import('../../src/notify/email.ts');

beforeEach(() => { invii.length = 0; });

describe('inviaEmail', () => {
  it('non invia nulla quando non ci sono bandi', async () => {
    const esito = await inviaEmail([], { host: 'h', porta: 587, utente: 'u', password: 'p' });
    expect(esito.inviata).toBe(false);
    expect(invii).toHaveLength(0);
  });

  it('non invia se mancano le credenziali, e lo dice', async () => {
    const esito = await inviaEmail(
      [{ titolo: 'T' } as never],
      { host: '', porta: 587, utente: '', password: '' },
    );
    expect(esito.inviata).toBe(false);
    expect(esito.motivo).toContain('credenziali');
    expect(invii).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/notify/email.test.ts`
Expected: FAIL — import non risolto.

- [ ] **Step 3: Implementare**

```ts
// src/notify/email.ts
import nodemailer from 'nodemailer';
import { DESTINATARI_EMAIL } from '../config.ts';
import { corpoHtml, oggetto } from './formatta.ts';
import type { Bando } from '../tipi.ts';

export type Credenziali = {
  host: string;
  porta: number;
  utente: string;
  password: string;
};

export type EsitoInvio = {
  inviata: boolean;
  motivo: string | null;
};

export function credenzialiDaAmbiente(): Credenziali {
  return {
    host: process.env['SMTP_HOST'] ?? '',
    porta: Number(process.env['SMTP_PORT'] ?? 587),
    utente: process.env['SMTP_USER'] ?? '',
    password: process.env['SMTP_PASS'] ?? '',
  };
}

/**
 * Niente email quando non c'e' niente da dire. Un messaggio quotidiano che
 * nove volte su dieci dice "nessuna novita'" smette di essere letto in due
 * settimane, e a quel punto avremmo ricostruito il problema di partenza.
 */
export async function inviaEmail(bandi: Bando[], cred: Credenziali): Promise<EsitoInvio> {
  if (bandi.length === 0) {
    return { inviata: false, motivo: 'nessun bando da segnalare' };
  }
  if (!cred.host || !cred.utente || !cred.password) {
    return { inviata: false, motivo: 'credenziali SMTP assenti' };
  }

  const trasporto = nodemailer.createTransport({
    host: cred.host,
    port: cred.porta,
    secure: cred.porta === 465,
    auth: { user: cred.utente, pass: cred.password },
  });

  await trasporto.sendMail({
    from: `"Radar Bandi" <${cred.utente}>`,
    to: DESTINATARI_EMAIL.join(', '),
    subject: oggetto(bandi),
    html: corpoHtml(bandi),
  });

  return { inviata: true, motivo: null };
}

/** Allarme separato: riguarda il sistema, non i bandi. */
export async function inviaAllarmeFonti(
  fonti: string[],
  cred: Credenziali,
): Promise<EsitoInvio> {
  if (fonti.length === 0) return { inviata: false, motivo: 'nessuna fonte sospetta' };
  if (!cred.host || !cred.utente || !cred.password) {
    return { inviata: false, motivo: 'credenziali SMTP assenti' };
  }

  const trasporto = nodemailer.createTransport({
    host: cred.host, port: cred.porta, secure: cred.porta === 465,
    auth: { user: cred.utente, pass: cred.password },
  });

  await trasporto.sendMail({
    from: `"Radar Bandi" <${cred.utente}>`,
    to: DESTINATARI_EMAIL.join(', '),
    subject: `Radar Bandi: ${fonti.length} fonti non rispondono`,
    html: `<p>Queste fonti non portano risultati da tre controlli consecutivi:</p>`
      + `<ul>${fonti.map((f) => `<li>${f}</li>`).join('')}</ul>`
      + `<p>Finche' non vengono riparate, i bandi pubblicati li' non arrivano.</p>`,
  });

  return { inviata: true, motivo: null };
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/notify/email.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 5: Commit**

```bash
git add src/notify/email.ts test/notify/email.test.ts
git commit -m "Invio email dei nuovi bandi e allarme sulle fonti mute"
```

---

## Task 15: Orchestratore della raccolta

**Files:**
- Create: `src/raccolta.ts`
- Create: `data/bandi.json`
- Create: `data/salute.json`

- [ ] **Step 1: Creare i file di archivio vuoti**

```bash
mkdir -p data
echo '[]' > data/bandi.json
echo '{}' > data/salute.json
```

- [ ] **Step 2: Implementare l'orchestratore**

```ts
// src/raccolta.ts
import { readFile, writeFile } from 'node:fs/promises';
import {
  FINESTRA_GIORNI, FINESTRA_PRIMO_AVVIO, SOGLIA_NOTIFICA, GIORNI_ALLARME_FONTE,
} from './config.ts';
import { ADATTATORI } from './sources/registro.ts';
import { dentroLaFinestra } from './pipeline/finestra.ts';
import { costruisciBando, fondi } from './pipeline/archivio.ts';
import { aggiornaStorico, fonteSospetta, type Storico } from './health/salute.ts';
import { daNotificare } from './notify/formatta.ts';
import { credenzialiDaAmbiente, inviaAllarmeFonti, inviaEmail } from './notify/email.ts';
import type { Bando, EsitoFonte } from './tipi.ts';

const FILE_BANDI = 'data/bandi.json';
const FILE_SALUTE = 'data/salute.json';
const STORICO_MAX = 30;
const MS_PER_GIORNO = 24 * 60 * 60 * 1000;

async function leggiJson<T>(percorso: string, riserva: T): Promise<T> {
  try {
    return JSON.parse(await readFile(percorso, 'utf8')) as T;
  } catch {
    return riserva;
  }
}

export async function raccogli(adesso = new Date()): Promise<void> {
  const archivio = await leggiJson<Bando[]>(FILE_BANDI, []);
  const storico = await leggiJson<Storico>(FILE_SALUTE, {});

  // Al primo avvio si recupera un mese, cosi' la piattaforma nasce gia' piena.
  const giorni = archivio.length === 0 ? FINESTRA_PRIMO_AVVIO : FINESTRA_GIORNI;
  const daQuando = new Date(adesso.getTime() - giorni * MS_PER_GIORNO);
  console.log(`Controllo del ${adesso.toISOString()} — finestra di ${giorni} giorni`);

  const esiti: EsitoFonte[] = [];
  const raccolti: Bando[] = [];

  // Ogni adattatore gira isolato: un errore su una fonte non ferma le altre.
  for (const adattatore of ADATTATORI) {
    const inizio = Date.now();
    try {
      const grezzi = await adattatore.cerca(daQuando);
      const dentro = grezzi.filter((g) => dentroLaFinestra(g.dataPubblicazione, adesso, giorni));
      for (const g of dentro) {
        raccolti.push(costruisciBando(g, adattatore.ente, adattatore.livello, adesso));
      }
      esiti.push({
        fonteId: adattatore.id, ok: true, risultati: dentro.length,
        durataMs: Date.now() - inizio, errore: null, quando: adesso.toISOString(),
      });
      console.log(`  OK   ${adattatore.id.padEnd(20)} ${dentro.length} nella finestra`);
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      esiti.push({
        fonteId: adattatore.id, ok: false, risultati: 0,
        durataMs: Date.now() - inizio, errore: messaggio, quando: adesso.toISOString(),
      });
      console.error(`  FAIL ${adattatore.id.padEnd(20)} ${messaggio}`);
    }
  }

  const { tutti, nuovi } = fondi(archivio, raccolti);
  const storicoNuovo = aggiornaStorico(storico, esiti, STORICO_MAX);

  await writeFile(FILE_BANDI, `${JSON.stringify(tutti, null, 2)}\n`, 'utf8');
  await writeFile(FILE_SALUTE, `${JSON.stringify(storicoNuovo, null, 2)}\n`, 'utf8');

  const sospette = ADATTATORI
    .filter((a) => fonteSospetta(storicoNuovo[a.id] ?? [], GIORNI_ALLARME_FONTE))
    .map((a) => a.nome);

  const cred = credenzialiDaAmbiente();
  const daMandare = daNotificare(nuovi, SOGLIA_NOTIFICA);
  const esitoEmail = await inviaEmail(daMandare, cred);
  const esitoAllarme = await inviaAllarmeFonti(sospette, cred);

  console.log(`\nTotale in archivio: ${tutti.length}`);
  console.log(`Nuovi in questo controllo: ${nuovi.length}`);
  console.log(`Notificati: ${daMandare.length} — email ${esitoEmail.inviata ? 'inviata' : `non inviata (${esitoEmail.motivo})`}`);
  if (sospette.length > 0) {
    console.log(`ATTENZIONE, fonti mute: ${sospette.join(', ')} — allarme ${esitoAllarme.inviata ? 'inviato' : 'non inviato'}`);
  }
}

await raccogli();
```

- [ ] **Step 3: Eseguire la raccolta dal vivo**

Run: `npm run raccolta`
Expected: sette righe `OK` con conteggi, poi il riepilogo. `data/bandi.json` non è più `[]`.
L'email risulta non inviata con motivo "credenziali SMTP assenti": è corretto, le credenziali arrivano nel Task 16.

- [ ] **Step 4: Controllare che l'archivio abbia senso**

```bash
node -e "
const b = require('./data/bandi.json');
console.log('totale:', b.length);
console.log('per livello:', b.reduce((a,x)=>(a[x.livello]=(a[x.livello]||0)+1,a),{}));
console.log('sopra soglia 35:', b.filter(x=>x.pertinenza>=35).length);
console.log('');
b.filter(x=>x.pertinenza>=35).slice(0,5).forEach(x=>
  console.log(x.pertinenza, '|', x.ammissibilita, '|', x.titolo.slice(0,70)));
"
```

Expected: un totale maggiore di zero, più livelli rappresentati, e i bandi a punteggio alto devono essere plausibilmente attinenti a cinema o giovani. **Se i primi risultati sono palesemente fuori tema, fermarsi e tarare i pesi in `src/config.ts` prima di proseguire.**

- [ ] **Step 5: Commit**

```bash
git add src/raccolta.ts data/bandi.json data/salute.json
git commit -m "Orchestratore della raccolta, con isolamento degli errori per fonte"
```

---

## Task 16: Esecuzione automatica giornaliera

**Files:**
- Create: `.github/workflows/raccolta.yml`

- [ ] **Step 1: Creare il workflow**

```yaml
name: Raccolta bandi

on:
  schedule:
    # GitHub lavora in UTC e ignora l'ora legale. Due orari coprono entrambi
    # i regimi; la seconda esecuzione si ferma da sola se la prima e' riuscita.
    - cron: '0 5 * * *'
    - cron: '0 6 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  raccolta:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Salta se ha gia' girato nelle ultime 12 ore
        id: guardia
        run: |
          ultimo=$(git log -1 --format=%ct -- data/bandi.json || echo 0)
          adesso=$(date +%s)
          if [ $((adesso - ultimo)) -lt 43200 ]; then
            echo "salta=si" >> "$GITHUB_OUTPUT"
            echo "Gia' eseguita meno di 12 ore fa, si salta."
          else
            echo "salta=no" >> "$GITHUB_OUTPUT"
          fi

      - name: Raccolta
        if: steps.guardia.outputs.salta == 'no'
        env:
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
        run: npm run raccolta

      - name: Salva i risultati
        if: steps.guardia.outputs.salta == 'no'
        run: |
          git config user.name "Radar Bandi"
          git config user.email "actions@github.com"
          git add data/bandi.json data/salute.json
          if git diff --staged --quiet; then
            echo "Nessuna novita' da registrare."
          else
            git commit -m "Raccolta del $(date +%Y-%m-%d)"
            git push
          fi
```

- [ ] **Step 2: Verificare la sintassi YAML**

Run: `node -e "console.log(require('fs').readFileSync('.github/workflows/raccolta.yml','utf8').length, 'byte')"`
Expected: un numero maggiore di zero. Il controllo vero lo fa GitHub al primo push.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/raccolta.yml
git commit -m "Esecuzione giornaliera su GitHub Actions, robusta all'ora legale"
```

- [ ] **Step 4: Nota per chi configura il repository**

Da fare a mano su GitHub, una volta sola, in *Settings → Secrets and variables → Actions*:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
Con Gmail serve una *password per le app*, non la password dell'account.
Finché i segreti mancano la raccolta funziona lo stesso: salta solo l'invio dell'email.

---

## Task 17: Il sito — elenco e filtri

**Files:**
- Create: `web/index.html`
- Create: `web/stile.css`
- Create: `web/app.js`

Nessun test automatico: è interfaccia, si verifica aprendola. La logica che merita test vive già nei moduli precedenti.

- [ ] **Step 1: Creare `web/index.html`**

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar Bandi</title>
<link rel="stylesheet" href="stile.css">
</head>
<body>
<header>
  <h1>Radar Bandi</h1>
  <p class="sottotitolo">Se finissero le parole — monitoraggio bandi</p>
  <p class="aggiornamento" id="aggiornamento"></p>
</header>

<section class="filtri" aria-label="Filtri">
  <input type="search" id="cerca" placeholder="Cerca per titolo o ente">
  <div class="gruppo" id="filtro-livello" data-campo="livello"></div>
  <div class="gruppo" id="filtro-ammissibilita" data-campo="ammissibilita"></div>
  <div class="gruppo" id="filtro-stato" data-campo="stato"></div>
</section>

<p class="conteggio" id="conteggio"></p>
<main id="elenco"></main>

<section class="salute">
  <h2>Stato delle fonti</h2>
  <div id="salute"></div>
</section>

<dialog id="popup">
  <h2 id="popup-titolo"></h2>
  <div id="popup-elenco"></div>
  <button id="popup-chiudi">Ho capito</button>
</dialog>

<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Creare `web/stile.css`**

```css
:root {
  --testo: #1f2328; --debole: #57606a; --bordo: #d0d7de; --sfondo: #ffffff;
  --verde: #1a7f37; --giallo: #9a6700; --rosso: #cf222e; --ignota: #57606a;
  --evidenza: #0969da;
}
@media (prefers-color-scheme: dark) {
  :root {
    --testo: #e6edf3; --debole: #8d96a0; --bordo: #30363d; --sfondo: #0d1117;
    --verde: #3fb950; --giallo: #d29922; --rosso: #f85149; --ignota: #8d96a0;
    --evidenza: #4493f8;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 24px 16px 60px; max-width: 860px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.55; color: var(--testo); background: var(--sfondo);
}
h1 { margin: 0; font-size: 26px; }
.sottotitolo { margin: 2px 0 0; color: var(--debole); }
.aggiornamento { margin: 4px 0 0; color: var(--debole); font-size: 13px; }
.filtri { margin: 24px 0 8px; display: flex; flex-direction: column; gap: 10px; }
#cerca {
  width: 100%; padding: 9px 12px; font-size: 15px;
  border: 1px solid var(--bordo); border-radius: 8px;
  background: var(--sfondo); color: var(--testo);
}
.gruppo { display: flex; flex-wrap: wrap; gap: 6px; }
.gruppo button {
  padding: 5px 11px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--bordo); border-radius: 999px;
  background: transparent; color: var(--debole);
}
.gruppo button[aria-pressed="true"] {
  background: var(--evidenza); border-color: var(--evidenza); color: #fff;
}
.conteggio { color: var(--debole); font-size: 13px; margin: 14px 0; }
.scheda {
  border: 1px solid var(--bordo); border-left-width: 4px;
  border-radius: 8px; padding: 14px 16px; margin-bottom: 14px;
}
.scheda.verde { border-left-color: var(--verde); }
.scheda.giallo { border-left-color: var(--giallo); }
.scheda.rosso { border-left-color: var(--rosso); }
.scheda.ignota { border-left-color: var(--ignota); }
.scheda h3 { margin: 0 0 4px; font-size: 16px; }
.meta { color: var(--debole); font-size: 12.5px; margin: 0 0 8px; }
.presenta { font-weight: 600; margin: 0 0 4px; }
.presenta.verde { color: var(--verde); }
.presenta.giallo { color: var(--giallo); }
.presenta.rosso { color: var(--rosso); }
.citazione {
  margin: 0 0 10px; color: var(--debole); font-size: 13px;
  border-left: 2px solid var(--bordo); padding-left: 10px;
}
.azioni { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.azioni a, .azioni button {
  font-size: 13px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--bordo); background: transparent;
  color: var(--evidenza); text-decoration: none;
}
.nuovo {
  background: var(--evidenza); color: #fff; font-size: 11px;
  padding: 1px 7px; border-radius: 999px; margin-left: 6px; vertical-align: 2px;
}
.salute { margin-top: 48px; border-top: 1px solid var(--bordo); padding-top: 18px; }
.salute h2 { font-size: 15px; margin: 0 0 10px; }
.fonte { font-size: 13px; color: var(--debole); margin-bottom: 4px; }
.fonte .pallino { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; }
dialog { border: 1px solid var(--bordo); border-radius: 10px; max-width: 520px;
         background: var(--sfondo); color: var(--testo); }
dialog::backdrop { background: rgba(0,0,0,.45); }
dialog button { margin-top: 14px; padding: 7px 16px; cursor: pointer;
                border: 1px solid var(--bordo); border-radius: 6px;
                background: var(--evidenza); color: #fff; }
```

- [ ] **Step 3: Creare `web/app.js`**

```js
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

let bandi = [];
let salute = {};
const filtri = { livello: null, ammissibilita: null, stato: null, cerca: '' };

function leggiSalvati() {
  try { return new Set(JSON.parse(localStorage.getItem(CHIAVE_SALVATI) ?? '[]')); }
  catch { return new Set(); }
}

function scriviSalvati(insieme) {
  try { localStorage.setItem(CHIAVE_SALVATI, JSON.stringify([...insieme])); }
  catch { /* modalita' privata: si prosegue senza memoria */ }
}

let salvati = leggiSalvati();

function ultimaVisita() {
  try { return localStorage.getItem(CHIAVE_ULTIMA_VISITA); } catch { return null; }
}

function eNuovo(bando, da) {
  return da === null || bando.vistoIl > da;
}

function giorniAllaScadenza(iso) {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
}

function schedaHtml(bando, da) {
  const nuovo = eNuovo(bando, da) ? '<span class="nuovo">nuovo</span>' : '';
  const ente = ENTI[bando.entePropostoId] ?? null;
  const data = new Date(bando.dataPubblicazione).toLocaleDateString('it-IT');
  const giorni = giorniAllaScadenza(bando.scadenza);
  const messaggio = encodeURIComponent(`${bando.titolo}\n${bando.ente}\n${bando.url}`);

  return `
    <article class="scheda ${bando.ammissibilita}">
      <h3>${escapeHtml(bando.titolo)}${nuovo}</h3>
      <p class="meta">
        ${escapeHtml(bando.ente)} · ${LIVELLI[bando.livello] ?? bando.livello}
        · pubblicato il ${data}${bando.dataIncerta ? ' (data non dichiarata)' : ''}
        · pertinenza ${bando.pertinenza}/100
        ${giorni !== null ? ` · scade fra ${giorni} giorni` : ''}
      </p>
      ${bando.descrizioneBreve ? `<p>${escapeHtml(bando.descrizioneBreve)}</p>` : ''}
      <p class="presenta ${bando.ammissibilita}">
        ${ente ? `Presenta: ${ente}` : AMMISSIBILITA[bando.ammissibilita]}
      </p>
      ${bando.motivoAmmissibilita
        ? `<p class="citazione">Dal bando: «${escapeHtml(bando.motivoAmmissibilita)}»</p>` : ''}
      <div class="azioni">
        <a href="${escapeHtml(bando.url)}" target="_blank" rel="noopener">Apri il bando</a>
        <button data-salva="${bando.id}">${salvati.has(bando.id) ? 'Salvato' : 'Salva'}</button>
        <a href="https://wa.me/?text=${messaggio}" target="_blank" rel="noopener">Inoltra su WhatsApp</a>
      </div>
    </article>`;
}

function escapeHtml(testo) {
  return String(testo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function filtra() {
  const q = filtri.cerca.toLowerCase();
  const da = ultimaVisita();
  return bandi.filter((b) => {
    if (filtri.livello && b.livello !== filtri.livello) return false;
    if (filtri.ammissibilita && b.ammissibilita !== filtri.ammissibilita) return false;
    if (filtri.stato === 'nuovi' && !eNuovo(b, da)) return false;
    if (filtri.stato === 'salvati' && !salvati.has(b.id)) return false;
    if (q && !`${b.titolo} ${b.ente}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function disegna() {
  const da = ultimaVisita();
  const visibili = filtra();
  document.getElementById('conteggio').textContent =
    `${visibili.length} bandi su ${bandi.length} in archivio`;
  document.getElementById('elenco').innerHTML =
    visibili.length === 0
      ? '<p>Nessun bando corrisponde ai filtri.</p>'
      : visibili.map((b) => schedaHtml(b, da)).join('');

  document.querySelectorAll('[data-salva]').forEach((bottone) => {
    bottone.addEventListener('click', () => {
      const id = bottone.dataset.salva;
      if (salvati.has(id)) salvati.delete(id); else salvati.add(id);
      scriviSalvati(salvati);
      disegna();
    });
  });
}

function creaFiltri(contenitore, voci, campo) {
  contenitore.innerHTML = voci
    .map(([valore, etichetta]) =>
      `<button data-valore="${valore}" aria-pressed="false">${etichetta}</button>`)
    .join('');
  contenitore.querySelectorAll('button').forEach((bottone) => {
    bottone.addEventListener('click', () => {
      const valore = bottone.dataset.valore;
      filtri[campo] = filtri[campo] === valore ? null : valore;
      contenitore.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.valore === filtri[campo]));
      });
      disegna();
    });
  });
}

function disegnaSalute() {
  const colore = (esiti) => {
    if (!esiti || esiti.length === 0) return 'var(--ignota)';
    const ultimi = esiti.slice(-3);
    if (ultimi.length >= 3 && ultimi.every((e) => !e.ok || e.risultati === 0)) return 'var(--rosso)';
    const ultimo = esiti[esiti.length - 1];
    return ultimo.ok ? 'var(--verde)' : 'var(--giallo)';
  };
  document.getElementById('salute').innerHTML = Object.entries(salute)
    .map(([id, esiti]) => {
      const ultimo = esiti[esiti.length - 1];
      const quando = ultimo ? new Date(ultimo.quando).toLocaleDateString('it-IT') : 'mai';
      return `<p class="fonte"><span class="pallino" style="background:${colore(esiti)}"></span>
        ${id} — ultimo controllo ${quando}, ${ultimo ? ultimo.risultati : 0} risultati</p>`;
    })
    .join('');
}

function mostraPopup() {
  const da = ultimaVisita();
  if (da === null) return;
  const nuovi = bandi.filter((b) => eNuovo(b, da) && b.pertinenza >= 35 && b.ammissibilita !== 'rosso');
  if (nuovi.length === 0) return;

  document.getElementById('popup-titolo').textContent =
    nuovi.length === 1 ? '1 nuovo bando dall\'ultima visita' : `${nuovi.length} nuovi bandi dall'ultima visita`;
  document.getElementById('popup-elenco').innerHTML = nuovi
    .slice(0, 8)
    .map((b) => `<p><strong>${escapeHtml(b.titolo)}</strong><br>
      <span class="meta">${escapeHtml(b.ente)} · pertinenza ${b.pertinenza}/100</span></p>`)
    .join('');
  document.getElementById('popup').showModal();
}

async function avvia() {
  const [risposta, rispostaSalute] = await Promise.all([
    fetch('../data/bandi.json'),
    fetch('../data/salute.json'),
  ]);
  bandi = await risposta.json();
  salute = await rispostaSalute.json();

  const piuRecente = bandi.reduce((m, b) => (b.vistoIl > m ? b.vistoIl : m), '');
  document.getElementById('aggiornamento').textContent =
    piuRecente ? `Ultimo controllo: ${new Date(piuRecente).toLocaleString('it-IT')}` : '';

  creaFiltri(document.getElementById('filtro-livello'), Object.entries(LIVELLI), 'livello');
  creaFiltri(document.getElementById('filtro-ammissibilita'), Object.entries(AMMISSIBILITA), 'ammissibilita');
  creaFiltri(document.getElementById('filtro-stato'),
    [['nuovi', 'Solo nuovi'], ['salvati', 'Salvati']], 'stato');

  document.getElementById('cerca').addEventListener('input', (e) => {
    filtri.cerca = e.target.value;
    disegna();
  });
  document.getElementById('popup-chiudi').addEventListener('click', () => {
    document.getElementById('popup').close();
  });

  disegna();
  disegnaSalute();
  mostraPopup();

  // Si segna la visita solo dopo aver mostrato il popup, altrimenti
  // i bandi nuovi risulterebbero gia' visti.
  try { localStorage.setItem(CHIAVE_ULTIMA_VISITA, new Date().toISOString()); } catch {}
}

avvia();
```

- [ ] **Step 4: Aprire e verificare a mano**

```bash
npx serve . -p 4321
```

Aprire `http://localhost:4321/web/` e controllare, una per una:
1. L'elenco mostra i bandi raccolti nel Task 15.
2. Cliccando "Terzo settore" restano solo quelli di InfoBandi e CTV; ricliccando torna tutto.
3. La ricerca filtra per titolo ed ente.
4. "Salva" cambia in "Salvato" e il filtro "Salvati" lo trova.
5. Ricaricando la pagina il salvataggio è ancora lì.
6. "Inoltra su WhatsApp" apre WhatsApp con titolo e link già scritti.
7. La sezione in fondo elenca le sette fonti con il pallino verde.
8. Le schede verdi dicono quale ente deve presentare la domanda.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "Sito: elenco, filtri, salvataggi, popup novita' e semaforo fonti"
```

---

## Task 18: Pubblicazione del sito

**Files:**
- Modify: `.github/workflows/raccolta.yml`
- Create: `.github/workflows/pubblica.yml`

- [ ] **Step 1: Spostare i dati accanto al sito**

Il sito su GitHub Pages non può risalire fuori dalla propria cartella con `../data/`. Si pubblica una cartella che contiene sia il sito sia i dati.

Modificare `web/app.js`, dentro `avvia()`, sostituendo:

```js
  const [risposta, rispostaSalute] = await Promise.all([
    fetch('../data/bandi.json'),
    fetch('../data/salute.json'),
  ]);
```

con:

```js
  const [risposta, rispostaSalute] = await Promise.all([
    fetch('bandi.json'),
    fetch('salute.json'),
  ]);
```

- [ ] **Step 2: Creare `.github/workflows/pubblica.yml`**

```yaml
name: Pubblica il sito

on:
  push:
    branches: [main]
    paths: ['web/**', 'data/**', '.github/workflows/pubblica.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  pubblica:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Comporre il sito con i dati accanto
        run: |
          mkdir -p sito
          cp web/* sito/
          cp data/bandi.json data/salute.json sito/

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: sito
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verificare in locale che il sito funzioni con i dati accanto**

```bash
mkdir -p sito && cp web/* sito/ && cp data/bandi.json data/salute.json sito/
npx serve sito -p 4321
```

Aprire `http://localhost:4321/` e ripetere i controlli del Task 17 Step 4.
Expected: tutto funziona come prima, senza errori in console.

```bash
rm -rf sito
```

- [ ] **Step 4: Commit**

```bash
git add web/app.js .github/workflows/pubblica.yml
git commit -m "Pubblicazione su GitHub Pages con i dati serviti accanto al sito"
```

- [ ] **Step 5: Nota per chi configura il repository**

Da fare a mano su GitHub, una volta sola: *Settings → Pages → Source: GitHub Actions*.
Poi *Settings → Actions → General → Workflow permissions: Read and write*, altrimenti la raccolta non può salvare i risultati.

---

## Task 19: Verifica di accettazione

Il piano non è finito quando i test passano, ma quando i risultati corrispondono alla realtà.

- [ ] **Step 1: Eseguire tutta la suite**

Run: `npm test`
Expected: tutti i test passano. Annotare il numero totale.

- [ ] **Step 2: Controllo di tipo**

Run: `npm run typecheck`
Expected: nessun errore.

- [ ] **Step 3: Raccolta dal vivo**

Run: `npm run raccolta`
Expected: sette righe `OK`.

- [ ] **Step 4: Confronto con la realtà — il controllo che conta**

Per **tre** delle sette fonti, aprire il sito vero nel browser e confrontare a mano con l'archivio:

```bash
node -e "
const b = require('./data/bandi.json');
['mic','piemonte','infobandi'].forEach(f => {
  console.log('\n=== ' + f + ' ===');
  b.filter(x => x.fonteId === f).slice(0, 8).forEach(x =>
    console.log(x.dataPubblicazione.slice(0,10), '|', x.titolo.slice(0, 70)));
});
"
```

Confrontare con:
- https://cinema.cultura.gov.it/comunicazione/avvisi/
- https://bandi.regione.piemonte.it/
- https://infobandi.csvnet.it/

**Domanda a cui rispondere:** i bandi pubblicati su quei siti negli ultimi 7 giorni compaiono tutti nell'archivio? Se ne manca anche uno solo, trovare il perché prima di dichiarare finito. Un bando che sfugge è esattamente il difetto che questa piattaforma esiste per eliminare.

- [ ] **Step 5: Verificare che l'email parta davvero**

Configurare i segreti SMTP in locale e lanciare:

```bash
SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... npm run raccolta
```

Expected: l'email arriva, le schede sono leggibili su telefono, i link si aprono.
Se non ci sono bandi nuovi non parte nulla: per provare, azzerare `data/bandi.json` con `echo '[]' > data/bandi.json` e rilanciare.

- [ ] **Step 6: Commit finale**

```bash
git add -A
git commit -m "Verifica di accettazione completata su sette fonti"
```

---

## Cosa resta fuori, e perché

Al termine di questo piano la piattaforma controlla ogni giorno sette fonti, pubblica un sito con i filtri richiesti e manda l'email. **È già in funzione e già utile.**

Restano per un piano successivo:

1. **Gli adattatori HTML** — Fondazione CRB Biella per prima, poi FCTP, Comune e Provincia di Biella, Fondazione Con i Bambini, MIM, Europa Creativa, Eurimages. Sono più laboriosi e più fragili: hanno senso una volta che l'impalcatura è collaudata.
2. **Le notifiche push sul telefono** — PWA con service worker e Cloudflare Worker per lo smistamento. Richiede un account Cloudflare della produzione.
3. **L'estrazione di scadenza e importo** — oggi `scadenza` e `importo` restano nulli perché i feed non li espongono: vanno letti dalla pagina del bando, che è lavoro da adattatore HTML.
4. **I promemoria di scadenza a 14, 7, 3 e 1 giorno** — dipendono dal punto 3.
