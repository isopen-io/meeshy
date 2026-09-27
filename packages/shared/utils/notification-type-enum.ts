/**
 * L'énumération des types de notification — extraite de `validation.ts`
 * (hors budget de taille) pour qu'un type s'ajoute sans grossir ce fichier
 * (#8285). `validation.ts` la ré-exporte : l'adresse publique ne change pas.
 */

import { z } from 'zod';

/**
 * Types de notification
 * Valeurs complètes pour toutes les fonctionnalités du site
 *
 * Catégories:
 * - Messages: notifications liées aux messages
 * - Conversations: création, invitation, modifications
 * - Membres: rejoindre, quitter, promotions
 * - Contacts: demandes d'amis, acceptations
 * - Interactions: mentions, réactions
 * - Appels: manqués, entrants, terminés
 * - Traduction: transcriptions, traductions audio
 * - Sécurité: connexions, changements de mot de passe
 * - Modération: signalements, contenus supprimés
 * - Système: maintenance, annonces
 */
export const notificationTypeEnum = z.enum([
  // ===== MESSAGE EVENTS =====
  'new_message',           // Nouveau message reçu
  'message_reply',         // Réponse à votre message
  'message_edited',        // Message modifié
  'message_deleted',       // Message supprimé
  'message_pinned',        // Message épinglé
  'message_unpinned',      // Message désépinglé
  'message_forwarded',     // Message transféré

  // ===== CONVERSATION EVENTS =====
  'new_conversation',          // Nouvelle conversation (générique)
  'new_conversation_direct',   // Nouvelle conversation directe
  'new_conversation_group',    // Invitation à un groupe
  'conversation_archived',     // Conversation archivée
  'conversation_unarchived',   // Conversation désarchivée
  'conversation_deleted',      // Conversation supprimée
  'conversation_settings_changed', // Paramètres de conversation modifiés
  'added_to_conversation',     // Ajouté à une conversation
  'removed_from_conversation', // Retiré d'une conversation
  'conversation_encryption_enabled', // Chiffrement E2EE activé

  // ===== MEMBER/GROUP EVENTS =====
  'member_joined',        // Nouveau membre dans le groupe
  'member_left',          // Membre a quitté le groupe
  'member_removed',       // Membre retiré du groupe
  'member_promoted',      // Membre promu (admin/modérateur)
  'member_demoted',       // Membre rétrogradé
  'member_role_changed',  // Rôle de membre modifié

  // ===== CONTACT/FRIEND EVENTS =====
  'contact_request',      // Demande de contact reçue
  'contact_accepted',     // Demande de contact acceptée
  'contact_rejected',     // Demande de contact refusée
  'contact_blocked',      // Contact bloqué
  'contact_unblocked',    // Contact débloqué
  'friend_request',       // Alias pour contact_request
  'friend_accepted',      // Alias pour contact_accepted
  'contact_joined',       // Un contact du carnet a rejoint Meeshy (#8105)
  'contact_recently_active', // Un ami ou contact du carnet est revenu sur Meeshy (#8285)

  // ===== INTERACTION EVENTS =====
  'user_mentioned',       // Mentionné dans un message (@username)
  'mention',              // Alias pour user_mentioned
  'message_reaction',     // Réaction emoji à votre message
  'reaction',             // Alias pour message_reaction

  // ===== CALL EVENTS =====
  'missed_call',          // Appel manqué
  'incoming_call',        // Appel entrant
  'call_ended',           // Appel terminé
  'call_declined',        // Appel refusé
  'call_recording_ready', // Enregistrement d'appel disponible

  // ===== TRANSLATION/AUDIO EVENTS =====
  'translation_completed',    // Traduction terminée
  'translation_failed',       // Échec de traduction
  'transcription_completed',  // Transcription audio terminée
  'transcription_failed',     // Échec de transcription
  'voice_clone_ready',        // Modèle vocal prêt
  'voice_clone_failed',       // Échec du clonage vocal
  'audio_message_translated', // Message audio traduit

  // ===== SECURITY/ACCOUNT EVENTS =====
  'login_new_device',         // Connexion depuis un nouvel appareil
  'login_suspicious',         // Activité de connexion suspecte
  'password_changed',         // Mot de passe modifié
  'password_reset_requested', // Demande de réinitialisation
  'email_verified',           // Email vérifié
  'phone_verified',           // Téléphone vérifié
  'two_factor_enabled',       // 2FA activé
  'two_factor_disabled',      // 2FA désactivé
  'session_expired',          // Session expirée
  'account_locked',           // Compte verrouillé
  'account_unlocked',         // Compte déverrouillé

  // ===== MODERATION EVENTS =====
  'content_flagged',          // Contenu signalé
  'content_removed',          // Contenu supprimé par modération
  'report_submitted',         // Signalement envoyé
  'report_resolved',          // Signalement traité
  'warning_received',         // Avertissement reçu

  // ===== FILE/ATTACHMENT EVENTS =====
  'file_shared',              // Fichier partagé avec vous
  'file_upload_completed',    // Upload de fichier terminé
  'file_upload_failed',       // Échec d'upload
  'file_scan_completed',      // Scan antivirus terminé

  // ===== COMMUNITY EVENTS =====
  'community_invite',         // Invitation à une communauté
  'community_joined',         // Rejoint une communauté
  'community_left',           // Quitté une communauté
  'community_announcement',   // Annonce de communauté
  'community_role_changed',   // Rôle changé dans la communauté

  // ===== SYSTEM EVENTS =====
  'system',                   // Notification système générique
  'maintenance',              // Maintenance planifiée
  'update_available',         // Mise à jour disponible
  'feature_announcement',     // Nouvelle fonctionnalité
  'terms_updated',            // Conditions d'utilisation mises à jour
  'privacy_updated',          // Politique de confidentialité mise à jour

  // ===== ENGAGEMENT/GAMIFICATION =====
  'achievement_unlocked',     // Succès débloqué
  'streak_milestone',         // Jalon de streak atteint
  'level_up',                 // Niveau augmenté
  'badge_earned',             // Badge gagné

  // ===== PAYMENT/SUBSCRIPTION (future) =====
  'subscription_expiring',    // Abonnement expire bientôt
  'subscription_renewed',     // Abonnement renouvelé
  'payment_received',         // Paiement reçu
  'payment_failed',           // Échec de paiement
]);
