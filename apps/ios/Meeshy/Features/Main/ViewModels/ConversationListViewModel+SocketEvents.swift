import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

extension ConversationListViewModel {

    // MARK: - Real-time Socket Subscriptions

    /// Le Prisme de la ligne porté par `conversation:updated`, quand le serveur
    /// en parle. `nil` = `.unchanged` = « cet événement ne parle pas d'aperçu »
    /// (renommage, avatar) : la carte du cache survit. Une carte VIDE, elle,
    /// est un fait — le serveur DIT que la traduction est périmée.
    ///
    /// La paire voyage ensemble et jamais séparément : le résolveur de la ligne
    /// (`resolvedLastMessagePreview`) PRÉFÈRE la traduction à `lastMessagePreview`,
    /// donc poser l'un sans l'autre laisse la ligne rendre l'ANCIEN texte traduit.
    /// Règle recopiée de `ConversationStore.merging` (SDK), seule formulation de
    /// référence — les deux doivent bouger ensemble.
    private static func replacedPrism(
        from event: ConversationUpdatedEvent
    ) -> (map: [String: String], originalLanguage: String?)? {
        guard case .replaced(let map) = event.lastMessageTranslations else { return nil }
        return (map, event.lastMessageOriginalLanguage)
    }

    func subscribeToSocketEvents() {
        // (Retiré) abonnement à `messageSocket.userPreferencesUpdated`.
        //
        // Ce sink greffait pin/mute/archive/section/réaction/tags sur la ligne
        // NOMMÉE par `event.conversationId`, derrière un `guard … else { return }`
        // — et ce guard ne pouvait plus jamais passer. Depuis que l'union
        // `user:preferences-updated` a été scindée en deux publishers, le site de
        // décodage (`MessageSocketManager`) route toute charge portant un
        // `conversationId` vers `userPreferencesConversationUpdated` ; le publisher
        // plat ne porte, par construction, que le scope CATÉGORIE (`{ userId,
        // category }`), donc `conversationId == nil` à chaque émission.
        //
        // Le scope conversation ne perd rien : il arrive par
        // `ConversationStoreSocketBridge` → `ConversationStore.applyRemote` →
        // `observeStore()` → `mergeUserStateFromStore`, source de vérité de
        // `userState` pour cette liste. Ce sink était donc mort ET redondant —
        // mais il faisait paraître le publisher plat ABONNÉ, et rendait par là
        // invisible le fait que le scope qu'il porte réellement (les sept
        // catégories user-level) n'avait aucun lecteur sur iOS. Il en a un
        // depuis #4201 : `UserPreferencesManager.observeRemotePreferenceBroadcast`.

        messageSocket.conversationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard let index = self.convIndex(for: event.conversationId) else {
                    // Conversation pas encore connue côté client : c'est le cas
                    // d'un DM tout neuf (ou d'un groupe qu'on vient d'ajouter
                    // à l'utilisateur) où le gateway a déjà émis
                    // CONVERSATION_UPDATED dans ROOMS.user(self) MAIS
                    // self n'a jamais reçu MESSAGE_NEW (il n'avait pas joint
                    // ROOMS.conversation(id) avant ce moment). Sans fetch
                    // d'appoint la conversation reste invisible jusqu'à un
                    // pull-to-refresh manuel.
                    self.fetchAndPrependMissingConversation(id: event.conversationId, source: .socketUpdated)
                    return
                }
                // Apply the in-place metadata updates first; the gateway
                // can piggy-back rename/avatar changes on the same event
                // that carries lastMessageAt, so we want the row data fresh
                // BEFORE we bump it to position 0 (otherwise the bumped
                // row would render stale title for one frame).
                // Un DM n'est jamais renommable : son `title` client est le
                // nom du participant, dérivé à la conversion REST
                // (`toConversation` écarte le titre DB). Le payload socket
                // porte le titre BRUT — le greffer sur un DM écrase le nom
                // affiché (« sandra raveloson » → « Sany » au premier
                // pin/mute, vu 2026-07-04). Greffe réservée aux
                // conversations renommables.
                if let title = event.title, self.conversations[index].type != .direct {
                    self.conversations[index].title = title
                }
                if let description = event.description { self.conversations[index].description = description }
                if let avatar = event.avatar { self.conversations[index].avatar = avatar }
                if let banner = event.banner { self.conversations[index].banner = banner }
                if let isAnnouncement = event.isAnnouncementChannel {
                    self.conversations[index].isAnnouncementChannel = isAnnouncement
                }
                if let writeRole = event.defaultWriteRole {
                    self.conversations[index].defaultWriteRole = writeRole
                }
                if let slowMode = event.slowModeSeconds {
                    self.conversations[index].slowModeSeconds = slowMode
                }
                if let autoTranslate = event.autoTranslateEnabled {
                    self.conversations[index].autoTranslateEnabled = autoTranslate
                }
                // Bump the row to the top when the gateway tells us a new
                // message advanced lastMessageAt. We compare strictly
                // greater-than so a re-broadcast of the same timestamp
                // (e.g. metadata-only update echoed back to the user
                // room) doesn't pointlessly reshuffle the list and
                // trigger a re-render of every cell behind it.
                //
                // L'identifiant et le texte que porte l'événement voyagent DANS
                // la facette. Les poser sur la ligne avant l'appel les faisait
                // effacer par la remise à neutre du bump une ligne plus bas :
                // la ligne restait muette jusqu'à la synchro suivante alors même
                // que le gateway venait d'envoyer le texte.
                //
                // Le Prisme voyage avec l'aperçu. Extrait UNE fois : les deux
                // branches ci-dessous en ont besoin, chacune à sa façon.
                let replacedPrism = Self.replacedPrism(from: event)
                if let newLastAt = event.lastMessageAt,
                   newLastAt > self.conversations[index].lastMessageAt {
                    Logger.messages.debug("[conversationUpdated] bump websocket id=\(event.conversationId, privacy: .public)")
                    // Le payload message-driven ne porte que `senderId` (jamais
                    // `updatedBy`, réservé aux mises à jour de métadonnées — cf.
                    // ConversationUpdatedEvent). Pour un DM, l'auteur d'un NOUVEAU
                    // message est forcément l'autre participant : on résout son nom
                    // depuis les champs déjà en mémoire sur la ligne (aucun aller-
                    // retour réseau/cache), pour que la ligne affiche l'auteur dès
                    // ce bump au lieu d'attendre la prochaine synchro (#9359 : avec l'id du pair).
                    // #6921 — la règle a QUITTÉ ce site pour `ConversationListAuthor`.
                    // Le repli DM ci-dessus était juste et incomplet : il ne
                    // couvrait pas MON PROPRE message (`senderId == moi`, donc
                    // jamais le pair ⇒ `nil`), ce qui retirait le préfixe de la
                    // ligne à chaque envoi. Et il ignorait `lastMessageSenderName`,
                    // que la passerelle sert et que le décodeur jetait.
                    // Message NEUF : « rien d'affirmé » vaut « aucun auteur » —
                    // celui de l'ancien message ne s'hérite pas (garde anti-périmé).
                    // `senderId` est un id de PARTICIPANT : « Vous » se reconnaît
                    // aussi à `updatedBy`, l'id UTILISATEUR de l'auteur (#7612).
                    let resolvedSenderName = ConversationListAuthor.resolve(
                        event, readerId: self.currentUserId,
                        row: self.conversations[index], youLabel: Self.youAuthorLabel
                    ).displayedNameForNewMessage
                    let resolvedSenderUserId = ConversationListAuthor.peerUserId(senderUserId: event.messageSenderUserId, senderName: resolvedSenderName, readerId: self.currentUserId, youLabel: Self.youAuthorLabel)
                    self.bumpToTop(
                        conversationId: event.conversationId,
                        facet: LastMessageFacet(
                            // `…IdValue` : cette branche décrit un message NEUF
                            // (`newLastAt` a AVANCÉ), donc « clé absente » et
                            // « plus aucun message » y sont hors sujet — un
                            // vidage n'avance jamais d'horodatage.
                            id: event.lastMessageIdValue,
                            preview: event.lastMessagePreview,
                            senderName: resolvedSenderName, senderUserId: resolvedSenderUserId,
                            at: newLastAt,
                            // La facette décrit UN message : la carte du message
                            // PRÉCÉDENT n'est pas la sienne, donc `.unchanged`
                            // vaut `nil` ici (neutre) et non « conserver ».
                            translations: replacedPrism?.map,
                            originalLanguage: replacedPrism?.originalLanguage,
                            location: event.location
                        )
                    )
                } else if case .replaced(.none) = event.lastMessage {
                    // « Plus AUCUN message visible ici » : le lecteur vient de
                    // masquer POUR LUI le dernier qui lui restait. Tout le
                    // groupe d'aperçu arrive à `null`, et les `if let` de la
                    // branche suivante le jetteraient champ par champ — la
                    // ligne garderait l'aperçu de ce qui vient de disparaître,
                    // et pour toujours : plus rien ne bougera dans cette
                    // conversation pour le faire remplacer.
                    //
                    // Le vidage passe par le geste CENTRAL du modèle : la ligne
                    // dit plus que son texte (pièce jointe, expéditeur, épingle
                    // de position, « Message expiré »), et n'en effacer qu'une
                    // partie laisserait le reste décrire le message masqué.
                    //
                    // `lastMessageAt` reste en place — voir `clearLastMessage` :
                    // c'est le rang GLOBAL de la ligne, qu'un masquage personnel
                    // ne change pour personne.
                    if self.conversations[index].clearLastMessage() {
                        self.schedulePersist()
                    }
                } else {
                    if case .replaced(.some(let msgId)) = event.lastMessage {
                        // Nommer un AUTRE message, c'est cesser de décrire le
                        // précédent. Ce payload-ci ne porte que l'identité, le
                        // texte et le Prisme — jamais l'auteur, les pièces
                        // jointes ni les drapeaux éphémères, que
                        // `emitConversationPreviewUpdate` ne lit même pas. Sans
                        // ce geste, une suppression pour tous du dernier
                        // message laissait la ligne rendre l'aperçu du
                        // remplaçant sous la vignette, l'auteur et le « Vue
                        // unique » du message supprimé. Muet quand l'identité
                        // ne change pas : à l'édition et à la traduction, ces
                        // champs restent vrais.
                        self.conversations[index].adoptLastMessage(id: msgId)
                        // Écrite AVEC l'id (chemin message-driven) et jamais
                        // seule : `nil` efface la pastille du message précédent
                        // quand un texte le remplace au même horodatage.
                        self.conversations[index].lastMessageLocation = event.location
                    }
                    if let preview = event.lastMessagePreview {
                        self.conversations[index].lastMessagePreview = preview.meeshyPreviewTruncated
                    }
                    // L'auteur est REPOSÉ au même titre que l'aperçu, et pour la
                    // même raison (#6921) : `adoptLastMessage` vient de l'effacer
                    // — à raison, un nouveau message n'ayant pas l'auteur de
                    // l'ancien — et rien ne le remettait. La ligne montrait alors
                    // le texte sans son préfixe. `nil` reste `nil` : quand
                    // l'événement n'affirme aucun auteur, la garde anti-périmé
                    // s'applique inchangée.
                    // MÊME message (édition, traduction) : « rien d'affirmé »
                    // vaut GARDER. Écrire `nil` ici effaçait l'auteur à chaque
                    // édition de légende — ce que le témoin
                    // `…editingTheSameMessage_keepsItsDescription` a attrapé.
                    if case .display(let auteur) = ConversationListAuthor.resolve(
                        event, readerId: self.currentUserId,
                        row: self.conversations[index], youLabel: Self.youAuthorLabel
                    ) {
                        self.conversations[index].lastMessageSenderName = auteur
                    }
                    // Appliquée AU MÊME TITRE que l'aperçu, et au même endroit :
                    // la paire doit rester cohérente, sinon on recrée le mélange
                    // exact que le tri-état sert à empêcher — texte neuf, carte
                    // de l'ancien, et le résolveur qui préfère la carte. C'est
                    // le cas de l'ÉDITION : même `lastMessageId`, horodatage
                    // ÉGAL, contenu changé, `translations: null` reçu.
                    // `.replaced([:])` → `nil` : le résolveur distingue « pas de
                    // carte » d'une carte vide.
                    if let prism = replacedPrism {
                        self.conversations[index].lastMessageTranslations =
                            prism.map.isEmpty ? nil : prism.map
                        self.conversations[index].lastMessageOriginalLanguage = prism.originalLanguage
                    }
                    // L'horodatage, lui, ne suivait PAS l'aperçu quand celui-ci
                    // recule — la branche ci-dessus n'est atteinte que si
                    // `lastMessageAt` n'a pas avancé, et rien ne le réécrivait.
                    //
                    // Un recalcul autoritatif du serveur recule légitimement :
                    // supprimer le dernier message POUR TOUS fait redescendre la
                    // ligne sur le message précédent. L'aperçu et l'id
                    // s'appliquaient bien, mais la ligne gardait l'horodatage du
                    // message supprimé — donc sa PLACE dans la liste, triée par
                    // `lastMessageAt` décroissant. La ligne affichait le bon
                    // texte au mauvais rang, jusqu'à la synchro suivante.
                    //
                    // Réservé au drapeau : sans lui, un horodatage qui recule
                    // décrit un message périmé (diffusion arrivée dans le
                    // désordre) et doit rester ignoré — c'est la raison d'être
                    // du `>` strict au-dessus. Seul l'émetteur les distingue.
                    //
                    // Pas de re-tri explicite : les sections d'affichage trient
                    // à la construction (`conversationsAreInOrder`), donc la
                    // place se corrige au prochain rendu.
                    if event.previewRecalculated, let recalculatedAt = event.lastMessageAt {
                        self.conversations[index].lastMessageAt = recalculatedAt
                    }
                    // Metadata-only mutation (rename, avatar swap, broadcast
                    // toggle) still needs to land in L2 so a cold restart
                    // doesn't show the pre-event title for a frame. bumpToTop
                    // already calls schedulePersist when it runs.
                    self.schedulePersist()
                }
            }
            .store(in: &cancellables)

