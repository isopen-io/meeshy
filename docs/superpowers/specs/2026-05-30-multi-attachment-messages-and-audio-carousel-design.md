# Messages multi-pièces + carrousel audio — Design

**Date** : 2026-05-30
**Statut** : Validé (brainstorming), prêt pour plan d'implémentation
**Plateforme** : iOS (`apps/ios` + `packages/MeeshySDK`)

## Contexte & objectif

Aujourd'hui le composer iOS ne permet qu'**un seul vocal** en attente (`pendingAudioURL: URL?` est un singleton qui écrase l'enregistrement précédent), alors que la zone d'attachement horizontale (`pendingAttachmentsPreview`) gère déjà N images/vidéos/fichiers. L'objectif est de permettre **plusieurs pièces jointes** dans le composer (vocaux inclus), de les envoyer de façon cohérente, et de les afficher en **carrousels** dans la timeline.

Découverte structurante : la bulle Meeshy **sait déjà** rendre plusieurs pièces (grille `visualMediaGrid` + carrousel swipeable `BubbleCarouselView` via `AdaptiveHorizontalPager`), et la **synchronisation karaoké** transcription↔audio est **déjà développée** (`MediaTranscriptionView`, timestamps mot-à-mot disponibles de bout en bout : Whisper `word_timestamps=True` → gateway persiste `segments[].start/end` → SDK `MessageTranscription.segments[].startTime/endTime`). Le travail consiste donc majoritairement à **orchestrer l'existant**, pas à le réinventer.

## Principe directeur

**Le regroupement se fait à l'ENVOI (par type), pas à l'affichage.** Le composer accumule N pièces ; à l'envoi on partitionne par type et on émet **un message par groupe de type**. Un message audio multi-piste est **une seule** entité message portant `attachments: [audio, audio, audio]`. Conséquence majeure : **aucune** nouvelle logique de groupement de messages adjacents dans `MessageListViewController` (pas de clustering timeline).

Réutilisation maximale (cf. feedback `maximize_reuse_minimize_creation`) : on n'invente ni le player, ni le karaoké, ni les chips vitesse/temps, ni le `BubbleFooter`, ni le carrousel visuel.

## Décomposition en 6 lots

| Lot | Périmètre | Surface neuve | Risque |
|---|---|---|---|
| **A1** Composer multi-pièce | Supprimer le singleton `pendingAudioURL`, router l'audio via `pendingMediaFiles[id]` | Très faible | Faible |
| **A2** Envoi groupé par type | Partitionner `pendingAttachments` par type, 1 envoi par groupe, boucle d'upload unifiée | Moyen | Moyen (chemin d'envoi central) |
| **A3** OfflineQueue multi-audio | `enqueueAudios` (N fichiers → 1 OutboxRecord), dispatcher TUS multi-upload best-effort | Moyen | Moyen (SDK/outbox) |
| **A4** Bulle carrousel audio | Conteneur paginé N pistes, `AudioPlaybackManager` partagé, footer piste courante, dots, auto-advance | Élevé | Moyen (réutilise player + karaoké + footer) |
| **A5** Carrousel image/vidéo | Réutiliser `BubbleCarouselView` ; vidéo plein-inline puis retour à sa place | Faible | Faible |
| **A6** Priorité du geste | Pan horizontal du carrousel prioritaire sur répondre/forward jusqu'aux bords | Moyen | Moyen (gesture recognizers) |

---

## A1 — Composer multi-pièce (tuer le singleton)

Rendre l'audio identique aux autres médias : il vit dans `pendingMediaFiles[id]` comme image/vidéo.

- `ConversationComposerState` (`ConversationView.swift:120`) : supprimer `var pendingAudioURL: URL?`.
- `stopRecordingToAttachment()` (`ConversationView+AttachmentHandlers.swift:31`) : `composerState.pendingMediaFiles[audioAttachment.id] = url` au lieu de `pendingAudioURL = url`.
- `applyEditedAudio()` (`ConversationView.swift:171-173`) : supprimer `pendingAudioURL = editedURL` (la ligne `pendingMediaFiles[attachmentId] = editedURL` reste) ; lire `staleURL` depuis `pendingMediaFiles[attachmentId]`.
- `handleAttachmentPreviewTap()` cas `.audio` (`ConversationView+Composer.swift:627`) : `pendingMediaFiles[attachment.id]` (drop `?? pendingAudioURL`).

