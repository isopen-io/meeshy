import SwiftUI

/// **Comment l'échelle d'un menu flottant suit le disque qu'on glisse** (#18201).
///
/// Loi PURE, par rang de barreau. Le disque suit le doigt image par image
/// (`FreeFloatingButton`) et publie sa course ; chaque barreau se pose sur ce
/// centre VIVANT avec un ressort dont le temps de réponse croît avec le rang —
/// le premier colle au disque, le dernier arrive un peu après : une chaîne, un
/// accordéon. Pendant le geste, l'échelle part de celle du disque glissé
/// (1,15) et décroît le long des barreaux, jamais sous le repos.
///
/// Deux faces, deux régimes :
/// - le **suivi** est une information — le menu reste avec son bouton — et il
///   existe toujours ;
/// - la **chaîne** et l'**échelle** sont du décor : sous Reduce Motion (système
///   ou in-app) comme en Économie d'énergie (`MediaPolicy.animatesDecoration`,
///   le signal déjà partagé par les cadres animés et les fonds), l'échelle suit
///   RIGIDEMENT — aucun ressort, aucune échelle — à l'image.
public nonisolated struct FloatingMenuLadderFollow: Equatable, Sendable {
    /// L'échelle du disque pendant le glisser (`FreeFloatingButton`) : le
    /// premier barreau la partage, les suivants descendent vers 1.
    public static let discScale: CGFloat = 1.15
    /// Ce que chaque rang retire à l'échelle du précédent.
    public static let scaleStepPerRung: CGFloat = 0.03
    /// Le ressort du premier barreau : il colle presque au disque.
    public static let firstRungResponse: Double = 0.24
    /// Le retard que chaque rang ajoute au ressort du précédent. C'est lui qui
    /// fait l'ÉLASTIQUE : le bout de l'échelle traîne franchement derrière le
    /// disque, comme une échelle qu'on tire par un bout (retour porteur du
    /// 2026-11-14 sur 0,03 : « un peu plus prononcé »).
    public static let responseStepPerRung: Double = 0.065
    /// Sous-amorti : chaque barreau dépasse un peu sa place puis revient — le
    /// rebond que l'œil lit comme de l'élasticité.
    public static let dampingFraction: Double = 0.62

    /// Vrai quand la chaîne et l'échelle sont servies.
    public let isDecorated: Bool

    public init(reduceMotion: Bool, animatesDecoration: Bool) {
        isDecorated = !reduceMotion && animatesDecoration
    }

    /// Le temps de réponse du ressort du barreau `rung` (0 = le plus proche du disque).
    public func response(rung: Int) -> Double {
        Self.firstRungResponse + Double(max(rung, 0)) * Self.responseStepPerRung
    }

    /// Le ressort qui porte le barreau `rung` vers le centre vivant ; `nil` ⇒ il
    /// s'y pose à l'image (suivi rigide).
    public func animation(rung: Int) -> Animation? {
        guard isDecorated else { return nil }
        return .spring(response: response(rung: rung), dampingFraction: Self.dampingFraction)
    }

    /// L'échelle du barreau `rung` : au repos 1 ; pendant le glisser, celle du
    /// disque, moins un pas par rang, jamais sous 1.
    public func scale(rung: Int, dragging: Bool) -> CGFloat {
        guard dragging, isDecorated else { return 1 }
        return max(1, Self.discScale - CGFloat(max(rung, 0)) * Self.scaleStepPerRung)
    }

    /// Le centre que l'échelle suit : la position au repos, décalée de la course
    /// du doigt tant qu'il est posé.
    public static func liveCenter(resting: CGPoint, drag: CGSize?) -> CGPoint {
        guard let drag else { return resting }
        return CGPoint(x: resting.x + drag.width, y: resting.y + drag.height)
    }
}
