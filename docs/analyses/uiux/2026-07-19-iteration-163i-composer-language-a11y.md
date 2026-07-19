# Itération 163i — Analyse UI/UX iOS : valeur VoiceOver des sélecteurs de langue de composition

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (composer overlay du feed)
- `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift` (`FeedComposerSheet`)
- `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift` (feuille d'édition de post)

**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-ybp86o`
**Gate** : CI `iOS Tests`

## Contexte — pivot après épuisement du sweep Dynamic Type

Le balayage Dynamic Type / VoiceOver mono-fichier (91i → 162i) est **génuinement épuisé** :
un audit repo-wide de cette itération confirme que **chaque `.font(.system(size:))` iOS restant
est un glyphe d'icône décoratif ou dans un cadre de dimension fixe, déjà figé et commenté**
(doctrine 82i/84i/86i) — vérifié sur `ReelsPlayerView` (6/6 figés), `FeedView` (7/7 figés),
`FeedView+Attachments` (14 glyphes fixes), `AttachmentLoadingTile` (5/5 figés),
`ConversationAnimatedBackground` (fond décoratif `.drawingGroup()` + `.accessibilityHidden(true)`,
composants `ConvBg*` couverts par le parent), `StoryViewerContainer`, `StoryExpiredContent`.
Le tracking 162i l'anticipait : *« Low-hanging Dynamic Type globalement épuisé — envisager pivots. »*

Cette itération pivote donc vers un **trou VoiceOver réel** repéré pendant l'audit : les **boutons
sélecteurs de langue de composition** annoncent (au mieux) un libellé, mais **jamais la langue
actuellement sélectionnée** comme *valeur* d'accessibilité. Règle CLAUDE.md violée :
*« Use `.accessibilityValue()` for stateful controls. »*

## Constat (avant 163i)

Trois sélecteurs de langue, tous des contrôles à état (la langue choisie est un état visible via
un `Text`), n'exposaient pas cet état à VoiceOver :

1. **`FeedView` (composer overlay)** — `.accessibilityLabel("Langue du post")` présent, **mais
   `.accessibilityValue` absent** → VoiceOver dit « Langue du post, bouton » sans jamais nommer la
   langue courante.
2. **`FeedComposerSheet` (`FeedView+Attachments`)** — **ni label ni value** → VoiceOver lit la
   composition brute du bouton (glyphe `globe` + texte de langue), fragmentée et sans rôle clair.
3. **`EditPostSheet` (ligne « Langue du contenu »)** — **ni label ni value** → VoiceOver concatène
   `globe` + « Langue du contenu » + drapeau + nom + `chevron.right`, verbeux et bruité par le
   chevron décoratif.

## Corrections appliquées (3 fichiers, 0 logique, 0 clé i18n neuve)

Ajouts **purement additifs** de modificateurs d'accessibilité, réutilisant **des clés i18n déjà
présentes** (aucune édition `.xcstrings` → aucun risque de collision #1174) :

1. **`FeedView.swift`** : `+ .accessibilityValue(composerLanguageDisplayName)` sous le
   `.accessibilityLabel` existant. VoiceOver : « Langue du post, Français ».
2. **`FeedView+Attachments.swift`** : `+ .accessibilityLabel("Langue du post")` (même clé que
   site 1) `+ .accessibilityValue(composerLanguageDisplayName)`. Nomme le contrôle et annonce la
   valeur au lieu de fragmenter glyphe + texte.
3. **`EditPostSheet.swift`** : `+ .accessibilityElement(children: .ignore)` (fusionne la rangée en
   un seul élément, retire le chevron décoratif du parcours) `+ .accessibilityLabel(clé
   `feed.post.edit.language` existante) + .accessibilityValue(selectedLanguageInfo?.name ?? clé
   `feed.post.edit.language.auto` existante)`. VoiceOver : « Langue du contenu, Français » / « …, Auto ».

## Sécurité de compilation (aucun build iOS local disponible)

- `composerLanguageDisplayName: String` existe sur `FeedView` (l.418) **et** `FeedComposerSheet`
  (`FeedView+Attachments` l.578) → `.accessibilityValue(_:)` (overload `StringProtocol`) compile.
- `LanguageInfo.name: String` (SDK `LanguageData.swift`) → `selectedLanguageInfo?.name` est
  `String?`, coalescé avec un `String` → `String`. Compile.
- Aucune propriété `private` cross-file touchée (piège pbxproj évité) ; tous les symboles
  référencés sont déjà utilisés dans le même scope juste au-dessus.

## Périmètre / non-régression

- **3 fichiers, +14 lignes, 0 suppression**, 0 logique / 0 mutation d'état / 0 clé i18n neuve /
  0 test neuf. `import MeeshyUI` déjà présent partout (`MeeshyFont` non touché).
- Aucun test n'assère sur la sémantique d'accessibilité de ces boutons → 0 régression.
- Palette / Dynamic Type inchangés (aucune police touchée).

## Écartés (déjà corrects — hors scope)

- **`AudioPostComposerView`** : sélecteur en rangée de chips (pattern distinct), `globe` déjà
  `.accessibilityHidden(true)`, chaque chip porte son propre état sélectionné → OK.
- **`GlobalSearchView`, `OnboardingStepViews`** : `globe` non-sélecteur de langue de composition.

## Statut

**TERMINÉE** — les 3 sélecteurs de langue de composition annoncent désormais leur langue courante
comme valeur VoiceOver. **Ne plus re-flagger ces boutons.** Aspect distinct du Dynamic Type
soldé en 100i (`EditPostSheet`) — ne re-touche aucune police.

---

## Analyses corrigées & complètes (ne pas reproduire)

- Sélecteurs de langue de composition (`FeedView`, `FeedComposerSheet`, `EditPostSheet`) —
  `.accessibilityValue` de la langue courante ajouté (+ label/`children:.ignore` là où manquants),
  clés i18n existantes réutilisées, 0 logique. **SOLDÉ 163i.**
- Confirmation d'audit : sweep Dynamic Type iOS **épuisé** — tout `.system(size:)` restant est un
  glyphe figé décoratif/cadre-fixe déjà commenté (doctrine 82i/84i/86i). Pivots futurs : dédup
  design-system (ex. la toolbar composer 6-boutons dupliquée `FeedView` ↔ `FeedComposerSheet`,
  nécessite plumbing de bindings), adoption composants natifs, i18n clés hardcodées.
