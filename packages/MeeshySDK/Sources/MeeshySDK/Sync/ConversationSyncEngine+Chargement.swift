import Foundation
import Combine
import os

// ConversationSyncEngine — le CHARGEMENT : plein (démarrage à froid), delta, messages, rétention.
// Voir la note d'extraction en tête de `ConversationSyncEngine.swift` (#4172).

extension ConversationSyncEngine {
    // MARK: - Full Sync (cold start)

    /// Run a full sync and return whether it completed successfully.
    ///
    /// Historically this method swallowed every error and left the caller
    /// unable to tell if the cache was populated or still empty. That
    /// produced the "blank conversation list forever" bug on cold start
    /// when REST was unreachable or the token had expired: the VM would
    /// flip `isLoading = false`, the view would fall through to the
    /// empty-state placeholder, and there was no retry surface. Callers
    /// should now inspect the return value and surface an error UI when
    /// it's `false`.
    @discardableResult
    /// Fetches a single conversations page, retrying transient errors up to
    /// 2 times with exponential backoff (1s, 2s). Lifted out of `fullSync()`
    /// so it can be called from inside `withTaskGroup` closures without
    /// triggering Swift 6 isolation-boundary warnings on `@Sendable` local
    /// functions. Previously a single network blip silently dropped an
    /// entire page — `succeeded` flipped false and the user landed on a
    /// partial list with no recovery path.
    private static func fetchPageWithRetry(
        via service: ConversationServiceProviding,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        var lastError: Error?
        for attempt in 0..<3 {
            do {
                return try await service.list(offset: offset, limit: limit)
            } catch {
                lastError = error
                if attempt < 2 {
                    let backoff = UInt64(1_000_000_000 * (1 << attempt))
                    try? await Task.sleep(nanoseconds: backoff)
                }
            }
        }
        throw lastError ?? URLError(.unknown)
    }

    /// Map an API conversation page off the main actor. The engine is
    /// `@unchecked Sendable` (not an actor) and SE-0461 runs its nonisolated
    /// async methods on the caller's actor — here the @MainActor list VM — so a
    /// plain `.map { $0.toConversation }` would decode every conversation
    /// (last message, preferences, participants) on the main thread during the
    /// background sync. `[APIConversation]` and `[MeeshyConversation]` are both
    /// Sendable and `toConversation` is a nonisolated pure function.
    private static func mapConversationsOffMain(
        _ apiConversations: [APIConversation],
        userId: String
    ) async -> [MeeshyConversation] {
        await Task.detached(priority: .userInitiated) {
            apiConversations.map { $0.toConversation(currentUserId: userId) }
        }.value
    }

