import SwiftUI

/// Ce que le calque peint : les lignes engagées, et les candidates qui ne se
/// confondent avec aucune engagée. Tout est en fractions du calque.
public nonisolated struct MeeshySnapGuidesPlan: Sendable, Equatable {
    public let engaged: MeeshySnapLines
    public let candidates: MeeshySnapLines

    public init(engaged: MeeshySnapLines, candidates: MeeshySnapLines) {
        self.engaged = engaged
        self.candidates = candidates
    }

    public var isEmpty: Bool { engaged.isEmpty && candidates.isEmpty }
}

/// La loi PURE des repères : ce qui se peint, où, et quand le tic se joue.
/// La loi d'aimantation elle-même (les cibles et leur portée) n'est pas ici :
/// le calque reçoit des fractions, il ne les décide pas.
public nonisolated enum MeeshySnapGuidesRule {

    /// Les fractions dessinables : finies, dans 0…1, sans doublon, dans l'ordre reçu.
    public static func drawable(_ fractions: [CGFloat]) -> [CGFloat] {
        fractions.reduce(into: [CGFloat]()) { kept, fraction in
            guard fraction.isFinite, (0...1).contains(fraction), !Self.contains(kept, fraction) else { return }
            kept.append(fraction)
        }
    }

    public static func sanitized(_ lines: MeeshySnapLines) -> MeeshySnapLines {
        MeeshySnapLines(vertical: drawable(lines.vertical), horizontal: drawable(lines.horizontal))
    }

    /// Inactif, rien ne se peint (`nil`). Une candidate sur une ligne engagée se masque : une ligne engagée ne se double pas.
    public static func plan(isActive: Bool, engaged: MeeshySnapLines, candidates: MeeshySnapLines) -> MeeshySnapGuidesPlan? {
        guard isActive else { return nil }
        let engagedLines = sanitized(engaged)
        let candidateLines = sanitized(candidates)
        return MeeshySnapGuidesPlan(
            engaged: engagedLines,
            candidates: MeeshySnapLines(
                vertical: candidateLines.vertical.filter { !Self.contains(engagedLines.vertical, $0) },
                horizontal: candidateLines.horizontal.filter { !Self.contains(engagedLines.horizontal, $0) }
            )
        )
    }

    /// La position d'une fraction sur une longueur du calque.
    public static func points(_ fractions: [CGFloat], length: CGFloat) -> [CGFloat] {
        fractions.map { $0 * length }
    }

    /// Combien de lignes ENTRENT : présentes dans `next`, absentes de `previous`.
    /// Une ligne qui reste, qui sort ou qui est hors bornes n'en est pas une.
    public static func enteredCount(from previous: MeeshySnapLines, to next: MeeshySnapLines) -> Int {
        let before = sanitized(previous)
        let after = sanitized(next)
        return after.vertical.filter { !Self.contains(before.vertical, $0) }.count
            + after.horizontal.filter { !Self.contains(before.horizontal, $0) }.count
    }

    /// Un tic `light` par nouvelle ligne, jamais en continu, jamais à la sortie ;
    /// aucun avec `none`. Rend le nombre de tics joués.
    @MainActor
    @discardableResult
    public static func perform(
        from previous: MeeshySnapLines,
        to next: MeeshySnapLines,
        haptic: MeeshySnapHaptic,
        play: @MainActor () -> Void = { HapticFeedback.light() }
    ) -> Int {
        guard haptic == .light else { return 0 }
        let entered = enteredCount(from: previous, to: next)
        for _ in 0..<entered { play() }
        return entered
    }

    private static func contains(_ fractions: [CGFloat], _ fraction: CGFloat) -> Bool {
        fractions.contains { abs($0 - fraction) < MeeshySelectionFeedbackRecipe.sameLineTolerance }
    }
}
