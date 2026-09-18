# Radar Bandi — specifica di progetto

**Data:** 18 settembre 2026
**Stato:** approvata in fase di design, da implementare

---

## 1. Il problema

### Il progetto da finanziare

**"Se finissero le parole"** — web serie di 4 episodi da 20–30 minuti sul disagio giovanile, ideata,
scritta e interpretata da ragazzi e ragazze a partire da esperienze personali di bullismo e conflitti.
Ha sede a Biella. L'episodio pilota è già stato realizzato nel 2025; servono i 3 episodi restanti.

Temi trattati: bullismo, cyberbullismo, discriminazione per orientamento sessuale, identità di genere,
maschilismo, disabilità, depressione, introversione, fragilità relazionale.

Il progetto si articola in tre fasi — formazione dei ragazzi affiancati da regista, sceneggiatore,
psicologi ed educatori; produzione con troupe professionale; distribuzione online, nelle scuole, nei
festival e nei luoghi di cultura. Obiettivo di budget: **75.000 €**.

### Chi c'è dietro: gli enti disponibili

Questo è il dato che determina a quali bandi si può realmente partecipare, e va scritto nero su bianco
perché è il cuore della configurazione della piattaforma.

| Ente | Forma giuridica | Cosa sblocca |
|---|---|---|
| **Storie di Piazza** | APS — associazione di promozione sociale, ente del terzo settore | Bandi terzo settore, fondazioni bancarie, politiche giovanili, ANG, bandi sociali ed educativi |
| **Fondazione Marco Falco** | Fondazione, opera nella prevenzione del disagio giovanile | Bandi socio-sanitari, prevenzione, salute mentale, povertà educativa |
| **VideoAstolfoSullaLuna Srl** | Società di produzione audiovisiva indipendente, Biella, fondata nel 1998, presente nell'elenco produttori della Film Commission Torino Piemonte | **Bandi cinema che richiedono un'impresa di produzione**: contributi selettivi MiC, fondi FCTP |
| Provincia di Biella e Comune di Biella | Patrocinio | Requisito di radicamento territoriale in molti bandi locali |
| Fondazione CRB e Fondazione Olly | Già sostenitori del pilota | Rapporto consolidato, riproponibile |

Inoltre: **il pilota 2025 è un'opera realizzata e distribuita**. Molti bandi chiedono esperienza
documentabile del proponente, e questo requisito risulta soddisfatto.

### Il problema operativo

La persona incaricata di monitorare i bandi ha smesso di farlo e nessuno se n'è accorto: sono stati persi
molti bandi. I bandi cinema italiani hanno finestre di 20–30 giorni e non riaprono.

**Il fallimento da prevenire non è "non avere un elenco di bandi". È "smettere di guardare senza
accorgersene".** Ogni decisione in questo documento discende da qui.

## 2. Obiettivi

1. Controllare ogni giorno in automatico le fonti di bandi, senza che nessuno debba ricordarsene.
2. Considerare solo i bandi pubblicati **il giorno stesso del controllo o nei 7 giorni precedenti**.
3. Notificare chi di dovere con descrizione breve, requisiti, scadenza e link all'originale.
4. Offrire un elenco consultabile con filtri per livello istituzionale e per tipo di ente.
5. Distinguere i bandi a cui la produzione **può realmente partecipare** da quelli in cui verrebbe
   esclusa in fase di ammissibilità.
6. **Accorgersi e avvisare quando il sistema stesso smette di funzionare.**

## 3. Non obiettivi

- Non è una piattaforma multi-utente aperta ad altre produzioni. Nessun login, nessun account.
- Non compila le domande di partecipazione né gestisce la rendicontazione.
- Non fa scraping di portali che richiedono autenticazione o che lo vietano nei termini di servizio.
- Non sostituisce la lettura del bando integrale: la scheda serve a decidere se leggerlo, non a candidarsi.

## 4. Decisioni prese

