import XCTest
@testable import Meeshy

/// #6577 — **le média RETIRÉ du composer ne part plus à la publication.**
///
/// Constat porteur (2026-09-14) : « quand je supprime un média et rechoisit un
/// autre, au moment de publier le contenu, c'est l'ancien qui a été supprimé qui
/// est publié ». Le gateway grave le fantôme à `order: 0` — il fait la COUVERTURE.
///
/// ## Pourquoi aucun témoin d'ÉCRAN n'aurait rougi
///
/// Le meuble tient DEUX porteurs de la liste des médias :
///
/// | porteur | ce qu'il est | ce que le retrait en faisait |
/// |---|---|---|
/// | `viewModel.slides[].effects.mediaObjects` | ce que la VUE peint | **nettoyé** par `deleteElement` / `removeSlide` |
/// | `documentLocalMedia` (et ses index) | ce que la PUBLICATION téléverse | **intact** |
///
/// L'écran disait donc la vérité : la vignette disparaissait. Un témoin posé sur
/// la vue serait passé au VERT pendant que le défaut restait entier — c'est
/// exactement le « vert pour un motif étranger » du dépôt. **Ce témoin s'écrit
/// donc sur la CHARGE** : ce que `ComposerDocumentDraft.document(` emporte.
///
/// ## Ce que cette garde mesure
///
/// Elle part de la CHARGE, pas d'une liste de champs choisie à la main : les
/// quatre champs média du brouillon sont confrontés au corps du point d'entrée
/// de retrait. Un champ de la charge que le retrait ne nettoie pas est un média
/// fantôme qui repartira — et le message d'échec le nomme.
@MainActor
final class ComposerMediaRetractionTests: XCTestCase {

    // MARK: - La CHARGE, et les porteurs du meuble qui l'alimentent

    /// Les champs MÉDIA de `ComposerDocumentDraft.document(` — ce que la voie
    /// durable téléverse — et le(s) `@State` du meuble qui les remplissent.
    ///
    /// La traduction est courte et explicite parce qu'elle est le seul maillon
    /// que la source ne donne pas : `mediaAlts:` reçoit une PROJECTION
    /// (`altsParURLSource`), dont les deux entrées sont `documentMediaAlts` et
    /// `documentMediaObjectIdBySource`. Le fusible ci-dessous vérifie que chaque
    /// `champ` existe bel et bien dans l'appel — sans quoi la garde mesurerait
    /// une charge imaginaire.
    private static let charge: [(champ: String, porteurs: [String])] = [
        ("localMedia:", ["documentLocalMedia"]),
        ("mediaCaptions:", ["documentMediaCaptions"]),
        ("mediaAlts:", ["documentMediaAlts", "documentMediaObjectIdBySource"]),
        ("mediaObjectIds:", ["documentMediaObjectIdBySource"])
    ]

    /// Les INDEX que le retrait invalide. Ils ne voyagent pas dans la charge,
    /// mais `mediaRoleByURL` porte DEUX charges (le rôle ET l'idempotence de
    /// re-pose) : survivant à son média, il fait SAUTER la re-sélection du même
    /// fichier — le défaut que « Tout effacer » documente déjà sur le même champ.
    private static let index = [
        "slideIdByMediaURL",
        "mediaRoleByURL",
        "railPosedMediaURLs",
        "documentTranscriptions"
    ]

