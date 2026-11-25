import Foundation
import SwiftUI
import Combine
import UIKit
import MeeshySDK

// MARK: - L'anneau des actes du jour, nourri (#17768)
//
// MIROIR de `useActsRing` (`apps/web/src/lib/view/use-acts-ring.ts`). L'anneau autour du bouton du menu se lit dans
// le CACHE du bloc `game`, sous la clé que le bandeau du joueur, Progression et le profil tiennent à jour
// (`EngagementPlayerBannerSource.cached()`). AUCUNE requête ne part pour lui : il relit le cache quand quelqu'un
// vient de l'écrire (`engagementSnapshotPersisted`) et au retour de l'app au premier plan.
//
// « Jeu masqué » : la loi rend `nil` — et le magasin ne relit rien tant que le jeu est masqué.
//
// La MÊME lecture sert le point du barreau « Ma Légende » (#18165) : l'Offrande prête et la Flamme en danger, lues par
// `GameAttention` (#17796) dans le même bloc. Le magasin du bandeau ne se revalide que pendant son ouverture ; celui-ci
// suit chaque écriture du cache, donc le point reste juste sur tout écran à menus.
//
// Et le widget « Ma Flamme » (#20562) : la même lecture publie la Flamme et les actes du jour dans le groupe d'app
// (`GameFlameWidgetFeed`), le widget ne fait ni requête ni calcul. « Jeu masqué » le vide. L'app ne le recharge que si ce
// qu'elle publie a changé. Un SEUL magasin publie au widget : celui de `GameFlameWidgetFeeder`, monté au-dessus des deux
// racines (iPhone et iPad, #20567) ; celui de l'anneau du menu ne publie rien.

@MainActor
final class MenuActsRingStore: ObservableObject {
    nonisolated deinit {}

    /// Les actes du jour lus dans le dernier bloc connu, MÊME périmé — `nil` sans bloc ou sans acte ouvert.
    @Published private(set) var ring: GameActsRing?
    /// Ce que le jeu signale au barreau « Ma Légende » — `.none` sans bloc, ou sous « Jeu masqué ».
    @Published private(set) var attention: GameAttention = .none

    private let source: PlayerBannerSourcing
    /// `nil` : ce magasin ne publie rien au widget (celui de l'anneau du menu).
    private let publishWidget: (@MainActor (WidgetGameFlameState) -> Void)?
    /// La dernière publication au widget : une lecture identique ne le recharge pas.
    private var publishedWidget: WidgetGameFlameState?
    /// « Jeu masqué » tel que la dernière activation l'a dit : sous lui, aucune relecture (retour au premier plan,
    /// écriture du cache) ne rallume l'anneau, le point ni le widget.
    private var hidden = false
    private var subscriptions = Set<AnyCancellable>()
    private var subscribed = false
    /// La relecture en cours : une nouvelle écriture du cache la remplace, jamais deux lectures en parallèle.
    private var pendingRead: Task<Void, Never>?

    init(source: PlayerBannerSourcing = EngagementPlayerBannerSource(),
         publishWidget: (@MainActor (WidgetGameFlameState) -> Void)? = nil) {
        self.source = source
        self.publishWidget = publishWidget
    }

    /// Le magasin qui nourrit le widget « Ma Flamme » dans le groupe d'app.
    static func widgetFeed(source: PlayerBannerSourcing = EngagementPlayerBannerSource()) -> MenuActsRingStore {
        MenuActsRingStore(source: source, publishWidget: { WidgetDataManager.shared.publishGameFlame($0) })
    }

    /// Lit le cache, puis suit ses écritures. Idempotent : les abonnements ne se posent qu'une fois.
    func activate(hidden: Bool) async {
        self.hidden = hidden
        guard !hidden else {
            ring = nil
            attention = .none
            publish(.hidden)
            return
        }
        subscribeOnce()
        await readCache()
    }

    /// Le dernier bloc connu ; un cache vide ne retire rien de ce qui est montré.
    func readCache() async {
        guard !hidden, let game = await source.cached(), !hidden else { return }
        let next = GameActsRing.of(game, hidden: false)
        if next != ring { ring = next }
        let signaled = GameAttention.of(game, hidden: false)
        if signaled != attention { attention = signaled }
        publish(GameFlameWidgetFeed.state(of: game, hidden: false))
    }

    private func publish(_ widget: WidgetGameFlameState) {
        guard let publishWidget, widget != publishedWidget else { return }
        publishedWidget = widget
        publishWidget(widget)
    }

    /// Une écriture du cache vient d'être annoncée : relire, en remplaçant la relecture précédente.
    private func scheduleRead() {
        pendingRead?.cancel()
        pendingRead = Task { [weak self] in await self?.readCache() }
    }

    private func subscribeOnce() {
        guard !subscribed else { return }
        subscribed = true
        // Le saut vers le fil principal PRÉCÈDE le sink : sa fermeture est isolée au MainActor, et le runtime vérifie
        // l'exécuteur à son entrée (cf. `AgeGate`).
        NotificationCenter.default.publisher(for: .engagementSnapshotPersisted)
            .merge(with: NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleRead() }
            .store(in: &subscriptions)
    }
}

// MARK: - Le widget « Ma Flamme » nourri sur iPhone comme sur iPad (#20567)
//
// Une feuille sans taille ni rendu, montée par `AdaptiveRootView` au-dessus des deux racines : le widget suit la même
// lecture du cache et la même loi (`GameFlameWidgetFeed`) quelle que soit la racine montée. Elle observe « Jeu masqué »
// pour son compte, si bien que la racine ne se réévalue pas quand le réglage change.
struct GameFlameWidgetFeeder: View {
    @StateObject private var store = MenuActsRingStore.widgetFeed()
    @ObservedObject private var gamePrefs: GameDevicePrefsStore = .current()

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .task(id: gamePrefs.prefs.hidden) { @MainActor in
                await store.activate(hidden: gamePrefs.prefs.hidden)
            }
    }
}