| Tema | Decisione |
|---|---|
| Esecuzione | GitHub Actions, cron giornaliero. Nessun server da mantenere, costo zero |
| Sito | Statico su GitHub Pages, legge un file JSON versionato nel repository |
| Accessi | Nessun login. Uso interno al gruppo |
| Finestra temporale | 7 giorni. Prima esecuzione: 30 giorni, per nascere con l'archivio pieno |
| Notifiche | Email giornaliera, push sul telefono, popup nel sito, inoltro WhatsApp manuale |
| Push | Sito installabile come app (PWA) + Web Push, con un Cloudflare Worker gratuito come tramite |
| Bandi non ammissibili | Mostrati in elenco con etichetta rossa e motivo, ma senza notifica |
| Territorio | Piemonte, provincia di Biella. Fonti nazionali ed europee valide comunque |
| Linguaggio | TypeScript su Node 24 per la raccolta. Frontend senza framework, HTML e JS puri |

### Perché il frontend senza framework

Questa piattaforma deve funzionare fra tre anni anche se nessuno la tocca. Un frontend in HTML e
JavaScript puri non ha dipendenze che scadono, non richiede una ricompilazione per essere aperto e
può essere modificato da chiunque sappia leggere HTML. La complessità richiesta dall'interfaccia
— filtri, schede, popup — non giustifica un framework.

## 5. Architettura

Il cron di GitHub Actions lavora **in UTC e non conosce l'ora legale**. Per avere l'esecuzione sempre
al mattino presto in Italia si pianificano due orari, `05:00` e `06:00` UTC, e la raccolta si interrompe
subito se ha già girato con successo nelle ultime 12 ore. Costa una riga di controllo ed evita che
d'inverno il controllo arrivi alle 06:00 e d'estate alle 09:00.

```
Ogni mattina presto (ora italiana), GitHub Actions:

  sources/*          →  pipeline/  →  scoring/  →  data/bandi.json  →  web/  (GitHub Pages)
  un file per fonte     normalizza    pertinenza    storico in git      elenco + filtri
                        deduplica     ammissibilità        │
                        filtra date                        ├→ notify/email
                                                           ├→ notify/push
       health/  ←──── esito di ogni fonte ──────────────→  └→ notify/scadenze
       semaforo + allarme se una fonte tace per 3 giorni
```

Sei componenti, ciascuno con una responsabilità sola e un'interfaccia dichiarata.

### 5.1 `sources/` — gli adattatori

Ogni fonte è **un file**, che espone una sola funzione con firma identica per tutti:

```ts
type Adattatore = {
  id: string;
  nome: string;
  livello: Livello;
  cerca(daQuando: Date): Promise<RisultatoGrezzo[]>;
};
```

Aggiungere una fonte significa scrivere un file nuovo e registrarlo nell'elenco. Nessun altro file
del progetto cambia. Un adattatore non sa nulla di punteggi, notifiche o interfaccia: restituisce
risultati grezzi e basta.

Tre famiglie di adattatori, in ordine di affidabilità:

- **API JSON** — la fonte espone dati strutturati. Preferita sempre.
- **RSS** — feed standard. Robusto, cambia raramente.
- **HTML** — lettura della pagina con `cheerio`. Funziona, ma si rompe se il sito viene rifatto.
  Per questo esiste il monitoraggio di salute.

### 5.2 `pipeline/` — normalizzazione

1. Converte ogni risultato grezzo nel formato unico `Bando`.
2. **Deduplica** con un'impronta stabile: `sha256(id_fonte + url_normalizzato)`. La stessa fonte che
   ripubblica un avviso con titolo ritoccato non genera un doppione.
3. **Filtra per data di pubblicazione**: tiene solo ciò che è uscito nella finestra configurata.
   Un bando senza data rilevabile viene tenuto e marcato `dataIncerta`, perché scartarlo in silenzio
   sarebbe il peggior esito possibile.
4. Fonde con l'archivio esistente: i bandi già noti mantengono lo stato (salvato, letto, ignorato).

### 5.3 `scoring/` — pertinenza e ammissibilità

Due valutazioni indipendenti.

**Pertinenza (0–100)** — quanto il bando riguarda questo progetto. Somma pesata di parole chiave su
titolo e descrizione, con due corsie tarate sui temi reali della serie:

- *corsia audiovisiva*: audiovisivo, web serie, serie, fiction, cortometraggio, documentario,
  produzione, sceneggiatura, riprese, montaggio, festival, opera prima, sviluppo, distribuzione
