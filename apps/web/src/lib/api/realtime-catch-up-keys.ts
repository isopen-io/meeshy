/**
 * **LES CLÉS QUE LE RATTRAPAGE DOIT NOMMER** (#20438) — module SANS
 * dépendance, motif `friends-keys.ts` / `me-keys.ts` / `pack-query-keys.ts` :
 * `CATCH_UP_FAMILIES` (`socket.ts`) périme ces familles à chaque
 * (ré)authentification du socket, et les nommer depuis leur module d'origine
 * emporterait leurs ports, leurs décodeurs et `zod` dans le morceau du temps
 * réel (`budgets.json › realtime`). Les modules lourds les RÉEXPORTENT sous
 * leur nom public — jamais un littéral recopié des deux côtés, dont la
 * divergence serait SILENCIEUSE (`souverain.ts` l'écrit).
 *
 * ## Pourquoi ces familles ont besoin d'être nommées
 *
 * `refetchOnReconnect: true` (`query-client.ts`) est branché sur
 * l'`onlineManager` de TanStack, qui écoute les transitions `online` /
 * `offline` du NAVIGATEUR — et rien, dans `apps/web/src`, ne le relie au
 * socket. Les coupures de socket les plus fréquentes n'ont aucune transition
 * réseau : redémarrage de la passerelle, déploiement, expiration d'inactivité,
 * coupure de proxy, ré-authentification (#20224 l'a mesuré pour la file
 * d'envoi). **Pour une coupure de socket, le rattrapage explicite
 * d'`onAuthenticated` est le SEUL rattrapage du web** — et une requête
 * seulement PÉRIMÉE n'est pas relue : TanStack relit sur un déclencheur
 * (montage, focus, reconnexion réseau, invalidation), jamais sur l'écoulement
 * du `staleTime`.
 */

/**
 * La COMMUNAUTÉ, sa liste, ses membres et ses demandes d'adhésion — écrites par
 * `community-live.ts` (`community:updated`) et `community-member-live.ts`
 * (`community:member-joined` / `-left` / `-role-updated`). `communities.ts` la
 * réexporte sous `COMMUNITIES_QUERY_PREFIX`.
 */
export const COMMUNITIES_QUERY_ROOT = ['communities'] as const;

/**
 * LE TROMBINOSCOPE de la conversation ouverte — écrit par
 * `conversation-members-live.ts` sur CINQ événements (rang, départ,
 * bannissement, arrivée, débannissement). C'est une surface de MODÉRATION :
 * une coupure y laisse un membre banni ou parti en liste, et le geste qu'un
 * administrateur pose dessus revient en refus que rien n'explique — le symptôme
 * de #20277, un cran plus haut. `conversation-members.ts` la réexporte.
 */
export const CONVERSATION_MEMBERS_QUERY_ROOT = ['conversation-members'] as const;

/**
 * MA BIBLIOTHÈQUE DE STICKERS — `library-sync.ts` APPLIQUE la charge de
 * `sticker:library-updated` au cache plutôt que de l'invalider (décision
 * écrite sur place : « la charge dit déjà ce qu'un réseau apprendrait »). Une
 * charge appliquée est exactement ce qu'une coupure fait PERDRE, et les cinq
 * minutes de `STICKERS_STALE_TIME` ne rattrapent rien d'un écran ouvert.
 * `stickers.ts` la réexporte.
 */
export const STICKERS_QUERY_KEY = ['me', 'stickers'] as const;

/**
 * LES DÉTAILS D'ÉTAT d'une pièce jointe (#7226) — ouvertures, écoutes,
 * position de lecture, servis à la feuille « Infos du message » et périmés par
 * `attachment-status:updated`. `attachments.ts` dérive
 * `attachmentStatusDetailsQueryKey` de cette racine.
 */
export const ATTACHMENT_STATUS_DETAILS_QUERY_ROOT = ['attachment-status-details'] as const;
