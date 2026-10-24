import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Visual style of the leading status dot in a `SyncPillEntry`. Maps to
/// concrete `MeeshyColors` tokens at render time — kept as an opaque enum
/// here so `SyncPillEntry` stays `Equatable`/`Sendable` without depending
/// on SwiftUI `Color` / `LinearGradient` types (which are not stable
/// `Equatable` across iOS versions).
enum SyncPillDotStyle: Equatable, Sendable {
    case brand     // Indigo brand gradient — default for "in-flight" ops
    case warning   // Amber — used for offline / transient reconnection states
    case success   // Green — used for the transient "En ligne" entry that
                   // appears for ~4s after coming back from offline
    case error     // Red — used for permanently failed ops in the queue
}

/// One row of information surfaced by the rotating sync pill. Built by the
/// orchestrator (`ConnectionBanner`) from a heterogenous set of sources:
/// pending outbox items (with concrete `source` for navigation),
/// connection states (offline / disconnected / syncing — no source,
/// label is the state name).
///
/// The view layer (`SyncPill`) is agnostic to the entry's origin — it
/// just rotates through the array, renders the label, and forwards taps
/// when `source != nil`.
/// Métriques partagées de la pastille — la taille qu'elle prend. Sa POSITION
/// ne vit pas ici : c'est `SyncPillPlacement` qui la décide, pour tous ses
/// points de montage.
///
/// **Deux tailles, et la frappe seule ouvre la grande.** La grande taille
/// n'est affichée QUE lorsque des amis écrivent dans les conversations
/// communes. Au repos — envoi, synchronisation, hors ligne — la pastille
/// garde sa taille compacte (22 pt) ; une entrée de frappe lui rend
/// l'agrandissement ×1,6.
nonisolated struct SyncPillMetrics: Equatable, Sendable {
    /// Hauteur rendue de la capsule, à la taille de texte par défaut : ligne de
    /// `labelSize` + `verticalPadding` des deux côtés ; Dynamic Type la fait
    /// grandir au-delà.
    let height: CGFloat
    let labelSize: CGFloat
    let counterSize: CGFloat
    let glyphSize: CGFloat
    let dotDiameter: CGFloat
    let verticalPadding: CGFloat
    let horizontalPadding: CGFloat
    let itemSpacing: CGFloat
    let maxTextWidth: CGFloat

    /// La pastille compacte (22 pt).
    static let compact = SyncPillMetrics(
        height: 22,
        labelSize: MeeshyFont.footnoteSize,
        counterSize: MeeshyFont.captionSize,
        glyphSize: MeeshyFont.footnoteSize,
        dotDiameter: 6,
        verticalPadding: MeeshySpacing.xs,
        horizontalPadding: MeeshySpacing.smPlus,
        itemSpacing: MeeshySpacing.xsPlus,
        maxTextWidth: 160
    )

    /// L'agrandissement ×1,6, réservé à
    /// la frappe.
    static let typing = SyncPillMetrics(
        height: 35,
        labelSize: MeeshyFont.bodySize,
        counterSize: MeeshyFont.labelSize,
        glyphSize: MeeshyFont.calloutSize,
        dotDiameter: 10,
        verticalPadding: MeeshySpacing.sm,
        horizontalPadding: MeeshySpacing.lg,
        itemSpacing: MeeshySpacing.sm,
        maxTextWidth: 220
    )

    /// La grande taille tant qu'au moins une entrée dit qu'un contact écrit
    /// (`typing.<conversationId>`, posée par `ConnectionBanner.typingEntries`),
    /// la compacte sinon.
    static func `for`(entries: [SyncPillEntry]) -> SyncPillMetrics {
        let someoneTypes = entries.contains {
            TypingAnnouncementLaw.conversationId(fromEntryId: $0.id) != nil
        }
        return someoneTypes ? .typing : .compact
    }
}

