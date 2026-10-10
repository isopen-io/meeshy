/**
 * Ce que disent l'e-mail et la notification d'une sauvegarde en échec, vieillie,
 * absente, puis rétablie (#9668) — dans la langue du destinataire.
 *
 * Témoins par ce que le FOURNISSEUR reçoit (sujet, HTML, texte) : la raison de
 * l'échec et la date de la dernière réussite y sont, la raison est échappée (elle
 * vient d'un fichier d'hôte), et le lien ouvre la supervision.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { backupAlertText, composeBackupAlertEmail } from '../../../services/email/backup-alert-email';

const originalEnv = { ...process.env };
const mockAxiosPost = jest.fn<any>();

async function service() {
  delete process.env.MEESHY_ENV;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.MAILGUN_API_KEY;
  process.env.BREVO_API_KEY = 'test-key';
  process.env.FRONTEND_URL = 'https://meeshy.me';
  jest.resetModules();
  jest.doMock('axios', () => ({ __esModule: true, default: { post: mockAxiosPost } }));
  const { EmailService } = await import('../../../services/EmailService');
  return new EmailService({ recipientLookup: async () => 'verified' });
}

const sent = () => mockAxiosPost.mock.calls[0]?.[1] as { subject: string; htmlContent: string; textContent: string; to: { email: string }[] };

beforeEach(() => {
  mockAxiosPost.mockReset();
  mockAxiosPost.mockResolvedValue({ status: 201, data: { messageId: 'm-1' } });
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('le texte d’une alerte de sauvegarde', () => {
  it('un échec dit sa raison et la date de la dernière réussite, heure de Paris', () => {
    const text = backupAlertText({ kind: 'failed', reason: 'mongodump (voir base/mongodump.log)', lastSuccessAt: '2026-10-07T22:12:40Z' }, 'fr');
    expect(text.title).toBe('Sauvegarde de la production en échec');
    expect(text.body).toContain('mongodump (voir base/mongodump.log)');
    expect(text.body).toContain('8 octobre 2026');
    expect(text.body).toContain('00:12');
  });

  it('une sauvegarde vieillie dit depuis quand rien n’a réussi', () => {
    const text = backupAlertText({ kind: 'stale', reason: null, lastSuccessAt: '2026-10-06T22:12:40Z' }, 'en');
    expect(text.title).toBe('No recent production backup');
    expect(text.body).toContain('26');
    expect(text.body).toContain('October 7, 2026');
  });

  it('un verdict absent le dit sans inventer de date', () => {
    const text = backupAlertText({ kind: 'missing', reason: null, lastSuccessAt: null }, 'fr');
    expect(text.title).toBe('Sauvegarde de la production : aucun verdict');
    expect(text.body).not.toMatch(/\d{4}/);
  });

  it('un échec sans aucune réussite antérieure dit « aucune »', () => {
    expect(backupAlertText({ kind: 'failed', reason: 'espace libre 3 Go < 40 Go', lastSuccessAt: null }, 'fr').body).toContain('aucune');
  });

  it('le retour au vert se dit', () => {
    const text = backupAlertText({ kind: 'recovered', reason: null, lastSuccessAt: '2026-10-09T22:12:00Z' }, 'es');
    expect(text.title).toBe('Copia de seguridad de producción restablecida');
    expect(text.body).toContain('2026');
  });

  it('une langue inconnue retombe sur l’anglais', () => {
    expect(backupAlertText({ kind: 'missing', reason: null, lastSuccessAt: null }, 'xx').title).toBe('Production backup: no verdict');
  });

  it.each(['fr', 'en', 'es', 'pt', 'it', 'de'])('la langue %s dit les quatre cas', (language) => {
    const kinds = ['failed', 'stale', 'missing', 'recovered'] as const;
    const titles = kinds.map((kind) => backupAlertText({ kind, reason: 'r', lastSuccessAt: '2026-10-07T22:12:40Z' }, language).title);
    expect(new Set(titles).size).toBe(4);
    titles.forEach((title) => expect(title.length).toBeGreaterThan(0));
  });
});

describe('EmailService.sendBackupAlertEmail', () => {
  it('écrit au destinataire, dans sa langue, avec le lien de la supervision', async () => {
    const result = await (await service()).sendBackupAlertEmail({
      to: 'sama@meeshy.me',
      name: 'Meeshy Sama',
      language: 'fr',
      message: { kind: 'failed', reason: 'mongodump', lastSuccessAt: '2026-10-07T22:12:40Z' },
    });

    expect(result.success).toBe(true);
    expect(sent().to[0].email).toBe('sama@meeshy.me');
    expect(sent().subject).toBe('Sauvegarde de la production en échec - Meeshy');
    expect(sent().htmlContent).toContain('https://meeshy.me/admin/monitoring');
    expect(sent().textContent).toContain('https://meeshy.me/admin/monitoring');
    expect(sent().textContent).toContain('mongodump');
  });

  it('échappe la raison, qui vient d’un fichier d’hôte — balises ET apostrophes', async () => {
    await (await service()).sendBackupAlertEmail({
      to: 'sama@meeshy.me',
      name: "O'Brien <b>",
      language: 'fr',
      message: { kind: 'failed', reason: "<img src=x onerror=alert(1)> l'archive' onmouseover='x", lastSuccessAt: null },
    });
    const html = sent().htmlContent;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain("l'archive' onmouseover='x");
    expect(html).toContain('l&#39;archive&#39; onmouseover=&#39;x');
    expect(html).toContain('O&#39;Brien &lt;b&gt;');
    expect(sent().textContent).toContain("l'archive");
  });
});

describe('aucune valeur variable n’entre BRUTE dans le HTML', () => {
  const TRAP = `<script>alert(1)</script>"x'y&z`;
  const FRAME = { styles: '', footerHtml: '', footerText: '', monitoringUrl: `https://meeshy.me/admin/monitoring?${TRAP}` };

  it.each(['failed', 'stale', 'missing', 'recovered'] as const)('cas %s : nom, raison et adresse piégés sortent échappés', (kind) => {
    const { html, text } = composeBackupAlertEmail(
      { to: 'sama@meeshy.me', name: `Sama ${TRAP}`, language: 'fr', message: { kind, reason: `raison ${TRAP}`, lastSuccessAt: '2026-10-07T22:12:40Z' } },
      FRAME,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(`"x'y`);
    expect(html).not.toMatch(/&z/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&quot;x&#39;y&amp;z');
    expect(text).toContain(TRAP);
  });
});
