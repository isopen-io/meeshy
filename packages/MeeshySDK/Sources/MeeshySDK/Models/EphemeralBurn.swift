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

    /// **Une mort est « en cours » tant qu'elle est plus jeune que la
    /// combustion** (#17938). `message:expired` a deux consommateurs — l'écran
    /// de la conversation et le moteur de synchronisation — et le second grave
    /// la mort (base, registre) tout de suite, à raison : une écriture
    /// destructrice ne se diffère pas. C'est donc l'ÉCRAN qui distingue une
    /// mort qui vient d'arriver (la ligne brûle) d'une mort ancienne qu'un
    /// rechargement ressert (la ligne part sans rejouer sa combustion, #8352).
    /// La frontière est la durée de la combustion, moins une marge pour que le
    /// retrait de l'hôte, à `fullDuration`, trouve la mort déjà « ancienne ».
    public static let freshDeathWindow: TimeInterval = fullDuration - 0.1

    public static func isFreshDeath(at death: Date, now: Date) -> Bool {
        now.timeIntervalSince(death) < freshDeathWindow
    }
}
