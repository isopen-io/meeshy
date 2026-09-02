import SwiftUI
import MeeshySDK

/// Per-clip editor surface. Stateless on its own — receives a snapshot, emits
/// callbacks for every field commit. The owning container (`StoryTimelineView`
/// `TimelineInspectorHost` wires those callbacks back to `TimelineViewModel`.
///
/// ### State sync contract
/// The inspector holds local `@State` for the slider/toggle values to keep
/// in-flight gestures smooth (a single drag must not be interrupted by an
/// external snapshot push). However, when the upstream `clip` changes for
/// non-edit reasons — most importantly **undo/redo** — the local `@State`
/// MUST resync to the new snapshot, otherwise the UI shows stale values.
///
/// SwiftUI does NOT re-run `init` when only `clip` changes (the view's
/// identity is preserved), so the resync is implemented via `.adaptiveOnChange(of:)`
/// inside `body`. See `test_inspector_clipChanges_stateResyncs`.
public struct ClipInspector: View {

    // MARK: - Snapshot

    public struct ClipSnapshot: Equatable, Sendable {
        public enum Kind: String, Sendable, Equatable {
            case video, audio, text, image, sticker
            /// Pastille de LIEU — sa fiche ne porte que la fenêtre et le nom.
            /// Sans ce cas, `TimelineInspectorHost.clipSnapshot` rendait `nil`,
            /// et toute la chaîne du doigt se coupait trois appels plus haut :
            /// pas de fiche ⇒ pas de sélection ⇒ pas de poignées de rognage
            /// (#4840, moitié manquante).
            case place
        }
        public let id: String
        public let displayName: String
        public let kind: Kind
        public let startTime: Float
        public let duration: Float
        public let volume: Float
        public let fadeInDuration: Float
        public let fadeOutDuration: Float
        public let isLooping: Bool
        public let isBackground: Bool
        /// Nom personnalisé de la piste (nil = utilise `displayName` par défaut).
        public let name: String?
        /// Place de la piste dans le PLAN. Le snapshot ne la transportait pas,
        /// si bien que la fiche restituait le temps mais jamais l'espace : on
        /// ne pouvait ni lire ni corriger une position au chiffre près.
        public let transform: ClipTransform
        /// Points d'automation du volume déjà posés sur ce clip.
        public let volumeKeyframes: [VolumePoint]
        /// L'atténuation automatique est coupée sur ce clip.
        public let isDuckingDisabled: Bool
        /// La slide porte un audio de fond. Sans lui, rien n'est atténué : la
        /// bascule d'atténuation serait un contrôle sans effet.
        public let slideHasBackgroundAudio: Bool
        /// `true` quand `timing == nil` au modèle (O4 — le clip est un
        /// FANTÔME, sa fenêtre suit la durée de la slide). `false` = une
        /// fenêtre explicite a été posée (un bord tiré, typiquement) — c'est
        /// alors que « Suivre la slide » (D3, revue totale U9) redevient
        /// pertinente : la sortie de l'état doit être aussi évidente que son
        /// entrée.
        public let isFollowingSlide: Bool

        /// Un point de la courbe de volume, tel que la fiche l'affiche.
        ///
        /// `absoluteTime` est l'instant sur la TIMELINE, pas l'offset dans le
        /// clip : le modèle stocke du relatif, et l'afficher tel quel sur un
        /// clip qui démarre à 5 s annoncerait un instant faux. Même convention
        /// que `KeyframeInspector.KeyframeSnapshot.absoluteTime`.
        public struct VolumePoint: Equatable, Sendable, Identifiable {
            public let id: String
            public let absoluteTime: Float
            public let volume: Float

            public init(id: String, absoluteTime: Float, volume: Float) {
                self.id = id
                self.absoluteTime = absoluteTime
                self.volume = volume
            }
        }

        public init(id: String, displayName: String, kind: Kind,
                    startTime: Float, duration: Float, volume: Float,
                    fadeInDuration: Float, fadeOutDuration: Float,
                    isLooping: Bool, isBackground: Bool,
                    name: String? = nil,
                    transform: ClipTransform = .identity,
                    volumeKeyframes: [VolumePoint] = [],
                    isDuckingDisabled: Bool = false,
                    slideHasBackgroundAudio: Bool = false,
                    isFollowingSlide: Bool = false) {
            self.id = id; self.displayName = displayName; self.kind = kind
            self.startTime = startTime; self.duration = duration
            self.volume = volume
            self.fadeInDuration = fadeInDuration; self.fadeOutDuration = fadeOutDuration
            self.isLooping = isLooping; self.isBackground = isBackground
            self.name = name
            self.transform = transform
            self.volumeKeyframes = volumeKeyframes
            self.isDuckingDisabled = isDuckingDisabled
            self.slideHasBackgroundAudio = slideHasBackgroundAudio
            self.isFollowingSlide = isFollowingSlide
        }
    }

    public static let fadeRange: ClosedRange<Float> = 0...3

    // MARK: - Sections (modale allégée)

    /// Régions de la modale, dans l'ordre de rendu.
    ///
    /// `timing` et `transform` ne sont plus jamais rendues (directive user
    /// 2026-07-29 : « enlever les éléments modifiables par la gestuelle »).
    /// Les cas restent dans l'énumération le temps que les vues qui les
    /// portent soient retirées — leur absence de `visibleSections` suffit à
    /// les faire disparaître de la fiche, et un test le verrouille.
    public enum Section: String, CaseIterable, Sendable, Equatable {
        case header, timing, transform, volume, animation, toggles, actions
    }

