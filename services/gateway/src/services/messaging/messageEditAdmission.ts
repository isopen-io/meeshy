/**
 * L'unique énoncé de « qui peut éditer ce message, et jusqu'à quand ».
 *
 * La règle a vécu recopiée à QUATRE endroits — le handler socket
 * `message:edit`, `PUT /conversations/:id/messages/:messageId`,
 * `PUT /messages/:messageId` (transport du client iOS) et
 * `PATCH /messages/:messageId`. Les quatre copies avaient divergé, chacune
 * dans une direction différente :
 *
 * | entrée   | fenêtre 24h | modérateur admis | appartenance |
 * |----------|-------------|------------------|--------------|
 * | socket   | oui         | **non**          | implicite    |
 * | PUT conv | oui         | oui              | oui          |
 * | PUT msg  | **non**     | **non**          | **non**      |
 * | PATCH    | **non**     | **non**          | oui          |
 *
 * Un iPhone éditait donc un message vieux de trois ans que le web refusait
 * d'éditer, et le modérateur que l'UI web autorise à corriger un message se
 * voyait refuser dès qu'il passait par le composer (socket). Une règle de
 * permission recopiée n'est pas une règle : c'est quatre règles qui se
 * ressemblent le jour où on les écrit.
 *
 * ─── QUI APPELLE QUOI ────────────────────────────────────────────────────────
 *
 * Ces quatre entrées existent parce que quatre clients ont chacun choisi la
 * leur. **Aucune n'est morte.** Avant d'en retirer une, relire ce tableau — et
 * le re-vérifier, dans les QUATRE langages :
 *
 * | entrée                                    | client                                                              |
 * |-------------------------------------------|---------------------------------------------------------------------|
 * | socket `message:edit`                     | web (composer) — transport PRIMAIRE                                 |
 * | `PUT /conversations/:id/messages/:msgId`  | web (vue d'édition, porte un sélecteur de langue)                   |
 * | `PUT /messages/:messageId`                | iOS — `MeeshySDK/Services/MessageService.swift:133`                 |
 * | `PATCH /messages/:messageId`              | Android — `sdk-core/.../outbox/OutboxFlushWorker.kt:161`            |
 * |                                           | (rejeu des éditions faites HORS LIGNE)                              |
 *
 * Le cycle 35 a conclu que `PATCH` n'avait « aucun appelant de production »
 * après avoir cherché côté web seulement, et a recommandé de la retirer. La
 * déclaration Retrofit qui l'appelle — `@PATCH("messages/{id}")`,
 * `core/network/.../api/MessageApi.kt:34` — n'a ni slash initial ni
 * interpolation : elle échappe à tout motif écrit pour du TypeScript. La
 * retirer aurait transformé chaque flush d'édition offline d'Android en 404,
 * sans écran pour le dire. Voir `tasks/lessons.md`, leçon 88.
 */

import {
  isConversationClosed,
  type ConversationTerminalStateRow,
} from './conversationWriteAdmission.js';

/**
 * Les rôles GLOBAUX (`User.role`, en MAJUSCULES) qui ouvrent une porte de
 * modération sur le message d'autrui.
 *
 * Exporté pour `admitMessageDelete`, qui doit répondre EXACTEMENT la même chose
 * à « ce rôle global est-il privilégié ? ». Deux ensembles écrits séparément
 * dériveraient — c'est précisément la maladie que ces deux unités soignent.
 */
export const PRIVILEGED_GLOBAL_ROLES = new Set(['MODERATOR', 'ADMIN', 'BIGBOSS']);

/** 24 heures. La fenêtre ne vaut QUE pour l'auteur (voir `admitMessageEdit`). */
export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MessageEditRefusal =
  | 'not-author'
  | 'not-a-member'
  | 'edit-window-expired'
  /** Le conteneur porte son état terminal — son contenu est gelé pour tous. */
  | 'conversation-closed';

export type MessageEditAdmission =
  | {
      readonly admitted: true;
      /** L'éditeur n'est pas l'auteur : il édite au titre de son rôle global. */
      readonly asModerator: boolean;
      /** L'auteur a dépassé 24h et son rôle global lui a ouvert la porte. */
      readonly windowBypassed: boolean;
    }
  | { readonly admitted: false; readonly reason: MessageEditRefusal };

