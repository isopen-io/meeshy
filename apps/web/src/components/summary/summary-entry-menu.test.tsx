import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { ConversationEpisode, DeterministicConversationDigest, FaceRampEntry } from '@/lib/summary/types';
import { LONG_PRESS_MS } from '@/lib/view/long-press';
import { summaryExits } from '@/lib/view/summary-exits';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LivingSummary } from './living-summary';
import { useSummaryEntryMenu } from './summary-entry-menu';

/**
 * **LES ENTRÉES DU RÉSUMÉ ONT UN MENU D'APPUI LONG** (#11225) — Aller au
 * message · Répondre, ouvert par l'appui long, le clic droit, la touche menu et
 * `Maj+F10`, sur un visage de la rampe comme sur un épisode. Le témoin monte le
 * VRAI rendu (`LivingSummary`) sur la VRAIE loi (`summaryExits().entryMenu`) :
 * c'est le câblage des deux qui manquait, chacun existant déjà de son côté.
 */

const episode = (id: string, messageIds: readonly string[]): ConversationEpisode => ({
  id,
  start: 1_700_000_000_000,
  end: 1_700_000_060_000,
  messageIds,
  participantIds: ['u1'],
  deterministicTitle: `Aujourd'hui · ${messageIds.length} messages`,
  agentTitle: null,
});

const face = (id: string, displayName: string, evidenceMessageIds: readonly string[]): FaceRampEntry => ({
  id,
  displayName,
  avatarUrl: null,
  colorHex: '#31B6BA',
  awaitingCount: evidenceMessageIds.length,
  needScore: 1,
  evidenceMessageIds,
});

const digest = (episodes: readonly ConversationEpisode[]): DeterministicConversationDigest => ({
  messageCount: 6,
  participantCount: 2,
  start: null,
  end: null,
  topSenders: [],
  languages: [],
  media: { images: 0, videos: 0, audios: 0, files: 0, locations: 0, links: 0 },
  awaitingYou: [],
  episodes,
  isComplete: true,
});

const FACES = [face('u-amina', 'Amina', ['m-1', 'm-2']), face('u-karim', 'Karim', ['m-locked']), face('u-adam', 'Adam', [])];
const EPISODES = [episode('e-1', ['m-3', 'm-4'])];

function Harness({ journal, withMenu }: { readonly journal: string[]; readonly withMenu: boolean }) {
  const exits = summaryExits({
    selectMode: (mode) => journal.push(`mode:${mode}`),
    requestJump: (id) => journal.push(`jump:${id}`),
    setReplyTarget: (id) => journal.push(`reply:${id}`),
    replyable: (id) => id !== 'm-locked',
    resumeTarget: () => null,
  });
  const entryMenu = useSummaryEntryMenu(withMenu ? exits.entryMenu : undefined);
  return (
    <>
      <LivingSummary
        model={{ digest: digest(EPISODES), faceRamp: FACES }}
        agentSummary={null}
        showsSkeleton={false}
        isComplete
        onReplyToPerson={entryMenu.guard((entry: FaceRampEntry) => journal.push(`tap-face:${entry.id}`))}
        onOpenEpisode={entryMenu.guard((ep: ConversationEpisode) => journal.push(`tap-episode:${ep.id}`))}
        onResumeThread={() => journal.push('resume')}
        {...(entryMenu.press === undefined ? {} : { press: entryMenu.press })}
      />
      {entryMenu.panel}
    </>
  );
}

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  const mounted = root;
  if (mounted !== null) act(() => mounted.unmount());
  container?.remove();
  root = null;
  container = null;
  document.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
});

