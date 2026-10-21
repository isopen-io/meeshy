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
    /// **La bulle respire aussi : 16 pt de marge** de chaque côté de l'aperçu,
    /// la même que la rangée plate. Collée au bord de sa cellule, elle se lisait
    /// comme coupée dès que le facteur d'échelle la rapprochait de l'écran.
    static let bubbleMargin: CGFloat = flatRowMargin

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
                .padding(.horizontal, Self.bubbleMargin)
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

    nonisolated deinit {}

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

// MARK: - L'échelle de l'aperçu a un plancher

/// **L'aperçu ne se réduit JAMAIS sous 60 %.** Il se réduisait jusqu'à 40 % :
/// un long message devenait une vignette illisible, alors que l'appui long sert
/// à le lire. Sous le plancher, l'aperçu garde sa lisibilité et se BORNE à la
/// hauteur qui reste : le surplus se parcourt par un défilement interne.
nonisolated enum MessageOverlayPreviewFit {
    static let scaleFloor: CGFloat = 0.6
    /// La hauteur minimale offerte à l'aperçu, quelle que soit la place.
    static let minimumRoom: CGFloat = 60

    struct Result: Equatable {
        /// Le facteur appliqué à l'aperçu, dans `[scaleFloor, 1]`.
        let scale: CGFloat
        /// La hauteur que l'aperçu occupe à l'écran, jamais au-delà de la place.
        let visibleHeight: CGFloat
        /// Le contenu réduit dépasse encore la place : il défile dans son cadre.
        let scrollsInternally: Bool
    }

    static func resolve(naturalHeight: CGFloat, chromeHeight: CGFloat, available: CGFloat) -> Result {
        let natural = max(1, naturalHeight)
        let room = max(minimumRoom, available - chromeHeight)
        let scale = max(scaleFloor, min(1, room / natural))
        let scaled = natural * scale
        return Result(scale: scale, visibleHeight: min(scaled, room), scrollsInternally: scaled > room + 0.5)
    }
}

// MARK: - Le cadre de l'aperçu

/// **Le cadre où l'aperçu réduit se pose** : à `naturalSize × scale`, ancré à
/// son bord natif, borné à `visibleHeight`. Quand le contenu réduit dépasse
/// encore, il défile à l'intérieur — le contenu lui-même ne reçoit aucun
/// toucher (c'est une image de la cellule, pas un lecteur), seul le cadre
/// défile ; un fondu en pied dit qu'il y a une suite.
struct MessageOverlayPreviewViewport<Content: View>: View {
    let scale: CGFloat
    let naturalSize: CGSize
    let visibleHeight: CGFloat
    let scrolls: Bool
    let isTrailing: Bool
    @ViewBuilder let content: Content

    private static var fadeHeight: CGFloat { 24 }

    var body: some View {
        let width = naturalSize.width * scale
        let alignment: Alignment = isTrailing ? .topTrailing : .topLeading
        let anchor: UnitPoint = isTrailing ? .topTrailing : .topLeading
        let scaled = content
            .allowsHitTesting(false)
            .scaleEffect(scale, anchor: anchor)
            .frame(width: width, height: naturalSize.height * scale, alignment: alignment)
        if scrolls {
            ScrollView(.vertical, showsIndicators: false) { scaled }
                .frame(width: width, height: visibleHeight)
                .mask(bottomFade)
        } else {
            scaled.frame(width: width, height: visibleHeight, alignment: alignment)
        }
    }

    private var bottomFade: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.black)
            LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: Self.fadeHeight)
        }
    }
}
