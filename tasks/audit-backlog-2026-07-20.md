# Backlog audit transverse

## LANE: Auth & session (P0 magic link, mapping erreurs 401)
_Tout le noyau auth : MeeshyApp.swift, AuthManager.swift, APIClient.swift, MeeshyError.swift, E2ESessionManager.swift, SecurityView.swift, UserProfileViewModel.swift. Ces fichiers s'entre-appellent (teardown de session, mapping 401, catches APIError morts) — un seul worktree évite tout conflit. Aucune autre lane ne touche ces fichiers._
- [P0] Magic link tapé alors qu'on est déjà connecté (compte A) : applySession(B) sans teardown — caches de A sous la session B, sockets avec le JWT de A, clés E2EE de A conservées. Guard !isAuthenticated + logout complet avant validateMagicLink.
  fichiers: apps/ios/Meeshy/MeeshyApp.swift, packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift (area auth-session)
- [P1] Mauvais mot de passe / code 2FA → 'Session expirée' au lieu de 'Identifiants invalides' : tout 401 écrasé en .sessionExpired, handleUnauthorized invoqué sur un échec de LOGIN. Mapper 401 des endpoints auth → .invalidCredentials en conservant le message serveur.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift, packages/MeeshySDK/Sources/MeeshySDK/Errors/MeeshyError.swift (area auth-session)
- [P1] clearSessions() au logout supprime les clés E2EE avec account:nil (currentUser déjà nil) alors qu'elles sont namespacées par userId → vieilles clés survivantes + identity key régénérée = DMs indéchiffrables au re-login. Capturer le userId sortant avant le wipe.
  fichiers: apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift, packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift (area auth-session)
- [P1] Cold start avec JWT expiré + réseau dégradé : splash bloqué jusqu'à 60s derrière refreshSession awaité sur le chemin critique alors que session+liste sont en cache. Borner (race timeout 3-5s) ou détacher le refresh proactif.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift (area auth-session)
- [P1] Systémique : les catch `APIError.serverError` ne matchent JAMAIS (APIClient ne lance que MeeshyError) — flush handler MeeshyApp:281 (4xx rejoué à l'infini), SecurityView:1034/957/1006 (messages serveur perdus, code SMS incorrect illisible), UserProfileViewModel:80 (isBlockedByTarget jamais posé), AuthManager:254 et 5 autres sites (code mort). Matcher MeeshyError.server partout.
  fichiers: apps/ios/Meeshy/MeeshyApp.swift, apps/ios/Meeshy/Features/Main/Views/SecurityView.swift, apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift, packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift (area auth-session)
- [P1] UserProfileViewModel:43 lit l'état 'bloqué' depuis le snapshot de login (currentUser.blockedUserIds) au lieu de BlockService (source canonique injectée mais inutilisée) — un blocage en session s'affiche non-bloqué à la réouverture.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift (area settings-profile)
- [P2] AuthManager hygiène : (a) logout serveur D5 — token lu APRÈS suspension, retries systématiquement sans Authorization → capturer token avant le wipe ; (b) revalidation background appelle AuthService.shared.me() en dur au lieu du seam authService injectable.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift (area auth-session)
- [P2] `_ = try? await OfflineQueue.bootRecovery()` au boot : si ça lève, les lignes outbox .inflight post-crash restent invisibles du flush pour toujours, sans log. do/catch + retry au foreground.
  fichiers: apps/ios/Meeshy/MeeshyApp.swift (area quality-crashes)

## LANE: Profil — édition, avatar & queue settings (2 P0)
_Chaîne complète d'édition de profil : upload avatar, save online/offline, dispatch outbox, queue settings. Les deux P0 et leurs corollaires vivent dans ces fichiers, disjoints des autres lanes (le handler MeeshyApp:281 est traité en lane Auth)._
- [P0] Changer d'avatar échoue TOUJOURS : AttachmentUploader décode une clé `url` alors que le gateway renvoie `fileUrl`. Décoder fileUrl ou réutiliser UserService.uploadImage.
  fichiers: apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift (area settings-profile)
- [P0] Édition de profil offline enfilée vers `/users/me/profile` (route inexistante, la vraie est /users/me) → 404 rejoué à l'infini, queue settings bloquée, UI optimiste ment ('sera synchronisée').
  fichiers: apps/ios/Meeshy/Features/Main/Views/ProfileView.swift (area settings-profile)
- [P1] PATCH /users/me de l'outbox envoie une clé `avatar` que le Zod .strict() du gateway rejette (400) — dispatcher vers PATCH /users/me/avatar ou étendre le schema.
  fichiers: apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift (area settings-profile)
- [P1] Impossible d'effacer langue régionale/custom/bio : '' converti en nil (= champ omis) côté requête ET optimiste — distinguer 'inchangé' (nil) de 'effacé' (envoyer '').
  fichiers: apps/ios/Meeshy/Features/Main/Views/ProfileView.swift, apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift (area settings-profile)
- [P2] SettingsActionQueue : un item définitivement en échec bloque à jamais tout le pipeline (FIFO break, ni attempts ni TTL) — ajouter maxAttempts + drop comme OutboxFlusher.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Persistence/SettingsActionQueue.swift (area settings-profile)
- [P2] Chemin offline du save profil : try? JSONEncoder().encode silencieux — pas d'enqueue, pas de toast, pas de rollback de l'optimiste déjà appliqué.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ProfileView.swift (area settings-profile)

## LANE: Liste conversations — données, sync & cache
_Tous les défauts data de la liste vivent dans ConversationListViewModel.swift + CoreModels.swift + GRDBCacheStore.swift (l'item .expired s'y greffe car sa branche VM est dans le même fichier). Les défauts purement vue sont dans une lane séparée à fichiers disjoints._
- [P1] pullToRefresh détruit L1+L2 (conversations, messages, stories, profils…) AVANT le fetch : un pull offline/échoué vide tous les caches → cold start offline = app vide. Fetch-then-replace obligatoire.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift (area conversations-list)
- [P1] Prisme mort sur la preview du dernier message : lastMessageTranslations jamais peuplé (aucun writer), resolvedLastMessagePreview retombe toujours sur l'original. Câbler la population (REST toConversation + bump socket) ou supprimer le plumbing.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift, apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift (area conversations-list)
- [P1] Le bump socket conversationUpdated laisse tous les champs compagnons stales (senderName, attachments, flags éphémères) : mauvais auteur, pièce jointe fantôme, nouveau message résumé 'Vue unique'. Réinitialiser les compagnons au changement de lastMessageId (idem ConversationSyncEngine.handleNewMessage).
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift (area conversations-list)
- [P2] Offline > 24h : GRDBCacheStore.load retourne .expired en RETENANT les données présentes en L2 → fullSync échoue → liste vide + erreur alors que tout est sur disque. Faire porter les données par le cas expiré + bannière offline.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift, apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift (area offline-instant)
- [P2] La recherche matche c.name et ignore userState.customName : une conversation renommée localement est introuvable par son nom affiché.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift (area conversations-list)
- [P2] handleForegroundReturn : guard isCacheValid inversé — le refresh stories est court-circuité précisément après >30s en background (le cas utile).
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift (area conversations-list)

## LANE: Conversation ouverte — VM, envoi & actions
_ConversationViewModel.swift, ConversationView.swift, ConversationView+MessageRow.swift et ConversationStateStore.swift sont trop entrelacés (perf/observation, envoi, actions overlay) pour être répartis : un seul worktree. 8 items après fusions._
- [P1] loadOlderMessages est réseau-d'abord : le glissement de fenêtre GRDB est dans le do après le fetch REST — pagination morte offline. Appeler messageStore.loadOlder avant le réseau (cache-first) ou dans le catch.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift (area messaging-ui)
- [P1] retryMessage ne re-transmet que content+replyToId : média avec légende renvoyé = message texte-seul côté serveur ; média sans légende = bulle bloquée sur l'horloge (retry rejeté après flip .queued). Relire attachments/flags du record échoué.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift (area messaging-ui)
- [P1] Sur-observation : ConversationView s'abonne au ConversationListViewModel ENTIER via @EnvironmentObject (churn de toute la liste re-render l'écran) + typingObserver observe les 33 @Published du StateStore ('ONLY typing' mensonger). Owner non-publiant + TypingState extrait.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationView.swift, apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift (area perf-rerender)
- [P2] originalLanguage 'fr' codé en dur sur 4 chemins de repli d'envoi (record offline, socket fallback, outbox retry) au lieu de composeLanguage — un message anglais renvoyé après échec est traduit comme du français pour tous.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift (area messaging-ui)
- [P2] failedMessageBar jamais monté (code mort) + delete d'un message échoué en ligne = 404 → markUndeleted, le message ressuscite : plus aucun chemin pour purger un message échoué. Brancher removeFailedMessage au menu quand .failed && serverId==nil.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift, apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift (area messaging-ui)
- [P2] Actions overlay : 'Copier' copie toujours msg.content original au lieu de la traduction affichée (2 chemins) + fallback du picker de réaction sur messages.first (le PLUS ANCIEN) si l'id n'est plus résolvable — réaction posable sur le mauvais message.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationView.swift, apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift (area messaging-ui)
- [P2] État monolithique/dupliqué : VM 53 @Published observé en @StateObject (chaque mutation = full body) + 6 @Published dormants dupliqués dans ConversationStateStore (double source de vérité piège). Supprimer les props mortes, poursuivre le split staged / @Observable.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift, apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift (area perf-rerender)
- [P3] ForwardPickerSheet présentée sans ré-injection de StatusViewModel (@EnvironmentObject lu au rendu) — pattern de crash à travers sheet documenté par le projet ; ajouter .environmentObject.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationView.swift (area quality-crashes)

