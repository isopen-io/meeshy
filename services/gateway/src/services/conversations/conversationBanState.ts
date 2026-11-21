/**
 * Ce qu'un bannissement RETIRE, et ce qu'un débannissement doit RENDRE.
 *
 * Les deux moitiés du geste écrivaient sans condition :
 *
 * ```ts
 * ban:   data: { bannedAt: now,  isActive: false, leftAt: now  }
 * unban: data: { bannedAt: null, isActive: true,  leftAt: null }
 * ```
 *
 * Et `PATCH …/ban` cherche sa cible **sans filtrer `isActive`** — délibérément :
 * bannir un ancien membre est précisément ce qui l'empêche de revenir par un
 * lien de partage, `resolveConversationEntry` refusant toute entrée sur
 * `bannedAt` (cf. `conversationEntryAdmission.ts`). Cette capacité est réelle et
 * n'est pas retirée ici.
 *
 * Mais composées sur un ancien membre, les deux écritures inconditionnelles
 * font autre chose que ce que leurs noms annoncent :
 *
 *  1. **Bannir efface le départ.** `leftAt` est réécrit à l'instant du
 *     bannissement, alors qu'il datait un départ volontaire vieux de plusieurs
 *     mois. L'information n'est pas remplacée par une meilleure : elle est
 *     perdue, et c'est elle qui aurait permis au débannissement de savoir quoi
 *     rendre.
 *  2. **Débannir fait entrer.** `{ isActive: true, leftAt: null }` sur une
 *     personne que le bannissement n'avait pas sortie — parce qu'elle était
 *     déjà dehors — n'annule rien : ça CRÉE une appartenance. Le débannissement
 *     devient alors une **quatrième porte d'entrée** dans la conversation, la
 *     seule qui n'obéisse pas à `resolveConversationEntry`, qui ne redonne ni
 *     rang ni permissions de nouvel arrivant (l'ancien `admin` retrouve son rang
 *     dans une ligne périmée — l'inverse exact de ce que la leçon 89 exige), et
 *     qui rebranche de force les sockets de quelqu'un qui était parti seul.
 *
 * Le correctif ne change pas ce que le geste veut dire, il le rend exact :
 * **un débannissement rend ce que le bannissement a pris, ni plus ni moins.**
 * Sur le cas courant — bannir un membre actif, puis le débannir — l'écriture est
 * identique à celle d'avant, au champ près.
 *
 * ─── LA TRACE ────────────────────────────────────────────────────────────────
 *
 * Savoir « le bannissement a-t-il mis fin à l'appartenance ? » ne demande aucun
 * champ nouveau : `resolveBanWrite` laisse la réponse dans la ligne.
 *
 * | ce qui s'est passé              | `leftAt`            | `bannedAt` |
 * |---------------------------------|---------------------|------------|
 * | banni alors qu'il était membre  | instant du ban      | le même    |
 * | banni alors qu'il était parti   | son départ, intact  | plus tard  |
 *
 * L'égalité est **exacte par construction** — les deux champs reçoivent le même
 * objet `Date`, jamais deux lectures d'horloge — et non une comparaison à la
 * milliseconde près qu'une coïncidence pourrait tromper.
 *
 * Les lignes écrites AVANT ce cycle portent toutes `leftAt === bannedAt`,
 * puisque l'ancien bannissement écrivait les deux ensemble : elles sont donc
 * lues comme « le bannissement a mis fin à l'appartenance », ce qui reproduit à
 * l'identique le comportement qu'elles ont toujours eu. Aucune réparation de
 * base n'est nécessaire.
 */

/** Ce que la route doit avoir lu de la ligne avant de décider. */
export interface ParticipantBanState {
  readonly isActive?: boolean | null;
  readonly leftAt?: Date | null;
  readonly bannedAt?: Date | null;
}

