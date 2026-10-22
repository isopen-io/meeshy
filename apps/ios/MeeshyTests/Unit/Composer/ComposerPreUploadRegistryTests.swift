import XCTest
@testable import Meeshy

/// #5086 (vue `4c`) — **le registre des pré-montées.**
///
/// Il est éprouvé avec un monteur factice parce que ce qu'il porte n'est pas un
/// envoi : c'est une RÈGLE — quand partir, combien en parallèle, que faire d'un
/// échec, et surtout ce qui se passe quand l'auteur retire un média pendant que
/// son fichier voyage.
@MainActor
final class ComposerPreUploadRegistryTests: XCTestCase {

    /// Un monteur qu'on débloque à la main : sans lui, « deux à la fois » ne
    /// s'éprouve pas — un envoi instantané ne se chevauche jamais.
    private final class MonteurFactice: ComposerPreUploadProviding, @unchecked Sendable {
        private let laisserPasser: Bool
        private let echoue: Bool
        private var enVol = 0
        private var maximumSimultane = 0
        private var appelsInternes: [URL] = []

        var appels: [URL] { verrou.withLock { appelsInternes } }
        var pointeSimultanee: Int { verrou.withLock { maximumSimultane } }
        private let verrou = NSLock()

        init(laisserPasser: Bool = true, echoue: Bool = false) {
            self.laisserPasser = laisserPasser
            self.echoue = echoue
        }

        func upload(fileURL: URL, mimeType: String) async throws
            -> (postMediaId: String, remoteURL: String) {
            // `lock()`/`unlock()` sont INDISPONIBLES depuis un contexte
            // asynchrone (Swift 6) ; `withLock` est la forme portée, parce
            // qu'elle ne peut pas laisser un verrou pris à travers une
            // suspension.
            verrou.withLock {
                enVol += 1
                maximumSimultane = max(maximumSimultane, enVol)
                appelsInternes.append(fileURL)
            }
            defer { verrou.withLock { enVol -= 1 } }
            if !laisserPasser {
                // Reste en vol le temps du témoin, puis rend la main.
                //
                // **Cinq secondes ici faisaient ÉCHOUER le run entier** alors
                // que toutes les suites passaient : les tâches survivaient à
                // leur test, touchaient un registre déjà libéré, et le
                // processus mourait au teardown — « TEST EXECUTE FAILED »
                // après quatre « passed ». Un test qui laisse du travail
                // derrière lui ne casse pas son propre verdict ; il casse
                // celui du suivant.
                try await Task.sleep(nanoseconds: 200_000_000)
            }
            if echoue { throw URLError(.notConnectedToInternet) }
            return ("pm-\(fileURL.lastPathComponent)", "https://cdn/\(fileURL.lastPathComponent)")
        }
    }

    private func url(_ n: String) -> URL { URL(fileURLWithPath: "/tmp/\(n)") }
    private let gros: Int64 = ComposerPreUploadPolicy.minimumBytes * 4

    private func sut(_ monteur: MonteurFactice) -> ComposerPreUploadRegistry {
        let registre = ComposerPreUploadRegistry(uploader: monteur)
        registre.adopt = { _, _, _ in true }
        return registre
    }

    // MARK: - Ce qui part, et ce qui ne part pas

