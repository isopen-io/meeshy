import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { SERVER_MESSAGE_MAX_LENGTH } from '@/lib/send/paste-route';

import { Composer } from './composer';

/**
 * #9037 — LE COLLAGE DANS LE CHAMP DU COMPOSER, par son geste réel : un
 * événement `paste` sur le `<textarea>`, puis l'envoi. Ce qui part est ce que
 * reçoit `onSend` — la seule chose que la passerelle verra.
 */
describe('Composer — ce qu’on colle part toujours (#9037)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  type Sent = { readonly text: string; readonly attachments: readonly { readonly name: string; readonly file: File }[] };

  const mount = (onSend: (payload: Sent) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} />);
    });
    return container;
  };

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const paste = (field: HTMLTextAreaElement, content: { readonly files?: readonly File[]; readonly text?: string }): Event => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    const files = content.files ?? [];
    Object.defineProperty(event, 'clipboardData', {
      value: { files, items: [], getData: (type: string) => (type === 'text/plain' ? (content.text ?? '') : '') },
    });
    act(() => {
      field.dispatchEvent(event);
    });
    return event;
  };

  const typeInto = (field: HTMLTextAreaElement, value: string) => {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const sendNow = (el: HTMLElement) => {
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
  };

  test('une image collée devient la pièce jointe — ni son nom ni son chemin dans le texte', async () => {
    let sent: Sent | null = null;
    const el = mount((payload) => {
      sent = payload;
    });
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    const image = new File([new Uint8Array([1, 2, 3])], 'capture.png', { type: 'image/png' });
    const event = paste(field, { files: [image], text: '/Users/awa/Desktop/capture.png' });
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe('');
    sendNow(el);
    expect(sent).not.toBeNull();
    expect(sent!.text).toBe('');
    expect(sent!.attachments.map((a) => a.file)).toEqual([image]);
  });

  test('un texte qui ferait dépasser la limite part en .txt, le champ reste intact', async () => {
    let sent: Sent | null = null;
    const el = mount((payload) => {
      sent = payload;
    });
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    typeInto(field, 'Voici le journal :');
    const long = 'L'.repeat(SERVER_MESSAGE_MAX_LENGTH);
    const event = paste(field, { text: long });
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe('Voici le journal :');
    sendNow(el);
    expect(sent!.text).toBe('Voici le journal :');
    expect(sent!.attachments).toHaveLength(1);
    const [attached] = sent!.attachments;
    expect(attached?.name).toMatch(/^texte-colle-\d{8}-\d{6}\.txt$/);
    expect(attached?.file.type).toBe('text/plain;charset=utf-8');
    expect(await attached?.file.text()).toBe(long);
  });

  test('un texte qui tient est laissé au navigateur : aucun preventDefault, aucune pièce', async () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    const event = paste(field, { text: 'Bonjour' });
    await flush();

    expect(event.defaultPrevented).toBe(false);
    expect(el.querySelector('[role="group"][aria-label="Pièces jointes en attente"]')).toBeNull();
  });
});
