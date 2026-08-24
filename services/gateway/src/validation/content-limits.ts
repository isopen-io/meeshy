/**
 * Plafond de sécurité PARTAGÉ pour le contenu textuel d'un message, quel que
 * soit le TRANSPORT qui l'amène. Déclaré UNE SEULE FOIS ici pour que chaque
 * gate qui porte un champ `content` applique le MÊME contrat.
 *
 * La validation par rôle à l'exécution (`MAX_MESSAGE_LENGTH = 4000`) est la
 * limite PRÉCISE d'un message en clair ; une charge chiffrée peut être plus
 * grande, d'où ce plafond généreux qui ne bloque qu'une charge réellement
 * abusive (défense pré-DB contre un corps démesuré persisté puis diffusé).
 *
 * Contexte (dette refermée) : cette borne était posée sur les transports
 * SOCKET (`SocketMessageSendSchema`, `SocketMessageSendWithAttachmentsSchema`,
 * `SocketMessageEditSchema` — `validation/socket-event-schemas.ts`) mais
 * MANQUAIT sur le transport REST d'édition `PUT /messages/:messageId`
 * (`UpdateMessageBodySchema` — `validation/messages-schemas.ts`), seul chemin
 * d'écriture de contenu de message SANS aucun plafond. Le garde aval
 * (`messageEditContent.ts`) ne rejette que le contenu VIDE, jamais le démesuré.
 * Extraire la constante ici supprime la divergence à la source.
 *
 * Mesuré par `.max()` de Zod, donc en unités de code UTF-16 (longueur de
 * chaîne JS), pas en octets — le nom historique est conservé pour ne pas
 * diverger des sites qui l'emploient déjà.
 */
export const MAX_CONTENT_BYTES = 100_000;
