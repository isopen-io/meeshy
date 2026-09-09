import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'ENTRÉE MEESH de l'en-tête « Progression » (#5839) — le solde et son icône,
/// là où un trophée DÉCORATIF occupait le coin depuis #5698.
///
/// Ce que le trophée avait de faux n'était pas son dessin : il était
/// `accessibilityHidden(true)`, ne réagissait à rien et n'annonçait rien. Un
/// ornement à l'endroit où l'œil cherche un contrôle coûte plus qu'un vide.
///
/// **Le sous-menu ne propose la frappe QUE si les points la permettent.** La
/// directive du porteur est une NÉGATION — et une négation se prouve par un
/// témoin qui cherche l'ABSENCE, jamais par une capture qui montre le cas
/// heureux (`ProgressionMeeshEntryTests`).
///
/// Jumelle de `MeeshEntry` / `MeeshDetail` (`apps/web-v3/src/routes/progression.tsx`) :
/// mêmes mots, même ordre, même règle sur la seconde borne.
struct ProgressionMeeshEntry: View {
    let meesh: EngagementMeeshProgress
    let isMinting: Bool
    let onMint: () -> Void

    @State private var ouvert = false
    private let tint = MeeshyColors.warning

    var body: some View {
        Button {
            HapticFeedback.light()
            ouvert.toggle()
        } label: {
            HStack(spacing: 4) {
                Text("\(meesh.balance)")
                    .font(MeeshyFont.relative(16, weight: .bold, design: .rounded))
                Image(systemName: "medal.fill")
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .foregroundColor(tint)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(Capsule().fill(tint.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("progression.meesh.entry")
        .accessibilityLabel(ProgressionCopy.meeshEntryA11y(meesh.balance))
        .accessibilityAddTraits(.isButton)
        .popover(isPresented: $ouvert) {
            ProgressionMeeshDetail(meesh: meesh, isMinting: isMinting, onMint: onMint)
                .frame(idealWidth: 280)
                .padding(MeeshySpacing.md)
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tint: tint)
                .presentationCompactAdaptationPopoverIfAvailable()
        }
    }
}

/// LE CONTENU du sous-menu, séparé de son bouton.
///
/// Deux raisons, et la seconde compte plus : l'état d'OUVERTURE est une affaire
/// de bouton, pas de contenu ; et un contenu qui n'existe qu'à l'intérieur d'un
/// `@State` ne se mesure qu'en simulant un tap — ce qui fait tester le GESTE
/// quand on voulait tester ce qui est DIT.
struct ProgressionMeeshDetail: View {
    let meesh: EngagementMeeshProgress
    let isMinting: Bool
    let onMint: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.warning

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            // Les formulations viennent du hero d'origine : « Aucune Meesh »
            // plutôt que « 0 Meesh », « Convertir » plutôt que « Frapper ». Une
            // refonte de DISPOSITION ne réécrit pas la langue en passant —
            // l'utilisateur reconnaît les mots, c'est à ça qu'il sait que c'est
            // la même chose.
            Text(ProgressionCopy.meeshBalance(meesh.balance))
                .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if meesh.mintedLifetime > 0 {
                Text(ProgressionCopy.meeshMintedLifetime(meesh.mintedLifetime))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            bornes

            ProgressionBar(
                progress: meesh.progress,
                tint: tint,
                label: String(
                    localized: "progression.a11y.bar.meesh",
                    defaultValue: "Vers la prochaine Meesh",
                    bundle: .main
                )
            )
            .padding(.top, MeeshySpacing.xs)

            if meesh.canMint {
                // Le bouton RESTE pendant la frappe, avec son état dit : le
                // faire disparaître au moment du tap donnerait l'impression que
                // l'action a échoué, alors qu'elle est en cours.
                Button {
                    HapticFeedback.light()
                    onMint()
                } label: {
                    Text(
                        isMinting
                            ? String(localized: "progression.meesh.minting", defaultValue: "Frappe en cours…", bundle: .main)
                            : ProgressionCopy.meeshMintAction(meesh.mintCost)
                    )
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.backgroundPrimary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(tint))
                }
                .buttonStyle(.plain)
                .disabled(isMinting)
                .opacity(isMinting ? 0.6 : 1)
                .padding(.top, MeeshySpacing.xs)
            } else {
                Text(ProgressionCopy.meeshMissing(missing: meesh.missingPoints, floor: meesh.floorPoints))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("progression.meesh.detail")
    }

    /// Les deux BORNES du registre de frappe.
    ///
    /// **Une frappe unique a la même date des deux côtés** : la répéter
    /// n'apprend rien et fait douter de la seconde ligne — d'où la comparaison,
    /// et non un simple `if let`.
    @ViewBuilder
    private var bornes: some View {
        if let premiere = meesh.firstMintedAt {
            VStack(alignment: .leading, spacing: 2) {
                borne(
                    String(localized: "progression.meesh.first_mint", defaultValue: "Première frappe", bundle: .main),
                    premiere
                )
                if let derniere = meesh.lastMintedAt, derniere != premiere {
                    borne(
                        String(localized: "progression.meesh.last_mint", defaultValue: "Dernière frappe", bundle: .main),
                        derniere
                    )
                }
            }
        } else {
            Text(String(
                localized: "progression.meesh.never_minted",
                defaultValue: "Aucune frappe pour l’instant.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(11, weight: .medium))
            .foregroundColor(theme.textMuted)
        }
    }

    private func borne(_ titre: String, _ date: Date) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(titre)
                .foregroundColor(theme.textMuted)
            Spacer(minLength: MeeshySpacing.xs)
            Text(date.formatted(date: .abbreviated, time: .omitted))
                .foregroundColor(theme.textPrimary)
        }
        .font(MeeshyFont.relative(11, weight: .medium))
        .accessibilityElement(children: .combine)
    }
}

private extension View {
    /// Le sous-menu reste un POPOVER sur iPhone plutôt que de devenir une
    /// feuille pleine hauteur — l'adaptation compacte n'existe qu'à partir
    /// d'iOS 16.4, et l'app sert iOS 16.0.
    @ViewBuilder
    func presentationCompactAdaptationPopoverIfAvailable() -> some View {
        if #available(iOS 16.4, *) {
            presentationCompactAdaptation(.popover)
        } else {
            self
        }
    }
}
