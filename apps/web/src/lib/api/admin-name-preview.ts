import { asRecord } from './admin';

/**
 * **DE QUOI NOMMER UNE CONVERSATION SANS TITRE** (#8876, règle R1) — « Awa et Jean »,
 * « Awa, Jean et 3 autres » : les membres tiennent lieu de titre à une conversation directe.
 *
 * La passerelle ne sert `participants` (trois membres actifs au plus, nom affiché et
 * pseudo) et `total` (l'effectif actif) qu'au rang d'administration, parce que qui parle
 * à qui EST l'inventaire des conversations. Pour tout autre rôle les deux clés sont
 * ABSENTES et ce décodeur rend `null` : le nom retombe sur le genre de la conversation,
 * jamais sur une liste inventée.
 *
 * Décodé champ par champ, sans spread : ni identifiant, ni avatar, ni présence n'entrent
 * ici — la passerelle ne les sert pas, et ce qu'elle ajouterait demain n'entrerait pas.
 */
export type AdminNameMember = {
  readonly displayName: string | null;
  readonly username: string | null;
};

export type AdminNamePreview = {
  readonly participants: readonly AdminNameMember[];
  readonly total: number;
};

const MAX_NAMED = 3;

const nameOrNull = (value: unknown): string | null => {
  const name = typeof value === 'string' ? value.trim() : '';
  return name === '' ? null : name;
};

/** `null` quand la ligne ne porte pas d'aperçu — ou n'en porte qu'un vide. */
export function decodeNamePreview(raw: Readonly<Record<string, unknown>> | null | undefined): AdminNamePreview | null {
  if (raw === null || raw === undefined || !Array.isArray(raw.participants)) return null;

  const participants = raw.participants
    .map((entry): AdminNameMember | null => {
      const member = asRecord(entry);
      if (member === null) return null;
      const displayName = nameOrNull(member.displayName);
      const username = nameOrNull(member.username);
      return displayName === null && username === null ? null : { displayName, username };
    })
    .filter((member): member is AdminNameMember => member !== null)
    .slice(0, MAX_NAMED);
  if (participants.length === 0) return null;

  const total = typeof raw.total === 'number' && Number.isFinite(raw.total) ? Math.max(0, Math.trunc(raw.total)) : participants.length;
  return { participants, total: Math.max(total, participants.length) };
}
