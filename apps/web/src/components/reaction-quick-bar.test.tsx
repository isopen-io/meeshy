import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { EMOJI_USAGE_KEY, recordEmojiUsage } from '@/lib/emoji-usage';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import { SIDE_PADDING } from '@/lib/view/message-menu-metrics';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageReactionQuickBar, ReactionAddCapsule } from './reaction-quick-bar';

/**
 * LA CAPSULE « + » ET SA BARRE RAPIDE (#10583) — sous le dernier message reçu,
 * un toucher ouvre les emojis les plus utilisés ; « ＋ » mène à la feuille
 * complète. Miroir `BubbleReactionsOverlay.addButton` et
 * `ConversationView+MessageRow.quickReactionBar` (iOS).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();

beforeEach(() => {
  window.localStorage.removeItem(EMOJI_USAGE_KEY);
});

afterEach(() => {
  mounter.unmountAll();
  window.localStorage.removeItem(EMOJI_USAGE_KEY);
});

const CAPSULE = 'button[data-reaction-add]';
const BAR = '[data-reaction-quick-bar]';

const monte = async () => {
  const journal: string[] = [];
  const host = await mounter.mount(
    <ReactionAddCapsule onReact={(emoji) => journal.push(`react:${emoji}`)} onExpand={() => journal.push('expand')} />,
  );
  const capsule = host.querySelector<HTMLButtonElement>(CAPSULE);
  if (capsule === null) throw new Error('capsule absente');
  return { journal, capsule };
};

const ouvre = async () => {
  const mounted = await monte();
  await act(async () => {
    mounted.capsule.click();
  });
  const bar = document.body.querySelector<HTMLElement>(BAR);
  if (bar === null) throw new Error('barre absente');
  return { ...mounted, bar };
};

const tiles = (bar: HTMLElement): readonly HTMLButtonElement[] => [...bar.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];

describe('la capsule « + » sous le dernier message reçu (#10583)', () => {
  test('au repos : un bouton nommé, qui annonce un menu fermé, et aucune barre', async () => {
    const { capsule } = await monte();
    expect(capsule.getAttribute('aria-label')).toBe('Ajouter une réaction');
    expect(capsule.getAttribute('aria-haspopup')).toBe('menu');
    expect(capsule.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.querySelector(BAR)).toBeNull();
  });

  test('un toucher ouvre la barre rapide : les emojis du rail du menu, puis « ＋ »', async () => {
    const { capsule, bar } = await ouvre();
    expect(capsule.getAttribute('aria-expanded')).toBe('true');
    expect(bar.getAttribute('role')).toBe('menu');
    expect(bar.getAttribute('aria-label')).toBe('Réagir');
    const all = tiles(bar);
    expect(all.length).toBe(QUICK_REACTIONS.length + 1);
    expect(all.slice(0, -1).map((tile) => tile.textContent)).toEqual([...QUICK_REACTIONS]);
    expect(all[all.length - 1]?.hasAttribute('data-add-reaction')).toBe(true);
    expect(all[all.length - 1]?.getAttribute('aria-label')).toBe('Ajouter une réaction');
  });

  test('la barre suit le classement par usage — un emoji employé passe en tête', async () => {
    recordEmojiUsage('🥳');
    recordEmojiUsage('🥳');
    const { bar } = await ouvre();
    expect(tiles(bar)[0]?.textContent).toBe('🥳');
  });

  test('choisir un emoji réagit, compte un emploi, et referme la barre', async () => {
    const { journal, bar } = await ouvre();
    const fire = tiles(bar).find((tile) => tile.textContent === '🔥');
    await act(async () => {
      fire?.click();
    });
    expect(journal).toEqual(['react:🔥']);
    expect(document.body.querySelector(BAR)).toBeNull();
    expect(window.localStorage.getItem(EMOJI_USAGE_KEY)).toContain('🔥');
  });

  test('« ＋ » ouvre la feuille complète et referme la barre, sans réagir', async () => {
    const { journal, bar } = await ouvre();
    await act(async () => {
      bar.querySelector<HTMLButtonElement>('button[data-add-reaction]')?.click();
    });
    expect(journal).toEqual(['expand']);
    expect(document.body.querySelector(BAR)).toBeNull();
  });

  test('Échap referme et rend le focus à la capsule', async () => {
    const { capsule, journal } = await ouvre();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.body.querySelector(BAR)).toBeNull();
    expect(document.activeElement).toBe(capsule);
    expect(journal).toEqual([]);
  });

  test('un toucher ailleurs referme', async () => {
    await ouvre();
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(document.body.querySelector(BAR)).toBeNull();
  });

  test('un toucher DANS la barre ne la referme pas', async () => {
    const { bar } = await ouvre();
    await act(async () => {
      bar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(document.body.querySelector(BAR)).not.toBeNull();
  });

  test('un défilement qui déplace la capsule referme', async () => {
    const { capsule } = await ouvre();
    capsule.getBoundingClientRect = () => new DOMRect(0, 240, 28, 24);
    await act(async () => {
      document.dispatchEvent(new Event('scroll'));
    });
    expect(document.body.querySelector(BAR)).toBeNull();
  });

  test('le retour matériel Android (popstate) referme la barre', async () => {
    await ouvre();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(document.body.querySelector(BAR)).toBeNull();
  });

  test('les flèches parcourent la barre, Tab la referme', async () => {
    const { bar, capsule } = await ouvre();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const all = tiles(bar);
    expect(document.activeElement).toBe(all[0] ?? null);
    await act(async () => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(all[1] ?? null);
    await act(async () => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.body.querySelector(BAR)).toBeNull();
    expect(document.activeElement).toBe(capsule);
  });

  test('un second toucher sur la capsule referme la barre', async () => {
    const { capsule } = await ouvre();
    await act(async () => {
      capsule.click();
    });
    expect(document.body.querySelector(BAR)).toBeNull();
  });
});

/**
 * LA MÊME BARRE, OUVERTE PAR LE DOUBLE TOUCHER D'UN MESSAGE (#10599, décision
 * porteur du 2026-10-14) — ancrée au message (ou à la tuile visée), montée
 * ouverte par son hôte, qui la démonte sur `onClose`.
 */
