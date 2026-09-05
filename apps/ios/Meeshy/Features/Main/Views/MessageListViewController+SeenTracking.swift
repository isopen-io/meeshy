import UIKit

//
// Le suivi de lecture exact du fil, et la VEILLE de la liste quand un pane
// opaque la recouvre.
//
// Sorti de `MessageListViewController.swift` (#3947) : l'hôte dépassait le
// budget de 800-1100 lignes d'un facteur trois, et la directive interdit d'y
// ajouter avant d'en avoir extrait. Le cluster est cohérent — il ne parle que
// du moment où un message est « vu » — et c'est exactement là que la veille
// devait naître, puisque `rendersThread` en est déjà le prédicat.
//
// Les membres que ce fichier consomme (`seenTimer`, `seenAccumulator`,
// `lastSeenActivityMs`, `wantsImmediateSeenFlush`, `collectionView`,
// `dataSource`, `store`) sont passés de `private`/`fileprivate` à `internal`
// pour la même raison : en Swift, `private` porte sur le FICHIER. Aucun n'est
// lu ailleurs dans la cible — c'est une portée élargie, pas une frontière
// ouverte.
//

// MARK: - Suivi de lecture exact

extension MessageListViewController {

    /// Résout l'identifiant SERVEUR d'une cellule.
    ///
    /// Le diffable est indexé par `localId` ; un message encore en vol n'a pas
    /// de `serverId`. Renvoyer `nil` dans ce cas écarte naturellement les
    /// messages optimistes — inutile de filtrer un préfixe `cid_` ailleurs, et
    /// le gateway rejetterait de toute façon tout le lot en 400.
    func serverMessageId(at indexPath: IndexPath) -> String? {
        guard case .message(let localId)? = dataSource.itemIdentifier(for: indexPath) else {
            return nil
        }
        return store.message(for: localId)?.serverId
    }

    /// Le mode courant REND-il le fil ?
    ///
    /// Rivière et Résumé sont des panes OPAQUES montés SUR la liste dans le
    /// même `ZStack` (`ConversationView`), qui reste montée DESSOUS : ses
    /// cellules continuent de paraître, de disparaître et de nourrir le suivi
    /// de lecture pour des messages que PERSONNE n'a vus. Le suivi ne compte
    /// que ce qu'un mode rendu affiche.
    ///
    /// Le gate se pose au point d'USAGE et non dans le `didSet` de
    /// `readingMode` : celui-ci sort sur `isViewLoaded`, or le mode arrive
    /// AVANT le chargement de la vue — et l'ouverture DIRECTE en `.summary`
    /// (décision auto au-delà de 25 non-lus) ou en `.river` est justement le
    /// scénario où les accusés partaient en masse.
    ///
    /// **Ce prédicat garde l'ENTRÉE (`willDisplay`/`didEndDisplaying`),
    /// JAMAIS le drain** (`flushSeenMessages`, `drainSeenNow`) — retiré de
    /// ces deux-là le 2026-08-25 (F1, revue adversariale) : l'entrée suffit
    /// déjà à garantir que l'accumulateur ne contient que des messages
    /// réellement affichés, et garder le drain jetait silencieusement une
    /// lecture RÉELLEMENT acquise en Bulles/Script/Focal si le lecteur
    /// passait par la Rivière ou le Résumé avant de fermer la conversation —
    /// `flushSeenMessages` est le SEUL site de vidange au démontage.
    static func rendersThread(_ mode: ConversationReadingMode) -> Bool {
        mode != .river && mode != .summary
    }

    var rendersThread: Bool { Self.rendersThread(readingMode) }

    /// Re-note comme APPARUES les cellules déjà à l'écran — appelée au RETOUR
    /// vers un mode rendu, où `willDisplay` ne repassera pas.
    func reNoteVisibleCellsAsSeen() {
        guard isViewLoaded, dataSource != nil, rendersThread else { return }
        let now = Self.nowMs()
        lastSeenActivityMs = now
        for indexPath in collectionView.indexPathsForVisibleItems {
            guard let serverId = serverMessageId(at: indexPath) else { continue }
            seenAccumulator.appeared(serverId, at: now)
        }
    }

    /// Vide l'accumulateur et signale ce qui a été acquis.
    ///
    /// Appelé au démontage : fermer une conversation ne doit pas perdre une
    /// lecture déjà acquise. **Jamais gardé sur `rendersThread`** (F1,
    /// revue adversariale 2026-08-25) : l'accumulateur ne peut contenir que
    /// des lectures acquises pendant que le gate d'ENTRÉE était ouvert
    /// (`willDisplay`/`didEndDisplaying`) — les garder ici jetait ces
    /// lectures si le lecteur avait depuis basculé vers la Rivière ou le
    /// Résumé, exactement l'instant où ce site est appelé au démontage.
    func flushSeenMessages() {
        let seen = seenAccumulator.drain(at: Self.nowMs())
        guard !seen.isEmpty else { return }
        onMessagesSeen?(seen, visibleServerMessageIds())
    }

