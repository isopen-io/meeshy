import Foundation

/// **LA MISE EN PAGE D'UNE CARTE D'EXPORT** — LOI PURE, miroir de
/// `apps/web/src/lib/export/message-card-layout.ts` : aucun contexte
/// graphique. Elle reçoit une fonction de MESURE (la vraie police en
/// production, une règle fixe dans les témoins) et rend la liste des
/// opérations à peindre.
///
/// La lecture de haut en bas est celle du fil : l'en-tête optionnel (titre de
/// la conversation, date), le message CITÉ en entier et en taille RÉDUITE, la
/// LIAISON du template, puis la RÉPONSE, en bas et en grand — et ses MÉDIAS
/// (#8692), au-dessus ou au-dessous d'elle, en mosaïque ou en fond. Aucun
/// pied : la carte est signée par son seul filigrane diagonal « Meeshy
/// @pseudo », qui reste même quand les auteurs sont anonymisés.
///
/// Au format adaptatif, la carte s'adapte au texte : 1080 px de large, une
/// hauteur entre le carré (1080) et le format story (1920). Un format FIXE
/// (#8692 — story, portrait, carré, paysage) garde sa toile et centre le
/// contenu. Un texte long réduit ses polices pas à pas jusqu'à un plancher
/// lisible ; ce n'est qu'au plancher qu'il est tronqué — la citation
/// d'abord, la réponse en dernier.

public struct MessageCardPart: Equatable, Sendable {
    /// Le nom peint au-dessus du bloc — déjà anonymisé par l'appelant s'il l'a voulu.
    public let author: String
    public let text: String
    /// Le pseudo de l'auteur, quand on le connaît — « pseudo au lieu du nom affiché » (#8692).
    public let handle: String?

    public init(author: String, text: String, handle: String? = nil) {
        self.author = author
        self.text = text
        self.handle = MessageCardText.nonBlank(handle.map { String($0.drop(while: { $0 == "@" })) })
    }
}

public struct MessageCardInput: Equatable, Sendable {
    /// Le message auquel on répond — `nil` pour un message isolé.
    public let quoted: MessageCardPart?
    public let reply: MessageCardPart
    public let template: MessageCardTemplateID
    /// Le pseudo de qui exporte — il signe le filigrane ; `nil` : la marque seule.
    public let handle: String?
    public let title: String?
    public let date: String?
    public let showAuthors: Bool
    /// Les médias de la RÉPONSE, dans l'ordre du message (#8692).
    public let media: [MessageCardMedia]
    public let disposition: MessageCardDisposition
    /// L'heure de chaque message, déjà formatée — `nil` : non affichée.
    public let quotedTime: String?
    public let replyTime: String?
    /// L'EXTRAIT du son (ou de la vidéo) que la carte montre : ses barres, son
    /// minuteur, sa transcription (#8979) — `nil` : le média entier.
    public let clip: MessageCardClip?
    /// L'instant d'une carte ANIMÉE, en secondes depuis le début de l'extrait —
    /// le VRAI temps écoulé, celui qu'on entend (#8979) ; `nil` pour une image fixe.
    public let time: Double?

    public init(quoted: MessageCardPart?, reply: MessageCardPart, template: MessageCardTemplateID, handle: String?,
                title: String? = nil, date: String? = nil, showAuthors: Bool = true,
                media: [MessageCardMedia] = [], disposition: MessageCardDisposition = .standard,
                quotedTime: String? = nil, replyTime: String? = nil,
                clip: MessageCardClip? = nil, time: Double? = nil) {
        self.quoted = quoted
        self.reply = reply
        self.template = template
        self.handle = handle
        self.title = title
        self.date = date
        self.showAuthors = showAuthors
        self.media = media
        self.disposition = disposition
        self.quotedTime = MessageCardText.nonBlank(quotedTime)
        self.replyTime = MessageCardText.nonBlank(replyTime)
        self.clip = clip
        self.time = time.flatMap { $0.isFinite ? max(0, $0) : nil }
    }

    /// La même carte, à un autre instant de son animation.
    public func at(time: Double?) -> MessageCardInput {
        MessageCardInput(quoted: quoted, reply: reply, template: template, handle: handle, title: title, date: date,
                         showAuthors: showAuthors, media: media, disposition: disposition,
                         quotedTime: quotedTime, replyTime: replyTime, clip: clip, time: time)
    }

    /// La même carte, sur un autre extrait de son média.
    public func clipped(to clip: MessageCardClip?) -> MessageCardInput {
        MessageCardInput(quoted: quoted, reply: reply, template: template, handle: handle, title: title, date: date,
                         showAuthors: showAuthors, media: media, disposition: disposition,
                         quotedTime: quotedTime, replyTime: replyTime, clip: clip, time: time)
    }
}

public enum MessageCardAlignment: Equatable, Sendable {
    case left, right, center
}

public struct MessageCardTextOp: Equatable, Sendable {
    public let text: String
    public let x: Double
    /// La ligne de base — ou, pour un texte COUCHÉ (`rotation` ≠ 0), la ligne
    /// médiane de ses capitales : le texte part de (x, y) dans le sens de la rotation.
    public let y: Double
    public let font: MessageCardFont
    public let color: MessageCardColor
    public let align: MessageCardAlignment
    public let direction: MessageCardTextDirection
    /// En radians : −π/2 se lit en montant, +π/2 en descendant.
    public var rotation: Double = 0
}

public struct MessageCardRectOp: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
    public let radius: Double
    public let color: MessageCardColor
}

/// Un trait horizontal — interrompu par un cercle au milieu quand `radius` > 0.
public struct MessageCardSeparatorOp: Equatable, Sendable {
    public let x1: Double
    public let x2: Double
    public let y: Double
    public let radius: Double
    public let color: MessageCardColor
    public let dash: [Double]
    public let lineWidth: Double
}

