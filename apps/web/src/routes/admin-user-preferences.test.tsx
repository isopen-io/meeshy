import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminUserPreferencesTab } from './admin-user-preferences';

/**
 * LES PRÉFÉRENCES D'UN MEMBRE (#7845, #7920) — chaque clé sous un libellé traduit, sa
 * valeur dite en mots ; une préférence se bascule tout de suite, revient en arrière sur
 * un refus et dit pourquoi ; le chiffrement se lit sans s'écrire ; les options des
 * listes sont NOMMÉES.
 */
const { mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const PREFS = {
  privacy: { showOnlineStatus: true, showReadReceipts: false, encryptionPreference: 'optional', extras: {} },
  audio: { transcriptionEnabled: false, ttsSpeed: 1.5, translatedAudioFormat: 'mp3' },
  message: { draftExpirationDays: 30, autoTranslateLanguages: ['en', 'es'] },
  notification: { dndStartTime: '22:00', dndDays: ['mon', 'tue'], dndUtcOffsetMinutes: 60 },
  video: { videoFrameRate: '30', videoCodec: 'VP9' },
  document: { autoDownloadMaxSize: 10, allowedFileTypes: ['image/*', 'application/pdf'] },
  application: { theme: 'auto', interfaceLanguage: 'en', brandNewKey: true },
};

function transport(reponsePatch: ApiResult<unknown>, vu: HttpRequest[]): HttpTransport {
  const t = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  t.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    vu.push(req);
    if (req.method === 'PATCH') return reponsePatch;
    if (req.path.endsWith('/preferences')) return { ok: true, data: PREFS };
    return { ok: false, status: 404, error: req.path };
  }) as HttpTransport['request'];
  return t;
}

const attendre = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function monter(reponsePatch: ApiResult<unknown>, vu: HttpRequest[] = []) {
  const annonces: string[] = [];
  const hote = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserPreferencesTab userId="u1" language="fr" onAnnounce={(texte) => annonces.push(texte)} deps={{ source: 'gateway', transport: transport(reponsePatch, vu) }} />
    </QueryClientProvider>,
  );
  await attendre();
  return { hote, annonces };
}

const bascule = (hote: ParentNode, chemin: string) => hote.querySelector<HTMLButtonElement>(`[data-admin-preference-switch="${chemin}"]`);
const ligne = (hote: ParentNode, chemin: string) => hote.querySelector(`[data-admin-preference="${chemin}"]`);
const texte = (element: Element | null) => (element?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

describe('les préférences d’un membre, modifiables', () => {
  test('une bascule écrit la seule clé changée, et l’écran suit tout de suite', async () => {
    const vu: HttpRequest[] = [];
    const { hote } = await monter({ ok: true, data: { category: 'privacy', preferences: { showOnlineStatus: false } } }, vu);
    act(() => bascule(hote, 'privacy.showOnlineStatus')?.click());

    expect(bascule(hote, 'privacy.showOnlineStatus')?.getAttribute('aria-checked')).toBe('false');
    await attendre();
    const patch = vu.find((r) => r.method === 'PATCH');
    expect([patch?.path, patch?.body]).toEqual(['/api/v1/admin/users/u1/preferences/privacy', { showOnlineStatus: false }]);
  });

  test('un refus pour consentement manquant revient en arrière et dit pourquoi', async () => {
    const { hote, annonces } = await monter({ ok: false, status: 403, error: 'refus', code: 'CONSENT_REQUIRED' });
    act(() => hote.querySelector<HTMLButtonElement>('[data-collapsible-toggle="admin-prefs-audio"]')?.click());
    act(() => bascule(hote, 'audio.transcriptionEnabled')?.click());
    await attendre();

    expect(bascule(hote, 'audio.transcriptionEnabled')?.getAttribute('aria-checked')).toBe('false');
    expect(hote.querySelector('[data-admin-preferences-error]')?.textContent).toContain('consentement');
    expect(annonces.at(-1)).toContain('consentement');
  });

  test('le chiffrement se lit sans pouvoir s’écrire', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    const liste = hote.querySelector<HTMLSelectElement>('[data-admin-preference-select="privacy.encryptionPreference"]');
    expect([liste?.value, liste?.disabled]).toEqual(['optional', true]);
    expect(hote.querySelector('[data-admin-preference="privacy.extras"]')).toBeNull();
  });
});

