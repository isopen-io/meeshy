# Meeshy iOS — Audit d'accessibilité exhaustif & plan de remédiation directif

> **Destinataire** : agent IA chargé d'appliquer les corrections.
> **Périmètre** : application iOS SwiftUI (`apps/ios/Meeshy`, 344 fichiers) + cible UI du SDK (`packages/MeeshySDK/Sources/MeeshyUI`, 229 fichiers UI).
> **Méthode** : audit écran par écran (VoiceOver, Dynamic Type, Reduce Motion, contraste/couleur, cibles tactiles, annonces, identifiants de test) + analyse transversale quantifiée.
> **Date** : 2026-06.

## Comment utiliser ce document

1. **Lis d'abord la Partie 1 (chantiers transversaux).** Elle crée l'infrastructure partagée (`Accessibility.swift`, typographie Dynamic Type, helper Reduce Motion, `MeeshyStatusDot`, `MeeshyA11yID`, annonces VoiceOver). **Ces fondations doivent être posées AVANT les corrections par écran** : la majorité des défauts par écran se corrigent ensuite en appliquant ces helpers.
2. **Respecte la TDD du projet** (cf. `CLAUDE.md`) : chaque nouveau helper/service définit un protocole et des tests AVANT l'implémentation. Étends les tests d'accessibilité existants (voir §1.7).
3. **Sévérités** :
   - **P0** = bloquant : un utilisateur VoiceOver / Dynamic Type / Reduce Motion ne peut PAS accomplir une tâche cœur, ou risque vestibulaire.
   - **P1** = majeur : friction forte, état/information inaccessible, échec silencieux.
   - **P2** = finition / bonne pratique / identifiants de test.
4. Chaque entrée donne `fichier:ligne` — **vérifie les numéros de ligne** avant d'éditer (le code a pu bouger).
5. `./apps/ios/meeshy.sh test` DOIT passer avant chaque commit.

---

## Synthèse exécutive (constats macro)

| Indicateur | Mesure | Verdict |
|---|---|---|
| `accessibilityIdentifier` dans tout le code (app + SDK) | **0** | Aucun ancrage de test UI/E2E |
| `.font(.system(size:))` à taille fixe | **~2 969** (2 146 app + 823 SDK, 255 fichiers) | Dynamic Type quasi désactivé partout |
| Styles de texte dynamiques (`.body`, `.caption`…) | **45** | < 2 % des cas |
| Fichiers utilisant `@ScaledMetric`/`UIFontMetrics` | **4** | Pattern correct quasi inexistant |
| `minimumScaleFactor` | **7 fichiers** | Risque de troncature massif |
| Fichiers gérant Reduce Motion | **6** | vs **909** appels `withAnimation`/`.animation` (165 fichiers) + **17** `repeatForever` non gardés |
| `UIAccessibility.post` / `AccessibilityNotification` | **0 dans la feature Main** | Aucune annonce VoiceOver (messages, appels, toasts, erreurs) |
| Cibles tactiles `.frame(width/height:)` ≤ 39 pt | **111 (54 fichiers SDK)** + nombreux côté app | Sous le minimum 44×44 pt |
| Helper/fichier d'accessibilité partagé | **inexistant** | `MeeshyFont` n'est PAS Dynamic-Type-aware |

**Verdict global** : l'app a des poches d'excellence (voir §6 « Patterns de référence ») mais l'accessibilité est appliquée de façon très inégale. Quatre défauts systémiques dominent : (1) Dynamic Type cassé, (2) Reduce Motion ignoré, (3) zéro annonce VoiceOver, (4) zéro identifiant de test. Les écrans les plus critiques à corriger en priorité : **Conversation (bulle `.combine`)**, **Stories (auto-avance vs VoiceOver)**, **Toasts (feedback invisible)**, **Appels (sécurité)**.

---

# PARTIE 1 — CHANTIERS TRANSVERSAUX (à faire en premier)

Ces chantiers sont le point de levier : ils créent l'infrastructure que les corrections par écran réutilisent. Crée un fichier central **`packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift`** regroupant les helpers ci-dessous (+ un `MeeshyA11yID` enum).

## 1.1 — Dynamic Type (P1, systémique, ~2 969 occurrences)

**Problème** : presque tout le texte utilise `.font(.system(size: N))` en points fixes. `MeeshyFont` (`DesignTokens.swift:28-36`) n'est qu'une table de `CGFloat` constants — l'utiliser produit toujours une taille fixe.

