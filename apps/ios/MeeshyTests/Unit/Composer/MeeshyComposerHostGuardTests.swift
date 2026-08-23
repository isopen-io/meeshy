import XCTest
@testable import Meeshy

/// C2 — gardes de SOURCE sur `MeeshyComposerHost`, le meuble du composer unifié.
///
/// Pourquoi des gardes de source et pas des tests de rendu : ce que ces règles
/// protègent n'est pas une valeur calculée mais une STRUCTURE de vue — « le
/// socle ne bouge jamais », « l'œil du socle EST le lecteur », « le host
/// enveloppe l'atelier au lieu de le réécrire ». Aucune de ces trois n'a de
/// sortie observable qu'un test unitaire pourrait lire ; toutes se cassent en
/// silence à la première refonte de la vue.
///
/// Ces gardes sont NÉGATIVES pour deux d'entre elles, et une garde négative meurt
/// en silence : elle passe au vert le jour où le symbole qu'elle cherche est
/// simplement renommé. La question à se poser à chaque relecture n'est pas
/// « passe-t-elle ? » mais « **rougirait-elle si on réintroduisait l'interdit ?** ».
/// D'où `test_theGuardsReadANonEmptySource`, qui échoue si le fichier lu est vide
/// ou introuvable — sans lui, une faute de chemin rendrait TOUTE cette suite
/// verte par omission.
final class MeeshyComposerHostGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try hostSource())
    }

    /// Le garde-fou des gardes. Sans lui, un chemin devenu faux ferait passer
    /// toutes les assertions négatives ci-dessous sur une chaîne vide.
    func test_theGuardsReadANonEmptySource() throws {
        let code = try hostCode()
        XCTAssertGreaterThan(code.count, 400, "La source du host est introuvable ou vide — les gardes ci-dessous ne mesureraient RIEN")
        XCTAssertTrue(code.contains("struct MeeshyComposerHost"), "Le fichier lu n'est pas celui du host")
    }

    // MARK: - Le host ENVELOPPE l'atelier, il ne le réécrit pas

    /// L'atelier de composition vit dans le SDK (`StoryComposerView`, des
    /// milliers de lignes éprouvées). Le host est un MEUBLE autour de lui.
    /// Réécrire l'atelier côté app serait la faute la plus coûteuse de ce lot :
    /// deux surfaces divergeraient sans qu'aucun test ne le dise.
    func test_host_wrapsTheSDKWorkshop_ratherThanRewritingIt() throws {
        XCTAssertTrue(
            try hostCode().contains("StoryComposerView("),
            "Le host doit MONTER `StoryComposerView` du SDK — anti-réécriture"
        )
    }

    /// Loi 6 de la doctrine — « le lecteur EST l'aperçu ». Composer et viewers
    /// partagent un seul registre de rendu ; un quatrième chemin d'aperçu
    /// casserait le WYSIWYG par construction.
    func test_host_previewIsThePlayer_inPreviewMode() throws {
        let code = try hostCode()
        XCTAssertTrue(code.contains("MeeshyScenePlayer("), "L'œil du socle doit être `MeeshyScenePlayer`, jamais un aperçu maison")
        XCTAssertTrue(code.contains(".preview"), "Le lecteur de l'aperçu tourne en mode `.preview`")
    }

    // MARK: - Le socle ne bouge JAMAIS

    /// Loi 5 de la doctrine (P1). Le socle est le point fixe du composer : ses
    /// trois zones sont toujours là, dans le même ordre, quelle que soit
    /// l'origine. Un socle qui se réorganise selon la porte redevient une
    /// barre d'outils contextuelle — exactement ce que ce chantier retire.
    func test_socle_keepsItsThreeZones_inOrder() throws {
        let code = try hostCode()
        guard let audience = code.range(of: "audienceChip"),
              let preview = code.range(of: "previewEye"),
              let publish = code.range(of: "publishButton") else {
            return XCTFail("Les trois zones du socle doivent être nommées : audienceChip, previewEye, publishButton")
        }
        XCTAssertTrue(audience.lowerBound < preview.lowerBound, "L'audience précède l'œil")
        XCTAssertTrue(preview.lowerBound < publish.lowerBound, "L'œil précède la publication")
    }

    /// Garde NÉGATIVE — la plus fragile, et la plus importante. Le socle ne peut
    /// pas être retiré conditionnellement : `.hidden()` ou un `if` qui l'entoure
    /// le feraient disparaître pour une porte donnée, ce que la loi 5 interdit.
    func test_socle_isNeverHiddenNorConditionallyRemoved() throws {
        let code = try hostCode()
        guard let socleRange = code.range(of: "private var socle") else {
            return XCTFail("Le socle doit être une propriété nommée `socle` — la garde s'ancre dessus")
        }
        let socleBody = String(code[socleRange.lowerBound...].prefix(1200))
        XCTAssertFalse(socleBody.contains(".hidden()"), "Le socle ne se cache jamais (loi 5 — le socle ne bouge pas)")
        XCTAssertFalse(socleBody.contains("if profile"), "Le socle ne se retire pas selon le profil")
    }

    // MARK: - Aucune UI morte : les capacités suivent le PROFIL

    /// Spec §D du lot C. Une affordance montée puis désactivée est une promesse
    /// non tenue (loi 4 — « rien à l'écran sans raison »). Le chemin de capture
    /// n'est donc pas monté du tout quand le profil le refuse — pas grisé,
    /// ABSENT.
    func test_host_gatesCaptureOnTheProfile() throws {
        let code = try hostCode()
        XCTAssertTrue(
            code.contains("profile.allowsCapture"),
            "Le chemin capture doit être conditionné à `profile.allowsCapture`, pas monté puis désactivé"
        )
    }

    func test_host_gatesSlidesAndTimelineOnTheProfile() throws {
        let code = try hostCode()
        XCTAssertTrue(code.contains("profile.showsSlides"), "Les diapositives suivent le profil")
        XCTAssertTrue(code.contains("profile.showsTimeline"), "La timeline suit le profil")
    }

    /// C1 a posé `routesToLegacy` : une porte qui route vers un composer
    /// historique n'ouvre PAS le host. Le host doit honorer ce routage, sinon
    /// C1 devient une donnée que personne ne lit.
    func test_host_honoursTheLegacyRouting() throws {
        XCTAssertTrue(
            try hostCode().contains("routesToLegacy"),
            "Le host doit lire `routesToLegacy` — sans quoi la table de C1 ne gouverne rien"
        )
    }

    // MARK: - C3 — le host rend au cover ce que le cover donne

    /// **Le piège le plus cher de ce lot.** `StoryComposerView.init` donne à
    /// `initialVisibility` une valeur PAR DÉFAUT (`PostVisibility.friends`) :
    /// monter l'atelier sans le paramètre ne produit AUCUNE erreur de
    /// compilation, et la mémoire d'audience — la loi 10 — disparaît en
    /// silence. Le host la reçoit donc de sa porte et la transmet.
    ///
    /// Le jumeau de cette garde vit dans `AppInitWireupTests` : il vérifie que
    /// TOUT site de création passe le paramètre, ici comme dans le cover.
    func test_host_handsTheMemorisedAudienceToTheWorkshop() throws {
        let code = try hostCode()
        XCTAssertTrue(
            code.contains("initialVisibility: initialVisibility"),
            "Le host doit passer `initialVisibility` à l'atelier — le défaut du SDK avalerait la mémoire d'audience sans un mot"
        )
        XCTAssertTrue(
            code.contains("let initialVisibility: String"),
            "L'audience d'ouverture est un paramètre OBLIGATOIRE du host : un défaut ici recréerait le même silence un cran plus haut"
        )
    }

    /// Sans adoption, le composer s'autosauvegarde sous un id NEUF et le
    /// brouillon repris reste intact à côté, en double. L'adoption doit se
    /// faire à la construction du ViewModel : l'atelier décide dès son premier
    /// passage s'il propose une reprise.
    func test_host_adoptsThePendingDraft_atViewModelConstruction() throws {
        let code = try hostCode()
        XCTAssertTrue(
            code.contains("adoptDraft(id:"),
            "Le host doit adopter le brouillon désigné par la porte — sinon la reprise se dédouble"
        )
        guard let adoption = code.range(of: "adoptDraft(id:"),
              let stateObject = code.range(of: "StateObject(wrappedValue:") else {
            return XCTFail("L'adoption et la construction du @StateObject doivent être nommées dans le host")
        }
        XCTAssertTrue(
            adoption.lowerBound < stateObject.lowerBound,
            "L'adoption précède la construction du @StateObject — adopter après coup arrive trop tard pour l'offre de reprise"
        )
    }

    /// Les trois fournisseurs d'environnement restent app-side (MapKit,
    /// AVCaptureSession, PhotoKit). Un site de présentation qui les oublie fait
    /// disparaître la pastille « Lieu » et les amorces de page blanche — sans
    /// le moindre signal. `AppInitWireupTests` compte l'égalité
    /// injections == présentations fichier par fichier ; cette garde-ci nomme
    /// les trois pour que l'échec soit lisible depuis la suite du composer.
    func test_host_injectsTheThreeAppSideProviders() throws {
        let code = try hostCode()
        for provider in [".storyLocationPickerProvided()",
                         ".storyCameraCaptureProvided()",
                         ".storyRecentCameraRollProvided()"] {
            XCTAssertTrue(code.contains(provider), "Le host doit injecter \(provider) sur l'atelier qu'il monte")
        }
    }

    // MARK: - L'éventail (loi 4)

    /// Garde NÉGATIVE, et son sens est l'inverse de ce qu'on attendrait.
    ///
    /// `ComposerFormatFan` est écrit et testé, mais le host ne le monte PAS,
    /// et ce n'est pas un oubli : l'offre ne varie jamais à l'exécution
    /// (`ComposerReelGate.compositionQualifiesAsReel` est encore constante) et
    /// la sélection n'est lue par personne — changer de chip ne changerait ni
    /// la surface montée ni le type publié. Un sélecteur sans conséquence est
    /// l'UI morte que ce chantier retire partout ailleurs ; l'y réintroduire
    /// parce que le composant existe serait la reproduire.
    ///
    /// Elle rougit à la RÉINTRODUCTION du montage. Sa condition de LEVÉE est
    /// écrite ici pour que la prochaine session n'ait pas à la deviner : V1
    /// (le gate réel nourrit l'éventail) ET V2/V3 (changer de format change la
    /// surface). Quand les deux tiennent, ce test se RETOURNE — il ne se
    /// supprime pas.
    func test_host_doesNotMountTheFan_whileTheOfferCannotVary() throws {
        let code = try hostCode()
        XCTAssertFalse(
            code.contains("ComposerFormatFan("),
            "L'éventail ne se monte pas tant qu'il n'a aucune conséquence — cf. V1 + V2/V3"
        )
        XCTAssertFalse(
            code.contains("ComposerFormatFanPolicy."),
            "… et sa politique de sélection n'a pas de lecteur non plus tant qu'il n'est pas monté"
        )
    }

    // MARK: - Gardes NÉGATIVES : un seul chemin de publication, un seul gate réel

    /// Le host ne publie pas. `publishAllSlides()` du SDK flush la timeline
    /// ouverte, rabat les effets du canvas courant sur la diapositive
    /// (`handoffSlides`) et lit la visibilité tenue par l'atelier — tout cela
    /// dans l'état privé de `StoryComposerView`. Reconstituer ce paquet
    /// app-side enverrait un document que personne n'a rabattu, et doublerait
    /// une file que V7 doit unifier.
    ///
    /// Garde NÉGATIVE : elle rougit à la RÉINTRODUCTION de l'un de ces appels
    /// dans le host, pas à la disparition d'un fichier —
    /// `test_theGuardsReadANonEmptySource` en répond.
    func test_host_opensNoSecondPublicationPath() throws {
        let code = try hostCode()
        for forbidden in ["onPublishAllInBackground(",
                         "publishStoryInBackground(",
                         "updateStoryInBackground(",
                         "PostService",
                         "StoryPublishService"] {
            XCTAssertFalse(
                code.contains(forbidden),
                "Le host appelle « \(forbidden) » : c'est un SECOND chemin de publication. Le seul publieur est la barre du SDK."
            )
        }
    }

    /// Le gate du réel était écrit DEUX fois en dur (`compositionQualifiesAsReel: false`,
    /// aux deux seuls sites de production qui construisent un profil). V1 doit
    /// avoir UN endroit à brancher : deux littéraux jumeaux se corrigent à
    /// moitié, et le plateau offrirait alors un réel que le routage ignore.
    func test_host_hasASingleReelGate_notTwinHardcodedLiterals() throws {
        let code = try hostCode()
        XCTAssertEqual(
            occurrences(of: "compositionQualifiesAsReel: false", in: code), 0,
            "Le gate du réel ne se réécrit pas en dur : il passe par `ComposerReelGate`, le seul point que V1 aura à brancher"
        )
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "ComposerReelGate.compositionQualifiesAsReel", in: code), 2,
            "Les deux constructions de profil du host lisent le MÊME gate"
        )
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }
}
