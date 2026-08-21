import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// Gardes du bouton 🔇 — Lot E, Task E2 (« trois surfaces, monté si piste
/// seulement »). B3.6.
///
/// « UN SEUL prédicat partagé avec E1 » : le bouton n'existe QUE si
/// `BackgroundSoundBadge.announcement(for:)` (le résolveur unique, E1) ne
/// rend pas `.none` — jamais une seconde condition d'existence recopiée à la
/// main qui pourrait diverger. `BackgroundSoundBadge.showsMuteButton(for:)`
/// est CE prédicat, écrit une fois à côté de `backgroundSound(of:)`/
/// `announcement(for:)` (E1), appelé par les surfaces qui montent un bouton
/// muet — jamais un `!= .none` recopié localement (vérifié par
/// `test_readingSurfaces_neverRecomputeExistenceLocally`).
///
/// Trois surfaces (B3.6) :
/// - carte de post (`FeedPostCard`, rangée d'engagement) — NOUVEAU ;
/// - détail de post (`PostDetailView`, rangée d'engagement) — NOUVEAU, le
///   tap contrôle RÉELLEMENT le canvas story inline (`mute:` n'est plus
///   figé à `false`) ;
/// - plein écran post (galerie média / `VideoTransportControls`, SDK) — a
///   DÉJÀ son mute (`manager.isMuted`) : assertion de NON-régression.
///
/// Non-régression, hors des « trois » : le rail du viewer story
/// (`StoryViewerView+Sidebar`, `isGlobalMuted`) et l'audio natif du réel
/// plein écran (`ReelsPlayerView`, `manager.isMuted` toujours réaffirmé à
/// `false` par `drive()`) restent INCHANGÉS — `ReelsPlayerView` gagne son
/// propre bouton LOCAL (fond audio storyEffects, pas l'audio natif de la
/// vidéo), sans toucher `drive()`.
///
/// Pas de ViewInspector dans ce dépôt (même limite que
/// `BackgroundSoundBadgeTests`) : gardes de source (`MyStoriesSourceCorpus`,
/// déjà comment-strippé) + comportement des fonctions PURES.
final class MuteButtonExistenceGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    // MARK: - B3.6 existence : un prédicat pur, partagé

    func test_showsMuteButton_noneAnnouncement_isFalse() {
        XCTAssertFalse(BackgroundSoundBadge.showsMuteButton(for: .none))
    }

    func test_showsMuteButton_originalAnnouncement_isTrue() {
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(for: .original))
    }

    func test_showsMuteButton_creditAnnouncementWithMetadata_isTrue() {
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(
            for: .credit(title: "Nuits d'été", username: "sam", duration: 15)
        ))
    }

    /// Cache froid (métadonnées `nil`) : la piste EXISTE toujours (B3.4, « si
    /// et seulement si » — `.credit` ne dégénère jamais vers `.none`), le
    /// bouton doit donc rester monté.
    func test_showsMuteButton_creditAnnouncementWithoutMetadata_isTrue() {
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(
            for: .credit(title: nil, username: nil, duration: nil)
        ))
    }

    // MARK: - « L'icône dit l'état »

    func test_muteIconName_whenMuted_isSpeakerSlash() {
        XCTAssertEqual(BackgroundSoundBadge.muteIconName(isMuted: true), "speaker.slash.fill")
    }

    func test_muteIconName_whenUnmuted_isSpeakerWave() {
        XCTAssertEqual(BackgroundSoundBadge.muteIconName(isMuted: false), "speaker.wave.2.fill")
    }

    // MARK: - Câblage : les surfaces neuves réutilisent le prédicat PARTAGÉ, jamais un `!= .none` recopié

    func test_readingSurfaces_neverRecomputeExistenceLocally() throws {
        let surfaces = [
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
        ]
        for path in surfaces {
            let text = try source(path)
            XCTAssertFalse(
                text.contains("!= .none") || text.contains("!= BackgroundAudioAnnouncement.none"),
                "\(path) ne doit jamais recopier localement une condition d'existence " +
                "(`!= .none`) — un seul prédicat partagé, BackgroundSoundBadge.showsMuteButton(for:)."
            )
        }
    }

    // MARK: - Carte (FeedPostCard) — rangée d'engagement

    func test_feedPostCard_mountsMuteButton_gatedBySharedAnnouncement() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(
            text.contains("private var backgroundSoundAnnouncement: BackgroundAudioAnnouncement"),
            "La carte doit exposer l'annonce résolue (E1) comme UNE valeur réutilisable."
        )
        XCTAssertTrue(
            text.contains("announcement: backgroundSoundAnnouncement"),
            "Le badge (E1) doit consommer cette MÊME valeur — pas une résolution séparée."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.showsMuteButton(for: backgroundSoundAnnouncement)"),
            "Le bouton muet doit se monter via le prédicat partagé, sur la MÊME valeur que le badge."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.muteIconName(isMuted: isBackgroundSoundMuted)"),
            "L'icône du bouton doit dire l'état via le helper partagé."
        )
    }

    func test_feedPostCard_muteState_isLocalNotGlobal() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(
            text.contains("@State private var isBackgroundSoundMuted"),
            "Le muet de la carte doit être un état LOCAL à la carte."
        )
        XCTAssertFalse(
            text.contains("isGlobalMuted"),
            "La carte ne doit JAMAIS référencer le muet global du viewer story — surfaces indépendantes."
        )
    }

    // MARK: - Détail (PostDetailView) — rangée d'engagement + canvas RÉELLEMENT muté

    func test_postDetailView_mountsMuteButton_gatedBySharedResolver() throws {
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.announcement(for: StoryItem(feedPost: post).storyEffects)"),
            "Le détail doit résoudre l'annonce via le MÊME résolveur partagé (E1), sur l'effectif " +
            "storyEffects (native OU repost-de-story via la cascade de StoryItem(feedPost:))."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.showsMuteButton(for:"),
            "Le bouton muet du détail doit se monter via le prédicat partagé."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.muteIconName(isMuted: isCanvasMuted)"),
            "L'icône du bouton doit dire l'état via le helper partagé."
        )
    }

    /// Le tap doit RÉELLEMENT contrôler le lecteur local : les DEUX sites qui
    /// rendaient le canvas story avec `mute: false` figé (natif + repost-de-
    /// story, RF3) passent par le même état local.
    func test_postDetailView_canvasSites_wireToLocalMuteState() throws {
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        let wiredOccurrences = text.components(separatedBy: "mute: isCanvasMuted").count - 1
        XCTAssertEqual(
            wiredOccurrences, 2,
            "Les DEUX sites StoryReaderRepresentable (natif + repost-de-story, RF3) doivent " +
            "consommer le même état local — pas un troisième site oublié, pas une régression " +
            "vers un seul site câblé."
        )
        XCTAssertFalse(
            text.contains("mute: false"),
            "Aucun site ne doit plus figer le mute à `false` — c'est précisément ce que le " +
            "bouton local doit désormais piloter."
        )
    }

    func test_postDetailView_muteState_isLocalNotGlobal() throws {
        let text = try source("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(
            text.contains("@State private var isCanvasMuted"),
            "Le muet du détail doit être un état LOCAL à la vue."
        )
        XCTAssertFalse(
            text.contains("isGlobalMuted"),
            "Le détail ne doit JAMAIS référencer le muet global du viewer story."
        )
    }

    // MARK: - Plein écran POST (galerie média / VideoTransportControls) — NON-régression, 3e surface

    func test_postFullscreenGallery_stillMountedByCardAndDetail_noRegression() throws {
        for path in [
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("ConversationMediaGalleryView("),
                "\(path) : la galerie plein écran (qui porte déjà VideoTransportControls.muteButton, " +
                "SDK) ne doit pas régresser — 3e surface de B3.6, non réécrite ici."
            )
        }
    }

    // MARK: - Rail du viewer story — NON-régression (déjà son propre muet, hors périmètre)

    func test_storyViewerSidebar_muteRail_noRegression() throws {
        let text = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(
            text.contains("railPlan.showsSound"),
            "Le rail garde sa propre condition d'existence (piste audible) — non touchée par E2."
        )
        XCTAssertTrue(
            text.contains(#"isGlobalMuted ? "speaker.slash.fill" : "speaker.wave.2.fill""#),
            "L'icône du rail doit continuer à dire l'état — même convention, non régressée."
        )
        XCTAssertTrue(
            text.contains("toggleGlobalMute()"),
            "Le rail continue de basculer le muet GLOBAL du reader — E2 ne le touche pas."
        )
    }

    // MARK: - Réel plein écran (ReelsPlayerView) — bouton local NEUF, natif inchangé

    func test_reelsPlayerView_mountsMuteButton_gatedBySharedAnnouncement() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.showsMuteButton(for: announcement)"),
            "Le bouton muet du réel doit se monter via le prédicat partagé, sur la MÊME " +
            "valeur `announcement` que le badge de la ligne meta (E1)."
        )
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.muteIconName(isMuted: isBackgroundSoundMuted)"),
            "L'icône du bouton doit dire l'état via le helper partagé."
        )
        XCTAssertTrue(
            text.contains("@State private var isBackgroundSoundMuted"),
            "Le muet du fond du réel doit être un état LOCAL à la page."
        )
    }

    func test_reelsPlayerView_muteState_isLocalNotGlobal() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertFalse(
            text.contains("isGlobalMuted"),
            "Le réel ne doit JAMAIS référencer le muet global du viewer story."
        )
    }

    /// Non-régression FORTE : le réel plein écran joue TOUJOURS avec le son
    /// natif — `drive()` réaffirme `manager.isMuted = false` inconditionnellement
    /// à chaque passage. Le bouton NEUF (fond storyEffects) ne doit PAS
    /// toucher à cette réaffirmation, sous peine de la faire fuiter en dehors
    /// de son passage et de re-museler le réel après un tap utilisateur.
    func test_reelsPlayerView_nativeAudioAlwaysOnInvariant_notDisturbed() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(
            text.contains("manager.isMuted = false"),
            "L'invariant « le viewer plein écran joue TOUJOURS avec le son natif » " +
            "(réaffirmé par drive()) ne doit pas régresser — le bouton NEUF pilote un " +
            "état LOCAL séparé (fond storyEffects), jamais `manager.isMuted`."
        )
    }
}
