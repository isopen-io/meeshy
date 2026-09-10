import XCTest
@testable import Meeshy
import MeeshySDK

/// L'ACCORD DES JOURS sur le hero de la flamme.
///
/// Trois formulations de série écrivaient « jours » sans condition — une série
/// d'UN jour affichait donc « 1 jours d'affilée », « Record : 1 jours » et
/// « Encore 1 jours avant le jalon de 7 ».
///
/// **Le défaut ne se voyait dans aucun test parce qu'aucune fixture n'avait la
/// valeur 1.** Les témoins existants exerçaient 5, 6, 11 — tous pluriels, tous
/// d'accord avec le mot figé. Un corpus qui ne contient pas le cas ne peut ni
/// l'infirmer ni le confirmer.
///
/// ## POURQUOI CE FICHIER A ÉTÉ RÉÉCRIT (2026-09-10)
///
/// Sa première version affirmait le texte FRANÇAIS — `contains("1 jour")` — en
/// déclarant que « l'hôte de test tourne en français ». **C'était vrai sur un
/// poste de développement, et faux sur la CI** : `String(localized:)` résout
/// contre les langues préférées de l'HÔTE, et l'hôte de test EST l'app. Un
/// simulateur créé par `simctl create` n'a aucune langue configurée, donc rend
/// l'anglais — et la clé `progression.streak.days` possède bien une entrée `en`.
/// Ces quatre témoins étaient rouges sur `main` depuis leur écriture, en même
/// temps que quarante-deux autres, sans que `dev` puisse le voir (son travail
/// s'arrête à `Build for testing`).
///
/// Le dépôt avait déjà payé et documenté exactement ce piège, dans
/// `ComposerSelectionMarkerWiringGuardTests` : un témoin y était vert parce que
/// le simulateur portait un `AppleLanguages = ["fr"]` résiduel, écrit par une
/// vérification antérieure. Sa conclusion s'applique ici mot pour mot :
///
/// > « La leçon n'est pas « pincer la locale » […] C'est la NATURE de
/// > l'assertion qui était fautive. »
///
/// **La production, elle, est juste** (`ProgressionCopy.streak`) : une branche
/// explicite sur `== 1` et deux clés distinctes. Ce qu'il faut donc garder n'est
/// pas un TEXTE mais la PROPRIÉTÉ — que l'accord ait lieu — et elle s'observe
/// sans connaître la langue du lecteur.
@MainActor
final class ProgressionStreakPluralTests: XCTestCase {

    /// Ce qui reste d'un rendu une fois les CHIFFRES ôtés : le mot accordé, et
    /// lui seul. « 1 jour d'affilée » → « jour d'affilée » ; « 6 jours
    /// d'affilée » → « jours d'affilée ». Deux rendus qui ne diffèrent QUE par
    /// leur nombre laissent alors le même reste — c'est exactement le défaut.
    private func motAccorde(_ rendu: String) -> String {
        rendu.filter { !$0.isNumber }.trimmingCharacters(in: .whitespaces)
    }

    /// L'ACCORD A LIEU — quelle que soit la langue de l'hôte.
    ///
    /// Les deux langues que l'hôte peut porter ici marquent le pluriel (le
    /// poste de développement rend le français, la CI l'anglais) ; l'assertion
    /// tient dans les deux, et c'est tout ce dont ce témoin a besoin.
    private func assertAccorde(
        _ singulier: @autoclosure () -> String,
        _ pluriel: @autoclosure () -> String,
        ligne: UInt = #line
    ) {
        let un = singulier()
        let plusieurs = pluriel()
        XCTAssertNotEqual(
            motAccorde(un), motAccorde(plusieurs),
            "« \(un) » et « \(plusieurs) » ne diffèrent que par leur nombre : le mot n'est pas accordé.",
            line: ligne
        )
    }

    func test_uneSerieDUnJour_saccordeAuSingulier() {
        assertAccorde(ProgressionCopy.streak(1), ProgressionCopy.streak(6))
    }

    func test_unRecordDUnJour_saccordeAuSingulier() {
        assertAccorde(ProgressionCopy.streakRecord(1), ProgressionCopy.streakRecord(11))
    }

