import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La face de l'aperçu se lit au mode de lecture du fil

/// **L'aperçu d'appui long d'un message suit le mode de lecture de la
/// conversation, Focal compris** (#11208, décision #11204).
///
/// La décision supplante la directive du 2026-08-23 (« en Focal, afficher le
/// message normal »), dont le grief était la CAPTURE de la cellule Focal : ses
/// pixels, bornés au cadre de la cellule, tranchaient l'identité et la méta
/// posées à cheval sur lui. L'aperçu ne capture plus rien — il rend la rangée
/// du fil elle-même, entière. En Script et en Focal, c'est la rangée plate ; en
/// Bulles, en Rivière et dans le Résumé, la bulle.
enum MessageOverlayPreviewKind: Equatable {
    case flatRow
    case bubble

    static func resolve(readingMode: ConversationReadingMode) -> MessageOverlayPreviewKind {
        readingMode.usesFlatRow ? .flatRow : .bubble
    }

    /// La densité de la rangée, celle que la cellule reçoit (`focalRowInput`).
    static func density(for readingMode: ConversationReadingMode) -> FocalRowInput.Density {
        readingMode == .script ? .script : .focal
    }
}

// MARK: - La cellule du fil, rendue dans l'aperçu

/// **L'aperçu est la cellule visible elle-même** (#11208). Il rendait une bulle
/// GÉNÉRIQUE reconstruite pour l'occasion — sans citation, ni lien, ni sondage,
/// un lieu dessiné comme un fichier. Il monte désormais les composants du fil :
/// `FocalRow` pour une rangée plate, `ThemedMessageBubble` pour une bulle, avec
/// les mêmes entrées que la cellule.
///
/// La protection reste EN AMONT des deux faces (#8009) : un message à vue
/// unique ou flouté montre sa forme protégée, jamais son contenu — l'appui long
/// ne dévoile ni ne consomme.
///
/// Rendu à l'échelle 1 et sans flou : la rangée se pose comme une carte, à
/// `flatRowMargin` des bords de l'écran, son contenu gardant les marges que la
/// rangée porte dans le fil.
struct MessageOverlayCellPreview: View {
    enum Face: Equatable {
        case flatRow(FocalRowInput)
        case bubble(ThemedMessageBubble)

        static func == (lhs: Face, rhs: Face) -> Bool {
            switch (lhs, rhs) {
            case let (.flatRow(left), .flatRow(right)):
                return left == right
            case let (.bubble(left), .bubble(right)):
                return left == right
            default:
                return false
            }
        }
    }

    /// La rangée plate se pose à 16 pt des bords de l'écran.
    static let flatRowMargin: CGFloat = 16

    let face: Face
    let message: Message
    let isDark: Bool
    let accentHex: String

    /// Les heures d'une rangée au repos ne se montrent qu'au défilement
    /// (`FocalRevealedTime`) : l'aperçu porte son propre révélé, fermé, comme
    /// la rangée immobile qu'on vient de presser.
    @StateObject private var timestampReveal = FocalTimestampRevealState()

    var body: some View {
        let protection = OverlayPreviewProtection.form(for: message)
        if protection != .clear {
            OverlayProtectedPreview(form: protection, message: message, isDark: isDark, accentHex: accentHex)
                .frame(maxWidth: .infinity, alignment: message.isMe ? .trailing : .leading)
                .padding(.horizontal, Self.flatRowMargin)
        } else {
            faceView
        }
    }

    @ViewBuilder
    private var faceView: some View {
        switch face {
        case .flatRow(let input):
            FocalRow(input: input, actions: FocalRowActions())
                .environmentObject(timestampReveal)
                .fixedSize(horizontal: false, vertical: true)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                        .fill(MeeshyColors.backgroundPrimary(isDark: isDark))
                )
                .padding(.horizontal, Self.flatRowMargin)
        case .bubble(let bubble):
            bubble
                .equatable()
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - La rangée plate se construit une fois par jeu d'entrées

/// **La rangée plate de l'aperçu, mémorisée le temps d'une présentation**
/// (#11208). Le corps de l'overlay se réévalue à chaque image du glissement ;
/// le portillon `.equatable()` protège le RENDU, pas la construction — qui
/// résout la piste audio du Prisme, lit la présence et bâtit une
/// `BubbleContent` (balayage des liens du texte compris). Elle ne se rejoue que
/// si ce que la rangée montre a changé.
///
/// Une classe, et non un `@State` de valeur : la mémoire s'écrit pendant
/// l'évaluation du corps, ce qu'aucun état observé ne permet ; rien ne
/// l'observe, donc l'écrire ne provoque aucun rendu.
final class MessageOverlayFlatRowMemo {
    struct Key: Equatable {
        let messageId: String
        let updatedAt: Date
        let content: String
        let effects: MessageEffectFlags
        let reactionCount: Int
        let translations: [MessageTranslation]
        let served: MessageTranslation?
        let selection: ConversationViewModel.BubbleLanguageSelection?
        let transcription: MessageTranscription?
        let translatedAudios: [MessageTranslatedAudio]
        let readingMode: ConversationReadingMode
        let senderStoryRing: StoryRingState
        let senderMoodEmoji: String?
        let isDark: Bool
        let isRightToLeft: Bool
        let availableWidth: CGFloat
    }

    private var stored: (key: Key, row: FocalRowInput)?

    func row(for key: Key, build: () -> FocalRowInput) -> FocalRowInput {
        if let stored, stored.key == key { return stored.row }
        let row = build()
        stored = (key, row)
        return row
    }
}

/// Gate de re-rendu : pendant le glissement (60 fps), le corps de l'overlay se
/// réévalue à chaque image ; les entrées de l'aperçu, elles, ne bougent pas.
extension MessageOverlayCellPreview: @MainActor Equatable {
    static func == (lhs: MessageOverlayCellPreview, rhs: MessageOverlayCellPreview) -> Bool {
        lhs.face == rhs.face
            && lhs.isDark == rhs.isDark
            && lhs.accentHex == rhs.accentHex
            && OverlayPreviewProtection.form(for: lhs.message) == OverlayPreviewProtection.form(for: rhs.message)
    }
}
