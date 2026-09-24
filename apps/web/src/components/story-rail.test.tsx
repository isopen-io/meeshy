import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { StoryRail } from './story-rail';
import { RAIL_TILE_COMPACT, RAIL_TILE_GRANDE } from './rail-tile';
import type { StoryTrayGroup } from '@/lib/view/story-tray';

/**
 * `StoryRail` — UN rail, DEUX géographies (#6103), sur le corpus des STORIES
 * (#6080). Voir le doc-comment du module pour le pourquoi
 * (`StoryTrayView.swift`, `ConversationListView.swift:1659-1671`).
 *
 * **CE FICHIER EST LE PORTAGE DE `conversation-rail.test.tsx`** (fusion du
 * 2026-09-12). Les quatorze témoins de dev mesuraient cette géographie sur un
 * corpus de conversations ; ils la mesurent ici sur un corpus de stories. Ce
 * qui a changé est nommé au cas par cas ci-dessous — jamais silencieusement,
 * parce qu'un témoin qu'on adapte sans le dire est un témoin qu'on affaiblit.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('en');
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

/**
 * `stories` porte désormais UNE story par défaut (#5817) — un
 * `StoryTrayGroup` réel n'est JAMAIS construit vide (`groupStoriesByAuthor`
 * ne pousse un groupe qu'à partir d'au moins une story), et la tuile a
 * maintenant besoin d'un id de story RÉEL pour composer son lien
 * (`group.entryStoryId`, posé par `groupStoriesByAuthor`,
 * `lib/view/story-tray.ts`).
 */
const group = (authorId: string, displayName: string): StoryTrayGroup => ({
  authorId,
  author: { id: authorId, displayName } as StoryTrayGroup['author'],
  stories: [{ id: `st-${authorId}`, isViewedByMe: false } as StoryTrayGroup['stories'][number]],
  latestAt: 0,
  hasUnseen: true,
  isMine: false,
  entryStoryId: `st-${authorId}`,
});

function mount(props: {
  readonly variant: 'grande' | 'pinned';
  readonly groups: readonly StoryTrayGroup[];
  readonly loading?: boolean;
  readonly inert?: boolean;
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
        loading={props.loading ?? false}
        language={props.language ?? 'fr'}
        {...(props.inert === undefined ? {} : { inert: props.inert })}
      />,
    );
  });
  return c;
}

