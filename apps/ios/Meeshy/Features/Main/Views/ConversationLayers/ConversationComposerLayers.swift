import SwiftUI
import PhotosUI
import Contacts
import MeeshySDK
import MeeshyUI

/// **Le composeur de la conversation, en vue NOMINALE** (LOT-10). Il possède le
/// vumètre (`ComposerAudioHost`) et le texte (`ComposerTextHost`) — leurs seuls
/// abonnés — et reçoit la barre en closure : l'hôte la construit
/// (`composerBar`), cette vue ne fait que la ranger sous ses animations, son
/// armement de contagion de citation et son repli.
///
/// Aucune valeur de vue n'est stockée ici : des primitives, une struct de clés
/// `Equatable` et des closures.
struct ConversationComposerCore: View {
    let recorder: AudioRecorderManager
    let composerText: ConversationComposerTextModel
    let isFocusedOrRequested: Bool
    let replyToId: String?
    let animationKeys: ComposerBarAnimationKeys
    let bar: (Binding<String>, Bool, TimeInterval, [CGFloat]) -> UniversalComposerBar
    let onReplyRoute: (String?) -> Void
    let onFold: () -> Void

    var body: some View {
        ComposerAudioHost(recorder: recorder) { isRecording, recordingDuration, audioLevels in
            ComposerTextHost(model: composerText) { textBinding in
                bar(textBinding, isRecording, recordingDuration, audioLevels)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: animationKeys)
            .adaptiveOnChange(of: replyToId, initial: true) { _, replyToId in
                onReplyRoute(replyToId)
            }
            .foldableConversationComposer(
                isComposing: ConversationComposerFold.isComposing(
                    isFocused: isFocusedOrRequested,
                    isRecording: isRecording),
                onFold: onFold)
        }
    }
}

/// Ce dont les transitions de la barre dépendent : un changement de protection,
/// d'effet ou de contagion de citation s'anime au même ressort.
struct ComposerBarAnimationKeys: Equatable {
    let ephemeralArmed: Bool
    let blurArmed: Bool
    let viewOnceArmed: Bool
    let hasAnyEffect: Bool
    let armedReplyContagion: ArmedReplyContagion?
}

/// Pickers, sheets légers et l'unique plein écran caméra du composeur.
///
/// `photoLibrary: .shared()` est requis pour la présélection : les
/// `PhotosPickerItem(itemIdentifier:)` injectés depuis la bande ne matchent les
/// assets du sélecteur que sur la photothèque partagée. **La caméra de la barre
/// prend EN PLEIN ÉCRAN, hors de toute scène** (directive porteur 2026-10-04) :
/// la prise rejoint le message en attente, la scène reste à un geste, par
/// « Éditer » sur la pièce posée (#9126).
struct ConversationComposerPickers: ViewModifier {
    @Binding var composerState: ConversationComposerState
    let accentColor: String
    let onFileImport: (Result<[URL], Error>) -> Void
    let onCapture: (CameraResult) -> Void
    let onLocation: (SharedPlace) -> Void
    let onContact: (CNContact) -> Void
    let onPhotos: ([PhotosPickerItem]) -> Void

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $composerState.showPhotoPicker, selection: $composerState.selectedPhotoItems, maxSelectionCount: ConversationComposerState.maxMediaSelection, matching: .any(of: [.images, .videos]), photoLibrary: .shared())
            .fileImporter(isPresented: $composerState.showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                onFileImport(result)
            }
            .conversationCover(isPresented: $composerState.showCamera) {
                ComposerViewfinder { result in
                    onCapture(result)
                }
            }
            .sheet(isPresented: $composerState.showLocationPicker) {
                LocationPickerView(accentColor: accentColor) { place in
                    onLocation(place)
                }
            }
            .sheet(isPresented: $composerState.showContactPicker) {
                ContactPickerView(
                    onSelect: { contact in
                        onContact(contact)
                        composerState.showContactPicker = false
                    },
                    onCancel: { composerState.showContactPicker = false }
                )
            }
            .adaptiveOnChange(of: composerState.selectedPhotoItems) { _, items in
                onPhotos(items)
            }
    }
}

/// La palette de stickers (#4823). La feuille se FERME au choix : dans une
/// conversation un sticker est un message à part entière, pas une décoration
/// qu'on empile sur une scène. **Elle est celle de tout le produit** (#9189) :
/// `MeeshyStickerSheet` porte les injecteurs et les détentes, une fois ; la
/// conversation ne dit que sa destination — ENVOYER — et que ses gabarits
/// partent contournés de blanc, comme Mee (#9060).
struct ConversationComposerStickerSheet: ViewModifier {
    @Binding var composerState: ConversationComposerState
    let accentColor: String
    let onChoice: (StickerSheetChoice) -> Void

