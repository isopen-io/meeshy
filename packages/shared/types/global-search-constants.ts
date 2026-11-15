/**
 * Les constantes de la recherche générale, lues SANS zod : le web les importe
 * d'ici (un schéma zod importé à l'exécution emporte zod entier dans son
 * chunk), et `global-search.ts` les réexporte avec ses schémas.
 *
 * LA CAPACITÉ DU CLIENT (#16957). Un client qui envoie `X-Search-Caps` à
 * `GLOBAL_SEARCH_PROTECTION_CAPS` ou plus déclare savoir VOILER un résultat
 * flouté et peindre une transcription. Sans elle, la passerelle ne lui sert
 * aucun flouté et ne cherche pas les transcriptions : un ancien client ne peut
 * pas afficher en clair ce qu'il ne sait pas voiler.
 */
export const GLOBAL_SEARCH_CAPS_HEADER = 'X-Search-Caps';
export const GLOBAL_SEARCH_PROTECTION_CAPS = 1;

export const MESSAGE_SEARCH_MEDIA_KINDS = ['audio', 'video', 'image', 'document'] as const;

export type MessageSearchMediaKind = (typeof MESSAGE_SEARCH_MEDIA_KINDS)[number];

export const MESSAGE_SEARCH_MATCHES = ['content', 'transcript'] as const;
