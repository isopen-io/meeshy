import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { cardOfMoment, cardOfStep } from '@/lib/game-guide/card';
import { guideMoment, ONBOARDING_STEPS } from '@meeshy/shared/utils/game/guide';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { RulesBody } from '@/routes/progression-rules';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameFlamePanel } from './game-flame-panel';
import { GameGuideCard } from './game-guide-card';
import { GameHero } from './game-hero';
import { PlayerBanner } from './player-banner';
import { playerBannerModel } from '@/lib/view/player-banner';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { GameMintPreview } from './game-mint-preview';
import { GameMissions } from './game-missions';
import { GamePhotoOffer } from './game-photo-offer';
import { rankMoment } from '@/lib/game-photo/moments';

/**
 * LE JEU, DANS LES SEPT LANGUES (#9379) — chaque surface du jeu se rend dans
 * la langue de l'interface (`<html lang>`), sans paramètre resté en clair, sans
 * clé nue, et autrement qu'en français. C'est le témoin de bout en bout du
 * catalogue : les composants lisent la langue à l'appel, pas à l'import.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const inLanguage = (language: InterfaceLanguage): void => {
  document.documentElement.lang = language;
  document.documentElement.dir = interfaceDirection(language);
};

const game = gameBlockFixture({ levelRecord: 20, glory: 620, balance: 4, streak: 6, freezes: 1 });
const outFlame = gameBlockFixture({ streak: 0, broken: { streak: 6, lastActiveDay: '2026-10-03' }, balance: 2 }).flame;

type Surfaces = Readonly<Record<'hero' | 'missions' | 'flame' | 'mint' | 'guide' | 'moment' | 'offer' | 'rules' | 'banner', string>>;

const bannerGame = gameBlockWithExtrasFixture({ balance: 12, streak: 23 });

function surfaces(): Surfaces {
  const step = ONBOARDING_STEPS[3];
  if (step === undefined) throw new Error('étape attendue');
  const bannerModel = playerBannerModel(bannerGame);
  if (bannerModel === null) throw new Error('un bandeau était attendu');
  return {
    hero: text(renderToStaticMarkup(<GameHero game={game} />)),
    missions: text(
      renderToStaticMarkup(
        <GameMissions
          missions={game.missions}
          chest={game.chest}
          held={game.treasury.held}
          level={game.level.level}
          prismHour={{ startMinute: 1140, endMinute: 1200, multiplier: 2 }}
          online
          pendingRerollId={null}
          chestOpening={false}
          onReroll={() => undefined}
          onClaim={() => undefined}
        />,
      ),
    ),
    flame: text(
      renderToStaticMarkup(
        <GameFlamePanel flame={{ ...outFlame, status: 'out', canRelight: true }} held={1} online={false} buyingFreeze={false} relighting={false} onBuyFreeze={() => undefined} onRelight={() => undefined} />,
      ),
    ),
    mint: text(
      renderToStaticMarkup(
        <GameMintPreview
          mint={game.mint}
          held={game.level.score}
          badgesLost={2}
          online
          minting={false}
          celebration={null}
          onMint={() => undefined}
        />,
      ),
    ),
    guide: text(renderToStaticMarkup(<GameGuideCard card={cardOfStep(step)} onAction={() => undefined} onDismiss={() => undefined} onSkipAll={() => undefined} />)),
    moment: text(
      renderToStaticMarkup(
        <GameGuideCard
          card={cardOfMoment(guideMoment({ kind: 'first-mint', levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14 }, []))}
          onAction={() => undefined}
          onDismiss={() => undefined}
          onPhoto={() => undefined}
        />,
      ),
    ),
    offer: text(renderToStaticMarkup(<GamePhotoOffer moment={rankMoment({ rank: 'voix', division: 2 })} onStart={() => undefined} onLater={() => undefined} />)),
    rules: text(renderToStaticMarkup(<RulesBody />)),
    /* La bannière ne montre que des chiffres et des dessins : sa langue est dans la phrase lue (#9494). */
    banner: renderToStaticMarkup(<PlayerBanner model={bannerModel} />).match(/aria-label="([^"]*)"/)?.[1] ?? '',
  };
}

describe('chaque surface du jeu se rend dans la langue de l’interface', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES.filter((code) => code !== 'fr')) {
    test(`${language} : aucune clé nue, aucun paramètre en clair, rien de français`, () => {
      inLanguage('fr');
      const reference = surfaces();
      inLanguage(language);
      const rendered = surfaces();
      for (const [name, page] of Object.entries(rendered) as ReadonlyArray<readonly [keyof Surfaces, string]>) {
        expect({ language, name, bare: /\bgame\.[a-z_]+\./.test(page) }).toEqual({ language, name, bare: false });
        expect({ language, name, param: /\{\w+\}/.test(page) }).toEqual({ language, name, param: false });
        expect({ language, name, junk: /undefined|NaN/.test(page) }).toEqual({ language, name, junk: false });
        expect({ language, name, french: page === reference[name] }).toEqual({ language, name, french: false });
      }
      expect(rendered.missions).not.toContain('Missions du jour');
      expect(rendered.mint).not.toContain('Frapper');
      expect(rendered.offer).not.toContain('On immortalise');
    });
  }

  test('en : les surfaces disent ce qu’un anglophone attend', () => {
    inLanguage('en');
    const rendered = surfaces();
    /* Le niveau a quitté les jauges pour le héros pleine largeur (#5841) : c'est là qu'un anglophone le lit. */
    expect(rendered.hero).toContain('Level');
    expect(rendered.banner).toMatch(/^Level \d+, /);
    expect(rendered.missions).toContain('Missions of the day');
    expect(rendered.missions).toContain('Chest of the day');
    expect(rendered.offer).toContain('Shall we capture it?');
  });

  test('ar : les montants signés et les flèches sont isolés de gauche à droite', () => {
    inLanguage('ar');
    const rendered = surfaces();
    expect(rendered.mint).toContain('⁦');
    expect(rendered.mint.replace(/⁦[^⁩]*⁩/g, '')).not.toMatch(/→/);
  });
});