    @discardableResult
    public func fullSync() async -> Bool {
        guard !isSyncing else { return true }
        isSyncing = true
        defer { isSyncing = false }

        let pageSize = 100
        let userId = await currentUserId()
        let service = self.conversationService
        // Figée AVANT la première écriture : `saveSorted(firstPage)` remplace le
        // cache par la seule page 1, et sans cette baseline les pages suivantes
        // n'auraient plus d'homologue local où retrouver leur frontière de lecture.
        let baseline = await cache.conversations.load(for: "list").snapshot() ?? []

        // Fetch the first page to show something on screen as fast as
        // possible, then fan out to the remaining pages in parallel. On
        // 10k-conversation accounts the old sequential loop took 5-10s
        // before the list was populated; the first-page-first pattern
        // paints the visible rows in ~300ms and the rest arrives in the
        // background without blocking the UI.
        let firstPage: [MeeshyConversation]
        let totalCount: Int?
        let firstPageReturnedCount: Int
        do {
            let response = try await Self.fetchPageWithRetry(via: service, offset: 0, limit: pageSize)
            firstPage = (await Self.mapConversationsOffMain(response.data, userId: userId))
            firstPageReturnedCount = response.data.count
            totalCount = response.pagination?.total
            await saveSorted(firstPage, to: "list", baseline: baseline)
            await SearchIndex.shared.indexConversations(firstPage)
            _conversationsDidChange.send()
        } catch {
            Self.logger.error("[SyncEngine] fullSync first-page error: \(error.localizedDescription)")
            return false
        }

        // If the first page already returned everything, we're done.
        // Heuristic: when the backend gave us a total, trust it; else
        // assume "fewer than requested" means the tail (matches REST
        // pagination convention).
        if let total = totalCount, total <= firstPage.count {
            // Server time, not the device clock (R15b) — authoritative full fetch.
            lastSyncTimestamp = SyncWatermark.fromFullSync(receivedUpdatedAt: firstPage.map(\.updatedAt), fallback: lastSyncTimestamp)
            lastFullReconcileAt = Date()
            return true
        }
        if totalCount == nil && firstPageReturnedCount < pageSize {
            // Fewer items returned than asked for AND no total advertised:
            // the gateway either capped our `limit` (e.g. asked for 100,
            // got 50) OR the user truly has only this many. Defer to the
            // sequential tail loop below — it will probe one more page
            // and stop on `hasMore=false`. This avoids the legacy bug
            // where `firstPage.count >= pageSize` (50 >= 100 = false)
            // forced an early return on accounts with 50–99 conversations.
        }

        // Upper bound on remaining pages. If the backend didn't return a
        // total count, we fall back to sequential paging from page 2 until
        // `hasMore` flips false.
        let remainingPages: [Int]
        if let total = totalCount {
            // Use the *actual* page size delivered by the server (which
            // may be lower than the requested `pageSize` due to its own
            // cap), so subsequent offsets align with real page boundaries
            // rather than our optimistic stride.
            let stride = max(firstPageReturnedCount, 1)
            let totalPages = (total + stride - 1) / stride
            // Each page index `i` maps to offset `i * stride`. We start
            // from page 1 because page 0 is `firstPage`.
            remainingPages = Array(1..<totalPages)
        } else {
            remainingPages = []
        }

        var merged = firstPage
        var succeeded = true

        if !remainingPages.isEmpty {
            // Fan-out: fetch all remaining pages concurrently with a bounded
            // parallelism (4) so we don't hammer the backend on huge
            // accounts. Pages are sorted by offset before merging.
            let stride = max(firstPageReturnedCount, 1)
            let pages: [(Int, [MeeshyConversation])] = await withTaskGroup(
                of: (Int, [MeeshyConversation]?).self,
                returning: [(Int, [MeeshyConversation])].self
            ) { group in
                let maxParallel = 4
                var launched = 0
                var collected: [(Int, [MeeshyConversation])] = []

                while launched < maxParallel && launched < remainingPages.count {
                    let pageIndex = remainingPages[launched]
                    group.addTask {
                        do {
                            let response = try await Self.fetchPageWithRetry(via: service, offset: pageIndex * stride, limit: pageSize)
                            let items = (await Self.mapConversationsOffMain(response.data, userId: userId))
                            return (pageIndex, items)
                        } catch {
                            return (pageIndex, nil)
                        }
                    }
                    launched += 1
                }

                while let result = await group.next() {
                    if let items = result.1 {
                        collected.append((result.0, items))
                    }
                    if launched < remainingPages.count {
                        let pageIndex = remainingPages[launched]
                        group.addTask {
                            do {
                                let response = try await Self.fetchPageWithRetry(via: service, offset: pageIndex * stride, limit: pageSize)
                                let items = (await Self.mapConversationsOffMain(response.data, userId: userId))
                                return (pageIndex, items)
                            } catch {
                                return (pageIndex, nil)
                            }
                        }
                        launched += 1
                    }
                }
                return collected.sorted { $0.0 < $1.0 }
            }

            if pages.count < remainingPages.count {
                succeeded = false
            }

            var uniqueById = Set(merged.map(\.id))
            for (_, page) in pages {
                for item in page where !uniqueById.contains(item.id) {
                    uniqueById.insert(item.id)
                    merged.append(item)
                }
            }

            // Targeted re-fetch of pages the fan-out dropped, BEFORE persisting,
            // so an interior gap (a middle page that failed while later pages
            // succeeded) is filled instead of silently swallowed — the
            // sequential tail starts at `merged.count` and would skip a hole
            // below that count, leaving the cached list permanently incomplete.
            let fetchedIndices = Set(pages.map(\.0))
            let droppedIndices = remainingPages.filter { !fetchedIndices.contains($0) }
            if !droppedIndices.isEmpty {
                var recoveredAll = true
                for pageIndex in droppedIndices {
                    do {
                        let response = try await Self.fetchPageWithRetry(via: service, offset: pageIndex * stride, limit: pageSize)
                        let items = (await Self.mapConversationsOffMain(response.data, userId: userId))
                        for item in items where !uniqueById.contains(item.id) {
                            uniqueById.insert(item.id)
                            merged.append(item)
                        }
                    } catch {
                        recoveredAll = false
                    }
                }
                // Only stay failed if a targeted re-fetch still couldn't recover
                // the page — a transient fan-out failure that the re-fetch fixed
                // must NOT leave the list flagged incomplete.
                succeeded = recoveredAll
            }

            await saveSorted(merged, to: "list", baseline: baseline)
            await SearchIndex.shared.indexConversations(merged)
            _conversationsDidChange.send()
        }

        // Sequential tail: keep fetching until the server says "no more"
        // OR we get an empty page. Runs in TWO cases:
        //   1. We had no `totalCount` — primary fallback path.
        //   2. We had a `totalCount` but the parallel fan-out missed
        //      some pages (race conditions, optimistic stride, server
        //      added conversations mid-sync). This catches them so the
        //      list is provably complete.
        var offset = merged.count
        var hasMore = totalCount == nil
            ? firstPageReturnedCount > 0
            : (offset < (totalCount ?? 0))
        // Hard ceiling on tail iterations as a last-resort safety belt.
        // The progress guards below should always trip first; this keeps
        // a misbehaving gateway from spamming the network indefinitely
        // even if those guards were ever bypassed by a future refactor.
        var tailIterations = 0
        let maxTailIterations = 50
        while hasMore && tailIterations < maxTailIterations {
            tailIterations += 1
            do {
                let response = try await Self.fetchPageWithRetry(via: service, offset: offset, limit: pageSize)
                let page = (await Self.mapConversationsOffMain(response.data, userId: userId))
                let existingIds = Set(merged.map(\.id))
                let newItems = page.filter { !existingIds.contains($0.id) }
                merged.append(contentsOf: newItems)
                if !newItems.isEmpty {
                    await saveSorted(merged, to: "list", baseline: baseline)
                    await SearchIndex.shared.indexConversations(newItems)
                    _conversationsDidChange.send()
                }
                // Trust the backend's `hasMore` if present; otherwise
                // assume "full page = more might follow" so we keep
                // probing instead of stopping at a backend-capped page.
                //
                // We removed the older `data.count == firstPageReturnedCount`
                // heuristic because it created an infinite loop when the
                // gateway consistently returned the same page size (offset
                // was stagnating but the heuristic kept claiming "more
                // might follow"). The `newItems.isEmpty` guard below is the
                // correct stop signal: zero new ids = zero progress.
                let backendHasMore = response.pagination?.hasMore
                if let backendHasMore {
                    hasMore = backendHasMore
                } else {
                    hasMore = response.data.count >= pageSize
                }
                offset += response.data.count
                // Progress guards. STOP when:
                //   - the server returned an empty page (canonical EOF), or
                //   - the page contained ZERO new ids (offset stagnation —
                //     the gateway is replaying the same window). Without
                //     this we hammered `/conversations` forever on a
                //     misconfigured pagination response.
                if response.data.isEmpty || newItems.isEmpty {
                    hasMore = false
                }
            } catch {
                Self.logger.error("[SyncEngine] fullSync tail error: \(error.localizedDescription)")
                succeeded = false
                break
            }
        }
        if tailIterations >= maxTailIterations {
            Self.logger.error("[SyncEngine] fullSync tail aborted after \(maxTailIterations) iterations — pagination likely stuck (offset=\(offset), merged=\(merged.count))")
        }

        if succeeded {
            // Server time, not the device clock (R15b) — authoritative full fetch.
            lastSyncTimestamp = SyncWatermark.fromFullSync(receivedUpdatedAt: merged.map(\.updatedAt), fallback: lastSyncTimestamp)
            lastFullReconcileAt = Date()
        }
        return succeeded
    }

