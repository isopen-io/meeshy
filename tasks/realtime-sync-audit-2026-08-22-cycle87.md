# Cycle 87 — La console de modération servait des listes vides, par deux défauts indépendants

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-w6gad9`
**Périmètre** : passerelle — `routes/admin/content.ts`, `routes/admin/posts.ts` ;
web — les quatre pages de liste de la console d'administration

**Clients touchés** : aucun nom d'événement ajouté ni retiré, aucune charge
utile temps réel modifiée, aucune ligne de Socket.IO touchée. Trois réponses
REST cessent de sortir vides, quatre pages web cessent de lire une clé qui
n'existe pas.

---

## 1. D'où vient ce cycle

Le cycle 86 bis a fermé les deux sites de niveau `data:` du balayage
`{ type: 'object' }` et a laissé un inventaire trié de 36 sites, avec une
priorité nommée en toutes lettres :

> **`items` × 15** — ce sont des LISTES : la réponse est un tableau de `{}`,
> autant d'éléments que d'entrées, tous vides. Gravité maximale après `data:`,
> parce qu'un tableau non vide d'objets vides ressemble à une réponse valide.

Ce cycle prend cette marche. Il en rapporte deux choses : la moitié de
l'inventaire `items` n'était pas ce qu'il annonçait (§2), et les trois sites qui
l'étaient vraiment cachaient **un second défaut, indépendant du premier**, sur
le même chemin (§4).

## 2. Correction de l'inventaire du cycle 86 bis : `details` n'est pas `data`

La ligne « `items` × 15 » du §6 précédent agrège deux familles que rien ne
rapproche :

| forme | sites | ce que ça vide |
|---|---|---|
| `details` / `errors` dans un schéma d'ERREUR 400/500 | 11 | le détail de validation d'une réponse d'erreur |
| `data` dans un schéma de SUCCÈS 200 | 4 | **la charge utile de la liste** |

Les onze premiers — `users/profile.ts:116,335,448,554,667`,
`signal-protocol.ts:179,337`, `anonymous.ts:209,569`, `admin/roles.ts:82,212` —
sont tous de la forme `details: { type: 'array', items: { type: 'object' } }`
sous un code 400 ou 422. Ils dégradent un diagnostic, ils ne cassent aucun
décodage : le client lit `message`, et aucun type client ne déclare `details`
non-optionnel. Réels, mais d'un autre ordre de grandeur.

Les quatre autres sont des listes de niveau `data:` — la gravité que le cycle 86
bis venait de fermer ailleurs, sur trois routes de plus. **C'est là que ce
cycle porte.**

> La leçon de méthode : **un inventaire trié par TEXTE trie des chaînes, pas des
> gravités.** `items: { type: 'object' }` a la même forme dans une liste servie
> et dans un `details` d'erreur ; seul le CODE DE STATUT qui l'englobe les
> sépare. Le balayage du cycle 86 calculait déjà la portée des clés `response:`
> — il lui manquait de descendre d'un cran, jusqu'au code.

## 3. Le premier défaut : trois listes de modération sortaient en `[{}, {}, …]`

| route | fichier | client | ce qu'il recevait |
|---|---|---|---|
| `GET /admin/messages` | `admin/content.ts:56` | page Messages | tableau d'objets vides |
| `GET /admin/communities` | `admin/content.ts:206` | page Communautés | tableau d'objets vides |
| `GET /admin/posts` | `admin/posts.ts:234` | `UserPostsSection` | tableau d'objets vides |

Les trois handlers font pourtant un `findMany` riche. `GET /admin/messages`
charge `sender` **et son `user` imbriqué**, `conversation`, `attachments` via
`attachmentMediaSelect` (25 champs), et `_count.replies`. Tout cela sortait en
`{}`.

**Le même fichier portait déjà la réponse.** `admin/content.ts` déclare ses deux
AUTRES listes — `/translations:322` et `/share-links:522` — en
`items: { type: 'object', additionalProperties: true }`. La forme juste et la
forme cassée cohabitaient à trois cents lignes d'écart, dans le même fichier,
sous la même paire d'yeux. C'est la signature d'une espèce, pas d'un accident.

## 4. Le second défaut : les quatre pages lisaient une clé qui n'a jamais existé

En cherchant qui consomme ces listes, une seconde panne apparaît, **strictement
indépendante de la première**. Deux enveloppes s'empilent sur ce chemin :

1. `sendPaginatedSuccess` (`utils/response.ts:52`) sert
   `{ success, data: T[], pagination }` — le tableau est à `data`, et
   `pagination` est son **frère**, pas son enfant.
2. `apiService.request` (`api.service.ts`) enveloppe le corps **entier** dans
   `.data` et rend `{ success, data: <corps>, message }`.

La lecture juste est donc `response.data.data`. Les quatre pages lisaient une
clé **nommée** :

| page | lisait | existe ? |
|---|---|---|
| `/admin/messages` | `response.data.messages` | non |
| `/admin/communities` | `response.data.communities` | non |
| `/admin/translations` | `response.data.translations` | non |
| `/admin/share-links` | `response.data.shareLinks` | non |

Chacune retombait sur son `|| []`.

### Pourquoi personne ne l'a vu : le compteur, lui, était juste

Les mêmes pages lisent `response.data.pagination?.total` — et **cette lecture-là
est correcte**, parce que `pagination` est bien une clé du corps. La console
affichait donc « 1 248 messages » au-dessus d'une table vide.

Un total juste au-dessus d'une liste vide ne se lit pas comme une panne de
chargement : ça se lit comme un filtre trop strict, ou comme une page qu'on a
mal ouverte. C'est ce qui a donné à ce défaut sa longévité.

### La preuve que les deux défauts sont indépendants

`UserPostsSection` (`components/admin/user-detail/UserPostsSection.tsx:84`) lit
`resp.data?.data` — **l'idiome juste**. Elle recevait quand même des cartes
muettes, une par post, parce que le sérialiseur les avait vidées en amont.

Symétriquement, `/admin/translations` et `/admin/share-links` ont un schéma
CORRECT depuis toujours et sortaient vides quand même, par la lecture cliente.

Les quatre combinaisons existent donc dans le dépôt :

| route | schéma | lecture cliente | ce que l'admin voyait |
|---|---|---|---|
| `/admin/messages` | cassé | cassée | table vide, total juste |
| `/admin/communities` | cassé | cassée | table vide, total juste |
| `/admin/posts` | cassé | **juste** | N cartes muettes |
| `/admin/translations`, `/admin/share-links` | **juste** | cassée | table vide, total juste |

**Aucun des deux défauts ne masquait l'autre, et corriger un seul n'aurait
réparé aucune des deux premières routes.** C'est la raison pour laquelle ce
cycle porte sur les deux services à la fois plutôt que de s'arrêter à la
passerelle.

## 5. Ce qui change

### Passerelle — trois schémas d'élément déclarés

`adminMessageItemSchema` et `adminCommunityItemSchema` (`admin/content.ts`),
`adminPostItemSchema` (`admin/posts.ts`). Chacun nomme dans `properties` les
champs que la console consomme, **et** porte `additionalProperties: true`.

Ce choix mérite d'être motivé, parce que le cycle 86 bis a inscrit la règle
inverse — *« carte à clés inconnues ⇒ `additionalProperties` ; sinon ⇒
`properties` »* — et qu'il ne s'agit pas de la contourner. Ces éléments ne sont
pas des cartes : `properties` est bien la déclaration juste, et elle est là.
`additionalProperties: true` vient EN PLUS, pour une raison distincte : le
`select` de ces trois handlers est large (25 champs rien que pour
`attachmentMediaSelect`) et il bouge. Sans lui, le premier champ ajouté à un
`select` redevient invisible en silence — exactement le défaut qu'on ferme.
C'est l'idiome que `routes/messages.ts` a déjà retenu, avec sa raison écrite en
commentaire.

Les `properties` déclarées correspondent **exactement** aux `select` des
handlers : aucun champ déclaré qui ne soit chargé — la dérive inverse que le
CLAUDE.md de la passerelle nomme (« un champ que le schéma déclare et que la
requête ne charge pas est la même dérive, dans l'autre sens »).

### Web — un seul lecteur d'enveloppe

`readPaginatedList()` (`services/paginated-list.ts`) est désormais le SEUL
endroit qui connaît la forme de l'enveloppe `sendPaginatedSuccess`. Les quatre
pages y passent.

Patcher les quatre appels en `.data.data` aurait réparé les quatre pages et
laissé la cinquième libre de se tromper pareil — le défaut est né de ce que la
forme de l'enveloppe n'était écrite nulle part. Un commentaire de
`admin/users/page.tsx:65` la documentait déjà (« le backend retourne
`{success: true, data: {...}}`, donc il faut accéder à `.data.data` »), preuve
que la connaissance existait sans être partageable.

Les routes qui nichent volontairement leur liste sous une clé nommée —
`sendSuccess(reply, { anonymousUsers, pagination })` — ne passent PAS par ce
lecteur : leur forme est différente et légitime. La page Utilisateurs anonymes
était correcte et n'est pas touchée.

Effet de bord assumé, sur les quatre pages : `totalPages` passe de
`Math.ceil(total / pageSize)` à `Math.max(1, …)`. L'ancien calcul rendait
**0 page** pour une liste vide, ce que la pagination affichait « page 1 sur 0 ».

## 6. Témoins

**Passerelle — 9 neufs, ROUGE prouvé.** Les 9 tombent sur le code d'avant, et
le message d'échec de chacun est littéralement `Received: Object {}`.

- `admin/__tests__/content.list-serialization.test.ts` (6) : champs de tête du
  message, `sender` **et son `user` imbriqué**, `conversation`, `attachments` +
  `_count` ; identité de la communauté, `creator` + effectifs.
- `admin/__tests__/posts.list-serialization.test.ts` (3) : contenu et type du
  post, `author`, compteurs d'engagement + `media` + `_count`.

Aucun de ces deux fichiers n'existait : `admin/content.ts` n'avait **aucun
témoin**, et c'est ce qui explique le reste. Tous passent par `app.inject()` —
seul endroit où la panne est observable, la suppression ayant lieu APRÈS le
handler.

**Web — 5 neufs** sur `readPaginatedList`, dont le central reproduit la charge
utile réelle avec ses deux enveloppes empilées.

## 7. Ce que ce cycle NE fait pas, et pourquoi

- **Les 11 sites `details` / `errors`** (§2) restent ouverts. Ils sont réels et
  d'un ordre de gravité inférieur ; les corriger demande de décider quelle forme
  d'erreur de validation le produit veut exposer, ce qui est une question de
  contrat d'API, pas de sérialisation.
- **Les 21 autres sites** de l'inventaire du cycle 86 bis §6 restent ouverts et
  gardent la priorité qu'il leur a donnée — en particulier les 4 `user:` et le
  `sender:`, qui touchent la présence et exigent le gate dans le même lot.
- **`_count.translations` sur la page Messages** — un TROISIÈME défaut du même
  chemin, que seule la réparation de la liste rend observable.
  `app/admin/messages/page.tsx:445` lit `message._count.translations` pour
  afficher un badge de nombre de traductions ; le `select` du handler ne demande
  que `_count: { replies: true }`. Le champ est donc `undefined`, `undefined > 0`
  vaut `false`, et le badge ne s'affiche jamais — silencieusement.

  Il n'est PAS corrigé ici, et la raison est structurelle : `_count` de Prisma ne
  porte que sur des RELATIONS, or `Message.translations` est un champ scalaire
  `Json?` (`schema.prisma:145`) et il n'existe aucun modèle `MessageTranslation`.
  `_count: { select: { translations: true } }` est donc impossible, pas
  seulement omis. Le nombre ne peut venir que de la longueur du tableau JSON,
  ce qui suppose de décider si la liste de modération embarque les charges utiles
  de traduction de chaque ligne — une question de forme d'API, pas de
  sérialisation.

  Ce cycle ne change rien à son comportement : le badge était absent avant, il
  reste absent. Aucune donnée nouvelle n'est publiée par la réparation.

- **`messages.ts:113`** mérite une mention séparée. Son parent porte
  `additionalProperties: true` (posé par un cycle antérieur contre la
  troncature), mais `sender` y est déclaré EXPLICITEMENT en `{ type: 'object' }`
  — et un parent permissif ne rattrape pas un enfant déclaré vide, puisque la
  clé est listée. Le champ sort donc à `{}`. Aucun appelant web ni iOS de
  `GET /messages/:messageId` n'a été trouvé, ce qui le rend moins urgent — mais
  la forme est vicieuse et vaut d'être nommée : **lister un champ avec un schéma
  vide est PIRE que ne pas le lister du tout**, sous un parent permissif.

## 8. Coût

Nul côté passerelle : trois schémas de sérialisation déclarés, aucune requête
ajoutée, aucun chemin de code touché. La sérialisation d'une charge utile
déclarée est plus rapide que celle d'un objet libre.

Côté web, une fonction pure de quarante lignes remplace quatre blocs
`if/else` — quatre lignes de moins par page.

## 9. Les leçons

> **Deux pannes sur le même chemin ne s'additionnent pas : elles se
> camouflent.** Trois routes avaient un schéma cassé ET une lecture cliente
> cassée. Réparer la passerelle seule n'aurait rien changé à l'écran, et le
> cycle se serait clos sur un correctif vert et invisible — le scénario exact
> que le cycle 86 bis a subi sur `communities/search` pour une autre raison.
> **Quand on répare une réponse, on va voir ce que l'écran en fait.**

> **Un total juste au-dessus d'une liste vide ne se signale pas comme une
> panne.** Le compteur était correct parce qu'il lisait `pagination`, la seule
> clé que les deux enveloppes laissaient au même endroit. Une panne partiellement
> cohérente survit plus longtemps qu'une panne franche.

> **Une connaissance écrite dans un commentaire n'est pas partagée.**
> `admin/users/page.tsx` documentait la double enveloppe depuis toujours, en
> français, à l'endroit exact où elle était appliquée correctement. Quatre pages
> voisines l'ignoraient. Une forme qui se redécouvre à chaque site d'appel
> finira par se tromper : elle appartient à une fonction, pas à un commentaire.

> **Un inventaire trié par texte trie des chaînes, pas des gravités** (§2) — onze
> des quinze `items` promus « gravité maximale » par le cycle précédent étaient
> des `details` d'erreur.