    /// Résout les sections visibles pour un état donné.
    ///
    /// La fiche ne redit plus ce qu'un geste fait déjà. Le début, la fin et la
    /// durée se règlent en glissant le clip sur sa piste et en tirant ses
    /// poignées ; la position, la taille, la rotation et le rang de
    /// superposition se manipulent au doigt sur le canvas. Ces deux blocs
    /// occupaient la moitié de la hauteur de la fiche pour des réglages que la
    /// main atteint plus vite — retour user 2026-07-29 sur une fiche jugée
    /// surchargée.
    ///
    /// Restent les réglages qu'aucun geste ne produit : le nom, le volume et
    /// sa courbe, les fondus, les interrupteurs, les actions. Pure — testée
    /// sans monter la vue (voir `ClipInspectorGestureDuplicationTests`).
    public static func visibleSections(kind: ClipSnapshot.Kind,
                                       isBackground: Bool) -> [Section] {
        var sections: [Section] = [.header]
        if hasAudioAffordances(kind: kind) { sections.append(.volume) }
        // **Même règle que la rangée d'interrupteurs ci-dessous, et elle
        // manquait** (#4899) : `.animation` était montée pour les CINQ
        // familles, alors que ses trois contrôles — fondu d'entrée, fondu de
        // sortie, « Animer au playhead » — sont refusés pour un sticker comme
        // pour un lieu. La fiche affichait même l'ÉTAT du fondu, donc la puce
        // se cochait et le modèle ne bougeait pas.
        if supportsFade(kind: kind) || supportsKeyframes(kind: kind) {
            sections.append(.animation)
        }
        // La rangée d'interrupteurs ne s'affiche que si l'un d'eux agit
        // vraiment. Texte et sticker n'ont NI boucle NI bascule de fond :
        // `setClipLoop` / `setClipBackground` les ignorent silencieusement.
        if supportsLoop(kind: kind, isBackground: isBackground) || supportsBackgroundToggle(kind: kind) {
            sections.append(.toggles)
        }
        sections.append(.actions)
        return sections
    }

    /// True quand la piste occupe une place dans le PLAN et que la déplacer,
    /// la redimensionner ou la faire pivoter a un effet visible.
    ///
    /// Un clip de FOND remplit tout le cadre : sa position n'a pas de sens. Un
    /// AUDIO n'a rien à montrer — son `x`/`y` existe dans le modèle mais ne
    /// pilote aucun rendu.
    /// Le sticker en est exclu comme il l'est déjà de la suppression :
    /// `SetClipPropertyCommand` refuse explicitement ses propriétés
    /// (« sticker properties are edited on the canvas, not the timeline »).
    public static func supportsTransform(kind: ClipSnapshot.Kind, isBackground: Bool) -> Bool {
        guard !isBackground else { return false }
        switch kind {
        case .video, .image, .text: return true
        // Le lieu suit le sticker : `SetClipPropertyCommand` refuse ses
        // propriétés, elles se règlent au doigt sur le canvas.
        case .audio, .sticker, .place: return false
        }
    }

    // MARK: - Confirmation de suppression

    /// Machine d'état minimale du flux « supprimer » : le bouton corbeille ne
    /// détruit JAMAIS directement — il présente une alerte ; seule la
    /// confirmation explicite invoque `onDelete` (retour user 2026-07-11).
    public struct DeleteConfirmation: Sendable, Equatable {
        public private(set) var isPresented = false
        public init() {}
        public mutating func request() { isPresented = true }
        public mutating func cancel() { isPresented = false }
        public mutating func confirm(onDelete: () -> Void) {
            isPresented = false
            onDelete()
        }
    }

    public let presentation: InspectorPresentation
    public let clip: ClipSnapshot
    public let onVolumeChanged: (Float) -> Void
    public let onFadeInChanged: (Float) -> Void
    public let onFadeOutChanged: (Float) -> Void
    public let onLoopToggled: (Bool) -> Void
    public let onBackgroundToggled: (Bool) -> Void
    public let onAddKeyframe: () -> Void
    public let onDelete: () -> Void
    /// « Suivre la slide » (D3, revue totale U9) : remet `timing` à `nil` —
    /// symétrique du bord tiré, qui convertit implicitement un fantôme en
    /// durée explicite.
    public let onFollowSlide: () -> Void
    /// Découpe le clip à la tête de lecture. Cette action était le DOUBLE TAP
    /// sur la barre vidéo : trancher un média n'est pas ce qu'on attend d'un
    /// geste d'ouverture, et elle n'était même câblée que sur la vidéo.
    public let onSplit: () -> Void
    /// Ferme l'inspecteur (désélection) — la modale était infermable :
    /// aucune affordance, seul un tap hasardeux hors clip la faisait
    /// disparaître (retour user 2026-07-11).
    public let onClose: () -> Void
    /// Ajustement du DÉBUT par pas (déplace le clip, durée constante).
    public let onStartAdjusted: (Float) -> Void
    /// Ajustement de la DURÉE par pas (la fin bouge, le début reste).
    public let onDurationAdjusted: (Float) -> Void
    /// Renommage du clip (nil/vide = retour au nom par défaut).
    public let onNameChanged: (String?) -> Void
    /// Ajustement de la FIN (garde le début, recalcule la durée).
    public let onEndAdjusted: (Float) -> Void
    /// Trim du DÉBUT (fin fixe — la durée se réduit d'autant). Poignée gauche
    /// de la barre de timing, câblée sur `TimelineViewModel.trimClipStart`.
    public let onStartTrimmed: (Float) -> Void
    /// Durée totale de la slide — étendue de la barre de timing tactile.
    public let slideDuration: Float
    /// Pose le DÉBUT à une valeur absolue (le clip se déplace, durée constante).
    public let onStartSet: (Float) -> Void
    /// Pose la FIN à une valeur absolue (le début est préservé).
    public let onEndSet: (Float) -> Void
    /// Pose la DURÉE à une valeur absolue (le début est préservé).
    public let onDurationSet: (Float) -> Void
    /// Règle un champ de la place dans le plan.
    public let onTransformChanged: (ClipTransform.Field) -> Void
    /// Position de lecture courante — le point se pose LÀ, et le bouton le dit
    /// plutôt que de laisser deviner où il atterrira.
    public let playheadTime: Float
    /// Pose un point de volume au playhead, au niveau passé.
    public let onAddVolumePoint: (Float) -> Void
    /// Retire le point d'automation d'identifiant donné.
    public let onRemoveVolumePoint: (String) -> Void
    /// Coupe (`true`) ou rétablit (`false`) l'atténuation automatique du clip.
    public let onDuckingDisabledChanged: (Bool) -> Void
    /// Coupe ou rétablit le son de CE clip (D3, revue DoD : le mute par clip
    /// vivait sur la barre de l'ancien conteneur mono-piste et n'avait plus
    /// aucune surface depuis le passage au plan). L'appelant le branche sur
    /// `TimelineViewModel.toggleClipMute` — annulable, et le niveau quitté
    /// est rendu au rétablissement.
    public let onToggleMute: () -> Void