## LANE: Feed social — Prisme, durabilité offline & compteurs
_FeedPostCard/FeedViewModel/FeedModels/FeedView/PostDetailViewModel/FeedCommentsSheet forment un graphe de fichiers inséparable (l'item 'chemins durables morts' les traverse tous). L'élection autoplay des réels y est incluse car son fix vit dans FeedView.swift._
- [P1] Prisme violé : effectiveContent dérive la langue de translations.keys.first (ordre non déterministe) sans court-circuit 'original ∈ préférées' — un post FR s'affiche traduit EN à un francophone. Même racine : clearTranslationOverride ne consulte que la 1re langue (case-sensitive). Utiliser post.displayContent / resolved() partout.
  fichiers: apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift, apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift (area social-feed)
- [P1] Chemins OfflineQueue des likes/commentaires/bookmarks = code mort (0 call site, T10b/T10c) ; les vues font socket+REST avec rollback → offline, like/commentaire perdus. sendReply idem (REST direct, ni optimiste ni queue). Brancher les vues sur les chemins durables ou supprimer le plumbing mensonger.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift, apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift, apps/ios/Meeshy/Features/Main/Views/FeedView.swift, apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift (area social-feed)
- [P1] Codable de FeedPost droppe 8 compteurs d'engagement + isBookmarkedByMe/isRepostedByMe : tout rendu cache-first (fenêtre fresh 5 min, offline) affiche des stats à 0 et perd l'état enregistré/repartagé. Ajouter aux CodingKeys avec decodeIfPresent.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift (area social-feed)
- [P1] Élection d'autoplay des réels du feed via GeometryReader+.onPreferenceChange dans un ScrollView — ne re-fire pas au scroll sur iOS 18+ (piège documenté au même package) : élection figée, réel joue hors écran. Doubler d'un chemin onScrollGeometryChange.
  fichiers: apps/ios/Meeshy/Features/Main/Views/FeedView.swift, apps/ios/Meeshy/Features/Main/Views/ReelFeedVisibility.swift (area reels-video)
- [P2] La feuille de commentaires du feed/réels n'affiche que les 3 commentaires embarqués (top-3 gateway) alors que le titre annonce le total : jamais de fetch complet ni pagination, cache post-<id> prefetché ignoré.
  fichiers: apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift (area social-feed)
- [P2] FeedView états optimistes : (a) re-seeding des flags jamais déclenché quand le refresh renvoie les mêmes ids (FeedPost.== id-only) → icône repartage éteinte ; (b) compteur partages bumpé sans rollback quand l'API échoue + toast erreur pendant que la share sheet s'ouvre.
  fichiers: apps/ios/Meeshy/Features/Main/Views/FeedView.swift (area social-feed)
- [P2] Commentaires : le handler socket comment:added du feed perd media/effectFlags/traduction (ligne vide pour un commentaire média) + le drapeau 'langue cible' affiche toujours la 1re langue préférée même quand la résolution a matché la 2e/3e. Mapper le payload complet et stocker la langue résolue.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift, apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift (area social-feed)
- [P2] Pagination morte après chargement 100% cache : retour .fresh laisse nextCursor=nil et loadMoreIfNeeded l'exige non-nil — infinite scroll stoppé en silence (idem loadComments du détail). Fetch avec cursor dérivé du dernier élément.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift, apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift (area social-feed)

## LANE: Stories — interactions, modèle & publication
_Viewer, VM, modèles et service d'interaction stories : fichiers Story* exclusifs à cette lane. StatusEntry.timeAgo s'y greffe (même fichier StoryModels.swift que le merge lossy)._
- [P1] Réaction story : changement d'emoji = 409 REACTION_LIMIT_REACHED jamais géré (catch avaleur) — UI optimiste garde l'emoji refusé et gonfle le compteur sans rollback. Remonter un Result + snapshot/rollback.
  fichiers: apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift, apps/ios/Meeshy/Features/Main/Services/StoryInteractionService.swift (area stories)
- [P1] Commentaires/réactions story en fire-and-forget sans OfflineQueue ni rollback (offline : succès affiché puis perte silencieuse) + échec d'upload du média de commentaire avalé par try? (commentaire publié sans média). Router par OfflineQueue + do/catch avec rollback du temp_.
  fichiers: apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift (area stories)
- [P2] mergingTextObjectTranslations reconstruit StoryItem en droppant viewedAt/updatedAt/impressionCount — perte persistée en cache à chaque story:translation-updated, régresse le curseur delta R8. Passer les 3 champs + test round-trip complet.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift (area stories)
- [P2] StatusEntry.timeAgo re-forge un temps relatif français non localisé et timeRemaining retourne 'expired' anglais en dur — utiliser RelativeTimeFormatter (même module, déjà utilisé par StoryItem).
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift (area sdk-purity)
- [P2] Publish : un média foreground sans asset chargé est silencieusement sauté (ni log ni garde) → calque invisible chez tous les viewers. Symétriser avec la branche audio (log + throw/retrait de l'objet).
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift (area stories)
- [P2] Realtime asymétrique : reactionCount se re-dérive mid-slide mais pas commentCount, et l'overlay ouvert ne reçoit jamais les commentaires socket. Ajouter l'adaptiveOnChange miroir + onReceive(commentAdded).
  fichiers: apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift, apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift (area stories)
- [P2] Notification story tapée hors-ligne → écran 'story expirée' pour une simple erreur réseau. Discriminer 404 vs erreur réseau (état offline + retry).
  fichiers: apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift (area stories)
- [P3] Trois pipelines de publication morts et piégés : cover repost-composer (repostOfId perdu, slideImages mal keyés), publishStory/publishStorySingle (bypassent E5, nullifieraient les médias), handlePublishTap/StubOnlinePublisher/StoryVisibility divergent du gateway. Supprimer ou aligner.
  fichiers: apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift, apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift, packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+OfflinePublish.swift (area stories)

## LANE: Réels & moteur vidéo partagé
_SharedAVPlayerManager + ses surfaces (ReelFeedVideoSurface, ReelsPlayerView, ConversationMediaGalleryView, ReelsViewModel) partagent l'état global player/session/mute : impossible de les séparer sans conflit. L'élection autoplay (FeedView) est en lane Feed._
- [P1] Tracking de consommation vidéo mort depuis l'origine : load() → cleanup() remet attachmentId à nil que tous les appelants posent AVANT load — reportWatchProgress ne fire jamais (aucun POST watched, aucune barre de progression). Passer attachmentId à load().
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift (area reels-video)
- [P1] Session audio & mute globaux fuités : l'autoplay MUET du feed active .playback+.duckOthers jamais relâché (musique de l'utilisateur duckée indéfiniment, même en background) ET force isMuted=true global non resetté → la galerie de conversation joue ensuite en silence. Ne pas prendre la session en muet + intention de mute par surface.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift, apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift (area reels-video)
- [P1] Prisme violé pour les réels audio : autoSelectPreferredAudioLanguage itère les TTS dans l'ordre du payload sans court-circuit sur la langue originale ni ordre de priorité utilisateur — un audio FR est auto-basculé sur le TTS EN. Reprendre la logique de FeedPost.resolved.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift (area reels-video)
- [P1] Observation 5-10 Hz du SharedAVPlayerManager : ReelFeedVideoSurface (cellules feed), ReelVideoView (pager) et la galerie (racine + pages) posent @ObservedObject sur le singleton qui publie currentTime à chaque tick — toutes les surfaces re-rendent en continu, contournant .equatable(). Scoper via onReceive $activeURL/$player.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift, apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift, apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift (area perf-rerender)
- [P2] finalizeReelSession lit inconditionnellement le moteur vidéo même pour un réel AUDIO/IMAGE : watchMs du dernier réel vidéo attaché à la mauvaise session (playCount/vues qualifiées gonflés) ; le watch-time audio jamais attaché.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift (area reels-video)
- [P2] Teardown/pause incorrects : fermeture du viewer sans stop du moteur si la page vidéo a été recyclée (AVPlayer + session duckOthers survivent) ; et onDisappear pause sur simple match d'URL sans vérifier isActive (surface repost inactive fige la carte active).
  fichiers: apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift, apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift (area reels-video)
- [P2] Un échec réseau transitoire de fetch tue définitivement la pagination des réels : catch sans log pose hasMore=false que rien ne remet à true. Logger + garder le cursor pour retry.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ReelsViewModel.swift (area reels-video)
- [P2] Cold start du viewer réels : ProgressView au lieu d'un skeleton (violation Instant App).
  fichiers: apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift (area reels-video)

## LANE: Images & viewers SDK (CachedAsyncImage, Document/Code viewers)
_CachedAsyncImage + les viewers image/document/code : le fix d'injection de policy, l'autoLoad fullscreen et la dé-observation ThemeManager s'entrecroisent dans ces fichiers. La partie audio (AudioPlayerView) est en lane Audio pour garder les fichiers disjoints._
- [P1] Fullscreen image : le gate de policy réseau n'est jamais overridé par le tap manuel (contrat §14.1 non implémenté) → spinner infini sans fetch ni retry en Low Data Mode. Ajouter autoLoad à CachedAsyncImage, forcé par ImageFullscreen.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/ImageViewerView.swift, packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift (area media-pipeline)
- [P1] Violation SDK Purity : MediaDownloadPolicy (décision 'quand auto-DL') + cascade cache→policy→download vivent dans le SDK en lisant les singletons produit — injecter la décision en paramètre opaque (précédent VideoAvailabilityResolver). Absorbe le doublon isLocalFileURL/gate copié 3×.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift (area sdk-purity)
- [P1] DocumentViewerView : 2 boutons de suppression destructifs, fermer et télécharger sans aucun accessibilityLabel (0 label pour 11 icônes).
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentViewerView.swift (area i18n-a11y)
- [P2] ImageViewerView, DocumentViewerView, CodeViewerView : @ObservedObject ThemeManager.shared dans des leaf views de bulle — remplacer par @Environment(colorScheme)/isDark primitif (règle Zero Unnecessary Re-render).
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/ImageViewerView.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentViewerView.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/CodeViewerView.swift (area perf-rerender)
- [P3] CachedBannerImage décode sans maxPixelSize dérivé de la taille d'affichage (cap générique 1200px) — passer la taille rendue comme l'avatar.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift (area perf-rerender)
- [P3] PhotoLibraryManager.saveFromURL décide image/vidéo par sous-chaîne d'URL (contains('video')) — router sur un kind/mimeType explicite comme MediaSaveRequest.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryManager.swift (area media-pipeline)

## LANE: Audio SDK & consommation média
_Tout ce qui édite AudioPlayerView.swift et ConversationMediaViews.swift (transcription Prisme, formateurs, theme, loop réels) doit vivre ensemble ; le sweep adaptiveOnChange (8 sites mécaniques, dont AudioPlayerView) y est rattaché car il touche ces fichiers._
- [P2] Prisme non appliqué aux transcriptions audio : langue affichée par défaut = toujours l'original ('orig'), jamais résolue automatiquement vers la langue préférée alors que la traduction existe. Initialiser via la même résolution que preferredTranslation (audio joué reste l'original).
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift (area messaging-ui)
- [P2] AudioPlayerView : @ObservedObject ThemeManager.shared dans une leaf view par bulle audio — passer isDark primitif (déjà disponible chez tous les appelants).
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift (area perf-rerender)
- [P2] playLocalFile : catch {} vide — fichier évincé du cache = tap play sans effet, session audio déjà activée, aucun log. do/catch + état d'erreur.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift (area quality-crashes)
- [P2] Deux formateurs d'octets divergents pour la même UI (SDK binaire 1024 vs app décimal 1000, commentaire 'même format' faux) + 3e copie UploadProgressBar — un seul helper SDK.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift, apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/UploadProgressBar.swift (area sdk-purity)
- [P2] Sweep adaptiveOnChange : 8 sites SDK en .onChange brut déprécié (AuthTextField par frappe, AudioPlayerView ×2, ErrorBannerView, StoryVoiceRecorder, UniversalAudioRecorderView, VoiceProfileManageView, CommunitySettingsView, MediaTranscriptionView) — remplacement mécanique.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthTextField.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift, packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTranscriptionView.swift (area perf-rerender)
- [P3] Incohérence pager réels : vidéos bouclent, l'audio s'arrête définitivement en fin de lecture (handlePlaybackFinished nil-e tout) — boucler l'audio miroir du shouldLoop vidéo.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift (area reels-video)
- [P3] startDownloadFlow ignore le retour Bool de registerInFlightDownload (contrat documenté non honoré) — deux téléchargements complets concurrents du même fichier possibles.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift (area media-pipeline)

