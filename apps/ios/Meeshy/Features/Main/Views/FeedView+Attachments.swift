import SwiftUI
import PhotosUI
import AVFoundation
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Feed Attachment Handlers
extension FeedView {

    // MARK: - Photo Selection
    func handleFeedPhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                item,
                context: .feedPost,
                accentColor: ""
            )
            trackFeedPreparation(prep)
        }
    }

    // MARK: - Camera Capture
    func handleFeedCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image,
            context: .feedPost,
            accentColor: MeeshyColors.brandPrimaryHex
        )
        trackFeedPreparation(prep)
    }

    func handleFeedCameraVideo(_ url: URL) {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .feedPost
        )
        trackFeedPreparation(prep)
    }

    /// Append an in-flight preparation to the loading row and promote its
    /// result into `pendingAttachments` / `pendingMediaFiles` /
    /// `pendingThumbnails` once it reaches `.ready`. Mirrors
    /// `ConversationView.trackPreparation` so the publish pipeline keeps
    /// reading the same three dictionaries.
    func trackFeedPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.append(prep)
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    pendingThumbnails[prepared.attachment.id] = thumb
                }
                pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparingAttachments.removeAll { $0.id == prep.id }
        }
    }

    func cancelFeedPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.removeAll { $0.id == prep.id }
    }

    // MARK: - File Import
    func handleFeedFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                let fileName = url.lastPathComponent
                let mimeType = feedMimeTypeForURL(url)

                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
                try? FileManager.default.copyItem(at: url, to: tempURL)

                appendFeedFileAttachment(tempURL: tempURL, fileName: fileName, mimeType: mimeType)
            }
            HapticFeedback.light()
        case .failure:
            break
        }
    }

    /// Cœur commun de l'importateur de documents et de l'ingestion
    /// dépôt/collage : enregistre un fichier DÉJÀ présent dans notre
    /// conteneur comme pièce jointe en attente (`pendingAttachments` +
    /// `pendingMediaFiles`), exactement comme `handleFeedFileImport` le
    /// faisait inline — factorisé pour que le dépôt n'introduise aucune
    /// variante de ce chemin.
    func appendFeedFileAttachment(tempURL: URL, fileName: String, mimeType: String) {
        let attachmentId = UUID().uuidString
        let attachment = MessageAttachment(
            id: attachmentId,
            fileName: fileName,
            originalName: fileName,
            mimeType: mimeType,
            fileSize: feedGetFileSize(tempURL),
            fileUrl: tempURL.absoluteString,
            thumbnailColor: "45B7D1"
        )
        pendingMediaFiles[attachmentId] = tempURL
        pendingAttachments.append(attachment)
    }

    // MARK: - Ingestion dépôt / collage (recette commune des quatre hôtes)

    /// Rappel `onIngest` de la surface POST : chaque `.file` pointe un
    /// fichier déjà copié dans notre conteneur (la surface en devient
    /// propriétaire), chaque `.text` est destiné au champ de saisie. Le
    /// routage MIME est partagé (`ComposerIngestRouter.route(mime:)`) et
    /// chaque branche réutilise EXACTEMENT le pipeline existant de cette
    /// surface — toute nouvelle voie contournerait l'amorçage du cache de
    /// vignettes, la bulle optimiste et le magasin de brouillons durable.
    func handleFeedComposerIngest(_ ingests: [ComposerIngest]) {
        guard !ingests.isEmpty else { return }
        var texts: [String] = []
        for ingest in ingests {
            switch ingest {
            case .text(let value):
                texts.append(value)
            case .file(let url, let name, let mime):
                switch ComposerIngestRouter.route(mime: mime) {
                case .image:
                    guard let image = UIImage(contentsOfFile: url.path) else {
                        // Pas de tuile fantôme : l'image illisible est nommée
                        // dans un toast et son fichier temporaire retiré.
                        ComposerIngestFeedback.showFailure(names: [name])
                        try? FileManager.default.removeItem(at: url)
                        continue
                    }
                    let prep = AttachmentPreparationService.shared.prepareImage(
                        image,
                        context: .feedPost,
                        accentColor: MeeshyColors.brandPrimaryHex
                    )
                    trackFeedPreparation(prep)
                    // L'UIImage est chargée : le fichier source déposé ne sert
                    // plus, et cette surface en est propriétaire.
                    try? FileManager.default.removeItem(at: url)
                case .video:
                    // `deleteSourceAfterCompression: true` : la préparation
                    // consomme le fichier déposé, dont nous sommes propriétaires.
                    let prep = AttachmentPreparationService.shared.prepareVideo(
                        sourceURL: url,
                        deleteSourceAfterCompression: true,
                        context: .feedPost
                    )
                    trackFeedPreparation(prep)
                case .audio, .file:
                    // Même chemin fichier que l'importateur de documents de
                    // cette surface (tuile audio / document).
                    appendFeedFileAttachment(tempURL: url, fileName: name, mimeType: mime)
                }
            }
        }
        if !texts.isEmpty {
            // Plusieurs `.text` d'un même dépôt : concaténés par un saut de
            // ligne, dans l'ordre, en UNE SEULE insertion. Le champ est un
            // `TextEditor` SwiftUI (cible iOS 16) qui n'expose pas la position
            // du curseur (`TextSelection` = iOS 18) : l'insertion se fait à la
            // fin — le cas « champ sans focus » de la recette commune.
            let joined = texts.joined(separator: "\n")
            composerText = composerText.isEmpty ? joined : composerText + "\n" + joined
        }
        HapticFeedback.light()
    }

    // MARK: - Location Selection
    /// Le picker émet désormais un `SharedPlace` complet (nom + adresse +
    /// catégorie) — `MessageAttachment.location` ne portait ni l'un ni
    /// l'autre et n'est plus le véhicule (Task 11/12, 2026-07-29).
    func handleFeedLocationSelection(_ place: SharedPlace) {
        withAnimation {
            pendingPlace = place
            nearbyDiscoverability = FeedNearbyDiscoverability.choiceForNewPlace()
        }
        HapticFeedback.light()
    }

    // MARK: - Offline Draft Recovery (post / reel)

    /// Pre-fills the composer with the last post/reel that got stuck offline
    /// (unsent for more than the threshold). Only acts on a fresh, empty compose
    /// so it never clobbers what the user is typing. Media is restored through
    /// the existing preparation pipeline (`trackSheetPreparation`) — no re-pick.
    @MainActor
    func recoverStuckPostDraftIfNeeded() async {
        guard composerText.isEmpty,
              pendingAttachments.isEmpty,
              pendingAudioURL == nil,
              recoveredPostCmid == nil else { return }
        guard let draft = await viewModel.recoverUnsentPost() else { return }

        composerText = draft.content
        postVisibility = draft.visibility
        // Preserve the original classification: a plain POST that carried media
        // must stay a POST. A draft saved as REEL is NOT trusted blindly: the
        // publish paths re-derive the type from the RESTORED attachments via
        // `ReelComposition.defaultType` (règle produit 2026-08-02 — video ||
        // audio || >= 2 images), so a stale 1-image "REEL" draft republishes
        // as a POST. Eligibility can't be checked here — the media below is
        // restored asynchronously through the preparation pipeline.
        composerForcePlainPost = (draft.type == "POST")
        recoveredPostCmid = draft.clientMutationId

        for url in draft.localMediaURLs {
            restoreRecoveredMedia(url: url)
        }
        FeedbackToastManager.shared.show(String(localized: "feed.draft.recovered", defaultValue: "Brouillon hors-ligne restauré", bundle: .main))
    }

    /// Rebuilds a composer attachment from a recovered local media file via the
    /// same preparation pipeline the pickers use (`trackFeedPreparation`, so
    /// `pendingAttachments` / `pendingMediaFiles` / thumbnails stay consistent).
    /// `deleteSourceAfterCompression` is false so the queued row's pending-media
    /// file survives until the resend supersedes it.
    private func restoreRecoveredMedia(url: URL) {
        let mime = MimeTypeResolver.mimeType(forExtension: url.pathExtension)
        switch AttachmentKind(mimeType: mime) {
        case .video:
            let prep = AttachmentPreparationService.shared.prepareVideo(
                sourceURL: url, deleteSourceAfterCompression: false, context: .feedPost)
            trackFeedPreparation(prep)
        case .audio:
            // **Inatteignable, et c'est une GARDE, pas une chance.** Un vocal
            // enregistré depuis le feed EST désormais enfilé dans cette file
            // (`FeedViewModel.publish`), donc une ligne bloquée peut en porter
            // un. Ce composer ne sait pas rouvrir un enregistrement : si la
            // ligne arrivait ici, le brouillon « restauré » serait VIDE, et la
            // publication suivante — quelle qu'elle soit — supprimerait la
            // ligne ET le fichier par `supersedeRecoveredPost`. C'est
            // `FeedViewModel.recoverUnsentPost` qui refuse la ligne en amont ;
            // ce `break` n'est que le second verrou. NE PAS lever l'un sans
            // savoir rendre l'autre inutile.
            break
        default:
            guard let image = UIImage(contentsOfFile: url.path) else { return }
            let prep = AttachmentPreparationService.shared.prepareImage(
                image, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex)
            trackFeedPreparation(prep)
        }
    }

    /// Ce que la publication DÉCLARE : les non-INLINE, et `nil` quand il n'y
    /// en a aucune — `[]` serait entendu par le serveur comme un effacement.
    var feedDeclaredReferences: [PostMentionInput]? {
        let declared = ComposerReferences.payload(composerReferences)
        return declared.isEmpty ? nil : declared
    }

    // MARK: - Publish Post with Attachments
    func publishPostWithAttachments() {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        // Une position seule, sans texte ni piece jointe, doit pouvoir partir : sinon
        // handleFeedLocationSelection() range le lieu dans pendingPlace et ce garde
        // le jette en silence (Task 13, 2026-07-29).
        guard !text.isEmpty || !pendingAttachments.isEmpty || pendingPlace != nil else { return }

        // A recovered stuck post is being re-sent — supersede its queued row so
        // the resend replaces it (and reclaims its pending-media) instead of
        // racing it to the server (no duplicate on reconnect).
        if let cmid = recoveredPostCmid {
            recoveredPostCmid = nil
            Task { await viewModel.supersedeRecoveredPost(clientMutationId: cmid) }
        }

        let attachments = pendingAttachments
        let audioURL = pendingAudioURL
        let mediaFiles = pendingMediaFiles
        // Capturé AVANT le nettoyage du composer, comme text/attachments : la
        // remise à zéro vide `composerReferences`, et une lecture tardive ne
        // déclarerait plus personne.
        let declaredReferences = feedDeclaredReferences
        // Capturé avant feedCleanupAttachments() (qui remet pendingPlace à nil) :
        // sans ce cliché local, la Task async ci-dessous lirait toujours nil,
        // exactement comme text/attachments/mediaFiles le sont pour la même raison.
        let pendingPlace = pendingPlace
        // Même raison que `pendingPlace` : le nettoyage referme l'opt-in, et
        // une lecture tardive ne trouverait plus le consentement. La mémoire
        // locale du palier est écrite ICI, au moment où il SERT — la spec
        // parle du dernier choix « utilisé », pas du dernier survolé.
        let nearbyPrecision = feedOffersNearbyDiscoverability
            ? nearbyDiscoverability.precisionToSend
            : nil
        if feedOffersNearbyDiscoverability {
            FeedNearbyDiscoverability.remember(nearbyDiscoverability)
        }
        let hasFiles = audioURL != nil || !mediaFiles.isEmpty

        if !hasFiles || attachments.isEmpty {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showComposer = false
                isComposerFocused = false
                composerText = ""
            }
            feedCleanupAttachments()
            HapticFeedback.success()
            if !text.isEmpty || pendingPlace != nil {
                let lang = composerLanguage
                Task { await viewModel.createPost(content: text, visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds, originalLanguage: lang, location: pendingPlace, mentions: declaredReferences, discoverabilityPrecision: nearbyPrecision) }
            }
            return
        }

        // U1b — offline visual-media post → durable outbox (skip TUS). Audio
        // posts keep the existing path (audio offline durability = future). The
        // source URLs are captured before the UI reset (feedCleanupAttachments
        // only clears the state arrays, not the temp files on disk) so
        // enqueuePostMedia can relocate them; its Phase C deletes the sources.
        // Text-only offline posts are already durable via createPost above.
        if NetworkMonitor.shared.isOffline, audioURL == nil {
            let sources = attachments.compactMap { mediaFiles[$0.id] }
            let lang = composerLanguage
            // Same reel-vs-post classification as the online TUS path below, so a
            // video / multi-image post composed offline becomes a REEL once it
            // flushes — no online/offline divergence on the surface it lands on.
            let postType = ReelComposition.defaultType(
                mimeTypes: attachments.map(\.mimeType),
                durationsMs: attachments.map(\.duration),
                forcePlainPost: composerForcePlainPost
            ).rawValue
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showComposer = false
                isComposerFocused = false
                composerText = ""
            }
            feedCleanupAttachments()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.pendingOffline", defaultValue: "Post en attente d'envoi", bundle: .main))
            Task {
                await viewModel.createOfflineMediaPost(
                    localMediaURLs: sources,
                    content: text,
                    visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds,
                    originalLanguage: lang,
                    type: postType,
                    location: pendingPlace,
                    mentions: declaredReferences,
                    discoverabilityPrecision: nearbyPrecision,
                    // Un média VISUEL n'a pas de voix, et il le DIT : la
                    // fabrique de charge ne pose aucun défaut, précisément pour
                    // qu'un champ neuf ne disparaisse pas d'un site d'appel en
                    // silence.
                    mobileTranscription: nil
                )
            }
            return
        }

        isUploading = true
        HapticFeedback.light()

        Task {
            do {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    await MainActor.run { isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)

                var progressCancellable: AnyCancellable?
                progressCancellable = uploader.progressPublisher
                    .receive(on: DispatchQueue.main)
                    .sink { [progressCancellable] progress in
                        _ = progressCancellable
                        uploadProgress = progress
                    }

                var uploadedIds: [String] = []

                if let audioURL {
                    let result = try await uploader.uploadFile(
                        fileURL: audioURL, mimeType: "audio/mp4", credential: .bearer(token), uploadContext: "post"
                    )
                    uploadedIds.append(result.id)
                    try? FileManager.default.removeItem(at: audioURL)
                }

                for attachment in attachments where attachment.type != .audio {
                    if let fileURL = mediaFiles[attachment.id] {
                        let thumbHash = pendingThumbnails[attachment.id]?.toThumbHash()
                        let result = try await uploader.uploadFile(
                            fileURL: fileURL, mimeType: attachment.mimeType, credential: .bearer(token), uploadContext: "post", thumbHash: thumbHash
                        )
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }

                progressCancellable?.cancel()

                await viewModel.createPost(
                    content: text,
                    type: ReelComposition.defaultType(
                        mimeTypes: attachments.map(\.mimeType) + (audioURL != nil ? ["audio/mp4"] : []),
                        durationsMs: attachments.map(\.duration),
                        forcePlainPost: composerForcePlainPost
                    ).rawValue,
                    mediaIds: uploadedIds.isEmpty ? nil : uploadedIds,
                    originalLanguage: composerLanguage,
                    // Le lieu ne se perdait QUE sur ce chemin — le jumeau hors
                    // ligne le transportait déjà. Un post média publié en ligne
                    // avec une position attachée arrivait donc sans elle, et le
                    // second opt-in n'avait rien à quantifier.
                    location: pendingPlace,
                    mentions: declaredReferences,
                    discoverabilityPrecision: nearbyPrecision
                )

                guard viewModel.publishError == nil else {
                    await MainActor.run {
                        feedCleanupAttachments()
                        uploadProgress = nil
                        isUploading = false
                        HapticFeedback.error()
                        FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.publishError", defaultValue: "Échec de la publication du post", bundle: .main))
                    }
                    return
                }

                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = false
                        isComposerFocused = false
                        composerText = ""
                    }
                    feedCleanupAttachments()
                    uploadProgress = nil
                    isUploading = false
                    HapticFeedback.success()
                    FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.published", defaultValue: "Post publié", bundle: .main))
                }
            } catch {
                await MainActor.run {
                    feedCleanupAttachments()
                    uploadProgress = nil
                    isUploading = false
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.publishError", defaultValue: "Échec de la publication du post", bundle: .main))
                }
            }
        }
    }

    // MARK: - Audio Post
    /// **Publier une voix : la matière est composée UNE fois, et elle part par
    /// la file DURABLE — en ligne comme hors ligne.**
    ///
    /// Ce corps montait le fichier par TUS sans aucune garde réseau, puis
    /// effaçait l'enregistrement dans son `catch`. Hors ligne, cette montée
    /// échouait SYSTÉMATIQUEMENT : l'enregistrement était donc DÉTRUIT à coup
    /// sûr, avec un toast d'erreur pour tout reste. Son jumeau
    /// `publishAudioFromSheet` perdait le même geste autrement — fichier
    /// orphelin que personne ne relit —, et les deux divergeaient en plus sur la
    /// LANGUE et sur les mentions. Trois divergences qu'aucune lecture de l'un
    /// des deux sites ne pouvait montrer.
    ///
    /// Ce qui est perdu en passant par la file est mesuré et NUL : ni l'un ni
    /// l'autre jumeau n'écrivait `uploadProgress` (seulement `isUploading`),
    /// donc aucune progression n'existe à perdre. Ce qui est gagné : un post
    /// optimiste immédiat, qui survit à un kill de l'app.
    ///
    /// **`originalLanguage` a disparu de la signature, et c'est le correctif.**
    /// La langue d'un vocal est celle qu'on PARLE : `PublishIntent` la tire de
    /// la transcription, ou de rien. L'unique appelant passait déjà
    /// `transcription?.language` ; le paramètre n'était qu'une porte ouverte sur
    /// la divergence du jumeau, qui empruntait la langue du sélecteur de TEXTE.
    ///
    /// **L'audience choisie GOUVERNE le vocal.** Elle ne le gouvernait pas :
    /// l'ancien corps appelait `createPost(...)` sans `visibility`, donc sur son
    /// défaut `"PUBLIC"`, et choisir « seulement ces personnes » avant
    /// d'enregistrer publiait quand même à tout le monde. La convergence a
    /// d'abord ÉCRIT ce défaut en toutes lettres, ce qui est pire qu'un
    /// défaut : un contrôle sans effet cesse d'être un oubli et devient une
    /// décision apparente. Loi 4 — un contrôle existe s'il a un EFFET.
    func publishAudioPost(audioURL: URL, mimeType: String, durationMs: Int, transcription: MobileTranscriptionPayload?) async {
        await MainActor.run { isUploading = true }

        await viewModel.publish(PublishIntent.audioRecording(
            fileURL: audioURL,
            mimeType: mimeType,
            durationMs: durationMs,
            transcription: transcription,
            forcePlainPost: composerForcePlainPost,
            content: nil,
            visibility: postVisibility,
            // `nil` et non `[]` quand la liste est vide : `[]` est entendu par
            // le gateway comme un effacement. Même expression qu'aux cinq
            // autres sites de publication de ce fichier.
            visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds,
            // Le composer reste ouvert pendant l'enregistrement : les personnes
            // qu'on venait d'y nommer partent avec le post audio, au lieu
            // d'être jetées au changement de surface.
            mentions: feedDeclaredReferences,
            location: nil,
            discoverabilityPrecision: nil
        ))

        await MainActor.run {
            isUploading = false
            if viewModel.publishError != nil {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.audioPublishError", defaultValue: "Échec de la publication du post audio", bundle: .main))
            } else {
                HapticFeedback.success()
                // Le chemin est UN, le mot est deux : le post est enfilé dans
                // les deux cas, mais dire « publié » sans réseau serait faux.
                FeedbackToastManager.shared.showSuccess(
                    NetworkMonitor.shared.isOffline
                        ? String(localized: "feed.post.toast.pendingOffline", defaultValue: "Post en attente d'envoi", bundle: .main)
                        : String(localized: "feed.post.toast.audioPublished", defaultValue: "Post audio publié", bundle: .main)
                )
            }
        }
    }

    /// Publie un post/réel dont l'audio est un son EMPRUNTÉ à la bibliothèque
    /// (porte « Bibliothèque » de la feuille unifiée d'enregistrement).
    ///
    /// Aucun upload : la piste construite référence `sound.id` + l'URL serveur
    /// du fichier — exactement la forme produite par
    /// `StoryComposerViewModel.addBorrowedSound`, pour que lecteur, export et
    /// capture serveur (usage, crédit) suivent le même chemin. Le type suit la
    /// règle de composition : un son ≥ 3 s qualifie un RÉEL (miroir gateway).
    func publishBorrowedSoundPost(_ sound: APISound) async {
        await MainActor.run { isUploading = true }
        await viewModel.createBorrowedSoundPost(
            type: BorrowedSoundPost.type(for: sound, forcePlainPost: composerForcePlainPost),
            storyEffects: BorrowedSoundPost.effects(for: sound),
            mentions: feedDeclaredReferences
        )

        await MainActor.run {
            isUploading = false
            if viewModel.publishError == nil {
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.audioPublished", defaultValue: "Post audio publié", bundle: .main))
            } else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.audioPublishError", defaultValue: "Échec de la publication du post audio", bundle: .main))
            }
        }
    }

    // MARK: - Cleanup
    private func feedCleanupAttachments() {
        // Sans cette remise à zéro, le post SUIVANT hériterait des personnes
        // nommées dans le précédent — et les notifierait.
        composerReferences = []
        pendingAttachments.removeAll()
        pendingPlace = nil
        // Le consentement porte sur UNE publication : sans cette remise à
        // zéro, l'interrupteur ouvert pour un lieu resterait ouvert pour le
        // suivant, que personne n'aurait examiné.
        nearbyDiscoverability = .disabled
        pendingAudioURL = nil
        pendingMediaFiles.removeAll()
        pendingThumbnails.removeAll()
        // Drop any recovered-draft link: a dismissed/cleaned composer must not
        // later supersede the stuck row (it stays queued for the next recovery).
        recoveredPostCmid = nil
    }

    // MARK: - Pending Attachments Row
    var feedPendingAttachmentsRow: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(preparingAttachments) { prep in
                        AttachmentLoadingTile(prep: prep) {
                            cancelFeedPreparation(prep)
                        }
                    }
                    ForEach(pendingAttachments) { attachment in
                        feedAttachmentTile(attachment)
                    }
                    if let place = pendingPlace {
                        feedPlaceTile(place)
                    }
                    if isLoadingMedia && preparingAttachments.isEmpty {
                        ProgressView()
                            .tint(MeeshyColors.brandPrimary)
                            .padding(.horizontal, 12)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .frame(height: 100)

            if feedOffersNearbyDiscoverability {
                NearbyDiscoverabilityControl(
                    choice: $nearbyDiscoverability,
                    accentColor: MeeshyColors.brandPrimaryHex,
                    // #4034 — le composant porte le nom du lieu qu'il gouverne.
                    // La feuille historique garde SA vignette de lieu (elle a
                    // une rangée de pièces jointes pour l'accueillir), donc le
                    // retrait passe par le même canal qu'elle : `pendingPlace`.
                    placeName: MediaKindLabel.placeTitle(name: pendingPlace?.name, address: pendingPlace?.address),
                    offersDiscoverability: true,
                    onRemovePlace: { pendingPlace = nil }
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
            }
        }
    }

    /// Le second opt-in n'est offert que si le lieu lui-même part, ET que
    /// l'audience permet à quiconque de le trouver.
    ///
    /// La règle vit dans `FeedNearbyDiscoverability.offers` — un seul site,
    /// testable sans monter de vue, partagé avec le jumeau de la feuille.
    /// Un média n'exclut plus rien : les quatre chemins de publication
    /// transportent désormais `location` ET la précision.
    var feedOffersNearbyDiscoverability: Bool {
        FeedNearbyDiscoverability.offers(
            hasPlace: pendingPlace != nil,
            visibility: selectedPostVisibility
        )
    }

    // MARK: - Attachment Tile
    private func feedAttachmentTile(_ attachment: MessageAttachment) -> some View {
        HStack(spacing: 0) {
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    let id = attachment.id
                    pendingAttachments.removeAll { $0.id == id }
                    if let url = pendingMediaFiles.removeValue(forKey: id) {
                        try? FileManager.default.removeItem(at: url)
                    }
                    pendingThumbnails.removeValue(forKey: id)
                }
            } label: {
                // Glyphe chrome dans un cadre de tap fixe 28×28 : figé (doctrine 82i) ; le libellé porte le sens
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(MeeshyColors.error)
                            .shadow(color: MeeshyColors.error.opacity(0.4), radius: 4, y: 2)
                    )
            }
            .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
            .padding(.trailing, 8)

            VStack(spacing: 4) {
                ZStack {
                    if let thumb = pendingThumbnails[attachment.id] {
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        if attachment.type == .video {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(.white, .black.opacity(0.4))
                                .accessibilityHidden(true)
                        }
                    } else if attachment.type == .location {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.success, MeeshyColors.success.opacity(0.7)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 56)
                            VStack(spacing: 2) {
                                Image(systemName: "mappin.circle.fill")
                                    .font(.system(size: 22))
                                    .foregroundStyle(.white, .white.opacity(0.3))
                                    .accessibilityHidden(true)
                                Circle()
                                    .fill(Color.white.opacity(0.3))
                                    .frame(width: 8, height: 4)
                                    .scaleEffect(x: 1.8, y: 1)
                            }
                        }
                    } else {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 56, height: 56)

                        Image(systemName: feedIconForType(attachment.type))
                            .font(.system(size: 22))
                            .foregroundColor(.white)
                            .accessibilityHidden(true)
                    }
                }
                .frame(width: 56, height: 56)

                Text(feedLabelForAttachment(attachment))
                    .font(MeeshyFont.relative(10, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .lineLimit(1)
                    .frame(width: 60)
            }
        }
    }

    // MARK: - Pending Place Tile
    /// Depuis la Task 11/12, un lieu choisi ne vit plus dans `pendingAttachments`
    /// (`SharedPlace` porte le nom, `MessageAttachment.location` ne le portait
    /// pas) : sans cette tuile dédiée le choix d'un lieu ne produirait plus
    /// aucun retour visuel dans le composer. Même gabarit pin-drop que le
    /// rendu `.location` existant ci-dessus.
    private func feedPlaceTile(_ place: SharedPlace) -> some View {
        HStack(spacing: 0) {
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    pendingPlace = nil
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(MeeshyColors.error)
                            .shadow(color: MeeshyColors.error.opacity(0.4), radius: 4, y: 2)
                    )
            }
            .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
            .padding(.trailing, 8)

            VStack(spacing: 4) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.success, MeeshyColors.success.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 56, height: 56)
                    VStack(spacing: 2) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white, .white.opacity(0.3))
                            .accessibilityHidden(true)
                        Circle()
                            .fill(Color.white.opacity(0.3))
                            .frame(width: 8, height: 4)
                            .scaleEffect(x: 1.8, y: 1)
                    }
                }
                .frame(width: 56, height: 56)

                Text(MediaKindLabel.placeLabel(place.name))
                    .font(MeeshyFont.relative(10, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .lineLimit(1)
                    .frame(width: 60)
            }
        }
    }

    // MARK: - Helpers
    //
    // `feedGenerateVideoThumbnail(url:)` a vécu ici sans site d'appel — TROISIÈME
    // écriture de la même vignette, la première étant `generateVideoThumbnail`
    // plus bas DANS CE FICHIER, la seconde `AttachmentPreparationService`.

    func feedGetFileSize(_ url: URL) -> Int {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }

    func feedMimeTypeForURL(_ url: URL) -> String {
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // NB: the legacy table here had a latent bug where `docx` was mapped
        // to `application/msword` (the .doc mime), making Word docx files
        // indistinguishable from .doc in downstream AttachmentKind dispatch.
        // The resolver maps docx to its canonical
        // `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
        MimeTypeResolver.mimeType(forURL: url)
    }

    func feedIconForType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    // Une pièce jointe de publication en attente se lit EXACTEMENT comme celle
    // d'un message : même source, `MediaKindLabel.attachmentLabel(for:)`.
    func feedLabelForAttachment(_ attachment: MessageAttachment) -> String {
        MediaKindLabel.attachmentLabel(for: attachment)
    }
}

