import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **L'inspecteur de `1c` porte des VALEURS LISIBLES, pas des glyphes muets
/// (#4073).**
///
/// La planche `1c` montre une rangée horizontale de jetons : `STYLE · NÉON`,
/// `TAILLE 38`, `ALIGN ▭`, `0:00 → 0:06`. Chacun dit l'état COURANT de l'objet
/// sélectionné avant même qu'on le touche. L'app rend aujourd'hui des bulles
/// d'icônes — on y lit ce qu'on peut CHANGER, jamais ce qui EST.
///
/// La différence n'est pas décorative : un réglage qu'il faut ouvrir pour
/// connaître oblige l'auteur à explorer pour se souvenir. Un jeton qui porte sa
/// valeur répond sans être touché — c'est la dimension 12, la complexité se paie
/// dans le code, pas chez l'utilisateur.
///
/// **La règle est PURE et rend des mots, pas des vues.** Ce qu'un jeton AFFICHE
/// s'éprouve sans monter d'écran ; ce qu'il ouvre est l'affaire de la vue.
final class ComposerObjectChipsTests: XCTestCase {

    /// **La locale est PINCÉE, et c'est ce qui rend les attentes ci-dessous
    /// honnêtes.** « TAILLE 38 » et « 0:00 → 0:06 » ne sont vrais qu'en
    /// chiffres latins ; les lire sous `.current` ferait juger la locale du
    /// SIMULATEUR — vert en France, rouge sur un banc arabe, sans qu'aucune des
    /// deux couleurs ne dise quoi que ce soit de la règle (leçon 234i).
    private func chips(pour texte: StoryTextObject) -> [ComposerObjectChips.Chip] {
        ComposerObjectChips.chips(for: texte, locale: Locale(identifier: "fr_FR"))
    }

    private func texte(style: String? = nil,
                       taille: Double = 38,
                       align: String? = nil,
                       debut: Double? = nil,
                       duree: Double? = nil) -> StoryTextObject {
        var t = StoryTextObject(text: "Dernier soir de tournage", x: 0.5, y: 0.5)
        t.textStyle = style
        t.fontSize = taille
        t.textAlign = align
        t.startTime = debut
        t.duration = duree
        return t
    }

    func test_laTaille_seLitSansOuvrirQuoiQueCeSoit() {
        let jetons = chips(pour: texte(taille: 38))
        XCTAssertTrue(jetons.contains { $0.label == "TAILLE 38" },
                      "le jeton porte la valeur courante — \(jetons.map(\.label))")
    }

    /// **Un style ABSENT ne fabrique pas un jeton « aucun ».** Loi 8 : le jeton
    /// paraît quand il a quelque chose à dire. « STYLE · — » enseignerait moins
    /// que rien : il occuperait la place en affirmant une valeur qui n'existe pas.
    func test_unStyleAbsent_neFabriquePasDeJeton() {
        let jetons = chips(pour: texte(style: nil))
        XCTAssertFalse(jetons.contains { $0.label.hasPrefix("STYLE") })
    }

    func test_unStylePose_seNommeEnMajuscules() {
        let jetons = chips(pour: texte(style: "neon"))
        XCTAssertTrue(jetons.contains { $0.label == "STYLE · NÉON" },
                      "la planche écrit « STYLE · NÉON » — \(jetons.map(\.label))")
    }

    /// La fenêtre de temps se lit `0:00 → 0:06`, et seulement quand l'objet en a
    /// une : un texte permanent n'a pas de fin à annoncer.
    func test_laFenetreDeTemps_seLitQuandElleExiste() {
        let avec = chips(pour: texte(debut: 0, duree: 6))
        XCTAssertTrue(avec.contains { $0.label == "0:00 → 0:06" }, "\(avec.map(\.label))")

        let permanent = chips(pour: texte(debut: nil, duree: nil))
        XCTAssertFalse(permanent.contains { $0.label.contains("→") })
    }

    func test_lAlignement_seLitParSonMot() {
        let jetons = chips(pour: texte(align: "center"))
        XCTAssertTrue(jetons.contains { $0.label == "ALIGN · CENTRÉ" }, "\(jetons.map(\.label))")
    }

    /// **Le fusible.** Une règle qui rendrait toujours une liste vide passerait
    /// les trois témoins négatifs ci-dessus sans rien servir.
    func test_unTexteCompletPorteSesQuatreJetons() {
        let jetons = chips(
            pour: texte(style: "neon", taille: 38, align: "center", debut: 0, duree: 6))
        XCTAssertEqual(jetons.count, 4, "\(jetons.map(\.label))")
        XCTAssertEqual(Set(jetons.map(\.id)).count, 4, "deux jetons ne partagent pas une identité")
    }

    /// L'ORDRE suit la planche : ce qui change l'apparence d'abord, le temps en
    /// dernier. Il ne dépend pas de ce qui est renseigné — un jeton qui
    /// apparaît ne doit pas déplacer ses voisins sous le doigt.
    func test_lOrdreSuitLaPlanche_etNeDependPasDeCeQuiEstRenseigne() {
        let complet = chips(
            pour: texte(style: "neon", align: "center", debut: 0, duree: 6)).map(\.id)
        XCTAssertEqual(complet, ["style", "size", "align", "window"])

        let partiel = chips(pour: texte(align: "center")).map(\.id)
        XCTAssertEqual(partiel, ["size", "align"], "l'ordre des survivants est celui du complet")
    }

    /// **Le témoin qui prouve que la conversion a servi à quelque chose.**
    ///
    /// `String(format: "%d:%02d")` vécut dans `timecode` et gravait les chiffres
    /// LATINS. Le défaut ne se voit pas en français : les deux écritures y
    /// rendent « 0:06 », donc un témoin en fr_FR reste vert des deux côtés du
    /// correctif et ne prouve RIEN. Il faut une locale où les deux divergent.
    ///
    /// **`ar_SA`, pas `ar`** : une locale arabe NUE se fait compléter par la
    /// région de l'APPAREIL, et rend donc des chiffres latins sur un banc
    /// américain — le témoin serait vert par accident, pour la mauvaise raison.
    /// C'est la même précaution que `LocalizedNumberTests` et
    /// `ReachMetricLabelTests`, et elle se paie une fois.
    ///
    /// La comparaison est `.literal` : par COLLATION, « ٦ » vaut « 6 », et un
    /// `contains` ordinaire trouverait le chiffre latin dans la chaîne arabe.
    func test_lesChiffresSuiventLaLocale_pasLeFormateur() {
        let arabe = ComposerObjectChips.chips(
            for: texte(taille: 38, debut: 0, duree: 6),
            locale: Locale(identifier: "ar_SA"))
        let fenetre = arabe.first { $0.id == "window" }?.label ?? ""

        XCTAssertNil(fenetre.range(of: "0:06", options: .literal),
                     "chiffres latins dans une fenêtre arabe — \(fenetre)")
        XCTAssertNotNil(fenetre.range(of: "٦", options: .literal),
                        "la fenêtre doit porter les chiffres arabo-indiens — \(fenetre)")

        let taille = arabe.first { $0.id == "size" }?.label ?? ""
        XCTAssertNil(taille.range(of: "38", options: .literal),
                     "la TAILLE aussi est un nombre montré — \(taille)")
    }
}
