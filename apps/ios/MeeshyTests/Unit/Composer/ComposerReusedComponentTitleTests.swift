import XCTest
@testable import Meeshy

/// **D (#3881) — un composant réutilisé annonce le TITRE de son contexte.**
///
/// `AudioLanguagePickerView` et `EmojiPickerSheet` vivent d'abord ailleurs
/// (la langue d'un AUDIO, la RÉACTION à un message) ; le meuble les REMONTE.
/// Sans titre paramétrable, la feuille de langue du POST affichait
/// « Langue de l'audio » et la feuille d'emoji « Réactions » — deux mensonges
/// de contexte. Le titre devient un paramètre À DÉFAUT : le contexte d'origine
/// reste juste sans toucher ses appelants, et le meuble passe le sien.
///
/// Ces gardes sont NÉGATIVES — elles s'éteignent en silence si la source lue
/// est vide ou mal nommée (cf. `tasks/lessons.md`). Chaque preuve porte donc
/// son garde-foul : la question est « rougirait-elle si on réintroduisait le
/// mensonge ? », et retirer un `title:` du meuble la fait rougir.
final class ComposerReusedComponentTitleTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // .../Unit/Composer
        .deletingLastPathComponent()   // .../Unit
        .deletingLastPathComponent()   // .../MeeshyTests
        .deletingLastPathComponent()   // .../apps/ios

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // 1 — le meuble NOMME sa langue : « Langue du post », jamais « Langue de l'audio ».
    func test_leMeubleNommeSaLangueDePost() throws {
        let host = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(host.contains("structMeeshyComposerHost"), "MeeshyComposerHost introuvable ou vide")
        XCTAssertTrue(
            host.contains("title:\"Languedupost\""),
            "Le meuble doit passer `title: \"Langue du post\"` à `AudioLanguagePickerView`. Sans cet argument, "
                + "la feuille de langue du POST hérite du défaut « Langue de l'audio » — le mensonge de contexte "
                + "que #3881 corrige."
        )
    }

    // 2 — le meuble NOMME sa feuille d'emoji par sa clé de contexte, jamais « Réactions ».
    func test_leMeubleNommeSaFeuilleEmoji_parSaCleDeContexte() throws {
        let host = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(
            host.contains("EmojiPickerSheet(quickReactions:Self.quickEmojis"),
            "Le meuble doit toujours monter `EmojiPickerSheet` avec ses emojis de tête"
        )
        XCTAssertTrue(
            host.contains("title:\"composer.attach.emoji\""),
            "Le meuble insère l'emoji dans le TEXTE ; sa feuille ne s'intitule pas « Réactions » mais réutilise "
                + "`composer.attach.emoji` (déjà 7 locales). Retirer l'argument ferait mentir le titre."
        )
    }

    // 3 — le composant garde son défaut d'ORIGINE, pour que ses appelants audio restent justes.
    func test_lAudioPickerDeclareTitre_avecDefautLangueDeLAudio() throws {
        let picker = compact(try source("Meeshy/Features/Main/Views/AudioPostComposerView.swift"))
        XCTAssertTrue(picker.contains("structAudioLanguagePickerView"), "AudioLanguagePickerView introuvable ou vide")
        XCTAssertTrue(
            picker.contains("vartitle:LocalizedStringResource=\"Languedel'audio\""),
            "`AudioLanguagePickerView` doit DÉCLARER `var title` avec le défaut « Langue de l'audio ». Retirer le "
                + "défaut casserait ses trois appelants audio ou les ferait basculer sur le titre du post."
        )
    }

    // 4 — la feuille d'emoji garde son défaut d'ORIGINE « Réactions » (clé emoji.title).
    func test_lEmojiSheetDeclareTitre_avecDefautReactions() throws {
        let sheet = compact(try source("Meeshy/Features/Main/Views/EmojiPickerSheet.swift"))
        XCTAssertTrue(sheet.contains("structEmojiPickerSheet"), "EmojiPickerSheet introuvable ou vide")
        XCTAssertTrue(sheet.contains("vartitle:LocalizedStringResource"), "`EmojiPickerSheet` doit DÉCLARER `var title`")
        XCTAssertTrue(
            sheet.contains("\"emoji.title\",defaultValue:\"Reactions\""),
            "Le défaut de `EmojiPickerSheet.title` doit rester `emoji.title` / « Reactions » — pour que ses "
                + "appelants de réaction (fil, préférences) gardent leur titre sans le répéter."
        )
    }

    // 5 — les DEUX clés de contexte du meuble sont traduites dans les 7 locales (cliquet i18n).
    func test_lesClesDeContexte_sontTraduitesDansLes7Locales() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(catalog.utf8)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        let locales = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]
        for key in ["Langue du post", "composer.attach.emoji"] {
            guard let entry = strings?[key] as? [String: Any],
                  let locs = entry["localizations"] as? [String: Any] else {
                XCTFail("Clé « \(key) » absente du catalogue")
                continue
            }
            for loc in locales {
                XCTAssertNotNil(locs[loc], "Clé « \(key) » : locale « \(loc) » manquante (cliquet i18n)")
            }
        }
    }
}
