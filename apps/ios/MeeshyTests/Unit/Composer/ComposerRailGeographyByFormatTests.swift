import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **La place d'un outil dépend de DEUX termes : l'outil ET le format** (#4893,
/// directive porteur 2026-09-02).
///
/// > « Il faut placer l'outil géolocalisation, hashtag, corpus de texte et
/// > mention à GAUCHE lorsqu'on est en mode Story afin de fixer chaque position
/// > à chaque story, et on laisse en bas pour chaque Réel et Post. À la place de
/// > paragraphe c'est donc le corpus de texte qu'on doit afficher en mode
/// > story. »
///
/// ## Ce que ce lot change dans le modèle
///
/// `ComposerRailDoor.level` était une fonction du seul outil — un `switch`
/// exhaustif sur `self`. Elle devient une fonction du couple, et la raison est
/// dans la directive elle-même : **en Story ces quatre outils POSENT quelque
/// chose de positionnable** (« fixer chaque position à chaque story »), donc
/// niveau OBJET, donc rail gauche. En Réel et en Post ils QUALIFIENT la
/// publication, donc rangée canonique.
///
/// ## Pourquoi le témoin porte sur la RÈGLE et jamais sur une liste
///
/// La leçon est déjà écrite dans `ComposerSceneFloatingRail` : un littéral
/// `[.text, .sticker, .sound, .mention]` y doublait la classification et la
/// contredisait, et seule la copie était appelée. Un témoin qui recopierait la
/// répartition attendue referait la même faute d'un cran — il gèlerait une
/// géographie au lieu de vérifier celle que la règle produit. Tout ce qui suit
/// interroge donc `level(for:)` et les deux rangées qui en dérivent.
final class ComposerRailGeographyByFormatTests: XCTestCase {

    /// Les quatre outils que la directive DÉPLACE, nommés une fois.
    /// **`.text` a quitté cette liste** (directive porteur 2026-09-05 : « mettre
    /// sur la rangée colonne gauche toutes les modifications spécifiques à la
    /// scène et non à la publication de type Post »).
    ///
    /// Il basculait par format depuis #4893, et la MESURE a tranché contre la
    /// bascule : `handleRailDoor(.text)` appelle `viewModel.addText()` puis
    /// ouvre l'éditeur d'objet — quel que soit le format. Un objet texte se
    /// pose, se déplace, se pince et se tourne sur la scène d'un POST
    /// exactement comme sur celle d'une Story.
    ///
    /// > La porte était rangée en bas d'après ce que le format LAISSAIT croire,
    /// > jamais d'après ce qu'elle FAIT. Le corps du post a sa propre porte
    /// > (`.content`) depuis #4890 ; c'est elle qui qualifie la publication, et
    /// > son existence rend le classement de `.text` en `.publication` non
    /// > seulement faux mais inutile.
    ///
    /// Trois outils basculent donc encore, et le témoin `.text` de la bascule
    /// est devenu un témoin de la NON-bascule, juste en-dessous.
    private let outilsMobiles: [ComposerRailDoor] = [.place, .hashtag, .mention]

    /// Ce qui ne bouge pas : la matière qu'on pose (média, son, sticker), le
    /// dessin qui ouvre un mode, et la description qui vise la slide.
    private let outilsFixes: [ComposerRailDoor] = [.media, .sound, .sticker, .drawing, .description]

    // MARK: - Le niveau

    func test_level_enStory_lesQuatreOutilsSePosentSurLaScene() {
        for porte in outilsMobiles {
            XCTAssertEqual(porte.level(for: .story), .object,
                           "\(porte.rawValue) doit être positionnable en Story")
            XCTAssertTrue(porte.level(for: .story).appearsOnCanvas,
                          "\(porte.rawValue) doit rejoindre le rail gauche en Story")
        }
    }

    func test_level_horsStory_lesTroisOutilsQualifientLaPublication() {
        for format in [ComposerFormat.reel, .post, .status] {
            for porte in outilsMobiles {
                XCTAssertEqual(porte.level(for: format), .publication,
                               "\(porte.rawValue) doit rester en bas en \(format)")
            }
        }
    }

    /// **Le corpus de texte POSE, dans TOUS les formats** — la contre-épreuve
    /// de la liste ci-dessus. Sans ce témoin, retirer `.text` d'`outilsMobiles`
    /// aurait fait DISPARAÎTRE sa couverture au lieu de la déplacer : la
    /// suppression d'un cas d'une boucle ne laisse aucune trace rouge.
    func test_level_leTexte_seposeSurLaScene_quelQueSoitLeFormat() {
        for format in [ComposerFormat.story, .reel, .post, .status] {
            XCTAssertEqual(ComposerRailDoor.text.level(for: format), .object,
                           "un objet texte se pose sur la scène d'un \(format) comme sur celle d'une Story")
        }
    }

    /// **Un témoin de bascule s'écrit sur ce qui NE bascule PAS aussi.** Sans
    /// lui, rendre `.object` pour tout en Story passerait au vert.
    func test_level_laMatiereEtLeDessinNeChangentJamaisDeCote() {
        for format in ComposerFormat.allComposable {
            XCTAssertEqual(ComposerRailDoor.media.level(for: format), .object, "\(format)")
            XCTAssertEqual(ComposerRailDoor.sound.level(for: format), .object, "\(format)")
            XCTAssertEqual(ComposerRailDoor.sticker.level(for: format), .object, "\(format)")
            XCTAssertEqual(ComposerRailDoor.drawing.level(for: format), .scene, "\(format)")
            XCTAssertEqual(ComposerRailDoor.description.level(for: format), .slide, "\(format)")
        }
    }

    // MARK: - Les deux rangées

    func test_sideRow_enStory_porteLesQuatreOutilsDeplaces() {
        let gauche = ComposerSceneFloatingRail.sideRow(from: ComposerRailDoor.canonicalRail,
                                                       format: .story)
        for porte in outilsMobiles {
            XCTAssertTrue(gauche.contains(porte), "\(porte.rawValue) manque au rail gauche en Story")
        }
    }

    func test_lowRow_enPost_porteLesTroisOutilsDeplaces() {
        let bas = ComposerSceneFloatingRail.lowRow(from: ComposerRailDoor.canonicalRail,
                                                   format: .post)
        for porte in outilsMobiles {
            XCTAssertTrue(bas.contains(porte), "\(porte.rawValue) manque à la rangée du bas en Post")
        }
    }

    /// La partition tient sur CHAQUE format — c'est la propriété qui empêche
    /// qu'une porte se perde entre deux rangées ou s'y montre deux fois.
    func test_lesDeuxRangeesFormentUnePartition_surChaqueFormat() {
        for format in ComposerFormat.allComposable {
            let toutes = ComposerRailDoor.canonicalRail
            let gauche = ComposerSceneFloatingRail.sideRow(from: toutes, format: format)
            let bas = ComposerSceneFloatingRail.lowRow(from: toutes, format: format)
            XCTAssertEqual(gauche.count + bas.count, toutes.count, "\(format)")
            XCTAssertTrue(Set(gauche).isDisjoint(with: Set(bas)), "\(format)")
            XCTAssertEqual(Set(gauche).union(bas), Set(toutes), "\(format)")
        }
    }

    /// **La bascule doit se VOIR** : les deux rangées d'une Story et celles d'un
    /// Post ne peuvent pas être identiques, sinon la règle ne fait rien.
    func test_laGeographieDunePostEtDuneStorySontDifferentes() {
        let toutes = ComposerRailDoor.canonicalRail
        XCTAssertNotEqual(ComposerSceneFloatingRail.sideRow(from: toutes, format: .story),
                          ComposerSceneFloatingRail.sideRow(from: toutes, format: .post))
    }

    // MARK: - Ce que chaque format OFFRE

    /// « À la place de paragraphe c'est donc le corpus de texte qu'on doit
    /// afficher en mode story. »
    func test_offered_enStory_pasDeParagraphe_maisLeCorpusDeTexte() {
        let offertes = ComposerRailDoor.offered(served: Set(ComposerRailDoor.canonicalRail),
                                                format: .story, allowsCapture: true)
        XCTAssertFalse(offertes.contains(.description),
                       "le paragraphe n'a pas de place en Story — la description y EST le contenu")
        XCTAssertTrue(offertes.contains(.text),
                      "le corpus de texte prend sa place")
    }

    /// **La légende a quitté le RAIL pour sa propre pastille** (2026-09-06).
    ///
    /// Ce témoin exigeait `.description` parmi les portes OFFERTES en post et en
    /// reel. Elle n'est plus dans `canonicalRail` : posée à droite avec les
    /// actions, elle portait ce groupe à cinq pastilles sur 402 pt, et la mesure
    /// a montré le sélecteur d'audience tronqué en « F », l'icône à moitié sous
    /// la flèche. **Un ATTRIBUT rangé parmi les ACTIONS déborde.** Elle vit
    /// désormais du côté qui QUALIFIE, avec le type — `atelierDescriptionButton`.
    ///
    /// > La question n'est pas « la porte est-elle dans le rail ? » mais **« la
    /// > légende est-elle ATTEIGNABLE ? »**. La première formulation interdit le
    /// > déménagement qui vient de corriger un débordement mesuré ; la seconde
    /// > le laisse passer et attrape toujours le vrai défaut — une légende
    /// > qu'aucun geste n'ouvre.
    func test_laLegendeDuCanvas_resteAtteignable_horsDuRail() throws {
        let hote = try AppSourceGuard.stripComments(AppSourceGuard.composerHostSource())
        // **Le doc-comment ci-dessus avait raison avant l'heure.** « La question
        // n'est pas “la porte est-elle dans le rail ?” mais “la légende est-elle
        // ATTEIGNABLE ?” » — et l'assertion, elle, citait quand même une
        // IMPLÉMENTATION : le drapeau posé en ligne. #6126 a retiré ce drapeau
        // des portes (il constate la frappe, il ne l'ouvre plus) et la garde a
        // rougi en annonçant une légende inatteignable qui ne l'était pas.
        //
        // > Une garde peut nommer la bonne question dans sa prose et la
        // > trahir dans son assertion. C'est la prose qu'il faut suivre.
        XCTAssertTrue(hote.contains("openSceneDescriptionEditing()"),
                      "aucun geste n'ouvre plus la légende du canvas — elle est devenue inatteignable")
        XCTAssertTrue(hote.contains("var atelierDescriptionButton: some View"),
                      "la pastille qui l'ouvre a disparu : la légende n'a plus de porte du tout")
        XCTAssertFalse(ComposerRailDoor.canonicalRail.contains(.description),
                       "si la légende revient au rail, ce témoin doit redevenir celui du rail — et la mesure "
                           + "du débordement à cinq pastilles doit être refaite avant.")
    }

    /// Le `status` n'a pas de toile : la règle de `offered` ne doit pas se
    /// laisser contredire par la bascule — aucune porte de niveau objet n'y
    /// survit, et les quatre outils déplacés y sont justement `.publication`.
    func test_offered_enStatus_aucunePorteNapparaitSurLaToile() {
        let offertes = ComposerRailDoor.offered(served: Set(ComposerRailDoor.canonicalRail),
                                                format: .status, allowsCapture: true)
        for porte in offertes {
            XCTAssertFalse(porte.level(for: .status).appearsOnCanvas,
                           "\(porte.rawValue) apparaît sur une toile qui n'existe pas")
        }
    }

    // MARK: - #6131 · Le rail flottant défile quand il ne tient pas

    /// **Une pile trop haute n'est pas clippée : elle DESSINE par-dessus les
    /// bords.**
    ///
    /// Mesuré au simulateur le 2026-09-12 : clavier levé, la colonne du meuble
    /// tombe à ~408 pt quand neuf portes en demandent `9 × 44 + 8 × 10 = 476`.
    /// La pastille `@` se peignait sur « Public », le `#` passait sous le
    /// clavier. C'est le même débordement arithmétique que la rangée
    /// horizontale corrige depuis #4582 — transposé à la verticale.
    ///
    /// Le témoin lit la SOURCE parce que le rail n'est pas mesurable sans le
    /// monter, et qu'il n'y a rien à calculer : ce qui se garde est la présence
    /// des deux variantes et le fait que le choix entre elles soit une question
    /// de PLACE (`ViewThatFits`) et non d'état.
    func test_leRailVertical_defileQuandIlNeTientPas() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerLeadingRail.swift"))
        let compacte = code.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertGreaterThan(code.count, 500, "source du rail vide — la garde ne garde rien")
        XCTAssertTrue(compacte.contains("ViewThatFits(in:.vertical)"),
                      "Le rail vertical doit CHOISIR entre tenir et défiler (#6131).")
        XCTAssertTrue(compacte.contains("ScrollView(.vertical,showsIndicators:false)"),
                      "… et la seconde variante doit être un vrai défilement.")
        XCTAssertTrue(compacte.contains("axis==.vertical&&!pushesToThumb"),
                      "Le rail à RESSORT en est exclu : son `Spacer` flexible tient toujours, "
                        + "donc `ViewThatFits` y choisirait éternellement la première variante.")
    }
}
