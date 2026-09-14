import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ReelPage } from '@/components/reel-page';
import { REEL_MARKET_IMAGES, REEL_RANK2_ES, REEL_STUDIO, REEL_SUNSET_EN, REEL_VOICE } from '@/lib/api/fixtures-reels';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { showsFloatingMenus } from '@/lib/view/floating-gate';
import { ROUTES } from '@/routes/route-table';

import { ReelsBackButton, ReelsEmpty, ReelsFailure, ReelsFrame, ReelsSkeleton } from './reels';

/**
 * LE LECTEUR DES RÉELS, RENDU (#6457) — `renderToStaticMarkup`, même méthode que
 * `feed.test.tsx` : chaque état est un composant PUR, chaque page un réel. Les
 * effets (lecture, défilement) sont mesurés ailleurs — `use-reel-playback.test.tsx`
 * et `scripts/check-reels.mjs`.
 */
const NOW = new Date('2026-09-14T09:00:00.000Z');
const modelOf = (post: FeedPost, preferredLanguages: readonly string[] = ['fr']) => resolveFeedCardModel(post, { preferredLanguages, now: NOW });

const page = (post: FeedPost, overrides: Partial<Parameters<typeof ReelPage>[0]> = {}) =>
  renderToStaticMarkup(
    <ReelPage
      model={modelOf(post)}
      index={0}
      count={6}
      mode="active"
      soundOn={false}
      language="fr"
      onToggleSound={() => undefined}
      onGesture={() => undefined}
      onShare={() => undefined}
      {...overrides}
    />,
  );

describe('/reels — une adresse, plein écran, sans disques flottants', () => {
  test('la route est déclarée, et découpée à la demande', () => {
    expect(ROUTES.reels.pattern).toBe('/reels');
  });

  test('les menus flottants ne sont PAS montés sur les Réels (plein écran immersif)', () => {
    expect(showsFloatingMenus('reels')).toBe(false);
  });
});

describe('ReelPage — un réel VIDÉO', () => {
  test('se nomme par son auteur et sa place dans le fil', () => {
    const html = page(REEL_STUDIO, { index: 1 });
    expect(html).toContain('<article');
    expect(html).toContain('aria-label="Réel de Nadia Benali, 2 sur 6"');
    expect(html).toContain('data-reel="reel-studio"');
  });

  test('le réel visible monte son lecteur, en ligne, en boucle, sans recadrer la vidéo', () => {
    const html = page(REEL_STUDIO, { mode: 'active' });
    expect(html).toContain('<video');
    expect(html).toContain('playsInline');
    expect(html).toContain('loop');
    expect(html).toContain('object-contain');
  });

  test('un réel voisin garde son lecteur prêt ; un réel HORS FENÊTRE n’en a aucun, seulement son affiche', () => {
    expect(page(REEL_STUDIO, { mode: 'near' })).toContain('<video');
    const far = page(REEL_STUDIO, { mode: 'far' });
    expect(far).not.toContain('<video');
    expect(far).toContain('data-reel-poster');
  });

  test('le rail : j’aime et enregistrer sont des BASCULES qui disent leur état, partager un geste simple', () => {
    const html = page(REEL_SUNSET_EN);
    expect(html).toContain('data-reel-gesture="like"');
    expect(html).toMatch(/data-reel-gesture="like"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/data-reel-gesture="bookmark"[^>]*aria-pressed="true"/);
    expect(html).toContain('data-reel-gesture="share"');
    expect(html).toContain('J’aime');
    expect(html).toContain('Enregistrer');
    expect(html).toContain('Partager');
  });

  test('le son se commande depuis le rail et dit ce que le geste fera', () => {
    expect(page(REEL_STUDIO, { soundOn: false })).toContain('aria-label="Activer le son"');
    expect(page(REEL_STUDIO, { soundOn: true })).toContain('aria-label="Couper le son"');
  });

  test('un tap sur la scène met en pause ou relance — le contrôle existe parce qu’il a un effet', () => {
    expect(page(REEL_STUDIO)).toContain('aria-label="Lire le réel"');
  });
});

