import UIKit
import MeeshySDK

/// `UITextView` transparent stylé comme un `StoryTextObject`, superposé sur la
/// `StoryTextLayer` correspondante dans `StoryCanvasUIView` pendant l'édition
/// en place. Le vrai fond (solide / glass) reste rendu par la calque dessous ;
/// ce champ ne peint que les glyphes éditables.
public final class StoryInlineTextEditor: UITextView {

    private let placeholderLabel = UILabel()

    /// `true` quand le placeholder est masqué (le champ contient du texte).
    public var isPlaceholderHidden: Bool { placeholderLabel.isHidden }

    public init() {
        super.init(frame: .zero, textContainer: nil)
        backgroundColor = .clear
        isScrollEnabled = false
        isOpaque = false
        textContainerInset = .zero
        textContainer.lineFragmentPadding = 0
        tintColor = UIColor(red: 0.647, green: 0.706, blue: 0.988, alpha: 1) // indigo300
        spellCheckingType = .no
        placeholderLabel.numberOfLines = 0
        placeholderLabel.isUserInteractionEnabled = false
        placeholderLabel.text = String(localized: "story.textEditor.placeholder",
                                       defaultValue: "Saisissez votre texte…",
                                       bundle: .module)
        addSubview(placeholderLabel)
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryInlineTextEditor does not support NSCoder")
    }

    /// Applique le style d'un `StoryTextObject` : police (via
    /// `StoryTextFontResolver`), couleur, alignement. `setText` n'est `true`
    /// qu'à l'ouverture de l'édition — en cours de frappe le champ est la
    /// source de vérité de la chaîne et ne doit pas être réécrit.
    public func apply(textObject: StoryTextObject,
                      geometry: CanvasGeometry,
                      setText: Bool) {
        let designFontSize = CGFloat(textObject.fontSize * textObject.scale)
        let resolved = StoryTextFontResolver.resolveFont(forTextObject: textObject,
                                                         size: geometry.render(designFontSize))
        let color = Self.color(hex: textObject.textColor) ?? .white
        let align = Self.alignment(from: textObject.textAlign)

        font = resolved
        textColor = color
        textAlignment = align
        if setText { text = textObject.text }

        // Attributs complets, contour inclus. Le contour est un attribut de
        // glyphe (`.strokeColor` / `.strokeWidth`) — un `UITextView` ne l'expose
        // pas en propriété de vue. On les pose en `typingAttributes` (frappe à
        // venir) ET sur le texte déjà saisi via `textStorage`, pour qu'un
        // changement de contour soit rendu en temps réel, comme sur le canvas.
        let para = NSMutableParagraphStyle()
        para.alignment = align
        var attrs: [NSAttributedString.Key: Any] = [
            .font: resolved,
            .foregroundColor: color,
            .paragraphStyle: para
        ]
        if let hex = textObject.borderColor, let borderColor = Self.color(hex: hex) {
            // `.strokeWidth` négatif = remplir ET contourer ; pourcentage de la
            // taille de police design (mêmes unités que `StoryTextLayer`).
            let widthPx = CGFloat(textObject.borderWidth ?? 3.0)
            attrs[.strokeColor] = borderColor
            attrs[.strokeWidth] = -(widthPx / max(designFontSize, 1)) * 100.0
        }
        typingAttributes = attrs
        if textStorage.length > 0 {
            textStorage.setAttributes(
                attrs, range: NSRange(location: 0, length: textStorage.length))
        }

        placeholderLabel.font = resolved
        placeholderLabel.textColor = color.withAlphaComponent(0.45)
        placeholderLabel.textAlignment = align
        updatePlaceholderVisibility()
    }

    /// Masque le placeholder dès que le champ contient du texte.
    public func updatePlaceholderVisibility() {
        placeholderLabel.isHidden = !(text ?? "").isEmpty
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        placeholderLabel.frame = bounds.inset(by: textContainerInset)
    }

    // MARK: - Helpers

    private static func alignment(from raw: String?) -> NSTextAlignment {
        switch raw?.lowercased() {
        case "left":  return .left
        case "right": return .right
        default:      return .center
        }
    }

    private static func color(hex: String?) -> UIColor? {
        guard var trimmed = hex?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        if trimmed.hasPrefix("#") { trimmed.removeFirst() }
        guard trimmed.count == 6 || trimmed.count == 8 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: trimmed).scanHexInt64(&rgb) else { return nil }
        if trimmed.count == 8 {
            return UIColor(red: CGFloat((rgb & 0xFF000000) >> 24) / 255,
                           green: CGFloat((rgb & 0x00FF0000) >> 16) / 255,
                           blue: CGFloat((rgb & 0x0000FF00) >> 8) / 255,
                           alpha: CGFloat(rgb & 0x000000FF) / 255)
        }
        return UIColor(red: CGFloat((rgb & 0xFF0000) >> 16) / 255,
                       green: CGFloat((rgb & 0x00FF00) >> 8) / 255,
                       blue: CGFloat(rgb & 0x0000FF) / 255,
                       alpha: 1)
    }
}
