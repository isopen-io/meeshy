import XCTest
@testable import Meeshy

/// #4062 — le rail *leading* porte les PORTES, celles qui font ENTRER de la
/// matière (planche rév. 27 § P4, loi 12).
///
/// ## Pourquoi une énumération de plus, alors que `ComposerDocumentTool` existe
///
/// Parce que les deux répondent à des questions différentes, et les confondre
/// aurait produit une rangée qui ment. `ComposerDocumentTool` parle le
/// vocabulaire du **document** — photo, caméra, fichier sont TROIS façons
/// d'attacher un fichier à un texte, et `emoji` insère dans le texte. Le rail
/// parle le vocabulaire de la **scène** — « média » est UNE porte quelle que
/// soit la source, « sticker » pose un objet, et « description » ne pose rien
/// du tout.
///
/// Ce que le rail réemploie, ce sont les EFFETS et les chemins d'ingestion
/// existants ; ce qu'il n'emprunte pas, c'est un découpage écrit pour un autre
/// écran.
///
/// ## Le fait que ces témoins gravent
///
/// **Les portes n'agissent pas toutes sur le même niveau du modèle**, et c'est
/// la seule chose qu'un lecteur pressé confondra :
///
/// | porte | niveau |
/// |---|---|
/// | média · son · sticker · lieu | crée un `MeeshyObject` |
/// | description | vise la `MeeshySlide` |
/// | **mention** | vise la **`MeeshyPublication`** |
///
/// La troisième ligne a été MESURÉE, pas supposée : le kind `mention` est
/// déclaré au contrat et produit par personne, et l'outil livré ouvre une
/// feuille de MODE (`INLINE` / `NOTE` / `SILENT`) dont le résultat voyage en
/// `CreatePostRequest.mentions` — une liste de la publication, jamais un objet
/// de la scène.
final class ComposerRailDoorTests: XCTestCase {

    // MARK: - Les niveaux du modèle

    func test_quatrePortes_creentUnObjetDeScene() {
        for porte in [ComposerRailDoor.media, .sound, .sticker, .place] {
            XCTAssertEqual(porte.level, .object, "\(porte.rawValue)")
        }
    }

    func test_laDescription_viseLaSlide_etNeCreeAucunObjet() {
        XCTAssertEqual(ComposerRailDoor.description.level, .slide)
    }

    /// **Le point que ce lot a mesuré plutôt que supposé.** L'issue annonçait
    /// une porte qui poserait un `MeeshyObject` de kind `mention` — ce qui
    /// aurait été un contrôle SANS EFFET, ce kind n'ayant aucun producteur et
    /// étant jeté à la relecture. La porte livrée vise la publication.
    func test_laMention_viseLaPublication_pasUnObjetDeScene() {
        XCTAssertEqual(ComposerRailDoor.mention.level, .publication,
                       "Une mention voyage en `CreatePostRequest.mentions`, jamais comme objet de scène.")
    }

    /// Aucune porte ne doit rester sans niveau : le `switch` est exhaustif au
    /// compilateur, ce témoin garde qu'aucune n'a été rangée par défaut.
    func test_chaquePorte_declareSonNiveau() {
        for porte in ComposerRailDoor.allCases {
            XCTAssertTrue([.publication, .slide, .object].contains(porte.level), porte.rawValue)
        }
    }

    // MARK: - L'ordre, qui est un contrat de mémoire musculaire

    func test_lOrdreDuRail_estCeluiDeLaPlanche() {
        XCTAssertEqual(ComposerRailDoor.canonicalRail,
                       [.description, .media, .sound, .sticker, .mention, .place])
    }

    func test_leRailCanonique_neManqueAucunePorte() {
        XCTAssertEqual(Set(ComposerRailDoor.canonicalRail),
                       Set(ComposerRailDoor.allCases),
                       "Une porte déclarée hors du rail canonique ne serait jamais peinte.")
    }

    // MARK: - Loi 4 : une porte non servie est ABSENTE

    func test_unePorteQueLHoteNeSertPas_estAbsente() {
        let offertes = ComposerRailDoor.offered(
            served: [.description, .media], format: .story, allowsCapture: true)
        XCTAssertEqual(offertes, [.description, .media])
    }

    func test_lOrdreSurvit_auxPortesRetirees() {
        let offertes = ComposerRailDoor.offered(
            served: [.place, .description, .sound], format: .story, allowsCapture: true)
        XCTAssertEqual(offertes, [.description, .sound, .place],
                       "L'ordre du rail ne se recompose pas au gré de ce qui reste.")
    }

    // MARK: - Le mood n'a pas de scène

    /// Un mood est une carte unique SANS scène (`ComposerProfile` : ni slides ni
    /// timeline). Les portes de niveau OBJET n'y ont donc rien à poser — elles
    /// sont absentes, pas grisées.
    func test_enMood_aucunePorteDObjet_nEstOfferte() {
        let offertes = ComposerRailDoor.offered(
            served: Set(ComposerRailDoor.allCases), format: .status, allowsCapture: true)
        XCTAssertFalse(offertes.contains { $0.level == .object },
                       "Un mood n'a pas de scène : rien à y poser.")
        XCTAssertEqual(offertes, [.description, .mention],
                       "…et les deux portes qui ne visent pas la scène restent.")
    }

