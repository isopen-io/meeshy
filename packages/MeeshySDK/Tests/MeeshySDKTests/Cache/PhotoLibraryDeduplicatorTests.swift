import XCTest
import Photos
@testable import MeeshySDK

/// #10370 — un média n'entre qu'une fois dans l'album Meeshy, et une réinstallation
/// (registre effacé) retrouve ce que l'album contient déjà par la marque du nom d'origine.
final class PhotoLibraryDeduplicatorTests: XCTestCase {

    // MARK: - Doubles

    private final class SpyCreator: PhotoLibraryAssetCreating, @unchecked Sendable {
        private let lock = NSLock()
        private var created: [String?] = []
        let succeeds: Bool
        let delayNanoseconds: UInt64

        init(succeeds: Bool = true, delayNanoseconds: UInt64 = 0) {
            self.succeeds = succeeds
            self.delayNanoseconds = delayNanoseconds
        }

        var writeCount: Int { lock.withLock { created.count } }
        var fileNames: [String?] { lock.withLock { created } }

        func create(_ request: PhotoLibraryAssetRequest) async -> String? {
            if delayNanoseconds > 0 { try? await Task.sleep(nanoseconds: delayNanoseconds) }
            let count = lock.withLock { () -> Int in
                created.append(request.originalFileName)
                return created.count
            }
            return succeeds ? "asset-\(count)" : nil
        }
    }

    private final class StubProbe: PhotoLibraryAssetProbing, @unchecked Sendable {
        var presence: PhotoLibraryAssetPresence
        var marks: [PhotoLibraryMediaSignature: String]?
        private(set) var scans = 0

        init(presence: PhotoLibraryAssetPresence = .present, marks: [PhotoLibraryMediaSignature: String]? = nil) {
            self.presence = presence
            self.marks = marks
        }

        func presence(ofAsset localIdentifier: String) -> PhotoLibraryAssetPresence { presence }

        func albumMarks() -> [PhotoLibraryMediaSignature: String]? {
            scans += 1
            return marks
        }
    }

    // MARK: - Fabriques

    private func registry() -> PhotoLibraryMediaRegistry {
        PhotoLibraryMediaRegistry(defaults: UserDefaults(suiteName: "photo-dedup-\(UUID().uuidString)")!)
    }

    private func request(_ signature: PhotoLibraryMediaSignature) -> PhotoLibraryAssetRequest {
        PhotoLibraryAssetRequest(kind: .photo, source: .data(Data([1, 2, 3])),
                                 originalFileName: signature.markedFileName(base: nil, pathExtension: "jpg"))
    }

    private let photo = PhotoLibraryMediaSignature(data: Data("la même photo".utf8))

    // MARK: - Le doublon

    func test_save_mêmeMédiaDeuxFois_unSeulAsset_leSecondEstDéjàPrésent() async {
        let creator = SpyCreator()
        let sut = PhotoLibraryDeduplicator(registry: registry(), probe: StubProbe(), creator: creator)

        let first = await sut.save(request(photo), signature: photo)
        let second = await sut.save(request(photo), signature: photo)

        XCTAssertEqual(first, .saved)
        XCTAssertEqual(second, .alreadyPresent)
        XCTAssertEqual(creator.writeCount, 1)
    }

    /// Accès « ajout seulement » : la photothèque ne se lit pas, le registre fait foi.
    func test_save_photothèqueIlisible_leRegistreFaitFoi() async {
        let creator = SpyCreator()
        let sut = PhotoLibraryDeduplicator(registry: registry(), probe: StubProbe(presence: .unknown), creator: creator)

        _ = await sut.save(request(photo), signature: photo)
        let again = await sut.save(request(photo), signature: photo)

        XCTAssertEqual(again, .alreadyPresent)
        XCTAssertEqual(creator.writeCount, 1)
    }

    /// L'utilisateur a supprimé l'asset de Photos : un nouvel « Enregistrer » le remet.
    func test_save_assetSuppriméDePhotos_estRéécrit() async {
        let creator = SpyCreator()
        let probe = StubProbe(presence: .present)
        let sut = PhotoLibraryDeduplicator(registry: registry(), probe: probe, creator: creator)

        _ = await sut.save(request(photo), signature: photo)
        probe.presence = .absent
        let again = await sut.save(request(photo), signature: photo)

        XCTAssertEqual(again, .saved)
        XCTAssertEqual(creator.writeCount, 2)
    }

    func test_save_deuxDemandesSimultanées_uneSeuleÉcriture() async {
        let creator = SpyCreator(delayNanoseconds: 50_000_000)
        let sut = PhotoLibraryDeduplicator(registry: registry(), probe: StubProbe(), creator: creator)

        let write = request(photo)
        let signature = photo
        async let auto = sut.save(write, signature: signature)
        async let manual = sut.save(write, signature: signature)
        let outcomes = await [auto, manual]

        XCTAssertEqual(creator.writeCount, 1)
        XCTAssertEqual(outcomes.sorted { "\($0)" < "\($1)" }, [.alreadyPresent, .saved])
    }

    func test_save_échecDÉcriture_rienNEstMémorisé() async {
        let failing = SpyCreator(succeeds: false)
        let store = registry()
        let sut = PhotoLibraryDeduplicator(registry: store, probe: StubProbe(), creator: failing)

        let outcome = await sut.save(request(photo), signature: photo)

        XCTAssertEqual(outcome, .failed)
        XCTAssertNil(store.localIdentifier(for: photo))
    }

    // MARK: - La réinstallation

