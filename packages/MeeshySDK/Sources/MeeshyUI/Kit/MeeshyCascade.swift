import SwiftUI

/// Comment un bloc entre dans la cascade de sa face : il monte (rangs 0 à 3), il
/// se fond sans bouger (au-delà du rang 3 : l'œil ne suit jamais cinq choses à
/// la fois), il fond court sous « Réduire les animations », ou il est là tout de
/// suite (inséré hors de la fenêtre d'arrivée de la face).
public nonisolated enum MeeshyCascadeEntrance: Sendable, Equatable {
    case rise
    case fade
    case reduced
    case immediate
}

/// **K26 — mouvement 08 « Entrées en cascade »** (#19625, planche `Sys-Mouvement`
/// § 08) : à l'ARRIVÉE sur une face, ses blocs montent l'un après l'autre. Le pas
/// d'un bloc se lit dans la table : 80 ms par rang, rang borné à 3, ressort `rise` ;
/// le bloc part 18 pt plus bas, transparent, à l'échelle 0,97. Un rang au-delà de 3
/// se fond sans bouger. Un bloc inséré hors de la fenêtre d'arrivée (bascule
/// d'édition, donnée revenue du réseau) est là tout de suite. Sous « Réduire les
/// animations », ni retard ni déplacement : le fondu court de la table.
public nonisolated struct MeeshyCascadeStep: Sendable, Equatable {
    /// La hauteur d'où un bloc monte, en points.
    public static let riseLift: Double = 18
    /// L'échelle d'où un bloc grandit.
    public static let riseStartScale: Double = 0.97

    /// La fenêtre d'arrivée d'une face : le retard du rang le plus loin, plus son
    /// ressort — sous le plafond de 600 ms.
    public static var arrivalWindowMilliseconds: Int {
        MeeshyMotionRecipe.cascadeMaxRank * MeeshyMotionRecipe.cascadeStepMilliseconds
            + MeeshyMotionRecipe.resolve(token: .rise).durationMilliseconds
    }

    public let delayMilliseconds: Int
    public let lift: Double
    public let startScale: Double
    public let entrance: MeeshyCascadeEntrance

    public var delay: Double { Double(delayMilliseconds) / 1000 }
    public var isReduced: Bool { entrance == .reduced }
    public var isImmediate: Bool { entrance == .immediate }

    /// L'animation qui amène le bloc au repos : le ressort `rise` retardé de son
    /// rang, le fondu court (retardé au-delà du rang 3, sans retard sous
    /// réduction), aucune pour un bloc déjà là.
    public var animation: Animation? {
        switch entrance {
        case .immediate: return nil
        case .reduced: return MeeshyMotion.animation(.rise, reduce: true)
        case .fade: return MeeshyMotion.animation(.rise, reduce: true)?.delay(delay)
        case .rise: return MeeshyMotion.animation(.rise, reduce: false)?.delay(delay)
        }
    }

    /// Le pas d'un bloc présent à l'arrivée de sa face.
    public static func resolve(rank: Int, reduce: Bool) -> MeeshyCascadeStep {
        resolve(rank: rank, reduce: reduce, elapsedSinceArrival: 0)
    }

    /// Le pas d'un bloc inséré `elapsedSinceArrival` ms après l'arrivée de sa
    /// face : `nil` (aucune face arrivée) ou au-delà de la fenêtre ⇒ immédiat.
    /// Dans la fenêtre, le retard de son rang se compte depuis l'arrivée.
    public static func resolve(rank: Int, reduce: Bool, elapsedSinceArrival: Int?) -> MeeshyCascadeStep {
        guard isWithinArrivalWindow(elapsedMilliseconds: elapsedSinceArrival), let elapsed = elapsedSinceArrival else {
            return MeeshyCascadeStep(delayMilliseconds: 0, lift: 0, startScale: 1, entrance: .immediate)
        }
        guard !reduce else {
            return MeeshyCascadeStep(delayMilliseconds: 0, lift: 0, startScale: 1, entrance: .reduced)
        }
        let delay = max(0, MeeshyMotion.delayMilliseconds(index: rank) - max(elapsed, 0))
        guard rank <= MeeshyMotionRecipe.cascadeMaxRank else {
            return MeeshyCascadeStep(delayMilliseconds: delay, lift: 0, startScale: 1, entrance: .fade)
        }
        return MeeshyCascadeStep(delayMilliseconds: delay, lift: riseLift, startScale: riseStartScale, entrance: .rise)
    }

    /// Un bloc inséré tant que la fenêtre d'arrivée de sa face est ouverte.
    public static func isWithinArrivalWindow(elapsedMilliseconds: Int?) -> Bool {
        guard let elapsedMilliseconds else { return false }
        return elapsedMilliseconds <= arrivalWindowMilliseconds
    }

    /// Les millisecondes écoulées entre l'arrivée de la face et l'apparition du
    /// bloc ; `nil` sans face arrivée.
    public static func elapsedMilliseconds(appearedAt: Date, faceOrigin: Date?) -> Int? {
        guard let faceOrigin else { return nil }
        return Int((appearedAt.timeIntervalSince(faceOrigin) * 1000).rounded())
    }

    /// La règle de la fenêtre : un bloc monte s'il apparaît pendant l'arrivée de
    /// sa face, jamais après.
    public static func shouldRise(appearedAt: Date, faceOrigin: Date?) -> Bool {
        isWithinArrivalWindow(elapsedMilliseconds: elapsedMilliseconds(appearedAt: appearedAt, faceOrigin: faceOrigin))
    }
}