export type MessageEditRefused = Extract<MessageEditAdmission, { admitted: false }>;

/**
 * Ce qu'on DIT quand le conteneur est terminé — en UN exemplaire, et c'est déjà
 * la phrase du dépôt : `sharing.ts` et `participants.ts` refusent l'entrée dans
 * un fil clos avec ces mots exacts depuis le cycle 70. Même état, même phrase,
 * quel que soit le verbe refusé.
 *
 * Les autres motifs gardent le vocabulaire de LEUR transport, délibérément :
 * `PUT /messages/:messageId` rend un 404 volontairement indistinct pour ne pas
 * devenir un oracle d'existence (cf. `admitMessageEdit`), et unifier ses phrases
 * avec celles des routes conversation-scopées lui retirerait cette propriété.
 */
export const CONVERSATION_CLOSED_EDIT_MESSAGE = 'Cette conversation est terminée';

/**
 * Le gateway compile en `strict: false`, où TypeScript ne rétrécit PAS une
 * union sur un discriminant littéral booléen : `if (!admission.admitted)` laisse
 * le type entier, et `admission.reason` ne compile pas. Ce prédicat rend le
 * rétrécissement explicite — plutôt que d'affaiblir l'union en rendant `reason`
 * optionnel partout, ce qui autoriserait un refus SANS motif.
 */
export const isEditRefused = (admission: MessageEditAdmission): admission is MessageEditRefused =>
  !admission.admitted;

/**
 * Les deux seules lectures que la décision peut demander, en structural : le
 * double de test reste trivial et l'unité n'importe pas `PrismaClient`.
 *
 * Le rôle lu est le rôle **GLOBAL** (`User.role` : USER/MODERATOR/ADMIN/
 * BIGBOSS), jamais le rôle de conversation (`Participant.role` :
 * admin/moderator/member, en minuscules). Confondre les deux a déjà produit un
 * bypass mort — la comparaison minuscule/majuscule ne matchait jamais.
 */
export interface EditAdmissionReader {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { role: true };
    }): Promise<{ role?: string | null } | null>;
  };
  /**
   * Appartenance ET rôle en UNE lecture — c'est la forme que la route
   * conversation-scopée employait déjà (`include: { user: { select: { role } } }`).
   * La conserver garantit que l'unification n'ajoute aucun aller-retour : la
   * branche modérateur coûte exactement ce qu'elle coûtait.
   */
  participant: {
    findFirst(args: {
      where: { conversationId: string; userId: string; isActive: true };
      select: { id: true; user: { select: { role: true } } };
    }): Promise<{ id: string; user?: { role?: string | null } | null } | null>;
  };
}

export interface MessageEditAdmissionParams {
  prisma: EditAdmissionReader;
  editorUserId: string;
  message: {
    /** `User.id` de l'auteur — PAS le `Participant.id` que porte `senderId`. */
    authorUserId: string | null | undefined;
    conversationId: string;
    /**
     * L'état TERMINAL du conteneur — **exigé**, jamais optionnel.
     *
     * Les quatre transports d'édition chargent déjà le message ; élargir leur
     * `select` de deux colonnes ne coûte aucun aller-retour. Le rendre optionnel
     * rendrait la règle silencieusement INERTE chez le transport qui l'oublie —
     * et chez le CINQUIÈME, qui n'existe pas encore. Requis, il fait échouer la
     * compilation de toute entrée qui n'y répond pas (cf. le paramètre jumeau de
     * `resolveConversationEntry`, cycle 70).
     *
     * `null` reste permissif : une conversation absente de la projection de
     * l'appelant ne ferme rien — même contrat qu'`isConversationClosed`.
     */
    conversation: ConversationTerminalStateRow | null | undefined;
    createdAt: Date | string | null | undefined;
  };
  /** Injectable pour les tests ; `Date.now()` en production. */
  now?: number;
  onError?: (error: unknown) => void;
}

const REFUSE = (reason: MessageEditRefusal): MessageEditAdmission => ({ admitted: false, reason });

async function readGlobalRole(
  prisma: EditAdmissionReader,
  userId: string,
  onError?: (error: unknown) => void
): Promise<string | undefined> {
  try {
    const record = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return record?.role ?? undefined;
  } catch (error) {
    onError?.(error);
    return undefined;
  }
}