Aucun composant UI neuf : `pendingAttachmentsPreview` affiche déjà N tuiles audio (waveform + bouton X).

## A2 — Envoi groupé par type

`sendMessageWithAttachments()` envoie aujourd'hui **un** message avec `attachmentIds: [...]`. Refactor : partitionner `pendingAttachments` par type (`audio` vs `visual` = image|video|file), puis **un message par groupe non vide**.

Décisions figées :

1. **Ordre des groupes** = ordre d'ajout au composer (la première pièce de chaque type détermine la position du groupe).
2. **Texte** = message **séparé**, envoyé **après** les pièces jointes (en dernier). Ex. « légende + 3 vocaux (ajoutés en 1er) + 2 photos » → ① message audio (3 pistes), ② message photos (2), ③ message texte.
3. **Reply/forward reference** : posée sur le **premier** message envoyé uniquement (jamais dupliquée).
4. **Optimistic insert** : un `insertOptimisticMediaMessage` par groupe (chacun son `cid`/`tempId`), pour affichage instantané.
5. **`messageType`** : calculé par groupe (`.audio` pour le groupe audio, `.image`/`.video` pour le visuel).
6. **Boucle d'upload unifiée** : une seule boucle sur les pièces du groupe lisant `pendingMediaFiles[att.id]`, avec seeding cache qui switche sur `att.type` (audio → `CacheCoordinator.audio.store`, image → `images.store`, vidéo/fichier → `video.store`). Remplace la branche `if let audioURL` + boucle `where type != .audio` séparées actuelles.

## A3 — OfflineQueue multi-audio

Un message audio à N pistes hors-ligne doit persister N fichiers dans **un seul** `OutboxRecord` (atomicité « 1 message = N pièces »).

