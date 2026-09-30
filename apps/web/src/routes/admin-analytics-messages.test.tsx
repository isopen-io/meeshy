import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AWA, GUEST_PARTICIPANT, PAYLOADS, statsGateway } from '@/lib/admin/analytics-fixtures';
import { adminDayLabel, hourLabel, weekdayName } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import type { MessagesPeriod } from '@/lib/api/admin-message-stats';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminMessagesTab } from './admin-analytics-messages';

const { mount, mounter } = setupAdminKitTests();

/** Le contenu de TOUS les messages et de toutes les traductions (#6919) : les statistiques ne l'appellent jamais. */
const FORBIDDEN_PATHS: readonly string[] = ['/api/v1/admin/messages', '/api/v1/admin/translations'];

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const AUDIT = adminIdentityFixture({ role: 'AUDIT' });

const STILL_LOADING = '[data-admin-stat-state="loading"], [data-admin-chart-skeleton]';

async function openTab(deps: AdminDeps, period: MessagesPeriod = '30d', identity = BIGBOSS): Promise<HTMLDivElement> {
  const host = await mount(<AdminMessagesTab language="fr" deps={deps} period={period} />, identity);
  for (let attempt = 0; attempt < 20 && host.querySelector(STILL_LOADING) !== null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const stat = (host: Element, anchor: string): string => host.querySelector(`[data-admin-stat="${anchor}"]`)?.textContent ?? '';
const chart = (host: Element, id: string) => host.querySelector(`[data-admin-chart="${id}"]`);
const fr = new Intl.NumberFormat('fr');
const percent = (ratio: number) => new Intl.NumberFormat('fr', { style: 'percent' }).format(ratio);

const showTable = async (host: Element, id: string): Promise<HTMLTableElement | null> => {
  await act(async () => chart(host, id)?.querySelector<HTMLButtonElement>('[data-admin-action="chart-table"]')?.click());
  return chart(host, id)?.querySelector('table') ?? null;
};
const rowLabels = (table: HTMLTableElement | null): readonly string[] => [...(table?.querySelectorAll('tbody th') ?? [])].map((cell) => cell.textContent ?? '');

describe('l’onglet Messages — des comptes, jamais un contenu', () => {
  test('les cartes rendent les valeurs servies, formatées, avec leur explication', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'total-messages')).toContain(fr.format(1200));
    expect(stat(host, 'deleted-messages')).toContain('30');
    expect(stat(host, 'edited-messages')).toContain('45');
    expect(stat(host, 'average-length')).toContain('58 caractères');
    expect(stat(host, 'translated')).toContain('600 messages avec au moins une traduction');
    expect(stat(host, 'attachments')).toContain('200 messages avec image, fichier ou vocal');
  });

  test('les deux taux servis en 0–100 se lisent « 50 % » et « 17 % » — jamais « 5 000 % »', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'translated')).toContain(percent(0.5));
    expect(stat(host, 'attachments')).toContain(percent(0.17));
    expect(host.textContent).not.toContain('5 000');
  });

  test('n’appelle que stats, trends et engagement — JAMAIS le contenu de tous les messages ni les traductions (#6919)', async () => {
    const gateway = statsGateway();
    await openTab(gateway.deps);

    const paths = gateway.calls().map((call) => call.path.split('?')[0] ?? '');
    for (const forbidden of FORBIDDEN_PATHS) expect(paths).not.toContain(forbidden);
    expect(new Set(gateway.paths())).toEqual(
      new Set(['/api/v1/admin/messages/stats?period=30d', '/api/v1/admin/messages/trends', '/api/v1/admin/messages/engagement?period=30d']),
    );
  });

  test('la courbe garde les DATES réelles du serveur, nommées dans la langue d’interface', async () => {
    const host = await openTab(statsGateway().deps);

    expect(rowLabels(await showTable(host, 'messages-timeline'))).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'].map((day) => adminDayLabel(day, 'fr')));
    expect(chart(host, 'messages-timeline')?.querySelector('figcaption')?.textContent).toContain(`Pic le ${adminDayLabel('2026-09-29', 'fr')} : 500 messages`);
  });

  test('une seule journée (24 h) ne dessine pas une courbe d’un point : elle le dit', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/messages/stats': { ok: true, data: { ...(PAYLOADS['/api/v1/admin/messages/stats'] as object), messagesByPeriod: [{ date: '2026-09-30', count: 300 }] } },
    });
    const host = await openTab(deps, '24h');

    expect(chart(host, 'messages-timeline')).toBeNull();
    expect(host.textContent).toContain('Une seule journée sur cette période');
  });

  test('les types sont nommés, un type inconnu se dit « Non reconnu » sans montrer son code', async () => {
    const host = await openTab(statsGateway().deps);

    expect(rowLabels(await showTable(host, 'messages-types'))).toEqual(['Texte', 'Image', 'Non reconnu']);
    expect(chart(host, 'messages-types')?.querySelector('figcaption')?.textContent).toContain(`Texte : ${percent(1000 / 1200)}`);
    expect(host.textContent).not.toContain('hologram');
  });
});

