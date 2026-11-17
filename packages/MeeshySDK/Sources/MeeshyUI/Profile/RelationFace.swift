import SwiftUI
import MeeshySDK

// MARK: - Les trois faces du profil d'une relation (#18870)

/// La fiche d'un autre est le profil d'une relation (loi 3) et se lit en trois faces (loi 1) : la Vitrine dit qui il
/// est, les Liens ce qui amène vers lui, les Actions ce que je peux faire avec lui. L'ordre des cas est celui du
/// sélecteur. Ce que les anciens onglets portaient — détails, conversations en commun, publications — se range dans la
/// Vitrine (loi 11).
public nonisolated enum RelationFace: String, CaseIterable, Hashable, Sendable {
    case vitrine
    case links
    case actions

    public var title: String {
        switch self {
        case .vitrine: return String(localized: "profile.relation.face.vitrine", defaultValue: "Vitrine", bundle: .module)
        case .links: return String(localized: "profile.relation.face.links", defaultValue: "Liens", bundle: .module)
        case .actions: return String(localized: "profile.relation.face.actions", defaultValue: "Actions", bundle: .module)
        }
    }

    public var option: MeeshySegmentedOption<RelationFace> {
        switch self {
        case .vitrine:
            return MeeshySegmentedOption(id: self, title: title, systemImage: "person.crop.square",
                                         currentSystemImage: "person.crop.square.fill")
        case .links:
            return MeeshySegmentedOption(id: self, title: title, systemImage: "link", currentSystemImage: "link")
        case .actions:
            return MeeshySegmentedOption(id: self, title: title, systemImage: "bolt", currentSystemImage: "bolt.fill")
        }
    }

    public static var selectorLabel: String {
        String(localized: "profile.relation.face.selector", defaultValue: "Faces du profil", bundle: .module)
    }

    /// Le sélecteur ne se pose que sur la fiche d'un AUTRE, ni bloqué ni introuvable : ma propre fiche ouverte en
    /// feuille et un état sans fiche n'en ont pas (loi 5).
    public static func showsSelector(isCurrentUser: Bool, isBlocked: Bool, loadFailed: Bool) -> Bool {
        !isCurrentUser && !isBlocked && !loadFailed
    }

    /// Ma propre fiche ouverte en feuille ne montre que sa Vitrine.
    public static func shown(_ face: RelationFace, isCurrentUser: Bool) -> RelationFace {
        isCurrentUser ? .vitrine : face
    }

    /// Le bouton rond à droite du sélecteur : « Écrire » sur la Vitrine d'un autre, rien ailleurs (brief § 1).
    public func offersWriteShortcut(isInteractionDisabled: Bool) -> Bool {
        self == .vitrine && !isInteractionDisabled
    }

    /// Sans lien servi ni connexion acceptée, le cercle commun est sous Connaissance : écrire part en demande de
    /// message (`dm.request`), le premier message arrive dans ses demandes.
    public static func writesARequest(linked: Bool, connection: ConnectionStatus) -> Bool {
        guard !linked, connection != .connected else { return false }
        return ProfileRelationAction.writesARequest(at: .public)
    }
}

/// Le sélecteur de faces, en bas, dans la zone du pouce (loi 5) : le choix segmenté du kit (K03) dans un verre dense,
/// et, sur la Vitrine, le bouton rond « Écrire » (K02).
struct RelationFaceSelector: View {
    @Binding var face: RelationFace
    let writeShortcut: (() -> Void)?

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshySegmented(
                RelationFace.selectorLabel,
                selection: $face,
                options: RelationFace.allCases.map { $0.option },
                role: .tabs,
                tone: .theme
            )
            .padding(MeeshySpacing.xs)
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl + MeeshySpacing.xs), density: .dense)
            if let writeShortcut {
                MeeshyGlassButton(
                    systemImage: "bubble.left.fill",
                    label: ProfileRelationAction.write.title,
                    kind: .active,
                    size: .s48,
                    action: { writeShortcut() }
                )
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }
}
