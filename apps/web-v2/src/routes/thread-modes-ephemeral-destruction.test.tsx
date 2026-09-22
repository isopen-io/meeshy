import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ConversationReadingModeSchema, type ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { DESTRUCTION_MS } from '@/lib/view/ephemeral-destruction';
import { noteEphemeralReception, resetEphemeralReception } from '@/lib/view/ephemeral-reception';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * **LA RANGÉE PASSE PAR « EN DESTRUCTION » AVANT DE PARTIR** (#7468, travail 2)
 * — dans TOUS les modes, et par le même chemin que la garde du chrome : c'est
 * l'hôte qui décide, les peaux ne savent rien de cette phase.
 *
 * Le lot #7454 coupait net : `deadlineReached` ⇒ la peau ne rendait plus rien.
 * Correct, et muet. Ce fichier mesure les trois faits qui font la différence :
 * la rangée reste MONTÉE pendant la fenêtre, elle porte la marque qui déclenche
 * l'effet, et elle disparaît UNE FOIS la fenêtre passée.
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
afterEach(() => {
  mounter.unmountAll();
  resetEphemeralReception();
});

const SECRET = 'Rendez-vous à 18 h devant la gare.';

const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm-brule',
    conversationId: 'c-destruction',
    senderId: 'u-bruno',
    content: SECRET,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 1,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-09-22T09:02:00.000Z'),
    updatedAt: new Date('2026-09-22T09:02:00.000Z'),
    timestamp: new Date('2026-09-22T09:02:00.000Z'),
    translations: [],
    sender: {
      id: 'p-u-bruno',
      conversationId: 'c-destruction',
      userId: 'u-bruno',
      displayName: 'Bruno Bêta',
      type: 'user' as const,
      role: 'member' as const,
      language: 'fr',
      permissions: {
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: true,
        canSendVideos: true,
        canSendAudios: true,
        canSendLocations: true,
        canSendLinks: true,
      },
      isActive: true,
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      isOnline: false,
    },
    ...partial,
  }) as Message;

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const virtualizerOf = (count: number): Virtualizer<HTMLElement, Element> =>
  ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: count }, (_unused, index) => ({
        index,
        start: index * 88,
        end: (index + 1) * 88,
        size: 88,
        key: index,
        lane: 0,
      })),
    measureElement: () => {},
  }) as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER: Viewer = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE: ThreadScene = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

const monte = async (mode: ConversationReadingMode, message: Message, destroyingIds?: ReadonlySet<string>) =>
  mounter.mount(
    <ThreadModes
      mode={mode}
      viewer={VIEWER}
      readerLocale="fr"
      placed={[placeOf(message)]}
      virtualizer={virtualizerOf(1)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
      {...(destroyingIds === undefined ? {} : { destroyingIds })}
    />,
  );

/** Les modes qui rendent des rangées — `summary` n'en rend aucune. */
const MODES_AVEC_RANGEES = ConversationReadingModeSchema.options.filter((mode) => mode !== 'summary');

for (const mode of MODES_AVEC_RANGEES) describe(`mode ${mode}`, () => {
  /**
   * Une échéance franchie À L'INSTANT, sans que personne ne l'ait annoncée :
   * c'est le cas NOMINAL — le lecteur regarde le fil et la minute tombe.
   */
  test('dans la fenêtre : la rangée reste MONTÉE et porte la marque de destruction', async () => {
    const message = messageOf({ id: 'm-brule', ephemeralDuration: 1 });
    noteEphemeralReception('m-brule', Date.now() - 1_000 - Math.floor(DESTRUCTION_MS / 2));
    const host = await monte(mode, message);

    const row = host.querySelector('[data-destroying]');
    expect(row).not.toBeNull();
    /* LA RANGÉE EST ENCORE LÀ, sinon il n'y aurait rien à faire brûler. */
    expect(host.textContent ?? '').toContain(SECRET);
  });

  test('passée la fenêtre : plus de marque, plus de contenu', async () => {
    const message = messageOf({ id: 'm-brule', ephemeralDuration: 1 });
    noteEphemeralReception('m-brule', Date.now() - 1_000 - DESTRUCTION_MS - 500);
    const host = await monte(mode, message);

    expect(host.querySelector('[data-destroying]')).toBeNull();
    expect(host.textContent ?? '').not.toContain(SECRET);
  });

  /**
   * `message:expired` peut arriver AVANT l'échéance locale. L'annonce doit
   * ouvrir la même fenêtre : sinon la rangée partirait sans effet, par le
   * chemin le plus fréquent une fois #7451 fusionné.
   */
  test('une destruction ANNONCÉE ouvre la fenêtre, même échéance encore à venir', async () => {
    const message = messageOf({ id: 'm-brule', ephemeralDuration: 600 });
    noteEphemeralReception('m-brule', Date.now());
    const host = await monte(mode, message, new Set(['m-brule']));

    expect(host.querySelector('[data-destroying]')).not.toBeNull();
    expect(host.textContent ?? '').toContain(SECRET);
  });

  test('un éphémère qui court n’est PAS en destruction', async () => {
    const message = messageOf({ id: 'm-brule', ephemeralDuration: 600 });
    noteEphemeralReception('m-brule', Date.now());
    const host = await monte(mode, message);

    expect(host.querySelector('[data-destroying]')).toBeNull();
    expect(host.textContent ?? '').toContain(SECRET);
  });
});