// MARK: - Feed Composer Sheet (Fullscreen from ThemedFeedOverlay)
struct FeedComposerSheet: View {
    @ObservedObject var viewModel: FeedViewModel
    let initialText: String
    let pendingAttachmentType: String?
    var quotePost: FeedPost? = nil
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @ObservedObject private var authManager = AuthManager.shared
    @State private var composerText = ""
    @FocusState private var isFocused: Bool
    @State private var editingAttachmentId: String?
    @State private var videosToPreview: [URL] = []
    @State private var editingVideoURL: URL?

    @State private var pendingAttachments: [MessageAttachment] = []
    /// Lieu choisi via le picker, en attente d'envoi (Task 11/12,
    /// 2026-07-29) — `SharedPlace` porte le nom, `MessageAttachment.location`
    /// ne le portait pas et n'est plus le véhicule.
    @State private var pendingPlace: SharedPlace? = nil
    /// Le SECOND opt-in de position (spec du 2026-08-02 §2), jumeau de celui
    /// du composer en ligne de `FeedView` — même règle, même composant, deux
    /// hôtes. La feuille étant démontée à la publication, il n'y a rien à
    /// remettre à zéro ici : l'état repart `.disabled` à chaque ouverture.
    @State private var nearbyDiscoverability: NearbyDiscoverabilityChoice = .disabled
    @State private var pendingMediaFiles: [String: URL] = [:]
    @State private var pendingThumbnails: [String: UIImage] = [:]
    @State private var pendingAudioURL: URL?
    @State private var preparingAttachments: [PreparingAttachment] = []
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFilePicker = false
    @State private var showLocationPicker = false
    @State private var isUploading = false
    @State private var uploadProgress: UploadQueueProgress?
    @State private var isLoadingMedia = false
    @State private var postVisibility: String = "PUBLIC"
    /// Audience nommée de la publication en cours (EXCEPT/ONLY) et le
    /// sélecteur de personnes qui la remplit. Vides tant que l'auteur reste
    /// sur une visibilité qui n'en demande pas.
    @State private var postVisibilityUserIds: [String] = []
    @State private var audiencePickerMode: PostVisibility? = nil

