import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `MessageListViewController.swift`, hors budget de taille : le
// lot #8892 ajoute « est dans la conversation » au visage du frappeur, on
// extrait d'abord la vue, on ajoute ensuite.

// MARK: - Typing Indicator Cell

/// Bulle « X écrit… » rendue comme dernière cellule du flux de messages
/// (bas visuel de la liste inversée). Alignée côté expéditeur ; les points
/// sont `MeeshyTypingDots`, l'unique indicateur de frappe du SDK (#9891) —
/// mêmes timings que les rangées de liste, Reduce Motion système ET in-app.
///
/// **`internal`, pas `private` (2026-08-25, constat L2b/2b-7).** La Rivière
/// monte la MÊME vue en tenue plate (la peau de `Riviere/View/`) : `private` étant à
/// portée de FICHIER, elle était invisible depuis `Riviere/View/` et la seule
/// façon d'y rendre la frappe aurait été d'en déclarer une SECONDE — deux
/// vues qui divergeraient sur les timings, le libellé et l'accessibilité, et
/// la frappe n'aurait pas le même visage selon le mode de lecture.
struct TypingIndicatorBubble: View {
    let participants: [TypingParticipant]
    let accentHex: String
    let isDark: Bool
    /// Rangée PLATE (Focal/Script, matrice §5) : pastille 22 de l'auteur +
    /// trois points pulsants accent, SANS capsule ni libellé visible (mêmes
    /// timings 0.5 s / 0.18 s). `false` = capsule historique du mode bulles.
    var isFlat: Bool = false
    /// Ceux qui ont l'écran de CETTE conversation ouvert (#8892), et ceux qui
    /// y sont actifs (#9061), lus UNE fois par l'hôte : la pastille du
    /// frappeur porte alors le point primaire, qui pulse s'il est actif.
    var here = ConversationHereRoster()

    private var names: [String] { participants.displayNames }

    private var label: String {
        switch names.count {
        case 0: return ""
        case 1: return String(format: String(localized: "typing.named", bundle: .main), names[0])
        case 2: return String(format: String(localized: "typing.double", bundle: .main), names[0], names[1])
        default: return String(localized: "typing.several", bundle: .main)
        }
    }

    /// Le frappeur dont on montre le visage : le premier du roster, dans
    /// l'ordre de première apparition tenu par `ConversationSocketHandler`.
    private var lead: TypingParticipant? { participants.first }

    /// Pastille de l'auteur — sa VRAIE photo dès qu'elle est connue localement,
    /// ses initiales déterministes sinon. `MeeshyAvatar` porte déjà la cascade
    /// (cache disque → réseau → initiales) : lui passer `avatarURL` suffit.
    @ViewBuilder
    private func leadAvatar(size: CGFloat) -> some View {
        if let lead {
            LivePresence { MeeshyAvatar(
                name: lead.displayName,
                context: .custom(size),
                accentColor: accentHex,
                avatarURL: lead.avatarURL,
                presenceState: PresenceManager.shared.presenceState(for: lead.id),
                isHere: here[lead.id],
                ring: lead.ring,
                isDark: isDark
            ) }
        }
    }

    var body: some View {
        let accent = Color(hex: accentHex)
        HStack(spacing: 0) {
            if isFlat {
                HStack(spacing: 7) {
                    leadAvatar(size: 22)
                    MeeshyTypingDots(color: accent, spacing: 3)
                }
                // Aligné sur la colonne d'identité de FocalRow (retrait
                // horizontal de rangée) — aucune capsule, aucun bord.
                .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
            } else {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    // Le visage AVANT le libellé : « qui écrit » se lit d'un
                    // coup d'œil, sans lire le nom. La capsule du mode bulles
                    // ne le portait pas — seule la rangée plate en avait un, et
                    // sans photo (initiales seules).
                    leadAvatar(size: 18)
                    if !label.isEmpty {
                        Text(label)
                            // Dynamic Type (153i) : libellé « X écrit… » réel et localisé —
                            // scale via MeeshyFont.relative. La bulle est dimensionnée par
                            // padding (pas de frame figée), donc elle grandit proprement ;
                            // les 3 points restent des `Circle` décoratifs de 5pt.
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                            .foregroundColor(isDark ? accent.opacity(MeeshyOpacity.intense) : accent.opacity(MeeshyOpacity.heavy))
                            .lineLimit(1)
                    }
                    MeeshyTypingDots(color: accent, spacing: 3)
                }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .background(Capsule().fill(MeeshyColors.surfaceFill(isDark: isDark)))
                .overlay(Capsule().strokeBorder(accent.opacity(isDark ? 0.25 : 0.18), lineWidth: MeeshyBorder.regular))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }
}
