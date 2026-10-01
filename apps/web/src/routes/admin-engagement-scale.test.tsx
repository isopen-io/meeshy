import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import type { AdminPermissions } from '@/lib/admin/sections';
import {
  draftOf,
  scaleOfDraft,
  withAddedLevelCap,
  withAddedStreakBonus,
  withOperation,
  withVariant,
} from '@/lib/admin/engagement-scale-form';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import AdminScreen from './admin';
import { EDITABLE_OPERATION_COUNT } from './admin-engagement-scale-operations';
import { AdminEngagementScalePanel } from './admin-engagement-scale-parts';

/**
 * LE BARÈME DE POINTS (#8906, #8959) — l'écran d'administration charge le
 * barème, liste CHAQUE opération par domaine (points par variante, plafond et
 * portée), la règle des liens, les bonus de constance et les garde-fous ;
 * édite, refuse localement un barème invalide et envoie `{ scale }` en `PUT` ;
 * la tuile n'est offerte qu'au rang ADMIN.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadInterfaceCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const SERVED = { scale: DEFAULT_ENGAGEMENT_SCALE, updatedAt: null, updatedBy: null };

type Spy = { readonly transport: HttpTransport; readonly requests: HttpRequest[] };

function scaleTransport(options: { readonly putRefused?: string; readonly getBody?: unknown } = {}): Spy {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest): Promise<ApiResult<unknown>> => {
    requests.push(request);
    if (request.method === 'GET') return { ok: true, data: options.getBody ?? SERVED };
    if (request.method === 'PUT') {
      if (options.putRefused !== undefined) return { ok: false, status: 400, error: options.putRefused };
      const body = request.body as { readonly scale: EngagementScale };
      return { ok: true, data: { scale: body.scale, updatedAt: '2026-09-30T10:00:00.000Z', updatedBy: 'admin-1' } };
    }
    return { ok: false, status: 404, error: 'non prévu' };
  }) as HttpTransport['request'];
  return { transport, requests };
}

async function mountPanel(spy: Spy): Promise<HTMLDivElement> {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminEngagementScalePanel language="fr" deps={{ source: 'gateway', transport: spy.transport }} />
    </QueryClientProvider>,
  );
}

const input = (host: ParentNode, selector: string): HTMLInputElement => {
  const element = host.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`champ absent : ${selector}`);
  return element;
};

const puts = (spy: Spy) => spy.requests.filter((request) => request.method === 'PUT');

describe('le brouillon — la loi partagée en aller-retour', () => {
  test('les défauts relus depuis le brouillon sont les défauts', () => {
    expect(scaleOfDraft(draftOf(DEFAULT_ENGAGEMENT_SCALE))).toEqual(DEFAULT_ENGAGEMENT_SCALE);
  });

  test('un plafond vide veut dire « aucun » ; un point vide est invalide', () => {
    const draft = draftOf(DEFAULT_ENGAGEMENT_SCALE);
    expect(scaleOfDraft(withOperation(draft, 'tool.reaction', { cap: '' }))?.operations['tool.reaction'].cap).toBeNull();
    expect(scaleOfDraft(withOperation(draft, 'tool.reaction', { points: '' }))).toBeNull();
  });

  test('un niveau ajouté prend le plafond global et reste valide', () => {
    const scale = scaleOfDraft(withAddedLevelCap(draftOf(DEFAULT_ENGAGEMENT_SCALE)));
    expect(scale?.multiplier.levelCaps).toEqual([{ minLevel: 0, maxFactor: DEFAULT_ENGAGEMENT_SCALE.multiplier.maxFactor }]);
  });

  test('une variante éditée ne touche que sa visibilité', () => {
    const scale = scaleOfDraft(withVariant(draftOf(DEFAULT_ENGAGEMENT_SCALE), 'content.post', 'friends', '40'));
    expect(scale?.operations['content.post'].variantPoints).toEqual({ public: 99, community: 69, friends: 40, other: 0 });
  });

  test('un palier de constance ajouté double le dernier et reste valide', () => {
    const scale = scaleOfDraft(withAddedStreakBonus(draftOf(DEFAULT_ENGAGEMENT_SCALE)));
    expect(scale?.streakBonuses.at(-1)).toEqual({ days: 200, points: 0 });
  });
});

describe('le chargement', () => {
  test('il liste CHAQUE opération, avec son libellé, ses points, son « multiplié » et son plafond', async () => {
    const host = await mountPanel(scaleTransport());

    expect(host.querySelectorAll('tr[data-scale-operation]').length).toBe(EDITABLE_OPERATION_COUNT);
    const reaction = host.querySelector('tr[data-scale-operation="tool.reaction"]');
    expect(reaction?.textContent).toContain(translateAdmin('fr', 'admin.scale.op.tool.reaction'));
    expect(reaction?.textContent).toContain(translateAdmin('fr', 'admin.scale.scope.conversation-day'));
    expect(input(host, '[data-scale-points="tool.reaction"]').value).toBe('2');
    expect(input(host, '[data-scale-cap="tool.reaction"]').value).toBe('30');
    expect(input(host, '[data-scale-cap="content.post"]').value).toBe('50');
    expect(input(host, '[data-scale-multiplied="tool.reaction"]').checked).toBe(true);
    expect(host.querySelector('[data-scale-cap-fixed="profile.avatar"]')?.textContent).toBe(translateAdmin('fr', 'admin.scale.cap.perAccount'));
    expect(host.querySelector('[data-scale-points="content.post"]')).toBeNull();
    expect(input(host, '[data-scale-variant="content.post:public"]').value).toBe('99');
    expect(input(host, '[data-scale-points="content.reel"]').value).toBe('199');
    expect(input(host, '[data-scale-multiplier="maxFactor"]').value).toBe('5');
    expect(host.querySelector('[data-scale-updated]')?.textContent).toBe(translateAdmin('fr', 'admin.scale.defaults'));
  });

  test('les opérations se rangent par domaine, les progressives ont leur propre section', async () => {
    const host = await mountPanel(scaleTransport());

    expect(host.querySelector('[data-scale-domain="messaging"] [data-scale-operation="tool.reaction"]')).not.toBeNull();
    expect(host.querySelector('[data-scale-domain="profile"] [data-scale-operation="profile.two_factor"]')).not.toBeNull();
    expect(host.querySelector('[data-scale-operation="social.link_visit"]')).toBeNull();
    expect(host.querySelector('[data-scale-operation="streak.bonus"]')).toBeNull();
    expect(input(host, '[data-scale-link="firstTier"]').value).toBe('10');
    expect(input(host, '[data-scale-link="maxPoints"]').value).toBe('20');
    expect(input(host, '[data-scale-streak-days="1"]').value).toBe('30');
    expect(input(host, '[data-scale-streak-points="2"]').value).toBe('100');
    expect(input(host, '[data-scale-abuse="heavyPoints"]').value).toBe(String(DEFAULT_ENGAGEMENT_SCALE.abuse.heavyPoints));
  });

  test('un barème servi illisible n’est pas édité : l’écran le dit', async () => {
    const host = await mountPanel(scaleTransport({ getBody: { scale: { operations: {} } } }));
    expect(host.querySelector('[data-scale-load-failed]')).not.toBeNull();
    expect(host.querySelector('[data-admin-engagement-scale]')).toBeNull();
  });

  test('l’échec est l’état d’erreur du kit, AVEC « Réessayer » qui relit le barème', async () => {
    let reads = 0;
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
    transport.request = (async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      if (request.method !== 'GET') return { ok: false, status: 404, error: 'non prévu' };
      reads += 1;
      return reads === 1 ? { ok: false, status: 500, error: 'boom' } : { ok: true, data: SERVED };
    }) as HttpTransport['request'];
    const host = await mountPanel({ transport, requests: [] });

    expect(host.querySelector('[data-scale-load-failed] [data-admin-error]')?.textContent).toContain(translateAdmin('fr', 'admin.scale.loadFailed'));
    await mounter.click(host.querySelector('[data-admin-retry]'));
    await mounter.settle();

    expect(reads).toBe(2);
    expect(host.querySelector('[data-admin-engagement-scale]')).not.toBeNull();
    expect(host.querySelector('[data-scale-load-failed]')).toBeNull();
  });
});

describe('le barème sur le kit (#8876)', () => {
  test('chaque champ et chaque bouton fait 44 px ; la case de 24 px est dans une zone d’appui de 44 px', async () => {
    const host = await mountPanel(scaleTransport());
    const fields = [...host.querySelectorAll<HTMLInputElement>('input[type="text"]')];
    expect(fields.length).toBeGreaterThan(EDITABLE_OPERATION_COUNT);
    for (const field of fields) expect(field.style.minHeight).toBe('44px');
    for (const button of host.querySelectorAll<HTMLButtonElement>('button')) expect(button.style.minHeight).toBe('44px');

    const box = input(host, '[data-scale-multiplied="tool.reaction"]');
    expect(box.style.height).toBe('24px');
    const zone = box.closest('label');
    expect(zone?.style.minHeight).toBe('44px');
    expect(zone?.style.minWidth).toBe('44px');
  });

  test('l’enregistrement est un aplat de la marque, sans dégradé', async () => {
    const host = await mountPanel(scaleTransport());
    const save = host.querySelector<HTMLButtonElement>('[data-scale-save]');
    expect(save?.style.backgroundColor).toBe('var(--color-ios-brand)');
    expect(save?.style.cssText).not.toContain('gradient');
  });

  test('chaque opération est AUSSI une carte (sous le seuil du contenu), avec ses trois champs', async () => {
    const host = await mountPanel(scaleTransport());
    const cards = [...host.querySelectorAll('li[data-scale-operation]')];
    expect(cards.length).toBe(EDITABLE_OPERATION_COUNT);
    expect(host.querySelector('table')?.parentElement?.className).toContain('@3xl:block');
    expect(host.querySelector('ul')?.className).toContain('@3xl:hidden');
    const reaction = host.querySelector('li[data-scale-operation="tool.reaction"]');
    expect(reaction?.textContent).toContain(translateAdmin('fr', 'admin.scale.op.tool.reaction'));
    expect(reaction?.querySelectorAll('input').length).toBe(3);
  });

  test('un niveau ajouté est une ligne ET une carte, et se retire par un bouton de 44 px', async () => {
    const host = await mountPanel(scaleTransport());
    await mounter.click(host.querySelector('[data-scale-level-add]'));
    expect(host.querySelector('tr[data-scale-level-row="0"]')).not.toBeNull();
    expect(host.querySelector('li[data-scale-level-row="0"]')).not.toBeNull();
    const remove = host.querySelector<HTMLButtonElement>('[data-scale-level-remove="0"]');
    expect(remove?.style.minHeight).toBe('44px');
    await mounter.click(remove);
    expect(host.querySelector('[data-scale-level-row]')).toBeNull();
    expect(host.querySelector('[data-scale-levels-empty]')).not.toBeNull();
  });

  test('un palier de constance est une ligne ET une carte, et se retire par un bouton de 44 px', async () => {
    const host = await mountPanel(scaleTransport());
    expect(host.querySelector('tr[data-scale-streak-row="2"]')).not.toBeNull();
    expect(host.querySelector('li[data-scale-streak-row="2"]')).not.toBeNull();
    const remove = host.querySelector<HTMLButtonElement>('[data-scale-streak-remove="0"]');
    expect(remove?.style.minHeight).toBe('44px');
    expect(host.querySelector<HTMLButtonElement>('[data-scale-streak-add]')?.style.minHeight).toBe('44px');
    await mounter.click(remove);
    expect(host.querySelector('[data-scale-streak-row="2"]')).toBeNull();
    await mounter.click(host.querySelector('[data-scale-streak-remove="0"]'));
    await mounter.click(host.querySelector('[data-scale-streak-remove="0"]'));
    expect(host.querySelector('[data-scale-streak-row]')).toBeNull();
    expect(host.querySelector('[data-scale-streak-empty]')).not.toBeNull();
  });

  test('chaque domaine range ses opérations en tableau ET en cartes, la variante a un champ de 44 px par visibilité', async () => {
    const host = await mountPanel(scaleTransport());
    const domain = host.querySelector('[data-scale-domain="publishing"]');
    expect(domain?.querySelector('h3')?.textContent).toBe(translateAdmin('fr', 'admin.scale.domain.publishing'));
    expect(domain?.querySelector('tr[data-scale-operation="content.post"]')).not.toBeNull();
    expect(domain?.querySelector('li[data-scale-operation="content.post"]')).not.toBeNull();
    const variants = [...host.querySelectorAll<HTMLInputElement>('tr[data-scale-operation="content.post"] [data-scale-variant]')];
    expect(variants.length).toBe(4);
    for (const variant of variants) expect(variant.style.minHeight).toBe('44px');
  });

  test('les six blocs sont des cartes titrées du kit', async () => {
    const host = await mountPanel(scaleTransport());
    for (const id of ['scale-operations', 'scale-links', 'scale-streak', 'scale-abuse', 'scale-multiplier', 'scale-levels']) {
      expect(host.querySelector(`[data-admin-fiche-section="${id}"] h2`)).not.toBeNull();
    }
  });
});

describe('l’édition et l’enregistrement', () => {
  test('le PUT porte { scale } avec les valeurs éditées', async () => {
    const spy = scaleTransport();
    const host = await mountPanel(spy);

    mounter.type(host, '[data-scale-points="tool.reaction"]', '3');
    mounter.type(host, '[data-scale-cap="tool.reaction"]', '');
    await mounter.click(host.querySelector('[data-scale-multiplied="tool.attachment"]'));
    mounter.type(host, '[data-scale-multiplier="maxFactor"]', '4');
    await mounter.submit(host);

    const [put] = puts(spy);
    const body = put?.body as { readonly scale: EngagementScale } | undefined;
    expect(body?.scale.operations['tool.reaction']).toEqual({ points: 3, multiplied: true, cap: null, variantPoints: {} });
    expect(body?.scale.operations['tool.attachment'].multiplied).toBe(false);
    expect(body?.scale.multiplier.maxFactor).toBe(4);
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe(translateAdmin('fr', 'admin.scale.saved'));
  });

  test('les variantes, la règle des liens, la constance et les garde-fous partent dans le PUT', async () => {
    const spy = scaleTransport();
    const host = await mountPanel(spy);

    mounter.type(host, '[data-scale-variant="content.story:friends"]', '25');
    mounter.type(host, '[data-scale-link="dailyCapPerCreator"]', '');
    mounter.type(host, '[data-scale-link="stepPerDoubling"]', '3');
    await mounter.click(host.querySelector('[data-scale-streak-remove="0"]'));
    mounter.type(host, '[data-scale-abuse="unverifiedMaxPoints"]', '5');
    await mounter.submit(host);

    const body = puts(spy)[0]?.body as { readonly scale: EngagementScale } | undefined;
    expect(body?.scale.operations['content.story'].variantPoints.friends).toBe(25);
    expect(body?.scale.linkVisits.dailyCapPerCreator).toBeNull();
    expect(body?.scale.linkVisits.stepPerDoubling).toBe(3);
    expect(body?.scale.streakBonuses.map((bonus) => bonus.days)).toEqual([30, 100]);
    expect(body?.scale.abuse.unverifiedMaxPoints).toBe(5);
  });

  test('un barème invalide est BLOQUÉ : aucun PUT, l’erreur est dite', async () => {
    const spy = scaleTransport();
    const host = await mountPanel(spy);

    mounter.type(host, '[data-scale-points="tool.reaction"]', '-1');
    await mounter.submit(host);

    expect(puts(spy)).toEqual([]);
    expect(host.querySelector('[data-scale-error]')?.textContent).toBe(translateAdmin('fr', 'admin.scale.invalid'));
  });

  test('un plafond de niveau au-dessus du multiplicateur maximal est bloqué', async () => {
    const spy = scaleTransport();
    const host = await mountPanel(spy);

    await mounter.click(host.querySelector('[data-scale-level-add]'));
    mounter.type(host, '[data-scale-level-factor="0"]', '9');
    await mounter.submit(host);

    expect(puts(spy)).toEqual([]);
    expect(host.querySelector('[data-scale-error]')).not.toBeNull();
  });

  test('le refus du serveur est montré tel quel', async () => {
    const spy = scaleTransport({ putRefused: 'Barème invalide' });
    const host = await mountPanel(spy);

    await mounter.submit(host);

    expect(puts(spy).length).toBe(1);
    expect(host.querySelector('[data-scale-error]')?.textContent).toBe(
      translateAdmin('fr', 'admin.scale.saveFailed', { error: 'Barème invalide' }),
    );
  });

  test('« revenir aux défauts » remet le brouillon aux défauts, sans rien envoyer', async () => {
    const custom = { ...SERVED, scale: { ...DEFAULT_ENGAGEMENT_SCALE, multiplier: { ...DEFAULT_ENGAGEMENT_SCALE.multiplier, maxFactor: 3 } } };
    const spy = scaleTransport({ getBody: custom });
    const host = await mountPanel(spy);
    expect(input(host, '[data-scale-multiplier="maxFactor"]').value).toBe('3');

    await mounter.click(host.querySelector('[data-scale-reset]'));

    expect(input(host, '[data-scale-multiplier="maxFactor"]').value).toBe('5');
    expect(puts(spy)).toEqual([]);
  });
});

const MATRICE: AdminPermissions = {
  canAccessAdmin: true,
  canManageUsers: true,
  canManageGroups: true,
  canManageConversations: true,
  canViewAnalytics: true,
  canModerateContent: true,
  canViewAuditLogs: true,
  canManageNotifications: true,
  canManageTranslations: true,
  canManageAgent: true,
};

describe('la tuile du hub', () => {
  const hub = async (role: string) => {
    appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, { role, permissions: MATRICE });
    return mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminScreen />
      </QueryClientProvider>,
    );
  };

  test('un ADMIN voit « Barème de points », qui mène à son écran', async () => {
    const host = await hub('ADMIN');
    const tile = host.querySelector('[data-admin-section="engagementScale"]');
    expect(tile?.textContent).toContain(translateAdmin('fr', 'admin.nav.engagementScale'));
    expect(tile?.getAttribute('href')).toBe('/admin/engagement-scale');
  });

  test('un MODERATOR, qui porte pourtant toutes les permissions, ne la voit pas', async () => {
    const host = await hub('MODERATOR');
    expect(host.querySelector('[data-admin-section="engagementScale"]')).toBeNull();
  });
});