    /// La visibilité choisie, relue comme un mode du modèle — un `rawValue`
    /// inconnu (état corrompu) retombe sur PUBLIC, le défaut produit.
    private var selectedPostVisibility: PostVisibility {
        PostVisibility(rawValue: postVisibility) ?? .public
    }

    /// EXCEPT sans exclus = privé fantôme ; ONLY sans inclus = invisible pour
    /// tous. Le gateway les REFUSE (`CreatePostSchema`) : mieux vaut retenir
    /// l'envoi ici que le laisser échouer après coup.
    private var postAudienceIncomplete: Bool {
        selectedPostVisibility.requiresUserSelection && postVisibilityUserIds.isEmpty
    }

    /// A QUALIFYING composition (video || audio || >= 2 images —
    /// `ReelComposition.qualifiesAsReel`) defaults to a REEL; the author can
    /// flip this to keep it a plain POST. A non-qualifying composition (single
    /// image, documents) is ALWAYS a POST — the toggle hides and
    /// `defaultType` ignores this flag.
    @State private var forcePlainPost = false
    @State private var showEmojiPicker = false
    @State private var showAudioComposer = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var showLanguagePicker = false
    /// Les personnes que ce post nomme SANS que son texte le dise. Aucune n'est
    /// INLINE : celles-là, le serveur les relit du contenu lui-même.
    @State private var references: [ComposerReference] = []