describe('chaque clé porte son libellé, chaque valeur se dit en mots (#7920)', () => {
  test('le libellé remplace la clé : « Envoyer les accusés de lecture », jamais showReadReceipts', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    expect(texte(ligne(hote, 'privacy.showReadReceipts'))).toContain('Envoyer les accusés de lecture');
    expect(texte(ligne(hote, 'privacy.showReadReceipts'))).not.toContain('showReadReceipts');
    expect(texte(ligne(hote, 'privacy.showOnlineStatus'))).toContain('Afficher le statut en ligne');
  });

  test('les booléens se disent Activé / Désactivé sous le libellé', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    expect(texte(ligne(hote, 'privacy.showOnlineStatus')?.querySelector('[data-admin-preference-value]') ?? null)).toBe('Activé');
    expect(texte(ligne(hote, 'privacy.showReadReceipts')?.querySelector('[data-admin-preference-value]') ?? null)).toBe('Désactivé');
  });

  test('les énumérations sont nommées, dans la valeur ET dans les options de la liste', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    expect(texte(ligne(hote, 'privacy.encryptionPreference')?.querySelector('[data-admin-preference-value]') ?? null)).toBe('Facultatif');
    const options = [...(hote.querySelectorAll('[data-admin-preference-select="privacy.encryptionPreference"] option') ?? [])].map((o) => o.textContent);
    expect(options).toEqual(['Désactivé', 'Facultatif', 'Toujours']);
    act(() => hote.querySelector<HTMLButtonElement>('[data-collapsible-toggle="admin-prefs-application"]')?.click());
    const themes = [...(hote.querySelectorAll('[data-admin-preference-select="application.theme"] option') ?? [])].map((o) => o.textContent);
    expect(themes).toEqual(['Clair', 'Sombre', 'Automatique']);
  });

  test('vitesse en ×, durées en jours, octets, heures, jours de la semaine, langues nommées, listes comptées', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    for (const categorie of ['audio', 'message', 'notification', 'video', 'document', 'application']) {
      act(() => hote.querySelector<HTMLButtonElement>(`[data-collapsible-toggle="admin-prefs-${categorie}"]`)?.click());
    }
    const value = (chemin: string) => texte(ligne(hote, chemin)?.querySelector('[data-admin-preference-value]') ?? null);
    expect(value('audio.ttsSpeed')).toBe('×1,5');
    expect(value('audio.translatedAudioFormat')).toBe('MP3');
    expect(value('message.draftExpirationDays')).toBe('30 jours');
    expect(value('message.autoTranslateLanguages')).toBe('anglais et espagnol');
    expect(value('notification.dndStartTime')).toBe('22:00');
    expect(value('notification.dndDays')).toBe('lundi et mardi');
    expect(value('notification.dndUtcOffsetMinutes')).toBe('UTC+01:00');
    expect(value('video.videoFrameRate')).toBe('30 images par seconde');
    expect(value('video.videoCodec')).toBe('VP9');
    expect(value('document.autoDownloadMaxSize')).toBe('10 Mo');
    expect(value('document.allowedFileTypes')).toBe('2 type(s) de fichier autorisé(s)');
    expect(value('application.interfaceLanguage')).toBe('Anglais');
  });

  test('une clé que ce client ne connaît pas se dit quand même : libellé humanisé, jamais le camelCase brut', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    act(() => hote.querySelector<HTMLButtonElement>('[data-collapsible-toggle="admin-prefs-application"]')?.click());
    const brandNew = texte(ligne(hote, 'application.brandNewKey'));
    expect(brandNew).toContain('Brand new key');
    expect(brandNew).toContain('Activé');
    expect(brandNew).not.toContain('brandNewKey');
  });

  test('aucune clé en camelCase n’est lue à l’écran : les noms de clés ne vivent que dans les ancres', async () => {
    const { hote } = await monter({ ok: true, data: {} });
    for (const categorie of ['audio', 'message', 'notification', 'video', 'document', 'application']) {
      act(() => hote.querySelector<HTMLButtonElement>(`[data-collapsible-toggle="admin-prefs-${categorie}"]`)?.click());
    }
    /* Nœud de texte par nœud de texte : concaténés, deux libellés voisins fabriqueraient un faux camelCase. */
    const camelCase = /\b[a-z]+[A-Z][A-Za-z]*\b/;
    const walker = document.createTreeWalker(hote, NodeFilter.SHOW_TEXT);
    const offenders: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const value = node.textContent?.trim() ?? '';
      if (camelCase.test(value)) offenders.push(value);
    }
    expect(offenders).toEqual([]);
    expectNoRawIdentifiers(hote);
  });
});
