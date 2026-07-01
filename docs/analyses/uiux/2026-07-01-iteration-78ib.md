# UI/UX Analysis — Iteration 78ib (2026-07-01)

## Scope
**iOS exclusivement** (suffixe `i` — Web et Android couverts par d'autres agents).
Suffixe `b` : le numéro `78i` est déjà pris par deux itérations parallèles en vol
(PR #1168 Dynamic Type link-preview, PR #1166 tokenize semantic colors). Cette itération
est donc **`78ib`** (convention de désambiguïsation `b`, comme `42b`/`44b`/`57wb`), sur une
**surface disjointe** — aucun conflit de code.

Thème : **i18n du menu overlay de message** (`MessageOverlayMenu.swift`) — la feuille de
long-press la plus utilisée de l'app (aperçu de bulle + actions rapides + panneau détail)
affichait **~10 chaînes françaises hardcodées** visibles par tous les utilisateurs, quelle que
soit leur langue. Itération bornée à **un seul fichier de production**
(`MessageOverlayMenu.swift`) + le catalogue de localisation (`Localizable.xcstrings`).

Vérification : la CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2) sert de
build de validation (SwiftUI ne compile pas sous Linux). Aucun test neuf : swap purement
mécanique de littéraux → clés de catalogue, aucune logique modifiée. Les clés réutilisées
(`action.reply`, `action.copy`, `action.delete`, `context.pin`, `context.unpin`) sont déjà
exercées par les vues sœurs (`ConversationView+MessageRow`, `ConversationListView+Overlays`).

## Contexte / point de départ
`MessageOverlayMenu` (`apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`) est
l'overlay affiché au long-press d'un message (aperçu fidèle de la bulle + barre d'emojis +
quick-action bar + panneau détail scrollable). Le panneau détail (`overlayActions` →
`MessageDetailSheet`, rendu via `Text(item.label)` à `MessageDetailSheet.swift:388`) et les
sous-lecteurs audio/vidéo affichaient **du français en dur**, non traduit :

### Panneau détail — `overlayActions` (grille d'actions visible)
- `label: "Repondre"`, `"Discussion"`, `"Copier"`
- `label: message.pinnedAt != nil ? "Desepingler" : "Epingler"`
- `label: isStarred ? "Retirer des favoris" : "Ajouter aux favoris"`
- `label: "Modifier"`, `"Supprimer le media"`

### Aperçu de bulle — `previewSenderHeader`
- `name = isMe ? "Moi" : …` (nom de l'expéditeur affiché dans l'en-tête de l'aperçu)

### Sous-lecteurs `PreviewAudioPlayer` / `PreviewVideoPlayer` (VoiceOver)
- Audio : `.accessibilityLabel(isPlaying ? "Mettre en pause" : "Lire l'audio")`,
  `.accessibilityHint("Audio de \(…)")`
- Vidéo : `.accessibilityLabel(isPlaying ? "Mettre la vidéo en pause" : "Lire la vidéo")`

L'itération 3 (2026-06-08, survey a11y) avait **listé** des `accessibilityLabel` français figés
à travers l'app mais **n'avait pas corrigé** `MessageOverlayMenu`. Aucune itération 45i→77i n'y
avait touché.

## iOS Findings

### i18n — littéraux français → clés de catalogue (SSOT réutilisé quand dispo)
- **Réutilisation SSOT** (5 clés existantes, 0 traduction neuve) :
  - `"Repondre"` → `action.reply` (déjà utilisé par `ConversationView+MessageRow`)
  - `"Copier"` → `action.copy` ; `"Supprimer"` famille → `action.delete` (non touché ici)
  - `"Epingler"`/`"Desepingler"` → `context.pin` / `context.unpin` (déjà utilisés par
    `ConversationListView+Overlays`)
- **Nouvelles clés (11) ajoutées ×5 langues** (de/en/es/fr/pt-BR) :
  `message.action.thread`, `message.action.star.add`, `message.action.star.remove`,
  `message.action.edit`, `message.action.deleteAttachment`, `common.me`,
  `media.pauseAudio`, `media.playAudio`, `media.audioHint` (interpolation `%@`),
  `media.pauseVideo`, `media.playVideo`.
- **`media.playVideo` promue au catalogue** : la clé était jusqu'ici *code-only* (référencée
  par le bouton play de `PreviewVideoPlayer` avec un `defaultValue` anglais mais absente du
  catalogue → EN/ES/DE/pt-BR tombaient sur le `defaultValue`). Ajoutée avec traductions →
  **corrige aussi** le bouton play overlay existant (ligne 1222) par effet SSOT.
- **Interpolation** : `media.audioHint` (`Audio de %@`) suit le pattern établi
  `String(format: String(localized:defaultValue:bundle:), arg)` (cf. `ContactsListTab`,
  `SharePickerView` en 77i).

### Gain
- Parité linguistique : un utilisateur EN/ES/DE/pt-BR ne voit plus de français dans le menu de
  message le plus utilisé de l'app (grille d'actions Répondre/Copier/Épingler/Favoris/Modifier)
  ni via VoiceOver dans les lecteurs audio/vidéo de l'aperçu.
