import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { composerRefills } from '@/lib/send/composer-refill';
import { useComposerAccess } from '@/lib/send/use-composer-access';
import type { SessionState } from '@/lib/api/session';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * **LE TEXTE D'UN ENVOI QUI N'EST PAS PARTI REVIENT DANS LE COMPOSEUR** (#20075)
 * — un envoi redirigé vers le tête-à-tête lisible qui échoue (ouverture,
 * vérification, envoi) rend son texte au champ de la conversation d'où il
 * partait, comme le composeur des commentaires rend un envoi refusé. Ce qu'on
 * a tapé entre-temps n'est jamais écrasé.
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

let root: Root;
let container: HTMLDivElement;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  composerRefills.setState({ refill: null });
});

const SESSION = { status: 'anonymous' } as unknown as SessionState;

type Sent = Parameters<Parameters<typeof Composer>[0]['onSend']>[0];

function ThreadComposer({ conversationId, onSend = () => {} }: { readonly conversationId: string; readonly onSend?: (payload: Sent) => void }) {
  const access = useComposerAccess({ session: SESSION, conversationId, conversation: undefined, viewer: { id: 'u-viewer', isAnonymous: false } });
  return <Composer onSend={onSend} preferred={['fr']} {...access} />;
}

const mount = (conversationId: string, onSend?: (payload: Sent) => void) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<ThreadComposer conversationId={conversationId} {...(onSend === undefined ? {} : { onSend })} />));
  return () => container.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
};

describe('Composer — le texte d’un envoi qui n’est pas parti revient (#20075)', () => {
  test('le champ vide reprend le texte rendu, une seule fois', () => {
    const field = mount('c-sealed');
    act(() => composerRefills.setState({ refill: { conversationId: 'c-sealed', text: 'On se voit ?', attachments: [], place: null } }));
    expect(field().value).toBe('On se voit ?');
    expect(composerRefills.getState().refill).toBeNull();
  });

  test('ce qu’on a tapé entre-temps reste, après le texte rendu', () => {
    const field = mount('c-sealed');
    act(() => {
      field().value = 'Tu es là ?';
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => composerRefills.setState({ refill: { conversationId: 'c-sealed', text: 'On se voit ?', attachments: [], place: null } }));
    expect(field().value).toBe('On se voit ?\nTu es là ?');
  });

  test('le texte rendu à une autre conversation ne touche pas ce champ', () => {
    const field = mount('c-other');
    act(() => composerRefills.setState({ refill: { conversationId: 'c-sealed', text: 'On se voit ?', attachments: [], place: null } }));
    expect(field().value).toBe('');
    expect(composerRefills.getState().refill).toEqual({ conversationId: 'c-sealed', text: 'On se voit ?', attachments: [], place: null });
  });

  test('les pièces et le lieu reviennent aussi : le prochain envoi les porte', () => {
    const sent: Sent[] = [];
    mount('c-sealed', (payload) => sent.push(payload));
    const photo = { localId: 'l-photo', file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }), kind: 'image', name: 'photo.jpg', size: 1 } as const;
    const place = { latitude: 48.85, longitude: 2.35 };
    act(() => composerRefills.setState({ refill: { conversationId: 'c-sealed', text: 'Regarde', attachments: [photo], place } }));
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click());
    expect(sent.map((payload) => [payload.text, payload.attachments.map((attachment) => attachment.localId), payload.place])).toEqual([['Regarde', ['l-photo'], place]]);
  });
});

