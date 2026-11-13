import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { EXTERNAL_REPORT_ORIENTATION, type ExternalReportAcknowledgement } from '@meeshy/shared/types/external-interop-compliance';

import type { ExternalReportDraft } from '@/lib/api/external-interop-compliance';
import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ExternalContentReportSheet } from './external-content-report-sheet';

/**
 * **SIGNALER UN CONTENU WHATSAPP** (#17120) — le texte ne part que si la personne le joint, le blocage est proposé
 * par défaut, le motif est obligatoire, et l'accusé oriente vers le signalement de Meta.
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

const MESSAGE = 'texte-fictif-du-message';

function harness(params: { readonly messageText?: string; readonly answer?: ApiResult<ExternalReportAcknowledgement> } = {}) {
  const sent: ExternalReportDraft[] = [];
  const element = (
    <ExternalContentReportSheet
      language="fr"
      messageText={params.messageText}
      report={async (draft) => {
        sent.push(draft);
        return params.answer ?? { ok: true, data: { reportId: 'r-1', peerBlocked: true, orientation: EXTERNAL_REPORT_ORIENTATION } };
      }}
      onClose={() => undefined}
    />
  );
  return { element, sent };
}

const q = (selector: string): HTMLElement | null => document.body.querySelector<HTMLElement>(selector);

describe('la feuille de signalement d’un contenu WhatsApp', () => {
  test('sans motif, rien ne part', async () => {
    const run = harness({ messageText: MESSAGE });
    await mounter.mount(run.element);

    expect((q('[data-external-report-submit]') as HTMLButtonElement).disabled).toBe(true);
  });

  test('par défaut, aucun texte du message ne part, et le contact est bloqué', async () => {
    const run = harness({ messageText: MESSAGE });
    await mounter.mount(run.element);

    await mounter.click(q('[data-external-report-reason="harassment"]'));
    await mounter.submit(document.body.querySelector('[data-external-report]') ?? document.body);

    expect(run.sent).toEqual([{ reason: 'harassment', blockPeer: true }]);
    expect(JSON.stringify(run.sent)).not.toContain(MESSAGE);
  });

  test('le texte part seulement si la personne coche « Joindre le texte du message »', async () => {
    const run = harness({ messageText: MESSAGE });
    await mounter.mount(run.element);

    await mounter.click(q('[data-external-report-reason="spam"]'));
    await mounter.click(q('[data-external-report-attach]'));
    await mounter.click(q('[data-external-report-block]'));
    await mounter.submit(document.body.querySelector('[data-external-report]') ?? document.body);

    expect(run.sent).toEqual([{ reason: 'spam', blockPeer: false, disclosedText: MESSAGE }]);
  });

  test('sans texte déchiffré à joindre, la case n’est pas offerte', async () => {
    const run = harness();
    await mounter.mount(run.element);

    expect(q('[data-external-report-attach]')).toBeNull();
  });

  test('l’accusé dit le blocage et oriente vers le signalement de Meta', async () => {
    const run = harness({ messageText: MESSAGE });
    await mounter.mount(run.element);

    await mounter.click(q('[data-external-report-reason="violence"]'));
    await mounter.submit(document.body.querySelector('[data-external-report]') ?? document.body);

    expect(q('[data-external-report-blocked]')).not.toBeNull();
    expect(q('[data-external-report-orientation]')?.getAttribute('data-external-report-orientation')).toBe(EXTERNAL_REPORT_ORIENTATION);
    expect(q('[data-external-report-orientation]')?.textContent).toContain('Meta');
  });

  test('un pair déjà effacé n’est pas dit bloqué', async () => {
    const run = harness({ answer: { ok: true, data: { reportId: 'r-2', peerBlocked: false, orientation: EXTERNAL_REPORT_ORIENTATION } } });
    await mounter.mount(run.element);

    await mounter.click(q('[data-external-report-reason="other"]'));
    await mounter.submit(document.body.querySelector('[data-external-report]') ?? document.body);

    expect(q('[data-external-report-blocked]')).toBeNull();
    expect(q('[data-external-report-orientation]')).not.toBeNull();
  });

  test('un échec se dit, et la feuille reste ouverte pour réessayer', async () => {
    const run = harness({ answer: { ok: false, status: 500, error: 'x' } });
    await mounter.mount(run.element);

    await mounter.click(q('[data-external-report-reason="spam"]'));
    await mounter.submit(document.body.querySelector('[data-external-report]') ?? document.body);

    expect(q('[data-external-report-failed]')).not.toBeNull();
    expect(q('[data-external-report-submit]')).not.toBeNull();
  });
});
