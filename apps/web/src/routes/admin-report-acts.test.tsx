import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import { sessionStore, type AuthenticatedSession } from '@/lib/api/session';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminReportActBar } from './admin-report-acts';

/** UN SIGNALEMENT SE TRAITE EN UN GESTE (#10394) — l'acte et la clôture partent ensemble, en deux gestes au plus. */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr'] });
const REPORT = '64f1c2a9e8b7d6c5b4a39281';
const ME = '64f1c2a9e8b7d6c5b4a39201';
const OTHER = '64f1c2a9e8b7d6c5b4a39202';

const asMe = () =>
  sessionStore.setState({
    session: { status: 'authenticated', token: 'jwt', sessionToken: 's', expiresAt: Number.MAX_SAFE_INTEGER, user: { id: ME, username: 'moi', displayName: 'Moi' } } as unknown as AuthenticatedSession,
  });

function depsOf(answer: ApiResult<unknown>) {
  const calls: HttpRequest[] = [];
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      return answer as ApiResult<T>;
    },
  });
  return { deps: { source: 'gateway', transport } satisfies AdminDeps, calls };
}

const click = async (element: Element | null) => {
  await act(async () => (element as HTMLElement | null)?.click());
  await mounter.settle();
};

describe('traiter un signalement en un geste', () => {
  test('une publication signalée offre « Mettre hors ligne », « Mettre en privé », « Classer » ; un commentaire, « Retirer le commentaire »', async () => {
    const { deps } = depsOf({ ok: true, data: {} });
    const host = await mount(
      <>
        <AdminReportActBar language="fr" report={{ id: REPORT, reportedType: 'post', status: 'pending' }} onAnnounce={() => undefined} deps={deps} />
        <AdminReportActBar language="fr" report={{ id: 'c', reportedType: 'comment', status: 'pending' }} onAnnounce={() => undefined} deps={deps} />
        <AdminReportActBar language="fr" report={{ id: 'r', reportedType: 'post', status: 'resolved' }} onAnnounce={() => undefined} deps={deps} />
      </>,
      adminIdentityFixture({ role: 'BIGBOSS' }),
    );
    expect([...host.querySelectorAll(`[data-admin-report-acts="${REPORT}"] [data-admin-report-act]`)].map((b) => b.textContent)).toEqual(['Mettre hors ligne', 'Mettre en privé', 'Classer']);
    expect(host.querySelector('[data-admin-report-acts="c"] [data-admin-report-act="remove-comment"]')?.textContent).toBe('Retirer le commentaire');
    expect(host.querySelector('[data-admin-report-acts="r"]')).toBeNull();
  });

  test('au rang souverain : un appui, une confirmation, et l’acte part avec la clôture', async () => {
    const { deps, calls } = depsOf({ ok: true, data: { report: { id: REPORT, status: 'resolved' }, target: null } });
    const host = await mount(<AdminReportActBar language="fr" report={{ id: REPORT, reportedType: 'post', status: 'pending' }} onAnnounce={() => undefined} deps={deps} />, adminIdentityFixture({ role: 'BIGBOSS' }));
    await click(host.querySelector('[data-admin-report-act="take-offline"]'));
    expect(document.querySelector('[data-admin-confirm]')?.textContent).toContain('la personne qui a signalé reçoit une réponse');
    await click(document.querySelector('[data-admin-action="confirm"]'));
    expect(calls[0]?.path).toBe(`/api/v1/admin/reports/${REPORT}/act`);
    expect(calls[0]?.body).toEqual({ action: 'take-offline' });
  });

  test('hors du rang souverain, le motif est demandé et part avec l’acte', async () => {
    const { deps, calls } = depsOf({ ok: true, data: { report: { id: REPORT, status: 'dismissed' }, target: null } });
    const host = await mount(<AdminReportActBar language="fr" report={{ id: REPORT, reportedType: 'user', status: 'pending' }} onAnnounce={() => undefined} deps={deps} />, adminIdentityFixture({ role: 'MODERATOR' }));
    await click(host.querySelector('[data-admin-report-act="dismiss"]'));
    mounter.type(document, '[data-admin-motive]', 'Non fondé');
    await click(document.querySelector('[data-admin-action="confirm"]'));
    expect(calls[0]?.body).toEqual({ action: 'dismiss', reason: 'Non fondé' });
  });
});

describe('un signalement qui vise le lecteur ne se traite pas par lui (#10458)', () => {
  test('les boutons se désactivent, et le motif se lit', async () => {
    asMe();
    const { deps, calls } = depsOf({ ok: true, data: {} });
    const host = await mount(
      <>
        <AdminReportActBar language="fr" report={{ id: REPORT, reportedType: 'post', reportedEntityId: 'p', reportedEntity: { owner: { id: ME } }, status: 'pending' }} onAnnounce={() => undefined} deps={deps} />
        <AdminReportActBar language="fr" report={{ id: 'u', reportedType: 'user', reportedEntityId: ME, reportedEntity: null, status: 'pending' }} onAnnounce={() => undefined} deps={deps} />
        <AdminReportActBar language="fr" report={{ id: 'o', reportedType: 'comment', reportedEntityId: 'c', reportedEntity: { owner: { id: OTHER } }, status: 'pending' }} onAnnounce={() => undefined} deps={deps} />
      </>,
      adminIdentityFixture({ role: 'MODERATOR' }),
    );
    const mine = [...host.querySelectorAll(`[data-admin-report-acts="${REPORT}"] [data-admin-report-act]`)] as HTMLButtonElement[];
    expect(mine.map((button) => button.disabled)).toEqual([true, true, true]);
    expect(host.querySelector(`[data-admin-report-acts="${REPORT}"] [data-admin-report-self]`)?.textContent).toBe('Ce signalement vise votre propre contenu : un autre modérateur le traitera.');
    expect(host.querySelector(`[data-admin-report-acts="${REPORT}"]`)?.getAttribute('aria-describedby')).toBe(host.querySelector(`[data-admin-report-acts="${REPORT}"] [data-admin-report-self]`)?.id);
    expect((host.querySelector('[data-admin-report-acts="u"] [data-admin-report-act="dismiss"]') as HTMLButtonElement).disabled).toBe(true);
    expect((host.querySelector('[data-admin-report-acts="o"] [data-admin-report-act="dismiss"]') as HTMLButtonElement).disabled).toBe(false);
    expect(host.querySelector('[data-admin-report-acts="o"] [data-admin-report-self]')).toBeNull();
    await click(mine[2] ?? null);
    expect(document.querySelector('[data-admin-confirm]')).toBeNull();
    expect(calls).toHaveLength(0);
    sessionStore.setState({ session: { status: 'anonymous' } });
  });
});
