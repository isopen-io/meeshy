import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ImposedReplyProtection } from '@meeshy/shared/utils/reply-protection-contagion';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { EPHEMERAL_AFTER_READ_SECONDS, type ComposeProtection } from '@/lib/send/compose-protection';
import type { ComposerDraftReport } from '@/lib/view/use-draft';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { Composer } from './composer';

/**
 * LA CONTAGION DE LA CITATION DANS LE COMPOSEUR (#8557, directive porteur
 * 2026-09-28) — répondre à un message flou rend la réponse floue, répondre à
 * un éphémère la rend éphémère (même mode), NON désactivable ; ce qui n'est
 * pas imposé s'ajoute ; retirer la citation rend l'état d'avant.
 */
describe('Composer — la contagion de la citation (#8557)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    ensureHappyDomRegistered();
    await loadInterfaceCatalog('fr');
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
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

  const replyTo = { author: 'Awa', excerpt: 'secret' };
  const blurredAfterRead: ImposedReplyProtection = { blurred: true, ephemeral: { kind: 'after-read' } };
  const blurredOnly: ImposedReplyProtection = { blurred: true, ephemeral: null };

  type Harness = {
    readonly sent: ComposeProtection[];
    readonly reports: ComposerDraftReport[];
    readonly render: (imposed: ImposedReplyProtection | undefined) => void;
  };

  const mount = (imposed: ImposedReplyProtection | undefined): Harness => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const sent: ComposeProtection[] = [];
    const reports: ComposerDraftReport[] = [];
    const onSend = (payload: { protection: ComposeProtection }) => sent.push(payload.protection);
    const onDraftChange = (report: ComposerDraftReport) => reports.push(report);
    const render = (next: ImposedReplyProtection | undefined) =>
      act(() => {
        root.render(
          <Composer
            onSend={onSend}
            onDraftChange={onDraftChange}
            preferred={['fr']}
            {...(next === undefined ? {} : { replyTo, onCancelReply: () => {}, imposedProtection: next })}
          />,
        );
      });
    render(imposed);
    return { sent, reports, render };
  };

  const button = (selector: string) => container.querySelector<HTMLButtonElement>(selector)!;
  const blur = () => button('[data-composer-blur]');
  const ephemeral = () => button('[data-composer-ephemeral]');

  const typeAndSend = (value: string) => {
    const field = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      button('[aria-label="Envoyer"]').click();
    });
  };

  test('réponse à un message flou + flamme-œil : bascules verrouillées, envoi flou + flamme-œil', () => {
    const harness = mount(blurredAfterRead);

    expect(blur().disabled).toBe(true);
    expect(blur().getAttribute('aria-pressed')).toBe('true');
    expect(blur().getAttribute('aria-label')).toBe('Flou imposé par le message cité');
    expect(ephemeral().disabled).toBe(true);
    expect(ephemeral().getAttribute('aria-pressed')).toBe('true');
    expect(ephemeral().getAttribute('aria-label')).toBe('Mode éphémère imposé par le message cité : Disparaît après lecture');

    act(() => {
      blur().click();
      ephemeral().click();
    });
    expect(container.querySelector('[data-composer-ephemeral-picker]')).toBeNull();

    typeAndSend('ma réponse');
    expect(harness.sent).toEqual([{ blurred: true, ephemeralSeconds: EPHEMERAL_AFTER_READ_SECONDS }]);
  });

  test('réponse contaminée par le flou : une durée s’AJOUTE', () => {
    const harness = mount(blurredOnly);
    expect(ephemeral().disabled).toBe(false);

    act(() => {
      ephemeral().click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-composer-ephemeral-picker] [aria-label="1 minute"]')!.click();
    });

    typeAndSend('ma réponse');
    expect(harness.sent).toEqual([{ ephemeralSeconds: 60, blurred: true }]);
  });

  test('retirer la citation rend l’état d’avant, et l’imposition n’atteint jamais la préférence', () => {
    const harness = mount(undefined);
    expect(blur().getAttribute('aria-pressed')).toBe('false');

    harness.render(blurredAfterRead);
    expect(blur().getAttribute('aria-pressed')).toBe('true');

    harness.render(undefined);
    expect(blur().disabled).toBe(false);
    expect(blur().getAttribute('aria-pressed')).toBe('false');
    expect(ephemeral().getAttribute('aria-pressed')).toBe('false');
    expect(harness.reports.every((report) => report.protection.blurred !== true && report.protection.ephemeralSeconds === undefined)).toBe(true);

    typeAndSend('sans citation');
    expect(harness.sent).toEqual([{}]);
  });

  test('réponse à un message ordinaire : rien d’imposé, rien de verrouillé', () => {
    const harness = mount({ blurred: false, ephemeral: null });
    expect(blur().disabled).toBe(false);
    expect(ephemeral().disabled).toBe(false);
    expect(blur().getAttribute('aria-label')).toBe('Activer le mode flou');

    typeAndSend('bonjour');
    expect(harness.sent).toEqual([{}]);
  });
});
