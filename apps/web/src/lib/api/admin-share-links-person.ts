import { asRecord, asText } from './admin';
import type { ApiResult } from './http';

/**
 * **LES PERSONNES ET LES CONVERSATIONS NOMMÉES DES LIENS** (#8876, #6729) — le
 * décodeur COMMUN aux trois sections du lot « liens » (liens de partage, liens de
 * suivi, demandes de contact) : la passerelle nomme partout une personne par
 * `{ id, username, displayName, avatar }` (et, sur la fiche d'une demande, par son
 * prénom et son nom), et une conversation par `{ id, title, type }`.
 *
 * Champ par champ, **jamais un spread** : ces charges ont déjà porté l'adresse
 * e-mail d'une personne (la fiche d'une demande de contact la sert encore), et
 * un cache d'administration ne doit garder que ce qu'un écran montre.
 */
export type AdminLinkPerson = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly avatar: string | null;
};

export type AdminLinkConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly type: string | null;
};

export const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

export const instantOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export const countOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function decodeAdminLinkPerson(raw: unknown): AdminLinkPerson | null {
  const person = asRecord(raw);
  if (person === null || typeof person.id !== 'string' || person.id === '') return null;
  return {
    id: person.id,
    username: asText(person.username),
    displayName: textOrNull(person.displayName),
    firstName: textOrNull(person.firstName),
    lastName: textOrNull(person.lastName),
    avatar: textOrNull(person.avatar),
  };
}

export function decodeAdminLinkConversation(raw: unknown): AdminLinkConversation | null {
  const conversation = asRecord(raw);
  if (conversation === null || typeof conversation.id !== 'string' || conversation.id === '') return null;
  return { id: conversation.id, title: textOrNull(conversation.title), type: textOrNull(conversation.type) };
}

/** Un accusé de geste : « c'est fait », rien de la charge rendue. Non nul — `useAdminAction` rend `null` pour un refus. */
export type AdminLinkAck = { readonly acknowledged: true };

export const acknowledged = (result: ApiResult<unknown>): ApiResult<AdminLinkAck> =>
  result.ok ? { ok: true, data: { acknowledged: true }, ...(result.status === undefined ? {} : { status: result.status }) } : result;
