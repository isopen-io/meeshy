import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// =============================================================================
//  Un réel COMPOSÉ se rejoue comme sa scène (#6745)
// =============================================================================
//
//  Le lecteur de réels demandait « quels médias ce post porte-t-il ? » et jouait
//  la vidéo brute. Un réel composé porte une SCÈNE : sa vidéo n'en est que le
//  fond — coupée si l'auteur l'a coupée — et son son de fond vit sur la timeline
//  de la scène. Mesuré en production (réel `6aa868a7…8222`) : aucun son de fond,
//  et la vidéo parlait à sa place.
//
//  C'est le défaut que `SocialSceneFullscreenView` a fermé pour les posts :
//
//  > « Une galerie feuillette de la matière ; un canvas se rejoue. »
//
//  Le moteur n'est pas réécrit : `MeeshyScenePlayer` en mode `.reel` rejoue la
//  scène en boucle, avec le son, et publie sa position pour la progression.

extension ReelPageView {
    /// Le document que ce réel rejoue, ou `nil` pour un réel de médias.
    var sceneDocument: CanvasV3? { ReelSceneRouting.sceneDocument(for: reel) }

    var isSceneReel: Bool { sceneDocument != nil }

    /// Le muet du son de fond d'un réel composé. Il pilote le muet du PLAYER de
    /// la scène — le moteur qui joue réellement ce son —, jamais un état écrit
    /// sans consommateur : l'icône dit donc ce qui s'entend.
    var sceneSoundMuteButton: some View {
        Button {
            sceneSoundMuted.toggle()
            HapticFeedback.light()
        } label: {
            Image(systemName: BackgroundSoundBadge.muteIconName(isMuted: sceneSoundMuted))
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(.white.opacity(0.85))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(sceneSoundMuted
            ? String(localized: "reels.action.unmute", defaultValue: "Réactiver le son de fond", bundle: .main)
            : String(localized: "reels.action.mute", defaultValue: "Couper le son de fond", bundle: .main))
    }
}

/// La position de lecture de la scène, publiée à la cadence du player et lue par
/// la SEULE barre de progression : la page ne se ré-évalue pas à chaque image.
@MainActor
final class ReelSceneClock: ObservableObject {
    nonisolated deinit {}

    @Published var progress: Double = 0
}

/// La scène d'un réel composé, jouée plein écran.
///
/// La lecture suit la MÊME porte que la vidéo d'un réel simple
/// (`ReelMediaAutostart.shouldStart`) : page active, révélation terminée, aucun
/// appel. Le tap de la page la met en pause ; quitter la page la relâche.
struct ReelSceneView: View {
    let reel: FeedPost
    let document: CanvasV3
    let isActive: Bool
    let revealCompleted: Bool
    let isMuted: Bool
    @Binding var isPaused: Bool
    let clock: ReelSceneClock

    @State private var isCallActive = MediaSessionCoordinator.shared.isCallActive

    /// Même porteur que la carte du fil et le plein écran d'un post : sans lui,
    /// une scène de MÉDIA se peindrait vide (#4926). `internal` depuis #6904 :
    /// c'est LUI qui porte l'empreinte du fond de la carte, et le témoin la
    /// mesure.
    var carrier: StoryItem {
        StoryItem(id: reel.id,
                  content: reel.content,
                  media: reel.media,
                  storyEffects: reel.storyEffects,
                  createdAt: reel.timestamp)
    }

    private var isPlaying: Bool {
        ReelMediaAutostart.shouldStart(isActive: isActive,
                                       revealCompleted: revealCompleted,
                                       isCallActive: isCallActive) && !isPaused
    }

    var body: some View {
        let duration = carrier.toRenderableSlide(preferredLanguages: []).computedTotalDuration()
        // **Un réel qui porte une scène montre LA carte de la story** —
        // le même composant, la même forme, le même fond (directive porteur du
        // 2026-09-17 : « Partir du fait que le composant est déjà fait et le
        // réutiliser pour les scènes de posts et les Réels ! »).
        //
        // Il posait `.aspectRatio(SceneShape.aspect, contentMode: .fill)` +
        // `.clipped()` : un remplissage qui RETIRAIT 44,8 pt de chaque côté de
        // la scène sur un iPhone 402×874 — 18,2 % de sa largeur, des pixels que
        // l'auteur avait posés. Le 3e message de la directive (« On préserve le
        // même fond que pour la story ! ») tranche l'inverse : la scène est
        // AJUSTÉE, et le fond dominant habille ce qui reste.
        //
        // Le viewport vient d'un `GeometryReader` parce qu'un réel ne connaît
        // pas sa page : le pager lui donne sa place, et le chrome du réel vit
        // dans ses couloirs, PAR-DESSUS la carte (il ne la rétrécit pas).
        GeometryReader { geo in
            ZStack {
                // **Le SOL — le même que la story et la galerie de post** (#6904,
                // directive porteur du 2026-09-17 : « On préserve le même fond que
                // pour la story ! »). Le réel posait `.background(Color.black)` sous
                // son média (`ReelPageView.mediaLayer`) : la MÊME carte se retrouvait
                // sur du noir pur là où le lecteur de stories l'entoure d'une teinte
                // dérivée de son empreinte. Le voile est NUL — un réel est immersif
                // par nature, il n'a pas de plateau à faire reculer —, et l'empreinte
                // vient du même site que le fond DANS la carte, juste dessous.
                SceneFloorView(thumbHash: carrier.sceneBackdropHash,
                               veil: SceneFloorView.fullVeil)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                SceneCard(layout: SceneShape.layout(in: geo.size),
                          thumbHash: carrier.sceneBackdropHash) {
                    MeeshyScenePlayer(document: document,
                                      mode: .reel,
                                      sceneIndex: .constant(0),
                                      isPlaying: .constant(isPlaying),
                                      accentColorHex: reel.authorColor,
                                      carrier: carrier,
                                      preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
                                      isMuted: isMuted,
                                      // Le canvas ne peint jamais son hors-champ :
                                      // la carte le peint, comme aux quatre
                                      // montages du lecteur de stories (#6791).
                                      servesLetterboxFill: false)
                        .onPlaybackTime { seconds in
                            clock.progress = ReelSceneProgress.fraction(elapsed: seconds, duration: duration)
                        }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
            .onReceive(
                CallManager.shared.$callState
                    .map(\.isActive)
                    .removeDuplicates()
                    .receive(on: DispatchQueue.main)
            ) { isCallActive = $0 }
            .adaptiveOnChange(of: isActive) { _, active in
                guard !active else { return }
                isPaused = false
                clock.progress = 0
            }
    }
}

/// La progression d'un réel composé : une barre, sans poignée — la scène se
/// rejoue, elle ne se parcourt pas.
struct ReelSceneProgressBar: View {
    @ObservedObject var clock: ReelSceneClock
    let accentColor: String

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3))
                Capsule().fill(Color(hex: accentColor))
                    .frame(width: geo.size.width * CGFloat(clock.progress))
            }
        }
        .frame(height: 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "reels.scene.progress", defaultValue: "Progression du réel", bundle: .main))
        .accessibilityValue(LocalizedNumber.percent(Int((clock.progress * 100).rounded())))
    }
}
