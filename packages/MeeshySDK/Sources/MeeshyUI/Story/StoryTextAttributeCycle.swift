import Foundation
import CoreGraphics
import MeeshySDK

// MARK: - Rotation d'attribut

/// Fait tourner d'un cran les attributs de texte à valeurs discrètes, et décrit
/// l'état courant pour que le bouton l'affiche.
///
/// Pur et `nonisolated` : le package pose `.defaultIsolation(MainActor.self)`
/// (SE-0466), et une annotation posée méthode par méthode ne suffit pas — elle
/// doit l'être sur le type pour que les extensions et les conformances suivent.
nonisolated enum StoryTextAttributeCycle {

    /// Ce qu'affiche une bulle pour son attribut. Chaque bulle rend l'état
    /// COURANT et non un pictogramme figé : c'est ce qui rend le tap-pour-
    /// tourner utilisable — sans lui, parcourir quatorze couleurs se ferait à
    /// l'aveugle.
    enum Indicator: Equatable, Sendable {
        /// Symbole SF reflétant la valeur courante. `emphasis` (0…4) rend une
        /// intensité — seul le contour s'en sert, pour montrer son épaisseur.
        /// `tint` porte la couleur que l'outil applique (contour du texte,
        /// liseré du cadre) : sans elle, la bulle dirait l'épaisseur mais pas
        /// la teinte, alors que la bulle Couleur montre déjà la sienne.
        case symbol(name: String, emphasis: Int, tint: String? = nil)
        /// Lettre témoin rendue dans la POLICE courante (bouton Police).
        case styledGlyph(String, style: StoryTextStyle)
        /// Lettre témoin rendue AVEC l'effet courant (bouton Effet, #4870) —
        /// la bulle montre la lueur ou l'ombre qu'elle pose, pas un
        /// pictogramme.
        case effectGlyph(String, effect: StoryTextEffect)
        /// Pastille pleine de la couleur courante (bouton Couleur).
        case colorDot(hex: String)
        /// Fond courant : `hex == nil && !isGlass` ⇒ aucun fond.
        case backgroundSwatch(hex: String?, isGlass: Bool)
        /// Code de langue en capitales (bouton Langue).
        case code(String)
    }

    /// Crans du contour, en points. Le panneau détaillé garde son curseur
    /// continu : ces crans ne sont que les paliers de la rotation.
    static let borderSteps: [Double] = [0, 2, 4, 8, 12]

    static let alignSteps: [String] = ["left", "center", "right"]

    /// Alignement par défaut quand le texte n'en porte pas — même valeur que
    /// celle lue partout ailleurs (`textAlign ?? "center"`).
    static let defaultAlign = "center"

    /// Couleur posée quand le contour quitte zéro sans couleur choisie.
    static let defaultBorderColor = "FFFFFF"

    /// Liseré posé quand une forme de cadre est choisie sans rien à voir. Le
    /// code posait auparavant un fond noir 65 %, qui recouvrait le texte.
    static let defaultFrameBorderWidth: Double = 2
    static let defaultFrameBorderColor = "FFFFFF"

    // MARK: - Avance

    static func advance(_ tool: TextEditTool, on text: inout StoryTextObject) {
        switch tool {
        case .align:      advanceAlign(on: &text)
        case .border:     advanceBorder(on: &text)
        case .frame:      advanceFrame(on: &text)
        case .style:      advanceStyle(on: &text)
        case .color:      advanceColor(on: &text)
        case .background: advanceBackground(on: &text)
        case .language:   advanceLanguage(on: &text)
        case .effect:     advanceEffect(on: &text)
        }
    }

    /// « Aucun » fait partie de la rotation, comme pour le cadre : un effet
    /// doit pouvoir se RETIRER d'un tap, pas seulement se changer. Et « aucun »
    /// s'écrit `nil`, jamais `"none"` : un texte sans effet garde le JSON
    /// qu'il avait.
    private static func advanceEffect(on text: inout StoryTextObject) {
        let steps = StoryTextEffect.allCases
        let index = steps.firstIndex(of: text.parsedTextEffect) ?? 0
        let next = steps[(index + 1) % steps.count]
        text.textEffect = next == StoryTextEffect.none ? nil : next.rawValue
    }

    private static func advanceStyle(on text: inout StoryTextObject) {
        let steps = StoryTextStyle.allCases
        let index = steps.firstIndex(of: text.parsedTextStyle) ?? 0
        text.textStyle = steps[(index + 1) % steps.count].rawValue
    }

    private static func advanceColor(on text: inout StoryTextObject) {
        let steps = StoryTextColors.palette
        let current = text.textColor ?? steps[0]
        let index = steps.firstIndex(where: { $0.caseInsensitiveCompare(current) == .orderedSame }) ?? 0
        text.textColor = steps[(index + 1) % steps.count]
    }

    /// Purge `textBg` en même temps : le renderer préfère `backgroundStyle`
    /// mais retombe encore sur ce champ legacy, qui laisserait sinon un fond
    /// fantôme derrière un `.none` fraîchement choisi.
    private static func advanceBackground(on text: inout StoryTextObject) {
        let steps = StoryTextBackgroundPresets.all
        let index = steps.firstIndex(of: text.resolvedBackgroundStyle) ?? 0
        text.backgroundStyle = steps[(index + 1) % steps.count]
        text.textBg = nil
    }

    private static func advanceLanguage(on text: inout StoryTextObject) {
        let steps = TextEditToolOptions.languageChoices(current: text.sourceLanguage)
        let current = TextEditToolOptions.normalisedCode(text.sourceLanguage) ?? steps[0]
        let index = steps.firstIndex(of: current) ?? 0
        text.sourceLanguage = steps[(index + 1) % steps.count]
    }

    private static func advanceAlign(on text: inout StoryTextObject) {
        let current = text.textAlign ?? defaultAlign
        let index = alignSteps.firstIndex(of: current) ?? 0
        text.textAlign = alignSteps[(index + 1) % alignSteps.count]
    }

    /// Le curseur du panneau détaillé pose des valeurs entre les crans (0,5 pt
    /// de pas) : on repart du premier cran STRICTEMENT supérieur, pour qu'un tap
    /// épaississe toujours au lieu de surprendre en amincissant.
    private static func advanceBorder(on text: inout StoryTextObject) {
        let current = text.borderWidth ?? 0
        text.borderWidth = borderSteps.first(where: { $0 > current }) ?? borderSteps[0]
        if (text.borderWidth ?? 0) > 0, text.borderColor == nil {
            text.borderColor = defaultBorderColor
        }
    }

    /// Le cadre inclut « Aucun » dans sa rotation. Quitter « Aucun » pose un
    /// LISERÉ, pas un fond : la version précédente peignait un noir 65 % pour
    /// rendre la forme visible, ce qui recouvrait le texte de l'auteur sans
    /// qu'il l'ait demandé.
    private static func advanceFrame(on text: inout StoryTextObject) {
        let steps = StoryTextFrameShape.allCases
        let index = steps.firstIndex(of: text.parsedFrameShape) ?? 0
        text.frameShape = steps[(index + 1) % steps.count].rawValue
        guard text.parsedFrameShape != StoryTextFrameShape.none,
              text.resolvedBackgroundStyle == StoryTextBackgroundStyle.none,
              (text.frameBorderWidth ?? 0) == 0 else { return }
        text.frameBorderWidth = defaultFrameBorderWidth
        text.frameBorderColor = defaultFrameBorderColor
    }

    // MARK: - État affiché

    static func indicator(_ tool: TextEditTool, of text: StoryTextObject) -> Indicator {
        switch tool {
        case .style:
            return .styledGlyph("Aa", style: text.parsedTextStyle)
        case .effect:
            return .effectGlyph("Aa", effect: text.parsedTextEffect)
        case .color:
            return .colorDot(hex: text.textColor ?? "FFFFFF")
        case .background:
            switch text.resolvedBackgroundStyle {
            case .none:           return .backgroundSwatch(hex: nil, isGlass: false)
            case .glass:          return .backgroundSwatch(hex: nil, isGlass: true)
            case .solid(let hex): return .backgroundSwatch(hex: hex, isGlass: false)
            }
        case .language:
            let code = TextEditToolOptions.normalisedCode(text.sourceLanguage)
                ?? TextEditToolOptions.languageChoices(current: nil)[0]
            return .code(code.uppercased())
        case .align:
            return .symbol(name: alignSymbol(text.textAlign ?? defaultAlign), emphasis: 0)
        case .frame:
            // Teinte = liseré du cadre, et seulement s'il en porte un : sans
            // trait, il n'y a pas de couleur à annoncer.
            let frameTint = (text.frameBorderWidth ?? 0) > 0 ? text.frameBorderColor : nil
            return .symbol(name: frameSymbol(text.parsedFrameShape), emphasis: 0, tint: frameTint)
        case .border:
            let width = text.borderWidth ?? 0
            guard width > 0 else { return .symbol(name: "square.dashed", emphasis: 0) }
            return .symbol(name: "square", emphasis: borderEmphasis(width), tint: text.borderColor)
        }
    }

    /// Rang du cran atteint (1…4) — la vue le traduit en poids de trait, de
    /// sorte que le bouton montre l'épaisseur qu'il applique.
    static func borderEmphasis(_ width: Double) -> Int {
        borderSteps.lastIndex(where: { $0 <= width }) ?? 0
    }

    private static func alignSymbol(_ align: String) -> String {
        switch align {
        case "left":  return "text.alignleft"
        case "right": return "text.alignright"
        default:      return "text.aligncenter"
        }
    }

    private static func frameSymbol(_ shape: StoryTextFrameShape) -> String {
        switch shape {
        case .none:      return "square.slash"
        case .rounded:   return "rectangle.roundedtop"
        case .pill:      return "capsule"
        case .rectangle: return "square"
        case .diamond:   return "diamond"
        case .cloud:     return "cloud"
        case .speech:    return "bubble.left"
        }
    }
}