    /// True quand couper l'atténuation automatique a un effet.
    ///
    /// Deux conditions : le clip est une VIDÉO — c'est leur piste que le
    /// ducking atténue, un audio n'est jamais atténué — et la slide porte un
    /// audio de fond, sans quoi rien n'est atténué et l'interrupteur ne
    /// changerait rien à ce qu'on entend.
    public nonisolated static func supportsDucking(kind: ClipSnapshot.Kind,
                                                   slideHasBackgroundAudio: Bool) -> Bool {
        kind == .video && slideHasBackgroundAudio
    }

    /// Points triés par instant.
    ///
    /// Le modèle les garde dans l'ordre d'INSERTION : poser un point avant un
    /// autre les listerait à l'envers, et la liste ne se lirait plus comme la
    /// courbe qu'elle décrit.
    public nonisolated static func sortedVolumePoints(
        _ points: [ClipSnapshot.VolumePoint]
    ) -> [ClipSnapshot.VolumePoint] {
        points.sorted { $0.absoluteTime < $1.absoluteTime }
    }

    /// Libellé d'un gain, en pourcentage entier.
    ///
    /// Volontairement non localisé : comparer un libellé localisé à un littéral
    /// reviendrait à tester la locale du simulateur. Au-delà de 100 % le son
    /// sature — c'est un choix de composition assumé, le libellé l'affiche.
    public nonisolated static func formatGain(_ volume: Float) -> String {
        "\(Int((volume * 100).rounded())) %"
    }

    /// Secondes saisies au clavier. Accepte les DEUX séparateurs décimaux : un
    /// champ qui refuse « 3,5 » est inutilisable en français.
    public nonisolated static func parseSeconds(_ text: String) -> Float? {
        let normalized = text.replacingOccurrences(of: ",", with: ".")
        guard let value = Float(normalized), value.isFinite, value >= 0 else { return nil }
        return value
    }

    /// Nombre décimal signé — position en pourcentage, échelle, rotation.
    public nonisolated static func parseDecimal(_ text: String) -> Double? {
        let normalized = text.replacingOccurrences(of: ",", with: ".")
        guard let value = Double(normalized), value.isFinite else { return nil }
        return value
    }

    /// Pas des steppers début/durée.
    public static let timeStep: Float = 0.1

    // MARK: - Timing lié (début / fin / durée)

    public enum TimingField: Sendable, Equatable { case start, end, duration }

    /// Résout les trois valeurs liées début/fin/durée sous la contrainte
    /// `fin = début + durée`, selon le champ édité. Clamps : durée ≥ 0,
    /// fin ≤ slideDuration, début ≥ 0. Pure — testée sans monter la vue.
    public static func resolveLinkedTiming(field: TimingField,
                                           start: Float, end: Float,
                                           duration: Float,
                                           slideDuration: Float) -> (start: Float, end: Float, duration: Float) {
        switch field {
        case .start:
            let s = max(0, min(start, slideDuration))
            let e = min(slideDuration, s + max(0, duration))
            return (s, e, e - s)
        case .duration:
            let s = max(0, start)
            let e = min(slideDuration, s + max(0, duration))
            return (s, e, e - s)
        case .end:
            let s = max(0, start)
            let e = max(s, min(end, slideDuration))
            return (s, e, e - s)
        }
    }

    @State private var volume: Float
    @State private var fadeIn: Float
    @State private var fadeOut: Float
    @State private var loop: Bool
    @State private var background: Bool
    @State private var duckingDisabled: Bool
    @State private var draftName: String
    /// Brouillons de saisie, un par champ, vidés à la validation pour que la
    /// valeur affichée redevienne celle du modèle.
    @State private var drafts: [String: String] = [:]
    @State private var deleteConfirmation = DeleteConfirmation()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(presentation: InspectorPresentation,
                clip: ClipSnapshot,
                onVolumeChanged: @escaping (Float) -> Void,
                onFadeInChanged: @escaping (Float) -> Void,
                onFadeOutChanged: @escaping (Float) -> Void,
                onLoopToggled: @escaping (Bool) -> Void,
                onBackgroundToggled: @escaping (Bool) -> Void,
                onAddKeyframe: @escaping () -> Void,
                onDelete: @escaping () -> Void,
                onFollowSlide: @escaping () -> Void = {},
                onSplit: @escaping () -> Void = {},
                onClose: @escaping () -> Void = {},
                onStartAdjusted: @escaping (Float) -> Void = { _ in },
                onDurationAdjusted: @escaping (Float) -> Void = { _ in },
                onNameChanged: @escaping (String?) -> Void = { _ in },
                onEndAdjusted: @escaping (Float) -> Void = { _ in },
                onStartTrimmed: @escaping (Float) -> Void = { _ in },
                slideDuration: Float = 0,
                onStartSet: @escaping (Float) -> Void = { _ in },
                onEndSet: @escaping (Float) -> Void = { _ in },
                onDurationSet: @escaping (Float) -> Void = { _ in },
                onTransformChanged: @escaping (ClipTransform.Field) -> Void = { _ in },
                playheadTime: Float = 0,
                onAddVolumePoint: @escaping (Float) -> Void = { _ in },
                onRemoveVolumePoint: @escaping (String) -> Void = { _ in },
                onDuckingDisabledChanged: @escaping (Bool) -> Void = { _ in },
                onToggleMute: @escaping () -> Void = {}) {
        self.presentation = presentation
        self.clip = clip
        self.onVolumeChanged = onVolumeChanged
        self.onFadeInChanged = onFadeInChanged
        self.onFadeOutChanged = onFadeOutChanged
        self.onLoopToggled = onLoopToggled
        self.onBackgroundToggled = onBackgroundToggled
        self.onAddKeyframe = onAddKeyframe
        self.onDelete = onDelete
        self.onFollowSlide = onFollowSlide
        self.onSplit = onSplit
        self.onClose = onClose
        self.onStartAdjusted = onStartAdjusted
        self.onDurationAdjusted = onDurationAdjusted
        self.onNameChanged = onNameChanged
        self.onEndAdjusted = onEndAdjusted
        self.onStartTrimmed = onStartTrimmed
        self.slideDuration = slideDuration
        self.onStartSet = onStartSet
        self.onEndSet = onEndSet
        self.onDurationSet = onDurationSet
        self.onTransformChanged = onTransformChanged
        self.playheadTime = playheadTime
        self.onAddVolumePoint = onAddVolumePoint
        self.onRemoveVolumePoint = onRemoveVolumePoint
        self.onDuckingDisabledChanged = onDuckingDisabledChanged
        self.onToggleMute = onToggleMute
        _volume = State(initialValue: clip.volume)
        _fadeIn = State(initialValue: clip.fadeInDuration)
        _fadeOut = State(initialValue: clip.fadeOutDuration)
        _loop = State(initialValue: clip.isLooping)
        _background = State(initialValue: clip.isBackground)
        _duckingDisabled = State(initialValue: clip.isDuckingDisabled)
        _draftName = State(initialValue: clip.name ?? "")
    }

