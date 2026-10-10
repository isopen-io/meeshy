import XCTest
import MeeshySDK
@testable import Meeshy
@testable import MeeshyUI

/// **La fiche détail DIT ce qu'elle joue, et le toucher l'arrête** (#5602,
/// directive porteur 2026-09-07).
///
/// > « L'entête ne contient pas le sinusoïde du son ou la référence crédit du
/// > son alors que ça devrait, avec même action stop play quand on touche ! »
///
/// ## La panne que ces témoins gardent
///
/// Quatre surfaces LISENT une publication ; trois montaient `BackgroundSoundBadge`
/// (carte du fil, viewer story, réel). La fiche détail n'en appelait que les
/// helpers STATIQUES pour décider d'un bouton muet — elle jouait donc un son
/// sans jamais dire lequel, ni offrir de l'arrêter.
///
/// > **Utiliser le résolveur d'une vue sans monter la vue ne rougit nulle
/// > part** : le prédicat est bon, l'annonce juste, le bouton bien gardé — et
/// > l'utilisateur n'apprend ni le titre, ni l'auteur, ni la durée.
@MainActor
final class DetailSceneSoundHeaderTests: XCTestCase {

    // MARK: - Fabriques

    private func trace(id: String = "a1",
                       waveform: [Float] = [],
                       soundId: String? = "6a97198de19ad1985081d6a6") -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(id: id, postMediaId: "pm1", name: "Miroir")
        audio.isBackground = true
        audio.waveformSamples = waveform
        audio.soundId = soundId
        audio.soundAuthorUsername = "jcnm"
        audio.duration = 308
        return audio
    }

    private func effects(with audio: StoryAudioPlayerObject?) -> StoryEffects {
        var e = StoryEffects()
        e.audioPlayerObjects = audio.map { [$0] }
        return e
    }

    // MARK: - Le résolveur d'existence est PARTAGÉ avec le badge

    /// La trace et l'annonce répondent à la MÊME question — « quelle entrée est
    /// le fond ? ». Deux `first(where:)` écrits côte à côte divergeraient le
    /// jour où le prédicat change.
    func test_backgroundTrace_findsTheBackgroundEntry() {
        let piste = trace()
        XCTAssertEqual(BackgroundSoundBadge.backgroundTrace(of: effects(with: piste))?.id, piste.id)
    }

    func test_backgroundTrace_isNil_withoutABackgroundEntry() {
        var posee = trace(id: "posee")
        posee.isBackground = false
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: effects(with: posee)))
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: effects(with: nil)))
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: nil))
    }

    /// Le prédicat d'existence de la trace et celui du badge tombent ENSEMBLE :
    /// c'est ce qui interdit un en-tête muet au-dessus d'un badge présent, ou
    /// l'inverse.
    func test_traceAndAnnouncement_existTogether() {
        let avec = effects(with: trace())
        XCTAssertNotNil(BackgroundSoundBadge.backgroundTrace(of: avec))
        XCTAssertTrue(BackgroundSoundBadge.showsMuteButton(for: BackgroundSoundBadge.announcement(for: avec)))

        let sans = effects(with: nil)
        XCTAssertNil(BackgroundSoundBadge.backgroundTrace(of: sans))
        XCTAssertFalse(BackgroundSoundBadge.showsMuteButton(for: BackgroundSoundBadge.announcement(for: sans)))
    }

    // MARK: - Le TROISIÈME terme de la lecture : la commande du viewer

    /// **Le témoin discriminant.** Avant ce lot, `isPaused` ne connaissait que
    /// la visibilité et l'appel — deux conditions SUBIES. La fiche détail
    /// n'offrait aucun stop/play.
    func test_viewerCommand_pausesEvenWhenVisibleAndCallFree() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true,
                                                        callActive: false,
                                                        viewerPaused: true),
                      "Arrêter doit arrêter : la commande du viewer est un OU, jamais un ET.")
    }

    func test_viewerCommandAbsent_keepsTheHistoricalRule() {
        XCTAssertFalse(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: false))
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false, callActive: false))
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true, callActive: true))
    }

    /// Reprendre ne peut pas RESSUSCITER une lecture que la visibilité ou un
    /// appel interdisent — sans quoi le bouton ferait jouer une scène hors
    /// écran, ou par-dessus un appel.
    func test_resuming_neverOverridesTheSufferedTerms() {
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: false,
                                                        callActive: false,
                                                        viewerPaused: false))
        XCTAssertTrue(StoryDetailPlaybackPolicy.isPaused(visible: true,
                                                        callActive: true,
                                                        viewerPaused: false))
    }

    // MARK: - L'en-tête : ce qu'il rend, et ce qu'il tait

    /// Pas de piste ⇒ RIEN. La scène reprend toute la hauteur, et aucun
    /// contrôle ne paraît pour un son qui n'existe pas.
    func test_header_rendersNothing_withoutATrack() throws {
        let vue = PostSceneSoundHeader(trace: nil, announcement: .none, isMuted: false, isPaused: false,
                                       accentHex: "#7C3AED", onToggleMute: {}, onTogglePlayback: {})
        XCTAssertNil(vue.trace)
    }

    /// **L'œil et VoiceOver reçoivent la même information.** L'onde est une
    /// image muette pour le lecteur d'écran : sans cette composition, VoiceOver
    /// n'apprendrait ni le titre ni la durée que l'écran affiche.
    func test_accessibilityLabel_carriesCreditAndDuration() throws {
        let vue = PostSceneSoundHeader(trace: trace(), announcement: .original, isMuted: false, isPaused: false,
                                       accentHex: "#7C3AED", onToggleMute: {}, onTogglePlayback: {})
        let libelle = try XCTUnwrap(vue.trace.map { vue.accessibilityLabel(for: $0) })
        XCTAssertTrue(libelle.contains("Miroir"), libelle)
        XCTAssertTrue(libelle.contains("jcnm"), libelle)
        XCTAssertTrue(libelle.contains("5:08") || libelle.contains("5:09"), libelle)
    }

    /// Le toucher CHANGE quelque chose — sans quoi la trace serait le contrôle
    /// inerte que `MuteButtonExistenceGuardTests` a déjà rejeté deux fois.
    func test_touching_togglesTheViewerCommand() {
        var arrete = false
        let vue = PostSceneSoundHeader(trace: trace(), announcement: .original, isMuted: false, isPaused: arrete,
                                       accentHex: "#7C3AED", onToggleMute: {},
                                       onTogglePlayback: { arrete.toggle() })
        vue.onTogglePlayback()
        XCTAssertTrue(arrete)
        vue.onTogglePlayback()
        XCTAssertFalse(arrete)
    }

    // MARK: - Le crédit, pas une sinusoïde de repli (#9677)

    /// Un son EMPRUNTÉ s'annonce au détail comme partout : par son crédit qui
    /// défile — jamais par la sinusoïde de l'original, qui mentirait sur sa
    /// provenance. La rangée du composer, montée ici avant, en peignait une de
    /// REPLI faute de relevé.
    func test_aBorrowedSound_isAnnouncedByItsCredit_notAWaveform() {
        let empruntee = trace(soundId: "6a97198de19ad1985081d6a6")
        let annonce = BackgroundSoundBadge.announcement(for: effects(with: empruntee))
        guard case .credit(let titre, let auteur, _, _) = annonce else {
            return XCTFail("Un son de la bibliothèque doit s'annoncer par son crédit — reçu \(annonce)")
        }
        XCTAssertEqual(titre, "Miroir")
        XCTAssertEqual(auteur, "jcnm")
    }

    func test_anOriginalSound_keepsTheWaveform() {
        let propre = trace(soundId: nil)
        XCTAssertEqual(BackgroundSoundBadge.announcement(for: effects(with: propre)), .original)
    }

    /// La ligne du détail MONTE le badge des autres surfaces, et ne garde plus
    /// la rangée du composer avec sa sinusoïde de repli.
    func test_theDetailHeader_mountsTheSharedBadge() throws {
        let src = MyStoriesSourceCorpus.strippingComments(
            try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/PostSceneSoundHeader.swift"))
        XCTAssertTrue(src.contains("BackgroundSoundMuteControl("),
                      "le détail doit dire le son comme la carte, le réel et la story")
        XCTAssertFalse(src.contains("showsWaveformEvenWhenBorrowed"),
                       "plus de sinusoïde de repli sous un son emprunté")
        XCTAssertFalse(src.contains("ComposerSoundTraceRow("),
                       "la rangée du composer tronquait sans défiler")
    }

    /// Le détail d'une story republiée DIT le son que son embed joue — celui de
    /// la source, sur la même ligne que le chemin natif.
    func test_theRepostEmbed_carriesTheSoundOfTheStoryItPlays() throws {
        let src = MyStoriesSourceCorpus.strippingComments(
            try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/PostDetailView+RepostEmbed.swift"))
        XCTAssertTrue(src.contains("sceneSoundHeader(repost.storyEffects)"),
                      "l'embed d'une story republiée doit porter la trace du son qu'il joue")
    }

    // MARK: - La note coupe le son (#9677, directive porteur 2026-10-08)

    /// Toucher la note coupe le son de fond ; la retoucher le rétablit — et
    /// c'est l'état du canvas (`isCanvasMuted`) qu'elle bascule, pas la pause.
    func test_touchingTheNote_mutesThenRestoresTheBackgroundSound() {
        var coupe = false
        var arrete = false
        let vue = PostSceneSoundHeader(trace: trace(), announcement: .original, isMuted: coupe,
                                       isPaused: arrete, accentHex: "#7C3AED",
                                       onToggleMute: { coupe.toggle() },
                                       onTogglePlayback: { arrete.toggle() })
        vue.onToggleMute()
        XCTAssertTrue(coupe)
        XCTAssertFalse(arrete, "couper le son n'arrête pas l'image")
        vue.onToggleMute()
        XCTAssertFalse(coupe)
    }

    /// Le détail pilote le MÊME état que l'ancien baffle, et le baffle est parti.
    func test_theDetail_hasNoSpeakerButtonForTheBackgroundSound() throws {
        let canvas = MyStoriesSourceCorpus.strippingComments(
            try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/PostDetailView+Canvas.swift"))
        XCTAssertTrue(canvas.contains("onToggleMute: { isCanvasMuted.toggle() }"))
        XCTAssertTrue(canvas.contains("isMuted: isCanvasMuted"))
        let detail = MyStoriesSourceCorpus.strippingComments(
            try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/PostDetailView.swift"))
        XCTAssertFalse(detail.contains("muteIconName(isMuted: isCanvasMuted)"),
                       "plus de baffle dans la rangée d'actions : la note le remplace")
    }
}
