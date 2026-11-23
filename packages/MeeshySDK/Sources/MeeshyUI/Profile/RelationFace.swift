import SwiftUI
import MeeshySDK

// MARK: - Les deux faces du profil d'une relation (#18870, #20177)

/// La fiche d'un autre est le profil d'une relation (loi 3) et se lit en deux faces (directive porteur,
/// #20177) : la Vitrine dit qui il est — et où le trouver (ses adresses, ses communautés ouvertes) —, les Actions ce que
/// je peux faire avec lui — dont « Sa fiche » (envoyer son profil, copier son lien, son QR). L'ordre des cas est celui
/// du sélecteur. Une action ne vit qu'à un endroit.
public nonisolated enum RelationFace: String, CaseIterable, Hashable, Sendable {
    case vitrine
    case actions

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module` est isolé par l'isolation par défaut de MeeshyUI.
    @MainActor public var title: String {
        switch self {
        case .vitrine: return String(localized: "profile.relation.face.vitrine", defaultValue: "Vitrine", bundle: .module)
        case .actions: return String(localized: "profile.relation.face.actions", defaultValue: "Actions", bundle: .module)
        }
    }

    @MainActor public var option: MeeshySegmentedOption<RelationFace> {
        switch self {
        case .vitrine:
            return MeeshySegmentedOption(id: self, title: title, systemImage: "person.crop.square",
                                         currentSystemImage: "person.crop.square.fill")
        case .actions:
            return MeeshySegmentedOption(id: self, title: title, systemImage: "bolt", currentSystemImage: "bolt.fill")
        }
    }

    @MainActor public static var selectorLabel: String {
        String(localized: "profile.relation.face.selector", defaultValue: "Faces du profil", bundle: .module)
    }

    /// Le sélecteur ne se pose que sur la fiche d'un AUTRE, ni bloqué ni introuvable : ma propre fiche ouverte en
    /// feuille et un état sans fiche n'en ont pas (loi 5).
    public static func showsSelector(isCurrentUser: Bool, isBlocked: Bool, loadFailed: Bool) -> Bool {
        !isCurrentUser && !isBlocked && !loadFailed
    }

    /// La pilule de relation, sous le nom (loi 3) : sur la fiche d'un AUTRE qu'on n'a pas bloqué. Ma propre fiche n'a
    /// pas de cercle commun ; une fiche bloquée ne dit rien du lien.
    public static func showsRelationPill(isCurrentUser: Bool, isBlocked: Bool) -> Bool {
        !isCurrentUser && !isBlocked
    }

    /// Ma propre fiche ouverte en feuille ne montre que sa Vitrine.
    public static func shown(_ face: RelationFace, isCurrentUser: Bool) -> RelationFace {
        isCurrentUser ? .vitrine : face
    }

    /// Le bouton rond à droite du sélecteur (#20177) : « Parler » sur la Vitrine tant qu'écrire est possible,
    /// « Partager le profil » sur les Actions dès qu'il a une adresse. Rien qui ne réponde.
    public func accessory(isInteractionDisabled: Bool, canTalk: Bool, hasLink: Bool) -> RelationFaceAccessory? {
        switch self {
        case .vitrine: return !isInteractionDisabled && canTalk ? .talk : nil
        case .actions: return hasLink ? .share : nil
        }
    }

    /// Sans lien servi ni connexion acceptée, sous le niveau d'outil servi : écrire part en demande de message
    /// (`dm.request`), le premier message arrive dans ses demandes. Rien n'est dit tant que le niveau n'est pas lu.
    public static func writesARequest(standing: ProfileRelationStanding, connection: ConnectionStatus) -> Bool {
        standing.writesARequest(connection: connection)
    }
}

/// Le bouton de fin du sélecteur de faces d'un autre : écrire dans Meeshy, ou partager son profil hors de Meeshy.
public nonisolated enum RelationFaceAccessory: Hashable, Sendable {
    case talk
    case share

    public var systemImage: String {
        switch self {
        case .talk: return "bubble.left.fill"
        case .share: return "square.and.arrow.up"
        }
    }

    @MainActor public var label: String {
        switch self {
        case .talk: return Self.talkLabel
        case .share: return Self.shareLabel
        }
    }

    @MainActor public static var talkLabel: String {
        String(localized: "profile.relation.face.talk", defaultValue: "Parler", bundle: .module)
    }

    @MainActor public static var shareLabel: String {
        String(localized: "profile.relation.face.share", defaultValue: "Partager le profil", bundle: .module)
    }
}

/// Le sélecteur de faces, en bas, dans la zone du pouce (loi 5) : le choix segmenté du kit (K03) dans un verre dense,
/// et le bouton rond de la face (K02) — « Parler » avec les non-lus de notre conversation, ou « Partager le profil ».
struct RelationFaceSelector: View {
    @Binding var face: RelationFace
    let accessory: RelationFaceAccessory?
    var writeBadge: ProfileWriteBadge = .empty
    let onAccessory: (RelationFaceAccessory) -> Void

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
            // Le verre suit le thème, comme l'encre des onglets : forcé en sombre, il laissait « Actions » en encre
            // claire sur un verre clair (#19854).
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl + MeeshySpacing.xs), tone: .theme,
                         density: .dense)
            if let accessory {
                button(accessory)
                    .id(accessory)
                    .meeshyTransition(.scale.combined(with: .opacity))
            }
        }
        .meeshyMotion(.morph, value: accessory)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    @ViewBuilder
    private func button(_ accessory: RelationFaceAccessory) -> some View {
        let glass = MeeshyGlassButton(systemImage: accessory.systemImage, label: accessory.label,
                                      value: accessory == .talk ? writeBadge.spoken : nil, kind: .active, size: .s48,
                                      action: { onAccessory(accessory) })
        if accessory == .talk, let text = writeBadge.text {
            glass.glassBadge { MeeshyBadge(.label(text), kind: .accent, size: .s22) }
        } else {
            glass
        }
    }
}