private struct MeeshyCascadeArrivalKey: EnvironmentKey {
    static let defaultValue: Date? = nil
}

public extension EnvironmentValues {
    /// L'instant où la face qui porte ces blocs est arrivée ; `nil` hors d'une
    /// face (`meeshyCascadeFace()`) ou quand elle a disparu.
    var meeshyCascadeArrival: Date? {
        get { self[MeeshyCascadeArrivalKey.self] }
        set { self[MeeshyCascadeArrivalKey.self] = newValue }
    }
}

public extension View {

    /// Monte ce bloc à son rang dans la cascade de la face qui s'ouvre : une fois,
    /// et seulement s'il est là pendant l'arrivée de la face (`meeshyCascadeFace()`).
    func meeshyCascade(rank: Int) -> some View {
        modifier(MeeshyCascadeModifier(rank: rank))
    }

    /// Fait de cette vue une FACE : l'instant de son arrivée borne la cascade de
    /// ses blocs. À poser sur UN conteneur (une pile), jamais sur une suite de vues.
    func meeshyCascadeFace() -> some View {
        modifier(MeeshyCascadeFaceModifier())
    }
}

private struct MeeshyCascadeFaceModifier: ViewModifier {
    @State private var arrival: Date? = Date()

    func body(content: Content) -> some View {
        content
            .environment(\.meeshyCascadeArrival, arrival)
            .onAppear { arrival = Date() }
            .onDisappear { arrival = nil }
    }
}

private struct MeeshyCascadeModifier: ViewModifier {
    let rank: Int

    @State private var insertedAt = Date()
    @State private var hasRisen = false

    @Environment(\.meeshyCascadeArrival) private var arrival
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    func body(content: Content) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let elapsed = MeeshyCascadeStep.elapsedMilliseconds(appearedAt: insertedAt, faceOrigin: arrival)
        let step = MeeshyCascadeStep.resolve(rank: rank, reduce: reduce, elapsedSinceArrival: elapsed)
        let atRest = hasRisen || step.isImmediate
        return content
            .opacity(atRest ? 1 : 0)
            .scaleEffect(atRest ? 1 : step.startScale)
            .offset(y: atRest ? 0 : step.lift)
            .onAppear {
                guard !hasRisen else { return }
                guard !step.isImmediate else {
                    hasRisen = true
                    return
                }
                meeshyWithAnimation(step.animation, reduced: step.animation, reduceMotion: reduce) {
                    hasRisen = true
                }
            }
    }
}
