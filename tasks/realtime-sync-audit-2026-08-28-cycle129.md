# Cycle 129 — la route écrivait sur une table qui ne porte pas la colonne qu'elle nomme

Date : 2026-08-28 · Issue : #4126 · Branche : `claude/keen-hamilton-upf8lz`

## Le défaut

`DELETE /me/preferences/categories/:categoryId` détachait les conversations de la
catégorie ainsi :

```ts
await prisma.$transaction([
  prisma.conversationPreference.updateMany({
    where: { userId, categoryId },
    data:  { categoryId: null },
  }),
  prisma.userConversationCategory.delete({ where: { id: categoryId } }),
]);
```

`ConversationPreference` est le magasin **clé/valeur** générique du schéma
(`key` / `value` / `valueType`). Il ne déclare **ni `categoryId` ni aucun lien
vers une catégorie**. La colonne `categoryId` vit sur
`UserConversationPreferences`, dont la catégorie porte d'ailleurs la relation
inverse (`conversations UserConversationPreferences[]`).

## Ce qui a été MESURÉ

Contre le client Prisma généré (`packages/shared/prisma/client`), sans base :

| appel | verdict |
|---|---|
| `conversationPreference.updateMany({ where: { userId, categoryId }, data: { categoryId: null } })` | **`PrismaClientValidationError`** — « Unknown argument `categoryId` », levé AVANT tout aller-retour |
| `userConversationPreferences.updateMany({ where: { userId, categoryId }, data: { categoryId: null, version: { increment: 1 } } })` | validation franchie (échoue seulement faute de replica set local) |

Le `$transaction` levait donc à chaque appel, le `catch` du handler rendait
`500 DELETE_ERROR` : **aucune catégorie de conversation n'a jamais pu être
supprimée**, sur aucun des trois clients. Ce n'est pas un piège armé, c'est une
panne.

Et même sans la levée, l'écriture n'aurait détaché personne : les lignes qui
portent la catégorie seraient restées à pointer un id supprimé.

## Pourquoi rien ne l'a signalé

**1. Les trois doubles acceptent ce que le vrai client refuse.**
Les trois suites qui couvrent la route déclaraient
`conversationPreference: { updateMany: jest.fn() }`. Pire, l'une d'elles portait
la remarque, écrite noir sur blanc :

```ts
// categories.ts uses prisma.conversationPreference.updateMany on DELETE
// (pre-existing) — keep the surface so the route doesn't crash.
conversationPreference: { updateMany: jest.fn<any>() },
// Real model name (in case Phase 1 fixes the surface).
userConversationPreferences: { updateMany: jest.fn<any>() },
```

Le mauvais modèle avait été **vu**, nommé, et contourné **dans le double** — la
forme exacte que le dépôt connaît déjà (« devant toute phrase de cette forme —
*le schéma retire X*, *ce champ ne sort pas* — la question est : et c'est
bien ? »), ici appliquée à un test plutôt qu'à un schéma.

**2. Le compilateur est silencieux sur ce site.** Mesuré sous le `tsconfig` réel
du gateway (`strict: false`), la ligne EXACTE de production rend `EXIT=0` :

```ts
await f.prisma.conversationPreference.updateMany({
  where: { userId: 'a', categoryId: 'b' }, data: { categoryId: null },
});   // tsc --noEmit → 0 erreur
```

(La même erreur de modèle prise ISOLÉMENT — `where: { categoryId }` seul —
tombe bien en `TS2353`. Ce qui compte ici est que la forme de production, elle,
passe : aucun des deux gates du dépôt ne pouvait voir ce défaut.)

**3. Le témoin d'écriture n'assertait que le statut.** Les suites vérifiaient
`statusCode === 200` sur un `$transaction` doublé à `mockResolvedValue([])` —
un double qui ne fait rien ne peut pas lever.

## Le second défaut, même fichier

`POST /me/preferences/categories/reorder` diffusait `CATEGORIES_REORDERED` en
nommant **ce qui avait été DEMANDÉ** :

```ts
await Promise.all(updates.map(u =>
  prisma.userConversationCategory.updateMany({ where: { id: u.categoryId, userId }, data: { order: u.order } })));
broadcastToUser(fastify, userId, CATEGORIES_REORDERED, { userId, updates });   // ← tout, écrit ou non
```

C'est mot pour mot ce que le cycle 128 a corrigé sur la jumelle communauté, et
la règle y est déjà écrite : *la charge nomme ce qui a été ÉCRIT, jamais ce qui
a été DEMANDÉ ; le filtre d'appartenance borne les deux ensemble.* Le filtre
`{ id, userId }` écarte silencieusement une catégorie d'autrui — l'annoncer
envoyait les autres appareils appliquer un ordre que la base ne porte pas, en
**confirmant au passage l'existence d'une catégorie que l'appelant n'a pas le
droit de nommer**.

## Ce qui change

