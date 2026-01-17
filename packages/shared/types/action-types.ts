/**
 * Action Types - Types d'actions canoniques
 *
 * Ce fichier centralise tous les types d'actions utilisés dans l'application.
 * Inclut les actions CRUD, les actions sur les messages, réactions, etc.
 *
 * @module action-types
 */

// ============================================================================
// CRUD ACTIONS - Actions de base Create/Read/Update/Delete
// ============================================================================

/**
 * Actions CRUD génériques
 * Utilisable pour toute entité supportant ces opérations
 */
export type CRUDAction = 'create' | 'read' | 'update' | 'delete';

/**
 * Actions CRUD étendues avec list et restore
 */
export type ExtendedCRUDAction =
  | CRUDAction
  | 'list'     // Liste des entités
  | 'restore'; // Restauration après soft delete

// ============================================================================
// REACTION ACTIONS - Actions sur les réactions
// ============================================================================

/**
 * Actions possibles sur une réaction
 */
export type ReactionAction = 'add' | 'remove';

/**
 * Type d'événement de réaction pour Socket.IO
 */
export interface ReactionEvent {
  action: ReactionAction;
  messageId: string;
  emoji: string;
  userId?: string;
  anonymousId?: string;
  timestamp: Date;
}

// ============================================================================
// MESSAGE ACTIONS - Actions sur les messages
// ============================================================================

/**
 * Actions possibles sur un message
 */
export type MessageAction =
  | 'send'       // Envoyer un message
  | 'edit'       // Modifier un message
  | 'delete'     // Supprimer un message
  | 'forward'    // Transférer un message
  | 'pin'        // Épingler un message
  | 'unpin'      // Désépingler un message
  | 'react'      // Ajouter une réaction
  | 'unreact'    // Retirer une réaction
  | 'translate'  // Demander une traduction
  | 'reply'      // Répondre à un message
  | 'report'     // Signaler un message
  | 'copy';      // Copier le contenu

/**
 * Actions qui nécessitent une confirmation utilisateur
 */
export const MESSAGE_ACTIONS_REQUIRING_CONFIRMATION: MessageAction[] = [
  'delete',
  'report',
];

/**
 * Actions qui modifient le message de manière irréversible
 */
export const IRREVERSIBLE_MESSAGE_ACTIONS: MessageAction[] = [
  'delete',
];

// ============================================================================
// CONVERSATION ACTIONS - Actions sur les conversations
// ============================================================================

/**
 * Actions possibles sur une conversation
 */
export type ConversationAction =
  | 'create'     // Créer une conversation
  | 'join'       // Rejoindre une conversation
  | 'leave'      // Quitter une conversation
  | 'archive'    // Archiver une conversation
  | 'unarchive'  // Désarchiver
  | 'delete'     // Supprimer
  | 'mute'       // Mettre en sourdine
  | 'unmute'     // Enlever la sourdine
  | 'pin'        // Épingler
  | 'unpin'      // Désépingler
  | 'encrypt'    // Activer le chiffrement
  | 'share'      // Partager (créer un lien)
  | 'settings';  // Modifier les paramètres

// ============================================================================
// MEMBER ACTIONS - Actions sur les membres
// ============================================================================

/**
 * Actions possibles sur un membre de conversation/communauté
 */
export type MemberAction =
  | 'add'        // Ajouter un membre
  | 'remove'     // Retirer un membre
  | 'promote'    // Promouvoir (augmenter le rôle)
  | 'demote'     // Rétrograder (diminuer le rôle)
  | 'ban'        // Bannir
  | 'unban'      // Débannir
  | 'mute'       // Mettre en sourdine
  | 'unmute'     // Enlever la sourdine
  | 'kick';      // Expulser temporairement

// ============================================================================
// USER ACTIONS - Actions utilisateur système
// ============================================================================

/**
 * Actions possibles sur un utilisateur (admin)
 */
export type UserAdminAction =
  | 'view'            // Voir les détails
  | 'edit'            // Modifier le profil
  | 'activate'        // Activer le compte
  | 'deactivate'      // Désactiver le compte
  | 'delete'          // Supprimer le compte
  | 'restore'         // Restaurer le compte
  | 'reset_password'  // Réinitialiser le mot de passe
  | 'change_role'     // Changer le rôle
  | 'unlock'          // Déverrouiller le compte
  | 'verify_email'    // Vérifier l'email
  | 'verify_phone';   // Vérifier le téléphone

