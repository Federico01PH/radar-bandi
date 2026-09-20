import { describe, it, expect } from 'vitest';
import { estraiRequisiti } from '../../src/scoring/requisiti.ts';

const BANDO = `Bando CoPower per contrastare la violenza di genere.
Sono ammessi ETS non societari, fondazioni e associazioni riconosciute e non riconosciute con sede legale in Italia.
Il progetto deve avere una durata compresa fra dodici e ventiquattro mesi.
Il contributo massimo richiedibile e' di 50.000 euro per progetto.
La domanda deve essere presentata esclusivamente attraverso la piattaforma online del bando.
Le candidature si chiudono il 23 novembre 2026 alle ore 12.00.`;

describe('estraiRequisiti', () => {
  it('mette in cima chi puo\' presentare domanda', () => {
    const punti = estraiRequisiti(BANDO);
    expect(punti[0]).toContain('Chi puo\' partecipare');
    expect(punti[0]).toContain('Sono ammessi ETS non societari');
  });

  it('raccoglie anche quanto e come si presenta', () => {
    const punti = estraiRequisiti(BANDO).join('\n');
    expect(punti).toContain('50.000 euro');
    expect(punti).toContain('piattaforma online');
  });

  it('non ripete la scadenza fra i punti: sulla scheda ha gia\' il suo riquadro', () => {
    expect(estraiRequisiti(BANDO).some((p) => p.startsWith('Entro quando'))).toBe(false);
  });

  it('salta le frasi che sono solo il titolo del bando ripetuto dalla pagina', () => {
    const titolo = 'Proroga per la presentazione delle domande del bando cinema';
    const testo = `${titolo} - Direzione generale Cinema e audiovisivo. Le domande devono essere presentate tramite la piattaforma DGCOL.`;
    const punti = estraiRequisiti(testo, { titolo });
    expect(punti.join()).not.toContain('Direzione generale Cinema');
    expect(punti.join()).toContain('piattaforma DGCOL');
  });

  it('un punto per argomento, senza ripetere la stessa frase', () => {
    const punti = estraiRequisiti(BANDO);
    const frasi = punti.map((p) => p.slice(p.indexOf(':') + 1).trim());
    expect(new Set(frasi).size).toBe(frasi.length);
    expect(punti.length).toBeLessThanOrEqual(6);
  });

  it('accorcia le frasi lunghissime invece di riportare mezza pagina', () => {
    const lunga = `Sono ammessi a partecipare i soggetti che ${'presentano requisiti particolari '.repeat(30)}.`;
    const [punto] = estraiRequisiti(lunga);
    expect(punto!.length).toBeLessThan(300);
    expect(punto).toContain('…');
  });

  it('niente punti da un testo che non dice nulla di utile', () => {
    expect(estraiRequisiti('Il sito utilizza cookie tecnici. Torna alla home.')).toEqual([]);
  });

  it('nessun punto da un testo vuoto', () => {
    expect(estraiRequisiti('')).toEqual([]);
  });
});

describe('estraiRequisiti, frasi sbagliate da evitare', () => {
  it('cerca i termini come parole intere: "pec" non sta dentro "specifiche"', () => {
    const testo = 'Si terra\' conto delle esigenze specifiche delle persone rifugiate e migranti coinvolte.';
    expect(estraiRequisiti(testo).join()).not.toContain('esigenze specifiche');
  });

  it('preferisce chi presenta la domanda a chi ne beneficia', () => {
    const testo = `Sono finanziabili progetti rivolti a donne e ragazze vittime di violenza di genere.
Sono ammessi ETS non societari, fondazioni e associazioni riconosciute e non riconosciute.`;
    expect(estraiRequisiti(testo)[0]).toContain('Sono ammessi ETS');
  });

  it('non prende un titolo di paragrafo come importo', () => {
    const testo = 'DOTAZIONE FINANZIARIA DISPONIBILE PER I PROGETTI DI QUESTA FASE.';
    expect(estraiRequisiti(testo)).toEqual([]);
  });

  it('una frase che parla della durata del progetto non e\' "chi puo\' partecipare"', () => {
    const testo = 'Le proposte progettuali devono prevedere iniziative da svolgersi entro dicembre 2027.';
    expect(estraiRequisiti(testo).join()).not.toContain("Chi puo' partecipare");
  });
});

describe('estraiRequisiti, niente doppioni con la descrizione', () => {
  it('salta una frase che il lettore ha gia' + String.fromCharCode(39) + ' appena letto nella descrizione', () => {
    const frase = 'Le domande devono essere presentate tramite la piattaforma informatica DGCOL entro ottobre.';
    const punti = estraiRequisiti(frase, { giaMostrato: `Si avvisano gli utenti. ${frase}` });
    expect(punti).toEqual([]);
  });
});

describe('estraiRequisiti, quando la descrizione e\' lunga', () => {
  it('isola la riga che conta anche se sta dentro la descrizione', () => {
    const riga = 'Le domande potranno essere presentate tramite la piattaforma informatica DGCOL dal 1 al 31 ottobre 2026.';
    const descrizione = `${'Il presente bando disciplina la concessione dei contributi. '.repeat(4)}${riga}`;
    expect(estraiRequisiti(descrizione, { giaMostrato: descrizione }).join()).toContain('DGCOL');
  });
});
