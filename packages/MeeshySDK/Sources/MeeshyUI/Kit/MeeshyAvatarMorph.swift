import SwiftUI

/// La portée du voyage : posée UNE fois par la racine, autour de la navigation. Deux
/// emplacements de même identité dans la même portée sont le même avatar. Sans elle,
/// aucun voyage : le fondu enchaîné.
public struct MeeshyAvatarMorphScope {
    let namespace: Namespace.ID
}

private struct MeeshyAvatarMorphScopeKey: EnvironmentKey {
    static let defaultValue: MeeshyAvatarMorphScope? = nil
}

public extension EnvironmentValues {
    var meeshyAvatarMorphScope: MeeshyAvatarMorphScope? {
        get { self[MeeshyAvatarMorphScopeKey.self] }
        set { self[MeeshyAvatarMorphScopeKey.self] = newValue }
    }
}

/// Pose la portée autour du contenu : la racine l'appelle une fois.
public struct MeeshyAvatarMorphScopeHost<Content: View>: View {
    private let content: Content
    @Namespace private var namespace

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content.environment(\.meeshyAvatarMorphScope, MeeshyAvatarMorphScope(namespace: namespace))
    }
}

/// **L'avatar qui voyage (K29)** : il relie deux emplacements qui portent la même
/// identité dans la même portée : un seul avatar, jamais deux. Il transporte, il ne
/// dessine rien : l'avatar, sa présence et son anneau sont ceux de l'hôte (`content`,
/// `badge`, `ring`). L'anneau et la pastille s'effacent en vol, sauf `ringTravels` /
/// `badgeTravels`. Sous « réduire les animations » ou sans portée : fondu enchaîné.
///
/// K29 ne connaît ni personne, ni route, ni carte : une chaîne opaque et un diamètre.
public struct MeeshyAvatarMorph<Content: View, Ring: View, Badge: View>: View {
    private let id: String
    private let size: Double
    private let path: MeeshyAvatarMorphPath
    private let outline: MeeshyAvatarMorphOutline
    private let ringTravels: Bool
    private let badgeTravels: Bool
    private let isEnabled: Bool
    private let onArrive: (() -> Void)?
    private let content: Content
    private let ring: Ring
    private let badge: Badge

    @Environment(\.meeshyAvatarMorphScope) private var scope
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(id: String,
                size: Double,
                path: MeeshyAvatarMorphPath = .auto,
                outline: MeeshyAvatarMorphOutline = .circle,
                ringTravels: Bool = false,
                badgeTravels: Bool = false,
                isEnabled: Bool = true,
                onArrive: (() -> Void)? = nil,
                @ViewBuilder content: () -> Content,
                @ViewBuilder ring: () -> Ring,
                @ViewBuilder badge: () -> Badge) {
        self.id = id
        self.size = size
        self.path = path
        self.outline = outline
        self.ringTravels = ringTravels
        self.badgeTravels = badgeTravels
        self.isEnabled = isEnabled
        self.onArrive = onArrive
        self.content = content()
        self.ring = ring()
        self.badge = badge()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public var body: some View {
        let side = CGFloat(size)
        let gap = CGFloat(MeeshyAvatarMorphRecipe.ringGap(diameter: size))
        let badgeSide = CGFloat(MeeshyAvatarMorphRecipe.badgeDiameter(diameter: size))
        let core = ZStack {
            content.frame(width: side, height: side).clipShape(Circle())
            if ringTravels { ring.padding(-gap) }
        }
        .frame(width: side, height: side)
        .overlay(alignment: .bottomTrailing) {
            if badgeTravels { badge.frame(width: badgeSide, height: badgeSide) }
        }
        Group {
            if let scope, isEnabled, !reduceMotion {
                core.matchedGeometryEffect(id: id, in: scope.namespace)
            } else {
                core
            }
        }
        .overlay { if !ringTravels { ring.padding(-gap).transition(.opacity) } }
        .overlay(alignment: .bottomTrailing) {
            if !badgeTravels { badge.frame(width: badgeSide, height: badgeSide).transition(.opacity) }
        }
        .onAppear { onArrive?() }
    }
}

extension MeeshyAvatarMorph where Ring == EmptyView, Badge == EmptyView {
    public init(id: String,
                size: Double,
                path: MeeshyAvatarMorphPath = .auto,
                outline: MeeshyAvatarMorphOutline = .circle,
                isEnabled: Bool = true,
                onArrive: (() -> Void)? = nil,
                @ViewBuilder content: () -> Content) {
        self.init(id: id, size: size, path: path, outline: outline, ringTravels: false, badgeTravels: false,
                  isEnabled: isEnabled, onArrive: onArrive, content: content, ring: { EmptyView() }, badge: { EmptyView() })
    }
}
