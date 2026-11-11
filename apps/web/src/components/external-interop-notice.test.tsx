import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';
import {
  EXTERNAL_INTEROP_DISCLOSURES,
  EXTERNAL_INTEROP_NOTICE_VERSION,
  type ExternalInteropConsentStatus,
} from '@meeshy/shared/types/external-interop-compliance';

import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ExternalInteropNotice } from './external-interop-notice';

/**
 * **CE QUI PART CHEZ META, ET LE CONSENTEMENT** (#17120) — l'écran dit la liste partagée avec la passerelle avant
 * toute réponse, la durée de conservation servie, n'écrit rien sans le geste « J'accepte », et dit chaque refus.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadExternalInteropCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const status = (overrides: Partial<ExternalInteropConsentStatus> = {}): ExternalInteropConsentStatus => ({
  network: 'whatsapp',
  noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION,
  disclosures: [...EXTERNAL_INTEROP_DISCLOSURES],
  retentionDays: 45,
  consent: null,
  current: false,
  ...overrides,
});

const CONSENTED = status({ consent: { grantedAt: '2026-11-10T09:00:00.000Z', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION }, current: true });

function harness(params: { readonly read?: () => Promise<ApiResult<ExternalInteropConsentStatus>>; readonly answer?: ApiResult<ExternalInteropConsentStatus> } = {}) {
  const recorded: boolean[] = [];
  const consented: ExternalInteropConsentStatus[] = [];
  const cancelled: number[] = [];
  const element = (
    <ExternalInteropNotice
      language="fr"
      read={params.read ?? (async () => ({ ok: true, data: status() }))}
      record={async (granted) => {
        recorded.push(granted);
        return params.answer ?? { ok: true, data: CONSENTED };
      }}
      onConsented={(value) => consented.push(value)}
      onCancel={() => cancelled.push(1)}
    />
  );
  return { element, recorded, consented, cancelled };
}

describe('l’écran d’information sur ce qui part chez Meta', () => {
  test('dit chaque élément de la liste partagée, et la durée de conservation servie par la passerelle', async () => {
    const run = harness();
    const host = await mounter.mount(run.element);

    const items = [...host.ownerDocument.querySelectorAll('[data-external-interop-disclosure]')].map((node) => node.getAttribute('data-external-interop-disclosure'));
    expect(items).toEqual([...EXTERNAL_INTEROP_DISCLOSURES]);
    expect(host.ownerDocument.querySelector('[data-external-interop-retention]')?.textContent).toContain('45 jours');
  });

  test('sans réponse de la passerelle, la liste s’affiche quand même et la durée se dit « limitée »', async () => {
    const run = harness({ read: () => new Promise(() => undefined) });
    const host = await mounter.mount(run.element);

    expect(host.ownerDocument.querySelectorAll('[data-external-interop-disclosure]').length).toBe(EXTERNAL_INTEROP_DISCLOSURES.length);
    expect(host.ownerDocument.querySelector('[data-external-interop-retention]')?.textContent).toContain('durée limitée');
  });

  test('« J’accepte et je continue » enregistre le consentement, puis rend la main avec l’état servi', async () => {
    const run = harness();
    const host = await mounter.mount(run.element);

    await mounter.click(buttonNamed(host.ownerDocument.body, 'J’accepte et je continue'));

    expect(run.recorded).toEqual([true]);
    expect(run.consented).toEqual([CONSENTED]);
  });

  test('« Annuler » n’écrit rien', async () => {
    const run = harness();
    const host = await mounter.mount(run.element);

    await mounter.click(buttonNamed(host.ownerDocument.body.querySelector('[data-external-interop-notice]') ?? host, 'Annuler'));

    expect(run.cancelled.length).toBe(1);
    expect(run.recorded).toEqual([]);
  });

  test('un consentement déjà donné sous la version en vigueur ne redemande rien', async () => {
    const run = harness({ read: async () => ({ ok: true, data: CONSENTED }) });
    await mounter.mount(run.element);

    expect(run.consented).toEqual([CONSENTED]);
    expect(run.recorded).toEqual([]);
  });

  const REFUSALS: ReadonlyArray<readonly [string, ApiResult<ExternalInteropConsentStatus>, string]> = [
    ['une information périmée', { ok: false, status: 409, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.NOTICE_OUTDATED }, 'outdated'],
    ['un serveur éteint', { ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED }, 'unavailable'],
    ['une panne', { ok: false, status: 500, error: 'x' }, 'failed'],
  ];
  for (const [label, answer, expected] of REFUSALS) {
    test(`${label} : le refus se dit, et rien ne rend la main`, async () => {
      const run = harness({ answer });
      const host = await mounter.mount(run.element);

      await mounter.click(buttonNamed(host.ownerDocument.body, 'J’accepte et je continue'));

      expect(host.ownerDocument.querySelector('[role="alert"]')?.getAttribute('data-external-interop-answer')).toBe(expected);
      expect(run.consented).toEqual([]);
    });
  }
});
