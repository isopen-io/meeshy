import Foundation

/// L'offre de source de l'AGPL-3.0 (section 6) telle que l'écran Licences la
/// sert : le dépôt public au commit EXACT du build, ou le dépôt seul quand le
/// build n'a gravé aucun commit (build local). Aucun commit n'est fabriqué :
/// une valeur qui n'est pas un SHA-1 complet est tenue pour absente.
///
/// Projet d'ingénierie de conformité, pas un avis juridique : la rédaction
/// finale de l'écran attend l'avocat du projet (#11548).
nonisolated struct SourceOffer: Equatable, Sendable {
    static let repository = URL(string: "https://github.com/isopen-io/meeshy")!
    static let infoPlistKey = "MeeshySourceCommit"

    let commit: String?

    init(commit rawCommit: String?) {
        commit = Self.normalizedCommit(rawCommit)
    }

    init(bundle: Bundle) {
        self.init(commit: bundle.object(forInfoDictionaryKey: Self.infoPlistKey) as? String)
    }

    var url: URL {
        guard let commit else { return Self.repository }
        return Self.repository.appendingPathComponent("tree").appendingPathComponent(commit)
    }

    var shortCommit: String? {
        commit.map { String($0.prefix(7)) }
    }

    static func normalizedCommit(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              value.count == 40,
              value.allSatisfy(\.isHexDigit) else { return nil }
        return value
    }
}
