import type { FreezeMessageStatusParams } from './freezeMessageStatus';

/**
 * La cascade « LU ⇒ REMIS », et sa BORNE (#20105).
 *
 * Un message ne peut pas être lu sans avoir d'abord été remis. Quand un
 * destinataire ouvre une conversation dont des messages n'ont jamais été
 * marqués reçus — il était hors ligne à leur arrivée, donc ni accusé de
 * livraison ni auto-remise n'ont tourné — n'avancer que la lecture laisse la
 * frontière de livraison DERRIÈRE celle de lecture, et l'expéditeur voit la
 * coche « lu » devant la coche « remis ». D'où cette cascade.
 *
 * ─── POURQUOI ELLE VIT ICI, ET PAS DANS SON APPELANT ────────────────────────
 *
 * `MessageReadStatusService` pèse deux fois le plafond de 1 200 lignes, et la
 * directive interdit d'y AJOUTER avant d'en avoir extrait — c'est le motif
 * d'extraction de `freezeMessageStatus` (#7451), repris tel quel.
 *
 * Mais il y a une seconde raison, propre à ce lot : **la cascade et la lecture
 * qu'elle suit doivent se borner au MÊME endroit**. Les deux écritures de
 * lecture de `markMessagesAsRead` sont bornées — `messageIds` en mode exact,
 * `until: caughtUpAt` en mode fenêtre — et cette cascade ne l'était pas : elle
 * partait du DERNIER message non supprimé de la conversation, que la méthode
 * résout elle-même quand l'appelant n'en nomme aucun (ce que fait la porte
 * REST, `receipts.ts` passant `undefined` en `latestMessageId`). Sur
 * `{ type: 'read', messageIds: [M1, M2, M3] }` dans un fil de quarante :
 *
 * | écriture | borne d'avant #20105 |
 * |---|---|
 * | curseur de LECTURE | préfixe contigu PROUVÉ ⇒ M3 |
 * | gel de LECTURE | `until: caughtUpAt` ⇒ M1…M3 |
 * | **curseur de LIVRAISON** | **M40**, le bas du fil |
 * | **gel de LIVRAISON** | **M1…M40** |
 *
 * Et le commentaire de la cascade appelait DÉJÀ le gel de lecture sa
 * « jumelle », en ajoutant qu'« une règle qu'il faut retaper à chaque endroit
 * est une règle qu'un endroit finira par ne pas avoir ». Les deux divergeaient
 * précisément sur cette règle. {@link ReportedReadFrontier} est la réponse de
 * structure : la frontière cesse d'être une règle à retaper et devient une
 * VALEUR que la lecture calcule et transmet.
 *
 * ─── CE QUE LA SUR-DÉCLARATION COÛTE ───────────────────────────────────────
 *
 * 1. chez l'auteur, quarante bulles passent ✓✓ quand le lecteur a prouvé n'en
 *    avoir affiché que trois — irréversible, le gel étant write-once et le
 *    curseur monotone ;
 * 2. sous `EXACT_READ_TRACKING_SINCE` (armée en staging ET en production),
 *    `MessageStatusEntry.deliveredAt` est la SEULE autorité : rien ne rejoue un
 *    trou situé SOUS le curseur ;
 * 3. le gel de livraison DÉMARRE les décomptes éphémères de tout ce qu'il grave
 *    (#7451, et il ANNONCE `message:countdown-started` aux deux rooms) :
 *    afficher les trois premiers messages d'un fil mettait à brûler un éphémère
 *    resté trente-sept messages plus bas, que personne n'avait reçu. C'est le
 *    seul des trois effets qui DÉTRUISE du contenu, et il n'était dans aucun
 *    constat.
 */

/**
 * La frontière que le lecteur a RAPPORTÉE, telle que la moitié LECTURE l'a
 * résolue — un type SOMME, parce que les deux modes ne bornent pas la même
 * chose et qu'aucun booléen ne peut le dire.
 *
 * - `exact` : le client NOMME les messages affichés. La liste EST la borne, et
 *   « lu » implique « remis » de ces messages-là, d'aucun autre.
 * - `window` : forme héritée (« marquer la conversation lue »). La borne est la
 *   position chronologique du message jusqu'auquel le lecteur déclare être
 *   arrivé, ou `null` — la fenêtre monte alors jusqu'à l'horloge de l'appel, et
 *   la lecture déclarant déjà LU toute cette fenêtre, en déclarer la livraison
 *   n'ajoute aucune affirmation.
 */
export type ReportedReadFrontier =
  | { readonly kind: 'exact'; readonly messageIds: readonly string[] }
  | {
      readonly kind: 'window';
      /** `createdAt` de la frontière rapportée, ou `null` si rien ne l'est. */
      readonly until: Date | null;
      /** Le message sur lequel le curseur de livraison se pose. */
      readonly cursorTo: string;
    };

