import XCTest
@testable import Meeshy

/// A sheet's two bar buttons are not "the left one" and "the right one" — they are a
/// *cancellation* and a *confirmation*. Expressing them as `.cancellationAction` /
/// `.confirmationAction` instead of `.navigationBarLeading` / `.navigationBarTrailing`
/// hands the sides back to the system, which is what makes the pair mirror correctly in
/// a right-to-left locale, lets the platform bind Escape / Return to them, and gives the
/// commit its native prominence. The raw bar placements are additionally deprecated
/// since iOS 17 in favour of `.topBarLeading` / `.topBarTrailing`.
///
/// These are source-level assertions: they read the SwiftUI sources rather than render
/// them, which is what lets them run without a simulator and pin cross-file consistency.
@MainActor
final class SheetToolbarSemanticsTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Source trees compiled into the shipping iOS app targets.
    private let scannedTargets = ["Meeshy", "MeeshyShareExtension", "MeeshyNotificationExtension"]

    private static let deprecatedPlacements = [
        "placement: .navigationBarLeading",
        "placement: .navigationBarTrailing",
    ]

    private func readSource(_ path: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(path), encoding: .utf8)
    }

    // MARK: - Migrated in 221i, RE-VISÉ au lot 4.8

    /// Les fichiers du meuble, nommés. La liste est ADDITIVE : en retirer une
    /// entrée sans la remplacer perd une surface de la mesure, en silence.
    private static let moodComposerFiles = [
        "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift",
        // Le meuble est découpé (#4102). La liste étant ADDITIVE, ses trois
        // extensions y entrent : sans elles la mesure perdrait les surfaces
        // et les feuilles qui ont déménagé.
        "Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift",
        "Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift",
        "Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift",
        "Meeshy/Features/Main/Composer/ComposerMoodSurface.swift",
    ]

    /// **La raison d'origine, portée sur la surface qui a remplacé l'écran.**
    ///
    /// `StatusComposerView` déclarait sa paire en `.cancellationAction` /
    /// `.confirmationAction` pour rendre les CÔTÉS au système — c'est cela, et
    /// non le nom des placements, qui fait miroiter la paire en locale RTL et
    /// qui lie Échap / Retour. Le meuble (lot 4.6) n'a plus de barre de
    /// navigation du tout : il PEINT sa croix (`ComposerMoodSurface.header`,
    /// tenue par `onClose`) et sa flèche (`MeeshyComposerHost.publishButton`)
    /// dans des piles qui miroitent d'elles-mêmes.
    ///
    /// La propriété se dédouble donc : la paire existe toujours, et aucun de ses
    /// deux membres n'est épinglé à un côté de barre déprécié. Laisser cette
    /// garde sur l'ancien chemin l'aurait fait ÉCHOUER à la lecture ; la
    /// supprimer aurait laissé le meuble libre d'y revenir sans un mot.
    func test_moodComposer_paintsItsDismissAndCommitWithoutAnyBarSide() throws {
        // Le meuble est découpé (#4102) : la flèche vit désormais dans
        // `+Socle`, et elle n'est plus `private` (Swift ne rend un `private`
        // visible qu'aux extensions du même fichier). L'adresse devient donc
        // l'UNITÉ — lire le seul fichier principal ferait échouer la garde sur
        // un membre simplement déménagé.
        let host = try AppSourceGuard.composerHostSource()
        let surface = try readSource("Meeshy/Features/Main/Composer/ComposerMoodSurface.swift")

        XCTAssertTrue(
            surface.contains("let onClose: () -> Void"),
            "La surface du mood doit porter sa SORTIE : sans barre de navigation, personne d'autre ne " +
            "peint la croix, et la feuille n'aurait plus de congé explicite."
        )
        XCTAssertTrue(
            host.contains("var publishButton: some View"),
            "Le socle doit porter la flèche de publication : c'est l'autre membre de la paire, et sans " +
            "elle cette garde ne mesurerait plus qu'une moitié."
        )
        for file in Self.moodComposerFiles {
            let source = try readSource(file)
            for placement in Self.deprecatedPlacements {
                XCTAssertFalse(
                    source.contains(placement),
                    "\(file) épingle une affordance à \(placement) : le côté cesse alors d'appartenir au " +
                    "système, et la paire ne miroite plus en locale RTL — le catalogue porte `ar`."
                )
            }
        }
    }

    /// The migration is a consistency fix, not an invention: `EditPostSheet` is the
    /// structurally identical composer sheet (cancel + a publish button that swaps in a
    /// `ProgressView` while saving) and already ships this pair. If that sibling ever
    /// regresses, the doctrine this iteration mirrored is gone and so is its rationale.
    func test_editPostSheet_remainsTheReferenceComposerSheet() throws {
        let source = try readSource("Meeshy/Features/Main/Components/EditPostSheet.swift")

        XCTAssertTrue(source.contains("ToolbarItem(placement: .cancellationAction)"))
        XCTAssertTrue(source.contains("ToolbarItem(placement: .confirmationAction)"))
    }

    // MARK: - Remaining debt is pinned, not merely tolerated

    /// Unlike the `NavigationView` sweep, this debt is not yet zero. Ten screens still
    /// pin a toolbar item to a bar side; each needs its own judgement call (a *pushed*
    /// view's trailing item is often genuinely a bar item and not a confirmation, so a
    /// blanket rewrite would be wrong). Pinning the exact set keeps the remaining work
    /// visible and stops it from growing.
    func test_deprecatedBarPlacementsDoNotSpread() throws {
        var offenders: Set<String> = []
        for target in scannedTargets {
            let root = iosRoot.appendingPathComponent(target)
            guard let walker = FileManager.default.enumerator(atPath: root.path) else { continue }
            for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
                let source = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
                if Self.deprecatedPlacements.contains(where: { source.contains($0) }) {
                    offenders.insert((relativePath as NSString).lastPathComponent)
                }
            }
        }

        let expected: Set<String> = [
            // AudioPostComposerView.swift + EmojiPickerSheet.swift retirés au
            // LOT 1-A : leurs feuilles custom sont passées à `.cancellationAction`
            // (cf. `test_customComposerSheets_carryASemanticCancel`).
            "CreateShareLinkView.swift",
            "CreateTrackingLinkView.swift",
            "InviteFriendsSheet.swift",
            "MagicLinkView.swift",
            "MyStoriesView.swift",
            "SecurityVerificationView.swift",
            "StoryViewerView+Content.swift",
            "VoiceProfileManageView.swift",
        ]
        XCTAssertEqual(
            offenders, expected,
            "The set of screens pinning a toolbar item to a deprecated bar side changed. If one was " +
            "migrated to .cancellationAction / .confirmationAction, shrink this expectation; if a new " +
            "one appeared, prefer the semantic placement instead."
        )
        // RE-VISÉ au lot 4.8 : `StatusComposerView.swift` est retiré, et cette
        // ligne serait devenue vraie sur un fichier absent — verte en ayant
        // perdu son objet. Ce qui la remplace nomme les fichiers du meuble, qui
        // servent désormais le mood.
        for file in Self.moodComposerFiles {
            XCTAssertFalse(
                offenders.contains((file as NSString).lastPathComponent),
                "\(file) épingle un item de barre à un côté déprécié : le mood a été porté sur le meuble " +
                "en 4.6 précisément pour que sa paire appartienne au système."
            )
        }
    }

    // MARK: - A (#3880) — chrome uniforme des feuilles de création CUSTOM

    /// **Les feuilles de création CUSTOM du composer portent une SORTIE
    /// sémantique** — un `.cancellationAction` (le Cancel), placé par le système
    /// donc miroité en RTL et lié à Échap, jamais un côté de barre déprécié. Le
    /// confirm reste l'affordance CONTEXTUELLE de chaque feuille : la sélection
    /// d'une ligne pour les pickers (langue, lieu — `LocationPickerView` livre
    /// déjà exactement ce modèle), la barre d'action du bas pour le composer
    /// audio. C'est la doctrine que `EditPostSheet` et `LocationPickerView`
    /// embarquent déjà. Les pickers NATIFS (photo `.photosPicker`, caméra,
    /// fichier `.fileImporter`) sont HORS périmètre — Apple impose leur chrome.
    ///
    /// Garde NÉGATIVE-adjacente : les garde-fouls `struct …` empêchent qu'un
    /// chemin faux passe au vert sur une source vide.
    func test_customComposerSheets_carryASemanticCancel() throws {
        // AudioPostComposerView.swift porte DEUX feuilles custom — le composer
        // audio ET son sélecteur de langue — donc DEUX sorties sémantiques.
        let audio = try readSource("Meeshy/Features/Main/Views/AudioPostComposerView.swift")
        XCTAssertTrue(audio.contains("struct AudioPostComposerView"), "AudioPostComposerView introuvable ou vide")
        XCTAssertTrue(audio.contains("struct AudioLanguagePickerView"), "AudioLanguagePickerView introuvable ou vide")
        XCTAssertEqual(
            audio.components(separatedBy: "placement: .cancellationAction").count - 1, 2,
            "AudioPostComposerView.swift doit porter DEUX `.cancellationAction` — le composer audio et son " +
            "sélecteur de langue. En retirer un rendrait une feuille sans Cancel sémantique, ou le rangerait " +
            "sur un côté de barre déprécié (non miroité en RTL)."
        )

        let emoji = try readSource("Meeshy/Features/Main/Views/EmojiPickerSheet.swift")
        XCTAssertTrue(emoji.contains("struct EmojiPickerSheet"), "EmojiPickerSheet introuvable ou vide")
        XCTAssertTrue(
            emoji.contains("placement: .cancellationAction"),
            "EmojiPickerSheet doit porter un `.cancellationAction` — un tap sur un emoji sélectionne (le " +
            "confirm), le Cancel ferme sans insérer."
        )

        let location = try readSource("Meeshy/Features/Main/Components/LocationPickerView.swift")
        XCTAssertTrue(location.contains("struct LocationPickerView"), "LocationPickerView introuvable ou vide")
        XCTAssertTrue(
            location.contains("placement: .cancellationAction"),
            "LocationPickerView — la référence déjà livrée — doit garder son `.cancellationAction` : un tap " +
            "sur un lieu confirme, le Cancel ferme sans choisir."
        )
    }
}
