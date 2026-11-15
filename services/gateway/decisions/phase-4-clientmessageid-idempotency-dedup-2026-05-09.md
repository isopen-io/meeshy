## Phase 4 — `clientMessageId` idempotency dedup (2026-05-09)

**Contexte** : Les retries reseau (offline queue iOS, double-tap web, multi-device sync) produisaient des messages dupliques cote serveur. Phase 4 introduit un identifiant client-genere `cid_<uuid v4 lowercase>` qui sert de cle d'idempotence.

**Decision** :
- Le client (iOS, web, anonymous chat) genere un `clientMessageId` AVANT envoi, format `cid_<uuid v4 lowercase>` (helper centralise `packages/shared/utils/client-message-id.ts` + miroir Swift `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`).
- Le serveur (`MessagingService.handleMessage` -> `MessageProcessor.saveMessage`) applique le pattern **catch-on-conflict atomique** : `prisma.message.create` direct, capture P2002 sur duplicate-key, fallback `findFirst` pour retourner l'existant.
- L'unicite est garantie par un **index unique partiel MongoDB** sur `(conversationId, clientMessageId)` avec `partialFilterExpression: { $exists: true, $type: "string", $ne: "" }` — manage manuellement (cf migration `2026-05-09-message-client-id.mongodb.js`), PAS via `@@unique` Prisma (qui produirait un index non-partial cassant les rows historiques sans le champ).
- Le `findUnique` Prisma est remplace par `findFirst({ where: { conversationId, clientMessageId } })` pour cette meme raison.

**Alternative rejetee** : `findUnique` pre-INSERT n'est PAS atomique (deux requetes concurrentes passent toutes deux le `findUnique` retourne null avant qu'une n'INSERT). Le pattern `INSERT direct + catch P2002` collapse ce checkpoint en une seule round-trip.

**Consequences** :
- **Performance** : ~5% de latence d'ecriture additionnelle MongoDB 8 sur le path nominal. Sur la cible 100k msgs/s du projet, ce n'est pas le goulot ; le plafond reste la connection pool Prisma.
- **Sharding-ready** : l'index est compatible avec le pattern de sharding `{ conversationId: "hashed" }` (cle de shard alignee, pas de scatter-gather sur le dedup). Hors scope de Phase 4 mais documente pour le futur.
- **Re-translate sur dedup hit** : si la premiere insertion a reussi mais le PUSH ZMQ vers translator a echoue (translator down), le dedup hit re-pousse via `void messageTranslationService.translate(message).catch(...)` (fire-and-track avec capture d'erreur). Si traductions deja presentes, skip.
- **Privacy-preserving broadcast** : le serveur strip `clientMessageId` du payload `message:new` envoye aux autres participants ; seul le sender recoit le champ pour la reconciliation iOS / web.
- **Contrat cross-platform pinne par tests** : `services/gateway/src/__tests__/unit/utils/client-message-id.test.ts` (13 tests) verrouille la regex `cid_<uuid v4 lowercase>`, l'unicite (1000 invocations), le rejet des prefixes legacy (`temp_`/`offline_`/`retry_`), des UUIDs uppercase (defaut Swift), des variants/version digits invalides, et l'ancrage `^...$` de la regex.
