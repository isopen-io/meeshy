import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une chip de son a un RANG, comme les quatre autres familles** (#4759).
///
/// `bringForward` / `sendBackward` LISAIENT cinq familles (`audioPlayerObjects`
/// incluse) et écrivaient par un `mutateItem` qui n'en connaissait que quatre.
///
/// Deux symptômes, et le second est le pire :
///
/// 1. avancer une chip de son ne faisait **rien** — un contrôle inerte, loi 4 ;
/// 2. faire passer un TEXTE devant elle appliquait l'échange **à moitié** : le
///    texte prenait le rang du son, le son gardait le sien, et les deux se
///    retrouvaient au MÊME rang. L'utilisateur voyait un résultat qui n'était
///    ni l'avant ni l'après.
///
/// > Une valeur lue à un seul endroit ne peut pas être lue de travers ailleurs
/// > — mais rien ne garantit que ce qu'on LIT soit ce qu'on puisse ÉCRIRE.
/// > L'asymétrie lecteur/écrivain ne rougit nulle part : les deux côtés
/// > compilent, et l'échange partiel a l'air d'un défaut d'affichage.
///
/// Ces témoins portent donc sur le cas qui MENT autant que sur celui qui se
/// voit : un témoin qui n'aurait gardé que la chip immobile serait resté vert
/// devant l'échange à moitié, qui est le défaut le plus coûteux des deux.
@MainActor
final class CanvasAudioChipZOrderTests: XCTestCase {

    private func canvas(texteZ: Int, sonZ: Int?) -> StoryCanvasUIView {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "txt", text: "bonjour", zIndex: texteZ)]
        var son = StoryAudioPlayerObject(id: "aud", postMediaId: "pm-1", name: "Voix")
        son.zIndex = sonZ
        effets.audioPlayerObjects = [son]
        let vue = StoryCanvasUIView(slide: StorySlide(id: "s1", effects: effets), mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return vue
    }

    private func rangs(_ vue: StoryCanvasUIView) -> (texte: Int, son: Int) {
        (vue.slide.effects.textObjects.first?.zIndex ?? .min,
         vue.slide.effects.audioPlayerObjects?.first?.zIndex ?? .min)
    }

    // MARK: - Le symptôme qui MENT

    /// **LE témoin du lot.** Avancer le TEXTE au-dessus du son doit ÉCHANGER
    /// les deux rangs. L'ancienne écriture n'appliquait que la moitié servie
    /// par `mutateItem`, laissant les deux objets au même rang.
    func test_avancerUnTexteAuDessusDuSon_ECHANGE_lesDeuxRangs() {
        let vue = canvas(texteZ: 1, sonZ: 2)

        vue.bringForward(id: "txt")

        let (texte, son) = rangs(vue)
        XCTAssertEqual(texte, 2, "le texte doit prendre le rang du son")
        XCTAssertEqual(son, 1, "…et le son celui du texte — sinon l'échange n'est fait qu'à moitié")
        XCTAssertNotEqual(texte, son,
                          "deux objets au MÊME rang : c'est le défaut de #4759, ni l'avant ni l'après")
    }

    /// Le miroir : reculer le texte SOUS le son échange aussi les deux rangs.
    func test_reculerUnTexteSousLeSon_ECHANGE_lesDeuxRangs() {
        let vue = canvas(texteZ: 3, sonZ: 2)

        vue.sendBackward(id: "txt")

        let (texte, son) = rangs(vue)
        XCTAssertEqual(texte, 2)
        XCTAssertEqual(son, 3)
    }

    // MARK: - Le symptôme qui se voit

    /// Avancer la CHIP DE SON elle-même la fait passer devant le texte.
    func test_avancerLaChipDeSon_laFaitPasserDevantLeTexte() {
        let vue = canvas(texteZ: 5, sonZ: 4)

        vue.bringForward(id: "aud")

        let (texte, son) = rangs(vue)
        XCTAssertEqual(son, 5, "la chip de son doit prendre le rang du texte")
        XCTAssertEqual(texte, 4, "…et le texte celui de la chip")
    }

    /// Et l'envoyer au fond lui donne bien le rang le plus bas.
    func test_envoyerLaChipDeSonAuFond_luiDonneLeRangLePlusBas() {
        let vue = canvas(texteZ: 7, sonZ: 9)

        vue.sendToBack(id: "aud")

        let (texte, son) = rangs(vue)
        XCTAssertLessThan(son, texte, "au fond signifie DERRIÈRE tout le reste")
    }

    // MARK: - Ce que l'énumération manuelle oubliait, un site plus loin

    /// **`nextTopZ()` doit compter la chip de son.** `allItemZIndexes()`
    /// l'oubliait — une famille de plus que celle qu'oubliait `mutateItem`, et
    /// c'est ce DÉCALAGE qui rendait le défaut difficile à voir : chaque site
    /// oubliait une chose différente. Conséquence propre à celui-ci : « mettre
    /// au premier plan » plaçait l'objet DERRIÈRE la chip de son.
    func test_mettreAuPremierPlan_passeDevantLaChipDeSon() {
        let vue = canvas(texteZ: 1, sonZ: 50)

        vue.bringForegroundToFront(id: "txt")

        let (texte, son) = rangs(vue)
        XCTAssertGreaterThan(texte, son,
                             "le premier plan doit dépasser TOUS les objets, chip de son comprise")
    }

    /// **Une chip de son se supprime.** `deleteItem` ne balayait que quatre
    /// familles : le geste n'avait aucun effet.
    func test_uneChipDeSon_seSupprime() {
        let vue = canvas(texteZ: 1, sonZ: 2)

        vue.deleteItem(id: "aud")

        XCTAssertTrue(vue.slide.effects.audioPlayerObjects?.isEmpty ?? true,
                      "supprimer une chip de son doit la retirer de la slide")
        XCTAssertEqual(vue.slide.effects.textObjects.count, 1,
                       "…sans emporter le reste de la scène")
    }

    /// **Un rang ABSENT vaut zéro, et se compare comme tel.** `zIndex` est
    /// optionnel sur la seule famille audio ; un `nil` traité comme « pas de
    /// rang » au lieu de « rang 0 » sortirait la chip de l'ordonnancement.
    func test_unRangAbsent_seComporteCommeZero() {
        let vue = canvas(texteZ: -1, sonZ: nil)

        vue.bringForward(id: "txt")

        let (texte, son) = rangs(vue)
        XCTAssertEqual(texte, 0, "le texte passe au rang que le son occupait implicitement")
        XCTAssertEqual(son, -1)
    }
}
