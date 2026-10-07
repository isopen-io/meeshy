import SwiftUI
import Combine
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - La bannière du joueur, orchestrée (#9494, conception XIII.1)
//
// La brique (`PlayerBannerView`, MeeshyUI) dessine ; ce fichier la fait VIVRE dans le bandeau du haut :
//
//  - d'où vient le bloc `game` (CACHE D'ABORD : la progression se lit sous la même clé que Progression et le profil,
//    jamais un squelette — un cache vide ne peint RIEN jusqu'à la réponse), et quand il se revalide en silence ;
//  - quand la bannière a la place (`PlayerBannerPlacement`) et comment elle entre et sort (le mouvement des barres
//    du haut, `TopChromeBarMotion` : elle glisse, sous « Réduire les animations » elle apparaît sans bouger) ;
//  - quand elle PARAÎT (#9536) : à l'ouverture de l'app seulement (`GamePlayerBannerOpening`) — trente secondes, puis
//    elle s'en va LENTEMENT en remontant (une seconde ; sous « Réduire les animations », un fondu simple) ;
//  - le reflet qui traverse l'anneau quand un niveau est franchi ;
//  - ce qu'elle remonte à la bande de la barre d'état : sa couleur d'aplat.
//
// « Jeu masqué » : aucune bannière ET aucune requête. Le réglage vit sur le COMPTE (`GET /me/game/privacy`, relu
// avant le jeu) ; l'appareil n'en garde qu'une copie, qui sert hors ligne.

extension Notification.Name {
    /// Progression vient d'écrire un instantané dans le cache : la bannière le relit, sans réseau.
    static let engagementSnapshotPersisted = Notification.Name("meeshy.engagement.snapshotPersisted")
}

// MARK: - La source

/// D'où la bannière lit le bloc `game`.
protocol PlayerBannerSourcing: Sendable {
    /// Le dernier bloc connu, MÊME périmé : un cache expiré se peint, la revalidation le corrige.
    func cached() async -> GameBlock?
    /// Le bloc servi par le réseau, écrit dans le cache que Progression lit ; `nil` hors ligne ou sur un refus.
    func fetch() async -> GameBlock?
}

struct EngagementPlayerBannerSource: PlayerBannerSourcing {
    var userId: String = AuthManager.shared.currentUser?.id ?? ""
    var service: EngagementProgressProviding = EngagementProgressService.shared

    private var key: String { "engagement:\(userId)" }

    func cached() async -> GameBlock? {
        let store = await CacheCoordinator.shared.engagementProgress
        return await store.loadIgnoringExpiry(for: key)?.items.first?.game
    }

    func fetch() async -> GameBlock? {
        guard let snapshot = try? await service.fetchProgress() else { return nil }
        let store = await CacheCoordinator.shared.engagementProgress
        try? await store.save([snapshot], for: key)
        return snapshot.game
    }
}

// MARK: - Les réglages servis

/// Ce que le COMPTE dit de « Jeu masqué » (`GET /me/game/privacy`) : le serveur est maître, l'appareil n'en garde
/// qu'une copie. Le web relit les réglages là où la bannière se monte (`useGameSettings`) ; sans cette lecture, un
/// jeu masqué depuis un autre appareil — ou avant une réinstallation — gardait ici sa bannière et ses requêtes.
@MainActor
protocol PlayerBannerSettingsReading {
    /// Relit les réglages, les pose sur l'appareil, et rend `gameHidden` ; `nil` hors ligne ou sur un refus.
    func servedHidden() async -> Bool?
}

struct ServedGameSettingsReader: PlayerBannerSettingsReading {
    func servedHidden() async -> Bool? {
        await GameSettingsSync().refresh()?.gameHidden
    }
}

// MARK: - Le magasin

/// Ce que la bannière montre : le dernier bloc connu, dérivé en `GamePlayerBanner`. Cache d'abord, revalidation
/// silencieuse au plus une fois par `minimumInterval` — au retour sur un écran principal, au retour de l'app au
/// premier plan, à l'arrivée d'une notification de palier ; Progression, qui écrit le cache, le dit par
/// `engagementSnapshotPersisted`.
@MainActor
final class PlayerBannerStore: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var banner: GamePlayerBanner?
    /// L'ouverture de l'app tient encore le bandeau (#9536) : vrai les trente premières secondes, et à chaque retour
    /// après une vraie absence. Passé ce délai, la bannière s'efface et ne revient qu'à la prochaine ouverture.
    @Published private(set) var lingering = true
    /// Compte les ouvertures : la minuterie de l'hôte repart quand il change.
    @Published private(set) var openingGeneration = 0

    /// Les réglages servis se relisent au plus toutes les cinq minutes — la cadence du web (`staleTime`).
    static let settingsInterval: TimeInterval = 300

    private let source: PlayerBannerSourcing
    private let settings: PlayerBannerSettingsReading
    private let minimumInterval: TimeInterval
    private let now: () -> Date
    private var opening: GamePlayerBannerOpening
    private var lastFetch: Date?
    private var lastSettingsRead: Date?
    private var fetching = false
    /// « Jeu masqué » : ni lecture du réseau ni nouvelle lecture du cache tant que le jeu est masqué.
    private var suspended = false
    private var subscriptions = Set<AnyCancellable>()

    init(source: PlayerBannerSourcing = EngagementPlayerBannerSource(),
         settings: PlayerBannerSettingsReading = ServedGameSettingsReader(), minimumInterval: TimeInterval = 45,
         now: @escaping () -> Date = { Date() }) {
        self.source = source
        self.settings = settings
        self.minimumInterval = minimumInterval
        self.now = now
        self.opening = GamePlayerBannerOpening(openedAt: now())
    }

    /// Ce qu'il reste à la bannière avant de s'en aller ; l'hôte dort ce temps-là.
    var openingRemaining: TimeInterval { opening.remaining(at: now()) }

    /// La minuterie a sonné : si l'ouverture est bien terminée, la bannière n'a plus lieu d'être.
    func closeOpeningIfDue() {
        guard lingering, !opening.isOpen(at: now()) else { return }
        lingering = false
    }

    /// L'app passe à l'arrière-plan : on retient depuis quand.
    func appWentAway() {
        opening.appWentAway(at: now())
    }

    /// L'app revient : après une vraie absence, le bandeau se rouvre et relit le jeu. Sinon rien ne se rouvre — et
    /// si ses trente secondes sont passées pendant l'absence, il s'en va tout de suite : le sommeil de la minuterie
    /// ne compte pas le temps où l'appareil dort, elle sonnerait en retard.
    func appCameBack() async {
        if opening.appCameBack(at: now()) {
            lingering = true
            openingGeneration += 1
            await revalidate(force: true)
        } else {
            closeOpeningIfDue()
            await revalidate()
        }
    }

    func setSuspended(_ suspended: Bool) {
        self.suspended = suspended
    }

    /// Cache d'abord, puis revalidation. Idempotent : les abonnements ne se posent qu'une fois.
    func activate() async {
        guard !suspended else { return }
        subscribeOnce()
        await readCache()
        await revalidate()
    }

    func readCache() async {
        guard !suspended, let game = await source.cached() else { return }
        adopt(game)
    }

    /// Relit le réseau en silence. Un échec ne retire RIEN (la bannière garde ce qu'elle montre) et n'est pas
    /// retenté avant `minimumInterval` : une coupure ne fait pas marteler la passerelle.
    ///
    /// Les réglages servis passent AVANT le jeu : un compte masqué ne demande pas son bloc `game`, et un cache vide
    /// ne peint rien qu'une réponse viendrait retirer l'instant d'après.
    func revalidate(force: Bool = false) async {
        guard !fetching, !suspended, lingering else { return }
        if !force, let lastFetch, now().timeIntervalSince(lastFetch) < minimumInterval { return }
        fetching = true
        defer { fetching = false }
        lastFetch = now()
        if await accountHidesTheGame() { return }
        guard let game = await source.fetch() else { return }
        adopt(game)
    }

    /// « Jeu masqué » servi par le compte : la bannière part et le magasin se tait. Une lecture en panne ne
    /// change rien — la copie de l'appareil reste le dernier état connu.
    private func accountHidesTheGame() async -> Bool {
        if let lastSettingsRead, now().timeIntervalSince(lastSettingsRead) < Self.settingsInterval { return false }
        lastSettingsRead = now()
        guard await settings.servedHidden() == true else { return false }
        suspended = true
        banner = nil
        return true
    }

    /// `GamePlayerBanner.make` décide : un joueur qui n'a rien fait n'a pas de bandeau (`nil`), et un bandeau qui
    /// n'a plus rien à dire (jeu remis à zéro) s'efface.
    private func adopt(_ game: GameBlock) {
        let next = GamePlayerBanner.make(game: game)
        if next != banner { banner = next }
    }

    private var subscribed = false

    private func subscribeOnce() {
        guard !subscribed else { return }
        subscribed = true
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                Task { @MainActor in self?.appWentAway() }
            }
            .store(in: &subscriptions)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                Task { @MainActor in await self?.appCameBack() }
            }
            .store(in: &subscriptions)
        NotificationCenter.default.publisher(for: .engagementSnapshotPersisted)
            .sink { [weak self] _ in
                Task { @MainActor in await self?.readCache() }
            }
            .store(in: &subscriptions)
        NotificationToastManager.shared.newNotificationReceived
            .filter { EngagementReveal.announcingTypes.contains($0.notificationType) }
            .sink { [weak self] _ in
                Task { @MainActor in await self?.revalidate(force: true) }
            }
            .store(in: &subscriptions)
    }
}

