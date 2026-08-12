# UI/UX Analysis — Iteration 93i (2026-07-01) — LocationPickerView

## Scope
**iOS exclusivement** (suffixe `i` — Web/Android couverts par d'autres agents).
Thème : **accessibilité — Dynamic Type** sur `LocationPickerView` (feuille « Choisir un lieu » :
carte MapKit + recherche + carte d'action flottante). Migration mécanique des polices figées
`.font(.system(size:))` vers `MeeshyFont.relative(...)` (scaling Dynamic Type), avec 2 glyphes
gardés figés (marqueur d'annotation carte + glyphe contraint dans un badge fixe) et masquage
VoiceOver des glyphes décoratifs appariés à un texte.

> **Contexte de contention** : ce run s'exécute au milieu d'un essaim d'agents iOS parallèles.
> `90i` réel = `MagicLinkView` (mergé sur `main` via #1224). `91i`/`92i` saturés (AffiliateView
> ×4 : #1233/#1234/#1235/#1238 ; NewConversationView #1237 ; CommunityLinksView #1236 ;
> DataExportView #1231). **`LocationPickerView` n'est ciblé par AUCUNE PR ouverte** → surface
> disjointe choisie pour éviter toute collision. Numéro **93i** (prochain libre au-dessus de 92i).

Vérification : la CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2) sert de
build de validation (SwiftUI ne compile pas sous Linux). **Aucun test neuf** : sweep typographique
pur + 3 traits a11y déclaratifs, aucune logique modifiée (parité 55i / 74i / 86i / 88i / 90i).
`MeeshyFont` déjà en scope (`import MeeshyUI` ligne 5).

## Contexte / point de départ
`LocationPickerView.swift` (392 lignes) est le sélecteur de lieu (partage de position) : carte
MapKit adaptative (`AdaptiveInteractiveMap`), barre de recherche flottante, liste de résultats,
carte d'action basse (adresse géocodée + boutons « Ma position » / « Confirmer »). L'écran adopte
**déjà** iOS 26 Liquid Glass (`.adaptiveGlass` sur les 3 surfaces flottantes, avec fallback
`.ultraThinMaterial` géré par le wrapper Compatibility du SDK — style préservé). Couleurs déjà
tokenisées (accent déterministe `Color(hex: accentColor)` reçu en paramètre + `theme.*`). Mais
**17 sites** fixaient une taille de police absolue `.font(.system(size:))` — l'écran ignorait
entièrement le réglage Dynamic Type (rupture de la règle a11y CLAUDE.md « Use semantic fonts,
NEVER use fixed font sizes for body text »).

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (15/17 sites)
Migration mécanique préservant `weight` et `design` (`.monospaced` des coordonnées). Sites = texte
de lecture ou glyphes SF Symbol inline appariés à un `Text`/`TextField` scalable :

| Ligne | Rôle | Avant | Après |
|---|---|---|---|
| 39 | titre toolbar « Choisir un lieu » | `.system(size: 16, weight: .bold)` | `relative(16, weight: .bold)` |
| 79 | loupe recherche (inline) | `.system(size: 14, weight: .medium)` | `relative(14, weight: .medium)` |
| 84 | champ recherche | `.system(size: 14)` | `relative(14)` |
| 95 | croix d'effacement recherche | `.system(size: 14)` | `relative(14)` |
| 148 | nom du résultat | `.system(size: 13, weight: .medium)` | `relative(13, weight: .medium)` |
| 154 | sous-titre du résultat | `.system(size: 11)` | `relative(11)` |
| 183 | icône `location.fill` carte basse (inline) | `.system(size: 14, weight: .semibold)` | `relative(14, weight: .semibold)` |
| 190 | adresse géocodée | `.system(size: 13, weight: .medium)` | `relative(13, weight: .medium)` |
| 198 | texte « Recherche de l'adresse… » | `.system(size: 12)` | `relative(12)` |
| 203 | texte « Déplacez la carte… » | `.system(size: 12)` | `relative(12)` |
| 209 | coordonnées (monospaced) | `.system(size: 10, weight: .medium, design: .monospaced)` | `relative(10, weight: .medium, design: .monospaced)` |
| 228 | icône `location.circle.fill` (inline) | `.system(size: 14)` | `relative(14)` |
| 230 | libellé « Ma position » | `.system(size: 12, weight: .semibold)` | `relative(12, weight: .semibold)` |
| 253 | glyphe `checkmark` (inline) | `.system(size: 14, weight: .bold)` | `relative(14, weight: .bold)` |
| 255 | libellé « Confirmer » | `.system(size: 13, weight: .bold)` | `relative(13, weight: .bold)` |

### 2 glyphes gardés figés + commentés
| Ligne | Rôle | Décision |
|---|---|---|
| 67 | `mappin.circle.fill` 36pt — **marqueur d'annotation carte** | figé : c'est un overlay MapKit hors flux Dynamic Type ; un pin qui grandit avec le réglage texte casserait l'alignement sur la carte. Commentaire d'exception ajouté. |
| 140 | `mappin` 12pt **contraint dans un badge 28×28 fixe** | figé (doctrine 86i — un glyphe scalable déborderait le cadre fixe) + `.accessibilityHidden(true)` (décoratif, le nom du lieu adjacent porte le sens). |

### VoiceOver — glyphes décoratifs masqués (3 traits)
`.accessibilityHidden(true)` sur les glyphes purement décoratifs appariés à un texte : loupe de
recherche (ligne 81, le champ porte le placeholder), `location.fill` de la carte basse (ligne 185,
l'adresse adjacente porte le sens), `mappin` badge (ligne 144). Traits déclaratifs, aucun impact
visuel. La croix d'effacement (ligne 95) conservait déjà son `.accessibilityLabel`.

## Périmètre délibérément exclu (ne pas re-flagger)
- **Liquid Glass déjà en place** : les 3 `.adaptiveGlass` (barre de recherche, dropdown résultats,
  carte basse) sont **volontairement neutres** (chrome, pas contenu) — commentaires in-situ
  existants. Rien à changer.
- **Palette** : accent déterministe `Color(hex: accentColor)` (règle « conversation-context
  components MUST use accentColor ») + `theme.*` — déjà tokenisée, aucun swap.
- **Marqueur carte 36pt** (ligne 67) : figé à dessein (overlay MapKit).

## Anti-repetition check
`list_pull_requests` (2026-07-01) : 8 PR iOS ouvertes, **aucune** ne touche `LocationPickerView`
(#1231 DataExport, #1233/34/35/38 Affiliate, #1236 CommunityLinks, #1237 NewConversation). Mon
ancienne PR #1225 (MagicLinkView 90i) est devenue `dirty`/redondante — `MagicLinkView` a été mergé
sur `main` par un agent parallèle (#1224) → branche `claude/upbeat-euler-512kep` repurposée sur
cette surface neuve. `LocationPickerView` est cité comme cible « 93i+ » par #1238 mais n'a encore
aucune PR.

## Status : ✅ analyse complète + corrections appliquées (15 swaps police → `MeeshyFont.relative` / 2 glyphes figés documentés / 3 masquages VoiceOver, 1 fichier).
Développement terminé → force-push branche `claude/upbeat-euler-512kep` (remplace le commit 90i
superseded) + PR #1225 repurposée ; CI `ios-tests.yml` ; merge dans `main` après CI verte.
Voir plan `2026-07-01-plan-iteration-93i-location`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les 15 sites de `LocationPickerView` ci-dessus (désormais
`MeeshyFont.relative`). Le marqueur carte `mappin.circle.fill` 36pt (ligne 67) et le glyphe `mappin`
du badge 28×28 (ligne 140) sont **volontairement** figés (overlay MapKit / cadre fixe) — ne pas
proposer leur migration. Liquid Glass et palette déjà en place.

### Différé prioritaire iOS 94i+
- Dynamic Type : `MemberManagementSection`, `StoryViewerView+Content` (grande surface, coordonner
  i18n), `ConversationView+Composer` (lot prudent = composer critique).
- Palette : audit hexes proches-mais-non-exacts (`MagicLinkView` `Color(hex:"8B5CF6")` → `indigo`,
  checkmark `#4ADE80` → `success`) avec vérification visuelle.
- Glass adoption reste (`MessageOverlayMenu` via `AdaptiveGlassContainer`, lot dédié).
