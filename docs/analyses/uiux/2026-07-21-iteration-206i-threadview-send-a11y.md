# Iteration-206i — ThreadView : label VoiceOver du bouton d'envoi de réponse (WCAG 4.1.2)

## Contexte

`ThreadView` (`apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`) est l'écran de
fil de discussion (réponses à un message parent), présenté depuis `ConversationView`
(l. 642). Son `composerBar` (l. 180-231) contient un champ de saisie de réponse
(`TextField`, placeholder `thread.reply.placeholder`) et un **bouton d'envoi icône-seule**
(`paperplane.fill`, l. 208-225) — l'action primaire de l'écran.

## Problème (accessibilité — WCAG 4.1.2 Name, Role, Value)

Le bouton d'envoi était **icône-seule sans `.accessibilityLabel`** :

```swift
Button {
    HapticFeedback.light()
    sendReply()
} label: {
    if isSending {
        ProgressView().tint(Color(hex: accentColor))
    } else {
        Image(systemName: "paperplane.fill")
            .font(.callout.weight(.semibold))
            .foregroundColor(replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? theme.textMuted : Color(hex: accentColor))
    }
}
.disabled(isSending || replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
```

VoiceOver annonçait ce bouton comme un simple « Bouton » sans nom — l'action primaire
(envoyer la réponse) était **invisible à l'oreille**. C'est un défaut réel et
utilisateur-facing (le fil de discussion est ouvert depuis n'importe quelle conversation).

Contexte : un balayage exhaustif (agent Explore) a confirmé que l'app est **massivement
remédiée** pour ce pattern — la quasi-totalité des boutons icône-seule de `Features/**`
portent déjà `.accessibilityLabel(...)`, et les boutons imbriqués dans des lignes
agrégées sont volontairement `.accessibilityHidden(true)` avec action ré-exposée au rotor
(idiome 183i : `GlobalSearchView`, `CommunityLinksView`, `LinksHubView`,
`StatusBubbleOverlay`). Le bouton d'envoi de `ThreadView` faisait partie des rares
exceptions genuines restantes, et la plus visible (action primaire).

## Correctif

Ajout d'un `.accessibilityLabel` sur le `Button` (après `.disabled(...)`), en **réutilisant
le namespace i18n existant du fichier** (`thread.reply.*`, cf. `thread.reply.placeholder`
l. 194) :

```swift
.accessibilityLabel(String(localized: "thread.reply.send-a11y",
    defaultValue: "Envoyer la reponse", bundle: .main))
```

Le label s'applique aux deux états du label (envoi en cours / prêt) — c'est le nom stable
du contrôle. L'état désactivé (champ vide ou envoi en cours) reste annoncé automatiquement
par le trait `.disabled()` natif. `defaultValue` en français : `sourceLanguage` du catalogue
= `fr`, et le fichier utilise déjà des défauts français (`thread.reply.placeholder` =
« Repondre... »).

## Portée & sûreté

- **1 fichier**, +1 ligne, 0 logique / 0 réseau / 0 layout / 0 changement visuel /
  0 test neuf.
- **Clé i18n inline** (`thread.reply.send-a11y`), 0 édition `.xcstrings` : convention du
  catalogue (`sourceLanguage: fr`, 1278 clés, la quasi-totalité des clés d'app sont
  inline-only et auto-extraites par Xcode au build — `thread.reply.placeholder`,
  `contacts.discover.email.send-a11y`, etc. sont toutes absentes du catalogue). Parité
  exacte avec l'approche « clés i18n inline (0 xcstrings) » de 185i.
- Header, `sendError`, `TextField`, logique `sendReply`, ViewModel : **inchangés**.
- Fichier **absent de toute PR ouverte** (impossible de vérifier via GitHub MCP dans ce
  run headless ; `ThreadView` non touché par les commits récents de l'essaim).

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Pas de toolchain Swift dans l'environnement Linux d'exécution → vérification par
  inspection. `String(localized:defaultValue:bundle:)` = Foundation (toujours dispo,
  déjà utilisé dans le même fichier l. 51/189/194). Modifier purement additif
  (`.accessibilityLabel`) — aucun risque de régression de compile ou de layout.

## Statut

✅ Résolu. Ne plus re-flagger le bouton d'envoi de `ThreadView` pour l'absence de label
VoiceOver (soldé 206i).

## Pistes 207i+

Exceptions genuines restantes (in-use, WCAG 4.1.2), identifiées par l'agent Explore,
1 par itération, vérifier collision essaim avant :
- `AttachmentLoadingTile.swift:29` — bouton annuler-upload (`xmark`, icône-seule, sans
  label). Réutilisé par `ConversationView+Composer.swift:750`,
  `FeedView+Attachments.swift:373`/`:974` (composer message + composer feed) → 1 fix couvre
  2 surfaces. **Meilleur candidat 207i** (fort réemploi).
- `ConversationView.swift:1244` — bouton fermeture bannière d'erreur (`xmark.circle.fill`).
- `ConversationInfoSheet.swift:492` (effacer recherche membre) + `:804` (fermer feuille
  messages épinglés) — même fichier, 2 gaps.
- `OnboardingStepViews.swift:1089`/`:1121` — pickers photo (`camera.fill`), écran vu une
  fois (priorité basse).

Notes (NE PAS re-flagger — non-gaps vérifiés) :
- `MessageDetailSheet.swift` (531/659/1855/1940) : **code mort** (remplacé par
  `MessageMoreSheet` + `MessageDetail/*`, jamais instancié).
- `UniversalComposerBar.swift:868` (`toolbarButton`) : défini mais jamais appelé (mort).
- `CallEffectsOverlay.swift` toolbarButton : état déjà exposé via `.accessibilityValue`
  (Activé/Désactivé) — ajouter `.isSelected` serait redondant + sémantiquement ambigu
  (conflate « panneau ouvert » et « filtre activé »). Laisser tel quel.
- `LoginView.swift:547-576` `environmentSelector` : sélecteur couleur-seule sans trait,
  mais **gaté `if Self.isSimulator`** (dev/QA only, jamais shippé aux utilisateurs réels).
- `MemberManagementSection.swift` : **non référencé** (dead code) — ne pas y investir de
  polish (l'état vide fait-main `person.slash` reste, mais invisible aux utilisateurs).