    /// Signale IMMÉDIATEMENT tout ce qui est à l'écran, seuil de présence
    /// franchi ou non.
    ///
    /// Réservé aux instants où l'utilisateur déclare regarder le bas de la
    /// conversation : il vient d'y arriver, il l'a demandé, l'écran s'ouvre, ou
    /// l'app part en arrière-plan. Attendre le repos d'une seconde du réveil
    /// périodique y ferait traîner l'accusé sans le rendre plus véridique.
    ///
    /// Rien en attente signifie que les cellules visées n'ont pas encore paru
    /// (premier layout d'ouverture, défilement programmatique en cours) : le
    /// prochain réveil reprend la demande UNE fois, au lieu de la perdre et de
    /// retomber sur le repos d'une seconde.
    func flushSeenNow() {
        guard !drainSeenNow() else { return }
        wantsImmediateSeenFlush = true
    }

    /// **Jamais gardé sur `rendersThread`** — même raison que
    /// `flushSeenMessages` (F1, revue adversariale 2026-08-25) : le gate
    /// d'ENTRÉE suffit déjà, le garder ici aussi ne fait que retarder ou
    /// perdre un drain légitime sans rien acquérir de plus.
    private func drainSeenNow() -> Bool {
        let now = Self.nowMs()
        lastSeenActivityMs = now
        let seen = seenAccumulator.promoteAndDrain(at: now)
        guard !seen.isEmpty else { return false }
        onMessagesSeen?(seen, visibleServerMessageIds())
        return true
    }

    /// Ce que la liste MONTRE, servi à chaque drain en regard du lot (#3902).
    func visibleServerMessageIds() -> [String] {
        guard isViewLoaded, dataSource != nil else { return [] }
        return collectionView.indexPathsForVisibleItems.compactMap(serverMessageId(at:))
    }

    static func nowMs() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    /// Réveil périodique : le seuil de présence doit se déclencher même quand
    /// l'utilisateur ne bouge plus et qu'aucun événement de défilement n'arrive.
    ///
    /// Mode `.common` : en `.default`, le RunLoop suspend le timer pendant tout
    /// le suivi tactile, si bien qu'un doigt posé sur la liste gelait le suivi
    /// de lecture jusqu'au relâchement.
    func startSeenTracking() {
        seenTimer?.invalidate()
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                // F-086bis (WS-2) : RÉUTILISE ce timer de suivi de lecture,
                // déjà en place, pour le `.tick` de la pilule jour·heure —
                // aucun observateur/timer NEUF introduit pour la pilule.
                if self.readingMode != .bubbles {
                    self.scrollTimePillState.note(.tick(at: Double(Self.nowMs())))
                    self.timestampReveal.note(.tick(at: Double(Self.nowMs())))
                }
                if self.wantsImmediateSeenFlush {
                    self.wantsImmediateSeenFlush = false
                    _ = self.drainSeenNow()
                    return
                }
                let now = Self.nowMs()
                if self.seenAccumulator.isBatchReady(at: now)
                    || now - self.lastSeenActivityMs >= 1000 {
                    self.lastSeenActivityMs = now
                    self.flushSeenMessages()
                }
            }
        }
        timer.tolerance = 0.1
        RunLoop.main.add(timer, forMode: .common)
        seenTimer = timer
    }

    func stopSeenTracking() {
        seenTimer?.invalidate()
        seenTimer = nil
    }

    // MARK: - Veille sous un pane opaque (#3947)

    /// **La liste ne tourne pas sous la Rivière ni sous le Résumé.**
    ///
    /// Les deux sont des panes OPAQUES montés SUR la liste dans le même
    /// `ZStack` ; la liste reste montée DESSOUS et continuait de réveiller son
    /// timer QUATRE FOIS PAR SECONDE — indéfiniment, sans qu'un doigt touche
    /// l'écran — pour des pixels que personne ne voit. C'est le coût
    /// PÉRIODIQUE, celui qu'on mesure à l'idle : les abonnements Combine
    /// d'`observeStore()`, eux, sont dirigés par événement et ne coûtent rien
    /// tant que rien n'arrive.
    ///
    /// **On met en VEILLE, on ne DÉMONTE pas.** Démonter détruirait le
    /// `UICollectionView` et sa position de défilement — or le milestone
    /// promet exactement l'inverse (« le fil reste où le lecteur l'a laissé »).
    /// Un aller-retour Rivière → Bulles → Rivière doit être instantané.
    ///
    /// Rien ne peut se perdre en veille, et c'est le gate d'ENTRÉE qui le
    /// garantit : `willDisplay` / `didEndDisplaying` sont déjà gardés sur
    /// `rendersThread`, donc l'accumulateur ne se remplit pas pendant que le
    /// pane couvre. Et si la conversation se ferme en Rivière,
    /// `dismantleUIViewController` vide l'accumulateur AVANT d'arrêter le
    /// timer (`MessageListView.swift`) — une lecture acquise plus tôt en
    /// Bulles part quand même.
    ///
    /// Au retour, `readingMode.didSet` relance le timer et re-note les
    /// cellules déjà à l'écran (`reNoteVisibleCellsAsSeen`), qui ne
    /// repasseront jamais par `willDisplay`.
    func syncThreadQuiescence() {
        guard isViewLoaded else { return }
        if rendersThread {
            guard seenTimer == nil else { return }
            startSeenTracking()
        } else {
            stopSeenTracking()
        }
    }
}
