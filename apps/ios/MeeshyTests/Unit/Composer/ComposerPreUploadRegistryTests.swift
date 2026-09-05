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
}
