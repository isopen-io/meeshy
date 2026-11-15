/**
 * L'ÉPOPÉE HORS DES CATALOGUES CLIENTS (#11175) — chaque texte du jeu que le SERVEUR compose pour un joueur
 * (bannières de notification, mission personnelle, libellés d'un palier franchi, événements du Voyage publiés
 * sur l'App Store) suit le lexique de l'épopée, dans chaque langue qui le porte.
 *
 * Le lexique est celui des gardes web et iOS : `packages/shared/design/game-epic-vocabulary/<langue>.json`
 * (format : `docs/product/epopee/glossaire/README.md`). Un motif restreint à des clés (`keys`, `except`)
 * s'applique ici par la FAMILLE du texte : `game.leaguePromoted` se lit comme `game.league.promoted`,
 * `engagement.levelUp` comme `game.engagement.levelUp` — une notification de joute est un texte de joute.
 * Les libellés que l'app iOS porte en miroir gardent LEUR clé (`progression.axis.*`, `progression.achievement.*`,
 * `achievement.*`) : un motif restreint à `game.` ne les vise pas, un motif global si.
 *
 * Le chinois (`zh-Hans`), huitième langue du catalogue de notifications, n'a pas de lexique : il suit
 * le même récit, et ses mots de comptable sont gardés par la petite liste ci-dessous.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../utils/notification-string-templates.js';
import { NOTIFICATION_LANGUAGES, type NotificationLanguage } from '../../utils/notification-strings.js';
import { personalMissionPhrase } from '../../utils/game/personal-mission-copy.js';
import { PERSONAL_ACTIVITIES } from '../../utils/game/personal-mission.js';
import { DEFAULT_SEASON_EVENT_COPY } from '../../utils/game/season-app-events.js';
import { SEASON_COPY_LOCALES, type SeasonCopyLocale } from '../../utils/game/season-schedule.js';
import { ENGAGEMENT_ACHIEVEMENT_LABELS, ENGAGEMENT_AXIS_LABELS } from '../../utils/engagement-labels.js';
import { ACHIEVEMENT_LABELS, ACHIEVEMENT_LABELS_ONE } from '../../utils/achievement-labels.js';

type Banned = {
  readonly pattern: string;
  readonly flags?: string;
  readonly instead: string;
  readonly keys?: string | readonly string[];
  readonly except?: readonly string[];
};
type Lexicon = { readonly language: string; readonly banned: readonly Banned[]; readonly names: Readonly<Record<string, string>> };

const LEXICON_DIR = join(__dirname, '../../design/game-epic-vocabulary');
const LEXICONS: ReadonlyMap<string, Lexicon> = new Map(
  readdirSync(LEXICON_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(LEXICON_DIR, file), 'utf8')) as Lexicon)
    .map((lexicon) => [lexicon.language, lexicon] as const),
);

const asList = (value: string | readonly string[] | undefined): readonly string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : value;

const applies = (rule: Banned, key: string): boolean => {
  const keys = asList(rule.keys);
  if (keys.length > 0 && !keys.some((prefix) => key.startsWith(prefix))) return false;
  return !asList(rule.except).some((prefix) => key.startsWith(prefix));
};

/** `game.leaguePromoted` → `game.league.promoted` ; `engagement.levelUp` → `game.engagement.levelUp`. */
const familyKey = (key: string): string => {
  if (key.startsWith('engagement.')) return `game.${key}`;
  const [root, rest = ''] = key.split(/\.(.*)/s);
  const split = /^([a-z]+)([A-Z].*)?$/.exec(rest);
  if (!split) return key;
  const [, family, tail] = split;
  return tail ? `${root}.${family}.${tail.charAt(0).toLowerCase()}${tail.slice(1)}` : `${root}.${family}`;
};

const withoutParams = (text: string): string => text.replace(/\{[^}]*\}/g, ' ');

type Served = { readonly key: string; readonly text: string };

const GAME_TEMPLATE_KEYS = (lang: NotificationLanguage): readonly string[] =>
  Object.keys(TEMPLATES[lang]).filter((key) => key.startsWith('game.') || key.startsWith('engagement.'));

const servedTexts = (lang: NotificationLanguage): readonly Served[] => [
  ...GAME_TEMPLATE_KEYS(lang).map((key) => ({ key: familyKey(key), text: TEMPLATES[lang][key as keyof (typeof TEMPLATES)[typeof lang]] as string })),
  ...PERSONAL_ACTIVITIES.map((activity) => ({ key: `game.mission.personal.${activity}`, text: personalMissionPhrase(lang, activity) })),
  ...Object.entries(ENGAGEMENT_AXIS_LABELS[lang]).map(([axis, text]) => ({ key: `progression.axis.${axis}`, text })),
  ...Object.entries(ENGAGEMENT_ACHIEVEMENT_LABELS[lang]).flatMap(([id, label]) => [
    { key: `progression.${id}.title`, text: label.title },
    { key: `progression.${id}.condition`, text: label.condition },
  ]),
  ...Object.entries(ACHIEVEMENT_LABELS[lang]).map(([family, text]) => ({ key: `achievement.${family}`, text })),
  ...Object.entries(ACHIEVEMENT_LABELS_ONE[lang] ?? {}).map(([family, text]) => ({ key: `achievement.${family}.one`, text })),
];

