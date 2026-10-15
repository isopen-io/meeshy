import SwiftUI

/// **Le sticker FLOTTE** (#10630) — ni bulle ni cadre : une ombre douce sous la
/// silhouette (l'ombre suit le canal alpha) et un flottement LENT du conteneur,
/// jamais de l'image : un sticker animé garde son propre mouvement.
///
/// Reduce Motion retire le flottement (l'ombre reste : la décoration reste,
/// c'est le mouvement qui part — règle 6 des effets de message). Le mouvement
/// s'arrête quand la vue quitte l'écran : une boucle infinie ne tourne pour
/// personne dans une cellule hors champ.
nonisolated enum StickerFloatLaw {
    /// Amplitude du flottement, en points.
    static let lift: CGFloat = 4
    /// Demi-période : montée puis descente = 4,2 s, comme le web.
    static let halfPeriod: Double = 2.1
    static let shadowOpacity: Double = 0.18
    static let shadowRadius: CGFloat = 8
    static let shadowOffsetY: CGFloat = 6

    /// Le décalage vertical d'un état : levé ou posé, jamais mobile sous Reduce Motion.
    static func offsetY(isLifted: Bool, reduceMotion: Bool) -> CGFloat {
        guard !reduceMotion, isLifted else { return 0 }
        return -lift
    }
}

struct StickerFloat: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isLifted = false

    func body(content: Content) -> some View {
        content
            .shadow(color: Color.black.opacity(StickerFloatLaw.shadowOpacity),
                    radius: StickerFloatLaw.shadowRadius, x: 0, y: StickerFloatLaw.shadowOffsetY)
            .offset(y: StickerFloatLaw.offsetY(isLifted: isLifted, reduceMotion: reduceMotion))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: StickerFloatLaw.halfPeriod).repeatForever(autoreverses: true)) {
                    isLifted = true
                }
            }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) { isLifted = false }
            }
    }
}

extension View {
    func stickerFloat() -> some View { modifier(StickerFloat()) }
}