struct SyncPillEntry: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    /// SFSymbol name shown to the left of the label. Optional — when nil
    /// the leading slot is filled with the dotStyle's pulsing circle.
    let iconName: String?
    let dotStyle: SyncPillDotStyle
    /// Navigation target when the user taps this entry. `nil` for pure
    /// status rows (offline / reconnecting / syncing) — those swallow the
    /// tap as a manual advance instead.
    let source: OutboxUIItem.Source?
    /// Whether the trailing animated ellipsis ("…") is shown. `true` only for
    /// entries representing work actually in flight (sending, syncing,
    /// reconnecting); `false` for terminal / static states (offline, online,
    /// permanently failed) so a finished operation never reads as ongoing.
    let showsActivityDots: Bool
    /// **L'identifiant de la ligne outbox à RELANCER** quand cette entrée dit
    /// un échec définitif. `nil` partout ailleurs.
    ///
    /// Il vit ICI plutôt que dans `source` parce que ce n'est pas une
    /// destination : relancer une publication ne mène nulle part, ça agit sur
    /// place. Et il vit sur l'ENTRÉE plutôt que chez les deux racines parce que
    /// `RootView` et `iPadRootView` montent des arbres différents — un geste
    /// écrit deux fois diverge, et la divergence ne rougit nulle part
    /// (« Publier un post »). La pastille est le seul étage
    /// que les deux racines partagent.
    let retryOutboxId: String?

    init(
        id: String,
        label: String,
        iconName: String?,
        dotStyle: SyncPillDotStyle,
        source: OutboxUIItem.Source?,
        showsActivityDots: Bool = true,
        retryOutboxId: String? = nil
    ) {
        self.id = id
        self.label = label
        self.iconName = iconName
        self.dotStyle = dotStyle
        self.source = source
        self.showsActivityDots = showsActivityDots
        self.retryOutboxId = retryOutboxId
    }

    /// **Ce qu'un doigt sur CETTE entrée déclenche** — une seule question, une
    /// seule réponse, hors de la vue pour être jouable sans écran.
    ///
    /// L'ordre n'est pas arbitraire : sur une ligne définitivement échouée,
    /// RELANCER est ce que le doigt veut. Naviguer vers « l'emplacement de
    /// l'opération » n'a d'ailleurs pas de sens pour une publication — le post
    /// n'existe pas encore, et c'est bien pour ça que `mapCreatePost` rend
    /// `.unknown`.
    enum TapOutcome: Equatable {
        case retry(outboxId: String)
        case navigate(OutboxUIItem.Source)
        /// Ligne de statut pure (hors ligne, reconnexion, synchronisation) :
        /// le tap fait juste avancer la rotation.
        case advance
    }

    var tapOutcome: TapOutcome {
        if let retryOutboxId { return .retry(outboxId: retryOutboxId) }
        if let source { return .navigate(source) }
        return .advance
    }
}

/// **Les contextes auxquels la pastille CÈDE, en un seul endroit.**
///
/// La règle tient en UNE écriture : trois écritures d'une même question
/// (le viewer de story dans la bannière, les réels chez l'hôte iPhone,
/// l'iPad) sont trois occasions de diverger, et une garde des réels absente
/// de l'iPad ne se distinguerait pas d'un oubli.
///
/// Elle applique la doctrine : **un contenu qui prend le haut de
/// l'écran est un contexte à lui, et le chrome lui cède.** Une notification
/// in-app en est un — et l'ordre de rendu ne peut de toute façon pas les
/// départager, la pastille étant un `.overlay` appliqué APRÈS le `ZStack` qui
/// porte le toast : aucun `zIndex` interne ne pourrait la passer.
nonisolated enum SyncPillVisibility {
    static func isVisible(storyViewerPresenting: Bool,
                          inAppNoticePresenting: Bool) -> Bool {
        #if DEBUG
        // Vitrine : le serveur injoignable est voulu, son bandeau hors champ.
        if VitrineLaunch.isActive { return false }
        #endif
        return !storyViewerPresenting && !inAppNoticePresenting
    }
}