- *corsia giovani e sociale*: bullismo, cyberbullismo, disagio giovanile, adolescenti, giovani,
  under 35, povertà educativa, dispersione scolastica, salute mentale, benessere psicologico,
  prevenzione, discriminazione, identità di genere, violenza di genere, disabilità, scuola,
  peer education, protagonismo giovanile, terzo settore, educazione

**Un bando che pesca in entrambe le corsie riceve un bonus forte: è il bersaglio ideale.** Il progetto
vive esattamente nell'intersezione fra audiovisivo e disagio giovanile, e i bandi che stanno in quella
intersezione sono quelli con meno concorrenti e più probabilità di successo.

**Ammissibilità — con quale dei nostri enti si presenta**

Questa produzione non è un gruppo informale: dispone di un'APS, di una Fondazione e di una società di
produzione audiovisiva (vedi §1). La domanda giusta quindi non è *"possiamo partecipare?"* ma
**"chi di noi deve firmare la domanda?"**, che è molto più utile.

Il motore estrae dal testo il soggetto proponente richiesto e lo confronta con gli enti configurati:

- 🟢 **verde** — uno dei nostri enti è ammissibile. **La scheda dice quale**: "presenta Storie di Piazza APS",
  oppure "presenta VideoAstolfoSullaLuna Srl", oppure "presenta Fondazione Marco Falco".
- 🟡 **giallo** — serve un requisito in più che forse abbiamo o possiamo procurarci: un istituto
  scolastico capofila, un partenariato minimo, un'iscrizione a un registro, una coproduzione.
  La scheda dice **quale requisito manca**.
- 🔴 **rosso** — requisito che non abbiamo e non possiamo costruire in tempo: sede legale in altra
  regione, numero minimo di opere precedenti, fatturato o budget minimi fuori portata, coproduzione
  internazionale obbligatoria.

Gli enti disponibili stanno in `config.ts` in una lista. Se domani entra un nuovo partner, si aggiunge
una voce e tutto lo storico viene rivalutato: nessuna logica di ammissibilità è cablata nel codice.

Il colore è un'ipotesi, non un verdetto: la scheda mostra sempre **la frase del bando da cui è stato
dedotto**, così si controlla in due secondi. Un'euristica che non si può verificare è peggio di nessuna
euristica.

**Regola di notifica:** si notifica un bando solo se la pertinenza è **≥ 35 su 100** e l'ammissibilità
non è rossa. I rossi restano in elenco, visibili e filtrabili, ma non generano notifiche.
La soglia è un punto di partenza da tarare sui primi giorni reali: se arriva troppo rumore si alza,
se sfugge qualcosa si abbassa. Vive in `config.ts`, non sparsa nel codice.

I bandi con `ammissibilita: 'ignota'` **vengono notificati** se superano la soglia. Nel dubbio si avvisa:
una notifica di troppo costa trenta secondi, un bando perso costa il bando.

### 5.4 `notify/` — i canali

Ogni canale implementa la stessa interfaccia `invia(bandi, tipo)`. Sono intercambiabili e si attivano
o disattivano da configurazione.

| Canale | Quando | Contenuto |
|---|---|---|
| Email | Ogni mattina, **solo se ci sono novità** | Titolo, ente, descrizione breve, requisiti, scadenza, importo, link, colore ammissibilità |
| Push telefono | Subito dopo la raccolta | Titolo e ente; toccando si apre la scheda |
| Popup nel sito | All'apertura | I bandi nuovi dall'ultima visita, contati via `localStorage` |
| WhatsApp | Manuale | Pulsante su ogni scheda: apre WhatsApp con il messaggio già pronto da inoltrare al gruppo |
| Promemoria scadenze | 14, 7, 3 e 1 giorno prima | Solo per i bandi salvati |
| Allarme salute | Se una fonte tace per 3 giorni | "La fonte X non risponde dal giorno Y" |

**Niente email vuote.** Se in un giorno non esce nulla, non parte nulla. Un'email quotidiana che il 90%
delle volte dice "nessuna novità" viene ignorata entro due settimane, e a quel punto la piattaforma ha
riprodotto il problema che doveva risolvere.

### 5.5 `web/` — l'interfaccia

