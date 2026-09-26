import * as z from 'zod/mini';
import type { QueryClient } from '@tanstack/react-query';

import {
  CONTACT_RELATIONS,
  type ContactRelation,
  type PublicContactAccount,
  type ResolveContactsRequest,
} from '@meeshy/shared/types/contact-card';

import { unwrap } from '@/lib/api/client';
import type { DataSource } from '@/lib/api/config';
import type { ApiResult, HttpTransport } from '@/lib/api/http';

/**
 * **LE PORT DE LA CARTE DE VISITE PARTAGÉE** (#8101) —
 * `POST /api/v1/contacts/resolve` (`services/gateway/src/routes/contacts/resolve.ts`).
 *
 * Une vCard reçue porte des numéros et des e-mails ; la passerelle dit si l'un
 * d'eux est un compte Meeshy et rend au plus trois profils PUBLICS, avec la
 * relation du lecteur à chacun. Jamais l'e-mail ni le téléphone du compte,
 * jamais lequel des identifiants a matché, jamais la présence.
 *
 * **CE QUI EST DÉCODÉ EST CE QUI S'AFFICHE** : le cache de requêtes est
 * persisté sur le disque du navigateur (`query-client.ts`), et le décodeur ne
 * laisse entrer que les sept champs du contrat — un champ que la passerelle
 * servirait en plus n'y entre pas.
 *
 * **CACHE D'ABORD** : une résolution déjà faite se relit sans réseau et sans
 * indicateur de chargement ; elle se revalide en silence après
 * {@link CONTACT_RESOLVE_STALE_TIME}.
 */

export type ContactResolveDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const CONTACT_RESOLVE_STALE_TIME = 5 * 60 * 1000;

const CONTACT_RESOLVE_PREFIX = ['contact-card', 'resolve'] as const;

const accountSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  username: z.string(),
  avatarUrl: z.nullable(z.string()),
  bannerUrl: z.nullable(z.string()),
  bio: z.nullable(z.string()),
  relation: z.enum(CONTACT_RELATIONS as [ContactRelation, ...ContactRelation[]]),
});

/** Ne garde que les comptes conformes au contrat, champ par champ. */
export function decodeContactAccounts(payload: unknown): PublicContactAccount[] {
  const accounts = (payload as { readonly accounts?: unknown } | null)?.accounts;
  if (!Array.isArray(accounts)) return [];
  return accounts.flatMap((entry) => {
    const parsed = accountSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** La clé d'une résolution : l'ENSEMBLE des identifiants, dans l'ordre de la carte. */
export function contactResolveQueryKey(request: ResolveContactsRequest): readonly unknown[] {
  return [...CONTACT_RESOLVE_PREFIX, request.phones.join('|'), request.emails.join('|')];
}

export async function resolveContactAccounts(
  deps: ContactResolveDeps & { readonly request: ResolveContactsRequest; readonly signal?: AbortSignal },
): Promise<ApiResult<PublicContactAccount[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: [] };
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: '/api/v1/contacts/resolve',
    body: { phones: deps.request.phones, emails: deps.request.emails },
    ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
  });
  return result.ok ? { ...result, data: decodeContactAccounts(result.data) } : result;
}

export function contactResolveQueryOptions(deps: ContactResolveDeps & { readonly request: ResolveContactsRequest }) {
  return {
    queryKey: contactResolveQueryKey(deps.request),
    staleTime: CONTACT_RESOLVE_STALE_TIME,
    retry: false,
    enabled: deps.request.phones.length + deps.request.emails.length > 0,
    queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
      resolveContactAccounts({ ...deps, signal }).then(unwrap),
  };
}

/**
 * Réécrit la relation d'un compte dans TOUTES les résolutions en cache — la
 * même personne peut figurer sur deux cartes du fil, et « Se connecter » doit
 * changer les deux au même geste. Rend l'instantané pour le retour arrière.
 */
export function patchContactRelation(
  queryClient: QueryClient,
  userId: string,
  relation: ContactRelation,
): () => void {
  const snapshot = queryClient.getQueriesData<PublicContactAccount[]>({ queryKey: [...CONTACT_RESOLVE_PREFIX] });
  queryClient.setQueriesData<PublicContactAccount[]>({ queryKey: [...CONTACT_RESOLVE_PREFIX] }, (accounts) =>
    accounts?.map((account) => (account.userId === userId ? { ...account, relation } : account)),
  );
  return () => {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
  };
}