        // Primary discovery path for newly-created conversations.
        //
        // Per the 2026-05-11 socket-event audit (see
        // tasks/socketio-events-cleanup.md), the gateway now emits a typed
        // `conversation:new` event to the user-rooms of EVERY participant —
        // creator included — when a conversation is created. Before this,
        // the creator received no socket signal at all (the legacy
        // notification:new loop in core.ts:922 only iterated over
        // `uniqueParticipantIds`, excluding `userId`), and invitees relied
        // on a string-discriminated `notification:new` with type
        // `new_conversation_*`. The typed event removes both quirks.
        //
        // We still subscribe to the legacy `notification:new` block below
        // as a fallback for ~3 months while older clients/server versions
        // are in production. `pendingMissingFetches` dedups the two paths
        // when both fire for the same id within a few hundred ms.
        messageSocket.conversationNew
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self,
                      self.convIndex(for: event.conversationId) == nil else { return }
                self.fetchAndPrependMissingConversation(id: event.conversationId, source: .socketNew)
            }
            .store(in: &cancellables)

        // Legacy path: pre-CONVERSATION_NEW gateway sends a generic
        // `notification:new` with `type=new_conversation_direct|group|added_to_conversation`.
        // Kept active during the ~3-month rollout window so older gateways
        // still surface fresh conversations. Once min-deployed-server-version
        // ships CONVERSATION_NEW everywhere, this branch can be removed.
        messageSocket.notificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                switch event.type {
                case "new_conversation_direct",
                     "new_conversation_group",
                     "added_to_conversation":
                    guard let convId = event.context?.conversationId,
                          self.convIndex(for: convId) == nil else { return }
                    self.fetchAndPrependMissingConversation(id: convId, source: .socketNotification)
                default:
                    break
                }
            }
            .store(in: &cancellables)

        // Le pendant montant de `participantSelfLeft`, et il a longtemps manqué :
        // l'effectif ne connaissait que des soustractions (départ, retrait,
        // bannissement) et dérivait durablement vers le bas — `schedulePersist`
        // écrivant chaque valeur fausse dans le cache disque.
        //
        // Il ne pouvait PAS s'écouter sur `conversationJoined` : cet événement
        // porte aussi l'ack self-only du socket qui REJOINT LA ROOM, que produit
        // chaque ouverture de fil, avec le même payload. `participantJoined`
        // (`conversation:participant-joined`) ne porte que l'adhésion.
        //
        // Le nouvel arrivant s'écarte lui-même : le serveur l'omet de l'éventail,
        // mais l'auto-join de room côté serveur est asynchrone et pourrait le
        // faire entrer dans la room de conversation avant l'emit. Son effectif
        // lui vient de `conversation:new`, qui le compte déjà.
        messageSocket.participantJoined
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, event.userId != self.currentUserId else { return }
                guard let index = self.convIndex(for: event.conversationId) else { return }
                let resolved = Self.memberCountAfterMembershipEvent(
                    current: self.conversations[index].memberCount,
                    currentCapped: self.conversations[index].memberCountCapped,
                    absolute: event.memberCount,
                    absoluteCapped: event.memberCountCapped,
                    delta: +1
                )
                self.conversations[index].memberCount = resolved.count
                self.conversations[index].memberCountCapped = resolved.capped
                self.schedulePersist()
            }
            .store(in: &cancellables)

        // Quand le partant est MOI, l'événement ne dit pas « l'effectif a
        // changé » — il dit « cette conversation n'est plus la mienne ». Le cas
        // se produit sans rien faire d'anormal : quitter depuis le web, ou être
        // retiré par un admin pendant que l'app est ouverte sur la liste. Le
        // gateway adresse désormais la room personnelle du partant pour que le
        // signal y arrive (`leave.ts`, `participants.ts`) ; la room de
        // conversation, elle, ne portait que l'appareil ayant le FIL ouvert.
        //
        // Poser un compteur sur une ligne que `GET /conversations` ne sert plus
        // (`participants.some({ userId, isActive: true })`) la laissait
        // cliquable — et `schedulePersist` l'écrivait dans le cache disque.
        // Seul le tombstone du prochain delta la retirait.
        messageSocket.participantSelfLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                // Deux faces d'une identité — cf. `ParticipantLeftEvent.names(_:)`.
                if event.names(self.currentUserId) {
                    self.dropConversationLeftByMe(at: index)
                    return
                }
                let resolved = Self.memberCountAfterMembershipEvent(
                    current: self.conversations[index].memberCount,
                    currentCapped: self.conversations[index].memberCountCapped,
                    absolute: event.memberCount,
                    absoluteCapped: event.memberCountCapped,
                    delta: -1
                )
                self.conversations[index].memberCount = resolved.count
                self.conversations[index].memberCountCapped = resolved.capped
                self.schedulePersist()
            }
            .store(in: &cancellables)

        // Un bannissement ne retire pas toujours une appartenance : bannir
        // quelqu'un DÉJÀ parti est ce qui l'empêche de revenir par un lien de
        // partage, et ne change rien à l'effectif. Décompter quand même ferait
        // dériver le compteur vers le bas — durablement, puisque `schedulePersist`
        // écrit la valeur fausse dans le cache local.
        messageSocket.participantBanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                // Être banni est la troisième fin d'appartenance, après le
                // départ volontaire et le retrait par un admin, et elle se
                // traite comme les deux autres. Le test d'identité passe AVANT
                // le court-circuit `didEndMembership` : celui-ci protège un
                // COMPTEUR, or il n'y a pas de compteur à protéger sur une
                // ligne qui s'en va. Un ban qui suit un départ non synchronisé
                // porte précisément `membershipEnded: false`, et c'est le cas
                // où la ligne fantôme est encore là.
                // `names(_:)` et non `isMe(event.userId)` : une identité iOS est un
                // `User.id` pour un compte et un `Participant.id` pour un
                // visiteur de lien partagé, et l'événement porte les deux faces.
                if let self, event.names(self.currentUserId),
                   let index = self.convIndex(for: event.conversationId) {
                    self.dropConversationLeftByMe(at: index)
                    return
                }
                // L'effectif absolu tranche `didEndMembership` de lui-même :
                // bannir un ex-membre ne retire personne, donc le compte est
                // simplement inchangé et le POSER est exact dans les deux cas.
                // Le court-circuit ne subsiste que pour un gateway qui ne
                // l'envoie pas. Miroir de `handleConversationParticipantBanned`
                // (`apps/web/hooks/queries/use-socket-cache-sync.ts`).
                guard event.memberCount != nil || event.didEndMembership else { return }
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                let resolved = Self.memberCountAfterMembershipEvent(
                    current: self.conversations[index].memberCount,
                    currentCapped: self.conversations[index].memberCountCapped,
                    absolute: event.memberCount,
                    absoluteCapped: event.memberCountCapped,
                    delta: -1
                )
                self.conversations[index].memberCount = resolved.count
                self.conversations[index].memberCountCapped = resolved.capped
                self.schedulePersist()
            }
            .store(in: &cancellables)

        // Symétrique : lever le bannissement de quelqu'un qui était parti de
        // lui-même le rend libre de revenir, mais ne le fait pas rentrer.
        messageSocket.participantUnbanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                // Même lecture qu'au bannissement : présent, l'effectif absolu
                // tranche `didRestoreMembership`.
                guard event.memberCount != nil || event.didRestoreMembership else { return }
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                let resolved = Self.memberCountAfterMembershipEvent(
                    current: self.conversations[index].memberCount,
                    currentCapped: self.conversations[index].memberCountCapped,
                    absolute: event.memberCount,
                    absoluteCapped: event.memberCountCapped,
                    delta: +1
                )
                self.conversations[index].memberCount = resolved.count
                self.conversations[index].memberCountCapped = resolved.capped
                self.schedulePersist()
            }
            .store(in: &cancellables)

        // `didReconnect` ne joue ICI aucun delta : le relais du moteur en joue un
        // seul par reconnexion, revenu par `conversationsDidChange` (audit
        // 2026-05-11 : deux abonnés doublaient les `/conversations`). Il ne
        // rejoue que le préchargement — maintenant, et au rechargement suivant (#10572).
        messageSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.messagePrefetcher.armForNextReload()
                self?.prefetchTopConversationMessages()
            }
            .store(in: &cancellables)
    }
}