describe('les membres les plus actifs — de vrais noms, des fiches', () => {
  test('un compte est nommé par son nom affiché (+ @pseudo) et ouvre SA fiche ; un pseudo seul se dit @pseudo', async () => {
    const host = await openTab(statsGateway().deps);

    const awa = host.querySelector(`[data-admin-top-sender="${AWA}"]`);
    expect(awa?.textContent).toContain('Awa Diop');
    expect(awa?.textContent).toContain('@awa');
    expect(awa?.textContent).toContain('320 messages');
    expect(awa?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${AWA}`);

    const jean = host.querySelector('[data-admin-top-sender="64f1c2a9e8b7d6c5b4a39282"]');
    expect(jean?.textContent).toContain('@jean');
    expect(jean?.textContent).toContain('210 messages');
  });

  test('un invité — dont le serveur ne sert aucun nom — est « Invité sans nom », jamais le littéral « Unknown », et renvoie à sa fiche d’invité', async () => {
    const host = await openTab(statsGateway().deps);

    const guest = host.querySelector(`[data-admin-top-sender="${GUEST_PARTICIPANT}"]`);
    expect(guest?.textContent).toContain('Invité sans nom');
    expect(guest?.textContent).not.toContain('Unknown');
    expect(guest?.querySelector('a')?.getAttribute('href')).toBe(`/admin/anonymous/${GUEST_PARTICIPANT}`);
  });

  test('un lecteur qui ne peut pas ouvrir les comptes voit les noms, sans lien (loi 4)', async () => {
    const host = await openTab(statsGateway().deps, '30d', AUDIT);

    const awa = host.querySelector(`[data-admin-top-sender="${AWA}"]`);
    expect(awa?.textContent).toContain('Awa Diop');
    expect(awa?.querySelector('a')).toBeNull();
  });

  test('aucun identifiant brut ni énumération brute à l’écran', async () => {
    expectNoRawIdentifiers(await openTab(statsGateway().deps));
  });

  test('le tableau « Voir les données » liste les mêmes noms, pas les identifiants', async () => {
    const host = await openTab(statsGateway().deps);
    expect(rowLabels(await showTable(host, 'top-senders'))).toEqual(['Awa Diop', '@jean', 'Invité sans nom']);
  });
});

describe('le rythme de la semaine — le pic se lit par indice', () => {
  test('heure et jour de pointe : nommés depuis l’INDICE, le libellé français du serveur est ignoré', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/messages/trends': {
        ok: true,
        data: { ...(PAYLOADS['/api/v1/admin/messages/trends'] as object), peakWeekday: { day: 2, label: 'Dimanche', count: 300 } },
      },
    });
    const host = await openTab(deps);

    expect(stat(host, 'peak-hour')).toContain(hourLabel(14, 'fr'));
    expect(stat(host, 'peak-hour')).toContain('80 messages sur 7 jours');
    expect(stat(host, 'peak-day')).toContain(weekdayName(2, 'fr'));
    expect(stat(host, 'peak-day')).not.toContain('Dimanche');
  });

  test('24 barres horaires, nommées depuis la position', async () => {
    const host = await openTab(statsGateway().deps);

    const labels = rowLabels(await showTable(host, 'hours'));
    expect(labels).toHaveLength(24);
    expect(labels).toEqual(Array.from({ length: 24 }, (_, hour) => hourLabel(hour, 'fr')));
    expect(chart(host, 'hours')?.querySelectorAll('[data-admin-bar]')).toHaveLength(24);
    expect(chart(host, 'hours')?.querySelector('figcaption')?.textContent).toContain(`Pic à ${hourLabel(14, 'fr')} : 80 messages`);
  });

  test('7 barres de jours : dimanche d’abord (indice 0), noms dans la langue d’interface', async () => {
    const host = await openTab(statsGateway().deps);

    expect(rowLabels(await showTable(host, 'weekdays'))).toEqual(Array.from({ length: 7 }, (_, day) => weekdayName(day, 'fr')));
    expect(host.textContent).not.toContain('Dimanche');
  });

  test('sans aucun message, il n’y a pas de pic : « — » et « Aucun message sur la période »', async () => {
    const zeros = (length: number, key: string) => Array.from({ length }, (_, index) => ({ [key]: `${index}`, count: 0 }));
    const { deps } = statsGateway({
      '/api/v1/admin/messages/trends': {
        ok: true,
        data: { peakHour: { hour: 0, count: 0 }, peakWeekday: { day: 0, count: 0 }, hourlyActivity: zeros(24, 'hour'), weekdayActivity: zeros(7, 'day') },
      },
    });
    const host = await openTab(deps);

    expect(stat(host, 'peak-hour')).toContain('—');
    expect(stat(host, 'peak-hour')).toContain('Aucun message sur la période');
    expect(stat(host, 'peak-day')).toContain('—');
  });
});

describe('l’engagement', () => {
  test('taux en 0–100 lus comme tels, moyennes à une décimale, comptes en légende', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'reaction-rate')).toContain(percent(0.3));
    expect(stat(host, 'reaction-rate')).toContain('30 messages ont reçu au moins une réaction');
    expect(stat(host, 'reply-rate')).toContain(percent(0.2));
    expect(stat(host, 'reactions-per-message')).toContain('0,8');
    expect(stat(host, 'reactions-per-message')).toContain('75 réactions au total');
    expect(stat(host, 'replies-per-message')).toContain('0,3');
  });

  test('la fenêtre RÉELLE est écrite : 24 h retombe sur 7 jours, 90 jours sur 30 jours', async () => {
    const short = statsGateway();
    const host24 = await openTab(short.deps, '24h');
    expect(short.paths()).toContain('/api/v1/admin/messages/stats?period=24h');
    expect(short.paths()).toContain('/api/v1/admin/messages/engagement?period=7d');
    expect(host24.querySelector('[data-admin-stats-section="messages-engagement"]')?.textContent).toContain('Période : 7 derniers jours');
    mounter.unmountAll();

    const long = statsGateway();
    const host90 = await openTab(long.deps, '90d');
    expect(long.paths()).toContain('/api/v1/admin/messages/engagement?period=30d');
    expect(host90.querySelector('[data-admin-stats-section="messages-engagement"]')?.textContent).toContain('Période : 30 derniers jours');
    expect(host90.querySelector('[data-admin-stats-section="messages-overview"]')?.textContent).toContain('Période : 90 derniers jours');
  });

  test('le rythme dit qu’il porte toujours sur les 7 derniers jours, en UTC', async () => {
    const host = await openTab(statsGateway().deps);
    expect(host.querySelector('[data-admin-stats-section="messages-trends"]')?.textContent).toContain('Toujours sur les 7 derniers jours');
  });
});

describe('les états de l’onglet Messages', () => {
  test('erreur des statistiques : UNE erreur pour tout le groupe, avec un seul « Réessayer » ; le rythme continue de servir', async () => {
    const gateway = statsGateway({ '/api/v1/admin/messages/stats': { ok: false, status: 500, error: 'boom' } });
    const host = await openTab(gateway.deps);

    const overview = host.querySelector('[data-admin-stats-section="messages-overview"]');
    expect(overview?.querySelectorAll('[data-admin-error]')).toHaveLength(1);
    expect(overview?.querySelector('[data-admin-stat]')).toBeNull();
    expect(stat(host, 'peak-hour')).toContain(hourLabel(14, 'fr'));
  });

  test('refusé (403) : un refus en place, sans panne', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/messages/engagement': { ok: false, status: 403, error: 'Forbidden' } });
    const host = await openTab(deps);

    expect(host.querySelector('[data-admin-stats-section="messages-engagement"] [data-admin-denied-inline]')).not.toBeNull();
    expect(stat(host, 'total-messages')).toContain(fr.format(1200));
  });

  test('aucun expéditeur : le classement le dit par son état vide', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/messages/stats': { ok: true, data: { ...(PAYLOADS['/api/v1/admin/messages/stats'] as object), topSenders: [] } },
    });
    const host = await openTab(deps);

    expect(chart(host, 'top-senders')?.querySelector('[data-admin-chart-empty]')?.textContent).toBe('Aucune donnée sur la période');
  });
});