    // MARK: - Test helpers

    public func simulateVolumeCommit(value: Float) {
        onVolumeChanged(min(StoryVolume.maxGain, max(0, value)))
    }

    /// Même rôle que `simulateVolumeCommit` pour le mute par clip : atteindre
    /// l'action sans simuler un tap dans une vue non hostable.
    public func simulateMuteToggle() {
        onToggleMute()
    }

    /// Test-only read of the current local `@State` values. Used by
    /// `ClipInspector_StateSyncTests` to verify that `.adaptiveOnChange(of: clip)`
    /// successfully resyncs after an external snapshot change (e.g. undo).
    public struct _StateProbe: Sendable, Equatable {
        public let volume: Float
        public let fadeIn: Float
        public let fadeOut: Float
        public let loop: Bool
        public let background: Bool
        public let duckingDisabled: Bool
    }

    public var _stateSnapshot: _StateProbe {
        _StateProbe(volume: volume, fadeIn: fadeIn, fadeOut: fadeOut,
                    loop: loop, background: background,
                    duckingDisabled: duckingDisabled)
    }

    /// Full ms-precision time readout. Delegates to `TransportBar.formatTime`
    /// (the SSOT for this format) — never re-derive the formula here.
    public static func formatTime(seconds: Float) -> String {
        TransportBar.formatTime(seconds: seconds)
    }