async function readActiveMembership(
  prisma: EditAdmissionReader,
  conversationId: string,
  userId: string,
  onError?: (error: unknown) => void
): Promise<{ globalRole: string | undefined } | null> {
  try {
    const membership = await prisma.participant.findFirst({
      where: { conversationId, userId, isActive: true },
      select: { id: true, user: { select: { role: true } } },
    });
    return membership ? { globalRole: membership.user?.role ?? undefined } : null;
  } catch (error) {
    onError?.(error);
    return null;
  }
}

/**
 * La règle, une fois :
 *
 * - **L'auteur** édite son message pendant 24 heures. Au-delà, seul un rôle
 *   global privilégié rouvre la porte.
 * - **Quelqu'un d'autre** n'édite que s'il est membre ACTIF de la conversation
 *   ET qu'il y porte un rôle global privilégié — les deux en UNE lecture. La
 *   fenêtre de 24h ne le concerne pas : un modérateur corrige précisément ce
 *   qui traîne depuis longtemps.
 * - **Personne**, quel que soit son rang, quand le CONTENEUR porte son état
 *   terminal (§ ci-dessous).
 *
 * Chaque branche coûte AU PLUS une lecture, et le chemin nominal (l'auteur,
 * dans sa fenêtre) n'en déclenche aucune. Toute lecture échoue FERMÉE : une
 * base illisible ne fabrique ni privilège ni appartenance.
 *
 * Un `createdAt` absent ou illisible n'a jamais bloqué personne (`NaN > w` est
 * faux) et ne bloque toujours pas : la comparaison est écrite dans ce sens
 * exprès, et la borne est inclusive (« 24h pile » est encore éditable).
 *
 * ─── L'ÉTAT TERMINAL PASSE EN DERNIER, ET C'EST DE LA SÉCURITÉ ───────────────
 *
 * `admitConversationWriteFor` tranche la clôture EN PREMIER ; cette unité la
 * tranche EN DERNIER, sur la seule décision qui allait être admise. L'écart est
 * délibéré, et tient au périmètre de l'appelant : le point de convergence de
 * l'envoi ne s'atteint qu'avec une conversation déjà résolue et une
 * appartenance déjà prouvée, quand `PUT /messages/:messageId` s'atteint avec un
 * `messageId` NU.
 *
 * Cette route rend **404** sur tout refus non temporel EXPRÈS, pour ne pas
 * devenir un oracle d'existence à qui sonde des ObjectIds. Trancher la clôture
 * avant l'autorisation lui rendrait exactement cet oracle — « ce message
 * existe, et son fil est clos » — à un inconnu, et le lui rendrait sur les
 * QUATRE transports d'un coup. Placée en dernier, la clôture ne se révèle qu'à
 * qui aurait été admis sans elle : aucun transport n'a de vocabulaire à
 * inventer pour la cacher, et chacun peut en dire le vrai motif.
 */
export async function admitMessageEdit(
  params: MessageEditAdmissionParams
): Promise<MessageEditAdmission> {
  const decision = await decideMessageEdit(params);

  if (decision.admitted && isConversationClosed(params.message.conversation)) {
    return REFUSE('conversation-closed');
  }

  return decision;
}

async function decideMessageEdit(
  params: MessageEditAdmissionParams
): Promise<MessageEditAdmission> {
  const { prisma, editorUserId, message, now = Date.now(), onError } = params;

  const isAuthor = Boolean(message.authorUserId) && message.authorUserId === editorUserId;

  if (!isAuthor) {
    const membership = await readActiveMembership(prisma, message.conversationId, editorUserId, onError);
    if (!membership) return REFUSE('not-a-member');

    const role = membership.globalRole;
    if (!role || !PRIVILEGED_GLOBAL_ROLES.has(role)) return REFUSE('not-author');

    return { admitted: true, asModerator: true, windowBypassed: false };
  }

  const ageMs = now - new Date(message.createdAt ?? NaN).getTime();
  if (!(ageMs > MESSAGE_EDIT_WINDOW_MS)) {
    return { admitted: true, asModerator: false, windowBypassed: false };
  }

  const role = await readGlobalRole(prisma, editorUserId, onError);
  if (!role || !PRIVILEGED_GLOBAL_ROLES.has(role)) return REFUSE('edit-window-expired');

  return { admitted: true, asModerator: false, windowBypassed: true };
}
