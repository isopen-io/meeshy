import XCTest
@testable import Meeshy

/// **Un nombre appartient à la locale de son lecteur — chiffres, groupement,
/// glyphe de pourcentage et espacement compris.**
///
/// Aucune chaîne CLDR n'est nommée ici. Les valeurs exactes (« 1 234 » contre
/// « 1,234 », l'espace insécable avant `%` en français) appartiennent à
/// Foundation et peuvent bouger d'une version d'iOS à l'autre ; les figer
/// rendrait la suite rouge sur une mise à jour du simulateur sans qu'aucune
/// règle du produit ait changé. Ce qui est asserté, c'est **la variance** —
/// puisque l'invariance à la locale ÉTAIT précisément le défaut.
@MainActor
final class LocalizedNumberTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")
    private let arabic = Locale(identifier: "ar_SA")

    // MARK: - exact

    func test_exact_keepsEveryDigit() {
        XCTAssertEqual(LocalizedNumber.exact(1_234, locale: english).filter(\.isNumber), "1234")
        XCTAssertEqual(LocalizedNumber.exact(1_500_000, locale: english).filter(\.isNumber), "1500000")
    }

    /// Le groupement des milliers diffère entre français et anglais : c'est la
    /// preuve que la locale est consultée, sans nommer sa convention.
    func test_exact_followsTheReadersLocale() {
        XCTAssertNotEqual(
            LocalizedNumber.exact(1_234, locale: french),
            LocalizedNumber.exact(1_234, locale: english)
        )
    }

    /// L'arabe s'écrit en chiffres arabo-indiens. `"\(n)"` gravait les chiffres
    /// latins — une interface arabe mêlait donc deux systèmes d'écriture.
    func test_exact_arabicUsesItsOwnDigits() {
        let spoken = LocalizedNumber.exact(1_234, locale: arabic)
        XCTAssertFalse(
            spoken.contains("1"),
            "En arabe, le nombre ne doit pas s'écrire en chiffres latins — obtenu « \(spoken) »."
        )
        XCTAssertTrue(spoken.contains(where: \.isNumber), "Il doit rester un nombre.")
    }

    func test_exact_zeroIsRendered() {
        XCTAssertTrue(LocalizedNumber.exact(0, locale: english).contains("0"))
    }

    // MARK: - percent

    /// L'entrée est le pourcentage (`50`), pas la fraction : un appelant qui
    /// passerait `0.5` obtiendrait « 0 % ». Ce test épingle le contrat d'entrée.
    func test_percent_takesThePercentageNotTheFraction() {
        XCTAssertEqual(
            LocalizedNumber.percent(50, locale: english).filter(\.isNumber), "50"
        )
        XCTAssertEqual(
            LocalizedNumber.percent(100, locale: english).filter(\.isNumber), "100"
        )
    }

    /// **Le défaut central de 241i.** Le français veut une espace insécable
    /// avant `%`, l'anglais n'en veut pas ; `MessageOverlayMenu` gravait les
    /// DEUX orthographes à quatre lignes d'écart. Les deux rendus doivent donc
    /// différer — sans que le test dise lequel porte l'espace.
    func test_percent_spacingFollowsTheLocale() {
        XCTAssertNotEqual(
            LocalizedNumber.percent(50, locale: french),
            LocalizedNumber.percent(50, locale: english),
            "Le français et l'anglais n'espacent pas le « % » de la même façon."
        )
    }

    func test_percent_arabicUsesItsOwnDigits() {
        let rendered = LocalizedNumber.percent(50, locale: arabic)
        XCTAssertFalse(
            rendered.contains("5"),
            "En arabe, le pourcentage ne doit pas s'écrire en chiffres latins — obtenu « \(rendered) »."
        )
    }

    /// Pas de décimale parasite : l'entrée est entière, la sortie aussi.
    func test_percent_hasNoFractionalPart() {
        for value in [0, 33, 50, 66, 100] {
            let rendered = LocalizedNumber.percent(value, locale: english)
            XCTAssertFalse(
                rendered.contains("."),
                "\(value) rend « \(rendered) » : un pourcentage entier ne porte pas de décimale."
            )
        }
    }

    // MARK: - La règle de 239i n'a pas changé d'énoncé

    /// `ReachMetricLabel.spokenCount` délègue maintenant ici. Les deux doivent
    /// rendre exactement la même chose — sans quoi la « source unique » en
    /// serait deux.
    func test_reachMetricSpokenCount_delegatesToTheSameRule() {
        for value in [0, 7, 1_234, 1_500_000] {
            XCTAssertEqual(
                ReachMetricLabel.spokenCount(value, locale: french),
                LocalizedNumber.exact(value, locale: french)
            )
        }
    }

    // MARK: - duration — ce que l'app MONTRE

    /// Les trois orthographes coexistaient déjà dans l'app ; ce qui est épinglé
    /// ici est ce qui les DISTINGUE, pas une chaîne CLDR.
    func test_duration_minuteSecond_doesNotPadTheMinute() {
        XCTAssertEqual(
            LocalizedNumber.duration(seconds: 125, locale: english), "2:05"
        )
    }

    func test_duration_paddedMinuteSecond_padsTheMinuteToTwoDigits() {
        XCTAssertEqual(
            LocalizedNumber.duration(
                seconds: 125, clock: .paddedMinuteSecond, locale: english
            ),
            "02:05"
        )
    }

    func test_duration_hourMinuteSecond_carriesThreeFields() {
        XCTAssertEqual(
            LocalizedNumber.duration(
                seconds: 3_900, clock: .hourMinuteSecond, locale: english
            ),
            "1:05:00"
        )
    }

    /// Aucune horloge ne promeut les heures d'elle-même : les douze formateurs
    /// privés remplacés accumulaient les minutes, et la promotion appartient à
    /// l'appelant (`CallManager` est le seul à la vouloir). Le vérifier ici
    /// évite qu'un changement de motif la fasse apparaître en silence sur les
    /// minuteries média.
    func test_duration_minuteSecond_accumulatesMinutesPastAnHour() {
        let past = LocalizedNumber.duration(seconds: 3_695, locale: english)
        XCTAssertEqual(
            past.split(separator: ":").count, 2,
            "L'horloge minute:seconde n'a que deux champs — obtenu « \(past) »."
        )
        XCTAssertNotEqual(
            past, LocalizedNumber.duration(seconds: 95, locale: english),
            "1 h 1 min 35 s et 1 min 35 s ne peuvent pas rendre la même horloge : "
            + "laisser tomber les heures est précisément le défaut que "
            + "`CallManager` a corrigé de son côté."
        )
    }

    /// **Le défaut.** `String(format: "%d:%02d", …)` grave les chiffres latins,
    /// quelle que soit la locale du lecteur.
    func test_duration_arabicUsesItsOwnDigits() {
        let rendered = LocalizedNumber.duration(seconds: 125, locale: arabic)
        XCTAssertFalse(
            rendered.contains("2") || rendered.contains("0") || rendered.contains("5"),
            "En arabe, la durée ne doit pas s'écrire en chiffres latins — obtenu « \(rendered) »."
        )
        XCTAssertTrue(rendered.contains(where: \.isNumber), "Il doit rester une durée.")
    }

    /// `AVPlayer` rend `.nan` avant que l'élément soit prêt et `.infinity` pour
    /// un flux sans durée ; `MessageOverlayMenu.formatTime` portait ce repli
    /// localement. Il vit désormais dans le helper — et il est BORNÉ, parce que
    /// `Int(1e30)` piège à l'exécution là où `isFinite` ne dit rien.
    func test_duration_survivesTheValuesAVPlayerActuallyEmits() {
        for hostile in [TimeInterval.nan, .infinity, -.infinity, -42, 1e30] {
            XCTAssertFalse(
                LocalizedNumber.duration(seconds: hostile, locale: english).isEmpty,
                "\(hostile) doit rendre une durée, pas une chaîne vide."
            )
        }
        XCTAssertEqual(
            LocalizedNumber.duration(seconds: TimeInterval.nan, locale: english),
            LocalizedNumber.duration(seconds: 0, locale: english)
        )
    }

    /// Troncature, jamais arrondi : une minuterie qui affiche « 0:01 » à
    /// 1,9 s ne doit pas sauter à « 0:02 ».
    func test_duration_truncatesTowardZero() {
        XCTAssertEqual(
            LocalizedNumber.duration(seconds: 90.9, locale: english),
            LocalizedNumber.duration(seconds: 90, locale: english)
        )
    }

    // MARK: - spokenDuration — ce que l'app DIT

    /// **Le défaut central de 247i.** « 4:32 » est l'orthographe d'une HEURE :
    /// passée à `.accessibilityValue`, elle faisait annoncer « Le lien expire
    /// dans 4 heures 32 » pour un compte à rebours de quatre minutes et demie.
    /// La forme parlée doit donc DIFFÉRER de l'horloge — c'est l'énoncé, et il
    /// se vérifie sans nommer une seule chaîne CLDR.
    func test_spokenDuration_isNeverTheClockSpelling() {
        for locale in [french, english, arabic] {
            XCTAssertNotEqual(
                LocalizedNumber.spokenDuration(seconds: 272, locale: locale),
                LocalizedNumber.duration(seconds: 272, locale: locale),
                "Ce que VoiceOver ENTEND ne peut pas être l'horloge que l'écran MONTRE."
            )
        }
    }

    /// L'horloge sépare ses champs par « : » ; la forme parlée les NOMME. Un
    /// deux-points survivant signalerait que le style d'unités n'a pas été
    /// appliqué du tout.
    func test_spokenDuration_carriesNoClockSeparator() {
        XCTAssertFalse(
            LocalizedNumber.spokenDuration(seconds: 272, locale: english).contains(":")
        )
    }

    func test_spokenDuration_followsTheReadersLocale() {
        XCTAssertNotEqual(
            LocalizedNumber.spokenDuration(seconds: 272, locale: french),
            LocalizedNumber.spokenDuration(seconds: 272, locale: english)
        )
    }

    /// Une durée nulle est un état RÉEL — la minuterie de la caméra et le pill
    /// d'appel commencent tous deux à zéro. Une valeur d'accessibilité vide
    /// laisserait VoiceOver annoncer le libellé seul, sans sa mesure.
    func test_spokenDuration_zeroIsStillSpoken() {
        for locale in [french, english, arabic] {
            XCTAssertFalse(
                LocalizedNumber.spokenDuration(seconds: 0, locale: locale).isEmpty,
                "Une durée nulle doit s'annoncer, pas disparaître."
            )
        }
    }

    /// Le repli hostile est le même que celui de l'horloge — les deux faces
    /// partagent `wholeSeconds`, et c'est ce partage qui est épinglé.
    func test_spokenDuration_survivesTheValuesAVPlayerActuallyEmits() {
        for hostile in [TimeInterval.nan, .infinity, -1, 1e30] {
            XCTAssertFalse(
                LocalizedNumber.spokenDuration(seconds: hostile, locale: english).isEmpty
            )
        }
    }

    /// La durée d'appel PARLÉE délègue ici — sans quoi la source unique en
    /// serait deux, exactement comme `ReachMetricLabel.spokenCount` plus haut.
    func test_callManagerSpokenDuration_delegatesToTheSameRule() {
        for seconds in [0, 45, 272, 3_900] {
            XCTAssertEqual(
                CallManager.spokenDuration(TimeInterval(seconds), locale: french),
                LocalizedNumber.spokenDuration(seconds: seconds, locale: french)
            )
        }
    }
}
