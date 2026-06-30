# Plan — Iteration 71i (2026-06-30) — iOS

## Objectif
i18n du menu d'actions rapides de message (`MessageOverlayMenu`) : les libellés d'action et
les libellés VoiceOver des contrôles média étaient codés en dur en français (certains sans
accents) → migration vers `Localizable.xcstrings` (5 locales). Surface la plus utilisée de
l'app. Borné, épuré, pur swap i18n.

## Changements

### 1. `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`
- 7 libellés d'action (`overlayActions`) littéraux FR → `String(localized: key, defaultValue:, bundle: .main)` :
  - `reply` → `action.reply` (existant), `thread` → `action.thread`, `copy` → `action.copy`
    (existant), `pin`/`unpin` → `action.pin`/`action.unpin`, `star`/`unstar` →
    `action.star`/`action.unstar`, `edit` → `action.edit`, `deleteAttachment` →
    `action.delete_media`.
- Libellés VoiceOver média : audio play/pause → `media.playAudio`/`media.pauseAudio`, hint →
  `media.audioHint` (`%@`), vidéo play/pause → `media.playVideo`/`media.pauseVideo`.

### 2. `apps/ios/Meeshy/Localizable.xcstrings`
- 12 clés neuves (5 locales chacune : de/en/es/fr/pt-BR) : `action.thread`, `action.pin`,
  `action.unpin`, `action.star`, `action.unstar`, `action.edit`, `action.delete_media`,
  `media.pauseAudio`, `media.playAudio`, `media.audioHint`, `media.pauseVideo`,
  `media.playVideo` (cette dernière solde aussi le repli anglais pré-existant ligne 1222).
- `action.reply` / `action.copy` réutilisées (déjà présentes, 5 locales).

## Hors-scope (différé, ne pas re-flagger)
- `defaultValue` restent en français (sourceLanguage = `fr`) — convention du fichier.
- Aucun changement layout/couleur/geste/logique.
- Polices figées de la carte média (lot Dynamic Type dédié).

## Vérification
- `python3 -c json.load` sur le catalogue → JSON valide + 12 clés × 5 locales (fait).
- CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2) = gate.
- Pas de build SwiftUI local (Linux).

## Merge
Après CI verte : merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Status : ⏳ push + CI → merge main