    // MARK: - Delta Sync (foreground / reconnect)

    /// Ce qu'une page delta prouve, au-delà d'avoir abouti.
    private struct DeltaOutcome: Sendable {
        let succeeded: Bool
        /// La fenêtre `updatedSince` contenait plus de lignes que la page n'en
        /// a rendues — donc ce delta ne prouve PAS qu'il a tout vu.
        let mayHaveMore: Bool

        /// Delta abouti sans reste — également l'issue des exécutions SAUTÉES
        /// (sync en cours, anti-rafale) : rien n'a été lu, donc rien n'est
        /// incomplet, et le curseur n'a pas bougé.
        static let complete = DeltaOutcome(succeeded: true, mayHaveMore: false)
        static let failed = DeltaOutcome(succeeded: false, mayHaveMore: false)
    }

    /// Plafond serveur de `GET /conversations` (`Math.min(limit, 100)` dans
    /// `routes/conversations/core.ts`) — jumeau de `DELTA_PAGE_LIMIT`
    /// (`apps/web/hooks/queries/use-conversations-delta-sync.ts`).
    ///
    /// Le demander explicitement plutôt que `500` ne change RIEN au nombre de
    /// lignes rendues ; ça rend la troncature lisible, et ça rend utilisable le
    /// repli `data.count >= deltaPageLimit` du jour où la réponse n'annonce pas
    /// sa pagination — sous `limit=500`, ce repli n'aurait jamais pu déclencher.
    static let deltaPageLimit = 100

