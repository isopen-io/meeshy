# Decisions - packages/shared (Types & Schema partags)

> **Un fichier par décision, sous `packages/shared/decisions/` (#7711).** Ce fichier garde son préambule et la CARTE des décisions prises avant le 2026-09-25 ; il ne reçoit plus de décision : la garde `journal-one-file-per-entry-guard` (passerelle) rougit sur tout titre `## ` posé ici.
>
> **Écrire une décision** : créer `packages/shared/decisions/<AAAA-MM-JJ>-<slug>.md`, dont la première ligne est `## <AAAA-MM-JJ> : <titre>`. Aucune ligne à ajouter ici.

**Carte des décisions, dans l'ordre du fichier d'origine**

- [2026-08-13 (2) : Le bloc de statut dénormalisé de `Message` sort entièrement du schéma](decisions/2026-08-13-2-le-bloc-de-statut-denormalise-de-message-sort-entierement-du-schema.md)
- [2025-01: TypeScript Strict + Immutabilit](decisions/2025-01-typescript-strict-immutabilit.md)
- [2025-01: Branded Types pour IDs sensibles](decisions/2025-01-branded-types-pour-ids-sensibles.md)
- [2025-01: `type` prfr  `interface`](decisions/2025-01-type-prfr-interface.md)
- [2025-01: Socket.IO Events - `entity:action-word` avec hyphens](decisions/2025-01-socket-io-events-entity-action-word-avec-hyphens.md)
- [2025-01: Messages - GatewayMessage vs UIMessage](decisions/2025-01-messages-gatewaymessage-vs-uimessage.md)
- [2025-01: Validation - Zod avec CommonSchemas](decisions/2025-01-validation-zod-avec-commonschemas.md)
- [2025-01: Encryption - SharedEncryptionService avec DI](decisions/2025-01-encryption-sharedencryptionservice-avec-di.md)
- [2025-01: Build - ESM + Subpath Exports](decisions/2025-01-build-esm-subpath-exports.md)
- [2025-01: Langues - 60+ langues avec capability flags](decisions/2025-01-langues-60-langues-avec-capability-flags.md)
- [2025-01: Rles - Hirarchie numrique](decisions/2025-01-rles-hirarchie-numrique.md)
- [2025-01: Database - MongoDB 8 + Prisma (PAS PostgreSQL)](decisions/2025-01-database-mongodb-8-prisma-pas-postgresql.md)
- [2025-01: API Response - Format unifi ApiResponse<T>](decisions/2025-01-api-response-format-unifi-apiresponse-t.md)
- [2026-08: Mention - keye sur User, pas sur Participant](decisions/2026-08-mention-keye-sur-user-pas-sur-participant.md)
- [2026-08: CallParticipant - la qualite de connexion est EPHEMERE, pas une colonne](decisions/2026-08-callparticipant-la-qualite-de-connexion-est-ephemere-pas-une-colonne.md)
- [2026-08: Message.receivedByAllAt — retire; deliveredToAllAt/readByAllAt restent, mais CALCULES](decisions/2026-08-message-receivedbyallat-retire-deliveredtoallat-readbyallat-restent.md)
- [2026-08: Événements de marquage EN MASSE — un PRÉDICAT en union discriminée, jamais un sac d'options](decisions/2026-08-evenements-de-marquage-en-masse-un-predicat-en-union-discriminee-jamais.md)
- [2026-08: `conversation:updated` — le groupe d'aperçu est un CONTRAT nommé, pas ce que l'index signature laisse passer](decisions/2026-08-conversation-updated-le-groupe-d-apercu-est-un-contrat-nomme-pas-ce-que.md)
- [2026-08: Un canal serveur→client déclaré sans émetteur est un DÉFAUT — sauf s'il est réservé explicitement](decisions/2026-08-un-canal-serveur-client-declare-sans-emetteur-est-un-defaut-sauf-s-il.md)
- [2026-08: Le réordonnancement de COMMUNAUTÉS a son propre nom d'événement, pas un élargissement de celui des conversations](decisions/2026-08-le-reordonnancement-de-communautes-a-son-propre-nom-d-evenement-pas-un.md)
- [2026-09-13: `zod` est ÉPINGLÉ à `4.4.3` par un override racine — 4.5 compte des code points, plus des unités UTF-16 (#6234, suivi #6235)](decisions/2026-09-13-zod-est-epingle-a-4-4-3-par-un-override-racine-4-5-compte-des-code.md)
- [2026-09-14: La légende d'un média (`PostMedia.caption`) traduit par des champs ADDITIFS, jamais dans `translations` — et `PostMedia`/`MessageAttachment` restent DEUX documents (#6280)](decisions/2026-09-14-la-legende-d-un-media-postmedia-caption-traduit-par-des-champs.md)
- [2026-09-14: La légende d'une pièce jointe de conversation (`MessageAttachment.caption`) ne se traduit JAMAIS sous protection — vue unique, flou ou chiffrement (#6533)](decisions/2026-09-14-la-legende-d-une-piece-jointe-de-conversation-messageattachment.md)
- [2026-09-15: La décision-produit #6534 est OUI — `PostMedia.alt` se traduit ; type et gabarit `MediaCaptionTranslation*` réutilisés tels quels (#6737)](decisions/2026-09-15-la-decision-produit-6534-est-oui-postmedia-alt-se-traduit-type-et.md)
