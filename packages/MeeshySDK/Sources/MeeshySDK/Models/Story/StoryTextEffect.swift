import Foundation

// MARK: - Story Text Effect

/// **L'axe EFFET d'un texte de story — ce qui se pose PAR-DESSUS la police**
/// (#4870, directive porteur 2026-09-02).
///
/// `StoryTextStyle` choisit une POLICE et rien d'autre (#4850) : ses dix-huit
/// cas résolvent vers une famille, une graisse ou un design. Ce qui BRILLE ou
/// PORTE UNE OMBRE est un second axe, orthogonal à la police, et c'est
/// celui-ci. Il n'existait pas dans le modèle : web et Android le simulaient
/// pour « neon » seulement, chacun à sa manière, et iOS pas du tout — un effet
/// caché derrière un nom de police, différent selon le client.
///
/// Sérialisé en chaîne (`StoryTextObject.textEffect`), clé `textEffect` du
/// payload v3 — « un style est une valeur du payload, pas un champ du modèle »
/// (planche P21) : ni version, ni migration, ni schéma partagé à changer.
public enum StoryTextEffect: String, Codable, CaseIterable, Sendable {
    /// Aucun effet — l'absence du champ sur le fil.
    case none

    // MARK: Lueurs — l'encre du TEXTE, sans décalage

    /// Halo de la couleur du texte, sans décalage.
    case glow
    /// La même lueur, à mi-voix — pour un texte clair sur fond clair.
    case glowSoft
    /// Lueur large et pleine : l'enseigne au néon.
    case neon

    // MARK: Contours — l'encre SOMBRE, sans décalage

    /// Halo sombre diffus tout autour : le texte tient sur un fond clair
    /// chargé sans qu'aucune ombre ne le déporte.
    case halo
    /// Halo sombre SERRÉ — l'œil y lit un contour, ce qu'une ombre unique ne
    /// sait pas tracer autrement (une seule ombre par effet, § du haut).
    case outline

    // MARK: Ombres — l'encre SOMBRE, décalée

    /// Ombre portée douce, décalée vers le bas.
    case shadow
    /// Ombre portée franche et dense.
    case drop
    /// Ombre centrée sous le texte : il ne se décale pas, il s'ÉLÈVE.
    case lift
    /// Ombre longue en diagonale, sans flou — la profondeur d'affiche.
    case longShadow

    // MARK: Reliefs — le texte paraît gravé

    /// Ombre franche, sans flou — le texte se détache comme découpé.
    case relief
    /// Lumière en haut à gauche : le texte SORT de la surface.
    case emboss
    /// Lumière juste en dessous : le texte ENTRE dans la surface (imprimé).
    case letterpress
    /// Double du texte décalé, dans SA couleur — l'écho sérigraphié.
    case echo

    /// La géométrie de l'ombre que cet effet pose, ou `nil` pour `.none`.
    ///
    /// **Une seule table, en fraction de la taille de police (em)**, recopiée
    /// à l'identique sur les deux autres miroirs — TS
    /// `apps/web/lib/story-text-effect.ts`, Kotlin
    /// `apps/android/core/model/.../StoryTextEffect.kt`. Toute évolution
    /// touche les trois. En em et non en points : l'effet doit grandir avec le
    /// texte (pincement, curseur de taille, export 1080) sans qu'aucun client
    /// n'ait à convertir.
    public var shadow: StoryTextEffectShadow? {
        switch self {
        case .none:
            return nil

        case .glow:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0, blur: 0.36,
                                         ink: .text, opacity: 1)
        case .glowSoft:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0, blur: 0.24,
                                         ink: .text, opacity: 0.55)
        case .neon:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0, blur: 0.60,
                                         ink: .text, opacity: 1)

        case .halo:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0, blur: 0.30,
                                         ink: .dark, opacity: 0.75)
        case .outline:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0, blur: 0.09,
                                         ink: .dark, opacity: 1)

        case .shadow:
            return StoryTextEffectShadow(offsetX: 0.03, offsetY: 0.06, blur: 0.16,
                                         ink: .dark, opacity: 0.6)
        case .drop:
            return StoryTextEffectShadow(offsetX: 0.06, offsetY: 0.10, blur: 0.08,
                                         ink: .dark, opacity: 0.75)
        case .lift:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0.10, blur: 0.22,
                                         ink: .dark, opacity: 0.45)
        case .longShadow:
            return StoryTextEffectShadow(offsetX: 0.14, offsetY: 0.14, blur: 0,
                                         ink: .dark, opacity: 0.35)

        case .relief:
            return StoryTextEffectShadow(offsetX: 0.05, offsetY: 0.05, blur: 0,
                                         ink: .dark, opacity: 0.85)
        case .emboss:
            return StoryTextEffectShadow(offsetX: -0.03, offsetY: -0.03, blur: 0.02,
                                         ink: .light, opacity: 0.7)
        case .letterpress:
            return StoryTextEffectShadow(offsetX: 0, offsetY: 0.025, blur: 0.01,
                                         ink: .light, opacity: 0.6)
        case .echo:
            return StoryTextEffectShadow(offsetX: 0.09, offsetY: 0.09, blur: 0,
                                         ink: .text, opacity: 0.35)
        }
    }
}