- Cohérence des labels d'action avec la barre inline (`ConversationView+MessageRow`) qui utilise
  déjà `action.reply`/`action.copy` — plus de divergence FR-figée vs clé.

## Conforme (vérifié — ne pas re-flagger)
- `"Audio"` (fallback nom de fichier audio, `PreviewAudioPlayer`) et `"Normal"` (débit de
  lecture 1×, menus audio + vidéo) : **termes universels identiques dans les 5 langues cibles**
  (fr/en/es/de/pt-BR) → localiser n'apporte aucune valeur et ajoute du bruit (principe
  d'épuration). **Laissés intacts, exclusion documentée.**
- Les `String(localized:)` déjà en place (`media.skipBack5s`, `media.skipForward5s`,
  `media.playbackPosition`, `media.playVideo` bouton, `date.yesterday.at`) — conservés.
- Couleurs : palette déjà tokenisée (`MeeshyColors.indigo*`, `.success`, `.warning`, `.error`,
  `.info`), accent conversation déterministe (`overlayAccent`/`bubbleAccentHex`) préservé.
- Chrome verre (`.ultraThinMaterial` + tonalité + liseré accent) de `panelBackground` /
  `dismissBackground` : cohérent, hors-scope de cette itération i18n.

## Anti-repetition check
Vérifié contre : itération 3 (survey a11y — a listé des labels FR sans corriger
`MessageOverlayMenu`), 77i (`SharePickerView` — fichier distinct, mêmes patterns SSOT), 71i
`ContextActionMenu` (PR #1157 en vol — **fichier distinct** ; ses factories `.copy()/.edit()/…`
ne sont PAS touchées ici). Aucune itération n'avait localisé les chaînes visibles de
`MessageOverlayMenu` ni promu `media.playVideo` au catalogue.

## Périmètre délibérément exclu (ne pas re-flagger)
- `ContextActionMenu.swift` (factories `ContextAction.reply/translate/copy/delete/edit` à
  défauts FR) — **couvert par PR #1157 en vol** (« localize message quick-action menu »).
  NE PAS toucher.
- Les polices figées `.system(size:)` de `MessageOverlayMenu` (Dynamic Type) — relèvent du lot
  dédié « grandes surfaces polices figées », hors-scope de cette itération i18n.

## Différés (pour itérations suivantes — iOS)
- Toasts français figés (audit explore 78ib) hors PRs en vol : `FeedView+Attachments`
  (`showSuccess`/`showError` publication post/audio ×~6), `RequestsViewModel`,
  `DiscoverViewModel`, `StoryViewerView`/`+Sidebar` (erreurs publication/partage).
- Dynamic Type grandes surfaces (`CallView`, `StoryViewerView+Content`) — vérifier collision
  avec les nombreuses PR Dynamic Type en vol (#1137/#1139/#1145/#1150/#1155/#1165/#1168).
- Glass adoption (reste) : `MessageOverlayMenu.panelBackground` / `dismissBackground` via
  `AdaptiveGlassContainer` (lot dédié, distinct de cette itération i18n).

## Status : ⏳ développement terminé — push + CI ; merge dans main après CI verte —
voir plan 2026-07-01-plan-iteration-78ib
