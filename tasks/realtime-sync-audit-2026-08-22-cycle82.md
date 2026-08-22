# Cycle 82 — L'annuaire le plus consulté de l'app servait la présence brute

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-ftmofu`
**Périmètre** : passerelle (`routes/users/devices.ts`, `routes/users/preferences.ts`,
`services/ContactDirectoryService.ts`, `routes/users/contacts-match.ts`) et le
paquet partagé (`utils/presence-visibility.ts`)

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Une réponse REST change de contenu — voir §6.

---

## 1. D'où vient ce cycle

Le cycle 81 a fermé le carnet d'adresses persisté et a nommé la marche suivante
sans ambiguïté :

> `GET /users/friend-requests` (`routes/users/devices.ts`) inline `sender` et
> `receiver` bruts. […] C'est la première marche du cycle 82.

Elle a été prise. Et elle a rendu **plus** que ce que le cycle 81 avait prévu :
le raisonnement de clôture supposait qu'« un ami accepté aurait `FULL` de toute
façon ». C'est faux, et la politique partagée le dit noir sur blanc.

## 2. Ce que la route faisait

`GET /users/friend-requests` charge chaque `FriendRequest` avec ses deux profils
inline, et les deux `select` portent la présence :

```ts
sender:   { select: { …, isOnline: true, lastActiveAt: true } },
receiver: { select: { …, isOnline: true, lastActiveAt: true } },
```

Rien entre la requête et `sendPaginatedSuccess`. Aucun appel à
`PresenceVisibilityService`, sur une route qui est — c'est le point — **l'annuaire
de personnes le plus consulté de l'application** : la liste d'amis, côté client,
c'est `GET /users/friend-requests?status=accepted`.

Les consommateurs ne se contentent pas d'afficher la pastille, ils **filtrent
dessus** :

| client | fichier | usage |
|---|---|---|
| iOS | `ContactsListViewModel.swift` | `result.filter { $0.isOnline == true }` |
| web | `hooks/use-contacts-data.ts` | `contactsData.filter(user => user.isOnline)` |

S'y ajoutent `forward-message-modal`, `SearchPageContent`, `NewConversationViewModel`,
`ForwardPickerViewModel`.

## 3. La surprise : une amitié acceptée n'est PAS un laissez-passer

Le cycle 81 a écarté ce cas d'un revers de main. La politique pure
(`resolvePresenceVisibility`, `packages/shared/utils/presence-visibility.ts`) est
formelle :

```ts
const allowed = privileged || input.areConnected || (input.sharesConversation ?? false);
if (!allowed) return HIDDEN;

