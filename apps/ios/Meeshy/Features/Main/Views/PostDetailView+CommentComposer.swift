import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

// Les membres du composer ont perdu leur `private` dans `PostDetailView.swift`
// au moment de l'extraction : une extension dans un AUTRE fichier ne voit pas
// les membres privés de son type. C'est un RETRAIT, pas un ajout — le fichier
// hôte, hors budget, n'a pas gagné une ligne.

/// **LE COMPOSER DE COMMENTAIRE du détail d'un post** — extrait de
/// `PostDetailView.swift` (#6578).
///
/// Il y vivait dans un fichier de 2 329 lignes, très au-delà du plafond dur de
/// 1 200 : le lot qui devait lui apprendre à CITER un média ne pouvait pas y
/// écrire une ligne de plus sans extraire d'abord. Le découpage suit la
/// responsabilité, pas la tranche — tout ce qui compose, stage et envoie un
/// commentaire est ici, et rien d'autre.
///
/// Le corps est repris MOT POUR MOT de l'hôte ; les additions du lot portent
/// leur raison sur place.

extension PostDetailView {

    var composer: some View {
        UniversalComposerBar(
            style: .light,
            mode: .comment,
            onIngest: { ingests in handleComposerIngest(ingests) },
            accentColor: accentColor,
            secondaryColor: composerSecondaryColor,
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onFocusChange: { composerIsFocused = $0 },
            onSendMessage: { text, attachments, _ in submitComment(text: text, attachments: attachments) },
            onLocationRequest: { showCommentLocationPicker = true },
            textBinding: $composerText,
            replyBanner: replyBannerView,
            // **CE DONT ON PARLE, puis CE QU'ON JOINT** (#6578). Deux bandes
            // distinctes dans la même zone : la citation désigne un média du
            // POST, les pièces stagées sont les nôtres. Les confondre ferait
            // croire qu'on peut retirer l'une en retirant l'autre.
            //
            // `CommentQuotationChip` lit le magasin LUI-MÊME et se rend vide
            // quand il n'y a rien à citer — d'où le `AnyView` inconditionnel :
            // le test « y a-t-il quelque chose à montrer ? » ne peut pas
            // s'écrire ici sans dupliquer la lecture, et un hôte hors budget ne
            // peut pas porter l'état qui le permettrait.
            customAttachmentsPreview: AnyView(
                VStack(spacing: 0) {
                    CommentQuotationChip(postId: postId, accentColor: accentColor)
                    if !commentAttachments.isEmpty || pendingPlace != nil {
                        CommentAttachmentsTray(attachments: commentAttachments, onRemove: { id in
                            commentAttachments.removeAll { $0.id == id }
                        }, place: pendingPlace, onRemovePlace: { pendingPlace = nil })
                    }
                }
            ),
            onTextChange: { text in
                mentionController.handleQuery(in: text, participants: MentionParticipants.of(post: displayPost, comments: viewModel.comments))
                CommentDraftStore.shared.save(postId: postId, text: text)
            },
            onStartRecording: { startCommentRecording() },
            onStopRecordingToAttachment: { stopCommentRecordingToAttachment() },
            onSendRecording: { stopAndSendCommentRecording() },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            // La citation COMPTE comme du contenu : désigner une photo puis
            // n'écrire que « 😍 » est le cas nominal, et un bouton d'envoi
            // éteint sur une citation posée serait un contrôle qui ment.
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || pendingPlace != nil
                || CommentQuotationStore.shared.quotation(for: postId) != nil,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            externalAttachments: commentAttachments,
            focusTrigger: $composerFocusTrigger
        )
        // **Le plafond du choix est celui de l'envoi** (#6578). Il valait 1 —
        // un contrôle qui ment, puisque le bandeau affiche un TABLEAU — et vaut
        // désormais `MAX_POST_MEDIA`, la MÊME constante que le schéma du
        // serveur : deux plafonds seraient deux vérités, et la seconde
        // dériverait au premier ajustement.
        .photosPicker(
            isPresented: $showCommentPhotoPicker,
            selection: $commentPhotoItems,
            maxSelectionCount: MAX_POST_MEDIA,
            matching: .any(of: [.images, .videos])
        )
        .fileImporter(
            isPresented: $showCommentFilePicker,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result {
                commentAttachments = CommentComposerStaging.fileAttachments(from: urls)
            }
        }
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                pendingPlace = place
                showCommentLocationPicker = false
            }
        }
        // **Désigner depuis le plein écran doit AMENER au clavier.** La
        // galerie se referme sur le fil ; sans ce relais l'utilisateur voit une
        // puce apparaître sous un champ qu'il doit aller toucher lui-même, et
        // le geste « commenter cette photo » s'arrête à mi-chemin.
        .adaptiveOnChange(of: CommentQuotationStore.shared.quotation(for: postId)?.postMediaId) { avant, apres in
            guard apres != nil, avant != apres else { return }
            composerFocusTrigger = true
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            Task {
                commentAttachments = await CommentComposerStaging.photoAttachments(from: items)
                await MainActor.run { commentPhotoItems = [] }
            }
        }
    }

    // MARK: - Reply targeting

    /// Amorce une réponse. Répondre à une réponse (niveau 2) reste plat au niveau
    /// 2 (cf. `sendReply` : parentId = racine) ; on préremplit une @mention vers
    /// l'auteur ciblé pour qu'il soit notifié (`user_mentioned`) malgré le
    /// reparentage à la racine.
    func beginReply(to target: FeedComment) {
        viewModel.replyingTo = target
        composerFocusTrigger = true
        // Retire la @mention auto-injectée d'une cible précédente avant d'en poser
        // une nouvelle (évite accumulation / mauvais auteur notifié).
        if let old = prefilledMention, composerText.hasPrefix(old) {
            composerText = String(composerText.dropFirst(old.count))
        }
        prefilledMention = nil
        guard target.parentId != nil,
              let username = target.authorUsername, !username.isEmpty else { return }
        let mention = "@\(username) "
        if !composerText.hasPrefix(mention) {
            composerText = mention + composerText
        }
        prefilledMention = mention
    }

    // MARK: - Comment send + voice (parity with feed/reels composer)

    /// Dépôt / collage arrivé par la bande du composer (`onIngest`) : textes
    /// fusionnés en UNE insertion (au curseur si le champ a le focus, sinon à
    /// la fin), fichiers routés vers le staging commentaire existant
    /// (spec 2026-07-30, lot 1).
    private func handleComposerIngest(_ ingests: [ComposerIngest]) {
        if let block = CommentComposerIngestion.mergedText(from: ingests) {
            if !(composerIsFocused && CommentComposerIngestion.insertAtCursor(block)) {
                composerText += block
            }
        }
        CommentComposerIngestion.stageFiles(
            CommentComposerIngestion.files(from: ingests),
            accentColor: accentColor
        ) { staged in
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                commentAttachments.append(contentsOf: staged)
            }
        }
    }

    private func submitComment(text: String, attachments: [ComposerAttachment]) {
        if let editing = viewModel.editingComment {
            submitCommentEdit(editing, text: text)
            return
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let media = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()
        let place = pendingPlace
        pendingPlace = nil
        // **La citation se LIT puis s'EFFACE, dans le même geste** (#6578) :
        // la garder ferait citer le même média au commentaire suivant, comme
        // un réglage collant, alors qu'elle décrit UNE phrase.
        let citation = CommentQuotationStore.shared.quotation(for: postId)
        CommentQuotationStore.shared.clear(for: postId)
        guard !trimmed.isEmpty || media != nil || place != nil || citation != nil else { return }
        let flags = commentEffects.flags.rawValue | (commentBlurEnabled ? MessageEffectFlags.blurred.rawValue : 0)
        commentEffects = .none
        commentBlurEnabled = false
        // Réponse plate à 2 niveaux (cf. sendReply) : reparente à la racine.
        let parentId = viewModel.replyingTo?.parentId ?? viewModel.replyingTo?.id
        let effectFlags = flags > 0 ? Int(flags) : nil
        // #6587 — la pastille DÉCLARE la langue ; sans ce relais, le serveur la devine.
        let lang = composerLanguage
        Task {
            if let media {
                await viewModel.submitCommentWithMedia(trimmed, originalLanguage: lang, effectFlags: effectFlags, parentId: parentId, pendingMedia: media, location: place, quoted: citation)
            } else if parentId != nil {
                await viewModel.sendReply(trimmed, originalLanguage: lang, effectFlags: effectFlags, location: place, quoted: citation)
            } else {
                await viewModel.sendComment(trimmed, originalLanguage: lang, effectFlags: effectFlags, location: place, quoted: citation)
            }
        }
    }

    private func startCommentRecording() {
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

    @discardableResult
    private func stopCommentRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let duration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else { return false }
        commentAttachments.append(CommentComposerStaging.voiceAttachment(duration: duration, url: url))
        return true
    }

    private func stopAndSendCommentRecording() {
        guard stopCommentRecordingToAttachment() else { return }
        submitComment(text: "", attachments: commentAttachments)
    }
}
