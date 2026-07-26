# Plan — Iteration 221i : cibles tactiles du mini-lecteur audio

**Date** : 2026-07-26
**Branche** : `claude/quirky-curie-0u4lgr` (recréée depuis `origin/main` `242a82c50`)
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-221i-miniplayer-touch-targets.md`

## Objectif

Porter les trois commandes de transport de `MiniAudioPlayerBar` au plancher HIG
de 44 × 44 pt, en suivant l'idiome déjà en place chez le voisin dont ce fichier
se réclame explicitement (`FloatingCallPillView`).

## Contexte de sélection

- 219i (convergence des métriques de fenêtre) a été **fermée en doublon de
  #2353**, qui porte la même itération en version plus complète. Ne pas la
  rouvrir ni la re-PR (consigne owner). Branche repartie de `main`.
- Essaim très dense (20 PR ouvertes). Clusters saturés à éviter :
  `StatusComposerView` / composeur d'humeur (≈5 PR), `NavigationView` →
  `NavigationStack` (≈4 PR), extension de partage, métriques de fenêtre (#2353).
- Axe i18n quasi clos : 11 littéraux bruts app-wide, dont la quasi-totalité sont
  en réalité des `LocalizedStringKey`.
- Axe retenu : **cibles tactiles**, non traité, objectif, et vérifiable.

## Étapes

- [x] Resync depuis `origin/main` `242a82c50`
- [x] Vérifier que la casse de compile de `main` (`StoryRepostFlowTests`) est
      résolue avant de rebrancher quoi que ce soit dessus
- [x] Scan app-wide des frames de bouton < 44 pt → 18 sites / 13 fichiers
- [x] Choisir le site le plus exposé (barre persistante) et vérifier l'absence
      de collision (`search_pull_requests` → 0)
- [x] Trouver le précédent interne (`FloatingCallPillView`, 3 × 44)
- [x] **RED** : 5/6 assertions en échec
- [x] Correctif : 3 frames → 44×44 + cluster `HStack(spacing: 0)`
- [x] **GREEN** : 7/7 ; accolades/parenthèses/crochets 0/0/0
- [x] Analyse + plan + `branch-tracking.md`
- [x] Commit, push, PR

## Décision de conception

`spacing: 0` sur le cluster n'est pas cosmétique : il divise par ~2 le coût en
largeur du correctif (+28 pt au lieu de +48) tout en préservant le rythme visuel
entre glyphes (~30 pt de bord à bord, avant comme après). Les boîtes de 44 pt
**sont** l'espacement.

## Impact visuel — assumé

Cette itération n'est **pas** un no-op visuel : +28 pt de largeur de cluster
(pris sur un titre déjà `.lineLimit(1)`) et jusqu'à +8 pt de hauteur de capsule.
C'est le prix de la conformité, et c'est la hauteur qu'occupe déjà le call pill.

## Hors périmètre (piste 222i+)

Les 17 autres frames sous-44 relevés, à traiter **au cas par cas** (certains
peuvent être couverts par un `.contentShape` ou un parent tappable plus large) :
`MessageOverlayMenu:1028` (14 pt), `CommentMediaView:33` (18),
`ConversationListHelpers:375` (34), `FriendRequestListView:184/195` (36),
`MyStoriesView:162`, `StoryViewerContainer:175`, `PostTranslationSheet:64`,
`WidgetPreviewView:475`, `ConversationListView+Overlays:994/1005`.
