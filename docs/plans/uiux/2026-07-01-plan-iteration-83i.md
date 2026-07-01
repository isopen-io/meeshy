# Plan — Itération 83i (iOS)

**Thème** : Dynamic Type + VoiceOver — écrans réglages jumeaux « Stockage » & « Téléchargement auto »
**Branche** : `claude/upbeat-euler-ax4pau` (base `main` HEAD `ef737a02`)
**Analyse** : `docs/analyses/uiux/2026-07-01-iteration-83i.md`

## Objectif

Rendre `DataStorageView` et `MediaDownloadSettingsView` (jumeaux structurels) conformes Dynamic
Type + polir leur sémantique VoiceOver, sans toucher la logique ni la palette catégorielle.

## Étapes

- [x] Resync branche sur `main` HEAD ; supprimer la branche mergée précédente (78i `ceba09`)
- [x] Explorer les surfaces iOS restantes, exclure les ~25 PRs en vol → candidats jumeaux identifiés
- [x] `DataStorageView` : 10 sites `.font(.system(size:))` → `MeeshyFont.relative` (weight/design préservés)
- [x] `DataStorageView` : `.accessibilityElement(children: .combine)` sur la carte cache
- [x] `MediaDownloadSettingsView` : 10 sites `.font(.system(size:))` → `MeeshyFont.relative`
- [x] `MediaDownloadSettingsView` : `.accessibilityElement(children: .combine)` sur la carte info
- [x] `MediaDownloadSettingsView` : sélecteur radio `.accessibilityValue(...)` → trait `.isSelected`
- [x] Vérifier 0 `.system(size:` résiduel ; clé `common.selected` non orpheline
- [x] Rédiger analyse + plan + MAJ `branch-tracking.md`
- [ ] Commit + push `-u origin claude/upbeat-euler-ax4pau`
- [ ] Ouvrir PR ; attendre CI `iOS Tests`
- [ ] Merger dans `main` une fois CI vert ; MAJ pointeur autoritaire iOS

## Contraintes respectées

- **Épuration** : swap mécanique + 3 modificateurs a11y, aucune surcharge ajoutée à l'écran.
- **Style iOS préservé** : helpers custom (`sectionHeader`, `fieldIcon`, `sectionBackground`) intacts.
- **SSOT** : `MeeshyFont.relative` (Compatibility layer MeeshyUI), pas de police custom locale.
- **Palette** : accents catégoriels `Color(hex:)` par type de média **inchangés** (hors périmètre).
- **0 test neuf** : sweep typographique + a11y pur (parité 55i/71i/72i/74i).

## Suite (différé 84i+)

Voir pointeur autoritaire iOS dans `branch-tracking.md`. Grandes surfaces `.font(.system(size:))`
restantes (une par itération), Glass adoption `LocationPickerView`, ladder catégoriel arc-en-ciel
(décision charte unique).
