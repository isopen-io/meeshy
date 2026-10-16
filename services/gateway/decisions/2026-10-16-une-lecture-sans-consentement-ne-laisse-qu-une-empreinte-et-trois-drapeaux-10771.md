## Une lecture sans consentement d'analyse ne laisse qu'une empreinte et ce que le comptage exige, 8 jours (2026-10-16, #10771, #10772, #10773, #10774)

> **Supplantée en partie le 2026-10-16 par [#10785](2026-10-16-qui-a-vu-est-une-fonctionnalite-la-lecture-garde-son-lecteur-10785.md)** (décision du porteur) : les lignes de lecture gardent le compte quel que soit le statut ; les points 3, 4 et 5 ci-dessous ne gouvernent plus les écritures.

**Contexte.**

#10764 a fait compter l'ouverture, la lecture et la vue qualifiée d'un réel même sans consentement d'analyse : ce sont des compteurs de PORTÉE. L'analyse de conformité #10770 a relevé que la passerelle rangeait pour cela, 90 jours, une ligne `PostEngagement` NOMINATIVE (compte, temps passé, temps regardé, durée du média, surface, début), qu'elle se fiait au client pour retirer la trace, et que les impressions sans consentement (dont celles qu'une vue déduit) restaient nominatives elles aussi.

**Décision.**

1. **La forme d'une ligne de comptage se décide par le statut d'analyse que la PASSERELLE établit** (`readAnalyticsStanding`) : le client fait foi pour REFUSER (`consent: 'denied'` du lot ou de la session), la passerelle pour ACCORDER (`analyticsConsentAt` + `dataProcessingConsentAt`, 15 ans ou plus, aucun retrait `analyticsConsentWithdrawnAt`). Sans statut transmis (alias historiques), il se lit ; à défaut, la lecture la plus restrictive.
2. **`granted` : régime inchangé** — ligne nominative, mesure complète, 90 jours. `consent` y range le statut ÉTABLI (`granted`), jamais la valeur du client.
3. **Tout autre statut : la forme RÉDUITE, 8 jours** (`UNCONSENTED_READING_RETENTION_MS`, l'outbox iOS étant purgée à 7 jours) :
   - `PostEngagement` : `sessionId` = HMAC de la clé de session, `postId`, `readerKey` = HMAC du compte, `createdAt`, `creditedOpen` / `creditedPlay` / `creditedQualified`, `expiresAt`. La mesure calcule les crédits à la réception, puis est jetée. Une ligne réduite ne redevient jamais nominative ; une ligne nominative dont la mesure arrive après un retrait est réduite.
   - `PostImpression` : `postId`, `readerKey`, `source` (une impression déduite d'une vue se remplace), `eventKey` (rejeu), `expiresAt`.
4. **L'empreinte** est `HMAC-SHA256(READER_KEY_HMAC_SECRET, "account:<id>")` (`accountReaderKeyOf`, `services/posts/readerKey.ts`) — la clé déjà exigée en production pour la clé de lecteur anonyme, un domaine à part. C'est une pseudonymisation (RGPD art. 4(5)) : la ligne reste une donnée personnelle, et l'export (`routes/me/export-reading.ts`) comme l'effacement (`readingTelemetryErasure.ts`) la retrouvent par l'empreinte.
5. **Un lecteur se reconnaît sous ses deux formes** (`userId` OU `readerKey`) partout où la déduplication le cherche : fenêtre de 10 s des sessions, « une vue implique son impression », remplacement de l'impression déduite. Les lignes antérieures (nominatives, 90 j) restent lues telles quelles. Index partiels `(readerKey, postId)` posés par `ensureSocialEventIndexes`.
6. **Le retrait de l'analyse** vide aussi la trace (`actions`, `watchSamples`, `consent`) des sessions déjà rangées du compte (`detachBehaviourOf`).
7. **La liste des fichiers qui touchent `PostEngagement` est FERMÉE** (`services/posts/__tests__/postEngagementReaders.test.ts`) : comptage, export, effacement, retrait du consentement, index, migration de rétention. Aucun classement ni aucune personnalisation ne la lit ; un nouveau lecteur fait rougir la garde.

**Alternatives écartées.**

- **Une collection à part pour les sessions sans consentement** : deux tables à interroger pour la fusion et la déduplication, et un statut qui change en cours de session devient une migration entre collections.
- **Une clé d'empreinte tournante (par jour)** : coupe le lien au compte, mais rend la déduplication inexacte au changement de jour et l'effacement impossible. La question est posée au juriste (#10770 § 5.3) ; elle se tranche sans toucher au schéma.
- **Garder la mesure et ne retirer que `userId`** : la mesure (durées, surface, début) n'est pas nécessaire au compteur affiché (minimisation, art. 5(1)(c)).

**Conséquences.**

- Les compteurs affichés ne changent pas : les crédits se calculent sur la même règle (`engagementAggregateIncrements`), à la réception.
- Le schéma Prisma n'a reçu que des champs FACULTATIFS (`userId`, la mesure, `actions`/`watchSamples` deviennent optionnels ; `readerKey` et les trois drapeaux s'ajoutent) : aucune migration de données, jamais de `prisma db push`.
- Un retour arrière vers une passerelle antérieure lit mal une ligne réduite (champs requis absents) : la session concernée est journalisée et sautée, le lot continue.