**Pires foyers (densité d'occurrences)** :
`MessageDetailSheet.swift` (109), `ConversationInfoSheet.swift` (52), `PostDetailView.swift` (49), `FeedPostCard.swift` (43), `ConversationDashboardView.swift` (43), `GlobalSearchView.swift` (32), `ProfileView.swift` (32), `SettingsView.swift` (31), `AudioPostComposerView.swift` (27), `MessageInfoSheet.swift` (27), `CreateShareLinkView.swift` (24), `CallView.swift` (23), `UniversalComposerBar.swift` (24) ; côté SDK : `Profile/UserProfileSheet.swift` (33), `Media/MeeshyAudioEditorView.swift` (31), `Conversation/ConversationSettingsView.swift` (29), `Community/CommunityCreateView.swift` (28), `Community/CommunityDetailView.swift` (28).

**Directive** :
1. Transforme `MeeshyFont` en API Dynamic-Type-aware. Ajoute dans `DesignTokens.swift` :
   ```swift
   extension MeeshyFont {
       /// Police scalable mappée sur un TextStyle de référence.
       static func scaled(_ size: CGFloat, relativeTo style: Font.TextStyle = .body,
                          weight: Font.Weight = .regular, design: Font.Design = .default) -> Font {
           .system(size: size, weight: weight, design: design) // SwiftUI applique relativeTo via le modificateur ci-dessous
       }
   }
   ```
   Pour un vrai scaling, privilégie les **text styles relatifs** au lieu des points fixes. Mapping recommandé des buckets existants :
   `caption(10)→.caption2`, `footnote(11)→.caption`, `subhead(13)→.subheadline`, `body(15)→.body`, `headline(17)→.headline`, `title(22)→.title2`, `largeTitle(34)→.largeTitle`.
2. **Migration en deux temps** :
   - **Texte** : remplace `.font(.system(size: MeeshyFont.bodySize))` → `.font(.body)` (ou le bucket adéquat). Pour conserver une taille custom : `.font(.system(size: 15, relativeTo: .body))` via un wrapper, ou `@ScaledMetric var bodySize = 15`.
   - **Symboles SF dans les boutons** : garde la taille fixe mais borne le layout avec `.dynamicTypeSize(...DynamicTypeSize.accessibility1)` là où la mise en page casserait.
3. Supprime/remplace les `.lineLimit(1)` sans `minimumScaleFactor` sur les libellés importants ; ajoute `.minimumScaleFactor(0.7)` ou retire la limite.
4. Surveille les conteneurs à hauteur fixe (`.frame(height:)`, `maxHeight:`) qui rognent le texte agrandi (ex. badge non-lus 24 pt, transcription `maxHeight:120`).
5. **Garde-fou** : étends `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/DynamicTypeTests.swift` en harnais réutilisable et ajoute-le au gate `meeshy.sh test`.

## 1.2 — Reduce Motion (P1, 6 fichiers seulement le gèrent)

**Problème** : seuls `StoryViewerView+Content`, `IncomingCallView`, `FeedCommentsSheet`, `CallView`, `UniversalComposerBar(+Recording)` lisent `accessibilityReduceMotion`. **17 fichiers** utilisent `repeatForever` sans garde.

**Pires foyers non gardés** : `Primitives/SkeletonView.swift` (shimmer), `Primitives/AnimatedLogoView.swift` (respiration), `Conversation/ConversationScrollControlsView.swift` (points de frappe/recherche), `Features/Main/Views/ConversationAnimatedBackground.swift` (10 animations), `ConversationBackgroundComponents.swift`, `Auth/Onboarding/OnboardingAnimations.swift` (15 animations), `Auth/Onboarding/OnboardingView.swift` (orbes/icônes), `Components/MessageEffectModifiers.swift`, `Bubble/BubbleMetaBadges.swift`, `Bubble/BubbleReactionsOverlay.swift` (comète), `RootViewComponents.swift`, `MessageListViewController.swift`, `LoginView.swift`, story canvas (`StoryViewerView+Canvas`), `ConnectionBanner.swift`, `MiniAudioPlayerBar.swift`, `AnimatedWaveformBar`/`AudioLevelBar` (`ConversationMediaViews.swift`), `UploadProgressBar.swift`, `EmojiReactionPicker.swift` (vague).

**Directive** :
1. Ajoute dans `Accessibility.swift` :
   ```swift
   public extension View {
       /// Désactive l'animation quand Reduce Motion est actif.
       func reduceMotionAware<V: Equatable>(_ animation: Animation?, value: V) -> some View {
           modifier(ReduceMotionAnimation(animation: animation, value: AnyHashable(value)))
       }
   }
   private struct ReduceMotionAnimation: ViewModifier {
       @Environment(\.accessibilityReduceMotion) private var reduceMotion
       let animation: Animation?; let value: AnyHashable
       func body(content: Content) -> some View {
           content.animation(reduceMotion ? nil : animation, value: value)
       }
   }
   ```
2. **Règle pour les animations décoratives en boucle** (fonds animés, shimmer, logo, points de frappe, comète de réaction, effets de message) : sous Reduce Motion, **arrête complètement la boucle** (état final statique), ne te contente pas de la raccourcir. Injecte `@Environment(\.accessibilityReduceMotion) private var reduceMotion` et court-circuite `startAnimations()`/`startAnimating()`.
3. **Gate de revue** : tout `repeatForever`/`matchedGeometryEffect` nouveau doit lire `reduceMotion`.

## 1.3 — Annonces VoiceOver (P0, 0 dans la feature Main)

**Problème** : `grep UIAccessibility.post / AccessibilityNotification` → **0 résultat** dans toute la feature Main. Conséquences : nouveau message reçu non annoncé, transitions envoi→envoyé→lu silencieuses, échecs d'envoi silencieux, frappe non annoncée, toasts/erreurs/succès invisibles, appel entrant n'annonce pas l'appelant, etc.

**Directive** :
1. Ajoute un helper centralisé dans `Accessibility.swift` :
   ```swift
   public enum A11yAnnounce {
       public static func say(_ message: String) {
           guard UIAccessibility.isVoiceOverRunning else { return }
           UIAccessibility.post(notification: .announcement, argument: AttributedString(message))
       }
       public static func screenChanged(focus: Any? = nil, _ message: String? = nil) {
           UIAccessibility.post(notification: .screenChanged, argument: focus ?? message as Any)
       }
   }
   ```
2. **Points d'appel obligatoires** (chacun détaillé dans les sections par écran) :
   - `ConversationViewModel` : message reçu en foreground → `A11yAnnounce.say("\(sender): \(preview)")` ; échec d'envoi → annonce.
   - `ToastManager` (toutes les entrées `show/showError/showSuccess/showInAppNotification`) → annonce du message (cf. §1.6).
   - Appel entrant (`IncomingCallView.onAppear`) → `screenChanged("Appel entrant de \(caller)")`.
   - Perte/reprise de connexion (`ConnectionBanner`, `OfflineBanner`).
   - Succès/erreur de tout formulaire async (login, vérif email, magic link, reset MDP, save profil, export, suppression compte, 2FA, join flow, publication post/story).
   - Transitions de phase (vérif email réussie, magic link envoyé, join réussi/échoué).

## 1.4 — Identifiants d'accessibilité pour les tests (P1, 0 partout)

**Directive** : crée un `enum MeeshyA11yID: String` dans le SDK (source unique partagée app + UITests), puis applique `.accessibilityIdentifier(MeeshyA11yID.x.rawValue)` au minimum sur :
1. Bouton login (`LoginView`) — `login.submit`
2. Bouton envoi composer (`UniversalComposerBar`) — `composer.send`
3. Champ composer — `composer.textField`
4. Liste de messages (`MessageListViewController`/`ConversationView`) — `conversation.messageList`
5. Bouton scroll-to-bottom — `conversation.scrollToBottom`
6. Cellule de conversation (`ThemedConversationRow`) — `conversation.row`
7. Conteneur de toast (`MeeshyApp.swift:96`) — `toast.container`
8. Submit JoinFlow (`AnonymousJoinFormView`) — `join.submit`
9. Submit création communauté (`CommunityCreateView`) — `community.create.submit`
10. Boutons d'action d'appel (mute/speaker/end/answer/decline) — `call.control.*` (sécurité-critique)

## 1.5 — Cibles tactiles < 44×44 pt (P1, 111+ occurrences)

**Directive** : ajoute dans `Accessibility.swift` :
```swift
public extension View {
    func meeshyTapTarget(_ minSize: CGFloat = 44) -> some View {
        frame(minWidth: minSize, minHeight: minSize).contentShape(Rectangle())
    }
}
```
Applique-le à tout bouton-icône / élément tappable. Garde le glyphe visuel petit, garantis une zone de toucher de 44×44. **Pires foyers** (détaillés par écran) : contrôles `FloatingCallPillView` (36 pt, raccrochage !), accept/refus `RequestsTab`/`FriendRequestListView`/`ConnectionActionView` (28-36 pt), `MiniAudioPlayerBar` (24-32 pt), cancel `AttachmentLoadingTile` (18 pt), ellipsis `CommunityMembersView` (32 pt), close `JoinFlowSheet` (28 pt), boutons jour DnD `NotificationSettingsView` (28 pt), révocation session `ActiveSessionsView` (20 pt), pills de réaction de bulle (22 pt), boutons header de liste (~22 pt).

## 1.6 — Toasts & feedback transitoire (P0 — le défaut le plus impactant)

`ToastManager` + `ToastView` sont le canal principal de feedback succès/erreur/notification in-app, et ils sont **totalement invisibles à VoiceOver**.

- **`ToastManager.swift:145-152` + `ToastView.swift:51-88`** — P0 — Le toast est un `View` en `.overlay` (`MeeshyApp.swift:94-107`), jamais annoncé. **FIX** : dans chaque `ToastManager.show*`, après avoir posé `currentToast`, `A11yAnnounce.say(message)` (ou `.screenChanged` si tappable). Centralise pour couvrir `show/showError/showSuccess/showInAppNotification`.
- **`ToastManager.swift:145` (durée 3 s fixe)** — P0 — Trop court pour VoiceOver (toast 2 lignes). **FIX** : si `UIAccessibility.isVoiceOverRunning`, durée ≥ 6 s (ou calculée selon longueur), comme les toasts tappables (6 s, lignes 58/108).
- **`ToastView.swift:60,71`** — P1 — Icône + chevron exposés séparément. **FIX** : `.accessibilityElement(children:.combine)` + `.accessibilityLabel(toast.message)` + `.isButton` si tappable ; `.accessibilityHidden(true)` sur icône/chevron.
- **`NotificationToastView.swift:55-114`** — P0 — Même classe de défaut : non annoncé, non groupé. **FIX** : combine `authorName`+`conversationLabel`+`bodyText`, `.isButton`, annonce à l'apparition.
- **`SkeletonView.swift:52-158`** — P1 — Aucun skeleton n'est `.accessibilityHidden(true)`, aucune annonce « Chargement ». VoiceOver lit un mur d'éléments vides au démarrage. **FIX** : `.accessibilityHidden(true)` sur tous les `Skeleton*` ; le conteneur expose un seul élément `.accessibilityLabel("Chargement")`.

## 1.7 — Couleur seule & images (P1/P2, systémique)

- **Signalisation par couleur seule** (~175 `Circle().fill`) : présence en ligne/hors ligne, non-lus, accusés de réception (envoyé/distribué/lu), erreur/succès, sélection (onglets, chips, pills). **FIX** : centralise un composant `MeeshyStatusDot` (forme + libellé VoiceOver intégré) et propage le libellé dans `MeeshyAvatar` (présence). Pour toute paire d'état : (a) indice non-coloré (forme/glyphe/texte) + (b) `.accessibilityLabel`/`.accessibilityValue`. Pour la sélection : `.accessibilityAddTraits(isSelected ? .isSelected : [])` partout.
- **Images** (~909 `Image(systemName:)`/`AsyncImage`) : (1) symboles décoratifs → `.accessibilityHidden(true)` (idéalement via `.accessibilityElement(children:.combine)` sur la ligne parente) ; (2) images signifiantes (avatars, bannières, pièces jointes image, plein écran) → `.accessibilityLabel` dérivé du nom de l'entité, posé dans les composants SDK partagés (`MeeshyAvatar`, `Cached*Image`, `FullscreenImageView`) pour propagation.

## 1.8 — Infrastructure existante à réutiliser

- **Aucun** fichier helper a11y n'existe. `MeeshyFont` n'est pas Dynamic-Type-aware.
- **361 occurrences `.accessibility*`** dans 95 fichiers — patterns connus mais appliqués inégalement.
- **Tests a11y existants à étendre** (graines du gate) :
  - `MeeshyUITests/Timeline/Accessibility/VoiceOverLabelTests.swift`
  - `MeeshyUITests/Timeline/Accessibility/DynamicTypeTests.swift`
  - `MeeshyUITests/Story/Canvas/StoryCanvasUIView_ReaderAccessibilityTests.swift`
  - `MeeshyUITests/Timeline/Views/Inspector/ClipInspector_AccessibilityKindTests.swift`

---

# PARTIE 2 — CONVERSATION / MESSAGERIE (écran cœur, priorité maximale)

> **Note d'architecture** : le fil de messages est un **`UICollectionView`** (`MessageListViewController`) qui héberge le **SwiftUI `ThemedMessageBubble`** via `UIHostingConfiguration` (`MessageListViewController.swift:447-497`). Donc : `ThemedMessageBubble` / `BubbleStandardLayout` / `Bubble/*.swift` = chemin vivant. Le composer vivant = **`UniversalComposerBar`** (pas `MessageComposer.swift`). L'audio route vers **`AudioPlayerView`** du SDK.
> **Code mort à SUPPRIMER (ne pas corriger)** : `Cells/TextBubbleCell.swift`, `MediaBubbleCell.swift`, `AudioBubbleCell.swift`, `SystemMessageCell.swift`, `ReplyCell.swift`, `DeliveryIndicatorView.swift`, `Views/OverlayMenu.swift` — non instanciés par le datasource vivant. (P2 nettoyage.)

## 2.1 — `Bubble/BubbleStandardLayout.swift`

- **`:400-401`** — VoiceOver — **P0** — La bulle entière utilise `.accessibilityElement(children: .combine)`, ce qui **aplatit tous les descendants en un seul élément non-interactif**. VoiceOver ne peut plus atteindre : bouton traduire, pills de langue, pills de réaction, bouton « ajouter réaction », bouton lecture audio, image/média, bouton « voir plus », saut vers la réponse citée. **FIX** : passe l'enveloppe externe en `.accessibilityElement(children: .contain)` et n'applique `.combine` + `.accessibilityLabel(messageAccessibilityLabel)` que sur le **sous-bloc texte+méta**.
- **`:273-310` (`messageAccessibilityLabel`)** — VoiceOver — **P1** — Ne mentionne jamais le contexte de traduction (Prisme Linguistique). Quand une traduction préférée est active, VoiceOver lit le texte traduit sans dire que c'est une traduction ni sa langue source. **FIX** : ajouter `"traduit de \(originalLangName)"` via `content.translation?.originalLangCode`.
- **`:298`** — VoiceOver — **P2** — Vérifier que `content.meta.timeString` est une heure courte localisée (pas une date verbeuse) ; préférer fournir une `Date` formatée relative à VoiceOver.

## 2.2 — Reduce Motion dans `Bubble/` (P1) — voir §1.2
**Zéro `reduceMotion`** sous `Views/Bubble/` ni `MessageEffectModifiers.swift`. À garder : effets d'apparition (`ThemedMessageBubble.swift:222`, `MessageEffectModifiers.swift`), « comète » de réaction (`BubbleReactionsOverlay.swift:262-334` `CometPillModifier` — rendre l'état final immédiatement si `reduceMotion`), reveal flou (`BubbleStandardLayout.swift:352-353`), spring swipe-to-reply (`MessageListView.swift:193`), spinner « saving » (`BubbleMetaBadges.swift:28-30`).

