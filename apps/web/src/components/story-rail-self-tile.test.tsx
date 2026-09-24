import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StoryRailSelfEntry } from '@/lib/view/story-rail-self';
import type { StoryTrayGroup } from '@/lib/view/story-tray';
import { MIN_TOUCH_TARGET, RAIL_TILE_GRANDE } from './rail-tile';
import { StoryRail } from './story-rail';
import { MOOD_BADGE_PLACEHOLDER, selfBadgeDiameter } from './story-rail-self-tile';

/**
 * **LES DEUX PORTES DE MA CELLULE** (#6150) — directive porteur du 2026-09-17 :
 * « le bouton (+) au dessus de gauche de l'avatar […] et (bulle pensant) en bas
 * droite pour créer un mood ou afficher le smiley animé du mood en cours comme
 * sous iOS ».
 *
 * Référence de géographie : `LentilleRailSelfEntryView`
 * (`apps/ios/.../Lentille/Chrome/StoriesVivantsRail.swift`) —
 * `ZStack(alignment: .bottomTrailing)` pour l'humeur,
 * `.overlay(alignment: .topLeading)` pour le (+), deux `Button(.plain)`
 * DISTINCTS. Son commentaire tranche l'ambiguïté que ces témoins gardent :
 * « le badge bas-droit reste le MOOD (💭 / emoji), jamais un second plus
 * ambigu ».
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('en');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    const r = root;
    act(() => {
      r.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

const group = (authorId: string, displayName: string, isMine = false): StoryTrayGroup => ({
  authorId,
  author: { id: authorId, displayName } as StoryTrayGroup['author'],
  stories: [{ id: `st-${authorId}`, isViewedByMe: false } as StoryTrayGroup['stories'][number]],
  latestAt: 0,
  hasUnseen: true,
  isMine,
  entryStoryId: `st-${authorId}`,
});

const self = (over: Partial<StoryRailSelfEntry> = {}): StoryRailSelfEntry => ({
  viewerId: 'u-moi',
  hasActiveStory: false,
  entryStoryId: undefined,
  moodEmoji: undefined,
  avatar: undefined,
  ...over,
});

function mount(props: {
  readonly variant: 'grande' | 'pinned';
  readonly groups: readonly StoryTrayGroup[];
  readonly self?: StoryRailSelfEntry;
  readonly language?: InterfaceLanguage;
}): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(
      <StoryRail
        variant={props.variant}
        groups={props.groups}
        loading={false}
        language={props.language ?? 'fr'}
        {...(props.self === undefined ? {} : { self: props.self })}
      />,
    );
  });
  return c;
}

describe('la cellule « soi » porte DEUX pastilles, et deux seulement', () => {
  test('le (+) et la pastille d\'humeur sont deux BOUTONS distincts, pas un geste qui devine', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    const cellule = el.querySelector('li[data-story-self]');
    expect(cellule).not.toBeNull();
    expect(cellule?.querySelector('[data-self-create]')).not.toBeNull();
    expect(cellule?.querySelector('[data-self-mood]')).not.toBeNull();
  });

  /**
   * LA RÈGLE DU RAIL EST INCHANGÉE : rien à montrer ⇒ rien. Mais « rien »
   * veut dire NI moi NI personne — miroir
   * `LentilleRailPolicy.shouldRender(selfEntry:entries:)`. Sans ce témoin, un
   * lecteur qui n'a pas d'amis publiant n'aurait AUCUNE porte.
   */
  test('un rail SANS aucun autre auteur existe quand même, pour mes deux portes', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    expect(el.querySelector('ul[data-rail="grande"]')).not.toBeNull();
  });

  test('ni moi ni personne ⇒ aucun rail', () => {
    const el = mount({ variant: 'grande', groups: [] });
    expect(el.querySelector('ul[data-rail="grande"]')).toBeNull();
  });

  test('ma cellule ouvre le rail, avant les autres auteurs', () => {
    const el = mount({ variant: 'grande', groups: [group('u-ines', 'Inès')], self: self() });
    const tuiles = [...el.querySelectorAll('li')];
    expect(tuiles[0]?.hasAttribute('data-story-self')).toBe(true);
  });

  /**
   * Un lecteur qui a publié possède DÉJÀ un groupe `isMine` — sans retrait il
   * verrait deux fois son visage, l'un avec ses portes, l'autre sans.
   */
  test('mon groupe ne se peint pas une SECONDE fois à côté de ma cellule', () => {
    const el = mount({
      variant: 'grande',
      groups: [group('u-moi', 'moi', true), group('u-ines', 'Inès')],
      self: self({ hasActiveStory: true, entryStoryId: 'st-u-moi' }),
    });
    expect(el.querySelectorAll('li[data-story-self]').length).toBe(1);
    expect(el.querySelectorAll('[data-story-author="u-moi"]').length).toBe(0);
  });

  /**
   * LA BANDE ÉPINGLÉE NE PORTE NI LÉGENDE NI BOUTONS — décision iOS explicite
   * (`PinnedStoryTrailBand` rend des anneaux seuls dans une barre repliée de
   * 60 pt), déjà écrite dans le doc-comment de `StoryTile`. Deux pastilles de
   * plus y doubleraient deux contrôles déjà atteignables douze pixels plus bas.
   */
  test('la bande épinglée ne porte PAS ma cellule — mais garde ma story parmi les anneaux', () => {
    const el = mount({
      variant: 'pinned',
      groups: [group('u-moi', 'moi', true)],
      self: self({ hasActiveStory: true, entryStoryId: 'st-u-moi' }),
    });
    expect(el.querySelector('li[data-story-self]')).toBeNull();
    expect(el.querySelector('[data-story-author="u-moi"]')).not.toBeNull();
  });
});