const ouvreSurMessage = async () => {
  const journal: string[] = [];
  const anchor = document.createElement('div');
  anchor.tabIndex = 0;
  anchor.getBoundingClientRect = () => new DOMRect(16, 300, 340, 60);
  document.body.append(anchor);
  await mounter.mount(
    <MessageReactionQuickBar
      anchor={anchor}
      x={180}
      onReact={(emoji) => journal.push(`react:${emoji}`)}
      onExpand={() => journal.push('expand')}
      onClose={() => journal.push('close')}
    />,
  );
  const bar = document.body.querySelector<HTMLElement>(BAR);
  if (bar === null) throw new Error('barre absente');
  return { journal, anchor, bar };
};

describe('la barre rapide du double toucher d’un message (#10599)', () => {
  afterEach(() => {
    document.body.querySelectorAll('[tabindex="0"]').forEach((el) => el.remove());
  });

  test('montée ouverte : un menu « Réagir », les emojis du rail puis « ＋ », centré sous le doigt', async () => {
    const { bar } = await ouvreSurMessage();
    expect(bar.getAttribute('role')).toBe('menu');
    expect(bar.getAttribute('aria-label')).toBe('Réagir');
    const all = tiles(bar);
    expect(all.length).toBe(QUICK_REACTIONS.length + 1);
    expect(all.slice(0, -1).map((tile) => tile.textContent)).toEqual([...QUICK_REACTIONS]);
    const width = Number.parseFloat(bar.style.width);
    const left = Number.parseFloat(bar.style.left);
    expect(left).toBe(Math.max(SIDE_PADDING, Math.min(180 - width / 2, window.innerWidth - width - SIDE_PADDING)));
  });

  test('choisir un emoji réagit, compte un emploi, referme la barre et rend le focus au message', async () => {
    const { journal, bar, anchor } = await ouvreSurMessage();
    await act(async () => {
      tiles(bar).find((tile) => tile.textContent === '🔥')?.click();
    });
    expect(journal).toEqual(['react:🔥', 'close']);
    expect(document.body.querySelector(BAR)).toBeNull();
    expect(document.activeElement).toBe(anchor);
    expect(window.localStorage.getItem(EMOJI_USAGE_KEY)).toContain('🔥');
  });

  test('« ＋ » ouvre la feuille complète et referme la barre, sans réagir', async () => {
    const { journal, bar } = await ouvreSurMessage();
    await act(async () => {
      bar.querySelector<HTMLButtonElement>('button[data-add-reaction]')?.click();
    });
    expect(journal).toEqual(['expand', 'close']);
  });

  test('Échap referme et rend le focus au message', async () => {
    const { journal, anchor } = await ouvreSurMessage();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(journal).toEqual(['close']);
    expect(document.activeElement).toBe(anchor);
  });

  test('un toucher ailleurs referme, un toucher dans la barre non', async () => {
    const { journal, bar } = await ouvreSurMessage();
    await act(async () => {
      bar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(journal).toEqual([]);
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(journal).toEqual(['close']);
  });

  test('un défilement qui déplace le message referme', async () => {
    const { journal, anchor } = await ouvreSurMessage();
    anchor.getBoundingClientRect = () => new DOMRect(16, 120, 340, 60);
    await act(async () => {
      document.dispatchEvent(new Event('scroll'));
    });
    expect(journal).toEqual(['close']);
  });

  test('le retour matériel Android (popstate) referme la barre', async () => {
    const { journal } = await ouvreSurMessage();
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(journal).toEqual(['close']);
  });

  test('le focus entre dans la barre, les flèches la parcourent', async () => {
    const { bar } = await ouvreSurMessage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const all = tiles(bar);
    expect(document.activeElement).toBe(all[0] ?? null);
    await act(async () => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(all[1] ?? null);
  });
});
