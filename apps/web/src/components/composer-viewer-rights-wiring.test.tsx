import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { DEFAULT_USER_PERMISSIONS, type ParticipantPermissions } from '@meeshy/shared/types/participant';

import type { Conversation } from '@/lib/api/types';
import type { SessionState } from '@/lib/api/session';
import type { Viewer } from '@/lib/api/viewer';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { useComposerAccess } from '@/lib/send/use-composer-access';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * **LE TIROIR D'UN VISITEUR SANS COMPTE RESPECTE SES DROITS** (#20264) — sa
 * ligne de participation est nommée par son `Participant.id`
 * (`viewer.isAnonymous`), jamais par un `userId` qu'il n'a pas. Cherchée sur la
 * seule colonne `userId`, elle était INTROUVABLE : `Composer` recevait
 * `rights: undefined`, que son contrat lit « tout est autorisé », et les tuiles
 * s'offraient à qui l'hôte les avait retirées.
 *
 * Le témoin passe par le PIXEL — la tuile rendue — et non par le champ : ce qui
 * compte est que le geste disparaisse (loi 4, cycle 123).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  /* Les deux `lazy()` du composeur sont pré-résolus : sinon l'attente d'une
     tuile mesure le cache de modules du processus, pas le composeur. */
  await Promise.all([import('./composer-tray'), import('./composer-emoji-sheet')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const CONVERSATION_ID = 'c-partage';
const GUEST_ROW_ID = 'p-invite';

/** Un invité d'un lien SANS familles (`attachmentKinds` absent, lien ordinaire) : ce sont ses DROITS qui gouvernent. */
const GUEST_SESSION = {
  status: 'guest',
  sessionToken: 'tok',
  guest: { participantId: GUEST_ROW_ID, nickname: 'Dadju', conversationId: CONVERSATION_ID, link: 'mshy_abc', mayWrite: true },
} as unknown as SessionState;

const GUEST_VIEWER: Pick<Viewer, 'id' | 'isAnonymous'> = { id: GUEST_ROW_ID, isAnonymous: true };
const ACCOUNT_VIEWER: Pick<Viewer, 'id' | 'isAnonymous'> = { id: 'u-viewer', isAnonymous: false };

const conversationWith = (rows: readonly { readonly id: string; readonly userId?: string; readonly permissions: ParticipantPermissions }[]): Conversation =>
  ({ id: CONVERSATION_ID, type: 'public', title: 'Partage', participants: rows }) as unknown as Conversation;

const CLOSED: ParticipantPermissions = { ...DEFAULT_USER_PERMISSIONS, canSendImages: false, canSendVideos: false };

function Host({ viewer, conversation }: { readonly viewer: Pick<Viewer, 'id' | 'isAnonymous'>; readonly conversation: Conversation }) {
  const access = useComposerAccess({ session: GUEST_SESSION, conversationId: CONVERSATION_ID, conversation, viewer });
  return <Composer onSend={() => undefined} preferred={['fr']} {...access} />;
}

async function sourcesOf(viewer: Pick<Viewer, 'id' | 'isAnonymous'>, conversation: Conversation): Promise<readonly string[]> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Host viewer={viewer} conversation={conversation} />);
  });
  const plus = container.querySelector<HTMLButtonElement>('button[aria-label="Ouvrir le menu des pièces jointes"]');
  if (plus === null) throw new Error('Aucun « + » dans le composeur');
  await act(async () => {
    plus.click();
  });
  for (let turn = 0; turn < 50 && container.querySelector('[data-composer-source]') === null; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return Array.from(container.querySelectorAll('[data-composer-source]')).map((node) => node.getAttribute('data-composer-source') ?? '');
}

describe('le tiroir du composeur lit la ligne du lecteur sur la colonne de sa clé (#20264)', () => {
  test('un visiteur SANS COMPTE à qui l’hôte a retiré photos et vidéos ne voit pas leurs tuiles', async () => {
    const sources = await sourcesOf(GUEST_VIEWER, conversationWith([{ id: 'p-hote', userId: 'u-hote', permissions: DEFAULT_USER_PERMISSIONS }, { id: GUEST_ROW_ID, permissions: CLOSED }]));
    expect(sources).not.toContain('photo');
    expect(sources).not.toContain('camera');
  });

  test('et il garde celles qu’on ne lui a pas retirées', async () => {
    const sources = await sourcesOf(GUEST_VIEWER, conversationWith([{ id: GUEST_ROW_ID, permissions: CLOSED }]));
    expect(sources).toContain('file');
  });

  test('un inscrit n’est pas confondu avec une ligne d’invité : sa colonne reste `userId`', async () => {
    const sources = await sourcesOf(ACCOUNT_VIEWER, conversationWith([{ id: 'u-viewer', permissions: CLOSED }, { id: 'p-1', userId: 'u-viewer', permissions: DEFAULT_USER_PERMISSIONS }]));
    expect(sources).toContain('photo');
  });

  test('une ligne non servie (au-delà du plafond du détail) laisse le composeur ouvert — la passerelle reste l’autorité', async () => {
    const sources = await sourcesOf(GUEST_VIEWER, conversationWith([{ id: 'p-autre', userId: 'u-autre', permissions: CLOSED }]));
    expect(sources).toContain('photo');
  });
});
