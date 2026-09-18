import { describe, it, expect } from 'vitest';
import { messaggiBandi, messaggioAllarme, messaggioProva, pubblicaNtfy } from '../../src/notify/ntfy.ts';
import type { Bando } from '../../src/tipi.ts';

const SITO = 'https://bandi-sefinisseroleparole.vercel.app/';
const TOPIC = 'radar-bandi-prova';

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: 'a'.repeat(64), titolo: 'Bando CoPower contro la violenza di genere', ente: 'CSVnet',
    livello: 'terzosettore', tipo: 'bando', corsie: ['giovani'],
    dataPubblicazione: '2026-09-17T00:00:00.000Z', dataIncerta: false,
    scadenza: '2026-11-23', importo: null, descrizioneBreve: 'Sostegno a progetti.',
    requisiti: [], chiPuoPartecipare: null, ammissibilita: 'verde',
    entePropostoId: 'storiedipiazza', motivoAmmissibilita: 'Sono ammesse le associazioni.',
    pertinenza: 17, adattoAllaSerie: true, url: 'https://x.it/copower', fonteId: 'infobandi',
    vistoIl: '2026-09-18T05:00:00.000Z', salvato: false,
    ...over,
  };
}

describe('messaggiBandi', () => {
  it('un messaggio per bando, con titolo, chi presenta, scadenza e link al bando', () => {
    const [m] = messaggiBandi([bando()], TOPIC, SITO);
    expect(m!.topic).toBe(TOPIC);
    expect(m!.title).toBe('Bando CoPower contro la violenza di genere');
    expect(m!.message).toContain('Presenta: Storie di Piazza APS');
    expect(m!.message).toContain('23/11/2026');
    expect(m!.click).toBe('https://x.it/copower');
  });

  it('dice "da verificare" quando non si sa chi presenta', () => {
    const [m] = messaggiBandi([bando({ entePropostoId: null, ammissibilita: 'ignota' })], TOPIC, SITO);
    expect(m!.message).toContain('Chi presenta: da verificare');
  });

  it('con tanti bandi manda i primi e un riepilogo, per non intasare il telefono', () => {
    const tanti = Array.from({ length: 9 }, (_, i) => bando({ id: String(i).padStart(64, '0'), titolo: `Bando ${i}` }));
    const messaggi = messaggiBandi(tanti, TOPIC, SITO);
    expect(messaggi).toHaveLength(5);
    expect(messaggi[4]!.title).toContain('altri 5');
    expect(messaggi[4]!.click).toBe(SITO);
  });

  it('non rende cliccabile un link non http', () => {
    const [m] = messaggiBandi([bando({ url: 'javascript:alert(1)' })], TOPIC, SITO);
    expect(m!.click).toBe(SITO);
  });

  it('nessun messaggio se non ci sono bandi', () => {
    expect(messaggiBandi([], TOPIC, SITO)).toEqual([]);
  });
});

describe('messaggioAllarme e messaggioProva', () => {
  it('l\'allarme nomina le fonti ed e\' ad alta priorita\'', () => {
    const m = messaggioAllarme(['InfoBandi CSVnet'], TOPIC, SITO);
    expect(m.message).toContain('InfoBandi CSVnet');
    expect(m.priority).toBe(4);
  });

  it('la prova dice quanti bandi adatti sono in archivio', () => {
    expect(messaggioProva(5, TOPIC, SITO).message).toContain('5');
  });
});

describe('pubblicaNtfy', () => {
  it('manda ogni messaggio come JSON al server', async () => {
    const chiamate: { url: string; corpo: unknown }[] = [];
    const finto = (async (url: string, init?: RequestInit) => {
      chiamate.push({ url, corpo: JSON.parse(String(init?.body)) });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await pubblicaNtfy(messaggiBandi([bando(), bando({ id: 'b'.repeat(64) })], TOPIC, SITO), finto);
    expect(chiamate).toHaveLength(2);
    expect(chiamate[0]!.url).toBe('https://ntfy.sh/');
  });

  it('lancia un errore se il server rifiuta, cosi\' la raccolta lo registra', async () => {
    const finto = (async () => new Response('limite', { status: 429 })) as unknown as typeof fetch;
    await expect(pubblicaNtfy(messaggiBandi([bando()], TOPIC, SITO), finto)).rejects.toThrow(/429/);
  });
});
