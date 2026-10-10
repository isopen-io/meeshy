import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// **L'aperçu d'un vocal CITÉ** (#8230) — un bouton de lecture et un motif
/// d'onde figé, dans une capsule.
///
/// Une citation d'image montrait l'image, une citation de vocal ne montrait
/// qu'un glyphe dans la bulle et RIEN dans la rangée plate : l'audio cité n'y
/// avait aucune zone média atteignable au doigt. Cette capsule EST cette zone
/// dans les deux peaux ; le geste est posé par la peau qui l'héberge (une zone
/// = un site, loi des zones), jamais ici.
///
/// **Elle JOUE sur place depuis #8320** (directive porteur du 2026-09-27) : le
/// geste de la peau lance l'audio cité par le lecteur PARTAGÉ
/// (`ConversationAudioCoordinator`), et la capsule en montre l'état — le
/// glyphe passe à la pause pendant la lecture, et l'onde se remplit à mesure
/// que l'audio avance. Elle n'écoute le coordinateur que par une projection
/// filtrée sur SON message (`playbackMessageId`) : les citations voisines ne
/// se redessinent pas au rythme de la lecture d'une seule (aucun
/// `@ObservedObject` sur le singleton, § Zero Unnecessary Re-render).
///
/// La cible fait 44 pt de haut (dimension 5) : la capsule dessinée en fait 30,
/// son cadre de toucher porte le reste.
///
/// La durée n'y est pas répétée : la ligne de détails voisine (« 0:42 ·
/// 60 Ko ») la dit déjà, depuis la règle partagée qui la retient pour un
/// média protégé.
///
/// Décorative pour VoiceOver : la peau nomme la zone (« Écouter le message
/// cité »), et la rangée l'offre en action nommée.
struct QuotedAudioPreview: View, Equatable {
    let tint: Color
    /// Vrai quand la zone média est ARMÉE : le bouton de lecture promet une
    /// action, il ne se dessine que si elle existe (loi 4 — un contrôle
    /// existe s'il a un effet). Sinon le glyphe dit le genre, pas l'action.
    let showsPlayGlyph: Bool
    /// Le message cité dont la capsule suit la lecture — `nil` quand la zone
    /// n'est pas armée : rien à suivre, aucun abonnement.
    let playbackMessageId: String?
    private let bars: [CGFloat]
    private let playback: AnyPublisher<QuotedAudioPlaybackState?, Never>

    @State private var state: QuotedAudioPlaybackState?

    init(seed: String, tint: Color, showsPlayGlyph: Bool, playbackMessageId: String? = nil,
         coordinator: ConversationAudioCoordinator = .shared) {
        self.tint = tint
        self.showsPlayGlyph = showsPlayGlyph
        self.playbackMessageId = showsPlayGlyph ? playbackMessageId : nil
        self.bars = QuotedReplyPresentation.quotedAudioBars(seed: seed)
        self.playback = QuotedAudioPlaybackState.publisher(
            messageId: showsPlayGlyph ? playbackMessageId : nil,
            coordinator: coordinator
        )
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.tint == rhs.tint
            && lhs.showsPlayGlyph == rhs.showsPlayGlyph
            && lhs.playbackMessageId == rhs.playbackMessageId
            && lhs.bars == rhs.bars
    }

    private static let barWidth: CGFloat = 2.5
    private static let barMaxHeight: CGFloat = 18
    static let minimumTapHeight: CGFloat = 44

    private var glyph: String {
        guard showsPlayGlyph else { return "waveform" }
        return state?.isPlaying == true ? "pause.circle.fill" : "play.circle.fill"
    }

    private var progress: Double { state?.progress ?? 0 }

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: glyph)
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .bold))
                .foregroundStyle(tint)

            HStack(alignment: .center, spacing: MeeshySpacing.xxs) {
                ForEach(bars.indices, id: \.self) { index in
                    Capsule()
                        .fill(tint.opacity(Double(index) / Double(max(bars.count, 1)) < progress ? 1 : 0.55))
                        .frame(width: Self.barWidth, height: max(4, bars[index] * Self.barMaxHeight))
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(height: QuotedReplyPresentation.quotedAudioHeight)
        .background(Capsule().fill(tint.opacity(MeeshyOpacity.light)))
        .frame(minHeight: showsPlayGlyph ? Self.minimumTapHeight : nil)
        .contentShape(Rectangle())
        .onReceive(playback) { state = $0 }
        .accessibilityHidden(true)
    }
}

/// L'état de lecture d'UN audio cité, tel que la capsule le montre : joue-t-il,
/// et où en est-il. `nil` ⇒ ce n'est pas lui que le coordinateur joue.
struct QuotedAudioPlaybackState: Equatable {
    let isPlaying: Bool
    /// Arrondie au cinquantième : l'onde n'a que 18 barres, une précision plus
    /// fine redessinerait la citation à chaque tic du moteur pour rien.
    let progress: Double

    static let progressStep: Double = 1.0 / 50.0

    static func quantized(_ progress: Double) -> Double {
        (min(max(progress, 0), 1) / progressStep).rounded() * progressStep
    }

    /// La projection du coordinateur PARTAGÉ sur le seul message cité. Tant
    /// que ce n'est pas lui qui joue, la chaîne n'émet qu'un `nil` — le tic à
    /// 20 Hz du moteur n'atteint que la citation qui joue.
    static func publisher(messageId: String?, coordinator: ConversationAudioCoordinator) -> AnyPublisher<QuotedAudioPlaybackState?, Never> {
        guard let messageId else { return Just(nil).eraseToAnyPublisher() }
        let isPlaying = coordinator.$isPlaying
        let progress = coordinator.$progress
        return coordinator.$activeContext
            .map { $0?.messageId == messageId }
            .removeDuplicates()
            .map { isActive -> AnyPublisher<QuotedAudioPlaybackState?, Never> in
                guard isActive else { return Just(nil).eraseToAnyPublisher() }
                return isPlaying
                    .combineLatest(progress)
                    .map { QuotedAudioPlaybackState(isPlaying: $0, progress: quantized($1)) }
                    .eraseToAnyPublisher()
            }
            .switchToLatest()
            .removeDuplicates()
            .eraseToAnyPublisher()
    }
}