| site | ce qui change |
|---|---|
| `services/conversationPreferencesSync.ts` | `detachConversationsFromCategory()` — l'écrivain unique de `UserConversationPreferences` gagne le détachement en lot : un `updateMany` avec `version: { increment: 1 }`, la relecture de l'instantané POST-écriture, puis un `USER_PREFERENCES_UPDATED` par conversation détachée |
| `routes/me/preferences/categories.ts` (DELETE) | détache par l'écrivain unique, **puis** supprime la catégorie ; `$transaction` et `conversationPreference` disparaissent |
| `routes/me/preferences/categories.ts` (reorder) | la charge est filtrée par le `count` de chaque `updateMany` ; zéro ligne écrite ⇒ aucune diffusion |
| `__tests__/preference-writer-sweep.test.ts` | le nouveau site d'écriture entre à l'inventaire, avec la diffusion qui le suit |
| les trois doubles | `conversationPreference` retiré, `userConversationPreferences` complété ; le témoin d'erreur du DELETE repointé sur la méthode que le handler appelle vraiment |

Deux départs assumés de `writeConversationPreferences`, écrits sur place :

- **un `updateMany`, pas N upserts** — une ligne ne peut pas porter un
  `categoryId` sans exister, donc il n'y a rien à créer ;
- **l'instantané est RELU** — `updateMany` rend un compte, jamais des lignes, et
  la diffusion doit porter la version que l'écriture vient de produire : une
  charge construite sur l'instantané d'AVANT serait jetée par tous les clients
  (`incoming.version <= local -> drop`).

**Détacher AVANT de supprimer**, jamais l'inverse : dans l'autre ordre, un échec
du détachement laisse les lignes pointer une catégorie fantôme pour de bon ; ici
le pire cas est une catégorie vide encore présente, que l'appelant resupprime.

**Et la diffusion par ligne est PORTANTE, pas décorative** — mesuré côté web :
`preferences-sync.service.ts` traite `CATEGORY_DELETED` par un `notifyCategory`
SANS charge, qui ne fait que redemander la LISTE DES CATÉGORIES. Rien n'y
détache les conversations. Sans le `USER_PREFERENCES_UPDATED` par conversation,
la liste garderait un `categoryId` pointant une catégorie disparue jusqu'à un
rechargement sans rapport.

**Aucun contrat d'événement n'est élargi.** Faire porter les ids détachés par
`CATEGORY_DELETED` coûterait une modification sur trois décodeurs stricts pour
dire ce que l'événement par ligne, déjà décodé partout et **versionné**, dit
mieux (cycle 128 : « un décodeur STRICT rend l'élargissement plus cher que le
nom neuf »).

## Gates

| gate | résultat |
|---|---|
| `category-delete-detach.test.ts` (neuf) | **8 rouges contre `origin/main` / 8 verts après** |
| suites voisines (`preference-writer-sweep`, `categories`, `category-broadcast`, `conversation-preferences`, e2e préférences) | 10 suites, 147 témoins, exit 0 |
| suite gateway complète (`bun run test:coverage`) | **898/898 suites, 20516 témoins**, exit 0 — couverture **95,70 %** stmts / **89,94 %** branches (95,48 / 89,63 au cycle 128) |
| `services/gateway` `tsc --noEmit` | 0 erreur (code de retour lu SANS pipe) |
| Swift / Kotlin / web | **non modifiés** — `USER_PREFERENCES_UPDATED` est déjà décodé par le web et iOS, `CATEGORY_DELETED` par les trois. Android n'écoute NI l'un NI l'autre des événements de préférences : voir le suivi (#4127) |

## Suivi MESURÉ

- **`tsc` ne voit pas une erreur de MODÈLE dans un appel Prisma sous
  `strict: false`.** Mesuré ici sur la forme de production. Passer le gateway en
  `strict: true` est un lot à lui seul ; en attendant, c'est un mode d'échec
  connu et non gardé — **issue #4128**.
- **Le balayage des écrivains ne couvre que DEUX modèles.**
  `UserConversationCategory` est per-utilisateur, lue par les mêmes écrans, et
  ses quatre écrivains diffusent — vérifié à la main dans ce cycle, pas par un
  cliquet. La question « et celui-là, il diffuse ? » n'est outillée que pour
  `userConversationPreferences` et `userCommunityPreferences`.
- **Android n'a AUCUN écouteur de `user:preferences-updated`** (mesuré : zéro
  occurrence sous `apps/android/**/*.kt` ; la seule mention du dépôt est une case
  NON cochée de `apps/android/tasks/inventory-sdk.md`). Le détachement de ce
  cycle atteint donc le web et iOS, pas Android — et c'est vrai de TOUTE écriture
  de préférence de conversation depuis toujours, pas de ce lot. **Issue #4127**.
- **Aucun autre site de production ne nomme `conversationPreference`** (mesuré :
  zéro occurrence hors du gate neuf et du client généré). Le magasin clé/valeur
  n'a plus aucun écrivain — savoir s'il en a jamais eu un est une autre
  question, distincte de ce lot.
