## 2026-10-31 : Une montée se demande d'un cran, le refus et la baisse ne se voient pas, le Sang passe par un rituel à deux (#13933)

Décisions porteur du 2026-10-31 (milestone #215) — D-5 : AUCUNE compatibilité ascendante pour les cercles ; le Sang est ouvert à tous les âges derrière un consentement ; Sang = douze semaines actives d'affilée depuis Proche.

### La loi, et où elle vit

Une demande vise `targetLevel` (`ACQUAINTANCE` · `FRIEND` · `CLOSE` · `BLOOD`, absent = `FRIEND`). La loi pure `evaluateRelationRequest` (`packages/shared/utils/relation-request.ts`) la juge dans cet ordre : le cran visé est-il le SUIVANT le niveau effectif (`RELATION_PHASE_SKIP`) ; le demandeur est-il dans ses 30 jours (`RELATION_COOLDOWN`) ; Proche et Sang ont-ils leur série (`RELATION_NOT_ELIGIBLE`, lue dans `loadRelationProgress` de rel-compteurs). Le gateway ne la réécrit pas : `services/relations/relationRequestGate.ts` lui apporte les faits (niveau par `niveauEffectif`, série, cool-down de l'ÉMETTEUR). L'envoi, l'acceptation et le rituel passent tous par cette porte.

Pas d'exception d'ancien client : sans `targetLevel`, la demande vaut Ami et un lien Public→Ami est un saut. Les clients sous le plancher de version reçoivent 426 avant d'arriver ici (lot version-minimale). Un seul reste de l'ancienne loi : une demande déjà EN ATTENTE sans niveau (envoyée avant le déploiement) s'accepte comme Ami — l'envoi écrit désormais toujours son niveau, aucune nouvelle ligne n'en naît sans.

### Le silence (RG-07) et le cool-down (RG-08)

- **Refus** et **ignorance** (dismiss d'une demande en attente par son receveur) : le statut passe à `rejected`, rien d'autre ne bouge pour l'émetteur — ni notification système, ni `friend-request:rejected` (déclaré, plus émis), ni statut lisible : `servirParties` sert `rejected` comme `pending` à l'ÉMETTEUR, et le filtre de statut du listing suit. Le cool-down de 30 jours tombe sur l'émetteur.
- **Baisse** (`POST /relations/:userId/level`) et **rupture** d'une demande acceptée : aucune notification, aucun `friend-request:cancelled` vers l'autre, aucun événement de baisse. Le cool-down tombe sur l'AUTRE (« l'autre ne peut pas redemander »). Une baisse est gravée dans l'historique et ne se sert jamais (`visibleRelationTransitions`, `relationEntryDate`).
- Le cool-down vit sur `UserRelation.cooldownLowUntil/HighUntil` (déjà au schéma). Il ne se sert JAMAIS en lecture (`GET /relations`) : « il vous reste 29 jours » dirait le refus. Il se dit une fois, à la nouvelle demande (`RELATION_COOLDOWN`), ce que la matrice du porteur prévoit.
- Une demande refusée par le receveur reste en base (`rejected`) ; la nouvelle demande de l'émetteur, une fois le cool-down échu, la REMPLACE.
- **Ce qui part à côté d'une baisse** (revue du lot) : après `POST /relations/:userId/level`, aucune demande ACCEPTÉE de la paire ne vise plus haut que le niveau effectif (`retirerDemandesAuDessus`, `routes/directory/friend-request-withdraw.ts`). Les lecteurs historiques de `FriendRequest` (audience des publications, fan-outs, jeu, suggestions de mention — tolérés par la garde `relation-access-single-site-guard`) lisent toute demande acceptée comme une amitié : sans ce retrait, une sortie silencieuse laissait le baissé lire les publications « Amis ». Un ami d'AVANT les cercles (demande acceptée, pas encore de ligne de lien) peut baisser : sa ligne est d'abord écrite par la règle du rattrapage (`asseoirLienHerite` → `backfillFriendship`), pour sa seule paire.
- **Blocage** : `GET /relations/:userId` sert Public, sans progression ni éligibilité, dès qu'un des deux a bloqué l'autre (la liste les écartait déjà).

### Accepter relève au niveau visé

`PATCH` inchangé. Il relit le cran et l'éligibilité avant d'écrire (le lien a pu tomber, la série se briser) ; un échec se dit 409 et la demande reste en attente. Les deux accords montent à `targetLevel` (`recordLevel`), jamais plus bas ; `relation:level-raised` part aux DEUX, chacun avec l'identifiant de l'autre. Une demande de Connaissance acceptée est SUPPRIMÉE une fois le lien écrit : les lecteurs historiques de `FriendRequest` (`friendship.ts`, les fan-outs, les audiences) lisent toute demande `accepted` comme une amitié, et une Connaissance n'en est pas une. Un Sang ne s'accepte pas par `PATCH` (`RELATION_RITUAL_REQUIRED`).

Rompre une demande acceptée (dismiss/cancel) baisse le lien SOUS le cran de la demande (Proche→Ami, Sang→Proche ; Ami et Connaissance→Public, le sens historique), sauf si une autre demande acceptée de même cran ou plus haut le retient.

### Le rituel du Sang

`POST /relations/:userId/ritual { phase: start|hold|confirm, token?, consents? }`, état dans le `CacheStore` sous un verrou court (`services/relations/bloodRitual.ts`). `start` ouvre ou rejoint (jeton unique par paire, 60 s) et exige une demande de Sang en attente, le lien Proche, la série de 12 semaines depuis l'entrée en Proche, aucun blocage. `hold` se rejoue et ne vaut que 15 s. `confirm` exige les deux écrans tenus (ou l'autre déjà confirmé), le jeton exact et les QUATRE consentements explicites (`listeningTitle`, `locationLive`, `locationHistory`, `locationProximity`) — un `false` est un refus enregistré qui ne bloque pas le Sang, un champ manquant est un 400 `RELATION_CONSENT_REQUIRED`. L'âge n'entre nulle part. Quand les deux ont confirmé : demande acceptée, deux accords à Sang, PUIS consentements écrits (`RelationFeatureSetting`, seul modèle créé par ce lot) et notification de demande du receveur soldée — un rituel qui échoue n'enregistre aucun consentement, et un consentement dont l'écriture échoue après le Sang reste à faux (fail-closed, journalisé). Si l'un a lâché (hold vieilli), le rituel est abandonné, rien n'est enregistré, l'autre en est prévenu (`relation:ritual-progress`, `stage: lapsed`).

### Ce qui reste

`friend-request:new` et la notification `friend_request` ne portent pas encore `targetLevel` : le texte d'une demande de Proche dit encore « demande d'ami ». Le niveau se lit sur la ligne servie (`GET /directory/friend-requests`). Le passage du niveau dans la notification touche `NotificationService.ts` (hors budget de taille) et fait l'objet d'une issue de suivi.
