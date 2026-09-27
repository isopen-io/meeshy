import * as z from 'zod/mini';
import * as directoryEndpoints from '@meeshy/shared/api/endpoints/directory';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { unreadableFailure } from './link-failure';

/**
 * **EFFACER MON CARNET D'ADRESSES** (#8167) — `DELETE directory.contacts`
 * (`services/gateway/src/routes/directory/contacts.ts`), miroir de
 * `PhonebookViewModel.eraseDirectory()` (iOS).
 *
 * Le carnet est celui qu'un téléphone a synchronisé ; la passerelle ne le garde
 * que pour annoncer l'arrivée d'un ami (`contact_joined`), jamais pour autre
 * chose. L'effacement retire ses fiches ET les annonces qui en dérivent
 * (`ContactJoinNotice`), et n'a d'effet que sur le carnet du demandeur : la
 * route ne prend aucun identifiant, elle lit le compte dans la session.
 *
 * Le web ne lit pas le carnet — il n'a rien à vider localement. L'état
 * optimiste est celui de la RANGÉE : elle dit « effacé » au geste, et le
 * retire si la passerelle refuse.
 */

export type AddressBookDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type AddressBookErasure = { readonly removedCount: number };

export type AddressBookState = 'kept' | 'erased';

const ServedErasure = z.object({ removedCount: z.number() });

export async function eraseAddressBook(deps: AddressBookDeps): Promise<ApiResult<AddressBookErasure>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { removedCount: 0 } };
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: directoryEndpoints.contacts });
  if (!result.ok) return result;
  const parsed = ServedErasure.safeParse(result.data);
  if (!parsed.success) return unreadableFailure('Effacement du carnet');
  return { ok: true, data: { removedCount: parsed.data.removedCount } };
}

export async function performAddressBookErase({
  deps,
  onState,
}: {
  readonly deps: AddressBookDeps;
  readonly onState: (state: AddressBookState) => void;
}): Promise<'erased' | 'failed'> {
  onState('erased');
  const result = await eraseAddressBook(deps);
  if (result.ok) return 'erased';
  onState('kept');
  return 'failed';
}
