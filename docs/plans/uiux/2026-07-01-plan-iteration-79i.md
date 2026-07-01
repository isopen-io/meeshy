# Plan — Iteration 79i (2026-07-01)

## Objectif
i18n / VoiceOver des libellés d'état de `VoiceProfileManageView` (`statusLabel` /
`statusDescription`). **iOS exclusivement.** Base : `main` HEAD (post-78i mergée #1179).

## Décision de scope (anti-collision)
Candidat initial = épuration complète (Dynamic Type + i18n). Vérif PRs ouvertes AVANT de figer :
**PR #1150 (iter 75i, ouverte)** fait déjà le sweep Dynamic Type de ce fichier et **diffère**
l'i18n des statuts. 79i se recentre sur cette moitié orthogonale (lignes disjointes → auto-merge
propre). Dynamic Type NON refait ici.

## Étapes
1. **i18n statuts** — `statusLabel` / `statusDescription` : chaînes FR figées →
   `String(localized:defaultValue:bundle:.main)` (10 clés `voice.profile.status.*`).
2. **Catalogue** — 10 entrées neuves dans `Meeshy/Localizable.xcstrings`, 5 langues
   (de/en/es/fr/pt-BR), insertion alphabétique, JSON re-validé.
3. **Docs** — analyse + ce plan + MAJ pointeur `branch-tracking.md`.
4. **CI verte → merge dans `main`**, suppression de la branche.

## Fichiers touchés
- `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift` (2 helpers, 20 lignes)
- `apps/ios/Meeshy/Localizable.xcstrings` (+10 clés ×5 langues)
- `docs/analyses/uiux/2026-07-01-iteration-79i.md`
- `docs/plans/uiux/2026-07-01-plan-iteration-79i.md`
- `docs/plans/uiux/branch-tracking.md` (pointeur)

## Risque
Très faible : externalisation de chaînes, 0 logique modifiée, tests existants init-only non
impactés, plages de lignes disjointes de la PR #1150 concurrente. Gate = CI `iOS Tests`.

## Différé 80i+
- i18n : `StoryViewerView+Content:1221` « Story expirée … » (chaîne bare restante).
- Dynamic Type : `StoryViewerView+Content` (31), `FeedView+Attachments` (30) — une par itération
  (NE PAS reprendre `VoiceProfileManageView` : Dynamic Type = #1150, i18n statuts = 79i, tous deux soldés).
- Palette : hexes proches (`#4ADE80`→success ?, `#3B82F6`→info ?) à auditer un par un avec vérif visuelle.
- Glass : `MessageOverlayMenu` via `AdaptiveGlassContainer`.
