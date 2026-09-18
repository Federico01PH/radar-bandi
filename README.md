# Radar Bandi

Ogni mattina controlla da solo sette fonti di bandi, tiene quelli pubblicati negli ultimi sette giorni,
li valuta per la web serie **"Se finissero le parole"** e manda un'email quando ne esce uno che vale la
pena leggere. Tutto è consultabile su un sito con i filtri.

Nessun server da mantenere, nessun costo: gira su GitHub.

## Che cosa fa, in breve

- **Controlla ogni mattina** Ministero della Cultura (solo avvisi e bandi), Regione Piemonte (contributi
  e finanziamenti), InfoBandi CSVnet, CTV Biella–Vercelli, Fondazione CRT, Compagnia di San Paolo e
  Agenzia Nazionale Giovani.
- **Mostra solo i bandi adatti alla serie**: niente notizie, niente atti amministrativi, niente bandi che
  toccano solo parole generiche come "cultura" o "giovani". Serve almeno un tema forte: audiovisivo, oppure
  bullismo, disagio giovanile, violenza e identità di genere, stereotipi, salute mentale.
- **Dice chi deve firmare la domanda**: Storie di Piazza APS, Fondazione Marco Falco oppure
  VideoAstolfoSullaLuna Srl, citando la frase del bando da cui lo deduce.
- **Avvisa solo quando c'è qualcosa**, con una segnalazione su GitHub che arriva per email. Mai messaggi vuoti.
- **Si accorge quando smette di funzionare**: se una fonte non porta risultati per tre controlli di fila
  arriva un allarme, e il sito mostra in rosso se il controllo automatico si è fermato.

## Come metterla in funzione

Serve un account GitHub gratuito. Si fa una volta sola.

### 1. Caricare il progetto su GitHub

Creare un repository **pubblico** (GitHub Pages gratuito richiede che lo sia; i bandi sono comunque
informazioni pubbliche) e caricarci questo progetto. Il ramo principale deve chiamarsi `main` o `master`:
l'esecuzione automatica gira solo sul ramo principale.

### 2. Dare i permessi all'automazione

Nel repository: **Settings → Actions → General → Workflow permissions** → scegliere
**Read and write permissions** e salvare. Senza questo la raccolta non può salvare i risultati.

### 3. Attivare il sito

**Settings → Pages → Build and deployment → Source** → scegliere **GitHub Actions**.
Il sito sarà all'indirizzo `https://<nome-utente>.github.io/<nome-repository>/`.

### 4. Le notifiche

**Funzionano senza configurare niente.** Quando escono bandi nuovi, la raccolta apre una segnalazione
(una *issue*) nel repository, e GitHub la manda per email al proprietario del repository, all'indirizzo
del suo account. La segnalazione contiene titolo, ente, descrizione, chi può presentare domanda e il link
all'originale. Anche l'allarme sulle fonti mute arriva così.

**Notifica push sul telefono:** basta installare l'app gratuita **GitHub Mobile** ed entrare con lo stesso
account. Ogni nuova segnalazione arriva come notifica.

Per farla arrivare ad altri membri del gruppo: devono avere un account GitHub e premere **Watch** sul
repository.

### 4 bis. Email diretta, facoltativa

Se si preferisce un'email vera e propria, anche a chi non ha GitHub, in
**Settings → Secrets and variables → Actions → New repository secret** si creano questi cinque segreti.
Quando ci sono, le notifiche partono via email invece che come segnalazioni:

