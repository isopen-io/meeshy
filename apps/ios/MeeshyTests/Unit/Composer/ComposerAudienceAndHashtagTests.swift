import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #4636 — **l'audience se choisit dans une VUE, les hashtags existent, et les
/// mentions disent leur mode.**
///
/// Directive porteur du 2026-08-31 : « la vue audience existe ; au lieu du menu
/// contextuel ce devrait être une vue plein écran ou une feuille comme en `2l`,
/// avec la liste des types de notre application. À la section sélection mettre
/// plutôt mention si mention il y a, avec précision du mode. Puis une section
/// Hashtag, ainsi que l'outil hashtag dans la liste des outils. »
final class ComposerAudienceAndHashtagTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// **Les gardes lisent l'UNITÉ du meuble, jamais un fichier** (2026-09-01).
    ///
    /// `AppSourceGuard.composerHostSource()` concatène `MeeshyComposerHost.swift`,
    /// ses compagnons et tout `MeeshyComposerHost+*.swift`. Épingler un fichier
    /// précis rend la garde otage du prochain découpage : le budget de 1 100
    /// lignes en impose un régulièrement, et une garde qui ne trouve plus son
    /// ancre passe au vert en ne mesurant plus rien.
    private func hostUnit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // MARK: - Les hashtags sont DÉRIVÉS du texte

    func test_lesBalises_seLisentDansLeTexte_dansLOrdre() {
        XCTAssertEqual(ComposerHashtags.tags(in: "Un soir à #Lyon puis #paris"),
                       ["Lyon", "paris"])
    }

    /// **Comparées en minuscules, RENDUES telles qu'écrites.** Les afficher deux
    /// fois ferait croire à l'auteur qu'il en a posé deux.
    func test_uneBaliseRepetee_neParaitQuUneFois_sousSaPremiereForme() {
        XCTAssertEqual(ComposerHashtags.tags(in: "#Voyage et encore #voyage"), ["Voyage"])
    }

    /// **Les frontières, jumelles de celles des mentions.** Un `#` précédé d'un
    /// caractère de nom appartient à autre chose — une ancre d'URL, un identifiant.
    func test_unDieseColleAUnNom_nEstPasUneBalise() {
        XCTAssertTrue(ComposerHashtags.tags(in: "voir page#section").isEmpty)
        XCTAssertTrue(ComposerHashtags.tags(in: "ref a#b").isEmpty)
    }

    func test_unDieseSeul_neProduitRien() {
        XCTAssertTrue(ComposerHashtags.tags(in: "# et # encore").isEmpty)
    }

    /// L'outil ÉCRIT dans le texte : c'est ce qui garde la dérivation seule
    /// source. Une liste parallèle donnerait deux vérités.
    func test_lOutil_ecritDansLeTexte() {
        XCTAssertEqual(ComposerHashtags.inserting("voyage", into: "Bonjour"), "Bonjour #voyage")
        XCTAssertEqual(ComposerHashtags.inserting("voyage", into: ""), "#voyage")
        XCTAssertEqual(ComposerHashtags.inserting("#voyage", into: "Salut "), "Salut #voyage")
    }

    /// Insérer deux fois ne produit pas deux hashtags, seulement un texte qui
    /// bégaie — donc la seconde insertion est SANS EFFET, et le contrôle qui la
    /// propose ne doit pas exister (loi 4, tenue par `peutAjouter`).
    func test_uneBaliseDejaPosee_neSeReecritPas() {
        let texte = "Un soir #voyage"
        XCTAssertEqual(ComposerHashtags.inserting("Voyage", into: texte), texte)
    }

    func test_retirerUneBalise_emporteSonEspace() {
        XCTAssertEqual(ComposerHashtags.removing("voyage", from: "Un soir #voyage à Lyon"),
                       "Un soir à Lyon")
    }

    // MARK: - Ce que l'audience SERT, et ce qu'on refuse de prétendre

    func test_uneMentionHorsDUnOnly_estSignalee() {
        XCTAssertEqual(
            ComposerAudienceReach.resolve(mentionUserId: "u1", visibility: .only,
                                          audienceUserIds: ["u2"]),
            .excluded)
    }

    func test_uneMentionDansUnOnly_estServie() {
        XCTAssertEqual(
            ComposerAudienceReach.resolve(mentionUserId: "u1", visibility: .only,
                                          audienceUserIds: ["u1"]),
            .reaches)
    }

    /// `EXCEPT` renverse la question — et c'est le témoin qui prouve que la
    /// règle n'a pas été écrite une fois puis recopiée à l'envers.
    func test_uneMentionListeeDansUnExcept_estExclue() {
        XCTAssertEqual(
            ComposerAudienceReach.resolve(mentionUserId: "u1", visibility: .except,
                                          audienceUserIds: ["u1"]),
            .excluded)
        XCTAssertEqual(
            ComposerAudienceReach.resolve(mentionUserId: "u1", visibility: .except,
                                          audienceUserIds: ["u2"]),
            .reaches)
    }

    /// Une publication privée ne sert personne — la réponse ne dépend même pas
    /// de l'identifiant.
    func test_lePrive_neSertPersonne() {
        XCTAssertEqual(
            ComposerAudienceReach.resolve(mentionUserId: nil, visibility: .private,
                                          audienceUserIds: []),
            .excluded)
    }

    /// **LE témoin de retenue.** Le client ne connaît ni le graphe d'amitié ni
    /// l'appartenance aux communautés : prétendre savoir produirait un
    /// avertissement FAUX, et une garde qui parle quand elle ne sait pas ne se
    /// fait pas corriger — elle se fait ignorer, emportant les fois où elle
    /// avait raison.
    func test_surUnePorteeQueLeClientIgnore_onSeTait() {
        for mode in [PostVisibility.public, .community, .friends] {
            XCTAssertEqual(
                ComposerAudienceReach.resolve(mentionUserId: "u1", visibility: mode,
                                              audienceUserIds: []),
                .unknown, "\(mode) ne peut pas être tranché côté client")
            XCTAssertFalse(
                ComposerAudienceReach.resolve(mentionUserId: "u1", visibility: mode,
                                              audienceUserIds: []).warns)
        }
    }

    /// Sans identifiant, une audience nominative ne peut pas trancher non plus.
    func test_sansIdentifiant_uneAudienceNominative_seTait() {
        XCTAssertEqual(
            ComposerAudienceReach.resolve(mentionUserId: nil, visibility: .only,
                                          audienceUserIds: ["u1"]),
            .unknown)
    }

    /// Aucun « Public (0) » : le compteur ne paraît que là où il veut dire
    /// quelque chose.
    func test_leSousTitre_neFabriqueAucunCompteur() {
        let publique = ComposerAudienceSubtitle.subtitle(for: .public, selectedCount: 0)
        XCTAssertFalse(publique.contains("0"))
        XCTAssertTrue(ComposerAudienceSubtitle.subtitle(for: .only, selectedCount: 3).contains("3"))
    }

    // MARK: - La porte, et la feuille

    /// **L'outil hashtag est dans la liste des outils** — servi par le meuble,
    /// donc peint. Une porte absente du jeu servi n'est jamais peinte (loi 4).
    func test_laPorteHashtag_estServieParLeMeuble() {
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.hashtag))
    }

    /// Elle est de niveau PUBLICATION, donc elle vit dans la ligne canonique du
    /// bas — un hashtag classe ce qui part, il n'apparaît pas sur la scène.
    func test_leHashtag_appartientALaPublication_doncALaLigneCanonique() {
        XCTAssertEqual(ComposerRailDoor.hashtag.level, .publication)
        XCTAssertFalse(ComposerRailDoor.hashtag.level.appearsOnCanvas)
        XCTAssertTrue(ComposerSceneFloatingRail.lowRow(from: [.hashtag]).contains(.hashtag))
        XCTAssertFalse(ComposerSceneFloatingRail.sideRow(from: [.hashtag]).contains(.hashtag))
    }

    /// Elle a sa place dans l'ordre appris par les doigts, à côté de la mention
    /// — sa jumelle de dérivation.
    func test_leHashtag_estDansLOrdreCanonique_presDeLaMention() throws {
        let rail = ComposerRailDoor.canonicalRail
        let hashtag = try XCTUnwrap(rail.firstIndex(of: .hashtag))
        let mention = try XCTUnwrap(rail.firstIndex(of: .mention))
        XCTAssertEqual(hashtag, mention + 1)
    }

    /// **La pastille d'audience n'est PLUS un menu.** C'est la moitié du lot que
    /// seule une garde de source peut tenir : un `Menu` et un `Button` compilent
    /// tous deux, et tous deux réagissent au doigt.
    func test_laPastilleDAudience_ouvreLaFeuille_etNonUnMenu() throws {
        let code = compact(try hostUnit())
        guard let debut = code.range(of: "varaudienceChip:someView{")?.upperBound else {
            return XCTFail("`audienceChip` est introuvable — re-pointer la garde.")
        }
        let corps = String(code[debut...].prefix(400))
        XCTAssertTrue(corps.contains("presentedPortal=.audience"),
                      "La pastille doit ouvrir la vue `2l` par le portail du meuble.")
        XCTAssertFalse(corps.hasPrefix("Menu{"),
                       "Le menu contextuel est revenu : il liste des choix sans jamais "
                       + "montrer leurs conséquences, ce qui est tout ce que cet écran a à dire.")
    }

    /// **La feuille sert les types de l'APPLICATION**, pas les quatre libellés
    /// de la planche — recopier « Abonnés / Amis proches » aurait donné un écran
    /// juste à l'œil et faux à l'envoi.
    func test_laFeuille_sertLesTypesDeLApplication() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("offered:offeredAudiences"),
                      "`offeredAudiences` applique `ComposerAudienceOffer`, qui retire ce "
                      + "qu'une republication ne peut pas élargir.")
        XCTAssertTrue(code.contains("references:composerReferences"))
        XCTAssertTrue(code.contains("hashtags:composerHashtags"))
    }

    /// **Le sélecteur de personnes passe par une INTENTION**, comme
    /// l'importateur de fichiers : sans elle, choisir « Seulement… » depuis la
    /// feuille n'ouvrirait rien — le défaut exact que #4632 vient de fermer.
    func test_leSelecteurDePersonnes_attendLaFermetureDeLaFeuille() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("pendingAudiencePicker=mode"))
        XCTAssertTrue(code.contains("presentedPortal=nil"))
        let reprise = compact(try hostUnit())
        XCTAssertTrue(reprise.contains("audiencePickerMode=mode"),
                      "La reprise doit ouvrir le picker APRÈS la fermeture — une seule "
                      + "reprise pour les deux présentations, sans quoi une troisième "
                      + "s'en dispenserait en silence.")
    }

    /// **Une seule dérivation des balises dans tout le meuble.** Deux motifs
    /// voisins divergeraient sur un cas limite, et l'écran montrerait une balise
    /// que l'envoi n'emporte pas.
    func test_lesBalises_neSontDeriveesQuUneFois() throws {
        let audience = try hostUnit()
        let occurrences = audience.components(separatedBy: "ComposerHashtags.tags(in:").count - 1
        XCTAssertEqual(occurrences, 1,
                       "`composerHashtags` est le site unique — la feuille et le sélecteur "
                       + "le lisent, ils ne le recalculent pas.")
    }
}
