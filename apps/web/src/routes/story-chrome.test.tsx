import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StoryActionRail } from '@/components/story-action-rail';
import { ViewerExitButton } from '@/components/viewer-chrome';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { resolveStoryActionRailPlan } from '@/lib/stories/action-rail';

import { StoryBottomBar, StoryTopBar } from './story-chrome';

/**
 * **LE BOUTON MUET DU LECTEUR DE STORY** — miroir de
 * `StoryViewerView+Sidebar.swift:479-509` (`speaker.slash.fill` /
 * `speaker.wave.2.fill`) : un contrôle existe s'il a un EFFET (loi 4),
 * jamais un décor.
 *
 * **CE FICHIER A CHANGÉ DE SUJET, PAS DE CONTRAT.** Le bouton vivait dans la
 * ligne AUTEUR (`SoundToggle`, `story-parts.tsx`, T10 #6899) ; l'arbitrage
 * #4508 le place en TÊTE DU RAIL (« le son est le SEUL élément du rail qui
 * décrit ce qui est en train de SE PASSER »). Les quatre témoins ci-dessous
 * sont ceux de `SoundToggle`, mot pour mot, retargetés sur son nouvel hôte —
 * un contrat mesuré ne se perd pas parce que son porteur déménage.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(node: React.ReactElement): HTMLDivElement {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(node);
  });
  return c;
}

/** Le rail réduit à SON SEUL bouton son : la loi le garde (`hasAudibleSound`),
 * un gestionnaire l'atteint, et rien d'autre n'est branché. */
const railSon = (muted: boolean, onToggle: () => void) => (
  <StoryActionRail
    plan={resolveStoryActionRailPlan({
      storyId: 'st-1',
      isOwnStory: false,
      canReply: false,
      hasAudibleSound: true,
      commentCount: 0,
      hasTranslatableContent: false,
    })}
    language="fr"
    handlers={{ sound: onToggle }}
    pressed={{ sound: muted }}
  />
);