    /// Une citation part par `POST /posts/:id/repost`, qui n'accepte aucune
    /// `mentions` : y proposer le choix promettrait une notification que rien
    /// n'enverrait.
    private var declaresReferences: Bool { quotePost == nil }

    private var composerLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: composerLanguage) ?? composerLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    private var hasContent: Bool {
        // pendingPlace inclus : sinon le bouton Publier reste desactive pour une
        // position seule et publishPost() (dont le garde autorise deja ce cas)
        // ne devient jamais atteignable (Task 13, 2026-07-29).
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty || pendingPlace != nil
    }

    /// Reel ⇄ Post chip shown when the composition QUALIFIES as a reel (video
    /// || audio || >= 2 images). Tapping flips it to a plain post so it stays
    /// out of the reels surface.
    private var reelTypeToggle: some View {
        Button {
            forcePlainPost.toggle()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: forcePlainPost ? "doc.text" : "play.rectangle.on.rectangle.fill")
                    .font(MeeshyFont.relative(10))
                Text(forcePlainPost
                    ? String(localized: "feed.composer.type.post", defaultValue: "Post", bundle: .main)
                    : String(localized: "feed.composer.type.reel", defaultValue: "Réel", bundle: .main))
                    .font(MeeshyFont.relative(12))
            }
            .foregroundColor(forcePlainPost ? theme.textMuted : MeeshyColors.indigo300)
        }
        .accessibilityHint(String(localized: "feed.composer.type.hint", defaultValue: "Bascule entre réel et post", bundle: .main))
        .padding(.leading, 12)
    }

    var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button {
                        cleanupAndDismiss()
                    } label: {
                        Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                            .font(MeeshyFont.relative(15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }

                    Spacer()

                    Text(String(localized: "feed.post.composer.title", defaultValue: "Nouveau post", bundle: .main))
                        .font(MeeshyFont.relative(16, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Button {
                        publishPost()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.8)
                        } else {
                            Text(String(localized: "feed.post.composer.publish", defaultValue: "Publier", bundle: .main))
                                .font(MeeshyFont.relative(15, weight: .bold))
                                .foregroundColor(hasContent ? MeeshyColors.indigo300 : theme.textMuted)
                        }
                    }
                    .disabled(!hasContent || isUploading || postAudienceIncomplete)
                }
                .padding(16)
                .background(theme.backgroundSecondary)

                Divider().background(theme.inputBorder)

                // User row
                HStack(spacing: 12) {
                    MeeshyAvatar(
                        name: getUserDisplayName(authManager.currentUser, fallback: "M"),
                        context: .feedComposer,
                        avatarURL: authManager.currentUser?.avatar
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(getUserDisplayName(authManager.currentUser, fallback: String(localized: "feed.composer.me", defaultValue: "Moi", bundle: .main)))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        // Les SIX audiences du modèle, comme le composer story
                        // et l'éditeur : trois d'entre elles (COMMUNITY,
                        // EXCEPT, ONLY) étaient inatteignables à la création
                        // d'un post — offertes ailleurs, refusées ici.
                        Menu {
                            ForEach(PostVisibility.allCases) { mode in
                                Button {
                                    postVisibility = mode.rawValue
                                    // Un consentement de découvrabilité ne
                                    // survit pas à un resserrement d'audience
                                    // qu'il ne couvrait pas : le contrôle
                                    // disparaît hors PUBLIC, et un opt-in
                                    // resté ouvert derrière lui repartirait
                                    // au prochain élargissement sans que
                                    // personne ne l'ait réexaminé.
                                    if mode != .public {
                                        nearbyDiscoverability.reset()
                                    }
                                    if mode.requiresUserSelection {
                                        audiencePickerMode = mode
                                    } else {
                                        postVisibilityUserIds = []
                                    }
                                } label: {
                                    Label(mode.label, systemImage: mode.icon)
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: selectedPostVisibility.icon)
                                    .font(MeeshyFont.relative(10))
                                Text(selectedPostVisibility.label)
                                    .font(MeeshyFont.relative(12))
                            }
                            .foregroundColor(theme.textMuted)
                        }
                        .sheet(item: $audiencePickerMode) { mode in
                            AudienceUserPickerView(mode: mode, initialSelection: postVisibilityUserIds) { ids in
                                postVisibilityUserIds = ids
                            }
                        }
                    }
                    // Toggle visible SEULEMENT quand la composition qualifie
                    // (règle produit 2026-08-02 + directive durée minimale).
                    // Retirer une image (2→1) le fait disparaître et
                    // `defaultType` retombe sur POST — aucun REEL 1-image
                    // publiable, ni une vidéo/audio de moins de 3s.
                    if ReelComposition.qualifiesAsReel(
                        mimeTypes: pendingAttachments.map(\.mimeType)
                            + (pendingAudioURL != nil ? ["audio/mp4"] : []),
                        durationsMs: pendingAttachments.map(\.duration)
                    ) {
                        reelTypeToggle
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                // Text editor
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text(String(localized: "feed.post.composer.placeholder", defaultValue: "Qu'avez-vous en tête ?", bundle: .main))
                            .font(MeeshyFont.relative(17))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }
                    TextEditor(text: $composerText)
                        .focused($isFocused)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(theme.textPrimary)
                        .font(MeeshyFont.relative(17))
                        .frame(minHeight: 120)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }

                // Première porte : la frappe `@`. Posée SOUS le champ — la
                // liste suit la ligne qu'on écrit au lieu de recouvrir ce qui
                // précède.
                if declaresReferences {
                    ReferenceMentionSuggestions(text: $composerText,
                                                references: $references,
                                                background: theme.inputBackground)
                        .padding(.horizontal, 16)
                }

                // Quoted post preview
                if let quoted = quotePost {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            MeeshyAvatar(
                                name: quoted.author,
                                context: .postComment,
                                accentColor: quoted.authorColor,
                                avatarURL: quoted.authorAvatarURL
                            )
                            Text(quoted.author)
                                .font(MeeshyFont.relative(13, weight: .semibold))
                                .foregroundColor(theme.accentText(quoted.authorColor))
                            MetaSeparator().foregroundColor(theme.textMuted)
                            Text(quoted.timestamp, style: .relative)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(theme.textMuted)
                        }
                        Text(quoted.displayContent)
                            .font(MeeshyFont.relative(14))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(4)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: quoted.authorColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(theme.border(tint: quoted.authorColor, intensity: 0.2), lineWidth: 1)
                            )
                    )
                    .padding(.horizontal, 16)
                }

                // Pending attachments
                if !pendingAttachments.isEmpty || !preparingAttachments.isEmpty || isLoadingMedia || pendingPlace != nil {
                    sheetAttachmentsRow
                }

                if offersNearbyDiscoverability {
                    NearbyDiscoverabilityControl(
                        choice: $nearbyDiscoverability,
                        accentColor: MeeshyColors.brandPrimaryHex,
                        placeName: MediaKindLabel.placeTitle(name: pendingPlace?.name, address: pendingPlace?.address),
                        offersDiscoverability: true,
                        onRemovePlace: { pendingPlace = nil }
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
                }

                // Upload progress
                if isUploading, let progress = uploadProgress {
                    UploadProgressBar(progress: progress, accentColor: MeeshyColors.brandPrimaryHex)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                }

                Spacer(minLength: 0)

                // Seconde porte, plus l'unique état visible des références —
                // donc le seul endroit d'où une SILENCIEUSE se voit, et le seul
                // d'où elle se retire.
                if declaresReferences {
                    ReferenceComposerBar(references: $references,
                                         accentColor: MeeshyColors.indigo500)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                }

                // Toolbar
                HStack(spacing: 16) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.brandPrimary)
                    }
                    .accessibilityLabel(String(localized: "Ajouter une photo", defaultValue: "Ajouter une photo"))
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.error)
                    }
                    .accessibilityLabel(String(localized: "Prendre une photo", defaultValue: "Prendre une photo"))
                    Button { showEmojiPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "face.smiling.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "F8B500"))
                    }
                    .accessibilityLabel(String(localized: "Ajouter un emoji", defaultValue: "Ajouter un emoji"))
                    Button { showFilePicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "9B59B6"))
                    }
                    .accessibilityLabel(String(localized: "Joindre un fichier", defaultValue: "Joindre un fichier"))
                    Button { showLocationPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.success)
                    }
                    .accessibilityLabel(String(localized: "Partager la position", defaultValue: "Partager la position"))
                    Button { showAudioComposer = true; HapticFeedback.light() } label: {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.errorStrong)
                    }
                    .accessibilityLabel(String(localized: "Enregistrer un audio", defaultValue: "Enregistrer un audio"))

                    Spacer()

                    Button {
                        showLanguagePicker = true
                        HapticFeedback.light()
                    } label: {
                        Text(ComposerLanguageFlag.label(for: composerLanguage))
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(MeeshyColors.indigo100.opacity(isDark ? 0.15 : 1))
                                    .overlay(
                                        Capsule()
                                            .stroke(MeeshyColors.indigo300.opacity(0.3), lineWidth: 1)
                                    )
                            )
                    }
                    .accessibilityLabel(String(localized: "Langue du post", defaultValue: "Langue du post"))
                    .accessibilityValue(composerLanguageDisplayName)
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
        }
        // Cible de dépôt de la recette commune (Lot 1) : la feuille EST le
        // composer, la bande couvre donc tout son contenu. Même modificateur
        // que `UniversalComposerBar.body` — affordance et résolution partagées.
        .modifier(ComposerDropTargetModifier(
            accentColor: MeeshyColors.brandPrimaryHex,
            onIngest: { handleSheetComposerIngest($0) }
        ))
        .sheet(isPresented: $showAudioComposer) {
            AudioPostComposerView(
                onPublish: { audioURL, mimeType, durationMs, transcription in
                    showAudioComposer = false
                    Task {
                        await publishAudioFromSheet(audioURL: audioURL, mimeType: mimeType, durationMs: durationMs, transcription: transcription)
                    }
                },
                onPublishBorrowed: { sound in
                    showAudioComposer = false
                    Task { await publishBorrowedSoundFromSheet(sound) }
                }
            )
        }
        .sheet(isPresented: $showLanguagePicker) {
            AudioLanguagePickerView(
                selectedLocale: Binding(
                    get: { Locale(identifier: composerLanguage) },
                    set: { newLocale in
                        let langCode = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                        composerLanguage = langCode
                    }
                )
            )
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    handleCameraCapture(image)
                case .video(let url):
                    handleCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { place in
                handleLocationSelection(place)
            }
        }
        .fullScreenCover(item: Binding<EditingAttachmentItem?>(
            get: {
                guard let id = editingAttachmentId, let image = pendingThumbnails[id] else { return nil }
                return EditingAttachmentItem(id: id, image: image)
            },
            set: { editingAttachmentId = $0?.id }
        )) { item in
            MeeshyImageEditorView(image: item.image, context: .post) { editedImage in
                pendingThumbnails[item.id] = editedImage
                Task {
                    let result = await MediaCompressor.shared.compressImage(editedImage)
                    let fileName = "edited_\(UUID().uuidString).\(result.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try? result.data.write(to: tempURL)
                    await MainActor.run {
                        if let oldURL = pendingMediaFiles[item.id] {
                            try? FileManager.default.removeItem(at: oldURL)
                        }
                        pendingMediaFiles[item.id] = tempURL
                        if let idx = pendingAttachments.firstIndex(where: { $0.id == item.id }) {
                            pendingAttachments[idx] = MessageAttachment(
                                id: item.id,
                                fileName: fileName,
                                originalName: fileName,
                                mimeType: result.mimeType,
                                fileSize: result.data.count,
                                fileUrl: tempURL.absoluteString,
                                width: Int(editedImage.size.width),
                                height: Int(editedImage.size.height),
                                thumbnailColor: pendingAttachments[idx].thumbnailColor
                            )
                        }
                    }
                }
            }
            .ignoresSafeArea()
        }
        // PhotosPicker videos queue → VideoPreviewView
        .fullScreenCover(isPresented: Binding(
            get: { !videosToPreview.isEmpty },
            set: { if !$0 { videosToPreview.removeAll() } }
        )) {
            if let url = videosToPreview.first {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { result in
                        handleCameraVideo(result.url)
                        videosToPreview.removeFirst()
                    },
                    onCancel: {
                        videosToPreview.removeFirst()
                    }
                )
            }
        }
        // Tap pending video → unified video editor
        .fullScreenCover(isPresented: Binding(
            get: { editingVideoURL != nil },
            set: { if !$0 { editingVideoURL = nil } }
        )) {
            if let url = editingVideoURL {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { _ in editingVideoURL = nil },
                    onCancel: { editingVideoURL = nil }
                )
            }
        }
        .adaptiveOnChange(of: selectedPhotoItems) { _, items in
            handlePhotoSelection(items)
        }
        .onAppear {
            composerText = initialText
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isFocused = true
                openInitialPicker()
            }
        }
    }

    // MARK: - Open Initial Picker
    private func openInitialPicker() {
        guard let type = pendingAttachmentType else { return }
        switch type {
        case "photo": showPhotoPicker = true
        case "camera": showCamera = true
        case "file": showFilePicker = true
        case "location": showLocationPicker = true
        default: break
        }
    }

    // MARK: - Attachments Row
    private var sheetAttachmentsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(preparingAttachments) { prep in
                    AttachmentLoadingTile(prep: prep, size: 72) {
                        cancelSheetPreparation(prep)
                    }
                }
                ForEach(pendingAttachments) { attachment in
                    sheetAttachmentTile(attachment)
                }
                if let place = pendingPlace {
                    sheetPlaceTile(place)
                }
                if isLoadingMedia && preparingAttachments.isEmpty {
                    ProgressView()
                        .tint(MeeshyColors.brandPrimary)
                        .padding(.horizontal, 12)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(height: 116)
    }

    private func sheetAttachmentTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: 4) {
            ZStack {
                if let thumb = pendingThumbnails[attachment.id] {
                    Image(uiImage: thumb)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onTapGesture {
                            if attachment.type == .image {
                                editingAttachmentId = attachment.id
                            } else if attachment.type == .video {
                                if let url = pendingMediaFiles[attachment.id] {
                                    editingVideoURL = url
                                }
                            }
                        }

                    if attachment.type == .video {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white, .black.opacity(0.4))
                            .accessibilityHidden(true)
                    }
                } else if attachment.type == .location {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [MeeshyColors.success, MeeshyColors.successDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(size: 26))
                                .foregroundStyle(.white, .white.opacity(0.3))
                                .accessibilityHidden(true)
                        )
                } else {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: sheetIconForType(attachment.type))
                                .font(.system(size: 26))
                                .foregroundColor(.white)
                                .accessibilityHidden(true)
                        )
                }
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        let id = attachment.id
                        pendingAttachments.removeAll { $0.id == id }
                        if let url = pendingMediaFiles.removeValue(forKey: id) {
                            try? FileManager.default.removeItem(at: url)
                        }
                        pendingThumbnails.removeValue(forKey: id)
                    }
                } label: {
                    // Glyphe chrome dans un cadre de tap fixe 20×20 : figé (doctrine 82i) ; le libellé porte le sens
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
                .offset(x: 6, y: -6)
            }

            Text(sheetLabelForAttachment(attachment))
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    /// Depuis la Task 11/12, un lieu choisi ne vit plus dans `pendingAttachments`
    /// — cette tuile dédiée (même gabarit 72×72 pin-drop) est ce qui évite que
    /// le choix d'un lieu ne produise plus aucun retour visuel ici.
    private func sheetPlaceTile(_ place: SharedPlace) -> some View {
        VStack(spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(LinearGradient(colors: [MeeshyColors.success, MeeshyColors.successDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(.white, .white.opacity(0.3))
                            .accessibilityHidden(true)
                    )
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        pendingPlace = nil
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
                .offset(x: 6, y: -6)
            }

            Text(MediaKindLabel.placeLabel(place.name))
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    // MARK: - Handlers (delegated to AttachmentPreparationService)
    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            if isVideo {
                // Videos go through the editor first — compress + queue the
                // compressed URL for the previewer. The editor is the source
                // of truth for trimming/cover selection; once the user
                // confirms there, `handleCameraVideo` (below) wires the
                // preparation into the loading tray.
                Task {
                    if let movieData = try? await item.loadTransferable(type: Data.self) {
                        let rawURL = FileManager.default.temporaryDirectory.appendingPathComponent("video_raw_\(UUID().uuidString).mp4")
                        try? movieData.write(to: rawURL)
                        let compressedURL: URL
                        do {
                            compressedURL = try await MediaCompressor.shared.compressVideo(rawURL, context: .feedPost)
                            try? FileManager.default.removeItem(at: rawURL)
                        } catch { compressedURL = rawURL }
                        await MainActor.run { videosToPreview.append(compressedURL) }
                    }
                }
            } else {
                let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                    item, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex
                )
                trackSheetPreparation(prep)
            }
        }
    }

    private func handleCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex
        )
        trackSheetPreparation(prep)
    }

    private func handleCameraVideo(_ url: URL) {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .feedPost
        )
        trackSheetPreparation(prep)
    }

    private func trackSheetPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.append(prep)
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    pendingThumbnails[prepared.attachment.id] = thumb
                }
                pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparingAttachments.removeAll { $0.id == prep.id }
        }
    }

    private func cancelSheetPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.removeAll { $0.id == prep.id }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            guard url.startAccessingSecurityScopedResource() else { continue }
            defer { url.stopAccessingSecurityScopedResource() }
            let fileName = url.lastPathComponent
            let mimeType = mimeTypeForURL(url)
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
            try? FileManager.default.copyItem(at: url, to: tempURL)
            appendSheetFileAttachment(tempURL: tempURL, fileName: fileName, mimeType: mimeType)
        }
        HapticFeedback.light()
    }

    /// Cœur commun de l'importateur de documents et de l'ingestion dépôt :
    /// enregistre un fichier DÉJÀ dans notre conteneur comme pièce jointe en
    /// attente — même factorisation que `FeedView.appendFeedFileAttachment`.
    private func appendSheetFileAttachment(tempURL: URL, fileName: String, mimeType: String) {
        let fileSize = (try? FileManager.default.attributesOfItem(atPath: tempURL.path)[.size] as? Int) ?? 0
        let attachmentId = UUID().uuidString
        let attachment = MessageAttachment(id: attachmentId, fileName: fileName, originalName: fileName, mimeType: mimeType, fileSize: fileSize, fileUrl: tempURL.absoluteString, thumbnailColor: "45B7D1")
        pendingMediaFiles[attachmentId] = tempURL
        pendingAttachments.append(attachment)
    }

    /// Recette commune des quatre hôtes, déclinée pour la feuille plein
    /// écran : mêmes pipelines que ses pickers (`trackSheetPreparation`,
    /// `handleFileImport`), même règle « une seule insertion » pour le texte.
    private func handleSheetComposerIngest(_ ingests: [ComposerIngest]) {
        guard !ingests.isEmpty else { return }
        var texts: [String] = []
        for ingest in ingests {
            switch ingest {
            case .text(let value):
                texts.append(value)
            case .file(let url, let name, let mime):
                switch ComposerIngestRouter.route(mime: mime) {
                case .image:
                    guard let image = UIImage(contentsOfFile: url.path) else {
                        // Pas de tuile fantôme : l'image illisible est nommée
                        // dans un toast et son fichier temporaire retiré.
                        ComposerIngestFeedback.showFailure(names: [name])
                        try? FileManager.default.removeItem(at: url)
                        continue
                    }
                    let prep = AttachmentPreparationService.shared.prepareImage(
                        image, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex
                    )
                    trackSheetPreparation(prep)
                    try? FileManager.default.removeItem(at: url)
                case .video:
                    let prep = AttachmentPreparationService.shared.prepareVideo(
                        sourceURL: url,
                        deleteSourceAfterCompression: true,
                        context: .feedPost
                    )
                    trackSheetPreparation(prep)
                case .audio, .file:
                    appendSheetFileAttachment(tempURL: url, fileName: name, mimeType: mime)
                }
            }
        }
        if !texts.isEmpty {
            // UNE seule insertion, `\n` entre éléments — le `TextEditor`
            // SwiftUI (cible iOS 16) n'expose pas le curseur : fin de champ.
            let joined = texts.joined(separator: "\n")
            composerText = composerText.isEmpty ? joined : composerText + "\n" + joined
        }
        HapticFeedback.light()
    }

    /// Le picker émet désormais un `SharedPlace` complet — `MessageAttachment.location`
    /// ne portait ni le nom ni l'adresse et n'est plus le véhicule (Task 11/12).
    private func handleLocationSelection(_ place: SharedPlace) {
        withAnimation {
            pendingPlace = place
            nearbyDiscoverability = FeedNearbyDiscoverability.choiceForNewPlace()
        }
        HapticFeedback.light()
    }

    /// Jumeau de `feedOffersNearbyDiscoverability`, même règle, même site.
    private var offersNearbyDiscoverability: Bool {
        FeedNearbyDiscoverability.offers(
            hasPlace: pendingPlace != nil,
            visibility: selectedPostVisibility
        )
    }

    // MARK: - Publish
    /// Ce que la publication DÉCLARE : les non-INLINE, et `nil` quand il n'y
    /// en a aucune — `[]` serait entendu par le serveur comme un effacement.
    private var declaredReferences: [PostMentionInput]? {
        let declared = ComposerReferences.payload(references)
        return declared.isEmpty ? nil : declared
    }

    private func publishPost() {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        // Une position seule, sans texte ni piece jointe, doit pouvoir partir : sinon
        // handleLocationSelection() range le lieu dans pendingPlace et ce garde le
        // jette en silence (Task 13, 2026-07-29).
        guard !text.isEmpty || !pendingAttachments.isEmpty || pendingPlace != nil else { return }

        // Quote mode: repost with content instead of createPost
        if let quotePost {
            onDismiss()
            HapticFeedback.success()
            Task { await viewModel.repostPost(quotePost.id, content: text, isQuote: true) }
            return
        }

        let attachments = pendingAttachments
        let mediaFiles = pendingMediaFiles
        let hasFiles = !mediaFiles.isEmpty
        // Capturé avant `onDismiss()` : la feuille est démontée aussitôt, et
        // relire son `@State` depuis la Task ne déclarerait plus personne.
        let declared = declaredReferences
        // Même capture, même raison — et la mémoire locale du palier s'écrit
        // ICI, au moment où il SERT : la spec parle du dernier choix
        // « utilisé », pas du dernier survolé.
        let nearbyPrecision = offersNearbyDiscoverability
            ? nearbyDiscoverability.precisionToSend
            : nil
        // Le lieu, capturé pour la même raison que `declared` : la feuille est
        // démontée par `onDismiss()`, et une lecture tardive depuis la Task
        // d'envoi ne trouverait plus rien.
        let capturedPlace = pendingPlace
        if offersNearbyDiscoverability {
            FeedNearbyDiscoverability.remember(nearbyDiscoverability)
        }

        if !hasFiles || attachments.isEmpty {
            onDismiss()
            HapticFeedback.success()
            if !text.isEmpty || pendingPlace != nil {
                let lang = composerLanguage
                Task { await viewModel.createPost(content: text, visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds, originalLanguage: lang, location: pendingPlace, mentions: declared, discoverabilityPrecision: nearbyPrecision) }
            }
            return
        }

        // U1b — offline: route the media post through the durable outbox instead
        // of the TUS upload (which throws offline → the post would be lost). The
        // post appears optimistically (local-media preview); the OutboxFlusher
        // uploads + creates on reconnect, and the cmid echo reconciles it
        // (U1 ST2). Mirrors the message offline-media gate. Text-only offline
        // posts are already durable via createPost above (U1 ST3).
        if NetworkMonitor.shared.isOffline {
            let sources = attachments.compactMap { mediaFiles[$0.id] }
            let lang = composerLanguage
            // Mirror the online classification (line below) so an offline media
            // post lands on the same surface (REEL for video / multi-image).
            let postType = ReelComposition.defaultType(
                mimeTypes: attachments.map(\.mimeType),
                durationsMs: attachments.map(\.duration),
                forcePlainPost: forcePlainPost
            ).rawValue
            onDismiss()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.pendingOffline", defaultValue: "Post en attente d'envoi", bundle: .main))
            Task {
                await viewModel.createOfflineMediaPost(
                    localMediaURLs: sources,
                    content: text,
                    visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds,
                    originalLanguage: lang,
                    type: postType,
                    location: pendingPlace,
                    mentions: declared,
                    discoverabilityPrecision: nearbyPrecision,
                    mobileTranscription: nil
                )
            }
            return
        }

        isUploading = true
        HapticFeedback.light()

        Task {
            do {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    await MainActor.run { isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var progressCancellable: AnyCancellable?
                progressCancellable = uploader.progressPublisher
                    .receive(on: DispatchQueue.main)
                    .sink { [progressCancellable] progress in
                        _ = progressCancellable
                        uploadProgress = progress
                    }

                var uploadedIds: [String] = []
                for attachment in attachments {
                    if let fileURL = mediaFiles[attachment.id] {
                        let thumbHash = pendingThumbnails[attachment.id]?.toThumbHash()
                        let result = try await uploader.uploadFile(fileURL: fileURL, mimeType: attachment.mimeType, credential: .bearer(token), uploadContext: "post", thumbHash: thumbHash)
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }
                progressCancellable?.cancel()

                await viewModel.createPost(content: text, type: ReelComposition.defaultType(mimeTypes: attachments.map(\.mimeType), durationsMs: attachments.map(\.duration), forcePlainPost: forcePlainPost).rawValue, visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds, mediaIds: uploadedIds.isEmpty ? nil : uploadedIds, originalLanguage: composerLanguage, location: capturedPlace, mentions: declared, discoverabilityPrecision: nearbyPrecision)

                guard viewModel.publishError == nil else {
                    await MainActor.run {
                        isUploading = false
                        uploadProgress = nil
                        for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                        HapticFeedback.error()
                        FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.publishError", defaultValue: "Échec de la publication du post", bundle: .main))
                    }
                    return
                }

                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    onDismiss()
                    HapticFeedback.success()
                    FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.published", defaultValue: "Post publié", bundle: .main))
                }
            } catch {
                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.publishError", defaultValue: "Échec de la publication du post", bundle: .main))
                }
            }
        }
    }

    /// Jumelle de `FeedView.publishAudioPost` — MÊME matière, composée par la
    /// MÊME fabrique. C'est tout l'objet du lot : les deux divergeaient sur la
    /// perte du fichier (celui-ci le laissait ORPHELIN au lieu de l'effacer),
    /// sur la LANGUE (il empruntait `composerLanguage` quand la transcription
    /// manquait — un vocal en wolof composé dans un composer réglé sur « fr »
    /// partait déclaré français, et le Prisme le servait au rang 0 sous une
    /// étiquette fausse) et sur les mentions.
    ///
    /// L'audience choisie voyage ici comme chez le jumeau. **Résidu nommé** :
    /// une audience INCOMPLÈTE (`ONLY`/`EXCEPT` sans destinataire — ce que
    /// `postAudienceIncomplete` retient sur le bouton d'envoi TEXTE) n'est pas
    /// retenue sur ce chemin ; le gateway la refuse alors (400), la ligne
    /// quitte la file et l'auteur est prévenu. Bruyant, mais jamais silencieux
    /// — c'est l'inverse exact du défaut d'hier, qui publiait PUBLIC sans rien
    /// dire.
    private func publishAudioFromSheet(audioURL: URL, mimeType: String, durationMs: Int, transcription: MobileTranscriptionPayload?) async {
        await MainActor.run { isUploading = true }

        await viewModel.publish(PublishIntent.audioRecording(
            fileURL: audioURL,
            mimeType: mimeType,
            durationMs: durationMs,
            transcription: transcription,
            forcePlainPost: forcePlainPost,
            content: nil,
            visibility: postVisibility,
            visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds,
            mentions: declaredReferences,
            location: nil,
            discoverabilityPrecision: nil
        ))

        await MainActor.run {
            isUploading = false
            if viewModel.publishError != nil {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.audioPublishError", defaultValue: "Échec de la publication du post audio", bundle: .main))
            } else {
                onDismiss()
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(
                    NetworkMonitor.shared.isOffline
                        ? String(localized: "feed.post.toast.pendingOffline", defaultValue: "Post en attente d'envoi", bundle: .main)
                        : String(localized: "feed.post.toast.audioPublished", defaultValue: "Post audio publié", bundle: .main)
                )
            }
        }
    }

    /// Variante sheet de `FeedView.publishBorrowedSoundPost` — mêmes helpers
    /// purs (`BorrowedSoundPost`), mais l'état (`isUploading`, `forcePlainPost`,
    /// `onDismiss`) est celui du composer sheet.
    private func publishBorrowedSoundFromSheet(_ sound: APISound) async {
        await MainActor.run { isUploading = true }
        await viewModel.createBorrowedSoundPost(
            type: BorrowedSoundPost.type(for: sound, forcePlainPost: forcePlainPost),
            storyEffects: BorrowedSoundPost.effects(for: sound),
            mentions: declaredReferences
        )
        await MainActor.run {
            isUploading = false
            if viewModel.publishError == nil {
                onDismiss()
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.audioPublished", defaultValue: "Post audio publié", bundle: .main))
            } else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.audioPublishError", defaultValue: "Échec de la publication du post audio", bundle: .main))
            }
        }
    }

    private func cleanupAndDismiss() {
        for (_, url) in pendingMediaFiles { try? FileManager.default.removeItem(at: url) }
        onDismiss()
    }

    // MARK: - Helpers
    private func generateVideoThumbnail(url: URL) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 200, height: 200)
        return try? await UIImage(cgImage: generator.image(at: .zero).image)
    }

    private func mimeTypeForURL(_ url: URL) -> String {
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // Replaces a deliberately-narrow table that excluded several formats
        // (webp/heic/wav/audio/ogg/...) — the resolver covers all of them.
        MimeTypeResolver.mimeType(forURL: url)
    }

    private func sheetIconForType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    private func sheetLabelForAttachment(_ attachment: MessageAttachment) -> String {
        MediaKindLabel.attachmentLabel(for: attachment)
    }
}

