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

  it('non scambia una sigla dentro una parola per la sigla stessa', () => {
    const r = valutaAmmissibilita(
      'Bando cultura',
      'Una descrizione rapsodica e brillante dei progetti culturali.',
    );
    expect(r.entePropostoId).toBeNull();
    expect(r.esito).toBe('ignota');
  });

  it('non si fa ingannare nemmeno da lapsus', () => {
    const r = valutaAmmissibilita('Avviso', 'Si segnala un lapsus nel testo precedente.');
    expect(r.entePropostoId).toBeNull();
  });

  it('riconosce la sigla quando e\' una parola intera', () => {
    const r = valutaAmmissibilita('Bando', 'Possono partecipare APS e ODV del territorio.');
    expect(r.esito).toBe('verde');
    expect(r.entePropostoId).toBe('storiedipiazza');
  });

  it('non lascia che un falso positivo su una sigla batta l\'ente giusto', () => {
    const r = valutaAmmissibilita(
      'Fondo rapsodia',
      'Una rapsodia di progetti. Sono ammesse le imprese di produzione audiovisiva.',
    );
    expect(r.entePropostoId).toBe('videoastolfo');
  });

  it('non blocca un elenco di categorie sostenute dal fondo', () => {
    const r = valutaAmmissibilita(
      'Fondo per l\'audiovisivo',
      'Il fondo sostiene la produzione di cortometraggi, documentari, lungometraggio di finzione e opere seriali destinate alle piattaforme digitali.',
    );
    expect(r.esito).not.toBe('rosso');
  });

  it('blocca quando la sala e\' un obbligo, non un canale fra tanti', () => {
    const r = valutaAmmissibilita(
      'Bando sale',
      'Sono ammesse esclusivamente le opere con obbligo di distribuzione in sala cinematografica.',
    );
    expect(r.esito).toBe('rosso');
    expect(r.motivo).toContain('distribuzione in sala');
  });

  it('blocca anche il plurale, quando e\' una riserva vera', () => {
    const r = valutaAmmissibilita(
      'Bando',
      'Il bando e\' riservato ai lungometraggi di finzione.',
    );
    expect(r.esito).toBe('rosso');
  });

  it('non blocca la sala citata come uno dei canali possibili', () => {
    const r = valutaAmmissibilita(
      'Fondo',
      'Le opere sostenute sono destinate alla distribuzione in sala, in televisione e sulle piattaforme digitali, comprese le opere seriali per il web.',
    );
    expect(r.esito).not.toBe('rosso');
  });

  it('non scambia "fondazione" dentro "rifondazione"', () => {
    const r = valutaAmmissibilita(
      'Bando politiche giovanili',
      'Un percorso di rifondazione delle politiche giovanili. Sono ammesse le imprese di produzione audiovisiva.',
    );
    expect(r.entePropostoId).toBe('videoastolfo');
  });

  it('non lascia motivo nullo su un verde quando il match attraversa un punto', () => {
    const r = valutaAmmissibilita(
      'Avviso pubblico',
      'Sono ammessi i soggetti costituiti come impresa. Audiovisiva e il settore di riferimento del bando.',
    );
    expect(r.esito).toBe('verde');
    expect(r.motivo).not.toBeNull();
  });

  it('non blocca una premessa smentita da un avversativa', () => {
    const r = valutaAmmissibilita(
      'Avviso per web serie',
      'Il fondo sostiene abitualmente la distribuzione in sala, ma questo avviso riguarda esclusivamente le web serie destinate a piattaforme digitali.',
    );
    expect(r.esito).not.toBe('rosso');
  });

  it('blocca ancora quando la riserva e\' nella stessa proposizione', () => {
    const r = valutaAmmissibilita(
      'Bando sale',
      'Sono ammesse esclusivamente le opere con obbligo di distribuzione in sala.',
    );
    expect(r.esito).toBe('rosso');
  });

  it('non spezza le abbreviazioni giuridiche nella citazione', () => {
    const r = valutaAmmissibilita(
      'D.D. 17 settembre 2026, rep. 2738',
      'Ai sensi dell\'art. 5 del D.Lgs. n. 28 del 2004, sono ammesse le associazioni di promozione sociale.',
    );
    expect(r.entePropostoId).toBe('storiedipiazza');
    expect(r.motivo).toContain('sono ammesse le associazioni');
    expect(r.motivo).not.toMatch(/^\d/);
  });

  it('su un vero pareggio preferisce l\'ente piu\' specifico', () => {
    const r = valutaAmmissibilita(
      'Bando',
      'Possono partecipare le imprese di produzione audiovisiva o le associazioni di promozione sociale.',
    );
    expect(r.entePropostoId).toBe('videoastolfo');
  });
});