    /// JUMEAU WEB — `apps/web/hooks/queries/use-conversations-delta-sync.ts` +
    /// `apps/web/lib/conversations/delta-sync.ts` portent la même règle sur le
    /// cache React Query : même endpoint (`GET /conversations?updatedSince=`),
    /// même upsert par id, même retrait sur `isActive == false`, même repli sur
    /// la vérité serveur quand le delta ne prouve plus sa complétude. Toute
    /// évolution de la règle touche les DEUX plateformes.
    ///
    /// TRONCATURE : `GET /conversations` plafonne à 100
    /// (`Math.min(limit, 100)`, `routes/conversations/core.ts`). Une fenêtre
    /// ayant touché plus de 100 conversations rend donc une page tronquée.
    ///
    /// La route trie DÉSORMAIS une page delta par `updatedAt` croissant (elle
    /// triait par `lastMessageAt` décroissant, sans rapport avec le filtre) :
    /// les lignes coupées sont exactement celles d'`updatedAt` supérieur à la
    /// dernière rendue, donc `lastSyncTimestamp` — avancé au max des `updatedAt`
    /// reçus — pointe dessus au lieu de les enjamber. La troncature est une
    /// pagination, plus une perte.
    ///
    /// RÉSIDU que l'ordre ne rattrape pas : plus de 100 conversations portant la
    /// MÊME milliseconde d'`updatedAt` (écriture en masse) débordent d'une page
    /// que la borne stricte `gt` ne peut pas reprendre. Une page dont le serveur
    /// annonce du reste (`pagination.hasMore`, autoritaire sur une page delta —
    /// voir `deltaSyncCore`) est donc traitée comme une preuve d'INCOMPLÉTUDE,
    /// jamais comme un delta de confiance, et escalade vers `fullSync` —
    /// exactement comme le web escalade vers la relecture complète.
    ///
    /// DIVERGENCE ASSUMÉE avec le web sur le curseur, parce que sa nature
    /// diffère : le web le RECALCULE depuis son cache à chaque exécution, iOS le
    /// PERSISTE. Un curseur persisté avancé sur une page tronquée survivrait à
    /// une escalade échouée et enjamberait les lignes coupées à vie ; iOS ne
    /// l'avance donc pas tant que la page ne prouve pas sa complétude
    /// (`SyncWatermark.advancedAfterDeltaPage`).
    @discardableResult
    public func syncSinceLastCheckpoint() async -> Bool {
        let outcome = await deltaSyncCore()
        // Réconciliation complète, chaînée APRÈS le delta (hors du garde
        // `isSyncing` que le corps tient). Deux raisons de la déclencher, une
        // seule action — fullSync remplace la liste par la vérité serveur :
        //
        // - page laissant du RESTE ⇒ le delta ne PROUVE plus qu'il a tout vu, et
        //   son curseur est resté en arrière pour que la fenêtre reste
        //   rejouable. L'escalade est la seule voie pour combler le reste ET la
        //   seule qui fera repartir le curseur (`SyncWatermark.fromFullSync`) ;
        // - fenêtre de 24 h échue ⇒ purge des fantômes hard-supprimés, que le
        //   delta upsert-only ne peut pas voir. Bornée à 1× par
        //   `fullReconcileInterval` — le delta reste le chemin nominal bon
        //   marché.
        //
        // Seulement sur delta RÉUSSI : offline/panne, on garde le cache intact
        // (local-first) et on retentera au prochain delta.
        if outcome.succeeded && (outcome.mayHaveMore || isFullReconcileDue) {
            await fullSync()
        }
        return outcome.succeeded
    }

