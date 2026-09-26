import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CALLS_GLYPHS } from '@/components/glyphs-calls';
import type { CallRecord } from '@/lib/api/calls';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CallFilterRail, CallRow, CallsEmpty, CallsError, CallsHeader, CallsOfflineNotice } from './calls-parts';

/**
 * LE JOURNAL D'APPELS DESSINÉ (#6362) — miroir `CallsTab` et `CallJournalRow`
 * (`apps/ios/Meeshy/Features/Contacts/CallsTab.swift`) : chaque pièce est rendue
 * sans DOM ni TanStack Query. Ces témoins prouvent ce qu'aucune capture ne dit :
 * où une ligne MÈNE, ce qu'elle ANNONCE, comment elle distingue les trois
 * directions sans la couleur, et le geste qu'elle ne montre pas.
 */

const noop = () => undefined;
const NOW = new Date('2026-09-13T12:00:00.000Z');

const record = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  callId: 'call-amina',
  conversationId: 'c-amina',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  direction: 'incoming',
  isVideo: false,
  startedAt: '2026-09-13T09:00:00.000Z',
  durationSec: 185,
  bytes: null,
  peer: { userId: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
  ...overrides,
});

const row = (overrides: Partial<CallRecord> = {}, language: 'fr' | 'en' = 'fr') =>
  renderToStaticMarkup(<CallRow language={language} record={record(overrides)} now={NOW} />);

describe('l’en-tête et le filtre', () => {
  test('un retour NOMMÉ et le titre « Appels »', () => {
    const html = renderToStaticMarkup(<CallsHeader language="fr" />);
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('Appels');
  });

  test('le pavé (#6454) s’atteint depuis l’en-tête, nommé', () => {
    const html = renderToStaticMarkup(<CallsHeader language="fr" />);
    expect(html).toContain('href="/calls/keypad"');
    expect(html).toContain('aria-label="Composer un numéro"');
  });

  test('« Tous » et « Manqués » sont deux boutons dont l’état se lit', () => {
    const html = renderToStaticMarkup(<CallFilterRail language="fr" selected="missed" onSelect={noop} />);
    expect(html).toContain('aria-label="Filtrer le journal d’appels"');
    expect(html).toMatch(/aria-pressed="false"[^>]*>(<[^>]+>)*Tous/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(<[^>]+>)*Manqués/);
  });
});

describe('une ligne du journal', () => {
  test('ouvre la FICHE de son appel (#6383), comme la feuille de détail d’iOS', () => {
    expect(row()).toContain('href="/call/call-amina"');
    expect(row({ callId: 'call-annonces' })).toContain('href="/call/call-annonces"');
  });

  test('manqué, reçu et émis se distinguent par le GLYPHE et par le LIBELLÉ, pas par la couleur seule', () => {
    const missed = row({ direction: 'missed', durationSec: 0 });
    const incoming = row({ direction: 'incoming' });
    const outgoing = row({ direction: 'outgoing' });
    expect(missed).toContain(CALLS_GLYPHS.phoneX.body);
    expect(incoming).toContain(CALLS_GLYPHS.arrowDownLeft.body);
    expect(outgoing).toContain(CALLS_GLYPHS.arrowUpRight.body);
    expect(incoming).not.toContain(CALLS_GLYPHS.phoneX.body);
    expect(missed).toMatch(/data-call-direction="missed"[^>]*>Manqué</);
    expect(incoming).toMatch(/data-call-direction="incoming"[^>]*>Reçu</);
    expect(outgoing).toMatch(/data-call-direction="outgoing"[^>]*>Émis</);
  });

  test('l’annonce au lecteur d’écran recompose tout ce que la ligne montre : nom, direction, type, heure, durée', () => {
    expect(row({ direction: 'missed', isVideo: true, durationSec: 0 })).toContain('aria-label="Amina Diallo, appel manqué, appel vidéo, 3h"');
    expect(row({ direction: 'outgoing', durationSec: 754 })).toContain('aria-label="Amina Diallo, appel émis, appel vocal, 3h, durée 12:34"');
  });

  test('la durée se lit M:SS ; un appel sans durée n’en affiche aucune', () => {
    expect(row({ durationSec: 3725 })).toContain('1:02:05');
    expect(row({ direction: 'missed', durationSec: 0 })).not.toContain('data-call-duration');
  });

  test('la vidéo porte son glyphe ; un appel vocal n’en porte pas', () => {
    expect(row({ isVideo: true })).toContain(CALLS_GLYPHS.videoCamera.body);
    expect(row({ isVideo: false })).not.toContain(CALLS_GLYPHS.videoCamera.body);
  });

  test('un appel de groupe se nomme par sa conversation ; sans nom, « Inconnu »', () => {
    expect(row({ peer: null, conversationTitle: 'Annonces produit' })).toContain('Annonces produit');
    expect(row({ peer: null })).toContain('Inconnu');
  });

  test('« Rappeler » rappelle du même type que l’appel d’origine, hors du lien de la ligne', () => {
    const audio = row({ direction: 'missed' });
    expect(audio).toContain('data-call-back="audio"');
    expect(audio).toContain('aria-label="Rappeler Amina Diallo"');
    expect(audio.indexOf('data-call-back')).toBeGreaterThan(audio.indexOf('</a>'));
    expect(row({ isVideo: true })).toContain('data-call-back="video"');
  });

  test('en anglais, l’annonce est anglaise', async () => {
    await loadInterfaceCatalog('en');
    expect(row({ direction: 'missed', durationSec: 0 }, 'en')).toContain('aria-label="Amina Diallo, missed call, voice call, 3h"');
  });
});

describe('les états', () => {
  test('le vide nomme le filtre : « Aucun appel récent », ou « Aucun appel manqué »', () => {
    expect(renderToStaticMarkup(<CallsEmpty language="fr" filter="all" />)).toContain('Aucun appel récent');
    expect(renderToStaticMarkup(<CallsEmpty language="fr" filter="missed" />)).toContain('Aucun appel manqué');
  });

  test('l’erreur offre de réessayer, et dit « hors ligne » quand c’est la cause', () => {
    const online = renderToStaticMarkup(<CallsError language="fr" online onRetry={noop} />);
    expect(online).toContain('role="alert"');
    expect(online).toContain('Réessayer');
    expect(online).toContain('Le journal d’appels n’a pas pu être chargé');
    expect(renderToStaticMarkup(<CallsError language="fr" online={false} onRetry={noop} />)).toContain('Hors ligne');
  });

  test('hors ligne sur un cache non vide, le journal reste et le dit', () => {
    const html = renderToStaticMarkup(<CallsOfflineNotice language="fr" cold={false} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Vous voyez le journal du dernier chargement.');
  });

  test('hors ligne à cache FROID, l’annonce ne promet aucun journal déjà chargé (#6419)', () => {
    const html = renderToStaticMarkup(<CallsOfflineNotice language="fr" cold />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Le journal se chargera dès le retour du réseau.');
    expect(html).not.toContain('dernier chargement');
  });
});
