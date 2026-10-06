import CoreGraphics
import CoreImage
import Foundation

/// **Une source de trames pour le peintre** (#9349) : la caméra, la photo figée
/// ou la vidéo en boucle (#9352). Elle PRÉVIENT à chaque trame neuve : la vue
/// Metal ne dessine qu'alors, jamais sur une horloge libre.
protocol ComposerFrameSourcing: AnyObject, Sendable {
    nonisolated func latestImage() -> CIImage?
    nonisolated var declaredSpace: CGColorSpace? { get }
    /// Le gestionnaire reçoit l'instant de PRÉSENTATION de la trame (son PTS),
    /// pas l'heure où il s'exécute : la cadence se décide sur l'horloge de
    /// l'objectif, jamais sur la gigue du fil qui la relaie.
    nonisolated func setFrameHandler(_ handler: (@Sendable (_ presentedAt: TimeInterval) -> Void)?,
                                     for owner: ObjectIdentifier)
}

/// **La cadence permise, sur une échéance glissante** (#9349).
///
/// Mesurer l'écart depuis le DERNIER dessin quantifie la cadence sur celle de
/// l'objectif : à 30 i/s offerts, 24 permis ne laissaient passer qu'une trame
/// sur deux (15 i/s), et une gigue de quelques ms jetait une image au palier
/// nominal. L'échéance, elle, avance d'une période par dessin : une trame
/// passe dès qu'elle tombe dans la fenêtre de la prochaine échéance, et le
/// compte sur une seconde est celui du budget.
nonisolated struct ComposerFramePacer: Equatable, Sendable {
    let fps: Int
    /// La prochaine échéance ; `nil` avant la première trame.
    private(set) var deadline: TimeInterval?

    /// La part de période qu'une trame peut avoir d'avance sur l'échéance.
    /// Sous la demi-période : un objectif deux fois plus rapide que le budget
    /// ne fait jamais passer deux trames de suite.
    static let tolerance = 0.45

    init(fps: Int) {
        self.fps = fps
    }

    mutating func admit(presentedAt time: TimeInterval) -> Bool {
        guard fps > 0 else { return false }
        let period = 1 / Double(fps)
        guard let due = deadline, time - due <= period, due - time <= 2 * period else {
            deadline = time + period
            return true
        }
        guard time >= due - Self.tolerance * period else { return false }
        deadline = due + period
        return true
    }
}

/// **La cadence, décidée sur la file de l'objectif** (#9349) : une trame jetée
/// ne coûte aucun saut vers le fil principal. Le palier peut changer depuis le
/// fil principal pendant que les trames arrivent : l'échéance vit sous verrou,
/// et ne repart de zéro que si la cadence change.
nonisolated final class ComposerFrameGate: @unchecked Sendable {
    private let lock = NSLock()
    private var pacer: ComposerFramePacer

    init(fps: Int) {
        pacer = ComposerFramePacer(fps: fps)
    }

    var fps: Int {
        lock.lock()
        defer { lock.unlock() }
        return pacer.fps
    }

    func setFPS(_ fps: Int) {
        lock.lock()
        defer { lock.unlock() }
        guard fps != pacer.fps else { return }
        pacer = ComposerFramePacer(fps: fps)
    }

    func admit(presentedAt time: TimeInterval) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return pacer.admit(presentedAt: time)
    }
}

/// **Une image par trame, jamais deux** (spec § 5) : sans effet, la couche
/// système seule ; avec effet, la vue Metal seule.
nonisolated enum ComposerCaptureSurfaceRule {
    static func paintsWithMetal(look: ComposerPhotoLook, budget: ComposerThermalBudget, fixture: Bool) -> Bool {
        guard !budget.systemLayerOnly else { return false }
        return fixture || ComposerLiveLookRule.rendersLive(look)
    }

    /// La couche système reste visible tant que la vue Metal n'a rien
    /// présenté : la bascule vers un effet ne montre jamais une image noire.
    static func mirrorsSystemLayer(paintsWithMetal: Bool, metalHasFrame: Bool) -> Bool {
        !paintsWithMetal || !metalHasFrame
    }

    /// Au palier critique, un effet choisi ne se montre plus : l'écran le dit.
    static func showsThermalNotice(look: ComposerPhotoLook, budget: ComposerThermalBudget) -> Bool {
        budget.systemLayerOnly && ComposerLiveLookRule.rendersLive(look)
    }
}

/// Les mots de la capture unifiée.
enum ComposerCaptureCopy {
    static var thermalNotice: String {
        String(localized: "composer.capture.thermal.notice",
               defaultValue: "Aperçu simplifié : l'appareil chauffe. La prise garde tout l'effet.", bundle: .main)
    }

    /// La vidéo se rend avec son look : le `✓` attend, et le dit.
    static var rendering: String {
        String(localized: "composer.capture.looks.rendering", defaultValue: "Application du filtre…", bundle: .main)
    }
}
