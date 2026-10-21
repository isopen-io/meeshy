import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { ServedProfileDecor, ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import type { ConversationsDeps } from '../api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '../api/http';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '../api/profile';
import { publicProfileQueryKey, type PublicProfileView } from '../api/public-profile';
import { applyProfileDecorEvent, equipProfileDecor } from './equip';

const ring = (item: string): ServedProfileDecorItem => ({ pack: 'contours-essentiels', item, origin: 'builtin', contract: null });
const banner = (item: string): ServedProfileDecorItem => ({ pack: 'bannieres-essentielles', item, origin: 'builtin', contract: null });

const profile = (decor: ServedProfileDecor | undefined): MyProfile => ({
  id: 'u1',
  username: 'ada',
  displayName: null,
  firstName: null,
  lastName: null,
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  email: null,
  phone: null,
  createdAt: null,
  ...(decor === undefined ? {} : { profileDecor: decor }),
});

const decorOf = (client: QueryClient): ServedProfileDecor | undefined => client.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.profileDecor;

const setup = (initial: MyProfile, answer: (request: HttpRequest, seenDecor: () => ServedProfileDecor | undefined) => Promise<ApiResult<unknown>>) => {
  const client = new QueryClient();
  client.setQueryData(MY_PROFILE_QUERY_KEY, initial);
  const seen: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      seen.push(request);
      return (await answer(request, () => decorOf(client))) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { client, deps, seen };
};

describe('équiper un contour', () => {
  test('le choix se voit AVANT la réponse du serveur, puis la réponse fait foi', async () => {
    let during: ServedProfileDecor | undefined;
    const { client, deps, seen } = setup(profile({ avatarRing: null, banner: null }), async (_request, seenDecor) => {
      during = seenDecor();
      return { ok: true, data: { avatarRing: ring('filet'), banner: null } };
    });
    const outcome = await equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    expect(during?.avatarRing?.item).toBe('filet');
    expect(outcome).toEqual({ status: 'saved' });
    expect(seen[0]?.body).toEqual({ avatarRing: { pack: 'contours-essentiels', item: 'filet' } });
    expect(decorOf(client)?.avatarRing?.item).toBe('filet');
  });

  test('un refus rétablit le contour d’avant et le dit, sans toucher à la bannière', async () => {
    const { client, deps } = setup(profile({ avatarRing: ring('perle'), banner: banner('aurore') }), async () => ({ ok: false, status: 403, error: 'no', code: 'PACK_NOT_OWNED' }));
    const outcome = await equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('laurier') });
    expect(outcome).toEqual({ status: 'refused', code: 'PACK_NOT_OWNED' });
    expect(decorOf(client)).toEqual({ avatarRing: ring('perle'), banner: banner('aurore') });
  });

  test('retirer envoie null et efface le contour', async () => {
    const { client, deps, seen } = setup(profile({ avatarRing: ring('perle'), banner: null }), async () => ({ ok: true, data: { avatarRing: null, banner: null } }));
    await equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: null });
    expect(seen[0]?.body).toEqual({ avatarRing: null });
    expect(decorOf(client)?.avatarRing).toBeNull();
  });

  test('une panne réseau rétablit aussi, et le dit autrement qu’un refus', async () => {
    const { client, deps } = setup(profile({ avatarRing: ring('perle'), banner: null }), async () => ({ ok: false, status: 0, error: 'offline' }));
    const outcome = await equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    expect(outcome.status).toBe('error');
    expect(decorOf(client)?.avatarRing?.item).toBe('perle');
  });

  test('un ancien serveur (profil sans profileDecor) : rien n’est tenté', async () => {
    const { client, deps, seen } = setup(profile(undefined), async () => ({ ok: true, data: {} }));
    const outcome = await equipProfileDecor({ queryClient: client, deps, side: 'banner', choice: banner('aurore') });
    expect(outcome.status).toBe('unsupported');
    expect(seen).toEqual([]);
  });
});