describe('💭 sans humeur, l\'emoji avec', () => {
  test('aucune humeur ⇒ la bulle de pensée, jamais un second « + »', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    const pastille = el.querySelector('[data-self-mood]');
    expect(pastille?.textContent).toContain(MOOD_BADGE_PLACEHOLDER);
    expect(pastille?.textContent).not.toContain('+');
  });

  test('une humeur en cours ⇒ son emoji, et il est ANNONÇABLE par `data-mood`', () => {
    const el = mount({ variant: 'grande', groups: [], self: self({ moodEmoji: '🎉' }) });
    const pastille = el.querySelector('[data-self-mood]');
    expect(pastille?.textContent).toContain('🎉');
    expect(pastille?.getAttribute('data-mood')).toBe('🎉');
  });

  /**
   * L'ANIMATION EST UNE DÉCISION DE LA DIRECTIVE, pas de la trame iOS : sur
   * soi, iOS monte `MeeshyMoodBadge(animates: false)` (la pastille « moi » vit
   * hors de la borne d'animation du rail). La directive porteur du 2026-09-17
   * demande explicitement « le smiley animé du mood en cours » — on la suit, en
   * gardant la respiration BORNÉE (`breathingDuration`) et éteinte par
   * `prefers-reduced-motion`, ce que la trame iOS fait déjà.
   */
  test('le glyphe de l\'humeur respire — et rien ne respire quand il n\'y a pas d\'humeur', () => {
    const avec = mount({ variant: 'grande', groups: [], self: self({ moodEmoji: '🎉' }) });
    expect(avec.querySelector('[data-mood-animates="true"]')).not.toBeNull();
    act(() => {
      root?.unmount();
    });
    root = undefined;
    const sans = mount({ variant: 'grande', groups: [], self: self() });
    expect(sans.querySelector('[data-mood-animates="true"]')).toBeNull();
  });
});

