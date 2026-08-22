# Cycle 84 bis — `{ type: 'object' }` ne décrit pas « un objet ». Il décrit `{}`.

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/communities/search.ts` (et la retenue
`isOnline` de l'invitation dans `routes/conversations/sharing.ts`)

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Une réponse REST change de contenu — voir §7.

---

## 0. Ce cycle EXÉCUTE le témoin que le cycle 84 a posé

Ce cycle a été mené **en parallèle** du cycle 84
(`claude/keen-hamilton-ftmofu`, PR #3292), sans que l'un connaisse l'autre. Les
deux ont examiné les mêmes trois portes ; ils ont réparé des choses
différentes, et se recouvrent sur une seule — `PATCH /conversations/:id`.

**Le recouvrement est résolu en faveur du cycle 84, entièrement** : sa version
est fusionnée sur `main`, elle est meilleure (elle retire en plus le
sous-`select` `user` mort, que `conversationParticipantSchema` ne déclare pas),
et son défaut de carte absente est explicitement raisonné dans le bon sens
— absent ⇒ MONTRABLE sur `resolvePrefsOnly`, l'inverse du strict, parce qu'un
anonyme n'a pas de `userId`. Mes témoins sur ce point ont été retirés au profit
des siens ; il n'en reste que deux qu'il ne couvrait pas (`showLastSeen` coupé
seul, et la retenue `isOnline` de l'invitation).

Ce qui reste est ce que le cycle 84 a **délibérément laissé ouvert**, en posant
sur `GET /communities/search` un témoin dont il a écrit qu'il devait tomber :

> Ce témoin garde la PROPRIÉTÉ DE CONFIDENTIALITÉ, pas la forme actuelle […]
> le jour où quelqu'un déclare les propriétés du schéma pour faire vivre
> l'aperçu, ce témoin doit tomber — **et le forcer à poser le gate STRICT en
> même temps.**

Ce cycle est ce jour-là. Le témoin tombe, le gate strict est posé dans le même
lot, et le témoin est réécrit sur la propriété neuve. C'est la suite prévue, pas
un contournement — et c'est le seul ordre dans lequel elle pouvait se faire.

J'emprunte au passage son `applyPresenceVisibilityAsOffline` assoupli
(`lastActiveAt` OPTIONNEL, la clé n'est plus fabriquée), qui est strictement
meilleur que ce que j'avais fait : je chargeais `lastActiveAt` uniquement pour
satisfaire le type. Le `select` ne le charge plus.

## 1. D'où vient ce cycle

Le cycle 83 a fermé le fil de stories et a nommé sa marche suivante :

> | surface | pourquoi c'est un écart |
> |---|---|
> | `routes/communities/search.ts` | profils servis hors de tout contexte d'appartenance déjà vérifié |
> | `routes/conversations/sharing.ts` | idem |
> Les deux sont de petite taille et de même forme que le cycle 82 — elles
> peuvent tenir dans un seul cycle 84.

Elles y tiennent. Mais la première n'avait pas la forme annoncée : la fuite
qu'on venait chercher n'existait pas encore, parce qu'une **panne de
sérialisation** vidait la réponse entière — présence comprise. Le cycle a donc
deux moitiés, et l'ordre entre elles n'est pas indifférent.

## 2. `GET /communities/search` ne rendait ni `creator` ni `members`

Le schéma de réponse déclarait :

```ts
creator: { type: 'object' },
members: { type: 'array', items: { type: 'object' } }
```

`fast-json-stringify` applique `additionalProperties: false` **par défaut**. Un
objet sans `properties` ne décrit donc aucun champ, et le sérialiseur les retire
tous. Vérifié en isolant le compilateur :

```
in : { id: 'c1', members: [{ id: 'm1', user: {…} }], creator: { id: 'u9', username: 'bob' } }
out: {"id":"c1","members":[{}],"creator":{}}
```

`{ type: 'object' }` se lit comme « ici, un objet » — c'est-à-dire, croit-on,
« passe-le tel quel ». Il dit l'inverse : « ici, un objet, et je ne connais
aucune de ses clés ».

### Ce que ça coûtait sur iOS : la réponse ENTIÈRE

`APICommunitySearchResult` déclare `creator: APICommunityUser?` et
`members: [APICommunityMember]?`. Optionnels — mais la clé est **présente** et
vaut `{}`, donc `decodeIfPresent` entre bel et bien dans le décodage, et
`APICommunityUser.id` / `.username` sont des `String` non-optionnels :

```
keyNotFound(CodingKeys(stringValue: "id"))
```

Une erreur de décodage sur un élément fait échouer le conteneur qui le porte,
donc la réponse complète. **`CommunityService.search()` ne pouvait rien rendre
d'autre qu'une erreur** — la recherche de communautés iOS était morte de bout en
bout, pas dégradée. Le web (JSON permissif) affichait simplement un créateur et
des membres vides.

Le correctif rend les deux schémas explicites, en réutilisant ceux qui décrivent
déjà exactement les types iOS : `userMinimalSchema` (miroir de
`APICommunityUser`) et `communityMemberSchema` (miroir de `APICommunityMember`,
`user` compris).

## 3. Et c'est là que la présence entre

`storyAuthorSelect` du cycle 83 servait la présence brute. Ici, le `select`
chargeait `isOnline` sur les membres — mais le sérialiseur l'effaçait avec tout
le reste. **La confidentialité tenait par la panne.**

C'est la raison pour laquelle les deux moitiés de ce cycle ne pouvaient pas être
séparées : réparer le schéma **sans** poser le gate aurait ouvert la fuite le
jour même, et aucun témoin du dépôt n'aurait pu tomber — il n'y en avait aucun
sur cette route. Le cycle 83 avait écrit « fast-json-stringify n'est pas une
garde de confidentialité » en parlant d'une omission de schéma ; ici la garde
accidentelle ne portait pas sur un champ mais sur **l'objet entier**, et la
réparation légitime de l'un débloquait l'autre.

## 4. Le régime, tranché par LIGNE

Même partition qu'au cycle 83, et pour la même raison : la route sert des
communautés `isPrivate: false` **sans aucune condition d'appartenance**.

| ce que la ligne prouve | régime |
|---|---|
| communauté publique que le lecteur ne fait que découvrir | **STRICT** (`resolveForTargets`) |
| communauté dont le lecteur est membre ACTIF | **contexte acquis** (`resolvePrefsOnly`) |

Un régime unique s'y trompe dans les deux sens, exactement comme au cycle 83 :
tout strict retirerait la pastille des co-membres — que
`GET /communities/:id/members` affiche déjà, et que `areConnected` ne
reconnaîtrait pas faute d'amitié ; tout `resolvePrefsOnly` dirait l'état en
ligne d'un inconnu à quiconque tape trois lettres dans une barre de recherche,
sans résoudre ni le blocage ni la désactivation de compte.

Et le corollaire du cycle 83 s'applique tel quel : **un membre qui prouve le
lien par UNE communauté de la page le prouve pour toutes.** Masquer sa pastille
sur une ligne pendant qu'elle s'affiche sur la suivante, dans la même page, ne
décrirait rien.

Le viewer vient de `viewerFromRequest`, et l'appartenance du lecteur est lue
avec `isActive: true` : une communauté quittée ne prouve plus rien, et la ligne
retombe en découverte.

## 5. `PATCH /conversations/:id` — la fuite réelle, fermée par le cycle 84

J'avais trouvé et corrigé la même chose, indépendamment. **C'est sa version qui
reste**, et le §0 dit pourquoi. Je consigne ici ce que la comparaison des deux
a appris, parce que c'est la partie qui a de la valeur :

1. **Il retire en plus le sous-`select` `user`, entièrement.** Je le GATAIS ; il
   l'a SUPPRIMÉ. `conversationParticipantSchema` ne déclare pas `user`, donc ce
   sous-objet ne pouvait atteindre aucun client : je posais une garde sur une
   donnée qui n'avait pas de lecteur, quand la bonne réponse était de ne pas la
   charger. C'est exactement la règle que j'applique moi-même au §6 sur
   l'invitation — je ne l'avais pas vue s'appliquer ici.

2. **Son défaut de carte absente est le bon, et il est l'INVERSE du mien.**
   J'ai employé `applyPresenceVisibilityAsOffline`, dont le contrat est
   « visibilité absente ⇒ MASQUÉ » — correct sous le critère strict, où un id
   non rendu est une anomalie. Sous `resolvePrefsOnly`, un id manquant est la
   situation NORMALE : un participant **anonyme** n'a pas de `userId`, donc pas
   de préférences, et il doit rester VISIBLE. Mon code obtenait le même résultat
   par un garde explicite (`if (!visibility) return participant`), mais par
   accident de structure plutôt que par contrat — l'idiome `=== false` de
   `participants.ts` qu'il recopie dit la règle, le mien la contournait.

Les deux régimes ont donc des défauts **opposés** sur une carte incomplète, et
les deux ont raison. C'est une règle qui manquait à `CLAUDE.md` ; il l'y a mise.

## 6. `POST /conversations/:id/invite` — retirer plutôt que garder

Le `select` de l'invité chargeait `isOnline`. Il n'a jamais eu de destinataire :
le schéma de réponse déclare `data.membership` quand le handler renvoie
`data.member`, et `fast-json-stringify` supprime donc l'objet en entier. Aucun
client ne le lit — la modale web (`invite-user-modal.tsx`) ne regarde que
`success`, le SDK iOS n'appelle pas cette route.

Deux issues possibles : poser un gate, ou ne pas charger. **Le cycle 83 a
autorisé de CHARGER sans servir quand une raison produit le justifie**
(l'interstitiel du viewer de stories doit être complet au switch de groupe).
Ici il n'y en a aucune : le champ est chargé pour personne. Il est retiré.

C'est le choix le plus sûr des deux, et pour une raison précise : la dérive
`member` / `membership` **est un correctif qui viendra**, et le jour où
quelqu'un l'aligne, un gate oublié ferait partir la présence brute d'un invité
sur le fil sans qu'un seul témoin ne tombe. Un champ qu'on ne charge pas ne peut
pas fuir par une réparation faite ailleurs.

La dérive elle-même n'est PAS corrigée dans ce cycle : elle change la forme
d'une réponse sans qu'aucun client ne l'ait demandée. Elle est nommée au §10.

## 7. Ce qui change dans les réponses

`GET /communities/search` :
- `creator` porte enfin ses champs (`id`, `username`, `displayName`, `avatar`) ;
- `members[]` porte enfin les siens (`id`, `communityId`, `userId`, `role`,
  `joinedAt`, `user`) ;
- `members[].user.isOnline` vaut `false` quand la présence n'est pas montrable.
  Collapse par l'applicateur partagé `applyPresenceVisibilityAsOffline` —
  `false` plutôt que `null`, parce que `userMinimalSchema` type le champ
  `boolean`. Une visibilité **absente** de la carte vaut masquée.
- `lastActiveAt` n'est ni chargé ni servi. J'avais commencé par le charger pour
  satisfaire la signature de l'applicateur partagé ; le cycle 84 a assoupli
  celle-ci (`lastActiveAt` OPTIONNEL, la clé n'est plus fabriquée), ce qui rend
  la charge inutile. **Une réponse ne gagne pas un champ parce qu'on l'a
  filtrée**, et on ne charge pas une donnée pour contenter un type.

`PATCH /conversations/:id` : gaté par le cycle 84, pas par ce lot (§5).

`POST /conversations/:id/invite` : inchangée sur le fil (l'objet retiré était
déjà supprimé par le sérialiseur — ce que
`conversation-invite-serialization.test.ts` prouve en traversant le vrai
sérialiseur).

### 7 bis. Une conséquence du §2 qu'il fallait payer dans le même lot

L'`include` des membres de la recherche n'avait **aucun `where`** : il prenait
les 5 premières lignes `CommunityMember`, actives ou non. Tant que le schéma
vidait `members[]` en `{}`, c'était inobservable. Réparer le schéma sans y
toucher aurait donc présenté comme membre d'une communauté publique quelqu'un
qui l'a quittée — un fait faux, publié par le correctif lui-même.

`where: { isActive: true }` s'ajoute donc dans le même lot. C'est la même
mécanique qu'au §3, appliquée à un autre champ : **réparer ce qui rendait une
donnée invisible oblige à vérifier tout ce que cette donnée affirme**, pas
seulement ce qu'elle expose de confidentiel.

## 8. Coût

**Recherche de communautés** : au plus deux résolutions par page, en parallèle,
sur les utilisateurs DISTINCTS (5 membres × 20 communautés au maximum
absolu), plus une lecture indexée `communityMember` bornée aux communautés de
la page. La branche stricte n'est ouverte que s'il reste au moins un membre vu
uniquement en découverte — le cas fréquent ici, contrairement au fil de stories
du cycle 83 où c'était le cas rare.

**PATCH conversation** : une lecture de préférences, mutualisée par le cache de
`PrivacyPreferencesService`, sur une route d'écriture rare (renommer un fil).

La redondance pressentie au cycle 82 (`resolveForTargets` recalcule
`getFriendIds`) n'est toujours pas traitée. Elle se paie désormais sur une
branche fréquente — c'est le premier cycle où elle mérite d'être regardée.
Constat assumé, nommé au §10.

## 9. Témoins

**`communities-search.test.ts` : 7 → 19 témoins.** Douze neufs, tous à travers
`app.inject()` — donc à travers le VRAI sérialiseur, seul endroit où la panne du
§2 est observable :

- `creator` porte ses champs d'identité ;
- chaque `members[i]` porte ses champs d'appartenance et son `user` ;
- masquage sous le résolveur strict, conservation quand il autorise ;
- routage vers `resolveForTargets` pour une communauté non partagée ;
- routage vers `resolvePrefsOnly` pour une communauté partagée ;
- une appartenance quittée ne bascule pas le régime ;
- un membre rencontré dans une communauté partagée est prefs-only **sur toute la
  page**, pendant que l'autre reste strict ;
- un membre absent de la carte est masqué ;
- une page sans membre n'ouvre aucune résolution ;
- `lastActiveAt` n'atteint jamais la charge utile ;
- l'aperçu ne présente que des appartenances ACTIVES (§7 bis).

**ROUGE prouvé** : **11 des 12** tombent sur le code d'avant. Le douzième — « une
page sans membre n'ouvre aucune résolution » — passe trivialement : il borne la
correction, il ne détecte pas la fuite.

Le double d'`authContext` du harnais a dû être corrigé pour porter sa forme
RÉELLE (`type: 'user'` + `registeredUser.role`) : sans elle,
`viewerFromRequest` rend `null`, ce qui masque tout et rendrait « vert » un
gate qui ne discrimine rien. Le double d'origine ne pouvait pas le signaler,
puisqu'aucun témoin ne lisait la présence.

Le double de `@meeshy/shared/types/api-schemas` a été **supprimé** : il ne
rendait qu'`errorResponseSchema`, et un schéma doublé aurait masqué très
exactement ce que ces témoins doivent traverser.

**`communities/search.test.ts`** (le fichier du cycle 84) : son témoin périmé —
« ne sert ni isOnline ni profil de membre » — est **réécrit**, pas supprimé. Il
gardait une non-fuite accidentelle en portant sa propre condition de péremption
(§0) ; il garde désormais la propriété neuve, en trois témoins : l'aperçu SORT
(créateur et membre avec leurs champs), sa présence est MASQUÉE pour un lecteur
qui ne prouve aucun lien, et `lastActiveAt` n'est pas fabriqué.

**`conversation-sharing.test.ts`.** Mes six témoins sur le gate du PATCH ont été
**retirés au profit de ceux du cycle 84**, qui couvrent le même terrain et dont
l'implémentation est celle qui reste. Deux subsistent, qu'ils ne couvraient pas :

- `showLastSeen` coupé SEUL retire l'horodatage et garde la pastille — les deux
  préférences sont indépendantes, et un collapse qui les traiterait comme un
  drapeau unique passerait leurs quatre témoins sans que celui-ci tienne ;
- la présence de l'invité n'est pas chargée.

Ce second-là est une assertion de **chargement**, et c'est délibéré : la
décision sous test EST une décision de chargement. Le cycle 83 avait tranché ce
point dans les deux sens — « une assertion de `select` garde une décision de
chargement, utile ; elle ne doit jamais être ce qui fait dire *la présence est
couverte* ». Ce qu'elle NE dit pas est couvert, et par eux :
`conversation-invite-serialization.test.ts` (cycle 84) traverse la
sérialisation réelle et prouve qu'aucune présence ne sort de cette route.

**Suites rejouées** : suite COMPLÈTE du gateway sous bun (parité CI), plus
`packages/shared` (98 fichiers, 2364 témoins) après reconstruction — la
signature de `applyPresenceVisibilityAsOffline` a changé sur `main`.
`tsc --noEmit` propre.

## 10. Ce que ce cycle laisse ouvert

**Le balayage `{ type: 'object' }` n'a pas été fait.** Ce cycle a corrigé les
deux occurrences de la route qu'il visitait. La même déclaration existe
peut-être ailleurs, et chacune vide silencieusement un objet de réponse. C'est
la marche suivante la plus rentable de la famille : un `grep` sur
`type: 'object'` sans `properties` dans les schémas de réponse, et pour chaque
occurrence la même question en deux temps — *quel client la décode, et que
cache-t-elle en la vidant ?*

**Dérive `member` / `membership`** sur `POST /conversations/:id/invite` : le
schéma documente un champ que le handler ne renvoie pas. Aucun client ne le lit
aujourd'hui ; le corriger est un changement de forme de réponse qui appelle une
demande, pas une initiative. À traiter avec le balayage ci-dessus, dont il est
un cas particulier.

**Redondance `resolveForTargets` / `getFriendIds`** (pressentie cycle 82) : elle
se paie maintenant sur une branche fréquente. Premier cycle où la mesure vaut
d'être prise.

**Les deux domaines voisins du cycle 80 restent ouverts** : appartenance à une
communauté, épinglage / archivage de CONVERSATION.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de
celui du dépôt). C'est l'environnement, pas le diff.

## 11. La leçon

> **Une déclaration de schéma qui ne décrit rien ne « laisse pas passer » — elle
> efface.** `{ type: 'object' }` se lit comme « ici, un objet, tel quel » et
> signifie « ici, un objet dont je ne connais aucune clé » ; avec
> `additionalProperties: false` par défaut, `fast-json-stringify` rend `{}`.
> Le contrat OpenAPI affichait `creator` et `members`, la requête Prisma les
> chargeait, le handler les étalait — et le client recevait deux objets vides.
> Le discriminant est mécanique : **dans un schéma de réponse, un `type:
> 'object'` sans `properties` est un bug, jamais un choix.**

Et le corollaire, qui est la vraie raison pour laquelle ce cycle est un lot
indivisible :

> **Une panne peut TENIR une porte de confidentialité, et la réparer l'ouvre.**
> La présence des membres était chargée, non gatée, et invisible — parce que le
> sérialiseur vidait l'objet qui la portait. Rien ne fuyait ; rien n'était
> protégé non plus. Le jour où quelqu'un répare le schéma pour une raison
> parfaitement légitime (les clients ne reçoivent pas leurs données), la fuite
> naît de ce correctif-là, et aucun témoin ne tombe puisqu'il n'y en avait
> aucun. **Quand on répare ce qui rendait une donnée invisible, on pose dans le
> MÊME lot la règle qui décide si elle a le droit d'être vue** — l'ordre inverse
> n'existe pas, et les faire séparément revient à publier la fuite entre les
> deux.