/// Inline rotating pill that lists every signal the user might care about
/// from the top of the screen — connection state, queued offline ops, and
/// stuck inflight work — in a single discreet chip. Matches the legacy
/// `ConnectionBanner.syncingPill` chrome (height ~22pt, font 11/medium,
/// capsule background with subtle tint).
///
/// Behaviour highlights:
/// - Rotates one entry per 2.7 s; pauses 5 s on manual tap.
/// - Auto-hides after `SyncPillRotator.maxCycles` (3) complete passes.
/// - Tap on an entry with `retryOutboxId != nil` invokes `onRetry(id)` —
///   une publication définitivement échouée se RELANCE d'un doigt.
/// - Tap on an entry with `source != nil` invokes `onTap(source)` so the
///   caller can route to the conversation / post / story where the
///   operation is taking place.
///
/// ## Où elle s'affiche — et où elle ne s'affiche PAS
///
/// **La pastille ne traverse pas une présentation modale.** Une `sheet` ou un
/// `fullScreenCover` est posé par le système AU-DESSUS de la vue présentante,
/// overlays compris : tant qu'une feuille est ouverte, la pastille existe, se
/// met à jour, et personne ne la voit. Y échapper demanderait une `UIWindow`
/// dédiée — scène, rotation, multi-fenêtres iPad, hit-testing, ordre VoiceOver.
///
/// Ce coût permanent n'est pas payé, et la raison est un FAIT sur ce que cette
/// pastille porte : **toutes ses entrées sont des ÉTATS, jamais des
/// événements** — hors ligne, reconnexion, synchronisation, file en attente,
/// quelqu'un qui écrit. Aucune n'expire sans avoir été vue (`entries` est
/// recalculée à chaque rendu, donc à la fermeture de la feuille la pastille dit
/// la vérité du moment, jamais un retard), et aucune n'est ACTIONNABLE depuis
/// une feuille — on n'y répond pas à une frappe, et la relance d'une
/// publication échouée, seule entrée ACTIONNABLE, attend sans
/// s'évaporer : la ligne reste `.exhausted` jusqu'à ce qu'on la touche, donc
/// rien n'est perdu à la voir une feuille plus tard.
///
/// Ce n'est donc pas « ne rien faire » : c'est la MÊME règle que ses deux
/// points de montage appliquent déjà en l'éteignant sous le viewer de story
/// (`isStoryViewerPresenting`) et sous les réels (`reelsPresenter.launch`). Un
/// contenu qui prend tout l'écran est un contexte à lui, et le chrome lui cède.
/// Une feuille modale en est un.
///
/// Condition de levée : si une entrée FUTURE devenait un ÉVÉNEMENT — quelque
/// chose qui passe et ne revient pas — l'arbitrage change, et c'est l'option
/// `UIWindow` qu'il faudrait alors peser.
struct SyncPill: View {
    let entries: [SyncPillEntry]
    /// Invoked when the user taps the pill and the currently visible
    /// entry has a non-nil `source`. The caller is expected to push onto
    /// the navigation stack (`Router.push(.conversation/.postDetail/...)`).
    let onTap: ((OutboxUIItem.Source) -> Void)?
    /// Invoked when the user taps an entry carrying a `retryOutboxId` — a
    /// publication or a send that has definitively failed. Prioritaire sur
    /// `onTap` : sur une ligne épuisée, RELANCER est ce que le doigt veut, pas
    /// naviguer vers un contenu qui n'existe pas encore.
    let onRetry: ((String) -> Void)?

    @StateObject private var rotator = SyncPillRotator()
    @Environment(\.colorScheme) private var colorScheme
    // The status dot pulses in the app's persistent chrome — motion the user
    // cannot dismiss. Reduce Motion must reach it. (The pulse is driven by
    // `dotTimer`, not by a `repeatForever` curve — see `pulseCurve`.)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dotPhase: Int = 0
    // `@State` (not `let`) — a plain stored `let` re-evaluates its initializer
    // on every reconstruction of this View value (every unrelated re-render
    // of the parent ConnectionBanner), handing `.onReceive` a brand-new,
    // not-yet-ticked Timer.publish().autoconnect() each time. If those
    // reconstructions happen faster than the 0.5s interval, the publisher
    // never survives long enough to fire and the dot pulse/ellipsis freeze.
    // `@State`'s initial-value expression runs once per view identity, so the
    // same connected publisher instance is preserved across re-renders.
    @State private var dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    /// Largeur mesurée du `label` SEUL (jamais avec ses points d’activité — voir
    /// doc `SyncPillMarquee`). Alimentée par la mesure `GeometryReader` en
    /// fond du `Text` du label.
    @State private var measuredLabelWidth: CGFloat = 0
    /// Temps de défilement déjà CUMULÉ avant le dernier démarrage de l'horloge.
    /// Le décalage affiché est une loi de ce temps (`SyncPillMarquee.offset`),
    /// jamais un `@State` incrémenté à chaque tic : l'horloge ne réévalue que
    /// la ligne qui défile, et ne s'abonne que tant que le texte DÉFILE.
    @State private var marqueeBase: TimeInterval = 0
    /// Instant du dernier (re)démarrage de l'horloge du marquee.
    @State private var marqueeRunStart = Date()
    /// Bascule par appui long sur la pill — gèle À LA FOIS la rotation
    /// (`rotator.setAutoRotation(false)`) et le défilement du marquee.
    /// Mécanisme obligatoire (WCAG 2.2.2 Pause/Stop/Hide, niveau A) — le
    /// respect de `accessibilityReduceMotion` seul NE SUFFIT PAS comme
    /// justificatif de conformité pour cette SC (elle ne couvre que la
    /// 2.3.3). Un second appui long relance.
    @State private var isPausedByUser = false
    // MARK: - Activité récente : afficher, accentuer, s'effacer

