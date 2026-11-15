import SwiftUI

/// Les mots que la piste de coupe ne choisit pas : l'hôte les passe, déjà
/// traduits. Le nom du groupe, des trois éléments réglables et l'indication des poignées.
public nonisolated struct MeeshyTrimTrackNames: Sendable, Equatable {
    public let track: String
    public let start: String
    public let end: String
    public let playhead: String
    public let precisionHint: String

    public init(track: String, start: String, end: String, playhead: String, precisionHint: String) {
        self.track = track
        self.start = start
        self.end = end
        self.playhead = playhead
        self.precisionHint = precisionHint
    }
}

/// La partie de la piste qu'un geste ou une commande tient.
public nonisolated enum MeeshyTrimTrackPart: String, Sendable, Equatable, CaseIterable {
    case start
    case end
    case playhead
}

/// Le style d'un temps que l'hôte formate : l'horloge du relevé, le millième de
/// la précision, la phrase du lecteur d'écran.
public nonisolated enum MeeshyTrimTrackTimeStyle: String, Sendable, Equatable, CaseIterable {
    case clock
    case precise
    case spoken
}

/// Ce que la plage désigne : ce qu'on garde (l'extérieur est voilé), ou ce qu'on
/// retire (l'intérieur est voilé, les poignées prennent la couleur d'erreur).
public nonisolated enum MeeshyTrimTrackSelection: String, Sendable, Equatable, CaseIterable {
    case kept
    case removed
}

/// La hauteur de la piste : l'onde seule, ou des vignettes avec l'onde dessous.
public nonisolated enum MeeshyTrimTrackHeight: String, Sendable, Equatable, CaseIterable {
    case regular
    case tall
}

/// Le réglage à la milliseconde : une loupe par appui long, ou rien.
public nonisolated enum MeeshyTrimTrackPrecision: String, Sendable, Equatable, CaseIterable {
    case loupe
    case none
}

public nonisolated enum MeeshyTrimTrackHaptic: String, Sendable, Equatable, CaseIterable {
    case standard
    case none
}

/// Où une poignée s'est arrêtée : au plancher (durée minimale), au plafond
/// (durée maximale) ou au bord de la source.
public nonisolated enum MeeshyTrimTrackStop: String, Sendable, Equatable, CaseIterable {
    case floor
    case ceiling
    case edge
}

/// Le retour tactile que la piste demande : `light` à la pose de la tête et à
/// l'arrivée en butée, `medium` à l'entrée en précision.
public nonisolated enum MeeshyTrimTrackHapticKind: String, Sendable, Equatable, CaseIterable {
    case light
    case medium
}

/// Une commande au clavier : les flèches valent `step`, avec Maj 0,01 s ; Page
/// préc. / suiv. une seconde ; Début / Fin les butées. Le temps ne se met pas en miroir.
public nonisolated enum MeeshyTrimTrackCommand: String, Sendable, Equatable, CaseIterable {
    case arrowLeft
    case arrowRight
    case fineLeft
    case fineRight
    case pageDown
    case pageUp
    case home
    case end
}

/// Ce qu'un geste ou une commande demande, dans l'ordre : dire à l'hôte qu'on
/// édite, poser la plage, poser la tête, jouer le tic.
public nonisolated enum MeeshyTrimTrackEffect: Sendable, Equatable {
    case editing(MeeshyTrimTrackPart, Bool)
    case range(ClosedRange<Double>)
    case seek(Double)
    case haptic(MeeshyTrimTrackHapticKind)
}

/// La plage et la tête ensemble : le résultat d'un ajustement.
public nonisolated struct MeeshyTrimTrackPosition: Sendable, Equatable {
    public let range: ClosedRange<Double>
    public let playhead: Double

    public init(range: ClosedRange<Double>, playhead: Double) {
        self.range = range
        self.playhead = playhead
    }
}
