import SwiftUI
import MeeshyUI

// MARK: - Le prédicat « faut-il supprimer le mouvement »

// **Reduce Motion a deux interrupteurs, et un site qui n'en lit qu'un est
// juste par accident.**
//
// Le réglage système (`\.accessibilityReduceMotion`) et l'override applicatif
// (`\.meeshyForceReduceMotion`, injecté à la racine depuis
// `MeeshyAccessibilityPreferences`) se composent par un OU —
// `MeeshyMotion.shouldReduce(system:userForced:)`, la règle du SDK.
//
// Vingt-quatre fichiers de l'app ne déclarent aujourd'hui que le premier. Ils
// se comportent CORRECTEMENT, mais pour une raison qui ne leur appartient
// pas : **aucun écran de réglages n'écrit la préférence in-app**, qui vaut
// donc toujours `false`. Le jour où cet écran existe (#4288), chacun de ces
// sites devient faux en silence, sans qu'une ligne n'ait changé chez lui.
//
// L'idiome à recopier, celui de `ConversationAnimatedBackground` et des huit
// autres sites qui lisent les DEUX moitiés :
//
// ```swift
// @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
// @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
// private var reduceMotion: Bool {
//     MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
// }
// ```
//
// > **Pourquoi pas un `@propertyWrapper` `DynamicProperty`, qui dirait la
// > même chose en une ligne ?** Parce qu'il n'en existe AUCUN dans le dépôt,
// > que la cible compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
// > (SE-0466), et qu'aucune chaîne d'outils de ce plan de travail ne peut
// > type-checker du SwiftUI. Une CI iOS rouge bloque TOUTES les PR iOS : on
// > livre l'idiome PROUVÉ et on propose l'abstraction à part (#4289), plutôt
// > que de deviner une isolation — c'est exactement l'erreur de 252i, où des
// > marqueurs `nonisolated` posés « par sécurité » ont coûté huit erreurs de
// > compilation.
//
// Quand le mouvement à supprimer est un simple `.animation(_:value:)`, ne rien
// déclarer du tout : `.meeshyAnimation(_:value:)` (SDK) lit les deux moitiés
// lui-même et laisse la vue sans état — indispensable pour une vue `Equatable`
// par SYNTHÈSE, qu'une propriété `@Environment` casserait.

// MARK: - La valeur de repos d'une forme d'onde

/// **L'état de repos n'est pas la cible de l'animation.**
///
/// Le remède qu'on copie d'instinct — se poser sur la valeur vers laquelle
/// l'animation tendait — est juste pour une décoration qui converge
/// (`OnboardingAnimations.settleWithoutMotion`), et **faux pour un indicateur
/// de statut** :
///
/// - le point d'appel en cours s'anime vers `opacity 0.3` ; s'y poser rend
///   l'indicateur presque invisible ;
/// - les barres d'enregistrement s'animent vers une hauteur **tirée au hasard** ;
///   les figer toutes à `minHeight` rend un trait plat, qui se lit « cassé ».
///
/// Ce profil est la valeur de repos des deux formes d'onde du dépôt : varié
/// (donc lisible comme une forme d'onde), borné par le gabarit de la barre
/// animée (donc sans saut de taille en activant Reduce Motion), et
/// **déterministe** — une valeur de repos tirée au hasard sautillerait à chaque
/// re-évaluation de la vue, c'est-à-dire bougerait.
enum RestingWaveform {

    /// Hauteur immobile de la barre `index`, dans `minHeight ... maxHeight`.
    ///
    /// Sept rapports : le premier entier qui ne divise ni les douze barres du
    /// composeur ni les cinq du média, pour qu'aucun motif ne se répète en
    /// phase avec le nombre de barres et ne redonne un dessin régulier.
    ///
    /// `index % 7` reste dans `-6 ... 6` quel que soit l'entier reçu — `abs` ne
    /// peut donc pas déborder, même sur `Int.min`.
    static func height(index: Int, minHeight: CGFloat, maxHeight: CGFloat) -> CGFloat {
        let ratios: [CGFloat] = [0.30, 0.72, 0.45, 1.00, 0.38, 0.86, 0.55]
        let ratio = ratios[abs(index % ratios.count)]
        return minHeight + (maxHeight - minHeight) * ratio
    }
}