## 2.3 — `Bubble/BubbleReactionsOverlay.swift`
- **`:177-239` (`pill`)** — VoiceOver — **P1** — Pill = vue avec `.onTapGesture`/`.onLongPressGesture`, **pas un `Button`**, pas de trait `.isButton`. Inopérable sous VoiceOver. **FIX** : envelopper dans `Button { onToggleReaction?(emoji) }` + `.accessibilityAddTraits(.isButton)` + `.accessibilityAction(named:"Voir les réactions") { onShowReactions?(messageId) }`.
- **`:104-148` (`addButton`)** — VoiceOver — **P1** — Idem (gestes only). **FIX** : `Button` + `.accessibilityAction(named:"Choisir un emoji")`.
- **`:177-192`** — Cibles — **P2** — Pills `.frame(height: 22)` → < 44 pt. `meeshyTapTarget()`.

## 2.4 — `Bubble/BubbleDeliveryCheck.swift`
- **`:38-69`** — VoiceOver/couleur — **P1** — Seuls `.read` (`:63`) et hors-ligne (`:32`) ont un libellé. `.sending/.clock/.slow/.sent/.delivered/.failed` n'ont **aucun** libellé — distinction par forme/couleur uniquement (`.delivered` double-check gris vs `.read` double-check indigo). **FIX** : `.accessibilityLabel` sur chaque cas : « Envoyé », « Distribué », « Envoi lent », « Échec d'envoi », « En cours d'envoi ».

## 2.5 — `Bubble/BubbleFooter.swift`
- **`:230-256` (`footerFlagPill`)** — VoiceOver — **P2** — Libellé retombe sur le code brut (« PT »), n'indique pas l'état actif. **FIX** : `.accessibilityLabel("\(name)\(isActive ? ", actif" : "")")` + `.accessibilityAddTraits(isActive ? .isSelected : [])`.
- **`:200-228` (`deliveryView`)** — P1 — Résolu par §2.4 (libellés sur tous les états).
- `:147-162` (bouton traduire) — OK.

## 2.6 — `Bubble/BubbleExpandableText.swift` & `BubbleMetaBadges.swift`
- **`BubbleExpandableText.swift:64-99`** — P1 — Boutons « voir plus/moins » corrects mais inatteignables sous `.combine` → résolu par §2.1.
- **`BubbleMetaBadges.swift:11-51` (`BubbleEditedIndicator`)** — P2 — Aucun groupement ; icône crayon + « modifié » + point d'historique lus en 3 fragments une fois en `.contain`. **FIX** : `.accessibilityElement(children:.combine)` + `.accessibilityLabel("Modifié")`. Idem libellé explicite sur `BubbleForwardedIndicator` (`:84-122`).

## 2.7 — `Components/UniversalComposerBar.swift` (composer vivant)
- **`:783-822` (`sendButton`)** — VoiceOver — **P0** — Bouton d'envoi (paperplane / checkmark en édition) **sans** label/hint/identifier. **FIX** :
  ```swift
  .accessibilityLabel(isEditMode ? "Enregistrer les modifications" : "Envoyer le message")
  .accessibilityHint(isEditMode ? "" : "Envoie le texte saisi")
  .accessibilityIdentifier(MeeshyA11yID.composerSend.rawValue)
  ```
- **`:751-761` (`toolbarButton`)** — P1 — Helper générique sans label → tous les appelants sans libellé. **FIX** : ajouter param `label: String` → `.accessibilityLabel(label)`.
- **`:702-745` (`languageSelectorPill`)** — P1 — `Menu` flag+code+chevron sans label. **FIX** : `.accessibilityLabel("Langue d'envoi: \(name)")` + `.accessibilityHint("Change la langue du message")`.
- **`:669-678` (bouton sentiment)** — P2 — Emoji décoratif focusable. Si non actionnable → `.accessibilityHidden(true)`.
- **Champ texte** — P2 — Ajouter `.accessibilityIdentifier("composer.textField")` + `.accessibilityLabel("Champ de message")`.
- **Positifs** : toggles éphémère/flou/effets (`:953-1259`) labellisés avec `.isSelected` et `dynamicTypeSize`-aware ; barre d'enregistrement (`+Recording.swift:123-227`) entièrement labellisée + `reduceMotion`. **Modèle à copier.**