public struct MessageCardDotOp: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let radius: Double
    public let color: MessageCardColor
}

/// Un média peint dans un cadre — l'image, ou la première image d'une vidéo,
/// recadrée pour REMPLIR le cadre. Le peintre la trouve par `mediaID`.
public struct MessageCardMediaOp: Equatable, Sendable {
    public let mediaID: String
    public let kind: MessageCardMediaKind
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
    public let radius: Double
    /// La couleur d'attente, quand les pixels ne sont pas (encore) là.
    public let placeholder: MessageCardColor
}

public enum MessageCardGlyph: String, Sendable {
    case play, note
}

/// Un pictogramme dessiné (lecture, note) — centré sur (x, y), inscrit dans `size`.
public struct MessageCardGlyphOp: Equatable, Sendable {
    public let glyph: MessageCardGlyph
    public let x: Double
    public let y: Double
    public let size: Double
    public let color: MessageCardColor
}

/// Des opérations peintes ensemble, tournées de `rotation` radians autour de (cx, cy).
public struct MessageCardGroupOp: Equatable, Sendable {
    public let rotation: Double
    public let cx: Double
    public let cy: Double
    public let ops: [MessageCardOp]
}

public enum MessageCardOp: Equatable, Sendable {
    case text(MessageCardTextOp)
    /// Un filet plein, aux bouts arrondis.
    case bar(MessageCardRectOp)
    case separator(MessageCardSeparatorOp)
    /// Une bulle : un rectangle arrondi sous un bloc de texte.
    case panel(MessageCardRectOp)
    case dot(MessageCardDotOp)
    case media(MessageCardMediaOp)
    case glyph(MessageCardGlyphOp)
    case group(MessageCardGroupOp)
}

/// Les PARTIES d'une carte qu'un geste peut désigner sur l'aperçu : l'en-tête,
/// la citation, la liaison, la réponse, ses médias, la transcription d'un
/// vocal (#8979) — et le fond, partout ailleurs. Le filigrane n'en est pas
/// une : il signe toujours la carte.
public enum MessageCardPartID: String, CaseIterable, Sendable {
    case header, quote, link, reply, media, transcript, background
}

/// La zone d'une partie, en pixels de la carte.
public struct MessageCardRegion: Equatable, Sendable {
    public let part: MessageCardPartID
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct MessageCardLayout: Equatable, Sendable {
    public let width: Double
    public let height: Double
    /// Ce qui se peint SOUS le filigrane — le média posé en fond et son voile.
    public let backdrop: [MessageCardOp]
    public let ops: [MessageCardOp]
    /// Les zones touchables, de haut en bas — seules les parties PEINTES en ont une.
    public let regions: [MessageCardRegion]
    /// Le motif du filigrane diagonal.
    public let watermark: String
    /// Vrai quand, au plancher des polices, un texte a dû être coupé.
    public let truncated: Bool

    public static let cardWidth: Double = 1080
    public static let minHeight: Double = 1080
    public static let maxHeight: Double = 1920

    /// « Meeshy @pseudo » — le pseudo sans son éventuel « @ », la marque seule quand il manque.
    public static func watermark(handle: String?) -> String {
        let bare = handle.map { String($0.drop(while: { $0 == "@" })) }
        guard let name = MessageCardText.nonBlank(bare) else { return "Meeshy" }
        return "Meeshy @\(name)"
    }

    public static func make(_ input: MessageCardInput, measure: @escaping MessageCardMeasure) -> MessageCardLayout {
        MessageCardLayoutEngine(input: input, measure: measure).layout()
    }

    /// **La même carte, LISIBLE à petite échelle** — la vignette d'un template
    /// ne peut pas perdre son séparateur (#8692). Peinte à 72 pt pour 1080 px,
    /// une liaison de 3 px ferait 0,2 pt : elle disparaissait. Les traits, les
    /// filets et les points sont portés à `minimumPoints` une fois réduits ;
    /// tout le reste — positions, textes, zones — est celui de l'image exportée.
    public func legible(atScale scale: Double, minimumPoints: Double = 1.5) -> MessageCardLayout {
        guard scale > 0, scale < 1 else { return self }
        let floor = minimumPoints / scale
        return MessageCardLayout(
            width: width, height: height,
            backdrop: backdrop,
            ops: ops.map { Self.legible($0, floor: floor) },
            regions: regions, watermark: watermark, truncated: truncated
        )
    }

    private static func legible(_ op: MessageCardOp, floor: Double) -> MessageCardOp {
        switch op {
        case let .separator(line):
            let width = max(line.lineWidth, floor)
            let stretch = width / max(line.lineWidth, 0.001)
            return .separator(MessageCardSeparatorOp(
                x1: line.x1, x2: line.x2, y: line.y,
                radius: line.radius == 0 ? 0 : max(line.radius, floor * 3),
                color: line.color, dash: line.dash.map { $0 * stretch }, lineWidth: width
            ))
        case let .bar(rect) where rect.width < floor || rect.height < floor:
            let width = max(rect.width, floor)
            let height = max(rect.height, floor)
            return .bar(MessageCardRectOp(
                x: rect.x - (width - rect.width) / 2, y: rect.y - (height - rect.height) / 2,
                width: width, height: height, radius: min(width, height) / 2, color: rect.color
            ))
        case let .dot(dot):
            return .dot(MessageCardDotOp(x: dot.x, y: dot.y, radius: max(dot.radius, floor * 1.5), color: dot.color))
        case let .group(group):
            return .group(MessageCardGroupOp(rotation: group.rotation, cx: group.cx, cy: group.cy, ops: group.ops.map { legible($0, floor: floor) }))
        default:
            return op
        }
    }
}
