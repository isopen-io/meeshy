## 2026-09-06: Rate limiting Traefik — attacher `rate-limit@file` au routeur gateway (#3622)

**Statut** : Accepté

**Contexte** : `infrastructure/docker/compose/config/dynamic.yaml` déclare le
middleware Traefik `rate-limit` (100 req/s, burst 50) depuis #4137, mais aucun
routeur ne le référençait — `traefik.http.routers.gateway.middlewares` (et son
jumeau `gateway-staging`) ne portait que `compress@file`. Les deux autres
volets de #3622 (`trustProxy` restreint à l'IP de Traefik ; clé de débit
`user:` quand authentifié) étaient déjà résolus par #4137, #4184 et #4347 —
`config/trust-proxy.ts` borne la confiance à un maillon par défaut
(`resolveTrustProxy`, fonction `hop < n`, jamais `trustProxy: true`), et la
quasi-totalité des fabriques de `middleware/rate-limiter.ts` posent
`hook: 'preHandler'` + `keyGenerator` sur `authContext.userId` (gardé par
`account-keyed-rate-limit-sweep.test.ts` et
`rate-limit-key-reaches-account.test.ts`).

**Décision** : Attacher `rate-limit@file` sur les routeurs `gateway` (prod) et
`gateway-staging` — les deux partagent la même instance Traefik et le même
provider `file`, `docker-compose.staging.yml` ne déclarant pas son propre
service Traefik et rejoignant le réseau externe `meeshy-network` publié par la
stack prod. Ordre `rate-limit@file,compress@file` : la limite de débit
s'applique avant la compression, pour ne pas dépenser de CPU à compresser une
réponse 429.

Cette limite est une couche de **défense en profondeur au niveau du reverse
proxy**, distincte du plafond applicatif (`registerGlobalRateLimiter`, 300
req/min par `request.ip`, dans le hook Fastify `onRequest`) : elle absorbe un
flot avant même qu'une connexion TCP n'ouvre le processus Node, protection que
la couche applicative ne peut pas offrir par construction.

**Alternatives rejetées** : ne router que sur le plafond applicatif Fastify
(rejeté — sollicite le processus Node pour chaque requête surnuméraire, y
compris pendant un pic qui sature aussi Redis, dont dépend ce même limiteur) ;
attacher `rate-limit@file` à TOUS les routeurs (`frontend`, `static`) — hors
scope de #3622, qui ne nomme que la porte API ; laissé à une issue distincte si
le besoin est mesuré sur ces surfaces.

**Preuve** : `infrastructure/docker/compose/test_gateway_rate_limit_middleware.py`
— garde que les deux routeurs référencent `rate-limit@file` sans perdre
`compress@file`, et que le middleware qu'ils référencent est bien déclaré dans
`config/dynamic.yaml`.

**Conséquences** : un burst légitime et bref (rechargement de flux médias,
plusieurs onglets d'un même utilisateur) peut désormais recevoir un 429 de
Traefik avant d'atteindre l'application si le débit à l'adresse dépasse 100
req/s en moyenne (burst 50) — seuil choisi pour #4137, non révisé ici. Aucun
changement de comportement pour un trafic sous ce seuil.
