import Foundation
import CoreGraphics

/// Un contrôle de la rangée haute du viseur.
nonisolated enum ComposerCaptureTopItem: Equatable, Hashable, Sendable {
    /// « Quitter » : quitte le viseur, ou abandonne la retouche.
    case close
    /// La puce du chrono et de l'indicateur de segment, à gauche de la barre des segments.
    case chrono
    /// `[ ]` : carte ↔ plein écran — en retouche ; au viseur, il vit dans ⋯.
    case size
    /// `⋯` : le menu du viseur — la grille, et la taille quand elle s'offre (OPUS-6).
    case more
    /// Retirer le dernier segment.
    case dropSegment
    /// « ✓ Valider » : poser les segments, ou rendre la scène.
    case validate
    case flash
    /// Le retardateur : un toucher passe de désactivé à 3 s, à 10 s, puis désactivé.
    case selfTimer
    /// Changer d'objectif.
    case flip
    /// ⬇︎ : la prise retouchée rejoint Photos.
    case save
    /// « Terminé ».
    case done
}

/// **La rangée haute du viseur — sa disposition, décidée ici et nulle part
/// ailleurs** (vue A8, #17109, qui remplace la disposition du #9753).
///
/// La caméra est un mode plein écran (loi 9) : son en-tête est « Quitter » à
/// gauche et « ✓ Valider » à droite, dans tous les états où l'on vise — prise
/// faite ou non. Les réglages de l'objectif vivent dans UNE capsule de verre
/// centrée sous l'en-tête : Flash · Retardateur · Objectif · ⋯.
///
/// Des segments en attente ajoutent « retirer le dernier » à gauche de
/// Valider ; le chrono vit à gauche de la barre des segments (#17469).
///
/// **En filmant, plus d'en-tête ni de capsule** (A9, révoque #8653) : seuls
/// le chrono et sa barre restent, et la prise se clôt au déclencheur rouge.
nonisolated enum ComposerCaptureTopRow {

    /// L'écart entre deux contrôles de la rangée.
    static let spacing: CGFloat = 4

    nonisolated struct Input: Equatable, Sendable {
        var stage: ComposerSceneCameraStage
        var editing = false
        var pendingSegments = 0
        var offersSizeToggle = true
        var offersSave = false
    }

    /// L'en-tête « Quitter · ✓ Valider » est-il montré ? Partout, sauf en filmant.
    static func showsHeader(_ input: Input) -> Bool {
        input.editing || input.stage != .recording
    }

    /// Ce qui ouvre la rangée, à gauche.
    static func leading(_ input: Input) -> [ComposerCaptureTopItem] {
        showsHeader(input) ? [.close] : []
    }

    /// Ce qui la ferme, de gauche à droite — le dernier touche le bord.
    static func trailing(_ input: Input) -> [ComposerCaptureTopItem] {
        if input.editing {
            return (input.offersSizeToggle ? [.size] : []) + (input.offersSave ? [.save] : []) + [.done]
        }
        guard showsHeader(input) else { return [] }
        return input.pendingSegments > 0 ? [.dropSegment, .validate] : [.validate]
    }

    /// La capsule centrée des réglages de l'objectif, de gauche à droite.
    static func capsule(_ input: Input) -> [ComposerCaptureTopItem] {
        guard !input.editing, input.stage != .recording else { return [] }
        return [.flash, .selfTimer, .flip, .more]
    }

    /// La puce paraît dès qu'une vidéo se prend : en filmant, ou
    /// segments en attente. Jamais en retouche.
    static func showsChrono(_ input: Input) -> Bool {
        !input.editing && (input.stage == .recording || input.pendingSegments > 0)
    }

    /// **L'indicateur de segment compte celui qui s'écrit** : le premier
    /// enregistrement est le segment 1, pas le segment 0.
    static func segmentCount(pending: Int, recording: Bool) -> Int {
        max(0, pending) + (recording ? 1 : 0)
    }

    /// **L'indicateur se LIT d'un coup d'œil : « 3 »** (#10310, #17469). Le
    /// chiffre seul, ni mot ni trait : la puce tient à côté du chrono sur un
    /// iPhone étroit. Le mot reste à VoiceOver, au pluriel de la langue
    /// (`ComposerSceneCameraCopy.segmentCount`).
    static func segmentBadge(_ count: Int, locale: Locale = .current) -> String {
        LocalizedNumber.exact(max(0, count), locale: locale)
    }
}

