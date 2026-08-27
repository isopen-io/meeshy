import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **#4030 — le quatrième format de l'éventail du fil.**
///
/// Le fan du fil offrait `[.post, .story]` (+ `.reel` quand la composition
/// qualifie). Le Mood n'était atteignable que par sa PORTE (`.moodChip`), si
/// bien qu'un auteur qui venait d'écrire deux lignes dans le composer du fil
/// n'avait aucun moyen d'en faire un mood sans fermer, revenir et retaper.
///
/// La règle vit dans un `enum` pur — jamais dans un `body` — pour la même
/// raison que `ComposerReelGate` : une condition posée dans une vue est
/// invisible aux tests. Elle est sa JUMELLE, et les deux gates sont MUTUELLEMENT
/// EXCLUSIFS par construction : le réel exige un média, le mood exige qu'il n'y
/// en ait aucun.
final class ComposerMoodGateTests: XCTestCase {

    // MARK: - Le prédicat

    func test_leTexteSeul_qualifieLeMood() {
        XCTAssertTrue(ComposerMoodGate.compositionQualifiesAsMood(
            text: "Belle journée", hasMedia: false, hasScene: false, moodEmoji: nil))
    }

    func test_uneCompositionVide_neQualifiePas() {
        XCTAssertFalse(ComposerMoodGate.compositionQualifiesAsMood(
            text: "", hasMedia: false, hasScene: false, moodEmoji: nil))
    }

    /// Du blanc n'est pas du texte — sans quoi une espace tapée par accident
    /// ferait apparaître un format dans l'éventail.
    func test_duBlanc_neQualifiePas() {
        XCTAssertFalse(ComposerMoodGate.compositionQualifiesAsMood(
            text: "   \n\t ", hasMedia: false, hasScene: false, moodEmoji: nil))
    }

    func test_unMediaPose_retireLeMood() {
        XCTAssertFalse(ComposerMoodGate.compositionQualifiesAsMood(
            text: "Belle journée", hasMedia: true, hasScene: false, moodEmoji: nil))
    }

    /// Une scène née d'une couleur de fond ne porte aucun média, et ne peut
    /// pourtant PAS partir en mood : le mood est une carte sans scène.
    func test_uneScene_retireLeMood_memeSansMedia() {
        XCTAssertFalse(ComposerMoodGate.compositionQualifiesAsMood(
            text: "Belle journée", hasMedia: false, hasScene: true, moodEmoji: nil))
    }

    /// **L'anti-clignotement.** Un gate posé sur le seul texte ferait SORTIR de
    /// la surface mood l'auteur qui efface sa phrase pour la réécrire — le
    /// format se retirerait sous ses doigts, et le repli
    /// (`resolvedSelection`) le renverrait au document en pleine frappe.
    /// L'emoji déjà posé est la preuve qu'un mood est EN COURS.
    func test_lEmojiDejaPose_tientLeMood_memeQuandLeTexteEstVide() {
        XCTAssertTrue(ComposerMoodGate.compositionQualifiesAsMood(
            text: "", hasMedia: false, hasScene: false, moodEmoji: "🌤"))
    }

    /// Un emoji ne rachète PAS un média : la carte mood n'a nulle part où le
    /// mettre.
    func test_lEmoji_neRachetePasUnMedia() {
        XCTAssertFalse(ComposerMoodGate.compositionQualifiesAsMood(
            text: "", hasMedia: true, hasScene: false, moodEmoji: "🌤"))
    }

    /// Le défaut DÉRIVÉ, jamais un `false` littéral — même idiome que
    /// `ComposerReelGate.withoutComposition`.
    func test_sansComposition_leGateEstFerme() {
        XCTAssertFalse(ComposerMoodGate.withoutComposition)
    }

    // MARK: - Ce que la table en fait

    func test_leFilOffreLeMood_quandLaCompositionEstDuTexteSeul() {
        let profil = ComposerProfile.profile(
            for: .feedComposer,
            compositionQualifiesAsReel: false,
            compositionQualifiesAsMood: true
        )
        XCTAssertEqual(profil.offeredFormats, [.post, .story, .status])
        XCTAssertEqual(profil.initialFormat, .post,
                       "L'invariant de C1 tient : le format de la porte reste en tête.")
    }

    func test_leFilNOffrePasLeMood_quandLeGateEstFerme() {
        let profil = ComposerProfile.profile(
            for: .feedComposer,
            compositionQualifiesAsReel: false,
            compositionQualifiesAsMood: false
        )
        XCTAssertFalse(profil.offeredFormats.contains(.status))
    }