describe('StoryRail — la grande en flux, la compacte épinglée', () => {
  test('`grande` rend un `ul[data-rail="grande"]`, tuiles GRANDES, libellés visibles', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')] });
    const ul = el.querySelector('ul[data-rail="grande"]');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector(`[data-rail-tile="${RAIL_TILE_GRANDE}"]`)).not.toBeNull();
    expect(el.textContent).toContain('Amina Diallo');
  });

  /**
   * **LE LIBELLÉ DU GROUPE DU LECTEUR SUIT LA LANGUE D'INTERFACE** (#6550) —
   * `storyAuthorLabel()` est partagée par ce rail et `routes/stories.tsx` ; ce
   * témoin couvre le site d'appel du rail, rendu en `en`, comme le demande le
   * critère de fin de #6550.
   */
  test('la tuile du lecteur suit la langue d\'interface — jamais « Votre story » figé (#6550)', () => {
    const mienne: StoryTrayGroup = { ...group('u-moi', 'peu importe'), isMine: true };
    const el = mount({ variant: 'grande', groups: [mienne], language: 'en' });
    expect(el.textContent).toContain('Your story');
    expect(el.textContent).not.toContain('Votre story');
  });

  /**
   * L'`aria-label` a CHANGÉ DE TEXTE, pas de rôle : « Accès rapide aux
   * conversations » disait vrai du corpus d'avant et mentirait sur celui-ci.
   * Ce que le témoin garde est l'invariant — la bande NOMME sa région tant
   * qu'elle est atteignable (c'est le grand rail qui perd son nom sous `inert`,
   * jamais elle).
   */
  test('`pinned` rend un `ul[data-rail="pinned"]`, tuiles COMPACTES, aucun libellé — aria-label conservé', () => {
    const el = mount({ variant: 'pinned', groups: [group('u-amina', 'Amina Diallo')] });
    const ul = el.querySelector('ul[data-rail="pinned"]');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector(`[data-rail-tile="${RAIL_TILE_COMPACT}"]`)).not.toBeNull();
    expect(el.textContent).not.toContain('Amina Diallo');
    expect(ul?.getAttribute('aria-label')).toBe('Stories');
  });

  /**
   * **CE TÉMOIN REMPLACE « les conversations ARCHIVÉES sont exclues »**, et le
   * remplacement est une décision, pas une perte : l'archivage est une propriété
   * de CONVERSATION, et le corpus n'en porte plus. La loi de sélection du rail
   * est désormais le PLAFOND de six entrées (`LentilleRailPolicy.visibleEntries`),
   * avec la porte « tout voir » pour le reste — et elle vaut, comme l'exclusion
   * qu'elle remplace, dans les DEUX géographies.
   */
  test('le plafond de SIX entrées vaut dans les DEUX géographies', () => {
    const sept = Array.from({ length: 7 }, (_, i) => group(`u-${i}`, `Auteur ${i}`));
    for (const variant of ['grande', 'pinned'] as const) {
      const el = mount({ variant, groups: sept });
      expect(el.querySelectorAll('[data-rail-tile]').length).toBe(6);
      expect(el.textContent).not.toContain('Auteur 6');
    }
  });

  /**
   * **LE SQUELETTE A CHANGÉ DE FORME**, et c'est l'apport de #6080 : dev posait
   * UNE tuile fantôme INVISIBLE (`visibility: hidden`) qui réservait la hauteur ;
   * #6080 peint des tuiles grises VISIBLES. Les deux tiennent la place — c'est
   * la propriété que `check-lens.mjs` mesure — mais un squelette visible DIT
   * qu'on charge, là où une tuile invisible laisse un blanc inexpliqué. Ce que
   * le témoin garde : il tient la place, et il est hors de l'arbre
   * d'accessibilité.
   */
  test('chargement + corpus vide, `grande` ⇒ un squelette aria-hidden qui tient la place', () => {
    const el = mount({ variant: 'grande', groups: [], loading: true });
    const squelette = el.querySelectorAll('li[aria-hidden="true"]');
    expect(squelette.length).toBeGreaterThan(0);
    expect((squelette[0] as HTMLElement).style.width).not.toBe('');
  });

  test('chargement + corpus vide, `pinned` ⇒ AUCUN squelette', () => {
    const el = mount({ variant: 'pinned', groups: [], loading: true });
    expect(el.querySelector('ul[data-rail="pinned"]')).toBeNull();
  });

  test('corpus vide SANS chargement ⇒ rien de rendu', () => {
    const el = mount({ variant: 'grande', groups: [], loading: false });
    expect(el.innerHTML).toBe('');
  });

  /**
   * Le masquage est passé du style INLINE (`scrollbarWidth: 'none'`, dev) à la
   * classe utilitaire `scrollbar-none` (#6080), qui couvre aussi le pseudo-
   * élément WebKit — un `scrollbar-width` seul ne masque rien sur Chromium. Le
   * témoin mesure donc la CLASSE, pas le style.
   */
  test('le conteneur horizontal masque sa barre de défilement (iOS `showsIndicators: false`)', () => {
    for (const variant of ['grande', 'pinned'] as const) {
      const el = mount({ variant, groups: [group('u-amina', 'Amina Diallo')] });
      const ul = el.querySelector(`ul[data-rail="${variant}"]`) as HTMLElement;
      expect(ul.classList.contains('scrollbar-none')).toBe(true);
    }
  });
});

/**
 * `inert` — LE GRAND RAIL NE DOUBLE PAS LA BANDE AU CLAVIER (#6103,
 * revue-correction). Voir le doc-comment du module : sans cette garde, les
 * liens du grand rail restaient à la fois dans l'ordre de TABULATION et
 * dans l'arbre D'ACCESSIBILITÉ pendant que la bande, montée ailleurs,
 * portait le MÊME corpus sous le MÊME `aria-label` — un doublon, dans les
 * deux sens.
 */
