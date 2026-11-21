import { unsetOrNull } from '../../utils/prisma-unset';

/**
 * L'ÉCRITURE d'une réintégration, et la seule garde qui la rende sûre.
 *
 * `resolveConversationEntry` refuse un banni — c'est vrai, c'est testé, et ce
 * n'est pas suffisant. Entre la DÉCISION (`outcome: 'rejoin'`, prise sur une
 * lecture) et l'ÉCRITURE qui rallume la ligne, un bannissement peut commettre :
 *
 * | t  | ce qui se passe                                                                 | état de la ligne                     |
 * |----|---------------------------------------------------------------------------------|--------------------------------------|
 * | t1 | une porte lit la ligne : inactive, non bannie ⇒ `outcome: 'rejoin'`              | `isActive: false`                    |
 * | t2 | un modérateur bannit. `resolveBanWrite` lit `isActive: false` ⇒ n'écrit QUE `bannedAt` | `isActive: false`              |
 * | t3 | le bannissement commet                                                           | `isActive: false, bannedAt`          |
 * | t4 | la porte commet `{ ...REJOIN_PARTICIPANT_STATE }` — sans toucher `bannedAt`       | **`isActive: true, bannedAt ≠ null`** |
 *
 * Une ligne ACTIVE et BANNIE est lue comme vivante par toute lecture
 * `userId + isActive: true` NUE — et il y en a 199 au relevé de #19677 (liste
 * des conversations, envoi REST, push, aperçu socket). Le prédicat qui la
 * refuse EXISTE (`PARTICIPATION_VIVANTE`, `isActive` + `bannedAt`) ; ce sont les
 * sites qui ne l'emploient pas tous, et c'est l'état exact que #19525, #19604 et
 * #19676 refusent.
 *
 * La garde est donc AUSSI dans le `where` de l'écriture : un bannissement tombé
 * dans la fenêtre fait que la ligne ne s'apparie plus, Prisma lève `P2025`, et
 * la porte refuse.
 *
 * **La MOITIÉ MIROIR de cette course est fermée par `resolveBanWrite`**
 * (`conversationBanState.ts`), relevée par l'audit adversarial de ce lot :
 * dans l'ordre inverse — le bannissement LIT une ligne inactive, une rentrée
 * commet, puis le bannissement commet — c'était son écriture qui produisait le
 * même état. Fermer une seule des deux écritures ferme une moitié de fenêtre.
 * Une course a DEUX côtés, et la question « l'état que cette écriture POSE
 * est-il encore légitime quand elle commet ? » se pose aux deux. C'est la discipline que `restore-for-me.ts` porte depuis
 * #10436/#10443 — **la QUATRIÈME porte de rentrée, la seule à l'avoir reçue** —
 * reprise ici EN ENTIER, `catch` compris : `P2025` ne dit que « plus
 * d'appariement », c'est-à-dire bannie OU disparue, et ces deux causes ne
 * rendent pas le même refus. La relecture les sépare.
 *
 * Pourquoi une unité partagée plutôt que trois copies : les trois portes
 * écrivent la même transition, et une règle qu'il faut retaper à chaque site
 * est une règle qu'un site finira par ne pas avoir — c'est exactement ce qui
 * s'est passé, le commentaire de `restore-for-me` ne documentant que
 * l'exemplaire qu'il touche. Le refus, lui, reste à la porte : chacune a sa
 * forme (403 `BANNED`, un verdict de lot, un `sendForbidden`), et c'est elle
 * qui sait la rendre.
 */
export type RejoinWriteOutcome<TRow> =
  /** La ligne était toujours réintégrable : elle est rallumée. */
  | { readonly outcome: 'rejoined'; readonly participant: TRow }
  /** Un bannissement a commis dans la fenêtre — la relecture le PROUVE. */
  | { readonly outcome: 'banned' }
  /** La ligne ne s'apparie plus et n'est pas bannie : elle a disparu. Fail-closed, aucune recréation silencieuse. */
  | { readonly outcome: 'vanished' };

/**
 * Les deux appels que l'écriture demande, en structural : le double de test
 * reste trivial et l'unité n'importe pas `PrismaClient` — même motif que
 * `ConversationEntryReader`, de l'autre côté de la même décision.
 */
export interface RejoinWriter<TRow> {
  participant: {
    update(args: { where: Record<string, unknown>; data: Record<string, unknown>; include?: Record<string, unknown> }): Promise<TRow>;
    findFirst(args: { where: { id: string }; select: { bannedAt: true } }): Promise<{ bannedAt?: Date | null } | null>;
  };
}

export interface RejoinWriteParams<TRow> {
  readonly prisma: RejoinWriter<TRow>;
  /** La ligne que `resolveConversationEntry` a désignée (`outcome: 'rejoin'`). */
  readonly participantId: string;
  /** Ce que la porte écrit — `REJOIN_PARTICIPANT_STATE` répandu avec ses propres champs. */
  readonly data: Record<string, unknown>;
  /** L'`include` de la porte, quand elle sert la ligne écrite (l'invitation rend son membre). */
  readonly include?: Record<string, unknown>;
}

const isP2025 = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'P2025';

/**
 * Ce que vaut `bannedAt` quand la relecture de la cause n'a PAS conclu : une
 * date, donc le verdict `'banned'`. Fail-CLOSED — les deux verdicts refusent,
 * et celui-ci n'invente pas une ligne disparue qu'on n'a pas lue.
 */
const UNREADABLE = new Date(0);

export async function commitParticipantRejoin<TRow>(
  params: RejoinWriteParams<TRow>
): Promise<RejoinWriteOutcome<TRow>> {
  const { prisma, participantId, data, include } = params;

  try {
    const participant = await prisma.participant.update({
      where: { id: participantId, ...unsetOrNull('bannedAt') },
      data,
      ...(include ? { include } : {}),
    });
    return { outcome: 'rejoined', participant };
  } catch (error) {
    if (!isP2025(error)) throw error;
    // La relecture ne sert qu'à NOMMER la cause ; le refus est déjà acquis —
    // `P2025` dit que la ligne ne s'apparie plus, donc rien n'a été rallumé.
    // Elle est donc entourée de sa propre garde : si elle LÈVE, laisser
    // l'exception remonter ferait tomber le geste ENTIER (`admitConversationMember`
    // rend un verdict par identifiant pour qu'un refus n'emporte pas le lot ;
    // son appelant traduit toute exception en 500, après avoir déjà ajouté,
    // annoncé et notifié les identifiants précédents). On rend alors le verdict
    // le plus FERMÉ des deux : « banni » refuse comme « disparue », et c'est la
    // cause la plus probable d'un `P2025` sur cette écriture-ci, dont le `where`
    // ne porte que l'id et la garde.
    const current = await prisma.participant
      .findFirst({ where: { id: participantId }, select: { bannedAt: true } })
      .catch(() => ({ bannedAt: UNREADABLE }));
    return current?.bannedAt ? { outcome: 'banned' } : { outcome: 'vanished' };
  }
}