- Nouvelle API `OfflineQueue.enqueueAudios(sourceAudioURLs: [URL], ...)` ; `enqueueAudio` (mono) devient wrapper `enqueueAudios([url], ...)` (rétrocompat).
- **Write-ahead** : copier les N `.m4a` dans `Documents/pending-audio/<cid>/<index>.m4a` (sous-dossier par message).
- L'`OutboxRecord` audio porte un **tableau** de chemins locaux + durées par piste.
- `OutboxDispatcher` branche audio : TUS-upload des N fichiers en séquence, collecte des `attachmentIds`, puis **un** `message:send-with-attachments` avec le tableau complet.
- **Échec partiel = best-effort** : émettre le message avec les pistes uploadées avec succès, logger les échecs (les pistes ratées ne bloquent pas l'envoi). *Note : ce choix relâche l'atomicité stricte — follow-up possible : re-queue des pistes ratées.*
- **Garde-fou** : le write-ahead hors-ligne ne s'applique qu'au groupe **audio pur** (cohérent avec l'actuel `onlyAudio`). Le groupe visuel hors-ligne suit le chemin existant (autres types perdent leur URL locale au restart — comportement inchangé).

## A4 — Bulle carrousel audio (lot principal)

**Nouveau composant `AudioCarouselView`** (app-side, `Views/Bubble/` — orchestration UX produit, pas un atome SDK, cf. SDK purity rule). Il **orchestre** des pièces existantes :

- **Pager** : `AdaptiveHorizontalPager` (déjà utilisé par `BubbleCarouselView`) sur les attachments de type audio.
- **Un seul `AudioPlaybackManager` partagé** (SDK) pour toutes les pistes (pas un par tuile). Swiper change la piste affichée ; la lecture suit la piste active.
- Chaque page = `AudioPlayerView` (SDK) en mode piste : waveform + play + **chips % et vitesse à droite** (déjà présents) + **karaoké** `MediaTranscriptionView` câblé sur `currentTime` du manager partagé.
- **Dots** : indicateur de page (style `BubbleCarouselView`).
- **`BubbleFooter`** sous le pager (pas dans chaque page) : flags langue + heure + delivery + détail, reflétant la **piste courante**. Le flag switch change la langue de transcription/audio de la piste affichée.

Décisions figées :

1. **Fin de lecture** : enchaîner sur l'**audio suivant du fil** (lecture continue façon podcast) via le `ConversationAudioCoordinator` / `allAudioItems` existant (file cross-bulle).
2. **Swipe** = changer la piste affichée **et** la jouer depuis 0 (la piste précédente s'arrête ; reset à 0 à chaque arrivée).
3. **Transcription absente** (enrichissement Whisper en cours) : **masquer** la zone karaoké (zéro footprint) ; elle apparaît au delta socket `message:attachment-updated`.

**Wiring `BubbleStandardLayout`** : la boucle `ForEach(audioAttachments)` (qui empile aujourd'hui) devient, quand `audioAttachments.count > 1`, un seul `AudioCarouselView(attachments:)`. Si `count == 1`, conserver le chemin `AudioMediaView` actuel (zéro régression mono-audio).

**Réutilisation `allAudioItems`** : le param existant `allAudioItems: [ConversationViewModel.AudioItem]` de `AudioMediaView` alimente la file du manager partagé.

Pièces réutilisées (localisées) :
- `AudioPlaybackManager` — `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` (speed `PlaybackSpeed`, `cycleSpeed`, `currentTime`, `seek`).
- `MediaTranscriptionView` — `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTranscriptionView.swift` (karaoké, `activeIndex`, auto-scroll, tap-to-seek).
- `BubbleFooter` — `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift` (`BubbleFooterModel`, `BubbleFooterActions`).
- `AudioBubbleRouter` — `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift` (routage moteur partagé vs local).

## A5 — Carrousel image/vidéo (réutilisation)

Pour un message visuel multi-pièce, réutiliser **tel quel** `BubbleCarouselView` (+ `AdaptiveHorizontalPager`) — gère déjà aspect ratios, footer overlay, pause vidéo au changement de page.

Ajout unique : **vidéo en lecture → plein inline, puis retour à sa place à la fin**. État `expandedVideoId: String?` local au carrousel — au tap play sur une vignette vidéo, la cellule s'étend pour occuper toute la zone bulle (autres pages masquées) ; à la fin (ou tap pause/réduire) elle reprend sa taille de page. **Pas** de fullscreen modal.

## A6 — Priorité du geste de swipe

Le pan horizontal du carrousel (audio comme visuel) **consomme** le geste tant qu'on n'est pas au bord :

- Le pager intercepte le pan horizontal. Tant que `currentPage` n'est ni à 0 (swipe droite) ni au dernier (swipe gauche), le geste reste **interne** au carrousel ; le swipe-pour-répondre/forward de `BubbleSwipeContainer` ne se déclenche pas.
- Au **premier** élément + swipe droite continu (ou **dernier** + swipe gauche), le geste **cède** à `BubbleSwipeContainer`.
- Mécanique exacte (UIKit gesture dependency / `failure relationship` vs SwiftUI `highPriorityGesture` + seuil de translation, ou rebond de bord du `ScrollView` paginé) à arrêter au plan d'implémentation.

---

## Stratégie de test (TDD)

- **A1/A2** : tests d'état composer (`pendingMediaFiles` accumulation record/import/edit), tests de partitionnement par type, ordre d'envoi (groupes puis texte), pose de la reply sur le 1er message.
- **A3** : tests `enqueueAudios` (N fichiers → 1 record, sous-dossier `<cid>/`), dispatcher best-effort (1 échec sur 3 → message émis avec 2 pistes + log).
- **A4** : tests purs du builder de file/queue, sélection piste courante, masquage zone karaoké sans segments, auto-advance vers piste suivante puis audio suivant du fil. Tests de rendu (XCTest) pour le pager et le footer de piste courante.
- **A5** : test état `expandedVideoId` (expand au play, collapse à la fin).
- **A6** : tests de la logique de bord (consommation interne vs cession au bord) isolée du geste réel.

Contraintes connues (mémoire projet) : MeeshyUI `defaultIsolation = MainActor` → types purs `nonisolated` + tests non-`@MainActor` ; scheme `MeeshySDK-Package` pour les tests SDK ; nouveaux fichiers `.swift` app = entrées pbxproj manuelles (objectVersion 63).

## Hors périmètre (YAGNI)

- Groupement de messages adjacents à l'affichage (clustering timeline) — explicitement écarté par le principe « groupement à l'envoi ».
- Édition d'un vocal déjà envoyé.
- Réordonnancement manuel des pièces dans le composer.
- Mix de types dans une même bulle (chaque message reste mono-type).
