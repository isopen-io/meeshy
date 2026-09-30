import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  VIEWER_GLASS,
  ViewerActionRail,
  ViewerBottomBar,
  ViewerTopBar,
  type ViewerAction,
  type ViewerIdentityModel,
} from './viewer-chrome';
import { ViewerMenu, ViewerReactionTray } from './viewer-chrome-menu';

/**
 * LE CHROME COMMUN DES VISIONNEUSES PLEIN ÉCRAN (#8879) — story, réel, média
 * de conversation, scène de publication : UNE barre haute (sortie, identité,
 * menu), UN rail d'actions, UNE barre basse (légende, « Répondre… »). Les
 * primitives ne décident rien : un rappel absent ⇒ l'action n'existe pas
 * (loi 4), et un chrome qui cède devient INERTE (D-90).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function mount(node: ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

async function click(element: Element | null): Promise<void> {
  if (element === null) throw new Error('élément absent');
  await act(async () => (element as HTMLElement).click());
}

const glyph = (name: string) => <span data-glyph={name} />;

const identity: ViewerIdentityModel = {
  name: 'Noa Berger',
  initials: 'NB',
  time: { iso: '2026-09-30T08:00:00.000Z', label: '2 h' },
};

describe('ViewerActionRail', () => {
  test('ne rend QUE les actions qui ont un effet, dans l’ordre remis', async () => {
    const journal: string[] = [];
    const actions: readonly ViewerAction[] = [
      { action: 'react', label: 'Réagir', glyph: glyph('heart'), onPress: () => journal.push('react') },
      { action: 'repost', label: 'Republier', glyph: glyph('repost') },
      { action: 'share', label: 'Partager', glyph: glyph('share'), onPress: () => journal.push('share') },
    ];
    const view = await mount(<ViewerActionRail label="Actions" actions={actions} />);
    const toolbar = view.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute('aria-label')).toBe('Actions');
    expect(toolbar?.getAttribute('aria-orientation')).toBe('vertical');
    const rendered = [...view.querySelectorAll('[data-viewer-action]')].map((el) => el.getAttribute('data-viewer-action'));
    expect(rendered).toEqual(['react', 'share']);
    await click(view.querySelector('[data-viewer-action="share"]'));
    expect(journal).toEqual(['share']);
  });

  test('les PRISES historiques des gates survivent à l’adoption (`probe`)', async () => {
    const view = await mount(
      <>
        <ViewerActionRail
          label="Actions"
          probe={{ 'data-story-action-rail': '' }}
          actions={[{ action: 'sound', label: 'Muet', glyph: glyph('speaker'), onPress: () => undefined, probe: { 'data-story-action': 'sound', 'data-story-sound-toggle': '' } }]}
        />
        <ViewerTopBar probe={{ 'data-story-header': '' }} exit={{ kind: 'back', label: 'Retour', onExit: () => undefined, probe: { 'data-reels-back': '' } }} />
        <ViewerBottomBar probe={{ 'data-viewer-footer': '' }} caption={<p>Le lac</p>} />
        <ViewerMenu label="Plus d’options" probe={{ 'data-story-options': '' }} items={[{ key: 'save', label: 'Enregistrer', glyph: glyph('save'), onSelect: () => undefined }]} />
      </>,
    );
    expect(view.querySelector('[data-story-action-rail][data-viewer-rail]')).not.toBeNull();
    expect(view.querySelector('[data-story-action="sound"][data-story-sound-toggle][data-viewer-action="sound"]')).not.toBeNull();
    expect(view.querySelector('[data-reels-back][data-viewer-exit="back"]')).not.toBeNull();
    expect(view.querySelector('[data-story-options][data-viewer-menu-button]')).not.toBeNull();
    expect(view.querySelector('[data-story-header][data-viewer-top-bar]')).not.toBeNull();
    expect(view.querySelector('[data-viewer-footer][data-viewer-bottom-bar]')).not.toBeNull();
  });

  test('un rail sans aucune action ne rend rien — pas même un conteneur vide', async () => {
    const view = await mount(<ViewerActionRail label="Actions" actions={[{ action: 'react', label: 'Réagir', glyph: glyph('heart') }]} />);
    expect(view.innerHTML).toBe('');
  });

  test('le compteur ne s’affiche que s’il dit quelque chose, et entre dans le nom accessible', async () => {
    const view = await mount(
      <ViewerActionRail
        label="Actions"
        actions={[
          { action: 'react', label: 'Réagir', glyph: glyph('heart'), count: 12, pressed: true, onPress: () => undefined },
          { action: 'comments', label: 'Commentaires', glyph: glyph('chat'), count: 0, onPress: () => undefined },
        ]}
      />,
    );
    const react = view.querySelector('[data-viewer-action="react"]');
    expect(react?.getAttribute('aria-pressed')).toBe('true');
    expect(react?.hasAttribute('aria-label')).toBe(false);
    expect(react?.textContent).toBe('Réagir12');
    const comments = view.querySelector('[data-viewer-action="comments"]');
    expect(comments?.getAttribute('aria-label')).toBe('Commentaires');
    expect(comments?.querySelector('[data-viewer-count]')).toBeNull();
  });

  test('le disque est le VERRE sombre commun, dans une cible de 44', async () => {
    const view = await mount(<ViewerActionRail label="Actions" actions={[{ action: 'share', label: 'Partager', glyph: glyph('share'), onPress: () => undefined }]} />);
    const button = view.querySelector<HTMLElement>('[data-viewer-action="share"]');
    expect(button?.className).toContain('min-w-11');
    expect(button?.querySelector('[data-viewer-disc]')?.className).toContain(VIEWER_GLASS);
  });

  test('toucher une action ne remonte JAMAIS au plateau (qui changerait de page ou de story)', async () => {
    const journal: string[] = [];
    const view = await mount(
      <div onPointerDown={() => journal.push('stage-down')} onPointerUp={() => journal.push('stage-up')} onClick={() => journal.push('stage-click')}>
        <ViewerActionRail label="Actions" actions={[{ action: 'react', label: 'Réagir', glyph: glyph('heart'), onPress: () => journal.push('react') }]} />
      </div>,
    );
    const button = view.querySelector('[data-viewer-action="react"]');
    if (button === null) throw new Error('bouton absent');
    await act(async () => {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await click(button);
    expect(journal).toEqual(['react']);
  });

  test('un rail qui cède est INERTE et se tait — jamais un contrôle invisible et vivant', async () => {
    const view = await mount(<ViewerActionRail label="Actions" hidden actions={[{ action: 'react', label: 'Réagir', glyph: glyph('heart'), onPress: () => undefined }]} />);
    const toolbar = view.querySelector<HTMLElement>('[data-viewer-rail]');
    expect(toolbar?.hasAttribute('inert')).toBe(true);
    expect(toolbar?.hasAttribute('aria-label')).toBe(false);
    expect(toolbar?.style.opacity).toBe('0');
  });

  test('une action peut céder sa place à un nœud (l’anneau d’un export) et en ancrer un autre à sa gauche', async () => {
    const view = await mount(
      <ViewerActionRail
        label="Actions"
        anchored={{ action: 'react', node: <div data-tray="" /> }}
        actions={[
          { action: 'react', label: 'Réagir', glyph: glyph('heart'), onPress: () => undefined },
          { action: 'save', label: 'Enregistrer', glyph: glyph('save'), onPress: () => undefined, override: <div data-ring="" /> },
        ]}
      />,
    );
    expect(view.querySelector('[data-viewer-anchor="react"] [data-tray]')).not.toBeNull();
    expect(view.querySelector('[data-ring]')).not.toBeNull();
    expect(view.querySelector('[data-viewer-action="save"]')).toBeNull();
  });
});

describe('ViewerTopBar', () => {
  test('FERMER est à la fin de la barre, après l’identité et le menu', async () => {
    const journal: string[] = [];
    const view = await mount(
      <ViewerTopBar
        exit={{ kind: 'close', label: 'Fermer', onExit: () => journal.push('close') }}
        identity={identity}
        trailing={<button type="button" data-menu="">…</button>}
      />,
    );
    const order = [...view.querySelectorAll('[data-viewer-identity], [data-menu], [data-viewer-exit]')].map(
      (el) => el.getAttribute('data-viewer-exit') ?? (el.hasAttribute('data-menu') ? 'menu' : 'identity'),
    );
    expect(order).toEqual(['identity', 'menu', 'close']);
    const exit = view.querySelector('[data-viewer-exit="close"]');
    expect(exit?.getAttribute('aria-label')).toBe('Fermer');
    await click(exit);
    expect(journal).toEqual(['close']);
  });

  test('RETOUR (un écran qu’on a poussé) ouvre la barre, avant l’identité', async () => {
    const view = await mount(<ViewerTopBar exit={{ kind: 'back', label: 'Retour', onExit: () => undefined }} identity={identity} />);
    const order = [...view.querySelectorAll('[data-viewer-identity], [data-viewer-exit]')].map((el) => el.getAttribute('data-viewer-exit') ?? 'identity');
    expect(order).toEqual(['back', 'identity']);
  });

  test('l’identité porte le nom et l’heure sur UNE ligne, l’heure lisible par la machine', async () => {
    const view = await mount(<ViewerTopBar exit={{ kind: 'close', label: 'Fermer', onExit: () => undefined }} identity={identity} />);
    const line = view.querySelector('[data-viewer-identity]');
    expect(line?.textContent).toContain('Noa Berger');
    expect(line?.querySelector('time')?.getAttribute('datetime')).toBe(identity.time?.iso ?? '');
    expect(line?.querySelector('time')?.textContent).toBe('2 h');
  });

  test('ce qui se pose AU-DESSUS de la ligne (la progression d’une story) passe en premier', async () => {
    const view = await mount(<ViewerTopBar exit={{ kind: 'close', label: 'Fermer', onExit: () => undefined }} above={<div data-progress="" />} />);
    const bar = view.querySelector('[data-viewer-top-bar]');
    expect(bar?.firstElementChild?.hasAttribute('data-progress')).toBe(true);
  });

  test('une barre qui cède devient inerte ; la croix reste montée', async () => {
    const view = await mount(<ViewerTopBar hidden exit={{ kind: 'close', label: 'Fermer', onExit: () => undefined }} />);
    const bar = view.querySelector<HTMLElement>('[data-viewer-top-bar]');
    expect(bar?.hasAttribute('inert')).toBe(true);
    expect(bar?.getAttribute('data-chrome-yields')).toBe('hidden');
    expect(view.querySelector('[data-viewer-exit]')).not.toBeNull();
  });
});

describe('ViewerBottomBar', () => {
  test('la capsule « Répondre… » n’existe que si l’hôte sait répondre', async () => {
    const journal: string[] = [];
    const view = await mount(<ViewerBottomBar reply={{ label: 'Écrire un commentaire…', onReply: () => journal.push('reply') }} caption={<p data-caption="">Le lac</p>} />);
    const capsule = view.querySelector('[data-viewer-reply]');
    expect(capsule?.textContent).toBe('Écrire un commentaire…');
    await click(capsule);
    expect(journal).toEqual(['reply']);
    const silent = await mount(<ViewerBottomBar reply={{ label: 'Répondre…' }} caption={<p>Le lac</p>} />);
    expect(silent.querySelector('[data-viewer-reply]')).toBeNull();
  });

  test('la légende et le rail partagent une rangée : la légende ne passe jamais SOUS le rail', async () => {
    const view = await mount(<ViewerBottomBar caption={<p data-caption="">Le lac</p>} rail={<div data-rail="" />} />);
    const row = view.querySelector('[data-viewer-bottom-row]');
    expect(row?.querySelector('[data-viewer-caption] [data-caption]')).not.toBeNull();
    expect(row?.lastElementChild?.querySelector('[data-rail]')).not.toBeNull();
  });

  test('ce qui PARCOURT le média (transport, pellicule) vient sous la capsule', async () => {
    const view = await mount(
      <ViewerBottomBar reply={{ label: 'Répondre…', onReply: () => undefined }}>
        <div data-filmstrip="" />
      </ViewerBottomBar>,
    );
    const bar = view.querySelector('[data-viewer-bottom-bar]');
    expect(bar?.lastElementChild?.hasAttribute('data-filmstrip')).toBe(true);
  });

  test('une barre sans rien à montrer ne rend rien', async () => {
    const view = await mount(<ViewerBottomBar reply={{ label: 'Répondre…' }} />);
    expect(view.innerHTML).toBe('');
  });
});

describe('ViewerMenu', () => {
  test('un menu dont aucune entrée n’a d’effet n’existe pas', async () => {
    const view = await mount(<ViewerMenu label="Plus d’options" items={[{ key: 'save', label: 'Enregistrer', glyph: glyph('save') }]} />);
    expect(view.innerHTML).toBe('');
  });

  test('ouvrir, choisir : l’entrée agit et le menu se referme', async () => {
    const journal: string[] = [];
    const view = await mount(
      <ViewerMenu
        label="Plus d’options"
        onOpenChange={(open) => journal.push(`open:${open}`)}
        items={[
          { key: 'save', label: 'Enregistrer', glyph: glyph('save'), onSelect: () => journal.push('save') },
          { key: 'report', label: 'Signaler', glyph: glyph('flag'), onSelect: () => journal.push('report'), destructive: true },
        ]}
      />,
    );
    const button = view.querySelector('[data-viewer-menu-button]');
    expect(button?.getAttribute('aria-haspopup')).toBe('menu');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    await click(button);
    expect(view.querySelectorAll('[role="menuitem"]').length).toBe(2);
    expect(view.querySelector('[data-viewer-menu-item="report"]')?.getAttribute('data-destructive')).toBe('true');
    await click(view.querySelector('[data-viewer-menu-item="save"]'));
    expect(journal).toEqual(['open:true', 'open:false', 'save']);
    expect(view.querySelector('[role="menu"]')).toBeNull();
  });

  test('Échap referme le MENU seul — la visionneuse dessous reste ouverte', async () => {
    const journal: string[] = [];
    const onViewerKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') journal.push('viewer-closed');
    };
    window.addEventListener('keydown', onViewerKey);
    try {
      const view = await mount(<ViewerMenu label="Plus d’options" items={[{ key: 'save', label: 'Enregistrer', glyph: glyph('save'), onSelect: () => undefined }]} />);
      await click(view.querySelector('[data-viewer-menu-button]'));
      const item = view.querySelector('[data-viewer-menu-item="save"]');
      await act(async () => {
        item?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(view.querySelector('[role="menu"]')).toBeNull();
      expect(journal).toEqual([]);
      expect(document.activeElement).toBe(view.querySelector('[data-viewer-menu-button]'));
    } finally {
      window.removeEventListener('keydown', onViewerKey);
    }
  });
});

describe('ViewerReactionTray', () => {
  test('chaque émoji est une cible de 44 qui dit s’il est déjà posé', async () => {
    const journal: string[] = [];
    const view = await mount(
      <ViewerReactionTray label="Réagir" reactions={['❤️', '😂']} mine={['😂']} labelOf={(emoji) => `Réagir avec ${emoji}`} onPick={(emoji) => journal.push(emoji)} />,
    );
    const group = view.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Réagir');
    const buttons = [...view.querySelectorAll('[data-viewer-reaction]')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Réagir avec ❤️');
    await click(buttons[0] ?? null);
    expect(journal).toEqual(['❤️']);
  });
});