## 2.8 — Audio in-bubble : `MeeshyUI/Media/AudioPlayerView.swift`
- **`:922-937` (`playButton`, contexte `.messageBubble`)** — P1 — Sans label, sans valeur d'état, sans label d'état de téléchargement. (Les players overlay-menu et plein écran SONT labellisés, `:1090-1091`,`:1147-1148`.) **FIX** : label dynamique selon `availability` (« Télécharger l'audio » / « Téléchargement en cours » / « Lire » / « Mettre en pause ») + `.accessibilityValue("\(Int(progress*100)) pour cent")`.
- **`:1057-1090` (`waveformProgress`)** — P1 — Scrubber = `Color.clear.onTapGesture`, aucun élément a11y, aucune valeur ajustable. VoiceOver ne perçoit pas la position et ne peut pas chercher. **FIX** : élément ajustable :
  ```swift
  .accessibilityElement()
  .accessibilityLabel("Position de lecture")
  .accessibilityValue("\(Int(player.progress*100)) pour cent")
  .accessibilityAdjustableAction { dir in
      let delta = dir == .increment ? 0.05 : -0.05
      player.seek(to: max(0, min(1, player.progress + delta)))
  }
  ```

## 2.9 — Menus contextuels & overlays
- **`Views/MessageContextOverlay.swift:104-155`** — P1 — Overlay long-press custom : `.isModal` posé (`:154`) mais **aucune** `.screenChanged` à l'ouverture → focus non déplacé, l'utilisateur VoiceOver ignore que le menu est apparu. **FIX** : à `phase == .open`, `A11yAnnounce.screenChanged(focus: menu)` ; au dismiss, refocus la bulle source. Ajouter aussi `.accessibilityAction(named:"Actions du message") { onLongPress() }` sur la bulle (une fois en `.contain`) car VoiceOver ne peut pas long-presser.
- **`Views/ContextActionMenu.swift:82-141`** — ✅ Exemplaire (Button + label + `.isButton` + `dynamicTypeSize` + `.contain`). **Modèle à copier.**
- **`MeeshyUI/Primitives/EmojiReactionPicker.swift:113-149`** — P2 — Boutons emoji / « + » / grille sans label. **FIX** : `.accessibilityLabel("Réagir avec \(emoji)")`, « Plus d'emojis » sur « + ». Animation vague (`WaveTileModifier`) non gardée Reduce Motion.

## 2.10 — Scroll-to-bottom, frappe, header, liste
- **`Views/ConversationView+ScrollIndicators.swift:60-71`** — P2 — Label dynamique présent (bien) ; ajouter `.accessibilityAddTraits(.isButton)` + `.accessibilityIdentifier("conversation.scrollToBottom")` ; libeller l'affordance play interne séparément.
- **`MessageListViewController.swift:332-343` (cellule de frappe)** — P1 — Indicateur de frappe non exposé `.updatesFrequently`, rien n'annonce « X écrit… ». **FIX** : `.accessibilityLabel(typingLabel)` + `.accessibilityAddTraits(.updatesFrequently)` ; annonce polie au début de frappe.
- **Header** (`ConversationView+Header.swift`, `ConversationView.swift`, `ConversationHelperViews.swift`) — globalement bon (appels `:73,95`, cadenas chiffrement `:136`, retour `ConversationHelperViews.swift:118`, recherche `:1396`, titre `:1338`, fermer `:1277` labellisés). **P2** : vérifier `ThemedAvatarButton` (`ConversationHelperViews.swift:123`) → label « Options de la conversation » ; aucun identifiant.
- **Liste** (`MessageListView`/`MessageListViewController`) — P2 — `UICollectionView` sans `accessibilityIdentifier` ni label de conteneur.

**Top priorités Partie 2** : (1) `BubbleStandardLayout:400` `.combine`→`.contain` (P0) ; (2) `UniversalComposerBar:783` send label/hint/id (P0) ; (3) annonces VoiceOver message reçu/échec (P0, §1.3) ; (4) `BubbleDeliveryCheck` + play/scrubber audio (P1) ; (5) Reduce Motion bulles (P1) ; (6) Dynamic Type corps de bulle (P1).

---

# PARTIE 3 — AUTHENTIFICATION & ONBOARDING

## 3.1 — `Auth/Onboarding/OnboardingAnimations.swift` & `Views/OnboardingView.swift` (P0 Reduce Motion)
- **`OnboardingAnimations.swift:32,40-64,101-337`** — Reduce Motion — **P0** — Aucune des animations `.repeatForever` (cercles, particules, vagues, confettis, drapeaux/étoiles en orbite) ne lit `accessibilityReduceMotion` → **risque vestibulaire**. **FIX** : injecter `reduceMotion`, court-circuiter `startAnimations()`/`restartAnimations()` et sauter particules/vagues.
- **`OnboardingAnimations.swift:7-379`** — VoiceOver — P1 — Fond décoratif (dont emoji drapeau `:238-239`) exposé. **FIX** : `.accessibilityHidden(true)` sur la racine `AnimatedStepBackground`.
- **`OnboardingAnimations.swift:413-449` (`InteractiveProgressBar`)** — P1 — Segments = `Button` sans label/état. **FIX** : `.accessibilityLabel("Étape \(n)")` + `.isSelected`.
- **`OnboardingAnimations.swift:474-537` (`GlowingButton`)** — P1 — En chargement, le label devient un `ProgressView` → perte du nom. **FIX** : `.accessibilityLabel(title)` + `.accessibilityValue(isLoading ? "Chargement" : "")` + identifier.
- **`OnboardingView.swift:90-128,149-163,222`** — Reduce Motion — **P0** — Springs d'entrée d'icône, transitions de page, `ambientOrbs` (`.floating`) non gardés.
- **`OnboardingView.swift:98-104,399-415`** — VoiceOver — P1 — `tabViewStyle(.page(indexDisplayMode:.never))` + `pageIndicators` = `Capsule` pures → aucun contrôle de page accessible. **FIX** : `.accessibilityElement` sur `pageIndicators` + `.accessibilityLabel("Page \(i) sur \(n)")`.
- **`OnboardingView.swift:217-220,370-395`** — P1/P2 — Icône héros à `.accessibilityHidden(true)` (sinon nom SF lu via `.combine` `:245`) ; `mockConversationPreview` (bulles démo `.allowsHitTesting(false)` mais dans l'arbre a11y) → `.accessibilityHidden(true)`.

## 3.2 — `Auth/Onboarding/OnboardingStepViews.swift`
- **`GlassTextField` `:32,36`** — Forms — **P0** — Ni `SecureField` ni `TextField` ne posent `.textContentType` → autofill mot de passe & code SMS morts. **FIX** : ajouter param `textContentType` ; mot de passe → `.newPassword`, email → `.emailAddress`, pseudo → `.username`. Ajouter `.submitLabel`/`.onSubmit` pour chaîner.
- **`:43-48`** — VoiceOver — **P0** — Toggle œil afficher/masquer mot de passe sans label. **FIX** : `.accessibilityLabel(showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe")`.
- **`:52-60`** — VoiceOver/couleur — P1 — Validation par icône colorée verte/rouge sans label. **FIX** : `.accessibilityLabel(available ? "Disponible" : "Indisponible")`.
- **`:79-86`** — Focus/annonce — P1 — `errorMessage` non annoncé ni associé au champ. **FIX** : `.accessibilityElement(children:.combine)` + annonce sur apparition.
- **Illustrations & cartes** (`:103,166,264,…` + `tipRow` `:200,233,…`) — P1/P2 — Icônes décoratives exposées. **FIX** : `.accessibilityHidden(true)` + `.accessibilityElement(children:.combine)` par carte.
- **Téléphone** (`:267-298,376-390`) — P1 — Bouton indicatif (flag+code+chevron) à combiner ; `.textContentType(.telephoneNumber)` (`:287`) ; lignes du picker pays → combine + `.isSelected`.
- **Mot de passe** (`PasswordStrengthBar :696-725`, `match :586-599`, `reqRow :637-642`) — P1 — Barre invisible à VoiceOver + état par couleur. **FIX** : `.accessibilityElement(children:.ignore)` + `.accessibilityValue(strength.label)` ; chaque exigence `.accessibilityValue(met ? "rempli" : "non rempli")`.
- **Langue** (`:835-892`) — P1 — Onglets/cartes : `.isSelected` + combine ; libeller le bouton clear de recherche (`:771`).
- **Profil** (`:1043-1051,1073-1080`) — **P0** — Boutons caméra (bannière/avatar) icône-only sans label + cibles ~22-28 pt. **FIX** : labels « Changer la bannière/photo de profil » + `meeshyTapTarget()`. Bio `TextEditor` (`:992`) sans label ; compteur de caractères rouge sans indice texte (`:1001`).
- **Récap** (`:1147-1170,1209-1239`) — P1 — Loading/erreur non annoncés ; checkbox CGU custom sans `.isSelected`/valeur + **piège de bouton imbriqué** (« Lire les conditions » dans le bouton externe). **FIX** : `.accessibilityAddTraits(acceptTerms ? .isSelected : [])` + restructurer le bouton imbriqué en `.accessibilityAction`.

## 3.3 — `EmailVerificationView.swift`
- **`:91-119` (champ OTP)** — P1 — `.oneTimeCode` présent (bien) mais pas de `.accessibilityLabel`. **FIX** : « Code de vérification à 6 chiffres ».
- **`:123-141` erreur / `:208-228` succès** — **P0/P1** — Erreur et succès non annoncés ; focus non déplacé au succès. **FIX** : `A11yAnnounce.say` + `.accessibilityFocused` sur succès ; masquer icônes décoratives.
- **`:145-171` bouton vérifier** — P1 — En chargement perd son nom. **FIX** : `.accessibilityLabel("Vérifier")` + valeur d'état.

## 3.4 — `LoginView.swift` (le meilleur du lot)
- **`:286-293,362`** — VoiceOver/Cible — P1 — Bouton retour `Image("chevron.left")` sans label, frame 36×36. **FIX** : label « Retour » + `meeshyTapTarget()`.
- **`:230-273` (`savedAccountRow`)** — P1 — Avatar+nom+@username+chevron lus en fragments. **FIX** : `.accessibilityElement(children:.combine)` + `.accessibilityHint("Se connecter à ce compte")`.
- **`:490-518` bouton login** — P1 — `.accessibilityIdentifier("login.submit")` + valeur d'état chargement.
- **`:478-488` erreur** — P1 — `authManager.errorMessage` jamais annoncé (poser l'annonce dans `.adaptiveOnChange` `:172`).
- **`:650-656`** — Forms — P1 — Champ 2FA : ajouter `.textContentType(.oneTimeCode)`.
- **`:535-560` pills d'environnement** — P2 — `.isSelected`.

## 3.5 — `MagicLinkView.swift`
- **`:55-62` fermer** — **P0** — `xmark` sans label.
- **`:178-264` waitingContent / `:131` erreur / `:214` expiry** — **P0/P1** — Transition `.waiting`, erreur, expiry non annoncées. **FIX** : `A11yAnnounce.say` à chaque changement.
- **`:140-164` bouton envoyer** — P1 — Nom + valeur d'état + identifier.
- **`:227-232` countdown** — P1 — Mise à jour par seconde → spam VoiceOver. **FIX** : `.accessibilityLabel("Temps restant")` + envisager `.accessibilityHidden(true)`.
- **`:188-197`** — Reduce Motion — P1 — Vérifier que `adaptiveSymbolPulse` est gardé ; masquer icônes décoratives.

## 3.6 — Composants SDK Auth
- **`AuthTextField.swift:40,44,51-58,66-81`** — **P0** — Pas de `.textContentType` (ajouter param init) ; toggle œil sans label ; bordure d'erreur couleur-seule + erreur non annoncée → combiner + annoncer.
- **`PasswordStrengthIndicator.swift:45-61`** — P1 — Barre 5 segments couleur-only invisible VoiceOver. **FIX** : `.accessibilityElement(children:.ignore)` + `.accessibilityValue(label)`. Localiser libellés (`:21`), couleur de piste theme-aware (`:50`).
- **`LanguageSelector.swift:59-127`** — P1 — Bouton/lignes sans combine ni `.isSelected` ; couleurs dark-only hardcodées (`:80,84,101,105,111`) → tokens `ThemeManager`.
- **`CountryPicker.swift:66-121`** — P1 — Bouton/lignes à combiner + `.isSelected` ; `.textContentType(.telephoneNumber)` ; couleurs dark-only hardcodées → tokens.

---

# PARTIE 4 — RÉGLAGES, PROFIL & COMPTE

> Thème dominant : `.font(.system(size:))` fixe partout (Dynamic Type désactivé) — voir §1.1, non répété par ligne.

## 4.1 — Bascules non labellisées (P0, ~42 toggles)
- **`PrivacySettingsView.swift:169-183` (`privacyToggle`, ~16 toggles)** — **P0** — `Toggle("", isOn:)` + `.labelsHidden()` SANS `.accessibilityLabel`. VoiceOver lit « Switch, on » sans nom. **FIX** dans le helper : `.accessibilityLabel(title)` + `.accessibilityValue(isOn ? "activé" : "désactivé")` (ou `.accessibilityElement(children:.combine)` sur la ligne).
- **`NotificationSettingsView.swift:269-283` (`notifToggle`, ~26 toggles)** — **P0** — Idem.
- **`NotificationSettingsView.swift:228-253` (jours DnD)** — **P0** — Boutons lettres « L/M/M/J/V/S/D » (Mar & Mer = « M », ambigu), sélection couleur-only, sans label/`.isSelected`. **FIX** : `.accessibilityLabel(fullDayName)` + `.isSelected` + `meeshyTapTarget()` (actuellement 28×28, `:245`).
- **`NotificationSettingsView.swift:198-218` (heures DnD)** — P1 — `TextField` sans clavier ni label. **FIX** : remplacer par `DatePicker(.hourAndMinute)` ou labelliser.
- **`PrivacySettingsView.swift:135` / `SettingsView.swift:302`** — P1 — `Picker("")` vides non nommés. **FIX** : `.accessibilityLabel`.

## 4.2 — `SettingsView.swift`
- **`:178-208` (`profileCard`)** — P1 — Combiner, label riche nom+@username, masquer chevron. Présence `MeeshyAvatar` (`:184`) sans équivalent texte.
- **`:74-98` (overlay déconnexion)** — P1 — Non annoncé, non modal. **FIX** : `.accessibilityAddTraits(.isModal)` + annonce.
- **`:197…` chevrons décoratifs** — P2 — `.accessibilityHidden(true)`.
- Identifiants — P2.

## 4.3 — `ProfileView.swift` / `EditProfileView.swift`
- **`ProfileView.swift:262-291` PhotosPicker avatar (crayon)** — **P0** — Icône-only sans label. **FIX** : « Changer la photo de profil ».
- **`ProfileView.swift:482-493` (`statsSection`)** — **P0** — 3 `statCard` dans un `Button` sans label → fragments. **FIX** : `.accessibilityElement(children:.ignore)` + « Statistiques: 120 messages, 8 conversations, 3 amis » + hint.
- **`ProfileView.swift:164-182`** — P1 — Save/edit : `ProgressView` nu silencieux pendant `isSaving/isUploading`. **FIX** : label + annonce de fin.
- **`ProfileView.swift:61-78` toast erreur** — P1 — Non annoncé.
- **`ProfileView.swift:498-532` demandes d'amis / `:646-701` langue** — P1 — Compte en attente hors label ; flag+chevron lus. **FIX** : combine + label.
- **`ProfileView.swift:604-617`** — Forms — P1 — `.textContentType` (.givenName/.familyName/.nickname).
- **`EditProfileView.swift:118-129` PhotosPicker caméra** — **P0** — Sans label. + upload/succès/erreur non annoncés (`:131,272,313`). displayName `.textContentType(.nickname)`.

## 4.4 — `SecurityView.swift`
- **`:543-609` champ OTP téléphone** — P1 — Manque `.textContentType(.oneTimeCode)` (`:558`).
- **`:492-497` champ téléphone** — P1 — Placeholder « +33 6 12… » lu comme nom → `.accessibilityLabel("Nouveau numéro de téléphone")`.
- **`:758-779` 2FA / `:612-730` PIN conversation** — P1 — `ProgressView` nu silencieux ; lignes d'état non combinées ; icônes d'état non masquées ; erreurs (`:302,475,838`) non annoncées.
- **`:658-730`** — Cible — P2 — Capsules `padding(.vertical, 8)` ~32 pt → `meeshyTapTarget()`.

## 4.5 — `ChangePasswordView.swift` / `TwoFactorSetupView.swift`
- **`ChangePasswordView.swift:304-308`** — P1 — Champs nouveau/confirme → `.textContentType(.newPassword)`. Validation (`:187-199`) → `.accessibilityValue(met ? "rempli" : "non rempli")`. Succès/erreur (`:244,205`) non annoncés.
- **`TwoFactorSetupView.swift:90-99` QR** — **P0** — `Image(uiImage:)` QR sans label (purement visuel). **FIX** : `.accessibilityHidden(true)` sur le QR + s'assurer que la clé manuelle est lisible. Bouton copier clé (`:119`) icône-only sans label.
- **`TwoFactorSetupView.swift:174-190,420-437,634-650` champs OTP** — P1 — Tous manquent `.textContentType(.oneTimeCode)` + label. Champ MDP désactivation (`:405-417`) → `.textContentType(.password)`. Loading/erreur non annoncés.

## 4.6 — `ActiveSessionsView.swift` / `DeleteAccountView.swift` / `DataExportView.swift`
- **`ActiveSessionsView.swift:106-160`** — P1 — Ligne non combinée ; bouton révoquer (`:150-158`) ~20 pt → `meeshyTapTarget()` + label incluant le device ; `revokeAll` (`:93`) destructif sans confirmation ni annonce. Skeleton/loading non gérés.
- **`DeleteAccountView.swift:166-201`** — P1 — Champ de confirmation : exposer l'état de correspondance via `.accessibilityValue(matches ? "phrase correcte" : "phrase incomplète")`. Vérifier rendu markdown `**…**` (sinon « astérisque » lu). Transition email-confirmation + résultat non annoncés. (Sinon bien instrumenté : header `.isHeader`, hints, warning combiné.)
- **`DataExportView.swift:150-178` boutons format JSON/CSV** — **P0** — Sélection couleur-only, sans `.isSelected`/valeur. **FIX** : `.accessibilityValue(selected ? "sélectionné" : "non sélectionné")` + `.isSelected`. Export terminé/erreur/share non annoncés (`:247-282,230`).

## 4.7 — Charts & stats (P0 données invisibles)
- **`StatsTimelineChart.swift:14-55`** — **P0** — `Chart` SwiftUI sans `.accessibilityChartDescriptor` ni labels/valeurs par `LineMark`/`AreaMark` → un utilisateur VoiceOver n'obtient AUCUNE donnée. **FIX** : implémenter `AXChartDescriptorRepresentable` (axe X = dates, Y = nb messages, résumé min/max/total) OU `.accessibilityLabel`/`.accessibilityValue` par mark. Label `:54` hardcodé FR → localiser. Axes `size:9` fixes.
- **`UserStatsView.swift:29-52,90-122`** — P1 — Bouton retour icône-only (`:35`) sans label ; `statCard` non combinés ; « 120j » lu « 120 j » → `.accessibilityLabel("120 jours")` ; en-têtes sans `.isHeader`.

## 4.8 — Autres (bien instrumentés, restes mineurs)
- **`PrivacyPolicyView.swift` / `TermsOfServiceView.swift`** — P1 — Masquer l'icône `\(number).circle.fill` dans la section combinée (lue « un, cercle »). Corps `size:14` fixe → légal doit scaler.
- **`AboutView.swift:240-257`** — P2 — Checkmark décoratif → masquer ou « disponible ».
- **`BlockedUsersView.swift:170-221,95-129`** — P1 — Ligne non combinée ; skeletons focusables (masquer) ; capsule « Débloquer » ~28 pt ; titre sans `.isHeader`.
- **`MediaDownloadSettingsView.swift:137-165`** — P1 — Ajouter `.isSelected` + sémantique « groupe radio ».
- **`AchievementBadgeView.swift`** — ✅ meilleur du lot (combine + label riche). P2 : localiser « débloqué/verrouillé/sur » ; `minimumScaleFactor`.
- **`LicensesView.swift:17`** — P2 (contenu) — Entrée « Kingfisher » obsolète (retiré, remplacé par CachedAsyncImage) ; `URL(string:)!` force-unwrap.

---

# PARTIE 5 — LISTE, CONTACTS, APPELS, MÉDIA

## 5.1 — Liste de conversations
- **`ThemedConversationRow.swift:223-227` + `ConversationListView+Rows.swift:82-84`** — P1 — **Double enveloppe a11y** (combine imbriqué) → libellé interne perdu + double « button ». **FIX** : un seul propriétaire des sémantiques. `accessibilityValue` (`:225`) duplique le compte déjà dans le label (`:250`) → dédupliquer.
- **`ThemedConversationRow.swift:284-296,629-675`** — P1 — Avatar + point de présence + anneau de story + badge d'humeur sans label, présence couleur-only, et actions de l'avatar (voir story/profil) inatteignables sous `.combine`. **FIX** : surfacer présence/story dans le label + `.accessibilityAction(named:)` (Voir profil, Voir story, Infos).
- **`ConversationListView.swift:365-468` + `+Rows.swift:53-56` (swipe)** — **P0** — Actions de swipe custom (épingler, silence, verrou, archiver, lu, bloquer, masquer) **non exposées** via `.accessibilityAction` → inaccessibles à VoiceOver. **FIX** : `.accessibilityActions { Button("Épingler"){…}; Button("Silence"){…}; … }` reproduisant les swipe actions.
- **`ThemedConversationRow.swift:351-358` (`timeAgo`)** — P2 — Littéraux FR (« maintenant/min/h/j/sem ») dans le label a11y → `RelativeDateTimeFormatter` localisé.
- **`ConversationListHelpers.swift` `SectionHeaderView:9-109`** — P1 — `Button` sans label ; état déplié/replié non annoncé. **FIX** : `.accessibilityLabel("\(name), \(count)")` + `.accessibilityValue(isExpanded ? "déplié" : "replié")`. `ThemedFilterChip:389-423` → `.isSelected`.
- **`ConversationListView+Overlays.swift:280-331`** — P2/P1 — Boutons header ~20-22 pt → `meeshyTapTarget()` ; cloche notifications → `.accessibilityValue("\(count) non lues")`.
- **`NewConversationView.swift:108-371`** — P1 — Retour (`:108`) sans label ; xmark chip sélectionné (`:210`) sans label ; `userRow` (`:308`) non labellisée, sélection par checkmark + présence couleur-only. **FIX** : labels explicites + `.isSelected`.
- **`GlobalSearchView.swift`** — ✅ Best-in-class (lignes combinées, labels riches, hints, `.isButton`, onglets `.isSelected`, icônes masquées). **Modèle.**

## 5.2 — Appels (sécurité-critique, notation stricte)
### `CallView.swift`
- **`:508-583` (`controlBar`)** — P1 — Barre de contrôle = **ScrollView horizontal** → le bouton « Raccrocher » peut sortir de l'écran à grande Dynamic Type. **FIX** : épingler `endCallButton` hors du scroll OU `.accessibilitySortPriority(1)`.
- **`:657-681` (`callControlButton`)** — P1 — Pas de `.isButton` ; caption 10 pt lue en double ; état toggle (mute/speaker/vidéo) non exposé. **FIX** : `.isButton` + masquer caption + `.accessibilityAddTraits(isActive ? .isSelected : [])`.
- **`:285-298,319-324` durée/qualité** — P1 — Durée mise à jour/s sans `.accessibilityValue` ; changements de qualité (connecté→perdu) non annoncés. **FIX** : `.accessibilityLabel("Durée \(d)")` + `.updatesFrequently` ; `A11yAnnounce.say("Connexion perdue")` sur changement.
- **`:441-473` transcription** — P1 — Locuteur distingué par couleur de point seule. **FIX** : préfixer le nom du locuteur, masquer le point.
- Identifiants — P1 — `call.control.end` etc. (sécurité).
- ✅ Reduce Motion correctement gardé (`:759`).

### `IncomingCallView.swift`
- **`:25-57`** — **P0** — Aucune annonce de QUI appelle à l'apparition. **FIX** : `.onAppear { A11yAnnounce.screenChanged("Appel entrant de \(callerName)") }`.
- **`:167-229` accept/refuser** — P1 — Sans `.isButton`, caption lue en double. Identifiants manquants. ✅ Reduce Motion gardé.

### `FloatingCallPillView.swift`
- **`:98-173`** — P1 — 4 contrôles (mute/speaker/expand/**raccrocher**) à 36×36 → **sous 44 pt sur un contrôle de raccrochage**. **FIX** : `meeshyTapTarget()` + `.isButton` + identifiants.

### `CallWaitingBannerView.swift` / `WebRTCVideoView.swift` / `CallEffectsOverlay.swift`
- `CallWaitingBannerView` — P1 — Apparition non annoncée. (Sinon labels riches ✅.)
- `WebRTCVideoView:62-98` — P2 — Surface vidéo sans label → `.accessibilityLabel("Vidéo de \(remoteName)")` / « Votre vidéo » / « Vidéo indisponible ».
- `CallEffectsOverlay:25-27,83-114` — P2 — Scrim dismiss sans action a11y ; labels FR hardcodés ; sélection couleur-only.

## 5.3 — Bannières connexion/offline
- **`ConnectionBanner.swift`** — P1 — Reconnexion/sync non annoncées ; pills non combinées (« point point point » lus) ; pulse `repeatForever` non gardé. **FIX** : `A11yAnnounce.say` sur changement de statut + `.accessibilityElement(children:.ignore)` + label statique + garder l'anim.
- **`OfflineBanner.swift`** — P1 — Non annoncé, non combiné ; sous-titre `.lineLimit(1)` tronque.

## 5.4 — Média / Audio
- **`AudioFullscreenView.swift:527-565` (`seekBar`)** — **P0** — Barre de recherche custom (`Capsule` + `DragGesture`) sans valeur/trait ajustable → VoiceOver ne peut pas chercher. **FIX** : `.accessibilityAdjustableAction` + `.accessibilityValue(currentTime)` + label « Position de lecture ». Waveform (`:413-469`) → `.accessibilityHidden(true)`. Contrôles centraux (`:479-523`) sans label (« reculer/avancer de 10 s », « Lecture/Pause »). Pills vitesse (`:585-606`) et langue (`:685-722`) sans label/`.isSelected`. Close/download (`:292-303,389-409`) sans label.
- **`ConversationMediaViews.swift` `DownloadBadgeView:82-203`** — **P0** — Bouton de téléchargement (seule façon de récupérer le média) sans label. **FIX** : `idleBadge` → « Télécharger, \(taille) » ; `downloadingBadge` → « Annuler le téléchargement » + `.accessibilityValue("\(%) pour cent")`. `AnimatedWaveformBar`/`AudioLevelBar` (`:817-888`) `repeatForever` non gardé → garder + `.accessibilityHidden(true)`.
- **`CameraView.swift`** — **P0** — AUCUN contrôle labellisé : close (`:57`), flash (`:66`), capture photo (`:155`), enregistrement vidéo (`:171`), bascule caméra (`:110`), onglets mode (`:137`). **FIX** : labels sur chaque + `.isSelected` sur les modes + indicateur d'enregistrement annoncé (`:196`).
- **`MiniAudioPlayerBar.swift:104-149`** — P1 — Boutons 24-32 pt → `meeshyTapTarget()` ; progression sans `.accessibilityValue` ; barre tap-to-open sans action a11y.
- **`ConversationMediaGalleryView.swift:177-576`** — P1 — Close/save/play sans label ; image sans label (expéditeur) ; pager sans index par page (« Photo 2 sur 5, de Alice ») ; `GalleryVideoPage` états visuels-only.
- **`UploadProgressBar.swift`** — P1 — N'expose RIEN à VoiceOver (progression = rectangle brut). **FIX** : `.accessibilityElement(children:.ignore)` + label + `.accessibilityValue("\(%) pour cent, \(done) sur \(total)")` ; icône qui tourne → `reduceMotion` + masquée.
- **`AttachmentLoadingTile.swift`** — P1 — Statut non labellisé ; cancel 18 pt (`:35`) → `meeshyTapTarget()` ; `.shimmer()` non gardé.
- **`LocationPickerView.swift`** — P1 — Clear recherche (`:90`) sans label ; changements d'adresse non annoncés.

## 5.5 — Contacts
- **`FriendRequestListView.swift:99-173`** — **P0/P1** — Ligne non combinée ET accept/refus (`:141-168`) **sans label** (VoiceOver lit « xmark »/« checkmark ») → action primaire de l'écran. **FIX** : combine + « Accepter/Refuser la demande de \(name) » ; cibles 36 pt → `meeshyTapTarget()`. Retour (`:26-48`) sans label.
- **`ContactsHubView.swift:55-93` / `ContactsListTab.swift:36-67` / `RequestsTab.swift:28-57`** — P1 — Onglets/chips sans `.isSelected` (sélection couleur-only). Accept/refus `RequestsTab` 36 pt.
- **`DiscoverTab.swift:227-281` (`searchResultRow`)** — P1 — Ligne non combinée ; avatar et nom = `.onTapGesture` séparés (mêmes cibles non labellisées) ; présence couleur-only. **FIX** : combiner + action unique.
- **`ContactsListTab.swift:137-190`** — P1 — Label omet `@username` ; chevron non masqué. Clear recherche (`:118`) sans label.
- **`InviteFriendsSheet.swift:102-111`** — P1 — Close `xmark` sans label ; littéraux FR non localisés ; « Copié! » non annoncé.
- **`AddParticipantSheet.swift` / `ForwardPickerSheet.swift` / `ParticipantsView.swift`** — P1 — Lignes non combinées ; bouton « Ajouter » ~28 pt ; `ParticipantsView` utilise le swipe natif ✅ (atteignable au rotor) mais lignes à combiner (rôle/présence couleur-only).
- **`ContactCardView.swift` / `BlockedTab.swift`** — ✅ Solides (combine + label + hint).

---

# PARTIE 6 — FEED, POSTS, COMMENTAIRES, STORIES

## 6.1 — Chemin UIKit du feed (P0 quand `useUIKitList` actif)
- **`FeedListView.swift` / `CommentListView.swift`** wrappent `FeedListViewController`/`CommentListViewController`. Les cellules UIKit n'ont **aucune** config a11y → feed/commentaires largement inutilisables sous VoiceOver.
- **`Cells/TextPostCell.swift:94-100`** — P1 — `likeButton`/`commentButton`/`repostButton` sans `accessibilityLabel`/`accessibilityValue` (lit « 12 » sans rôle) ; état liké couleur/forme sans valeur ; cellule non combinée ; `UIFont.systemFont` fixe sans `adjustsFontForContentSizeCategory`. **FIX** : `accessibilityLabel="J'aime"`, `accessibilityValue="\(count)"`, trait sélection ; `UIFont.preferredFont(forTextStyle:)` + `adjustsFontForContentSizeCategory = true`.
- **`Cells/MediaPostCell.swift:53-80`** — P1 — Like/comment non labellisés ; `mediaImageView` sans description.
- **`Cells/TopLevelCommentCell.swift:40-49`** — P1 — « Reply » **hardcodé EN** (`:45`) → « Répondre » ; like non labellisé/non câblé ; profondeur non communiquée.

## 6.2 — `FeedPostCard.swift` (carte SwiftUI principale)
- **`:152-258`** — P1 — Carte non combinée ; zone texte `.onTapGesture` (`:230`) sans trait/label. **FIX** : combiner auteur+heure+texte+description-média en un élément `.isButton` + hint « Ouvre la publication », garder la barre d'actions séparée.
- **`:549-590` (like)** — P1 — `.accessibilityLabel("\(count) j'aime")` mais pas de `.accessibilityValue` d'état ni trait ; couleur (`error` liké vs `accentColor`) seule distingue « tu as aimé » de « d'autres ont aimé » (`heart.fill` pour les deux). **FIX** : `.accessibilityAddTraits(isLiked ? .isSelected : [])` + état dans le label.
- **`:614-696` barre d'actions** — P1 — Boutons ~17-18 pt sans `.frame(minHeight:44)` → `meeshyTapTarget()`.
- **`:366-403` flags langue / `:167-189` voir plus** — P1 — `.onTapGesture` non-boutons sans label/cibles minuscules. **FIX** : `Button` + `.accessibilityLabel("Voir en \(langue)")`, « voir plus » en `Button`.
- Identifiants (`feed.post.like`…) — P2.

## 6.3 — `FeedPostCard+Media.swift`
- **`:19-105` galerie / `:208-226` image / `:258-364` doc & localisation** — P1 — Toutes les tuiles = `.onTapGesture` sur image brute, sans trait/label → VoiceOver ne peut pas ouvrir les médias. **FIX** : `.accessibilityElement()` + `.accessibilityLabel("Photo N sur M")` + `.isButton` + `.accessibilityAction`. Overlay « +N » (`:90`) → « Voir N photos supplémentaires ». Overlays vidéo/audio (`:133-170`) → « Vidéo, durée x ».

## 6.4 — `PostDetailView.swift`
- **`:1031-1136` (`actionsBar`)** — **P0** — Like/repost/bookmark/share **sans aucun label** (lus « button ») ; compteur commentaires en `HStack` nu. **FIX** : labels + `.accessibilityValue` + `.isSelected` + `meeshyTapTarget()` (calquer `FeedPostCard`).
- **`:594-640` navBar** — P1 — Retour (`:600`) et ellipsis (`:635`) sans label.
- **`:668-755,994-1022,1144-1372`** — P1 — Nom auteur/flags/translate/voir-plus en `.onTapGesture` non-boutons ; cellules grille média non labellisées ; canvas story repost (`:889`) sans label.

## 6.5 — `FeedView.swift` (+Attachments) & composeurs de statut
- **`FeedView.swift:443-447`** — P1 — `composerOverlay` = ZStack (pas `.sheet`) → focus VoiceOver non piégé, backdrop tap-to-dismiss invisible. **FIX** : `.accessibilityAddTraits(.isModal)` + action « Fermer » sur le backdrop.
- **`FeedView.swift:471-497,587,782-811,1011`** — P1 — Bouton composer placeholder, « + » menu (40×40 < 44), bannière « nouveaux posts » (non annoncée), menu visibilité sans label. **FIX** : labels + `meeshyTapTarget()` + annonce du compte.
- **`FeedView+Attachments.swift:632-686`** — P1 — Toolbar `FeedComposerSheet` (photo/caméra/emoji/fichier/localisation/micro) **sans aucun label** ; remove `xmark` (`:294,895`) sans label + < 44 pt.
- **`StatusComposerView.swift:131-164` / `StatusBarView.swift:71-131`** — P1 — Grille emoji d'humeur sans label/`.isSelected` (sélection couleur/visuel-only) ; pills de statut + bouton « + Status » sans label combiné.
- **`AudioPostComposerView.swift`** — ✅ bouton record state-aware (`:467`). P1 : chips langue sans `.isSelected` ; durée d'enregistrement sans `.accessibilityValue`.
- **`EditPostSheet.swift:50-65`** — P1 — `TextEditor` sans label.

## 6.6 — Commentaires
- **`FeedCommentsSheet.swift:802-846`** — P1 — Bouton like sans label/valeur/état (couleur-only) ; ellipsis (`:840`) sans label + action vide. ✅ `.frame(minHeight:44)` présent (`:822,836`) + `reduceMotion` honoré (`:804`) — **seule** place où Reduce Motion est respecté hors Partie 5.
- **`FeedCommentsSheet.swift:119-137` + `CommentListView.swift:74,111`** — P1 — Profondeur de réponse communiquée **uniquement** par l'indentation (`.padding(.leading, 36)`) → invisible à VoiceOver. **FIX** : préfixe « Réponse à \(parent author) » sur les lignes indentées. Close `xmark` (`:279`) sans label.
- **`PostTranslationSheet.swift:57`** — P1 — Close sans label ; disponibilité par couleur/icône.

## 6.7 — Stories (cas le plus difficile)
### `StoryTrayView.swift`
- **`:184-219` (`storyRing`)** — **P0** — Anneaux des stories d'autrui **sans label** ; vu/non-vu par couleur d'anneau seule (`:192`) + graisse du nom ; tap = `.onTapGesture` (pas un bouton). **FIX** : `.accessibilityElement(children:.ignore)` + `.accessibilityLabel("Story de \(username), \(hasUnviewed ? "non vue" : "vue")")` + `.isButton` + `.accessibilityAction { onViewStory(id) }`.
- **`:384-444` (`StoryUploadOverlay`)** — P1 — Anneau de progression/% / échec sans label/valeur ; retry uniquement via `.onTapGesture`. **FIX** : label + `.accessibilityValue("\(%) pour cent")` + retry en `.accessibilityAction`.

### `StoryViewerView.swift` (+Content / +Canvas / +Sidebar) — média minuté auto-avançant
- **`+Content.swift:535-616` (`startTimer`) + `+Canvas.swift:32-228` (`StoryGestureOverlayView`)** — **P0** — L'auto-avance ne vérifie pas `UIAccessibility.isVoiceOverRunning` → un utilisateur VoiceOver ne peut pas lire une slide avant l'avance, et la **pause est un touch-and-hold 200 ms** que VoiceOver intercepte → **impossible de mettre en pause**. **FIX** : (a) `guard !UIAccessibility.isVoiceOverRunning` dans le timer (ajouter à `shouldPauseTimer`, `+Content:520`) pour NE PAS auto-avancer sous VoiceOver ; (b) écouter `UIAccessibility.voiceOverStatusDidChangeNotification`.
- **`+Canvas.swift:84-89`** — **P0** — Toute la navigation prev/next/pause est un `DragGesture`. L'overlay pose un `.accessibilityElement()` + hint décrivant des gestes que VoiceOver ne peut pas faire, **sans aucune `.accessibilityAction`**. **FIX** : `.accessibilityAction(named:"Story précédente"){onPrevious()}`, `"Story suivante"{onNext()}`, `"Pause"/"Lecture"`, et `.accessibilityScrollAction`.
- **`+Canvas.swift:576` (`StoryReaderRepresentable`)** — **P0** — Le texte de story réellement rendu en production est **dessiné dans un CALayer** (canvas) → **invisible à VoiceOver** et **ne scale jamais** avec Dynamic Type. **FIX** : exposer le texte résolu + la légende vocale en élément a11y sur le wrapper du representable (`.accessibilityElement()` + `.accessibilityLabel(resolvedText)`).
- **`+Canvas.swift:628-647` légende vocale** — P2 — Transcription (importante pour sourds) `.allowsHitTesting(false)` sans label → l'exposer.
- **`StoryViewerView.swift:317-419`** — P1 — Changements de slide (`currentStoryIndex`/`currentGroupIndex`) non annoncés. **FIX** : `A11yAnnounce.screenChanged(<label nouvelle slide>)`.
- Reduce Motion — P1 — Transitions (crossFade, ouverture zoom/slide/reveal, emoji flottant 100 pt `:839-850`) non gardées → risque vestibulaire.
- Contraste texte-sur-image — P1 — Repose sur `.shadow(0.4)` + scrims ; badges `.white.opacity(0.8)` sur `.ultraThinMaterial` faible contraste.
- **`+Content.swift:1187-1447` (commentaires) / `:1098-1144` (viewers)** — P1 — Close sans label ; scrim invisible ; profondeur par indentation ; spinners non annoncés ; lignes non combinées.
- **`+Sidebar.swift`** — ✅ `StoryHeaderView` (avatar/options/close labellisés + hints + 44 pt) et `languageScrollStrip` sont **exemplaires** — modèles à copier. P1 : vérifier que `StoryActionButton` mappe `label:`→`.accessibilityLabel` (sinon le cœur/compteur lus « 12 » sans rôle) ; bouton mute (`:224-244`) utilise `.highPriorityGesture(TapGesture)` → vérifier l'activation VoiceOver + `.accessibilityValue`.
- **`StoryViewerContainer.swift:143-159`** — P1 — Close `xmark` sans label ; « Loading… » (`:86`) hardcodé EN.

### Composeur de stories SDK
- **`StoryComposerView.swift:165-176` + canvas gestures** — **P0** — Authoring 100 % gestuel (drag-position, pinch-zoom, rotate) **sans alternative accessible** → un utilisateur VoiceOver/switch ne peut pas composer. **FIX** : `.accessibilityAction` par élément (« Déplacer haut/bas/gauche/droite », « Agrandir/Réduire ») + exposer les éléments en a11y.
- **`StoryComposerView.swift:635-765`** — P1 — `dismissButton`/`previewButton`/`overflowMenu` sans label ; `publishButton` `ProgressView` d'état non labellisé. Thumbs de slide (`:780-828`) : sélection par bordure-couleur, sans label/`.isSelected`.
- **`StoryTextEditorView.swift:259-287` (swatches couleur)** — P1 — Boutons couleur = `Circle` colorés **sans label**, sélection par anneau seul → **échec WCAG type**. **FIX** : `.accessibilityLabel(colorName(hex))` + `.isSelected`. Quick actions (`:112-160` police/alignement/fond/couleur) et onglets de section (`:181-204`) sans label/`.isSelected`. Champ texte (`:71`) sans label.
- **`StickerPickerView.swift:56-77`** — P1 — Onglets de catégorie = emoji seul sans label + sélection couleur-only. (Grille stickers `:84-94` ✅ labellisée.)
- **`StoryFilterPicker.swift:80-97`** — P1 — « Original » sans label, sélection par bordure ; ajouter `.isSelected` partout.
- **`StoryAudioPanel.swift:255-308` (`audioRow`)** — P1 — Bouton imbriqué (play dans la ligne sélectionnable) problématique VoiceOver ; ligne non labellisée. **FIX** : label de ligne + action « Lire l'aperçu » séparée + `.isSelected`.
- **`StoryAudioPlayerView.swift:196-268`** — P1 — Play/mute ✅ labellisé state-aware mais sans `.accessibilityValue` de progression ; waveform `Canvas` non `.accessibilityHidden(true)`.

### Contrôles Timeline (référence)
**`TransportBar.swift`, `TimelineToolbar.swift`, `TimelineModeSwitcher.swift`** — ✅ **Les mieux instrumentés du codebase** : labels sémantiques, 44×44 via `.contentShape(Rectangle().inset(by:-6))`, `.isSelected`, décoratifs masqués, raccourcis clavier. **Modèles de référence absolus.** P2 : ajouter `.accessibilityValue` d'état sur play/mute/snap.

---

# PARTIE 7 — COMPOSANTS PARTAGÉS SDK (transverses)

(Toasts, skeletons, logo : voir §1.6. Reduce Motion : §1.2.)

## 7.1 — Notifications
- **`NotificationRowView.swift`** — ✅ Best-in-class (combine + label, `:57,256`). P2 : point non-lu couleur-only (couvert pour VoiceOver via `:257`).
- **`NotificationToastView.swift:55-114`** — **P0** — voir §1.6.
- **`NotificationListView.swift:211-236,298-308`** — P1 — `filterChip` sans `.isSelected` (couleur-only) ; loading `ProgressView` non labellisé.

## 7.2 — Communautés
- **`CommunityListView.swift:205-310` (`VibrantCommunityCard`)** — P1 — `.onTapGesture` (pas un `Button`) → pas de `.isButton`, carte non combinée ; lock/globe (`:247`) + stats décoratifs. **FIX** : `Button` + combine + label « X, communauté privée, N membres ». Clear recherche (`:98`) sans label.
- **`CommunityDetailView.swift:144-201`** — P1 — Cœur (`:190`), ellipsis (`:181`), retour (`:144`) sans label ; lignes conversation `.onTapGesture` ; `channelRow` add/move icône+couleur-only.
- **`CommunityMembersView.swift:138-194`** — P1 — Ellipsis menu (`:183`, 32 pt) sans label ; invite (`:48`) sans label ; ligne non groupée + présence couleur-only.
- **`CommunityInviteView.swift:114-158`** — P1 — Checkmark « invité » (`:137`) icône+couleur-only sans label ; ligne non groupée.
- **`CommunityCreateView.swift:45,301,352`** — P1 — Retour / clear / `xmark` sans label ; état privé par swap d'icône couleur-only.

## 7.3 — JoinFlow
- **`JoinFlowSheet.swift:132-236`** — P1 — Transitions `.success`/`.error` non annoncées, focus non déplacé ; glyphes d'état décoratifs non masqués. **FIX** : `A11yAnnounce.screenChanged` au changement de phase.
- **`AnonymousJoinFormView.swift:264-323`** — P1 — Erreur (`:264`) non annoncée ; icônes de champ (`:162`) non masquées ; bouton submit désactivé sans hint des champs requis.
- **`JoinLinkPreviewView.swift`** — P2 — Stats non groupées ; expiry couleur+icône (texte sauve VoiceOver).

## 7.4 — Profil (sheets SDK)
- **`UserProfileSheet.swift:117-130,155-207,269-301`** — P1 — Overlay plein écran sans label/dismiss accessible ; bannière/avatar zoom `.onTapGesture` sans trait/hint ; onglets sans `.isSelected` ; présence couleur-only (texte sauve VoiceOver).
- **`FullscreenImageView.swift:35-83`** — P1 — Image sans `.accessibilityLabel` ; zoom/pan gestuel sans équivalent VoiceOver (`.accessibilityZoomAction`) ; close `xmark.circle.fill` (`:74`) sans label.
- **`ConnectionActionView.swift`** — ✅ **Référence** (chaque action labellisée avec le nom). P1 : boutons accept/décline 28×28 (`:111-138`) → `meeshyTapTarget()`.
- **`Conversation/ConversationScrollControlsView.swift:88-290`** — P1 — Bouton scroll-to-bottom composite sans label (fragments) ; play audio imbriqué `.highPriorityGesture` 36 pt sans label → `.accessibilityAction(named:"Lire l'audio")` ; points de frappe/recherche `repeatForever` non gardés + couleur-only.

---

# PARTIE 8 — FEUILLE DE ROUTE PRIORISÉE

> Ordre conçu pour maximiser le levier : l'infrastructure d'abord, puis les écrans cœur, puis le balayage systémique.

### Phase 0 — Infrastructure partagée (débloque tout le reste)
1. Créer `Theme/Accessibility.swift` : `reduceMotionAware`, `meeshyTapTarget`, `A11yAnnounce`, `MeeshyStatusDot`, `MeeshyA11yID`. (§1.2–1.5, 1.7)
2. Rendre `MeeshyFont` Dynamic-Type-aware + mapping des buckets. (§1.1)
3. **`ToastManager` : annonce VoiceOver + durée VO-aware.** (§1.6) ← plus gros gain unitaire.
4. `SkeletonView` : `.accessibilityHidden(true)` + Reduce Motion. (§1.6)
5. Étendre les tests a11y existants en harnais + ajout au gate `meeshy.sh test`. (§1.8)

### Phase 1 — Écrans cœur P0
6. **Conversation** : `BubbleStandardLayout` `.combine`→`.contain` + labels par élément ; `UniversalComposerBar` send label/id ; annonces message reçu/échec ; `BubbleDeliveryCheck` ; scrubber/play audio. (Partie 2)
7. **Stories** : auto-avance vs VoiceOver + actions pause/next/prev ; texte canvas exposé ; anneaux du tray ; Reduce Motion. (§6.7)
8. **Appels** : annonce appelant entrant ; raccrochage hors scroll ; cibles `FloatingCallPillView` ; identifiants. (§5.2)
9. **Feed** : `PostDetailView` actions bar ; cellules UIKit (`Text/Media/TopLevelComment`) ; tuiles média. (§6.1–6.4)
10. **Caméra / Téléchargement média / seek audio** : labels des contrôles. (§5.4)

### Phase 2 — Formulaires & feedback P0/P1
11. Toggles non labellisés Privacy/Notifications + jours DnD. (§4.1)
12. `.textContentType` partout (mots de passe, OTP, email, téléphone, noms). (§3.2, 3.4–3.5, 4.3–4.5)
13. Annonces succès/erreur de tous les formulaires async. (§1.3, 3.x, 4.x, 7.3)
14. PhotosPickers icône-only + QR 2FA + boutons format export + `StatsTimelineChart`. (§3.2, 4.3, 4.6–4.7)
15. Reduce Motion onboarding (P0 vestibulaire). (§3.1)

### Phase 3 — Balayage systémique P1
16. Migration Dynamic Type par foyers décroissants (mécanique une fois l'API posée). (§1.1)
17. `meeshyTapTarget()` sur tous les boutons-icônes < 44 pt. (§1.5)
18. `reduceMotionAware` sur tous les `repeatForever`/animations lourdes. (§1.2)
19. `.isSelected` sur tous les onglets/chips/pills ; `MeeshyStatusDot` pour présence/non-lus/accusés. (§1.7)
20. Combine + labels des lignes de liste restantes (contacts, communautés, sessions, participants).

### Phase 4 — Finition P2
21. `.accessibilityIdentifier` sur les contrôles restants.
22. Masquer les décoratifs (chevrons, icônes de section, waveforms).
23. Localiser les littéraux FR/EN hardcodés dans les labels a11y.
24. Supprimer le code mort (cellules de bulle, `OverlayMenu.swift`).

---

# PARTIE 9 — PATTERNS DE RÉFÉRENCE (à copier, déjà dans le repo)

Quand tu corriges un écran, calque-toi sur ces implémentations exemplaires :

| Domaine | Fichier de référence |
|---|---|
| Contrôles avec labels + 44 pt + `.isSelected` + raccourcis | `MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift`, `TimelineToolbar.swift`, `TimelineModeSwitcher.swift` |
| Header de média avec actions labellisées + hints | `StoryViewerView+Sidebar.swift` (`StoryHeaderView`, `languageScrollStrip`) |
| Menu d'actions (Button + label + `.isButton` + dynamicType + `.contain`) | `Views/ContextActionMenu.swift` |
| Lignes de résultat combinées + labels riches + hints | `Views/GlobalSearchView.swift` |
| Actions de connexion labellisées avec nom d'utilisateur | `MeeshyUI/Profile/ConnectionActionView.swift` |
| Élément combiné + label riche | `Views/AchievementBadgeView.swift`, `MeeshyUI/Notifications/NotificationRowView.swift` |
| Composer entièrement accessible + `reduceMotion` | `Components/UniversalComposerBar+Recording.swift` |

---

# PARTIE 10 — CHECKLIST DE VÉRIFICATION (Definition of Done)

Pour chaque écran corrigé, prouver :
- [ ] **VoiceOver** : balayer l'écran de gauche à droite — chaque contrôle a un nom, un rôle (`.isButton`/`.isSelected`), et un hint si l'action n'est pas évidente. Aucun « image », « bouton » nu, aucun nom de symbole SF brut.
- [ ] **Dynamic Type** : tester à `AX5` (le plus grand) — aucun texte tronqué/rogné, layout tient.
- [ ] **Reduce Motion** : activer le réglage — aucune animation en boucle, transitions instantanées/atténuées.
- [ ] **Cibles tactiles** : tout élément tappable ≥ 44×44 pt (Accessibility Inspector).
- [ ] **Couleur** : passer en niveaux de gris — aucun état (sélection/présence/erreur) perdu.
- [ ] **Annonces** : les résultats async (succès/erreur/réception) sont vocalisés sous VoiceOver.
- [ ] **Identifiants** : les contrôles clés ont un `accessibilityIdentifier` stable.
- [ ] `./apps/ios/meeshy.sh test` passe (incluant les tests a11y étendus).
- [ ] Audit Xcode **Accessibility Inspector** (audit automatique) : 0 warning critique sur l'écran.

---

*Fin du rapport. Toutes les entrées citent `fichier:ligne`. Aucun code n'a été modifié — ceci est un document d'audit et de remédiation.*