describe('StoryRail — `inert` retire le grand rail du clavier et de l’accessibilité', () => {
  test('`inert` pose l’attribut HTML natif sur le `<ul>`', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')], inert: true });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.hasAttribute('inert')).toBe(true);
  });

  test('sans `inert` (défaut), l’attribut reste ABSENT — jamais `inert="false"`', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')] });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.hasAttribute('inert')).toBe(false);
  });

  test('`inert` : aucun lien du rail n’est FOCALISABLE — `.focus()` reste sans effet', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')], inert: true });
    const lien = el.querySelector('a[data-story-author="u-amina"]') as HTMLElement;
    document.body.focus();
    act(() => {
      lien.focus();
    });
    // Un `<ul>` marqué `inert` retire tout son sous-arbre de l'ordre de
    // tabulation ET empêche le focus PROGRAMMATIQUE : `.focus()` sur un lien
    // qu'il contient ne doit JAMAIS le rendre actif.
    expect(document.activeElement).not.toBe(lien);
  });

  test('`inert` : la région perd son `aria-label` — deux régions ne peuvent plus s’annoncer sous le MÊME nom', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')], inert: true });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.getAttribute('aria-label')).toBeNull();
  });

  test('`pinned` n’est JAMAIS inerte — la bande qui remplace le titre reste, elle, atteignable', () => {
    const el = mount({ variant: 'pinned', groups: [group('u-amina', 'Amina Diallo')] });
    const ul = el.querySelector('ul[data-rail="pinned"]') as HTMLElement;
    expect(ul.hasAttribute('inert')).toBe(false);
    const lien = el.querySelector('a[data-story-author="u-amina"]') as HTMLElement;
    act(() => {
      lien.focus();
    });
    expect(document.activeElement).toBe(lien);
  });
});

/**
 * **LES DEUX APPORTS DE #6080 QUE LA GÉOGRAPHIE NE COUVRE PAS** — ils n'ont
 * pas d'équivalent chez dev, donc aucun témoin à porter : ils sont neufs ici.
 */
describe('StoryRail — ce que le corpus des stories apporte', () => {
  /**
   * #5817 — la tuile ouvre désormais LE LECTEUR PLEIN ÉCRAN (`/story/$post`),
   * jamais le fil ET jamais non plus l'ancienne destination `/stories?author=`
   * (#6080) : elle pose l'id d'ENTRÉE qu'elle a calculé (`entryStoryId()`),
   * pas l'id de l'auteur.
   */
  test('chaque tuile mène À LA STORY de son auteur (/story/$post), jamais au fil ni à /stories', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')] });
    const lien = el.querySelector('a[data-story-author="u-amina"]') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/story/st-u-amina');
  });

  test('les deux portes flottantes n’existent QUE sur le grand plateau', () => {
    const grande = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')] });
    expect(grande.querySelector('a[aria-label="Créer une story"]')).not.toBeNull();
    expect(grande.querySelector('a[aria-label="Voir toutes les stories"]')).not.toBeNull();
    act(() => {
      root!.unmount();
    });
    root = undefined;
    const pinned = mount({ variant: 'pinned', groups: [group('u-amina', 'Amina Diallo')] });
    expect(pinned.querySelector('a[aria-label="Créer une story"]')).toBeNull();
  });

  test('un auteur qui a plusieurs stories l’ANNONCE, et le non-vu aussi', () => {
    const plusieurs: StoryTrayGroup = {
      ...group('u-amina', 'Amina Diallo'),
      stories: [{} as StoryTrayGroup['stories'][number], {} as StoryTrayGroup['stories'][number]],
    };
    const el = mount({ variant: 'grande', groups: [plusieurs] });
    const lien = el.querySelector('a[data-story-author="u-amina"]') as HTMLElement;
    expect(lien.getAttribute('aria-label')).toBe('Amina Diallo, 2 stories, non vues');
  });

  test('un anneau NON vu porte `data-accented` — le gate de la Lentille le mesure', () => {
    const el = mount({ variant: 'grande', groups: [{ ...group('u-amina', 'Amina Diallo'), hasUnseen: true }] });
    expect(el.querySelector('[data-anneau][data-accented="true"]')).not.toBeNull();
  });

  test('un anneau VU ne porte PAS `data-accented`', () => {
    const el = mount({ variant: 'grande', groups: [{ ...group('u-amina', 'Amina Diallo'), hasUnseen: false }] });
    expect(el.querySelector('[data-anneau]')?.hasAttribute('data-accented')).toBe(false);
  });

  test('une humeur active peint un badge `data-mood`, absent sans humeur', () => {
    const avecHumeur = mount({
      variant: 'grande',
      groups: [{ ...group('u-amina', 'Amina Diallo'), moodEmoji: '🎉' }],
    });
    expect(avecHumeur.querySelector('[data-mood="🎉"]')?.textContent).toBe('🎉');

    act(() => {
      root!.unmount();
    });
    root = undefined;
    const sansHumeur = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')] });
    expect(sansHumeur.querySelector('[data-mood]')).toBeNull();
  });
});