## LANE: Pièces jointes — pipeline d'envoi
_Chemin d'envoi des attachments : AttachmentHandlers, MediaCompressor, AttachmentSendService (mort), prefetch carousel, DiskCacheStore preview. Fichiers exclusifs, indépendants des lanes conversation/média._
- [P2] Lectures disque synchrones Data(contentsOf:) sur le MainActor dans le Task d'envoi (vidéos de dizaines de Mo) + décodage UIImage au tap Envoyer — freeze UI proportionnel à la taille. Hop off-main (pattern readFileBytes documenté dans le service mort).
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift (area media-pipeline)
- [P2] Photos HEIC uploadées avec extension .jpg mensongère (fileExtension sans case heic) et non affichables par le web — transcoder en JPEG ou corriger l'extension + vérifier le rendu web.
  fichiers: apps/ios/Meeshy/Features/Main/Services/MediaCompressor.swift (area media-pipeline)
- [P2] AttachmentSendService : code mort dangereux (0 call site) avec 2 bugs latents (vidéos stockées dans le store images, audio toujours par socket contra le pipeline documenté) — supprimer ou corriger.
  fichiers: apps/ios/Meeshy/Features/Main/Services/AttachmentSendService.swift (area media-pipeline)
- [P2] Le prefetch ±1 du carousel de bulle télécharge des images pleine taille sans consulter MediaDownloadPolicyEngine — données cellulaires consommées malgré 'Jamais'/'Wi-Fi uniquement'. Gater comme ConversationMediaHandler.
  fichiers: apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift (area media-pipeline)
