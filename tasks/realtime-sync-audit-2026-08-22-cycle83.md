# Cycle 83 — Le commentaire disait que l'audience était gatée. La branche PUBLIC disait non.

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-ftmofu`
**Périmètre** : passerelle (`services/PostFeedService.ts`,
`services/posts/postIncludes.ts`) et sa suite de présence de story

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Une réponse REST change de contenu — voir §6.

---

## 1. D'où vient ce cycle

Le cycle 82 a fermé `GET /users/friend-requests` et, en corrigeant le balayage
du cycle 81, a nommé sa marche suivante avec la question qui restait à trancher :

> Seul `storyAuthorSelect` ajoute la présence […] Il justifie la présence en
> écrivant que « la visibilité de story gate déjà l'audience » — ce qui
> décrirait un contexte acquis. Mais `buildPostVisibilityOrFilter` porte aussi
> `{ visibility: PUBLIC }`, sans condition d'audience.

Elle a été prise, et la réponse est : **les deux régimes, choisis par auteur**.

## 2. Ce que le fil de stories faisait

`storyAuthorSelect` charge `isOnline` et `lastActiveAt` sur l'auteur, et les
deux projections de `PostFeedService.fetchAndEnrichStories` — l'include plein
(`storyPostInclude`) comme la projection tray (`trayStorySelect`) — servaient
ces deux champs **bruts**, sans jamais appeler `PresenceVisibilityService`.

Le chargement, lui, est une décision produit assumée et documentée sur place :
l'interstitiel d'identité du viewer (avatar, nom, pastille) doit être complet à
l'instant du switch de groupe, jamais résolu paresseusement après que la
diapositive est à l'écran. **Charger n'est pas servir**, et c'est exactement la
distinction qui manquait.

## 3. Ce qui a rendu l'écart invisible : trois témoins qui figeaient la mauvaise chose

`PostFeedService.stories-presence.test.ts` existait depuis le 2026-07-10 et
portait trois témoins :

```ts
expect(args.include?.author?.select?.isOnline).toBe(true);
expect(args.select?.author?.select?.isOnline).toBe(true);
expect(args.include?.author?.select?.isOnline).toBeUndefined();  // feed général
```

Trois assertions sur le `select` de la requête. **Aucune sur la valeur servie.**
Un fichier nommé « stories-presence » couvrait donc la présence des stories, en
vert, sans qu'une seule ligne ne puisse tomber si la donnée sortait brute — ce
qu'elle faisait.

Et le commentaire d'en-tête de `storyAuthorSelect` fermait le raisonnement :

> Presence stays scoped to the stories path: **story visibility already gates
> the audience** (friends / DM contacts / community co-members).

Cette phrase est fausse de la branche la plus large. `buildPostVisibilityOrFilter`
(`services/posts/postVisibility.ts`) :

```ts
OR: [
  { authorId: viewerId },
  { visibility: PostVisibility.PUBLIC },          // ← aucune condition d'audience
  { visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } },
  { visibility: PostVisibility.FRIENDS,   authorId: { in: audienceIds } },
  …
]
```

Une story PUBLIQUE est visible de **n'importe quel compte authentifié**. Le
commentaire énumérait trois audiences gatées et omettait la seule qui ne l'est
pas — celle par laquelle tout le monde passe. C'est lui, pas le code, qui a
tenu la porte ouverte.

## 4. Le régime, tranché par AUTEUR

Le critère de la passerelle est une question, pas une liste : *le lecteur a-t-il
un DROIT sur cette donnée, ou seulement un lien qu'il a posé tout seul ?*
Appliquée ici, elle ne rend pas un régime unique — elle rend une partition :

| ce que la story prouve | régime |
|---|---|
| `PUBLIC` — rien. N'importe qui la voit | **STRICT** (`resolveForTargets`) |
| `FRIENDS` / `EXCEPT` / `COMMUNITY` / `ONLY` / la mienne | **contexte acquis** (`resolvePrefsOnly`) |

Les quatre visibilités de la seconde ligne ont en commun ce que la première n'a
pas : un lien posé **des deux côtés** — amitié acceptée, contact d'une
conversation directe, co-appartenance à une communauté, ou une désignation
**nominative** par l'auteur lui-même (`ONLY`), qui est le lien le plus explicite
de tous.

Un régime unique aurait été faux dans les deux sens :

- **tout STRICT** aurait masqué la présence des co-membres de communauté et des
  destinataires nominatifs — `areConnected` ne reconnaît que l'amitié acceptée —
  c'est-à-dire retiré une pastille que la fonctionnalité pose exprès ;
- **tout `resolvePrefsOnly`** aurait laissé la story publique dire l'état en
  ligne de son auteur à un inconnu, et `resolvePrefsOnly` ne résout **ni le
  blocage ni la désactivation de compte** — la fuite du cycle 82, à l'identique.

**Un auteur qui prouve le lien par UNE de ses stories le prouve pour toutes.**
Masquer sa présence sur sa story publique pendant qu'elle s'affiche sur sa story
d'amis, dans la même page, ne décrirait rien.

## 5. Le viewer est construit en rôle `USER`, délibérément

`resolveForTargets` prend un `PresenceViewer` porteur d'un rôle, et le rôle ne
sert qu'à une chose : le bypass modérateur. `getStories` ne le reçoit pas, et il
n'a pas été câblé depuis les routes.

Ce n'est pas un raccourci : **le fil de stories est une surface de CONSOMMATION,
pas de modération.** Un modérateur qui fait défiler ses stories n'a aucun titre à
voir la présence que les auteurs ont coupée, et fixer le rôle garantit que ce
gate ne peut jamais qu'en montrer **moins** — la seule direction dans laquelle
une porte de confidentialité a le droit de se tromper.

## 6. Ce qui change dans la réponse

`GET /posts/stories` et `GET /posts/stories/mine` : `author.isOnline` vaut
`false` et `author.lastActiveAt` vaut `null` quand la présence n'est pas
montrable. Même collapse que le cycle 82, par le même applicateur partagé
(`applyPresenceVisibilityAsOffline`) — `false` plutôt que `null`, parce que les
clients typent le champ `boolean` et qu'une pastille absente est la lecture
produit correcte.

Une visibilité **absente** de la carte résolue vaut masquée. Une page vide
n'ouvre aucune des deux requêtes.

## 7. Coût

Deux résolutions au plus par page, en parallèle, sur les auteurs DISTINCTS —
une page de 50 stories vient typiquement d'une poignée d'auteurs. La branche
contexte acquis coûte une lecture de préférences (mutualisée par le cache de
`PrivacyPreferencesService`) ; la branche stricte n'est ouverte que s'il reste
au moins un auteur vu uniquement en public, ce qui est le cas rare dans un fil
de stories, qui est par nature un fil de proches.

La redondance pressentie au cycle 82 (« `resolveForTargets` recalcule
`getFriendIds` ») n'a pas été traitée : elle ne se paie que sur la branche
stricte, c'est-à-dire justement celle qui ne s'ouvre presque jamais. Constat
assumé, pas dette cachée.

## 8. Témoins

`PostFeedService.stories-presence.test.ts` passe de 3 à 12 témoins. Les trois
d'origine restent — ils gardent la décision de CHARGER, qui n'est pas en cause —
et neuf s'ajoutent, qui gardent celle de SERVIR : masquage, conservation,
routage vers `resolvePrefsOnly` pour une story de communauté, routage vers
`resolveForTargets` pour une story publique (viewer `USER` compris), l'auteur
mixte public + amis classé au contexte acquis, ma propre story publique jamais
masquée, l'auteur non rendu masqué, la projection tray filtrée elle aussi, et la
page vide qui n'ouvre rien.

**ROUGE prouvé** : 7 des 9 témoins neufs tombent sur le code d'avant. Les 2
restants — « conserve la présence quand l'auteur l'autorise » et « n'ouvre
aucune résolution sur une page vide » — passent trivialement, et c'est attendu :
ils bornent la correction, ils ne détectent pas la fuite.

Suites rejouées : `PostFeedService*`, `routes/posts/`, `services/posts/`,
`posts-feed` — 65 suites, 1393 témoins verts. `tsc --noEmit` propre.

## 9. Ce que ce cycle laisse ouvert

Restent, de la famille nommée au cycle 81 :

| surface | pourquoi c'est un écart |
|---|---|
| `routes/communities/search.ts` | profils servis hors de tout contexte d'appartenance déjà vérifié |
| `routes/conversations/sharing.ts` | idem |

Les deux sont de petite taille et de même forme que le cycle 82 — elles peuvent
tenir dans un seul cycle 84.

**Les deux domaines voisins du cycle 80 restent ouverts** : appartenance à une
communauté, épinglage / archivage de CONVERSATION.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de
celui du dépôt). C'est l'environnement, pas le diff.

## 10. La leçon

> **Un témoin qui fige la REQUÊTE n'atteste rien de la RÉPONSE.** Un fichier
> nommé `stories-presence` existait, portait trois assertions sur la présence,
> et était vert. Aucune ne pouvait tomber si la donnée sortait brute : elles
> vérifiaient toutes les trois que le `select` DEMANDE les champs, jamais ce que
> le handler en FAIT. Le défaut vivait dans l'espace exact entre les deux.
>
> Le discriminant est court : **un témoin de confidentialité assert sur la
> valeur servie, jamais sur la forme de la requête.** Une assertion de `select`
> garde une décision de chargement — utile, et c'est ce que ces trois-là font
> bien — mais elle ne doit jamais être ce qui fait dire « la présence est
> couverte ».

Et le corollaire, sur ce qui a réellement tenu la porte :

> **Un commentaire qui énumère peut mentir par la ligne qu'il n'écrit pas.** Il
> nommait trois audiences gatées et omettait `PUBLIC`, la seule qui ne l'est
> pas. Il n'était faux nulle part — il était incomplet là où l'incomplétude
> valait autorisation. Une note qui justifie une exposition de donnée doit citer
> la règle qui la gate, pas la paraphraser : le code de
> `buildPostVisibilityOrFilter` tient sur six lignes, et les lire aurait pris
> moins de temps que d'écrire la phrase qui les résume mal.
