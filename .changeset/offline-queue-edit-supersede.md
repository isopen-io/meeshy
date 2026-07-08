---
"@meeshy/gateway": patch
---

Delivery queue hors-ligne : la dernière édition d'un message gagne au rejeu.

`RedisDeliveryQueue.enqueue` dédupliquait sur `(messageId, eventType)` en gardant la **première** entrée. Comme plusieurs éditions d'un même message partagent toutes `eventType === 'edited'`, une 2e édition faite pendant qu'un destinataire est hors-ligne était silencieusement jetée, et le rejeu au reconnect livrait le contenu intermédiaire périmé au lieu du contenu final de l'expéditeur.

`new` reste strictement idempotent (retry → première entrée gardée). Les événements mutables (`edited`/`deleted`) **supersèdent en place** l'entrée existante (Redis `LSET` à sa position FIFO, chemin mémoire par remplacement immuable) : une seule entrée par `(messageId, eventType)` est conservée, portant le payload le plus récent. Aucun changement de schéma, d'API ni de migration.
