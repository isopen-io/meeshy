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

    /// La combustion complète — assez longue pour être LUE, assez courte pour
    /// ne pas retenir le fil. Portée de 0,6 à 1,2 s le 2026-11-13 (#17938) : la
    /// destruction est devenue une vraie combustion — un front qui traverse la
    /// bulle lettre par lettre, des flammes qui s'élèvent, des étincelles que le
    /// vent emporte — et cela ne se lit pas en 600 ms. Même valeur que
    /// `EPHEMERAL_BURN_FULL_MS` (`packages/shared/utils/ephemeral-burn.ts`).
    public static let fullDuration: TimeInterval = 1.2

    /// Le fondu servi sous « Réduire les animations ».
    public static let fadeDuration: TimeInterval = 0.25

    /// Combien de temps l'hôte garde la ligne à l'écran après l'échéance.
    public static func duration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? fadeDuration : fullDuration
    }

    /// **Le relais d'une mort annoncée ATTEND la combustion quand le fil est
    /// ouvert** (#17938). `message:expired` a deux consommateurs : l'écran de
    /// la conversation, qui fait brûler la ligne, et le moteur de
    /// synchronisation, qui grave la mort en base et au registre pour les
    /// conversations FERMÉES. Le second écrivait tout de suite, même fil
    /// ouvert : le magasin relisait une ligne morte et la retirait au milieu
    /// de son feu — ou avant qu'il ne prenne, quand l'annonce précède
    /// l'horloge locale. Fil ouvert, le moteur attend la combustion entière
    /// plus une marge ; fil fermé, rien ne brûle et rien n'attend.
    public static let relayMargin: TimeInterval = 0.3

    public static func relayDelay(conversationIsOpen: Bool) -> TimeInterval {
        conversationIsOpen ? fullDuration + relayMargin : 0
    }
}