private struct EditingAttachmentItem: Identifiable {
    let id: String
    let image: UIImage
}

// MARK: - Borrowed sound post building

/// Construction PURE d'un post/réel « son emprunté seul », partagée par les
/// deux surfaces de publication (`FeedView.publishBorrowedSoundPost` et
/// `FeedComposerSheet.publishBorrowedSoundFromSheet`).
enum BorrowedSoundPost {
    /// Blob `storyEffects` portant l'unique piste empruntée — exactement la
    /// forme produite par `StoryComposerViewModel.addBorrowedSound` (`soundId`
    /// + `mediaURL` serveur, `postMediaId` vide), pour que lecteur, export et
    /// capture serveur (usage, crédit) suivent le même chemin.
    static func effects(for sound: APISound) -> StoryEffects {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(
                postMediaId: "",
                placement: "overlay",
                x: 0.5,
                y: 0.65,
                volume: 1.0,
                waveformSamples: sound.waveform,
                isBackground: true,
                duration: sound.durationSeconds.map { Float($0) },
                name: sound.hasAuthoredTitle ? sound.title : nil,
                mediaURL: sound.fileUrl,
                soundId: sound.id,
                soundAuthorUsername: sound.uploader?.username
            ),
        ]
        return effects
    }

    /// Un son ≥ 3 s qualifie un RÉEL (`ReelComposition`, miroir de la règle
    /// gateway étendue aux sons empruntés) ; `forcePlainPost` reste respecté.
    static func type(for sound: APISound, forcePlainPost: Bool) -> String {
        let qualifiesAsReel = (sound.durationMs ?? 0) >= ReelComposition.minQualifyingDurationMs
        return (!forcePlainPost && qualifiesAsReel)
            ? PostType.reel.rawValue
            : PostType.post.rawValue
    }
}
