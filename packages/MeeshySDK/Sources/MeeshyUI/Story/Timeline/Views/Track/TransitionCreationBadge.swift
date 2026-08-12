import SwiftUI

/// Affordance de CRÉATION de transition à la couture de deux clips média —
/// le pendant « vide » du `TransitionBadge` (losange plein = transition
/// existante). Un tap crée une crossfade par défaut, undo-able, et route la
/// sélection vers le `TransitionInspector`.
public struct TransitionCreationBadge: View, Equatable {

    public static func == (lhs: TransitionCreationBadge, rhs: TransitionCreationBadge) -> Bool {
        lhs.junctionId == rhs.junctionId
            && lhs.anchorX == rhs.anchorX
            && lhs.laneHeight == rhs.laneHeight
            && lhs.isDark == rhs.isDark
    }

    public let junctionId: String
    public let anchorX: CGFloat
    public let laneHeight: CGFloat
    public let isDark: Bool
    public let onCreate: () -> Void

    public init(junctionId: String, anchorX: CGFloat, laneHeight: CGFloat,
                isDark: Bool, onCreate: @escaping () -> Void) {
        self.junctionId = junctionId
        self.anchorX = anchorX
        self.laneHeight = laneHeight
        self.isDark = isDark
        self.onCreate = onCreate
    }

    public var body: some View {
        ZStack {
            Diamond()
                .fill(isDark ? Color.black.opacity(0.45) : Color.white.opacity(0.75))
            Diamond()
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [2.5, 1.5]))
                .foregroundStyle(MeeshyColors.indigo400)
            Image(systemName: "plus")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(MeeshyColors.indigo400)
                .accessibilityHidden(true)
        }
        .frame(width: 18, height: 18)
        .position(x: anchorX, y: laneHeight / 2)
        .contentShape(Rectangle().inset(by: -14))
        .onTapGesture { onCreate() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.timeline.transition.add",
                                   defaultValue: "Ajouter une transition", bundle: .module))
    }
}

private struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
