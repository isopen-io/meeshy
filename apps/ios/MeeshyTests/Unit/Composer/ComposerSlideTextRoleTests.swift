import XCTest
@testable import Meeshy

/// **Le texte d'une slide n'a pas le même RÔLE selon le profil** (#4890).
///
/// `docs/product/meeshy-composer-modele.md` § 3 porte la table, et elle est
/// l'autorité :
///
/// | | Story | Réel | Post |
/// |---|---|---|---|
/// | Une slide EST | une story entière | le réel entier | **UN média du post** |
/// | Le texte de la slide est | le contenu | le contenu | **la légende de ce média** |
/// | `content` de la publication | = le texte de sa slide | idem | **propre au post** |
///
/// Le même document nommait déjà le site fautif, avant ce lot :
///
/// > « Le champ posé par la Phase 2 (`sceneDescriptionField`) est aujourd'hui
/// > lié au `content` du document. **C'est juste en S/R et faux en P** : en P
/// > il doit être la légende de la slide courante, et le `content` du post doit
/// > avoir son propre logement. »
///
/// ## Pourquoi une règle NOMMÉE, et pourquoi pas « description »
///
/// Le mot « description » couvre les DEUX rôles. C'est ce recouvrement qui a
/// permis à `ComposerRailDoor.description` de DÉCLARER la règle des deux — son
/// doc-comment l'énonce correctement depuis #4045 — tout en écrivant
/// `currentSlide.content` dans les deux cas.
///
/// > **Un nom qui vaut pour deux rôles ne fait pas rougir quand on sert le
/// > mauvais.** Le type ci-dessous se nomme donc par le RÔLE, et « description »
/// > redevient ce qu'il aurait dû rester : le libellé d'un champ à l'écran.
final class ComposerSlideTextRoleTests: XCTestCase {

    // MARK: - La table du § 3

    func test_enStoryEtEnReel_leTexteDeLaSlide_estLeCONTENU() {
        XCTAssertEqual(ComposerSlideTextRole.role(for: .story), .content)
        XCTAssertEqual(ComposerSlideTextRole.role(for: .reel), .content)
    }

    func test_enPost_leTexteDeLaSlide_estLaLEGENDE_deSonMedia() {
        XCTAssertEqual(ComposerSlideTextRole.role(for: .post), .caption)
    }

    /// Un mood n'a pas de slide ; son texte EST le contenu, et lui seul
    /// (§ 3, colonne M). Le ranger en `.caption` lui inventerait un média.
    func test_enMood_leTexte_estLeCONTENU() {
        XCTAssertEqual(ComposerSlideTextRole.role(for: .status), .content)
    }

    /// **Le fusible.** Une règle qui rendrait toujours le même rôle passerait
    /// les trois témoins ci-dessus si on ne demandait jamais qu'ils DIFFÈRENT.
    func test_leRole_nEstPasConstant() {
        XCTAssertNotEqual(ComposerSlideTextRole.role(for: .post),
                          ComposerSlideTextRole.role(for: .story),
                          "sans cette différence, la règle ne décide de rien")
    }

    func test_chaqueFormat_declareSonRole() {
        for format in ComposerFormat.allComposable {
            XCTAssertTrue([.content, .caption].contains(ComposerSlideTextRole.role(for: format)),
                          "\(format)")
        }
    }

    // MARK: - Ce que le rôle IMPLIQUE

    /// La légende a besoin d'un média À QUI appartenir. Le contenu, non — il
    /// appartient à la publication. C'est cette asymétrie qui décide si un
    /// champ peut être servi quand rien n'est sélectionné.
    func test_seuleLaLegende_exigeUnMediaCible() {
        XCTAssertTrue(ComposerSlideTextRole.caption.needsMediaTarget)
        XCTAssertFalse(ComposerSlideTextRole.content.needsMediaTarget)
    }

    /// **La légende est par MÉDIA, jamais par slide** — et la distinction n'est
    /// pas théorique.
    ///
    /// Le modèle dit « légende de la slide » ; la directive porteur du
    /// 2026-09-02 dit « chaque IMAGE doit avoir sa légende ». En Post une slide
    /// = UN média (`MeeshyComposerHost+Intake`), donc les deux coïncident
    /// AUJOURD'HUI. C'est une coïncidence de la forme actuelle, pas une
    /// identité : le jour où un post porte deux médias sur une slide, une
    /// légende rattachée à la slide servirait le mauvais média — et rien ne
    /// rougirait, les deux nombres étant égaux tant que la coïncidence tient.
    ///
    /// La clé est donc l'URL du MÉDIA, ce qui se vérifie ici sur le TYPE de la
    /// carte : un dictionnaire par slide passerait ce témoin au compilateur, et
    /// c'est exactement ce qu'on veut rendre impossible.
    func test_laCarteDeLegendes_estClasseeParMEDIA() {
        var captions: ComposerMediaCaptions = [:]
        let premier = URL(fileURLWithPath: "/tmp/a.jpg")
        let second = URL(fileURLWithPath: "/tmp/b.jpg")
        captions[premier] = "le quai"
        captions[second] = "la grue"

        XCTAssertEqual(captions[premier], "le quai")
        XCTAssertEqual(captions[second], "la grue")
        XCTAssertEqual(captions.count, 2,
                       "deux médias, deux légendes — même s'ils vivaient sur une seule slide")
    }

    // MARK: - L'écriture

    /// Une légende VIDE se retire de la carte au lieu d'y rester en `""` : une
    /// clé présente à valeur vide voyagerait jusqu'au fil et poserait une
    /// légende blanche sur le média — le contraire de « pas de légende ».
    func test_unTexteVide_retireLaLegende() {
        var captions: ComposerMediaCaptions = [URL(fileURLWithPath: "/tmp/a.jpg"): "le quai"]
        ComposerSlideTextRole.applyCaption("", to: URL(fileURLWithPath: "/tmp/a.jpg"), in: &captions)
        XCTAssertTrue(captions.isEmpty)
    }

    func test_unTexteBlanc_retireLaLegendeAussi() {
        var captions: ComposerMediaCaptions = [URL(fileURLWithPath: "/tmp/a.jpg"): "le quai"]
        ComposerSlideTextRole.applyCaption("   \n ", to: URL(fileURLWithPath: "/tmp/a.jpg"), in: &captions)
        XCTAssertTrue(captions.isEmpty, "des espaces ne sont pas une légende")
    }

    /// **Le texte est conservé TEL QUEL** quand il porte quelque chose — on ne
    /// rogne pas les espaces intérieurs ni la casse : c'est la prose de
    /// l'auteur, pas un identifiant.
    func test_unTexteNonVide_estConserveTelQuel() {
        var captions: ComposerMediaCaptions = [:]
        let url = URL(fileURLWithPath: "/tmp/a.jpg")
        ComposerSlideTextRole.applyCaption("  Un quai vide,  au petit matin  ", to: url, in: &captions)
        XCTAssertEqual(captions[url], "  Un quai vide,  au petit matin  ")
    }

    /// Sans média cible, il n'y a rien à légender — et surtout rien à écrire
    /// sous une clé inventée. La carte reste intacte.
    func test_sansMediaCible_rienNEstEcrit() {
        var captions: ComposerMediaCaptions = [URL(fileURLWithPath: "/tmp/a.jpg"): "le quai"]
        ComposerSlideTextRole.applyCaption("la grue", to: nil, in: &captions)
        XCTAssertEqual(captions.count, 1)
        XCTAssertEqual(captions[URL(fileURLWithPath: "/tmp/a.jpg")], "le quai")
    }
}