/// Une entrée du menu `⋯` du viseur.
nonisolated enum ComposerCaptureMoreItem: Equatable, Hashable, Sendable {
    case grid
    case size
}

/// **Ce que le menu `⋯` du viseur propose** (OPUS-6) : la grille toujours ; la
/// taille seulement quand elle s'offre (le selfie éclairé par l'écran, #9566).
/// Le retardateur a quitté le menu pour la capsule (A8, #17109).
nonisolated enum ComposerCaptureMoreMenu {
    static func items(offersSizeToggle: Bool) -> [ComposerCaptureMoreItem] {
        [.grid] + (offersSizeToggle ? [.size] : [])
    }
}

/// **Le retardateur du viseur** (CAM-4, décision porteur, OPUS-8) : réglé d'un
/// toucher dans la capsule (A8), gardé d'une ouverture à l'autre, il diffère la
/// PHOTO — jamais la vidéo, qu'un doigt tient. Une valeur inconnue vaut « désactivé ».
nonisolated enum ComposerCaptureSelfTimerDelay: Int, CaseIterable, Hashable, Sendable {
    case off = 0
    case three = 3
    case ten = 10

    static let storageKey = "composer.camera.selfTimer"

    init(stored: Int) {
        self = Self(rawValue: stored) ?? .off
    }

    /// Le réglage qu'un toucher sur le bouton pose : désactivé → 3 s → 10 s → désactivé.
    var next: ComposerCaptureSelfTimerDelay {
        switch self {
        case .off: return .three
        case .three: return .ten
        case .ten: return .off
        }
    }

    /// Les secondes montrées, de la première à la dernière.
    var ticks: [Int] {
        Array(stride(from: rawValue, to: 0, by: -1))
    }
}

/// **La grille des tiers du viseur** (CAM-2, décision porteur, OPUS-6) :
/// désactivée par défaut, gardée d'une ouverture à l'autre, peinte au viseur
/// et jamais dans la prise — ni en retouche, où l'on ne cadre plus.
nonisolated enum ComposerCaptureGrid {
    static let storageKey = "composer.camera.grid"

    nonisolated struct Lines: Equatable, Sendable {
        let vertical: [CGFloat]
        let horizontal: [CGFloat]
    }

    /// Les deux lignes de chaque axe, aux tiers de la zone donnée.
    static func lines(in zone: CGRect) -> Lines {
        guard zone.width > 0, zone.height > 0 else { return Lines(vertical: [], horizontal: []) }
        let tiers: [CGFloat] = [1.0 / 3.0, 2.0 / 3.0]
        return Lines(vertical: tiers.map { zone.minX + zone.width * $0 },
                     horizontal: tiers.map { zone.minY + zone.height * $0 })
    }

    static func shows(enabled: Bool, editing: Bool) -> Bool {
        enabled && !editing
    }
}

/// **(x) ne jette jamais une prise en silence** (#9753, porteur 2026-10-09 :
/// « toucher (x) pendant un enregistrement demande CONFIRMATION avant de perdre
/// l'enregistrement ») — ni celle qui tourne, ni des segments qui attendent
/// leur ✓ (#9351), ni la prise qu'on retouche (#9781 : une vidéo de 32 s jetée
/// sans un mot à la recette #9755). Une prise en retouche n'est pas encore
/// envoyée ; seule la flèche ⬇︎ l'a pu mettre à l'abri, dans Photos. Hors de ces
/// cas, (x) garde son comportement : il ferme, ou quitte la retouche.
nonisolated enum ComposerCaptureDiscardRule {
    static func asksBeforeClosing(stage: ComposerSceneCameraStage, editing: Bool,
                                  segments: [ComposerCaptureSegment], takeSave: ComposerTakeSaveState) -> Bool {
        // Photo comme vidéo, enregistrée ou non (porteur 2026-10-12, #10342) :
        // la retouche en cours — effet, cadre, recadrage — se perdrait.
        guard !editing else { return true }
        return stage == .recording || ComposerCaptureSegments.asksBeforeClosing(segments)
    }
}