    /// True when the clip's media carries audio playback (`.video` or `.audio`).
    /// Image clips have no audio track — exposing the volume slider or loop
    /// toggle for them would surface controls that have no underlying effect.
    /// Exposed at type-level so tests can assert kind→affordance gating
    /// without driving the SwiftUI view body.
    public static func hasAudioAffordances(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio:                 return true
        case .image, .text, .sticker, .place: return false
        }
    }

    /// True quand basculer le clip en FOND a un effet. `setClipBackground`
    /// ignore silencieusement texte et sticker : leur afficher l'interrupteur
    /// revenait à proposer un contrôle mort.
    public static func supportsBackgroundToggle(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio, .image: return true
        case .text, .sticker, .place: return false
        }
    }

    /// True quand la corbeille de l'inspecteur détruit réellement le clip. Un
    /// sticker se retire depuis le CANVAS (`deleteClip` le refuse
    /// explicitement) — le bouton n'aurait rien supprimé.
    /// Écrit en `switch` EXHAUSTIF plutôt qu'en `kind != .sticker` : la forme
    /// négative accueille toute famille NEUVE du bon côté par défaut, en
    /// silence. Un lieu s'y serait glissé comme supprimable alors que
    /// `deleteClip` le refuse — le bouton n'aurait rien supprimé.
    public static func supportsDeletion(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio, .image, .text: return true
        case .sticker, .place:              return false
        }
    }

    /// True quand découper le clip à la tête de lecture a un sens. Un sticker
    /// est un point d'apparition, pas une matière qu'on tranche — même raison
    /// que `supportsDeletion`.
    public static func supportsSplit(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio, .image, .text: return true
        case .sticker, .place:              return false
        }
    }

    /// True when looping a clip makes sense. RÈGLE PRODUIT : la boucle est
    /// réservée au FOND (un fond couvre toute la slide et boucle pour la
    /// remplir) — un clip foreground a une fenêtre début/durée, il ne boucle
    /// jamais. Audio + vidéo uniquement (image/texte : rien à boucler).
    public static func supportsLoop(kind: ClipSnapshot.Kind, isBackground: Bool) -> Bool {
        guard isBackground else { return false }
        switch kind {
        case .video, .audio:                 return true
        case .image, .text, .sticker, .place: return false
        }
    }

    /// True quand poser un fondu d'entrée / de sortie a un effet. La vérité
    /// est celle de la COMMANDE, jamais une seconde liste : `setClipFadeIn` /
    /// `setClipFadeOut` sortent sans rien faire pour un sticker et pour un
    /// lieu — leur montrer les puces de fondu affichait un état que rien ne
    /// pouvait changer.
    public static func supportsFade(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio, .image, .text: return true
        case .sticker, .place:              return false
        }
    }

    /// True quand poser une étape d'animation a un effet. Vérité de
    /// `TimelineProject.mutateKeyframes`, qui lève `invalidState` pour un
    /// sticker et pour un lieu — « leur famille temporelle est
    /// start/duration/fade, sans courbe ».
    ///
    /// Deux prédicats plutôt qu'un, alors qu'ils rendent aujourd'hui le même
    /// verdict : ce sont deux QUESTIONS, tranchées par deux commandes
    /// différentes. Les fondre ferait qu'une famille future acceptant l'un
    /// sans l'autre n'aurait aucun endroit où le dire.
    public static func supportsKeyframes(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio, .image, .text: return true
        case .sticker, .place:              return false
        }
    }

    /// VoiceOver label for the inspector container, resolved per clip kind.
    /// Prior to this helper, the label was hardcoded to "Video clip" for every
    /// kind — audio/image/text clips were mis-announced. Exposed at type-level
    /// so tests can assert the kind→label mapping without driving the SwiftUI
    /// view body. See `ClipInspector_AccessibilityKindTests`.
    public static func accessibilityLabel(for kind: ClipSnapshot.Kind) -> String {
        switch kind {
        case .video: return String(localized: "story.timeline.a11y.clip.video", bundle: .module)
        case .audio: return String(localized: "story.timeline.a11y.clip.audio", bundle: .module)
        case .image: return String(localized: "story.timeline.a11y.clip.image", bundle: .module)
        case .text:  return String(localized: "story.timeline.a11y.clip.text",  bundle: .module)
        case .sticker:
            return String(localized: "story.timeline.a11y.clip.sticker",
                          defaultValue: "Clip autocollant", bundle: .module)
        case .place:
            return String(localized: "story.timeline.a11y.clip.place",
                          defaultValue: "Pastille de lieu", bundle: .module)
        }
    }

    public var body: some View {
        let sections = Self.visibleSections(kind: clip.kind, isBackground: background)
        VStack(alignment: .leading, spacing: 12) {
            header
            // Un fond couvre toute la slide : sa fenêtre début/durée est
            // ignorée par le moteur. Le dire reste utile même depuis que la
            // fiche ne montre plus de contrôles de timing — c'est la piste,
            // désormais, qui semblerait mentir sans cette phrase.
            if background { backgroundHint }
            if sections.contains(.volume) { volumeSlider }
            if sections.contains(.animation) { animationConfig }
            if sections.contains(.toggles) { togglesRow }
            actionsRow
        }
        .padding(presentation == .popover ? 14 : 18)
        // Surface volontairement en MATÉRIAU, pas en glassEffect : les
        // contrôles de la rangée d'actions portent le Liquid Glass et le
        // verre ne peut pas échantillonner du verre (artefacts iOS 26).
        // Matériau sous glass = composition canonique Apple.
        .background(
            RoundedRectangle(cornerRadius: presentation == .popover ? 14 : 0)
                .fill(.ultraThinMaterial)
        )
        .frame(maxWidth: presentation == .popover ? 360 : .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Self.accessibilityLabel(for: clip.kind))
        .adaptiveOnChange(of: clip) { _, newClip in
            volume = newClip.volume
            fadeIn = newClip.fadeInDuration
            fadeOut = newClip.fadeOutDuration
            loop = newClip.isLooping
            background = newClip.isBackground
            duckingDisabled = newClip.isDuckingDisabled
            draftName = newClip.name ?? ""
            // Un undo ou une poussée externe laisserait sinon à l'écran un
            // brouillon de saisie périmé, plus à jour que le modèle.
            drafts.removeAll()
        }
        .alert(
            String(localized: "story.timeline.inspector.delete.confirmTitle",
                   defaultValue: "Supprimer ce clip ?", bundle: .module),
            isPresented: Binding(
                get: { deleteConfirmation.isPresented },
                set: { if !$0 { deleteConfirmation.cancel() } }
            )
        ) {
            Button(String(localized: "story.timeline.inspector.delete.confirm",
                          defaultValue: "Supprimer", bundle: .module),
                   role: .destructive) {
                deleteConfirmation.confirm(onDelete: onDelete)
            }
            Button(String(localized: "story.timeline.inspector.delete.cancel",
                          defaultValue: "Annuler", bundle: .module),
                   role: .cancel) {}
        } message: {
            Text(String(localized: "story.timeline.inspector.delete.confirmMessage",
                        defaultValue: "Le clip sera définitivement retiré de la timeline.",
                        bundle: .module))
        }
    }

    // MARK: - Sub-views

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: kindSystemImage)
                .font(.headline)
                .foregroundStyle(MeeshyColors.indigo500)
                .accessibilityHidden(true)
            TextField(
                String(localized: "story.timeline.inspector.name.placeholder",
                       defaultValue: "Nom de la piste", bundle: .module),
                text: $draftName
            )
            .font(.headline)
            .textInputAutocapitalization(.words)
            .submitLabel(.done)
            .onSubmit { onNameChanged(draftName) }
            .lineLimit(1)
            Spacer(minLength: 0)
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .contentShape(Rectangle().inset(by: -8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.inspector.close",
                                       defaultValue: "Fermer", bundle: .module))
        }
    }

    /// Barre de trim tactile — l'affordance PRINCIPALE de début/durée
    /// (capture user 2026-07-20 : steppers « 0:0… » tronqués, « définir
    /// début/durée du bout du doigt »). Les steppers fins ±0,1 s restent
    /// derrière le bouton (i) pour l'ajustement de précision.
    /// Barre de trim tactile — l'affordance PRINCIPALE de début/durée
    /// (capture user 2026-07-20 : « définir début/durée du bout du doigt ») —
    /// SUIVIE des trois valeurs liées, saisissables au clavier.
    ///
    /// Ces trois champs vivaient derrière le bouton ⓘ, en lecture avec des
    /// steppers ±0,1 s pour seule édition : poser un début à 3,5 s demandait
    /// 35 pressions. Ils sont désormais visibles d'emblée et tapables.
    private var timingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            ClipTimingBar(
                start: clip.startTime,
                duration: clip.duration,
                slideDuration: slideDuration,
                onMoveCommitted: onStartAdjusted,
                onTrimStartCommitted: onStartTrimmed,
                onTrimEndCommitted: onEndAdjusted
            )
            HStack(alignment: .top, spacing: 8) {
                numericField(key: "start",
                             title: String(localized: "story.timeline.inspector.start",
                                           defaultValue: "Début", bundle: .module),
                             value: String(format: "%.1f", clip.startTime),
                             unit: "s",
                             onStep: onStartAdjusted,
                             onCommit: { if let v = Self.parseSeconds($0) { onStartSet(v) } })
                numericField(key: "end",
                             title: String(localized: "story.timeline.inspector.end",
                                           defaultValue: "Fin", bundle: .module),
                             value: String(format: "%.1f", clip.startTime + clip.duration),
                             unit: "s",
                             onStep: onEndAdjusted,
                             onCommit: { if let v = Self.parseSeconds($0) { onEndSet(v) } })
                numericField(key: "duration",
                             title: String(localized: "story.timeline.inspector.duration",
                                           defaultValue: "Durée", bundle: .module),
                             value: String(format: "%.1f", clip.duration),
                             unit: "s",
                             onStep: onDurationAdjusted,
                             onCommit: { if let v = Self.parseSeconds($0) { onDurationSet(v) } })
            }
        }
    }

    /// Hint affiché à la place du timing pour un clip de FOND.
    private var backgroundHint: some View {
        Text(String(localized: "story.timeline.inspector.background.hint",
                    defaultValue: "Le fond couvre toute la slide — début/durée ignorés. Désactivez « Fond » pour caler ce média sur la timeline.",
                    bundle: .module))
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Place de la piste dans le PLAN. La fiche restituait le temps et jamais
    /// l'espace : impossible de lire ou corriger une position au chiffre près,
    /// alors que les modèles portent x/y/échelle/rotation/plan depuis toujours.
    private var transformSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "story.timeline.inspector.transform",
                        defaultValue: "Position dans le plan", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: 8) {
                // x/y sont normalisés 0–1 dans le modèle ; on les présente en
                // POURCENTAGE, plus lisible qu'un « 0,5 » pour dire « au centre ».
                numericField(key: "tx", title: "X",
                             value: String(format: "%.0f", clip.transform.x * 100),
                             unit: "%",
                             onStep: { delta in
                                 onTransformChanged(.x(clip.transform.x + Double(delta) / 10))
                             },
                             onCommit: {
                                 if let v = Self.parseDecimal($0) { onTransformChanged(.x(v / 100)) }
                             })
                numericField(key: "ty", title: "Y",
                             value: String(format: "%.0f", clip.transform.y * 100),
                             unit: "%",
                             onStep: { delta in
                                 onTransformChanged(.y(clip.transform.y + Double(delta) / 10))
                             },
                             onCommit: {
                                 if let v = Self.parseDecimal($0) { onTransformChanged(.y(v / 100)) }
                             })
            }
            HStack(alignment: .top, spacing: 8) {
                numericField(key: "scale",
                             title: String(localized: "story.timeline.inspector.scale",
                                           defaultValue: "Taille", bundle: .module),
                             value: String(format: "%.2f", clip.transform.scale),
                             unit: "×",
                             onStep: { delta in
                                 onTransformChanged(.scale(clip.transform.scale + Double(delta)))
                             },
                             onCommit: {
                                 if let v = Self.parseDecimal($0) { onTransformChanged(.scale(v)) }
                             })
                numericField(key: "rotation",
                             title: String(localized: "story.timeline.inspector.rotation",
                                           defaultValue: "Rotation", bundle: .module),
                             value: String(format: "%.0f", clip.transform.rotation),
                             unit: "°",
                             onStep: { delta in
                                 onTransformChanged(.rotation(clip.transform.rotation + Double(delta) * 50))
                             },
                             onCommit: {
                                 if let v = Self.parseDecimal($0) { onTransformChanged(.rotation(v)) }
                             })
                numericField(key: "zIndex",
                             title: String(localized: "story.timeline.inspector.zIndex",
                                           defaultValue: "Plan", bundle: .module),
                             value: "\(clip.transform.zIndex)",
                             unit: "",
                             onStep: { delta in
                                 onTransformChanged(.zIndex(clip.transform.zIndex + (delta > 0 ? 1 : -1)))
                             },
                             onCommit: {
                                 if let v = Self.parseDecimal($0) { onTransformChanged(.zIndex(Int(v))) }
                             })
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(MeeshyColors.indigo500.opacity(0.08))
        )
    }

    /// Champ numérique : saisissable au clavier ET grignotable par pas.
    /// `key` isole le brouillon de saisie d'un champ à l'autre.
    private func numericField(key: String, title: String, value: String, unit: String,
                              onStep: @escaping (Float) -> Void,
                              onCommit: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack(spacing: 2) {
                TextField("", text: Binding(
                    get: { drafts[key] ?? value },
                    set: { drafts[key] = $0 }
                ))
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.center)
                .font(.system(.footnote, design: .monospaced))
                .monospacedDigit()
                .submitLabel(.done)
                .onSubmit {
                    if let draft = drafts[key] { onCommit(draft) }
                    drafts[key] = nil
                }
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 5)
            .padding(.horizontal, 4)
            .background(RoundedRectangle(cornerRadius: 7)
                .fill(MeeshyColors.indigo500.opacity(0.10)))
            HStack(spacing: 4) {
                stepButton(systemName: "minus.circle.fill") { onStep(-Self.timeStep) }
                Spacer(minLength: 0)
                stepButton(systemName: "plus.circle.fill") { onStep(Self.timeStep) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(value)\(unit)")
    }

    private func stepButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.title3)
                .foregroundStyle(MeeshyColors.indigo400)
                .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
    }

    private var volumeSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(String(localized: "story.timeline.inspector.volume", bundle: .module).uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                // Le chiffre est indispensable depuis que la course va jusqu'à
                // 200 % : la position du curseur seule ne dit plus si l'on est
                // au niveau nominal ou en train de saturer.
                Text(Self.formatGain(volume))
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(volume > 1 ? MeeshyColors.warning : .secondary)
                muteButton
            }
            Slider(value: $volume, in: 0...StoryVolume.maxGain, step: 0.01) { editing in
                if !editing { onVolumeChanged(volume) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(Self.formatGain(volume))
            volumeAutomation
            if Self.supportsDucking(kind: clip.kind,
                                    slideHasBackgroundAudio: clip.slideHasBackgroundAudio) {
                duckingToggle
            }
        }
    }

    /// Mute UN-BOUTON du clip. Il vivait sur la barre de l'ancien conteneur
    /// mono-piste ; le plan 2D dessine ses pistes en un passe `Canvas` et n'a
    /// plus de barre où poser un contrôle — la fiche d'édition le reprend.
    ///
    /// Il ne fait PAS double emploi avec le curseur : couper puis rétablir
    /// rend le niveau QUITTÉ (`toggleClipMute` garde le mémento), là où
    /// glisser à 0 puis remonter oblige à retrouver sa position à la main.
    private var muteButton: some View {
        Button(action: onToggleMute) {
            Image(systemName: volume == 0 ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(volume == 0 ? MeeshyColors.warning : MeeshyColors.indigo400)
                .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(volume == 0
            ? String(localized: "story.timeline.inspector.unmute",
                     defaultValue: "Rétablir le son du clip", bundle: .module)
            : String(localized: "story.timeline.inspector.mute",
                     defaultValue: "Couper le son du clip", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.mute.hint",
                                  defaultValue: "Rétablir rend le niveau quitté, pas le maximum",
                                  bundle: .module))
    }

    /// Atténuation automatique de la piste vidéo tant que l'audio de fond joue.
    ///
    /// Formulé à l'ENDROIT — « Atténuer sous la musique » — alors que le modèle
    /// stocke la négation (`isDuckingDisabled`) : un interrupteur nommé
    /// « désactiver » se lit à l'envers une fois activé.
    private var duckingToggle: some View {
        VStack(alignment: .leading, spacing: 2) {
            Toggle(isOn: Binding(
                get: { !duckingDisabled },
                set: { isOn in
                    duckingDisabled = !isOn
                    onDuckingDisabledChanged(!isOn)
                }
            )) {
                Text(String(localized: "story.timeline.inspector.ducking",
                            defaultValue: "Atténuer sous la musique", bundle: .module))
                    .font(.caption)
            }
            .toggleStyle(.switch)
            .tint(MeeshyColors.indigo500)
            Text(String(format: String(localized: "story.timeline.inspector.ducking.caption",
                                       defaultValue: "Le son de cette vidéo descend à %@ tant que l'audio de fond joue.",
                                       bundle: .module),
                        Self.formatGain(StoryVolume.duckingFactor)))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 6)
    }

    /// Automation du volume : pose d'un point au playhead et liste des points
    /// posés. C'est la SEULE surface d'édition de la courbe — la piste ne fait
    /// que 52 pt et ses gestes servent déjà au déplacement et au rognage.
    private var volumeAutomation: some View {
        let points = Self.sortedVolumePoints(clip.volumeKeyframes)
        return VStack(alignment: .leading, spacing: 6) {
            Button {
                onAddVolumePoint(volume)
            } label: {
                Label(
                    String(format: String(localized: "story.timeline.inspector.volume.addPoint",
                                          defaultValue: "Point de volume à %@",
                                          bundle: .module),
                           Self.formatTime(seconds: playheadTime)),
                    systemImage: "plus.circle"
                )
                .font(.caption.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .tint(MeeshyColors.warning)
            .accessibilityHint(String(localized: "story.timeline.inspector.volume.addPoint.hint",
                                      defaultValue: "Fige le volume courant à la position de lecture",
                                      bundle: .module))

            if points.isEmpty {
                Text(String(localized: "story.timeline.inspector.volume.automation.caption",
                            defaultValue: "Sans point, le volume reste constant sur toute la durée du clip.",
                            bundle: .module))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(points) { point in
                    HStack(spacing: 8) {
                        Text(Self.formatTime(seconds: point.absoluteTime))
                            .font(.system(.caption2, design: .monospaced))
                            .monospacedDigit()
                        Text(Self.formatGain(point.volume))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(MeeshyColors.warning)
                        Spacer(minLength: 0)
                        Button {
                            onRemoveVolumePoint(point.id)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .contentShape(Rectangle().inset(by: -8))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "story.timeline.inspector.volume.removePoint",
                                                   defaultValue: "Retirer ce point de volume",
                                                   bundle: .module))
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .padding(.top, 4)
    }

    /// Durées proposées pour les animations d'entrée/sortie (fondu). `0` = off.
    // `nonisolated`: an immutable Sendable constant that the `nonisolated`
    // `nearestFadePreset(to:)` reads from a non-MainActor context (the struct is
    // a `View`, so members are @MainActor-isolated by default).
    public nonisolated static let fadePresets: [Float] = [0, 0.3, 0.5, 1.0, 2.0]

    /// Rattache une valeur legacy arbitraire (ex. 0.4 s posée au slider
    /// d'avant) au preset le plus proche pour l'état sélectionné des chips.
    public nonisolated static func nearestFadePreset(to value: Float) -> Float {
        fadePresets.min(by: { abs($0 - value) < abs($1 - value) }) ?? 0
    }

    /// Configuration d'animation dépliée par l'icône losange de la rangée
    /// d'actions : apparition/disparition (chips de fondu) + étape
    /// d'animation au playhead avec sa légende. Repliée par défaut — la
    /// modale ne montre plus que l'essentiel (retour user 2026-07-11).
    private var animationConfig: some View {
        VStack(alignment: .leading, spacing: 10) {
            fadeChipRow(
                title: String(localized: "story.timeline.inspector.fadeIn",
                              defaultValue: "Apparition (fondu)", bundle: .module),
                systemImage: "arrow.down.right.circle",
                value: $fadeIn,
                onCommit: { onFadeInChanged(fadeIn) }
            )
            fadeChipRow(
                title: String(localized: "story.timeline.inspector.fadeOut",
                              defaultValue: "Disparition (fondu)", bundle: .module),
                systemImage: "arrow.up.right.circle",
                value: $fadeOut,
                onCommit: { onFadeOutChanged(fadeOut) }
            )
            Button(action: onAddKeyframe) {
                Label(
                    String(localized: "story.timeline.inspector.animate",
                           defaultValue: "Animer au playhead", bundle: .module),
                    systemImage: "diamond.fill"
                )
                .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.indigo500)
            .accessibilityHint(String(localized: "story.timeline.inspector.animate.hint",
                                      defaultValue: "Pose une étape d'animation à la position de lecture",
                                      bundle: .module))
            Text(String(localized: "story.timeline.inspector.animate.caption",
                        defaultValue: "Étape d'animation : fige position, échelle et opacité à cet instant — l'élément glisse d'une étape à l'autre pendant la lecture.",
                        bundle: .module))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(MeeshyColors.indigo500.opacity(0.08))
        )
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
    }

    private func fadeChipRow(title: String, systemImage: String,
                             value: Binding<Float>, onCommit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                ForEach(Self.fadePresets, id: \.self) { preset in
                    let isOn = Self.nearestFadePreset(to: value.wrappedValue) == preset
                    Button {
                        value.wrappedValue = preset
                        onCommit()
                    } label: {
                        Text(preset == 0
                             ? String(localized: "story.timeline.inspector.fade.off",
                                      defaultValue: "off", bundle: .module)
                             : (preset < 1 ? String(format: "%.1f s", preset)
                                           : String(format: "%.0f s", preset)))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(
                                isOn ? MeeshyColors.indigo500 : MeeshyColors.indigo500.opacity(0.14)))
                            .foregroundStyle(isOn ? .white : MeeshyColors.indigo400)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title) \(preset)s")
                    .accessibilityAddTraits(isOn ? [.isSelected] : [])
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var togglesRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 24) {
                if Self.supportsLoop(kind: clip.kind, isBackground: background) {
                    Toggle(isOn: Binding(
                        get: { loop },
                        set: { loop = $0; onLoopToggled($0) }
                    )) {
                        Text(String(localized: "story.timeline.inspector.loop",
                                    defaultValue: "Boucle", bundle: .module))
                    }
                    .toggleStyle(.switch)
                    .tint(MeeshyColors.indigo500)
                }

                if Self.supportsBackgroundToggle(kind: clip.kind) {
                Toggle(isOn: Binding(
                    get: { background },
                    set: { newValue in
                        background = newValue
                        onBackgroundToggled(newValue)
                        // Règle produit : la boucle n'existe QUE pour le fond.
                        // Un clip qui redevient foreground perd sa boucle.
                        if !newValue, loop {
                            loop = false
                            onLoopToggled(false)
                        }
                    }
                )) {
                    Text(String(localized: "story.timeline.inspector.background",
                                defaultValue: "Fond", bundle: .module))
                }
                .toggleStyle(.switch)
                .tint(MeeshyColors.indigo500)
                }
            }
            // Le hint « fond couvre toute la slide » vit désormais dans le
            // panneau (i) — la modale par défaut reste légère.
        }
    }

    /// Deux boutons, deux intentions LISIBLES : « Animation » déplie la
    /// configuration PAR-DESSOUS (il n'anime rien lui-même), « Supprimer »
    /// demande confirmation avant la suppression définitive. Icône + TEXTE
    /// obligatoires — les pastilles icône-seule teintées (losange indigo sur
    /// verre indigo, corbeille rouge sur verre rouge) ne portaient ni leur
    /// sens ni leur contraste (capture user 2026-07-20).
    ///
    /// Composition Liquid Glass (iOS 26 via `Compatibility/AdaptiveGlass`) :
    /// la SURFACE de la modale reste en matériau (le verre ne peut pas
    /// échantillonner du verre), seuls les CONTRÔLES flottants prennent le
    /// glass — groupés dans un `AdaptiveGlassContainer` pour que les formes
    /// adjacentes se fondent correctement. Fallback < 26 : matériau teinté
    /// + liseré, géré par le wrapper.
    /// Trois actions ne tiennent pas toujours sur une ligne — en français
    /// « Animation · Diviser · Supprimer » débordait déjà à 360 pt, et les
    /// langues plus verbeuses (allemand) aggravent le cas. `ViewThatFits`
    /// bascule sur deux rangées plutôt que de laisser les capsules se
    /// chevaucher et les libellés se couper en deux (« Anima-tion »).
    ///
    /// Le premier candidat n'a PAS de `Spacer` : un `Spacer` se comprimant à
    /// l'infini, `ViewThatFits` le jugerait toujours suffisant et ne
    /// basculerait jamais.
    private var actionsRow: some View {
        AdaptiveGlassContainer(spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    if !clip.isFollowingSlide { followSlideButton }
                    if Self.supportsSplit(kind: clip.kind) { splitButton }
                    if Self.supportsDeletion(kind: clip.kind) { deleteButton }
                }
                VStack(alignment: .leading, spacing: 10) {
                    if !clip.isFollowingSlide { followSlideButton }
                    if Self.supportsSplit(kind: clip.kind) { splitButton }
                    if Self.supportsDeletion(kind: clip.kind) { deleteButton }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// « Suivre la slide » (D3, revue totale U9) — n'apparaît que quand une
    /// fenêtre EXPLICITE a été posée (`!clip.isFollowingSlide`) : un fantôme
    /// n'a rien à relâcher, l'afficher pour lui serait un contrôle mort.
    private var followSlideButton: some View {
        Button(action: onFollowSlide) {
            Label(String(localized: "story.timeline.inspector.followSlide",
                         defaultValue: "Suivre la slide", bundle: .module),
                  systemImage: "arrow.uturn.backward.circle")
                .font(.footnote.weight(.semibold))
                .fixedSize(horizontal: true, vertical: false)
                .glassControlForeground()
                .padding(.horizontal, 12)
                .frame(height: 36)
                .adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)
                .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.timeline.inspector.followSlide",
                                   defaultValue: "Suivre la slide", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.followSlide.hint",
                                  defaultValue: "Remet la fenêtre du clip à zéro : il suit de nouveau la durée de la slide",
                                  bundle: .module))
    }

    private var splitButton: some View {
        Button(action: onSplit) {
            Label(String(localized: "story.timeline.inspector.split",
                         defaultValue: "Diviser", bundle: .module),
                  systemImage: "scissors")
                .font(.footnote.weight(.semibold))
                .fixedSize(horizontal: true, vertical: false)
                .glassControlForeground()
                .padding(.horizontal, 12)
                .frame(height: 36)
                .adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)
                .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.timeline.inspector.split",
                                   defaultValue: "Diviser", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.split.hint",
                                  defaultValue: "Coupe le clip à la position de lecture",
                                  bundle: .module))
    }

    private var deleteButton: some View {
        Button {
            deleteConfirmation.request()
        } label: {
            Label(String(localized: "story.timeline.clip.delete", bundle: .module),
                  systemImage: "trash")
                .font(.footnote.weight(.semibold))
                .fixedSize(horizontal: true, vertical: false)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .frame(height: 36)
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.error)
                .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.timeline.clip.delete", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.delete.hint",
                                  defaultValue: "Demande une confirmation avant la suppression",
                                  bundle: .module))
    }

    private var kindSystemImage: String {
        switch clip.kind {
        case .video: return "film"
        case .audio: return "waveform"
        case .text:  return "textformat"
        case .image: return "photo"
        case .sticker: return "face.smiling"
        case .place:   return "mappin.circle.fill"
        }
    }
}