Pagina unica. Elenco di schede, ordinabile per data di pubblicazione, scadenza o pertinenza.

Filtri richiesti, combinabili:

- **Livello**: europeo · statale · Ministero della Cultura · regionale · provinciale · comunale ·
  fondazioni · terzo settore
- **Ammissibilità**: verde · giallo · rosso — e, per i verdi, quale ente presenta
- **Corsia**: audiovisiva · giovani e sociale
- **Scadenza**: entro 7 giorni · entro 30 giorni · oltre
- **Stato**: nuovi · salvati · tutti
- Ricerca libera su titolo ed ente

Ogni scheda: titolo, ente, livello, data di pubblicazione, **scadenza con giorni residui**, importo,
descrizione breve, requisiti, chi può partecipare, pulsante "apri il bando originale", pulsante
"salva", pulsante "inoltra su WhatsApp".

Installabile come app sul telefono (manifest PWA + service worker), con le notifiche push.

### 5.6 `health/` — il guardiano

Il componente che impedisce il ritorno del problema originale.

Ogni esecuzione scrive per ogni fonte: esito, numero di risultati, durata, eventuale errore.
Il sito mostra un semaforo per fonte con la data dell'ultimo successo.

**Una fonte che restituisce zero risultati per 3 giorni consecutivi è considerata sospetta**, anche
senza errori tecnici: è il sintomo tipico di un sito rifatto, dove il parser gira ma non trova più nulla.
In quel caso parte l'email di allarme.

Un errore su una fonte non interrompe le altre: ogni adattatore gira isolato.

## 6. Modello dati

```ts
type Bando = {
  id: string;                    // sha256(fonte + url normalizzato)
  titolo: string;
  ente: string;
  livello: 'europeo' | 'statale' | 'mic' | 'regionale' | 'provinciale' | 'comunale'
         | 'fondazione' | 'terzosettore';
  corsie: ('audiovisiva' | 'giovani')[];
  dataPubblicazione: string;     // ISO 8601
  dataIncerta: boolean;
  scadenza: string | null;
  importo: string | null;
  descrizioneBreve: string;      // max 400 caratteri
  requisiti: string[];
  chiPuoPartecipare: string | null;
  ammissibilita: 'verde' | 'giallo' | 'rosso' | 'ignota';
  entePropostoId: string | null;        // quale dei nostri enti deve firmare la domanda
  motivoAmmissibilita: string | null;   // la frase del bando da cui è dedotta
  pertinenza: number;            // 0–100
  url: string;
  fonteId: string;
  vistoIl: string;               // primo avvistamento
  salvato: boolean;
};
```

Archiviato in `data/bandi.json`, versionato in Git. Non serve un database: il volume è dell'ordine
delle centinaia di record e Git offre gratis lo storico completo di ogni modifica.

## 7. Le fonti

Stato verificato il 18 settembre 2026.

### Livello statale e Ministero della Cultura

| Fonte | Metodo | Verifica |
|---|---|---|
| MiC — Direzione generale Cinema e audiovisivo | API JSON WordPress `/wp-json/wp/v2/posts` con filtro data e categoria | ✅ risponde, date e categorie presenti |
| Gazzetta Ufficiale — serie concorsi | HTML | da implementare |
| SIAE — Per Chi Crea (riservato under 35) | HTML | da implementare |
| Agenzia Nazionale Giovani | RSS | ✅ feed attivo |
| Dipartimento Politiche Giovanili | HTML | da implementare |

### Livello regionale, provinciale e comunale

| Fonte | Metodo | Verifica |
|---|---|---|
| Bandi Regione Piemonte | RSS `bandi.regione.piemonte.it/tutti/rss.xml` | ✅ feed attivo, copre tutti i temi |
| Film Commission Torino Piemonte | HTML (news + film funds) | da implementare |
| Comune di Biella — albo e bandi | HTML | da implementare |
| Provincia di Biella | HTML | da implementare |

### Terzo settore ed educativo

Corsia aperta dal fatto che il progetto dispone di un'APS e di una Fondazione. È **la corsia con più
probabilità di successo** per arrivare a 75.000 €: molti meno concorrenti dei fondi cinema, e i temi
del progetto — bullismo, disagio giovanile, scuola — sono esattamente quelli finanziati.