if (privileged) return { showOnline: true, showLastSeenTimestamp: true };
if (!input.targetShowOnlineStatus) return HIDDEN;   // ← ici
```

`areConnected` ouvre la porte ; il ne dispense pas de la préférence. **Un ami
accepté qui a coupé `showOnlineStatus` doit sortir masqué**, et c'est précisément
ce que l'écran de confidentialité promet à l'utilisateur.

La fuite ne concernait donc pas seulement les demandes en attente ou refusées :
elle concernait **toute la liste d'amis**, c'est-à-dire la population entière de
la fonctionnalité. Un utilisateur qui coupe « Afficher mon statut en ligne »
restait vert dans la liste de contacts de tous ses amis, et remontait dans leur
filtre « en ligne uniquement ».

Trois autres règles tombaient avec elle, faute de gate :

- **le blocage bidirectionnel** — bloquer quelqu'un ne supprime PAS la ligne
  `FriendRequest` (`routes/users/blocking.ts` ne touche qu'à `blockedUserIds`) ;
  la demande survit, sa présence avec elle ;
- **la désactivation de compte** (`deactivatedAt → HIDDEN`) ;
- **`showLastSeen`**, distinct de `showOnlineStatus`.

## 4. Ce qui masquait la moitié du symptôme

`lastActiveAt` ne sortait pas — mais pas par décision. Le schéma de réponse
déclare les deux profils en `userMinimalSchema`, qui ne liste ni `lastActiveAt`
ni `firstName` ni `lastName` : **fast-json-stringify les supprimait**. Le champ
fuyait jusqu'au sérialiseur et s'y arrêtait par accident.

C'est une garde qu'on ne peut pas invoquer : elle tient sur une omission de
schéma que la première déclaration de `lastActiveAt` — une ligne, dans un
fichier partagé par des dizaines de routes — annulerait sans que personne ne
fasse le rapprochement. Le correctif gate donc les deux champs **à la source**,
dans le handler, indépendamment de ce que le sérialiseur laisse passer.

## 5. Le correctif

Une passe unique, bornée à la page servie, appliquée aux DEUX côtés de chaque
demande :

```ts
const gated = await gateFriendRequestPresence(fastify, request, friendRequests);
```

`gateFriendRequestPresence` (`routes/users/devices.ts`) collecte les ids inline
des deux côtés, dédoublonne, appelle `resolveForTargets` une fois, puis applique
la visibilité résolue sur chaque profil.

**Le régime est le STRICT** (`resolveForTargets`), pas `resolvePrefsOnly`. Le
critère du cycle 81 tranche seul : *le lecteur a-t-il un DROIT sur cette donnée,
ou seulement un lien qu'il a posé tout seul ?* Une demande d'ami **en attente**
ou **refusée** est exactement le lien unilatéral — l'émetteur l'a posée seul, et
le refus est un NON explicite. Une demande **acceptée** est bilatérale, et le
strict la reconnaît (`areConnected`) sans avoir besoin d'un cas particulier.

Deux décisions valent d'être notées :

- **Le lecteur lui-même passe par le résolveur.** La politique le reconnaît
  (`isSelf` ⇒ privilégié ⇒ visible) et une branche unique vaut mieux qu'une
  exception à maintenir.
- **Une visibilité ABSENTE de la carte vaut masquée.** Un id que
  `resolveForTargets` n'a pas rendu n'est pas un id autorisé : le défaut est le
  refus. Une porte de confidentialité échoue en montrant moins, jamais plus.

Une page vide n'ouvre aucune requête ; un côté `null` (compte supprimé) traverse
sans faire trébucher le gate.

## 6. Ce qui change dans la réponse

`GET /users/friend-requests` : `sender.isOnline` et `receiver.isOnline` valent
désormais `false` quand la présence n'est pas montrable. `lastActiveAt` était
déjà supprimé par le sérialiseur — il est maintenant `null` avant d'y arriver.

`isOnline: false` et non `null` : `userMinimalSchema` déclare le champ en
`type: 'boolean'` NON nullable, et les clients le typent `boolean`
(`use-contacts-data.ts` ligne 32). Masqué s'y présente comme **hors ligne**, ce
qui est aussi la lecture produit correcte — pas de pastille.

## 7. La refactorisation qui accompagne (dette de duplication)

Trois sites recopiaient à la main le même collapse `visibilité → champs` :

```ts
isOnline: vis?.showOnline ? u.isOnline : false,
lastActiveAt: vis?.showLastSeenTimestamp ? u.lastActiveAt : null,
```

`/users/search` (`routes/users/preferences.ts`), `ContactDirectoryService`
(`applyMatchedPresence`, cycle 81), et le nouveau venu. Trois exemplaires d'une
règle de confidentialité, c'est trois endroits où l'un peut dériver sans que les
deux autres tombent.

Ils convergent sur **`applyPresenceVisibilityAsOffline`**, posée dans le paquet
partagé à côté d'`applyPresenceVisibility` dont elle est la variante non
nullable. Le commentaire des deux dit quand prendre laquelle. `applyMatchedPresence`
disparaît ; ses deux appelants passent au partagé.

`/users/search` recopiait aussi à la main le transtypage de l'authContext que
`viewerFromRequest` remplace (dette nommée au cycle 81, §8) — trois lignes de
moins, ramassées en passant.

## 8. Témoins

**Paquet partagé** (`__tests__/utils/presence-visibility.test.ts`, +6) :
les deux drapeaux, le collapse vers `false`, la visibilité `undefined` traitée
comme masquée, la normalisation d'un `isOnline` nul, la non-mutation.

**Passerelle** (`__tests__/unit/routes/users-devices.test.ts`, +8) : masquage du
pair, conservation quand la visibilité est pleine, résolution des DEUX côtés,
viewer construit depuis l'authContext, id non rendu ⇒ masqué, page vide ⇒ aucune
requête, côté `null` toléré, et le 500 du résolveur qui ne dégrade PAS en
réponse non gatée.

**ROUGE prouvé** : 6 des 8 témoins de passerelle tombent sur le code d'avant
(les 2 restants — visibilité pleine, page vide — passent trivialement, c'est
attendu : ils gardent la non-régression, pas la fuite). 62/62 après.

Suites rejouées : `routes/users/` (21 suites, 272 témoins), `ContactDirectoryService`,
`PresenceVisibilityService`, et le paquet partagé (55 témoins). `tsc --noEmit`
propre sur la passerelle.

## 9. Ce que ce cycle laisse ouvert

**La famille de la présence non filtrée n'est pas close.** Le balayage du cycle
81 nommait quatre surfaces ; celle-ci en ferme une. Restent :

| surface | pourquoi c'est un écart |
|---|---|
| `storyAuthorSelect` (`services/posts/postIncludes.ts`), servi par `PostFeedService.fetchAndEnrichStories` | l'auteur d'une story porte `isOnline` / `lastActiveAt` bruts dans les DEUX projections (`storyPostInclude` et `trayStorySelect`) |
| `routes/communities/search.ts` | profils servis hors de tout contexte d'appartenance déjà vérifié |
| `routes/conversations/sharing.ts` | idem |

**Correction au balayage du cycle 81** : il annonçait « l'auteur d'un post porte
sa présence brute dans tout le fil social ». C'est plus étroit que ça, et il
fallait ouvrir le fichier pour le voir. Le fil général utilise `authorSelect`,
qui ne porte **aucune** présence ; seul `storyAuthorSelect` l'ajoute, par une
décision produit documentée sur place (l'interstitiel d'identité du viewer doit
être complet à l'instant du switch de groupe, sans résolution paresseuse).

Ce qui laisse une question de RÉGIME à trancher au cycle 83, et elle n'est pas
celle que le commentaire suppose. Il justifie la présence en écrivant que « la
visibilité de story gate déjà l'audience (amis / contacts DM / co-membres de
communauté) » — ce qui décrirait un **contexte acquis** (`resolvePrefsOnly`).
Mais `buildPostVisibilityOrFilter` porte aussi `{ visibility: PUBLIC }`, sans
condition d'audience : une story publique est visible de n'importe quel lecteur
authentifié, qui n'a posé **aucun** lien. Le critère du §5 dit donc STRICT, et
le commentaire qui dit l'inverse doit être corrigé en même temps que le gate —
c'est lui, pas le code, qui a rendu l'écart invisible.

Coût à mesurer avant de choisir : `resolveForTargets` ouvre 3 à 4 requêtes
bornées par page, sur un chemin qui en fait déjà une dizaine (`getFriendIds`,
contacts DM, co-membres, vues, réactions, mentions) — dont `getFriendIds`, que
le résolveur recalcule. À vérifier plutôt qu'à supposer.

**Les deux domaines voisins du cycle 80 restent ouverts** : appartenance à une
communauté, épinglage / archivage de CONVERSATION.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de
celui du dépôt). C'est l'environnement, pas le diff ; le lint du dépôt tourne
normalement en CI.

## 10. La leçon

> **Un raisonnement de clôture n'est pas une mesure.** Le cycle 81 a écarté le
> cas de l'ami accepté par déduction — « il aurait `FULL` de toute façon » — sans
> ouvrir la politique qui décide. La politique disait l'inverse, en une ligne, et
> cette déduction a laissé une fuite sur la population ENTIÈRE de la
> fonctionnalité au lieu de sa marge.
>
> Le discriminant est simple : quand une note de cycle écarte un cas par « de
> toute façon », c'est une hypothèse sur du code qu'on n'a pas lu. Le cycle
> suivant la teste — il ne l'hérite pas.

Et le corollaire, sur le fait que la moitié du symptôme ne sortait pas :

> **Une garde accidentelle est une dette, pas une garde.** `lastActiveAt` ne
> fuyait que parce qu'un schéma de sérialisation ne le déclare pas. Rien dans ce
> schéma ne dit « confidentialité » ; il sera étendu un jour par quelqu'un qui
> ajoute un champ pour une autre route, et la fuite reviendra sans qu'un seul
> témoin tombe. Une règle de confidentialité s'applique **à la source de la
> donnée**, jamais au dernier maillon qui se trouve, pour d'autres raisons, la
> laisser tomber.
