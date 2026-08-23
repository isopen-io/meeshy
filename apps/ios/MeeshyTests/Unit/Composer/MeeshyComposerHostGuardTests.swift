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
}
