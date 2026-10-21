import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// Surimpressions du fil : le jour collant en tête et la pilule « jour · heure » du défilement (#10758).
extension MessageListViewController {

    func configureStickyDayOverlay() {
        stickyDayState.isDark = isDark
        let host = UIHostingController(
            rootView: MessageDayStickyOverlay(state: stickyDayState)
        )
        // #7998 : sans hauteur, la pill était CENTRÉE sur son ancre.
        host.sizingOptions = .intrinsicContentSize
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        // Ancrée au bord HAUT DE LA VUE (qui court désormais jusqu'au bord de
        // l'écran) + `topInset` : la position à l'écran est identique à
        // l'ancrage safe-area d'avant, mais elle ne dépend plus de ce que
        // SwiftUI propage comme safe area au contrôleur hébergé.
        let stickyTop = host.view.topAnchor.constraint(
            equalTo: view.topAnchor,
            constant: topInset + MessageDayStickyPlacement.topOffset(headerBandHeight: headerBandHeight)
        )
        NSLayoutConstraint.activate([
            stickyTop,
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        stickyDayTopConstraint = stickyTop
        stickyDayHost = host
    }

    // MARK: - WS-2 (F-086bis) — montage de la pilule « jour · heure »

    /// SOUS DRAPEAU : montée/démontée dynamiquement selon `readingMode` —
    /// `.bubbles` ⇒ aucun `UIHostingController` enfant supplémentaire
    /// (contrat §WS-6 « bit-à-bit identique »). Appelée depuis `viewDidLoad`
    /// et depuis le `didSet` de `readingMode`.
    /// **La pilule flottante n'est plus montée — nulle part.**
    ///
    /// Elle datait un POINT DE L'ÉCRAN (« Mercredi · 17:42 » figé en haut),
    /// pendant que le sticker de jour occupait déjà la bande au-dessus et
    /// que chaque rangée portait son heure en permanence : trois chromes
    /// temporels concurrents pour une seule question, « quand ce
    /// message-ci ? ». Seule la rangée sait y répondre.
    ///
    /// `ScrollTimePillState` et sa loi restent en place et continuent d'être
    /// alimentés (`noteScrollTimePillActivity`) — c'est cette même loi qui
    /// pilote désormais `timestampReveal`. Rien n'est réimplémenté ; seul le
    /// SUPPORT de l'information change. Le démontage est inconditionnel pour
    /// qu'un contrôleur recyclé depuis un mode antérieur n'en garde pas une
    /// à l'écran.
    func updateScrollTimePillMounting() {
        teardownScrollTimePillOverlay()
    }

    /// Second `UIHostingController` enfant, MÊME topologie que
    /// `configureStickyDayOverlay` ci-dessus — `ScrollTimePillOverlay` (F-081,
    /// GELÉ `Focal/Chrome/`) est une vue PURE, aucune modification.
    /// Ancrage/cotes via `FocalMetrics.Pill` (`top` 72, `fadeDuration` déjà
    /// consommé PAR l'overlay lui-même) — jamais un littéral ici (garde R15).
    private func configureScrollTimePillOverlay() {
        scrollTimePillState.isDark = isDark
        scrollTimePillState.isHeaderExpanded = isHeaderExpanded
        let host = UIHostingController(
            rootView: AnyView(
                ScrollTimePillOverlay(state: scrollTimePillState)
                    // Reduce Motion (§4.9, DEUX sources) : « pas d'animation
                    // de fondu ». `ScrollTimePillOverlay` est GELÉ et anime
                    // en interne (`.animation(value: isVisible)`, cote
                    // `FocalMetrics.Pill.fadeDuration`) — désactiver la
                    // TRANSACTION plutôt qu'éditer ce fichier hors périmètre.
                    .transaction { transaction in
                        if MeeshyMotion.shouldReduce(
                            system: UIAccessibility.isReduceMotionEnabled,
                            userForced: false
                        ) {
                            transaction.disablesAnimations = true
                        }
                    }
            )
        )
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        let pillTop = host.view.topAnchor.constraint(
            equalTo: view.topAnchor,
            constant: topInset + MessageDayStickyPlacement.scrollTimePillTop(headerBandHeight: headerBandHeight)
        )
        NSLayoutConstraint.activate([
            pillTop,
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        scrollTimePillTopConstraint = pillTop
        scrollTimePillHost = host
    }

    private func teardownScrollTimePillOverlay() {
        guard let host = scrollTimePillHost else { return }
        host.willMove(toParent: nil)
        host.view.removeFromSuperview()
        host.removeFromParent()
        scrollTimePillHost = nil
        scrollTimePillTopConstraint = nil
    }

    /// Site 1 (§4.8), RÉUTILISÉ — aucun observateur neuf. Label « jour ·
    /// heure » du message en haut visible, même approche que
    /// `updateStickyDayLabel` (jour seul) mais `createdAt` complet : la
    /// pilule a besoin de l'heure en plus du jour.
    /// Appelée à CHAQUE frame de `scrollViewDidScroll`.
    ///
    /// **Le calcul du libellé a été retiré — c'était du travail MORT.** Il
    /// résolvait le message du haut de l'écran (`indexPathsForVisibleItems
    /// .max()` + `store.message(for:)`) puis formatait « jour · heure »
    /// (`MessageDayLabel` + `TimeStringCache`) pour alimenter
    /// `ScrollTimePillState.label` — c'est-à-dire une pilule qui n'est PLUS
    /// MONTÉE nulle part depuis que les heures sont revenues aux rangées.
    /// Une résolution de message et deux formatages par frame de défilement,
    /// pour un état que plus aucune vue n'observait.
    ///
    /// La LOI, elle, reste alimentée : c'est elle qui décide de la fenêtre du
    /// révélé, et son horloge doit continuer de recevoir chaque événement.
    /// Seul l'étiquetage disparaît.
    ///
    /// L'horodatage est pris UNE fois et partagé par les deux consommateurs :
    /// deux appels à `nowMs()` dans la même frame produisaient deux instants
    /// différents pour un seul et même événement.
    func noteScrollTimePillActivity() {
        guard readingMode != .bubbles else { return }
        let now = Double(Self.nowMs())
        scrollTimePillState.note(.scrolled(at: now))
        // Même événement, même horloge, même loi — §WS-2 amendement A4
        // (« une loi, deux libellés »), ici un troisième support. C'est ce
        // qui garantit que les heures des rangées s'ouvrent et se referment
        // EXACTEMENT sur le tempo qu'avait la pilule, sans réimplémenter la
        // fenêtre.
        timestampReveal.note(.scrolled(at: now))

        // Magnificence (directive 2026-08-24) : elle ne s'arme ni au premier
        // pixel ni sur un rebond. La vitesse du geste ouvre la porte tout de
        // suite ; un défilement lent mais SOUTENU l'ouvre passé le seuil de
        // durée. Le début de session se pose ici, au premier événement d'une
        // série — `scrollViewDidEndDecelerating` le remet à nil.
        guard readingMode == .focal else { return }
        if focalScrollStartedAt == nil { focalScrollStartedAt = now }
        let velocity = collectionView.panGestureRecognizer.velocity(in: collectionView).y
        let armed = FocalMagnificationLaw.isArmed(
            alreadyArmed: focalMagnificationArmed,
            scrollStartedAt: focalScrollStartedAt,
            now: now,
            velocity: velocity
        )
        if armed != focalMagnificationArmed {
            focalMagnificationArmed = armed
            applyFocalPerspectiveToVisibleCells()
        }
    }

    /// Recalcule le label de la pill sticky : le jour de la rangée RÉELLEMENT
    /// en haut du fil, et rien dès qu'une pastille de section est visible —
    /// jamais deux dates à l'écran (`MessageDayStickyLaw`, #4602). Les cadres
    /// sont lus dans le repère de la vue (`convert` défait l'inversion de la
    /// liste) : la collection court jusqu'au bord de l'écran, et un message
    /// sorti sous l'en-tête y reste « visible » pour elle.
    /// `visibleIndexPaths` : l'inventaire déjà lu par l'appelant du tour de
    /// frame (`scrollViewDidScroll`) — `nil` ⇒ lecture interne, pour les
    /// appels hors défilement.
    func updateStickyDayLabel(visibleIndexPaths: [IndexPath]? = nil) {
        guard let dataSource else { return }
        let placed: [(item: MessageListItem, row: MessageDayStickyLaw.Row)] =
            (visibleIndexPaths ?? collectionView.indexPathsForVisibleItems).compactMap { path in
                guard let item = dataSource.itemIdentifier(for: path),
                      let frame = collectionView.layoutAttributesForItem(at: path)?.frame else { return nil }
                let onScreen = collectionView.convert(frame, to: view)
                let isDayHeader: Bool = { if case .dayHeader = item { return true }; return false }()
                return (item, MessageDayStickyLaw.Row(isDayHeader: isDayHeader, minY: onScreen.minY, maxY: onScreen.maxY))
            }
        guard let topIndex = MessageDayStickyLaw.stickyRow(
            rows: placed.map(\.row),
            readingLine: topInset + MessageDayStickyPlacement.topOffset(headerBandHeight: headerBandHeight),
            viewportBottom: view.bounds.maxY
        ) else {
            lastStickyTopItem = nil
            if stickyDayState.label != nil { stickyDayState.label = nil }
            return
        }
        let topItem = placed[topIndex].item
        // La cellule de tête n'a pas changé depuis le dernier calcul → le label
        // est déjà à jour. Évite un `store.message(for:)` + `toMessage`
        // (jusqu'à 5 décodages JSON) à chaque frame tant qu'on reste dessus.
        guard topItem != lastStickyTopItem else { return }
        lastStickyTopItem = topItem

        let calendar = Calendar.current
        let now = Date()
        let topDayStart: Date?
        switch topItem {
        case .dayHeader:
            // Le séparateur natif est l'item du haut — la sticky doublonnerait,
            // on la masque le temps qu'il défile hors écran.
            stickyDayState.label = nil
            return
        case .message(let localId):
            if let record = store.message(for: localId) {
                // Read `createdAt` straight off the record — `toMessage` decodes
                // five JSON blobs (attachments/reactions/reply/forward/call) and
                // we only need the day. This path runs per top-cell change while
                // scrolling; `toMessage().createdAt` is just `record.createdAt`.
                topDayStart = calendar.startOfDay(for: record.createdAt)
            } else {
                topDayStart = nil
            }
        case .typingIndicator:
            topDayStart = nil
        case .conversationStart:
            // R-d : marqueur de tête, jamais un jour — même traitement que
            // le typing (aucune sticky day label à en tirer).
            topDayStart = nil
        case .firstUnreadSeparator(let afterLocalId):
            // Séparateur de non-lus (#7222) : il n'EST pas un jour mais il en
            // SURPLOMBE un — celui du message qu'il annonce. Rendre `nil`
            // ÉTEIGNAIT la pilule le temps qu'il traverse la tête de l'écran,
            // au beau milieu du geste d'ouverture.
            topDayStart = store.message(for: afterLocalId)
                .map { calendar.startOfDay(for: $0.createdAt) }
        }
        guard let dayStart = topDayStart else {
            stickyDayState.label = nil
            return
        }
        let label = MessageDayLabel.label(
            for: dayStart,
            now: now,
            calendar: calendar,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
        if stickyDayState.label != label {
            stickyDayState.label = label
        }
    }

    func relativeDayLabel(for date: Date, now: Date = Date()) -> String {
        MessageDayLabel.label(
            for: date,
            now: now,
            calendar: .current,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
    }
}
