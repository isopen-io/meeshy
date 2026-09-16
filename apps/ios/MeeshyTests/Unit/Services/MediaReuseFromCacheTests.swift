import XCTest
import MeeshySDK
@testable import Meeshy

/// **Réutiliser un média déjà sur le disque ne repasse pas par le réseau**
/// (#6810, directive porteur 2026-09-16 : « Réutiliser l'attachement directement
/// dans le composer sans avoir à le retélécharger serait bien ! »).
///
/// ## Ce que ces témoins gardent, et pourquoi il n'en existait aucun
///
/// `AttachmentMediaSaveResolver` est le resolver de PRODUCTION du chemin
/// « Créer avec ce média » : c'est lui qui rend le fichier local que
/// `ComposerMediaSeeding` transforme en graine du composer. Les quatre suites
/// qui traversent ce chemin — `ConversationMediaDoorTests`,
/// `SocialComposerSeedTests`, `ComposerSeedIngestionTests`,
/// `MediaSaveCoordinatorTests` — le remplacent TOUTES par un `Stub`. Le
/// resolver réel n'était donc interrogé nulle part : ce n'était pas une garde
/// faible, c'était une garde **absente**, et c'est exactement le trou par
/// lequel le défaut est passé.
///
/// ## Le défaut, et la raison pour laquelle il ne se voit pas à la lecture
///
/// ```swift
/// let data = try await store.data(for: key)                              // ← peut partir sur le réseau
/// if let onDisk = await store.localFileURL(for: key) { return onDisk }   // ← trois lignes plus bas
/// ```
///
/// L'ordre des `return` donne l'impression que le disque est préféré — le
/// doc-comment l'affirmait même. L'ordre des EFFETS dit l'inverse : `data(for:)`
/// est inconditionnel. Sur une entrée `.expired` dont le fichier est toujours
/// là — `load(for:)` rend `.expired` **sans rien supprimer** —, `data(for:)`
/// part sur `networkData` pour un fichier que la ligne suivante allait rendre.
///
/// ## Pourquoi ces témoins n'ont besoin ni de réseau ni de mock
///
/// La clé porte un schéma qui n'est ni `http` ni `https`. `data(for:)` garde
/// explicitement ces deux schémas et lève `notCached` pour tout autre : le
/// chemin réseau devient donc **inatteignable** dans ce test. Un témoin qui
/// passe prouve que le disque a été lu AVANT ; un témoin qui lève prouve qu'on
/// est parti chercher le réseau. C'est la mutation elle-même qui sert
/// d'assertion — remettre `data(for:)` en premier fait relever `notCached`.
///
/// Le TTL nul rend `freshness` `.expired` à tout âge (`staleTTL == nil`
/// ⇒ `age < ttl`, faux pour `ttl == 0`), ce qui reproduit en une ligne l'état
/// que la production met un an à atteindre sur une image et six mois sur une
/// vidéo.
final class MediaReuseFromCacheTests: XCTestCase {

    // MARK: - Fabriques

    /// Clé au schéma NEUTRE : elle ferme le chemin réseau par construction.
    private static let cle = "meeshy-test://fixture/mire-panorama.jpg"
    private static let octets = Data("mire de recette".utf8)

    /// Un store RÉEL — pas un double — dans un dossier jetable, dont la
    /// politique périme tout immédiatement.
    private func storePerime() throws -> (store: DiskCacheStore, racine: URL) {
        let racine = FileManager.default.temporaryDirectory
            .appendingPathComponent("reuse-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: racine, withIntermediateDirectories: true)
        let politique = CachePolicy(
            ttl: 0,
            staleTTL: nil,
            maxItemCount: nil,
            storageLocation: .disk(subdir: "TestReuse", maxBytes: 10_000_000)
        )
        return (DiskCacheStore(policy: politique, baseDirectory: racine), racine)
    }

    // MARK: - 1 · Le cas du porteur

    /// **Un média déjà sur le disque arme le composer sans aucun appel réseau.**
    ///
    /// C'est la demande, mot pour mot. Le fichier est écrit puis périmé ; il est
    /// TOUJOURS là. Le resolver doit le rendre.
    func test_unMediaDejaSurLeDisque_estServiSansPasserParLeReseau() async throws {
        let (store, racine) = try storePerime()
        defer { try? FileManager.default.removeItem(at: racine) }

        await store.save(Self.octets, for: Self.cle)

        // L'état de départ est bien celui du défaut : périmé, mais présent.
        let etat = await store.load(for: Self.cle)
        guard case .expired = etat else {
            return XCTFail("le témoin ne mesure rien si l'entrée n'est pas périmée — obtenu \(etat)")
        }
        XCTAssertNotNil(store.cachedFileURL(for: Self.cle),
                        "le fichier est sur le disque : c'est toute la question")

        let fichier = try await AttachmentMediaSaveResolver()
            .materialize(from: store, key: Self.cle, ext: "jpg")

        XCTAssertTrue(FileManager.default.fileExists(atPath: fichier.path),
                      "le resolver rend un fichier qui existe")
        XCTAssertEqual(try Data(contentsOf: fichier), Self.octets,
                       "et c'est bien le média qu'on avait mis en cache")
    }

    /// **Le fichier servi est CELUI du store, pas une copie temporaire.**
    ///
    /// Le repli d'écriture temporaire existe pour le cas où le flush disque n'a
    /// pas encore eu lieu ; l'emprunter alors que le fichier est là dupliquerait
    /// jusqu'à 275 Mo pour une vidéo (`CachePolicy`), sur le seul geste
    /// « composer avec ce média ».
    func test_leFichierServi_estCeluiDuStore_jamaisUneCopie() async throws {
        let (store, racine) = try storePerime()
        defer { try? FileManager.default.removeItem(at: racine) }

        await store.save(Self.octets, for: Self.cle)
        let fichier = try await AttachmentMediaSaveResolver()
            .materialize(from: store, key: Self.cle, ext: "jpg")

        XCTAssertEqual(fichier.deletingLastPathComponent().standardizedFileURL,
                       racine.standardizedFileURL,
                       "le chemin rendu vit DANS le store — aucune copie n'a été écrite")
    }

    // MARK: - 2 · Ce qui ne doit pas changer

    /// **Un média ABSENT du cache reste à télécharger.** Sans ce témoin, un
    /// correctif qui rendrait tout servable passerait pour une réussite.
    ///
    /// Le schéma neutre ferme le réseau : l'échec attendu est donc `notCached`,
    /// et il prouve que le resolver a bien cherché ailleurs que sur le disque.
    func test_unMediaAbsentDuCache_nEstPasFabrique() async throws {
        let (store, racine) = try storePerime()
        defer { try? FileManager.default.removeItem(at: racine) }

        do {
            let fichier = try await AttachmentMediaSaveResolver()
                .materialize(from: store, key: Self.cle, ext: "jpg")
            XCTFail("rien n'a été mis en cache : le resolver ne peut pas rendre \(fichier)")
        } catch {
            // Attendu — le chemin réseau est fermé par le schéma de la clé.
        }
    }
}
