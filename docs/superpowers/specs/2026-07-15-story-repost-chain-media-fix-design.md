# Story repost chain — contenu illisible en cas de repost-de-repost

## Contexte

Le repost "one-tap" de story (`POST /posts/:postId/repost` → `PostService.repostPost()`)
duplique physiquement les médias du post source et copie son `storyEffects` tel quel
(snapshot, nécessaire car la source est éphémère et peut expirer/être supprimée avant
la lecture du repost).

Ce snapshot duplique les médias **à chaque saut** de la chaîne, avec de **nouveaux IDs
`PostMedia`** à chaque fois — mais `storyEffects` est copié verbatim, sans réécrire les
`postMediaId` qu'il référence. Résultat : `storyEffects.mediaObjects[].postMediaId`
(et `audioPlayerObjects[].postMediaId`) restent éternellement figés sur les IDs du tout
premier post non-repost de la chaîne, quel que soit le nombre de sauts.

- **Repost d'un original (niveau 1)** : le lecteur peut s'en sortir en fusionnant le pool
  média du repost avec celui de son `repostOf` immédiat (patch ad-hoc ajouté le
  2026-07-14 dans `StoryModels.swift:toStoryGroups`).
- **Repost d'un repost (niveau 2+)** : ça casse partout — les IDs référencés (toujours
  ceux du niveau 0) ne sont présents dans aucun des pools disponibles côté client
  (niveau N "own" + niveau N-1 "repostOf" immédiat) dès que N≥2. Le contenu du repost
  s'affiche vide dans le lecteur.

Le schéma de données (`repostOfId` = parent immédiat, `originalRepostOfId` = racine
aplatie) supporte déjà explicitement les chaînes multi-niveaux ; c'est uniquement la
réécriture des références média au moment du snapshot qui manque. Aucune contrainte
produit n'interdit le repost-de-repost — le composer (`StoryComposerViewModel+Repost.swift`)
gère même déjà explicitement ce cas au niveau attribution (retrait du badge hérité).

## Objectif

Un repost, à n'importe quelle profondeur de chaîne, doit toujours afficher son contenu
correctement dans le lecteur. Pas de migration des données déjà cassées en base — la
correction s'applique aux nouveaux reposts créés après le fix.

## Approche retenue

Réécrire les `postMediaId` référencés dans `storyEffects` au moment même du snapshot
(dans `repostPost()`), pour que chaque repost redevienne **auto-cohérent** : son
`storyEffects` référence toujours sa **propre** liste de médias dupliqués, quel que soit
le nombre de sauts en amont. Aucune résolution récursive n'est nécessaire côté lecture —
le lookup plat existant (`postMediaId` cherché dans le tableau `media` local du post)
fonctionne alors nativement à toute profondeur.

Alternative écartée : résolution récursive/transitive à la lecture (remonter toute la
chaîne `repostOf.repostOf...` côté backend + fusionner les pools à chaque site de lecture
iOS). Ne corrige pas l'incohérence à la source, multiplie les points à maintenir (backend
+ 3 sites de résolution iOS + futur web), profondeur non bornée à gérer partout.

## Composants modifiés

### 1. Nouveau : `services/gateway/src/services/posts/storyEffectsMediaRemap.ts`

Fonction pure :

```ts
function remapStoryEffectsMediaIds(
  effects: Prisma.InputJsonValue | undefined,
  idMap: Record<string, string>,
): { effects: Prisma.InputJsonValue | undefined; changed: boolean }
```

- Parcourt `effects.mediaObjects[]` et `effects.audioPlayerObjects[]`.
- Pour chaque élément dont `postMediaId` existe dans `idMap`, remplace la valeur par
  l'ID mappé.
