import SwiftUI
import MeeshySDK
import MeeshyUI

/// La Rampe — « Ils t'attendent » (contrat §WS-9). Rail horizontal de
/// visages, classés par `FaceRampRanking.rank` (JAMAIS alphabétique — le
/// tri est un fait du modèle, cette vue ne retrie rien). Le badge affiche
/// `entry.awaitingCount` — jamais `entry.needScore`, qui n'est même pas lu
/// ici (contrat §3.7 : « ce qui sert au tri, jamais affiché »).
///
/// « répondre à Sarah en moins de 5 secondes, sans jamais voir les 98 autres
/// messages » (critère §WS-9) : le tap remonte l'ENTRÉE entière —
/// `evidenceMessageIds` porte déjà les seuls messages qui la concernent,
/// c'est au site de montage (WS-7) de pré-adresser le composeur avec eux.
struct FaceRampView: View {
    let entries: [FaceRampEntry]
    let isDark: Bool
    var onTap: (FaceRampEntry) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "focal.summary.ramp.title", defaultValue: "Ils t'attendent", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .heavy))
                .foregroundColor(isDark ? .white.opacity(0.92) : .black.opacity(0.88))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.md) {
                    ForEach(entries) { entry in
                        FaceRampEntryButton(entry: entry, isDark: isDark) { onTap(entry) }
                    }
                }
                .padding(.horizontal, 2) // laisse respirer l'anneau de la première/dernière pastille
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct FaceRampEntryButton: View {
    let entry: FaceRampEntry
    let isDark: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: MeeshySpacing.xs) {
                ZStack(alignment: .topTrailing) {
                    MeeshyAvatar(
                        name: entry.displayName,
                        context: .custom(FocalMetrics.Avatar.size * 2),
                        accentColor: entry.colorHex,
                        avatarURL: entry.avatarURL,
                        presenceState: entry.presence,
                        enablePulse: false,
                        isDark: isDark
                    )
                    if entry.awaitingCount > 0 {
                        badge
                            .offset(x: 4, y: -4)
                    }
                }
                Text(entry.displayName)
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(isDark ? .white.opacity(0.75) : .black.opacity(0.65))
                    .lineLimit(1)
                    .frame(maxWidth: FocalMetrics.Avatar.size * 2.2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            String(
                format: String(
                    localized: "focal.summary.ramp.entry.a11y_label",
                    defaultValue: "%@, %d messages t'attendent",
                    bundle: .main
                ),
                entry.displayName,
                entry.awaitingCount
            )
        )
    }

    private var badge: some View {
        Text("\(entry.awaitingCount)")
            .font(MeeshyFont.relative(10, weight: .heavy))
            .foregroundColor(.white)
            .padding(.horizontal, 5)
            .frame(minWidth: 16, minHeight: 16)
            .background(Capsule().fill(MeeshyColors.indigo500))
            .overlay(Capsule().strokeBorder(isDark ? Color.black : Color.white, lineWidth: 1.5))
    }
}