    /// Identifiants d'entrées déjà vus — sert à détecter l'arrivée d'une
    /// entrée NEUVE (un nouveau typing, un nouvel envoi) pour déclencher
    /// l'accentuation.
    @State private var seenEntryIDs: Set<String> = []
    /// La pastille est-elle visible ? Pilotée par l'activité récente : une
    /// nouvelle entrée l'affiche, un silence de `idleHideDelay` l'efface —
    /// sauf état PERSISTANT (hors-ligne, échec), qui la garde affichée.
    @State private var isVisible: Bool = false
    /// Effacement différé (one-shot, annulable) — réarmé à chaque nouvelle
    /// entrée. Borné, jamais `repeatForever`.
    @State private var hideSettle = Debouncer()

    /// **La pastille est-elle en train d'enfler ?**
    ///
    /// Un état à DEUX valeurs, et le retour au repos est programmé dans le même
    /// geste que la montée : le défaut à éviter n'est pas l'amplitude mais une
    /// pastille qui reste grosse quand une nouvelle entrée arrive.
    /// `TypingAnnouncementLaw.scale(emphasizing:)` tient
    /// l'amplitude, et `emphasisTotalDuration` le retour — les deux sortent de
    /// la même loi pour qu'ils ne puissent pas diverger.
    @State private var isEmphasizing = false
    /// Retour au repos différé (one-shot, annulable). Annulable parce qu'une
    /// SECONDE conversation qui se met à écrire pendant l'accent doit relancer
    /// la fenêtre entière, pas la laisser expirer sur l'ancien minuteur.
    @State private var emphasisSettle = Debouncer()

    /// Délai sans NOUVELLE entrée après lequel la pastille s'efface — évite
    /// l'affichage permanent au repos. Réarmé à chaque arrivée.
    private static let idleHideDelay: TimeInterval = 6.0

    init(
        entries: [SyncPillEntry],
        onTap: ((OutboxUIItem.Source) -> Void)? = nil,
        onRetry: ((String) -> Void)? = nil
    ) {
        self.entries = entries
        self.onTap = onTap
        self.onRetry = onRetry
    }

    private var isDark: Bool { colorScheme == .dark }

    /// Compacte au repos, grande pendant une frappe.
    private var metrics: SyncPillMetrics { .for(entries: entries) }

    /// Entry shown right now. Clamped against `entries.count` so a list
    /// that shrinks between two SwiftUI updates doesn't crash the subscript.
    private var visibleEntry: SyncPillEntry? {
        guard !entries.isEmpty else { return nil }
        let i = min(rotator.currentIndex, entries.count - 1)
        return entries[i]
    }

    /// Pulsing alpha on the leading status dot. Matches the legacy chrome
    /// (0.5 s tick, 50 % duty cycle).
    /// Full strength when motion is reduced: the pulse's low phase (0.4) would
    /// freeze the dot into something that reads as inactive, and the dot is the
    /// only thing carrying "syncing" at a glance.
    private var pulseOpacity: Double { reduceMotion ? 1.0 : (dotPhase % 2 == 0 ? 1.0 : 0.4) }


    var body: some View {
        Group {
            if !entries.isEmpty && isVisible {
                pillContent
                    .transition(.opacity.combined(with: .scale(scale: 0.85)))
            } else {
                EmptyView()
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: isVisible)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: entries.isEmpty)
        .onAppear {
            rotator.setItemCount(entries.count)
            handleEntriesChange()
        }
        // Observe l'ENSEMBLE des identifiants (pas les libellés) : une frappe
        // continue garde le même id `typing.<conv>` — elle ne ré-accentue pas ;
        // seule une entrée NEUVE (nouvelle conversation qui écrit, nouvel
        // envoi) déclenche l'accent.
        .adaptiveOnChange(of: entries.map(\.id)) { _, _ in
            rotator.setItemCount(entries.count)
            handleEntriesChange()
        }
    }

