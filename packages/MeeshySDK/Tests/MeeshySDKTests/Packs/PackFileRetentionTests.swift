import Foundation
import Testing
@testable import MeeshySDK

/// L'élagage du magasin des packs (§ 5.10.6) : un fichier encore référencé par un
/// autre pack retenu ou par un cadre du carnet ne part pas.
@Suite("Packs — ce qu'un retrait efface du magasin")
struct PackFileRetentionTests {

    private static let savane = PackFileManifest(
        slug: "savane",
        files: ["aaaaaaaaaaaaaaaa.json", "bbbbbbbbbbbbbbbb.json", "cccccccccccccccc.webp"],
        frames: ["savane-iv": ["1111111111111111.webp"], "savane-iii": ["2222222222222222.webp"]]
    )
    private static let fleuve = PackFileManifest(
        slug: "fleuve",
        files: ["dddddddddddddddd.json", "cccccccccccccccc.webp"],
        frames: ["fleuve-i": ["3333333333333333.webp"]]
    )

    @Test("un pack retenu garde tous ses fichiers")
    func retainedPackKeepsEverything() {
        let plan = PackFileRetention.plan(manifests: [Self.savane], retainedPacks: ["savane"], referencedFrames: [])
        #expect(plan.files.isEmpty)
        #expect(plan.forgottenPacks.isEmpty)
    }

    @Test("un pack retiré par tous les comptes perd ses fichiers, et l'index l'oublie")
    func removedPackLosesItsFiles() {
        let plan = PackFileRetention.plan(manifests: [Self.savane], retainedPacks: [], referencedFrames: [])
        #expect(plan.files == Self.savane.allFiles)
        #expect(plan.forgottenPacks == ["savane"])
    }

    @Test("un fichier partagé avec un pack encore installé ne part pas")
    func sharedFileStays() {
        let plan = PackFileRetention.plan(manifests: [Self.savane, Self.fleuve], retainedPacks: ["fleuve"], referencedFrames: [])
        #expect(!plan.files.contains("cccccccccccccccc.webp"))
        #expect(plan.files.contains("1111111111111111.webp"))
        #expect(plan.files.isDisjoint(with: Self.fleuve.allFiles))
    }

    @Test("un cadre gardé dans un carnet garde ses fichiers et ceux qui le décrivent, pas ses voisins")
    func notebookFrameKeepsItsFiles() {
        let plan = PackFileRetention.plan(manifests: [Self.savane], retainedPacks: [], referencedFrames: ["savane-iv"])
        #expect(!plan.files.contains("1111111111111111.webp"))
        #expect(plan.files.isDisjoint(with: Self.savane.files))
        #expect(plan.files == ["2222222222222222.webp"])
        #expect(plan.forgottenPacks.isEmpty)
    }

    @Test("un fichier qu'aucun manifeste ne décrit n'est jamais proposé à l'effacement")
    func unknownFilesAreNeverPruned() {
        let plan = PackFileRetention.plan(manifests: [], retainedPacks: [], referencedFrames: [])
        #expect(plan.files.isEmpty)
    }
}

@Suite("Magasin des packs — l'élagage efface ce qu'on lui nomme, rien d'autre")
struct ContentAddressedStorePruneTests {

    @Test("seuls les fichiers nommés partent")
    func prunesOnlyNamedFiles() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for name in ["1111111111111111.webp", "2222222222222222.webp"] {
            try Data(name.utf8).write(to: directory.appendingPathComponent(name))
        }
        let store = ContentAddressedStore(directory: directory)

        let removed = await store.prune(["1111111111111111.webp", "9999999999999999.webp"])

        #expect(removed == ["1111111111111111.webp"])
        #expect(!FileManager.default.fileExists(atPath: directory.appendingPathComponent("1111111111111111.webp").path))
        #expect(FileManager.default.fileExists(atPath: directory.appendingPathComponent("2222222222222222.webp").path))
    }

    @Test("un nom qui sort du magasin est refusé")
    func refusesEscapingNames() async throws {
        let parent = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let directory = parent.appendingPathComponent("meeshy-packs")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let outside = parent.appendingPathComponent("garde.txt")
        try Data("garde".utf8).write(to: outside)
        let store = ContentAddressedStore(directory: directory)

        let removed = await store.prune(["../garde.txt"])

        #expect(removed.isEmpty)
        #expect(FileManager.default.fileExists(atPath: outside.path))
    }
}
