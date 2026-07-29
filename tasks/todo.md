# Stories publiées : vues/cœur dans la liste + édition complète (2026-07-29)

Demande user : (1) dans « Mes stories », icône vues + compteur juste à gauche de
l'icône commentaires (même patron) ; (2) cœur sous l'heure UNIQUEMENT si ≥ 1
réaction ; (3) activer l'ÉDITION d'une story publiée — charger les données dans
le composer, mettre à jour la story ; l'édition remet à zéro vues + réactions et
la story redevient « non vue » pour tous (la date de publication ne bouge pas).

## A. Liste « Mes stories » (MyStoriesView.swift)
- [x] A1. RED : tests-gardes `MyStoriesCommentsButtonTests` adaptés
- [x] A2. GREEN : bouton œil+compteur (→ StoryViewersSheet) à gauche du bouton
      commentaires ; cœur sous l'heure seulement si `reactionCount > 0` ;
      `onOpenViewers` + action a11y + clé `story.mine.viewers.a11y` (7 langues)

## B. Édition d'une story publiée
- [x] B1. Exploration : PUT /posts/:id existait (storyEffects OK) mais aucun
      reset d'engagement, pas de mediaIds à l'update, aucun mode édition iOS
- [x] B2. Gateway (TDD, 16 suites/473 verts + tsc propre) :
      · `storyEditPolicy.storyContentEditRequested` (prédicat partagé route/service)
      · reset : PostView/PostReaction/PostImpression deleteMany + compteurs à 0
        + reactions/reactionSummary/storyViews JSON vidés + translations rewipe
        + retraduction Prisme (content + textObjects) ; `createdAt`/`expiresAt`
        JAMAIS touchés (date de publication immuable)
      · `mediaIds` accepté à l'update (attach TUS postId=null, borné 10)
      · `Post.contentEditedAt DateTime?` (schéma+trayStorySelect+types partagés)
        — SEUL horodatage fiable pour céder la garde « viewed monotone »
      · `story:updated` porte `engagementReset` (handler + shared + tests)
- [x] B3. iOS : « Modifier » dans le menu ⋯ (2 surfaces : tray + mini-trail) →
      `StoryComposerViewModel(editing:)` (hydratation fidèle, préchargement
      3-tier, pas de badge) ; composer gate brouillons/multi-slide en édition,
      seed visibilité, libellé « Mettre à jour »
- [x] B4. iOS : `StoryViewModel.updateStoryInBackground` — upload des seuls
      assets nouveaux (postMediaId vide), diff removeMediaIds, PUT, cover
      local-first re-rendue, remplacement dans le groupe ; garde monotone
      raffinée (`shouldKeepLocalViewed`) appliquée aux 3 sites de merge,
      jamais pour ses propres stories ; V1 édition = en ligne uniquement
      (hors-ligne → composer reste ouvert + toast)

## C. Vérification
- [x] C1. Gateway : suite INTÉGRALE verte (545 suites / 14 822 tests, bun)
      + `tsc --noEmit` propre
- [x] C2. iOS : `meeshy.sh build` vert ; bundle de tests compilé
      (`build-for-testing`, DerivedData privée ensemencée — lock DB partagé
      par la session concurrente) ; simu 18.2 :
      MyStoriesCommentsButtonTests 10/10, StoryViewModelTests 103/103 (un
      crash de 1re passe NON reproduit en isolé — bruit de la file de
      publication persistante du simu), SDK : Edit 6/6, Repost 7/7,
      ComposeAndPublishFlow 14/14
- [x] C3. Commits : `093a0ddb2` (gateway/shared) + lot iOS (sélectif ; le
      catalogue SDK est passé par le commit i18n concurrent `e94b56422` qui a
      embarqué ma clé `story.composer.updateStory`)

## Review
- Prisme respecté : l'édition invalide et relance les traductions (content +
  textObjects) ; l'index de recherche dérivé reste synchrone.
- Choix structurant : `contentEditedAt` (DateTime? nullable, conforme à la
  règle « pas de booléen redondant ») — `updatedAt` bouge sur chaque
  compteur, il était INUTILISABLE pour faire céder la garde « viewed
  monotone » ; sans ce champ, les clients hors-ligne au moment de l'édition
  n'auraient jamais vu la story « recommencer ».
- L'état « vu » de ses PROPRES stories est client-only (recordView exclut
  l'auteur) → jamais dévissé par le reset.
- V1 assumée : l'édition exige le réseau (pas de file offline dédiée) — le
  composer reste ouvert en cas d'échec réseau ; en cas d'échec du PUT après
  fermeture, toast d'erreur (la version précédente reste intacte serveur).
- Fond de slide : identité d'instance UIImage (hydratée vs publiée) décide
  du ré-upload ; un fond inchangé garde son PostMedia d'origine.