    private func echelle(value: Int, next: Int) -> EngagementScaleProgress {
        EngagementScaleProgress(
            value: value,
            tiers: [],
            reachedCount: 1,
            previousThreshold: 3,
            nextThreshold: next,
            progress: Double(value) / Double(next)
        )
    }

    func test_unJourAvantLeJalon_saccordeAuSingulier() {
        // Six jours tenus sur sept : il en reste UN. Puis trois sur sept : il en reste QUATRE.
        assertAccorde(
            ProgressionCopy.nextStep(for: echelle(value: 6, next: 7), kind: .streak),
            ProgressionCopy.nextStep(for: echelle(value: 3, next: 7), kind: .streak)
        )
    }

    /// Le pluriel reste pluriel — un correctif d'accord qui casse l'autre cas
    /// n'a fait que déplacer le défaut. Sans texte : deux valeurs plurielles
    /// différentes doivent laisser le MÊME mot.
    func test_lePlurielResteAuPluriel() {
        XCTAssertEqual(
            motAccorde(ProgressionCopy.streak(6)), motAccorde(ProgressionCopy.streak(11)),
            "deux séries plurielles doivent porter le même mot"
        )
        XCTAssertEqual(
            motAccorde(ProgressionCopy.streakRecord(6)), motAccorde(ProgressionCopy.streakRecord(11)),
            "deux records pluriels doivent porter le même mot"
        )
    }

    /// ET LE FRANÇAIS, ÉPINGLÉ À SA SOURCE — puisque le rendu ne peut plus le
    /// dire. Le catalogue est la seule autorité sur le texte français, et il ne
    /// dépend d'aucun hôte : c'est là que le défaut d'origine vivait
    /// (« 1 jours »), et c'est là qu'on l'interdit.
    ///
    /// Le français de cette clé passe par des VARIATIONS plurielles
    /// (`variations.plural.one` / `.other`), pas par un `stringUnit` plat — la
    /// première version de ce témoin cherchait le plat et rendait « pas de
    /// valeur française », sur un catalogue parfaitement correct. Un témoin qui
    /// se trompe de FORME accuse la donnée qu'il ne sait pas lire.
    func test_leCatalogueFrancais_porteLesDEUXFormes() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // apps/ios
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let catalogue = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let chaines = try XCTUnwrap(catalogue?["strings"] as? [String: Any])

        func fr(_ cle: String) throws -> [String: Any] {
            let entree = try XCTUnwrap(chaines[cle] as? [String: Any], "clé absente du catalogue : \(cle)")
            return try XCTUnwrap((entree["localizations"] as? [String: Any])?["fr"] as? [String: Any],
                                 "pas d'entrée française pour \(cle)")
        }
        func valeur(_ noeud: [String: Any]?) -> String? {
            ((noeud?["stringUnit"] as? [String: Any])?["value"] as? String)
        }

        let variations = try XCTUnwrap(
            ((try fr("progression.streak.days")["variations"] as? [String: Any])?["plural"]) as? [String: Any],
            "la clé plurielle doit porter des variations `plural` en français"
        )
        let un = try XCTUnwrap(valeur(variations["one"] as? [String: Any]), "variation `one` absente")
        let plusieurs = try XCTUnwrap(valeur(variations["other"] as? [String: Any]), "variation `other` absente")

        XCTAssertTrue(un.contains("jour"), "la variation singulière doit dire « jour » : « \(un) »")
        XCTAssertFalse(un.contains("jours"), "la variation singulière ne doit PAS dire « jours » : « \(un) »")
        XCTAssertTrue(plusieurs.contains("jours"), "la variation plurielle doit dire « jours » : « \(plusieurs) »")

        /* La clé DÉDIÉE au singulier — celle que `ProgressionCopy` élit par sa
           branche `== 1` — doit s'accorder elle aussi. Sans elle, la branche
           Swift serait juste et le texte servi faux. */
        let cleUn = try XCTUnwrap(valeur(try fr("progression.streak.days.one")),
                                  "la clé du singulier doit porter une valeur française plate")
        XCTAssertTrue(cleUn.contains("jour") && !cleUn.contains("jours"),
                      "« \(cleUn) » doit être au singulier")
    }
}
