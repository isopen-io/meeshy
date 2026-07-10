# Story System Redesign — création + visionnage (directive user 2026-07-10)

Branche : `claude/story-system-redesign-r972q7`

## Demande (analyse des 3 captures + texte)

1. **Composer moderne type Instagram, MAIS outils en barre HORIZONTALE en bas**
   (référence IMG_0944 : rail vertical IG → transposé horizontal bas). Les éléments
   apparaissent/disparaissent selon le besoin ; le canvas se réduit (carding) et
   reprend le plein écran selon le besoin (déjà en place via StoryCanvasFraming —
   à préserver). **Le header ne doit plus être une barre mais des icônes flottantes**
   en survol du canvas (X à gauche, actions à droite, aucune barre matérielle).
2. **Reader : rapprocher les FABs d'actions** (IMG_0984 : Envoyer/Vues/Exporter/Son
   trop espacés). **Le set de boutons + TOUS les compteurs doivent être calculés
   AVANT affichage** — aucune apparition en second temps (pop-in du bouton
   commentaires après réconciliation 400 ms = interdit).
3. **Switch de groupe (IMG_0976)** : l'interstitiel d'identité (« Windie Nh —
   Hors ligne ») ne doit PAS s'afficher en overlay translucide PAR-DESSUS le slide
   déjà rendu (chrome + FABs visibles derrière). Il doit être un écran opaque
   présenté AU MOMENT du changement de groupe, présence déjà résolue, le slide
   n'apparaissant qu'à la fin de l'interstitiel.
4. SOTA : « l'utilisateur n'a que ce qu'il faut au bon moment devant ses yeux et
   à portée de doigts ».

## Constats de cartographie (3 agents, 2026-07-10)

- Le feed `GET /posts/feed/stories` inclut DÉJÀ tous les compteurs
  (likeCount/reactionCount/reactionSummary/viewCount/commentCount/isViewedByMe/
  currentUserReactions) → le calcul avant affichage est faisable sans réseau.
- La présence auteur (isOnline/lastActiveAt) est ABSENTE du payload stories
  (`authorSelect` = id/username/displayName/avatar) ; l'intro lit
  `PresenceManager.presenceMap` (souvent vide pour un non-contact → « Hors ligne »
  à tort, ou résolu en retard).
- L'intro est déclenchée par `.adaptiveOnChange(of: currentGroupIndex)` — donc
  APRÈS le swap du cube, slide déjà présenté derrière (scrim translucide,
  chrome visible au travers — exactement IMG_0976).
- Rail d'actions : `ViewThatFits` spacing 20/14 + `StoryActionButton` padding
  vertical 8 sur des colonnes 56 pt → espacement effectif ~36 pt (IMG_0984).
- Bouton commentaires gaté `storyCommentCount > 0` avec réconciliation async
  400 ms → pop-in en cours de lecture.
- Composer : rail FAB VERTICAL bottom-leading (6×56 pt), header = barre 60 pt
  `.ultraThinMaterial` avec X + slide strip + undo/redo/visibilité/preview/
  publier/⋯.

## Plan (ordre d'exécution)

### G — Gateway (TDD bun, testable ici)
- [x] G1 : présence auteur dans le feed stories — `storyAuthorSelect`
      (authorSelect + isOnline + lastActiveAt) appliqué au chemin stories
      (full + tray). Tests RED→GREEN sur la shape de réponse. (`27d3fac`)
- [x] G2 : types partagés `PostAuthor.isOnline?/lastActiveAt?`. (`27d3fac`)

### S — SDK Swift (models)
- [x] S1 : `APIAuthor.isOnline/lastActiveAt` (decode optionnel rétro-compat) ;
      `StoryGroup.authorPresence` propagé par toStoryGroups. (`0fb6bfb`)

### V — Viewer iOS
- [x] V1 : rail resserré (spacing 8/6, padding 3, gap 2) + ancrage bas.
- [x] V2 : `StoryActionRailPlan` figé à l'entrée du slide (5 tests).
- [x] V3 : interstitiel OPAQUE présenté dans la même transaction que le
      swap, présence = presenceMap ?? authorPresence, pré-résolution des
      groupes voisins (groupIntroCache). (`abd0346`)

### K — Composer iOS
- [x] K1 : barre horizontale bas centrée (48 pt). (`83e7bfe`)
- [x] K2 : header barre supprimé → icônes flottantes + strip pill
      conditionnelle. (`83e7bfe`)
- [x] K3 : poignée de restauration re-centrée. (`83e7bfe`)

### Clôture
- [x] Mise à jour `tasks/story-sota-state.md` (mission D + it.94)
- [x] Commits + push sur la branche dédiée.
- [ ] PR + CI iOS verte (demande user mid-session) ; pulls réguliers de main.
- [ ] D5 : passe simulateur/device (viewer + composer + switch de groupe).

## Contraintes
- Invariants story-sota-state §5 : jamais retirer d'effet visuel, SDK purity,
  timer anti-deadlock, RAW publish.
- Pas de toolchain Swift ici : gateway testé sous bun ; Swift relu ligne à
  ligne (types/API existants uniquement, pas de nouvelle API spéculative).
- Presence palette : offline = pas de dot avatar ; badge story-intro = affichage
  LABELLISÉ (gris autorisé) — conforme CLAUDE.md.

## Review (à compléter en fin de mission)
