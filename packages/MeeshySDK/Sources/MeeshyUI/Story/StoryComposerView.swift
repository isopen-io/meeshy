import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - Story Composer View

public struct StoryComposerView: View {

    // MARK: - Single source of truth

    @StateObject var viewModel = StoryComposerViewModel()

    // MARK: - System environment

    @Environment(\.colorScheme) var colorScheme
    @Environment(\.scenePhase) var scenePhase

    // MARK: - Canvas-local state

    @State var selectedFilter: StoryFilter?
    @State var selectedImage: UIImage?

    // MARK: - Background audio (legacy panel state)

    @State var selectedAudioId: String?
    @State var selectedAudioTitle: String?
    @State var audioVolume: Float = 0.7
    @State var audioTrimStart: TimeInterval = 0
    @State var audioTrimEnd: TimeInterval = 0

    // MARK: - Photo / media pickers

    @State var fgMediaItem: PhotosPickerItem?

    // MARK: - Empty-state picker selection animation
    //
    // Briefly latched when the user taps a tile in `emptyStateLargePicker`,
    // before the selection propagates to `viewModel.selectTool(_:)`. Drives
    // the highlight + fade-others animation in `largeToolTile`.
    @State var pickerSelectedTool: StoryToolMode?

    // MARK: - Media editor (triggered by edit button on canvas elements)

    @State var editingBgImage: UIImage?
    @State var editingElementImage: EditingMediaImage?
    @State var editingElementVideo: EditingMediaVideo?

    // MARK: - Audio pickers

    @State var showAudioDocumentPicker = false
    @State var showVoiceRecorderSheet = false
    /// C8 — picker de stickers (bouton « Stickers » du panneau Texte).
    @State var showStickerPicker = false
    // Prisme Linguistique: the story's source language comes from the user's
    // in-app content preferences (systemLanguage → regionalLanguage → "fr"),
    // NEVER from the keyboard locale. See `StoryComposerViewModel
    // .resolveComposerSourceLanguage(user:)` for the canonical resolver.
    @State var storyLanguage: String = StoryComposerViewModel
        .resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
    @State var showTransitionSheet = false
    @State var audioEditorItem: AudioEditorItemWrapper?
    @State var mediaAudioEditorItem: AudioEditorItemWrapper?
    @State var confirmedMediaAudioURL: URL?

    // MARK: - Manipulation layer (verrouillage en cascade)

    /// Couche active courante du canvas, miroir SwiftUI de
    /// `StoryCanvasUIView.currentManipulationLayer`. Mise à jour via le
    /// callback `onManipulationLayerChanged` du `StoryComposerCanvasView`.
    @State var manipulationLayer: CanvasManipulationLayer = .canvas

    // MARK: - Publication

    @State var publishTask: Task<Void, Never>?

    // MARK: - Canvas viewport (pinch-to-zoom + drag-to-pan when zoomed)

    /// Échelle éphémère du viewport pendant un pinch 3-doigts. Driven
    /// par le callback `onCanvasZoomScaleChanged` du canvas UIKit ; remis à
    /// 1.0 à `.ended`/`.cancelled`. Anciennement `@GestureState` lié au
    /// `MagnificationGesture` SwiftUI 2-doigts qui entrait en conflit avec
    /// le pinch d'élément.
    @State var viewportPinchDelta: CGFloat = 1.0
    @GestureState var viewportDragDelta: CGSize = .zero
    /// Pan éphémère du viewport pendant le pinch 2 doigts du MODE DESSIN
    /// (déplacement du centroïde, points écran). Committé dans
    /// `canvasOffset` à `.ended`, remis à zéro sinon.
    @State var drawingViewportPanDelta: CGSize = .zero

    // MARK: - UI state

    @State var areFabsVisible: Bool = true
    @State var bandStateMachine: BandStateMachine = BandStateMachine()

    /// Hauteur (redimensionnable) du panneau DESSIN du band partagé, pilotée par le
    /// drag du grabber (`ComposerBottomBand`). Tirer vers le haut agrandit le panneau
    /// (liste des traits) ; vers le bas le réduit. En mode dessin (Option A) le canvas
    /// reste PLEIN — ce drawer flotte par-dessus, il ne rétrécit plus le canvas.
    @State var composerBandHeight: CGFloat = 280

