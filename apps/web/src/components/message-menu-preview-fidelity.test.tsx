import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { languageName } from '@/lib/languages';
import { messageMenuItems, translationChoices } from '@/lib/view/message-actions';
import { useMessageMenu } from '@/lib/view/use-message-menu';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu } from './message-menu';

/**
 * L'APERÇU DE L'APPUI LONG, FIDÈLE ET SOULEVÉ (#11206, décision #11204).
 *
 * 1. Le rail de réactions n'est monté que si réagir est PERMIS — la même loi
 *    que le double toucher (`doubleTapReactable`) : ni un message supprimé, ni
 *    un éphémère échu, ni un envoi encore local.
 * 2. L'aperçu se SOULÈVE depuis sa rangée (FLIP : `transform` et `opacity`
 *    seuls) et termine SANS transform résiduel ; il y RETOURNE à la fermeture.
 *    Sous `prefers-reduced-motion`, un fondu de 150 ms, aucun transform animé.
 * 3. Le libellé « (original) » du sous-menu Traduire suit la langue d'interface.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('de'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root | null = null;

type Played = {
  readonly target: Element;
  readonly keyframes: readonly Keyframe[];
  readonly options: KeyframeAnimationOptions;
  readonly finish: () => Promise<void>;
};

type Animatable = { animate: Element['animate'] };
/* happy-dom n'est enregistré qu'au `beforeAll` : `Element` et `window` se lisent
   dans les témoins, jamais au chargement du module. */
const animateProto = (): Animatable => Element.prototype as unknown as Animatable;
let originalAnimate: Element['animate'] | null = null;
let originalMatchMedia: typeof window.matchMedia | null = null;

/** `animate` bouchonné : chaque animation est RETENUE, et finie à la main. */
function recordAnimations(): Played[] {
  const played: Played[] = [];
  originalAnimate ??= animateProto().animate;
  animateProto().animate = function animate(this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    let resolve: (value: Animation) => void = () => {};
    const finished = new Promise<Animation>((r) => {
      resolve = r;
    });
    const animation = { finished, cancel: () => {}, finish: () => {} } as unknown as Animation;
    played.push({
      target: this,
      keyframes: Array.isArray(keyframes) ? keyframes : [],
      options: typeof options === 'object' ? options : {},
      finish: async () => {
        await act(async () => {
          resolve(animation);
          await finished;
          await new Promise((r) => setTimeout(r, 0));
        });
      },
    });
    return animation;
  } as Element['animate'];
  return played;
}

function reduceMotion(): void {
  originalMatchMedia ??= window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  if (originalAnimate !== null) animateProto().animate = originalAnimate;
  if (originalMatchMedia !== null) window.matchMedia = originalMatchMedia;
  originalAnimate = null;
  originalMatchMedia = null;
  document.documentElement.lang = 'fr';
});

const rectOf = (box: { top: number; left: number; width: number; height: number }): DOMRect =>
  ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box }) as DOMRect;

function mountMenu({
  laidOut = true,
  canReact = true,
  height = 80,
}: { readonly laidOut?: boolean; readonly canReact?: boolean; readonly height?: number } = {}) {
  const row = document.createElement('div');
  row.setAttribute('data-row', 'm1');
  row.innerHTML = '<p>Le texte du message</p>';
  if (laidOut) row.getBoundingClientRect = () => rectOf({ top: 300, left: 0, width: 390, height });
  document.body.append(row);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const closed: string[] = [];
  const controls = { reopen: () => {} };
  const choices = translationChoices({
    message: {
      originalLanguage: 'fr',
      translations: [{ id: 't', messageId: 'm1', targetLanguage: 'en', translatedContent: 'Hello', translationModel: 'medium', createdAt: new Date() }],
    },
    preferredLanguages: ['en'],
    servedLanguage: 'en',
  });
  function Harness() {
    const [open, setOpen] = useState(true);
    controls.reopen = () => setOpen(true);
    return open ? (
      <MessageMenu
        target={{ messageId: 'm1', element: row, isMine: false }}
        items={messageMenuItems({ hasText: true, isProtected: false, languageCount: 2, canForward: true })}
        choices={choices}
        canReact={canReact}
        subjectLabel="Actions du message"
        onClose={() => {
          closed.push('close');
          setOpen(false);
        }}
        onReact={() => {}}
        onExpandReactions={() => {}}
        onAction={() => {}}
        onPickLanguage={() => {}}
      />
    ) : null;
  }
  act(() => {
    root!.render(<Harness />);
  });
  return {
    row,
    closed,
    reopen: () =>
      act(() => {
        controls.reopen();
      }),
  };
}

