import UIKit
import MeeshySDK

/// `UITextView` transparent stylé comme un `StoryTextObject`, superposé sur la
/// `StoryTextLayer` correspondante dans `StoryCanvasUIView` pendant l'édition
/// en place. Le vrai fond (solide / glass) reste rendu par la calque dessous ;
/// ce champ ne peint que les glyphes éditables.
public final class StoryInlineTextEditor: UITextView {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let placeholderLabel = UILabel()

    /// `true` quand le placeholder est masqué (le champ contient du texte).
    public var isPlaceholderHidden: Bool { placeholderLabel.isHidden }

    public init() {
        super.init(frame: .zero, textContainer: nil)
        backgroundColor = .clear
        isScrollEnabled = false
        // Un `UITextView` est un `UIScrollView`, qui rogne à ses bounds. Le
        // champ colle à ses glyphes (`textContainerInset = .zero`) : une lueur
        // ou une ombre (#4870) déborderait et serait COUPÉE pendant la frappe,
        // puis « sauterait » à sa pleine étendue quand la calque reprend la
        // main. Tant que le champ ne défile pas il n'a rien à rogner ; dès
        // qu'il défile, `sizeToFitTextContent` remet le rognage (les lignes
        // sorties doivent rester cachées).
        clipsToBounds = false
        isOpaque = false
        textContainerInset = .zero
        textContainer.lineFragmentPadding = 0
        tintColor = UIColor(red: 0.647, green: 0.706, blue: 0.988, alpha: 1) // indigo300
        spellCheckingType = .no
        placeholderLabel.numberOfLines = 0
        placeholderLabel.isUserInteractionEnabled = false
        placeholderLabel.text = String(localized: "story.textEditor.placeholder",
                                       defaultValue: "Exprimez-vous…",
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
        // L'EFFET (lueur / ombre / relief, #4870) est un attribut de glyphe
        // lui aussi — `NSShadow`, que TextKit rend en temps réel comme le
        // contour. Même site de conversion que le canvas et le composite.
        if let shadow = StoryTextEffectRendering.nsShadow(
            for: textObject, fontSize: geometry.render(designFontSize), textColor: color) {
            attrs[.shadow] = shadow
        }
        typingAttributes = attrs
        if textStorage.length > 0 {
            textStorage.setAttributes(
                attrs, range: NSRange(location: 0, length: textStorage.length))
        }

        placeholderLabel.font = resolved
        // Le placeholder doit rester visible quelle que soit la couleur de
        // texte choisie. On dérive sa teinte de la luminance de `color`
        // pour garantir un contraste minimum :
        //   - texte clair (slide sombre)  → placeholder blanc translucide
        //   - texte sombre (slide claire) → placeholder noir translucide
        // L'alpha 0.65 (vs 0.45 avant) donne un texte hint nettement plus
        // lisible que la version précédente quasi-invisible.
        placeholderLabel.textColor = Self.placeholderTint(for: color)
        placeholderLabel.textAlignment = align
        updatePlaceholderVisibility()
    }

    /// Ajuste les bounds pour englober tout le texte courant — appelé après
    /// chaque mutation utilisateur via `textViewDidChange`. Sans ça les
    /// caractères tapés débordaient des bounds dérivés de la calque
    /// pré-édition et étaient clippés jusqu'au prochain `rebuildLayers()`
    /// (cycle async via `viewModel`), donnant l'impression visuelle de mots
    /// qui disparaissent pendant la saisie. Le centre est préservé pour
    /// que la croissance se fasse symétriquement autour du point d'ancrage.
    ///
    /// Quand le texte est vide, on garantit une largeur minimum capable
    /// d'afficher le placeholder — sinon une calque texte fraîchement
    /// ajoutée a des bounds quasi-nulles (designSize ≈ 0 + 16 padding)
    /// et l'invite "Exprimez-vous…" reste clippée à 6 px de large.
    ///
    /// `maxHeight` borne la hauteur à celle de la ZONE d'édition (spec
    /// 2026-08-01). Au-delà, le champ défile au lieu de continuer à grandir :
    /// un texte long sortait auparavant par le haut de l'écran, ses premières
    /// lignes devenant illisibles ET inéditables. Sans zone mesurée la valeur
    /// par défaut laisse la croissance libre, comportement d'origine.
    public func sizeToFitTextContent(maxWidth: CGFloat,
                                     maxHeight: CGFloat = .greatestFiniteMagnitude) {
        let constraint = CGSize(width: max(maxWidth, 1), height: .greatestFiniteMagnitude)
        let fit = measuredSize(fitting: constraint)
        var width = min(fit.width, maxWidth)
        var natural = fit.height
        if (text ?? "").isEmpty {
            let phFit = placeholderLabel.sizeThatFits(constraint)
            width = max(width, min(phFit.width, maxWidth))
            natural = max(natural, phFit.height)
        }

        let clamped = min(natural, max(maxHeight, 1))
        let shouldScroll = natural > clamped + 0.5
        if isScrollEnabled != shouldScroll { isScrollEnabled = shouldScroll }
        // Rogner SEULEMENT quand on défile — voir `init`.
        if clipsToBounds != shouldScroll { clipsToBounds = shouldScroll }

        let next = CGSize(width: width, height: clamped)
        if next != bounds.size {
            let savedCenter = center
            bounds.size = next
            center = savedCenter
            // `placeholderLabel.frame` est resynchronisé par `layoutSubviews`.
        }
        // Le curseur doit rester dans la fenêtre visible, sinon taper au-delà
        // de la hauteur de zone écrit hors champ.
        if shouldScroll { scrollRangeToVisible(selectedRange) }
    }

    /// Taille du CONTENU. `sizeThatFits` d'un `UITextView` défilant renvoie sa
    /// FRAME et non son contenu : la hauteur se figerait au premier clamp et le
    /// champ ne redescendrait jamais quand on efface.
    ///
    /// On lit alors `contentSize`, qui porte la mise en page réelle — plutôt
    /// que de couper le défilement le temps de la mesure. Basculer
    /// `isScrollEnabled` appelle `invalidateIntrinsicContentSize`, donc
    /// `setNeedsLayout` : or cette mesure est appelée DEPUIS `layoutSubviews`
    /// (via `rebuildLayers` → `reapplyInlineEditingIfNeeded`). Chaque passe en
    /// réarmait une suivante — boucle de layout permanente, UI figée.
    private func measuredSize(fitting constraint: CGSize) -> CGSize {
        guard isScrollEnabled else { return sizeThatFits(constraint) }
        return CGSize(width: min(contentSize.width, constraint.width),
                      height: contentSize.height)
    }

    /// Masque le placeholder dès que le champ contient du texte.
    public func updatePlaceholderVisibility() {
        placeholderLabel.isHidden = !(text ?? "").isEmpty
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        // Origine forcée à zéro : `bounds.origin` d'une vue défilante porte le
        // `contentOffset`, qui emporterait le placeholder hors du champ.
        placeholderLabel.frame = CGRect(origin: .zero, size: bounds.size)
            .inset(by: textContainerInset)
    }

    // MARK: - Helpers

    private static func alignment(from raw: String?) -> NSTextAlignment {
        switch raw?.lowercased() {
        case "left":  return .left
        case "right": return .right
        default:      return .center
        }
    }

    /// Choisit une teinte de placeholder qui contraste avec la couleur du
    /// texte choisi par l'utilisateur. La luminance perçue (formule Rec.
    /// 709) départage clair vs sombre — c'est plus robuste qu'un simple
    /// `withAlphaComponent` qui rendait le placeholder invisible quand
    /// `color` était proche du blanc (et le fond aussi).
    private static func placeholderTint(for color: UIColor) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return luminance > 0.5
            ? UIColor.white.withAlphaComponent(0.65)
            : UIColor.black.withAlphaComponent(0.55)
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
