# UI/UX Analysis — Iteration 95i (2026-07-01) — CommunityLinkDetailView

## Scope
**iOS exclusivement** (suffixe `i` — Web/Android couverts par d'autres agents).
Thème : **accessibilité — Dynamic Type + VoiceOver** sur `CommunityLinkDetailView`
(écran de détail d'un lien communautaire : carte d'en-tête, barre d'actions
Copier/Partager/Identifier, cartes de stats, section informations). Migration mécanique
des polices figées `.font(.system(size:))` → `MeeshyFont.relative(...)` (scaling Dynamic
Type), 1 glyphe héros gardé figé (contraint dans un cercle fixe), masquage VoiceOver des
glyphes décoratifs + regroupement des cartes stat + trait `.isHeader` sur l'en-tête section.

> **Contexte de contention** : ce run s'exécute au milieu d'un essaim d'agents iOS parallèles
> (≥12 PR iOS ouvertes au démarrage). Surfaces DÉJÀ PRISES : SupportView (#1262), AffiliateView
> (#1245/#1238/#1267), EffectsPicker (#1261), AddParticipantSheet (#1256), NotificationSettingsView
> (#1252), TwoFactorSetupView (#1248), SharePickerView (#1246/#1243), MemberManagementSection
> (#1244), LocationPickerView (#1242/#1240), ConversationPreferencesTab (#1241), NewConversationView
> (#1237). **`CommunityLinkDetailView` n'est ciblé par AUCUNE PR ouverte** → surface disjointe.
> Le numéro `94i` étant saturé (SharePicker/Affiliate/Member), cette itération prend **`95i`**
> (prochain libre) sur une surface orthogonale, garantissant zéro collision de code.

Vérification : la CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2) sert de
build de validation (SwiftUI ne compile pas sous Linux). **Aucun test neuf** : sweep typographique
pur + 5 traits a11y déclaratifs, aucune logique modifiée (parité 55i / 74i / 86i / 88i / 90i / 91i).
`MeeshyFont` déjà en scope via `import MeeshySDK` (jeu d'imports identique à la sœur `CommunityLinksView`
mergée en 91i, qui utilise `MeeshyFont.relative` avec le même set).

## Contexte / point de départ
`CommunityLinkDetailView.swift` (146 lignes) est l'écran de détail d'un lien communautaire.
Il adopte **déjà** la palette tokenisée (`MeeshyColors.communityAccent`, `.success`, `.brandPrimary`,
`theme.*`, `theme.surfaceGradient(tint:)`) et l'i18n catalogue (`String(localized:)` sur tous les
libellés visibles + boutons d'action). Mais **10 sites** fixaient une taille de police absolue
`.font(.system(size:))` — l'écran ignorait entièrement le réglage Dynamic Type (rupture de la règle
a11y CLAUDE.md « Use semantic fonts, NEVER use fixed font sizes for body text »). VoiceOver lisait
aussi les glyphes décoratifs et ne regroupait pas les cartes stat.

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (9/10 sites)
Migration mécanique préservant `weight` et `design` (`.monospaced` de l'URL de jointure). Sites =
texte de lecture ou glyphes SF Symbol appariés à un `Text` scalable, sans cadre fixe contraignant :

| Ligne | Rôle | Avant | Après |
|---|---|---|---|
| 39 | nom du lien (titre héros) | `.system(size: 20, weight: .bold)` | `relative(20, weight: .bold)` |
| 40 | URL de jointure (monospaced) | `.system(size: 12, design: .monospaced)` | `relative(12, design: .monospaced)` |
| 87 | glyphe bouton d'action (tuile 52×52) | `.system(size: 22)` | `relative(22)` |
| 89 | libellé bouton d'action | `.system(size: 10, weight: .medium)` | `relative(10, weight: .medium)` |
| 111 | glyphe carte stat (sans cadre fixe) | `.system(size: 22)` | `relative(22)` |
| 113 | valeur de la stat | `.system(size: 22, weight: .bold)` | `relative(22, weight: .bold)` |
| 114 | libellé de la stat | `.system(size: 12)` | `relative(12)` |
| 142 | libellé d'une ligne info | `.system(size: 14)` | `relative(14)` |
| 144 | valeur d'une ligne info | `.system(size: 13, weight: .medium)` | `relative(13, weight: .medium)` |

Note : les glyphes des tuiles d'action (52×52) et des cartes stat (sans cadre fixe) sont migrés —
un glyphe SF Symbol simple à 22 pt scalé reste largement dans le gabarit 52 pt (cf. sœur 91i qui
migre ses icônes de carte à 20/22 pt). Seul le héros wide `person.3.fill` du cercle 60×60 reste figé.

### 1 glyphe gardé figé + commenté
| Ligne | Rôle | Décision |
|---|---|---|
| 35 | `person.3.fill` 26 pt — **glyphe héros contraint dans un cercle fixe 60×60** | figé (doctrine 86i/91i — un glyphe *wide* scalable déborderait le cercle fixe à la plus grande taille Dynamic Type) + `.accessibilityHidden(true)` (décoratif, le nom du lien adjacent porte le sens). Commentaire d'exception ajouté. |

### VoiceOver — 5 traits déclaratifs
- `.accessibilityHidden(true)` sur les 3 glyphes purement décoratifs appariés à un texte : héros
  d'en-tête (l. 37, le nom porte le sens), glyphe de bouton d'action (l. 88, le libellé du bouton
  porte le sens), glyphe de carte stat (l. 112, la valeur + libellé portent le sens).
- `.accessibilityElement(children: .combine)` sur `communityStatCard` (l. 122) → VoiceOver lit
  « 42, Membres » d'un seul geste au lieu de deux éléments épars (parité sœur 91i).
- `.accessibilityAddTraits(.isHeader)` sur l'en-tête « INFORMATIONS » (l. 130) → navigation par
  rotor VoiceOver (parité sœur 91i, en-têtes de section).

## Périmètre délibérément exclu (ne pas re-flagger)
- **Palette** : `MeeshyColors.communityAccent` / `.success` / `.neutral500Hex` / `.brandPrimary` +
  `theme.*` — déjà tokenisée, aucun swap (l'accent communautaire est la couleur produit attendue ici,
  pas une couleur de conversation → pas d'`accentColor` conversationnel applicable).
- **i18n** : tous les libellés/boutons visibles utilisent déjà `String(localized:defaultValue:bundle:)`.
- **Glyphe héros 60×60** (l. 35) : figé à dessein (cadre fixe).
- **Logique de copie/partage** : `UIPasteboard` + `UIActivityViewController` (avec ancrage popover
  iPad déjà correct) — hors périmètre a11y typographique.

## Anti-repetition check
`list_pull_requests` (2026-07-01) : ~12 PR iOS ouvertes, **aucune** ne touche `CommunityLinkDetailView`
(distinct de `CommunityLinksView`, soldé en 91i #1236). Surface neuve citée comme « prochain candidat »
dès le pointeur 91i (« CommunityLinkDetailView (10 sites) »). Numéro `94i` saturé → **95i** pris.

## Status : ✅ analyse complète + corrections appliquées (9 swaps police → `MeeshyFont.relative` / 1 glyphe figé documenté / 5 traits VoiceOver, 1 fichier).
Développement terminé → push branche `claude/upbeat-euler-rod5v3` ; PR vers `main` ;
CI `ios-tests.yml` ; merge dans `main` après CI verte ; suppression de la branche mergée.
Voir plan `2026-07-01-plan-iteration-95i-community-detail`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les 9 sites de `CommunityLinkDetailView` ci-dessus (désormais
`MeeshyFont.relative`). Le glyphe héros `person.3.fill` 26 pt (l. 35) est **volontairement** figé
(cercle fixe 60×60 / glyphe wide) — ne pas proposer sa migration. Palette et i18n déjà en place.

### Différé prioritaire iOS 96i+
- Dynamic Type : `MemberManagementSection` (si #1244 non mergée), `StoryViewerView+Content` (grande
  surface ~97 sites, coordonner i18n), `FeedView+Attachments` (~65), `ConversationView+Composer` (lot prudent).
- Palette : audit hexes proches-mais-non-exacts (checkmark `#4ADE80` → `success`) avec vérif visuelle.
- Glass adoption reste (`MessageOverlayMenu` via `AdaptiveGlassContainer`, lot dédié).