// MARK: - Story Text Effect Ink

/// **L'encre d'une ombre d'effet** — trois valeurs, pas un booléen.
///
/// Le champ était `usesTextColor: Bool`, et ce booléen a bloqué un tiers des
/// effets classiques : `emboss` et `letterpress` ne se lisent qu'avec une
/// lumière CLAIRE posée d'un côté du glyphe, que « couleur du texte OU noir »
/// ne sait pas dire. Une somme le dit, et elle laisse la place au jour où une
/// quatrième encre aurait un sens — un booléen aurait demandé un second
/// booléen, donc quatre états dont un absurde.
///
/// **Ce n'est pas sur le fil** : le payload v3 ne porte que le NOM de l'effet
/// (`StoryTextObject.textEffect`), jamais sa table. Élargir l'encre ne touche
/// donc ni schéma, ni version, ni migration — seulement les trois miroirs de
/// rendu, qui doivent rester identiques.
public enum StoryTextEffectInk: String, Equatable, Sendable, CaseIterable {
    /// La couleur du TEXTE lui-même — les lueurs.
    case text
    /// Noir — ombres, contours, reliefs sombres.
    case dark
    /// Blanc — la lumière d'un relief gravé (`emboss`, `letterpress`).
    case light
}

// MARK: - Story Text Effect Shadow

/// L'ombre d'un `StoryTextEffect`, en fraction de la taille de police (em).
///
/// `blur` est le rayon de flou au sens CSS (`text-shadow`) — le plus documenté
/// des trois rendus. Les rendus Apple (`CALayer.shadowRadius`,
/// `CGContext.setShadow`, `NSShadow.shadowBlurRadius`, `View.shadow(radius:)`)
/// prennent un rayon ≈ moitié de celui-là : c'est `blurRadius(fontSize:)` qui
/// porte la conversion, une fois, pour qu'aucun site de rendu ne la refasse.
public struct StoryTextEffectShadow: Equatable, Sendable {
    public let offsetX: Double
    public let offsetY: Double
    public let blur: Double
    /// L'encre de l'ombre. Voir `StoryTextEffectInk`.
    public let ink: StoryTextEffectInk
    public let opacity: Double

    public init(offsetX: Double, offsetY: Double, blur: Double,
                ink: StoryTextEffectInk, opacity: Double) {
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.blur = blur
        self.ink = ink
        self.opacity = opacity
    }

    /// Décalage en points pour une taille de police RENDUE (y positif = vers
    /// le bas, la convention d'UIKit, de CSS et de Compose).
    public func offset(fontSize: Double) -> (x: Double, y: Double) {
        (x: offsetX * fontSize, y: offsetY * fontSize)
    }

    /// Rayon de flou pour les API Apple, en points, pour une taille de police
    /// RENDUE — la moitié du flou CSS.
    public func blurRadius(fontSize: Double) -> Double {
        blur * fontSize / 2
    }
}

// MARK: - StoryTextObject + effet

extension StoryTextObject {
    /// L'effet parsé ; une valeur inconnue (client plus récent) vaut `.none`,
    /// jamais une erreur — le texte se rend sans son effet plutôt que pas du
    /// tout.
    public var parsedTextEffect: StoryTextEffect {
        guard let raw = textEffect else { return .none }
        return StoryTextEffect(rawValue: raw) ?? .none
    }

    public var hasTextEffect: Bool {
        parsedTextEffect != StoryTextEffect.none
    }
}
