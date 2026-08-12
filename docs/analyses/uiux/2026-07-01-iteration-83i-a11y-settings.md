# Itération 83i — Dynamic Type + VoiceOver des écrans réglages « Stockage » & « Téléchargement auto »

**Piste** : iOS (suffixe `i`, distincte des pistes web/android)
**Date** : 2026-07-01
**Thème** : Dynamic Type (4y11 / accessibilité) + sémantique VoiceOver
**Fichiers** :
- `apps/ios/Meeshy/Features/Main/Views/DataStorageView.swift` (201 l.)
- `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift` (214 l.)

**Branche** : `claude/upbeat-euler-ax4pau`
**Base** : `main` HEAD (`ef737a02`)

## Contexte

Suite directe du différé « Dynamic Type grandes surfaces / une par itération » des itérations
**55i / 71i / 72i / 74i** (même doctrine, même helper `MeeshyFont.relative`). Ces deux écrans de
réglages sont des **jumeaux structurels** (même header custom, mêmes helpers `sectionHeader` /
`sectionBackground` / `fieldIcon`, même accent `E67E22`) — les traiter ensemble garde la cohérence
et évite qu'un des deux prenne du retard sur l'autre.

- `DataStorageView` : écran « Stockage » (info cache média + action « Vider le cache »).
- `MediaDownloadSettingsView` : écran « Téléchargement auto » (politique d'auto-DL par type de
  média : Images / Audio / Traductions audio / Vidéo, chacune sous forme de sélecteur radio à
  4 options).

Les deux écrans figaient **100 % de leur typographie** via `.font(.system(size:))` — sur des
surfaces entièrement composées de texte de lecture (titres, sous-titres, descriptions, libellés
de politique). **Rien ne s'agrandissait** avec la préférence Dynamic Type (Réglages › Accessibilité
› Texte plus grand) — violation directe de la règle a11y du codebase (« semantic fonts, not fixed
sizes for Dynamic Type », `apps/ios/CLAUDE.md`).

## Diagnostic

### DataStorageView — 10 sites `.font(.system(size:))` → `MeeshyFont.relative`

| Site | Avant | Après |
|------|-------|-------|
| chevron retour | `.system(size: 14, .semibold)` | `relative(14, .semibold)` |
| libellé « Retour » | `.system(size: 15, .medium)` | `relative(15, .medium)` |
| titre écran | `.system(size: 17, .bold)` | `relative(17, .bold)` |
| titre carte cache | `.system(size: 14, .medium)` | `relative(14, .medium)` |
| sous-titre carte cache | `.system(size: 12, .regular)` | `relative(12, .regular)` |
| description cache | `.system(size: 13, .regular)` | `relative(13, .regular)` |
| libellé « Vider le cache » | `.system(size: 14, .medium)` | `relative(14, .medium)` |
| icône `sectionHeader` | `.system(size: 12, .semibold)` | `relative(12, .semibold)` |
| titre `sectionHeader` | `.system(size: 11, .bold, .rounded)` | `relative(11, .bold, .rounded)` |
| glyphe `fieldIcon` | `.system(size: 14, .medium)` | `relative(14, .medium)` |

### MediaDownloadSettingsView — 10 sites `.font(.system(size:))` → `MeeshyFont.relative`

Symétrie parfaite avec le jumeau (chevron, retour, titre, titre/sous-titre carte info, libellé de
politique, checkmark de sélection, icône + titre `sectionHeader`, glyphe `fieldIcon`).

### Sémantique VoiceOver (a11y)

| Écran | Amélioration | Détail |
|-------|--------------|--------|
| DataStorageView | `.accessibilityElement(children: .combine)` sur la carte cache (icône + titre + sous-titre) | VoiceOver lit un seul élément cohérent au lieu de 3 fragments |
| MediaDownloadSettingsView | idem sur la carte info | 1 élément au lieu de 3 |
| MediaDownloadSettingsView | sélecteur radio : `.accessibilityValue(« sélectionné »)` (chaîne localisée) → **trait `.isSelected`** | sémantique radio native — VoiceOver annonce « sélectionné » automatiquement, plus idiomatique, supprime la dépendance à la clé `common.selected` sur ce site (clé toujours utilisée ailleurs : `ReportUserView`, `SettingsView` — pas d'orphelin) |

## Doctrine appliquée (identique 55i/71i/72i/74i)

1. **Swap littéral pur** `.font(.system(size: N, weight:, design:))` → `.font(MeeshyFont.relative(N, weight:, design:))`. Weight et design **préservés** (dont `.rounded` des en-têtes de section).
2. `MeeshyFont.relative` (SSOT : `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift`) mappe la taille legacy vers le `Font.TextStyle` relatif le plus proche → la police **scale** avec Dynamic Type tout en gardant l'apparence par défaut identique au pixel près à taille standard.
3. **Aucune géométrie figée touchée** : les `.frame(width: 28, height: 28)` des `fieldIcon` (conteneurs d'icône) restent fixes ; seule la **police du glyphe** scale à l'intérieur — comportement voulu (l'icône grossit dans son chip).
4. **0 logique métier modifiée, 0 test neuf** — sweep typographique + modificateurs a11y purs (parité 55i/71i/72i/74i). Gate = CI `iOS Tests` (compile app + tests sur simu 18.2).
5. **Palette préservée** : les `Color(hex:)` de ces écrans sont des accents catégoriels par type de média (`E67E22`, `F39C12`, `E74C3C`, `6B7280`, `EF4444`) + tokens `MeeshyColors.brandPrimaryHex`/`indigo600Hex` — hors périmètre de cette itération (couleurs catégorielles, décision charte différée cf. différé palette 69i). **Seul `MeeshyColors.error`** (déjà en place, ligne « Vider le cache ») reste un token.

## Résultat

- **20 conversions** typographiques (10 + 10) — les deux écrans scalent désormais intégralement avec Dynamic Type.
- **3 améliorations VoiceOver** (2 regroupements de carte + 1 trait radio idiomatique).
- Pixels identiques à taille Dynamic Type standard (`.large`) ; aucune régression visuelle attendue.

## Statut

✅ **Corrigé & complet** — ne pas re-flagger la typographie ni la sémantique VoiceOver de
`DataStorageView` / `MediaDownloadSettingsView`.

**Différé restant sur ces 2 écrans (hors périmètre 83i)** : couleurs catégorielles `Color(hex:)`
par type de média (décision charte unique différée, cf. différé palette 69i) — **ne pas** les
convertir en tokens sémantiques sans décision charte (ce sont des accents catégoriels, pas des
états sémantiques success/warning/error).
