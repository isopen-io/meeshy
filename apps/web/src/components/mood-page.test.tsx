import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMoodComposeCatalog } from '@/lib/i18n-mood-compose-catalog';
import { BUILTIN_BANNER_PACKS } from '@/lib/profile-decor/catalog';
import type { MoodPageView } from '@/lib/mood/page-view';
import type { MoodReplyOutcome } from '@/lib/mood/reply';
import type { RainScheduler } from '@/lib/mood/rain-dom';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MoodPageBody } from './mood-page';

/**
 * **LA PAGE D'UNE HUMEUR REÇUE** (#10813) — témoins d'EFFET : ce qui se peint
 * (bannière, avatar, mot dans sa langue), ce que le champ fait partir, et ce
 * que la pluie laisse derrière elle au démontage : rien.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadMoodComposeCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/**
 * Chaque racine montée se démonte après son témoin : vider le `body` laissait
 * les racines React vivantes, et l'avatar de la page — abonné à la carte de
 * présence depuis #10956 — repeignait une racine orpheline dans un fichier
 * suivant, après le retrait de happy-dom (`window.event` indéfini).
 */
const mounted: Root[] = [];

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

const view: MoodPageView = {
  postId: 'st-1',
  authorId: 'u-nour',
  authorName: 'Nour',
  handle: 'nour',
  avatar: '/a/nour.jpg',
  emoji: '🎉',
  text: 'Celebrating tonight',
  language: 'en',
  isMood: true,
};

const noBanner = { image: null, design: null, ring: null } as const;

/** Une horloge d'images à la main — la pluie ne tourne que quand le témoin le dit. */
const manualFrames = () => {
  let pending: ((now: number) => void) | null = null;
  const scheduler: RainScheduler = {
    frame: (callback) => {
      pending = callback;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  };
  return {
    scheduler,
    step: (now: number) => {
      const current = pending;
      pending = null;
      current?.(now);
    },
  };
};

const render = (props: Partial<Parameters<typeof MoodPageBody>[0]> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  mounted.push(root);
  const sent: string[] = [];
  const frames = manualFrames();
  const onSend = props.onSend ?? (async (text: string): Promise<MoodReplyOutcome> => {
    sent.push(text);
    return { status: 'sent', conversationId: 'd-recent' };
  });
  act(() => {
    root.render(
      <MoodPageBody
        view={view}
        banner={noBanner}
        accent="#6366F1"
        language="fr"
        mine={false}
        onClose={() => undefined}
        rainScheduler={frames.scheduler}
        {...props}
        onSend={onSend}
      />,
    );
  });
  return { host, root, sent, frames };
};

const type = (input: HTMLInputElement, value: string) => {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const submit = async (host: HTMLElement) => {
  await act(async () => {
    host.querySelector<HTMLFormElement>('[data-mood-reply]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
};

describe('ce que la page peint', () => {
  test('la bannière de l’auteur en fond, son avatar, son emoji et son mot dans la langue servie', () => {
    const { host } = render({ banner: { image: '/b/nour.jpg', design: null, ring: null } });
    expect(host.querySelector('[data-mood-backdrop] img')?.getAttribute('src')).toContain('/b/nour.jpg');
    expect(host.querySelector('[data-mood-emoji]')?.textContent).toBe('🎉');
    const text = host.querySelector('[data-mood-text]');
    expect(text?.textContent).toBe('Celebrating tonight');
    expect(text?.getAttribute('lang')).toBe('en');
    expect(host.querySelector('[data-mood-page]')?.getAttribute('aria-label')).toContain('Nour');
  });

  test('la photo de bannière gagne sur le design équipé (#10933)', () => {
    const { host } = render({ banner: { image: '/b/nour.jpg', design: BUILTIN_BANNER_PACKS[0]!.items[0]!, ring: null } });
    expect(host.querySelector('[data-mood-backdrop] img')?.getAttribute('src')).toContain('/b/nour.jpg');
    expect(host.querySelector('[data-mood-backdrop] [data-banner-design]')).toBeNull();
  });

  test('sans bannière, un dégradé de l’accent — jamais un fond vide', () => {
    const { host } = render();
    expect(host.querySelector('[data-mood-backdrop] img')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-mood-backdrop] > span')?.style.background).toContain('linear-gradient');
  });

  test('ma propre humeur n’a pas de champ de réponse', () => {
    const { host } = render({ mine: true });
    expect(host.querySelector('[data-mood-reply]')).toBeNull();
  });
});

describe('le champ répond en privé', () => {
  test('le texte saisi part, et la page dit où il est arrivé', async () => {
    const { host, sent } = render();
    const input = host.querySelector<HTMLInputElement>('[data-mood-reply-input]')!;
    type(input, 'Trop bien !');
    await submit(host);
    expect(sent).toEqual(['Trop bien !']);
    expect(host.querySelector('[data-mood-reply-status="sent"] a')?.getAttribute('href')).toBe('/c/d-recent');
    expect(input.value).toBe('');
  });

  test('un échec rend le texte au champ et le dit', async () => {
    const { host } = render({ onSend: async () => ({ status: 'failed' }) });
    const input = host.querySelector<HTMLInputElement>('[data-mood-reply-input]')!;
    type(input, 'Coucou');
    await submit(host);
    expect(host.querySelector('[data-mood-reply-status="failed"]')).not.toBeNull();
    expect(input.value).toBe('Coucou');
  });

  test('un champ vide ne part pas', async () => {
    const { host, sent } = render();
    await submit(host);
    expect(sent).toEqual([]);
    expect(host.querySelector<HTMLButtonElement>('[data-mood-reply-send]')?.disabled).toBe(true);
  });
});

describe('la pluie de l’emoji', () => {
  test('elle peuple la vue, puis ne laisse AUCUN nœud au démontage', () => {
    const { host, root, frames } = render();
    for (let now = 0; now <= 2000; now += 16) act(() => frames.step(now));
    const live = host.querySelectorAll('[data-mood-rain-glyph]');
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThanOrEqual(14);
    expect(live[0]?.textContent).toBe('🎉');
    const nodes = [...live];
    act(() => root.unmount());
    /* Sur les nœuds EUX-MÊMES, pas sur le document : React détache la couche
       entière au démontage, et un nœud resté enfant d'une couche détachée
       serait une rétention invisible à `document.querySelectorAll`. */
    expect(nodes.filter((node) => node.parentNode !== null)).toHaveLength(0);
  });
});