/** La langue d'une localisation App Store → le lexique (le fichier dit `pt`, la boutique `pt-BR`). */
const lexiconLanguageOf = (locale: SeasonCopyLocale): string => (locale === 'pt-BR' ? 'pt' : locale);

const seasonEventTexts = (locale: SeasonCopyLocale): readonly Served[] => {
  const copy = DEFAULT_SEASON_EVENT_COPY[locale];
  return [
    { key: 'game.season.event.title', text: copy.title },
    { key: 'game.season.event.tagline', text: copy.tagline },
    { key: 'game.season.event.description', text: copy.description },
  ];
};

const violations = (lexicon: Lexicon, texts: readonly Served[]): readonly string[] =>
  texts.flatMap(({ key, text }) =>
    lexicon.banned
      .filter((rule) => applies(rule, key))
      .flatMap((rule) => {
        const hit = new RegExp(rule.pattern, rule.flags ?? 'u').exec(withoutParams(text));
        return hit ? [`${lexicon.language} · ${key} · « ${hit[0]} » dans « ${text} » → ${rule.instead}`] : [];
      }),
  );

const LEXICON_LANGUAGES = NOTIFICATION_LANGUAGES.filter((lang) => LEXICONS.has(lang));

describe('les textes du jeu servis par le serveur racontent l’épopée', () => {
  it('chaque langue du catalogue de notifications a son lexique, sauf le chinois', () => {
    expect([...LEXICON_LANGUAGES].sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });

  it.each(LEXICON_LANGUAGES)('%s : aucune notification, mission ni libellé du jeu ne porte un mot banni', (lang) => {
    expect(violations(LEXICONS.get(lang)!, servedTexts(lang))).toEqual([]);
  });

  it.each(SEASON_COPY_LOCALES)('%s : l’événement App Store d’un Voyage ne porte aucun mot banni', (locale) => {
    expect(violations(LEXICONS.get(lexiconLanguageOf(locale))!, seasonEventTexts(locale))).toEqual([]);
  });

  it('zh-Hans : ni ligue, ni saison, ni mission, ni duo, ni badge, ni série, ni carnet', () => {
    const banned = ['联赛', '赛季', '任务', '双人', '徽章', '成就', '连续', '手册', '阶段'];
    const hits = servedTexts('zh-Hans').flatMap(({ key, text }) => banned.filter((word) => text.includes(word)).map((word) => `${key} · ${word} · ${text}`));
    expect(hits).toEqual([]);
  });
});

const bareName = (name: string): string => name.replace(/^(?:la |le |l’|the |el |die |der |das |a |o |il |ال)/iu, '');

const mentions = (text: string, name: string): boolean => text.toLowerCase().includes(bareName(name).toLowerCase());

describe('chaque notification nomme le concept de l’épopée qu’elle annonce', () => {
  const NAMED: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['game.league.title', ['game.leaguePromoted', 'game.leagueStayed', 'game.leagueRelegated', 'game.leagueCupGold', 'game.leagueCupSilver', 'game.leagueCupBronze']],
    ['game.season.title', ['game.seasonStep', 'game.seasonDone']],
    ['game.duo.title', ['game.duoInvitedAction', 'game.duoAcceptedAction']],
    ['game.notebook.page_title', ['game.photoMoment', 'game.photoMoments']],
  ];

  it.each(LEXICON_LANGUAGES)('%s : la Joute, le Voyage, l’Alliance et la Chronique se disent par leur nom', (lang) => {
    const names = LEXICONS.get(lang)!.names;
    const missing = NAMED.flatMap(([nameKey, keys]) =>
      keys
        .map((key) => [key, TEMPLATES[lang][key as keyof (typeof TEMPLATES)[typeof lang]] as string] as const)
        .filter(([, text]) => !mentions(text, names[nameKey]!))
        .map(([key, text]) => `${key} ne dit pas « ${bareName(names[nameKey]!)} » : ${text}`),
    );
    expect(missing).toEqual([]);
  });

  it.each(SEASON_COPY_LOCALES)('%s : l’événement App Store s’appelle le Voyage', (locale) => {
    const name = LEXICONS.get(lexiconLanguageOf(locale))!.names['game.season.title']!;
    expect(mentions(DEFAULT_SEASON_EVENT_COPY[locale].title, name)).toBe(true);
  });
});