    func test_unFichierPose_passeEnMontee() {
        let registre = sut(MonteurFactice(laisserPasser: false))
        registre.begin(url: url("a.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        XCTAssertTrue(registre.state(for: url("a.jpg")).showsProgress)
        registre.stopForPublication()
    }

    func test_unFichierMinuscule_neParPasTot() {
        let registre = sut(MonteurFactice())
        registre.begin(url: url("b.jpg"), mimeType: "image/jpeg", fileSize: 10, alreadyRemote: false)
        XCTAssertEqual(registre.state(for: url("b.jpg")), .idle)
    }

    /// **Idempotent par fichier.** Un aller-retour dans la galerie, une slide
    /// dupliquée : chaque passage par la porte d'entrée doublerait les envois
    /// en vol si le registre ne se souvenait pas.
    func test_reposerLeMemeFichier_neRelanceRien() async {
        let monteur = MonteurFactice(laisserPasser: false)
        let registre = sut(monteur)
        registre.begin(url: url("c.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        registre.begin(url: url("c.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        await Task.yield()
        XCTAssertEqual(monteur.appels.filter { $0 == url("c.jpg") }.count, 1)
        registre.stopForPublication()
    }

    // MARK: - Ce qui arrive

    func test_uneMonteeAboutie_marqueLAssetPret() async {
        let registre = sut(MonteurFactice())
        registre.begin(url: url("d.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        await attendre { registre.state(for: self.url("d.jpg")).isReady }
        XCTAssertEqual(registre.state(for: url("d.jpg")),
                       .ready(postMediaId: "pm-d.jpg", remoteURL: "https://cdn/d.jpg"))
    }

    /// **Un média retiré pendant la montée n'est pas un succès à afficher.**
    /// L'adoption rend `false` — l'objet a disparu du document —, et le
    /// registre l'OUBLIE plutôt que de peindre « PRÊT » pour un média que
    /// l'auteur ne voit plus.
    func test_unMediaRetirePendantLaMontee_estOublie() async {
        let registre = ComposerPreUploadRegistry(uploader: MonteurFactice())
        registre.adopt = { _, _, _ in false }
        registre.begin(url: url("e.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        await attendre { registre.state(for: self.url("e.jpg")) == .idle }
        XCTAssertEqual(registre.state(for: url("e.jpg")), .idle)
    }

    /// **Un échec ne bloque rien et ne se montre pas.** L'état `failed` existe
    /// pour que le registre n'y revienne pas ; la publication, elle, ne le lit
    /// même pas — elle voit un objet sans identifiant distant et le monte.
    func test_unEchec_laisseLAssetAuCheminDHier() async {
        let registre = sut(MonteurFactice(echoue: true))
        registre.begin(url: url("f.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        await attendre { registre.state(for: self.url("f.jpg")) == .failed }
        XCTAssertFalse(ComposerPreUploadPolicy.publishReuses(registre.state(for: url("f.jpg"))))
    }

    // MARK: - La file

    /// **Deux à la fois, pas plus.** Le témoin exige un monteur qui RESTE en
    /// vol : avec un envoi instantané, trois montées séquentielles donnent le
    /// même verdict qu'une file bornée — et le témoin passerait dans les deux
    /// mondes.
    func test_deuxMonteesAuPlus_courentEnMemeTemps() async {
        let monteur = MonteurFactice(laisserPasser: false)
        let registre = sut(monteur)
        for n in ["g", "h", "i", "j"] {
            registre.begin(url: url("\(n).jpg"), mimeType: "image/jpeg",
                           fileSize: gros, alreadyRemote: false)
        }
        await attendre { monteur.appels.count >= ComposerPreUploadPolicy.maximumConcurrent }
        XCTAssertLessThanOrEqual(monteur.pointeSimultanee,
                                 ComposerPreUploadPolicy.maximumConcurrent)
        registre.stopForPublication()
    }

    // MARK: - Les deux arrêts

    /// Retirer un média puis le reposer (annuler, re-choisir le même fichier) :
    /// la montée annulée, en se dénouant, effaçait la tâche et l'état de la
    /// montée relancée — qui n'était plus ni suivie ni annulable.
    func test_oublierPuisReposer_laMonteeAnnuleeNEffacePasLaNouvelle() async {
        let registre = sut(MonteurFactice(laisserPasser: false))
        let a = url("reprise.jpg")
        registre.begin(url: a, mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        registre.forget(url: a)
        registre.begin(url: a, mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        try? await Task.sleep(nanoseconds: 60_000_000)
        XCTAssertTrue(registre.state(for: a).showsProgress, "la montée relancée reste suivie")
        try? await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertTrue(registre.state(for: a).isReady)
    }

    /// La publication arrête deux montées, puis l'auteur pose trois fichiers :
    /// les deux montées annulées, en se dénouant, ne libèrent pas de place
    /// qu'elles ne tiennent plus — la troisième attend.
    func test_apresLaPublication_lesMonteesAnnuleesNeLiberentPasDePlaceFantome() async {
        let monteur = MonteurFactice(laisserPasser: false)
        let registre = sut(monteur)
        for n in ["p1.jpg", "p2.jpg"] {
            registre.begin(url: url(n), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        }
        try? await Task.sleep(nanoseconds: 20_000_000)
        registre.stopForPublication()
        for n in ["q1.jpg", "q2.jpg", "q3.jpg"] {
            registre.begin(url: url(n), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        }
        try? await Task.sleep(nanoseconds: 60_000_000)
        XCTAssertFalse(monteur.appels.contains(url("q3.jpg")), "deux à la fois, pas plus")
        registre.stopForPublication()
    }

    func test_oublier_retireLAssetDuRegistre() {
        let registre = sut(MonteurFactice(laisserPasser: false))
        registre.begin(url: url("k.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        registre.forget(url: url("k.jpg"))
        XCTAssertEqual(registre.state(for: url("k.jpg")), .idle)
        registre.stopForPublication()
    }

    /// **Ce qui est PRÊT survit à la publication ; ce qui est en vol est
    /// annulé.** Laisser courir un envoi que la publication va refaire
    /// donnerait deux envois du même fichier en même temps — la moitié de la
    /// bande passante pour celui qui compte.
    func test_laPublication_gardeLePret_etAnnuleLeReste() async {
        let registre = sut(MonteurFactice())
        registre.begin(url: url("l.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)
        await attendre { registre.state(for: self.url("l.jpg")).isReady }

        let enVol = ComposerPreUploadRegistry(uploader: MonteurFactice(laisserPasser: false))
        enVol.adopt = { _, _, _ in true }
        enVol.begin(url: url("m.jpg"), mimeType: "image/jpeg", fileSize: gros, alreadyRemote: false)

        registre.stopForPublication()
        enVol.stopForPublication()
        XCTAssertTrue(registre.state(for: url("l.jpg")).isReady)
        XCTAssertEqual(enVol.state(for: url("m.jpg")), .idle)
    }

    // MARK: -

    private func attendre(_ condition: @escaping () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    // MARK: - #9912 — la vidéo pré-montée part compressée, sous le type de son conteneur

    /// Retient ce que le monteur a reçu, et si le fichier existait à cet instant.
    private final class MonteurTemoin: ComposerPreUploadProviding, @unchecked Sendable {
        private let verrou = NSLock()
        private var recus: [(url: URL, mime: String, existait: Bool)] = []

        var envois: [(url: URL, mime: String, existait: Bool)] { verrou.withLock { recus } }

        func upload(fileURL: URL, mimeType: String) async throws
            -> (postMediaId: String, remoteURL: String) {
            let existe = FileManager.default.fileExists(atPath: fileURL.path)
            verrou.withLock { recus.append((fileURL, mimeType, existe)) }
            return ("pm-\(fileURL.lastPathComponent)", "https://cdn/\(fileURL.lastPathComponent)")
        }
    }

    private func fichierCompresse() throws -> URL {
        let compresse = FileManager.default.temporaryDirectory
            .appendingPathComponent("compressed_\(UUID().uuidString).mp4")
        try Data([0, 0, 0, 0x18]).write(to: compresse)
        return compresse
    }

    /// La prise brute (`.mov` caméra, 10–15 Mb/s) ne part plus telle quelle :
    /// le monteur reçoit la sortie de la compression, sous le type de SON
    /// conteneur, et ce fichier temporaire ne survit pas à l'envoi.
    func test_compressingPreUploader_video_sendsTheCompressedFileUnderItsContainerType() async throws {
        let compresse = try fichierCompresse()
        let monteur = MonteurTemoin()
        let sut = ComposerCompressingPreUploader(inner: monteur, compress: { _ in compresse })

        _ = try await sut.upload(fileURL: url("prise.mov"), mimeType: "video/quicktime")

        XCTAssertEqual(monteur.envois.map(\.url), [compresse])
        XCTAssertEqual(monteur.envois.first?.mime, "video/mp4")
        XCTAssertEqual(monteur.envois.first?.existait, true)
        XCTAssertFalse(FileManager.default.fileExists(atPath: compresse.path), "le fichier compressé est temporaire")
    }

    func test_compressingPreUploader_image_travelsUntouched() async throws {
        let monteur = MonteurTemoin()
        let sut = ComposerCompressingPreUploader(inner: monteur, compress: { source in
            XCTFail("une image n'a rien à faire dans l'encodeur vidéo")
            return source
        })

        _ = try await sut.upload(fileURL: url("photo.jpg"), mimeType: "image/jpeg")

        XCTAssertEqual(monteur.envois.map(\.url), [url("photo.jpg")])
        XCTAssertEqual(monteur.envois.first?.mime, "image/jpeg")
    }

    /// Une compression ratée fait échouer la PRÉ-montée, jamais l'envoi : le
    /// registre marque l'asset `failed` et la publication le compresse elle-même.
    func test_compressingPreUploader_compressionFails_sendsNothing() async {
        let monteur = MonteurTemoin()
        let sut = ComposerCompressingPreUploader(inner: monteur, compress: { _ in throw URLError(.cannotDecodeContentData) })

        do {
            _ = try await sut.upload(fileURL: url("prise.mov"), mimeType: "video/quicktime")
            XCTFail("la pré-montée doit échouer")
        } catch {
            XCTAssertTrue(monteur.envois.isEmpty, "la prise brute ne part jamais à la place")
        }
    }

    /// Le composer monte par CE monteur, au budget de la story — le seul format
    /// dont la publication référence ce qui a été pré-monté.
    func test_composerHost_preUploadsThroughTheCompressingUploader_atTheStoryBudget() throws {
        let host = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(host.contains("returnComposerCompressingPreUploader.story(baseURL:base,token:jeton)"))
        let monteur = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerPreUploadRegistry.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(monteur.contains("inner:ComposerTusPreUploader(baseURL:baseURL,token:token)"))
        XCTAssertTrue(monteur.contains("compressVideo($0,context:.story)"))
    }
}