describe('équiper un cadre de bannière (#10936)', () => {
  const frame = (item: string): ServedProfileDecorItem => ({ pack: 'cadres-celte', item, origin: 'builtin', contract: null });

  test('le cadre se pose avant la réponse, la réponse fait foi, et rien d’autre ne bouge', async () => {
    let during: ServedProfileDecor | undefined;
    const { client, deps, seen } = setup(profile({ avatarRing: ring('perle'), banner: banner('aurore'), bannerFrame: null }), async (_request, seenDecor) => {
      during = seenDecor();
      return { ok: true, data: { avatarRing: ring('perle'), banner: banner('aurore'), bannerFrame: frame('celte') } };
    });
    const outcome = await equipProfileDecor({ queryClient: client, deps, side: 'bannerFrame', choice: frame('celte') });
    expect(during?.bannerFrame?.item).toBe('celte');
    expect(outcome).toEqual({ status: 'saved' });
    expect(seen[0]?.body).toEqual({ bannerFrame: { pack: 'cadres-celte', item: 'celte' } });
    expect(decorOf(client)).toEqual({ avatarRing: ring('perle'), banner: banner('aurore'), bannerFrame: frame('celte') });
  });

  test('un refus rétablit le cadre d’avant', async () => {
    const { client, deps } = setup(profile({ avatarRing: null, banner: null, bannerFrame: frame('celte') }), async () => ({ ok: false, status: 403, error: 'no', code: 'PACK_NOT_OWNED' }));
    expect(await equipProfileDecor({ queryClient: client, deps, side: 'bannerFrame', choice: frame('celte-anime') })).toEqual({ status: 'refused', code: 'PACK_NOT_OWNED' });
    expect(decorOf(client)?.bannerFrame?.item).toBe('celte');
  });

  test('un cadre posé sur un autre appareil arrive par l’événement', () => {
    const client = new QueryClient();
    client.setQueryData(MY_PROFILE_QUERY_KEY, profile({ avatarRing: null, banner: null, bannerFrame: null }));
    applyProfileDecorEvent(client, { userId: 'u1', decor: { avatarRing: null, banner: null, bannerFrame: frame('celte') } });
    expect(decorOf(client)?.bannerFrame?.item).toBe('celte');
  });
});

describe('le décor équipé sur un autre appareil', () => {
  test('profile:decor-updated met mon profil à jour', () => {
    const { client } = setup(profile({ avatarRing: null, banner: null }), async () => ({ ok: true, data: {} }));
    applyProfileDecorEvent(client, { userId: 'u1', decor: { avatarRing: ring('laurier'), banner: null }, at: '2026-10-14T10:00:00.000Z' });
    expect(decorOf(client)?.avatarRing?.item).toBe('laurier');
  });

  test('l’événement d’un autre compte, ou une charge malformée, est ignoré', () => {
    const { client } = setup(profile({ avatarRing: null, banner: null }), async () => ({ ok: true, data: {} }));
    applyProfileDecorEvent(client, { userId: 'u2', decor: { avatarRing: ring('laurier'), banner: null }, at: 'x' });
    applyProfileDecorEvent(client, 'n’importe quoi');
    expect(decorOf(client)).toEqual({ avatarRing: null, banner: null });
  });

  test('sur un profil jamais chargé ou d’ancien serveur, l’événement ne fabrique rien', () => {
    const client = new QueryClient();
    applyProfileDecorEvent(client, { userId: 'u1', decor: { avatarRing: ring('laurier'), banner: null }, at: 'x' });
    expect(client.getQueryData(MY_PROFILE_QUERY_KEY)).toBeUndefined();
  });
});

describe('ma fiche publique en cache suit le décor (#10632)', () => {
  const myPublicView = (decor: ServedProfileDecor): PublicProfileView => ({
    profile: { id: 'u1', username: 'ada', displayName: null, avatar: null, banner: null, bio: null, createdAt: null, decor },
    stats: null,
    relation: 'self',
    isSelf: true,
    blockedByViewer: false,
    relationRequestId: null,
    presence: null,
  });
  const publicDecorOf = (client: QueryClient) => client.getQueryData<PublicProfileView>(publicProfileQueryKey('Ada'))?.profile.decor;

  test('un contour confirmé se voit aussi sur ma fiche publique', async () => {
    const { client, deps } = setup(profile({ avatarRing: null, banner: null }), async () => ({ ok: true, data: { avatarRing: ring('filet'), banner: null } }));
    client.setQueryData(publicProfileQueryKey('ada'), myPublicView({ avatarRing: null, banner: null }));
    await equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    expect(publicDecorOf(client)?.avatarRing?.item).toBe('filet');
  });

  test('un refus laisse ma fiche publique telle quelle', async () => {
    const { client, deps } = setup(profile({ avatarRing: ring('perle'), banner: null }), async () => ({ ok: false, status: 403, error: 'no' }));
    client.setQueryData(publicProfileQueryKey('ada'), myPublicView({ avatarRing: ring('perle'), banner: null }));
    await equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    expect(publicDecorOf(client)?.avatarRing?.item).toBe('perle');
  });

  test('l’événement d’un autre appareil repeint aussi ma fiche publique', () => {
    const { client } = setup(profile({ avatarRing: null, banner: null }), async () => ({ ok: true, data: {} }));
    client.setQueryData(publicProfileQueryKey('ada'), myPublicView({ avatarRing: null, banner: null }));
    applyProfileDecorEvent(client, { userId: 'u1', decor: { avatarRing: null, banner: banner('aurore') }, at: 'x' });
    expect(publicDecorOf(client)?.banner?.item).toBe('aurore');
  });
});

