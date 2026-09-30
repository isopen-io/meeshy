import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { SwipeOutcome } from '@/lib/view/swipe';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageSwipe, type MessageSwipeActions } from './message-swipe';

/**
 * **GLISSER UN MESSAGE POUR Y RÉPONDRE OU LE TRANSFÉRER** (#7559) et
 * **L'ICÔNE « RÉPONDRE » DU POINTEUR FIN** (#8899) — la rangée montée en DOM
 * réel : les seuils d'iOS, les deux sens, la neutralisation (sélection,
 * piste de lecture, souris), l'indicateur heure → glyphe, le clic avalé.
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

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const pointer = (type: string, x: number, y: number, pointerType = 'touch') =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType, isPrimary: true });

async function glisser(surface: Element, path: readonly (readonly [number, number])[], options: { readonly pointerType?: string; readonly release?: boolean } = {}) {
  const pointerType = options.pointerType ?? 'touch';
  const [first, ...rest] = path;
  if (first === undefined) return;
  await act(async () => surface.dispatchEvent(pointer('pointerdown', first[0], first[1], pointerType)));
  for (const [x, y] of rest) await act(async () => surface.dispatchEvent(pointer('pointermove', x, y, pointerType)));
  if (options.release === false) return;
  const last = rest[rest.length - 1] ?? first;
  await act(async () => surface.dispatchEvent(pointer('pointerup', last[0], last[1], pointerType)));
}

type Journal = SwipeOutcome[];

const actionsOf = (journal: Journal, patch: Partial<MessageSwipeActions> = {}): MessageSwipeActions => ({
  canReply: true,
  canForward: true,
  onAction: (outcome) => journal.push(outcome),
  ...patch,
});

const monte = (props: {
  readonly actions: MessageSwipeActions | undefined;
  readonly flat?: boolean;
  readonly isMine?: boolean;
  readonly attachments?: readonly { readonly mimeType: string }[];
}) =>
  mounter.mount(
    <MessageSwipe
      actions={props.actions}
      flat={props.flat ?? false}
      isMine={props.isMine ?? false}
      attachments={props.attachments}
      createdAt="2026-09-30T09:41:00.000Z"
      locale="fr"
    >
      <p data-testid="texte">Bonjour</p>
      <span role="slider" aria-label="Position" data-testid="piste" />
    </MessageSwipe>,
  );

const texte = (host: HTMLElement) => host.querySelector('[data-testid="texte"]') as HTMLElement;
const contenu = (host: HTMLElement) => host.querySelector('[data-message-swipe-content]') as HTMLElement;

describe('MessageSwipe — le glissé d’iOS sous le doigt (#7559)', () => {
  test('bulle reçue : vers la droite RÉPOND, vers la gauche TRANSFÈRE', async () => {
    const journal: Journal = [];
    const host = await monte({ actions: actionsOf(journal) });
    await glisser(texte(host), [[100, 100], [140, 101], [180, 102]]);
    await glisser(texte(host), [[200, 100], [160, 101], [120, 102]]);
    expect(journal).toEqual(['reply', 'forward']);
  });

  test('bulle envoyée : la réponse part vers la GAUCHE ; rangée plate : toujours vers la droite', async () => {
    const mine: Journal = [];
    const bubble = await monte({ actions: actionsOf(mine), isMine: true });
    await glisser(texte(bubble), [[200, 100], [160, 100], [120, 100]]);
    expect(mine).toEqual(['reply']);
    mounter.unmountAll();
    const flat: Journal = [];
    const row = await monte({ actions: actionsOf(flat), isMine: true, flat: true });
    await glisser(texte(row), [[100, 100], [140, 100], [180, 100]]);
    expect(flat).toEqual(['reply']);
  });

  test('en deçà de 66 px, rien ; l’indicateur montre l’HEURE, puis le glyphe au seuil', async () => {
    const journal: Journal = [];
    const host = await monte({ actions: actionsOf(journal) });
    await glisser(texte(host), [[100, 100], [130, 100], [160, 100]], { release: false });
    const indicator = host.querySelector('[data-message-swipe-indicator]');
    expect(indicator?.getAttribute('data-message-swipe-indicator')).toBe('stamp');
    expect(indicator?.textContent).toContain('09:41'.slice(0, 2));
    await act(async () => texte(host).dispatchEvent(pointer('pointermove', 175, 100)));
    expect(host.querySelector('[data-message-swipe-indicator]')?.getAttribute('data-message-swipe-indicator')).toBe('reply');
    await act(async () => texte(host).dispatchEvent(pointer('pointermove', 150, 100)));
    await act(async () => texte(host).dispatchEvent(pointer('pointerup', 150, 100)));
    expect(journal).toEqual([]);
    expect(contenu(host).style.transform).toBe('');
  });

  test('une bulle audio/vidéo RÉSISTE : 40 px ne la déplacent pas', async () => {
    const host = await monte({ actions: actionsOf([]), attachments: [{ mimeType: 'audio/mp4' }] });
    await glisser(texte(host), [[100, 100], [140, 100]], { release: false });
    expect(contenu(host).style.transform).toBe('');
    await act(async () => texte(host).dispatchEvent(pointer('pointermove', 150, 100)));
    expect(contenu(host).style.transform).toBe('translateX(50px)');
  });

  test('un geste né sur la piste de lecture ne glisse jamais la rangée', async () => {
    const journal: Journal = [];
    const host = await monte({ actions: actionsOf(journal) });
    const piste = host.querySelector('[data-testid="piste"]') as HTMLElement;
    await glisser(piste, [[100, 100], [140, 100], [200, 100]]);
    expect(journal).toEqual([]);
  });

  test('en SÉLECTION (aucune action), le glissé ne fait rien', async () => {
    const host = await monte({ actions: undefined });
    await glisser(texte(host), [[100, 100], [140, 100], [200, 100]], { release: false });
    expect(contenu(host).style.transform).toBe('');
  });

  test('la souris ne glisse pas : elle sélectionne du texte', async () => {
    const journal: Journal = [];
    const host = await monte({ actions: actionsOf(journal) });
    await glisser(texte(host), [[100, 100], [140, 100], [200, 100]], { pointerType: 'mouse' });
    expect(journal).toEqual([]);
  });

  test('un sens sans action ne bouge pas (vue unique : ni réponse ni transfert)', async () => {
    const journal: Journal = [];
    const host = await monte({ actions: actionsOf(journal, { canForward: false }) });
    await glisser(texte(host), [[200, 100], [160, 100], [100, 100]], { release: false });
    expect(contenu(host).style.transform).toBe('');
  });

  test('le clic qui suit un glissé engagé est AVALÉ', async () => {
    let clicks = 0;
    const journal: Journal = [];
    const host = await monte({ actions: actionsOf(journal) });
    texte(host).addEventListener('click', () => (clicks += 1));
    await glisser(texte(host), [[100, 100], [140, 100], [180, 100]]);
    await act(async () => texte(host).click());
    expect(clicks).toBe(0);
    await act(async () => texte(host).click());
    expect(clicks).toBe(1);
  });
});

describe('l’icône « Répondre » du pointeur fin (#8899)', () => {
  const bouton = (host: HTMLElement) => host.querySelector('button[data-message-swipe-reply]') as HTMLButtonElement | null;

  test('un bouton nommé « Répondre » arme la réponse, sans remonter jusqu’à la rangée', async () => {
    const journal: Journal = [];
    let rowSaw = 0;
    const host = await mounter.mount(
      <div onPointerDown={() => (rowSaw += 1)} onClick={() => (rowSaw += 1)}>
        <MessageSwipe actions={actionsOf(journal)} flat={false} isMine={false} attachments={undefined} createdAt="2026-09-30T09:41:00.000Z" locale="fr">
          <p>Bonjour</p>
        </MessageSwipe>
      </div>,
    );
    const button = bouton(host);
    expect(button?.getAttribute('aria-label')).toBe('Répondre');
    await act(async () => button?.dispatchEvent(pointer('pointerdown', 0, 0, 'mouse')));
    await act(async () => button?.click());
    expect(journal).toEqual(['reply']);
    expect(rowSaw).toBe(0);
  });

  test('il se pose au bord LIBRE : en fin de ligne pour un reçu, en début pour un envoyé', async () => {
    const received = await monte({ actions: actionsOf([]) });
    expect(bouton(received)?.getAttribute('data-edge')).toBe('end');
    mounter.unmountAll();
    const mine = await monte({ actions: actionsOf([]), isMine: true });
    expect(bouton(mine)?.getAttribute('data-edge')).toBe('start');
  });

  test('absent en sélection et pour un message qu’on ne peut pas citer', async () => {
    const selecting = await monte({ actions: undefined });
    expect(bouton(selecting)).toBeNull();
    mounter.unmountAll();
    const viewOnce = await monte({ actions: actionsOf([], { canReply: false, canForward: false }) });
    expect(bouton(viewOnce)).toBeNull();
  });

  test('son nom suit la langue d’interface (allemand : « Antworten »)', async () => {
    await loadInterfaceCatalog('de');
    document.documentElement.lang = 'de';
    try {
      const host = await monte({ actions: actionsOf([]) });
      expect(bouton(host)?.getAttribute('aria-label')).toBe('Antworten');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });
});
