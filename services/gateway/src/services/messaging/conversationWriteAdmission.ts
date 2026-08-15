/**
 * Ce que l'état de la CONVERSATION interdit à ses membres d'y écrire.
 *
 * ─── LE DÉFAUT : LA RÈGLE EXISTAIT, SUR UN CHEMIN QUE PERSONNE N'EMPRUNTE ───
 *
 * `MessageValidator.checkPermissions` portait cette règle en entier — la
 * hiérarchie `everyone < member < moderator < admin < creator`, la dispense de
 * la conversation globale, l'échappatoire du staff plateforme. Elle n'avait
 * **aucun appelant de production** : un `grep` sur le monorepo ne rendait que
 * son propre fichier de test. `MessagingService.handleMessage` — l'entonnoir
 * par lequel passent les trois transports d'envoi (REST, socket texte, socket
 * pièces jointes) — n'appelle du validateur que `validateRequest` et
 * `resolveConversationId`. Il vérifie l'appartenance ACTIVE du participant, et
 * plus rien de l'état du conteneur dans lequel il écrit.
 *
 * Deux promesses tombaient donc ensemble, pour la même raison :
 *
 *  1. **Le canal d'annonces n'annonçait rien.** `POST /conversations` avec
 *     `type: 'broadcast'` écrit `{ isAnnouncementChannel: true,
 *     defaultWriteRole: 'admin' }` ; `PATCH /conversations/:id` laisse un admin
 *     basculer n'importe quel groupe dedans ; la liste de conversations
 *     sélectionne le drapeau et le sert aux clients ; le schéma le documente en
 *     toutes lettres (« only creator/admins can write, overrides
 *     defaultWriteRole »). Le serveur ne l'a jamais fait respecter : **tout
 *     membre pouvait écrire dans un canal d'annonces**, et il suffisait pour
 *     cela du client officiel — aucune requête forgée.
 *  2. **Une conversation FERMÉE acceptait encore des messages.** `isActive:
 *     false` est l'état terminal du conteneur (écrit par `DELETE
 *     /conversations/:id`, par les deux branches de clôture de
 *     `delete-for-me.ts` et par `leave.ts`). Aucun chemin d'écriture ne le
 *     lisait. Un participant resté actif d'une conversation close y écrivait
 *     normalement — message persisté, diffusé, traduit.
 *
 * ─── POURQUOI UNE UNITÉ, ET POURQUOI ICI ────────────────────────────────────
 *
 * Même raisonnement que `forwardAdmission` : les transports convergent sur
 * `handleMessage`, donc un garde par route serait la troisième copie d'une
 * règle de permission — et la démonstration que les copies divergent est déjà
 * faite dans ce dépôt (`messageEditAdmission`, quatre copies, quatre règles
 * différentes). L'unité prend un lecteur STRUCTUREL : le double de test reste
 * trivial et l'unité n'importe pas `PrismaClient`.
 *
 * ─── LE COÛT, ET OÙ IL EST PAYÉ ─────────────────────────────────────────────
 *
 * Une lecture de conversation par envoi, quatre scalaires. C'est l'ordre de
 * grandeur que le chemin paie DÉJÀ (`MessageProcessor.getEncryptionContext`
 * lit la conversation à chaque message). Aucun cache n'est introduit : une
 * police d'écriture mise en cache 30 s laisserait une conversation clôturée
 * accepter des messages pendant une demi-minute, et ce dépôt s'est déjà fait
 * mordre par exactement cette forme (`participant-lookup-cache`, la note sur
 * `unban`). Une autorisation se lit fraîche.
 *
 * Le rang du participant, lui, n'est lu QUE si la conversation restreint
 * réellement l'écriture — c'est-à-dire jamais sur le chemin nominal (groupe ou
 * DM ordinaire, `defaultWriteRole: 'everyone'`). Et le rôle de conversation et
 * le rôle global de plateforme arrivent en UNE lecture, jamais deux.
 *
 * ─── L'ASYMÉTRIE DES ÉCHECS EST LA RÈGLE, PAS UNE COMMODITÉ ─────────────────
 *
 * - **La police illisible ⇒ ADMETTRE.** Ce garde AJOUTE une restriction qui
 *   n'existait pas ; un hoquet de base ne doit pas transformer un envoi
 *   ordinaire en erreur. C'est aussi ce qui protège les documents hérités : les
 *   trois champs « WRITE PERMISSIONS » sont ABSENTS de toute conversation créée
 *   avant leur migration, et un `undefined` y dégénère en « aucune restriction »
 *   — l'état exact d'avant ce module.
 * - **Le rang illisible ⇒ REFUSER.** Ici la restriction est CONNUE ; seule
 *   l'identité manque. Admettre ouvrirait le canal d'annonces à tout le monde
 *   pendant la panne. On refuse ce qu'on ne peut pas prouver.
 *
 * ─── CE QUE CE MODULE NE FAIT PAS ───────────────────────────────────────────
 *
 * `Conversation.slowModeSeconds` est de la même famille (un réglage de conteneur
 * que personne n'applique) mais demande un état « dernier envoi par personne »
 * qui n'existe nulle part : c'est un limiteur de débit, pas une admission.
 * `Participant.permissions.canSendMessages` et les droits du lien de partage
 * sont appliqués par `routes/links/messages.ts` sur le chemin REST anonyme, et
 * relèvent d'une passe qui leur est propre.
 */

