import { describe, expect, test } from 'bun:test';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { appQueryClient } from '@/lib/api/query-client';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { useAdminReach } from './use-admin-reach';

const { mount, mounter } = setupAdminKitTests();

function Probe() {
  const reach = useAdminReach();
  return (
    <pre data-reach>
      {JSON.stringify({
        status: reach.status,
        role: reach.role,
        space: reach.space,
        rank: reach.hasAdminRank,
        sovereign: reach.isSovereign,
        ids: reach.sections.map((section) => section.id),
        users: reach.opens('users'),
        broadcasts: reach.opens('broadcasts'),
        conversations: reach.opens('conversations'),
        agent: reach.can('canManageAgent'),
        moderate: reach.can('canModerateContent'),
      })}
    </pre>
  );
}

/** Relit le DOM jusqu'à ce que l'identité ne soit plus « pending » — sans jamais attendre plus de quelques tours : une lecture qui ne répond pas reste « pending ». */
const read = async (identity?: Parameters<typeof mount>[1]) => {
  const host = await mount(<Probe />, identity);
  const status = () => (JSON.parse(host.querySelector('[data-reach]')?.textContent ?? '{}') as { status?: string }).status;
  for (let attempt = 0; attempt < 15 && status() === 'pending'; attempt += 1) await mounter.settle();
  return JSON.parse(host.querySelector('[data-reach]')?.textContent ?? '{}');
};

describe('useAdminReach — ce que le lecteur peut atteindre', () => {
  test('BIGBOSS : prêt, rang d’administration, souverain, les sections servies et prêtes', async () => {
    const reach = await read(adminIdentityFixture({ role: 'BIGBOSS' }));
    expect(reach).toMatchObject({ status: 'ready', role: 'BIGBOSS', space: 'admin', rank: true, sovereign: true, users: true, conversations: true, agent: true });
    expect(reach.ids).toContain('dashboard');
  });

  test('une section livrée s’ouvre à BIGBOSS, et la permission qui lui manque la ferme — le drapeau de disponibilité ne dit plus rien, tous sont levés', async () => {
    expect((await read(adminIdentityFixture({ role: 'BIGBOSS' }))).broadcasts).toBe(true);
    expect((await read(adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageNotifications: false } }))).broadcasts).toBe(false);
  });

  test('ADMIN a le rang sans être souverain', async () => {
    expect(await read(adminIdentityFixture({ role: 'ADMIN' }))).toMatchObject({ rank: true, sovereign: false, conversations: true });
  });

  test('MODERATOR entre et modère, sans le rang : les conversations ne s’ouvrent pas', async () => {
    expect(await read(adminIdentityFixture({ role: 'MODERATOR' }))).toMatchObject({
      status: 'ready',
      rank: false,
      sovereign: false,
      conversations: false,
      users: false,
      agent: false,
      moderate: true,
    });
  });

  test('un membre sans canAccessAdmin : refusé, rien n’est ouvert, aucune capacité', async () => {
    const reach = await read(adminIdentityFixture({ role: 'USER', permissions: { canManageAgent: true, canModerateContent: true } }));
    expect(reach).toMatchObject({ status: 'denied', ids: [], users: false, agent: false, moderate: false, rank: false, sovereign: false });
  });

  test('un rôle servi sans droit de rang ne devient pas souverain en changeant de nom', async () => {
    expect(await read(adminIdentityFixture({ role: 'bigboss' }))).toMatchObject({ sovereign: false });
  });

  test('identité en vol : « pending », et rien n’est ouvert en attendant (fail-closed)', async () => {
    void appQueryClient.prefetchQuery({ queryKey: ADMIN_PERMISSIONS_QUERY_KEY, queryFn: () => new Promise(() => undefined) });
    expect(await read()).toMatchObject({ status: 'pending', ids: [], users: false, role: null });
  });
});
