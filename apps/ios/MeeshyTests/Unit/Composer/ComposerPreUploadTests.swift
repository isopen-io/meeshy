import XCTest
@testable import Meeshy

/// #5086 (vue `4c`) — **la montée commence à la POSE, pas au publish.**
@MainActor
final class ComposerPreUploadTests: XCTestCase {

    // MARK: - Ce que l'état rend à la vue

    /// **Une barre à zéro qui ne bouge pas est pire qu'aucune barre** : elle
    /// annonce un travail en cours que rien ne confirme.
    func test_sansTotal_aucuneProgressionNEstPeinte() {
        XCTAssertNil(ComposerPreUploadState.idle.fraction)
        XCTAssertNil(ComposerPreUploadState.uploading(sent: 100, total: 0).fraction)
        XCTAssertNil(ComposerPreUploadState.failed.fraction)
    }

    func test_laProgression_estLeRapportDesOctets() {
        XCTAssertEqual(
            ComposerPreUploadState.uploading(sent: 4_800_000, total: 14_200_000).fraction ?? 0,
            0.338, accuracy: 0.001)
    }

    /// Une valeur aberrante — un serveur qui accuse plus que ce qu'on a
    /// envoyé — ne doit pas produire une barre au-delà du cadre.
    func test_laProgression_resteDansLeCadre() {
        XCTAssertEqual(ComposerPreUploadState.uploading(sent: 999, total: 10).fraction, 1)
        XCTAssertEqual(ComposerPreUploadState.uploading(sent: -5, total: 10).fraction, 0)
    }

    func test_seulLEtatEnCours_peintUneProgression() {
        XCTAssertTrue(ComposerPreUploadState.uploading(sent: 1, total: 2).showsProgress)
        XCTAssertFalse(ComposerPreUploadState.idle.showsProgress)
        XCTAssertFalse(ComposerPreUploadState.ready(postMediaId: "m", remoteURL: "u").showsProgress)
        XCTAssertFalse(ComposerPreUploadState.failed.showsProgress)
    }

    // MARK: - Ce qui part tôt

    func test_unFichierMinuscule_neParPasTot() {
        XCTAssertFalse(ComposerPreUploadPolicy.mayBegin(fileSize: 1_024, alreadyRemote: false))
    }

    func test_unFichierQuiVautLaPeine_partTot() {
        XCTAssertTrue(ComposerPreUploadPolicy.mayBegin(
            fileSize: ComposerPreUploadPolicy.minimumBytes, alreadyRemote: false))
    }

    /// **Un asset déjà chez le serveur ne repart JAMAIS.** Le remonter en
    /// créerait un doublon — et le cas n'est pas théorique : une republication
    /// et une pré-montée déjà aboutie portent toutes deux un `postMediaId`.
    func test_unAssetDejaDistant_neRepartJamais() {
        XCTAssertFalse(ComposerPreUploadPolicy.mayBegin(
            fileSize: 100_000_000, alreadyRemote: true))
    }

    // MARK: - Ce que la publication fait

    func test_unAssetPret_estReference_jamaisRemonte() {
        XCTAssertTrue(ComposerPreUploadPolicy.publishReuses(
            .ready(postMediaId: "m1", remoteURL: "https://cdn/x")))
    }

    /// **Une pré-montée EN COURS ne fait pas attendre la publication.**
    ///
    /// C'est le troisième cas, refusé exprès : attendre ferait attendre
    /// précisément ce que la vue `4c` promet de ne plus faire attendre, et un
    /// envoi lent bloquerait l'auteur pour un gain qui n'existe que s'il a
    /// fini. Le coût assumé — un envoi en double — est borné par l'annulation
    /// au démarrage de la publication.
    func test_unePreMonteeEnCours_neFaitPasAttendre() {
        XCTAssertFalse(ComposerPreUploadPolicy.publishReuses(
            .uploading(sent: 9, total: 10)))
    }

    func test_unePreMonteeEchouee_neBloqueRien() {
        XCTAssertFalse(ComposerPreUploadPolicy.publishReuses(.failed))
        XCTAssertFalse(ComposerPreUploadPolicy.publishReuses(.idle))
    }

    // MARK: - Les budgets de la planche

    /// **Les nombres viennent de la vue `4a`, pas d'un goût de réglage.**
    /// « blocs 5 Mio · reprise à l'octet » y est le budget qui fait accepter ou
    /// refuser l'étage 6 en revue — un étage sans budget mesurable n'est pas
    /// spécifié.
    func test_lesBudgets_sontCeuxDeLaPlanche() {
        XCTAssertEqual(ComposerPreUploadPolicy.chunkBytes, 5 * 1024 * 1024)
        XCTAssertEqual(ComposerPreUploadPolicy.maximumConcurrent, 2)
    }

