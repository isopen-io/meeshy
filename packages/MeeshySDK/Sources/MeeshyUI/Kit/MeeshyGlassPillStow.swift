import SwiftUI

/// **Le retrait de la pilule** : rangée, elle sort par son bord et fond ; elle
/// répond jusqu'au terme du fondu (`MeeshyGlassPillPresenceRule`), et un toucher
/// reçu pendant le retrait appelle `onRevive` sans prendre le toucher. Au terme,
/// son contenu est RETIRÉ du rendu (`hidden` garde sa place) : dans un
/// conteneur de verre, le système ignore l'opacité des enfants, et la pilule
/// resterait dessinée mais sourde.
///
/// Seules la translation et l'opacité s'animent. La hauteur n'est lue qu'au
/// changement de taille ; la translation ne la change pas.
struct MeeshyGlassPillStowModifier: ViewModifier {
    let presence: MeeshyGlassPillPresence
    let onRevive: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @Environment(\.meeshyGlassPillStowMargin) private var margin
    @State private var stowedAt: Date?
    @State private var clock = Date()
    @State private var extent: CGFloat = 0

    func body(content: Content) -> some View {
        let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        let isStowed = presence.isStowed
        let accepts = MeeshyGlassPillPresenceRule.acceptsTouches(
            presence: presence,
            stowedFor: stowedAt.map { clock.timeIntervalSince($0) } ?? .infinity,
            reduceMotion: reduceMotion
        )
        let leaves = MeeshyGlassPillPresenceRule.leavesByItsEdge(presence: presence, reduceMotion: reduceMotion)
        let duration = MeeshyGlassPillPresenceRule.duration(reduceMotion: reduceMotion)
        return Group {
            if accepts {
                content
            } else {
                content.hidden()
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { extent = $0 }
        .offset(y: leaves ? MeeshyGlassPillPresenceRule.travel(extent: extent, margin: margin) : 0)
        .opacity(isStowed ? 0 : 1)
        .simultaneousGesture(
            TapGesture().onEnded { onRevive?() },
            including: isStowed && accepts ? .all : .subviews
        )
        .allowsHitTesting(accepts)
        .accessibilityHidden(isStowed)
        .animation(.easeInOut(duration: duration), value: isStowed)
        .adaptiveOnChange(of: isStowed) { _, nowStowed in
            let now = Date()
            stowedAt = nowStowed ? now : nil
            clock = now
        }
        .task(id: stowedAt) {
            guard stowedAt != nil else { return }
            let nanoseconds = UInt64(duration * 1_000_000_000)
            guard (try? await Task.sleep(nanoseconds: nanoseconds)) != nil, !Task.isCancelled else { return }
            clock = Date()
        }
    }
}
