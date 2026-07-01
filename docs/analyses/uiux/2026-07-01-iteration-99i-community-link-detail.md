# UI/UX Analysis — Iteration 99i (2026-07-01) — CommunityLinkDetailView

## Scope
**iOS exclusivement** (suffixe `i` — Web/Android couverts par d'autres agents).
Écran **`CommunityLinkDetailView`** (détail d'un lien communautaire : carte héros avec
URL de jointure, barre d'actions copier/partager/identifier, cartes de stats, section
« INFORMATIONS » identifiant/lien complet/date de création).

Trois axes complémentaires (au-delà du simple sweep Dynamic Type que l'essaim traite en masse) :
1. **Accessibilité — Dynamic Type** : migration des polices figées `.font(.system(size:))`
   → `MeeshyFont.relative(...)` (scaling automatique).
2. **Sélection / copie de contenu native** : `.textSelection(.enabled)` sur l'URL de jointure
   (héros) et sur les valeurs de la section INFORMATIONS (identifiant, lien complet, date) —
   geste naturel de long-press → « Copier » attendu par l'utilisateur iOS, copie la chaîne
   **complète** même si tronquée à l'écran (`.lineLimit`).
3. **VoiceOver** : masquage des glyphes décoratifs, regroupement des cartes de stats et des
   lignes info en un seul élément, trait `.isHeader` sur l'en-tête de section (rotor).

> **Contexte de contention (run 2026-07-01)** : essaim massif d'agents iOS parallèles.
> 29 PR ouvertes dont ~15 iOS (94i→98i) : SharePickerView (#1246/#1243), AffiliateView
> (#1245/#1267), MemberManagementSection (#1244), ConversationMediaGalleryView (#1271),
> SupportView (#1262), TwoFactorSetupView (#1248), NotificationSettingsView (#1252),
> AddParticipantSheet (#1256), LicensesView (#1270), UserStatsView (#1269), AboutView (#1268),
> LocationPickerView (#1242/#1240), ConversationPreferencesTab (#1241), EffectsPickerView (#1261).
> **`CommunityLinkDetailView` n'est ciblé par AUCUNE PR ouverte** → surface disjointe choisie
> pour éviter toute collision. Numéro **99i** (au-dessus de la plus haute PR ouverte 98i).

Vérification : la CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2) sert de
build de validation (SwiftUI ne compile pas sous Linux). **Aucun test neuf** : sweep
typographique + traits a11y déclaratifs + activation de sélection native, aucune logique
modifiée (parité 55i / 74i / 86i / 90i / 93i). `MeeshyFont` et `MeeshyColors` sont résolus via
`@_exported import MeeshyUI` (`apps/ios/Meeshy/MeeshyUIExports.swift`) → aucun import à ajouter.

## Contexte / point de départ
`CommunityLinkDetailView.swift` (146 lignes) affiche le détail d'un lien communautaire.
Couleurs déjà tokenisées (`MeeshyColors.communityAccent` = `warning`, `theme.*`,
`MeeshyColors.success`/`neutral500` sémantiques). Mais **10 sites** fixaient une taille de
police absolue `.font(.system(size:))` → l'écran ignorait le réglage Dynamic Type (rupture
de la règle a11y CLAUDE.md « Use semantic fonts, NEVER use fixed font sizes for body text »).
De plus, les valeurs textuelles importantes (URL de jointure, identifiant, lien complet)
n'étaient **pas sélectionnables** : le seul moyen de les copier passait par les boutons
d'action — le geste natif de sélection iOS était absent.

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (8/10 sites)
Migration mécanique préservant `weight` et `design` (`.monospaced` de l'URL). Sites = texte
de lecture ou glyphe SF Symbol inline apparié à un texte scalable :

| Ligne | Rôle | Avant | Après |
|---|---|---|---|
| 41 | nom du lien (carte héros) | `.system(size: 20, weight: .bold)` | `relative(20, weight: .bold)` |
| 42 | URL de jointure (monospaced) | `.system(size: 12, design: .monospaced)` | `relative(12, design: .monospaced)` |
| 87 | libellé bouton d'action | `.system(size: 10, weight: .medium)` | `relative(10, weight: .medium)` |
| 108 | icône de carte de stat (inline) | `.system(size: 22)` | `relative(22)` |
| 110 | valeur de la stat | `.system(size: 22, weight: .bold)` | `relative(22, weight: .bold)` |
| 111 | libellé de la stat | `.system(size: 12)` | `relative(12)` |
| 139 | libellé de ligne info | `.system(size: 14)` | `relative(14)` |
| 141 | valeur de ligne info | `.system(size: 13, weight: .medium)` | `relative(13, weight: .medium)` |

### 2 glyphes gardés figés + commentés
| Ligne | Rôle | Décision |
|---|---|---|
| 37 | `person.3.fill` 26pt — **héros** dans un cercle fixe 60×60 | figé (doctrine 74i/86i — un glyphe scalable déborderait le cadre fixe) + `.accessibilityHidden(true)` (décoratif, le nom adjacent porte le sens). |
| 92 | icône du bouton d'action 22pt dans un badge fixe 52×52 | figé (doctrine 74i/86i). Le libellé texte du bouton (ligne 87) reste le label VoiceOver — le bouton entier est lu comme un seul élément (« Copier » / « Partager » / « Identifier »). |

### Sélection / copie de contenu native (2 sites — vraie valeur UX)
`.textSelection(.enabled)` ajouté sur les 2 emplacements où l'utilisateur veut copier une
chaîne exacte via le geste natif iOS (long-press → « Copier ») :
- **Ligne 44** : URL de jointure de la carte héros (`.lineLimit(2)`) — copie la chaîne complète.
- **Ligne 141** : valeur de chaque ligne INFORMATIONS (`.lineLimit(1)`) — identifiant, **lien
  complet** (tronqué visuellement mais copié en entier), date de création. Comble un manque
  réel : le « lien complet » n'avait aucun bouton de copie dédié et était tronqué à 1 ligne.

### VoiceOver (5 traits déclaratifs)
- `.accessibilityHidden(true)` ×2 : héros `person.3.fill` (ligne 39) + icône décorative de
  carte de stat (ligne 109) — le texte adjacent porte le sens.
- `.accessibilityElement(children: .combine)` ×2 : chaque carte de stat (ligne ~118, lit
  « 5, Membres » d'un bloc) + chaque ligne info (ligne ~146, lit « Identifiant, abc123 »).
- `.accessibilityAddTraits(.isHeader)` sur l'en-tête « INFORMATIONS » (rotor, doctrine 86i).

## Périmètre délibérément exclu (ne pas re-flagger)
- **Palette déjà tokenisée** : `communityAccent` (= `warning`), `theme.*`, `success`/`neutral500`
  sémantiques — aucun swap. La teinte communautaire = jaune de marque déterministe, à préserver.
- **2 glyphes figés** (lignes 37, 92) : figés à dessein (cadres fixes). Ne pas proposer migration.
- **Boutons d'action** : déjà labellisés par leur `Text` (VoiceOver combine icône + libellé).
  `common.copy`/`common.share`/`communityLink.identify` déjà localisés — i18n hors-scope.

## Anti-repetition check
`list_pull_requests` (2026-07-01) : 29 PR ouvertes, **aucune** ne touche
`CommunityLinkDetailView`. Distinct de `CommunityLinksView` (écran liste, Dynamic Type déjà
en place, soldé 91i `CommunityLinksView`). Surface neuve, 0 mention historique dans
`branch-tracking.md`.

## Status : ✅ analyse complète + corrections appliquées
8 swaps police → `MeeshyFont.relative` / 2 glyphes figés documentés / 2 activations
`.textSelection(.enabled)` / 5 traits VoiceOver — **1 fichier**, 0 logique / 0 clé i18n /
0 test neuf (sweep + traits déclaratifs). Force-push branche `claude/upbeat-euler-spied4` +
PR ; CI `ios-tests.yml` ; merge dans `main` après CI verte.
Voir plan `2026-07-01-plan-iteration-99i-community-link-detail`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les 8 sites de `CommunityLinkDetailView` ci-dessus
(désormais `MeeshyFont.relative`). Le héros `person.3.fill` 26pt (ligne 37) et l'icône du
bouton d'action 22pt (ligne 92) sont **volontairement** figés (cadres fixes) — ne pas proposer
migration. Sélection de contenu native activée sur URL + valeurs info. Palette déjà tokenisée.

### Différé prioritaire iOS 100i+
- Dynamic Type : `StoryViewerView+Content` (31, ⚠️ collision i18n historique #1174),
  `ConversationView+Composer` (22, lot critique prudent), `MessageOverlayMenu` (21, Glass),
  `OnboardingAnimations` (17), `ConversationView+MessageRow` (16), `ConversationListView+Overlays`
  (15), `FeedView+Attachments` (14) — une par itération, en vérifiant l'absence de PR ouverte.
- Sélection/copie de contenu : auditer les autres vues de détail (PostDetailView déjà fait,
  UserStatsView en cours #1269) pour `.textSelection(.enabled)` sur valeurs copiables.
- Glass adoption reste (`MessageOverlayMenu` via `AdaptiveGlassContainer`, lot dédié).