describe('le bouton MUET du rail — un effet, jamais un décor', () => {
  test('`aria-pressed` reflète `muted`, et le clic appelle `onToggle`', () => {
    let toggled = 0;
    const el = mount(railSon(true, () => (toggled += 1)));
    const button = el.querySelector('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(toggled).toBe(1);
  });

  test('non muet : `aria-pressed="false"`', () => {
    const el = mount(railSon(false, () => {}));
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('la cible tient au moins 44×44 (dimension 5, cibles atteignables)', () => {
    const el = mount(railSon(true, () => {}));
    /* 44 de cible autour d'un disque de verre de 40 — les primitives communes
       (#8879) ; le gate navigateur mesure les pixels. */
    expect(el.querySelector('[data-story-action="sound"] .size-11 > .viewer-disc')).not.toBeNull();
  });

  test('LA PRISE DU GATE SURVIT AU DÉMÉNAGEMENT — `data-story-sound-toggle` est toujours là', () => {
    /* `check-story-scene.mjs` tape cette prise pour couper le son d'une
       scène ; sans elle, le gate serait VERT PAR OMISSION sur un contrôle
       devenu introuvable. */
    const el = mount(railSon(true, () => {}));
    expect(el.querySelector('[data-story-sound-toggle]')).not.toBeNull();
    expect(el.querySelector('[data-story-sound-toggle]')?.getAttribute('data-story-action')).toBe('sound');
  });

  test('un bouton BASCULE : le libellé « Muet » est CONSTANT, seul `aria-pressed` change', () => {
    const coupe = mount(railSon(true, () => {})).querySelector('button');
    expect(coupe?.getAttribute('aria-label')).toBe('Muet');
    expect(coupe?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      root.unmount();
    });
    container.remove();
    const joue = mount(railSon(false, () => {})).querySelector('button');
    expect(joue?.getAttribute('aria-label')).toBe('Muet');
    expect(joue?.getAttribute('aria-pressed')).toBe('false');
  });
});

/**
 * **LE CHROME COMMUN DU LECTEUR DE STORIES** (#8879,
 * `docs/product/visionneuse-plein-ecran.md`) — fermer, réagir, répondre,
 * enregistrer : les mêmes primitives que le réel et le média de conversation,
 * et chaque geste appelle le rappel qui EXISTAIT (`closeViewer`, la réaction
 * de la story, la feuille de commentaires, la sauvegarde du rail auteur).
 */
const fullPlan = resolveStoryActionRailPlan({
  storyId: 'st-1',
  isOwnStory: false,
  canReply: true,
  hasAudibleSound: false,
  commentCount: 2,
  hasTranslatableContent: false,
});

const identity = { name: 'Amie Deux', initials: 'AD', profileUsername: 'amie2', time: { iso: '2026-09-30T08:00:00.000Z', label: '2 h' } } as const;

const click = (element: Element | null) =>
  act(() => {
    (element as HTMLElement | null)?.click();
  });

describe('la barre haute de la story est la barre commune des plein écrans', () => {
  const topBar = (overrides: Partial<Parameters<typeof StoryTopBar>[0]> = {}) => (
    <StoryTopBar
      authorId="author-1"
      identity={identity}
      progress={<div data-fake-progress />}
      hidden={false}
      language="fr"
      onClose={() => undefined}
      {...overrides}
    />
  );

  test('fermer : la croix commune, EN FIN de barre, appelle la fermeture existante', () => {
    const calls: string[] = [];
    const el = mount(topBar({ onClose: () => calls.push('close') }));
    const exit = el.querySelector('[data-viewer-exit]');
    expect(exit?.getAttribute('data-viewer-exit')).toBe('close');
    expect(exit?.getAttribute('aria-label')).toBe('Fermer');
    expect(el.querySelector('[data-viewer-top-bar] > div:last-child')?.lastElementChild === exit).toBe(true);
    click(exit);
    expect(calls).toEqual(['close']);
  });

  test('les PRISES des gates voyagent avec le dessin : en-tête, auteur, progression au-dessus de la ligne', () => {
    const el = mount(topBar());
    const header = el.querySelector('[data-story-header]');
    expect(header?.getAttribute('data-viewer-top-bar')).toBe('');
    expect(header?.getAttribute('data-story-author')).toBe('author-1');
    expect(header?.firstElementChild?.hasAttribute('data-fake-progress')).toBe(true);
  });

  test('l’identité tient sur UNE ligne : avatar, nom (vers le profil), heure', () => {
    const el = mount(topBar());
    const who = el.querySelector('[data-viewer-identity]');
    expect(who?.textContent).toContain('Amie Deux');
    expect(who?.querySelector('time')?.textContent).toBe('2 h');
    expect(who?.querySelector('a[href="/u/amie2"]')).not.toBeNull();
  });

  test('masquée (appui long, feuille ouverte) la barre devient INERTE — jamais une croix invisible mais cliquable (D-90)', () => {
    const el = mount(topBar({ hidden: true }));
    const header = el.querySelector('[data-story-header]');
    expect(header?.hasAttribute('inert')).toBe(true);
    expect(header?.getAttribute('data-chrome-yields')).toBe('hidden');
  });

  test('le menu « … » : « Enregistrer » appelle la sauvegarde du rail auteur, et le menu met la lecture en pause', () => {
    const calls: string[] = [];
    const opens: boolean[] = [];
    const el = mount(topBar({ onSave: () => calls.push('save'), onOptionsOpenChange: (open) => opens.push(open) }));
    const trigger = el.querySelector('[data-story-options]');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    click(trigger);
    const item = el.querySelector('[role="menuitem"][data-viewer-menu-item="save"]');
    expect(item?.textContent).toContain('Enregistrer');
    click(item);
    expect(calls).toEqual(['save']);
    expect(opens).toEqual([true, false]);
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  test('loi 4 — sans sauvegarde à offrir (story sans média exportable) il n’y a pas de menu', () => {
    const el = mount(topBar());
    expect(el.querySelector('[data-story-options]')).toBeNull();
  });

  test('les états d’attente gardent la MÊME croix (ViewerExitButton), pas une jumelle', () => {
    const calls: string[] = [];
    const el = mount(<ViewerExitButton exit={{ kind: 'close', label: 'Fermer', onExit: () => calls.push('close') }} />);
    expect(el.querySelector('[data-viewer-exit="close"] .viewer-disc')).not.toBeNull();
    click(el.querySelector('button'));
    expect(calls).toEqual(['close']);
  });
});

describe('la barre basse de la story : légende, rail, « Répondre… »', () => {
  const rail = (handlers: Parameters<typeof StoryActionRail>[0]['handlers']) => (
    <StoryActionRail plan={fullPlan} language="fr" handlers={handlers} />
  );
  const bottomBar = (overrides: Partial<Parameters<typeof StoryBottomBar>[0]> = {}) => (
    <StoryBottomBar
      hidden={false}
      language="fr"
      showsCaption
      content={{ text: 'Le lac, ce matin.', language: 'fr' }}
      mediaCaption={{ text: 'Brume sur l’eau', language: 'fr' }}
      rail={null}
      {...overrides}
    />
  );

  test('répondre : la capsule commune appelle l’ouverture de la feuille existante', () => {
    const calls: string[] = [];
    const el = mount(bottomBar({ onReply: () => calls.push('reply') }));
    const capsule = el.querySelector('[data-viewer-reply]');
    expect(capsule?.textContent).toContain('Écrire un commentaire');
    click(capsule);
    expect(calls).toEqual(['reply']);
  });

  test('loi 4 — la story d’autrui seule offre la réponse : sans rappel, aucune capsule', () => {
    const el = mount(bottomBar());
    expect(el.querySelector('[data-viewer-reply]')).toBeNull();
  });

  test('réagir : le rail commun appelle la réaction existante et disparaît sous la feuille', () => {
    const calls: string[] = [];
    const el = mount(bottomBar({ rail: rail({ react: () => calls.push('react'), comments: () => calls.push('comments') }) }));
    click(el.querySelector('[data-viewer-bottom-bar] [data-story-action-rail] [data-story-action="react"]'));
    expect(calls).toEqual(['react']);
  });

  test('« Répondre » n’est plus un bouton du rail : la capsule le porte, le rail garde « Commentaires »', () => {
    const el = mount(bottomBar({ onReply: () => undefined, rail: rail({ react: () => undefined, comments: () => undefined }) }));
    expect(el.querySelector('[data-story-action="reply"]')).toBeNull();
    expect(el.querySelector('[data-story-action="comments"]')).not.toBeNull();
    expect(el.querySelector('[data-viewer-reply]')).not.toBeNull();
  });

  test('la légende partage la rangée du rail (jamais dessous) et chaque contenu garde SA langue', () => {
    const el = mount(bottomBar({ rail: rail({ react: () => undefined }) }));
    const row = el.querySelector('[data-viewer-bottom-row]');
    expect(row?.querySelector('[data-viewer-caption]')).not.toBeNull();
    expect(row?.querySelector('[data-story-action-rail]')).not.toBeNull();
    expect(el.querySelector('[data-viewer-caption] p[lang="fr"]')?.textContent).toBe('Le lac, ce matin.');
    expect(el.querySelector('[data-story-media-caption]')?.getAttribute('lang')).toBe('fr');
  });

  test('une story de TEXTE ne pose aucune légende sur la scène : le texte EST la scène', () => {
    const el = mount(bottomBar({ showsCaption: false }));
    expect(el.querySelector('[data-viewer-caption]')).toBeNull();
  });

  test('sans légende, aucun voile : le fond choisi par l’AUTEUR n’est pas assombri sous le rail et la capsule', () => {
    const el = mount(bottomBar({ showsCaption: false, onReply: () => undefined, rail: rail({ react: () => undefined }) }));
    const bar = el.querySelector('[data-viewer-bottom-bar]');
    expect(bar).not.toBeNull();
    expect(bar?.className).not.toContain('viewer-scrim-bottom');
  });

  test('avec une légende, le voile tient le blanc du texte au-dessus d’AA', () => {
    const el = mount(bottomBar({ rail: rail({ react: () => undefined }) }));
    expect(el.querySelector('[data-viewer-bottom-bar]')?.className).toContain('viewer-scrim-bottom');
  });

  test('#9074 — les deux légendes ouvrent leurs adresses : la carte par /l/, le reste en direct', () => {
    const trackingLinks = [{ url: 'https://exemple.org/lac', token: 'Lac42' }];
    const el = mount(
      bottomBar({
        content: { text: 'Le lac https://exemple.org/lac', language: 'fr' },
        mediaCaption: { text: 'Photo https://ailleurs.net/brume', language: 'fr' },
        trackingLinks,
      }),
    );
    const links = [...el.querySelectorAll('[data-viewer-caption] a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/l/Lac42', 'https://ailleurs.net/brume']);
    expect(links[0]?.textContent).toBe('https://exemple.org/lac');
    expect(links.every((a) => a.hasAttribute('data-claims-gesture'))).toBe(true);
    expect(el.querySelector('[data-story-media-caption] a')).not.toBeNull();
  });

  test('cédante avec la feuille : la barre devient inerte, rail compris', () => {
    const el = mount(bottomBar({ hidden: true, onReply: () => undefined }));
    expect(el.querySelector('[data-viewer-bottom-bar]')?.hasAttribute('inert')).toBe(true);
  });
});
