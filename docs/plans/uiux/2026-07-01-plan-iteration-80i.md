# Plan — Iteration 80i (2026-07-01) — iOS a11y + affordance naturelle `CountryPicker`

## Objectif
Passe UX/accessibilité épurée sur `CountryPicker` (SDK `MeeshyUI`, écran auth
partagé par register / forgot-password / onboarding / security / profile) :
1. **Affordance naturelle** : ajouter le grabber `.presentationDragIndicator(.visible)`
   sur la sheet de sélection de pays (detents `.medium`/`.large` déjà présents mais
   sans poignée → geste de dismiss/resize non signalé, non conforme HIG).
2. **VoiceOver** : le bouton sélecteur est lu comme emoji brut (« drapeau France »)
   suivi de l'indicatif — sans label ni hint. Les lignes de liste lisent l'emoji
   verbeux puis le nom puis l'indicatif. Fournir un label propre « France, +33 » via
   un helper pur testable, masquer l'emoji décoratif redondant, ajouter un hint sur
   le sélecteur.

## Base de départ
`main` HEAD `65c6007b` (resync fait) ; branche assignée `claude/upbeat-euler-jhi6jb`.
Numéro 80i : 78i/79i déjà pris par des PRs iOS ouvertes concurrentes (#1176/#1174/#1171/#1168/#1166).

## Contention vérifiée
`list_pull_requests` (26 PRs ouvertes) : aucune ne touche `CountryPicker` /
`Auth/Components/`. Surfaces prises = PrivacySettings, story-viewer, MessageOverlayMenu,
Router, link-preview, color-tokenize, ConversationDashboard, invite-friends, 2FA,
voice-profile, Support, VoiceOver-FR, feed-comments. → surface disjointe, OK.

## Étapes
1. [x] Helper pur `CountryPicker.accessibilityLabel(for:) -> String` = « nom, indicatif »
   (emoji volontairement omis : VoiceOver le lit « drapeau de … » en doublon du nom).
2. [x] Sheet : `.presentationDragIndicator(.visible)` (à côté des detents existants).
3. [x] Bouton sélecteur : `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel(Self.accessibilityLabel(for: selectedCountry))` +
   `.accessibilityHint(auth.countryPicker.selector.hint)` + trait bouton conservé.
4. [x] Ligne de liste : `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel(Self.accessibilityLabel(for: country))` (bouton → trait auto).
5. [x] Catalogue : ajouter `auth.countryPicker.selector.hint` ×5 langues (de/en/es/fr/pt-BR),
   parité avec les 4 clés `auth.countryPicker.*` existantes.
6. [x] Test `MeeshyUITests/Accessibility/CountryPickerAccessibilityTests.swift` : helper pur.
7. [ ] Commit + push branche ; gate = CI `ios-tests.yml`.
8. [ ] Merge dans `main` après CI verte ; supprimer la branche ; MAJ branch-tracking.

## Risques / points d'attention
- **SDK purity** : `CountryPicker` est un composant atome auth réutilisable (déjà SDK),
  paramètres opaques (`Binding`), aucune décision produit → reste SDK. ✅
- **Aucune régression visuelle** : le grabber est un ajout système standard ; les labels
  a11y ne changent rien au rendu visuel. `.accessibilityElement(children:.ignore)` sur un
  `Button` conserve le trait `.isButton` (Button l'applique après le merge des enfants).
- **iOS 16 flooring** : `.presentationDragIndicator` et les modifiers a11y sont iOS 16+ → OK.

## Vérification finale
- [x] JSON `Localizable.xcstrings` valide (roundtrip Python).
- [x] Helper pur couvert par test.
- [ ] CI `ios-tests.yml` verte.
