import SwiftUI
import MeeshySDK
import MeeshyUI

/// Toutes les arrivées d'un lien, au-delà des récentes (#7813) — Liens ›
/// le lien › « Voir les N arrivées ».
///
/// Cache-first : l'écran se peint des arrivées récentes que la fiche avait
/// déjà, puis la première page serveur les remplace. Le squelette n'apparaît
/// que s'il n'y a RIEN à montrer. La suite se charge près de la fin, et un
/// échec de page ne retire rien : il se dit en pied de liste. Ni présence ni
/// visage : le serveur ne sert que nom, badge, pays, langue et date.
struct ShareLinkArrivalsListView: View {
    @StateObject private var viewModel: ShareLinkArrivalsListViewModel
    @Environment(\.colorScheme) private var colorScheme

    init(linkId: String, totalCount: Int, seed: [ShareLinkArrivalEntry]) {
        _viewModel = StateObject(wrappedValue: ShareLinkArrivalsListViewModel(
            linkId: linkId,
            totalCount: totalCount,
            seed: seed
        ))
    }

    private var isDark: Bool { colorScheme == .dark }
    private var secondaryInk: Color { isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                if viewModel.totalCount > 0 {
                    Text(ShareLinkDetailCopy.arrivalsTotal(viewModel.totalCount))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(secondaryInk)
                        .padding(.horizontal, MeeshySpacing.xs)
                }
                content
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
            .padding(.bottom, 60)
        }
        .refreshable { await viewModel.refresh() }
        .background(ThemeManager.shared.backgroundGradient.ignoresSafeArea())
        .navigationTitle(ShareLinkDetailCopy.arrivals)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard !viewModel.hasLoadedServerPage else { return }
            await viewModel.loadFirstPage()
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.showsSkeleton {
            card {
                ForEach(0..<6, id: \.self) { _ in ShareLinkArrivalSkeletonRow() }
            }
        } else if viewModel.showsFullError {
            errorState
        } else if viewModel.showsEmpty {
            card {
                Text(ShareLinkDetailCopy.noArrivals)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .foregroundColor(secondaryInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            card {
                LazyVStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    ForEach(viewModel.arrivals) { entry in
                        ShareLinkArrivalRow(entry: entry, isDark: isDark)
                            .equatable()
                            .onAppear {
                                Task { await viewModel.loadNextPageIfNeeded(after: entry) }
                            }
                    }
                    footer
                }
            }
        }
    }

    @ViewBuilder
    private var footer: some View {
        if viewModel.isLoadingNextPage {
            ForEach(0..<2, id: \.self) { _ in ShareLinkArrivalSkeletonRow() }
        } else if viewModel.showsFooterError {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(viewModel.nextPageFailed ? ShareLinkDetailCopy.arrivalsMoreFailed : ShareLinkDetailCopy.arrivalsLoadFailed)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
                retryButton
            }
            .padding(.top, MeeshySpacing.xs)
        }
    }

    private var errorState: some View {
        card {
            VStack(spacing: MeeshySpacing.md) {
                Image(systemName: "wifi.exclamationmark")
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .semibold))
                    .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
                    .accessibilityHidden(true)
                Text(ShareLinkDetailCopy.arrivalsLoadFailed)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                retryButton
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var retryButton: some View {
        Button {
            HapticFeedback.light()
            Task { await viewModel.retry() }
        } label: {
            Text(ShareLinkDetailCopy.retry)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
            .inviteCardSurface(isDark: isDark)
    }
}

/// La silhouette d'une arrivée, à la taille de la vraie ligne : rien ne saute
/// quand la page arrive.
private struct ShareLinkArrivalSkeletonRow: View {
    var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            SkeletonShape(width: 36, height: 36, cornerRadius: MeeshyRadius.lgPlus)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                SkeletonShape(width: 140, height: 14, cornerRadius: MeeshyRadius.xxs)
                SkeletonShape(width: 80, height: 11, cornerRadius: MeeshyRadius.xxs)
            }
            Spacer(minLength: 0)
            SkeletonShape(width: 44, height: 11, cornerRadius: MeeshyRadius.xxs)
        }
        .skeletonShimmer()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ShareLinkDetailCopy.arrivalsLoading)
    }
}
