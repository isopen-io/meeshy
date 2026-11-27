## 2026-11-27 : garder un clair dans le TAS exige une instance unique ATTESTÉE

*2026-11-27 — #19947, suivi de l'audit adversarial de #19827 (PR #19944).*

### Contexte

#19827 garde dans la tranche MÉMOIRE de `RedisDeliveryQueue`, en clair,
l'entrée hors ligne d'une conversation chiffrée au repos qu'un refus de
scellement TRANSITOIRE n'a pas pu sceller, et lui ferme la tranche durable
(`heapOnly`). Sa promesse — « l'entrée survit et se rejoue » — suppose trois
conditions, et une seule était écrite :

1. l'incident de la base des clés se résout ;
2. le destinataire se reconnecte ;
3. **le processus qui tient l'entrée ne redémarre pas, et c'est LUI qui sert
   la reconnexion.**

La troisième n'était écrite nulle part. Elle a deux moitiés.

- **Le redémarrage.** Un déploiement draine les sockets
  (`GATEWAY_DRAIN_MS=20000`) ; rien ne vide ni ne persiste la tranche mémoire.
  Tout ce qui était gardé est perdu. C'était déjà vrai du repli de panne
  Redis, et ce qui est perdu est le REJEU, pas le message : `saveMessage` a
  écrit la ligne avant tout éventail, et le destinataire la relit en ouvrant
  la conversation. Ce lot ne change pas ce coût : il l'écrit.
- **Plusieurs instances.** `heapOnly` installe un état de LIVRAISON par
  processus sur un chemin où Redis est sain. La production est aujourd'hui un
  conteneur unique (`infrastructure/docker/compose/docker-compose.prod.yml`,
  aucun `replicas`). Avec deux répliques — la cible « passerelle sans état »
  de #9232 —, la reconnexion du destinataire peut tomber sur l'AUTRE
  instance : non livrée, et le clair retenu 48 h quand même. On paie la
  rétention sans obtenir la livraison qu'elle achète.

### Décision

1. **Refus assumé de garder quand l'instance unique n'est pas attestée.** Des
   trois réponses que l'issue instruisait — une tranche durable chiffrée par
   une clé indépendante de la conversation, le refus de garder sous plusieurs
   instances, l'abandon de la rétention au profit d'une relecture REST à la
   reconnexion —, c'est la seule qui ne crée ni nouvelle clé à gérer ni
   nouveau protocole client, et qui reste juste le jour où la deuxième réplique
   arrive. Une entrée `keep` sans attestation est DÉTRUITE, journalisée en
   `error` (`reason: 'not-sole-instance'`) et comptée sous
   `delivery_queue_unsealed_entries_total{disposition="dropped_multi_instance"}`.
2. **La condition est VÉRIFIÉE, pas supposée** (`services/gatewayInstanceCensus.ts`).
   Chaque instance pose `gateway:instance:<uuid>` avec un TTL de 30 s, le
   renouvelle toutes les 10 s, s'inscrit au registre `gateway:instances`, et
   recompte les inscrits dont la clé vit encore (`SMEMBERS` + `MGET`, les
   partis retirés par `SREM`). Le coût est en O(instances) : un `SCAN` de
   l'espace de clés coûtait une commande par centaine de clés de tout Redis,
   toutes les 10 s et par instance — 500 commandes par battement à 50 000
   clés. Le TTL reste celui du serveur Redis, donc une horloge d'instance
   décalée n'efface personne.
   L'instance est unique si et seulement si le dernier recensement est FRAIS
   (≤ 30 s), n'a vu qu'elle, et qu'aucun déploiement ne DÉCLARE plusieurs
   répliques (`GATEWAY_INSTANCES` > 1). Tout le reste n'atteste rien et la
   file ne garde pas : avant le premier battement, Redis absent, battement en
   échec, recensement périmé.
3. **Fail-closed par défaut.** `RedisDeliveryQueue` sans témoin
   (`soleInstance`) n'atteste pas l'instance unique
   (`UNVERIFIED_SOLE_INSTANCE`). Seul `server.ts` câble le recensement.
4. **L'admission au tas a un site unique** (`deliveryQueueHeapAdmission.ts` →
   `admittedToHeap`) : l'instance unique d'abord, puis le budget de #19945. Le
   site est synchrone, comme l'était `admittedUnsealed`.

### Ce que cela coûte, dit juste

- **Pendant un recouvrement de déploiement**, la clé de l'instance arrêtée vit
  jusqu'à 30 s (aucun `stop()` n'est câblé à l'arrêt : `server.ts` est hors
  budget de taille). La nouvelle instance se voit alors à deux et ne garde pas
  pendant cette fenêtre. C'est le sens fail-closed : deux instances existaient
  bel et bien.
- **Redis absent** : le recensement est inconnu, donc une entrée à sceller qui
  ne se scelle pas est détruite au lieu d'être gardée. Le repli mémoire des
  conversations ORDINAIRES n'interroge pas le témoin et ne change pas.
- **Sous plusieurs répliques**, un incident de la base des clés retrouve le
  comportement d'avant #19827 pour les conversations chiffrées au repos : le
  rejeu est perdu, le message reste en base. La réponse durable — une tranche
  scellée par une clé de file indépendante de la conversation — est la suite
  à instruire quand le multi-instance sera planifié.

### Ce qui tient la décision

`src/__tests__/unit/services/atRestDeliveryQueueSoleInstance.test.ts` : la file
ne garde que sous témoin vrai, détruit et compte sous témoin faux comme sans
témoin, ne consulte pas le témoin pour une conversation ordinaire ; le
recensement est unique seul, ne l'est plus à deux, le redevient quand l'autre
s'arrête, cesse d'attester s'il est périmé, si Redis manque, si un battement
échoue, ou si plusieurs répliques sont déclarées. Les témoins de #19827 et
#19945 se placent explicitement sous une instance unique attestée.