    // MARK: - Pilotage de la visibilité et de l'accent

    /// Une entrée PERSISTANTE (hors-ligne, reconnexion, échec) garde la
    /// pastille affichée : l'utilisateur doit la voir tant que l'état dure.
    /// Les entrées transitoires (synchro, frappe, envoi) s'effacent au repos.
    private var entriesHavePersistentState: Bool {
        entries.contains { $0.dotStyle == .warning || $0.dotStyle == .error }
    }

    private func handleEntriesChange() {
        let currentIDs = Set(entries.map(\.id))
        let newIDs = currentIDs.subtracting(seenEntryIDs)
        seenEntryIDs = currentIDs

        if entries.isEmpty {
            hideSettle.cancel()
            isVisible = false
            return
        }

        // La pastille porte l'annonce de frappe, et elle enfle pour
        // le dire. L'île se tait pour la frappe : elle sert encore la qualité
        // d'appel dégradée, montée par `CallView`.
        if !newIDs.isEmpty { isVisible = true }
        emphasizeIfTypingStarted(among: entries.filter { newIDs.contains($0.id) })
        scheduleAutoHide()
    }

    /// **L'accent du début de frappe** : la pastille enfle, tient, puis
    /// revient à sa taille.
    ///
    /// Ne se joue que sur une entrée de frappe NEUVE — une frappe qui continue
    /// garde son identifiant `typing.<conv>` et ne repasse donc pas ici. C'est
    /// `TypingAnnouncementLaw` qui tranche laquelle, pour que « seule une
    /// frappe s'annonce » reste jouable sans écran.
    private func emphasizeIfTypingStarted(among newEntries: [SyncPillEntry]) {
        guard !reduceMotion else { return }
        guard TypingAnnouncementLaw.announcement(among: newEntries) != nil else { return }

        emphasisSettle.cancel()
        withAnimation(.spring(response: TypingAnnouncementLaw.emphasisRiseDuration,
                              dampingFraction: 0.6)) {
            isEmphasizing = true
        }

        emphasisSettle.arm(
            after: TypingAnnouncementLaw.emphasisRiseDuration
                + TypingAnnouncementLaw.emphasisHoldDuration
        ) {
            withAnimation(.spring(response: TypingAnnouncementLaw.emphasisFallDuration,
                                  dampingFraction: 0.8)) {
                isEmphasizing = false
            }
        }
    }

    /// Programme l'effacement au repos. Un état persistant l'annule et
    /// garde la pastille affichée. One-shot borné (jamais `repeatForever`).
    private func scheduleAutoHide() {
        hideSettle.cancel()
        if entriesHavePersistentState {
            isVisible = true
            return
        }
        hideSettle.arm(after: Self.idleHideDelay) {
            withAnimation(.easeOut(duration: 0.3)) { isVisible = false }
        }
    }