    @State var showDiscardAlert = false
    @State var showRestoreDraftAlert = false
    /// U4 inc.2 — données de la carte de reprise (cover rendu async depuis
    /// les médias du draft, SANS muter le ViewModel avant le choix user).
    @State var draftResumeCover: UIImage?
    @State var draftResumeSlideCount: Int = 1
    /// E1 — clés média du dernier `saveMedia` d'autosave : gate la re-copie
    /// des bitmaps aux vrais changements de médias.
    @State var lastAutosavedMediaKeys: Set<String>?
    /// E1 — levé quand le brouillon vient d'être explicitement jeté (quit)
    /// ou publié : un debounce d'autosave encore en vol ne doit pas le
    /// re-persister pendant le démontage du composer.
    @State var draftAutosaveSuspended = false
    /// C16 (audit it.91) — l'échec de chargement d'un média DOIT parler :
    /// avant, les guards/catch du flux picker retournaient en silence (photo
    /// iCloud non téléchargeable, format refusé, écriture temp échouée) — le
    /// spinner disparaissait et l'utilisateur ne savait jamais pourquoi rien
    /// ne s'était ajouté.
    @State var mediaLoadFailed = false
    @State var isLoadingMedia = false
    @State var mediaLoadProgress: Double = 0
    @State var mediaLoadLabel: String = ""
    // Défaut « Contacts » (PostVisibility.friends) : une story est d'abord
    // partagée avec ses contacts, pas publiquement. L'audience publique reste
    // un choix explicite via le sélecteur globe. Aligné sur le défaut du VM app
    // (`StoryViewModel.publishStory(visibility: "FRIENDS")`).
    @State var visibility: String = "FRIENDS"
    @State var visibilityUserIds: [String] = []
    @State var audiencePickerMode: PostVisibility?
    @State var lostMediaCount: Int = 0  // > 0 triggers an alert after restoreDraft

    // MARK: - Keyboard observation + canvas shift

    @State var keyboardHeight: CGFloat = 0
    @State var canvasEditShift: CGFloat = 0
    /// Frame naturelle (non décalée) du canvas, mesurée hors `.offset`.
    @State var canvasNaturalFrame: CGRect = .zero

    @Environment(\.theme) var theme

    // MARK: - Callbacks (public API preserved)

