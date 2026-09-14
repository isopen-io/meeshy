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
        let source = try hostSource()
        guard let corps = body(after: "func handleTrailingRailAction(", in: source)
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

    /// **Le TROISIÈME geste, absent du cadrage de ce lot.** L'appui long sur un
    /// fond ouvre un menu dont « Supprimer » retombait, lui aussi, sur le seul
    /// `viewModel.deleteElement(id:)` (#5041). Il n'a jamais figuré dans
    /// l'inventaire des portes de suppression parce qu'il est arrivé après
    /// elles — le mode d'oubli que le dépôt nomme déjà : « une règle qui naît
    /// hors de l'unité de son hôte naît hors de toutes les gardes ».
    func test_leMenuDuFond_passeParLePointUnique() throws {
        let source = try hostSource()
        guard let corps = body(after: "func applyBackgroundMenu(", in: source).map(compact) else {
            return XCTFail("`applyBackgroundMenu(` introuvable — la garde ne mesurerait rien")
        }
        guard let suppression = corps.range(of: "case.delete:") else {
            return XCTFail("La branche `.delete` du menu de fond est introuvable")
        }
        let branche = String(corps[suppression.upperBound...].prefix(200))
        XCTAssertTrue(branche.contains("retractMedia("),
            "Supprimer un FOND depuis son menu retire l'objet du modèle et laisse son fichier "
            + "dans la charge : le même défaut que le rail trailing, par une porte de plus.")
    }

    /// La corbeille du rail de scènes ne connaît qu'un INDEX. `retractScene(at:)`
    /// est l'adaptateur qui le traduit en identités — la scène et les objets
    /// qu'elle porte — puis appelle le point d'entrée unique. Un adaptateur,
    /// jamais un second retrait : c'est ce que le second témoin ci-dessous
    /// vérifie.
    func test_laCorbeilleDuRailDeScenes_passeParLePointUnique() throws {
        let source = try hostSource()
        let compacte = compact(source)
        XCTAssertFalse(compacte.contains("onDelete:{viewModel.removeSlide(at:$0)}"),
            "La corbeille du rail de scènes appelle `removeSlide` en DIRECT : elle retire la "
            + "page de l'écran et laisse son fichier dans `documentLocalMedia`.")
        XCTAssertTrue(compacte.contains("onDelete:{retractScene(at:$0)}"),
            "La corbeille du rail de scènes doit passer par l'adaptateur du meuble — "
            + "le seul lieu qui voie les DEUX porteurs.")
        guard let corps = body(after: "func retractScene(", in: source).map(compact) else {
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
        // Le corpus est DÉPOUILLÉ de ses commentaires : la pierre tombale qui dit
        // pourquoi ces deux types sont partis les NOMME, et c'est sa raison d'être.
        // Une garde qui compte dans les commentaires interdirait d'expliquer un
        // retrait à l'endroit où l'explication sert.
        let corpus = fichiers
            .filter { $0.pathExtension == "swift" }
            .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
            .map(AppSourceGuard.stripComments)
            .joined(separator: "\n")
        for demonte in ["ComposerMediaThumbnail", "ComposerMediaChipAffordance"] {
            XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: demonte, in: corpus), 0,
                "`\(demonte)` n'a plus aucun appelant de production : le garder laisse des "
                + "témoins VERTS sur un contrôle que plus rien ne monte — c'est ce qui a "
                + "masqué #6577 pendant tout un lot.")
        }
    }

    // MARK: - LA CHARGE, de bout en bout — le symptôme du porteur, rejoué

    private func media(_ nom: String) -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/composer-\(nom).jpg"),
                              mimeType: "image/jpeg", durationMs: nil)
    }

    /// Le brouillon que la flèche remet, composé des MÊMES porteurs que le
    /// meuble lui passe (`MeeshyComposerHost+Draft.documentDraft`) — dont
    /// `altsBySourceURL`, la projection que le meuble sert sous le nom
    /// `altsParURLSource`. La réécrire ici en aurait fait une jumelle.
    private func brouillon(_ porteurs: ComposerMediaPorters) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post, forcePlainPost: true, text: "", visibility: .public,
            visibilityUserIds: [], repostOfId: nil,
            localMedia: porteurs.localMedia, location: nil,
            discoverabilityPrecision: nil, originalLanguage: nil,
            mobileTranscription: nil, references: [], storyEffects: nil,
            mediaCaptions: porteurs.captions,
            mediaAlts: porteurs.altsBySourceURL,
            mediaObjectIds: porteurs.objectIdBySource,
            allowSoundExtraction: nil)
    }

    private func porteursAvec(_ fichier: ComposerDocumentMedia,
                              objet: String,
                              scene: String) -> ComposerMediaPorters {
        ComposerMediaPorters(
            localMedia: [fichier],
            roleByURL: [fichier.url: .background],
            slideIdByMediaURL: [fichier.url: scene],
            objectIdBySource: [fichier.url: objet],
            captions: [fichier.url: "la légende de \(objet)"],
            altsByObjectId: [objet: "l'alternative de \(objet)"],
            transcriptions: [:],
            railPosedURLs: [fichier.url])
    }

    /// **« Je supprime un média et rechoisit un autre : au moment de publier,
    /// c'est l'ancien qui a été supprimé qui est publié »** (porteur, 2026-09-14).
    ///
    /// Le geste, rejoué sur la CHARGE — pas sur l'écran, qui disait vrai.
    func test_choisirA_retirerA_choisirB_laChargeNeParlePlusDeA() {
        let a = media("A")
        let b = media("B")

        let retrait = ComposerMediaRetraction.retracting(
            porteursAvec(a, objet: "objet-A", scene: "scene-1"),
            objectIds: ["objet-A"], slideId: nil)

        var apresB = retrait.porteurs
        apresB.localMedia.append(b)
        apresB.roleByURL[b.url] = .background
        apresB.slideIdByMediaURL[b.url] = "scene-2"
        apresB.objectIdBySource[b.url] = "objet-B"
        apresB.captions[b.url] = "la légende de objet-B"
        apresB.altsByObjectId["objet-B"] = "l'alternative de objet-B"

        let charge = brouillon(apresB)

        XCTAssertEqual(charge.localMedia.map(\.url), [b.url],
            "Le brouillon téléverse encore A : c'est LUI que le gateway grave à `order: 0`, "
            + "donc en COUVERTURE de la publication (#6577).")
        XCTAssertNil(charge.mediaCaptions[a.url], "La légende de A voyage encore")
        XCTAssertNil(charge.mediaAlts[a.url], "L'alternative de A voyage encore")
        XCTAssertNil(charge.mediaObjectIds[a.url], "Le pont d'objet de A voyage encore")

        // Le voisin n'est pas emporté : un retrait qui nettoie TROP est l'autre
        // moitié du même défaut.
        XCTAssertEqual(charge.mediaCaptions[b.url], "la légende de objet-B")
        XCTAssertEqual(charge.mediaAlts[b.url], "l'alternative de objet-B")

        // Un cran plus bas : ce que TUS monte, et qui devient les `mediaIds`.
        let intention = PublishIntent.document(
            localMedia: charge.localMedia, declaredType: nil,
            forcePlainPost: charge.forcePlainPost, content: charge.text,
            visibility: charge.visibility.rawValue,
            visibilityUserIds: charge.visibilityUserIds,
            originalLanguage: charge.originalLanguage, mentions: charge.mentions,
            location: charge.location,
            discoverabilityPrecision: charge.discoverabilityPrecision,
            transcription: charge.mobileTranscription, storyEffects: charge.storyEffects,
            mediaCaptions: charge.mediaCaptions, mediaAlts: charge.mediaAlts,
            mediaObjectIds: charge.mediaObjectIds,
            allowSoundExtraction: charge.allowSoundExtraction)
        XCTAssertEqual(intention.localMediaURLs, [b.url],
            "L'intention publiée monte encore le fichier retiré — le fantôme part au TUS.")

        XCTAssertEqual(retrait.retiredURLs, [a.url],
            "Le registre de pré-montée doit oublier EXACTEMENT A, sinon son `PostMedia` "
            + "reste orphelin côté serveur.")
        XCTAssertEqual(retrait.retiredObjectIds, ["objet-A"])
    }

    /// **Le même fichier doit pouvoir REVENIR.** `mediaRoleByURL` et
    /// `railPosedMediaURLs` sont aussi des gardes d'idempotence : survivant à
    /// leur média, elles font sauter en silence la re-pose du même fichier —
    /// « je le supprime, je le rechoisis, il n'apparaît plus ».
    func test_leMemeFichier_peutRevenir_apresSonRetrait() {
        let a = media("A")
        let retrait = ComposerMediaRetraction.retracting(
            porteursAvec(a, objet: "objet-A", scene: "scene-1"),
            objectIds: ["objet-A"], slideId: nil)

        XCTAssertNil(retrait.porteurs.roleByURL[a.url],
            "Le rôle survit à son média : la re-pose du même fichier sera SAUTÉE.")
        XCTAssertFalse(retrait.porteurs.railPosedURLs.contains(a.url),
            "La marque du rail survit à son média : la porte du prochain fichier sera fausse.")
        XCTAssertNil(retrait.porteurs.slideIdByMediaURL[a.url])
    }

    /// **Jeter une SCÈNE nomme une scène, pas un fichier.** L'URL se déduit de
    /// l'index des fondations, et l'objet né de ce fichier part avec elle — même
    /// si l'appelant ne l'avait pas nommé.
    func test_jeterUneScene_emporteSonFond_etLObjetQuiEnEstNe() {
        let a = media("A")
        let retrait = ComposerMediaRetraction.retracting(
            porteursAvec(a, objet: "objet-A", scene: "scene-1"),
            objectIds: [], slideId: "scene-1")

        XCTAssertTrue(retrait.porteurs.localMedia.isEmpty,
            "La scène part de l'écran et son fichier reste dans la charge — le défaut #6577.")
        XCTAssertEqual(retrait.retiredURLs, [a.url])
        XCTAssertEqual(retrait.retiredObjectIds, ["objet-A"],
            "L'objet né du fond n'est nommé par personne : c'est la règle qui doit le déduire.")
        XCTAssertTrue(retrait.porteurs.altsByObjectId.isEmpty,
            "L'alternative de cet objet s'accrocherait au PROCHAIN fichier posé sous le même "
            + "identifiant.")
    }

    /// Un objet sans fichier — un texte, une pastille — ne retire rien des
    /// porteurs et descend tel quel au SDK. C'est le cas nominal du rail
    /// trailing, qui supprime surtout des objets qui ne sont aucun média.
    func test_unObjetSansFichier_neRetireRienDesPorteurs() {
        let a = media("A")
        let porteurs = porteursAvec(a, objet: "objet-A", scene: "scene-1")
        let retrait = ComposerMediaRetraction.retracting(
            porteurs, objectIds: ["un-texte"], slideId: nil)

        XCTAssertEqual(retrait.porteurs, porteurs,
            "Supprimer un objet de texte ne doit toucher AUCUN porteur de média.")
        XCTAssertTrue(retrait.retiredURLs.isEmpty)
        XCTAssertEqual(retrait.retiredObjectIds, ["un-texte"],
            "L'objet doit quand même descendre au SDK — sinon le geste n'a plus d'effet.")
    }
}
