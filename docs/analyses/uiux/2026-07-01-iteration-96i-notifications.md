# UI/UX Analysis — Iteration 96i (2026-07-01) — NotificationSettingsView

## Scope
**iOS exclusivement** (suffixe `i` — Web/Android couverts par d'autres agents).
Thème : **accessibilité — Dynamic Type + VoiceOver** sur `NotificationSettingsView`
(écran Réglages › Notifications : 7 sections de toggles + sélecteur DnD jours/heures).
Migration mécanique des polices figées `.font(.system(size:))` vers `MeeshyFont.relative(...)`
(scaling Dynamic Type), avec 2 glyphes/labels gardés figés (badge d'icône 28×28 fixe +
pastille de jour DnD 28×28 fixe) et 3 traits VoiceOver déclaratifs.

> **Contexte de contention** : run au milieu d'un essaim d'agents iOS parallèles.
> PR iOS ouvertes au démarrage : #1248 `TwoFactorSetupView` (95i), #1246/#1243 `SharePickerView`
> (94i), #1245/#1238/#1235/#1234/#1233 `AffiliateView`, #1244 `MemberManagementSection` (94i),
> #1242/#1240 `LocationPickerView` (93i, déjà mergé sur `main` via #1225), #1241
> `ConversationPreferencesTab` (93i), #1237 `NewConversationView` (91i), #1236 `CommunityLinksView`
> (91i). **`NotificationSettingsView` n'est ciblé par AUCUNE PR ouverte** → surface disjointe
> choisie pour éviter toute collision. Numéro **96i** (prochain libre au-dessus de 95i).

Vérification : la CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2) sert de build
de validation (SwiftUI ne compile pas sous Linux). **Aucun test neuf** : sweep typographique pur
+ 3 traits a11y déclaratifs, aucune logique modifiée (parité 55i / 74i / 86i / 88i / 90i / 91i /
93i). `MeeshyFont` déjà en scope (`import MeeshyUI` ligne 4).

