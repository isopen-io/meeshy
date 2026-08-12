# UI/UX Analysis — Iteration 94i (2026-07-01) — SharePickerView

## Scope
**iOS exclusivement** (suffixe `i`). Thème : **accessibilité — Dynamic Type** sur `SharePickerView`
(feuille « Partager avec… » : bannière d'aperçu du contenu partagé + recherche + liste de
conversations avec bouton d'envoi). Migration mécanique des polices figées `.font(.system(size:))`
vers `MeeshyFont.relative(...)`, avec la colonne de contrôle d'envoi (26pt) gardée à taille fixe.

> **Contexte de contention** : essaim d'agents iOS parallèles très dense (jusqu'à 3 PR pour la
> **même** surface — `LocationPickerView` 93i ×3, dont la mienne #1225 **mergée**). Les cibles
> « chaudes » sont saturées (AffiliateView ×4, NewConversationView, CommunityLinksView,
> DataExportView, ConversationPreferencesTab, LocationPickerView). **`SharePickerView` n'est cité
> par AUCUNE PR ouverte ni AUCUNE liste « next »** → surface délibérément **hors-radar** choisie
> pour éviter la collision. Numéro **94i**.

Vérification : CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2) — SwiftUI ne
compile pas sous Linux. **Aucun test neuf** : sweep typographique pur + 1 masquage VoiceOver,
0 logique (parité 55i / 74i / 86i / 90i / 93i). `MeeshyFont` déjà en scope (`import MeeshyUI` ligne 4).

## Contexte / point de départ
`SharePickerView.swift` (377 lignes) est la feuille de partage/transfert (texte, URL, image,
message transféré, story) vers une conversation. Elle affiche une bannière d'aperçu du contenu, un
champ de recherche, et une liste de conversations avec un bouton d'envoi tri-état
(envoyer/en-cours/envoyé). Libellés déjà i18n'd, palette déjà tokenisée (`MeeshyColors.*` +
`theme.*`). Mais **16 sites** fixaient une taille de police absolue `.font(.system(size:))` — la
feuille ignorait le réglage Dynamic Type (rupture de la règle a11y CLAUDE.md).

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (14/16 sites)
Migration mécanique préservant `weight`. Sites = texte de lecture, glyphes d'icône de contenu, et
le paramètre `font:` du sous-composant `ConversationTitleLabel` :

| Ligne | Rôle | Après |
|---|---|---|
| 102 | libellé type de contenu (bannière) | `relative(11, weight: .semibold)` |
| 107 | aperçu du contenu (bannière) | `relative(12)` |
| 124/128/138/142 | icônes de type de contenu (texte/URL/message/story, 16pt) | `relative(16)` |
| 180 | loupe recherche (inline) | `relative(14, weight: .medium)` |
| 185 | champ de recherche | `relative(15)` |
| 195 | croix d'effacement recherche | `relative(16)` |
| 257 | `ConversationTitleLabel(font:)` de la ligne | `relative(15, weight: .medium)` |
| 263 | libellé type de conversation | `relative(12)` |
| 268 | puce séparatrice « • » | `relative(10)` |
| 271 | aperçu du dernier message | `relative(12)` |

### Colonne de contrôle d'envoi — 26pt gardé fixe (2/16 sites)
Les 3 états du bouton de fin de ligne (`paperplane.circle.fill` envoyer / `ProgressView` en-cours /
`checkmark.circle.fill` envoyé) doivent rester **visuellement alignés**. Le `ProgressView` est déjà
contraint à un cadre **26×26 fixe** (ligne 296). Faire scaler les 2 glyphes (envoyer/envoyé) mais
pas le spinner ferait **sauter la largeur de la colonne d'action** au fil du réglage Dynamic Type et
désaligner la liste. Décision (doctrine 86i, contrôle à taille fixe) : les 2 glyphes restent
`.system(size: 26)` + commentaire d'exception. Le tap target ≥44pt reste garanti par le padding de
ligne. Le bouton `paperplane` conserve son `.accessibilityLabel` existant (ligne 306).

### VoiceOver
`.accessibilityHidden(true)` sur la loupe de recherche décorative (ligne 182 ; le champ porte le
placeholder). La croix d'effacement (ligne 197) et le bouton d'envoi (ligne 306) conservaient déjà
leur `.accessibilityLabel`.

## Périmètre délibérément exclu (ne pas re-flagger)
- **Icône de contenu image** (case `.image`, 32×32) : c'est un `Image(uiImage:)` redimensionné, pas
  une police — hors scope.
- **Palette** : `MeeshyColors.indigo400/500/600`, `.success`, `.warning`, `theme.*` — déjà
  tokenisée. Les fonds `Color.white/black.opacity` de la bannière/champ sont des surfaces neutres
  génériques (hors scope, cohérent avec la doctrine « surfaces neutres différées »).
- **Colonne de contrôle 26pt** : figée à dessein (voir ci-dessus).

## Anti-repetition check
`list_pull_requests` (2026-07-01) : ~10 PR iOS ouvertes, **aucune** ne touche `SharePickerView`
(elles ciblent Affiliate/NewConversation/CommunityLinks/DataExport/LocationPicker/
ConversationPreferencesTab). Ma 93i (LocationPickerView #1225) est **mergée** sur `main`. Surface
hors-radar confirmée.

## Status : ✅ analyse complète + corrections appliquées (14 swaps police → `MeeshyFont.relative` / 2 glyphes de contrôle figés documentés / 1 masquage VoiceOver, 1 fichier).
Développement terminé → push branche `claude/upbeat-euler-512kep` + PR ; CI `ios-tests.yml` ;
merge dans `main` après CI verte. Voir plan `2026-07-01-plan-iteration-94i-share`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les 14 sites de `SharePickerView` ci-dessus (désormais
`MeeshyFont.relative`). Les 2 glyphes de la colonne d'envoi (`paperplane`/`checkmark` 26pt) sont
**volontairement** figés (alignement avec le `ProgressView` 26×26) — ne pas proposer leur migration.
Palette déjà tokenisée.

### Différé prioritaire iOS 95i+
- Dynamic Type surfaces hors-radar restantes : `AddParticipantSheet` (14), `ForwardPickerSheet` (8),
  `NotificationSettingsView` (10), `SupportView` (10), `CommunityLinkDetailView` (10).
- Grandes surfaces chaudes (à coordonner avec l'essaim) : `MemberManagementSection`,
  `StoryViewerView+Content`, `ConversationView+Composer`.
- Palette : audit hexes proches ; Glass `MessageOverlayMenu`.
