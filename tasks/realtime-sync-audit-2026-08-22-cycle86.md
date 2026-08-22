# Cycle 86 — Le balayage : 38 schémas de réponse vident ce qu'ils déclarent

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/conversations/stats.ts`, `routes/affiliate.ts`,
et l'inventaire complet de la famille

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Deux réponses REST cessent d'être vides — voir §4.

---

## 1. D'où vient ce cycle

Le cycle 84 bis a fermé `GET /communities/search` et a nommé sa marche
suivante en toutes lettres :

> **Le balayage `{ type: 'object' }` n'a pas été fait.** Ce cycle a corrigé les
> deux occurrences de la route qu'il visitait. La même déclaration existe
> peut-être ailleurs, et chacune vide silencieusement un objet de réponse.
> C'est la marche suivante la plus rentable de la famille.

Elle l'était. **Le balayage rend 38 sites**, sur 25 fichiers de routes.

## 2. Ce que le balayage cherche, et pourquoi il fallait l'outiller

Un `grep "type: 'object'"` rend 47 occurrences dans le gateway et ne dit rien :
la quasi-totalité sont légitimes (elles portent `properties`), et la moitié des
autres sont des schémas de REQUÊTE, où l'absence de `properties` est
permissive et non destructrice — AJV valide, il ne sérialise pas.

Le balayage utile discrimine trois choses que `grep` ne voit pas :

1. **Le bloc a-t-il `properties` / `additionalProperties` / `patternProperties` ?**
   Il faut donc résoudre l'objet littéral englobant, en comptant les accolades.
2. **Est-il sous `response:` ou sous `body` / `querystring` / `params` ?**
   Seul le premier passe par fast-json-stringify. Il faut donc calculer la
   portée de chaque clé `response:`.
3. **Le texte est-il du CODE ?** La première passe a rendu un faux positif :
   `routes/communities/search.ts:130` — le commentaire que le cycle 84 bis y a
   laissé pour EXPLIQUER le défaut. Un balayage qui ne dépouille pas les
   commentaires trouve les cycles précédents.

L'outil est jetable et vit dans le journal, pas dans le dépôt — mais la
procédure, elle, est reproductible et c'est ce qui compte.

## 3. La confirmation : le même bug, le même coût, une seconde fois

`GET /conversations/:id/stats` déclarait :

```ts
response: { 200: { type: 'object', properties: {
  success: { type: 'boolean' },
  data: { type: 'object' }            // ← la charge utile ENTIÈRE
} } }
```

Le handler calcule pourtant une charge utile riche : compteurs de tête, six
compteurs de type de contenu, `participantStats` aplati **et enrichi d'une
requête `user.findMany`** (nom, avatar), `dailyActivity` et
`languageDistribution` triés, `hourlyDistribution`. Tout cela sortait en `{}`.

**Et les deux clients qui l'appellent typent tous ces champs NON-optionnels** —
`ConversationMessageStatsResponse`, en Swift (`AgentAnalysisModels.swift`) et en
Kotlin (`ConversationStatsRepository`). Le `{}` ne dégradait donc pas
l'affichage : il levait `keyNotFound("conversationId")`.
**`fetchStats()` ne pouvait rendre qu'une erreur.** C'est le scénario exact du
cycle 84 bis sur `APICommunityUser`, à un cycle d'intervalle, sur une autre
route, avec un client de plus.

`POST /affiliate/register` porte le même défaut au même niveau (`data:`), pour
un coût moindre : les deux sorties de `convertAffiliateVisit` rendent la paire
`{ id, status }`, et l'appelant web (`use-registration-submit.ts`) ne lit pas le
corps. Réel, mais sans victime aujourd'hui.

### Pourquoi personne ne l'a vu : cinq témoins verts qui n'assertaient rien

`conversations/stats.test.ts` portait cinq témoins. Ils vérifient un 404, un
403, un 500, et deux fois `statusCode === 200` avec `body.success === true`.

**Pas un seul champ de `data`.** La route a servi `{}` pendant toute sa vie avec
une suite verte, parce que ses témoins attestaient qu'elle RÉPOND, jamais
qu'elle DIT quelque chose.

C'est le jumeau, côté lecture, de la règle que le cycle 85 vient d'inscrire pour
l'écriture — « un témoin d'écriture assert sur l'EFFET, jamais sur le statut ».
Les deux moitiés se rejoignent en une phrase : **`statusCode` n'est pas une
observation de la charge utile.**

## 4. Ce qui change dans les réponses

`GET /conversations/:id/stats` sert enfin sa charge utile. Le schéma la déclare
en distinguant les trois formes que `{ type: 'object' }` confondait :

| champ | forme | déclaration |
|---|---|---|
| `contentTypes` | objet FERMÉ, six compteurs nommés | `properties` |
| `hourlyDistribution` | vraie CARTE (`[String: Int]` iOS), clés = données | **`additionalProperties`** |
| `participantStats`, `dailyActivity`, `languageDistribution` | TABLEAUX aplatis par le handler | `items` + `properties` |

Cette ligne du milieu est la nuance que le cycle 84 bis n'avait pas eu à
trancher, et c'est la seule défense honnête de `{ type: 'object' }` : *« mais
c'est un objet libre ! »*. Il l'est parfois — et la déclaration qui le dit
s'appelle `additionalProperties`, pas le silence. **« Objet libre » n'est pas
synonyme de « pas de déclaration » ;** l'un laisse passer les clés inconnues,
l'autre les supprime toutes.

Les noms suivent les décodeurs clients (`ParticipantStatEntry`,
`DailyActivityEntry`, `LanguageEntry`), et le champ `name` y coexiste avec
`username` / `displayName` / `avatar` que le handler ajoute — les deux sont
servis, aucun n'est deviné.

`POST /affiliate/register` sert `{ id, status }` au lieu de `{}`.

## 5. Témoins

`conversations/stats.test.ts` : **5 → 11**. Six neufs sur la valeur SERVIE, tous
à travers `app.inject()` — donc à travers le vrai sérialiseur, seul endroit où
la panne est observable : compteurs de tête, `contentTypes` complet,
`participantStats` aplati et enrichi, les deux tableaux triés,
`hourlyDistribution` rendu comme carte aux clés inconnues, `updatedAt`.

`affiliate.test.ts` : **22 → 23**. Un neuf sur la relation servie.

**ROUGE prouvé : les 7 tombent sur le code d'avant.** Aucun ne borne
seulement la correction — contrairement aux cycles 83 et 84 bis, où un témoin
sur douze passait des deux côtés. Ici, chaque témoin neuf nomme un champ que le
sérialiseur supprimait.

## 6. L'inventaire — 36 sites restants, triés

Ce cycle corrige les deux sites de niveau `data:` (charge utile ENTIÈRE). Les 36
autres sont nommés ici, et **ne sont pas corrigés** : chacun demande la même
enquête que le §3 — quelle est la vraie forme, quel client la décode, que
casse-t-elle — et les traiter en lot sans cette enquête produirait des schémas
devinés, ce qui est un défaut de la même famille dans l'autre sens.

| champ vidé | sites | fichiers |
|---|---|---|
| `items` | 15 | `signal-protocol.ts:179,337` · `anonymous.ts:209,569` · `communities.ts:371` · `admin/roles.ts:82,212` · `admin/content.ts:56,206` · `admin/posts.ts:234` · `users/profile.ts:116,335,448,554,667` |
| `analysis` | 4 | `voice-analysis.ts:147,341,411,468` |
| `user` | 4 | `magic-link.ts:151,241` · `communities.ts:1604` · `communities/core.ts:524` |
| `attachment` | 2 | `voice/translation.ts:99,285` |
| `creator` | 2 | `communities.ts:370` · `links/admin.ts:74` |
| `message` | 2 | `conversations/messages-advanced.ts:119,715` |
| `session` | 2 | `magic-link.ts:154,244` |
| `details` | 1 | `calls.ts:159` |
| `link` | 1 | `conversations/sharing.ts:99` |
| `permissions` | 1 | `users/profile.ts:966` |
| `sender` | 1 | `messages.ts:113` |
| `transcription` | 1 | `voice/translation.ts:100` |

**Priorité suggérée, par gravité décroissante :**

1. **`items` × 15** — ce sont des LISTES : la réponse est un tableau de `{}`,
   autant d'éléments que d'entrées, tous vides. `users/profile.ts` en porte
   cinq à lui seul. Gravité maximale après `data:`, parce qu'un tableau non
   vide d'objets vides ressemble à une réponse valide.
2. **`user` × 4 et `sender`** — profils. Ils touchent la famille de la présence
   que les cycles 81–84 viennent de fermer : `communities/core.ts:524` et
   `communities.ts:1604` sont exactement le schéma qui a caché la fuite du
   cycle 84 bis. **Traiter chacun comme le cycle 84 bis a traité le sien** :
   déclarer le schéma ET poser le gate de présence dans le même lot, sans quoi
   la réparation publie la fuite.
3. **`message` × 2 et `attachment` / `transcription`** — charges utiles de
   messagerie, à confronter aux décodeurs iOS/Android avant de déclarer.
4. Le reste, un par un.

**Aucun de ces 36 n'est un « objet libre » présumé.** La question à poser à
chacun est celle du §4 : *carte à clés inconnues ⇒ `additionalProperties` ;
sinon ⇒ `properties`.* Le silence n'est jamais la réponse.

## 7. Coût

Nul. Deux schémas de sérialisation déclarés ; aucune requête ajoutée, aucun
appel de service modifié, aucun chemin de code touché. La sérialisation d'une
charge utile déclarée est plus rapide que celle d'un objet libre — c'est la
raison d'être de fast-json-stringify.

## 8. Ce que ce cycle laisse ouvert

- **Les 36 sites du §6**, triés mais non corrigés, avec pour chacun l'enquête
  du §3 à mener.
- **Le balayage n'a couvert que le gateway.** Aucune autre surface n'a été
  examinée pour cette famille.
- **Dérive `member` / `membership`** (`POST /conversations/:id/invite`) : le
  cousin de cette famille — un schéma qui déclare un champ que le handler ne
  pose pas. Gardée par un témoin depuis le cycle 84 ; la corriger reste un
  changement de forme de réponse qui appelle une demande.
- **Redondance `resolveForTargets` / `getFriendIds`** (pressentie cycle 82),
  désormais sur une branche fréquente.
- **Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
  dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place
  de celui du dépôt). C'est l'environnement, pas le diff.

## 9. La leçon

> **Un défaut trouvé une fois est une anecdote ; le balayage dit s'il est une
> espèce.** Le cycle 84 bis a corrigé deux `{ type: 'object' }` sur la route
> qu'il visitait et a nommé le balayage comme marche suivante. Ce balayage rend
> **38 sites sur 25 fichiers**, dont un qui casse le décodage de deux clients
> exactement comme le premier. La règle vaut donc d'être outillée plutôt que
> mémorisée — et le balayage doit dépouiller les commentaires, sans quoi il
> retrouve les cycles précédents au lieu des défauts.

Et le corollaire, sur ce qui a laissé le défaut vivre :

> **`statusCode` n'est pas une observation de la charge utile.** Cinq témoins
> verts couvraient une route qui servait `{}` : ils vérifiaient un 404, un 403,
> un 500, et deux fois `success === true`. Aucun ne nommait un champ de `data`.
> C'est le jumeau, côté lecture, de la règle inscrite au cycle 85 pour
> l'écriture — un témoin d'écriture assert sur l'effet, jamais sur le statut.
> Les deux moitiés tiennent ensemble : **une réponse se garde sur ce qu'elle
> DIT, et seul un témoin qui traverse le sérialiseur peut le voir.**