export type BanUpdateData =
  /**
   * La cible était DÉJÀ dehors : on marque l'interdiction et on REPOSE
   * `isActive: false` — no-op sur une ligne inactive, et recouvrement d'une
   * rentrée qui aurait gagné la course (#19688). `leftAt` n'y figure pas : la
   * date du départ d'origine est gardée.
   */
  | { readonly bannedAt: Date; readonly isActive: false }
  /** La cible était VIVANTE : le bannissement EST son départ, et le date. */
  | { readonly bannedAt: Date; readonly isActive: false; readonly leftAt: Date };

export type UnbanUpdateData =
  | { readonly bannedAt: null }
  | { readonly bannedAt: null; readonly isActive: true; readonly leftAt: null };

export interface BanTransition {
  readonly data: BanUpdateData;
  /** Vrai quand ce bannissement retire une appartenance vivante — ce que les compteurs de membres doivent suivre. */
  readonly membershipEnded: boolean;
}

export interface UnbanTransition {
  readonly data: UnbanUpdateData;
  /** Vrai quand ce débannissement rend l'appartenance que le bannissement avait prise. */
  readonly membershipRestored: boolean;
}

/**
 * Un membre déjà parti n'a plus d'appartenance à retirer : le bannissement ne
 * marque que l'interdiction de revenir, et laisse la date du départ intacte.
 *
 * `isActive` absent de la lecture ne prouve aucun départ antérieur — on écrit
 * alors ce que le bannissement a toujours écrit.
 *
 * #19688 (audit adversarial) — cette branche écrivait `{ bannedAt }` SEUL, et
 * c'était la MOITIÉ MIROIR de la course que les trois portes de rentrée
 * viennent de fermer. Dans l'ordre inverse — le bannissement LIT une ligne
 * inactive, une rentrée commet, puis le bannissement commet sur un
 * `where: { id }` sans garde d'état — la ligne finissait
 * **`isActive: true, bannedAt ≠ null`** : exactement l'état interdit, par
 * l'autre bout, et COLLANT (rebannir est refusé en `400 « déjà banni »`).
 *
 * Le correctif est dans la DONNÉE, et il est strictement meilleur qu'une garde
 * de `where` ici : `isActive: false` est un **no-op** sur une ligne réellement
 * inactive, et il ÉCRASE la rentrée qui aurait gagné la course — ce qui est le
 * bon verdict, un banni étant dehors. `leftAt` n'est PAS réécrit : garder la
 * date du départ d'origine est la raison d'être de cette branche.
 *
 * `membershipEnded` reste `false`, et c'est assumé : il se décide sur ce que la
 * LECTURE a vu, et dans la course il sous-compte d'une unité une appartenance
 * que la rentrée venait de rendre. Un compteur de membres qui dérive dans une
 * course rare n'a pas le même coût qu'une évasion de bannissement ; le dériver
 * du résultat de l'écriture est un lot à lui (suivi ouvert).
 */
export function resolveBanWrite(participant: ParticipantBanState, bannedAt: Date): BanTransition {
  if (participant.isActive === false) {
    return { data: { bannedAt, isActive: false }, membershipEnded: false };
  }

  return {
    data: { bannedAt, isActive: false, leftAt: bannedAt },
    membershipEnded: true,
  };
}

/**
 * Le bannissement est levé dans tous les cas — sinon « débannir » ne lèverait
 * rien, et `resolveConversationEntry` continuerait de refuser toute porte.
 * L'appartenance, elle, n'est rendue que si le bannissement l'avait prise.
 */
export function resolveUnbanWrite(participant: ParticipantBanState): UnbanTransition {
  const { leftAt, bannedAt } = participant;
  const departurePrecededBan =
    leftAt != null && bannedAt != null && leftAt.getTime() !== bannedAt.getTime();

  if (departurePrecededBan) {
    return { data: { bannedAt: null }, membershipRestored: false };
  }

  return {
    data: { bannedAt: null, isActive: true, leftAt: null },
    membershipRestored: true,
  };
}

/**
 * Le bannissement levé, l'appartenance NON rendue : la loi de la communauté
 * qui héberge le salon refuse d'y faire rentrer la personne (#16703).
 */
export function liftBanOnly(): UnbanTransition {
  return { data: { bannedAt: null }, membershipRestored: false };
}
