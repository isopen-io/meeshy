/**
 * La clé de cache des catégories du lecteur (#10103), seule dans son module :
 * la socket (`socket.ts`, dans le socle de la première peinture) l'invalide sur
 * `category:*` sans tirer le port, son décodeur ni ses fixtures.
 */
export const CONVERSATION_CATEGORIES_QUERY_KEY = ['conversation-categories'] as const;