/**
 * **LA TUILE PEINT LA COTE D'iOS** (#6133) — l'avatar porte `.storyTray` /
 * `.storyTrayCompact`, l'anneau se pose AUTOUR (`ringSize = size + 6`), la
 * cellule compose l'anneau et son libellé. La loi est dans `rail-tile.tsx` ;
 * ces témoins mesurent qu'elle est PEINTE, pas seulement déclarée.
 */
describe('StoryTile — la cote d’iOS, peinte (#6133)', () => {
  test('grand plateau : avatar 88, anneau 94 posé autour, cellule 96', () => {
    const el = mount({ variant: 'grande', groups: [group('u-amina', 'Amina Diallo')] });
    const li = el.querySelector('[data-rail-tile]') as HTMLElement;
    const anneau = el.querySelector('[data-anneau]') as HTMLElement;
    const avatar = anneau.querySelector('.avatar-root') as HTMLElement;
    expect(li.style.width).toBe('96px');
    expect(anneau.style.width).toBe('94px');
    expect(anneau.style.height).toBe('94px');
    expect(avatar.style.width).toBe('88px');
  });

  test('bande épinglée : avatar 36, anneau et cellule 42, cible de 44 sans élargir la case', () => {
    const el = mount({ variant: 'pinned', groups: [group('u-amina', 'Amina Diallo')] });
    const li = el.querySelector('[data-rail-tile]') as HTMLElement;
    const anneau = el.querySelector('[data-anneau]') as HTMLElement;
    const avatar = anneau.querySelector('.avatar-root') as HTMLElement;
    const lien = el.querySelector('a[data-story-author]') as HTMLElement;
    expect(li.style.width).toBe('42px');
    expect(anneau.style.width).toBe('42px');
    expect(avatar.style.width).toBe('36px');
    expect(lien.style.minHeight).toBe('44px');
    expect(lien.style.minWidth).toBe('44px');
    expect(lien.style.marginLeft).toBe('-1px');
  });

  test('le trait de l’anneau suit `ringWidth` : doublé et à la marque pour une story non vue', () => {
    const nonVue = mount({ variant: 'grande', groups: [{ ...group('u-amina', 'Amina Diallo'), hasUnseen: true }] });
    const trait = (nonVue.querySelector('[data-anneau]') as HTMLElement).style.boxShadow;
    expect(trait).toContain('1.4px');
    expect(trait).toContain('brand');
    act(() => {
      root!.unmount();
    });
    root = undefined;

    const vue = mount({ variant: 'grande', groups: [{ ...group('u-amina', 'Amina Diallo'), hasUnseen: false }] });
    const traitVu = (vue.querySelector('[data-anneau]') as HTMLElement).style.boxShadow;
    expect(traitVu).toContain('1px');
    expect(traitVu).not.toContain('brand');
  });
});
