import Foundation

/// **La destruction d'un éphémère se VOIT** (#7467).
///
/// > « sa destruction doit avoir un effet visuel si on est dans la
/// > conversation au moment de la destruction. »
///
/// ## Pourquoi une durée, et pourquoi elle est ici
///
/// Un message qui disparaît d'une liste sans transition ne se lit pas comme une
/// destruction : il se lit comme un SAUT — la liste se réorganise, et le
/// lecteur croit avoir raté un défilement. L'effet n'est donc pas un ornement,
/// c'est ce qui rend l'événement compréhensible (dimension 8).
///
/// La durée vit dans le modèle parce que DEUX endroits doivent s'accorder
/// dessus : la vue qui anime, et l'hôte qui attend avant de retirer la ligne.
/// Un décalage entre les deux produirait soit une ligne qui disparaît au milieu
/// de sa combustion, soit un trou qui reste après elle.
///
/// ## « Réduire les animations » garde l'intention
///
/// Le message perd son mouvement, pas son annonce : plus de combustion, un
/// simple fondu — plus court, parce qu'un fondu long sans mouvement se lit
/// comme une lenteur. C'est la règle 6 des effets de message du dépôt,
/// appliquée à une disparition.
public enum EphemeralBurn {

    /// La combustion complète — assez longue pour être vue, assez courte pour
    /// ne pas retenir le fil.
    public static let fullDuration: TimeInterval = 0.6

    /// Le fondu servi sous « Réduire les animations ».
    public static let fadeDuration: TimeInterval = 0.25

    /// Combien de temps l'hôte garde la ligne à l'écran après l'échéance.
    public static func duration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? fadeDuration : fullDuration
    }
}
