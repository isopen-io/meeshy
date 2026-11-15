import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { mascotSay } from '@/lib/view/mascot-copy';
import { achievementCopy } from '@/lib/view/progression';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { PAGE_ABOUT } from '@/institutional/about';
import { InstitutionalPage } from '@/institutional/page';

import { AuthBrandFooter } from './auth-chrome';

/**
 * UNE SEULE LANGUE D'INTERFACE (#10827) — l'annonce du lecteur d'écran du pied
 * de marque « by services.ceo » et les phrases de la mascotte de Progression
 * parlaient français en dur. Un lecteur en anglais n'y entend plus un mot de
 * français ; les pages institutionnelles, documents français, gardent la leur.
 */

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/login' });
  await Promise.all((['en', 'ar'] as const).flatMap((language) => [loadInterfaceCatalog(language), loadGameCatalog(language)]));
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

describe('le pied de marque des écrans d’accès', () => {
  test('en anglais, le lien annonce sa sortie en anglais, après le crédit lu', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<AuthBrandFooter />);
    expect(html).toContain('by services.ceo<span class="sr-only"> — opens the services.ceo platform in a new tab</span>');
    expect(html).not.toContain('ouvre la plateforme');
  });

  test('en français, la phrase reste celle de #10096', () => {
    const html = renderToStaticMarkup(<AuthBrandFooter />);
    expect(html).toContain(' — ouvre la plateforme services.ceo dans un nouvel onglet');
  });

  test('les pages institutionnelles, documents français, gardent la phrase française', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<InstitutionalPage page={PAGE_ABOUT} version="3.1.0" />);
    expect(html).toContain(' — ouvre la plateforme services.ceo dans un nouvel onglet');
  });
});

const FRENCH = /Tchak|toute neuve|Tu en as|Niveau|On fête|Succès débloqué|Tes étincelles|frappe|Salut|je suis|jours d’affilée|Encore|avant le niveau|sommet/u;

describe('la mascotte, interface en', () => {
  test('chaque ligne parle anglais, accordée au nombre', () => {
    document.documentElement.lang = 'en';
    expect(mascotSay({ kind: 'meesh-minted', balance: 3 })).toBe('Clack! A brand-new Meesh joins your legacy. You have 3.');
    expect(mascotSay({ kind: 'level-up', level: 3 })).toBe('Level 3! Your light grows, let’s cheer!');
    expect(mascotSay({ kind: 'achievement', key: 'achievement.first_voice' })).toBe(
      `Great deed done: ${achievementCopy('achievement.first_voice', 'en').title}!`,
    );
    expect(mascotSay({ kind: 'can-mint', mintCost: 1221 })).toBe('Your light is ready: shall we bind 1,221 sparks into a Meesh?');
    expect(mascotSay({ kind: 'first-step' })).toBe('Hi, I’m Mee! Send your first message and watch your sparks fly.');
    expect(mascotSay({ kind: 'streak', days: 4 })).toBe('Your Flame has burned for 4 days, keep it up!');
    expect(mascotSay({ kind: 'meesh-missing', missing: 1 })).toBe('1 more spark, and I’ll mint your next Meesh.');
    expect(mascotSay({ kind: 'meesh-missing', missing: 821 })).toBe('821 more sparks, and I’ll mint your next Meesh.');
    expect(mascotSay({ kind: 'level-missing', missing: 90, nextLevel: 3 })).toBe('90 more sparks, and your light reaches level 3.');
    expect(mascotSay({ kind: 'top-level' })).toBe('Your light is at its peak. Well done!');
  });

  test('aucune ligne ne laisse passer un mot de français', () => {
    document.documentElement.lang = 'en';
    const lines = [
      mascotSay({ kind: 'meesh-minted', balance: 1 }),
      mascotSay({ kind: 'level-up', level: 2 }),
      mascotSay({ kind: 'achievement', key: 'achievement.first_voice' }),
      mascotSay({ kind: 'can-mint', mintCost: 1 }),
      mascotSay({ kind: 'first-step' }),
      mascotSay({ kind: 'streak', days: 1 }),
      mascotSay({ kind: 'meesh-missing', missing: 2 }),
      mascotSay({ kind: 'level-missing', missing: 1, nextLevel: 2 }),
      mascotSay({ kind: 'top-level' }),
    ];
    lines.forEach((line) => expect(line).not.toMatch(FRENCH));
  });

  test('en arabe, le duel a sa forme', () => {
    document.documentElement.lang = 'ar';
    expect(mascotSay({ kind: 'streak', days: 2 })).toBe('لهبك مشتعل منذ يومين، واصل هكذا!');
  });
});
