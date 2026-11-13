import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

struct LocationPickerView: View {
    /// Couleur PRIMAIRE de la conversation — les appelants passent
    /// `conversation.accentColor`, qui est `displayPalette.primary`.
    let accentColor: String
    /// Émet un lieu COMPLET (coordonnées + nom + adresse + catégorie POI),
    /// pas de simples coordonnées nues : c'est ce que jetait l'ancienne
    /// signature `(CLLocationCoordinate2D, String?) -> Void` aux quatre call
    /// sites, dont un littéral `{ coordinate, _ in }`.
    let onSelect: (SharedPlace) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.meeshySheetClose) private var hostClose
    /// L'auteur a choisi un résultat de recherche (`LocationPickerOffer`).
    @State private var searched = false
    // Plus de référence à `ThemeManager.shared` : tout ce que cette vue pose
    // est soit une couleur de conversation, soit une couleur sémantique qui
    // s'adapte au matériau. Une vue posée sur une carte n'a pas à lire un
    // singleton global de thème.
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = LocationPickerModel()
    @ObservedObject private var preferencesStore: LocationSharingPreferencesStore
    @State private var searchText = ""
    @State private var searchTask: Task<Void, Never>?
    @State private var mapTarget: MapTarget?
    @State private var didCenterOnUser = false
    @State private var isShowingSettings = false
    /// Vrai tant que la caméra bouge — pilote le soulèvement du pin.
    @State private var isMapMoving = false

    /// Couleur d'ACCENT de la conversation, dérivée du primaire par la formule
    /// officielle du SDK. `DynamicColorGenerator.colorFor(context:)` calcule
    /// `accent = shiftHue(primary, -30°)` et n'applique jamais
    /// `saturationBoost` aux hex — cette dérivation reproduit donc
    /// `conversation.displayPalette.accent` à l'identique, sans imposer un
    /// nouveau paramètre aux sept sites d'appel.
    ///
    /// STOCKÉE, pas calculée : `hueShiftedHex` construit deux `UIColor` et un
    /// `Scanner` à chaque appel, et le body en fait huit usages (pin, dégradé
    /// du CTA, badge, deux boutons flottants, icônes de résultats). En
    /// propriété calculée, chaque re-rendu déclenché par un déplacement de
    /// carte refaisait tout ce travail.
    private let secondaryAccent: String

    /// Le couple primaire/accent RENDU LISIBLE sur la carte.
    ///
    /// `colorFor(context:)` mélange trois couleurs de palette ; sur certaines
    /// combinaisons le résultat est terne (vérifié au simulateur : une
    /// conversation directe rend un bleu-gris à 30 % de saturation). Posé sur
    /// une carte claire, un glyphe de cette teinte se lit mal — et depuis que
    /// les styles satellite et hybride existent, le fond peut être n'importe
    /// quoi. `adaptedColor` plafonne la luminosité à 0,60 en clair et la
    /// plancher à 0,70 en sombre tout en gardant la teinte : l'identité de la
    /// conversation reste, le contraste devient garanti.
    private struct OnMapColors { let primary: String; let accent: String }
    private let onMapLight: OnMapColors
    private let onMapDark: OnMapColors
    private var onMap: OnMapColors { isDark ? onMapDark : onMapLight }

    init(accentColor: String, onSelect: @escaping (SharedPlace) -> Void,
         preferencesStore: LocationSharingPreferencesStore = .shared) {
        self.preferencesStore = preferencesStore
        let accent = DynamicColorGenerator.hueShiftedHex(accentColor, degrees: -30)
        self.accentColor = accentColor
        self.secondaryAccent = accent
        // Les deux variantes sont calculées ICI, une fois : les résoudre dans
        // `body` ferait quatre conversions UIColor à chaque déplacement de
        // carte.
        self.onMapLight = OnMapColors(
            primary: DynamicColorGenerator.adaptedColor(accentColor, for: .light),
            accent: DynamicColorGenerator.adaptedColor(accent, for: .light)
        )
        self.onMapDark = OnMapColors(
            primary: DynamicColorGenerator.adaptedColor(accentColor, for: .dark),
            accent: DynamicColorGenerator.adaptedColor(accent, for: .dark)
        )
        self.onSelect = onSelect
    }

    private var precision: LocationPrecision { preferencesStore.preferences.precision }

    var body: some View {
        NavigationStack {
            ZStack {
                mapView

                centerPin

                VStack(spacing: 0) {
                    searchBar
                    if viewModel.isLocationRefused {
                        locationDeniedBanner
                    }
                    // DANS le flux, sous la barre — pas en calque séparé avec un
                    // décalage deviné. Une constante aurait dû anticiper la
                    // hauteur de la barre, qui grandit avec le Dynamic Type :
                    // aux tailles d'accessibilité elle serait repassée
                    // par-dessus la colonne, c'est-à-dire le bug d'origine.
                    floatingControls
                    Spacer()
                    bottomCard
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { close() }
                        .foregroundStyle(Color(hex: accentColor))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "location.title", defaultValue: "Choisir un lieu", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                        .accessibilityAddTraits(.isHeader)
                }
            }
            .sheet(isPresented: $isShowingSettings) {
                LocationSharingSettingsSheet(accentColor: accentColor)
            }
            .onAppear { viewModel.requestPermission() }
            .onReceive(viewModel.userLocationUpdates) { loc in
                // The adaptive map opens on a fixed neutral region on EVERY OS
                // version now — `.userLocation(fallback: .automatic)` resolved
                // synchronously on the main thread inside `updateUIView` and
                // could re-enter itself through `onMapCameraChange`, freezing
                // the picker (see `AdaptiveMapInitialRegion` in the SDK). So
                // every version recenters explicitly on the first fix only.
                guard !didCenterOnUser else { return }
                didCenterOnUser = true
                mapTarget = MapTarget(center: loc, latitudinalMeters: 1000, longitudinalMeters: 1000)
            }
        }
    }

    // MARK: - Permission

    /// Refus de localisation : le picker restait muet (l'échec CoreLocation ne
    /// produisait qu'un log) et l'utilisateur attendait un recentrage qui
    /// n'arriverait jamais. Le bandeau explique et renvoie aux Réglages ; la
    /// sélection manuelle sur la carte reste parfaitement utilisable, donc on
    /// n'obstrue rien.
    private var locationDeniedBanner: some View {
        Button {
            MediaPermissionCoordinator.openSettings()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "location.slash.fill")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                Text(MediaPermissionCoordinator.locationDeniedMessage)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .foregroundColor(MeeshyColors.warning)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(MeeshyColors.warning.opacity(MeeshyOpacity.light))
            )
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Map

    private var mapView: some View {
        AdaptiveInteractiveMap(
            target: mapTarget,
            // Plus d'annotation : le pin est une SURCOUCHE d'écran, posée au
            // centre par le ZStack. Ancré à une coordonnée, il voyageait avec
            // la carte pendant le déplacement — il quittait le centre puis y
            // resautait au relâchement, quand `selectedCoordinate` rattrapait.
            // Un pin qui dérive ne peut pas se soulever de façon lisible : le
            // motif des sélecteurs de carte est une carte qui glisse SOUS un
            // pin fixe.
            annotationCoordinate: nil,
            style: preferencesStore.preferences.mapStyle,
            // Les contrôles système se rendent en haut-trailing, SOUS la barre
            // de recherche flottante — c'est exactement là que le bouton de
            // recentrage devenait inatteignable. On pose les nôtres.
            defaultControls: false,
            onRegionChange: { center in
                viewModel.updateSelectedLocation(center)
            },
            onInteractionChange: { moving in
                // Garde d'écriture UNIQUE par geste : `.continuous` tire
                // plusieurs fois par seconde, et republier `true` à chaque
                // trame re-rendrait la carte en boucle.
                guard isMapMoving != moving else { return }
                isMapMoving = moving
            }
        ) {
            EmptyView()
        }
        .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - Pin central

    /// Le pin que la carte glisse dessous. Il se soulève au premier signe de
    /// mouvement et se repose quand la caméra s'arrête.
    ///
    /// Non interactif (`allowsHitTesting(false)`) : il occupe le centre de
    /// l'écran, exactement là où l'utilisateur pose le doigt pour déplacer la
    /// carte — capter ce toucher rendrait la carte impossible à bouger par son
    /// milieu.
    private var centerPin: some View {
        let lift = MapPinLift.style(lifted: isMapMoving)
        // ZStack, PAS VStack : empilés verticalement, c'est la PAIRE
        // pin + ombre qui se retrouve centrée, donc le pin lui-même flotte
        // au-dessus du centre réel de la carte — il désignerait un point
        // différent de celui que `onRegionChange` rapporte. Ici le pin est à
        // l'exact centre au repos et l'ombre est décalée sous lui.
        return ZStack {
            Ellipse()
                .fill(Color.black.opacity(lift.shadowOpacity))
                .frame(width: 14, height: 5)
                .scaleEffect(lift.shadowScale)
                .blur(radius: 1)
                .offset(y: 22)

            Image(systemName: "mappin.circle.fill")
                // Chrome de carte à taille d'écran fixe, pas du texte à lire :
                // le mettre à l'échelle du Dynamic Type le décrocherait du
                // point qu'il marque (doctrine 74i/86i).
                .font(.system(size: 36))
                .foregroundStyle(Color(hex: onMap.primary), Color(hex: onMap.accent).opacity(MeeshyOpacity.medium))
                .shadow(color: Color(hex: onMap.accent).opacity(MeeshyOpacity.strong), radius: 6, y: 3)
                .scaleEffect(lift.scale)
                .offset(y: lift.yOffset)
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.68), value: isMapMoving)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Contrôles flottants

    /// Colonne trailing posée SOUS la barre de recherche, dans le flux du
    /// `VStack` — donc toujours dégagée, quelle que soit la hauteur qu'atteint
    /// la barre. Elle s'efface quand des résultats s'affichent : la liste a
    /// alors la priorité visuelle, et c'est le seul recouvrement accepté.
    private var floatingControls: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            controlButton(
                icon: "info.circle",
                label: String(localized: "location.settings.open", defaultValue: "Réglages de partage de position", bundle: .main)
            ) {
                isShowingSettings = true
            }

            controlButton(
                icon: "location.fill",
                label: String(localized: "location.recenter", defaultValue: "Recentrer sur ma position", bundle: .main)
            ) {
                viewModel.centerOnUser()
                if let loc = viewModel.userLocation {
                    mapTarget = MapTarget(center: loc, latitudinalMeters: 500, longitudinalMeters: 500)
                }
            }
        }
        .padding(.trailing, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.md)
        // Cadre pleine largeur pour ancrer la colonne à droite. La zone vide à
        // gauche ne capte rien (aucun fond, aucun `contentShape`), la carte
        // reste donc déplaçable dessous — même patron que la barre de recherche
        // juste au-dessus.
        .frame(maxWidth: .infinity, alignment: .trailing)
        .opacity(viewModel.searchResults.isEmpty ? 1 : 0)
        .allowsHitTesting(viewModel.searchResults.isEmpty)
        .animation(.easeInOut(duration: 0.18), value: viewModel.searchResults.isEmpty)
    }

    private func controlButton(
        icon: String,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: icon)
                // Chrome de carte ancré à une taille d'écran fixe, pas du texte
                // à lire : le mettre à l'échelle du Dynamic Type le décrocherait
                // de la grille de contrôles (doctrine 86i).
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color(hex: onMap.accent))
                .frame(width: 40, height: 40)
                .adaptiveGlass(in: Circle())
                .clipShape(Circle())
                .shadow(color: .black.opacity(MeeshyOpacity.light), radius: 6, y: 2)
                // Cible tactile Apple HIG (44 pt) sans grossir le disque
                // visible (40 pt). L'ORDRE compte : `frame` d'abord, puis
                // `contentShape` — l'inverse découperait la zone tactile sur
                // le disque de 40 et la cible resterait sous-dimensionnée.
                .meeshyTapTarget()
                .contentShape(Circle())
        }
        .accessibilityLabel(label)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                .foregroundStyle(Color(hex: accentColor))
                .accessibilityHidden(true)

            TextField(String(localized: "location.search-placeholder", defaultValue: "Rechercher un lieu…", bundle: .main), text: $searchText)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .onSubmit { viewModel.search(query: searchText) }
                // La recherche suit la frappe, 300 ms après la dernière touche :
                // assez pour ne pas lancer une requête par lettre, assez peu
                // pour que la liste réponde avant qu'on cherche « Entrée ».
                .adaptiveOnChange(of: searchText) { _, requête in
                    searchTask?.cancel()
                    // Un résultat choisi écrit son nom dans le champ : ce n'est
                    // pas une nouvelle requête, la liste ne doit pas se rouvrir.
                    guard requête != viewModel.selectedName else { return }
                    searchTask = Task { @MainActor in
                        guard await cancellableSleep(for: .milliseconds(300)), !Task.isCancelled else { return }
                        viewModel.search(query: requête)
                    }
                }

            if searchText.isEmpty {
                Button {
                    HapticFeedback.light()
                    viewModel.searchNearby()
                } label: {
                    Label(String(localized: "location.nearby", defaultValue: "Autour de moi", bundle: .main),
                          systemImage: "location.circle.fill")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)
                        .foregroundColor(Color(hex: accentColor))
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .frame(minHeight: 30)
                        .background(Capsule().fill(Color(hex: accentColor).opacity(MeeshyOpacity.light)))
                }
                .accessibilityHint(String(localized: "location.nearby.hint",
                                          defaultValue: "Liste les lieux nommés autour de vous",
                                          bundle: .main))
            } else {
                Button {
                    searchText = ""
                    viewModel.searchResults.removeAll()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.sm))
                        .foregroundStyle(Color.secondary)
                }
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.smPlus)
        // iOS 26 Liquid Glass — floating search bar over the map. The SDK
        // Compatibility wrapper owns the gating + the .ultraThinMaterial fallback.
        // Neutral (no tint): a search bar reads as OS chrome, not conversation content.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .shadow(color: .black.opacity(MeeshyOpacity.subtle), radius: 8, y: 2)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .overlay(alignment: .top) {
            if !viewModel.searchResults.isEmpty {
                searchResultsList
                    .padding(.top, 52)
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsList: some View {
        VStack(spacing: 0) {
            ForEach(viewModel.searchResults, id: \.self) { item in
                Button {
                    let coord = item.placemark.coordinate
                    viewModel.updateSelectedLocation(coord)
                    searched = true
                    // Après `updateSelectedLocation` (qui les remet à `nil`) :
                    // MapKit connaît déjà le nom et la catégorie POI du
                    // résultat choisi, inutile d'attendre le géocodage inverse.
                    viewModel.selectedName = item.name
                    // `pointOfInterestCategory` vit sur `MKMapItem` lui-même
                    // depuis iOS 13 — PAS sur `MKPlacemark`/`CLPlacemark`, qui
                    // ne l'expose pas.
                    viewModel.selectedCategory = item.pointOfInterestCategory?.rawValue
                    viewModel.reverseGeocode(coord)
                    mapTarget = MapTarget(
                        center: coord,
                        latitudinalMeters: 500,
                        longitudinalMeters: 500
                    )
                    searchText = item.name ?? ""
                    viewModel.searchResults.removeAll()
                } label: {
                    HStack(spacing: MeeshySpacing.smPlus) {
                        // Glyph constrained in a fixed 28×28 badge — a scalable
                        // font would overflow the frame. Kept fixed + hidden from
                        // VoiceOver (the result name carries the meaning; doctrine 86i).
                        Image(systemName: "mappin")
                            // Fixed: glyph centered in a fixed 28×28 circle badge;
                            // a scalable font would overflow the frame (doctrine 86i).
                            // Decorative — the place name carries the meaning.
                            .font(.system(size: 12, weight: .semibold))
                            // Accent ADAPTÉ et couleurs sémantiques : cette
                            // liste flotte sur le même verre que la carte du
                            // bas, au-dessus d'un fond de carte devenu
                            // imprévisible avec les styles satellite et
                            // hybride. Les tokens de thème y disparaissaient.
                            .foregroundStyle(Color(hex: onMap.accent))
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color(hex: onMap.accent).opacity(0.14)))
                            .accessibilityHidden(true)

                        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                            Text(item.name ?? String(localized: "location.unknown", defaultValue: "Lieu inconnu", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                                .foregroundStyle(Color.primary)
                                .lineLimit(1)

                            if let subtitle = item.placemark.title {
                                Text(subtitle)
                                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                                    .foregroundStyle(Color.secondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
                }
                if item != viewModel.searchResults.last {
                    Divider().padding(.leading, 50)
                }
            }
        }
        // Neutral Liquid Glass: a search-results dropdown floating over the map
        // is suggestion chrome, not content — kept neutral for the same reason
        // as the @mention autocomplete bar (no accent tint on chrome surfaces).
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .shadow(color: .black.opacity(MeeshyOpacity.light), radius: 10, y: 4)
        .padding(.horizontal, MeeshySpacing.lg)
    }

    // MARK: - Bottom Card

    private var bottomCard: some View {
        LocationPickerBottomCard(
            accentColor: accentColor,
            secondaryAccent: secondaryAccent,
            onMapAccent: onMap.accent,
            title: displayedTitle,
            isGeocoding: viewModel.isGeocoding,
            place: displayedPlace,
            precision: precision,
            onConfirm: { place in
                onSelect(place)
                HapticFeedback.success()
                close()
            }
        )
    }

    /// Ce qui PARTIRA, précision appliquée. La carte du bas montre exactement
    /// ce que le destinataire recevra — pas une valeur brute qui serait
    /// dégradée en silence au moment du tap.
    private var displayedPlace: SharedPlace? {
        LocationPickerOffer.place(viewModel.sharedPlace(at: precision),
                                  refused: viewModel.isLocationRefused, searched: searched)
    }

    private func close() {
        MeeshySheetClose.perform(host: hostClose, system: { dismiss() })
    }

    /// Nom ET adresse, dédupliqués. Ne montrer que l'adresse perdrait le nom du
    /// quartier aux niveaux grossiers (« Gros-Caillou » disparaîtrait derrière
    /// « Paris, France ») ; ne montrer que le nom perdrait l'adresse complète
    /// au niveau exact.
    private var displayedTitle: String? {
        guard let place = displayedPlace else { return nil }
        return LocationSharingLabels.placeTitle(name: place.name, address: place.address)
    }
}
