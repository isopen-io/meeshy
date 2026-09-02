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
    /// Focus réel du champ du composer — pilote l'insertion d'un texte déposé
    /// (au curseur quand le champ a le focus, sinon à la fin via `emojiToInject`).
    @State private var composerIsFocused: Bool = false
    @StateObject private var audioRecorder = AudioRecorderManager()

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

    var body: some View {
        UniversalComposerBar(
            style: .dark,
            mode: .comment,
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
            onSendMessage: { text, attachments, _ in submitStoryComment(text: text, attachments: attachments) },
            onLocationRequest: { showCommentLocationPicker = true },
            replyBanner: replyingToStoryComment.map { reply in
                AnyView(
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(hex: reply.authorColor))
                            .frame(width: 3, height: 30)

                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(MeeshyFont.relative(9, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                                Text(String(localized: "story.viewer.replyTo", defaultValue: "R\u{00E9}ponse \u{00E0} \(reply.author)", bundle: .main))
                                    .font(MeeshyFont.relative(11, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                            }
                            Text(reply.displayContent)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(.white.opacity(0.6))
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
                                .foregroundColor(.white.opacity(0.6))
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Color.white.opacity(0.12)))
                        }
                        .accessibilityLabel(String(localized: "story.viewer.reply.cancel", defaultValue: "Annuler la réponse", bundle: .main))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(hex: reply.authorColor).opacity(0.18))
                    .overlay(
                        Rectangle()
                            .fill(Color(hex: reply.authorColor).opacity(0.35))
                            .frame(height: 0.5),
                        alignment: .bottom
                    )
                )
            },
            customAttachmentsPreview: (commentAttachments.isEmpty && pendingPlace == nil)
                ? nil
                : AnyView(CommentAttachmentsTray(attachments: commentAttachments, onRemove: { id in
                    commentAttachments.removeAll { $0.id == id }
                  }, place: pendingPlace, onRemovePlace: { pendingPlace = nil })),
            onStartRecording: { audioRecorder.startRecording(); HapticFeedback.medium() },
            onStopRecordingToAttachment: { stopRecordingToAttachment() },
            onSendRecording: { if stopRecordingToAttachment() { submitStoryComment(text: "", attachments: commentAttachments) } },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || pendingPlace != nil,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            onShowAttachments: {
                // Attachment carousel opening → dismiss the emoji panel so the
                // two bottom surfaces never stack.
                if showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showTextEmojiPicker = false
                    }
                }
            },
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
            onRecordingChange: { recording in
                isComposerEngaged = recording
            },
            onHasContentChange: { hasContent in
                hasComposerContent = hasContent
            }
        )
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
                commentAttachments = CommentComposerStaging.fileAttachments(from: urls)
            }
        }
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                pendingPlace = place
                showCommentLocationPicker = false
            }
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            Task {
                commentAttachments = await CommentComposerStaging.photoAttachments(from: items)
                await MainActor.run { commentPhotoItems = [] }
            }
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
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                commentAttachments.append(contentsOf: staged)
            }
        }
    }

    /// Construit le média éventuel (un seul) + appelle le `sendComment` injecté avec
    /// le pendingMedia. Capture `parentId` AVANT de clear le reply context.
    /// Une réponse à une story part comme un message : elle porte donc le lieu
    /// choisi exactement comme n'importe quel autre message (une story est un
    /// post de type STORY côté gateway — même route `/posts/:id/comments`).
    private func submitStoryComment(text: String, attachments: [ComposerAttachment]) {
        let media = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()
        let place = pendingPlace
        pendingPlace = nil
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || media != nil || place != nil else { return }
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

    @discardableResult
    private func stopRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let duration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else { return false }
        commentAttachments.append(CommentComposerStaging.voiceAttachment(duration: duration, url: url))
        return true
    }
}

