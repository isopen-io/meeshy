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

    // MARK: - « Trois surfaces »

    func test_storyHeader_mountsBackgroundSoundBadge() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge("),
            "Le header de story doit monter BackgroundSoundBadge — la vue commune E1."
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
        XCTAssertFalse(
            text.contains("let headerAudioDisplay: AudioChipHeaderModel"),
            "Le modèle d'affichage pré-E1 (dérivé, sans title/duration séparables) ne doit " +
            "plus être déclaré — remplacé par l'annonce brute BackgroundAudioAnnouncement."
        )
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
