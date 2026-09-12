import XCTest
@testable import Meeshy
import MeeshyUI

/// #4124 — **la scène de l'atelier se centre, respire, et sa description
/// s'écrit par-dessus.**
///
/// Quatre demandes du porteur, et trois d'entre elles se prouvent par une RÈGLE
/// plutôt que par un pixel : le cadrage (`StoryCanvasFraming`, éprouvé côté
/// SDK), la place du chip (`ComposerFormatFanPlacement`) et le fait que la
/// description ne prenne plus de place au repos. La quatrième — le flou et le
/// bouton au-dessus du clavier — est une STRUCTURE de vue, d'où les gardes de
/// source qui suivent.
final class ComposerAtelierHeaderTests: XCTestCase {

    // MARK: - La place du chip de type

    /// Le résultat attendu, dit par la règle : le chip descend dans la rangée
    /// de l'atelier, contre la fermeture.
    func test_lAtelier_porteLeChipDansSaRangee() {
        XCTAssertEqual(ComposerFormatFanPlacement.place(for: .scene), .atelierHeader)
    }

    /// **Et la rangée du plateau disparaît sous l'atelier** — c'est la seconde
    /// barre que le header d'un seul tenant interdit. Le mood la garde : il n'a
    /// aucune barre haute à lui.
    func test_lesTroisPlaces_sontExclusives() {
        let places = [ComposerSurfaceKind.scene, .document, .mood]
            .map(ComposerFormatFanPlacement.place(for:))
        XCTAssertEqual(Set(places).count, 3,
                       "Une place par surface : c'est l'exhaustivité du `switch` qui interdit deux sélecteurs.")
        XCTAssertEqual(ComposerFormatFanPlacement.place(for: .mood), .plateauRow)
    }

    // MARK: - Le cadrage