    // MARK: - Lecture de source

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ texte: String) -> String {
        texte.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le corps d'une déclaration, borné par l'ÉQUILIBRE des accolades — jamais
    /// par « la prochaine `func` », qui couperait au premier bloc imbriqué et
    /// verdirait sur la moitié qu'elle lit.
    private func body(after ancre: String, in source: String) -> String? {
        guard let debut = source.range(of: ancre) else { return nil }
        guard let ouvrante = source[debut.upperBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var curseur = ouvrante
        while curseur < source.endIndex {
            if source[curseur] == "{" { profondeur += 1 }
            if source[curseur] == "}" {
                profondeur -= 1
                if profondeur == 0 {
                    return String(source[source.index(after: ouvrante)..<curseur])
                }
            }
            curseur = source.index(after: curseur)
        }
        return nil
    }

    /// Les arguments de l'appel qui compose la charge.
    private func appelDeLaCharge() throws -> String {
        let source = try hostSource()
        guard let debut = source.range(of: "ComposerDocumentDraft.document(") else { return "" }
        var profondeur = 0
        var curseur = source.index(before: debut.upperBound)
        while curseur < source.endIndex {
            if source[curseur] == "(" { profondeur += 1 }
            if source[curseur] == ")" {
                profondeur -= 1
                if profondeur == 0 { return String(source[debut.upperBound..<curseur]) }
            }
            curseur = source.index(after: curseur)
        }
        return ""
    }

    private func corpsDuRetrait() throws -> String? {
        body(after: "func retractMedia(", in: try hostSource())
    }

    // MARK: - Fusibles (une garde qui ne mesure rien affirme le contraire)

    func test_laGarde_litUneSourceNonVide() throws {
        XCTAssertGreaterThan(try hostSource().count, 10_000,
                             "l'unité du meuble est vide ou introuvable — la garde ne mesurerait RIEN")
    }

    func test_laCharge_porteBienSesQuatreChampsMedia() throws {
        let appel = compact(try appelDeLaCharge())
        XCTAssertFalse(appel.isEmpty,
                       "`ComposerDocumentDraft.document(` introuvable : la garde lirait une charge imaginaire")
        let absents = Self.charge.map(\.champ).filter { !appel.contains(compact($0)) }
        XCTAssertTrue(absents.isEmpty,
            "Ces champs ne sont plus dans la charge : \(absents.joined(separator: ", ")). "
            + "Soit le brouillon a changé de forme et l'inventaire doit suivre, soit un média "
            + "ne voyage plus — dans les deux cas, cette garde a cessé de mesurer le vrai.")
    }

    // MARK: - Le point d'entrée UNIQUE

    /// **Un seul lieu voit les DEUX porteurs, et c'est le meuble.** Le SDK n'a
    /// aucun accès au `@State` app-side : `deleteElement` et `removeSlide` ne
    /// PEUVENT PAS nettoyer ce que la publication téléverse. Un retrait qui vit
    /// dans le SDK est donc, par construction, un demi-retrait.
    func test_leRetrait_aUnPointDEntreeUnique_surLeMeuble() throws {
        XCTAssertNotNil(try corpsDuRetrait(),
            "Aucun `retractMedia(` dans l'unité du meuble : les deux gestes de suppression "
            + "n'appellent que le SDK, donc `documentLocalMedia` garde le média retiré et la "
            + "publication le téléverse — le fantôme que le gateway grave à `order: 0`, "
            + "c'est-à-dire en COUVERTURE (#6577).")
    }

    func test_leRetrait_nettoieChaquePorteurDeLaCharge() throws {
        guard let corps = try corpsDuRetrait().map(compact) else {
            return XCTFail("`retractMedia(` absent — voir le témoin précédent")
        }
        let manquants = Self.charge
            .flatMap(\.porteurs)
            .filter { !corps.contains($0) }
        XCTAssertTrue(manquants.isEmpty,
            "Le retrait laisse ces porteurs de la CHARGE intacts : "
            + "\(Set(manquants).sorted().joined(separator: ", ")).\n"
            + "Chacun repartira avec la publication SUIVANTE — et l'auteur n'a aucun écran "
            + "pour le voir, puisque la vue, elle, a bien perdu sa vignette.")
    }

    func test_leRetrait_invalideLesIndexQuiGardentLIdempotence() throws {
        guard let corps = try corpsDuRetrait().map(compact) else {
            return XCTFail("`retractMedia(` absent — voir le témoin précédent")
        }
        let manquants = Self.index.filter { !corps.contains($0) }
        XCTAssertTrue(manquants.isEmpty,
            "Index non invalidés : \(manquants.joined(separator: ", ")). "
            + "`mediaRoleByURL` et `railPosedMediaURLs` sont AUSSI des gardes d'idempotence : "
            + "survivant à leur média, elles font sauter la re-pose du MÊME fichier en silence.")
    }

    /// **La pré-montée est la moitié SERVEUR du même geste.**
    /// `ComposerPreUploadRegistry.forget(url:)` n'avait aucun appelant de
    /// production : un média pré-monté puis retiré laissait son `PostMedia`
    /// orphelin en base, et le registre continuait de le compter comme prêt.
    func test_leRetrait_oublieLaPreMontee() throws {
        guard let corps = try corpsDuRetrait().map(compact) else {
            return XCTFail("`retractMedia(` absent — voir le témoin précédent")
        }
        XCTAssertTrue(corps.contains("preUploads.forget(url:"),
            "Le retrait n'oublie pas la pré-montée : le fichier déjà téléversé reste un "
            + "`PostMedia` orphelin côté serveur, et le registre le tient pour prêt.")
    }

    /// **L'ordre est porteur.** `.adaptiveOnChange(of: documentLocalMedia)`
    /// élague la slide elle-même : écrire la liste APRÈS avoir appelé le SDK
    /// ferait courir la dérivation sur un modèle déjà amputé.
    func test_leRetrait_ecritLesPorteurs_avantDAppelerLeSDK() throws {
        guard let corps = try corpsDuRetrait().map(compact) else {
            return XCTFail("`retractMedia(` absent — voir le témoin précédent")
        }
        guard let porteurs = corps.range(of: "documentLocalMedia="),
              let sdk = corps.range(of: "viewModel.") else {
            return XCTFail("Le corps du retrait n'écrit pas `documentLocalMedia` ou n'appelle pas le SDK")
        }
        XCTAssertLessThan(porteurs.lowerBound, sdk.lowerBound,
            "Le SDK est appelé AVANT l'écriture des porteurs : la dérivation branchée sur "
            + "`documentLocalMedia` courrait alors sur un modèle déjà amputé.")
    }

    // MARK: - Les DEUX gestes y passent

    func test_leRailTrailing_passeParLePointUnique() throws {
        guard let corps = body(after: "func handleTrailingRailAction(", in: try hostSource())
            .map(compact) else {
            return XCTFail("`handleTrailingRailAction(` introuvable — la garde ne mesurerait rien")
        }
        guard let suppression = corps.range(of: "case.delete:") else {
            return XCTFail("La branche `.delete` du rail trailing est introuvable")
        }
        let branche = String(corps[suppression.upperBound...].prefix(240))
        XCTAssertTrue(branche.contains("retractMedia("),
            "Le rail trailing supprime encore par le SEUL SDK : la vignette part de l'écran, "
            + "le fichier reste dans la charge.")
    }

    /// La corbeille du rail de scènes ne connaît qu'un INDEX. `retractScene(at:)`
    /// est l'adaptateur qui le traduit en identités — la scène et les objets
    /// qu'elle porte — puis appelle le point d'entrée unique. Un adaptateur,
    /// jamais un second retrait : c'est ce que le second témoin ci-dessous
    /// vérifie.
    func test_laCorbeilleDuRailDeScenes_passeParLePointUnique() throws {
        let source = compact(try hostSource())
        XCTAssertFalse(source.contains("onDelete:{viewModel.removeSlide(at:$0)}"),
            "La corbeille du rail de scènes appelle `removeSlide` en DIRECT : elle retire la "
            + "page de l'écran et laisse son fichier dans `documentLocalMedia`.")
        XCTAssertTrue(source.contains("onDelete:{retractScene(at:$0)}"),
            "La corbeille du rail de scènes doit passer par l'adaptateur du meuble — "
            + "le seul lieu qui voie les DEUX porteurs.")
        guard let corps = body(after: "func retractScene(", in: try hostSource()).map(compact) else {
            return XCTFail("Aucun `retractScene(` : la corbeille ne peut atteindre le point d'entrée unique")
        }
        XCTAssertTrue(corps.contains("retractMedia(objectIds:"),
            "`retractScene(at:)` doit déléguer au point d'entrée UNIQUE : un second chemin de "
            + "retrait est un second inventaire à tenir d'accord, donc un second oubli.")
    }

    // MARK: - Le contrôle DÉMONTÉ, qui a masqué la régression

    /// **Un vert sur un contrôle démonté est un vert pour un motif étranger.**
    /// `ComposerMediaThumbnail.onRemove` et
    /// `ComposerMediaChipAffordance.showsRemove` n'avaient plus AUCUN appelant de
    /// production — seuls des tests les citaient. Trois témoins verts
    /// affirmaient « le média est retirable » en interrogeant une vue que plus
    /// rien ne monte.
    func test_lesControlesDemontes_ontDisparu() throws {
        let dossier = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer")
        let fichiers = (try? FileManager.default.contentsOfDirectory(at: dossier,
                                                                    includingPropertiesForKeys: nil)) ?? []
        XCTAssertGreaterThan(fichiers.count, 50, "dossier du composer introuvable — garde muette")
        let corpus = fichiers
            .filter { $0.pathExtension == "swift" }
            .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")
        for demonte in ["ComposerMediaThumbnail", "ComposerMediaChipAffordance"] {
            XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: demonte, in: corpus), 0,
                "`\(demonte)` n'a plus aucun appelant de production : le garder laisse des "
                + "témoins VERTS sur un contrôle que plus rien ne monte — c'est ce qui a "
                + "masqué #6577 pendant tout un lot.")
        }
    }
}
