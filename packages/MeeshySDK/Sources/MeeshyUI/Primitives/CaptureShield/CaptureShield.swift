import SwiftUI

// MARK: - La règle

/// Ce que le bouclier rend pour un contenu, selon qu'il est protégé et que la
/// couche sécurisée existe. FERMÉ PAR DÉFAUT : un contenu protégé sans couche
/// sécurisée rend son placeholder, jamais lui-même.
public enum CaptureShieldRendering: Equatable, Sendable {
    /// Le contenu, tel quel — aucune enveloppe, aucun coût.
    case plain
    /// Le contenu, dans la toile sécurisée : noir dans toute capture.
    case shielded
    /// Le placeholder : la couche sécurisée est introuvable.
    case sealed

    public static func resolve(isProtected: Bool, layerAvailable: Bool) -> CaptureShieldRendering {
        guard isProtected else { return .plain }
        return layerAvailable ? .shielded : .sealed
    }
}

/// Quelles pièces d'une visionneuse le bouclier protège — une valeur opaque
/// que l'hôte pose (`captureShieldScope`) et que les pages lisent. `allExcept`
/// est fermé par défaut : une pièce absente de la liste, ou sans identifiant,
/// est protégée.
public struct CaptureShieldScope: Equatable, Sendable {

    private enum Rule: Equatable, Sendable {
        case none
        case all
        case allExcept(Set<String>)
    }

    private let rule: Rule

    private init(rule: Rule) {
        self.rule = rule
    }

    public static let none = CaptureShieldScope(rule: .none)
    public static let all = CaptureShieldScope(rule: .all)

    /// Toutes les pièces sont protégées, sauf celles-ci.
    public static func allExcept(_ freeContentIds: Set<String>) -> CaptureShieldScope {
        CaptureShieldScope(rule: .allExcept(freeContentIds))
    }

    public func shields(_ contentId: String?) -> Bool {
        switch rule {
        case .none: return false
        case .all: return true
        case .allExcept(let free): return contentId.map { !free.contains($0) } ?? true
        }
    }
}

// MARK: - L'environnement

private struct CaptureShieldedKey: EnvironmentKey {
    static let defaultValue = false
}

private struct CaptureShieldScopeKey: EnvironmentKey {
    static let defaultValue = CaptureShieldScope.none
}

public extension EnvironmentValues {
    /// Vrai pour tout ce qui est rendu SOUS un bouclier — et pour ce qu'il
    /// présente. Les lecteurs vidéo y lisent qu'ils ne sortent ni par AirPlay
    /// ni par le PiP (`ProtectedPlaybackPolicy`).
    var isCaptureShielded: Bool {
        get { self[CaptureShieldedKey.self] }
        set { self[CaptureShieldedKey.self] = newValue }
    }

    var captureShieldScope: CaptureShieldScope {
        get { self[CaptureShieldScopeKey.self] }
        set { self[CaptureShieldScopeKey.self] = newValue }
    }
}

public extension View {
    /// Rend cette vue dans la couche sécurisée du système quand `isProtected`
    /// est vrai — noire dans les captures, les enregistrements et la recopie
    /// d'écran. Faux : la vue elle-même, sans enveloppe.
    func captureShield(_ isProtected: Bool) -> some View {
        CaptureShield(isProtected: isProtected) { self }
    }

    /// Pose la portée du bouclier pour les pages d'une visionneuse.
    func captureShieldScope(_ scope: CaptureShieldScope) -> some View {
        environment(\.captureShieldScope, scope)
    }
}

// MARK: - Le bouclier

/// **Le bouclier de capture** (#9574) — rend son contenu dans la couche
/// sécurisée du système quand `isProtected` est vrai. Le SDK ne sait pas
/// POURQUOI un contenu est protégé : l'hôte le dit par un booléen.
///
/// - Faux : le contenu, sans enveloppe UIKit — coût nul.
/// - Vrai : le contenu dans `SecureCaptureHostView`, une enveloppe par
///   instance, créée au montage et réutilisée à chaque rendu (seul le
///   `rootView` change). Disposition, gestes, VoiceOver, Dynamic Type, RTL et
///   menus passent : l'environnement entier est transmis au contenu hébergé.
/// - Vrai sans couche sécurisée : `placeholder`, et un signalement part.
///
/// Limites propres à l'enveloppe : les préférences SwiftUI posées DANS le
/// contenu ne remontent pas au-delà du bouclier, et une transaction animée
/// de l'hôte n'anime pas le contenu hébergé (ses propres animations jouent).
public struct CaptureShield<Content: View, Placeholder: View>: View {
    private let isProtected: Bool
    private let layer: any SecureCaptureLayerProviding
    private let content: Content
    private let placeholder: Placeholder

