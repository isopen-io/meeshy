import SwiftUI

// MARK: - L'emplacement du cercle sur la fiche d'un profil (#13940)
//
// Le niveau COMMUN avec un membre (Ami, Proche, Sang) et l'action de montée vivent côté app : lecture servie, cache,
// file durable, loi de demande. Le SDK expose un emplacement OPAQUE, sur le patron de `ProfileGameSection`, posé là où
// la fiche disait « Connectés ». Sans emplacement, elle le dit toujours.

/// Ce que l'app fournit : à partir de l'identifiant et du nom d'affichage du membre, la vue du cercle.
public struct ProfileRelationSection {
    public let build: (_ userId: String, _ displayName: String) -> AnyView

    public init(build: @escaping (_ userId: String, _ displayName: String) -> AnyView) {
        self.build = build
    }
}

private struct ProfileRelationSectionKey: EnvironmentKey {
    static let defaultValue: ProfileRelationSection? = nil
}

public extension EnvironmentValues {
    /// L'emplacement du cercle d'une fiche ; `nil` : la fiche dit « Connectés », comme avant.
    var profileRelationSection: ProfileRelationSection? {
        get { self[ProfileRelationSectionKey.self] }
        set { self[ProfileRelationSectionKey.self] = newValue }
    }
}

/// « Connectés » : une demande acceptée, sans rien dire du cercle. L'app le reprend tant qu'aucun lien n'est servi.
public struct ProfileConnectedBadge: View {
    public init() {}

    public var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: MeeshyIconSize.sm))
                .foregroundColor(MeeshyColors.success)
            Text(String(localized: "profile.status.connected", defaultValue: "Connectes", bundle: .module))
                .font(.system(size: MeeshyFont.labelSize, weight: .semibold))
                .foregroundColor(MeeshyColors.success)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.md)
        .background(MeeshyColors.success.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
    }
}