// MARK: - Budget de largeur

/// Mesures de la barre d'outils du texte, et le seul endroit qui sache si une
/// rangée tient à l'écran.
///
/// La composition d'origine — neuf outils plus la sortie sur une rangée —
/// demandait 432 pt là où un iPhone 16 Pro en offre 361 : les bulles des deux
/// extrémités étaient coupées, sans scroll ni indice.
nonisolated enum TextEditToolbarMetrics {
    static let bubbleSize: CGFloat = 36
    /// 7 pt depuis #4870 : la huitième bulle (EFFET) demandait 344 pt là où
    /// l'iPhone SE en offre 343 — UN point de trop, que le `ScrollView` aurait
    /// coupé sans qu'on le voie. À 7 pt, huit bulles tiennent en 337 ; une
    /// neuvième ne tiendrait plus, et `TextEditToolbarLayoutTests` le garde.
    static let spacing: CGFloat = 7
    static let horizontalMargin: CGFloat = 16
    /// Largeur du bouton « Terminé » de la rangée haute (capsule libellée).
    static let finishControlWidth: CGFloat = 100
    /// iPhone SE — le plus étroit que l'app supporte (iOS 16, 375 pt).
    static let narrowestSupportedScreenWidth: CGFloat = 375

    static var narrowestUsableWidth: CGFloat {
        narrowestSupportedScreenWidth - 2 * horizontalMargin
    }

    static func requiredWidth(bubbleCount: Int, trailing: CGFloat = 0) -> CGFloat {
        guard bubbleCount > 0 else { return trailing }
        let bubbles = CGFloat(bubbleCount) * bubbleSize
            + CGFloat(bubbleCount - 1) * spacing
        return trailing > 0 ? bubbles + spacing + trailing : bubbles
    }

    static func fits(bubbleCount: Int, trailing: CGFloat = 0, in available: CGFloat) -> Bool {
        requiredWidth(bubbleCount: bubbleCount, trailing: trailing) <= available
    }
}
