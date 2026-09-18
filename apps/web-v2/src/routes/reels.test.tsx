import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ReelPage } from '@/components/reel-page';
import { REEL_MARKET_IMAGES, REEL_RANK2_ES, REEL_SCENE_LOOP, REEL_STUDIO, REEL_SUNSET_EN, REEL_VOICE } from '@/lib/api/fixtures-reels';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
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
      preferredLanguages={['fr']}
      onToggleSound={() => undefined}
      onGesture={() => undefined}
      onShare={() => undefined}
      onSoundBlocked={() => undefined}
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
      <ReelPage
        model={modelOf(REEL_RANK2_ES, ['fr', 'en'])}
        index={0}
        count={1}
        mode="active"
        soundOn={false}
        language="fr"
        preferredLanguages={['fr', 'en']}
        onToggleSound={() => undefined}
        onGesture={() => undefined}
        onShare={() => undefined}
        onSoundBlocked={() => undefined}
      />,
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

/**
 * T7 (#6903) — un réel COMPOSÉ (`REEL_SCENE_LOOP`) se rejoue comme sa scène,
 * jamais comme une vidéo brute. `renderToStaticMarkup` (SSR, SYNCHRONE) ne
 * résout JAMAIS un chunk chargé À LA DEMANDE (`lazy`) : la scène y rend le
 * FALLBACK `Suspense` (`ReelPoster`) — ce que ces témoins prouvent est donc
 * la DÉCISION prise en amont du chunk (la scène gagne sur le média, jamais
 * de `<video>` brut ; le rail son suit `sceneHasControllableSound`, calculé
 * par `ReelPage` lui-même, hors du `Suspense`). La résolution RÉELLE du
 * chunk (`data-reel-scene` apparaissant après le chargement) est prouvée en
 * rendu CLIENT ci-dessous.
 */
describe('ReelPage — un réel COMPOSÉ (#6903)', () => {
  test('mode="active" ⇒ jamais data-reel-media="video" (la scène gagne, même en attendant son chunk)', () => {
    const html = page(REEL_SCENE_LOOP, { mode: 'active' });
    expect(html).toContain('data-reel-poster');
    expect(html).toContain('Activer le son');
    expect(html).not.toContain('data-reel-media="video"');
  });

  test('mode="far" ⇒ data-reel-poster (jamais le chunk du moteur chargé)', () => {
    const html = page(REEL_SCENE_LOOP, { mode: 'far' });
    expect(html).toContain('data-reel-poster');
  });

  test('un réel à scène SANS son (fond muet, aucun `sound`) ⇒ pas de bouton son (loi 4)', () => {
    const silent: FeedPost = {
      ...REEL_SCENE_LOOP,
      id: 'reel-scene-silent',
      storyEffects: {
        v: 3,
        scenes: [
          {
            id: 's1',
            objects: [
              {
                id: 'bg1',
                kind: 'media',
                anchor: { t: 'free', x: 0.5, y: 0.5 },
                plane: 'bg',
                z: 0,
                transform: { scale: 1, rotation: 0, opacity: 1 },
                payload: { postMediaId: 'media-reel-scene-video', mediaType: 'video/webm', muted: true },
              },
            ],
          },
        ],
      },
    };
    const html = page(silent, { mode: 'active' });
    expect(html).not.toContain('Activer le son');
    expect(html).not.toContain('Couper le son');
  });

  test('la légende passe par le Prisme comme avant', () => {
    const html = page(REEL_SCENE_LOOP, { mode: 'active' });
    expect(html).toContain('data-reel-caption');
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Boucle de fin de répétition');
  });
});

/**
 * T7 bis (#6903) — LA RÉSOLUTION RÉELLE DU CHUNK : rendu CLIENT
 * (`createRoot` + `act`, motif `reel-scene-stage.test.tsx`), happy-dom
 * enregistré et libéré POUR CE SEUL bloc — les témoins `renderToStaticMarkup`
 * ci-dessus n'en ont pas besoin.
 */
describe('ReelPage — un réel COMPOSÉ, la scène apparaît une fois son chunk résolu (T7 bis, #6903)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await import('@/components/scene-player');
    await import('@/components/reel-scene-stage');
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  test('mode="active" ⇒ data-reel-scene apparaît, jamais un <video data-reel-media>', async () => {
    const container = window.document.createElement('div');
    window.document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ReelPage
          model={modelOf(REEL_SCENE_LOOP)}
          index={0}
          count={1}
          mode="active"
          soundOn={false}
          language="fr"
          preferredLanguages={['fr']}
          onToggleSound={() => undefined}
          onGesture={() => undefined}
          onShare={() => undefined}
          onSoundBlocked={() => undefined}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelector('[data-reel-scene]')).not.toBeNull();
    expect(container.querySelector('[data-reel-media]')).toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
