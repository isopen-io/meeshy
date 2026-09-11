import SwiftUI
import PhotosUI
import AVFoundation
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Feed Attachment Handlers
extension FeedView {

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
                        ? String(localized: "feed.post.toast.pendingOffline", defaultValue: "Publication en attente d'envoi", bundle: .main)
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

}
