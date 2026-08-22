# Cycle 87 — Trois listes d'administration servaient des rangées vides, et mon propre tri les avait mal classées

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/admin/content.ts`, `routes/admin/posts.ts`

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Trois réponses REST cessent de sortir vides — voir §4.

---

## 0. Correction du tri que le cycle 86 bis a publié

L'inventaire du cycle 86 bis (§6) rangeait quatorze sites sous l'étiquette
`items`, avec cette priorité :

> **`items` × 15** — ce sont des LISTES : la réponse est un tableau de `{}`,
> autant d'éléments que d'entrées, tous vides. […] Gravité maximale après
> `data:`, parce qu'un tableau non vide d'objets vides ressemble à une réponse
> valide.

La phrase décrivait bien le défaut. **Le tri, lui, était faux**, et pour une
raison mécanique : mon extracteur nommait chaque site d'après la clé qui porte
l'objet littéral ENGLOBANT. Sur

```ts
data: { type: 'array', items: { type: 'object' } }
```

l'objet nu est porté par `items` — le mot-clé JSON Schema — et non par `data`.
**Trois charges utiles ENTIÈRES se sont donc rangées sous une étiquette de
détail**, pendant que j'annonçais n'avoir laissé que deux sites de niveau
`data:`. Lecture réelle, obtenue en classant les quatorze par code de statut :

| ce que le tri disait | ce que les sites sont |
|---|---|
| 14 × `items`, « listes vides », gravité max après `data:` | **11** sur des réponses **400**, champs `details` / `errors` |
| — | **3** sur des réponses **200**, `data:` — charges utiles ENTIÈRES |

Et les onze de la première ligne ne sont même pas des vidages : `details` et
`errors` n'ont **aucun producteur**. `sendError` (`utils/response.ts`) accepte
bien un `details`, mais typé `Record<string, unknown>` — un objet, quand le
schéma déclare un tableau — et aucun appelant de ces routes ne le passe. C'est
la dérive INVERSE, celle que `CLAUDE.md` nomme déjà : un schéma qui déclare un
champ que le handler ne pose jamais. Gravité réelle : documentaire.

**La leçon de méthode** : un inventaire qui groupe par une clé EXTRAITE doit
prouver que la clé extraite est la bonne. J'ai publié une priorité sans ouvrir
un seul des quatorze sites, et l'étiquette qui les rassemblait était un artefact
de mon script. Le §6 du cycle 86 bis est corrigé en conséquence (§6 ci-dessous).

## 1. Les trois vraies : les listes d'administration

| route | fichier | lue par |
|---|---|---|
| `GET /admin/messages` | `admin/content.ts` | `admin.service.ts:227` |
| `GET /admin/communities` | `admin/content.ts` | `admin.service.ts:249` |
| `GET /admin/posts` | `admin/posts.ts` | `UserPostsSection.tsx:83` |

Les trois déclaraient `data: { type: 'array', items: { type: 'object' } }`.
Sans `properties`, fast-json-stringify applique `additionalProperties: false`
par défaut et sérialise **chaque élément** en `{}`.

La réponse gardait donc sa **longueur** et sa **pagination** — `total`,
`hasMore`, tout juste — et perdait la totalité de son contenu. Les trois
tableaux de bord web rendaient des rangées sans rien dedans.

**C'est la forme la plus trompeuse de ce défaut.** Une charge utile de niveau
`data:` qui sort en `{}` se voit : rien ne s'affiche, quelqu'un finit par le
signaler. Une LISTE de la bonne taille, paginée correctement, dont chaque ligne
est vide, ressemble à un bug d'affichage — et se cherche du mauvais côté.

## 2. Pourquoi personne ne l'a vu — pour la troisième fois

`admin-content.test.ts` couvrait ces routes par : un 401, un 403, un 500, et
`statusCode === 200` avec `body.success === true`.

**Pas un champ de `data`.** Et le double de Prisma rendait `[]`, si bien qu'une
assertion de contenu y aurait de toute façon été vide.

C'est la troisième occurrence du même angle mort en deux cycles — après
`conversations/stats.test.ts` (cycle 86 bis) et les cinq témoins de la même
forme. La règle est déjà écrite dans `CLAUDE.md` depuis le cycle 86 bis ; ce
cycle n'en ajoute pas, il montre qu'elle avait raison une fois de plus.

## 3. Le double du harnais faisait partie du problème

`mockPrisma.message.findMany.mockResolvedValue([])` : un double qui rend une
liste VIDE ne peut prouver aucune propriété d'une ligne. Les témoins neufs
posent des lignes réelles — message avec auteur, fil, pièce jointe et compteur
de réponses ; communauté avec créateur et `_count` ; post avec ses six
compteurs, son auteur et son média.

**Un double qui rend `[]` rend tout témoin de contenu trivialement vert.** Il
n'y a pas de différence observable entre « la route sert bien ses lignes » et
« la route n'a aucune ligne à servir » tant que le double ne contient rien.

## 4. Ce qui change dans les réponses

Les trois listes portent enfin leurs lignes. Les schémas suivent le `select`
Prisma de chaque handler — seule source de vérité, puisque la valeur part telle
quelle dans `sendPaginatedSuccess` :

- **messages** : `content`, `messageType`, `originalLanguage`, `isEdited`,
  `createdAt`, `sender` (avec son `user` imbriqué), `conversation`,
  `attachments`, `_count.replies` ;
- **communautés** : identité, `isPrivate`, `createdAt`, `creator`,
  `_count.{members,Conversation}` ;
- **posts** : contenu, visibilité, les six compteurs, `author`, `media`,
  `_count.{comments,views,bookmarks}`.

### Une exception assumée : `attachments` et `media` passent ENTIERS

Les deux emploient `additionalProperties: true` plutôt qu'une liste de
`properties`. Ce n'est pas un retour au silence — c'est l'autre déclaration
légitime, celle du cycle 86 bis :

> carte à clés inconnues ⇒ `additionalProperties` ; sinon ⇒ `properties`.

`attachmentMediaSelect` et `mediaSelect` portent respectivement une quinzaine et
dix-neuf champs, et suivent le pipeline média. Dans une vue d'ADMINISTRATION,
une pièce jointe est une donnée d'inspection, pas un contrat client : en figer
une copie ici garantirait qu'elle dérive du `select` partagé au premier champ
ajouté — et le symptôme de cette dérive serait, précisément, un champ qui
disparaît en silence. Laisser passer l'objet entier est le choix qui ne peut pas
se périmer.

La distinction tient en une question : **est-ce que je connais et possède la
liste des clés ?** Pour un post, oui — le `select` est juste au-dessus. Pour son
média, non — il vient d'un module partagé qui évolue sans moi.

## 5. Témoins

`admin-content.test.ts` : **10 → 14**. `admin-routes-group3.test.ts` :
**106 → 109**.

Sept neufs, tous à travers `app.inject()` — donc le vrai sérialiseur :

- chaque message sert contenu, auteur (et son `user`), fil, `_count` ;
- la pièce jointe passe entière ;
- chaque communauté sert identité, créateur, compteurs ;
- chaque post sert contenu, les six compteurs, auteur ;
- le média passe entier ;
- la pagination reste juste — **deux témoins**, un par fichier.

**ROUGE prouvé : 5 des 7 tombent** sur le code d'avant. Les deux qui passent des
deux côtés sont les témoins de pagination, et c'est **leur raison d'être** : ils
attestent ce qui rendait la liste vide CRÉDIBLE. Un témoin qui documente
pourquoi un défaut a survécu n'a pas à tomber avec lui.

## 6. L'inventaire, corrigé — 31 sites restants

| champ vidé | sites | gravité |
|---|---|---|
| `details` / `errors` sur **400** | 11 | **documentaire** — aucun producteur (§0) |
| `analysis` | 4 | à instruire — `voice-analysis.ts:147,341,411,468` |
| `user` | 4 | **présence** — `magic-link.ts:151,241`, `communities.ts:1695`, `communities/core.ts:524` |
| `session` | 2 | à instruire — `magic-link.ts:154,244` |
| `attachment` | 2 | à instruire — `voice/translation.ts:99,285` |
| `message` | 2 | à instruire — `conversations/messages-advanced.ts:119,715` |
| `creator` | 1 | `links/admin.ts:74` |
| `details` (200) | 1 | `calls.ts:159` |
| `link` | 1 | `conversations/sharing.ts:99` |
| `permissions` | 1 | `users/profile.ts:966` |
| `sender` | 1 | **présence** — `messages.ts:113` |
| `transcription` | 1 | `voice/translation.ts:100` |

**Priorité révisée, et cette fois les sites ont été ouverts :**

1. **`user` × 4 + `sender`** — les seuls qui touchent la présence. Schéma **et**
   gate dans le même lot, sans quoi la réparation publie la fuite (règle du
   cycle 84 bis). `communities/core.ts:524` est dans le module OMBRÉ : vérifier
   d'abord qui enregistre la route.
2. **`message` × 2, `attachment` × 2, `transcription`** — charges utiles de
   messagerie, à confronter aux décodeurs iOS/Android.
3. **`analysis` × 4, `session` × 2, le reste** — un par un.
4. **Les 11 de la ligne `400`** — les retirer plutôt que les déclarer : un champ
   sans producteur ne se documente pas, il se supprime. À faire en un lot, sans
   urgence.

## 7. Coût

Nul. Trois schémas de sérialisation déclarés ; aucune requête, aucun appel de
service, aucun chemin de code touché.

## 8. Ce que ce cycle laisse ouvert

- Les **31 sites du §6**, triés — cette fois après lecture.
- Le balayage n'a couvert que **le gateway**.
- Dérive `member` / `membership` (`POST /conversations/:id/invite`).
- Redondance `resolveForTargets` / `getFriendIds` (cycle 82).
- **Dette d'environnement, inchangée depuis le cycle 79** : `npx eslint` échoue
  dans ce conteneur. C'est l'environnement, pas le diff.

## 9. La leçon

> **Un inventaire qui groupe par une clé extraite doit prouver que la clé est
> la bonne.** J'ai publié une priorité sur quatorze sites sans en ouvrir un
> seul ; l'étiquette qui les rassemblait — `items` — était le mot-clé JSON
> Schema porteur de l'objet nu, pas le champ de la réponse. Trois charges utiles
> ENTIÈRES se sont ainsi rangées sous une étiquette de détail, dans le même
> document où j'écrivais n'en avoir laissé que deux. **Un tri est une
> affirmation ; il se vérifie comme une affirmation.**

Et le corollaire, sur ce que ces trois-là révèlent :

> **La liste vide est plus dangereuse que la réponse vide.** Une charge utile de
> niveau `data:` sérialisée en `{}` se voit — l'écran est blanc, quelqu'un le
> dit. Une liste de la bonne longueur, à la pagination juste, dont chaque ligne
> est vide, ressemble à un défaut d'affichage : elle envoie chercher du mauvais
> côté, et elle survit d'autant plus longtemps. C'est aussi pourquoi ses deux
> témoins de pagination ne tombent pas — ils ne gardent pas la correction, ils
> gardent l'explication.
