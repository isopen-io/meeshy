# Cycle 87 bis — Réparer la passerelle ne rallume pas l'écran : la console lisait une clé qui n'existe pas

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-w6gad9`
**Périmètre** : web — les quatre pages de liste de la console d'administration ;
passerelle — le balayage installé en cliquet

**Clients touchés** : aucun nom d'événement ajouté ni retiré, aucune charge
utile temps réel modifiée, aucune ligne de Socket.IO touchée. Aucun changement
de réponse serveur : ce lot ne touche pas un seul schéma.

---

## 0. Ce lot est né d'une collision, et c'est son enseignement principal

Deux cycles ont pris la même marche du cycle 86 bis en parallèle, sans se voir.
Le **cycle 87** (`claude/keen-hamilton-inwn81`, fusionné le premier) a corrigé
les trois schémas de la passerelle. **Sa version reste**, intégralement : ses
`adminMessageRowSchema` / `adminCommunityRowSchema` / `adminPostRowSchema` sont
équivalents aux miens, ses témoins couvrent les trois routes servies, et ma
version s'est retirée — schémas, témoins de sérialisation et journal compris.

Nous avons aussi produit, séparément, la même correction du tri du cycle 86 bis
(les quatorze `items` n'étaient pas quatorze listes). Son §0 la raconte ; je n'y
ajoute rien.

**Ce qui subsiste de mon lot est ce que le cycle 87 n'a pas vu**, et ce n'est
pas un détail de finition : **son correctif, seul, ne change rien à l'écran.**

## 1. Le second défaut, indépendant du premier, sur le même chemin

Les trois routes réparées côté passerelle sont consommées par quatre pages web
qui lisaient toutes une clé **nommée qui n'a jamais existé** :

| page | lisait | existe ? |
|---|---|---|
| `/admin/messages` | `response.data.messages` | non |
| `/admin/communities` | `response.data.communities` | non |
| `/admin/translations` | `response.data.translations` | non |
| `/admin/share-links` | `response.data.shareLinks` | non |

Chacune retombait sur son `|| []`. Deux enveloppes s'empilent sur ce chemin, et
la combinaison n'est devinable depuis aucun des deux bouts :

1. `sendPaginatedSuccess` (`utils/response.ts`) sert
   `{ success, data: T[], pagination }` — le tableau est à `data`, et
   `pagination` est son **FRÈRE**, pas son enfant.
2. `apiService.request` (`api.service.ts`) enveloppe le corps **ENTIER** dans
   `.data` et rend `{ success, data: <corps>, message }`.

La lecture juste est `response.data.data`.

### Pourquoi personne ne l'a vu : le compteur, lui, était juste

Les mêmes pages lisent `response.data.pagination?.total` — et **cette lecture-là
est correcte**, parce que `pagination` est la seule clé que les deux enveloppes
laissent au même endroit. La console affichait donc « 1 248 messages » au-dessus
d'une table vide.

Un total juste au-dessus d'une liste vide ne se lit pas comme une panne de
chargement : ça se lit comme un filtre trop strict, ou comme une page qu'on a
mal ouverte. C'est ce qui a donné à ce défaut sa longévité — et c'est aussi ce
qui l'a rendu invisible au cycle 87, qui a mesuré sa réparation sur la réponse
HTTP et non sur l'écran.

### La preuve que les deux défauts sont indépendants

`UserPostsSection` (`components/admin/user-detail/UserPostsSection.tsx`) lit
`resp.data?.data` — **l'idiome juste**. Elle recevait quand même des cartes
muettes, une par post, parce que le sérialiseur les avait vidées en amont.

Symétriquement, `/admin/translations` et `/admin/share-links` ont un schéma
CORRECT depuis toujours (le même fichier les déclarait déjà en
`additionalProperties: true`) et sortaient vides quand même, par la lecture
cliente. Le cycle 87 n'avait donc rien à y corriger — et elles étaient cassées.

Les quatre combinaisons existent dans le dépôt :

| route | schéma (avant cycle 87) | lecture cliente | ce que l'admin voyait |
|---|---|---|---|
| `/admin/messages` | cassé | cassée | table vide, total juste |
| `/admin/communities` | cassé | cassée | table vide, total juste |
| `/admin/posts` | cassé | **juste** | N cartes muettes |
| `/admin/translations`, `/admin/share-links` | **juste** | cassée | table vide, total juste |

**Sur les deux premières lignes, le correctif du cycle 87 ne produit aucun effet
observable sans celui-ci.** Deux pannes sur le même chemin ne s'additionnent
pas : elles se camouflent.

## 2. Ce qui change

`readPaginatedList()` (`apps/web/services/paginated-list.ts`) devient le SEUL
endroit du dépôt qui connaît la forme de cette enveloppe. Les quatre pages y
passent.

Patcher les quatre appels en `.data.data` aurait réparé les quatre pages et
laissé la cinquième libre de se tromper pareil — le défaut est né de ce que la
forme de l'enveloppe n'était écrite nulle part. Un commentaire de
`app/admin/users/page.tsx` la documentait pourtant depuis toujours (« le backend
retourne `{success: true, data: {...}}`, donc il faut accéder à `.data.data` »),
à l'endroit exact où elle était appliquée correctement. **Une connaissance
écrite dans un commentaire n'est pas partagée.**

Les routes qui nichent volontairement leur liste sous une clé nommée —
`sendSuccess(reply, { anonymousUsers, pagination })` — ne passent PAS par ce
lecteur : leur forme est différente et légitime. La page Utilisateurs anonymes
était correcte et n'est pas touchée.

Effet de bord assumé : `totalPages` passe de `Math.ceil(total / pageSize)` à
`Math.max(1, …)`. L'ancien calcul rendait **0 page** pour une liste vide, que la
pagination affichait « page 1 sur 0 ».

## 3. Le balayage passe du journal au dépôt, en cliquet

Le cycle 86 avait conclu que « la règle vaut d'être outillée plutôt que
mémorisée » — et avait laissé son outil **dans son journal**. Deux cycles plus
tard, trois exemplaires de plus, trouvés à la main, en double par deux agents.
C'est la démonstration expérimentale que la mémorisation ne tient pas.

`routes/__tests__/response-schema-sweep.ts` porte les trois discriminations
qu'un `grep` ne sait pas faire, chacune gardée par son propre témoin :

1. résoudre l'objet littéral englobant (déclare-t-il `properties` /
   `additionalProperties` / `patternProperties` ?) ;
2. ne retenir que ce qui est sous `response:` — un objet nu sous `body` /
   `querystring` / `params` est permissif, AJV valide et ne sérialise pas ;
3. **dépouiller les commentaires** en préservant les numéros de ligne, sans quoi
   le balayage retrouve les commentaires des cycles précédents — qui EXPLIQUENT
   le défaut — au lieu des défauts.

`response-schema-sweep.test.ts` gèle l'inventaire restant. **Quand il tombe :**
une entrée EN TROP = un nouveau site nu vient d'entrer ; une entrée EN MOINS =
un site réparé, et retirer sa ligne fait partie du correctif. L'inventaire est
clé par fichier + champ + code de statut, **jamais** par numéro de ligne — une
clé de ligne dérive à la première édition et transformerait le cliquet en bruit.

**ROUGE prouvé** : en remettant `items: { type: 'object' }` sur `/admin/posts`,
deux témoins tombent en nommant `admin/posts.ts|items|200`. Le cliquet a par
ailleurs attrapé une faute de frappe de son propre inventaire dès sa première
exécution (un 400 déclaré pour un 200 réel), ce qui est exactement le service
attendu.

## 4. Témoins

**Web — 5 neufs** sur `readPaginatedList`, dont le central reproduit la charge
utile RÉELLE avec ses deux enveloppes empilées. Les autres bornent les formes
dégradées : corps absent, `data` qui n'est pas un tableau, pagination absente.

**Passerelle — 9 neufs** sur le balayage : l'inventaire gelé, la non-régression
des routes réparées, et un témoin par discrimination (objet déclaré, carte
`additionalProperties`, objet nu sous `body`, objet nu sous `response`,
commentaire non retrouvé, numéros de ligne préservés, chaîne non dépouillée).

Mes deux fichiers de témoins de sérialisation (`content.list-serialization`,
`posts.list-serialization`) **se sont retirés** : ceux du cycle 87
(`admin-content.test.ts`, `admin-routes-group3.test.ts`) couvrent les trois
routes servies. Deux exemplaires du même témoin ne valent pas mieux qu'un — le
cycle 61 a montré ce qu'ils coûtent quand ils gèlent un symptôme à deux.

## 5. Ce que ce lot laisse ouvert

- **Les 19 sites 2xx et 12 sites 4xx restants**, désormais gelés par le cliquet
  plutôt que par un tableau dans un journal. Les 4 `user:` et le `sender:`
  touchent la présence : **schéma ET gate dans le même lot** (cycle 84 bis).
- **`_count.translations`** (page Messages) : lu par le client au rendu, jamais
  servi. Non corrigeable tel quel — `_count` de Prisma ne porte que sur des
  RELATIONS, or `Message.translations` est un scalaire `Json?` et aucun modèle
  `MessageTranslation` n'existe. Le badge était absent avant, il reste absent :
  ce lot ne change rien à son comportement. Le trancher demande de décider si la
  liste de modération embarque les charges utiles de traduction de chaque ligne
  — une question de forme d'API.
- **`messages.ts:113`** : son parent porte `additionalProperties: true`, mais
  `sender` y est déclaré explicitement `{ type: 'object' }`, et un parent
  permissif ne rattrape pas un enfant déclaré vide puisque la clé est LISTÉE.
  **Lister un champ avec un schéma vide est pire que ne pas le lister du tout.**

## 6. Les leçons

> **Réparer une réponse n'est pas réparer un écran.** Le cycle 87 a corrigé
> trois schémas, mesuré la réponse HTTP, et clos. Sur deux des trois routes,
> l'écran est resté vide — parce que le client lisait ailleurs. **Quand on
> répare une réponse, on va voir ce que l'écran en fait.**

> **Un total juste au-dessus d'une liste vide ne se signale pas comme une
> panne.** Le compteur visait la seule clé que les deux enveloppes laissent au
> même endroit. Une panne partiellement cohérente survit plus longtemps qu'une
> panne franche.

> **Une connaissance écrite dans un commentaire n'est pas partagée.** Une forme
> qui se redécouvre à chaque site d'appel finira par se tromper : elle
> appartient à une fonction.

> **Deux agents ont trouvé le même défaut le même jour, chacun à la main, parce
> que l'outil qui l'aurait rendu évident vivait dans un journal.** Le coût de
> laisser un outil hors du dépôt ne se paie pas en mémoire — il se paie en
> travail fait deux fois, et en défauts qu'aucun des deux ne voit.