const host = (): HTMLElement => document.querySelector<HTMLElement>('[data-message-menu-preview-host]')!;
const pressEscape = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

describe('le rail suit la loi de réaction (#11206)', () => {
  test('réagir refusé : aucun rail monté', () => {
    mountMenu({ canReact: false });
    expect(document.querySelector('[role="menu"]')).not.toBe(null);
    expect(document.querySelector('[data-message-menu-rail]')).toBe(null);
  });

  test('sans rail, le focus entre directement dans la liste', async () => {
    mountMenu({ canReact: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    expect(document.querySelector('.message-menu-list')!.contains(document.activeElement)).toBe(true);
  });

  test('réagir permis : le rail est là', () => {
    mountMenu();
    expect(document.querySelector('[data-message-menu-rail]')).not.toBe(null);
  });
});

describe('l’appui long sur un message que la passerelle refuse de réactions ne monte aucun rail (#11206)', () => {
  const deleted = (): Message =>
    message({
      id: 'm-supprime',
      conversationId: 'c-a',
      senderId: 'u-other',
      content: '',
      originalLanguage: 'fr',
      createdAt: minutesAgo(5),
      translations: [],
      deletedAt: minutesAgo(1),
    });
  /* `ReactionService.addReaction` refuse un message système : le rail ne le
     promet pas. */
  const system = (): Message => ({
    ...message({
      id: 'm-supprime',
      conversationId: 'c-a',
      senderId: 'u-other',
      content: 'Awa a rejoint la conversation',
      originalLanguage: 'fr',
      createdAt: minutesAgo(5),
      translations: [],
    }),
    messageType: 'system',
  });

  const cases: readonly (readonly [string, () => Message])[] = [
    ['supprimé', deleted],
    ['système', system],
  ];
  cases.forEach(([kind, build]) => test(`message ${kind} : le geste ouvre le menu, sans rail de réactions`, async () => {
    const lot = build();
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [lot], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
    const transport = { request: async <T,>(_request: HttpRequest): Promise<ApiResult<T>> => ({ ok: true, data: null as T }) };

    function Harness() {
      const menu = useMessageMenu({
        conversationId: 'c-a',
        messages: [lot],
        readerLanguages: ['fr'],
        readerLocale: 'fr-FR',
        viewerId: 'u-viewer',
        canStar: false,
        reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
        announce: () => {},
        queryClient,
        transport,
      });
      const target = menu.menuTarget;
      const data = menu.menuData;
      return (
        <div>
          <div data-row={lot.id} tabIndex={0} {...menu.longPress}>
            <p>Message supprimé</p>
          </div>
          {target === null || data === undefined ? null : (
            <MessageMenu
              target={target}
              items={data.items}
              choices={data.choices}
              canReact={data.canReact}
              subjectLabel={data.subjectLabel}
              onClose={menu.onCloseMenu}
              onReact={() => {}}
              onExpandReactions={() => {}}
              onAction={() => {}}
              onPickLanguage={() => {}}
            />
          )}
        </div>
      );
    }

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      container.querySelector('[data-row="m-supprime"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="menu"]')).not.toBe(null);
    expect(document.querySelector('[data-message-menu-rail]')).toBe(null);
  }));
});

describe('l’aperçu se soulève depuis sa rangée et y retourne (#11206)', () => {
  test('l’hôte part de la rangée, porte data-lifting, puis se pose sans transform résiduel', async () => {
    const played = recordAnimations();
    mountMenu();
    const lift = played.find((animation) => animation.target === host());
    expect(lift).toBeDefined();
    expect(host().hasAttribute('data-lifting')).toBe(true);
    expect(String(lift!.keyframes[0]!.transform)).toBe('translate(-16px, 0px)');
    expect(lift!.keyframes.at(-1)!.transform).toBe('none');
    expect(lift!.keyframes.flatMap((frame) => Object.keys(frame)).every((key) => ['transform', 'opacity', 'offset', 'easing'].includes(key))).toBe(true);

    await lift!.finish();
    expect(host().hasAttribute('data-lifting')).toBe(false);
    expect(host().style.transform).toBe('');
    expect(host().style.left).toBe('16px');
  });

  test('à la fermeture, l’aperçu retourne à la rangée, qui ne réapparaît qu’à l’arrivée', async () => {
    const played = recordAnimations();
    const { row, closed } = mountMenu();
    await played[0]!.finish();
    pressEscape();
    expect(closed.length).toBeGreaterThan(0);
    expect(document.querySelector('[role="menu"]')).toBe(null);
    const back = played.at(-1)!;
    expect(back).not.toBe(played[0]);
    expect(back.target.isConnected).toBe(true);
    expect(back.keyframes.at(-1)!.transform).toBe('translate(-16px, 0px)');
    expect(row.style.opacity).toBe('0');
    await back.finish();
    expect(back.target.isConnected).toBe(false);
    expect(row.style.opacity).toBe('');
  });

  test('rouvrir la MÊME rangée avant l’arrivée du fantôme ne la laisse ni visible sous le menu, ni effacée pour de bon', async () => {
    const played = recordAnimations();
    const { row, reopen } = mountMenu();
    await played[0]!.finish();
    pressEscape();
    const firstReturn = played.at(-1)!;
    reopen();
    expect(document.querySelector('[role="menu"]')).not.toBe(null);
    expect(document.querySelector<HTMLElement>('[data-message-preview]')!.style.opacity).toBe('');
    expect(firstReturn.target.isConnected).toBe(false);
    await firstReturn.finish();
    expect(row.style.opacity).toBe('0');
    pressEscape();
    const secondReturn = played.at(-1)!;
    expect(secondReturn).not.toBe(firstReturn);
    expect(row.style.opacity).toBe('0');
    await secondReturn.finish();
    expect(row.style.opacity).toBe('');
  });

  test('le fantôme du retour ne se fait jamais passer pour un aperçu', async () => {
    const played = recordAnimations();
    mountMenu();
    await played[0]!.finish();
    pressEscape();
    const ghost = played.at(-1)!.target;
    expect(ghost.hasAttribute('data-message-menu-preview-host')).toBe(false);
    expect(ghost.querySelector('[data-message-preview]')).toBe(null);
  });

  test('sous reduced-motion, un fondu de 150 ms : aucun transform animé', async () => {
    reduceMotion();
    const played = recordAnimations();
    mountMenu();
    pressEscape();
    expect(played.length).toBeGreaterThan(0);
    expect(played.every((animation) => animation.keyframes.every((frame) => !('transform' in frame)))).toBe(true);
    expect(played.every((animation) => animation.options.duration === 150)).toBe(true);
  });

  test('une rangée sans géométrie (aucune mise en page) ne joue rien et ferme sur-le-champ', () => {
    const played = recordAnimations();
    const { row } = mountMenu({ laidOut: false });
    pressEscape();
    expect(played).toEqual([]);
    expect(row.style.opacity).toBe('');
  });
});

describe('un aperçu tronqué garde son élévation (#11206)', () => {
  test('le fondu de troncature vit sur une enveloppe INTÉRIEURE : l’hôte garde halo et ombre', () => {
    mountMenu({ height: 4000 });
    const hostStyle = host().getAttribute('style') ?? '';
    expect(hostStyle).toContain('drop-shadow');
    expect(hostStyle).not.toContain('mask-image');
    expect(hostStyle).not.toContain('max-height');
    const clip = host().querySelector<HTMLElement>(':scope > [data-message-menu-preview-clip]')!;
    expect(clip).not.toBe(null);
    const clipStyle = clip.getAttribute('style') ?? '';
    expect(clipStyle).toContain('mask-image');
    expect(clipStyle).toContain('max-height');
    expect(clip.querySelector('[data-message-preview]')).not.toBe(null);
  });

  test('un aperçu entier n’a ni fondu ni hauteur bornée', () => {
    mountMenu();
    const clip = host().querySelector<HTMLElement>(':scope > [data-message-menu-preview-clip]')!;
    expect(clip.getAttribute('style') ?? '').not.toContain('mask-image');
    expect(clip.querySelector('[data-message-preview]')).not.toBe(null);
  });
});

describe('le sous-menu Traduire dit « original » dans la langue d’interface (#11206)', () => {
  test('interface DE : « (Original) », par la clé du catalogue', () => {
    document.documentElement.lang = 'de';
    mountMenu({ laidOut: false });
    const translateEntry = document.querySelector<HTMLButtonElement>('.message-menu-list [data-action="translate"]')!;
    act(() => {
      translateEntry.click();
    });
    const labels = [...document.querySelectorAll('[role="menuitemradio"]')].map((choice) => choice.textContent ?? '');
    const expected = translate('de', 'message.detail.language.original', { language: languageName('fr') });
    expect(expected).toContain('(Original)');
    expect(labels.some((label) => label.includes(expected))).toBe(true);
  });
});
