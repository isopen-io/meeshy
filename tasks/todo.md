# Améliorations éditeur de Story iOS — 2026-07-14

Demande utilisateur : 5 améliorations autonomes, commits réguliers.

## #1 — Sidebar « Arrière-plan / Premier plan » + canvas auto  [EN COURS]
Le rail gauche (`CanvasLayerIndicator`) affiche 3 chips non-tappables (Canvas/Fond/Premier).
Objectif : 2 chips **tappables** « Arrière-plan » / « Premier plan » ; plus de « Canvas ».
Le canvas est déjà auto-dérivé du fond → on retire la notion « Canvas » manipulable.

- [ ] Ajouter notification `.storyComposerSelectManipulationLayer` (object = rawValue)
- [ ] `StoryCanvasUIView` : propriété `manualManipulationLayerOverride`
- [ ] `+Manipulation` : `resolveManipulationLayer(for:override:)` pur + `setManipulationLayer(_:)`
- [ ] `+Lifecycle` : observer la notification (gate `.edit`)
- [ ] `CanvasLayerIndicator` : 2 chips tappables qui postent la sélection
- [ ] `+Canvas.swift:705` : retirer `.allowsHitTesting(false)`
- [ ] i18n : « Arrière-plan » / « Premier plan »
- [ ] Tests SDK : résolution avec override
- [ ] Build + tests ciblés → commit

## #2 — Contours du canvas visibles quand le fond ne le remplit pas
Canvas UIView transparent (Core.swift:63-64), letterbox `clear` invisible.
- [ ] Overlay liseré permanent autour de `canvasCore` (pointillé discret) en mode édition
- [ ] Cohérence : visible surtout quand fond en `fit` / pas de fond plein
- [ ] Build + commit

## #3 — Timeline durée auto (donnée la plus longue) + rognage
`contentDerivedDuration()` ne prend que le 1er bg vidéo/audio, ignore audio fg.
- [ ] Étendre `contentDerivedDuration()` : max global sur tous médias + audios
- [ ] Peupler `intrinsicDuration` à l'import (vidéo + audio)
- [ ] Appliquer la durée audio extraite dans `addVocalToForeground`
- [ ] Passer `mediaDurationLimit` aux appels `trimClipEnd` (rognage borné)
- [ ] Tests SDK durée + commit

## #4 — Preview joue le son d'arrière-plan
BUG : mixer gaté `guard mode == .play` → audio/voix muets en `.edit`.
- [ ] Brancher `ReaderAudioMixer` en preview d'édition (audio bg/fg)
- [ ] Respecter mute composer + pas de double lecture avec `applyEditPlayback`
- [ ] Tests + commit

## #5 — Vue « Mes stories envoyées » + menu d'actions
Aucune vue existante ; infra complète (delete/repost/share/viewers).
- [ ] Nouvelle vue liste `MyStoriesView` (app-side) : `storyGroupForUser(currentUser).stories`
- [ ] Menu `...` par story : Ouvrir, Éditer les vues, Partager, Republier, Supprimer
- [ ] Wiring navigation (sheet depuis tray/profil) + pbxproj
- [ ] Build + commit

## Notes de décision
- Partager (#5) : présenter le partage in-app (`SharePickerView`) + export (`StoryExportShareSheet`).
- Toutes actions serveur passent par `StoryViewModel` (app) → SDK, jamais SDK direct depuis la vue.
