import { act } from 'react';
import { expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminCommentRemoval } from './admin-comment-removal';

/** RETIRER UN COMMENTAIRE DEPUIS LA FICHE (#10394) — un appui, la confirmation, la passerelle reçoit le retrait. */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr'] });
const COMMENT = '64f1c2a9e8b7d6c5b4a39281';

const CASES: readonly { readonly role: 'BIGBOSS' | 'MODERATOR'; readonly motive?: string; readonly body: Record<string, string> }[] = [
  { role: 'BIGBOSS', body: {} },
  { role: 'MODERATOR', motive: 'Harcèlement', body: { reason: 'Harcèlement' } },
];

for (const { role, motive, body } of CASES) test(`${role} : « Retirer » puis confirmer envoie le retrait`, async () => {
  const calls: HttpRequest[] = [];
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: '' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      return { ok: true, data: { commentId: COMMENT, removedAt: '2026-10-13T00:00:00.000Z' } } as ApiResult<T>;
    },
  });
  const host = await mount(<AdminCommentRemoval language="fr" commentId={COMMENT} onAnnounce={() => undefined} deps={{ source: 'gateway', transport }} />, adminIdentityFixture({ role }));
  await act(async () => host.querySelector<HTMLElement>(`[data-admin-comment-remove="${COMMENT}"]`)?.click());
  await mounter.settle();
  expect(document.querySelector('[data-admin-confirm]')?.textContent).toContain('ses réponses');
  if (motive !== undefined) mounter.type(document, '[data-admin-motive]', motive);
  await act(async () => document.querySelector<HTMLElement>('[data-admin-action="confirm"]')?.click());
  await mounter.settle();
  expect(calls[0]?.path).toBe(`/api/v1/admin/comments/${COMMENT}/remove`);
  expect(calls[0]?.body).toEqual(body);
});

