## `postInclude` devient un `Prisma.PostSelect` — `storyViews` ne voyage plus vers tout lecteur d'un post (2026-09-12, #4791)

**Le fait** : `GET /posts/:id/views` (la liste des spectateurs d'une story)
est réservée à l'auteur — `403` pour tout autre lecteur
(`routes/posts/interactions.ts`). Mais `postInclude`
(`services/gateway/src/services/posts/postIncludes.ts`), le point d'hydratation
UNIQUE utilisé par `PostService`, `PostFeedService`, `PostAudioService` et les
routes de recherche/proximité/hashtag, était un `Prisma.PostInclude` — et
Prisma renvoie TOUS les scalaires d'un modèle sous `include`, quelles que
soient les relations nommées. `Post.storyViews` (la même donnée, embarquée)
partait donc vers chaque lecteur AUTORISÉ à voir le post — fil, recherche,
à proximité, reposts, commentaires attachés — sans qu'aucune route ne l'ait
demandé ni qu'un test ne le voie : le schéma de réponse de ces routes ne
déclare `storyViews` nulle part, donc rien ne l'aurait arrêté à la
sérialisation non plus.

**La décision** : convertir `postInclude` (et `storyPostInclude`, qui en
dérive par spread) en `Prisma.PostSelect` — un `select` explicite listant
CHAQUE scalaire du modèle Post SAUF `storyViews` (`postScalarSelect`), plus
les cinq relations déjà présentes. `select` est le seul des deux qui puisse
exprimer « tout sauf CE champ » ; `include` ne le peut pas par construction.
Les 22 sites d'appel (`PostService` ×15, `PostFeedService` ×6 dont un
imbriqué sous `postBookmark.include.post`, `PostAudioService`, les routes
`nearby`/`hashtag`) passent désormais `select: postInclude` (ou
`storyPostInclude`/`feedPostInclude`), jamais `include:` — le compilateur
(`Prisma.validator<Prisma.PostSelect>()`) refuse toute autre forme, ce qui a
servi de garde de migration : `tsc --noEmit` (0 erreur) après conversion
confirme qu'aucun site n'a été oublié.

**Alternative rejetée** : retirer purement la colonne `storyViews` du schéma.
Rejetée parce que `PostService.republishStory`/`updatePost` la remettent
encore explicitement à `[]` à la republication d'une story (reset
d'engagement) — une écriture vivante, donc pas du code mort à retirer sans
readresser d'abord ces deux sites séparément (hors de la portée de cette
issue, qui vise la fuite de LECTURE, pas la propriété d'écriture).

**Preuve** : `services/gateway/src/services/posts/__tests__/postIncludes.test.ts`
— trois témoins dédiés (`postScalarSelect`, `postInclude`, `storyPostInclude`
n'ont jamais `storyViews`), ROUGE prouvé en réintroduisant temporairement
`storyViews: true` dans `postScalarSelect` (3 échecs), puis restauré. Suite
complète : `npx tsc --noEmit` gateway 0 erreur ; 118 suites / 2203 tests
`posts`/`PostService`/`PostFeedService`/`PostAudioService` verts (aucune
régression sur les 22 sites convertis).

**Hors de portée depuis cet environnement** (aucun accès infra/production) :
le critère de fin n°1 de #4791 — compter les documents Post portant encore un
`storyViews` legacy non vide (`db.posts.countDocuments({ storyViews: { $ne: [] } })`
sur staging/production) — n'a pas pu être mesuré. La migration
`scripts/migrations/mongodb/018_clear_legacy_post_storyViews.js` est committée
(dry-run par défaut, compte les documents concernés, `APPLIQUER=true` pour
vider `storyViews` sur les lignes héritées) mais n'a pas été jouée. L'issue
reste ouverte pour ce point, à fermer par une session avec accès à la base.