    public var onPublishSlide: (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void
    public var onPublishAllInBackground: (
        _ slides: [StorySlide],
        _ slideImages: [String: UIImage],
        _ loadedImages: [String: UIImage],
        _ loadedVideoURLs: [String: URL],
        _ loadedAudioURLs: [String: URL],
        _ originalLanguage: String?,
        _ visibility: String,
        _ visibilityUserIds: [String]
    ) -> Void
    public var onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    public var onDismiss: () -> Void

    public init(
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String]) -> Void,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
    }

    /// Repost-aware initializer (C.1). Lets a caller hand the composer a
    /// pre-built `StoryComposerViewModel` — typically one constructed via
    /// `StoryComposerViewModel(reposting:authorHandle:)` so the canvas opens
    /// already populated with the source slide + locked attribution badge.
    ///
    /// `onPreview` is left as a no-op default here because the repost flow does
    /// not branch through the preview cycle (the slide is already known).
    public init(
        viewModel: StoryComposerViewModel,
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String]) -> Void,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void = { _, _, _, _, _ in },
        onDismiss: @escaping () -> Void
    ) {
        self._viewModel = StateObject(wrappedValue: viewModel)
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
    }

    // MARK: - Body

    public var body: some View {
        sheetModifiers
        // U4 inc.2 — la reprise de brouillon montre CE QU'ON reprend (carte
        // cover composite) au lieu de l'ancienne alerte texte nue. Dismissal
        // explicite uniquement (pas de tap-outside : le brouillon est précieux).
        .overlay {
            if showRestoreDraftAlert {
                ZStack {
                    Color.black.opacity(0.55).ignoresSafeArea()
                    DraftResumeCard(
                        cover: draftResumeCover,
                        slideCount: draftResumeSlideCount,
                        updatedAt: nil,
                        onResume: {
                            showRestoreDraftAlert = false
                            restoreDraft()
                        },
                        onDiscard: {
                            showRestoreDraftAlert = false
                            clearAllDrafts()
                        }
                    )
                    .padding(28)
                }
                .transition(.opacity)
                .zIndex(40)
            }
        }
        .alert(
            String(localized: "story.composer.quitWithoutPublishing", defaultValue: "Quitter sans publier ?", bundle: .module),
            isPresented: $showDiscardAlert
        ) {
            // `.tint` explicite : le composer hérite de `.preferredColorScheme(.dark)`
            // (StoryViewerView) qui traverse la présentation ; sur iOS 26 l'alerte est
            // dessinée sur verre clair → sans teinte, le label des boutons sans rôle /
            // .cancel devient quasi-blanc et illisible. L'indigo reste lisible partout.
            Button(String(localized: "story.composer.save", defaultValue: "Sauvegarder", bundle: .module)) { saveDraftAndDismiss() }
                .tint(MeeshyColors.indigo500)
            Button(String(localized: "story.composer.quit", defaultValue: "Quitter", bundle: .module), role: .destructive) { cancelAndDismiss() }
            Button(String(localized: "story.composer.cancelAction", defaultValue: "Annuler", bundle: .module), role: .cancel) { }
                .tint(MeeshyColors.indigo500)
        }
        .alert(
            String(localized: "story.composer.mediaLostTitle", defaultValue: "Médias indisponibles", bundle: .module),
            isPresented: Binding(
                get: { lostMediaCount > 0 },
                set: { if !$0 { lostMediaCount = 0 } }
            )
        ) {
            Button(String(localized: "story.composer.ok", defaultValue: "OK", bundle: .module)) { lostMediaCount = 0 }
                .tint(MeeshyColors.indigo500)
        } message: {
            Text(
                lostMediaCount == 1
                ? String(
                    localized: "story.composer.mediaLostSingle",
                    defaultValue: "Un média de votre brouillon n'est plus disponible (fichier supprimé). Le slide a été restauré sans ce média — retake si nécessaire.",
                    bundle: .module
                  )
                : String(
                    localized: "story.composer.mediaLostMultiple",
                    defaultValue: "\(lostMediaCount) médias de votre brouillon ne sont plus disponibles (fichiers supprimés). Les slides ont été restaurés sans ces médias.",
                    bundle: .module
                  )
            )
        }
        .alert(
            String(localized: "story.composer.mediaLoadFailedTitle",
                   defaultValue: "Chargement impossible", bundle: .module),
            isPresented: $mediaLoadFailed
        ) {
            Button(String(localized: "story.composer.ok", defaultValue: "OK", bundle: .module)) {
                mediaLoadFailed = false
            }
            .tint(MeeshyColors.indigo500)
        } message: {
            Text(String(
                localized: "story.composer.mediaLoadFailedMessage",
                defaultValue: "Ce média n'a pas pu être chargé. Vérifiez qu'il est téléchargé sur l'appareil (iCloud) et réessayez.",
                bundle: .module
            ))
        }
        .onAppear {
            checkForDraft()
            // C9 — trajectoire d'annulation : seed sur l'état d'entrée
            // (composer vierge ; `restoreDraft()` re-seed après reprise).
            viewModel.seedHistory()
        }
        // D1 — le travail d'édition survit au kill de l'app : auto-save du
        // draft au passage en BACKGROUND (jamais onDisappear — le discard
        // fire onDisappear et re-persisterait un draft explicitement jeté).
        .adaptiveOnChange(of: scenePhase) { _, newPhase in
            if newPhase == .background { autoSaveDraftForBackground() }
        }
        // E1 — le travail d'édition survit à un CRASH DUR : auto-save
        // débouncé ~2,5 s après la dernière mutation du ViewModel
        // (publisher STABLE côté VM — cf. `autosaveTrigger`).
        .onReceive(viewModel.autosaveTrigger) { _ in
            autosaveDraftAfterMutation()
        }
        // C9 Inc.2 — capture débouncée d'une étape d'annulation après chaque
        // accalmie de mutation. Mêmes gardes que l'autosave : jamais pendant
        // la décision de reprise (le composer vierge sous la carte ne doit
        // pas semer d'étapes), ni pendant le démontage post-discard/publish.
        .onReceive(viewModel.historyTrigger) { _ in
            guard !showRestoreDraftAlert, !draftAutosaveSuspended else { return }
            viewModel.pushHistorySnapshot()
        }
    }

    static let composerBandMinHeight: CGFloat = 160
    static let composerBandMaxHeight: CGFloat = 540

}
