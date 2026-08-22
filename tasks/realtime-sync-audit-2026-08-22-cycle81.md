# Cycle 81 — Le carnet d'adresses appliquait le blocage à l'écriture seulement

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-bx3ohw`
**Périmètre** : passerelle (`services/ContactDirectoryService.ts`,
`routes/users/contacts-directory.ts`, `routes/users/contacts-match.ts`,
`routes/users/presence-gate.ts`) et leurs trois suites

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Deux réponses REST changent de contenu — voir §7.

---

## 1. D'où vient ce cycle

Le cycle 79 a livré le geste et le cycle 80 l'a rejoué : **prendre les
transitions d'un même domaine et vérifier qu'elles forment une grille CLOSE**.
Le cycle 80 a fermé l'épinglage de message et a laissé nommément trois domaines
voisins ouverts, dont le **blocage / déblocage d'un contact**.

C'est celui-ci. Et il a rendu un défaut d'une classe voisine mais distincte :
non pas une transition descendante sans sa montante, mais une règle **appliquée
à l'ÉCRITURE et jamais rejouée à la LECTURE**. Le blocage bouge entre deux
écritures ; rien ne le rattrapait.

## 2. Ce que le répertoire faisait

`ContactDirectoryService` sépare volontairement deux responsabilités :

| méthode | rôle | blocage |
|---|---|---|
| `match()` | rapprochement pur carnet ↔ comptes | **appliqué**, dans les deux sens |
| `sync()` | persistance (`UserContact.matchedUserId`) | hérite de `match()` |
| `list()` | lecture paginée du carnet persisté | **aucun** |

`match()` porte même le commentaire qui énonce la règle :

```ts
// Un compte qui a bloqué le demandeur ne doit pas ressortir de son
// carnet d'adresses — le blocage vaut dans les deux sens.
NOT: { blockedUserIds: { has: excludeUserId } },
```

Mais `match()` ne tourne qu'à la **synchronisation d'appareil**. `list()`, lui,
rendait la ligne `UserContact` telle qu'elle avait été écrite — `matchedUserId`
compris — et inlinait le profil public correspondant.

Conséquence, en trois temps :

1. Alice synchronise son carnet ; Bob y est rapproché (`matchedUserId = bob`).
2. Alice bloque Bob (ou Bob bloque Alice).
3. Alice ouvre son répertoire : **Bob est toujours « sur Meeshy »**, en tête de
   liste (le tri remonte les comptes rapprochés), avec son bouton « Lui écrire ».

Le bouton mène à un envoi que la passerelle rejette en `USER_BLOCKED` — le
`blocks:` cache de la porte DM étant justement purgé par la route de blocage.
L'affordance survivait à l'interdit qu'elle viole, jusqu'au prochain scan du
carnet de l'appareil.

## 3. Le second trou, sur la même porte : la présence n'était pas filtrée

En regardant `list()` de près, un deuxième écart est apparu, plus large que le
blocage : `PUBLIC_USER_SELECT` charge `isOnline` et `lastActiveAt`, et **rien**
ne les filtrait. Ni sur `GET /users/me/contacts`, ni sur
`POST /users/me/contacts/match`.

Or ce filtrage est une norme établie de la passerelle. Douze surfaces le font
déjà, chacune par `PresenceVisibilityService` :

| surface | méthode |
|---|---|
| `GET /users/presence` | `resolveForTargets` |
| `GET /users/search` | `resolveForTargets` |
| profil (`/u/:username`, `/users/:id`) | `resolveForTarget` |
| liste de conversations, delta | `resolvePrefsOnly` |
| expéditeurs de messages, épingles, recherche | `resolvePrefsOnly` |
| participants d'une conversation | `resolvePrefsOnly` |
| membres d'une communauté | `resolvePrefsOnly` |

Le répertoire était **le seul annuaire de personnes de la passerelle à servir
`isOnline` / `lastActiveAt` bruts**. Il ignorait donc :

- `showOnlineStatus` et `showLastSeen`, les deux préférences que l'écran de
  confidentialité promet à l'utilisateur ;
- la désactivation de compte (`deactivatedAt → HIDDEN`) ;
- le blocage bidirectionnel, que `resolveForTargets` résout aussi.

`/users/search` — l'analogue le plus proche, une surface de découverte sans
privilège — porte pourtant depuis longtemps le commentaire explicite « Gate de
présence : un résultat de recherche n'expose lastActiveAt/isOnline que pour les
contacts (ami/affilié) ou modérateur+ (critère strict) ». Le carnet d'adresses
avait été écrit sans.

**Le critère retenu est le STRICT** (`resolveForTargets`), pas `resolvePrefsOnly`.
La distinction compte : `resolvePrefsOnly` sert les listes « où l'accès est déjà
garanti par le contexte » — co-participants d'une conversation, co-membres d'une
communauté, c'est-à-dire un lien que les DEUX parties ont posé. Avoir quelqu'un
dans son carnet d'adresses n'est rien de tel : c'est une affirmation
**unilatérale et non vérifiée** — n'importe qui peut inscrire n'importe quel
numéro dans son téléphone. Le répertoire est une surface de découverte, il
prend le régime de la découverte.

## 4. Le correctif

**Sur la lecture (`list()`)** — deux passes bornées à la page servie :

```ts
const blocked = matchedIds.length > 0
  ? await getBlockedUserIdsAmong(this.prisma, ownerId, matchedIds)
  : new Set<string>();