describe('deux pastilles sur un avatar — le piège d\'accessibilité', () => {
  test('chacune porte son PROPRE libellé, et ils ne se confondent pas', () => {
    const el = mount({ variant: 'grande', groups: [], self: self(), language: 'en' });
    expect(el.querySelector('[data-self-create]')?.getAttribute('aria-label')).toBe('Add a story');
    expect(el.querySelector('[data-self-mood]')?.getAttribute('aria-label')).toBe('Set a mood');
  });

  test('une humeur en cours change le libellé de SA pastille, et d\'elle seule', () => {
    const el = mount({ variant: 'grande', groups: [], self: self({ moodEmoji: '🎉' }), language: 'en' });
    expect(el.querySelector('[data-self-mood]')?.getAttribute('aria-label')).toBe('Change my mood, 🎉');
    expect(el.querySelector('[data-self-create]')?.getAttribute('aria-label')).toBe('Add a story');
  });

  test('les libellés suivent la langue d\'interface — aucun français figé', () => {
    const el = mount({ variant: 'grande', groups: [], self: self(), language: 'fr' });
    expect(el.querySelector('[data-self-create]')?.getAttribute('aria-label')).toBe('Ajouter une story');
    expect(el.querySelector('[data-self-mood]')?.getAttribute('aria-label')).toBe('Poser une humeur');
  });

  /** Chaque pastille est un contrôle à part entière : atteignable au clavier,
   * donc dans l'ordre de tabulation — jamais un `div` cliquable. */
  test('les deux pastilles sont focalisables', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    for (const prise of ['[data-self-create]', '[data-self-mood]']) {
      const n = el.querySelector(prise);
      expect(n?.tagName === 'A' || n?.tagName === 'BUTTON').toBe(true);
      expect(n?.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  /** Dimension 5 — deux cibles d'au moins 44 px. Elles sont DÉCLARÉES par la
   * feuille de style ; ce témoin mesure ce que le composant demande, le gate
   * navigateur mesurera ce que le navigateur rend. */
  test('chaque pastille demande une cible de 44 px', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    for (const prise of ['[data-self-create]', '[data-self-mood]']) {
      const n = el.querySelector(prise) as HTMLElement | null;
      expect(n?.style.minWidth).toBe(`${MIN_TOUCH_TARGET}px`);
      expect(n?.style.minHeight).toBe(`${MIN_TOUCH_TARGET}px`);
    }
  });

  /**
   * **LA CIBLE N'EST PAS LE DISQUE** (#7449) — le défaut que ce fichier
   * DÉCLARAIT sans l'appliquer : `width: badge` et `minWidth: 44` vivaient sur
   * le MÊME élément, celui qui portait le fond, donc le minimum gagnait et le
   * (+) était PEINT à 44 px sur un anneau de 94. Mesuré au navigateur avant
   * correctif : 44×44.
   *
   * Le témoin interroge donc la boîte qui PEINT, distincte de celle qui se
   * touche — et il vérifie que celle-ci ne porte plus aucun fond, sans quoi la
   * séparation serait cosmétique.
   */
  test('le disque PEINT suit la loi de l’anneau, la cible reste à 44', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    const attendu = `${selfBadgeDiameter(RAIL_TILE_GRANDE)}px`;
    for (const prise of ['[data-self-create-disc]', '[data-self-mood-disc]']) {
      const n = el.querySelector(prise) as HTMLElement | null;
      expect(n).not.toBeNull();
      expect(n?.style.width).toBe(attendu);
      expect(n?.style.height).toBe(attendu);
      expect(n?.style.minWidth).toBe('');
    }
    for (const prise of ['[data-self-create]', '[data-self-mood]']) {
      const n = el.querySelector(prise) as HTMLElement | null;
      expect(n?.style.background).toBe('');
      expect(n?.style.backgroundColor).toBe('');
    }
  });

  /**
   * LA PASTILLE D'HUMEUR N'EST PAS DANS LE LIEN DE LA STORY — imbriquer un
   * bouton dans un `<a>` produit un arbre d'accessibilité invalide, et le tap
   * sur la pastille ouvrirait AUSSI la story. C'est la raison pour laquelle
   * iOS monte deux `Button(.plain)` frères dans un `ZStack`, jamais l'un dans
   * l'autre.
   */
  test('aucune pastille n\'est imbriquée dans le lien de ma story', () => {
    const el = mount({
      variant: 'grande',
      groups: [],
      self: self({ hasActiveStory: true, entryStoryId: 'st-u-moi' }),
    });
    for (const prise of ['[data-self-create]', '[data-self-mood]']) {
      const n = el.querySelector(prise);
      expect(n?.closest('[data-story-self-open]')).toBeNull();
    }
  });
});

describe('où mènent les deux portes', () => {
  test('le (+) mène au studio de story', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    expect(el.querySelector('[data-self-create]')?.getAttribute('href')).toBe('/stories/new');
  });

  test('la pastille d\'humeur mène à la composition d\'humeur', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    expect(el.querySelector('[data-self-mood]')?.getAttribute('href')).toBe('/status/new');
  });

  /** Sans story, la cellule n'est pas un lien : un anneau qui promet un contenu
   * que rien n'ouvre est un contrôle qui ment (loi 4). */
  test('sans story, ma pastille centrale n\'est pas un lien', () => {
    const el = mount({ variant: 'grande', groups: [], self: self() });
    expect(el.querySelector('[data-story-self-open]')).toBeNull();
  });

  test('avec une story, ma pastille centrale ouvre MA story', () => {
    const el = mount({
      variant: 'grande',
      groups: [],
      self: self({ hasActiveStory: true, entryStoryId: 'st-u-moi' }),
    });
    expect(el.querySelector('[data-story-self-open]')?.getAttribute('href')).toBe('/story/st-u-moi');
  });
});
