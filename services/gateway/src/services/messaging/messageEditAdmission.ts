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
 */

const PRIVILEGED_GLOBAL_ROLES = new Set(['MODERATOR', 'ADMIN', 'BIGBOSS']);

/** 24 heures. La fenêtre ne vaut QUE pour l'auteur (voir `admitMessageEdit`). */
export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MessageEditRefusal = 'not-author' | 'not-a-member' | 'edit-window-expired';

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
 *
 * Chaque branche coûte AU PLUS une lecture, et le chemin nominal (l'auteur,
 * dans sa fenêtre) n'en déclenche aucune. Toute lecture échoue FERMÉE : une
 * base illisible ne fabrique ni privilège ni appartenance.
 *
 * Un `createdAt` absent ou illisible n'a jamais bloqué personne (`NaN > w` est
 * faux) et ne bloque toujours pas : la comparaison est écrite dans ce sens
 * exprès, et la borne est inclusive (« 24h pile » est encore éditable).
 */
export async function admitMessageEdit(
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