    /// PORTÉE DE `reconcileUnread` CÔTÉ WEB — voir le jumeau nommé sur
    /// `syncSinceLastCheckpoint` ci-dessus pour la règle de fusion elle-même.
    ///
    /// `mergeConversationDelta` (`apps/web/lib/conversations/delta-sync.ts`) ne
    /// porte que la RÈGLE 1 de `reconcileUnread` — conversation ouverte ⇒ 0.
    /// La règle 2 (« lecture locale postérieure au dernier message serveur »)
    /// n'a pas de transposition sûre : elle s'appuie sur `userState.lastReadAt`,
    /// frontière LOCALE que le modèle web ne porte pas, et c'est le fait que
    /// `markAsUnread` EFFACE cette frontière qui laisse le compteur serveur
    /// reprendre la main. Une transposition basée sur `unreadCount` +
    /// `lastMessageAt` n'a pas cet interrupteur : elle rendrait un
    /// « marquer comme non lu » cross-device définitivement invisible sur le
    /// web. Fermer l'écart demande de faire voyager la frontière de lecture
    /// jusqu'au modèle web — chantier de contrat, pas garde de fusion.
    private func deltaSyncCore() async -> DeltaOutcome {
        guard !isSyncing else { return .complete }
        // Throttle bursts: when several signals (socket reconnect,
        // foreground return, cache-stale revalidate) fire within the
        // same window, only the first one hits the network. Returning
        // `.complete` is intentional — from the caller's perspective the
        // delta is "fresh enough" since a recent one just landed.
        let now = Date()
        if now.timeIntervalSince(lastDeltaSyncAt) < deltaSyncCooldown {
            return .complete
        }
        lastDeltaSyncAt = now
        isSyncing = true
        defer { isSyncing = false }

        // LE CHEMIN NOMINAL EST `/sync` (#4172 tranche 2b) : UN aller-retour au
        // lieu du rejouage à la main, la requête Prisma rétrécie côté serveur.
        // Le repli vers `GET /conversations?updatedSince=` est NOMMÉ (critère 2)
        // — jamais un `try?` qui fondrait un refus dans une absence de réseau.
        switch await deltaViaSync() {
        case .traite(let outcome):
            return outcome
        case .repli(let raison):
            Self.logger.notice("[SyncEngine] delta /sync → repli \(raison.rawValue) : GET /conversations?updatedSince")
        }

        do {
            let since = lastSyncTimestamp
            let sinceStr = ISO8601DateFormatter().string(from: since)
            let queryItems = [
                URLQueryItem(name: "limit", value: String(Self.deltaPageLimit)),
                URLQueryItem(name: "offset", value: "0"),
                URLQueryItem(name: "updatedSince", value: sinceStr)
            ]

            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.request(
                ConversationsEndpoint.root,
                method: "GET",
                body: nil,
                queryItems: queryItems
            )

            let userId = await currentUserId()
            let deltaConversations = (await Self.mapConversationsOffMain(response.data, userId: userId))

            let existing = await cache.conversations.load(for: "list").snapshot() ?? []

            // O(existing + deltas) merge by id, instead of an O(deltas × convs)
            // firstIndex / removeAll scan per delta — measurable on a foreground
            // reconnect with hundreds of conversations. The merge order is
            // irrelevant: `saveSorted` below re-sorts the result deterministically.
            let (merged, removedIds) = Self.mergeDeltaConversations(
                existing: existing,
                deltas: deltaConversations,
                tombstoneIds: response.meta?.deletedConversationIds ?? []
            )
            let removedSet = Set(removedIds)
            for removedId in removedIds {
                await cache.messages.invalidate(for: removedId)
                // Une conversation sortie de la vue doit aussi cesser d'être
                // TROUVABLE : l'index FTS local est une projection, et rien ne
                // le purgeait — la ligne y survivait au retrait de la liste, et
                // la recherche rendait un id qui ne résout plus.
                await SearchIndex.shared.removeConversation(id: removedId)
            }

            await saveSorted(merged, to: "list", baseline: existing)
            // `removedSet` filtre ici aussi, et pas seulement par symétrie : une
            // conversation SERVIE par la page puis déclarée partie par les
            // tombstones du même lot est active dans `deltaConversations`. La
            // ré-indexer après l'avoir retirée la ressusciterait dans l'index,
            // seule — retirée de la liste, toujours trouvable.
            await SearchIndex.shared.indexConversations(
                deltaConversations.filter { $0.isActive && !removedSet.contains($0.id) }
            )
            _conversationsDidChange.send()

            // Advance the delta cursor to the newest SERVER `updatedAt` seen, not
            // the device clock (R15b) — a device ahead of the server used to push
            // `updatedSince` past real updates in `[serverNow, deviceNow]` and drop
            // them. Never regresses; an empty delta keeps the prior cursor.
            //
            // Et une page qui a laissé du RESTE ne le fait pas avancer du tout :
            // elle n'a pas prouvé qu'elle rendait toute la fenêtre, qui reste
            // donc ouverte pour l'escalade que `syncSinceLastCheckpoint`
            // enchaîne — ou pour le prochain delta si cette escalade échoue. La
            // fusion ci-dessus est conservée dans les deux cas : ce qu'on a reçu
            // est vrai, c'est seulement la COUVERTURE qui n'est pas prouvée.
            //
            // `hasMore` est AUTORITAIRE ici, et pas l'heuristique « la page est
            // pleine » : une page delta part toujours d'`offset=0`, ce qui fait
            // compter au serveur toutes les lignes de la MÊME clause
            // `updatedAt > since` (`prisma.conversation.count({ where:
            // whereClause })`, `routes/conversations/core.ts`) — `hasMore` y vaut
            // `N < total`. Une fenêtre de très exactement 100 conversations ne
            // déclenche donc AUCUNE escalade, là où `count >= limit` en aurait
            // imposé une pour rien. Repli sur l'heuristique si le bloc pagination
            // manque : conservateur, on suppose qu'il en reste.
            let pageMayHaveMore = response.pagination?.hasMore ?? (response.data.count >= Self.deltaPageLimit)

            // Les tombstones ont leur PROPRE plafond (500 par stream côté
            // gateway) et, contrairement à la page, aucun curseur de reprise :
            // il n'existe pas de « page suivante » de disparitions à demander.
            // Leur troncature est donc, elle aussi, une preuve d'incomplétude —
            // et elle se règle par le MÊME geste, l'escalade vers `fullSync`,
            // dont le remplacement de la liste purge les fantômes restants.
            //
            // La replier dans `mayHaveMore` retient aussi le curseur, et c'est
            // voulu : seul un `since` qui reste en place redemandera les
            // disparitions coupées si l'escalade échoue (offline, panne). Un
            // curseur avancé les rendrait irréclamables — la borne serveur des
            // tombstones est `> since`, exactement comme celle de la page.
            let tombstonesTruncated = response.meta?.deletedConversationIdsTruncated ?? false
            let mayHaveMore = pageMayHaveMore || tombstonesTruncated
            lastSyncTimestamp = SyncWatermark.advancedAfterDeltaPage(
                previous: lastSyncTimestamp,
                receivedUpdatedAt: deltaConversations.map(\.updatedAt),
                pageMayHaveMore: mayHaveMore
            )
            return DeltaOutcome(succeeded: true, mayHaveMore: mayHaveMore)
        } catch {
            Self.logger.error("[SyncEngine] deltaSync error: \(error.localizedDescription)")
            return .failed
        }
    }