describe('ReelPage — la légende passe par le Prisme', () => {
  test('rang 1 : original anglais, traduction française servie, dans sa langue', () => {
    const html = page(REEL_SUNSET_EN);
    expect(html).toContain('L’heure dorée sur le port, avec le son.');
    expect(html).not.toContain('Golden hour');
    expect(html).toContain('lang="fr"');
  });

  test('rang 2 : aucune traduction française, l’anglais est servi — jamais l’espagnol', () => {
    const html = renderToStaticMarkup(
      <ReelPage model={modelOf(REEL_RANK2_ES, ['fr', 'en'])} index={0} count={1} mode="active" soundOn={false} language="fr" onToggleSound={() => undefined} onGesture={() => undefined} onShare={() => undefined} />,
    );
    expect(html).toContain('Rehearsal starts at eight sharp.');
    expect(html).not.toContain('El ensayo');
  });
});

describe('ReelPage — les autres compositions d’un réel', () => {
  test('des IMAGES se parcourent, chacune nommée, sans lecteur ni commande de son', () => {
    const html = page(REEL_MARKET_IMAGES);
    expect(html).not.toContain('<video');
    expect(html).toContain('alt="Image 1 sur 2"');
    expect(html).toContain('alt="Image 2 sur 2"');
    expect(html).not.toContain('Activer le son');
    expect(html).not.toContain('Lire le réel');
  });

  test('un réel AUDIO monte un lecteur sonore et sa commande de son', () => {
    const html = page(REEL_VOICE);
    expect(html).toContain('<audio');
    expect(html).toContain('Activer le son');
  });
});

describe('les états du lecteur sont DESSINÉS, jamais un écran noir muet', () => {
  test('chargement : un décor, et une annonce', () => {
    const html = renderToStaticMarkup(<ReelsSkeleton language="fr" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Chargement des réels');
  });

  test('vide : le dit, et annonce ce qui viendra', () => {
    const html = renderToStaticMarkup(<ReelsEmpty language="fr" />);
    expect(html).toContain('Aucun réel pour le moment');
    expect(html).toContain('Les réels de vos contacts apparaîtront ici.');
  });

  test('erreur en ligne : le motif et « Réessayer » à 44 px', () => {
    const html = renderToStaticMarkup(<ReelsFailure language="fr" online onRetry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible de charger les réels');
    expect(html).toContain('Réessayer');
    expect(html).toContain('min-height:44px');
  });

  test('hors ligne à cache froid : la coupure, et aucune promesse de réels déjà chargés', () => {
    const html = renderToStaticMarkup(<ReelsFailure language="fr" online={false} onRetry={() => undefined} />);
    expect(html).toContain('Hors ligne');
    expect(html).toContain('Les réels se chargeront dès le retour du réseau.');
    expect(html).not.toContain('Impossible de charger');
  });

  test('le retour est nommé et atteignable (44 px)', () => {
    const html = renderToStaticMarkup(<ReelsBackButton language="fr" onBack={() => undefined} />);
    expect(html).toContain('aria-label="Retour"');
    expect(html).toContain('size-11');
  });
});

/**
 * « RETOUR » EST LE PREMIER CONTRÔLE DU LECTEUR (#6498) — rendu APRÈS le fil,
 * il fallait traverser la scène et le rail de chaque réel monté pour
 * l'atteindre au clavier ou au lecteur d'écran (28 tabulations pour six réels,
 * mesuré). Sa place à l'écran est absolue : l'ordre du document ne la change pas.
 */
describe('le cadre du lecteur', () => {
  test('« Retour » précède le fil dans l’ordre du document', () => {
    const html = renderToStaticMarkup(
      <ReelsFrame language="fr" onBack={() => undefined} announcement="">
        <div data-reels-pager="" />
      </ReelsFrame>,
    );
    const retour = html.indexOf('data-reels-back');
    expect(retour).toBeGreaterThan(-1);
    expect(retour).toBeLessThan(html.indexOf('data-reels-pager'));
  });
});