    /// La directive, dite par la règle du SDK : **au repos, la scène est une
    /// carte**. Les deux exceptions sont les deux immersions que des directives
    /// antérieures ont posées, et elles tiennent.
    func test_leCadrage_carde_saufQuandLImmersionEstLeSujet() {
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false))
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: true, textActive: false),
                       "Le dessin reste immersif (2026-07-11).")
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: false, textActive: true),
                       "L'édition texte reste immersive (2026-07-28), et elle l'emporte.")
    }

    /// Une carte, c'est une marge ET un rayon — pas seulement un facteur
    /// d'échelle. Ce témoin garde les deux, sur le cas nominal 9:16.
    func test_uneCarte_aUneMargeEtUnRayon() {
        let resultat = StoryCanvasFraming.resolve(.init(
            viewport: CGSize(width: 402, height: 874),
            headerInset: 115, bottomInset: 130, sideInset: 14,
            state: .carded, cardedCornerRadius: 22))
        XCTAssertEqual(resultat.cornerRadius, 22)
        XCTAssertLessThan(resultat.scale, 1, "La carte NE remplit PAS le viewport — c'est ce qui fait l'air autour.")
        XCTAssertGreaterThan(resultat.scale, 0)
    }

    // MARK: - Les sources

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func host() throws -> String {
        try AppSourceGuard.composerHostSource()
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.**
    func test_laSource_estLisibleEtNonVide() throws {
        XCTAssertGreaterThan(try host().count, 20_000)
        XCTAssertTrue(try host().contains("struct MeeshyComposerHost"))
    }

    /// **LA garde du « supprimez le Touchez pour écrire en bas ».** La
    /// description n'est plus montée SOUS la surface : elle s'ouvre par l'icône
    /// et n'occupe l'écran que quand on l'écrit. Sans ce témoin, la remettre
    /// dans le `body` reprendrait en silence la place que la scène centrée
    /// réclame.
    /// **Lue sur l'UNITÉ, plus sur le `body`** (2026-09-06).
    ///
    /// Les deux zones d'écriture sont sorties du `body` le 2026-09-04 vers
    /// `textEditingZones` — et pour une raison qui interdit de les y ramener :
    /// le meuble passait à 1209 lignes contre un plafond DUR de 1200, et la
    /// directive du 2026-08-28 dit d'extraire AVANT d'ajouter. La garde
    /// cherchait toujours dans le `body` et rougissait sur son ancrage.
    ///
    /// > L'invariant — « la description s'ouvre en ZONE BASSE, la scène
    /// > remontant au-dessus » — ne dit rien de la PROPRIÉTÉ qui la monte. Le
    /// > borner à une propriété le faisait tomber au premier découpage, et le
    /// > découpage est ici une OBLIGATION du budget de fichier : cette garde
    /// > était donc condamnée à rougir tôt ou tard.
    ///
    /// L'assertion négative reste sûre sur l'unité : elle interdit une forme
    /// précise (`mountedSurface == .scene { sceneDescriptionSection }`), pas un
    /// mot isolé qu'un voisin pourrait porter légitimement.
    func test_laDescription_neVitPlusSousLaSurface() throws {
        let code = try host()
        let compacte = compact(code)
        XCTAssertTrue(compacte.contains("socle"), "L'unité lue n'est pas celle du meuble — la garde ne mesurerait RIEN.")
        XCTAssertFalse(compacte.contains("mountedSurface==.scene{sceneDescriptionSection}"),
                       "La description est revenue occuper le bas en permanence.")
        // **RETOURNÉ une seconde fois, au #6126.** Trois places en quatre lots :
        // bande permanente (#3925) → couche par-dessus tout (#4124) → zone
        // ancrée en bas (#4361) → **en place, dans le volet lui-même**
        // (2026-09-12). Chaque retour visait juste et chacun s'arrêtait un cran
        // trop tôt : ce que l'auteur veut n'est ni recouvrir la scène, ni faire
        // remonter la scène, c'est écrire la légende LÀ OÙ IL LA LIT.
        //
        // > La zone basse de la légende a donc disparu. Ce témoin garde
        // > désormais son ABSENCE — et, pour ne pas être vert par omission, la
        // > PRÉSENCE de ce qui la remplace.
        XCTAssertFalse(compacte.contains("varsceneDescriptionEditor:someView"),
                       "La zone basse de la LÉGENDE doit avoir disparu (#6126).")
        XCTAssertTrue(compacte.contains("varpostContentEditor:someView"),
                      "Le CORPS du post garde la sienne — c'est le contraste que la directive décrit.")
    }

    /// **RETOURNÉ au #4361 — il n'y a plus de flou du tout, et c'est le point.**
    ///
    /// Cette garde protégeait le fait que le voile venait d'un MATÉRIAU plutôt
    /// que d'un `.blur()`, qui aurait re-rendu le canvas à chaque image. La
    /// raison était bonne ; le voile, lui, a disparu — la scène ne se floute
    /// plus, elle REMONTE. Ce qu'il faut garder n'est donc plus « le bon flou »
    /// mais « aucun flou », et la mécanique qui le remplace.
    func test_laScene_neSeFloutePlus_elleRemonte() throws {
        // `host()` rend la source BRUTE : la seule occurrence restante de
        // `.blur(radius:)` est dans un commentaire qui explique pourquoi on n'en
        // met pas. Une garde qui lirait les commentaires interdirait d'écrire la
        // raison — c'est la leçon « lire le CODE, pas les commentaires ».
        let compacte = compact(AppSourceGuard.stripComments(try host()))
        XCTAssertFalse(
            compacte.contains(".blur(radius:"),
            "Un `.blur` re-rendrait le canvas à chaque image — et il n'a plus rien à flouter."
        )
        XCTAssertTrue(
            compacte.contains(".storyComposerCanvasBottomReservation("),
            "La scène remonte parce que le meuble DÉCLARE ce qu'il occupe en bas. Sans cette "
                + "déclaration, la saisie recouvrirait la scène — le geste que #4361 retire."
        )
        // **La condition s'est ÉLARGIE, la règle n'a pas bougé** (2026-09-05).
        // Le ternaire ne testait que `editsSceneDescription` ; il teste désormais
        // `editsSceneDescription || editsPostContent` — la zone d'écriture du
        // CORPS du post réserve la même hauteur, et l'oublier laissait la scène
        // recouverte dans ce mode-là. Le témoin épinglait la condition ; ce qu'il
        // garde est la HAUTEUR.
        //
        // > Une garde qui cite une condition entière rougit à chaque cas ajouté,
        // > y compris quand le cas ajouté est le correctif. Les deux fragments
        // > ci-dessous survivent à un troisième état, et tombent sur ce qui
        // > compte : une constante à la place de la mesure, ou une réserve qui
        // > ne retombe pas à zéro.
        // **La réserve a changé de NATURE au #6126, pas seulement de valeur.**
        // Le ternaire `? sceneDescriptionEditorHeight : 0` servait les deux
        // zones ; la légende n'en a plus. Ce qui menace de la couvrir est le
        // CLAVIER, et c'est sa hauteur que le meuble déclare pour elle. La
        // mesure `sceneDescriptionEditorHeight` demeure — pour le CORPS du
        // post, qui a gardé sa zone.
        XCTAssertTrue(
            compacte.contains("keyboardTransition?.height??0"),
            "… et la réserve de la LÉGENDE est la hauteur du CLAVIER (#6126) : reprendre la "
                + "hauteur mesurée d'une zone qui n'existe plus servirait `0` en silence."
        )
        XCTAssertTrue(
            compacte.contains("editsSceneDescription"),
            "… et c'est bien l'ouverture d'une zone d'écriture qui la déclenche, quel que soit le "
                + "nombre de zones qui la partagent."
        )
    }

    /// **RETOURNÉ le 2026-08-30, sur directive porteur** :
    ///
    /// > « Le bouton (terminé) au dessus du clavier quand on édite la
    /// > description est inutile, un bouton Check existe déjà pour valider ; il
    /// > faudra ajouter la gesture swipe down pour valider et fermer. »
    ///
    /// La garde protégeait la PLACE de « Terminé » — au-dessus du clavier, là où
    /// le système le met, jamais flottant. La raison était bonne ; le bouton,
    /// lui, faisait DOUBLON avec la coche que le champ porte déjà. Deux commandes
    /// pour un même acte, dont l'une occupait une barre système.
    ///
    /// Ce qui se garde maintenant : qu'il n'y ait PLUS de barre de clavier, et
    /// que les deux gestes qui restent — la coche et le glissement vers le bas —
    /// fassent le MÊME acte. Un glissement qui fermerait sans valider perdrait la
    /// frappe en cours.
    func test_laValidation_aDeuxGestes_etUnSeulActe() throws {
        let code = compact(AppSourceGuard.stripComments(try editorSource()))

        XCTAssertFalse(
            code.contains("placement:.keyboard"),
            "La barre de clavier portait un « Terminé » en doublon de la coche du champ."
        )
        XCTAssertTrue(
            code.contains("onValidate:onDone"),
            "La coche du champ doit RANGER la zone, pas seulement repasser en lecture : sinon "
                + "elle laisse à l'écran un lecteur que personne n'a demandé."
        )
        // **UNE loi de fermeture, trois chemins.** La coche, le glissement
        // contrôlé et toute dismission système passent par la perte de FOCUS —
        // et c'est d'elle que vient l'ordre demandé : le clavier s'en va
        // d'abord, la zone attend son départ. Fermer la zone au site du bouton
        // ferait partir les deux ensemble par un geste, et dans l'ordre par
        // l'autre.
        XCTAssertTrue(
            compact(AppSourceGuard.stripComments(try calqueSource()))
                .contains("adaptiveOnChange(of:isFocused)"),
            "La fermeture doit suivre le FOCUS : c'est ce qui donne l'ordre « clavier d'abord, "
                + "zone ensuite » sans que chaque site ait à le réécrire."
        )
        // **Le glissement est CONTRÔLÉ, et c'est le système qui le porte**
        // (précision porteur 2026-08-30). Un `DragGesture.onEnded` DÉCIDAIT à la
        // levée du doigt : rien ne bougeait pendant, rien n'était annulable, et
        // le clavier partait après la zone au lieu d'avant.
        //
        // Garde NÉGATIVE sur le geste maison : c'est la reconstruction à la main
        // qui est interdite, pas le glissement. Elle rougirait au premier
        // « je refais ça moi-même », qui redonnerait une imitation divergeant du
        // reste de l'OS.
        XCTAssertTrue(
            code.contains(".scrollDismissesKeyboard(.interactively)"),
            "Le clavier doit suivre le doigt image par image, et remonter si on relâche avant la "
                + "fin. C'est le mécanisme système ; le fabriquer donnerait une imitation."
        )
        XCTAssertFalse(
            code.contains("DragGesture("),
            "Un geste maison redeviendrait un DÉCLENCHEUR : il décide à la levée du doigt, ne "
                + "montre rien pendant, et n'annule rien."
        )
    }

    private func calqueSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDescriptionLayer.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 1500, "Source vide — la garde serait verte par omission.")
        return brut
    }

    private func editorSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSceneDescriptionEditor.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 1500, "Source vide — la garde serait verte par omission.")
        return brut
    }

    /// L'atelier reçoit son accessoire de rangée haute — sans ce câblage, le
    /// chip n'aurait PLUS aucun site de montage : la règle l'a retiré du
    /// plateau, et rien ne le peindrait.
    func test_lAtelier_recoitSonAccessoireDeRangee() throws {
        let compacte = compact(try host())
        XCTAssertTrue(compacte.contains(".storyComposerHeaderLeadingAccessory{"))
        XCTAssertTrue(compacte.contains("atelierDescriptionButton"))
    }

    private func declarationBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }
}
