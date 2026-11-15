import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le palier 1 d'une famille de VOLUME s'accorde au singulier (#5859).**
///
/// `AchievementCopy.label` portait UN gabarit par famille, au pluriel — juste
/// à partir du palier 10, faux au palier 1 (« 1 messages envoyés »). C'est le
/// même défaut que #5832 a fermé côté partagé
/// (`packages/shared/utils/achievement-labels.ts` → `ACHIEVEMENT_LABELS_ONE`),
/// jamais porté au miroir iOS jusqu'ici.
///
/// Ces tests appellent `labelOne` directement plutôt que de dépendre de la
/// locale active du bundle de test (non garantie) : ils vérifient la
/// COUVERTURE (dix-huit familles, aucune de plus) et la SUBSTITUTION (le `{n}`
/// n'a pas survécu au remplacement), pas le rendu localisé — la traduction
/// elle-même est garantie par le catalogue et le cliquet français
/// (`FrenchDefaultValueRatchetTests`).
@MainActor
final class AchievementCopySingularAgreementTests: XCTestCase {

    /// Les dix-huit familles de VOLUME — dérivées du catalogue partagé, pas
    /// recopiées à la main : une famille de VOLUME ajoutée demain doit entrer
    /// automatiquement dans ce test, pas y être oubliée.
    private var familiesDeVolume: [AchievementFamily] {
        AchievementCatalog.families.filter { $0.scale == "count" }
    }

    /// Chaque famille de VOLUME a une forme au singulier — sinon le palier 1
    /// retombe silencieusement sur le pluriel et le défaut d'origine revient.
    func test_chaqueFamilleDeVolume_aSaFormeAuSingulier() {
        for famille in familiesDeVolume {
            let mot = AchievementCopy.labelOne(famille.id, n: "1")
            XCTAssertNotNil(mot, "\(famille.id) n'a pas de forme au singulier — le palier 1 rendrait le pluriel")
        }
    }

    /// Les familles d'AMPLEUR ne descendent jamais à 1 (`sizeTiers` commence à
    /// 10) : elles ne doivent PORTER aucune forme au singulier, pour ne pas
    /// laisser croire qu'un accord existe là où le produit ne l'exerce jamais.
    func test_aucuneFamilleDAmpleur_naDeFormeAuSingulier() {
        let famillesDAmpleur = AchievementCatalog.families.filter { $0.scale == "size" }
        XCTAssertFalse(famillesDAmpleur.isEmpty, "précondition : le catalogue doit porter des familles d'ampleur")
        for famille in famillesDAmpleur {
            XCTAssertNil(AchievementCopy.labelOne(famille.id, n: "1"),
                         "\(famille.id) est une famille d'AMPLEUR — elle ne doit jamais avoir de forme au singulier")
        }
    }

    /// Le marqueur `\(n)` a bien été substitué — une entrée de catalogue dont
    /// le placeholder ne correspondrait pas laisserait `%@` brut à l'écran.
    func test_leMarqueurEstSubstitue_dansChaqueFormeAuSingulier() {
        for famille in familiesDeVolume {
            guard let mot = AchievementCopy.labelOne(famille.id, n: "1") else {
                XCTFail("\(famille.id) n'a pas de forme au singulier")
                continue
            }
            XCTAssertTrue(mot.contains("1"), "\(famille.id) : « \(mot) » ne contient pas le palier substitué")
            XCTAssertFalse(mot.contains("%@"), "\(famille.id) : « \(mot) » laisse le placeholder brut")
        }
    }

    /// **Le témoin du symptôme d'origine.** `label(_:tier:)` est le point
    /// d'entrée réel des deux consommateurs (tableau de bord, célébration) :
    /// au palier 1, il doit déléguer à `labelOne`, pas rendre le gabarit
    /// pluriel qui produisait « 1 messages envoyés ». Comparé à `labelOne`
    /// directement plutôt qu'à un texte attendu : robuste à la locale active
    /// du bundle de test, que ce fichier ne contrôle pas.
    func test_label_auPalier1_delegueALaFormeAuSingulier() {
        for famille in familiesDeVolume {
            XCTAssertEqual(
                AchievementCopy.label(famille, tier: 1),
                AchievementCopy.labelOne(famille.id, n: "1"),
                "\(famille.id) : label(tier: 1) ne rend pas la forme au singulier"
            )
        }
    }
}