- [P3] Import de fichier : try? copyItem silencieux — attachment ajouté au composer avec une tempURL inexistante, échec seulement en bout de pipeline sans cause. do/catch + toast + ne pas ajouter.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift (area media-pipeline)
- [P3] cacheImageForPreview insère via Task {@MainActor} différé (race documentée corrigée pour l'autre chemin → flash thumbHash) et sans garde maxCacheableDecodedBytes — insérer synchroniquement via cacheIfWithinBudget.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift (area media-pipeline)

## LANE: Surfaces secondaires offline/instant (amis, threads, forward, partage)
_Écrans satellites tous violant cache-first/OfflineQueue : chacun est un fichier autonome, corrigés selon les patterns déjà écrits (RequestsViewModel, ForwardPickerSheet cache-first, outbox). Disjoint des lanes conversation/feed._
- [P1] FriendRequestListView 100% network-only (spinner à chaque ouverture, respond non-optimiste sans queue) alors que RequestsViewModel conforme existe — brancher RootView/iPadRootView dessus ou porter le pattern.
  fichiers: apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift (area offline-instant)
- [P1] ThreadView : réponse en REST direct sans optimiste ni OfflineQueue (offline = perdue), chargement des réponses network-only (thread vide offline). Router par l'outbox sendMessage + seed depuis CacheCoordinator.messages.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ThreadView.swift, apps/ios/Meeshy/Features/Main/Services/ThreadRepliesLoader.swift (area offline-instant)
- [P1] Onglet Transférer du détail message : conversations network-only ('Aucune conversation' offline, faux), forward échoue en silence — copier le loadConversations cache-first de ForwardPickerSheet + surfacer l'échec.
  fichiers: apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageForwardDetailView.swift (area offline-instant)
- [P1] OutboxKind .sendFriendRequest mort (dispatcher prêt, 0 enqueue) : Discover/ConnectionActionView font du REST direct — offline la demande échoue avec toast. Router par la queue avec flip optimiste (corrige aussi le haptic success prématuré de DiscoverViewModel). Portions UserProfileSheet/NewConversationViewModel traitées dans leurs lanes.
  fichiers: apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift, packages/MeeshySDK/Sources/MeeshyUI/Profile/ConnectionActionView.swift, packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift (area offline-instant)
- [P1] BlockedUsersView (Réglages) : network-only ignorant le store blockedUsers ET échec silencieux routé vers 'Aucun utilisateur bloqué' (faux offline) — réutiliser BlockedViewModel cache-first + état d'erreur.
  fichiers: apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift (area offline-instant)
- [P2] Détail des réactions : fetch network-only, aucun seed depuis message.reactions déjà affichées — offline l'écran dit 'Aucune réaction' sous une bulle qui en montre. Seeder + conserver le seed sur échec.
  fichiers: apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift (area offline-instant)
- [P2] SharePickerViewModel.send et ForwardPickerSheet.forwardTo : envoi REST direct sans OfflineQueue ni optimiste — contenu partagé perdu offline. Router par l'outbox.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/SharePickerViewModel.swift, apps/ios/Meeshy/Features/Main/Views/ForwardPickerSheet.swift (area offline-instant)
- [P2] Preview audio du menu overlay : AVPlayer branché sur l'URL réseau sans consulter le cache disque audio — re-téléchargement et preview KO offline. Résoudre l'URL locale d'abord.
  fichiers: apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift (area offline-instant)

## LANE: Réglages & préférences (placebo, langue UI, sync)
_SettingsView/PrivacySettingsView/NotificationSettingsView/UserPreferencesManager : toggles inopérants et sync bidirectionnelle. Le moteur auto-download mort s'y greffe (même fichier UserPreferencesManager)._
- [P1] 5 toggles de confidentialité placebo (hideProfileFromSearch, blockScreenshots, allowCallsFromNonContacts, saveMediaToGallery, shareUsageData) : persistés/synchronisés mais appliqués nulle part (ni iOS ni gateway) — faux sentiment de confidentialité. Appliquer ou griser 'Bientôt disponible'.
  fichiers: apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift (area settings-profile)
- [P1] Picker 'Langue de l'interface' sans effet : interfaceLanguage écrit mais jamais lu (aucun .environment(locale)) — appliquer à la racine ou retirer le picker.
  fichiers: apps/ios/Meeshy/Features/Main/Views/SettingsView.swift (area settings-profile)
- [P1] applyRemote 'server wins' écrase les modifications locales en attente de sync (fenêtre debounce 1s) puis PATCHe la valeur périmée — skipper les catégories dirty/syncTask pendant.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift (area settings-profile)
- [P2] Second moteur auto-download MORT et divergent dans UserPreferencesManager (shouldAutoDownloadMedia, 0 appelant prod, ignore autoDownloadOnWifi) — supprimer ou déléguer à MediaDownloadPolicyEngine, statuer sur les champs serveur autoDownload*.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift (area sdk-purity)
- [P2] Heures 'Ne pas déranger' en TextField libre : tout format ≠ HH:mm désactive silencieusement la fenêtre DnD (parseTime strict) — DatePicker .hourAndMinute.
  fichiers: apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift (area settings-profile)
- [P3] Sync thème unidirectionnelle : application.theme poussé au backend mais jamais relu vers ThemeManager (divergence multi-device silencieuse) — mapper au applyRemote/login ou cesser de le synchroniser.
  fichiers: apps/ios/Meeshy/Features/Main/Views/SettingsView.swift (area settings-profile)

## LANE: Appels — retry, fin d'appel & privacy
_CallManager/CallView/FloatingCallPillView/BubbleCallNoticeView : états de fin d'appel, retry, signaux — fortement couplés, fichiers exclusifs._
- [P1] 'Réessayer' après un appel ENTRANT échoué rappelle le dernier appelé SORTANT (lastOutgoingContext jamais effacé/comparé) — l'écran affiche Bob, le bouton compose Alice. Gater canRetryCall sur la correspondance de l'appel terminé.
  fichiers: apps/ios/Meeshy/Features/Main/Services/CallManager.swift (area calls-ux)
- [P1] L'alerte privacy 'le pair enregistre l'écran' n'est rendue qu'en layout audio sans sous-titres — jamais en appel VIDÉO (le cas le plus sensible) ni en audio+transcript. Ajouter au badge durée vidéo + header compact.
  fichiers: apps/ios/Meeshy/Features/Main/Views/CallView.swift (area calls-ux)
- [P2] Pill minimisée : appel terminé = disparition instantanée sans raison ni bouton Réessayer (contredit le doc-comment de shouldPresentFullScreenCover) + durée dupliquée sans branche heures ('75:32' vs '1:15:32'). Inclure .ended dans le guard + utiliser callManager.formattedDuration.
  fichiers: apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift (area calls-ux)
- [P2] CallView endedView : aucune affordance de fermeture pendant les 12s de settle (modal épinglé) + bouton Réessayer en Color.green système au lieu de MeeshyColors.success + try? silencieux sur la persistance du profil résolu. Bouton Fermer + couleurs sémantiques + do/catch.
  fichiers: apps/ios/Meeshy/Features/Main/Views/CallView.swift (area calls-ux)
- [P2] Un 3e appel entrant supplantant le 2e envoie un call:end plat au lieu d'emitCallReject (contredit son doc-comment) — mislabel 'missed' chez l'appelant + saute la garde socket-down. Appeler le helper emitCallReject.
  fichiers: apps/ios/Meeshy/Features/Main/Services/CallManager.swift (area calls-ux)
- [P2] Toast d'échec toggleVideo : chaîne française en dur non localisée, et libellé 'Impossible d'activer' faux sur une désactivation — String(localized:) avec 2 clés selon target.
  fichiers: apps/ios/Meeshy/Features/Main/Services/CallManager.swift (area calls-ux)
- [P3] BubbleCallNoticeView : pulse repeatForever sans gate Reduce Motion (seul site du chrome d'appel non conforme P2-iOS-9) + lectures ThemeManager.shared en plein body d'une cellule Equatable — gater + dériver de isDark.
  fichiers: apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift (area calls-ux)
- [P3] IslandEmergingBanner : 152 lignes mortes (0 call site prod) maintenues par un test — supprimer composant + test, ou documenter la mise en réserve.
  fichiers: apps/ios/Meeshy/Features/Main/Components/IslandEmergingBanner.swift (area calls-ux)

## LANE: Robustesse noyau (crash distant, try? critiques)
_Quatre fichiers autonomes à risque crash/perte de données silencieuse, aucun chevauchement avec les autres lanes._
- [P1] EmbeddableVideoResolver : URL(string:)! sur un videoId dérivé du texte d'un message reçu — le filtre isLetter accepte l'Unicode, crash du feed/de la conversation déclenchable à distance sur iOS 16. Restreindre à l'ASCII + supprimer les force unwrap.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift (area quality-crashes)
- [P1] Réponse depuis une notification lock-screen : try? await send silencieux — offline, la réponse est PERDUE et la conversation marquée lue quand même. Router par l'outbox + do/catch (idem markRead).
  fichiers: apps/ios/Meeshy/AppDelegate.swift (area quality-crashes)
- [P3] Fallback in-memory d'AppDatabase : try? runMigrations sans log — si la migration échoue, tout le cache L2 de la session lèvera sans diagnostic possible. do/catch + logger.error.
  fichiers: packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift (area quality-crashes)
- [P3] TextAnalyzer @unchecked Sendable mensonger : état mutable non synchronisé + MainActor.assumeIsolated dans des callbacks Timer (trap hors main) — annoter @MainActor et retirer @unchecked Sendable.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift (area quality-crashes)

## LANE: Profil utilisateur — sheet SDK
_UserProfileSheet(.swift/+PostsTab) cumule 4 défauts de 4 audits différents : l'extraction app-side (SDK purity) est le fix structurant qui doit englober les catch{} vides, l'observation theme et la localisation — un seul worktree obligatoire._
- [P1] Violation SDK Purity : écran produit complet dans MeeshyUI orchestrant ~9 singletons (cascade CacheCoordinator→UserService→SearchIndex, mutations FriendshipCache/BlockService) — extraire un ViewModel app-side, le SDK garde la View paramétrée + callbacks. En profiter pour router sendFriendRequest via l'outbox.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift (area sdk-purity)
- [P2] 4 catch {} vides sur les chemins réseau (profil, stats, conversations partagées, posts) : sheet vide/figée sans message ni log offline — logger + états d'erreur/vide distincts.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift, packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+PostsTab.swift (area quality-crashes)
- [P2] ProfilePostRow (cellule Equatable) embarque @ObservedObject ThemeManager.shared qui bypasse son propre gate — passer isDark/couleurs primitifs (pattern FeedPostCard).
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+PostsTab.swift (area perf-rerender)
- [P3] Date d'inscription en Locale fr_FR codée en dur + 'Vu il y a Xmin/h/j' littéraux français non localisés — Locale.current + String(localized:)/RelativeTimeFormatter.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift (area social-feed)

## LANE: i18n & catalogues de chaînes
_Catalogues .xcstrings (app, MeeshyUI, widgets, extension notif), App Intents, Dynamic Type et pluriels : travail de localisation massif, fichiers de ressources exclusifs. Le site SecurityView 'verrou(s)' est traité par la lane Auth qui possède ce fichier._
- [P1] Catalogue app désynchronisé : 1664/2434 clés String(localized:) absentes (verrouillées sur defaultValue mix FR/EN dans toutes les langues, dont 107 clés VoiceOver) + 506 clés stale (40%) à purger. Re-extraction compilateur puis traduction en priorisant a11y/notifications/emailVerification.
  fichiers: apps/ios/Meeshy/Localizable.xcstrings (area i18n-a11y)
- [P1] Cible MeeshyWidgets sans aucun catalogue : Dynamic Island (Mute/End/View) et widgets en anglais codé en dur pour tous ; widget.unread traduit mais dans le catalogue de l'app invisible du .appex. Ajouter un xcstrings à la cible.
  fichiers: apps/ios/MeeshyWidgets/LiveActivities.swift, apps/ios/MeeshyWidgets/MeeshyWidgets.swift (area i18n-a11y)
- [P1] MeeshyUI : 207 clés significatives fr-only state=new (éditeur audio, présence, contrôles vidéo — lus par VoiceOver en français pour un anglophone) + labels a11y du bouton mute codés en dur — batch de traduction en/de/es/pt-BR + String(localized:).
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings, packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift (area i18n-a11y)
- [P1] Surface Siri/App Intents/Shortcuts entièrement en anglais non localisé (titres, dialogs, snippets, pluriel manuel 's') — ajouter les clés au catalogue + variantes plural.
  fichiers: apps/ios/Meeshy/Features/Intents/MeeshyAppIntents.swift (area i18n-a11y)
- [P1] Le texte des messages/posts ne suit pas Dynamic Type : MessageTextRenderer applique Font.system(size:) fixe — mapper via textStyle (4 lignes), tout le chrome grossit sauf le contenu principal.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift (area i18n-a11y)
- [P2] Extension notification : notification.audio_voice_message.body a le texte FRANÇAIS comme valeur anglaise et n'existe dans aucune autre langue — corriger en + ajouter fr/de/es/pt/zh/ar.
  fichiers: apps/ios/MeeshyNotificationExtension/Localizable.xcstrings (area i18n-a11y)
- [P2] developmentLanguage: en vs sourceLanguage: fr des deux catalogues (piège documenté toujours en place) : fallback des locales non supportées troué, extraction divergente — aligner (décision unique) + regen xcodegen.
  fichiers: apps/ios/project.yml (area i18n-a11y)
- [P3] Pluriels 'à parenthèses' faits main ('N effet(s) actif(s)', 'verrou(s)' — site SecurityView traité en lane Auth) illocalisables — variantes plural du String Catalog.
  fichiers: apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift, apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift (area i18n-a11y)

## LANE: Détail message & SSOT helpers (formatters, LoadState)
_MessageDetailSheet + duplications SSOT dispersées (tables de langues, formatters temps, LoadState local) : petits fichiers indépendants des autres lanes, corrections mécaniques de réutilisation._
- [P1] MessageDetailSheet : 22 boutons / 31 icônes / ZÉRO accessibilityLabel (désélection langue, clear recherche…) — passe a11y complète alignée sur BubbleFooter/CallView.
  fichiers: apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift (area i18n-a11y)
- [P2] Table supportedLanguages 18 langues copiée octet-pour-octet dans 3 fichiers + languageName dupliqué 3× — consommer LanguageDisplay/LanguageData du SDK.
  fichiers: apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift, apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift, apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift (area sdk-purity)
- [P2] GlobalSearchView.formatTimeAgo re-forgé avec libellés anglais en dur ('now', '5m') — un francophone voit des horodatages anglais. RelativeTimeFormatter.shortString.
  fichiers: apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift (area sdk-purity)
- [P3] ParticipantsView.relativeTime bypasse RelativeTimeFormatter (qui cite 'participants' comme surface remplacée) — longString.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift (area sdk-purity)
- [P3] ClipInspector.formatTime duplicata octet-pour-octet de TransportBar.formatTime dans le même module — déléguer.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift (area sdk-purity)
- [P3] ConversationOptionsViewModel redéclare un LoadState local qui shadowe celui du SDK (perd cachedStale/offline) — utiliser MeeshySDK.LoadState.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift (area sdk-purity)

## LANE: Liste conversations — vues, rows & présence
_Défauts purement présentation de la liste (ConversationListView, +Rows, ThemedConversationRow, Helpers, PresenceManager, NewConversationViewModel) — fichiers disjoints de la lane data (VM). Attention : le fix présence peut nécessiter un signal côté VM, à coordonner à l'intégration._
- [P2] Branche vide sans distinction : CTA 'créez-en une' flashe pendant .idle au cold start (skeleton gaté strictement .loading) et s'affiche pour une recherche sans résultat — inclure .idle + état 'aucun résultat'.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift (area conversations-list)
- [P2] Pastilles de présence jamais rafraîchies sur user:status : PresenceManager observé par personne, recalcTimer publie dans le vide — signal ciblé (presenceVersion débouncé) sans ré-observer le singleton dans les leafs.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift, apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift (area conversations-list)
- [P2] Chaque row déclenche .task onLoadPreview à chaque apparition : sur cache vide, scroller = 1 requête REST par row visible, retry à chaque réapparition — limiter aux N premières rows ou charger au long-press.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift (area conversations-list)
- [P2] NewConversationViewModel : performSearch avale toute erreur réseau (0 résultat ≠ échec, aucun log) + createConversation en REST direct alors que le kind outbox .createConversation existe (mort) — logger/état d'échec + router ou supprimer le kind.
  fichiers: apps/ios/Meeshy/Features/Main/ViewModels/NewConversationViewModel.swift (area conversations-list)
- [P2] L'aperçu long-press rend les bulles sans contexte de traduction (toujours langue originale) alors que le fetch demande includeTranslations — résoudre preferredTranslation par message.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift (area conversations-list)
- [P3] Label VoiceOver de la row lit le preview brut au lieu de resolvedLastMessagePreview — aligner sur ce que l'écran affiche.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift (area conversations-list)
- [P3] Horodatages relatifs figés : Date() dans le body mais row gelée par .equatable() sans composante temporelle ni timer — injecter un tick minute.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift (area conversations-list)

## LANE: Bulles — composants (Equatable & drapeaux)
_ThemedMessageBubble + BubbleContentBuilder : deux fixes ciblés sur les composants de bulle, fichiers non touchés par les lanes conversation/attachments._
- [P2] Gate Equatable de ThemedMessageBubble omet mentionDisplayNames et allAudioItems (contra sa propre doc 'EVERY input') — mention @username brute jamais résolue après enrichissement du cache. Ajouter au ==.
  fichiers: apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift (area messaging-ui)
- [P3] La bande de drapeaux n'a pas de slot deviceLocale (4e axe du Prisme étendu 2026-05-26 documenté) — ajouter le paramètre avec le même gating hasTranslation.
  fichiers: apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift (area messaging-ui)

## LANE: Deep links & join flow
_DeepLinkRouter + ViewModels du join/registration SDK : deux petits fixes indépendants de tout le reste._
- [P2] meeshy://c/<id> (alias court accepté par le parser) silencieusement droppé par handleCustomScheme (seul 'conversation' géré) — ajouter case 'c' + test de lockstep parser/router.
  fichiers: apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift (area auth-session)
- [P3] Messages d'erreur join flow + registration codés en dur en français non localisés dans le SDK — String(localized:) avec clés catalogue MeeshyUI.
  fichiers: packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift, packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift (area auth-session)

## LANE: Perf divers (iPad, timers de struct)
_Deux fixes perf ponctuels sur des fichiers que personne d'autre ne touche._
- [P2] iPadRootView observe NetworkMonitor.shared sans jamais le lire — la racine iPad entière re-render à chaque flap réseau pour rien. Supprimer la propriété (1 ligne).
  fichiers: apps/ios/Meeshy/Features/Main/Views/iPadRootView.swift (area perf-rerender)
- [P2] Timer.publish().autoconnect() en `let` de struct View (pas @State) dans SyncPill et ConversationScrollControlsView : chaque re-init du parent recrée le publisher, les animations de points gèlent — TimelineView/.task ou @State.
  fichiers: apps/ios/Meeshy/Features/Main/Components/SyncPill.swift, apps/ios/Meeshy/Features/Main/Components/ConversationScrollControlsView.swift (area perf-rerender)

## LANE: Tests — couverture factice & skips permanents
_Fichiers de tests uniquement (le seam KeychainStoring de AuthManager doit être coordonné avec la lane Auth — à merger après elle)._
- [P1] AuthServiceTests : 21/24 tests assertent les compteurs du MOCK (tautologie) — le flux login réel n'a aucune couverture unitaire. Supprimer et tester AuthManager réel via le seam authService.
  fichiers: apps/ios/MeeshyTests/Unit/Services/AuthServiceTests.swift (area tests-health)
- [P1] Les 2 seuls tests de sérialisation du refresh concurrent (anti-tempête 401) sont XCTSkipIf(true) permanents — injecter un KeychainStoring en mémoire (coordonner le seam avec la lane Auth) puis retirer les skips.
  fichiers: packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthManagerRefreshTests.swift (area tests-health)
- [P1] Source-guards WebRTC qui se désactivent silencieusement au moindre rename (marker introuvable → XCTSkip vert) — aligner sur le pattern loud XCTFail de CallManagerTests dans les 2 suites P2P ; borner les fenêtres de grep (end marker obligatoire) dans les 56 fichiers source-reading.
  fichiers: apps/ios/MeeshyTests/Unit/Services/P2PWebRTCClientDelegateIdentityGuardTests.swift, apps/ios/MeeshyTests/Unit/Services/P2PWebRTCClientConcurrencySourceTests.swift, apps/ios/MeeshyTests/Unit/Views/CallsTabAccessibilityTests.swift (area tests-health)
- [P1] 4 tests skippés 'Covered by Phase 4 XCUITest suite' alors qu'aucune cible XCUITest n'existe (hit targets 44pt HIG vérifiés nulle part) — créer la cible ou corriger les messages et tracker la dette.
  fichiers: packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/HitTargetTests.swift, packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/TransportBarKeyboardTests.swift, packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/KeyframeKeyboardShortcutTests.swift (area tests-health)
- [P2] Snapshots canvas story skippés depuis 2026-05-09 pour une raison devenue fausse (l'infra snapshot est câblée, 6 suites Timeline ont des baselines) — réécrire avec assertSnapshot + baselines 18.2.
  fichiers: packages/MeeshySDK/Tests/MeeshyUITests/Story/Snapshot/StoryCanvasSnapshotTests.swift (area tests-health)

## LANE: Tests — CI & hygiène
_Workflow CI, meeshy.sh et artefacts de tests morts — fichiers disjoints de la lane couverture (le nettoyage de l'exclude project.yml se coordonne avec la lane i18n qui possède ce fichier)._
- [P2] CI : les 3 suites de benchmarks XCTMetric tournent à chaque run (aucun -skip-testing, contredit leur en-tête 'intentionally gated') + le guard runtime du crash caméra ne s'exécute jamais faute de simctl privacy grant photos-add — corriger ios-tests.yml.
  fichiers: .github/workflows/ios-tests.yml (area tests-health)
- [P2] 3 tests flaky documentés (#1869) toujours en wall-clock (Task.sleep + poll 2s, 281 sites dans MeeshyTests) — horloge injectable + XCTestExpectation, commencer par les 3 nommés.
  fichiers: apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift, apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift (area tests-health)
- [P2] Artefacts morts : 4 mocks jamais référencés (MockKeychainService/CacheService/MediaCache/ProfileCache), BubbleExpandableTextUITests exclu de toute cible mais listé dans meeshy.sh, racine MeeshyIntents supprimée toujours scannée, test placeholder XCTAssertTrue(true) — supprimer.
  fichiers: apps/ios/MeeshyTests/Mocks/MockKeychainService.swift, apps/ios/MeeshyTests/UI/BubbleExpandableTextUITests.swift, apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift, packages/MeeshySDK/Tests/MeeshySDKTests/MeeshySDKPlaceholderTests.swift (area tests-health)
- [P3] 628 fonctions de tests SDK (13%) violent la convention test_{method}_{condition}_{expectedResult} — renommage mécanique au fil de l'eau + gate en revue.
  fichiers: packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthManagerRefreshTests.swift (area tests-health)

## TOP RISKS
- P0 apps/ios/Meeshy/MeeshyApp.swift:152 — Magic link tapé en étant déjà connecté : applySession(B) sans aucun teardown → caches, sockets (JWT de A) et clés E2EE du compte A exposés sous la session B. Fuite de données inter-comptes.
- P0 apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift:105 — Changer d'avatar échoue TOUJOURS : décodage d'une clé `url` alors que le gateway renvoie `fileUrl`. Fonctionnalité de base 100% cassée.
- P0 apps/ios/Meeshy/Features/Main/Views/ProfileView.swift:803 — Édition de profil offline enfilée vers /users/me/profile (route inexistante) : 404 rejoué à l'infini, et la SettingsActionQueue (FIFO stop-on-failure, sans maxAttempts) est bloquée à jamais pour TOUTES les actions settings suivantes.
- P1 apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift:233 — clearSessions au logout avec account:nil (currentUser déjà nil) : les clés de session E2EE survivent, une nouvelle identity key est régénérée au re-login → DMs indéchiffrables. Perte de données chiffrées.
- P1 apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1352 — pullToRefresh détruit L1+L2 (conversations, messages, stories, profils…) AVANT le fetch : un pull-to-refresh offline/échoué vide tous les caches → cold start offline = app vide. Violation frontale d'Offline Graceful Degradation.

## DOUBLONS FUSIONNÉS
- AudioPlayerView.swift:615 @ObservedObject ThemeManager.shared — rapporté 2× (audit messaging-ui P2 + audit media-pipeline P1) : fusionné, réparti entre lanes 'Audio SDK' (AudioPlayerView) et 'Images & viewers SDK' (Image/Document/CodeViewer)
- CachedAsyncImage/MediaDownloadPolicy violation SDK-purity — rapporté 2× (media-pipeline l.188 + sdk-purity l.189) : 1 item ; le doublon isLocalFileURL/gate copié 3× (P3 l.467) absorbé car il disparaît avec l'injection du gate
- ReelFeedVideoSurface:21 + ReelsPlayerView:1112 @ObservedObject SharedAVPlayerManager (churn 5-10 Hz) — rapporté 2× (reels-video + perf-rerender) : fusionné ; la double observation de ConversationMediaGalleryView (perf-rerender) absorbée dans le même item
- MeeshyApp.swift:281 catch APIError.serverError mort — rapporté 2× (auth-session P1 + settings-profile P1) : fusionné en un item systémique couvrant aussi SecurityView:1034/957/1006, UserProfileViewModel:80 et les 6 catches AuthManager:254 (P2)
- AudioPlayerView:821/825 .onChange brut — rapporté 2× (reels-video P2 + perf-rerender item '8 sites') : absorbé dans le sweep adaptiveOnChange unique
- BlockedUsersView — network-only sans cache (offline-instant P1 l.230) + échec silencieux → faux état vide (settings-profile P2 l.236) : fusionné en 1 item (brancher BlockedViewModel cache-first + état d'erreur)
- DiscoverViewModel:125 haptic success prématuré (P3) — absorbé dans l'item OutboxKind .sendFriendRequest mort (le flip optimiste + rollback corrige les deux)
- FeedViewModel:894 clearTranslationOverride (P3) — fusionné avec FeedPostCard:163 (P1) : même racine, résolution Prisme feed à remplacer par resolved()
- NewConversationViewModel:114 createConversation REST direct (fragment de l'item OutboxKinds morts) — rattaché à l'item performSearch silencieux de la lane 'Liste conversations — vues' pour garder les lanes disjointes
- Fusions intra-lane pour cohérence/taille (défauts distincts conservés dans le libellé) : copy+fallback-picker (conversation) ; duckOthers+isMuted et teardown+double-surface (réels) ; seeding+share et comment-socket+drapeau et F2+sendReply (feed) ; fire-and-forget+try? upload et 3 pipelines publish morts (stories) ; pill ended+durée et endedView+Color.green+try? et pulse+ThemeManager (appels) ; catalogue désync+clés stale et MeeshyUI fr-only+VideoTransportControls (i18n) ; benchmarks CI+photos-add grant et artefacts morts 4-en-1 (tests) ; logout-race+seam authService (auth)
