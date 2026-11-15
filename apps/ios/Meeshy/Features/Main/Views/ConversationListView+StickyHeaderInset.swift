import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ligne d'épinglage des stickers (LWS-6/I-063bis)

/// R-a (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md`
/// §8) : `.safeAreaInset(edge: .top)` était monté INCONDITIONNELLEMENT
/// sur le conteneur de défilement, `stickyHeaderInset` retombant
/// seulement à une hauteur `0` drapeau OFF. Un `safeAreaInset(height: 0)`
/// n'est PAS bit-à-bit identique à l'absence du modificateur : il reste
/// posé dans l'arbre de vue et continue de composer la région de
/// sécurité vue par le contenu défilant (`GeometryProxy.safeAreaInsets`),
/// même à hauteur nulle — SwiftUI ne « replie » jamais un modificateur
/// à zéro effet en un no-op structurel. Ce `ViewModifier` retire le
/// modificateur du tout, plutôt que de retirer seulement sa hauteur :
/// `isEnabled == false` ⇒ `body(content:)` renvoie `content` SANS
/// AUCUNE chaîne de modificateur ajoutée, drapeau ON comme avant tout ce
/// lot. `isEnabled` est INJECTÉ (jamais lu depuis le drapeau global en
/// interne) : le témoin `LentilleStickyHeaderInsetSourceGuardTests`
/// (garde source — proof-by-reading, aucun toolchain Swift local pour ce
/// lot) vérifie que la branche OFF ne chaîne plus rien après `content`.
struct LentilleStickyHeaderInsetModifier: ViewModifier {
    let isEnabled: Bool
    let height: CGFloat

    @ViewBuilder
    func body(content: Content) -> some View {
        if isEnabled {
            content.safeAreaInset(edge: .top, spacing: 0) {
                Color.clear.frame(height: height)
            }
        } else {
            content
        }
    }
}