const visibleIds = matchedIds.filter((id) => !blocked.has(id));
const visibility = visibleIds.length > 0
  ? await getPresenceVisibilityService(this.prisma).resolveForTargets(viewer, visibleIds)
  : new Map();
```

`getBlockedUserIdsAmong` existait déjà et résout les deux sens en deux requêtes,
bornées par la page (≤ 200). Une page sans aucun compte rapproché n'ouvre
aucune des deux — c'est un témoin, pas une intention (§6).

**La forme du résultat pour un lien coupé est le point de conception.** La ligne
du carnet **reste** : c'est l'entrée d'Alice, son contact, sa donnée — la
supprimer de sa vue parce qu'elle a bloqué quelqu'un serait lui retirer son bien.
Ce qui tombe, c'est le **lien Meeshy**, et il tombe en rendant exactement ce
qu'une re-synchronisation écrirait pour ce contact :

```
matchedUser → null    isOnMeeshy → false    matchedBy → null    matchedAt → null
```

C'est le triplet que `sync()` écrit quand `match()` ne rend rien
(« Un compte supprimé ou désactivé depuis la dernière sync doit faire RETOMBER le
contact côté à inviter : on réécrit toujours le triplet de match »). La lecture
projette donc l'état que la prochaine écriture posera : les deux portes disent la
même chose, et le contact redevient « à inviter » — ce qu'il est.

Aucun client n'a besoin de changer : `isOnMeeshy: false` est le chemin déjà
emprunté par tout contact non rapproché (`PhonebookListView` bascule l'action de
`.write` à `.invite`, `PhonebookViewModel` filtre dessus).

**Sur le rapprochement (`POST /users/me/contacts/match`)** — le gate de présence
seul ; `match()` écarte déjà les comptes bloqués en amont, il n'y a pas de lien
à couper.

**`applyMatchedPresence`** est exporté par le service et partagé par les deux
portes, pour la raison que `contacts-schemas.ts` énonce déjà à propos du
sérialiseur : un profil rapproché doit être décrit **une seule fois**, sinon les
deux portes dérivent. Il rend `isOnline: false` (et non `null` comme le
`applyPresenceVisibility` partagé) parce que le schéma de sortie du répertoire
déclare `isOnline` non nullable — même choix, pour la même raison, que
`/users/search`.

**`viewer` est un paramètre REQUIS de `list()`**, pas une option. Un appelant
qui n'a pas de viewer passe `null`, ce qui **masque** : la porte est fermée par
défaut, et un futur appelant qui l'oublie ne peut pas faire fuiter — il peut
seulement afficher moins. C'est la direction d'échec qu'un gate de
confidentialité doit avoir.

**`viewerFromRequest`** (`presence-gate.ts`) est ajouté à côté de
`viewerFromAuthContext` : `AuthenticatedRequest` (`routes/users/types.ts`) type
`registeredUser` en `boolean`, ce que la production ne respecte pas — la lecture
du viewer passe donc par la forme RÉELLE de l'authContext. `/users/search`
recopiait ce transtypage à la main ; les deux nouvelles portes appellent le
helper. (Le recopiage de `/users/search` n'a pas été touché : c'est une route
que ce cycle n'ouvre pas — noté en §8.)

## 5. Les témoins

Onze au total, tous neufs, répartis sur les trois suites du domaine :

| suite | témoins |
|---|---|
| `ContactDirectoryService.test.ts` | 7 — masquage, service, viewer nommé, coupe dans les deux sens, identité du carnet préservée, présence jamais résolue pour un lien coupé, aucune requête sans compte rapproché |
| `contacts-directory.test.ts` (route) | 3 — viewer câblé depuis l'authContext, masquage bout en bout, contact bloqué servi « à inviter » |
| `contacts-match.test.ts` (route) | 4 — masquage, service, viewer nommé, rien résolu sans correspondance |

**Le ROUGE a été prouvé, et deux fois plutôt qu'une.** Avant le correctif :
5 témoins tombés + une suite qui ne compile plus (`list()` n'accepte pas
`viewer`). Après, deux mutations distinctes ont été appliquées à la production
verte pour vérifier que chaque moitié du correctif porte ses propres témoins :

| mutation | témoins tombés |
|---|---|
| `const severed = false` (blocage désarmé) | 3, tous sur la coupe du lien |
| `applyMatchedPresence` rendue transparente | 3, tous sur le masquage |

Les deux ensembles sont **disjoints** : aucun témoin n'atteste les deux à la
fois, donc aucun ne masque la régression de l'autre.

Deux témoins portent la charge négative, celle qui rate le plus facilement :

- **« ne résout jamais la présence d'un lien coupé »** — sans lui, on pourrait
  résoudre la visibilité d'un compte bloqué puis jeter le résultat : correct en
  sortie, mais une requête ouverte sur une personne avec qui toute relation est
  rompue. La coupe doit précéder la résolution, pas la suivre.
- **« n'interroge pas la relation de blocage sans compte rapproché »** — sans
  lui, deux requêtes s'ouvrent sur chaque page d'un carnet entièrement
  « à inviter », soit le cas le plus courant d'un carnet fraîchement scanné.

## 6. Preuves

- `bunx tsc --noEmit -p tsconfig.json` (gateway) : **0 erreur**
- `bunx jest` (gateway, suite complète) : **805/805 suites, 18826/18826 témoins**
- ROUGE prouvé avant correctif, puis par deux mutations après (tableau §5)

Local sous **bun**, comme la CI (`PACKAGE_MANAGER` par défaut `bun`).
Prérequis appliqués : `bun install --ignore-scripts`, `prisma generate`,
`packages/shared` construit.

## 7. Ce qui change pour un client, sans qu'il change

Deux réponses REST changent de contenu — c'est l'objet du correctif, et aucune
ne casse un décodeur :

1. `matchedUser.isOnline` / `.lastActiveAt` peuvent désormais valoir `false` /
   `null` là où ils portaient la valeur brute. Les types ne bougent pas
   (`isOnline` reste non nullable), et c'est déjà la valeur qu'un contact hors
   ligne porte.
2. Un contact en relation de blocage bascule de `isOnMeeshy: true` à `false`,
   `matchedUser: null`. C'est le chemin « à inviter », déjà emprunté et déjà
   testé côté iOS comme côté web.

## 8. Pistes laissées ouvertes

**Le compte de la page sous `filter=meeshy` peut être surévalué de un.** Le
filtre tourne en base sur `matchedUserId`, avant que la coupe ne soit connue :
une ligne coupée reste dans la page servie (avec `isOnMeeshy: false`, donc le
client la retire) mais compte encore dans `total`. Fermer ça exigerait de
connaître les bloquants AVANT la requête — or « qui m'a bloqué » est une requête
**non bornée** (`user.findMany({ where: { blockedUserIds: { has: ownerId } } })`)
qu'il faudrait ouvrir à chaque page du répertoire. Un écart de comptage d'une
unité, dans le cas rare où un contact bloqué est encore dans le carnet, ne vaut
pas ce prix. Constat assumé, pas dette cachée.

**La famille de la présence non filtrée est plus large que le répertoire, et
elle a été balayée.** `grep "isOnline: true"` sur `routes/` et `services/` rend
26 fichiers ; la plupart sont légitimes (soi-même, admin, authentification,
maintenance). Trois surfaces servent des profils de TIERS sans passer par
`PresenceVisibilityService`, et méritent la même passe :

| surface | pourquoi c'est un écart |
|---|---|
| `GET /users/friend-requests` (`routes/users/devices.ts`) | inline `sender` et `receiver` bruts. Un ami accepté aurait `FULL` de toute façon — mais une demande **en attente ou refusée** n'est pas une relation « connectée », et la présence y sort sans respecter `showOnlineStatus` ni `showLastSeen` |
| `services/posts/postIncludes.ts` | l'auteur d'un post porte sa présence brute dans tout le fil social |
| `routes/communities/search.ts`, `routes/conversations/sharing.ts` | profils servis hors de tout contexte d'appartenance déjà vérifié |

Le plus net des trois est le premier : c'est un annuaire de personnes, comme
celui de ce cycle, et le régime STRICT s'y applique mot pour mot. C'est la
première marche du cycle 82.

**`/users/search` recopie encore à la main le transtypage de l'authContext** que
`viewerFromRequest` remplace. Trois lignes, dans une route que ce cycle n'ouvre
pas — à ramasser en passant lors de la passe ci-dessus, pas à part.

**Les deux domaines voisins du cycle 80 restent ouverts** : appartenance à une
communauté, épinglage / archivage de CONVERSATION.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de
celui du dépôt). Reproduit sur un fichier non touché — c'est l'environnement, pas
le diff. Le lint du dépôt tourne normalement en CI.

## 9. La leçon

> **Une règle appliquée à l'écriture seule n'est pas appliquée.** `match()`
> filtrait le blocage, portait le commentaire qui l'énonce, et ses témoins
> étaient verts. Le défaut n'était dans aucune de ces lignes : il était dans le
> fait que la règle ne tournait qu'une fois par synchronisation d'appareil,
> pendant que son sujet — le blocage — bougeait librement entre deux.
>
> Le discriminant est **la fréquence relative des deux horloges**. Quand ce que
> la règle décide change plus souvent que le moment où elle s'exécute, la
> persistance de la décision est un état FAUX qui tient jusqu'à la prochaine
> écriture. Ici : jusqu'au prochain scan du carnet — c'est-à-dire jamais, en
> pratique, tant que l'utilisateur n'ouvre pas les réglages.

Et le corollaire, qui est la sortie opératoire de ce cycle :

> **Une porte de sortie de profils applique le gate de présence, sans exception à
> plaider.** Douze surfaces le faisaient, une ne le faisait pas, et ce n'était
> pas une décision produit — c'était un oubli, invisible parce que rien ne
> l'attestait. La question à poser à toute route qui `select: { isOnline: true }`
> est courte : **le lecteur a-t-il un DROIT sur cette donnée, ou seulement un
> lien qu'il a posé tout seul ?** Un carnet d'adresses est unilatéral ; un ami
> accepté et un co-participant ne le sont pas. C'est cette question, pas la
> proximité apparente, qui choisit entre `resolveForTargets` (strict) et
> `resolvePrefsOnly` (contexte acquis).
