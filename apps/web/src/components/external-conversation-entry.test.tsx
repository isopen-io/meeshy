import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';

import { EXTERNAL_INTEROP_DISCLOSURES, EXTERNAL_INTEROP_NOTICE_VERSION, type ExternalInteropConsentStatus } from '@meeshy/shared/types/external-interop-compliance';

import type { ApiResult } from '@/lib/api/http';
import type { ExternalOpening } from '@/lib/external-conversation/external-conversation';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';
import { loadExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ExternalConversationEntry } from './external-conversation-entry';
import type { PhoneCodeDeps } from './phone-code-form';

/**
 * **« ÉCRIRE À UN AMI WHATSAPP »** (#17118) — ce que la bibliothèque ne prouve
 * pas (`lib/external-conversation/external-conversation.test.ts` tient la
 * visibilité, le numéro et les issues) : que l'entrée n'existe pas quand l'hôte
 * la dit invisible, que le chemin nominal tient en deux gestes après la saisie,
 * qu'un numéro mal formé ne part jamais, et que chaque refus se DIT — le numéro
 * non vérifié offrant la vérification sur place.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadExternalConversationCatalog('fr');
  await loadExternalInteropCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const PHONE: PhoneCodeDeps = {
  requestPhoneCode: async () => ({ ok: true, data: {} }),
  verifyPhoneCode: async () => ({ ok: true, data: {} }),
};

const OPENED: ApiResult<ExternalOpening> = {
  ok: true,
  data: { conversationId: '6730c0ffee0000000000abcd', type: 'external', encryptionMode: 'e2ee', network: 'whatsapp', created: true },
};

const consentStatus = (current: boolean): ExternalInteropConsentStatus => ({
  network: 'whatsapp',
  noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION,
  disclosures: [...EXTERNAL_INTEROP_DISCLOSURES],
  retentionDays: 90,
  consent: current ? { grantedAt: '2026-11-10T09:00:00.000Z', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION } : null,
  current,
});

function harness(
  answer: ApiResult<ExternalOpening> | readonly ApiResult<ExternalOpening>[] = OPENED,
  options: { readonly visible?: boolean; readonly online?: boolean } = {},
) {
  const sent: string[] = [];
  const opened: string[] = [];
  const recorded: boolean[] = [];
  const answers = Array.isArray(answer) ? [...answer] : [answer];
  const element = (
    <ExternalConversationEntry
      visible={options.visible ?? true}
      language="fr"
      online={options.online ?? true}
      open={async (handle) => {
        sent.push(handle);
        return answers.length > 1 ? (answers.shift() ?? OPENED) : (answers[0] ?? OPENED);
      }}
      phone={PHONE}
      consent={{
        read: async () => ({ ok: true, data: consentStatus(false) }),
        record: async (granted) => {
          recorded.push(granted);
          return { ok: true, data: consentStatus(true) };
        },
      }}
      onOpened={(conversationId) => opened.push(conversationId)}
    />
  );
  return { sent, opened, recorded, element };
}

const writeNumber = async (host: HTMLDivElement, value: string) => {
  await mounter.click(host.querySelector<HTMLElement>('[data-external-conversation-toggle]'));
  mounter.type(host, 'input[type="tel"]', value);
};

describe('l’entrée n’existe que là où l’hôte la rend visible', () => {
  test('invisible : rien n’est rendu', async () => {
    const host = await mounter.mount(harness(OPENED, { visible: false }).element);
    expect(host.querySelector('[data-external-conversation-entry]')).toBeNull();
  });

  test('visible : une rangée qui se déplie, nommée et annoncée', async () => {
    const host = await mounter.mount(harness().element);
    const toggle = host.querySelector('[data-external-conversation-toggle]');
    expect(toggle?.textContent).toContain('Écrire à un ami WhatsApp');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await mounter.click(toggle as HTMLElement);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('label')?.textContent).toBe('Numéro WhatsApp de votre ami');
  });

  test('elle dit, avant l’envoi, que la conversation sera chiffrée et sans les fonctions qui lisent le clair', async () => {
    const host = await mounter.mount(harness().element);
    await mounter.click(host.querySelector<HTMLElement>('[data-external-conversation-toggle]'));
    expect(host.querySelector('[data-external-conversation-encrypted]')?.textContent).toContain('Chiffré de bout en bout');
  });
});

describe('le chemin nominal', () => {
  test('le numéro part en E.164 et le fil s’ouvre', async () => {
    const { sent, opened, element } = harness();
    const host = await mounter.mount(element);
    await writeNumber(host, '+33 6 12 34 56 78');
    await mounter.submit(host);
    expect(sent).toEqual(['+33612345678']);
    expect(opened).toEqual(['6730c0ffee0000000000abcd']);
  });

  test('un numéro mal formé ne part pas et le champ le dit', async () => {
    const { sent, element } = harness();
    const host = await mounter.mount(element);
    await writeNumber(host, '06 12 34 56 78');
    await mounter.submit(host);
    expect(sent).toEqual([]);
    expect(host.querySelector('input[type="tel"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('format international');
  });
});

describe('le consentement à ce qui part chez Meta (#17120)', () => {
  test('sans consentement, l’information se montre ; accepter l’enregistre puis ouvre le fil', async () => {
    const consentRequired: ApiResult<ExternalOpening> = { ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.CONSENT_REQUIRED };
    const { sent, opened, recorded, element } = harness([consentRequired, OPENED]);
    const host = await mounter.mount(element);
    await writeNumber(host, '+33612345678');
    await mounter.submit(host);

    expect(opened).toEqual([]);
    expect(host.ownerDocument.querySelector('[data-external-interop-notice]')).not.toBeNull();

    await mounter.click(buttonNamed(host.ownerDocument.body, 'J’accepte et je continue'));

    expect(recorded).toEqual([true]);
    expect(sent).toEqual(['+33612345678', '+33612345678']);
    expect(opened).toEqual(['6730c0ffee0000000000abcd']);
  });

  test('annuler l’information n’écrit rien et n’ouvre rien', async () => {
    const consentRequired: ApiResult<ExternalOpening> = { ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.CONSENT_REQUIRED };
    const { opened, recorded, element } = harness([consentRequired, OPENED]);
    const host = await mounter.mount(element);
    await writeNumber(host, '+33612345678');
    await mounter.submit(host);

    await mounter.click(buttonNamed(host.ownerDocument.body.querySelector('[data-external-interop-notice]') ?? host, 'Annuler'));

    expect(recorded).toEqual([]);
    expect(opened).toEqual([]);
    expect(host.ownerDocument.querySelector('[data-external-interop-notice]')).toBeNull();
  });
});

describe('chaque refus se dit', () => {
  test('numéro non vérifié : la vérification par SMS est offerte sur place', async () => {
    const { opened, element } = harness({ ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.PHONE_UNVERIFIED });
    const host = await mounter.mount(element);
    await writeNumber(host, '+33612345678');
    await mounter.submit(host);
    expect(opened).toEqual([]);
    const notice = host.querySelector('[data-external-conversation-outcome="phone-unverified"]');
    expect(notice?.textContent).toContain('Vérifiez votre numéro');
    expect(buttonNamed(host, 'Ajouter mon numéro')).not.toBeNull();
  });

  test('porte fermée, plafond, débit : un message, jamais un écran muet', async () => {
    const cases: ReadonlyArray<readonly [ApiResult<ExternalOpening>, string, string]> = [
      [{ ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED }, 'disabled', 'pas encore disponible'],
      [{ ok: false, status: 409, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.LIMIT_REACHED }, 'limit', 'Fermez-en une'],
      [{ ok: false, status: 429, error: 'x' }, 'rate-limited', 'Réessayez dans une heure'],
      [{ ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.END_TO_END_RESERVED }, 'reserved', 'phase de test'],
    ];
    for (const [answer, reason, words] of cases) {
      const { opened, element } = harness(answer);
      const host = await mounter.mount(element);
      await writeNumber(host, '+33612345678');
      await mounter.submit(host);
      expect(opened).toEqual([]);
      const notice = host.querySelector(`[data-external-conversation-outcome="${reason}"]`);
      expect({ reason, role: notice?.getAttribute('role'), says: notice?.textContent?.includes(words) }).toEqual({ reason, role: 'alert', says: true });
      mounter.unmountAll();
    }
  });

  test('hors ligne, la cause est le réseau', async () => {
    const { element } = harness({ ok: false, status: 0, error: 'network' }, { online: false });
    const host = await mounter.mount(element);
    await writeNumber(host, '+33612345678');
    await mounter.submit(host);
    expect(host.querySelector('[data-external-conversation-outcome="offline"]')?.textContent).toContain('Hors ligne');
  });
});

describe('la langue de l’interface', () => {
  test('changer de langue redit l’entrée dans la nouvelle langue', async () => {
    const { element } = harness();
    const host = await mounter.mount(element);
    expect(host.querySelector('[data-external-conversation-toggle]')?.textContent).toContain('Écrire à un ami WhatsApp');
    await mounter.rerender(host, <ExternalConversationEntry {...element.props} language="en" />);
    expect(host.querySelector('[data-external-conversation-toggle]')?.textContent).toContain('Write to a friend on WhatsApp');
  });
});
