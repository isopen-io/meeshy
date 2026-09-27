import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createEmailGate, type EmailGate } from './email-gate';
import { useEmailGatePresenter } from './email-gate-presenter';

/**
 * **LA COQUILLE PRÉSENTE LA DEMANDE** (#8365) — montée, elle s'attache comme
 * présentateur (une demande attend alors sa vue au lieu d'être refusée) et
 * rend la raison en cours ; démontée, elle se détache.
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
afterEach(() => mounter.unmountAll());

function Probe({ gate }: { readonly gate: EmailGate }) {
  const reason = useEmailGatePresenter(gate);
  return <p data-reason={reason ?? 'none'} />;
}

describe('useEmailGatePresenter', () => {
  test('monté ⇒ la demande attend et sa raison est rendue ; tranchée ⇒ plus rien', async () => {
    const gate = createEmailGate();
    const host = await mounter.mount(<Probe gate={gate} />);

    const answer = gate.ask('publish');
    await mounter.settle();
    expect(host.querySelector('p')?.getAttribute('data-reason')).toBe('publish');

    gate.settle(true);
    await mounter.settle();
    expect(await answer).toBe(true);
    expect(host.querySelector('p')?.getAttribute('data-reason')).toBe('none');
  });

  test('démonté ⇒ la demande en cours est refusée', async () => {
    const gate = createEmailGate();
    await mounter.mount(<Probe gate={gate} />);
    const answer = gate.ask('link');

    mounter.unmountAll();

    expect(await answer).toBe(false);
  });
});