    /// Registre vide (réinstallation) : la marque du nom d'origine retrouve l'asset.
    func test_save_registreEffacé_laMarqueDeLAlbumRetrouveLeMédia() async {
        let creator = SpyCreator()
        let probe = StubProbe(marks: [photo: "asset-d-avant"])
        let store = registry()
        let sut = PhotoLibraryDeduplicator(registry: store, probe: probe, creator: creator)

        let outcome = await sut.save(request(photo), signature: photo)

        XCTAssertEqual(outcome, .alreadyPresent)
        XCTAssertEqual(creator.writeCount, 0)
        XCTAssertEqual(store.localIdentifier(for: photo), "asset-d-avant")
    }

    func test_save_albumParcouruUneSeuleFoisParProcessus() async {
        let probe = StubProbe(marks: [:])
        let sut = PhotoLibraryDeduplicator(registry: registry(), probe: probe, creator: SpyCreator())

        _ = await sut.save(request(photo), signature: photo)
        _ = await sut.save(request(PhotoLibraryMediaSignature(data: Data("autre".utf8))),
                           signature: PhotoLibraryMediaSignature(data: Data("autre".utf8)))

        XCTAssertEqual(probe.scans, 1)
    }

    /// L'écriture porte la marque que le parcours de l'album sait relire.
    func test_save_leNomDOrigineÉcritPorteLEmpreinte() async {
        let creator = SpyCreator()
        let sut = PhotoLibraryDeduplicator(registry: registry(), probe: StubProbe(), creator: creator)

        _ = await sut.save(request(photo), signature: photo)

        let written = try? XCTUnwrap(creator.fileNames.first ?? nil)
        XCTAssertEqual(written.flatMap(PhotoLibraryMediaSignature.parse(markedFileName:)), photo)
    }

    // MARK: - L'alias de la pièce

    func test_alias_désigneLEmpreinteEnregistrée() async {
        let store = registry()
        let sut = PhotoLibraryDeduplicator(registry: store, probe: StubProbe(), creator: SpyCreator())

        _ = await sut.save(request(photo), signature: photo, alias: "att-1")

        XCTAssertEqual(store.signature(forAlias: "att-1"), photo)
        XCTAssertNotNil(store.localIdentifier(for: photo))
    }

    func test_registre_persisteEntreDeuxInstances() {
        let defaults = UserDefaults(suiteName: "photo-dedup-\(UUID().uuidString)")!
        PhotoLibraryMediaRegistry(defaults: defaults).record(photo, localIdentifier: "asset-1")

        XCTAssertEqual(PhotoLibraryMediaRegistry(defaults: defaults).localIdentifier(for: photo), "asset-1")
    }
}

/// L'empreinte : la même pour les mêmes octets, quel que soit le support.
final class PhotoLibraryMediaSignatureTests: XCTestCase {

    func test_signature_mêmesOctets_mêmeEmpreinte_fichierOuMémoire() async throws {
        let bytes = Data((0..<3_000_000).map { UInt8($0 % 251) })
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("sig-\(UUID().uuidString)")
        try bytes.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let fromFile = try await PhotoLibraryMediaSignature.of(fileAt: url)

        XCTAssertEqual(fromFile, PhotoLibraryMediaSignature(data: bytes))
        XCTAssertEqual(fromFile.token.count, 32)
    }

    func test_signature_octetsDifférents_empreintesDifférentes() {
        XCTAssertNotEqual(PhotoLibraryMediaSignature(data: Data([1])), PhotoLibraryMediaSignature(data: Data([2])))
    }

    func test_marque_allerRetour_gardeLaBaseLisible() {
        let signature = PhotoLibraryMediaSignature(data: Data("carte".utf8))

        let name = signature.markedFileName(base: "Meeshy-Card-2026.png", pathExtension: "png")

        XCTAssertTrue(name.hasPrefix("Meeshy-Card-2026_mx"))
        XCTAssertTrue(name.hasSuffix(".png"))
        XCTAssertEqual(PhotoLibraryMediaSignature.parse(markedFileName: name), signature)
    }

    func test_marque_nomÉtranger_nEstPasUneEmpreinte() {
        XCTAssertNil(PhotoLibraryMediaSignature.parse(markedFileName: "IMG_0042.HEIC"))
        XCTAssertNil(PhotoLibraryMediaSignature.parse(markedFileName: "photo_mxpasdutouthexa.jpg"))
    }
}

/// #10805 — enregistrer un média ne demande qu'UNE autorisation. Chercher ou
/// créer l'album « Meeshy » exige la LECTURE de la photothèque : en accès « ajout
/// seul », y toucher faisait monter une seconde alerte réclamant l'accès complet.
final class PhotosAlbumAccessTests: XCTestCase {

    func test_ajoutSeul_nInterrogeJamaisLAlbum() {
        XCTAssertFalse(PhotosAlbum.isReachable(readWriteStatus: .notDetermined),
                       "lecture jamais demandée : y toucher la demanderait")
        XCTAssertFalse(PhotosAlbum.isReachable(readWriteStatus: .denied),
                       "« Garder l'ajout seul » : l'album reste hors d'atteinte, sans redemander")
        XCTAssertFalse(PhotosAlbum.isReachable(readWriteStatus: .restricted))
    }

    func test_accesComplet_rangeDansLAlbum() {
        XCTAssertTrue(PhotosAlbum.isReachable(readWriteStatus: .authorized))
        XCTAssertTrue(PhotosAlbum.isReachable(readWriteStatus: .limited))
    }
}