/** La hiérarchie d'écriture, telle que `defaultWriteRole` la nomme au schéma. */
const WRITE_ROLE_RANK: Readonly<Record<string, number>> = {
  everyone: 0,
  member: 1,
  moderator: 2,
  admin: 3,
  creator: 4,
};

/** Rang exigé par un canal d'annonces — il PRIME sur `defaultWriteRole`. */
const ANNOUNCEMENT_REQUIRED_ROLE = 'admin';

/** Rôles `User.role` qui écrivent partout, quel que soit leur rang local. */
const PLATFORM_STAFF_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'BIGBOSS', 'MODERATOR']);

export type ConversationWriteRefusal =
  /** `Conversation.isActive === false` — l'état terminal du conteneur. */
  | 'conversation-closed'
  /** Le rang du participant est sous celui que la conversation exige. */
  | 'write-role-insufficient';

export type ConversationWriteAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: ConversationWriteRefusal };

/**
 * Les deux seules lectures que la décision demande, en structural.
 *
 * `participant.findUnique` rend le rang de conversation ET le rôle global dans
 * la même ligne : c'est la forme que `messageEditAdmission` emploie déjà, et
 * elle garantit que la branche restreinte coûte une lecture, pas deux.
 */
export interface ConversationWriteReader {
  conversation: {
    findUnique(args: {
      where: { id: string };
      select: {
        type: true;
        isActive: true;
        isAnnouncementChannel: true;
        defaultWriteRole: true;
      };
    }): Promise<{
      type?: string | null;
      isActive?: boolean | null;
      isAnnouncementChannel?: boolean | null;
      defaultWriteRole?: string | null;
    } | null>;
  };
  participant: {
    findUnique(args: {
      where: { id: string };
      select: { role: true; user: { select: { role: true } } };
    }): Promise<{ role?: string | null; user?: { role?: string | null } | null } | null>;
  };
}

export interface ConversationWriteAdmissionParams {
  prisma: ConversationWriteReader;
  /** `Conversation.id` déjà résolu — jamais un `identifier`. */
  conversationId: string;
  /** `Participant.id` de l'expéditeur, tel que l'entonnoir vient de le valider. */
  senderParticipantId: string;
  onError?: (error: unknown) => void;
}

const ADMIT: ConversationWriteAdmission = { admitted: true };
const REFUSE = (reason: ConversationWriteRefusal): ConversationWriteAdmission => ({
  admitted: false,
  reason,
});

export function isConversationWriteRefused(
  admission: ConversationWriteAdmission
): admission is { admitted: false; reason: ConversationWriteRefusal } {
  return admission.admitted === false;
}

export async function admitConversationWrite(
  params: ConversationWriteAdmissionParams
): Promise<ConversationWriteAdmission> {
  const { prisma, conversationId, senderParticipantId, onError } = params;

  let policy: Awaited<ReturnType<ConversationWriteReader['conversation']['findUnique']>>;
  try {
    policy = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        isActive: true,
        isAnnouncementChannel: true,
        defaultWriteRole: true,
      },
    });
  } catch (error) {
    onError?.(error);
    return ADMIT;
  }

  if (!policy) return ADMIT;

  // L'état terminal ne connaît aucune dispense — ni la conversation globale,
  // ni le créateur, ni le staff. On n'écrit pas dans ce qui est clos.
  if (policy.isActive === false) return REFUSE('conversation-closed');

  // La conversation globale n'a pas de hiérarchie d'écriture : tout le monde y
  // parle. C'est ce que la règle orpheline énonçait, et rien ne le contredit.
  if (policy.type === 'global') return ADMIT;

  const requiredRole = policy.isAnnouncementChannel
    ? ANNOUNCEMENT_REQUIRED_ROLE
    : policy.defaultWriteRole ?? 'everyone';
  const requiredRank = WRITE_ROLE_RANK[requiredRole] ?? 0;

  // Le chemin nominal s'arrête ici, sans avoir lu le moindre participant.
  if (requiredRank === 0) return ADMIT;

  let sender: Awaited<ReturnType<ConversationWriteReader['participant']['findUnique']>>;
  try {
    sender = await prisma.participant.findUnique({
      where: { id: senderParticipantId },
      select: { role: true, user: { select: { role: true } } },
    });
  } catch (error) {
    onError?.(error);
    return REFUSE('write-role-insufficient');
  }

  if (!sender) return REFUSE('write-role-insufficient');

  const senderRank = WRITE_ROLE_RANK[sender.role ?? ''] ?? 0;
  if (senderRank >= requiredRank) return ADMIT;

  const globalRole = sender.user?.role;
  if (globalRole && PLATFORM_STAFF_ROLES.has(globalRole)) return ADMIT;

  return REFUSE('write-role-insufficient');
}
