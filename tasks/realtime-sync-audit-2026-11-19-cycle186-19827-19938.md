# Cycle 186 — deux inversions de la même doctrine, aux deux bouts de la file hors ligne

*2026-11-19, à la suite du cycle 185 (#19835 et #19803, fusionnés dans `dev`).
Branche `claude/exciting-planck-g3p7gg`. Livre **#19827** (l'enfilage) et
**#19938** (le drain). Ouvre #19939, #19940, #19941, #19942, #19943.*

---

## Pourquoi ces deux-là, et pourquoi ensemble

Les cinq suivis du cycle 185 étaient pris ou hors de portée : #19881 et #19910
par d'autres sessions (PR #19891, #19932), #19905 et #19906 par PR #19916,
#19837 demande staging et production, #19833 est au porteur. #19904 attend
#19881. La règle d'asymétrie (#5243) tranche sans négociation.

Le lot est donc parti d'un relevé neuf, sur trois axes disjoints de la file hors
ligne. Les deux défauts livrés sont **la même inversion, aux deux bouts du même
tuyau** — et ni l'un ni l'autre n'avait de témoin.

| bout | ce qui était inversé |
|---|---|
| ENFILAGE (#19827) | un échec de SCELLEMENT décidait d'une perte de LIVRAISON |
| DRAIN (#19938) | une preuve de MORT demandée à la base était jetée avant le verdict |

## #19827 — fail-closed sur le secret, fail-OPEN sur la durabilité

`sealedForStorage` est fail-closed, et cette moitié est juste : le clair d'une
conversation chiffrée au repos ne se pose jamais dans Redis, dont les
sauvegardes AOF sont exactement le modèle de menace que le sceau couvre.

Mais `enqueue` sortait sur `if (!entry) return;` quelle que soit la CAUSE du
refus. `restoreForRetry` ne sert que la réouverture, pas l'enfilage : l'entrée
était donc détruite, définitivement, avec un `logger.error` pour seule trace.
Pendant un incident de la base des clés, chaque participant hors ligne d'une
telle conversation perdait chaque message de l'incident.

Le dépôt avait déjà la doctrine, quinze lignes plus bas, dans la fonction
jumelle : **fail-CLOSED sur la preuve, où un secret est en jeu ; fail-OPEN sur
l'ABSENCE de preuve, où c'est une livraison.** Un échec de scellement n'est pas
la preuve que ce contenu ne doit pas voyager — c'est l'aveu qu'on n'a pas PU le
sceller.

### Ce que la classification a coûté de réfléchir

Le jumeau `isPermanentlyUnreadable` ne pouvait pas être recopié, et le dire est
le seul vrai contenu du lot :

> **Deux gardes symétriques ne paient pas la même chose pour GARDER.** Au drain,
> l'entrée gardée est SCELLÉE — la garder ne retient aucun clair, donc la
> moindre chance de rouvrir plus tard vaut d'être attendue, clé maîtresse
> absente comprise. À l'enfilage, l'entrée gardée est EN CLAIR dans le tas : on
> ne garde que ce qu'une attente peut débloquer **sans redémarrage**, puisqu'un
> redémarrage vide le tas.

D'où un ensemble PERMANENT plus large à l'enfilage qu'au drain, sur les mêmes
causes : clé maîtresse absente, de mauvaise longueur, ou qui n'ouvre pas la clé
de la conversation sont des états dont le remède est une variable
d'environnement et un redémarrage. Les garder ne retiendrait rien d'utile.

Restent transitoires : la clé de conversation pas encore CRÉÉE
(`ConversationKeyGenerationFailedError`, #19786 — base injoignable, élection de
primaire, conflit d'écriture), la base des clés injoignable, et **toute cause
inconnue** — détruire une livraison demande une raison, la garder n'en demande
pas.

### Le point dur : la tranche durable est fermée par le CODE, pas par un commentaire

Une entrée gardée est en clair. Elle ne doit donc jamais atteindre Redis. Ce
n'est pas tenu par une note mais par `heapOnly`, qui court-circuite
`this.getRedis()` **même quand Redis se porte bien** — et par une propriété
structurelle qu'il a fallu vérifier plutôt que supposer : `restoreForRetry` ne
reçoit que ce qu'`openedForReplay` a classé `retry`, qui exige un
`sealedPayload`. Une entrée non scellée n'y entre pas. Le drain, la purge par
message et le plafond du tas s'en occupent déjà — aucun site de plus à tenir à
jour, ce qui est précisément la classe de défaut que ce dépôt trouve chaque
semaine.

## #19938 — le `select` demandait la colonne, la projection la jetait

`MESSAGE_LIVENESS_SELECT` porte trois colonnes depuis le cycle 143 bis.
`viewOnceBurnedAt` est la SEULE preuve de mort d'une vue unique purgée :
`purgeViewOnceContent.writePurge` détruit le contenu sans écrire `deletedAt` ni
`expiresAt`, par construction — la bulle doit survivre.

`readQueuedMessageFacts` (#18615) **demandait** bien la colonne, puis la
**jetait** : trois champs recopiés à la main dans la projection, sous un
`as Array<…>` qui déclarait la forme amputée. `MessageLivenessRow` ayant tous
ses champs optionnels, `tsc` ne voyait rien et `messageLivenessOf` rendait
`live`. La garde d'ADMISSION jumelle, elle, passe la ligne BRUTE.

Conséquence : une vue unique porteuse de texte, enfilée pour un absent puis
purgée, était REMISE au drain — `message:new` avec le clair d'un message dont le
serveur a détruit le contenu partout ailleurs. La purge par message ne rattrape
pas ce cas : elle est best-effort, et son propre doc-comment s'appuie sur la
garde du drain pour l'entrée que l'index a perdue (repli mémoire après un hoquet
Redis, index expiré, entrée évincée au plafond).

### La loi portait déjà sa leçon, à son propre site

`message-liveness.ts:62-85` écrit, depuis le cycle 143 bis :

> **Diagnostiquer qu'une garde est aveugle à une preuve n'est pas la rendre
> voyante.**

Et #17208 a posé un cliquet qui garde que chaque consommateur SÉLECTIONNE la
loi. Les deux étaient justes, et aucun des deux ne pouvait attraper ceci :

> Un cliquet qui garde la REQUÊTE ne dit rien de la PROJECTION. Entre le
> `select` et le verdict, il y a un cran où une colonne se perd sans que rien ne
> rougisse — et c'est un cran plus bas que la variante que le dépôt documente.

La recopie vit désormais à SON site, `messageLivenessRowOf`, collée au `select`
et au verdict : une quatrième preuve de mort se pose en touchant trois
déclarations voisines, et le cliquet neuf tombe si l'une est oubliée. Le `as`
qui mentait est parti avec l'énumération qu'il couvrait.

### Le double mentait par ce qu'il RENDAIT

`drain-message-liveness.test.ts` projetait trois colonnes en dur. Un site qui
demande la colonne et la jette rendait donc **le même résultat qu'un site
juste** : la troisième cause de la loi ne pouvait être exercée par aucun témoin
de ce fichier, et le `grep` le confirme — zéro occurrence de `viewOnceBurnedAt`
dans tout `socketio/__tests__/`. Le double rend désormais exactement ce que le
`select` demande.

> Le dépôt connaissait « un double de test ment aussi par ce qu'il ACCEPTE »
> (cycle 112). Voici la face qui manquait : **il ment aussi par ce qu'il REND.**

## Preuve

| mesure | résultat |
|---|---|
| #19827, témoins neufs | 10, dont **5 rouges** avant le lot ; la cause transitoire remonte du VRAI sceau, pas d'un double |
| #19938, mutation de la projection | **4 rouges**, dont le témoin de COMPORTEMENT |
| suites socketio | **211 suites / 2596 témoins** verts |
| suites de file et de chiffrement au repos | 7 suites / 146 verts, puis 5 suites / 50 verts |
| `tsc --noEmit` sur `services/gateway` | **EXIT=0** |

## Ce qui N'A PAS été mesuré, et ne doit pas se lire comme vert

- **Combien d'entrées la branche de #19827 détruit aujourd'hui en production.**
  L'issue le demandait ; aucun compte n'est possible depuis un conteneur. Ce que
  le lot livre est la CONDITION de la mesure : le journal distingue désormais
  `disposition: dropped` / `kept-in-memory` à côté de la `reason`, donc un compte
  par journal devient possible. La mesure elle-même reste à faire.
- **Combien le tas peut enfler** pendant un incident long de la base des clés.
  Les plafonds existants s'appliquent (1 000 comptes × 50 entrées), mais aucun
  profil n'a été pris.
- **Le volume de vues uniques purgées** dont une entrée survivait à la purge par
  message : non mesurable d'ici.

## Les suivis — cinq issues, toutes vérifiées au site avant d'être écrites

| constat | issue |
|---|---|
| l'édition socket SIGNE sa remise directe et ENFILE l'adresse NUE (48 h, en clair) | **#19939** |
| le pont du badge NOMME l'auteur d'un avis de capture à qui n'a pas le droit de savoir qu'il existe | **#19940** |
| drain : toutes les entrées refusées ⇒ aucun signal de récupération, la perte devient définitive | **#19941** |
| l'extrait d'une réaction ignore `clearHistoryBefore`, là où `GET /conversations` le respecte | **#19942** |
| `deleted` / `pinned` / `unpinned` n'atteignent pas l'audience d'`expired` — asymétrie sans raison écrite | **#19943** |

Trois d'entre elles ont la même forme que les lots livrés : **un site juste et
son jumeau qui ne l'est pas.** C'est le motif le plus productif de ce relevé, et
il mérite d'être dit : chercher la MOITIÉ d'une loi rend plus que chercher la
loi.