// MARK: - L'emplacement dans le bandeau du haut

/// La bannière, posée dans la pile du haut de `CallPresentationLayer` après la pilule d'appel et le mini-lecteur.
///
/// Elle suit le patron du mini-lecteur : une ANCRE de hauteur nulle toujours présente (un conteneur sans enfant
/// n'installe aucun modificateur), et ce qui est À L'ÉCRAN (`presented`) ne rejoint la cible que sous le ressort des
/// barres du haut. Une `.animation(value:)` posée sur la barre n'anime ni sa sortie ni l'espace qu'elle libère :
/// seul un changement d'état fait sous `withAnimation` emporte les deux (#9048).
///
/// L'encart haut vient de la pile (`TopChromeInsetKey`, mesuré par préférence) — jamais lu sur la fenêtre depuis
/// l'intérieur de cette fenêtre : un cycle AttributeGraph figerait la vue (#8772).
@MainActor
struct PlayerBannerSlot: View {
    /// L'écran courant porte la bannière (`PlayerBannerPlacement`).
    let isHosted: Bool
    /// Ni un appel ni un audio n'occupe le haut.
    let isFree: Bool
    let topInset: CGFloat
    let onTap: () -> Void
    /// La couleur d'aplat de la bannière À L'ÉCRAN, ou `nil` : la bande de la barre d'état la reprend.
    let onSurfaceChange: (Color?) -> Void

