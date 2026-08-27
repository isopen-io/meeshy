import SwiftUI
import CoreLocation
import MeeshySDK
import MeeshyUI

// MARK: - Distances

/// Mise en forme d'une distance SERVIE par le serveur. Le client ne calcule
/// aucune distance : celle-ci est mesurée depuis `Post.geoPoint`, donc depuis
/// la coordonnée quantifiée au grain choisi par l'auteur. La recalculer
/// localement depuis le badge affiché rendrait un chiffre plus précis que le
/// consentement donné.
nonisolated enum NearbyDistanceLabel {
    static func short(meters: Double) -> String {
        if meters < 1000 {
            return String(format: "%.0f m", max(meters, 0))
        }
        let km = meters / 1000
        return km < 10
            ? String(format: "%.1f km", km)
            : String(format: "%.0f km", km)
    }
}

// MARK: - « Voir près d'ici »

/// Action contextuelle sur un badge de position DÉJÀ affiché (spec du
/// 2026-08-02 §4 — points d'entrée).
///
/// Elle est INDÉPENDANTE de l'opt-in de découvrabilité : le lieu est déjà
/// public sur la publication, ouvrir la carte autour de lui n'expose rien de
/// neuf. C'est un raccourci de navigation, pas une autorisation.
///
/// Sans fermeture, la vue est rendue TELLE QUELLE — jamais un menu contextuel
/// vide, qui se serait ouvert sur rien au moindre appui long.
struct SeeNearbyContextMenu: ViewModifier {
    let place: SharedPlace
    let onSeeNearby: ((SharedPlace) -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let onSeeNearby {
            content.contextMenu {
                Button {
                    onSeeNearby(place)
                } label: {
                    Label(
                        String(
                            localized: "post.location.seeNearby",
                            defaultValue: "Voir près d'ici",
                            bundle: .main
                        ),
                        systemImage: "dot.radiowaves.left.and.right"
                    )
                }
            }
        } else {
            content
        }
    }
}

// MARK: - Écran

/// **Découverte de publications par proximité** (spec du 2026-08-02 §4).
///
/// Trois lectures d'un même rayon — densité, pins, liste — et surtout : un
/// écran vide qui DIT pourquoi il est vide.
///
/// Ce dernier point est le cœur du lot, pas son ornement. `Post.geoPoint` est
/// nul pour toute publication antérieure au consentement, et la spec exclut
/// toute rétro-indexation : « aucun résultat » est donc le cas NORMAL au
/// démarrage de la fonctionnalité. Une carte vide muette ferait conclure à
/// chacun que l'écran est cassé — c'est exactement le défaut qu'on évite ici.
///
/// Instant App : la carte se peint immédiatement (ses tuiles ont leur propre
/// cache), les résultats connus sont posés AVANT le moindre appel réseau, et
/// le squelette n'apparaît qu'au démarrage à froid — quand il n'y a réellement
/// rien.
struct NearbyDiscoveryView: View {
    @EnvironmentObject private var router: Router
    @StateObject private var viewModel: NearbyDiscoveryViewModel
    @State private var selectedPostId: String?

    private var theme: ThemeManager { ThemeManager.shared }

    init(initialCoordinate: CLLocationCoordinate2D? = nil) {
        _viewModel = StateObject(
            wrappedValue: NearbyDiscoveryViewModel(initialCoordinate: initialCoordinate)
        )
    }

    /// Cherché dans les DEUX jeux : les résultats de proximité et, pour le
    /// staff, les publications du fil du mode Discover.
    private var selectedPost: FeedPost? {
        selectedPostId.flatMap { id in
            (viewModel.posts + viewModel.discoverPosts).first(where: { $0.id == id })
        }
    }

    /// En mode Discover, les raisons de proximité (position refusée, hors
    /// ligne…) ne s'appliquent pas : la carte du fil a la sienne.
    private var shownEmptyReason: NearbyEmptyReason? {
        viewModel.section == .discover ? viewModel.discoverEmptyReason : viewModel.emptyReason
    }

    var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundPrimary.ignoresSafeArea()

            surface
                .ignoresSafeArea(edges: viewModel.mode == .list ? [] : .bottom)

