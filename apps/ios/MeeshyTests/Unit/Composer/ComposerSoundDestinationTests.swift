import XCTest
@testable import Meeshy

/// **Où atterrit un son de PREMIER PLAN** (#4722, directive porteur
/// 2026-09-01 : « ou en chip resizable sur la scène »).
///
/// Le mot « premier plan » désignait deux choses. `ComposerAudioRole.foreground`
/// dit, au SDK, « un objet posé sur la scène » ; le meuble le lisait « une
/// carte de contenu, sous le texte ». Chaque lecture est juste sur SA surface,
/// et le meuble en sert plusieurs — d'où trois chemins d'ingestion et trois
/// réponses.
final class ComposerSoundDestinationTests: XCTestCase {

    /// **Une scène reçoit une PUCE.** C'est la moitié « chip resizable » de la
    /// directive, et elle était impossible : le chemin d'enregistrement — le
    /// principal — posait toujours une carte de contenu, que la surface de
    /// scène ne rend pas. Le son partait à la publication sans qu'aucun écran
    /// ne le montre.
    func test_uneScene_recoitUnePuce() {
        XCTAssertEqual(ComposerSoundDestination.forForeground(on: .scene), .sceneChip)
    }

    /// L'atelier aussi : c'est une scène plein écran, et il peint déjà ses
    /// puces (`audioForegroundOverlay`). Ce qui décide n'est pas l'écran, c'est
    /// la présence d'une TOILE.
    func test_lAtelier_recoitAussiUnePuce() {
        XCTAssertEqual(ComposerSoundDestination.forForeground(on: .atelier), .sceneChip)
    }

    /// **Un document sans scène reçoit une CARTE.** L'objet de scène n'y serait
    /// rendu par rien — le symétrique exact du défaut ci-dessus, et celui que
    /// le chemin FICHIER produisait : il posait un objet de scène quoi qu'il
    /// arrive.
    func test_unDocumentSansScene_recoitUneCarte() {
        XCTAssertEqual(ComposerSoundDestination.forForeground(on: .document), .contentCard)
    }

    /// **Le mood prend la carte, et c'est un REPLI, pas un choix.** Une humeur
    /// n'a ni toile ni colonne de texte ; la carte laisse au moins le son dans
    /// `documentLocalMedia`, d'où il part avec la publication. La puce l'aurait
    /// posé sur une scène inexistante — perdu à la première republication.
    func test_leMood_prendLaCarte_parDefautSUR() {
        XCTAssertEqual(ComposerSoundDestination.forForeground(on: .mood), .contentCard)
    }

    /// **Le fusible du `switch` exhaustif.** Une cinquième vue montée doit dire
    /// où son premier plan atterrit ; ce témoin tombe si l'énumération grandit
    /// sans que la règle soit relue — la question qu'on oublie exactement en
    /// ajoutant un écran.
    func test_touteVueMontee_aUneDestination() {
        for vue in ComposerMountedView.allCases {
            let destination = ComposerSoundDestination.forForeground(on: vue)
            XCTAssertTrue([.sceneChip, .contentCard].contains(destination),
                          "\(vue) doit dire où son son de premier plan atterrit")
        }
    }
}

/// **Le libellé de l'interrupteur DIT la destination** (#4722).
///
/// « Contenu de publication · Pièce jointe du post, avec son lecteur » est juste
/// sur un post texte et FAUX sur une scène, où le même choix pose une puce sur
/// la toile — sans lecteur sous le texte, puisqu'il n'y a pas de texte.
///
/// > Un interrupteur dont le libellé décrit ce que l'option fait AILLEURS est
/// > pire qu'un libellé vague : il est vérifiable, et il est faux. L'auteur qui
/// > le lit choisit sciemment autre chose que ce qu'il obtient.
final class ComposerSoundRoleCopyDestinationTests: XCTestCase {

    /// **Sur une scène, l'option ne dit PAS la même chose que sur un document.**
    ///
    /// Le témoin porte sur la DIFFÉRENCE, jamais sur le mot français : ces
    /// chaînes sont localisées dans sept langues, et l'hôte de test tourne sous
    /// la locale du simulateur. Une première version cherchait « scène » et
    /// rougissait sur « Chip on the scene » — un test juste sur le fond, faux
    /// sur la façon de le mesurer.
    ///
    /// > **Un témoin qui affirme le CONTENU d'une chaîne localisée mesure la
    /// > locale de la machine autant que la règle.** Ce qu'il doit prouver ici
    /// > est que le libellé SUIT la destination ; la traduction, elle, est
    /// > gardée par le cliquet du catalogue.
    func test_surUneScene_lOptionNeDiTPasLaMemeChoseQueSurUnDocument() {
        let scene = ComposerSoundRoleCopy.label(.foreground, destination: .sceneChip)
        let document = ComposerSoundRoleCopy.label(.foreground, destination: .contentCard)
        XCTAssertFalse(scene.isEmpty)
        XCTAssertNotEqual(scene, document,
                          "le même choix pose une puce ici et une pièce jointe là — "
                          + "un libellé qui ne bougerait pas mentirait sur l'un des deux")
    }

