import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ElansHero } from './progression-heroes';

/**
 * LA CARTE DES ÉLANS SE LIT ENTIÈRE DANS LA LANGUE DU LECTEUR (#10439).
 *
 * #10438 a traduit son titre ; la phrase sous les chips, l'invitation au repos
 * et les chips eux-mêmes restaient en français. Les mots sont ceux d'iOS
 * (`ProgressionCopy.elan(…)`, `elansEmpty`, `elansHint`) ; les chips disent la
 * famille comme la modale qu'ils ouvrent (`familyName`).
 */

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/elans' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];

const accelerated = { factor: 3, activeFamilyCount: 3, hasStanding: true, windowDays: 7, activeFamilies: ['content', 'comment', 'social'] };
const acceleratedOne = { factor: 2, activeFamilyCount: 1, hasStanding: false, windowDays: 7, activeFamilies: ['content'] };
const neutral = { factor: 1, activeFamilyCount: 1, hasStanding: false, windowDays: 7, activeFamilies: ['content'] };
const empty = { factor: 1, activeFamilyCount: 0, hasStanding: false, windowDays: 7, activeFamilies: [] };

type Elan = typeof accelerated | typeof neutral | typeof empty;

const render = (language: InterfaceLanguage, elan: Elan): HTMLElement => {
  document.documentElement.lang = language;
  document.documentElement.dir = interfaceDirection(language);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ElansHero progress={resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, elan })} />);
  return host;
};

const clean = (text: string | null | undefined): string => (text ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
const sentenceOf = (host: HTMLElement): string => clean(host.querySelector('p')?.textContent);
const chipsOf = (host: HTMLElement): readonly string[] => [...host.querySelectorAll('[data-chip]')].map((chip) => clean(chip.textContent));

const ACCELERATED: Readonly<Record<InterfaceLanguage, string>> = {
  fr: '3 familles actives sur 7 jours, plus ton assise. Tes prochains gestes rapportent 3 fois plus.',
  en: '3 active families over 7 days, plus your standing. Your next moves bring 3 times more.',
  es: '3 familias activas en 7 días, más tu base. Tus próximas acciones valen 3 veces más.',
  pt: '3 famílias ativas em 7 dias, mais sua base. Suas próximas ações valem 3 vezes mais.',
  de: '3 aktive Familien über 7 Tage, plus dein Bestand. Deine nächsten Aktionen bringen 3-mal mehr.',
  it: '3 famiglie attive su 7 giorni, più la tua base. I tuoi prossimi gesti rendono 3 volte di più.',
  ar: '3 فئات نشطة خلال 7 يومًا، بالإضافة إلى رصيدك الثابت. أفعالك القادمة تُكسبك 3 أضعاف أكثر.',
};

const ACCELERATED_ONE: Readonly<Record<InterfaceLanguage, string>> = {
  fr: '1 famille active sur 7 jours. Tes prochains gestes rapportent 2 fois plus.',
  en: '1 active family over 7 days. Your next moves bring 2 times more.',
  es: '1 familia activa en 7 días. Tus próximas acciones valen 2 veces más.',
  pt: '1 família ativa em 7 dias. Suas próximas ações valem 2 vezes mais.',
  de: '1 aktive Familie über 7 Tage. Deine nächsten Aktionen bringen 2-mal mehr.',
  it: '1 famiglia attiva su 7 giorni. I tuoi prossimi gesti rendono 2 volte di più.',
  ar: 'فئة نشطة واحدة خلال 7 يومًا. أفعالك القادمة تُكسبك 2 أضعاف أكثر.',
};

const HINT: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'Tiens une famille de plus en même temps pour déclencher le multiplicateur.',
  en: 'Keep one more family going at the same time to trigger the multiplier.',
  es: 'Mantén una familia más a la vez para activar el multiplicador.',
  pt: 'Mantenha mais uma família ao mesmo tempo para ativar o multiplicador.',
  de: 'Halte eine weitere Familie gleichzeitig am Laufen, um den Multiplikator auszulösen.',
  it: 'Porta avanti un’altra famiglia allo stesso tempo per far scattare il moltiplicatore.',
  ar: 'حافظ على عائلة إضافية في الوقت نفسه لتفعيل المضاعف.',
};