- Ne touche **jamais** au champ `id` de ces objets (identifiant client de l'élément UI
  dans le composer, sans rapport avec l'ID `PostMedia`).
- Un `postMediaId` absent de `idMap` (donnée legacy déjà incohérente, ou média non
  dupliqué) est laissé tel quel — jamais mis à `null`, cohérent avec la politique
  fail-soft déjà documentée sur `StoryEffectsSchema` (passthrough).
- Pas de mutation : retourne un nouvel objet. `changed=false` si rien n'a été réécrit
  (permet à l'appelant de sauter l'écriture DB inutile).

### 2. `PostService.repostPost()` (`services/gateway/src/services/PostService.ts:1355-1568`)

- Élargir le type inline de `originalMedia` (ligne ~1443) pour exposer `id: string`
  (déjà présent à l'exécution via `mediaSelect`, juste absent du type local).
- Après la création du repost (`prisma.post.create`, ligne ~1491), construire
  `idMap: Record<string, string>` en appariant `originalMedia[idx].id` →
  `repost.media[idx].id`. L'appariement par index est fiable : les deux tableaux
  (`original.media` via `mediaInclude`, et `repost.media` via `postInclude`) sont
  triés `orderBy: { order: 'asc' }`, et `duplicatedMedia` est créé avec `order: idx`
  dans le même ordre que `originalMedia`.
- Appliquer `remapStoryEffectsMediaIds(snapshotStoryEffects, idMap)`.
- Si `changed`, persister via `prisma.post.update({ where: { id: repost.id }, data: { storyEffects } })`,
  puis retourner le repost avec le `storyEffects` corrigé fusionné en mémoire (pas de
  refetch nécessaire — toutes les autres relations sont déjà chargées via `postInclude`).
- Si cette écriture de correction échoue : logger un avertissement, retourner quand
  même le repost (déjà créé avec succès) avec son `storyEffects` non corrigé. Jamais
  pire que le comportement actuel, jamais bloquant pour l'action utilisateur.

## Flux de données

Aucun changement de contrat API (même route, même format de réponse `POST /posts/:postId/repost`).
Seules les valeurs internes de `storyEffects.mediaObjects[].postMediaId` /
`audioPlayerObjects[].postMediaId` changent : elles pointent désormais toujours vers les
médias du repost lui-même plutôt que vers un ancêtre de la chaîne.

Aucun changement iOS requis : les résolutions existantes qui font un lookup plat de
`postMediaId` dans le tableau `media` local (`toRenderableSlide`, `StoryItem(feedPost:)`,
`RepostContent`/`init(repost:)`) fonctionneront correctement à toute profondeur une fois
que chaque post est auto-cohérent côté backend. Le patch de fusion ajouté le 2026-07-14
dans `toStoryGroups` reste en place (filet de sécurité inoffensif pour les reposts déjà
cassés en base, non migrés par décision produit).

Aucun changement web requis : cette classe de bug ne s'y manifeste pas, la fonctionnalité
d'affichage du contenu embarqué d'un repost n'y existe pas encore.

Le chemin composer (`PostService.create()`, utilisé par `StoryComposerViewModel(reposting:authorHandle:)`)
n'est pas touché — il republie via de nouveaux uploads TUS entièrement re-composés côté
client, donc déjà auto-cohérent par construction.

## Gestion d'erreurs

- Échec de duplication média (upload/copie fichier) : comportement inchangé — le bloc
  catch existant (ligne ~1526-1543) nettoie les fichiers dupliqués et relance l'erreur.
- Échec du second `prisma.post.update` (correction `storyEffects`) : capturé localement,
  loggé, repost retourné avec succès mais `storyEffects` non corrigé (dégradation
  identique au comportement pré-fix, jamais une régression).
- `postMediaId` référencé introuvable dans `idMap` : laissé inchangé plutôt que supprimé
  ou mis à `null` — évite de casser un contenu qui, même imparfait, pourrait rester
  partiellement affichable.
- `storyEffects` absent (ex. repost de STATUS sans overlay média) : `remapStoryEffectsMediaIds`
  no-op proprement, aucune écriture supplémentaire.

## Tests (TDD)

### Unitaires purs — `remapStoryEffectsMediaIds`
- Remappe `mediaObjects[].postMediaId` selon `idMap`.
- Remappe `audioPlayerObjects[].postMediaId` selon `idMap`.
- Ne touche jamais le champ `id` (élément UI) même si sa valeur coïncide par hasard avec
  une clé de `idMap`.
- Laisse inchangé un `postMediaId` absent de `idMap`.
- No-op sur `effects` undefined ; `changed=false` si aucun remap n'a eu lieu.
- Préserve tous les autres champs (position, scale, rotation, thumbHash, etc.) sans
  altération.

### Service — `PostService.repostPost()`
- Repost niveau 1 (repost d'un original) : `storyEffects` du repost auto-cohérent avec
  son propre `media[]` (non-régression du comportement déjà correct).
- **Repost-de-repost niveau 2** (le bug rapporté) : créer une story, la reposter, puis
  reposter ce repost — vérifier que le `storyEffects.mediaObjects[].postMediaId` du
  repost niveau 2 pointe exclusivement vers des IDs présents dans le `media[]` du
  repost niveau 2 lui-même (jamais vers ceux du niveau 0).
- Chaîne niveau 3, pour prouver la généralisation au-delà d'un correctif ad-hoc à 2 sauts.
- `originalRepostOfId` continue de s'aplatir correctement sur la racine à travers tous
  les niveaux (garde de non-régression sur un comportement déjà correct).
- Repost de STATUS sans `storyEffects` : pas de crash, comportement inchangé.
- Échec simulé du second `update` (mock Prisma) : le repost est quand même créé et
  retourné, l'erreur est loggée et non relancée.

## Hors périmètre (validé)

- Pas de script de backfill/migration pour les reposts déjà cassés en base existants.
- Pas de modification du code iOS (SDK ou app) — la correction backend suffit.
- Pas de modification côté web — fonctionnalité inexistante à ce jour.
- Pas de modification du chemin composer (`create()`), déjà correct.