## Contexte / point de départ
`NotificationSettingsView.swift` (360 lignes) est l'écran de préférences de notification (Settings) :
un header custom (Retour + titre), un `ScrollView` de 7 sections (`Général`, `Messages`,
`Conversations`, `Contacts & Groupes`, `Feed Social`, `Display`, `Ne pas déranger`) construites
via deux helpers réutilisables (`settingsSection` = carte titrée, `settingsRow` = ligne
icône-badge + libellé + contrôle trailing), plus un sélecteur de jours DnD (7 pastilles) et 2
champs d'heure. Couleurs **déjà** toutes tokenisées (`MeeshyColors.*Hex` + `theme.*` + accent
`Color(hex: accentColor)`) → 0 swap palette. Mais **10 sites** fixaient une taille de police
absolue `.font(.system(size:))` — l'écran ignorait entièrement le réglage Dynamic Type (rupture
de la règle a11y CLAUDE.md « Use semantic fonts, NEVER use fixed font sizes for body text »).

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (8/10 sites)
Migration mécanique préservant `weight` et `design` (`.rounded` de l'en-tête de section). Sites =
texte de lecture ou glyphes SF Symbol inline appariés à un `Text`/`TextField` scalable :

| Ligne | Rôle | Avant | Après |
|---|---|---|---|
| 36 | chevron Retour (inline, apparié « Retour ») | `.system(size: 14, weight: .semibold)` | `relative(14, weight: .semibold)` |
| 38 | libellé « Retour » | `.system(size: 15, weight: .medium)` | `relative(15, weight: .medium)` |
| 46 | titre « Notifications » (toolbar) | `.system(size: 17, weight: .bold)` | `relative(17, weight: .bold)` |
| 203 | champ heure début DnD | `.system(size: 14, weight: .medium)` | `relative(14, weight: .medium)` |
| 214 | champ heure fin DnD | `.system(size: 14, weight: .medium)` | `relative(14, weight: .medium)` |
| 310 | icône d'en-tête de section (inline, apparié titre) | `.system(size: 12, weight: .semibold)` | `relative(12, weight: .semibold)` |
| 313 | titre de section `.rounded` | `.system(size: 11, weight: .bold, design: .rounded)` | `relative(11, weight: .bold, design: .rounded)` |
| 350 | libellé de ligne (`settingsRow`) | `.system(size: 14, weight: .medium)` | `relative(14, weight: .medium)` |

### 2 glyphes/labels gardés figés + commentés
| Ligne | Rôle | Décision |
|---|---|---|
| 245 | label de jour DnD (`M`/`T`/`W`…) contraint dans une **pastille 28×28 fixe** | figé (doctrine 86i/93i — un label scalable déborderait la pastille `Capsule` de largeur fixe). Le bouton porte déjà `.accessibilityLabel(dayAccessibilityLabel)` + `.isSelected`. |
| 349 | glyphe de `settingsRow` contraint dans un **badge 28×28 fixe** | figé (doctrine 74i/86i — un glyphe scalable déborderait le carré teinté) + `.accessibilityHidden(true)` (décoratif ; le libellé adjacent porte le sens). |

### VoiceOver — 3 traits déclaratifs
- **En-tête de section** (ligne 307-320) : `.accessibilityElement(children: .combine)` +
  `.accessibilityAddTraits(.isHeader)` → l'icône + le titre se lisent en un seul élément et le
  rotor « En-têtes » navigue entre les 7 sections. Glyphe d'en-tête `.accessibilityHidden(true)`
  (redondant sous `.combine` mais explicite).
- **Badge de ligne** (ligne 349) : `.accessibilityHidden(true)` (glyphe décoratif).
- **Toggle** (`notifToggle`, ligne ~296) : `.accessibilityLabel(title)` → comble un vrai trou
  VoiceOver : le `Toggle("", …).labelsHidden()` lisait « activé/désactivé » **sans** dire de quel
  réglage il s'agit (le libellé n'était qu'un `Text` frère visuel). Trait déclaratif, aucun impact
  visuel.

## Périmètre délibérément exclu (ne pas re-flagger)
- **Palette** : tous les tons proviennent de `MeeshyColors.*Hex` (semantic + brand) / `theme.*` /
  accent `Color(hex: accentColor)` — déjà tokenisée, aucun swap. (Le fichier n'a **pas** de Liquid
  Glass — chrome plein `theme.surfaceGradient` — hors-scope de cette itération purement a11y.)
- **Touch target 28×28 des pastilles DnD** (< 44×44 HIG) : signalé mais **hors-scope** (changement
  de layout, pas de typographie) — candidat différé si un lot « touch targets » est ouvert.
- **Labels figés 28×28** (lignes 245, 349) : figés à dessein (cadres fixes).

## Anti-repetition check
`list_pull_requests` (2026-07-01) : ~18 PR ouvertes, **aucune** ne touche
`NotificationSettingsView`. Surfaces déjà couvertes par PR ouvertes explicitement évitées
(TwoFactorSetupView, SharePickerView, AffiliateView, MemberManagementSection, LocationPickerView,
ConversationPreferencesTab, NewConversationView, CommunityLinksView). Surfaces différées risquées
(`StoryViewerView+Content` collision i18n #1174, `ConversationView+Composer` critique,
`MessageOverlayMenu` Glass) laissées de côté au profit d'un écran de réglages self-contained
faible risque (parité DataExportView 91i / MagicLinkView 90i).

## Status : ✅ analyse complète + corrections appliquées (8 swaps police → `MeeshyFont.relative` / 2 labels figés documentés / 3 traits VoiceOver, 1 fichier).
Développement terminé → branche `claude/upbeat-euler-ed1lfk` ; CI `ios-tests.yml` ; merge dans
`main` après CI verte. Voir plan `2026-07-01-plan-iteration-96i-notifications`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les 8 sites de `NotificationSettingsView` ci-dessus
(désormais `MeeshyFont.relative`). Le label de jour DnD (ligne 245) et le glyphe de badge
`settingsRow` (ligne 349) sont **volontairement** figés (cadres fixes 28×28) — ne pas proposer
leur migration. Palette déjà tokenisée. Le trou VoiceOver du `Toggle` (label absent) est **comblé**
(`.accessibilityLabel(title)`).

### Différé prioritaire iOS 97i+
- Dynamic Type : `MemberManagementSection` (si #1244 ne merge pas), `StoryViewerView+Content`
  (grande surface, coordonner i18n #1174), `ConversationView+Composer` (lot prudent = composer
  critique), `AddParticipantSheet` (14), `ConversationMediaGalleryView` (13), `SupportView` (10),
  `LicensesView` (10) — une par itération.
- Palette : audit hexes proches-mais-non-exacts (checkmark `#4ADE80` → `success`) avec vérif visuelle.
- Glass adoption reste (`MessageOverlayMenu` via `AdaptiveGlassContainer`, lot dédié).
- **Touch targets** : pastilles DnD `NotificationSettingsView` 28×28 (< 44×44 HIG) — lot layout dédié.