const mount = (options: { readonly withMenu?: boolean } = {}): string[] => {
  const journal: string[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  container = host;
  const created = createRoot(host);
  root = created;
  act(() => {
    created.render(<Harness journal={journal} withMenu={options.withMenu ?? true} />);
  });
  return journal;
};

const faceButton = (userId: string): HTMLElement => {
  const node = container?.querySelector<HTMLElement>(`[data-face][data-user="${userId}"]`);
  if (node === null || node === undefined) throw new Error(`visage ${userId} introuvable`);
  return node;
};

const episodeButton = (episodeId: string): HTMLElement => {
  const node = container?.querySelector<HTMLElement>(`[data-episode-id="${episodeId}"]`);
  if (node === null || node === undefined) throw new Error(`épisode ${episodeId} introuvable`);
  return node;
};

const items = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[data-summary-entry-action]')].map((node) => node.dataset.summaryEntryAction ?? '');

const contextMenuOn = (target: Element) =>
  act(() => {
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  });

const choose = (action: string) =>
  act(() => {
    document.querySelector<HTMLButtonElement>(`[data-summary-entry-action="${action}"]`)?.click();
  });

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

describe('Résumé — le menu d’un VISAGE (#11225)', () => {
  test('clic droit sur un visage ⇒ Aller au message · Répondre, nommé par la personne, sans déclencher le toucher', () => {
    const journal = mount();
    contextMenuOn(faceButton('u-amina'));
    expect(items()).toEqual(['goToMessage', 'reply']);
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Actions pour Amina');
    expect(document.querySelector('[data-summary-entry-action="goToMessage"]')?.textContent).toContain('Aller au message');
    expect(document.querySelector('[data-summary-entry-action="reply"]')?.textContent).toContain('Répondre');
    expect(journal).toEqual([]);
  });

  test('« Aller au message » ⇒ script + saut sur la première preuve, sans citer — et le menu se referme', () => {
    const journal = mount();
    contextMenuOn(faceButton('u-amina'));
    choose('goToMessage');
    expect(journal).toEqual(['mode:script', 'jump:m-1']);
    expect(items()).toEqual([]);
  });

  test('« Répondre » ⇒ script + saut + citation de la première preuve', () => {
    const journal = mount();
    contextMenuOn(faceButton('u-amina'));
    choose('reply');
    expect(journal).toEqual(['mode:script', 'jump:m-1', 'reply:m-1']);
  });

  test('un message auquel on ne peut pas répondre d’ici ⇒ le menu n’offre que « Aller au message » (la loi, `replyableOf`)', () => {
    mount();
    contextMenuOn(faceButton('u-karim'));
    expect(items()).toEqual(['goToMessage']);
  });

  test('un visage sans preuve ne désigne aucun message ⇒ aucun menu', () => {
    mount();
    expect(faceButton('u-adam').hasAttribute('data-summary-target')).toBe(false);
    contextMenuOn(faceButton('u-adam'));
    expect(items()).toEqual([]);
  });

  test('appui long au doigt ⇒ le menu ; le relâcher qui suit n’est PAS un toucher', async () => {
    const journal = mount();
    const target = faceButton('u-amina');
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40));
    });
    expect(items()).toEqual(['goToMessage', 'reply']);
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(journal).toEqual([]);
    expect(items()).toEqual(['goToMessage', 'reply']);
  });

  test('un simple toucher garde sa sortie : script + saut + citation (le menu ne la retire pas)', () => {
    const journal = mount();
    act(() => {
      faceButton('u-amina').click();
    });
    expect(journal).toEqual(['tap-face:u-amina']);
  });
});

describe('Résumé — le menu d’un ÉPISODE (#11225)', () => {
  test('Maj+F10 au clavier ⇒ le menu, nommé par le titre de l’épisode, et le focus entre dans le menu', async () => {
    const journal = mount();
    const target = episodeButton('e-1');
    target.focus();
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await settle();
    expect(items()).toEqual(['goToMessage', 'reply']);
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe("Actions pour Aujourd'hui · 2 messages");
    expect(document.activeElement?.getAttribute('data-summary-entry-action')).toBe('goToMessage');
    expect(journal).toEqual([]);
  });

  test('« Répondre » sur un épisode ⇒ script + saut + citation de son premier message', () => {
    const journal = mount();
    contextMenuOn(episodeButton('e-1'));
    choose('reply');
    expect(journal).toEqual(['mode:script', 'jump:m-3', 'reply:m-3']);
  });

  test('Échap referme le menu et rend le focus à l’épisode', async () => {
    mount();
    const target = episodeButton('e-1');
    target.focus();
    contextMenuOn(target);
    await settle();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(target);
  });
});

describe('Résumé — sans capacité de menu, rien ne change (#11225)', () => {
  test('aucune entrée ne porte de cible, et un clic droit n’ouvre rien', () => {
    mount({ withMenu: false });
    expect(container?.querySelectorAll('[data-summary-target]').length).toBe(0);
    contextMenuOn(faceButton('u-amina'));
    expect(items()).toEqual([]);
  });
});
