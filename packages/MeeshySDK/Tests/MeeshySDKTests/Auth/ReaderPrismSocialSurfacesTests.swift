import XCTest
@testable import MeeshySDK

/// **Ce que le fil, les stories et les commentaires AFFICHENT (#11832)** — la
/// projection `APIPost.resolveTranslation`, servie par la descente du lecteur.
///
/// Les témoins s'écrivent sur un rang AUTRE que le premier (leçon 261) : au rang
/// 1, les défauts de composition et le Prisme strict rendent le même verdict, et
/// le témoin ne pourrait pas tomber. Les deux écarts réels sont au rang 4 (locale
/// de l'appareil que le serveur n'a pas encore vue) et à l'absence de langue
/// configurée (repli « fr »).
final class ReaderPrismSocialSurfacesTests: XCTestCase {

    private let spanishPost: [String: APIPostTranslationEntry] = [
        "fr": APIPostTranslationEntry(text: "Bonjour à tous", translationModel: nil, confidenceScore: nil, createdAt: nil),
        "en": APIPostTranslationEntry(text: "Hello everyone", translationModel: nil, confidenceScore: nil, createdAt: nil),
    ]

    /// Rang 1 « de » sans traduction, appareil en anglais que le serveur n'a
    /// pas encore vu : la traduction anglaise (rang 4) est servie.
    func test_rankFour_deviceLocaleUnknownToTheServer_servesItsTranslation() {
        let reader = MeeshyUser(id: "u", username: "lea", systemLanguage: "de", deviceLocale: "")
        let device = Locale(identifier: "en_US")

        let served = APIPost.resolveTranslation(translations: spanishPost, originalLanguage: "es",
                                                preferredLanguages: ReaderPrism.resolve(for: reader, current: device))

        XCTAssertEqual(served, "Hello everyone")
        XCTAssertNil(APIPost.resolveTranslation(translations: spanishPost, originalLanguage: "es",
                                                preferredLanguages: reader.preferredContentLanguages),
                     "les défauts de composition ignorent la locale de l'appareil : le lecteur restait sur l'original")
    }

    /// Aucune langue configurée, appareil en anglais : l'anglais, jamais un
    /// français que personne n'a choisi.
    func test_noConfiguredLanguage_servesTheDeviceLanguage_notTheFrenchFallback() {
        let reader = MeeshyUser(id: "u", username: "sam", deviceLocale: "")
        let device = Locale(identifier: "en_GB")

        let served = APIPost.resolveTranslation(translations: spanishPost, originalLanguage: "es",
                                                preferredLanguages: ReaderPrism.resolve(for: reader, current: device))

        XCTAssertEqual(served, "Hello everyone")
        XCTAssertEqual(APIPost.resolveTranslation(translations: spanishPost, originalLanguage: "es",
                                                  preferredLanguages: reader.preferredContentLanguages),
                       "Bonjour à tous",
                       "le repli « fr » des défauts de composition servait du français à un lecteur anglophone")
    }

    /// La langue d'origine concourt à son rang : rang 2 = langue du post ⇒
    /// l'original, même si une traduction de rang 3 existe.
    func test_originalLanguageAtRankTwo_servesTheOriginal() {
        let reader = MeeshyUser(id: "u", username: "noa", systemLanguage: "de", regionalLanguage: "es", deviceLocale: "en")

        XCTAssertNil(APIPost.resolveTranslation(translations: spanishPost, originalLanguage: "es",
                                                preferredLanguages: ReaderPrism.resolve(for: reader)))
    }
}
