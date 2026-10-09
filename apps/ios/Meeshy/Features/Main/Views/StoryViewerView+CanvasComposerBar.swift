import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView canvas — la barre de saisie (composer)
//
// `StoryComposerBarView` quitte `StoryViewerView+Canvas.swift` par
// RESPONSABILITÉ, pas par tranche : c'est l'unique composer du lecteur de
// story — le câblage d'`UniversalComposerBar`, le staging des pièces jointes,
// la capture vocale et la soumission du commentaire —, et il se relit sans
// rien savoir de la carte ni du geste. Le cliquet de taille
// (`FileSizeBudgetGuardTests`) l'a exigé : le fichier d'origine est en dette
// héritée et avait grossi en amont ; la directive 2026-08-28 interdit d'y
// ajouter — on extrait d'abord, on ajoute ensuite. Relocalisation pure :
// aucun comportement ne change.

// MARK: - Story Composer Bar

/// **UNIQUE composer** du story viewer (réutilisé en mode story-reply ET
/// en mode comment-reply). Extrait de `StoryViewerView.storyComposerBar`
/// pour que le wiring `UniversalComposerBar` soit son propre type-metadata
/// unit.
///
/// Spec user 2026-05-28 : « Il faut avoir qu'une seule zone de saisie de
/// commentaire ». L'overlay commentaires affiche uniquement la LISTE +
/// actions reply/like ; le composer reste celui-ci, toujours présent en bas
/// de l'écran. Quand l'utilisateur tape « Répondre » sur un commentaire,
/// `replyingToStoryComment` est set → une banner « Réponse à X » apparaît
/// au-dessus de la rangée de saisie de CE composer (pas dans un second
/// composer).
struct StoryComposerBarView: View {
    let accentColor: String
    let storyId: String?

    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var hasComposerContent: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]
    @Binding var replyingToStoryComment: FeedComment?

    /// Le repli ⌄ que le lecteur confie à la barre, posé DANS la plaque (#8642).
    var foldControl: ComposerFoldControl? = nil

    /// `parentId` non-nil quand l'utilisateur répond à un commentaire (via
    /// `replyingToStoryComment` set par l'overlay). Sinon nil → commentaire
    /// top-level sur la story. `pendingMedia` non-nil = commentaire avec UN média.
    /// `place` non-nil = un lieu a été choisi via le picker et voyage jusqu'à
    /// l'envoi, exactement comme n'importe quel autre message/commentaire.
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?, _ pendingMedia: PendingCommentMedia?, _ place: SharedPlace?) -> Void

    // Comment attachments + real voice capture (parity with feed/reels composer).
    @State private var commentAttachments: [ComposerAttachment] = []
    @State private var showCommentPhotoPicker: Bool = false
    @State private var commentPhotoItems: [PhotosPickerItem] = []
    @State private var showCommentFilePicker: Bool = false
    @State private var showCommentLocationPicker: Bool = false
    @State private var pendingPlace: SharedPlace? = nil
    /// Ce que la barre dit de SON contenu (texte, enregistrement).
    @State private var barHasContent: Bool = false
    /// Le panneau « + » de la barre est ouvert (#9821).
    @State private var attachmentPanelOpen: Bool = false
    /// Focus réel du champ du composer — pilote l'insertion d'un texte déposé
    /// (au curseur quand le champ a le focus, sinon à la fin via `emojiToInject`).
    @State private var composerIsFocused: Bool = false
    @StateObject private var audioRecorder = AudioRecorderManager()

    /// **La mention `@` d'un commentaire de story** (#7847) : contacts depuis
    /// le cache, puis `/mentions/suggestions` sur la story (un post) dès la
    /// deuxième lettre. Le texte est tenu ici pour que le choix puisse
    /// remplacer le `@fragment` en cours dans la barre.
    @StateObject private var mentionController = MentionComposerController(context: .composerDraft)
    @State private var commentText = ""

    private var mentionContext: MentionComposerController.Context {
        storyId.map { .post(id: $0) } ?? .composerDraft
    }

    /// Accent RÉSOLU du composer : celui du commentaire auquel on répond,
    /// sinon celui de la story.
    private var composerAccent: String {
        replyingToStoryComment?.authorColor ?? accentColor
    }

    /// Second arrêt du dégradé servi au composer. Dérivé de `composerAccent`
    /// par la formule de palette du SDK (`secondary = shiftHue(primary, +30°)`) :
    /// sans lui, le composer retombe sur son défaut de marque et le bouton
    /// d'envoi rend un dégradé hybride accent → indigo.
    private var composerSecondaryColor: String {
        DynamicColorGenerator.hueShiftedHex(composerAccent, degrees: 30)
    }

    /// La story attend tant qu'une pièce se compose (#9821) : le lecteur ne
    /// lit qu'UN drapeau, `hasComposerContent`, et c'est ici qu'il se compose.
    private var holdsStory: Bool {
        StoryComposerHold.holds(
            barHasContent: barHasContent,
            zoneHasPieces: !commentAttachments.isEmpty || pendingPlace != nil,
            attachmentPanelOpen: attachmentPanelOpen,
            pickerPresented: showCommentPhotoPicker || showCommentFilePicker || showCommentLocationPicker
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            MentionSuggestionOverlay(controller: mentionController, accentColor: composerAccent) { candidate in
                commentText = mentionController.insertMention(candidate, into: commentText)
            }
            composerBar
        }
    }

    private var composerBar: some View {
        UniversalComposerBar(
            style: .dark,
            mode: .comment,
            foldControl: foldControl,
            onIngest: { ingests in handleComposerIngest(ingests) },
            accentColor: composerAccent,
            secondaryColor: composerSecondaryColor,
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onFocusChange: { focused in
                composerIsFocused = focused
                if focused {
                    isComposerEngaged = true
                    // Keyboard opening → dismiss emoji panel
                    if showTextEmojiPicker {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showTextEmojiPicker = false
                        }
                    }
                } else {
                    // Only disengage if emoji panel isn't showing
                    if !showTextEmojiPicker {
                        isComposerEngaged = false
                    }
                }
            },
            // La ZONE de la story fait foi, jamais la copie interne de la barre,
            // qui reste vide : la photo partait sans elle (#9743).
            onSendMessage: { text, _, _ in submitStoryComment(text: text) },
            onLocationRequest: { showCommentLocationPicker = true },
            textBinding: $commentText,
            replyBanner: replyingToStoryComment.map { reply in
                AnyView(
                    HStack(spacing: MeeshySpacing.sm) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(hex: reply.authorColor))
                            .frame(width: 3, height: 30)

                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: MeeshySpacing.xs) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                                Text(String(localized: "story.viewer.replyTo", defaultValue: "R\u{00E9}ponse \u{00E0} \(reply.author)", bundle: .main))
                                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                            }
                            Text(reply.displayContent)
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                                .foregroundColor(MeeshyColors.mediaChromeTertiary)
                                .lineLimit(1)
                        }

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                replyingToStoryComment = nil
                            }
                        } label: {
                            Image(systemName: "xmark")
                                // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 22×22 → figé.
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(MeeshyColors.mediaChromeTertiary)
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Color.white.opacity(MeeshyOpacity.light)))
                        }
                        .accessibilityLabel(String(localized: "story.viewer.reply.cancel", defaultValue: "Annuler la réponse", bundle: .main))
                    }
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(Color(hex: reply.authorColor).opacity(0.18))
                    .overlay(
                        Rectangle()
                            .fill(Color(hex: reply.authorColor).opacity(0.35))
                            .frame(height: MeeshyBorder.hairline),
                        alignment: .bottom
                    )
                )
            },
            customAttachmentsPreview: (commentAttachments.isEmpty && pendingPlace == nil)
                ? nil
                : AnyView(CommentAttachmentsTray(attachments: commentAttachments, onRemove: { id in
                    commentAttachments.removeAll { $0.id == id }
                  }, place: pendingPlace, onRemovePlace: { pendingPlace = nil }, accentColor: accentColor)),
            onTextChange: { text in
                mentionController.retarget(mentionContext)
                mentionController.handleQuery(in: text)
            },
            onStartRecording: { audioRecorder.startRecording(); HapticFeedback.medium() },
            onStopRecordingToAttachment: { stopRecordingToAttachment() },
            onSendRecording: { if stopRecordingToAttachment() { submitStoryComment(text: "") } },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || pendingPlace != nil,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            onShowAttachments: {
                attachmentPanelOpen = true
                // Attachment carousel opening → dismiss the emoji panel so the
                // two bottom surfaces never stack.
                if showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showTextEmojiPicker = false
                    }
                }
            },
            onAttachmentsVisibilityChange: { open in attachmentPanelOpen = open },
            onRequestTextEmoji: {
                isComposerEngaged = true
                // Dismiss keyboard first, then show emoji panel
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder),
                    to: nil, from: nil, for: nil
                )
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showTextEmojiPicker = true
                    }
                }
            },
            injectedEmoji: $emojiToInject,
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            externalAttachments: commentAttachments,
            storyId: storyId,
            onSaveDraft: { storyId, text, attachments in
                if text.isEmpty && attachments.isEmpty {
                    storyDrafts.removeValue(forKey: storyId)
                } else {
                    storyDrafts[storyId] = StoryDraft(text: text, attachments: attachments)
                }
            },
            getDraft: { storyId in
                guard let draft = storyDrafts[storyId] else { return nil }
                return (text: draft.text, attachments: draft.attachments)
            },
            onAnyInteraction: {
                // No-op: shouldPauseTimer handles all pause logic based on UI state
            },
            focusTrigger: $composerFocusTrigger,
            // #6587 — `onRecordingChange` RETIRÉ : déclaré, affecté, jamais
            // invoqué par la barre. Le câbler écraserait `isComposerEngaged`
            // à false en fin d'enregistrement et relâcherait une pause posée
            // par le focus ; la pause passe déjà par `onHasContentChange`.
            onHasContentChange: { hasContent in
                barHasContent = hasContent
            }
        )
        .adaptiveOnChange(of: holdsStory) { _, holds in hasComposerContent = holds }
        .photosPicker(
            isPresented: $showCommentPhotoPicker,
            selection: $commentPhotoItems,
            maxSelectionCount: 1,
            matching: .any(of: [.images, .videos])
        )
        .fileImporter(
            isPresented: $showCommentFilePicker,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result {
                CommentAttachmentIntake.admit(CommentComposerStaging.fileAttachments(from: urls), into: &commentAttachments, limit: Self.mediaLimit)
            }
        }
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                pendingPlace = place
                showCommentLocationPicker = false
            }
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            guard !items.isEmpty else { return }
            commentPhotoItems = []
            CommentAttachmentIntake.stage(items, into: $commentAttachments, limit: Self.mediaLimit)
        }
        // « Éditer » une pièce jointe : la scène du composeur (#9127). Le
        // minuteur reste en pause — la pièce en attente compte comme contenu.
        .commentSceneRetouch(attachments: $commentAttachments)
        // La caméra (#9736) : le viseur RECOUVRE le lecteur, qui ne le sait
        // pas — le composeur s'engage d'abord, ce qui tient le minuteur.
        .commentCamera(attachments: $commentAttachments, limit: Self.mediaLimit,
                       onOpen: { isComposerEngaged = true })
        // #9743, M1 — un commentaire refusé par la file revient avec sa pièce.
        .adaptiveOnChange(of: storyDrafts[storyId ?? ""]?.refusedAt) { _, refused in
            guard refused != nil, let id = storyId, let draft = storyDrafts[id], commentAttachments.isEmpty else { return }
            commentAttachments = draft.attachments
        }
    }

    /// Dépôt / collage arrivé par la bande du composer (`onIngest`). Un dépôt
    /// est une interaction utilisateur : il engage le composer
    /// (`isComposerEngaged`), ce qui met le minuteur de story en pause via
    /// `shouldPauseTimer` — exactement comme la saisie le fait déjà par le
    /// focus ; le tap sur la story (`dismissComposer`) le relâche. Textes
    /// fusionnés en UNE insertion (au curseur si focus ; sinon en fin de champ
    /// via le canal `injectedEmoji` — cette surface n'a pas de binding texte),
    /// fichiers routés vers le staging commentaire existant (spec 2026-07-30).
    private func handleComposerIngest(_ ingests: [ComposerIngest]) {
        isComposerEngaged = true
        if let block = CommentComposerIngestion.mergedText(from: ingests) {
            if !(composerIsFocused && CommentComposerIngestion.insertAtCursor(block)) {
                emojiToInject = block
            }
        }
        CommentComposerIngestion.stageFiles(
            CommentComposerIngestion.files(from: ingests),
            accentColor: accentColor
        ) { staged in
            CommentAttachmentIntake.admit(staged, into: &commentAttachments, limit: Self.mediaLimit)
        }
    }

    /// **Une réponse à une story porte UN média** (#9736) : son envoi n'en
    /// transmet qu'un. La zone le dit — la dernière pièce choisie remplace la
    /// précédente, au lieu d'en montrer deux pour n'en envoyer qu'une.
    static let mediaLimit = 1

    /// Construit le média éventuel (un seul) + appelle le `sendComment` injecté avec
    /// le pendingMedia. Capture `parentId` AVANT de clear le reply context.
    /// Une réponse à une story part comme un message : elle porte donc le lieu
    /// choisi exactement comme n'importe quel autre message (une story est un
    /// post de type STORY côté gateway — même route `/posts/:id/comments`).
    ///
    /// **La zone fait foi, et la décision précède le vidage** (#9743) — le
    /// modèle de la feuille du fil : une pièce qui se prépare garde tout.
    private func submitStoryComment(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let staged = commentAttachments
        switch CommentSendGate.decide(text: trimmed, zone: staged, hasPlace: pendingPlace != nil) {
        case .keepWhilePreparing(let loading):
            CommentSendTrace.log("story : \(loading) pièce(s) en préparation — rien ne part, composeur intact")
            HapticFeedback.warning()
            keepRefusedText(trimmed)
            return
        case .nothing:
            return
        case .send:
            break
        }
        let media = CommentComposerStaging.firstPendingMedia(in: staged)
        commentAttachments = []
        CommentSendTrace.log("story : envoi, texte=\(!trimmed.isEmpty), pièce=\(media != nil)/\(staged.count)")
        let place = pendingPlace
        pendingPlace = nil
        let effects = commentEffects
        let blur = commentBlurEnabled
        commentEffects = .none
        commentBlurEnabled = false
        let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
        let effectFlags = flags > 0 ? Int(flags) : nil
        // Réponse plate à 2 niveaux : répondre à une réponse rattache au MÊME parent
        // racine (sinon la réponse-de-réponse atterrissait dans un bucket jamais rendu
        // → commentaire invisible). L'auteur ciblé est notifié via la @mention injectée
        // à l'ouverture de la réponse (cf. makeStoryCommentRow).
        let parentId = replyingToStoryComment?.parentId ?? replyingToStoryComment?.id
        replyingToStoryComment = nil
        sendComment(trimmed, effectFlags, parentId, media, place)
    }

    /// La barre a vidé son champ : le texte d'un envoi refusé y revient.
    private func keepRefusedText(_ text: String) {
        guard !text.isEmpty else { return }
        commentText = ""
        DispatchQueue.main.async { commentText = CommentUnsent.resuming(text, into: commentText) }
    }

    @discardableResult
    private func stopRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let duration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else { return false }
        return !CommentAttachmentIntake.admit(
            [CommentComposerStaging.voiceAttachment(duration: duration, url: url)],
            into: &commentAttachments, limit: Self.mediaLimit
        ).isEmpty
    }
}

// MARK: - La story se tient pendant qu'une pièce se compose

/// **Joindre une pièce ne laisse pas la story filer** (#9821). Panneau « + »
/// ouvert, sélecteur présenté ou pièce posée dans la zone : la lecture
/// attend. Sans cela, la progression avançait sous le sélecteur de photos,
/// la story se fermait, et la photo choisie était perdue.
enum StoryComposerHold {
    static func holds(barHasContent: Bool, zoneHasPieces: Bool,
                      attachmentPanelOpen: Bool, pickerPresented: Bool) -> Bool {
        barHasContent || zoneHasPieces || attachmentPanelOpen || pickerPresented
    }
}
