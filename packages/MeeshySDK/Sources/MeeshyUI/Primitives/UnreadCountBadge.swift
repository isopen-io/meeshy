import SwiftUI

// MARK: - Pastille de non-lus (atome de présentation partagé)

/// La pastille rouge chiffrée d'une rangée de conversation — **un** chrome,
/// **un** portillon, **deux** peaux.
///
/// Elle existait déjà, écrite en toutes lettres dans
/// `ThemedConversationRow.unreadBadge` (peau historique, fichier gelé en
/// LECTURE SEULE : il est le modèle de référence de la rangée et ne
/// s'édite pas). Le lot 2 rétablit la même pastille sur la peau Lentille ;
/// la recopier aurait fait deux écritures du même badge, promises à diverger
/// au premier ajustement de teinte. Elle est donc EXTRAITE ici — atome
/// agnostique au sens de `packages/MeeshySDK/CLAUDE.md` : deux paramètres
/// opaques (`count`, `isDark`), aucun singleton nommé Meeshy, aucune règle
/// de « quand » afficher une rangée. La peau historique garde sa copie tant
/// que son fichier reste gelé ; toute NOUVELLE surface passe par ici.
///
/// **Le portillon `count > 0` vit DANS l'atome.** Un appelant n'a jamais à
/// écrire `if unreadCount > 0` : à zéro (ou en négatif, valeur qu'un
/// décodage optimiste peut produire) la pastille ne rend RIEN et n'occupe
/// aucune place. C'est ce qui garantit qu'aucune peau ne pourra afficher un
/// disque rouge vide.
///
/// Distinct de `NotificationBadge` (`FloatingButtons.swift`), dont il
/// RÉUTILISE le formatage (`displayed(_:)`, « 99+ » au-delà de 99) et la
/// graisse : `NotificationBadge` est une pastille FLOTTANTE, décalée et
/// pulsée, posée en coin d'un bouton — celle-ci est un objet de FLUX, posé
/// dans une ligne, sans animation ni décalage.
public struct UnreadCountBadge: View {
    public let count: Int
    public let isDark: Bool

    /// Cotes du chrome — reprises trait pour trait de
    /// `ThemedConversationRow.unreadBadge` (lu, jamais édité). Exposées pour
    /// que les tests mesurent la trame plutôt que de la recopier.
    public static let horizontalPadding: CGFloat = 7
    public static let verticalPadding: CGFloat = 4
    /// Plancher CARRÉ : à un chiffre la pastille reste un disque.
    public static let minimumSize: CGFloat = 24
    public static let shadowRadius: CGFloat = 3
    public static let shadowOpacity: Double = 0.25

    /// Le portillon, exposé PUR pour être testable sans monter de vue.
    public static func isVisible(count: Int) -> Bool { count > 0 }

    public init(count: Int, isDark: Bool) {
        self.count = count
        self.isDark = isDark
    }

    public var body: some View {
        if Self.isVisible(count: count) {
            let badgeColor = MeeshyColors.unreadBadgeBackground(isDark: isDark)
            Text(NotificationBadge.displayed(count))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: NotificationBadge.fontWeight))
                .foregroundColor(.white)
                .lineLimit(1)
                .padding(.horizontal, Self.horizontalPadding)
                .padding(.vertical, Self.verticalPadding)
                .frame(minWidth: Self.minimumSize, minHeight: Self.minimumSize)
                .background(
                    Capsule()
                        .fill(badgeColor)
                        .shadow(color: badgeColor.opacity(Self.shadowOpacity), radius: Self.shadowRadius)
                )
        }
    }
}
