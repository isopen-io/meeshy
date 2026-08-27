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
/// Métriques partagées de la pastille — la hauteur qu'elle occupe et le
/// décalage vers le haut appliqué par ses points de montage.
enum SyncPillMetrics {
    /// Hauteur rendue de la capsule : contenu ~12 pt + `padding(.vertical, 5)`
    /// des deux côtés. Constante nommée plutôt que 22 en dur chez l'appelant —
    /// c'est l'unité dans laquelle le décalage ci-dessous est exprimé.
    static let height: CGFloat = 22

    /// Remontée demandée : quatre fois la hauteur de la pastille (#4016). La
    /// pastille naissait trop bas sous le chrome de ses hôtes (72 pt sous le
    /// haut en conversation) ; elle se lisait comme un élément du contenu au
    /// lieu d'un bandeau de statut. Bornée à `0` par `liftedTopPadding`, cette
    /// remontée pose la pastille JUSTE SOUS la Dynamic Island (le point de
    /// montage `.safeAreaInset(edge: .top)` la garde déjà sous la safe area) —
    /// remontée d'au moins sa taille par rapport à la valeur précédente.
    static let topLift: CGFloat = 4 * height
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

    init(
        id: String,
        label: String,
        iconName: String?,
        dotStyle: SyncPillDotStyle,
        source: OutboxUIItem.Source?,
        showsActivityDots: Bool = true
    ) {
        self.id = id
        self.label = label
        self.iconName = iconName
        self.dotStyle = dotStyle
        self.source = source
        self.showsActivityDots = showsActivityDots
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
/// - Tap on an entry with `source != nil` invokes `onTap(source)` so the
///   caller can route to the conversation / post / story where the
///   operation is taking place.
struct SyncPill: View {
    let entries: [SyncPillEntry]
    /// Invoked when the user taps the pill and the currently visible
    /// entry has a non-nil `source`. The caller is expected to push onto
    /// the navigation stack (`Router.push(.conversation/.postDetail/...)`).
    let onTap: ((OutboxUIItem.Source) -> Void)?

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

    /// Largeur mesurée du `label` SEUL (jamais `label + animatedDots` — voir
    /// doc `SyncPillMarquee`). Alimentée par la mesure `GeometryReader` en
    /// fond du `Text` du label.
    @State private var measuredLabelWidth: CGFloat = 0
    /// Largeur réellement disponible pour la zone de texte (mesurée une
    /// seule fois via `GeometryReader` sur le conteneur, indépendante du
    /// contenu texte lui-même).
    @State private var availableTextWidth: CGFloat = 140
    /// Décalage horizontal courant du texte en défilement. `0` = position de
    /// repos (texte visible depuis le début).
    @State private var marqueeOffset: CGFloat = 0
    /// Bascule par appui long sur la pill — gèle À LA FOIS la rotation
    /// (`rotator.setAutoRotation(false)`) et le défilement du marquee.
    /// Mécanisme obligatoire (WCAG 2.2.2 Pause/Stop/Hide, niveau A) — le
    /// respect de `accessibilityReduceMotion` seul NE SUFFIT PAS comme
    /// justificatif de conformité pour cette SC (elle ne couvre que la
    /// 2.3.3). Un second appui long relance.
    @State private var isPausedByUser = false
    /// Tick dédié au défilement du marquee — même pattern que `dotTimer`
    /// (Timer.publish `@State`, pas `let`, pour survivre aux reconstructions
    /// fréquentes de cette vue). 30 Hz : fluide sans coût perceptible.
    @State private var marqueeTimer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()

    // MARK: - Activité récente : afficher, accentuer, s'effacer (#4017 / #4018)

    /// Identifiants d'entrées déjà vus — sert à détecter l'arrivée d'une
    /// entrée NEUVE (un nouveau typing, un nouvel envoi) pour déclencher
    /// l'accentuation.
    @State private var seenEntryIDs: Set<String> = []
    /// La pastille est-elle visible ? Pilotée par l'activité récente : une
    /// nouvelle entrée l'affiche, un silence de `idleHideDelay` l'efface —
    /// sauf état PERSISTANT (hors-ligne, échec), qui la garde affichée.
    @State private var isVisible: Bool = false
    /// Phase d'accentuation transitoire (×1.5 + fond primaire + rebond) au
    /// passage d'un nouveau contenu.
    @State private var isAccented: Bool = false
    /// Effacement différé (one-shot, annulable) — réarmé à chaque nouvelle
    /// entrée. Borné, jamais `repeatForever` (cf. audit chauffe #3940).
    @State private var hideWorkItem: DispatchWorkItem?
    /// Retour de l'accent à l'état de repos (one-shot, annulable).
    @State private var accentResetWorkItem: DispatchWorkItem?

    /// Délai sans NOUVELLE entrée après lequel la pastille s'efface — évite
    /// l'affichage permanent au repos (#4017). Réarmé à chaque arrivée.
    private static let idleHideDelay: TimeInterval = 6.0
    /// Durée de l'accent avant retour au repos (#4018).
    private static let accentHold: TimeInterval = 0.5
    /// Grossissement transitoire à l'arrivée d'un nouveau contenu (#4018).
    private static let accentScale: CGFloat = 1.5

    init(
        entries: [SyncPillEntry],
        onTap: ((OutboxUIItem.Source) -> Void)? = nil
    ) {
        self.entries = entries
        self.onTap = onTap
    }

    private var isDark: Bool { colorScheme == .dark }

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

    private var animatedDots: String {
        String(repeating: ".", count: (dotPhase % 3) + 1)
    }

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
        let hasNew = !currentIDs.subtracting(seenEntryIDs).isEmpty
        seenEntryIDs = currentIDs

        if entries.isEmpty {
            hideWorkItem?.cancel(); hideWorkItem = nil
            isVisible = false
            return
        }
        if hasNew { surfaceWithAccent() }
        scheduleAutoHide()
    }

    /// Affiche la pastille et joue l'accent transitoire (×1.5 + fond primaire
    /// + rebond), puis programme le retour au repos (#4018).
    private func surfaceWithAccent() {
        isVisible = true
        withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.32, dampingFraction: 0.55)) {
            isAccented = true
        }
        accentResetWorkItem?.cancel()
        let reset = DispatchWorkItem {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { isAccented = false }
        }
        accentResetWorkItem = reset
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.accentHold, execute: reset)
    }

    /// Programme l'effacement au repos (#4017). Un état persistant l'annule et
    /// garde la pastille affichée. One-shot borné (jamais `repeatForever`).
    private func scheduleAutoHide() {
        hideWorkItem?.cancel()
        if entriesHavePersistentState {
            isVisible = true
            hideWorkItem = nil
            return
        }
        let work = DispatchWorkItem {
            withAnimation(.easeOut(duration: 0.3)) { isVisible = false }
        }
        hideWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.idleHideDelay, execute: work)
    }

    @ViewBuilder
    private var pillContent: some View {
        HStack(spacing: 6) {
            statusDot
            labelText
                .transition(.opacity.combined(with: .move(edge: .top)))
                .id(visibleEntry?.id ?? "empty")
            if entries.count > 1 {
                Text("\(min(rotator.currentIndex + 1, entries.count))/\(entries.count)")
                    .font(MeeshyFont.relative(10, weight: .regular))
                    .foregroundStyle(isDark ? .white.opacity(0.45) : .primary.opacity(0.4))
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(capsuleBackground)
                .shadow(color: Color.black.opacity(isDark ? 0.35 : 0.12), radius: 6, x: 0, y: 2)
        )
        // Accent (#4018) : la pastille grossit ×1.5 vers le BAS (ancrage .top)
        // pour ne jamais empiéter sur la Dynamic Island au-dessus.
        .scaleEffect(isAccented ? Self.accentScale : 1.0, anchor: .top)
        .contentShape(Capsule())
        .onTapGesture(perform: handleTap)
        .onLongPressGesture(minimumDuration: 0.5) {
            togglePause()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint(visibleEntry?.source != nil
            ? String(localized: "sync.pill.a11y.openLocation.hint", defaultValue: "Touchez pour ouvrir l'emplacement de l'opération.", bundle: .main)
            : "")
        .accessibilityAction(named: isPausedByUser
            ? String(localized: "sync.pill.a11y.resume", defaultValue: "Reprendre", bundle: .main)
            : String(localized: "sync.pill.a11y.pause", defaultValue: "Mettre en pause", bundle: .main)
        ) {
            togglePause()
        }
        // L'abonnement vit ICI, dans la branche VISIBLE — pas sur le `Group`
        // racine. Attaché à la racine, `.onReceive` connectait l'`autoconnect`
        // même quand `entries` était vide (l'état nominal : connecté +
        // synchronisé → EmptyView) : un réveil main-thread 2×/s en permanence
        // dans le chrome de l'app, pour un garde qui ne faisait que jeter le
        // tick (audit chauffe 2026-08-26). Ici, la pill démontée = abonnement
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
            marqueeTimer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()
        }
    }

    /// Largeur max de la zone de texte — la pill grandissait auparavant sans
    /// borne jusqu'au bord de l'écran. Le compteur `i/n` (sibling dans
    /// `pillContent`) reste HORS de cette contrainte : elle porte
    /// uniquement sur le `Text` du label.
    private static let maxTextWidth: CGFloat = 160

    private var textColor: Color {
        // Sur le fond primaire de l'accent, le texte passe en blanc pour rester
        // lisible (#4018).
        if isAccented { return .white }
        return isDark ? .white.opacity(0.7) : .primary.opacity(0.6)
    }

    @ViewBuilder
    private var labelText: some View {
        let label = visibleEntry?.label ?? ""
        let showsDots = visibleEntry?.showsActivityDots == true
        // La mesure porte sur `label` SEUL — jamais `label + animatedDots`,
        // qui change 2×/s et ferait osciller la décision de défilement.
        let scrolls = !reduceMotion && SyncPillMarquee.shouldScroll(textWidth: measuredLabelWidth, availableWidth: Self.maxTextWidth)

        Group {
            if scrolls {
                // Le viewport à largeur fixe + clip ne s'applique QU'ICI : c'est
                // ce qui borne la fenêtre visible pendant que le Text (fixedSize,
                // donc plus large que le viewport) glisse dessous via `offset`.
                Text(label)
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundStyle(textColor)
                    .lineLimit(1)
                    .fixedSize()
                    .offset(x: marqueeOffset)
                    .frame(width: Self.maxTextWidth, alignment: .leading)
                    .clipped()
            } else {
                // Pas de largeur imposée ici — un label court doit garder sa
                // taille naturelle (comportement pré-existant), la borne de
                // `maxTextWidth` n'est qu'un plafond qui ne mord que si le texte
                // défile.
                Text(label + (showsDots ? animatedDots : ""))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundStyle(textColor)
                    .lineLimit(1)
            }
        }
        .background(
            // Mesure la largeur RÉELLE de `label` seul, indépendamment de ce
            // qui est affiché (défilant ou non) — toujours à jour pour la
            // PROCHAINE entrée de la rotation.
            Text(label)
                .font(MeeshyFont.relative(11, weight: .medium))
                .lineLimit(1)
                .fixedSize()
                .hidden()
                .background(GeometryReader { proxy in
                    Color.clear.preference(key: SyncPillLabelWidthKey.self, value: proxy.size.width)
                })
        )
        .onPreferenceChange(SyncPillLabelWidthKey.self) { measuredLabelWidth = $0 }
        // Défilement piloté par un timer manuel (30 Hz) plutôt que par
        // `Animation.linear(duration:).repeatForever(autoreverses: false)` (la
        // technique littérale de la spec) : une animation `repeatForever` native
        // ne peut pas être mise en pause à mi-cycle sans redémarrer à zéro au
        // retrait de l'animation — ce qui romprait la garantie WCAG 2.2.2 (la
        // pause doit geler l'état visuel courant, jamais le réinitialiser).
        .onReceive(marqueeTimer) { _ in
            guard scrolls, !isPausedByUser else { return }
            let step = SyncPillMarquee.pointsPerSecond / 30.0
            marqueeOffset -= step
            let gap: CGFloat = 24
            if marqueeOffset < -(measuredLabelWidth + gap) {
                marqueeOffset = Self.maxTextWidth
            }
        }
        .adaptiveOnChange(of: scrolls) { _, newValue in
            if !newValue { marqueeOffset = 0 }
        }
        // `scrolls` reste `true` d'une entrée à l'autre quand deux entrées
        // consécutives de la rotation sont TOUTES DEUX assez longues pour
        // défiler — le reset ci-dessus ne se déclenche alors jamais. Sans ce
        // second reset, le marquee du nouveau label reprendrait au décalage où
        // l'ancien s'était arrêté au lieu de repartir de zéro.
        .adaptiveOnChange(of: visibleEntry?.id) { _, _ in
            marqueeOffset = 0
        }
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
    /// concurrentes de l'attribut s'allongeait donc de deux entrées par seconde,
    /// indéfiniment, chacune réévaluée à CHAQUE frame (120 Hz en ProMotion) —
    /// une chauffe qui ne se voit pas à l'ouverture de l'écran mais CROÎT avec
    /// le temps qu'on y passe. Mesuré sur iPhone 16 Pro Max / iOS 26.6 (#3940) :
    /// conversation ouverte et INACTIVE, 9,4 % à 15,3 % de CPU selon le mode de
    /// lecture, dont 44 % à 68 % dans `DefaultCombiningAnimation.animate` sur
    /// le fil `com.apple.SwiftUI.AsyncRenderer`.
    ///
    /// La pastille garde son pouls : c'est la courbe qui se borne, pas l'effet
    /// qui disparaît. Garde : `TickedRepeatForeverAnimationSourceGuardTests`.
    private static let pulseCurve: Animation = .easeInOut(duration: 0.4)

    /// Leading visual indicator. If the entry carries a concrete SFSymbol
    /// (e.g. `wifi.slash` for offline) we render it tinted by the dot
    /// style; otherwise we fall back to the pulsing 6×6 circle used by
    /// the legacy syncingPill.
    @ViewBuilder
    private var statusDot: some View {
        if let iconName = visibleEntry?.iconName {
            Image(systemName: iconName)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundStyle(dotForeground)
                .opacity(pulseOpacity)
                .animation(reduceMotion ? nil : Self.pulseCurve, value: dotPhase)
        } else {
            dotShape
                .frame(width: 6, height: 6)
                .opacity(pulseOpacity)
                .animation(reduceMotion ? nil : Self.pulseCurve, value: dotPhase)
        }
    }

    @ViewBuilder
    private var dotShape: some View {
        if isAccented {
            Circle().fill(Color.white)
        } else {
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
    }

    private var dotForeground: AnyShapeStyle {
        if isAccented { return AnyShapeStyle(Color.white) }
        switch visibleEntry?.dotStyle ?? .brand {
        case .brand:    return AnyShapeStyle(MeeshyColors.brandGradient)
        case .warning:  return AnyShapeStyle(MeeshyColors.warning)
        case .success:  return AnyShapeStyle(MeeshyColors.success)
        case .error:    return AnyShapeStyle(MeeshyColors.error)
        }
    }

    /// Fond de la capsule — OPAQUE (#4016 : plus de fond quasi transparent à
    /// 0,05/0,08 d'opacité), et ACCENTUÉ en couleur primaire de l'app pendant
    /// l'accent (#4018).
    private var capsuleBackground: AnyShapeStyle {
        if isAccented {
            return AnyShapeStyle(MeeshyColors.brandPrimary)
        }
        return AnyShapeStyle(isDark ? Color(white: 0.17) : Color.white)
    }

    private func handleTap() {
        guard let entry = visibleEntry else { return }
        if let source = entry.source, let onTap {
            onTap(source)
        } else {
            // Pure status row (offline/syncing/reconnecting) — single tap
            // just advances the rotation manually.
            rotator.advance()
        }
    }

    /// WCAG 2.2.2 — mécanisme de pause actionnable, indépendant du réglage
    /// système Reduce Motion. Gèle rotation ET marquee ; un second appui
    /// long relance les deux.
    private func togglePause() {
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

private struct SyncPillLabelWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
