import SwiftUI

// MARK: - L'emplacement du cercle sur la fiche d'un profil (#13940)
//
// Le niveau COMMUN avec un membre (Ami, Proche, Sang) et l'action de montée vivent côté app : lecture servie, cache,
// file durable, loi de demande. Le SDK expose un emplacement OPAQUE, sur le patron de `ProfileGameSection`, posé là où
// la fiche disait « Connectés » — ou proposait la demande de connexion, une Connaissance n'ayant pas d'amitié acceptée
// (#14910). Sans emplacement, elle montre toujours ce qu'elle montrait.

/// Ce que l'app fournit : à partir de l'identifiant et du nom d'affichage du membre, la vue du cercle. L'app pose
/// `linked` à vrai dès qu'elle montre un lien d'au moins Connaissance (ou qu'il vient d'être annulé) : la fiche cesse
/// alors de montrer ce qu'elle montrait sans lien (« Connectés », ou la demande de connexion).
public struct ProfileRelationSection {
    public let build: (_ userId: String, _ displayName: String, _ linked: Binding<Bool>) -> AnyView

    public init(build: @escaping (_ userId: String, _ displayName: String, _ linked: Binding<Bool>) -> AnyView) {
        self.build = build
    }
}

/// L'emplacement posé dans la fiche : le cercle quand l'app le fournit — une Connaissance n'a pas d'amitié acceptée,
/// son lien se lit quand même (#14910) —, et ce que la fiche montrait tant qu'aucun lien n'est montré.
struct ProfileRelationSlot<Unlinked: View>: View {
    let section: ProfileRelationSection?
    let userId: String?
    let displayName: String
    /// Porté par la fiche : le cercle commun n'est plus Public dès qu'un lien est montré (#18870).
    @Binding var linked: Bool
    @ViewBuilder let unlinked: () -> Unlinked

    var body: some View {
        if let section, let userId, !userId.isEmpty {
            VStack(spacing: 0) {
                section.build(userId, displayName, $linked)
                if !linked { unlinked() }
            }
        } else {
            unlinked()
        }
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

// MARK: - La pilule de relation sous le nom (#18870, loi 3)

/// Ce que l'app fournit : la pilule qui dit le cercle COMMUN (« 🔥 Proche ▾ ») et mène à « Notre cercle ». Vide tant
/// qu'aucun lien n'est servi : la fiche n'invente aucun niveau.
public struct ProfileRelationPill {
    public let build: (_ userId: String, _ displayName: String) -> AnyView

    public init(build: @escaping (_ userId: String, _ displayName: String) -> AnyView) {
        self.build = build
    }
}

private struct ProfileRelationPillKey: EnvironmentKey {
    static let defaultValue: ProfileRelationPill? = nil
}

public extension EnvironmentValues {
    /// La pilule de relation sous le nom d'une fiche ; `nil` : rien sous le nom.
    var profileRelationPill: ProfileRelationPill? {
        get { self[ProfileRelationPillKey.self] }
        set { self[ProfileRelationPillKey.self] = newValue }
    }
}

/// « Connectés » : une demande acceptée, sans rien dire du cercle. L'app le reprend tant qu'aucun lien n'est servi.
public struct ProfileConnectedBadge: View {
    public init() {}

    public var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: MeeshyIconSize.sm))
                .foregroundStyle(MeeshyColors.success)
            Text(String(localized: "profile.status.connected", defaultValue: "Connectes", bundle: .module))
                .meeshyScaledFont(MeeshyFont.labelSize, weight: .semibold)
                .foregroundStyle(MeeshyColors.success)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.md)
        .background(MeeshyColors.success.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
    }
}
