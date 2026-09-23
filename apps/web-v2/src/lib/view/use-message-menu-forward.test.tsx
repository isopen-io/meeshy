import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useMessageMenu } from './use-message-menu';

/**
 * « TRANSFÉRER » ARME LA SÉLECTION (#5866, décision porteur #5989).
 *
 * Le porteur a tranché le 2026-09-23 : un tap sur « Transférer » entre en
 * mode SÉLECTION avec ce message DÉJÀ COCHÉ — ce n'est PAS un sélecteur de
 * conversations qui s'ouvre. Il a accepté le geste supplémentaire au cas
 * nominal pour que le même mot ait le même effet quelle que soit la porte
 * (dimension 6). Ces témoins gardent exactement cette phrase : après le menu,
 * la sélection existe et la feuille de destinataires n'est PAS ouverte.
 *
 * Et la VUE UNIQUE est refusée CÔTÉ CLIENT, avec un motif : `admitForward`
 * rejoue `admitMessageForward` avant l'aller-retour.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
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

type MenuApi = ReturnType<typeof useMessageMenu>;

const ordinary = (id: string): Message =>
  message({ id, senderId: 'u-other', content: `texte ${id}`, originalLanguage: 'fr', createdAt: minutesAgo(5), translations: [] });

const viewOnce = (id: string): Message =>
  message({
    id,
    senderId: 'u-other',
    content: 'secret',
    originalLanguage: 'fr',
    createdAt: minutesAgo(5),
    isViewOnce: true,
    translations: [],
  });

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(messages: readonly Message[]): { api: () => MenuApi; announced: string[] } {
  const announced: string[] = [];
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewerId: 'u-viewer',
      // #7377 — ce témoin garde le TRANSFERT, pas le favori. `false` le dit et
      // évite d'exiger ici un QueryClientProvider : l'état d'étoile d'un
      // message se LIT du serveur, donc `canStar: true` monterait une requête
      // qui n'a rien à voir avec ce qui est mesuré.
      canStar: false,
      onReply: () => {},
      announce: (text) => announced.push(text),
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      // #7378 — `useMessageMenu` lit l'état de favori par `useQuery`. Même
      // `enabled: false` (ce que pose `canStar: false` ci-dessus), le hook
      // exige un client dans l'arbre pour exister : `enabled` gouverne la
      // REQUÊTE, jamais la présence du fournisseur.
      <QueryClientProvider client={appQueryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    announced,
  };
}

const placedOf = (messages: readonly Message[]) => messages.map((m) => ({ message: { id: m.id } }));

describe('« Transférer » depuis le MENU — arme la sélection, n’ouvre aucun sélecteur', () => {
  test('la sélection démarre avec CE message coché', () => {
    const { api } = mount([ordinary('m1'), ordinary('m2')]);
    act(() => {
      api().onMenuAction('m1', 'forward');
    });
    expect(api().selection).toEqual({ ids: ['m1'] });
  });

  test('la feuille de destinataires reste FERMÉE — c’est la barre qui valide', () => {
    const { api } = mount([ordinary('m1')]);
    act(() => {
      api().onMenuAction('m1', 'forward');
    });
    expect(api().forwardIds).toBe(null);
  });
});

describe('« Transférer » depuis la BARRE — ouvre la feuille, ou refuse avec un motif', () => {
  test('une sélection ordinaire ouvre la feuille avec les ids, dans l’ordre du fil', () => {
    const messages = [ordinary('m1'), ordinary('m2')];
    const { api } = mount(messages);
    act(() => {
      api().onMenuAction('m2', 'forward');
    });
    act(() => {
      api().onRowTap('m1');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    expect(api().forwardIds).toEqual(['m1', 'm2']);
  });

  test('une VUE UNIQUE est REFUSÉE côté client, et le refus DIT pourquoi', () => {
    const messages = [viewOnce('m9')];
    const { api, announced } = mount(messages);
    act(() => {
      api().onMenuAction('m9', 'select');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    expect(api().forwardIds).toBe(null);
    expect(announced).toEqual(['Un message à vue unique ne peut pas être transféré']);
  });
});