    /// **La garantie structurelle, éprouvée sur la SOURCE.**
    ///
    /// Le critère de fin exige qu'un échec de pré-montée ne fasse jamais
    /// échouer la publication. Ce n'est pas un `catch` : la boucle ne monte que
    /// les objets dont `postMediaId` est VIDE. Une pré-montée réussie remplit
    /// ce champ et l'objet est sauté ; une pré-montée ratée ne le remplit pas
    /// et l'objet suit le chemin d'hier, inchangé.
    ///
    /// Le témoin porte sur la forme du code parce que la garantie y tient :
    /// simuler un échec réseau prouverait qu'UNE branche marche, pas qu'il n'y
    /// a pas de branche.
    func test_laPublication_neMonteQueCeQuiNaPasDIdentifiantDistant() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("wheremediaObjects[i].postMediaId.isEmpty"),
                      "c'est cette clause, et elle seule, qui rend le repli automatique")
    }

    // MARK: - Le balayage du document

    /// **Un objet DÉJÀ distant ne repart pas.** C'est aussi ce qui rend le
    /// balayage idempotent sans qu'il tienne la moindre liste : l'adoption
    /// remplace l'URL locale par celle du serveur, donc le passage suivant ne
    /// voit plus l'objet.
    func test_unObjetDejaDistant_neFigurePasDansLeBalayage() {
        XCTAssertNil(ComposerPreUploadSweep.pendingFile(
            postMediaId: "pm1", mediaURL: "file:///tmp/a.jpg"))
        XCTAssertNil(ComposerPreUploadSweep.pendingFile(
            postMediaId: "", mediaURL: "https://cdn/a.jpg"))
    }

    func test_unObjetLocalSansIdentifiant_attendSaMontee() {
        XCTAssertEqual(
            ComposerPreUploadSweep.pendingFile(postMediaId: "", mediaURL: "file:///tmp/a.jpg"),
            URL(fileURLWithPath: "/tmp/a.jpg"))
    }

    /// Un objet sans URL du tout — un média déclaré dont l'asset n'a pas été
    /// chargé — n'a rien à monter. La publication le signalera là où l'auteur
    /// peut agir ; le balayage se tait.
    func test_unObjetSansURL_naRienAMonter() {
        XCTAssertNil(ComposerPreUploadSweep.pendingFile(postMediaId: "", mediaURL: nil))
        XCTAssertNil(ComposerPreUploadSweep.pendingFile(postMediaId: "", mediaURL: ""))
    }

    /// **La taille se lit sur le DISQUE, pas sur une déclaration.** Un
    /// temporaire purgé ou un document restauré après un redémarrage rend
    /// `nil` — et l'absence n'est pas une erreur : c'est la publication qui
    /// rencontrera le même vide, là où l'auteur peut agir.
    func test_laTaille_seLitSurLeDisque_etLAbsenceNEstPasUneErreur() throws {
        let fichier = FileManager.default.temporaryDirectory
            .appendingPathComponent("pre-montee-\(UUID().uuidString).bin")
        try Data(repeating: 7, count: 4_096).write(to: fichier)
        defer { try? FileManager.default.removeItem(at: fichier) }

        XCTAssertEqual(ComposerPreUploadSweep.fileSize(at: fichier), 4_096)
        XCTAssertNil(ComposerPreUploadSweep.fileSize(
            at: fichier.appendingPathExtension("absent")))
    }

    /// **Le balayage est branché en fin de DÉRIVATION, pas sur une porte.**
    ///
    /// Le composer a cinq portes vers un média, dont le viseur en scène né
    /// d'un GESTE — donc absent de tout inventaire de portes (#4879, #5069).
    /// Un appel par porte aurait recommencé l'inventaire qui a déjà raté une
    /// porte deux fois ; branché sur l'état ATTEINT, une sixième porte en
    /// hérite sans que personne n'y pense.
    ///
    /// Le témoin exige la POSITION, pas seulement la présence : appelé avant
    /// la dérivation, il balaierait l'état d'avant et raterait exactement le
    /// média qu'on vient de poser.
    func test_leBalayage_estAppeleEnFinDeDerivation() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        guard let debut = code.range(of: "funcsyncPostMediaIntoSlides(){"),
              let appel = code.range(of: "startPendingPreUploads()", range: debut.upperBound..<code.endIndex)
        else { return XCTFail("la dérivation ou le balayage a changé de nom") }
        // Rien d'autre entre l'appel et la fin de la fonction que sa fermeture.
        let apres = String(code[appel.upperBound...]).prefix(1)
        XCTAssertEqual(apres, "}", "le balayage doit être la DERNIÈRE chose que la dérivation fait")
    }
}
