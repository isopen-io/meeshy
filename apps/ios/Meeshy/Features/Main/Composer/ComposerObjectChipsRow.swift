import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'inspecteur de la vue `1c` — une rangée de jetons au-dessus du socle.**
///
/// « Trois plans, un seul objet à la fois. L'inspecteur est une rangée de
/// jetons au-dessus du socle : **il change de contenu selon le kind, jamais de
/// place**. » La seconde moitié de cette phrase est une exigence de POSITION,
/// et c'est la vue qui la tient : elle ne sait pas ce qu'elle affiche — elle
/// reçoit des `Chip` déjà résolus — donc elle ne peut pas se ranger
/// différemment selon le cas.
///
/// **Chaque jeton porte sa VALEUR, pas son icône.** C'est la différence avec
/// les bulles du rail : on y lit ce qu'on peut CHANGER, jamais ce qui EST. Un
/// réglage qu'il faut ouvrir pour connaître oblige l'auteur à explorer pour se
/// souvenir ; un jeton qui porte sa valeur répond sans être touché — dimension
/// 12, la complexité se paie dans le code.
///
/// La rangée DÉFILE horizontalement plutôt que de compresser ses jetons : une
/// valeur tronquée (« TAILLE 1… ») ne dit rien de plus qu'une valeur absente,
/// et coûte la place en prime.
struct ComposerObjectChipsRow: View {
    let chips: [ComposerObjectChips.Chip]
    /// **Plus d'`activeChipId`** (directive porteur 2026-09-05). L'état encadré
    /// de la planche disait « la bande de ce jeton est ouverte SOUS la scène » ;
    /// la première vue n'édite plus, et ce qu'un jeton ouvre est un écran
    /// MODAL. Aucun jeton n'est donc visible en même temps que ce qu'il a
    /// ouvert : l'état n'a plus de surface où se montrer.
    var onSelect: ((String) -> Void)?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips, id: \.id) { chip in
                    // **Un jeton n'est un BOUTON que s'il mène quelque part.**
                    //
                    // Tous l'étaient, et aucun ne menait nulle part : `onSelect`
                    // n'avait pas d'hôte. Six capsules annonçaient `.isButton`
                    // à VoiceOver, vibraient sous le doigt, et n'ouvraient rien
                    // — la loi 4 dans sa forme la plus coûteuse, puisque le
                    // contrôle PROMET au lieu d'être absent.
                    //
                    // La question ne se pose pas ici : la règle a déjà dit, par
                    // `chip.destination`, si cette valeur se change quelque
                    // part. La vue ne re-filtre rien — elle rend deux formes.
                    if let destination = chip.destination {
                        Button {
                            onSelect?(chip.id)
                            HapticFeedback.light()
                        } label: {
                            capsule(chip)
                        }
                        .buttonStyle(.plain)
                        // Le jeton DIT déjà sa valeur : la redire en libellé
                        // d'accessibilité la ferait entendre deux fois.
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("composer.objectChip.\(chip.id).\(destination.identifier)")
                    } else {
                        capsule(chip)
                            .accessibilityIdentifier("composer.objectChip.\(chip.id)")
                    }
                }
            }
            .padding(.horizontal, ComposerRailGeometry.outerMargin)
        }
        .frame(height: 52)
    }

    /// La capsule elle-même — une LECTURE, que les deux formes partagent. Elle
    /// vit à part pour que la seule différence entre un jeton actionnable et un
    /// jeton de lecture soit ce qui l'ENTOURE, jamais son apparence : deux
    /// dessins divergeraient au premier ajustement.
    private func capsule(_ chip: ComposerObjectChips.Chip) -> some View {
        Text(chip.label)
            .font(MeeshyFont.relative(12, weight: .semibold))
            .lineLimit(1)
            .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            .padding(.horizontal, 14)
            // Le plancher de 44 pt est POSÉ, pas déduit du contenu :
            // « TAILLE 38 » et « 0:00 → 0:06 » n'ont pas la même largeur, et la
            // cible tactile ne doit pas dépendre de la valeur affichée.
            .frame(minHeight: 44)
            .background(
                Capsule().strokeBorder(
                    MeeshyColors.textSecondary(isDark: true).opacity(0.28),
                    lineWidth: 1)
            )
    }
}
