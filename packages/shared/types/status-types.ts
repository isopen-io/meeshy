/**
 * Status Types - Types de statut canoniques
 *
 * Ce fichier centralise tous les types de statut utilisés dans l'application.
 * L'objectif est de normaliser les différents statuts pour réduire la redondance
 * et faciliter la réutilisation entre frontend et backend.
 *
 * @module status-types
 */

// ============================================================================
// PROCESS STATUS - Statut générique pour les processus asynchrones
// ============================================================================

/**
 * Statut générique pour tout processus asynchrone
 * Utilisable pour: traductions, jobs, tâches, validations, etc.
 *
 * @example
 * - Translation jobs
 * - Background tasks
 * - File processing
 * - Webhook delivery
 */
export type ProcessStatus =
  | 'pending'      // En attente de traitement
  | 'in_progress'  // En cours de traitement
  | 'completed'    // Terminé avec succès
  | 'failed'       // Échoué
  | 'cancelled';   // Annulé par l'utilisateur ou le système

/**
 * Mapping des alias pour rétrocompatibilité avec les anciens statuts
 */
export const PROCESS_STATUS_ALIASES: Record<string, ProcessStatus> = {
  'processing': 'in_progress',
  'translating': 'in_progress',
  'done': 'completed',
  'success': 'completed',
  'error': 'failed',
};

/**
 * Normalise un statut vers ProcessStatus canonique
 */
export function normalizeProcessStatus(status: string): ProcessStatus {
  const normalized = status.toLowerCase();
  return (PROCESS_STATUS_ALIASES[normalized] as ProcessStatus) ||
    (normalized as ProcessStatus);
}

// ============================================================================
// TRANSLATION STATUS - Statut spécifique pour les traductions
// ============================================================================

/**
 * Statut de traduction avec support du cache
 * Étend ProcessStatus avec 'cached' pour les traductions en cache
 */
export type TranslationStatus = ProcessStatus | 'cached';

/**
 * Statut UI pour l'affichage des traductions (simplifié)
 * Utilisé côté frontend pour l'état visuel
 */
export type UITranslationStatus =
  | 'pending'      // En attente
  | 'translating'  // En cours (animation)
  | 'completed'    // Terminé
  | 'failed';      // Erreur

/**
 * Convertit un TranslationStatus vers UITranslationStatus
 */
export function toUITranslationStatus(status: TranslationStatus): UITranslationStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'translating';
    case 'completed':
    case 'cached':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'pending';
  }
}

// ============================================================================
// DELIVERY STATUS - Statut de livraison de messages
// ============================================================================

/**
 * Statut de livraison d'un message
 * Progression: sent → delivered → read
 */
export type DeliveryStatus =
  | 'sent'       // Envoyé au serveur
  | 'delivered'  // Délivré au destinataire
  | 'read'       // Lu par le destinataire
  | 'failed';    // Échec de livraison

/**
 * Ordre de progression des statuts de livraison
 */
export const DELIVERY_STATUS_ORDER: Record<DeliveryStatus, number> = {
  'failed': 0,
  'sent': 1,
  'delivered': 2,
  'read': 3,
};

/**
 * Vérifie si un statut est "meilleur" qu'un autre
 */
export function isDeliveryStatusBetter(
  newStatus: DeliveryStatus,
  currentStatus: DeliveryStatus
): boolean {
  return DELIVERY_STATUS_ORDER[newStatus] > DELIVERY_STATUS_ORDER[currentStatus];
}

// ============================================================================
// ENTITY STATUS - Statut d'entités (conversations, utilisateurs, etc.)
// ============================================================================

/**
 * Statut d'une entité (conversation, groupe, communauté)
 */
export type EntityStatus =
  | 'active'    // Actif et accessible
  | 'archived'  // Archivé mais accessible
  | 'deleted';  // Supprimé (soft delete)

/**
 * Statut d'un utilisateur dans le système
 */
export type UserStatus =
  | 'online'   // Connecté et actif
  | 'away'     // Connecté mais inactif
  | 'offline'; // Déconnecté

// ============================================================================
// SERVICE HEALTH STATUS - Statut de santé des services
// ============================================================================

/**
 * Statut de santé d'un service
 */
export type ServiceHealthStatus =
  | 'healthy'    // Service fonctionnel
  | 'degraded'   // Service partiellement fonctionnel
  | 'unhealthy'; // Service non fonctionnel

/**
 * Agrège plusieurs statuts de santé en un seul
 * Le pire statut l'emporte
 */
export function aggregateHealthStatus(
  statuses: ServiceHealthStatus[]
): ServiceHealthStatus {
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  return 'healthy';
}

// ============================================================================
// VISIBILITY STATUS - Statut de visibilité
// ============================================================================

/**
 * Visibilité d'une entité (conversation, profil, communauté)
 */
export type VisibilityStatus =
  | 'public'     // Visible par tous
  | 'private'    // Visible uniquement par les membres
  | 'restricted'; // Visible avec restrictions

// ============================================================================
// VERIFICATION STATUS - Statut de vérification
// ============================================================================

/**
 * Statut de vérification (email, téléphone, identité)
 */
export type VerificationStatus =
  | 'unverified'    // Non vérifié
  | 'pending'       // Vérification en cours
  | 'verified'      // Vérifié
  | 'expired'       // Vérification expirée
  | 'rejected';     // Vérification rejetée

// ============================================================================
// EXPORTS POUR COMPATIBILITÉ
// ============================================================================

// Re-export pour maintenir la compatibilité avec les anciens imports
export type ConversationStatus = EntityStatus;

// Alias pour les types existants dans d'autres fichiers
// Ces types seront progressivement migrés vers ce fichier
export type TranslationProcessStatus = TranslationStatus;
export type TranslationJobStatus = ProcessStatus;
export type DeliveryStatusType = DeliveryStatus;