            VStack(spacing: MeeshySpacing.sm) {
                headerBar
                modePicker
                statusPill
                Spacer(minLength: 0)
                if let reason = shownEmptyReason {
                    NearbyEmptyStateCard(
                        reason: reason,
                        radiusKm: viewModel.radiusKm,
                        action: { await handleEmptyAction(reason) },
                        secondaryAction: { await viewModel.refresh() }
                    )
                    .padding(.horizontal, MeeshySpacing.xl)
                    Spacer(minLength: 0)
                }
                if let post = selectedPost {
                    selectedPostCard(post)
                }
                // Le rayon ne gouverne que la proximité ; Discover montre la
                // plateforme entière.
                if viewModel.section != .discover {
                    radiusPicker
                }
            }
            .padding(.top, MeeshySpacing.sm)
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: selectedPostId)
        .animation(.easeInOut(duration: 0.2), value: viewModel.mode)
        .animation(.easeInOut(duration: 0.2), value: viewModel.section)
        .task { await viewModel.load() }
    }

    // MARK: - Surface : carte ou liste

    @ViewBuilder
    private var surface: some View {
        // La SECTION décide d'abord (directive 2026-08-27). Discover montre la
        // plateforme (posts du fil sur la carte) ; son sous-mode Populaire
        // chauffe les points par la popularité (vues + impressions).
        if viewModel.section == .discover {
            PostsMapRepresentable(posts: viewModel.discoverPosts,
                                  weightByPopularity: viewModel.mode == .popular,
                                  selectedPostId: $selectedPostId)
        } else {
            nearbySurface
        }
    }

    @ViewBuilder
    private var nearbySurface: some View {
        switch viewModel.mode {
        case .list:
            listSurface
        // `.popular` n'existe que dans la section Discover (rendue à part) ;
        // il n'atteint jamais la surface Nearby, mais le switch reste exhaustif.
        case .density, .pins, .popular:
            NearbyDiscoveryMapView(
                mode: viewModel.mode,
                showsPins: viewModel.showsIndividualPins,
                pins: viewModel.mappablePins,
                cells: viewModel.cells,
                cellSize: viewModel.cellSize,
                hottestCellCount: viewModel.hottestCellCount,
                center: viewModel.center,
                radiusKm: viewModel.radiusKm,
                onSelectPost: { selectedPostId = $0 },
                onSelectCell: { cell in
                    HapticFeedback.light()
                    Task { await viewModel.focus(on: cell) }
                },
                onRecenter: { coordinate in
                    Task { await viewModel.recenter(on: coordinate) }
                }
            )
        }
    }

    private var listSurface: some View {
        ScrollView {
            LazyVStack(spacing: MeeshySpacing.sm) {
                // Le seul endroit où un placeholder est permis : cache vide,
                // rien à montrer, rien à mentir.
                if viewModel.isColdStart {
                    ForEach(0..<4, id: \.self) { _ in NearbySkeletonRow() }
                } else {
                    ForEach(viewModel.posts) { post in
                        NearbyPostRow(
                            post: post,
                            distanceMeters: viewModel.distanceMeters(for: post.id)
                        ) {
                            HapticFeedback.light()
                            router.push(.postDetail(post.id, post))
                        }
                        .onAppear {
                            guard post.id == viewModel.posts.last?.id else { return }
                            Task { await viewModel.loadMore() }
                        }
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            // Dégage la chrome haute (en-tête + bascule + pastille) et la
            // barre de rayon.
            .padding(.top, 150)
            .padding(.bottom, 90)
        }
        .refreshable { await viewModel.refresh() }
    }

    // MARK: - Chrome

    private var headerBar: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Button {
                router.pop()
            } label: {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(theme.backgroundSecondary.opacity(0.9)))
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            sectionSwitch

            Spacer()

            // Le SEUL geste de rafraîchissement des surfaces carte :
            // `.refreshable` n'existe que sur la liste, et sans ce bouton un
            // échec de rafraîchissement ne pouvait se lever qu'en quittant
            // l'écran.
            Button {
                HapticFeedback.light()
                Task { await viewModel.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(theme.backgroundSecondary.opacity(0.9)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                String(localized: "feed.nearby.refresh", defaultValue: "Actualiser", bundle: .main)
            )
            .accessibilityIdentifier("feed.nearby.refresh")
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }

    /// **Le switch de SECTION (directive 2026-08-27)** — Nearby ⟷ Discover, en
    /// haut. Discover n'existe que pour le staff (`availableSections`) ; sans
    /// lui, la place tient le titre « À proximité » comme avant.
    @ViewBuilder
    private var sectionSwitch: some View {
        if viewModel.availableSections.count > 1 {
            Picker("", selection: $viewModel.section) {
                ForEach(viewModel.availableSections, id: \.self) { section in
                    Text(Self.sectionLabel(section)).tag(section)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 220)
            .accessibilityIdentifier("feed.nearby.section")
        } else {
            Text(Self.sectionLabel(.nearby))
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .background(Capsule().fill(theme.backgroundSecondary.opacity(0.9)))
                .accessibilityAddTraits(.isHeader)
        }
    }

    private static func sectionLabel(_ section: NearbyDiscoverySection) -> String {
        switch section {
        case .nearby:
            return String(localized: "route.title.nearby", defaultValue: "À proximité", bundle: .main)
        case .discover:
            return String(localized: "feed.nearby.mode.discover", defaultValue: "Découvrir", bundle: .main)
        }
    }

    /// Les segments viennent d'`availableModes` (= `section.modes`) — le picker
    /// contextuel des sous-modes de la section courante.
    private var modePicker: some View {
        Picker("", selection: $viewModel.mode) {
            ForEach(viewModel.availableModes, id: \.self) { mode in
                Text(Self.label(for: mode)).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .padding(.horizontal, MeeshySpacing.xl)
        .accessibilityIdentifier("feed.nearby.mode")
    }

    private static func label(for mode: NearbyDiscoveryMode) -> String {
        switch mode {
        case .density:
            return String(localized: "feed.nearby.mode.density", defaultValue: "Densité", bundle: .main)
        case .pins:
            return String(localized: "feed.nearby.mode.pins", defaultValue: "Points", bundle: .main)
        case .list:
            return String(localized: "feed.nearby.mode.list", defaultValue: "Liste", bundle: .main)
        case .popular:
            return String(localized: "feed.nearby.mode.popular", defaultValue: "Populaire", bundle: .main)
        }
    }

    /// **Jamais un voile, jamais un spinner par-dessus des données.** Une
    /// pastille discrète, et seulement quand elle a quelque chose à dire :
    /// hors ligne, âge du cache, revalidation en cours.
    @ViewBuilder
    private var statusPill: some View {
        if let text = statusText {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: viewModel.isOffline ? "wifi.slash" : "clock.arrow.circlepath")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .accessibilityHidden(true)
                Text(text)
                    .font(MeeshyFont.relative(11, weight: .medium))
            }
            .foregroundColor(viewModel.isOffline ? MeeshyColors.warning : theme.textSecondary)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(theme.backgroundSecondary.opacity(0.92)))
            .accessibilityIdentifier("feed.nearby.status")
        }
    }

    private var statusText: String? {
        // Discover lit le cache du fil : ni recherche, ni revalidation à dire.
        if viewModel.section == .discover { return nil }
        if viewModel.isOffline && viewModel.hasContent {
            return String(
                localized: "feed.nearby.status.offline",
                defaultValue: "Hors ligne — dernières données connues",
                bundle: .main
            )
        }
        if viewModel.isRevalidating {
            return String(
                localized: "feed.nearby.status.refreshing",
                defaultValue: "Mise à jour…",
                bundle: .main
            )
        }
        if viewModel.isColdStart {
            return String(
                localized: "feed.nearby.status.searching",
                defaultValue: "Recherche autour de vous…",
                bundle: .main
            )
        }
        return nil
    }

    private var radiusPicker: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(NearbyDiscoveryViewModel.offeredRadiiKm, id: \.self) { km in
                radiusChip(km)
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(Capsule().fill(theme.backgroundSecondary.opacity(0.92)))
        .padding(.bottom, MeeshySpacing.lg)
        .accessibilityLabel(
            String(localized: "feed.nearby.radius", defaultValue: "Rayon de recherche", bundle: .main)
        )
    }

    private func radiusChip(_ km: Double) -> some View {
        let isSelected = viewModel.radiusKm == km
        return Button {
            HapticFeedback.light()
            Task { await viewModel.setRadius(kilometers: km) }
        } label: {
            Text(String(format: "%.0f km", km))
                .font(MeeshyFont.relative(12, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .white : theme.textSecondary)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.xs)
                .background(
                    Capsule().fill(isSelected ? MeeshyColors.indigo500 : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Carte du post sélectionné

    private func selectedPostCard(_ post: FeedPost) -> some View {
        Button {
            HapticFeedback.light()
            router.push(.postDetail(post.id, post))
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: post.author,
                    context: .custom(40),
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    if !post.displayContent.isEmpty {
                        Text(post.displayContent)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }

                Spacer(minLength: MeeshySpacing.sm)

                if let meters = viewModel.distanceMeters(for: post.id) {
                    Text(NearbyDistanceLabel.short(meters: meters))
                        .font(MeeshyFont.relative(11, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                }

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .fill(theme.backgroundSecondary)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, MeeshySpacing.lg)
    }

    // MARK: - Les gestes qui lèvent un état vide

    private func handleEmptyAction(_ reason: NearbyEmptyReason) async {
        switch reason {
        case .locationDenied:
            MediaPermissionCoordinator.openSettings()
        case .awaitingLocation, .offline, .signInRequired, .serviceUnavailable, .nothingOnTheMap:
            await viewModel.refresh()
        case .noneInRadius:
            guard let wider = NearbyDiscoveryViewModel.offeredRadiiKm
                .first(where: { $0 > viewModel.radiusKm }) else {
                await viewModel.refresh()
                return
            }
            await viewModel.setRadius(kilometers: wider)
        }
    }
}

// MARK: - Un écran vide qui dit pourquoi

/// Six causes, six phrases, six gestes pour les lever.
///
/// La phrase de `.noneInRadius` porte en plus l'explication SANS laquelle
/// l'écran resterait un mystère : seules les publications dont l'auteur a
/// activé « trouvable à proximité » apparaissent ici, et rien de ce qui a été
/// publié avant cette fonctionnalité n'y figure.
///
/// `.locationDenied` est le seul cas à DEUX gestes, et il en avait besoin :
/// son unique bouton ouvrait les Réglages, si bien qu'un utilisateur revenu
/// après avoir accordé la permission n'avait plus qu'à... rouvrir les
/// Réglages. Le second bouton relance la recherche.
struct NearbyEmptyStateCard: View {
    let reason: NearbyEmptyReason
    let radiusKm: Double
    let action: () async -> Void
    let secondaryAction: () async -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    private var secondaryTitle: String? {
        guard reason == .locationDenied else { return nil }
        return String(localized: "feed.nearby.empty.retry", defaultValue: "Réessayer", bundle: .main)
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(30, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .accessibilityHidden(true)

            Text(title)
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)

            Text(detail)
                .font(MeeshyFont.relative(13))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if reason == .noneInRadius {
                Text(
                    String(
                        localized: "feed.nearby.empty.none.why",
                        defaultValue: "Seules les publications dont l'auteur a activé « trouvable à proximité » apparaissent ici. Les publications antérieures à cette option n'y figurent pas.",
                        bundle: .main
                    )
                )
                .font(MeeshyFont.relative(11))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await action() }
            } label: {
                Text(actionTitle)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(Capsule().fill(MeeshyColors.indigo500))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("feed.nearby.empty.action")

            if let secondaryTitle {
                Button {
                    Task { await secondaryAction() }
                } label: {
                    Text(secondaryTitle)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                        .padding(.horizontal, MeeshySpacing.xl)
                        .padding(.vertical, MeeshySpacing.xs)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("feed.nearby.empty.action.secondary")
            }
        }
        .padding(MeeshySpacing.xl)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                .fill(theme.backgroundSecondary.opacity(0.96))
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("feed.nearby.empty")
    }

    private var icon: String {
        switch reason {
        case .locationDenied:  return "location.slash"
        case .awaitingLocation: return "location.magnifyingglass"
        case .offline:         return "wifi.slash"
        case .signInRequired:  return "person.crop.circle.badge.questionmark"
        case .serviceUnavailable: return "exclamationmark.icloud"
        case .noneInRadius:    return "mappin.slash"
        case .nothingOnTheMap: return "map"
        }
    }

    private var title: String {
        switch reason {
        case .locationDenied:
            return String(localized: "feed.nearby.empty.denied.title", defaultValue: "Position non autorisée", bundle: .main)
        case .awaitingLocation:
            return String(localized: "feed.nearby.empty.awaiting.title", defaultValue: "Position introuvable", bundle: .main)
        case .offline:
            return String(localized: "feed.nearby.empty.offline.title", defaultValue: "Hors ligne", bundle: .main)
        case .signInRequired:
            return String(localized: "feed.nearby.empty.signin.title", defaultValue: "Connexion requise", bundle: .main)
        case .serviceUnavailable:
            return String(localized: "feed.nearby.empty.unavailable.title", defaultValue: "Service indisponible", bundle: .main)
        case .noneInRadius:
            return String(localized: "feed.nearby.empty.none.title", defaultValue: "Rien à découvrir ici", bundle: .main)
        case .nothingOnTheMap:
            return String(localized: "feed.map.empty.title", defaultValue: "Aucun post localisé", bundle: .main)
        }
    }

    private var detail: String {
        switch reason {
        case .locationDenied:
            return String(localized: "feed.nearby.empty.denied.detail", defaultValue: "Meeshy n'a pas accès à votre position. Autorisez-la dans les Réglages, ou déplacez la carte à la main.", bundle: .main)
        case .awaitingLocation:
            return String(localized: "feed.nearby.empty.awaiting.detail", defaultValue: "Aucun relevé pour l'instant. Réessayez, ou déplacez la carte pour choisir un point de départ.", bundle: .main)
        case .offline:
            return String(localized: "feed.nearby.empty.offline.detail", defaultValue: "Reconnectez-vous pour explorer autour de vous.", bundle: .main)
        case .signInRequired:
            return String(localized: "feed.nearby.empty.signin.detail", defaultValue: "La recherche à proximité demande un compte Meeshy.", bundle: .main)
        case .serviceUnavailable:
            return String(localized: "feed.nearby.empty.unavailable.detail", defaultValue: "Le serveur n'a pas pu répondre. Ce n'est pas votre rayon de recherche — réessayez dans un instant.", bundle: .main)
        case .noneInRadius:
            return String(
                localized: "feed.nearby.empty.none.detail",
                defaultValue: "Aucune publication à découvrir dans un rayon de \(Int(radiusKm)) km.",
                bundle: .main
            )
        case .nothingOnTheMap:
            return String(localized: "feed.map.empty.detail", defaultValue: "Les posts partagés avec une position apparaîtront ici", bundle: .main)
        }
    }

    private var actionTitle: String {
        switch reason {
        case .locationDenied:
            return String(localized: "feed.nearby.empty.denied.action", defaultValue: "Ouvrir les Réglages", bundle: .main)
        case .noneInRadius:
            return String(localized: "feed.nearby.empty.none.action", defaultValue: "Élargir le rayon", bundle: .main)
        case .awaitingLocation, .offline, .signInRequired, .serviceUnavailable, .nothingOnTheMap:
            return String(localized: "feed.nearby.empty.retry", defaultValue: "Réessayer", bundle: .main)
        }
    }
}

// MARK: - Rangée de liste

struct NearbyPostRow: View {
    let post: FeedPost
    let distanceMeters: Double?
    let onOpen: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: post.author,
                    context: .custom(40),
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: MeeshySpacing.xs) {
                        Text(post.author)
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if let distanceMeters {
                            Text(NearbyDistanceLabel.short(meters: distanceMeters))
                                .font(MeeshyFont.relative(11, weight: .semibold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                    }
                    if !post.displayContent.isEmpty {
                        Text(post.displayContent)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                    if let label = post.location.flatMap({ $0.name ?? $0.address }), !label.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin.circle.fill")
                                .font(MeeshyFont.relative(10, weight: .semibold))
                                .accessibilityHidden(true)
                            Text(label).lineLimit(1)
                        }
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)
                    }
                }
            }
            .padding(MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .fill(theme.backgroundSecondary)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Squelette

/// Le seul placeholder autorisé : démarrage à FROID, cache vide. Dès qu'une
/// donnée — même périmée — existe, elle est rendue à sa place.
struct NearbySkeletonRow: View {
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Circle()
                .fill(theme.backgroundTertiary)
                .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                RoundedRectangle(cornerRadius: 4).fill(theme.backgroundTertiary).frame(width: 120, height: 10)
                RoundedRectangle(cornerRadius: 4).fill(theme.backgroundTertiary).frame(height: 10)
                RoundedRectangle(cornerRadius: 4).fill(theme.backgroundTertiary).frame(width: 180, height: 10)
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .fill(theme.backgroundSecondary)
        )
        .accessibilityHidden(true)
    }
}
