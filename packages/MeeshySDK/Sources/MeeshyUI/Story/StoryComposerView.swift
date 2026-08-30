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

    /// V3-4 — la collecte d'accessibilité média (texte alternatif par média,
    /// opt-in d'extraction de son), POSSÉDÉE ici et injectée dans la couche de
    /// contrôles.
    ///
    /// Le composer est le seul niveau qui survive à la fois au repli de la
    /// band, au changement d'outil ET qui tienne le point de publication : lire
    /// la saisie au moment de publier exige de la posséder au-dessus des vues
    /// qui la collectent. Sans cette injection, `ComposerControlsLayer`
    /// retombait sur son propre store — la saisie fonctionnait, se conservait,
    /// et ne quittait jamais l'écran.
    @StateObject var accessibilityStore = MediaAccessibilityStore()

    // MARK: - System environment

    @Environment(\.colorScheme) var colorScheme
    @Environment(\.scenePhase) var scenePhase

    /// **L'accessoire *leading* de la rangée haute, fourni par l'app** (#4124).
    /// `nil` ⇒ rien n'est peint — aucun emplacement réservé, aucun fond.
    /// Détail de la doctrine : `StoryComposerHeaderAccessories.swift`.
    @Environment(\.storyComposerHeaderLeadingAccessory) var headerLeadingAccessory

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

    // MARK: - Amorces de page blanche (S5)

    /// Écran de capture caméra, présenté en plein écran par-dessus le composer.
    /// La VUE vient de l'app via `\.storyCameraCapture` (AVCaptureSession,
    /// permissions, écran de refus) — même doctrine que `showLocationPicker`.
    @State var showCameraCapture = false
    /// Dernière photo de la pellicule, résolue à l'ouverture par le
    /// fournisseur app-side. `nil` = aucune vignette (pas d'injection,
    /// permission refusée ou pellicule vide) → l'amorce retombe sur « Galerie ».
    @State var recentCameraRollAsset: StoryRecentCameraRollAsset?
    /// Repli du tap sur « Galerie » quand l'accès en lecture est refusé : le
    /// `PhotosPicker` système, qui ne consomme aucune permission. Présenté par
    /// code — la décision n'est connue qu'après la réponse de l'utilisateur.
    @State var showGalleryPicker = false

    // MARK: - Media editor (triggered by edit button on canvas elements)

    @State var editingBgImage: UIImage?
    @State var editingElementImage: EditingMediaImage?
    @State var editingElementVideo: EditingMediaVideo?

    // MARK: - Audio pickers

    @State var showAudioDocumentPicker = false
    @State var showVoiceRecorderSheet = false
    /// Porte à ouvrir APRÈS la fermeture de la feuille d'enregistrement —
    /// posée par les chips « Fichiers » / « Bibliothèque » de la feuille,
    /// consommée par son `onDismiss` (séquencement sheet → sheet, cf. +Media).
    @State var recorderFollowUp: StoryRecorderFollowUp?
    /// Sélecteur de la bibliothèque de sons — « Mes sons » et « Tendances ».
    @State var showSoundLibrary = false
    /// C8 — picker de stickers (bouton « Stickers » du panneau Texte).
    @State var showStickerPicker = false
    /// T20 — sélecteur de lieu (chip « Lieu » du panneau Texte). La VUE du
    /// picker est injectée par l'app via `\.storyLocationPicker` : MapKit et les
    /// permissions restent app-side (SDK purity).
    @State var showLocationPicker = false
    @State var showMentionPicker = false
    // Prisme Linguistique : le composer démarre toujours en français
    // (directive 2026-07-30, public cible France) — ni clavier, ni locale, ni
    // préférences de lecture. Voir `StoryComposerViewModel.defaultSourceLanguage`.
    @State var storyLanguage: String = StoryComposerViewModel.defaultSourceLanguage
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

    /// La publication n'attend plus rien (C3) : ce loquet n'existe que pour
    /// qu'un second tap pendant l'animation de dismiss (~0,3 s) ne re-publie
    /// pas la même story. Il gate aussi les deux autosaves (D1/E1) : une
    /// publication partie = l'upload possède l'état, un debounce débouché ne
    /// doit pas re-semer le brouillon déjà publié. Posé UNIQUEMENT si le
    /// hand-off a été accepté (cf. `publishAllSlides`).
    @State var didHandOffPublish = false

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

    /// La visibilité du chrome vit DANS la machine (`isChromeHidden`) : le
    /// `@State var areFabsVisible` d'avant était une seconde vérité que les
    /// transitions de panneau ne touchaient pas, d'où un composer sans « Fermer »
    /// ni « Publier » après un « Retour » (bug terrain 2026-07-31).
    @State var bandStateMachine: BandStateMachine = BandStateMachine()

    /// Hauteur (redimensionnable) du panneau DESSIN du band partagé, pilotée par le
    /// drag du grabber (`ComposerBottomBand`). Tirer vers le haut agrandit le panneau
    /// (liste des traits) ; vers le bas le réduit. En mode dessin (Option A) le canvas
    /// reste PLEIN — ce drawer flotte par-dessus, il ne rétrécit plus le canvas.
    @State var composerBandHeight: CGFloat = 280

    /// Hauteur RÉELLE rendue du panneau bas (`ComposerControlsLayer` : band d'outils
    /// OU picker d'état vide). `composerBandHeight` ne pilote QUE le drag (dessin) et
    /// ne reflète PAS la hauteur du contenu — le panneau se dimensionne à son contenu
    /// (grabber + panel + padding), souvent > `composerBandHeight`. On mesure donc la
    /// frame réelle et on la réserve, sinon le canvas scale trop grand et son bas
    /// déborde derrière/au-delà du panneau (« le canvas sort du viewport »). 0 tant
    /// que rien n'est mesuré / le panneau n'est pas rendu (dessin immersif).
    @State var measuredBottomBandHeight: CGFloat = 0

    /// Y (coord GLOBALES écran) du bord SUPÉRIEUR réel de la band d'outils,
    /// rapporté par `ComposerControlsLayer.onBandTopYChange`. Source de vérité
    /// pour la réserve basse du canvas : contrairement à
    /// `measuredBottomBandHeight` (taille de layout, qui sous-estime si le
    /// contenu déborde son `.frame(height:)` ou reste stale après resize), le
    /// `minY` global reflète TOUJOURS le haut visuellement rendu. Le canvas y
    /// colle son bas (moins le gap) → jamais recouvert/tronqué (bug 2026-07-20).
    /// `.greatestFiniteMagnitude` = band repliée (réserve 0).
    @State var measuredBandTopY: CGFloat = .greatestFiniteMagnitude

    /// Visibilité du bandeau ET décision de reprise, séparées : ranger le
    /// bandeau ne rend pas le magasin écrivable (cf. `DraftResumeState`).
    @State var draftResume = DraftResumeState()
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
    // L'audience n'est plus une constante mais le DERNIER CHOIX de
    // l'utilisateur, injecté par l'app (`initialVisibility`) depuis son magasin
    // de préférences — le SDK ne connaît pas ce magasin et reste auto-suffisant
    // via le défaut « Contacts » (`PostVisibility.friends`) : une story est
    // d'abord partagée avec ses contacts, pas publiquement.
    //
    // Chaîne de précédence, du plus fort au plus faible :
    //   1. `viewModel.editingInitialVisibility` (mode ÉDITION) — à l'init ;
    //   2. `restoreDraft()` (reprise d'un brouillon) — au tap « Reprendre »,
    //      filtré par `restorableVisibility(_:)` (+SyncRestore) ;
    //   3. `initialVisibility` injecté (dernier choix mémorisé, app-side) ;
    //   4. `PostVisibility.friends`.
    /// Plafond d'audience — `nil` (défaut) ⇒ toutes les audiences
    /// sélectionnables. Renseigné par la REPUBLICATION : une story se republie
    /// à audience égale ou plus restreinte, JAMAIS plus large (règle produit
    /// 2026-08-19). La liste est calculée par `StoryRepostAudience.allowed(from:)`,
    /// miroir de la loi serveur.
    ///
    /// C'est une AFFORDANCE, pas la garantie : le serveur refuse tout
    /// élargissement de son côté (403 `REPOST_AUDIENCE_WIDENING`, aux deux
    /// portes `repostPost` et `createPost`). Le plafond existe pour qu'on ne
    /// propose jamais à l'utilisateur un choix qui sera refusé.
    let allowedVisibilities: [PostVisibility]?

    @State var visibility: String
    @State var visibilityUserIds: [String]
    @State var audiencePickerMode: PostVisibility?
    @State var lostMediaCount: Int = 0  // > 0 triggers an alert after restoreDraft

    // MARK: - Keyboard observation + canvas shift

    @State var keyboardHeight: CGFloat = 0
    @State var canvasEditShift: CGFloat = 0
    /// Y (coord GLOBALES écran) du bord supérieur des contrôles de l'outil
    /// texte (chips + panneau déplié, clavier compris), rapporté par
    /// `StoryTextEditToolbar.onControlsTopYChange` — borne BASSE de la zone
    /// d'édition. `.greatestFiniteMagnitude` = éditeur fermé, aucune borne.
    @State var measuredTextToolbarTopY: CGFloat = .greatestFiniteMagnitude
    /// Y (coord GLOBALES écran) du bord inférieur du bouton « Terminé »,
    /// rapporté par `StoryTextEditToolbar.onTopBarBottomYChange` — borne HAUTE
    /// de la zone d'édition. Le canvas centre le texte édité dans cette zone et
    /// l'y borne en hauteur, un texte plus long défilant à l'intérieur
    /// (spec 2026-08-01). `.greatestFiniteMagnitude` = éditeur fermé.
    @State var measuredTextTopBarBottomY: CGFloat = .greatestFiniteMagnitude
    /// Frame naturelle (non décalée) du canvas, mesurée hors `.offset`.
    @State var canvasNaturalFrame: CGRect = .zero

    @Environment(\.theme) var theme

    /// Fabrique du sélecteur de lieu, injectée par l'app (le picker dépend de
    /// MapKit, CoreLocation et du coordinateur de permissions — app-side).
    @Environment(\.storyLocationPicker) var storyLocationPicker

    /// Fabrique de l'écran de capture caméra, injectée par l'app. `nil` = la
    /// capsule « Caméra » de la page blanche n'est pas rendue (une amorce qui
    /// ouvre le vide est pire que pas d'amorce).
    @Environment(\.storyCameraCapture) var storyCameraCapture

    /// Accès en lecture à la dernière photo de la pellicule, injecté par l'app
    /// (PhotoKit + autorisation limitée restent app-side). `nil` = la vignette
    /// n'est pas rendue et la galerie reste atteignable par le PhotosPicker.
    @Environment(\.storyRecentCameraRollAsset) var storyRecentCameraRollAsset

    // MARK: - Callbacks (public API preserved)

    public var onPublishSlide: (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void
    /// Retourne `true` quand le hand-off est ACCEPTÉ, c'est-à-dire quand
    /// l'hôte ferme réellement le composer. Un `false` (édition hors-ligne,
    /// surface qui ne publie pas) laisse le composer ouvert ET son bouton
    /// Publier utilisable : le loquet `didHandOffPublish` n'est posé que sur
    /// un `true`. Sans ce contrat, une surface qui ne ferme rien condamnait le
    /// bouton et coupait les deux autosaves définitivement.
    public var onPublishAllInBackground: (
        _ slides: [StorySlide],
        _ slideImages: [String: UIImage],
        _ loadedImages: [String: UIImage],
        _ loadedVideoURLs: [String: URL],
        _ loadedAudioURLs: [String: URL],
        _ originalLanguage: String?,
        _ visibility: String,
        _ visibilityUserIds: [String],
        _ draftId: String,
        /// Les personnes que l'auteur a choisi de nommer, avec leur mode. La
        /// publication les DÉCLARE au serveur ; elle ne devine plus les
        /// `@handle` des objets texte, que le serveur relit lui-même.
        _ references: [ComposerReference],
        /// Le texte alternatif par média et l'opt-in d'extraction de son, tels
        /// que l'auteur les a saisis. `mediaAlt` y est keyé par id d'élément du
        /// COMPOSER : au hand-off, aucun média n'a encore d'id serveur.
        _ accessibility: ComposerMediaAccessibility,
        /// Le format que l'auteur a choisi de PUBLIER (V3-3). L'atelier ne s'en
        /// sert pas : il le transmet, parce que l'hôte est le seul à savoir sous
        /// quel type envoyer. Sans lui, un composer offrant « Post » publiait une
        /// story quand même — un choix qui a l'air de marcher.
        _ targetType: PostType
    ) -> Bool
    public var onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    public var onDismiss: () -> Void

    /// Qui peint l'audience, l'œil et la flèche de publication (V3-1).
    /// `.atelier` par défaut : un appelant qui ne sait rien d'un meuble garde
    /// exactement la barre qu'il avait.
    public let chromeOwner: ComposerChromeOwner

    /// La télécommande de publication du meuble, quand il y en a un. `nil` =
    /// personne ne presse de l'extérieur, et l'atelier publie par sa barre.
    public let publishTrigger: ComposerPublishTrigger?

    /// Le format sous lequel la FLÈCHE DE L'ATELIER publie (V3-3).
    ///
    /// `.story` par défaut : un appelant qui ne sait rien des formats compose
    /// et publie exactement ce qu'il publiait. L'hôte qui monte un éventail y
    /// pose le format courant, et il est relu à chaque rendu du corps — donc au
    /// moment du tap.
    ///
    /// Ce n'est PAS le carrier du chemin télécommande : le corps armé est
    /// capturé au montage (`onAppear`), et une propriété `let` lue là dedans
    /// serait celle du montage. C'est pourquoi la pression du meuble apporte
    /// son propre format (`ComposerPublishTrigger.requestPublish(as:)`).
    public let publishTargetType: PostType

    public init(
        initialVisibility: String = PostVisibility.friends.rawValue,
        initialVisibilityUserIds: [String] = [],
        allowedVisibilities: [PostVisibility]? = nil,
        chromeOwner: ComposerChromeOwner = .atelier,
        publishTrigger: ComposerPublishTrigger? = nil,
        publishTargetType: PostType = .story,
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference], ComposerMediaAccessibility, PostType) -> Bool,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.allowedVisibilities = allowedVisibilities
        self.chromeOwner = chromeOwner
        self.publishTrigger = publishTrigger
        self.publishTargetType = publishTargetType
        self._visibility = State(initialValue: initialVisibility)
        self._visibilityUserIds = State(initialValue: initialVisibilityUserIds)
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
        initialVisibility: String = PostVisibility.friends.rawValue,
        initialVisibilityUserIds: [String] = [],
        allowedVisibilities: [PostVisibility]? = nil,
        chromeOwner: ComposerChromeOwner = .atelier,
        publishTrigger: ComposerPublishTrigger? = nil,
        publishTargetType: PostType = .story,
        onPublishSlide: @escaping (StorySlide, UIImage?, [String: UIImage], [String: URL], String?) async throws -> Void = { _, _, _, _, _ in },
        onPublishAllInBackground: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference], ComposerMediaAccessibility, PostType) -> Bool,
        onPreview: @escaping ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void = { _, _, _, _, _ in },
        onDismiss: @escaping () -> Void
    ) {
        self._viewModel = StateObject(wrappedValue: viewModel)
        self.allowedVisibilities = allowedVisibilities
        self.chromeOwner = chromeOwner
        self.publishTrigger = publishTrigger
        self.publishTargetType = publishTargetType
        // E1 (#3886) — le contenu du réel/story part dans la langue DÉCLARÉE au
        // composer (semée dans `viewModel.declaredContentLanguage` par l'hôte),
        // jamais « fr » codé en dur.
        self._storyLanguage = State(initialValue: viewModel.declaredContentLanguage)
        self._visibility = State(initialValue: initialVisibility)
        self._visibilityUserIds = State(initialValue: initialVisibilityUserIds)
        self.onPublishSlide = onPublishSlide
        self.onPublishAllInBackground = onPublishAllInBackground
        self.onPreview = onPreview
        self.onDismiss = onDismiss
        // Mode édition (`init(editing:)`) : PRIORITÉ ABSOLUE — le composer
        // s'ouvre sur la visibilité ACTUELLE de la story, jamais sur le dernier
        // choix mémorisé. Cette réassignation vient donc APRÈS celle du
        // paramètre injecté (chaîne de précédence, cf. `visibility`).
        if let editingVisibility = viewModel.editingInitialVisibility {
            self._visibility = State(initialValue: editingVisibility)
            self._visibilityUserIds = State(initialValue: viewModel.editingInitialVisibilityUserIds)
        }
    }

    /// True quand le composer ÉDITE une story publiée — gate le système de
    /// brouillons (restore/save/autosave) et le multi-slide (une story
    /// publiée = UN slide), et bascule le libellé du bouton publier.
    var isEditingExistingStory: Bool { viewModel.editingPostId != nil }

    // MARK: - Body

    public var body: some View {
        sheetModifiers
        // U4 inc.2 — la reprise de brouillon montre CE QU'ON reprend (cover
        // composite) au lieu de l'ancienne alerte texte nue.
        //
        // S5 — elle n'est plus MODALE : l'overlay noir à 0,55 d'opacité était le
        // premier écran rencontré à presque chaque ouverture et interdisait tout
        // accès au canvas avant d'avoir tranché. Le bandeau se pose désormais en
        // BAS, le canvas reste interactif derrière, et interagir avec lui le
        // range sans rien jeter (`ComposerBackgroundTapAction.dismissDraftResume`).
        // « Recommencer » reste le SEUL discard explicite.
        .overlay(alignment: .bottom) {
            if draftResume.isBannerVisible {
                DraftResumeCard(
                    cover: draftResumeCover,
                    slideCount: draftResumeSlideCount,
                    updatedAt: nil,
                    onResume: {
                        draftResume.decide()
                        restoreDraft()
                    },
                    onDiscard: {
                        draftResume.decide()
                        discardOfferedDraft()
                    }
                )
                .padding(.horizontal, 16)
                // Dégage le rail de FABs (48 pt + marge + safe area), comme les
                // amorces de page blanche : le bandeau se pose AU-DESSUS des
                // outils, il ne les recouvre pas. MÊME constante que les
                // amorces — deux littéraux jumeaux finissent par diverger.
                .padding(.bottom, ComposerControlMetrics.bottomOverlayClearance)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(40)
            }
        }
        // M10 — zéro question à la sortie : AUCUNE feuille d'action de sortie
        // ne se pose ici, et il ne doit plus jamais s'en poser. Fermer le
        // composer ÉCRIT le brouillon, en silence (`handleDismiss` →
        // `saveDraftAndDismiss`) ; la feuille « Sauvegarder / Quitter /
        // Annuler » était la seule issue destructive que la croix pouvait
        // produire, et elle redemandait à chaque fermeture ce que le magasin
        // sait faire seul. Verrou : `StoryComposerExitDialogSourceGuardTests`.
        // Les alertes qui suivent sont d'un autre ordre : elles RAPPORTENT un
        // échec média, elles ne demandent rien.

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
            switch Self.openingDraftAction(
                isEditingExistingStory: isEditingExistingStory,
                isAdoptedDraftSession: viewModel.isAdoptedDraftSession,
                isSeededSession: viewModel.isSeededSession
            ) {
            case .restoreAdoptedDraft:
                // Brouillon CHOISI dans « Mes stories » : restauration directe,
                // sans bandeau — `restoreDraft()` seed lui-même l'historique.
                restoreDraft()
            case .adoptSeededCanvas:
                // Session SEMÉE : le canvas porte déjà son média. On le recopie
                // dans l'état de la vue — `selectedImage` est un INSTANTANÉ que
                // rien d'autre ne repeuple — et on n'offre AUCUNE reprise :
                // `restoreDraft()` écraserait `slides`, donc la graine.
                restoreCanvas(from: viewModel.currentSlide)
                viewModel.seedHistory()
            case .offerDraftResume:
                checkForDraft()
                // C9 — trajectoire d'annulation : seed sur l'état d'entrée
                // (composer vierge ; `restoreDraft()` re-seed après reprise).
                viewModel.seedHistory()
            case .hydratedByEditMode:
                // Jamais de carte de reprise par-dessus la story hydratée —
                // le brouillon appartient au flux de CRÉATION.
                viewModel.seedHistory()
            }
        }
        // V3-1 — l'atelier arme la télécommande du meuble avec sa PROPRE
        // publication. Le meuble presse, il ne recompose rien : le rabattement
        // des effets du canvas, la visibilité et la langue restent lus ici.
        .onAppear {
            publishTrigger?.arm { publishAllSlides() }
            // #4135 — l'ŒIL s'arme séparément, et il s'exécute ICI : l'aperçu
            // se rend avec les médias PRÉCHARGÉS de l'atelier et ses effets de
            // canvas rabattus (`snapshotAllSlides`). Un œil peint au meuble et
            // exécuté par lui rendrait un aperçu amputé — c'est l'un des deux
            // blocages qui avaient fait revenir ce lot en arrière au #4124.
            publishTrigger?.armPreview { presentPreview() }
            publishTrigger?.report(canPublish: canPublish)
        }
        .onDisappear { publishTrigger?.disarm() }
        // Le gate du bouton se RELAIE, il ne se recopie pas : le meuble ne voit
        // ni `selectedAudioId` ni les traits de dessin, et conclurait « rien à
        // publier » sur une story « fond + musique » parfaitement publiable.
        .adaptiveOnChange(of: canPublish) { _, nouveau in
            publishTrigger?.report(canPublish: nouveau)
        }
        // Le bandeau de reprise ne flotte au-dessus de RIEN : dès que le chrome
        // plein cède la place (panneau d'outil, éditeur texte, dessin, timeline),
        // il se range. La règle est pure et testée
        // (`ComposerChromePolicy.rangesDraftResumeBanner`) ; `showTopBar` EST
        // `fullChromeVisible`, donc son basculement est le seul signal à écouter.
        .adaptiveOnChange(of: showTopBar) { _, _ in
            rangeDraftResumeBannerIfNeeded()
        }
        // D1 — le travail d'édition survit au kill de l'app : auto-save du
        // draft au passage en BACKGROUND (jamais onDisappear — le discard
        // fire onDisappear et re-persisterait un draft explicitement jeté).
        .adaptiveOnChange(of: scenePhase) { _, newPhase in
            if newPhase == .background { autoSaveDraftOnInterruption() }
        }
        // C6b — le binaire périmé ne coûte pas le travail en cours. Tout 426
        // poste `.meeshyUpgradeRequired` (`UpgradeGateSignal`), et les deux
        // racines recouvrent alors l'app d'une porte bloquante : sans cette
        // ligne, la composition ouverte disparaît derrière elle sans avoir
        // touché le disque. Le poste est ASYNCHRONE sur la file principale et
        // la porte n'ouvre qu'au tour de boucle suivant (`Task { @MainActor }`
        // d'`UpgradeGateController`) — l'écriture précède donc le
        // recouvrement. MÊME chemin d'écriture silencieuse que D1, gate
        // compris : une interruption n'est pas une commande utilisateur.
        .onReceive(NotificationCenter.default.publisher(for: .meeshyUpgradeRequired)) { _ in
            autoSaveDraftOnInterruption()
        }
        // E1 — le travail d'édition survit à un CRASH DUR : auto-save
        // débouncé ~2,5 s après la dernière mutation du ViewModel
        // (publisher STABLE côté VM — cf. `autosaveTrigger`).
        .onReceive(viewModel.autosaveTrigger) { _ in
            autosaveDraftAfterMutation()
        }
        // C9 Inc.2 — capture débouncée d'une étape d'annulation après chaque
        // accalmie de mutation. Jamais tant que le bandeau de reprise est POSÉ
        // (le composer vierge dessous ne doit pas semer d'étapes), ni pendant
        // le démontage post-discard/publish. Le bandeau RANGÉ, en revanche,
        // laisse l'undo reprendre : l'historique vit en mémoire et n'écrase
        // aucun brouillon — c'est justement ce qui distingue ce verrou de
        // celui de l'autosave (`mayOverwriteStoredDraft`).
        .onReceive(viewModel.historyTrigger) { _ in
            guard !draftResume.isBannerVisible, !draftAutosaveSuspended else { return }
            viewModel.pushHistorySnapshot()
        }
    }

    static let composerBandMinHeight: CGFloat = 160
    static let composerBandMaxHeight: CGFloat = 540

}