/**
 * Les trois opérations que la cascade emprunte à son hôte. Passées en
 * paramètres plutôt qu'importées : elles portent l'état Prisma et les gardes de
 * fraîcheur du curseur, qui restent la responsabilité du service.
 */
export interface ReadDeliveryCascadeOps {
  /** `freezeMessageStatus` lié au prisma de l'hôte. */
  readonly freeze: (params: FreezeMessageStatusParams) => Promise<number>;
  /** Avance `lastDeliveredMessageId`/`lastDeliveredAt`. `true` si créé ou avancé. */
  readonly advanceDeliveryCursor: (messageId: string) => Promise<boolean>;
  /**
   * Dernier message du plus long préfixe contigu dont une entrée FIGÉE prouve
   * la livraison, ou `null` si le premier ne la prouve pas.
   */
  readonly provenDeliveredPrefix: (since: Date | null) => Promise<string | null>;
}

export interface CascadeReadToDeliveredParams {
  readonly participantId: string;
  readonly conversationId: string;
  /** POSITION du curseur de livraison précédent — jamais l'horloge murale (#19261). */
  readonly since: Date | null;
  readonly at: Date;
  readonly frontier: ReportedReadFrontier;
}

/**
 * Grave `deliveredAt` et avance le curseur de livraison sur le périmètre que
 * la LECTURE vient d'acquitter — et sur rien d'autre.
 *
 * Idempotente dans les deux modes : le gel est write-once et la garde du
 * curseur est un no-op quand la livraison est déjà en avance. Sur le chemin
 * sain (remis puis lu), elle n'écrit rien.
 */
export async function cascadeReadToDelivered(
  ops: ReadDeliveryCascadeOps,
  { participantId, conversationId, since, at, frontier }: CascadeReadToDeliveredParams,
): Promise<void> {
  if (frontier.kind === 'exact') {
    // Le GEL d'abord, le curseur ensuite — l'ordre que `markMessagesAsReceived`
    // tient en mode exact (#18731), et pour sa raison exacte : ce que
    // `provenDeliveredPrefix` interroge est l'entrée FIGÉE, et c'est ce gel-ci
    // qui vient de l'écrire. Dans l'autre ordre, le curseur ne pourrait JAMAIS
    // franchir un message dont cet appel est le premier à prouver la livraison.
    await ops.freeze({
      participantId,
      conversationId,
      // INERTE ici — la liste EST la borne, `freezeMessageStatus` ignorant
      // `since` dès qu'elle est nommée. Il reçoit quand même la POSITION et
      // jamais l'horloge : une valeur fausse mais inexploitée est un piège armé,
      // pas une économie (règle du cycle 84). Même traitement qu'aux deux autres
      // sites exacts du service hôte.
      since,
      at,
      field: 'deliveredAt',
      messageIds: frontier.messageIds,
    });

    // Le curseur ne franchit que ce qu'une entrée figée PROUVE remis — pas ce
    // que l'accusé nomme, et surtout pas le bas du fil. Le trou le plus fréquent
    // (une arrivée évincée au plafond de 500 de la file de remise, que le drain
    // ne voit jamais) est ANTÉRIEUR au dernier message livré : aucune borne ne
    // l'exclut, seule la contiguïté le voit.
    const target = await ops.provenDeliveredPrefix(since);

    // Pas de cible ⇒ le curseur reste en place, et c'est le verdict juste : un
    // curseur qui n'avance pas sert une réponse plus PAUVRE (les entrées figées
    // répondent seules), jamais une réponse FAUSSE. Il est monotone, donc rien
    // de ce qu'il affirmait déjà n'est retiré.
    //
    // Il ne SAUTE pas non plus à la frontière de rattrapage, à la différence du
    // curseur de LECTURE : ce saut-là est une décision produit sur le BADGE
    // (« sans élargir d'un seul message l'ensemble déclaré LU »), et l'étendre à
    // la livraison rouvrirait par le curseur la sur-déclaration qu'on vient de
    // fermer. L'état impossible que cette cascade existe pour empêcher ne
    // revient pas pour autant : `resolveReceivedAt` retombe en DERNIER ressort
    // sur `readAt` — « on ne lit pas ce qu'on n'a pas reçu » — si bien que
    // `deliveredCount >= readCount` ne dépend d'aucun curseur.
    if (target) await ops.advanceDeliveryCursor(target);
    return;
  }

  const advanced = await ops.advanceDeliveryCursor(frontier.cursorTo);
  if (!advanced) return;

  await ops.freeze({
    participantId,
    conversationId,
    // #19261 — la POSITION, comme le gel de lecture de ce mode. Cette cascade en
    // est la JUMELLE, et c'est à ces deux lignes-ci que le mot s'honore : la
    // borne basse ET la borne haute sont les SIENNES, prises aux mêmes
    // variables.
    since,
    at,
    field: 'deliveredAt',
    until: frontier.until,
  });
}
