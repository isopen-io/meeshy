import { describe, expect, test } from 'bun:test';

import type { StatusMoodPost, StoryTrayPost } from '@/lib/api/stories';
import { groupStoriesByAuthor } from '@/lib/view/story-tray';
import { railGroupsWithoutSelf, selfRailEntry } from '@/lib/view/story-rail-self';

/**
 * **LA CELLULE « SOI » DU RAIL** (#6150) — la loi PURE qui décide ce que la
 * cellule montre, avant tout rendu : miroir de `LentilleRailSelfEntry` +
 * `LentilleRailPolicy.shouldRender(selfEntry:entries:)`
 * (`StoriesVivantsRail.swift`).
 *
 * Elle répond à trois questions qu'aucun composant n'a à se poser :
 * ai-je une story ACTIVE (l'anneau) ? par où l'ouvre-t-on (l'adresse) ?
 * quelle est mon humeur COURANTE (💭 ou l'emoji) ?
 */
const EMPTY_SEEN: ReadonlySet<string> = new Set();

const story = (id: string, authorId: string, createdAt: string): StoryTrayPost => ({
  id,
  type: 'STORY',
  createdAt,
  author: { id: authorId, username: authorId },
});

const mood = (id: string, authorId: string, moodEmoji: string | null): StatusMoodPost => ({
  id,
  authorId,
  moodEmoji,
  author: { id: authorId, username: authorId },
});

const groupsOf = (stories: readonly StoryTrayPost[], viewerId: string | undefined) =>
  groupStoriesByAuthor(stories, { viewerId, viewedIds: EMPTY_SEEN });

const NOW = new Date('2026-09-17T10:00:00.000Z').getTime();

describe('selfRailEntry — la cellule existe dès qu\'un lecteur est identifié', () => {
  /**
   * **ELLE NE DÉPEND PAS DE MES STORIES** — c'est la règle d'iOS, et c'est
   * elle qui donne au rail ses DEUX portes : « faire disparaître le seul
   * chemin vers mes stories et mon statut parce que personne d'autre n'a
   * publié serait une régression, pas une épure »
   * (`LentilleRailPolicy.shouldRender(selfEntry:entries:)`).
   */
  test('un lecteur SANS story ni humeur a quand même sa cellule', () => {
    const entry = selfRailEntry({ viewerId: 'u-moi', groups: [], moods: [], now: NOW });
    expect(entry).toEqual({
      viewerId: 'u-moi',
      hasActiveStory: false,
      hasAnyStory: false,
      moodEmoji: undefined,
    });
  });

  test('aucun lecteur identifié ⇒ aucune cellule — jamais un (+) qui ne mène nulle part', () => {
    expect(selfRailEntry({ viewerId: undefined, groups: [], moods: [], now: NOW })).toBeUndefined();
  });

  test('mes stories accentuent l\'anneau et ouvrent la porte du listing', () => {
    const groups = groupsOf([story('s-1', 'u-moi', '2026-09-17T08:00:00.000Z')], 'u-moi');
    const entry = selfRailEntry({ viewerId: 'u-moi', groups, moods: [], now: NOW });
    expect(entry?.hasActiveStory).toBe(true);
    expect(entry?.hasAnyStory).toBe(true);
  });

  /**
   * **L'ANNEAU ET LA PORTE SONT DEUX QUESTIONS** (#6149) — le corpus du
   * plateau garde mes stories expirées pendant sa fenêtre d'archive
   * (`PostFeedService.ts:283-312`) : une story trop vieille pour l'anneau
   * garde quand même sa porte, miroir
   * `StoryTrayActionResolver.avatarTap` (« aucun chemin ne menait plus vers
   * ses stories passées »).
   */
  test('une story à moi mais EXPIRÉE éteint l\'anneau sans fermer le listing', () => {
    const groups = groupsOf([story('s-1', 'u-moi', '2026-01-01T00:00:00.000Z')], 'u-moi');
    const entry = selfRailEntry({ viewerId: 'u-moi', groups, moods: [], now: NOW });
    expect(entry?.hasActiveStory).toBe(false);
    expect(entry?.hasAnyStory).toBe(true);
  });

  /**
   * L'ÉCART QUE CETTE CELLULE FERME — `withMoods` le nommait : « un auteur
   * qui n'a QU'un statut, sans story, n'a pas encore de pastille dans ce
   * rail ». Pour MOI, il en a une : c'est la porte du composeur d'humeur.
   */
  test('mon humeur se lit SANS que j\'aie publié la moindre story', () => {
    const entry = selfRailEntry({
      viewerId: 'u-moi',
      groups: [],
      moods: [mood('st-1', 'u-moi', '🎉')],
      now: NOW,
    });
    expect(entry?.moodEmoji).toBe('🎉');
    expect(entry?.hasActiveStory).toBe(false);
  });

  test('le corpus étant trié du plus récent au plus ancien, la PREMIÈRE humeur gagne', () => {
    const entry = selfRailEntry({
      viewerId: 'u-moi',
      groups: [],
      moods: [mood('st-2', 'u-moi', '☕'), mood('st-1', 'u-moi', '🎉')],
      now: NOW,
    });
    expect(entry?.moodEmoji).toBe('☕');
  });

  test('une humeur vide ou nulle ne compte pas — la pastille retombe sur 💭', () => {
    const vide = selfRailEntry({ viewerId: 'u-moi', groups: [], moods: [mood('st-1', 'u-moi', '')], now: NOW });
    const nulle = selfRailEntry({ viewerId: 'u-moi', groups: [], moods: [mood('st-2', 'u-moi', null)], now: NOW });
    expect(vide?.moodEmoji).toBeUndefined();
    expect(nulle?.moodEmoji).toBeUndefined();
  });

  test('l\'humeur d\'un AUTRE ne devient jamais la mienne', () => {
    const entry = selfRailEntry({
      viewerId: 'u-moi',
      groups: [],
      moods: [mood('st-1', 'u-ines', '🎉')],
      now: NOW,
    });
    expect(entry?.moodEmoji).toBeUndefined();
  });
});

