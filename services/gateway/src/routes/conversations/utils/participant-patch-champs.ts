import { PARTICIPANT_RIGHT_NAMES } from '../../../services/participantRights';

/**
 * **Quel GESTE un corps de `PATCH …/participants/:participantKey` demande** —
 * la loi de la route fusionnée (#4176, critères 1 et 2), écrite ici pour
 * qu'elle s'interroge sans monter Fastify.
 *
 * Quatre routes changeaient un participant : `…/rights`, `…/role`, `…/ban`,
 * `…/unban`. Le CHEMIN portait le geste, donc l'autorité à opposer se lisait
 * dans l'URL. Une adresse unique déplace cette question dans le CORPS — et
 * c'est ce déplacement, pas la fusion, qui crée le risque que l'issue nomme :
 *
 * > « une mutation ne se juge jamais sur son champ le moins gardé. »
 *
 * ─── Ce que « mêler » veut dire, exactement ─────────────────────────────────
 *
 * Le refus en bloc porte sur les GESTES, pas sur les champs pris un à un — et
 * la distinction est le seul endroit de ce fichier qui mérite d'être défendu.
 *
 * `rights.*` (plancher MODERATOR) et `historyVisibleFrom` (plancher ADMIN)
 * n'ont pas le même rang, mais ils forment **un seul geste** : ils s'écrivent
 * dans le MÊME `prisma.participant.update` et partent dans le MÊME éventail
 * (`participant-rights-core.ts`). Surtout, ce geste oppose DÉJÀ les deux
 * planchers séparément — c'est le « gate par champ » que l'issue dit vouloir
 * ÉTENDRE, pas inventer : un modérateur qui nomme `historyVisibleFrom` reçoit
 * `403 HISTORY_GRANT_REQUIRES_ADMIN`, que son corps porte des booléens ou non.
 * Le mal que `MIXED_AUTHORITY` prévient — juger sur le champ le moins gardé —
 * ne s'y produit pas. Les refuser ensemble ferait perdre l'ATOMICITÉ d'une
 * mutation qui existe aujourd'hui, et remplacerait un `participant:rights-updated`
 * par deux.
 *
 * Deux gestes DIFFÉRENTS, eux, sont deux écritures et deux éventails, sans
 * transaction : `{ role, bannedAt }` laisserait l'appelant sans moyen de savoir
 * ce qui a atterri si le second échoue. C'est là que le refus en bloc a sa
 * valeur, et c'est exactement l'exemple que l'issue donne à son témoin
 * (`{ role, rights }`).
 *
 * ─── `bannedAt` : UN champ, DEUX gestes, choisis par la VALEUR ──────────────
 *
 * `bannedAt: <date>` bannit, `bannedAt: null` lève. Un même champ ne peut pas
 * se mêler à lui-même, donc la nullité est lue APRÈS la détection du mélange,
 * jamais pendant : la famille (« ce corps parle de bannissement ») suffit à
 * décider s'il y a mélange, et seule la valeur décide du sens.
 *
 * **La date reçue est un INTENT, jamais un fait.** L'instant écrit est celui du
 * SERVEUR (`participant-ban-core.ts` pose `new Date()`), et c'est délibéré :
 * une date de bannissement fournie par l'appelant serait antidatable, donc
 * capable de recouvrir rétroactivement des messages. Le champ dit « bannis »,
 * son contenu ne dit rien de plus.
 */

/** Les familles de champs — une par ÉCRITURE, donc une par éventail. */
export type FamilleDeChamp = 'rights' | 'role' | 'ban';

/** Le geste effectivement demandé, une fois la valeur de `bannedAt` lue. */
export type GesteDeParticipant = 'rights' | 'role' | 'ban' | 'unban';

export type LectureDeCorps =
  | { readonly genre: 'geste'; readonly geste: GesteDeParticipant; readonly champs: readonly string[] }
  | { readonly genre: 'aucun' }
  | { readonly genre: 'melange'; readonly familles: readonly FamilleDeChamp[]; readonly champs: readonly string[] };

/**
 * La table champ → famille, DÉRIVÉE de `PARTICIPANT_RIGHT_NAMES` plutôt que
 * retapée : un droit ajouté au dépôt entre dans la route fusionnée sans qu'on
 * ait à y penser, et surtout sans pouvoir y entrer dans la MAUVAISE famille.
 */
export const CHAMP_VERS_FAMILLE: Readonly<Record<string, FamilleDeChamp>> = Object.freeze({
  ...Object.fromEntries(PARTICIPANT_RIGHT_NAMES.map((nom) => [nom, 'rights' as const])),
  historyVisibleFrom: 'rights',
  role: 'role',
  bannedAt: 'ban',
});

/** Les noms que le corps admet — le schéma de la route les lit ici, une seule liste. */
export const CHAMPS_DE_PATCH: readonly string[] = Object.keys(CHAMP_VERS_FAMILLE);

const estObjetIndexable = (corps: unknown): corps is Readonly<Record<string, unknown>> =>
  typeof corps === 'object' && corps !== null && !Array.isArray(corps);

/**
 * Lit le corps SANS assertion de type — même discipline que
 * `participant-rights-core.ts` : Fastify l'a déjà validé
 * (`additionalProperties: false`), mais le type déclaré par la route ne porte
 * aucune signature d'index.
 *
 * Un champ posé à `undefined` est traité comme ABSENT : `JSON.parse` ne produit
 * jamais cette valeur, et la lire comme « nommé » ferait refuser un corps qu'un
 * appelant a construit en étalant un objet partiel.
 */
export function lireGesteDeParticipant(corps: unknown): LectureDeCorps {
  const objet = estObjetIndexable(corps) ? corps : {};

  const champs = CHAMPS_DE_PATCH.filter((nom) => objet[nom] !== undefined);
  if (champs.length === 0) return { genre: 'aucun' };

  const familles = [...new Set(champs.map((nom) => CHAMP_VERS_FAMILLE[nom]))];
  if (familles.length > 1) return { genre: 'melange', familles, champs };

  const famille = familles[0];
  if (famille === 'ban') {
    return { genre: 'geste', geste: objet.bannedAt === null ? 'unban' : 'ban', champs };
  }
  return { genre: 'geste', geste: famille, champs };
}