| Nome | Valore |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` se si usa Gmail |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | l'indirizzo Gmail che spedisce |
| `SMTP_PASS` | una **password per le app** di Gmail, non la password dell'account |
| `EMAIL_DESTINATARI` | gli indirizzi che ricevono, separati da virgola |

Per la password per le app: account Google → Sicurezza → attivare la verifica in due passaggi →
"Password per le app" → crearne una e incollarla in `SMTP_PASS`.

I destinatari stanno nei segreti e non nel codice apposta: il repository è pubblico, e un indirizzo
scritto nel codice lo leggerebbe chiunque, bot di spam compresi.

### 5. Primo avvio

**Actions → Raccolta bandi → Run workflow**. La prima esecuzione recupera l'ultimo mese e manda
la prima notifica. Poi riparte da sola ogni mattina verso le 7.

## Come si legge una scheda

- **Bordo verde**: uno dei vostri enti può presentare domanda, e la scheda dice quale.
- **Bordo giallo**: serve un requisito in più, per esempio una scuola capofila o un partenariato.
- **Bordo rosso**: requisito fuori portata, per esempio una coproduzione internazionale. Resta visibile ma
  non genera email.
- **Bordo grigio**: la piattaforma non è riuscita a capire chi può partecipare. Va letto il bando.

Il colore è un'ipotesi ricavata dal testo, non una lettura giuridica. Per questo sotto c'è sempre la frase
del bando da cui è dedotto: si controlla in due secondi. **Non scartate mai un bando solo per il colore.**

"Salva" ricorda il bando su quel dispositivo. "Inoltra su WhatsApp" apre WhatsApp con titolo e link già
pronti da mandare al gruppo.

## Quando arriva un allarme

Un'email "N fonti non rispondono" significa che quelle fonti non portano risultati da tre controlli.
Di solito il sito della fonte è stato rifatto e l'aggancio va aggiornato. Finché non viene riparato,
**i bandi pubblicati su quella fonte non arrivano**: nel frattempo va controllata a mano.

Se la testata del sito è rossa con "nessun controllo da N giorni", l'automazione si è fermata: aprire
**Actions** su GitHub e guardare l'ultima esecuzione. GitHub disattiva l'esecuzione pianificata dei
repository senza attività da 60 giorni; in quel caso basta riattivarla da **Actions**.

## Modifiche comuni

Tutto ciò che riguarda il progetto sta in [`src/config.ts`](src/config.ts):

- **`PAROLE`**: le parole chiave e il loro peso. Quelle segnate `forte: true` sono i temi che rendono un bando
  adatto alla serie: se ne sfugge uno buono, si aggiunge qui la parola che manca.
- **`ESCLUSI_DAL_TITOLO`**: titoli che annunciano atti amministrativi o ambiti estranei alla serie.
- **`ENTI`**: gli enti della produzione. Se entra un nuovo partner si aggiunge qui.

Le fonti stanno in [`src/sources/registro.ts`](src/sources/registro.ts).

## Per chi sviluppa

```bash
npm install
npm test
npm run raccolta
```

`npm run raccolta` fa una raccolta vera e scrive in `data/`. Prima di caricare su GitHub riportare
l'archivio allo stato vuoto con `git checkout -- data/`, altrimenti i bandi raccolti in locale
risulterebbero già visti e la prima email automatica non li conterrebbe.

La specifica è in [`docs/superpowers/specs/`](docs/superpowers/specs/), il piano in
[`docs/superpowers/plans/`](docs/superpowers/plans/).

## Limiti noti

- Le fonti coperte sono sette. Mancano ancora quelle senza feed, fra cui **Fondazione Cassa di Risparmio di
  Biella**, Film Commission Torino Piemonte, Comune e Provincia di Biella: vanno seguite a mano finché non
  arrivano i relativi adattatori.
- Scadenza e importo non vengono ancora estratti: i feed non li riportano, bisogna aprire il bando.
- La scelta di cosa è "adatto alla serie" e l'ammissibilità sono euristiche sul testo e sbagliano, a volte.
  Il filtro è volutamente stretto: dalle fondazioni, che mescolano bandi e notizie, passa solo ciò che ha un
  segno esplicito di bando. I bandi scartati non si cancellano: restano in `data/bandi.json`, e se si
  allarga un criterio in `config.ts` vengono rivalutati alla raccolta successiva.