describe('railGroupsWithoutSelf — la cellule « soi » ne se peint pas deux fois', () => {
  /**
   * iOS rend `selfEntry` PUIS `entries`, et `entries` ne me contient pas.
   * Sans ce retrait, un lecteur ayant publié verrait DEUX pastilles à lui —
   * l'une avec ses portes, l'autre sans.
   */
  test('mon groupe sort de la liste des autres', () => {
    const groups = groupsOf(
      [story('s-1', 'u-moi', '2026-09-17T08:00:00.000Z'), story('s-2', 'u-ines', '2026-09-17T07:00:00.000Z')],
      'u-moi',
    );
    expect(groups.map((g) => g.authorId)).toEqual(['u-moi', 'u-ines']);
    expect(railGroupsWithoutSelf(groups).map((g) => g.authorId)).toEqual(['u-ines']);
  });

  test('sans lecteur identifié, rien ne se retire', () => {
    const groups = groupsOf([story('s-2', 'u-ines', '2026-09-17T07:00:00.000Z')], undefined);
    expect(railGroupsWithoutSelf(groups)).toEqual(groups);
  });
});

/**
 * **MA PHOTO SUR MA PASTILLE** (#6975) — `StoryRailSelfEntry` JETAIT le champ :
 * le type n'en portait aucun, donc la tuile ne pouvait servir que des
 * initiales, alors même que `Viewer.avatar` (`lib/api/viewer.ts:26`) avait été
 * AJOUTÉ pour elle — son doc-comment dit en toutes lettres « la pastille "moi"
 * du rail de stories est la PREMIÈRE surface à en avoir besoin » — et que
 * personne ne le lisait.
 *
 * DEUX SOURCES, dans cet ordre : l'avatar du LECTEUR (servi par la session,
 * disponible même quand je n'ai rien publié — le cas pour lequel cette cellule
 * existe) puis, à défaut, celui porté par MON groupe de stories.
 */
describe('selfRailEntry — ma photo (#6975)', () => {
  test('`avatar` du lecteur servi ⇒ porté par l’entrée', () => {
    const entry = selfRailEntry({ viewerId: 'u-moi', avatar: 'moi.png', groups: [], moods: [], now: NOW });
    expect(entry?.avatar).toBe('moi.png');
  });

  test('aucun `avatar` de lecteur ⇒ repli sur MON groupe de stories', () => {
    const stories: readonly StoryTrayPost[] = [
      { id: 's1', type: 'STORY', createdAt: '2026-09-01T10:00:00.000Z', author: { id: 'u-moi', username: 'moi', avatar: 'story.png' } },
    ];
    const entry = selfRailEntry({ viewerId: 'u-moi', groups: groupsOf(stories, 'u-moi'), moods: [], now: NOW });
    expect(entry?.avatar).toBe('story.png');
  });

  test('aucune photo NULLE PART ⇒ `undefined` (la tuile rend ses initiales)', () => {
    expect(selfRailEntry({ viewerId: 'u-moi', groups: [], moods: [], now: NOW })?.avatar).toBeUndefined();
  });

  test('un `avatar` BLANC ne masque pas celui de mon groupe', () => {
    const stories: readonly StoryTrayPost[] = [
      { id: 's1', type: 'STORY', createdAt: '2026-09-01T10:00:00.000Z', author: { id: 'u-moi', username: 'moi', avatar: 'story.png' } },
    ];
    const entry = selfRailEntry({ viewerId: 'u-moi', avatar: '  ', groups: groupsOf(stories, 'u-moi'), moods: [], now: NOW });
    expect(entry?.avatar).toBe('story.png');
  });
});
