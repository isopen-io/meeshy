# U4 — Carte de reprise du brouillon (pendant UX de l'autosave E1)

## Constat (it.36)
`checkForDraft()` (onAppear composer) → `showRestoreDraftAlert` → **alerte TEXTE nue**
(`StoryComposerView.swift:198` « Reprendre votre story ? ») avec boutons Reprendre /
« Effacer le brouillon ». Depuis E1 (autosave débouncé) le brouillon est riche et fréquent :
l'alerte ne montre RIEN de ce qu'on reprend.

## Cible
Remplacer l'alerte par une CARTE de reprise dans le composer :
- **Cover composite du brouillon** : `StorySlideRenderer.renderComposite(slide:bgImage:
  loadedImages:size:)` — EXACTEMENT le chemin des covers optimistes offline (it.3 /
  `insertOptimisticOfflineStories`) ; les médias du draft se rechargent via
  `StoryDraftStore.loadMedia()` (API à vérifier : le restore existant recharge déjà
  images/videos/audios — réutiliser ce chemin AVANT le rendu).
- Métadonnées : nombre de slides, « modifié il y a X » (draft meta updatedAt si dispo).
- Boutons : **Reprendre** (restore existant) / **Recommencer** (clearAllDrafts SANS
  suspendre l'autosave — cf. it.5) ; tap hors carte = Recommencer ? NON — dismissal
  explicite uniquement (le brouillon est précieux).
- Style : carte `.ultraThinMaterial` indigo (design system), `colorScheme` géré,
  a11y (labels + actions).

## Incréments
1. Rendu : `DraftResumeCard` (vue MeeshyUI, params opaques : cover UIImage?, slideCount,
   updatedAt, onResume, onDiscard) + tests d'init/pure helpers si logique.
2. Câblage : produire le cover async au `checkForDraft` (restaurer médias → renderComposite
   du premier slide) ; remplacer l'`.alert` par un overlay présentant la carte ;
   conserver le chemin alerte en fallback si le rendu échoue (cover nil = carte sans image).
3. Chip « Ma story » (tray) — reprise depuis le tray (SCOPE SÉPARÉ, décision produit).

## Pièges connus à respecter
- `resetLocalState()` obligatoire avec tout `viewModel.reset()` (tests ResetState).
- Le bouton « Effacer le brouillon » ne suspend PAS l'autosave (it.5).
- SDK purity : la carte = building block paramétré (MeeshyUI) ; la DÉCISION de
  présentation reste dans StoryComposerView.
- Nouveau fichier SDK = OK (SPM glob) ; PAS de nouveau fichier app sans xcodegen.
