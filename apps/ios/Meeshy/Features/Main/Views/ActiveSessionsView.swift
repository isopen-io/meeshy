import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Sécurité > Sessions (#9612) : chaque session ouverte du compte, reconnue
/// par son appareil, son logiciel, son lieu approximatif et sa dernière
/// activité, et fermée à distance après confirmation.
struct ActiveSessionsView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = ActiveSessionsViewModel()
    /// Référence stable, jamais observée par la racine : seul l'en-tête se
    /// re-rend au fil du défilement (même dispositif que Réglages).
    @State private var scrollRelay = ScrollOffsetRelay()

    var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundGradient.ignoresSafeArea()

            // L'en-tête partagé est monté À LA MAIN plutôt que par
            // `CollapsibleHeaderPage` : l'écran bascule entre chargement, vide et
            // liste, et seul ce dernier état défile. Le retour en verre (#6481)
            // doit rester présent dans les trois.
            VStack(spacing: 0) {
                content
            }

            header
        }
        .alert(
            String(localized: "sessions_error_title", defaultValue: "Erreur", bundle: .main),
            isPresented: $viewModel.showError
        ) {
            Button(String(localized: "sessions_error_ok", defaultValue: "OK", bundle: .main), role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage)
        }
        .confirmationDialog(
            String(localized: "sessions.revoke.confirm.title", defaultValue: "Déconnecter cet appareil ?", bundle: .main),
            isPresented: Binding(
                get: { viewModel.pendingRevocation != nil },
                set: { if !$0 { viewModel.pendingRevocation = nil } }
            ),
            titleVisibility: .visible,
            presenting: viewModel.pendingRevocation
        ) { session in
            Button(String(localized: "sessions.revoke.confirm.action", defaultValue: "Déconnecter", bundle: .main), role: .destructive) {
                Task { await viewModel.revokeSession(sessionId: session.id) }
            }
            Button(String(localized: "sessions.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: { session in
            Text(String(
                format: String(localized: "sessions.revoke.confirm.message", defaultValue: "%@ devra se reconnecter pour accéder à votre compte.", bundle: .main),
                SessionRowPresentation.title(of: session)
            ))
        }
        .confirmationDialog(
            String(localized: "sessions.revokeAll.confirm.title", defaultValue: "Déconnecter tous les autres appareils ?", bundle: .main),
            isPresented: $viewModel.isConfirmingRevokeAll,
            titleVisibility: .visible
        ) {
            Button(String(localized: "sessions_revoke_all", defaultValue: "Déconnecter les autres appareils", bundle: .main), role: .destructive) {
                Task { await viewModel.revokeAllOtherSessions() }
            }
            Button(String(localized: "sessions.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "sessions.revokeAll.confirm.message", defaultValue: "Seul cet appareil restera connecté. Les autres devront se reconnecter.", bundle: .main))
        }
        .task { await viewModel.loadSessions() }
    }

    // MARK: - Header

    private var header: some View {
        ScrollOffsetReader(relay: scrollRelay) { offset in
            CollapsibleHeader(
                title: String(localized: "sessions_title", defaultValue: "Sessions actives", bundle: .main),
                scrollOffset: offset,
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            )
        }
    }

    // MARK: - Content

    /// Cache-first : la liste connue s'affiche dès qu'elle existe ; le
    /// squelette ne se montre que sur un cache vide, pendant le premier appel.
    @ViewBuilder
    private var content: some View {
        if viewModel.sessions.isEmpty {
            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)
            emptyContent
                // Un état qui ne défile pas rend l'en-tête déplié : le relais
                // pourrait garder le repli de la liste quittée.
                .onAppear { scrollRelay.offset = 0 }
        } else {
            sessionsList
        }
    }

    @ViewBuilder
    private var emptyContent: some View {
        switch viewModel.loadState {
        case .idle:
            Spacer()
        case .loading:
            skeleton
            Spacer()
        case .offline:
            unavailable(
                title: String(localized: "sessions.offline.title", defaultValue: "Vous êtes hors ligne", bundle: .main),
                systemImage: "wifi.slash",
                description: String(localized: "sessions.offline.subtitle", defaultValue: "Vos sessions s'afficheront au retour du réseau.", bundle: .main)
            )
        case .error:
            unavailable(
                title: String(localized: "sessions_load_error", defaultValue: "Impossible de charger les sessions", bundle: .main),
                systemImage: "exclamationmark.triangle",
                description: String(localized: "sessions.error.subtitle", defaultValue: "Vérifiez votre connexion, puis réessayez.", bundle: .main)
            )
        case .loaded, .cachedFresh, .cachedStale:
            emptyState
        }
    }

    // MARK: - Empty / unavailable states

    // `AdaptiveContentUnavailableView` : `ContentUnavailableView` natif sur
    // iOS 17+, repli fidèle sur iOS 16 — symbole qui suit Dynamic Type, titre et
    // description regroupés pour VoiceOver.
    private var emptyState: some View {
        AdaptiveContentUnavailableView(
            String(localized: "sessions_empty", defaultValue: "Aucune session active", bundle: .main),
            systemImage: "laptopcomputer.and.iphone",
            description: Text(String(localized: "sessions_empty_subtitle", defaultValue: "Vos appareils connectés apparaîtront ici.", bundle: .main))
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func unavailable(title: String, systemImage: String, description: String) -> some View {
        VStack(spacing: MeeshySpacing.lg) {
            AdaptiveContentUnavailableView(title, systemImage: systemImage, description: Text(description))
            Button {
                Task { await viewModel.refresh() }
            } label: {
                Text(String(localized: "sessions.retry", defaultValue: "Réessayer", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .frame(minHeight: 44)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var skeleton: some View {
        VStack(spacing: MeeshySpacing.lg) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    SkeletonShape(width: 32, height: 32, cornerRadius: MeeshyRadius.xs)
                    VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                        SkeletonShape(width: 140, height: 14)
                        SkeletonShape(height: 10)
                        SkeletonShape(width: 180, height: 10)
                    }
                }
                .padding(MeeshySpacing.md)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "sessions.loading", defaultValue: "Chargement des sessions", bundle: .main))
    }

    // MARK: - Sessions List

    private var sessionsList: some View {
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                statusBanner

                if let current = viewModel.currentSession {
                    sectionTitle(String(localized: "sessions.section.current", defaultValue: "Cet appareil", bundle: .main))
                    sessionRow(current)
                }

                if viewModel.hasOtherSessions {
                    sectionTitle(String(localized: "sessions.section.others", defaultValue: "Autres appareils", bundle: .main))
                    ForEach(viewModel.otherSessions) { session in
                        sessionRow(session)
                    }
                    revokeAllButton
                }

                if viewModel.showsGeolocation {
                    attributionFooter
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+
        .refreshable { await viewModel.refresh() }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(theme.textSecondary)
            .textCase(.uppercase)
            .padding(.leading, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    /// La liste connue reste lisible quand le réseau manque ; le bandeau dit
    /// seulement qu'elle peut dater.
    @ViewBuilder
    private var statusBanner: some View {
        switch viewModel.loadState {
        case .offline:
            banner(systemImage: "wifi.slash", text: String(localized: "sessions.offline.banner", defaultValue: "Hors ligne — dernières informations connues.", bundle: .main))
        case .error:
            banner(systemImage: "exclamationmark.triangle", text: String(localized: "sessions.error.banner", defaultValue: "Actualisation impossible — tirez pour réessayer.", bundle: .main))
        default:
            EmptyView()
        }
    }

    private func banner(systemImage: String, text: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
            .foregroundColor(theme.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(MeeshyColors.warning.opacity(0.12))
            )
            .accessibilityElement(children: .combine)
    }

    // MARK: - Session Row

    private func sessionRow(_ session: UserSession) -> some View {
        let row = SessionRowPresentation(session)
        let tint = row.isCurrent ? MeeshyColors.success : MeeshyColors.indigo400
        let details = [row.software, row.place, row.timezone, row.opened, row.activity].compactMap { $0 }
        return HStack(alignment: .top, spacing: MeeshySpacing.md) {
            // Bloc informatif (icône + libellés) groupé en UN seul élément
            // VoiceOver au lieu d'un arrêt par ligne (168i) ; « Déconnecter »
            // reste un élément actionnable distinct, hors du groupe.
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                Image(systemName: row.systemImage)
                    // Glyphe décoratif borné par le cadre fixe 32×32 → police figée (86i) ;
                    // l'identité de l'appareil est portée par le titre → masqué du rotor.
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(tint)
                    .frame(width: 32, height: 32)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                            .fill(tint.opacity(0.12))
                    )
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        Text(row.title)
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)

                        if row.isCurrent {
                            Text(String(localized: "sessions_current_badge", defaultValue: "Actuelle", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, MeeshySpacing.xsPlus)
                                .padding(.vertical, MeeshySpacing.xxs)
                                .background(Capsule().fill(MeeshyColors.success))
                        }
                    }

                    ForEach(details, id: \.self) { line in
                        Text(line)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
                            .foregroundColor(theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)

            if !row.isCurrent {
                revokeButton(session, title: row.title)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: row.isCurrent ? "34D399" : MeeshyColors.brandPrimaryHex))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(theme.border(tint: row.isCurrent ? "34D399" : MeeshyColors.brandPrimaryHex), lineWidth: 1)
                )
        )
    }

    private func revokeButton(_ session: UserSession, title: String) -> some View {
        Button {
            HapticFeedback.medium()
            viewModel.requestRevoke(session)
        } label: {
            Text(String(localized: "sessions.revoke.button", defaultValue: "Déconnecter", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .disabled(viewModel.isRevoking)
        // « sessions_revoke » : le bouton reste un élément VoiceOver distinct, qui
        // nomme l'appareil qu'il déconnecte.
        .accessibilityLabel(String(
            format: String(localized: "sessions.revoke.a11y", defaultValue: "Déconnecter %@", bundle: .main),
            title
        ))
    }

    // MARK: - Revoke All Button

    private var revokeAllButton: some View {
        Button {
            HapticFeedback.medium()
            viewModel.requestRevokeAll()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .accessibilityHidden(true)
                Text(String(localized: "sessions_revoke_all", defaultValue: "Déconnecter les autres appareils", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(MeeshyColors.error)
            )
        }
        .disabled(viewModel.isRevoking)
        .opacity(viewModel.isRevoking ? 0.6 : 1.0)
    }

    // MARK: - Attribution

    /// La licence CC-BY 4.0 de DB-IP Lite : l'attribution accompagne chaque
    /// lieu tiré d'une adresse, et la ville se dit approximative.
    private var attributionFooter: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(String(localized: "sessions.place.footnote", defaultValue: "Les lieux sont approximatifs : ils sont déduits de l'adresse IP.", bundle: .main))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let link = viewModel.attribution.url.flatMap({ URL(string: $0) }) {
                Link(viewModel.attribution.text, destination: link)
                    .foregroundColor(MeeshyColors.indigo500)
                    .frame(minHeight: 44, alignment: .leading)
            } else {
                Text(viewModel.attribution.text)
                    .foregroundColor(theme.textMuted)
            }
        }
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
        .padding(.horizontal, MeeshySpacing.xs)
    }
}
