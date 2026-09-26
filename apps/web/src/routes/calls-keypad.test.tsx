import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PersonSummary } from '@/lib/api/friend-requests';
import type { CallDetail } from '@/lib/calls/call-detail';

import { CallDetailCard, CallDetailHeader, CallDetailSkeleton, CallDetailState } from './call-detail-parts';
import { KeypadCallFailed, KeypadField, KeypadHeader, KeypadPad, KeypadResult, KeypadStatusView } from './calls-keypad-parts';

/**
 * LE PAVÉ (#6454) ET LA FICHE D'UN APPEL (#6383) DESSINÉS — chaque pièce est
 * rendue sans DOM ni TanStack Query. Ces témoins disent ce qu'une capture ne
 * dit pas : où un résultat MÈNE, ce qu'un bouton ANNONCE au lecteur d'écran,
 * que chaque état a son texte, et que la fiche ne montre aucun numéro.
 */

const noop = () => undefined;
const NOW = new Date('2026-09-26T12:00:00.000Z');

const amina: PersonSummary = { id: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null };

const detail = (overrides: Partial<CallDetail> = {}): CallDetail => ({
  callId: 'call-amina',
  conversationId: 'c-amina',
  name: 'Amina Diallo',
  avatar: null,
  isGroup: false,
  direction: 'incoming',
  media: 'video',
  startedAt: '2026-09-26T09:00:00.000Z',
  durationSec: 185,
  bytes: 46_400_000,
  live: false,
  ...overrides,
});

describe('le pavé', () => {
  test('un retour vers le journal et le titre', () => {
    const html = renderToStaticMarkup(<KeypadHeader language="fr" />);
    expect(html).toContain('href="/calls"');
    expect(html).toContain('Clavier');
  });

  test('le champ est nommé ; l’effacement n’apparaît qu’avec une saisie', () => {
    const empty = renderToStaticMarkup(<KeypadField language="fr" value="" onChange={noop} onDelete={noop} onClear={noop} />);
    expect(empty).toContain('aria-label="Numéro ou nom à rechercher"');
    expect(empty).toContain('placeholder="Numéro ou nom"');
    expect(empty).not.toContain('data-keypad-delete');
    const typed = renderToStaticMarkup(<KeypadField language="fr" value="+221" onChange={noop} onDelete={noop} onClear={noop} />);
    expect(typed).toContain('aria-label="Effacer"');
  });

  test('douze touches de 56 px, chacune nommée par son chiffre', () => {
    const html = renderToStaticMarkup(<KeypadPad onKey={noop} />);
    expect(html.match(/data-keypad-key=/g)?.length).toBe(12);
    expect(html).toContain('data-keypad-key="+"');
    expect(html).toContain('aria-label="0"');
    expect(html).toContain('size-14');
  });

  test('chaque état a son texte, et l’erreur se réessaie', () => {
    const idle = renderToStaticMarkup(<KeypadStatusView language="fr" status="idle" onRetry={noop} />);
    expect(idle).toContain('Composez un numéro ou un nom');
    expect(renderToStaticMarkup(<KeypadStatusView language="fr" status="searching" onRetry={noop} />)).toContain('Recherche…');
    expect(renderToStaticMarkup(<KeypadStatusView language="fr" status="none" onRetry={noop} />)).toContain('Aucun contact trouvé');
    expect(renderToStaticMarkup(<KeypadStatusView language="fr" status="offline" onRetry={noop} />)).toContain('Hors ligne');
    const error = renderToStaticMarkup(<KeypadStatusView language="fr" status="error" onRetry={noop} />);
    expect(error).toContain('role="alert"');
    expect(error).toContain('data-keypad-retry');
    expect(idle).not.toContain('data-keypad-retry');
  });

  test('un résultat mène au profil et s’appelle en vocal ou en vidéo, nommé', () => {
    const html = renderToStaticMarkup(<KeypadResult language="fr" person={amina} onCall={noop} />);
    expect(html).toContain('href="/u/amina"');
    expect(html).toContain('aria-label="Appel vocal à Amina Diallo"');
    expect(html).toContain('aria-label="Appel vidéo à Amina Diallo"');
    expect(html).toContain('size-11');
  });

  test('un résultat ne peint aucune présence', () => {
    const html = renderToStaticMarkup(<KeypadResult language="fr" person={amina} onCall={noop} />);
    expect(html).not.toContain('data-presence');
  });

  test('un appel qui n’a pas démarré se dit', () => {
    expect(renderToStaticMarkup(<KeypadCallFailed language="fr" />)).toContain('role="alert"');
  });
});

describe('la fiche d’un appel', () => {
  test('un retour vers le journal et le titre', () => {
    const html = renderToStaticMarkup(<CallDetailHeader language="fr" />);
    expect(html).toContain('href="/calls"');
    expect(html).toContain('Détail de l’appel');
  });

  test('le nom, la direction, deux rappels nommés, Type · Date · Durée · Données', () => {
    const html = renderToStaticMarkup(<CallDetailCard language="fr" detail={detail()} now={NOW} onCall={noop} />);
    expect(html).toContain('Amina Diallo');
    expect(html).toContain('data-call-detail-status="incoming"');
    expect(html).toContain('aria-label="Appel vocal à Amina Diallo"');
    expect(html).toContain('aria-label="Appel vidéo à Amina Diallo"');
    for (const field of ['type', 'date', 'duration', 'data']) expect(html).toContain(`data-call-detail-row="${field}"`);
    expect(html).toContain('44 Mo');
    expect(html).toContain('href="/c/c-amina"');
  });

  test('aucune ligne ne s’invente : sans octets, ni durée, ni date', () => {
    const html = renderToStaticMarkup(<CallDetailCard language="fr" detail={detail({ bytes: null, durationSec: 0, startedAt: null })} now={NOW} onCall={noop} />);
    expect(html).toContain('data-call-detail-row="type"');
    expect(html).not.toContain('data-call-detail-row="data"');
    expect(html).not.toContain('data-call-detail-row="duration"');
    expect(html).not.toContain('data-call-detail-row="date"');
  });

  test('le numéro du pair n’y paraît jamais (D-127)', () => {
    const html = renderToStaticMarkup(<CallDetailCard language="fr" detail={detail()} now={NOW} onCall={noop} />);
    expect(html).not.toMatch(/tel:|\+\d{6,}|Téléphone/);
  });

  test('un appel manqué se lit sans la couleur', () => {
    const html = renderToStaticMarkup(<CallDetailCard language="fr" detail={detail({ direction: 'missed' })} now={NOW} onCall={noop} />);
    expect(html).toContain('data-call-detail-status="missed"');
    expect(html).toContain('Manqué');
  });

  test('introuvable, erreur réessayable, hors ligne, connexion, squelette', () => {
    expect(renderToStaticMarkup(<CallDetailState language="fr" kind="not-found" />)).toContain('Appel introuvable');
    expect(renderToStaticMarkup(<CallDetailState language="fr" kind="error" onRetry={noop} />)).toContain('data-call-detail-retry');
    expect(renderToStaticMarkup(<CallDetailState language="fr" kind="offline" />)).toContain('data-call-detail-state="offline"');
    expect(renderToStaticMarkup(<CallDetailState language="fr" kind="joining" />)).toContain('role="status"');
    expect(renderToStaticMarkup(<CallDetailSkeleton language="fr" />)).toContain('aria-busy="true"');
  });
});