    @ViewBuilder
    private var pillContent: some View {
        HStack(spacing: metrics.itemSpacing) {
            statusDot
            labelText
                .transition(.opacity.combined(with: .move(edge: .top)))
                .id(visibleEntry?.id ?? "empty")
            if entries.count > 1 {
                Text("\(min(rotator.currentIndex + 1, entries.count))/\(entries.count)")
                    .font(MeeshyFont.relative(metrics.counterSize, weight: .regular))
                    .foregroundStyle(isDark ? .white.opacity(0.45) : .primary.opacity(0.4))
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, metrics.horizontalPadding)
        .padding(.vertical, metrics.verticalPadding)
        .background(
            Capsule()
                .fill(capsuleBackground)
                .shadow(color: Color.black.opacity(isDark ? 0.35 : 0.12), radius: 6, x: 0, y: 2)
        )
        // Le passage compacte ⇄ grande se fait en douceur, jamais d'un saut.
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85), value: metrics)
        // **La pastille enfle au début d'une frappe, puis redescend** (amplitude
        // ×1,1).
        //
        // L'argument adverse (« une capsule de STATUT n'est pas le porteur d'une
        // annonce ») a été tenu, et tranché dans l'autre sens par le porteur : la
        // pastille porte l'annonce de frappe, l'île se tait.
        //
        // L'amplitude et le retour sortent tous deux de `TypingAnnouncementLaw`
        // pour qu'ils ne puissent pas diverger : le risque n'est pas la taille,
        // c'est le retour au repos.
        .scaleEffect(TypingAnnouncementLaw.scale(emphasizing: isEmphasizing))
        .contentShape(Capsule())
        .onTapGesture(perform: handleTap)
        .onLongPressGesture(minimumDuration: 0.5) {
            togglePause()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint(accessibilityHintText)
        .accessibilityAction(named: isPausedByUser
            ? String(localized: "sync.pill.a11y.resume", defaultValue: "Reprendre", bundle: .main)
            : String(localized: "sync.pill.a11y.pause", defaultValue: "Mettre en pause", bundle: .main)
        ) {
            togglePause()
        }
        // L'abonnement vit ICI, dans la branche VISIBLE — pas sur le `Group`
        // racine. Attaché à la racine, `.onReceive` connecterait l'`autoconnect`
        // même quand `entries` est vide (l'état nominal : connecté +
        // synchronisé → EmptyView) : un réveil main-thread 2×/s en permanence
        // dans le chrome de l'app, pour un garde qui ne ferait que jeter le
        // tick. Ici, la pill démontée = abonnement
        // annulé = timer déconnecté ; le pulse ne coûte que quand il s'affiche.
        // La rotation, elle, est déjà coupée par SyncPillRotator à
        // itemCount == 0.
        .onReceive(dotTimer) { _ in
            dotPhase += 1
        }
        // La pill peut disparaître (abonnement annulé → connexion du timer
        // coupée) puis revenir : on repart d'un publisher NEUF plutôt que de
        // parier sur la reconnexion d'un `autoconnect` déjà annulé.
        .onAppear {
            dotPhase = 0
            dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
        }
    }

    /// Largeur max de la zone de texte — la pill grandissait auparavant sans
    /// borne jusqu'au bord de l'écran. Le compteur `i/n` (sibling dans
    /// `pillContent`) reste HORS de cette contrainte : elle porte
    /// uniquement sur le `Text` du label.
    private var maxTextWidth: CGFloat { metrics.maxTextWidth }

    private var textColor: Color {
        isDark ? .white.opacity(0.7) : .primary.opacity(0.6)
    }

    @ViewBuilder
    private var labelText: some View {
        let label = visibleEntry?.label ?? ""
        let showsDots = visibleEntry?.showsActivityDots == true
        // La mesure porte sur `label` SEUL — jamais avec les points d’activité,
        // qui change 2×/s et ferait osciller la décision de défilement.
        let scrolls = !reduceMotion && SyncPillMarquee.shouldScroll(textWidth: measuredLabelWidth, availableWidth: maxTextWidth)

        Group {
            if scrolls {
                marqueeText(label)
            } else {
                // Pas de largeur imposée ici — un label court doit garder sa
                // taille naturelle (comportement pré-existant), la borne de
                // `maxTextWidth` n'est qu'un plafond qui ne mord que si le texte
                // défile.
                // Les points d'activité vivent dans une place RÉSERVÉE à la
                // largeur de « ... » : concaténés au libellé, ils feraient
                // respirer la capsule deux fois par seconde pendant toute une
                // frappe (la taille initiale est préservée).
                HStack(spacing: 0) {
                    Text(label)
                    if showsDots {
                        Text(SyncPillActivityDots.reserved)
                            .hidden()
                            .overlay(alignment: .leading) {
                                Text(SyncPillActivityDots.visible(phase: dotPhase))
                            }
                    }
                }
                .font(MeeshyFont.relative(metrics.labelSize, weight: .medium))
                .foregroundStyle(textColor)
                .lineLimit(1)
            }
        }
        .background(
            // Mesure la largeur RÉELLE de `label` seul, indépendamment de ce
            // qui est affiché (défilant ou non) — toujours à jour pour la
            // PROCHAINE entrée de la rotation.
            Text(label)
                .font(MeeshyFont.relative(metrics.labelSize, weight: .medium))
                .lineLimit(1)
                .fixedSize()
                .hidden()
                .background(GeometryReader { proxy in
                    Color.clear.preference(key: SyncPillLabelWidthKey.self, value: proxy.size.width)
                })
        )
        .onPreferenceChange(SyncPillLabelWidthKey.self) { measuredLabelWidth = $0 }
        // Défilement piloté par une `TimelineView` et une loi du temps écoulé
        // plutôt que par `Animation.linear(duration:).repeatForever(autoreverses: false)`
        // (la technique littérale de la spec) : une animation `repeatForever`
        // native ne peut pas être mise en pause à mi-cycle sans redémarrer à zéro
        // au retrait de l'animation — ce qui romprait la garantie WCAG 2.2.2 (la
        // pause doit geler l'état visuel courant, jamais le réinitialiser). Ici la
        // pause fige le temps cumulé (`marqueeBase`) : la reprise repart d'où le
        // texte s'était arrêté.
        .adaptiveOnChange(of: scrolls) { _, _ in
            restartMarquee()
        }
        // `scrolls` reste `true` d'une entrée à l'autre quand deux entrées
        // consécutives de la rotation sont TOUTES DEUX assez longues pour
        // défiler — le reset ci-dessus ne se déclenche alors jamais. Sans ce
        // second reset, le marquee du nouveau label reprendrait au décalage où
        // l'ancien s'était arrêté au lieu de repartir de zéro.
        .adaptiveOnChange(of: visibleEntry?.id) { _, _ in
            restartMarquee()
        }
    }