    // MARK: - Delta via /sync (#4172 tranche 2b)

    /// POURQUOI le repli est une ÉNUMÉRATION : le critère 2 de #4172 interdit le
    /// `try?` silencieux — chaque retour au chemin historique DIT sa raison au
    /// journal, et un futur drapeau de bascule s'y ajoutera comme un cas, pas
    /// comme un booléen anonyme.
    enum RaisonDuRepliDeSync: String, Sendable {
        case creanceAbsente = "creance-absente"
        case survolMuet = "survol-muet"
    }

    private enum CheminDuDelta {
        case traite(DeltaOutcome)
        case repli(RaisonDuRepliDeSync)
    }

    /// Le `checkpoint` servi porte des MILLISECONDES (`.000Z`) — le formateur
    /// nu les refuse ; le repli sans fractions couvre un serveur qui n'en
    /// servirait pas.
    // `ISO8601DateFormatter` est thread-safe (documenté) ; le marqueur dit
    // au compilateur ce que la doc garantit.
    nonisolated(unsafe) private static let formatterDuCheckpoint: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private func clientDeSync() -> SyncDeltaClientProviding {
        syncDeltaOverride ?? SyncDeltaClient(baseURL: api.baseURL)
    }

    private func creanceDeSync() -> SyncDeltaCredential? {
        if let jeton = api.authToken { return .membre(jeton: jeton) }
        if let session = api.anonymousSessionToken { return .invite(session: session) }
        return nil
    }

    /// LE DELTA PAR `/sync` — la collection `conversations`, le `seq` ANNONCÉ
    /// (sans lui la passerelle ne calcule jamais de trou, `routes/sync/index.ts`),
    /// et le curseur SERVEUR (`checkpoint`) comme watermark.
    ///
    /// LES LIGNES SERVIES SONT PLUS MAIGRES QUE CELLES DU CACHE
    /// (`syncConversationSelect` : ~21 colonnes, ni aperçu, ni non-lus, ni
    /// participants). Les REMPLACER détruirait ce que le cache sait — le motif
    /// « modèle plus strict que le fil » à l'envers. Chaque ligne reçue est donc
    /// FUSIONNÉE dans l'existante : les champs que `/sync` sert avancent, le
    /// reste ne bouge pas (`fusionneLigneDeSync`).
    private func deltaViaSync() async -> CheminDuDelta {
        guard let creance = creanceDeSync() else { return .repli(.creanceAbsente) }

        let demande = SyncDeltaRequest(
            since: ISO8601DateFormatter().string(from: lastSyncTimestamp),
            collections: ["conversations"],
            seq: await SyncSeqTracker.shared.lastSeq.flatMap { Int(exactly: $0) }
        )
        let issue: SyncDeltaOutcome<APIConversation> = await clientDeSync()
            .demandeLeDelta(demande, creance: creance, rangeant: APIConversation.self)

        switch issue {
        case .muet:
            return .repli(.survolMuet)
        case .inchange:
            // La fenêtre n'a pas bougé : rien à peindre, rien à avancer.
            return .traite(.complete)
        case let .delta(delta, _):
            let collection = delta.collections["conversations"]
            let recues = (collection?.added ?? []) + (collection?.modified ?? [])
            let supprimees = collection?.deleted ?? []

            let existing = await cache.conversations.load(for: "list").snapshot() ?? []
            let parId = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })

            let userId = await currentUserId()
            let mappees = await Self.mapConversationsOffMain(recues, userId: userId)
            let deltaConversations = mappees.map { Self.fusionneLigneDeSync(existante: parId[$0.id], recue: $0) }

            let (merged, removedIds) = Self.mergeDeltaConversations(
                existing: existing,
                deltas: deltaConversations,
                tombstoneIds: supprimees
            )
            let removedSet = Set(removedIds)
            for removedId in removedIds {
                await cache.messages.invalidate(for: removedId)
                await SearchIndex.shared.removeConversation(id: removedId)
            }
            await saveSorted(merged, to: "list", baseline: existing)
            await SearchIndex.shared.indexConversations(
                deltaConversations.filter { $0.isActive && !removedSet.contains($0.id) }
            )
            _conversationsDidChange.send()

            // LE WATERMARK EST LE CURSEUR SERVEUR. `checkpoint` est l'horloge de
            // la passerelle — jamais celle de l'appareil (R15b) — et il n'avance
            // que sur une fenêtre PROUVÉE complète : `hasMore` laisse le curseur
            // en place pour que la fenêtre reste rejouable, `hasGap` dit que
            // l'absence dépasse ce que le serveur sait rejouer — les deux
            // escaladent vers `fullSync` par le chemin existant de l'appelant.
            let incomplet = delta.hasMore || delta.hasGap
            if !incomplet, let checkpoint = delta.checkpoint,
               let date = Self.formatterDuCheckpoint.date(from: checkpoint) ?? ISO8601DateFormatter().date(from: checkpoint) {
                lastSyncTimestamp = max(lastSyncTimestamp, date)
            }
            return .traite(DeltaOutcome(succeeded: true, mayHaveMore: incomplet))
        }
    }

    /// LA FUSION PAR CHAMPS SERVIS — l'exact miroir de `syncConversationSelect`
    /// (`routes/sync/conversations.ts`) : ce que `/sync` sert avance, ce qu'il
    /// ne sert pas (aperçu, traductions, non-lus, participants, préférences,
    /// rôle courant) reste au cache. Un champ ajouté au select serveur doit
    /// s'ajouter ICI — le témoin de préservation
    /// (`ConversationSyncEngineTests`) rougit si une ligne maigre efface ce
    /// qu'elle ne portait pas.
    static func fusionneLigneDeSync(existante: MeeshyConversation?, recue: MeeshyConversation) -> MeeshyConversation {
        guard var fusion = existante else { return recue }
        // Ce que `/sync` SERT avance — verbatim, y compris ses `nil` (un titre
        // effacé côté serveur est une valeur, pas une absence).
        fusion.title = recue.title
        fusion.description = recue.description
        fusion.avatar = recue.avatar
        fusion.banner = recue.banner
        fusion.communityId = recue.communityId
        fusion.isActive = recue.isActive
        fusion.memberCount = recue.memberCount
        fusion.lastMessageAt = recue.lastMessageAt
        fusion.encryptionMode = recue.encryptionMode
        fusion.updatedAt = recue.updatedAt
        fusion.slowModeSeconds = recue.slowModeSeconds
        fusion.autoTranslateEnabled = recue.autoTranslateEnabled
        fusion.closedAt = recue.closedAt
        // Ce que `/sync` NE SERT PAS ne bouge pas : `userState` (non-lus, nom
        // personnalisé), l'aperçu et ses traductions, les pièces, les
        // participants, le rôle courant, les vignettes — et la palette (`let`),
        // qui reste celle de la ligne existante par construction.
        return fusion
    }

    /// Merge a batch of delta conversations into `existing` by id. Active deltas
    /// upsert (replace-or-insert); inactive deltas remove. Returns the merged
    /// list plus every inactive delta id (so the caller can invalidate their
    /// message caches, exactly as the previous per-delta loop did). The merged
    /// order is intentionally unspecified — callers re-sort via `saveSorted`.
    /// O(existing + deltas) instead of O(deltas × existing).
    ///
    /// `tombstoneIds` (`meta.deletedConversationIds`) est le TROISIÈME canal, et
    /// le seul par lequel une SORTIE de vue parvient au client : `deltas` ne
    /// porte que des lignes servies, et la clause serveur exclut précisément une
    /// conversation fermée, quittée, bannie ou supprimée-pour-moi depuis un
    /// autre appareil. Un `isActive: false` ne suffisait donc pas — il ne décrit
    /// que les sorties que la page peut encore SERVIR.
    ///
    /// Les tombstones s'appliquent APRÈS les upserts, jamais avant : quand les
    /// deux flux du même lot se contredisent (la page a servi une ligne encore
    /// visible à la lecture, le stream des sorties la déclare partie), la SORTIE
    /// est le fait le plus spécifique. La garder affichée rendrait la purge
    /// inatteignable jusqu'à la réconciliation complète (24 h).
    static func mergeDeltaConversations(
        existing: [MeeshyConversation],
        deltas: [MeeshyConversation],
        tombstoneIds: [String] = []
    ) -> (merged: [MeeshyConversation], removedIds: [String]) {
        var byId = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        var removedIds: [String] = []
        // `removedIds` pilote une invalidation par id chez l'appelant : un même
        // retrait annoncé par les DEUX canaux ne doit la déclencher qu'une fois.
        var alreadyRemoved = Set<String>()
        for delta in deltas {
            if delta.isActive {
                byId[delta.id] = delta
            } else {
                byId.removeValue(forKey: delta.id)
                if alreadyRemoved.insert(delta.id).inserted { removedIds.append(delta.id) }
            }
        }
        // Un id inconnu de la liste est rapporté quand même — même règle que
        // pour un delta inactif inconnu : la liste et le cache des messages sont
        // deux magasins DISTINCTS, et une conversation absente de l'une peut
        // très bien laisser un fil dans l'autre. (Divergence assumée avec le
        // web, dont le cache dérivé est indexé par la même clé que la liste.)
        for tombstoneId in tombstoneIds {
            byId.removeValue(forKey: tombstoneId)
            if alreadyRemoved.insert(tombstoneId).inserted { removedIds.append(tombstoneId) }
        }
        return (Array(byId.values), removedIds)
    }

    // MARK: - Messages

    public func ensureMessages(for conversationId: String, force: Bool) async {
        if !force {
            let cached = await cache.messages.load(for: conversationId)
            switch cached {
            case .fresh:
                return
            case .stale, .expired, .empty:
                break
            }
        }

        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true, includeTranslations: true, languages: nil
            )
            let userId = await currentUserId(); let username = await currentUsername()
            let preferredLanguages = await currentPreferredLanguages()
            if let mentionedUsers = response.meta?.mentionedUsers {
                UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
            }
            let freshMessages = response.data.map { $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: preferredLanguages) }
            // Atomic merge: keep any messages that arrived via socket between the
            // REST request and this write, so they are never silently overwritten.
            await cache.messages.mergeUpdate(for: conversationId) { existing in
                let freshIds = Set(freshMessages.map(\.id))
                let fromCacheOnly = existing.filter { !freshIds.contains($0.id) }
                return (freshMessages + fromCacheOnly).sorted { $0.createdAt < $1.createdAt }
            }
            // Mirror the fetched window into the app's on-device message store
            // so the conversation timeline (GRDB-backed) is already current
            // when the user opens it — the push-notification handler routes
            // through here with `force: true` precisely for that purpose.
            await apiMessagePersistor?(response.data)
            _messagesDidChange.send(conversationId)
        } catch {
            Self.logger.error("[SyncEngine] ensureMessages error: \(error.localizedDescription)")
        }
    }

    public func fetchOlderMessages(for conversationId: String, before messageId: String) async {
        do {
            let response = try await messageService.listBefore(
                conversationId: conversationId, before: messageId, limit: 30, includeReplies: true, includeTranslations: true, languages: nil
            )
            let userId = await currentUserId(); let username = await currentUsername()
            let preferredLanguages = await currentPreferredLanguages()
            let olderMessages = response.data.map { $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: preferredLanguages) }

            // Atomic merge: prepend older messages without overwriting any
            // messages that arrived via socket between the REST fetch and now.
            await cache.messages.mergeUpdate(for: conversationId) { existing in
                let existingIds = Set(existing.map(\.id))
                let newOnly = olderMessages.filter { !existingIds.contains($0.id) }
                return newOnly + existing
            }
            await apiMessagePersistor?(response.data)
            _messagesDidChange.send(conversationId)
        } catch {
            Self.logger.error("[SyncEngine] fetchOlderMessages error: \(error.localizedDescription)")
        }
    }

    // MARK: - Retention Cleanup

    public func cleanupRetentionIfNeeded() async {
        if let lastCleanup = lastCleanupDate,
           Date().timeIntervalSince(lastCleanup) < 86400 {
            return
        }

        let oneYearAgo = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
        let convs = await cache.conversations.load(for: "list").snapshot() ?? []

        for conv in convs {
            let messages = await cache.messages.load(for: conv.id).snapshot() ?? []
            guard messages.count > 600 else { continue }

            let recentByDate = messages.filter { $0.createdAt > oneYearAgo }
            let recentByCount = Array(messages.suffix(600))

            let toKeep = recentByDate.count > recentByCount.count ? recentByDate : recentByCount

            if toKeep.count < messages.count {
                do {
                    try await cache.messages.save(toKeep, for: conv.id)
                } catch {
                    Logger.cache.error("ConversationSyncEngine cleanup save failed for \(conv.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        lastCleanupDate = Date()
    }

}