| Fonte | Metodo | Verifica |
|---|---|---|
| **InfoBandi CSVnet** — aggregatore nazionale di bandi per il terzo settore | RSS `infobandi.csvnet.it/feed/` | ✅ feed attivo — **fonte a più alta resa del progetto** |
| **CTV Biella–Vercelli** — bandi e finanziamenti del territorio | RSS `centroterritorialevolontariato.org/feed/` | ✅ feed attivo |
| Fondazione Con i Bambini — povertà educativa minorile | HTML | da implementare — il sito blocca le richieste automatiche semplici, serve intestazione browser |
| Ministero dell'Istruzione e del Merito — bandi antibullismo e dispersione scolastica | HTML | da implementare |

### Fondazioni

| Fonte | Metodo | Verifica |
|---|---|---|
| Fondazione Cassa di Risparmio di Biella | HTML | da implementare — **massima priorità**: è locale, ha una linea dedicata a giovani ed educazione e ha già sostenuto il pilota |
| Fondazione CRT | RSS | ✅ feed attivo — finanzia lo Short Film Fund |
| Fondazione Compagnia di San Paolo | RSS | ✅ feed attivo — finanzia il Piemonte Film Tv Development Fund |
| Fondazione Olly | — | già sostenitrice del pilota, nessun canale pubblico rilevato: va seguita a mano |

### Livello europeo

| Fonte | Metodo | Verifica |
|---|---|---|
| Portale UE Funding & Tenders — Creative Europe | API pubblica | ❌ **risponde errore 500**. Piano B: lettura HTML della pagina delle call |
| Europa Creativa Desk Italia MEDIA | HTML | da implementare — nessun feed disponibile |
| Eurimages | HTML | da implementare |

**Nota sul portale UE:** l'API pubblica non è utilizzabile oggi. Si procede con la lettura HTML e si
lascia pronto l'adattatore API, da riattivare se il servizio torna. La fonte è comunque la meno urgente:
i bandi Creative Europe MEDIA richiedono quasi sempre società di produzione con opere all'attivo, quindi
per questa produzione sono in larga parte rossi.

## 8. Come verifico che funzioni

**Il rischio vero di questo progetto sono i parser HTML.** Un parser che smette di funzionare in silenzio
ricrea il problema originale.

- Per ogni fonte HTML salvo una **copia reale della pagina** in `test/fixtures/`. I parser si testano su
  quelle copie, senza rete: i test sono veloci, deterministici e girano anche offline.
- Ogni parser ha almeno un test che verifica l'estrazione di titolo, data e link su dati reali.
- La pipeline ha test su: deduplica, filtro temporale, gestione della data mancante, fusione con
  l'archivio senza perdere lo stato "salvato".
- Lo scoring ha test su casi reali presi dai bandi veri: un bando FCTP deve risultare giallo, un bando
  Generare Educando deve risultare verde.
- Il monitoraggio di salute ha test sulla regola dei 3 giorni.

**Verifica di accettazione:** far girare la raccolta a mano e confrontare i risultati con quanto
pubblicato quel giorno sui siti delle fonti, uno per uno. Finché questo confronto non torna, la
piattaforma non è consegnata.

## 9. Configurazione e segreti

Un unico file `config.ts` con: finestra temporale, soglia di pertinenza per la notifica, parole chiave
delle due corsie, destinatari email, elenco fonti attive.

Segreti in GitHub Secrets, mai nel codice: credenziali SMTP, chiavi VAPID per il push, token del
Cloudflare Worker.

## 10. Fasi di realizzazione

1. **Fondamenta** — modello dati, pipeline, deduplica, filtro temporale, test.
2. **Le sette fonti già verificate** — InfoBandi CSVnet, CTV Biella–Vercelli, MiC Cinema,
   Bandi Regione Piemonte, Fondazione CRT, Compagnia di San Paolo, Agenzia Nazionale Giovani.
   Tutte su RSS o API JSON, quindi robuste. **Da qui la piattaforma è già utile**: copre nazionale,
   regionale, terzo settore nazionale e terzo settore biellese.