    public init(
        isProtected: Bool,
        layer: any SecureCaptureLayerProviding = SystemSecureCaptureLayer(),
        @ViewBuilder content: () -> Content,
        @ViewBuilder placeholder: () -> Placeholder
    ) {
        self.isProtected = isProtected
        self.layer = layer
        self.content = content()
        self.placeholder = placeholder()
    }

    public var body: some View {
        switch CaptureShieldRendering.resolve(isProtected: isProtected, layerAvailable: isProtected && layer.isAvailable) {
        case .plain:
            content
        case .shielded:
            SecureCaptureBody(content: content, placeholder: placeholder, layer: layer)
        case .sealed:
            placeholder.onAppear { CaptureShieldDiagnostics.reportUnavailable() }
        }
    }
}

public extension CaptureShield where Placeholder == CaptureShieldPlaceholder {
    init(
        isProtected: Bool,
        layer: any SecureCaptureLayerProviding = SystemSecureCaptureLayer(),
        @ViewBuilder content: () -> Content
    ) {
        self.init(isProtected: isProtected, layer: layer, content: content) { CaptureShieldPlaceholder() }
    }
}

/// Le placeholder par défaut : un cadenas et « Contenu protégé ».
public struct CaptureShieldPlaceholder: View {
    public init() {}

    public var body: some View {
        Label {
            Text(String(localized: "capture_shield.unavailable", defaultValue: "Contenu protégé", bundle: .module))
        } icon: {
            Image(systemName: "lock.fill")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Le corps protégé

private struct SecureCaptureBody<Content: View, Placeholder: View>: View {
    let content: Content
    let placeholder: Placeholder
    let layer: any SecureCaptureLayerProviding

    @State private var revision = 0
    @State private var isRefused = false

    var body: some View {
        if isRefused {
            placeholder
        } else {
            SecureCaptureRepresentable(
                content: content,
                layer: layer,
                revision: revision,
                onIdealSizeChange: { Task { @MainActor in revision &+= 1 } },
                onRefused: { Task { @MainActor in isRefused = true } }
            )
        }
    }
}

private struct SecureCaptureRepresentable<Content: View>: UIViewRepresentable {
    let content: Content
    let layer: any SecureCaptureLayerProviding
    let revision: Int
    let onIdealSizeChange: @MainActor () -> Void
    let onRefused: @MainActor () -> Void

    func makeUIView(context: Context) -> SecureCaptureHostView {
        let view = SecureCaptureHostView(layer: layer, root: root(context))
        view.onIdealSizeChange = onIdealSizeChange
        view.onRefused = onRefused
        return view
    }

    func updateUIView(_ uiView: SecureCaptureHostView, context: Context) {
        uiView.onIdealSizeChange = onIdealSizeChange
        uiView.onRefused = onRefused
        uiView.update(root: root(context))
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: SecureCaptureHostView, context: Context) -> CGSize? {
        uiView.fittingSize(width: proposal.width, height: proposal.height)
    }

    static func dismantleUIView(_ uiView: SecureCaptureHostView, coordinator: ()) {
        uiView.dismantle()
    }

    /// Le contenu hébergé reçoit l'environnement ENTIER de l'hôte — schéma de
    /// couleurs, Dynamic Type, sens de lecture, portillon de sortie, valeurs de
    /// l'application — et sait qu'il est sous un bouclier. L'ordre compte :
    /// le modificateur le plus proche du contenu l'emporte.
    private func root(_ context: Context) -> AnyView {
        AnyView(
            content
                .environment(\.isCaptureShielded, true)
                .environment(\.self, context.environment)
        )
    }
}