    /// Le texte qui défile. Le viewport à largeur fixe + clip ne s'applique QU'ICI :
    /// c'est ce qui borne la fenêtre visible pendant que le Text (fixedSize, donc
    /// plus large que le viewport) glisse dessous via `offset`.
    ///
    /// L'horloge n'existe QUE dans cette branche : un texte qui ne défile pas ne
    /// paie aucun abonnement. Elle suit l'écran (30 Hz plafonné) et se met en
    /// pause avec l'utilisateur.
    private func marqueeText(_ label: String) -> some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: isPausedByUser)) { timeline in
            Text(label)
                .font(MeeshyFont.relative(metrics.labelSize, weight: .medium))
                .foregroundStyle(textColor)
                .lineLimit(1)
                .fixedSize()
                .offset(x: SyncPillMarquee.offset(
                    elapsed: marqueeElapsed(at: timeline.date),
                    textWidth: measuredLabelWidth,
                    availableWidth: maxTextWidth
                ))
                .frame(width: maxTextWidth, alignment: .leading)
                .clipped()
        }
    }

    /// Temps de défilement écoulé à `date` : figé tant que l'utilisateur a mis
    /// la pill en pause.
    private func marqueeElapsed(at date: Date) -> TimeInterval {
        isPausedByUser ? marqueeBase : marqueeBase + max(0, date.timeIntervalSince(marqueeRunStart))
    }

    private func restartMarquee() {
        marqueeBase = 0
        marqueeRunStart = Date()
    }

    /// Courbe du pouls — une transition BORNÉE, jamais `repeatForever`.
    ///
    /// La répétition vient DÉJÀ de `dotTimer` : il avance `dotPhase` toutes les
    /// 0,5 s, et `pulseOpacity` alterne 1.0 / 0.4 avec sa parité. La courbe n'a
    /// donc qu'un aller à décrire, et 0,4 s le fait tenir dans le tic.
    ///
    /// Une courbe `repeatForever` réarmée par ce même tic ne serait pas
    /// REMPLACÉE par la suivante : n'ayant pas de fin, l'animation précédente
    /// est toujours en vol, et SwiftUI les COMBINE. Le jeu d'animations
    /// concurrentes de l'attribut s'allongerait donc de deux entrées par seconde,
    /// indéfiniment, chacune réévaluée à CHAQUE frame (120 Hz en ProMotion) —
    /// une chauffe qui ne se voit pas à l'ouverture de l'écran mais CROÎT avec
    /// le temps qu'on y passe : mesurée sur iPhone 16 Pro Max / iOS 26.6,
    /// conversation ouverte et INACTIVE, 9,4 % à 15,3 % de CPU selon le mode de
    /// lecture, dont 44 % à 68 % dans `DefaultCombiningAnimation.animate` sur
    /// le fil `com.apple.SwiftUI.AsyncRenderer`.
    ///
    /// La pastille garde son pouls : c'est la courbe qui se borne, pas l'effet
    /// qui disparaît. Garde : `TickedRepeatForeverAnimationSourceGuardTests`.
    private static let pulseCurve: Animation = .easeInOut(duration: 0.4)

    /// Leading visual indicator. If the entry carries a concrete SFSymbol
    /// (e.g. `wifi.slash` for offline) we render it tinted by the dot
    /// style; otherwise we fall back to the pulsing circle used by
    /// the legacy syncingPill.
    @ViewBuilder
    private var statusDot: some View {
        if let iconName = visibleEntry?.iconName {
            Image(systemName: iconName)
                .font(MeeshyFont.relative(metrics.glyphSize, weight: .semibold))
                .foregroundStyle(dotForeground)
                .opacity(pulseOpacity)
                .animation(reduceMotion ? nil : Self.pulseCurve, value: dotPhase)
        } else {
            dotShape
                .frame(width: metrics.dotDiameter, height: metrics.dotDiameter)
                .opacity(pulseOpacity)
                .animation(reduceMotion ? nil : Self.pulseCurve, value: dotPhase)
        }
    }

    @ViewBuilder
    private var dotShape: some View {
        switch visibleEntry?.dotStyle ?? .brand {
        case .brand:
            Circle().fill(MeeshyColors.brandGradient)
        case .warning:
            Circle().fill(MeeshyColors.warning)
        case .success:
            Circle().fill(MeeshyColors.success)
        case .error:
            Circle().fill(MeeshyColors.error)
        }
    }

    private var dotForeground: AnyShapeStyle {
        switch visibleEntry?.dotStyle ?? .brand {
        case .brand:    return AnyShapeStyle(MeeshyColors.brandGradient)
        case .warning:  return AnyShapeStyle(MeeshyColors.warning)
        case .success:  return AnyShapeStyle(MeeshyColors.success)
        case .error:    return AnyShapeStyle(MeeshyColors.error)
        }
    }

    /// Fond de la capsule — OPAQUE (pas de fond quasi transparent à
    /// 0,05/0,08 d'opacité). Une seule forme, en toute circonstance.
    private var capsuleBackground: AnyShapeStyle {
        AnyShapeStyle(isDark ? Color(white: 0.17) : Color.white)
    }

    /// Ce que le doigt fera, DIT à voix haute — et il ne dit « ouvrir » que
    /// quand le tap ouvre. Une ligne épuisée se relance ; annoncer l'ouverture
    /// d'un emplacement qui n'existe pas encore serait un indice MENTEUR, pire
    /// qu'un silence.
    private var accessibilityHintText: String {
        switch visibleEntry?.tapOutcome {
        case .retry:
            return String(localized: "sync.pill.a11y.retry.hint", defaultValue: "Touchez pour réessayer l’opération.", bundle: .main)
        case .navigate:
            return String(localized: "sync.pill.a11y.openLocation.hint", defaultValue: "Touchez pour ouvrir l'emplacement de l'opération.", bundle: .main)
        case .advance, .none:
            return ""
        }
    }

    private func handleTap() {
        guard let entry = visibleEntry else { return }
        switch entry.tapOutcome {
        case .retry(let outboxId):
            guard let onRetry else { return rotator.advance() }
            onRetry(outboxId)
        case .navigate(let source):
            guard let onTap else { return rotator.advance() }
            onTap(source)
        case .advance:
            // Pure status row (offline/syncing/reconnecting) — single tap
            // just advances the rotation manually.
            rotator.advance()
        }
    }

    /// WCAG 2.2.2 — mécanisme de pause actionnable, indépendant du réglage
    /// système Reduce Motion. Gèle rotation ET marquee ; un second appui
    /// long relance les deux.
    private func togglePause() {
        if isPausedByUser {
            marqueeRunStart = Date()
        } else {
            marqueeBase = marqueeElapsed(at: Date())
        }
        isPausedByUser.toggle()
        rotator.setAutoRotation(!isPausedByUser)
        HapticFeedback.light()
    }

    private var accessibilityText: String {
        guard let entry = visibleEntry else { return "" }
        if entries.count == 1 {
            return entry.label
        }
        return String(localized: "sync.pill.a11y.multiple", defaultValue: "\(entries.count) signaux. Actif : \(entry.label).", bundle: .main)
    }
}

/// **Les points d'activité « . .. ... » d'une entrée en cours**
///
/// Leur place est RÉSERVÉE à la largeur de trois points : seuls les points
/// visibles changent au tic, jamais la largeur de la capsule. Une frappe
/// entrante garde ainsi la taille de repos de la pastille — l'accent de
/// `TypingAnnouncementLaw` est le seul changement de taille permis.
nonisolated enum SyncPillActivityDots {
    static let reserved = "..."

    static func visible(phase: Int) -> String {
        String(repeating: ".", count: (abs(phase) % reserved.count) + 1)
    }
}

private struct SyncPillLabelWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
