/**
 * La base de toutes les métadonnées de notification : l'action que le toucher déclenche. À part de
 * `notification.ts` pour que les fichiers de métadonnées qu'il réexporte (`notification-circle-metadata.ts`)
 * l'importent sans former de cycle (#4683) ; `notification.ts` la réexporte, rien ne change pour qui l'importe.
 */
export interface BaseNotificationMetadata {
  readonly action?: 'view_message' | 'view_conversation' | 'view_post' | 'join_conversation' | 'accept_or_reject_contact' | 'view_profile' | 'open_call' | 'view_details' | 'view_community' | 'update_app' | 'none';
}
