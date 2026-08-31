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

    // MARK: - Les autres kinds — « il change de contenu, jamais de place »

    private func media(scale: Double = 1, rotation: Double = 0,
                       volume: Float = 1, kind: StoryMediaKind = .video,
                       debut: Double? = nil, duree: Double? = nil) -> StoryMediaObject {
        StoryMediaObject(id: "m", postMediaId: "pm", kind: kind,
                         aspectRatio: 16.0 / 9.0, scale: scale, rotation: rotation,
                         volume: volume, startTime: debut, duration: duree)
    }

    private func sticker(scale: Double = 2.2, rotation: Double = 0) -> StorySticker {
        StorySticker(emoji: "🎬", x: 0.5, y: 0.5, scale: scale, rotation: rotation)
    }

    private func libelles(_ jetons: [ComposerObjectChips.Chip]) -> [String] { jetons.map(\.label) }

    /// **La taille ne manque JAMAIS, quel que soit le kind.** C'est ce qui
    /// garantit qu'un objet sélectionné a toujours au moins un jeton : une
    /// rangée vide ne dirait pas « rien à régler », elle aurait l'air cassée.
    func test_chaqueKind_porteAuMoinsSonJetonDeTaille() {
        for jetons in [ComposerObjectChips.chips(for: texte(), locale: Locale(identifier: "fr_FR")),
                       ComposerObjectChips.chips(for: media(), locale: Locale(identifier: "fr_FR")),
                       ComposerObjectChips.chips(for: sticker(), locale: Locale(identifier: "fr_FR"))] {
            XCTAssertTrue(jetons.contains { $0.id == "size" }, "\(libelles(jetons))")
        }
    }

    /// **Et l'espace avant le « % » n'est PAS une espace ordinaire.**
    ///
    /// Ce témoin a d'abord été écrit `== "TAILLE 140 %"` et il est tombé sur
    /// deux chaînes visuellement identiques : le français veut une **espace
    /// fine insécable** (U+202F), que `LocalizedNumber.percent` pose et qu'un
    /// littéral tapé au clavier n'a pas. L'échec était la preuve que le
    /// formatage localisé fait son travail — comparer à un littéral l'aurait
    /// gardé vert en le contournant.
    func test_lEchelleDunMedia_seLitEnPourcentage() {
        let libelle = ComposerObjectChips.chips(for: media(scale: 1.4),
                                                locale: Locale(identifier: "fr_FR"))
            .first { $0.id == "size" }?.label ?? ""

        XCTAssertTrue(libelle.hasPrefix("TAILLE 140"), libelle)
        XCTAssertTrue(libelle.hasSuffix("%"), libelle)
        XCTAssertFalse(libelle.contains("140 %"),
                       "l'espace avant le % est celle de la LOCALE, jamais la nôtre — \(libelle)")
    }

    /// **Un objet DROIT n'annonce pas sa rotation.** « ROTATION 0° »
    /// occuperait la place pour dire une absence (loi 8).
    func test_unObjetDroit_nAnnoncePasSaRotation() {
        XCTAssertFalse(ComposerObjectChips.chips(for: media(rotation: 0))
            .contains { $0.id == "rotation" })
        XCTAssertTrue(ComposerObjectChips.chips(for: media(rotation: 12))
            .contains { $0.id == "rotation" })
    }

    /// **Le SON ne se dit que s'il existe ET qu'il a été touché.** Une image n'a
    /// pas de son du tout, et une vidéo au volume nominal n'a rien à annoncer :
    /// « SON 100 % » sur une photo enseignerait moins que rien.
    func test_leSon_neSeDitQueSurUneVideoDontLeVolumeAChange() {
        XCTAssertTrue(ComposerObjectChips.chips(for: media(volume: 0.6, kind: .video))
            .contains { $0.id == "volume" })
        XCTAssertFalse(ComposerObjectChips.chips(for: media(volume: 1, kind: .video))
            .contains { $0.id == "volume" })
        XCTAssertFalse(ComposerObjectChips.chips(for: media(volume: 0.6, kind: .image))
            .contains { $0.id == "volume" },
                       "une image n'a pas de son — le champ existe, la chose non")
    }

    /// La fenêtre de temps se lit à l'identique sur les trois kinds : c'est la
    /// MÊME question, donc le même jeton, à la même place.
    func test_laFenetreDeTemps_estLaMEMEsurLesTroisKinds() {
        let attendu = "0:00 → 0:06"
        XCTAssertEqual(
            ComposerObjectChips.chips(for: texte(debut: 0, duree: 6),
                                      locale: Locale(identifier: "fr_FR")).last?.label, attendu)
        XCTAssertEqual(
            ComposerObjectChips.chips(for: media(debut: 0, duree: 6),
                                      locale: Locale(identifier: "fr_FR")).last?.label, attendu)
    }

    /// **Le TEMPS est toujours en dernier, l'apparence toujours devant.** Un
    /// jeton qui apparaît ne doit pas déplacer ses voisins sous le doigt, et
    /// c'est vrai d'un kind à l'autre : passer d'un texte à un média ne doit pas
    /// réorganiser la rangée.
    func test_leTemps_estToujoursEnDernier() {
        let m = ComposerObjectChips.chips(for: media(scale: 1.4, rotation: 12,
                                                     volume: 0.5, debut: 0, duree: 6)).map(\.id)
        XCTAssertEqual(m, ["size", "rotation", "volume", "window"])

        let s = ComposerObjectChips.chips(for: sticker(scale: 2.2, rotation: 8)).map(\.id)
        XCTAssertEqual(s, ["size", "rotation"])
    }

    /// **Le fusible des trois kinds.** Une règle qui rendrait toujours la même
    /// liste passerait les témoins d'ordre ci-dessus sans distinguer quoi que
    /// ce soit — or c'est exactement ce que la planche demande : « il change de
    /// CONTENU selon le kind, jamais de place ».
    func test_lesTroisKinds_neDisentPasLaMemeChose() {
        let t = Set(ComposerObjectChips.chips(for: texte(style: "neon", align: "center")).map(\.id))
        let m = Set(ComposerObjectChips.chips(for: media(volume: 0.5)).map(\.id))
        XCTAssertNotEqual(t, m)
        XCTAssertTrue(t.contains("style"), "le style est propre au TEXTE")
        XCTAssertTrue(m.contains("volume"), "le son est propre au MÉDIA")
        XCTAssertEqual(t.intersection(m), ["size"], "seule la taille leur est commune")
    }

    // MARK: - Quand la rangée PARAÎT

    /// **Le défaut mesuré à l'écran, et que trois témoins de règle verts
    /// n'avaient pas vu.**
    ///
    /// Le premier câblage demandait `toolOptions == nil`. L'hôte passe ce
    /// panneau INCONDITIONNELLEMENT — il se vide lui-même quand aucun outil
    /// n'est ouvert, et c'est ainsi qu'il tient la loi 4. La condition était
    /// donc TOUJOURS fausse, et la rangée n'a jamais pu paraître : quinze
    /// témoins verts sur ce qu'elle DIT, aucun sur le fait qu'elle EXISTE.
    ///
    /// > **Une vue qui existe toujours ne peut pas servir de témoin à « un
    /// > outil est ouvert ».** La question se pose à ce qui la SAIT — le mode
    /// > du rail — et la règle est écrite pour être éprouvable sans monter
    /// > quoi que ce soit.
    func test_laRangee_paraitQuandUnObjetEstSelectionne() {
        XCTAssertTrue(ComposerObjectChips.isServed(
            toolIsOpen: false, chips: chips(pour: texte())))
    }

    /// Un outil ouvert lui prend la place — les empiler ferait remonter la
    /// scène de cinquante points sous le doigt.
    func test_unOutilOuvert_luiPrendLaPlace() {
        XCTAssertFalse(ComposerObjectChips.isServed(
            toolIsOpen: true, chips: chips(pour: texte())))
    }

    /// **Le fusible.** Une règle qui rendrait toujours `true` peindrait un
    /// cadre vide dès qu'aucun objet n'est sélectionné — ce qui n'aurait pas
    /// l'air sobre, mais cassé.
    func test_sansAucunJeton_aucuneRangee() {
        XCTAssertFalse(ComposerObjectChips.isServed(toolIsOpen: false, chips: []))
    }
}