3. **Sito e filtri** — elenco consultabile, popup novità, salvataggio.
4. **Notifiche** — email, poi push e PWA.
5. **Fonti HTML** — Fondazione CRB Biella per prima, poi FCTP, Comune di Biella, le altre.
6. **Guardiano** — semaforo salute, allarme 3 giorni, promemoria scadenze.

Ogni fase lascia il sistema funzionante. Dopo la fase 2 la produzione riceve già valore reale.

## 11. Limiti dichiarati

- **Lo scraping HTML è fragile per natura.** Il monitoraggio di salute riduce il danno ma non lo elimina:
  se una fonte cambia struttura, qualcuno deve aggiornare quel parser.
- **La classificazione di ammissibilità è un'euristica testuale**, non una lettura giuridica del bando.
  Serve a stabilire l'ordine di lettura, mai a decidere di non presentare domanda. Per questo la scheda
  mostra sempre la frase da cui è dedotta.
- **GitHub Actions non garantisce l'orario esatto**: l'esecuzione può slittare di alcuni minuti o, in casi
  rari di carico, saltare. La finestra di 7 giorni è la difesa contro questa eventualità.
- **Le fonti coperte non sono tutte le fonti esistenti.** Bandi di piccoli comuni limitrofi, bandi
  pubblicati solo su canali social o newsletter private restano fuori portata.

## 12. Modifiche emerse durante la realizzazione

Aggiornamento del 18 settembre 2026, dopo la prima raccolta reale sulle sette fonti. Dove questa sezione
contraddice le precedenti, vale questa.

**Bandi e notizie.** Nella prima raccolta la classifica di pertinenza era dominata da notizie — comunicati
stampa, premi assegnati, inaugurazioni — che parlano di cinema e di giovani ma non sono bandi. Ogni
elemento ha ora un campo `tipo: 'bando' | 'notizia'`, e **solo i bandi vengono notificati**. Ogni fonte
dichiara se pubblica soltanto bandi (`soloBandi`): per InfoBandi, il portale della Regione e la categoria
Avvisi del MiC lo sa la fonte. Per i feed misti delle fondazioni si ricava dal testo, e **nel dubbio è un
bando**: è notizia solo ciò che ha segni chiari di notizia e nessun segno di bando.

**Fonti.** Al MiC si leggono solo le categorie Avvisi (4) e Bandi (258). Per la Regione Piemonte si usa il
feed della sezione `contributi-finanziamenti`: quello generale mescolava gare d'appalto e nomine e le sue
dieci voci coprivano meno di due giorni, questo ne copre circa sei.

**Soglia di notifica: 10, non 35.** Filtrate le notizie a monte, a 35 non passava più nulla, nemmeno un
bando contro la violenza di genere (17). Con circa quaranta bandi al mese la stanchezza da notifiche non è
un rischio reale; perdere un bando sì.

**Ammissibilità.** Tutti i termini si cercano come parole intere ("fondazione" dentro "rifondazione"
attribuiva il bando all'ente sbagliato). Un blocco scatta solo se il termine e un segnale di ammissibilità
stanno nella stessa proposizione, così un elenco di categorie o una premessa smentita da un "ma" non
silenziano un bando. Gli enti sono ordinati dal più specifico al più generico.

**Robustezza.** Un adattatore che riceve voci ma non ne riesce a leggere nessuna lancia un errore invece di
restituire una lista vuota. Un archivio illeggibile ferma la raccolta prima di sovrascriverlo. Un'entità
HTML malformata non fa più perdere l'intero raccolto di una fonte.

**Destinatari email** nel segreto `EMAIL_DESTINATARI` e non in `config.ts`: il repository è pubblico.

**Sito.** L'orario dell'ultimo controllo arriva da `data/meta.json`, scritto a ogni esecuzione; se è più
vecchio di 36 ore la testata lo segnala in rosso. Il popup usa la stessa soglia dell'email.

**Ancora aperto.** Il feed della Regione copre circa sei giorni: se l'automazione saltasse per più di sei
giorni consecutivi qualcosa andrebbe perso. L'allarme scatta dopo tre, ma un rilevatore esplicito di lacune
— "la voce più vecchia del feed è più recente dell'ultimo controllo riuscito" — resta da fare.
