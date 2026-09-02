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
    /// Halo de la couleur du texte, sans décalage.
    case glow
    /// Ombre portée douce, noire, décalée vers le bas.
    case shadow
    /// Ombre franche, sans flou — le texte se détache comme découpé.
    case relief

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
                                         usesTextColor: true, opacity: 1)
        case .shadow:
            return StoryTextEffectShadow(offsetX: 0.03, offsetY: 0.06, blur: 0.16,
                                         usesTextColor: false, opacity: 0.6)
        case .relief:
            return StoryTextEffectShadow(offsetX: 0.05, offsetY: 0.05, blur: 0,
                                         usesTextColor: false, opacity: 0.85)
        }
    }
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
    /// `true` ⇒ la couleur du TEXTE (lueur) ; `false` ⇒ noir.
    public let usesTextColor: Bool
    public let opacity: Double

    public init(offsetX: Double, offsetY: Double, blur: Double,
                usesTextColor: Bool, opacity: Double) {
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.blur = blur
        self.usesTextColor = usesTextColor
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
