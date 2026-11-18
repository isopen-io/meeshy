import SwiftUI

// MARK: - L'emplacement du cercle sur la fiche d'un profil (#13940)
//
// Le niveau COMMUN avec un membre (Ami, Proche, Sang) et l'action de montée vivent côté app : lecture servie, cache,
// file durable, loi de demande. Le SDK expose un emplacement OPAQUE, sur le patron de `ProfileGameSection`, posé là où
// la fiche disait « Connectés » — ou proposait la demande de connexion, une Connaissance n'ayant pas d'amitié acceptée
// (#14910). Sans emplacement, elle montre toujours ce qu'elle montrait.

/// Ce que l'app fournit : à partir de l'identifiant et du nom d'affichage du membre, la vue du cercle. L'app pose
/// `linked` à vrai dès qu'elle montre un lien d'au moins Connaissance (ou qu'il vient d'être annulé) : la fiche cesse
/// alors de montrer ce qu'elle montrait sans lien (« Connectés », ou la demande de connexion). `tint` est l'accent de la
/// fiche (#19637) : `nil` quand la fiche n'en remet aucun, jamais une teinte transparente qui passerait pour un accent.
public struct ProfileRelationSection {
    public typealias Build = (_ userId: String, _ displayName: String, _ linked: Binding<Bool>, _ tint: Color?) -> AnyView

    public let build: Build

    public init(build: @escaping Build) {
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
    /// L'accent de la fiche, remis tel quel au cercle (#19637).
    let tint: Color?
    @ViewBuilder let unlinked: () -> Unlinked

    var body: some View {
        if let section, let userId, !userId.isEmpty {
            VStack(spacing: 0) {
                section.build(userId, displayName, $linked, tint)
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
/// qu'aucun lien n'est servi : la fiche n'invente aucun niveau. Posée dans l'en-tête, toujours monté, la pilule publie
/// `linked` (comme `ProfileRelationSection`) : la Vitrine sait dès le cache qu'écrire n'est plus une demande.
public struct ProfileRelationPill {
    public typealias Build = (_ userId: String, _ displayName: String, _ linked: Binding<Bool>) -> AnyView

    public let build: Build

    public init(build: @escaping Build) {
        self.build = build
    }

    /// L'ancienne forme, sans lien publié : la fiche ne l'apprend alors que de l'emplacement du cercle.
    public init(build: @escaping (_ userId: String, _ displayName: String) -> AnyView) {
        self.build = { userId, displayName, _ in build(userId, displayName) }
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

/// « Connectés » : une demande acceptée, sans rien dire du cercle. L'app le reprend tant qu'aucun lien n'est servi. La
/// même pastille du kit (K41) que l'étape « Acceptée » : une relation, un composant.
public struct ProfileConnectedBadge: View {
    public init() {}

    public var body: some View {
        MeeshyBadge(
            .label(String(localized: "profile.relation.request.accepted.connected", defaultValue: "Connectés", bundle: .module)),
            leading: .systemImage("person.fill.checkmark"), kind: .ok
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - La carte comme action (#18872, loi 6)

/// Ce que la fiche remet à la carte : qui, et ce que la carte peut rendre à la fiche (écrire, appeler).
public struct ProfileLocationMapRequest {
    /// Ce qui rend la même fiche à côté de la carte ; l'hôte lui retire « Carte » (`profileLocationMap` à `nil`).
    public typealias Profile = () -> UserProfileSheet

    public let userId: String
    public let displayName: String
    public let onWrite: (() -> Void)?
    public let onCall: (() -> Void)?
    /// La fiche elle-même, à poser à côté de la carte quand la place le permet (planche iPad-Split) ; sans « Carte ».
    public let profile: Profile?

    public init(userId: String, displayName: String, onWrite: (() -> Void)?, onCall: (() -> Void)?,
                profile: Profile? = nil) {
        self.userId = userId
        self.displayName = displayName
        self.onWrite = onWrite
        self.onCall = onCall
        self.profile = profile
    }
}

/// Ce que l'app fournit : si la carte d'une personne a quelque chose à montrer (une position servie), et la carte
/// elle-même. Sans emplacement, la fiche ne propose pas « Carte » : le SDK ne connaît ni positions ni magasin.
public struct ProfileLocationMap {
    /// La carte « Où il est » de la face Actions (planche Autre-Actions) : ce que l'app sait de la position servie,
    /// et de quoi ouvrir la carte en plein écran.
    public typealias Preview = (_ request: ProfileLocationMapRequest, _ openMap: @escaping () -> Void) -> AnyView

    public let isOffered: (_ userId: String) -> Bool
    public let destination: (ProfileLocationMapRequest) -> AnyView
    /// Sans elle, la fiche propose « Carte » dans « Parler » (K32) ; avec elle, la section « Où il est » la remplace.
    public let preview: Preview?

    public init(isOffered: @escaping (_ userId: String) -> Bool,
                destination: @escaping (ProfileLocationMapRequest) -> AnyView,
                preview: Preview? = nil) {
        self.isOffered = isOffered
        self.destination = destination
        self.preview = preview
    }

    func placement(for userId: String) -> ProfileWherePlacement {
        ProfileWherePlacement.resolve(isOffered: isOffered(userId), hasPreview: preview != nil)
    }
}

/// Où la fiche d'un autre range sa position servie : nulle part sans position, la section « Où il est » quand l'app
/// sait la dessiner, sinon l'action « Carte » de « Parler ».
nonisolated enum ProfileWherePlacement: Equatable, Sendable {
    case none, action, card

    static func resolve(isOffered: Bool, hasPreview: Bool) -> ProfileWherePlacement {
        guard isOffered else { return .none }
        return hasPreview ? .card : .action
    }
}

private struct ProfileLocationMapKey: EnvironmentKey {
    static let defaultValue: ProfileLocationMap? = nil
}

public extension EnvironmentValues {
    /// La carte des positions d'une fiche ; `nil` : la face Actions ne propose pas « Carte ».
    var profileLocationMap: ProfileLocationMap? {
        get { self[ProfileLocationMapKey.self] }
        set { self[ProfileLocationMapKey.self] = newValue }
    }
}
