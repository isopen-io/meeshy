import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { ServedProfileDecor, ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import type { ConversationsDeps } from '../api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '../api/http';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '../api/profile';
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