    /// Les deux gates sont exclusifs par le PRÉDICAT (le réel exige un média,
    /// le mood l'interdit) ; ce témoin le prouve sur la TABLE, là où un futur
    /// appelant pourrait les ouvrir tous les deux par erreur.
    func test_leReelEtLeMood_neSeCumulentJamaisDansLOffreDuFil() {
        let reel = ComposerProfile.profile(
            for: .feedComposer, compositionQualifiesAsReel: true, compositionQualifiesAsMood: false)
        XCTAssertEqual(reel.offeredFormats, [.post, .story, .reel])
        XCTAssertFalse(reel.offeredFormats.contains(.status))
    }

    /// Le lot ne touche QUE le fil. Une porte qui gagnerait le mood sans
    /// l'avoir demandé publierait un format que sa chaîne ne sait pas produire.
    func test_aucuneAutrePorte_neGagneLeMood_quandLeGateEstOuvert() {
        let autres: [ComposerOrigin] = [
            .storyTray, .reelTab, .moodChip,
            .repost(ofPostId: "p1", sourceFormat: .story),
            .edit(postId: "p2", documentFormat: .post),
            .draft(id: "d1"), .share,
            .conversationMedia(messageId: "m1", attachmentId: "a1")
        ]
        for porte in autres {
            let avant = ComposerProfile.profile(
                for: porte, compositionQualifiesAsReel: false, compositionQualifiesAsMood: false)
            let apres = ComposerProfile.profile(
                for: porte, compositionQualifiesAsReel: false, compositionQualifiesAsMood: true)
            XCTAssertEqual(avant.offeredFormats, apres.offeredFormats,
                           "Le gate du mood ne doit rien changer à la porte \(porte).")
        }
    }

    // MARK: - Le pont vers la surface

    /// Choisir « Mood » dans l'éventail du fil doit MONTER la surface mood —
    /// sans quoi le format serait offert et sans effet (loi 4).
    func test_choisirLeMoodDepuisLeFil_monteLaSurfaceMood() {
        let profil = ComposerProfile.profile(
            for: .feedComposer, compositionQualifiesAsReel: false, compositionQualifiesAsMood: true)
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: profil.opensWith, format: .status),
            .mood
        )
    }

    /// Le repli fait son travail quand le gate se referme : poser un média
    /// alors que « Mood » est choisi ramène au format de la porte, jamais sur
    /// une surface que l'offre ne contient plus.
    func test_poserUnMedia_ramemeLeChoixAuPost() {
        let ferme = ComposerProfile.profile(
            for: .feedComposer, compositionQualifiesAsReel: false, compositionQualifiesAsMood: false)
        XCTAssertEqual(
            ComposerFormatFanPolicy.resolvedSelection(current: .status,
                                                      offeredFormats: ferme.offeredFormats),
            .post
        )
    }

    // MARK: - Le publieur (garde de SOURCE)

    /// **La règle d'ORDRE que la porte du mood a écrite au lot 4.7** : livrer
    /// l'éventail avant le publieur arme une flèche qui, pressée, ne fait RIEN.
    ///
    /// Ici le défaut aurait été pire qu'un no-op : `ComposerDocumentSendPlan`
    /// s'ouvre sur `guard draft.format == .post`, donc un brouillon `.status`
    /// arrivé au publieur du document serait REFUSÉ — l'auteur aurait vu le
    /// format offert, la bonne surface, et un envoi qui se refuse.
    ///
    /// Garde de SOURCE parce que ce qu'elle protège est un AIGUILLAGE de vue :
    /// `DocumentComposerDoor` n'est pas instanciable sans quatre modèles
    /// d'environnement, et l'aiguillage n'a aucune sortie qu'un test unitaire
    /// puisse lire.
    func test_laPorteDuFil_publieUnMoodCommeUnMood_pasCommeUnPost() throws {
        let code = try porteSource()
        XCTAssertFalse(code.isEmpty, "Source introuvable — la garde serait verte par omission.")

        XCTAssertTrue(code.contains("case .status: return await publishMood(draft)"),
                      "La porte du fil doit AIGUILLER `.status` vers un publieur de mood.")
        XCTAssertTrue(code.contains("await statusViewModel.setStatus("),
                      "Le mood part par `StatusViewModel`, le MÊME modèle que la porte du mood — jamais un second chemin d'envoi.")
    }

    /// Le garde-fou de la garde ci-dessus : sans lui, un chemin devenu faux la
    /// rendrait verte sur une chaîne vide.
    private func porteSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