describe('un événement de MON compte dont le décor est illisible', () => {
  test('est ignoré entier : il n’efface pas ce que j’ai équipé', () => {
    const { client } = setup(profile({ avatarRing: ring('perle'), banner: banner('aurore') }), async () => ({ ok: true, data: {} }));
    applyProfileDecorEvent(client, { userId: 'u1', at: 'x' });
    applyProfileDecorEvent(client, { userId: 'u1', decor: 'illisible', at: 'x' });
    expect(decorOf(client)).toEqual({ avatarRing: ring('perle'), banner: banner('aurore') });
  });
});

describe('deux choix rapprochés sur le même côté : les réponses se croisent (#10632)', () => {
  type Pending = { readonly resolve: (answer: ApiResult<unknown>) => void };
  const crossed = (initial: ServedProfileDecor) => {
    const pending: Pending[] = [];
    const harness = setup(profile(initial), () => new Promise<ApiResult<unknown>>((resolve) => pending.push({ resolve })));
    return { ...harness, pending };
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('la réponse plus ancienne, arrivée en dernier, n’écrase pas le dernier choix', async () => {
    const { client, deps, pending } = crossed({ avatarRing: ring('perle'), banner: null });
    const first = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    const second = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('laurier') });
    await flush();
    pending[1]?.resolve({ ok: true, data: { avatarRing: ring('laurier'), banner: null } });
    await second;
    pending[0]?.resolve({ ok: true, data: { avatarRing: ring('filet'), banner: null } });
    await first;
    expect(decorOf(client)?.avatarRing?.item).toBe('laurier');
  });

  test('le refus plus ancien, arrivé en dernier, ne rétablit pas l’état d’avant par-dessus le dernier choix', async () => {
    const { client, deps, pending } = crossed({ avatarRing: ring('perle'), banner: null });
    const first = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    const second = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('laurier') });
    await flush();
    pending[1]?.resolve({ ok: true, data: { avatarRing: ring('laurier'), banner: null } });
    await second;
    pending[0]?.resolve({ ok: false, status: 403, error: 'no', code: 'PACK_NOT_OWNED' });
    await first;
    expect(decorOf(client)?.avatarRing?.item).toBe('laurier');
  });

  test('un refus du dernier choix revient à ce que le serveur a ACCEPTÉ, pas à un choix optimiste jamais confirmé', async () => {
    const { client, deps, pending } = crossed({ avatarRing: ring('perle'), banner: null });
    const first = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    const second = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('laurier') });
    await flush();
    pending[0]?.resolve({ ok: false, status: 403, error: 'no', code: 'PACK_NOT_OWNED' });
    await first;
    pending[1]?.resolve({ ok: false, status: 403, error: 'no', code: 'PACK_NOT_OWNED' });
    await second;
    expect(decorOf(client)?.avatarRing?.item).toBe('perle');
  });

  test('la réponse d’un côté ne défait pas le choix en cours de l’autre côté', async () => {
    const { client, deps, pending } = crossed({ avatarRing: null, banner: null });
    const ringEquip = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    const bannerEquip = equipProfileDecor({ queryClient: client, deps, side: 'banner', choice: banner('aurore') });
    await flush();
    pending[0]?.resolve({ ok: true, data: { avatarRing: ring('filet'), banner: null } });
    await ringEquip;
    expect(decorOf(client)?.banner?.item).toBe('aurore');
    pending[1]?.resolve({ ok: true, data: { avatarRing: ring('filet'), banner: banner('aurore') } });
    await bannerEquip;
    expect(decorOf(client)).toEqual({ avatarRing: ring('filet'), banner: banner('aurore'), bannerFrame: null });
  });
});

describe('un profile:decor-updated arrivé pendant un choix en vol (#10632)', () => {
  test('ne défait pas le choix affiché, et un refus revient au décor que l’événement a dit accepté', async () => {
    let answer: ((value: ApiResult<unknown>) => void) | undefined;
    const { client, deps } = setup(profile({ avatarRing: ring('perle'), banner: null }), () => new Promise((resolve) => (answer = resolve)));
    const equip = equipProfileDecor({ queryClient: client, deps, side: 'avatarRing', choice: ring('filet') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    applyProfileDecorEvent(client, { userId: 'u1', decor: { avatarRing: ring('laurier'), banner: banner('aurore') }, at: 'x' });
    expect(decorOf(client)).toEqual({ avatarRing: ring('filet'), banner: banner('aurore'), bannerFrame: null });
    answer?.({ ok: false, status: 403, error: 'no' });
    await equip;
    expect(decorOf(client)).toEqual({ avatarRing: ring('laurier'), banner: banner('aurore'), bannerFrame: null });
  });
});
