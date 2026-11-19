/**
 * Metadata de base commune à toutes les notifications
 */
export interface BaseNotificationMetadata {
  readonly action?: 'view_message' | 'view_conversation' | 'view_post' | 'join_conversation' | 'accept_or_reject_contact' | 'view_profile' | 'open_call' | 'view_details' | 'view_community' | 'update_app' | 'none';
}