    func body(content: Content) -> some View {
        content.sheet(isPresented: $composerState.showStickerPicker) {
            MeeshyStickerSheet(destination: StickerSheetDestination(diesCut: true, leadsToVitrine: true) { choice in
                composerState.showStickerPicker = false
                onChoice(choice)
            }, accentColor: accentColor)
        }
    }
}

/// Les plein écrans d'édition de pièces jointes en attente — le groupe le plus
/// dense en types de closures distincts (un par éditeur média).
struct ConversationComposerEditingCovers: ViewModifier {
    @Binding var composerState: ConversationComposerState
    @Binding var scrollState: ConversationScrollState
    let accentColor: String
    let onRetouched: ([ComposerRetouchedPiece]) -> Void
    let onSceneMedia: (ComposerReturnedMedia) -> Void
    let onRemovePiece: (String) -> Void

    func body(content: Content) -> some View {
        content
            .conversationCover(item: $scrollState.pieceToRetouch) { piece in
                ConversationPieceRetouch(piece: piece, onDone: { media in
                    scrollState.pieceToRetouch = nil
                    onRetouched([ComposerRetouchedPiece(attachmentId: piece.attachmentId, media: media)])
                }, onRemove: {
                    scrollState.pieceToRetouch = nil
                    onRemovePiece(piece.attachmentId)
                }, onCancel: { scrollState.pieceToRetouch = nil })
            }
            .conversationCover(item: $scrollState.retouchSeries) { serie in
                ConversationRetouchSeriesEditor(series: serie, onDone: { rendues in
                    onRetouched(rendues)
                }, onCancel: { scrollState.retouchSeries = nil })
            }
            .conversationCover(isPresented: Binding(
                get: { scrollState.recentImageToEdit != nil },
                set: { if !$0 { scrollState.recentImageToEdit = nil } }
            )) {
                if let image = scrollState.recentImageToEdit {
                    ConversationImageSceneEditor(image: image, staged: false, onDone: { media in
                        scrollState.recentImageToEdit = nil
                        onSceneMedia(media)
                    }, onCancel: {
                        scrollState.recentImageToEdit = nil
                    })
                }
            }
            .conversationCover(isPresented: Binding(
                get: { scrollState.recentVideoToEdit != nil },
                set: { if !$0 { scrollState.recentVideoToEdit = nil } }
            )) {
                if let url = scrollState.recentVideoToEdit {
                    ConversationVideoSceneEditor(url: url, staged: false, onDone: { media in
                        scrollState.recentVideoToEdit = nil
                        onSceneMedia(media)
                    }, onCancel: { scrollState.recentVideoToEdit = nil })
                }
            }
            .conversationCover(item: $scrollState.audioToEdit) { target in
                audioEditor(for: target)
            }
    }

    private func audioEditor(for target: PendingAudioEdit) -> some View {
        MeeshyAudioEditorView(url: target.url, accentColor: accentColor, onConfirm: { acceptedURL, _, trimStart, trimEnd in
            let durationMs = Int((trimEnd - trimStart) * 1000)
            let staleURL = composerState.applyEditedAudio(
                attachmentId: target.id, editedURL: acceptedURL, durationMs: durationMs
            )
            if let staleURL {
                try? FileManager.default.removeItem(at: staleURL)
            }
            scrollState.audioToEdit = nil
        }, onCancel: {
            scrollState.audioToEdit = nil
        })
    }
}

/// La cible d'une vignette citée dans le bandeau de réponse : un média sans
/// adresse n'ouvre rien.
enum ComposerQuotedMediaTarget {
    static func preview(thumbUrl: String?, type: String) -> PreviewMedia? {
        guard let thumbUrl, !thumbUrl.isEmpty,
              let url = MeeshyConfig.resolveMediaURL(thumbUrl) else { return nil }
        return PreviewMedia(url: url, type: type)
    }
}

/// La vignette citée est un BOUTON (A11Y-11) : un `onTapGesture` n'est ni
/// annoncé, ni activable par VoiceOver ou le clavier. Le libellé est celui de
/// la bulle (`bubble.reply.open_media`).
struct ComposerQuotedMediaButton<Face: View>: View {
    let target: PreviewMedia?
    let onOpen: (PreviewMedia) -> Void
    @ViewBuilder let label: () -> Face

    var body: some View {
        Button {
            guard let target else { return }
            onOpen(target)
        } label: {
            label()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main))
    }
}