/// **La question « Abandonner ? », portée par la SESSION** (recette iPhone
/// 2026-10-20 : « Abandonner » touché, la photo restait en retouche). Tenue
/// par des états de la vue, la question se perdait avec elle ; ici elle
/// survit à une vue recréée pendant l'alerte, et ce qu'elle abandonne est
/// fixé quand on la pose. SwiftUI peut refermer l'alerte AVANT d'appeler son
/// action : `dismiss()` ferme sans oublier la demande, que seule une
/// réponse consomme.
nonisolated struct ComposerCaptureDiscardPrompt: Equatable, Sendable {
    struct Request: Equatable, Sendable {
        /// La prise en retouche, sinon le viseur (#9781).
        let take: Bool
        let photo: Bool
    }

    private(set) var request: Request?
    private(set) var isPresented = false
    private(set) var closedAt: Date?

    mutating func ask(take: Bool, photo: Bool) {
        request = Request(take: take, photo: photo)
        isPresented = true
    }

    mutating func dismiss(now: Date = Date()) {
        guard isPresented else { return }
        isPresented = false
        closedAt = now
    }

    /// La réponse : la demande, consommée.
    mutating func answer(now: Date = Date()) -> Request? {
        dismiss(now: now)
        defer { request = nil }
        return request
    }

    /// Le toucher qui ferme l'alerte n'est pas un toucher sur la prise.
    func swallowsTap(now: Date) -> Bool {
        ComposerCaptureTapRule.belongsToAnAlert(presented: isPresented, closedAt: closedAt, now: now)
    }
}

/// **Les deux réponses à « Abandonner ? »** : la retouche revient viser ; une
/// question posée au viseur le range — `true`, l'hôte le ferme.
@MainActor
enum ComposerCaptureDiscardFlow {
    static func confirm(_ session: ComposerCaptureSession) -> Bool {
        guard let demande = session.discardPrompt.answer() else { return false }
        guard demande.take else { return true }
        if session.phase.isEditing { session.cancelEditing() }
        return false
    }

    static func keep(_ session: ComposerCaptureSession) {
        _ = session.discardPrompt.answer()
    }
}

/// **Le curseur du flash s'efface après 2 s sans interaction** (#9753, porteur
/// 2026-10-09). Toute interaction — allumer le flash, glisser le curseur, le
/// régler à la voix — le fait paraître et réarme la minuterie ; un doigt posé
/// dessus le retient. Seule l'échéance de la DERNIÈRE interaction l'efface : une
/// échéance plus ancienne est périmée. VoiceOver le garde affiché : un élément
/// qui s'efface sous le curseur d'accessibilité n'est plus atteignable.
nonisolated struct ComposerFlashSliderTimer: Equatable, Sendable {
    static let lifetime: TimeInterval = 2

    private(set) var generation = 0
    private(set) var visible = false
    private(set) var held = false

    /// Une interaction : le curseur paraît, la minuterie repart.
    mutating func touch() {
        visible = true
        generation += 1
    }

    /// Le doigt se pose ou se lève sur le curseur.
    mutating func hold(_ tenu: Bool) {
        held = tenu
        touch()
    }

    /// Le flash s'éteint : plus d'intensité à régler.
    mutating func hide() {
        visible = false
        held = false
        generation += 1
    }

    /// L'échéance de l'interaction `generation` est atteinte.
    mutating func expire(_ generation: Int, voiceOver: Bool) {
        guard generation == self.generation, !held, !voiceOver else { return }
        visible = false
    }
}
