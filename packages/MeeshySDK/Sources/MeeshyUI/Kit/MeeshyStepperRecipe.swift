import SwiftUI

/// Les trois formes : des boutons qui comptent, une piste de crans, des jalons en lecture.
public nonisolated enum MeeshyStepperKind: String, Sendable, Equatable, CaseIterable {
    case buttons
    case track
    case milestones
}

/// Deux tailles de disque : 44 ou 36. La cible reste toujours de 44.
public nonisolated enum MeeshyStepperSize: String, Sendable, Equatable, CaseIterable {
    case regular
    case compact
}

/// Un arrêt de la piste ou un jalon : des mots déjà traduits, un glyphe du jeu, une taille.
public nonisolated struct MeeshyStepperStop: Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let caption: String?
    public let systemImage: String?
    public let markSize: Double?

    public init(id: String, title: String, caption: String? = nil, systemImage: String? = nil, markSize: Double? = nil) {
        self.id = id
        self.title = title
        self.caption = caption
        self.systemImage = systemImage
        self.markSize = markSize
    }
}

/// L'état d'un jalon par rapport à l'étape courante.
public nonisolated enum MeeshyStepperMilestoneState: String, Sendable, Equatable {
    case done
    case current
    case todo

    public static func state(index: Int, current: Int) -> MeeshyStepperMilestoneState {
        index < current ? .done : (index == current ? .current : .todo)
    }
}

/// **La loi du pas** : un entier avance d'un pas à la fois entre deux bornes, et dit
/// s'il a heurté la butée (pour que l'hôte la fasse sentir).
public nonisolated enum MeeshyStepperRule {

    public struct Step: Sendable, Equatable {
        public let value: Int
        public let hitBound: Bool
    }

    /// Un palier de l'échelle de pas : à partir de `from`, le pas vaut `step`.
    public struct Rung: Sendable, Equatable {
        public let from: Int
        public let step: Int

        public init(from: Int, step: Int) {
            self.from = from
            self.step = step
        }
    }

    public static func next(value: Int, delta: Int, range: ClosedRange<Int>, step: Int) -> Step {
        let start = min(max(value, range.lowerBound), range.upperBound)
        let candidate = start + delta * max(step, 1)
        let clamped = min(max(candidate, range.lowerBound), range.upperBound)
        return Step(value: clamped, hitBound: delta != 0 && clamped != candidate)
    }

    /// Le pas grandit avec la valeur : le dernier palier atteint gagne.
    public static func step(forValue value: Int, base: Int, ladder: [Rung]) -> Int {
        let reached = ladder.filter { $0.from <= value }.max { $0.from < $1.from }
        return max(reached?.step ?? base, 1)
    }
}

/// **La recette de K53 en VALEURS** : mesures de chaque forme, atténuation aux butées,
/// remplissage, appui long. Aucune couleur : la teinte est celle de l'hôte.
public nonisolated struct MeeshyStepperRecipe: Sendable, Equatable {

    public static let holdFloorMilliseconds = 60
    public static let holdFirstMilliseconds = 400
    static let markMinimum: Double = 10
    static let markMaximum: Double = 56
    static let dimmedOpacity: Double = 0.36

    public let isRendered: Bool
    public let capsuleHeight: Double
    public let capsuleInset: Double
    public let capsuleGap: Double
    public let discDiameter: Double
    public let tapTarget: Double
    public let valueSize: Double
    public let valueMinWidth: Double
    public let minusOpacity: Double
    public let plusOpacity: Double
    public let trackHeight: Double
    public let trackRadius: Double
    public let markCellSize: Double
    public let markLabelGap: Double
    public let milestoneTraceHeight: Double
    public let milestoneTraceInset: Double
    public let fillFraction: Double
    public let selectedIndex: Int
    public let acceptsGesture: Bool
    public let fillsFromTrailingEdge: Bool
    public let pressedScale: Double

    public static func resolve(kind: MeeshyStepperKind,
                               size: MeeshyStepperSize,
                               value: Int,
                               range: ClosedRange<Int>,
                               stopCount: Int,
                               isPressed: Bool,
                               isEnabled: Bool,
                               layoutDirection: LayoutDirection,
                               reduceMotion: Bool) -> MeeshyStepperRecipe {
        let rendered = kind == .buttons || (2...5).contains(stopCount)
        let selected = stopCount > 0 ? min(max(value, 0), stopCount - 1) : 0
        let dimmed = dimmedOpacity
        return MeeshyStepperRecipe(
            isRendered: rendered,
            capsuleHeight: 50,
            capsuleInset: 3,
            capsuleGap: 4,
            discDiameter: size == .regular ? 44 : 36,
            tapTarget: 44,
            valueSize: 20,
            valueMinWidth: 34,
            minusOpacity: !isEnabled || value <= range.lowerBound ? dimmed : 1,
            plusOpacity: !isEnabled || value >= range.upperBound ? dimmed : 1,
            trackHeight: 3,
            trackRadius: 2,
            markCellSize: 60,
            markLabelGap: 10,
            milestoneTraceHeight: 3,
            milestoneTraceInset: 21,
            fillFraction: stopCount > 1 ? Double(selected) / Double(stopCount - 1) : 0,
            selectedIndex: selected,
            acceptsGesture: kind != .milestones && isEnabled && rendered,
            fillsFromTrailingEdge: layoutDirection == .rightToLeft,
            pressedScale: isPressed && !reduceMotion ? 0.94 : 1
        )
    }

    /// Le diamètre d'un repère : donné par l'hôte, borné de 10 à 56 ; absent, le plus petit.
    public static func markDiameter(requested: Double?) -> Double {
        guard let requested, requested.isFinite else { return markMinimum }
        return min(max(requested, markMinimum), markMaximum)
    }

    /// L'attente avant le pas suivant d'un appui long : 400 ms au premier, puis la
    /// cadence accélère jusqu'à un plancher.
    public static func holdDelayMilliseconds(tick: Int) -> Int {
        guard tick > 0 else { return holdFirstMilliseconds }
        return max(holdFloorMilliseconds, 200 - 20 * (tick - 1))
    }
}

/// Les mots dits : la voix annonce la valeur, pas le geste.
public nonisolated enum MeeshyStepperWords {

    /// Le texte de l'hôte (« 50 entrées »), sinon le titre de l'arrêt, sinon le nombre.
    public static func spokenValue(spoken: String?, value: Int, stopTitle: String?, locale: Locale = .current) -> String {
        if let spoken, !spoken.isEmpty { return spoken }
        if let stopTitle, !stopTitle.isEmpty { return stopTitle }
        return MeeshyCircleScaleRecipe.countText(value, locale: locale)
    }

    /// « 2 sur 3 » : le rang de l'arrêt choisi.
    public static func stopPosition(index: Int, of count: Int, bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let position = index + 1
        return String(localized: "kit.stepper.position", defaultValue: "\(position) sur \(count)",
                      bundle: bundle ?? .module, locale: locale)
    }

    public static func milestoneState(_ state: MeeshyStepperMilestoneState,
                                      bundle: Bundle? = nil, locale: Locale = .current) -> String {
        let bundle = bundle ?? .module
        switch state {
        case .done: return String(localized: "kit.stepper.milestone.done", defaultValue: "fait", bundle: bundle, locale: locale)
        case .current: return String(localized: "kit.stepper.milestone.current", defaultValue: "en cours", bundle: bundle, locale: locale)
        case .todo: return String(localized: "kit.stepper.milestone.todo", defaultValue: "à faire", bundle: bundle, locale: locale)
        }
    }
}
