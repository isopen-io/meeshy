# Audit UI/UX iOS — 2026-06-08

**Périmètre :** `apps/ios/Meeshy/Features/Main/` — Views, Components, Navigation  
**Basé sur :** main @ d3330ca (post-merge PR #336 Bandwidth Sprint D1–D4)  
**Prochaine itération :** voir `docs/plans/uiux/2026-06-08-iteration-01.md`

---

## Résumé Exécutif

| Priorité | Catégorie | Nb |
|----------|-----------|-----|
| P0 | Accessibilité critique | 2 |
| P1 | Dynamic Type / Dark Mode / i18n | 8 |
| P2 | Polish, déeplinks, animations | 13 |

---

## P0 — Bloquant UX / Accessibilité Critique

### P0-1 : ContactCardView — Images interactives sans accessibilityLabel
- **Fichier :** `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift` lignes ~37, 57, 65, 80
- **Problème :** `Image(systemName: "person.crop.circle.fill")`, `Image(systemName: "phone.fill")`, `Image(systemName: "envelope.fill")`, `Image(systemName: "chevron.right")` sans `.accessibilityLabel()`
- **Impact :** Les utilisateurs VoiceOver ne savent pas à quoi servent ces boutons
- **Fix :** Ajouter `.accessibilityLabel("Appeler")`, `.accessibilityLabel("Envoyer un message")`, etc.

### P0-2 : Router.swift — Titres de navigation codés en dur en français
- **Fichier :** `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` lignes 59–103
- **Problème :** `"Parametres"`, `"Profil"`, `"Contacts"`, `"Liens"` hardcodés, ne passent pas par `String(localized:)`
- **Impact :** Les utilisateurs dans d'autres langues (EN, DE, ES, PT) voient des titres en français dans toute la navigation
- **Fix :** Wrapper toutes les chaînes avec `String(localized: "nav.settings", defaultValue: "Parametres", bundle: .main)`

---

## P1 — Friction Significative

### P1-1 : Dynamic Type — Tailles fixes dans BubbleMetaBadges
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift`
- **Lignes :** 28 (8pt), 32 (9pt), 38 (9pt), 69 (11pt), 100 (10pt)
- **Problème :** 5+ tailles `system(size:)` fixes — ne respectent pas l'Accessibility Text Size
- **Fix :** Remplacer par `.caption2`, `.caption`, `.footnote` (styles sémantiques SwiftUI)

### P1-2 : Dynamic Type — ConversationDashboardView labels analytics
- **Fichier :** `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift`
- **Lignes :** 102 (11pt heavy), 144 (13pt)
- **Fix :** `.caption` pour le score de santé, `.footnote` pour l'analyse

### P1-3 : Dynamic Type — MessageComposer input field
- **Fichier :** `apps/ios/Meeshy/Features/Main/Components/MessageComposer.swift` ligne 92
- **Problème :** `.font(.system(size: 16))` hardcodé — le champ de saisie ne s'adapte pas
- **Fix :** Remplacer par `.font(.body)`

### P1-4 : Dark Mode — AudioFullscreenView
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
- **Problème :** `Color.black.ignoresSafeArea()` et `Color.white.opacity(X)` sans adaptation colorScheme
- **Note :** Un fond sombre est cohérent pour un lecteur audio — mais les boutons blancs deviennent illisibles si l'utilisateur force le mode clair (Accessibility > Display > Light Appearance)
- **Fix :** Utiliser `.background(.black)` + `foregroundStyle(.white)` encapsulé dans `colorScheme == .dark ? .white : .label`

### P1-5 : Dark Mode — ConversationListHelpers shadow
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`
- **Problème :** `.shadow(color: Color.black.opacity(0.7), ...)` — ombre trop lourde en light mode, disparaît visuellement en dark mode
- **Fix :** `@Environment(\.colorScheme) var colorScheme` puis adapter l'opacité

### P1-6 : Dark Mode — ConversationMediaGalleryView
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`
- **Problème :** `Color.white.opacity(0.2)` sur fond noir — contraste insuffisant en light mode
- **Fix :** Utiliser `Color.primary.opacity(0.15)` qui s'adapte automatiquement

### P1-7 : Accessibilité — StoryViewerView réactions
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift` ligne ~107
- **Problème :** `StoryActionButton(icon: "heart.fill", label: "\(storyReactionCount)")` — le label annonce un nombre, pas une action
- **Fix :** `.accessibilityLabel("Réagir à la story")` + `.accessibilityValue("\(storyReactionCount) réactions")`

### P1-8 : Copy/paste — Texte traduit (BubbleSecondaryContent)
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift`
- **Problème :** Vérifier que `.textSelection(.enabled)` est appliqué au contenu traduit (secondaire)
- **Impact :** Utilisateurs ne peuvent pas copier la traduction

---

## P2 — Polish / Améliorations

### P2-1 : i18n — BubbleMetaBadges interpolation de chaînes
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift` ligne 99
- `"Transf. de \(senderName) \u{2022} \(conversationName)"` — pas de format localisé
- **Fix :** Utiliser `String(localized: "bubble.forwarded_from %@ %@", defaultValue: "Transf. de %@ • %@")`

### P2-2 : Accessibilité — BubbleExpandableText bouton "Afficher moins"
- **Fichier :** `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift` ligne ~100
- Le bouton show-less manque d'`.accessibilityLabel("Afficher moins")`

### P2-3 : Accessibilité — MessageComposer placeholder
- **Fichier :** `apps/ios/Meeshy/Features/Main/Components/MessageComposer.swift` ligne ~81
- Le placeholder `Text(...)` n'est pas lié au `TextField` — certains AT ratent l'annonce
- **Fix :** Ajouter `.accessibilityLabel(String(localized: "composer.accessibility.hint"))` sur le ZStack

### P2-4 : Layout — ConversationDashboardView padding incohérent
- **Fichier :** `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift` ligne 68
- `.padding(.horizontal, 20)` vs standard `.padding(.horizontal, 16)` du reste de l'app

### P2-5 : Layout — Tap targets 28pt
- **Fichier :** `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- `.frame(width: 28, height: 28)` sans `contentShape(Rectangle())` → inférieur au minimum Apple 44pt
- **Fix :** `.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())`

### P2-6 : DeepLinks — Cas manquants
- **Fichier :** `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`
- Manquent : `.tag(<hashtag>)`, `.search(query:)`, `.community(id:)` dans l'enum `DeepLinkDestination`

### P2-7 : Motion Accessibility — ConversationDashboardView
- Animations `.staggerIn()` sans vérification `@Environment(\.accessibilityReduceMotion)`

### P2-8 : Motion Accessibility — StoryViewerView+Sidebar
- Animations rapides sans guard `reduce-motion`

### P2-9 : Safe Area — ConversationMediaGalleryView
- Vérifier que le bouton fermer n'est pas masqué par l'indicateur home sur iPhone 12+

### P2-10 : Copy — ProfileView bio/status
- Le texte bio/status du profil devrait avoir `.textSelection(.enabled)` pour permettre le partage de handles

### P2-11 : Copy — CrashReportSheet
- Le texte d'erreur dans le rapport de crash devrait être copiable pour faciliter le support

### P2-12 : Dark Mode — CallView.swift
- `Color.white` hardcodé ligne 132 pour bouton minimize — peut être illisible avec Light Appearance forcé
- **Note :** L'interface d'appel est intentionnellement sombre (pattern FaceTime), vérifier la lisibilité en mode clair

### P2-13 : Dark Mode — ConversationDashboardView accent colors
- `Color(hex: accentColor)` sans vérification de contraste par rapport à la luminosité du fond
- Peut échouer en light mode avec des accents clairs

---

## Éléments Bien Implémentés (à préserver)

- `.textSelection(.enabled)` dans `BubbleExpandableText.swift` ✓
- `@Environment(\.accessibilityReduceMotion)` dans `CallView.swift` ✓
- Xcstrings complet avec 4 langues (en, de, es, pt-BR) ✓
- Labels accessibilité sur tous les boutons de `MessageComposer.swift` ✓
- `DeepLinkRouter.swift` complet pour les cas principaux ✓
- Animations spring cohérentes (response: 0.3–0.5, damping: 0.8) ✓