// ============================================================================
// ATTACHMENT ACTIONS - Actions sur les pièces jointes
// ============================================================================

/**
 * Actions possibles sur une pièce jointe
 */
export type AttachmentAction =
  | 'upload'     // Uploader un fichier
  | 'download'   // Télécharger
  | 'view'       // Visualiser (prévisualisation)
  | 'delete'     // Supprimer
  | 'share'      // Partager
  | 'transcribe' // Transcrire (audio)
  | 'translate'; // Traduire (audio/texte)

// ============================================================================
// NOTIFICATION ACTIONS - Actions sur les notifications
// ============================================================================

/**
 * Actions possibles sur une notification
 */
export type NotificationAction =
  | 'view'         // Voir/lire la notification
  | 'dismiss'      // Ignorer
  | 'mark_read'    // Marquer comme lue
  | 'mark_unread'  // Marquer comme non lue
  | 'delete'       // Supprimer
  | 'action';      // Exécuter l'action associée

// ============================================================================
// READ STATUS ACTIONS - Actions de statut de lecture
// ============================================================================

/**
 * Type de mise à jour du statut de lecture
 */
export type ReadStatusAction =
  | 'read'      // Marquer comme lu
  | 'received'  // Marquer comme reçu
  | 'delivered'; // Marquer comme délivré

// ============================================================================
// TOGGLE ACTIONS - Actions binaires (on/off)
// ============================================================================

/**
 * Actions de type toggle (activation/désactivation)
 */
export type ToggleAction = 'enable' | 'disable';

/**
 * Helper pour inverser une action toggle
 */
export function toggleAction(action: ToggleAction): ToggleAction {
  return action === 'enable' ? 'disable' : 'enable';
}

// ============================================================================
// BINARY ACTIONS - Actions binaires génériques
// ============================================================================

/**
 * Actions binaires add/remove génériques
 * Utilisé pour: réactions, favoris, likes, etc.
 */
export type BinaryAction = 'add' | 'remove';

/**
 * Helper pour inverser une action binaire
 */
export function invertBinaryAction(action: BinaryAction): BinaryAction {
  return action === 'add' ? 'remove' : 'add';
}

// ============================================================================
// TRANSLATION ACTIONS - Actions de traduction
// ============================================================================

/**
 * Actions possibles pour la traduction
 */
export type TranslationAction =
  | 'request'    // Demander une traduction
  | 'cancel'     // Annuler une demande
  | 'retry'      // Réessayer après échec
  | 'clear';     // Effacer les traductions

// ============================================================================
// VOICE ACTIONS - Actions vocales
// ============================================================================

/**
 * Actions possibles pour les fonctionnalités vocales
 */
export type VoiceAction =
  | 'record'      // Enregistrer
  | 'stop'        // Arrêter l'enregistrement
  | 'play'        // Lire
  | 'pause'       // Mettre en pause
  | 'transcribe'  // Transcrire
  | 'translate'   // Traduire
  | 'clone';      // Cloner la voix

// ============================================================================
// MODERATION ACTIONS - Actions de modération
// ============================================================================

/**
 * Actions de modération sur le contenu
 */
export type ModerationAction =
  | 'approve'    // Approuver
  | 'reject'     // Rejeter
  | 'flag'       // Signaler
  | 'unflag'     // Retirer le signalement
  | 'hide'       // Masquer
  | 'unhide'     // Afficher
  | 'warn'       // Avertir l'utilisateur
  | 'escalate';  // Escalader à un niveau supérieur

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Vérifie si une action est une action CRUD
 */
export function isCRUDAction(action: string): action is CRUDAction {
  return ['create', 'read', 'update', 'delete'].includes(action);
}

/**
 * Vérifie si une action est binaire (add/remove)
 */
export function isBinaryAction(action: string): action is BinaryAction {
  return ['add', 'remove'].includes(action);
}

/**
 * Vérifie si une action nécessite une confirmation
 */
export function requiresConfirmation(action: MessageAction): boolean {
  return MESSAGE_ACTIONS_REQUIRING_CONFIRMATION.includes(action);
}