    func test_dansLesTroisFormatsAScene_lesPortesDObjet_sontOffertes() {
        for format in [ComposerFormat.story, .post, .reel] {
            let offertes = ComposerRailDoor.offered(
                served: Set(ComposerRailDoor.allCases), format: format, allowsCapture: true)
            XCTAssertEqual(offertes, ComposerRailDoor.canonicalRail, "\(format)")
        }
    }

    // MARK: - La capture ne gouverne PAS la porte média

    /// **Distinction mesurée sur le code existant.** `allowsCapture` retire la
    /// CAMÉRA (`ComposerDocumentToolPolicy.visibleTools`), pas l'accès aux
    /// médias : la photothèque et l'importateur restent ouverts à un repost ou
    /// à une édition. Le rail n'ayant qu'UNE porte « média » pour les trois
    /// sources, la gater sur `allowsCapture` retirerait la bibliothèque avec la
    /// caméra — un contenu que l'auteur peut légitimement ajouter.
    func test_sansCapture_laPorteMedia_resteOfferte() {
        let offertes = ComposerRailDoor.offered(
            served: Set(ComposerRailDoor.allCases), format: .post, allowsCapture: false)
        XCTAssertTrue(offertes.contains(.media),
                      "Refuser la caméra ne referme pas la photothèque.")
    }

    // MARK: - Iconographie

    func test_chaquePorte_aSonGlyphe_etAucunNEstPartage() {
        let glyphes = ComposerRailDoor.allCases.map(\.symbolName)
        XCTAssertFalse(glyphes.contains(where: \.isEmpty))
        XCTAssertEqual(Set(glyphes).count, glyphes.count,
                       "Deux portes qui partagent un glyphe sont deux verbes qu'on ne distingue pas (loi 7).")
    }
}

/// La VUE du rail — trois faits qu'un rendu ne prouverait pas plus vite, et que
/// seule la source oppose (#4062).
final class ComposerLeadingRailSourceGuardTests: XCTestCase {

    private func railSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerLeadingRail.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Sans lui, les gardes qui suivent seraient vertes par
    /// omission le jour où le fichier bouge.
    func test_laSourceDuRail_estLisibleEtNonVide() throws {
        let source = try railSource()
        XCTAssertGreaterThan(source.count, 800)
        XCTAssertTrue(source.contains("struct ComposerLeadingRail"))
    }

    /// **Le rail ne nomme JAMAIS un côté.** En arabe les deux s'échangent : un
    /// `.leading` codé en `.left` mettrait les portes du côté des contrôleurs.
    /// Cette garde rougit sur le retour du vocabulaire absolu.
    func test_leRail_neNommeAucunCoteAbsolu() throws {
        let source = compact(try railSource())
        for interdit in [".left)", ".right)", "alignment:.left", "alignment:.right",
                         "edge:.left", "edge:.right"] {
            XCTAssertFalse(source.contains(interdit),
                           "`\(interdit)` : un côté ABSOLU se retourne en RTL.")
        }
    }

    /// **Ancré en BAS.** Un `Spacer` en TÊTE du `VStack` pousse les portes vers
    /// le bas ; le retirer les recentrerait et remettrait les portes hautes
    /// hors de portée du pouce sur le côté LOIN de la main.
    func test_lesPortes_sontPousseesVersLeBas() throws {
        let source = compact(try railSource())
        XCTAssertTrue(source.contains("Spacer(minLength:0)ForEach(doors"),
                      "Le ressort doit PRÉCÉDER les portes : c'est lui qui les ancre en bas.")
    }

    /// **La vue ne décide de rien.** Elle reçoit `doors` déjà filtrées ; si elle
    /// se mettait à filtrer, une seconde loi 4 naîtrait et les deux
    /// divergeraient.
    func test_laVue_neRefiltrePasLesPortes() throws {
        let source = compact(try railSource())
        XCTAssertFalse(source.contains("ComposerRailDoor.offered("),
                       "Le filtrage appartient à la règle, jamais à la vue.")
    }

    /// La cible touchable vaut la largeur du rail — 44 pt —, indépendamment de
    /// la taille du glyphe.
    func test_laCibleTouchable_vientDeLaRegleDeGeometrie() throws {
        let source = compact(try railSource())
        XCTAssertTrue(source.contains("width:ComposerRailGeometry.railWidth,height:ComposerRailGeometry.railWidth"),
                      "La cible se lit de la règle, jamais d'un littéral.")
        XCTAssertTrue(source.contains(".contentShape(Rectangle())"),
                      "Sans forme de contenu, la zone touchable retombe sur le dessin du glyphe.")
    }

    /// VoiceOver entend le VERBE, pas le glyphe (loi 7).
    func test_chaquePorte_aUnLibelleVoiceOver() {
        for door in ComposerRailDoor.allCases {
            XCTAssertFalse(ComposerRailCopy.label(door).isEmpty, door.rawValue)
        }
        XCTAssertEqual(Set(ComposerRailDoor.allCases.map(ComposerRailCopy.label)).count,
                       ComposerRailDoor.allCases.count,
                       "Deux portes qui s'annoncent pareil sont indiscernables à VoiceOver.")
    }
}
