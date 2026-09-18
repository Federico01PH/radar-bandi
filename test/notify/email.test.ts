import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bando } from '../../src/tipi.ts';

const invii: unknown[] = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: async (opzioni: unknown) => { invii.push(opzioni); return { messageId: 'x' }; },
    }),
  },
}));

const { inviaEmail, inviaAllarmeFonti, credenzialiDaAmbiente } = await import('../../src/notify/email.ts');

const credenziali = {
  host: 'smtp.esempio.it', porta: 587, utente: 'radar@esempio.it', password: 'p',
  destinatari: ['uno@esempio.it', 'due@esempio.it'],
};
const senzaCredenziali = { host: '', porta: 587, utente: '', password: '', destinatari: ['uno@esempio.it'] };

function bando(): Bando {
  return {
    id: 'a'.repeat(64), titolo: 'Bando web serie', ente: 'CSVnet',
    livello: 'terzosettore', tipo: 'bando', corsie: ['audiovisiva'],
    dataPubblicazione: '2026-09-17T00:00:00.000Z', dataIncerta: false,
    scadenza: null, importo: null, descrizioneBreve: 'Descrizione.',
    requisiti: [], chiPuoPartecipare: null, ammissibilita: 'verde',
    entePropostoId: 'storiedipiazza', motivoAmmissibilita: null,
    pertinenza: 60, url: 'https://x.it/a', fonteId: 'infobandi',
    vistoIl: '2026-09-18T08:00:00.000Z', salvato: false,
  };
}

beforeEach(() => { invii.length = 0; });

describe('inviaEmail', () => {
  it('non invia nulla quando non ci sono bandi', async () => {
    const esito = await inviaEmail([], credenziali);
    expect(esito.inviata).toBe(false);
    expect(invii).toHaveLength(0);
  });

  it('non invia se mancano le credenziali, e lo dice', async () => {
    const esito = await inviaEmail([bando()], senzaCredenziali);
    expect(esito.inviata).toBe(false);
    expect(esito.motivo).toContain('credenziali');
    expect(invii).toHaveLength(0);
  });

  it('invia una sola email con oggetto e corpo quando ci sono bandi', async () => {
    const esito = await inviaEmail([bando()], credenziali);
    expect(esito.inviata).toBe(true);
    expect(invii).toHaveLength(1);
    const mail = invii[0] as { subject: string; html: string; to: string };
    expect(mail.subject).toBe('Radar Bandi: 1 nuovo bando');
    expect(mail.html).toContain('Bando web serie');
    expect(mail.to).toBe('uno@esempio.it, due@esempio.it');
  });
  it('non invia se manca ogni destinatario, e lo dice', async () => {
    const esito = await inviaEmail([bando()], { ...credenziali, destinatari: [] });
    expect(esito.inviata).toBe(false);
    expect(esito.motivo).toContain('destinatario');
    expect(invii).toHaveLength(0);
  });
});

describe('credenzialiDaAmbiente', () => {
  it('legge i destinatari separati da virgola e ignora gli spazi', () => {
    process.env['EMAIL_DESTINATARI'] = ' uno@esempio.it , due@esempio.it,';
    expect(credenzialiDaAmbiente().destinatari).toEqual(['uno@esempio.it', 'due@esempio.it']);
    delete process.env['EMAIL_DESTINATARI'];
  });

  it('usa la porta 587 quando GitHub passa un segreto vuoto', () => {
    process.env['SMTP_PORT'] = '';
    expect(credenzialiDaAmbiente().porta).toBe(587);
    delete process.env['SMTP_PORT'];
  });

});

describe('inviaAllarmeFonti', () => {
  it('tace quando tutte le fonti sono sane', async () => {
    const esito = await inviaAllarmeFonti([], credenziali);
    expect(esito.inviata).toBe(false);
    expect(invii).toHaveLength(0);
  });

  it('nomina le fonti mute nel messaggio', async () => {
    await inviaAllarmeFonti(['InfoBandi CSVnet'], credenziali);
    const mail = invii[0] as { subject: string; html: string };
    expect(mail.subject).toContain('1 fonti');
    expect(mail.html).toContain('InfoBandi CSVnet');
  });
});
