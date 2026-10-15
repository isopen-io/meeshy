import Foundation

// MARK: - Ce qu'un retrait efface du magasin des packs (§ 5.10.6, #10150)

/// **Ce qu'un pack a rangé dans le magasin adressé par contenu** : ses fichiers
/// communs (contrat, chaînes, couverture) et, par cadre, les siens (vignette,
/// couches). Un même fichier peut appartenir à plusieurs packs : son nom est son
/// empreinte.
public struct PackFileManifest: Codable, Hashable, Sendable {
    public let slug: String
    public let files: Set<String>
    public let frames: [String: Set<String>]

    public init(slug: String, files: Set<String>, frames: [String: Set<String>] = [:]) {
        self.slug = slug
        self.files = files
        self.frames = frames
    }

    var allFiles: Set<String> {
        frames.values.reduce(files) { $0.union($1) }
    }
}

/// Ce qu'un élagage efface, et les packs que l'index peut oublier.
public struct PackPrunePlan: Equatable, Sendable {
    public let files: Set<String>
    public let forgottenPacks: Set<String>

    public init(files: Set<String>, forgottenPacks: Set<String>) {
        self.files = files
        self.forgottenPacks = forgottenPacks
    }
}

/// **La loi de l'élagage, pure** : un fichier ne part que si AUCUN pack retenu
/// (installé par l'un des comptes connus sur l'appareil, ou tenu par un bail) ne
/// le référence, ni aucun cadre gardé dans un carnet. Un fichier qu'aucun
/// manifeste ne décrit n'est jamais effacé : ce qu'on ne connaît pas, on le garde.
public enum PackFileRetention {
    public static func plan(manifests: [PackFileManifest],
                            retainedPacks: Set<String>,
                            referencedFrames: Set<String>) -> PackPrunePlan {
        let kept = manifests.map { manifest in
            (manifest.slug, keptFiles(of: manifest, retainedPacks: retainedPacks, referencedFrames: referencedFrames))
        }
        let keep = kept.reduce(into: Set<String>()) { $0.formUnion($1.1) }
        let known = manifests.reduce(into: Set<String>()) { $0.formUnion($1.allFiles) }
        let forgotten = Set(kept.filter { $0.1.isEmpty }.map(\.0))
        return PackPrunePlan(files: known.subtracting(keep), forgottenPacks: forgotten)
    }

    private static func keptFiles(of manifest: PackFileManifest,
                                  retainedPacks: Set<String>,
                                  referencedFrames: Set<String>) -> Set<String> {
        if retainedPacks.contains(manifest.slug) { return manifest.allFiles }
        let referenced = manifest.frames.filter { referencedFrames.contains($0.key) }
        guard !referenced.isEmpty else { return [] }
        return referenced.values.reduce(manifest.files) { $0.union($1) }
    }
}
