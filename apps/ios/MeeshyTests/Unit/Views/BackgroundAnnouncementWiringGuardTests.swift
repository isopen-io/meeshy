import XCTest
@testable import Meeshy

/// Garde de câblage — Lot E, Task E1 (« l'annonce du fond : un résolveur,
/// trois surfaces »).
///
/// Les TROIS surfaces de lecture (viewer story, carte de post, plein écran
/// réel) doivent router l'annonce du fond audio à travers
/// `BackgroundSoundBadge.announcement(for:)` — le point d'entrée UNIQUE vers
/// `AudioChipDisplay.backgroundAnnouncement(` (B5, SDK gelé) — et monter la
/// vue commune `BackgroundSoundBadge`. Le header de story ne doit plus
/// fabriquer son propre affichage sonore ad hoc (le chemin que
/// `StoryHeaderMetaGuardTests` verrouillait avant cette migration).
final class BackgroundAnnouncementWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    // MARK: - « Un résolveur » : un seul point de délégation au SDK

    func test_backgroundSoundBadgeFile_delegatesToSDKResolverExactlyOnce() throws {
        let text = try source("Meeshy/Features/Main/Components/BackgroundSoundBadge.swift")
        let occurrences = text.components(separatedBy: "AudioChipDisplay.backgroundAnnouncement(").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "« un résolveur » : AudioChipDisplay.backgroundAnnouncement( ne doit être appelé " +
            "qu'à UN SEUL endroit — les trois surfaces passent par " +
            "BackgroundSoundBadge.announcement(for:), pas par des appels dupliqués."
        )
    }

    /// Corollaire de la garde ci-dessus : elle ne comptait QUE dans
    /// `BackgroundSoundBadge.swift` — une quatrième surface qui appellerait le
    /// résolveur SDK EN DIRECT (en contournant `announcement(for:)`) n'aurait
    /// jamais été détectée. Balaie les TROIS surfaces de lecture elles-mêmes.
    func test_readingSurfaces_neverCallSDKResolverDirectly() throws {
        let surfaces = [
            "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift",
            "Meeshy/Features/Main/Views/StoryViewerView.swift",
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
        ]
        for path in surfaces {
            let text = try source(path)
            let occurrences = text.components(separatedBy: "AudioChipDisplay.backgroundAnnouncement(").count - 1
            XCTAssertEqual(
                occurrences, 0,
                "\(path) ne doit JAMAIS appeler AudioChipDisplay.backgroundAnnouncement( " +
                "directement — seul BackgroundSoundBadge.swift délègue au résolveur SDK."
            )
        }
    }

    // MARK: - « Trois surfaces »

    func test_storyHeader_mountsBackgroundSoundBadge() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge("),
            "Le header de story doit monter BackgroundSoundBadge — la vue commune E1."
        )
    }

    /// Le header story se pose sur un fond de MÉDIA arbitraire (photo/vidéo/
    /// gradient) — jamais une carte à fond de thème clair/sombre connu, à la
    /// différence de `FeedPostCard`. Un accent de couleur d'avatar (souvent
    /// sombre) peut y échouer AA sur un fond de story sombre. Les autres
    /// éléments du MÊME rail (l'horloge, l'heure de publication) utilisent déjà
    /// un blanc à opacité fixe pour cette raison — le badge doit suivre la même
    /// convention plutôt que `group.avatarColor`.
    func test_storyHeader_backgroundSoundBadge_usesFixedWhiteNotAvatarColor() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertFalse(
            text.contains("accentHex: group.avatarColor"),
            "Sur le fond arbitraire d'une story (photo/vidéo), une couleur " +
            "d'avatar n'est pas garantie AA — le header doit passer un accent " +
            "fixe et lisible, comme le reste du rail (horloge, heure)."
        )
    }

    func test_storyHeader_noLongerBuildsAdHocAudioDisplay() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertFalse(
            text.contains("switch headerAudioDisplay.display"),
            "Le header ne doit plus fabriquer son propre affichage sonore ad hoc — il délègue " +
            "désormais à BackgroundSoundBadge (E1)."
        )
        XCTAssertFalse(
            text.contains("StoryHeaderAudioWaveform("),
            "L'onde du fond vit désormais DANS BackgroundSoundBadge — plus dans le header."
        )
        XCTAssertFalse(
            text.contains("let hasBackgroundAudio: Bool"),
            "Le primitive booléenne pré-E1 (existence gérée maintenant par l'enum " +
            "BackgroundAudioAnnouncement lui-même) ne doit plus être déclarée."
        )
    }

    // MARK: - Dette E1c : les signatures retirées ne reviennent pas par l'app

    /// Cette garde disait l'inverse de ce qu'elle prouvait : son doc-comment
    /// jumeau, côté SDK, annonçait que `AudioChipDisplay.resolve` « reste
    /// vivant pour les appelants APP (`StoryViewerView` ×2) », et celle-ci ne
    /// cherchait `AudioChipHeaderModel` que dans UN fichier. Mesuré au
    /// 2026-08-25 :
    /// `grep -rn 'AudioChipDisplay.resolve(' apps/ios/Meeshy` → 0 ligne. Les
    /// trois signatures ont quitté le SDK (E1c) ; l'app balaie désormais tout
    /// son arbre, et rougit dès qu'un site les rappelle.
    func test_sourcesDeLApp_neRappellentAucuneDesTroisSignaturesRetirees() throws {
        let bannis = [
            "AudioChipDisplay.resolve(",
            "AudioChipHeaderModel",
            "StoryAudioAvailability.hasBackgroundAudioTrack",
        ]
        for banni in bannis {
            XCTAssertEqual(
                try Self.appSourceFilesContaining(banni), [],
                "\(banni) a été retiré du SDK (E1c, aucun appelant de production) — " +
                "l'app passe par BackgroundSoundBadge.announcement(for:), le résolveur partagé."
            )
        }
    }

    /// Fichiers de `apps/ios/Meeshy` dont une ligne de CODE contient `needle`
    /// — commentaires retirés, sinon un doc-comment qui NOMME la signature
    /// bannie ferait rougir la garde sans qu'aucun site ne l'appelle.
    private static func appSourceFilesContaining(_ needle: String) throws -> [String] {
        let root = MyStoriesSourceCorpus.appRoot().appendingPathComponent("Meeshy")
        guard let walker = FileManager.default.enumerator(at: root,
                                                          includingPropertiesForKeys: nil) else { return [] }
        let swiftFiles = walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(swiftFiles.count, 100,
                             "Le corpus des sources de l'app est vide ou tronqué — la garde ne prouverait rien")
        return swiftFiles
            .filter { url in
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { return false }
                return MyStoriesSourceCorpus.strippingComments(text).contains(needle)
            }
            .map { $0.lastPathComponent }
            .sorted()
    }

    func test_storyViewer_resolvesAnnouncementThroughSharedHelper() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.announcement(for:"),
            "Le viewer story doit résoudre l'annonce via le résolveur PARTAGÉ, pas en " +
            "ré-implémentant sa propre logique de provenance/existence."
        )
    }

    func test_feedPostCard_mountsBackgroundSoundBadge() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge("),
            "La carte de post doit monter BackgroundSoundBadge."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.announcement(for: post.storyEffects)"),
            "L'annonce doit être résolue via le helper partagé sur post.storyEffects — " +
            "les mêmes champs que le viewer, rien d'inventé."
        )
    }

    /// Non-régression revue totale C8 : l'accent de carte reste
    /// `post.authorColor`, et le chrome (fond + bordure) reste teinté par
    /// lui — la migration E1 ne doit RIEN y changer.
    func test_feedPostCard_accentColorRegression_stillAuthorColor() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(
            text.contains("var accentColor: String { post.authorColor }"),
            "L'accent déterministe du post (revue totale C8) ne doit pas régresser."
        )
        XCTAssertTrue(
            text.contains(".fill(theme.surfaceGradient(tint: accentColor))"),
            "Le fond de carte doit rester teinté par l'accent du post."
        )
        XCTAssertTrue(
            text.contains(".stroke(theme.border(tint: accentColor, intensity: 0.25), lineWidth: 1)"),
            "La bordure de carte doit rester teintée par l'accent du post."
        )
    }

    func test_reelsPlayerView_mountsBackgroundSoundBadge() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge("),
            "Le plein écran réel doit monter BackgroundSoundBadge."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.announcement(for: reel.storyEffects)"),
            "L'annonce doit être résolue via le helper partagé sur reel.storyEffects."
        )
    }
}