    @StateObject private var store: PlayerBannerStore
    @ObservedObject private var prefs: GameDevicePrefsStore
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var presented: GamePlayerBanner?
    @State private var sheen: Double = 0

    init(isHosted: Bool, isFree: Bool, topInset: CGFloat, onTap: @escaping () -> Void,
         onSurfaceChange: @escaping (Color?) -> Void, store: PlayerBannerStore? = nil,
         prefs: GameDevicePrefsStore = GameDevicePrefsStore.current()) {
        self.isHosted = isHosted
        self.isFree = isFree
        self.topInset = topInset
        self.onTap = onTap
        self.onSurfaceChange = onSurfaceChange
        self._store = StateObject(wrappedValue: store ?? PlayerBannerStore())
        self._prefs = ObservedObject(wrappedValue: prefs)
    }

    private var isDark: Bool { colorScheme == .dark }

    /// Ce qui relance la lecture : l'écran qui porte (ou non) la bannière, et le réglage « Jeu masqué ».
    private struct Activation: Equatable {
        let hidden: Bool
        let hosted: Bool
    }

    /// Ce que la bannière DOIT afficher maintenant ; `presented` l'y rejoint sous le ressort — ou, à la fin de
    /// l'ouverture, sous la sortie lente (#9536).
    private var target: GamePlayerBanner? {
        PlayerBannerPlacement.shows(hosted: isHosted, free: isFree, hidden: prefs.prefs.hidden, lingering: store.lingering)
            ? store.banner : nil
    }

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
            if let banner = presented {
                bar(banner)
                    .transition(TopChromeBarMotion.transition(isLastBar: true, reduceMotion: reduceMotion, safeAreaTop: topInset))
            }
        }
        .zIndex(TopChromeBarMotion.layer(isLastBar: true, isCall: false))
        .adaptiveOnChange(of: target) { _, newValue in present(newValue) }
        // L'ouverture de l'app tient le bandeau trente secondes, puis il s'en va (#9536). La minuterie repart à chaque
        // nouvelle ouverture (retour après une vraie absence).
        .task(id: store.openingGeneration) { @MainActor in
            let remaining = store.openingRemaining
            if remaining > 0 { try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000)) }
            guard !Task.isCancelled else { return }
            store.closeOpeningIfDue()
        }
        .adaptiveOnChange(of: colorScheme) { _, _ in onSurfaceChange(presented.map { surface(of: $0) }) }
        // Rien ne se lit tant que l'écran ne porte pas la bannière : un fil, Progression ou une visionneuse n'ont
        // aucune raison de réveiller le cache ni le réseau. Le retour sur un écran principal relit le cache
        // (Progression a pu l'écrire) puis revalide, sans bruit. « Jeu masqué » : ni bannière ni requête — le
        // réglage rebascule la tâche.
        .task(id: Activation(hidden: prefs.prefs.hidden, hosted: isHosted)) { @MainActor in
            let hidden = prefs.prefs.hidden
            store.setSuspended(hidden)
            guard isHosted, !hidden else { return }
            await store.activate()
            present(target)
        }
        .onAppear { present(target) }
    }

    private func surface(of banner: GamePlayerBanner) -> Color {
        PlayerBannerStyle.surface(tier: banner.tier, isDark: isDark)
    }

    /// Fait rejoindre l'écran à la cible, sous le ressort des barres du haut, et remonte la couleur d'aplat à la
    /// bande dans la MÊME transaction : la bande part et arrive avec sa bannière. Un niveau franchi fait passer le reflet.
    private func present(_ target: GamePlayerBanner?) {
        guard target != presented else { return }
        let reachedANewLevel = presented.map { previous in (target?.level ?? 0) > previous.level } ?? false
        withAnimation(PlayerBannerMotion.animation(leaving: target == nil, opening: store.lingering, reduceMotion: reduceMotion)) {
            presented = target
            onSurfaceChange(target.map { surface(of: $0) })
        }
        if reachedANewLevel { playSheen() }
    }

    /// Le reflet traverse l'anneau une seule fois ; sous « Réduire les animations » il ne joue pas.
    private func playSheen() {
        guard !reduceMotion else { return }
        sheen = 0
        withAnimation(.easeInOut(duration: 0.9)) { sheen = 1 }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            sheen = 0
        }
    }

    private func bar(_ banner: GamePlayerBanner) -> some View {
        let label = PlayerBannerCopy.accessibilityLabel(for: banner)
        return Button {
            HapticFeedback.light()
            onTap()
        } label: {
            PlayerBannerView(
                model: banner, texts: PlayerBannerCopy.texts(for: banner),
                palette: PlayerBannerStyle.palette(tier: banner.tier, isDark: isDark),
                sheen: sheen, backdrop: AuthManager.shared.currentUser?.banner, accessibilityLabel: label
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(GameText.bannerHint)
        .accessibilityIdentifier("game.player_banner")
    }
}
