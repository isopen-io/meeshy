import XCTest
@testable import Meeshy

/// #5083 — **les options s'ancrent en bas, et le panneau fait la hauteur de son
/// contenu.**
///
/// > « dans la page plein écran d'ajout de texte il faut que les options soient
/// > en bas et non en milieu de l'écran » — porteur, 2026-09-04
///
/// ## Le défaut avait DEUX causes, et aucune ne suffisait seule
///
/// Mesuré au simulateur `Meeshy-iOS26`, écran de 874 points : la grille des
/// polices finissait à **748**, laissant quatre-vingt-douze points vides sous
/// elle.
///
/// 1. Le panneau était le TROISIÈME enfant d'un `VStack` : il prenait la place
///    que la pile lui donnait, et ce qui restait dessous n'appartenait à
///    personne. `safeAreaInset(edge: .bottom)` renverse la question — la barre
///    est posée sur le bord, la scène reçoit le reste.
/// 2. Un `ScrollView` est GLOUTON dans son axe : il prenait les 260 points
///    qu'on l'autorisait à prendre même quand son contenu en occupait 168, et
///    calait ce contenu en HAUT de la boîte. Ancrer la boîte ne changeait donc
///    rien à ce qu'elle contenait.
///
/// Après les deux : la grille finit à **810**, et ce qui reste est sa propre
/// marge déclarée.
final class ComposerObjectEditorOptionsHeightTests: XCTestCase {

    private var cap: CGFloat { ComposerObjectEditorRail.optionsMaxHeight }

    /// Le cas nominal : le panneau fait la taille de son contenu, pas celle
    /// qu'on l'autorise à prendre.
    func test_unContenuCourt_neRéclamePasLePlafond() {
        XCTAssertEqual(ComposerObjectEditorOptions.height(content: 168, cap: cap), 168)
    }

    /// Le plafond de #4997 tient : au-delà, les options mangeraient la carte.
    func test_unContenuLong_estPlafonné() {
        XCTAssertEqual(ComposerObjectEditorOptions.height(content: 900, cap: cap), cap)
    }

    /// **Le plancher n'est pas une précaution défensive.** La hauteur mesurée
    /// vaut ZÉRO à la première passe de layout, avant que la préférence ne
    /// remonte. Servie telle quelle, elle ferait disparaître le panneau une
    /// frame — un clignotement à chaque ouverture d'outil, que rien ne
    /// signalerait comme un défaut.
    func test_uneHauteurNonEncoreMesurée_neFaitPasDisparaîtreLePanneau() {
        XCTAssertGreaterThan(ComposerObjectEditorOptions.height(content: 0, cap: cap), 0)
        XCTAssertGreaterThan(ComposerObjectEditorOptions.height(content: -40, cap: cap), 0)
    }

    /// **Les deux correctifs sont montés, et aucun ne suffit seul.** Ce témoin
    /// existe parce que retirer l'un des deux laisse l'autre en place et rend
    /// une disposition qui a l'air presque juste — le genre de régression qui
    /// passe une relecture.
    func test_lesDeuxMoitiésDuCorrectif_sontMontées() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("safeAreaInset(edge:.bottom,spacing:0){options}"),
                      "le panneau doit être POSÉ sur le bord, pas empilé dans la pile")
        XCTAssertTrue(code.contains("ComposerObjectEditorOptions.height("),
                      "…et faire la hauteur de son contenu, un ScrollView étant glouton")
    }

    /// **UNE boîte, UNE mesure** (2026-09-05).
    ///
    /// ## Ce que le témoin ci-dessus ne pouvait pas voir
    ///
    /// Il cherche `ComposerObjectEditorOptions.height(` quelque part dans le
    /// fichier. C'était vrai avec DEUX branches — texte et média — dont **une
    /// seule publiait la préférence** : la branche média lisait
    /// `optionsContentHeight` sans que rien ne l'alimente, `height(content:0…)`
    /// rendait son plancher, et le panneau d'un média faisait **1 point**.
    ///
    /// Mesuré au simulateur `Meeshy-iOS26`, écran de 874 points : section
    /// « Décrire » ouverte sur un média, son titre à y=839 et son champ de
    /// saisie à **y=884** — décrit par l'arbre d'accessibilité, hors d'atteinte
    /// de tout doigt. Filtre, rognage et actions vivaient là depuis #5083 ;
    /// « Décrire » n'a rien cassé, il a été le premier de la famille à porter
    /// un champ de SAISIE, donc le premier dont le défaut se constate au doigt.
    ///
    /// > **Une garde `contains` sur un site PARTAGÉ ne distingue pas « une
    /// > branche le fait » de « toutes le font ».** Elle reste verte tant qu'un
    /// > seul appelant la satisfait — et c'est exactement la moitié du travail
    /// > qu'un correctif à deux branches oublie.
    ///
    /// Le témoin compte donc les SITES : une seule boîte, qui mesure ce qu'on
    /// lui donne. Une troisième famille d'objet ne peut plus naître aveugle,
    /// puisqu'elle ne peut pas monter sa propre boîte sans faire tomber ceci.
    func test_uneSeuleBoîte_etElleMesureCeQuOnLuiDonne() throws {
        let code = AppSourceGuard.stripComments(try String(contentsOf: vue, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertEqual(occurrences(of: "ComposerObjectEditorOptions.height(", in: code), 1,
                       """
                       Le panneau d'options doit être monté par UN seul site. Deux sites \
                       partagent sa TAILLE, jamais sa MESURE — celle-ci se recopie, donc elle \
                       s'oublie, et la branche qui l'oublie rend un panneau d'un point dont le \
                       contenu se peint SOUS le bord de l'écran.
                       """)
        XCTAssertEqual(
            occurrences(of: "preference(key:ComposerObjectEditorOptionsHeightKey.self",
                        in: code), 1,
            "…et ce site unique PUBLIE la hauteur de ce qu'il contient, sinon il lit "
            + "une préférence que personne n'écrit et sert son plancher.")
    }

    private var vue: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
    }

    private func occurrences(of aiguille: String, in botte: String) -> Int {
        var compte = 0
        var index = botte.startIndex
        while let trouve = botte.range(of: aiguille, range: index..<botte.endIndex) {
            compte += 1
            index = trouve.upperBound
        }
        return compte
    }
}