const EMPTY: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'Publie une story, un post, un réel ou lance une conversation : chaque famille tenue en même temps multiplie tes étincelles.',
  en: 'Post a story, a post, a reel or start a conversation: each family you keep going at once multiplies your sparks.',
  es: 'Publica una historia, una publicación, un reel o inicia una conversación: cada familia que mantienes a la vez multiplica tus chispas.',
  pt: 'Publique um story, um post, um reel ou inicie uma conversa: cada família mantida ao mesmo tempo multiplica as suas faíscas.',
  de: 'Poste eine Story, einen Beitrag, ein Reel oder starte eine Unterhaltung: Jede Familie, die du gleichzeitig hältst, vervielfacht deine Funken.',
  it: 'Pubblica una storia, un post, un reel o avvia una conversazione: ogni famiglia portata avanti insieme moltiplica le tue scintille.',
  ar: 'انشر قصة أو منشورًا أو مقطعًا أو ابدأ محادثة: كل عائلة تحافظ عليها في الوقت نفسه تضاعف شراراتك.',
};

const CHIPS: Readonly<Record<InterfaceLanguage, readonly string[]>> = {
  fr: ['Contenu', 'Commentaires', 'Lien social'],
  en: ['Content', 'Comments', 'Social ties'],
  es: ['Contenido', 'Comentarios', 'Vínculos'],
  pt: ['Conteúdo', 'Comentários', 'Laços'],
  de: ['Inhalte', 'Kommentare', 'Bindungen'],
  it: ['Contenuti', 'Commenti', 'Legami'],
  ar: ['المحتوى', 'التعليقات', 'الروابط'],
};

const FRENCH_ONLY = /\b(?:familles?|jours|gestes|assise|Tenez|multiplicateur|Publiez|Contenu|Lien social)\b/;

describe('ElansHero — toute la carte dans la langue du lecteur (#10439)', () => {
  for (const language of LANGUAGES) {
    test(`${language} : l’élan en cours se décrit avec les mots d’iOS`, () => {
      expect(sentenceOf(render(language, accelerated))).toBe(ACCELERATED[language]);
      expect(sentenceOf(render(language, acceleratedOne))).toBe(ACCELERATED_ONE[language]);
    });

    test(`${language} : au repos, la carte invite avec les mots d’iOS`, () => {
      expect(sentenceOf(render(language, neutral))).toBe(HINT[language]);
      expect(sentenceOf(render(language, empty))).toBe(EMPTY[language]);
    });

    test(`${language} : les chips disent la famille dans la langue du lecteur`, () => {
      expect(chipsOf(render(language, accelerated))).toEqual(CHIPS[language]);
    });
  }

  test('hors français, la carte ne porte aucun mot français', () => {
    for (const language of LANGUAGES.filter((language) => language !== 'fr')) {
      for (const elan of [accelerated, acceleratedOne, neutral, empty]) {
        expect(clean(render(language, elan).textContent)).not.toMatch(FRENCH_ONLY);
      }
    }
  });

  test('la carte ne porte plus de phrase écrite en dur', () => {
    const source = readFileSync(new URL('./progression-heroes.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain("'1 famille active'");
    expect(source).not.toContain('plus votre assise');
    expect(source).not.toContain('Une famille de plus déclenche');
    expect(source).not.toContain('Tenez plusieurs familles');
  });
});

describe('le concept se dit « Momentum » en anglais, sur la fiche comme sur la carte (#10439)', () => {
  test('nom de la fiche, titre de la carte, et aucune « boost » pour l’élan', async () => {
    const catalog = await loadGameCatalog('en');
    expect(catalog['game.concept.elans.name']).toBe('Momentum');
    expect(catalog['game.concept.elans.factor']).toBe('Momentum ×{factor}');
    const elanKeys = ['game.concept.elans.name', 'game.concept.elans.why', 'game.concept.points.tip.2', 'game.concept.chip.no_elan', 'game.detail.elan.how'] as const;
    for (const key of elanKeys) expect(catalog[key]).not.toMatch(/boost/i);
    for (const key of elanKeys) expect(catalog[key]).toMatch(/momentum/i);
  });
});

describe('le concept n’a qu’un mot en arabe, الزخم, celui d’iOS (#10444)', () => {
  test('la fiche, l’astuce, la pastille et le détail disent الزخم, et aucune clé du concept ne dit اندفاع', async () => {
    const catalog = await loadGameCatalog('ar');
    expect(catalog['game.concept.elans.name']).toBe('الزخم');
    const elanKeys = ['game.concept.elans.name', 'game.concept.elans.why', 'game.concept.elans.title', 'game.concept.elans.factor', 'game.concept.points.tip.2', 'game.concept.chip.no_elan', 'game.detail.elan.how'] as const;
    expect(elanKeys.filter((key) => !(catalog[key] ?? '').includes('زخم'))).toEqual([]);
    const conceptValues = Object.entries(catalog).filter(([key]) => key.startsWith('game.concept.') || key.startsWith('game.detail.elan.'));
    expect(conceptValues.filter(([, value]) => value.includes('اندفاع'))).toEqual([]);
  });
});
