import Foundation

/// **UN STICKER NE SE COUPE JAMAIS** (#10915) — LOIS PURES, miroir de
/// `apps/web/src/lib/export/message-card-sticker.ts`.
///
/// Une photo REMPLIT son cadre (recadrée, coins arrondis) ; un sticker est un
/// DÉCOUPAGE à fond transparent dont le contour EST le dessin : le recadrer ou
/// l'arrondir le mutile. Il se dessine donc AJUSTÉ (`contain`), dans un cadre
/// au rapport de ses pixels, sans arrondi ni rognage.
///
/// DÉTECTION — un média image est un sticker quand l'une de ces preuves tient :
/// 1. l'appelant le DÉCLARE (`flagged` : le message porte un `MessageSticker`,
///    la pièce vient de « Mes stickers ») ET le format sait la transparence ;
/// 2. à défaut, le format sait la transparence (PNG, WebP, APNG) ET les deux
///    côtés déclarés tiennent dans `maxSide` (512 px, le plafond du rendu
///    d'envoi — `ConversationStickerRendering.templateMaxSide`).
/// Une photo (JPEG, HEIC, GIF) ou une image dont on ne connaît pas les côtés
/// sans déclaration n'est JAMAIS un sticker : le rendu des photos ne change pas.
public enum MessageCardSticker {

    /// Le plus grand côté, en pixels, d'une image non déclarée qui passe pour un sticker.
    public static let maxSide: Int = 512
    /// La part de la largeur de colonne qu'un sticker prend au plus (≈ 1 px pour 1 px à 888 px de colonne).
    public static let displayShare: Double = 0.6

    /// Les types d'image qui savent la transparence.
    static let alphaMimeTypes: Set<String> = ["image/png", "image/webp", "image/apng"]

    /// Le type d'une image, lu dans son type MIME ou — à défaut — l'extension de son adresse.
    public static func mimeType(_ mimeType: String?, fileName: String? = nil) -> String? {
        if let mime = MessageCardText.nonBlank(mimeType)?.lowercased() { return mime }
        guard let name = MessageCardText.nonBlank(fileName) else { return nil }
        let clean = name.split(separator: "?").first.map(String.init) ?? name
        switch clean.split(separator: ".").last?.lowercased() {
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "apng": return "image/apng"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "heic", "heif": return "image/heic"
        default: return nil
        }
    }

    public static func isSticker(mimeType: String?, fileName: String? = nil, width: Int?, height: Int?, flagged: Bool = false) -> Bool {
        guard let mime = Self.mimeType(mimeType, fileName: fileName), alphaMimeTypes.contains(mime) else { return false }
        if flagged { return true }
        guard let width, let height, width > 0, height > 0 else { return false }
        return max(width, height) <= maxSide
    }

    /// Le rapport largeur / hauteur DÉCLARÉ — `nil` quand l'un des côtés manque :
    /// jamais un carré par défaut, c'est l'affaire des pixels (`aspect(pixelWidth:pixelHeight:)`).
    public static func declaredAspect(width: Int?, height: Int?) -> Double? {
        guard let width, let height, width > 0, height > 0 else { return nil }
        return Double(width) / Double(height)
    }

    /// Le rapport lu sur les PIXELS réels de l'image chargée.
    public static func aspect(pixelWidth: Int, pixelHeight: Int) -> Double? {
        declaredAspect(width: pixelWidth, height: pixelHeight)
    }

    /// Le cadre d'un sticker dans une colonne de `width`, d'au plus `cap` de haut :
    /// au plus `displayShare` de la largeur, au rapport EXACT du sticker, jamais
    /// plus haut que `cap` — il se RÉDUIT, il ne se rogne pas.
    public static func frame(aspect: Double, width: Double, cap: Double) -> (width: Double, height: Double) {
        let ratio = aspect.isFinite && aspect > 0 ? aspect : 1
        var framed = (width * displayShare).rounded(.down)
        var high = (framed / ratio).rounded()
        if high > cap {
            high = cap.rounded(.down)
            framed = (high * ratio).rounded()
        }
        return (max(1, framed), max(1, high))
    }
}

/// Comment une image occupe son cadre : `cover` le REMPLIT (recadrée au centre —
/// une photo), `contain` s'y INSCRIT en entier (un sticker).
public enum MessageCardMediaFit: String, Equatable, Sendable {
    case cover, contain

    /// Où poser une image de `pixelWidth × pixelHeight` pour qu'elle occupe `frame`.
    public func drawn(pixelWidth: Double, pixelHeight: Double, in frame: MessageCardFrame) -> MessageCardFrame {
        guard pixelWidth > 0, pixelHeight > 0 else { return frame }
        let scaleX = frame.width / pixelWidth
        let scaleY = frame.height / pixelHeight
        let scale = self == .cover ? max(scaleX, scaleY) : min(scaleX, scaleY)
        let width = pixelWidth * scale
        let height = pixelHeight * scale
        return MessageCardFrame(x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width: width, height: height)
    }
}

/// Un rectangle de la carte, en pixels de la carte.
public struct MessageCardFrame: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}