    /// Et sa définition suit la même destination — c'est elle qui porte la
    /// promesse du redimensionnement.
    func test_laDefinition_suitLaDestination() {
        XCTAssertNotEqual(ComposerSoundRoleCopy.description(.foreground, destination: .sceneChip),
                          ComposerSoundRoleCopy.description(.foreground, destination: .contentCard))
    }

    /// **Le cas du document ne bouge pas.** Ce lot ajoute une lecture, il n'en
    /// change aucune : un appelant qui n'offre aucun placement — les deux du
    /// fil — lit exactement ce qu'il lisait hier.
    func test_leDefaut_estCeluiDuDocument() {
        XCTAssertEqual(ComposerSoundRoleCopy.label(.foreground),
                       ComposerSoundRoleCopy.label(.foreground, destination: .contentCard))
        XCTAssertEqual(ComposerSoundRoleCopy.description(.foreground),
                       ComposerSoundRoleCopy.description(.foreground, destination: .contentCard))
    }

    /// **Le FOND ne dépend pas de la destination**, et c'est voulu : il est le
    /// même objet sur les deux surfaces — la bande-son de la slide. Le faire
    /// varier aurait inventé une différence que le modèle ne porte pas.
    func test_leFOND_diTLaMemeChoseSurLesDeuxSurfaces() {
        XCTAssertEqual(ComposerSoundRoleCopy.label(.background, destination: .sceneChip),
                       ComposerSoundRoleCopy.label(.background, destination: .contentCard))
    }
}

/// **Les DEUX chemins d'ingestion passent par la règle** (#4722).
///
/// Le témoin de valeur ci-dessus prouve que la règle répond juste ; celui-ci
/// prouve qu'on la CONSULTE. C'est la moitié qui manquait : la règle
/// `ComposerAudioPlacement` existait déjà et rendait la bonne réponse depuis
/// des semaines, pendant que deux sites la contournaient chacun à sa façon.
///
/// > Une règle juste que personne n'interroge n'a jamais corrigé personne.
final class ComposerSoundDestinationWiringGuardTests: XCTestCase {

    private var source: String {
        get throws {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // .../Unit/Composer
                .deletingLastPathComponent()   // .../Unit
                .deletingLastPathComponent()   // .../MeeshyTests
                .deletingLastPathComponent()   // .../apps/ios
                .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Sound.swift")
            return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        }
    }

    /// Deux appels, un par chemin : l'enregistrement (`applyCreatedAudio`) et le
    /// fichier importé (`ingestSoundFiles`). Un seul suffirait à laisser l'autre
    /// diverger, ce qui était l'état exact du 2026-09-01.
    ///
    /// Le troisième appel est chez l'hôte de la FEUILLE — il ne pose pas un son,
    /// il NOMME le choix. Compté à part parce qu'il répond à une autre question.
    func test_lesDeuxCheminsDIngestion_consultentLaRegle() throws {
        let code = try source
        let appels = code.components(separatedBy: "ComposerSoundDestination.forForeground(").count - 1
        XCTAssertEqual(appels, 3,
                       "deux poses — enregistrement et fichier importé — plus le libellé de la feuille")
    }

    /// **L'œil et l'oreille lisent la MÊME chaîne** (#4722).
    ///
    /// Le libellé visible et le libellé VoiceOver du même bouton viennent de la
    /// même règle et reçoivent la même destination. Sans cela, l'écran dirait
    /// « Puce sur la scène » et VoiceOver « Contenu de publication » — deux
    /// promesses pour un bouton, et c'est celle qu'on n'entend pas qui ment,
    /// donc celle que personne ne corrige.
    func test_lOeilEtLOreille_lisentLaMemeChaine() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/AudioPostComposerView.swift")
        let feuille = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        let nus = feuille.components(separatedBy: "ComposerSoundRoleCopy.label(role)").count - 1
        XCTAssertEqual(nus, 0,
                       "aucun libellé de rôle ne se compose sans sa destination")
        let avecDestination = feuille
            .components(separatedBy: "ComposerSoundRoleCopy.label(role, destination: foregroundDestination)").count - 1
        XCTAssertEqual(avecDestination, 2, "le texte peint ET le libellé VoiceOver")
    }

    /// **Et aucun des deux ne décide par lui-même.** La forme fautive est
    /// exactement celle qu'on écrit sans y penser : un `attachPastedAudio` en
    /// premier plan posé hors de toute branche de destination.
    func test_lePremierPlan_nEcritPlusEnDehorsDeLaRegle() throws {
        let code = try source
        let poses = code.components(separatedBy: "attachPastedAudio(url: destination, role: .foreground)").count - 1
        XCTAssertEqual(poses, 1, "un seul site, et il est dans la branche `.sceneChip`")
    }
}
