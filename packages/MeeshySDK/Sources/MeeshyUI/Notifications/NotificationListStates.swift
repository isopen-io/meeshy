import SwiftUI
import Foundation

// Les deux états que la cloche ne DESSINAIT pas (#7000).
//
// Cache vide : un `ProgressView` centré, accompagné de « Chargement… ». Le
// dépôt appelle ça un spinner sur cache vide, et la règle maison est un
// SQUELETTE — la forme de ce qui arrive, pas l'aveu qu'on attend (Instant App
// Principles § Cache-First).
//
// Panne réseau : RIEN. `refreshFromAPI` journalisait puis laissait `isLoading`
// retomber à `false` sur un tableau vide, et la vue rendait alors son état
// VIDE : « Aucune notification ». Une panne ressemblait mot pour mot à une
// boîte vide — et c'est le pire des deux, parce qu'elle est rassurante.
//
// Fichier séparé : la responsabilité « ce que la liste montre quand elle n'a
// pas de lignes » est distincte de la liste elle-même, et
// `NotificationListView.swift` porte déjà son enum de catégories, sa barre de
// filtres et son ViewModel.

// MARK: - Squelette

/// Ce que la cloche montre pendant un démarrage à FROID — cache vide, réseau
/// en vol. La forme d'une ligne de notification : pastille, avatar, titre,
/// corps, horodatage.
struct NotificationListSkeleton: View {
    // Feuille : pas d'`@ObservedObject` sur un singleton global (Instant App
    // Principles § Zero Unnecessary Re-render). L'hôte observe déjà le thème,
    // et ces vues se re-rendent avec lui. Même forme que `SkeletonView.swift`.
    private var theme: ThemeManager { ThemeManager.shared }

    /// Assez de lignes pour remplir un écran d'iPhone sans en dessiner pour
    /// l'iPad : au-delà, le squelette coûte plus qu'il ne rassure.
    private let rowCount = 7

    /// `init` EXPLICITE, et pas par confort : `rowCount` est une propriété
    /// STOCKÉE `private`, ce qui rend `private` l'initialiseur par membre que
    /// Swift synthétise — donc inatteignable depuis `NotificationListView.swift`.
    /// Même raison que l'`init()` de `SkeletonConversationRow`.
    init() {}

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(0..<rowCount, id: \.self) { index in
                    row(index: index)
                }
            }
            .padding(.top, 4)
        }
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            String(
                localized: "notifications.loading",
                defaultValue: "Chargement...",
                bundle: .module
            )
        )
    }

    private func row(index: Int) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 44, height: 44)
                .skeletonShimmer()

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    SkeletonShape(height: 13, cornerRadius: MeeshyRadius.sm)
                        .frame(width: titleWidth(index))
                    Spacer(minLength: 8)
                    SkeletonShape(width: 30, height: 9, cornerRadius: 4)
                }
                SkeletonShape(height: 11, cornerRadius: MeeshyRadius.sm)
                    .frame(maxWidth: .infinity)
                SkeletonShape(height: 11, cornerRadius: MeeshyRadius.sm)
                    .frame(width: bodyWidth(index))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityHidden(true)
    }

    /// Des largeurs INÉGALES : trois lignes identiques se lisent comme un
    /// gabarit cassé, pas comme du contenu en route.
    private func titleWidth(_ index: Int) -> CGFloat {
        [140, 112, 168, 126, 154][index % 5]
    }

    private func bodyWidth(_ index: Int) -> CGFloat {
        [210, 168, 240, 190, 154][index % 5]
    }
}

// MARK: - Panne

/// Ce que la cloche montre quand le chargement a ÉCHOUÉ et qu'aucune ligne
/// n'est en cache. Distinct de l'état vide, et doté du seul geste qui vaille :
/// réessayer.
struct NotificationListErrorState: View {
    // Feuille : pas d'`@ObservedObject` sur un singleton global (Instant App
    // Principles § Zero Unnecessary Re-render). L'hôte observe déjà le thème,
    // et ces vues se re-rendent avec lui. Même forme que `SkeletonView.swift`.
    private var theme: ThemeManager { ThemeManager.shared }

    let brandColor: Color
    let retry: () -> Void

    init(brandColor: Color, retry: @escaping () -> Void) {
        self.brandColor = brandColor
        self.retry = retry
    }

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 44))
                .foregroundColor(MeeshyColors.error.opacity(0.6))
                .accessibilityHidden(true)

            Text(
                String(
                    localized: "notifications.error.title",
                    defaultValue: "Notifications indisponibles",
                    bundle: .module
                )
            )
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(theme.textPrimary)
            .multilineTextAlignment(.center)

            Text(
                String(
                    localized: "notifications.error.subtitle",
                    defaultValue: "Vérifiez votre connexion, puis réessayez.",
                    bundle: .module
                )
            )
            .font(.system(size: 13))
            .foregroundColor(theme.textMuted)
            .multilineTextAlignment(.center)

            Button(action: retry) {
                Text(
                    String(
                        localized: "notifications.error.retry",
                        defaultValue: "Réessayer",
                        bundle: .module
                    )
                )
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(Capsule().fill(brandColor))
            }
            .buttonStyle(.plain)
            .meeshyTapTarget()

            Spacer()
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
    }
}
