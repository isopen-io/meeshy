## 2026-11-03 : Toucher une entrée de la pastille mène TOUJOURS quelque part, par une loi unique pour les deux racines (#15741)

**Contexte.** Demande du porteur du 2026-11-03 (chantier #15537) : la pastille dit qui écrit et mène à la conversation. Deux `switch source` jumeaux (`RootView.handleSyncPillTap`, `iPadRootView+Navigation.handleSyncPillTap`) répondaient « rien » pour une conversation absente du cache (journal « not in cache, skipping »), pour une story (« V1 no-op ») et pour une source inconnue ; et `SyncPill` appelait `onTap(source)` sans savoir que la racine n'avait rien ouvert, donc la rotation n'avançait même pas : un toucher mort.

**Décision.** Une loi pure, `SyncPillDestination.resolve(source:knownConversationIds:currentUserId:)` (`Features/Main/Components/SyncPillDestination.swift`, `nonisolated`), que les deux racines appliquent et ne font plus que PRÉSENTER :
1. Conversation connue du cache : `.openConversation` (ancre du message gardée, posée AVANT la navigation et scopée à la conversation, #4027). Conversation inconnue : `.openConversationById`, la même porte que notifications et liens (mémoire, puis GRDB, puis réseau, puis toast ; porte PIN `Router.admitConversation`), ancre conservée. Identifiant vide : `.none`.
2. Un post : `.openPost` (push iPhone, panneau droit iPad).
3. Une story en publication : `.openOwnStories(userId)`, le groupe de l'utilisateur COURANT (`StoryViewerRequest(singleGroup: true)`, comme « Ma story »), jamais l'identifiant de la story ni un autre auteur ; sans utilisateur courant (nil ou vide) : `.none`.
4. `.unknown` : `.none`.
5. Le toucher de la pastille devient `(OutboxUIItem.Source) -> Bool` (`SyncPill`, `ConnectionBanner`, `RootViewLayers`, `iPadRootViewLayers`) : `false` quand rien n'a été ouvert, et `SyncPill` avance alors sa rotation (`guard let onTap, onTap(source) else { return rotator.advance() }`).

**Conséquences.**
- Plus aucun toucher mort sur une entrée de la pastille ; une seule décision pour deux racines (dimensions mûres : 6, 7, 8, 11, 13).
- Aucune donnée ne sort : la loi ne voit que des identifiants ; le journal public d'un identifiant de conversation disparaît. Pièces et messages protégés, présence et E2EE ne sont pas concernés.
- Le témoin #4027 (`SyncPillTimerStateTests`) est RE-POINTÉ sur `case .openConversation(let id, let messageId)` jusqu'à `case .openConversationById(` ; ses trois assertions (ancre reçue, ancre posée, portée posée) sont inchangées, pour les deux hôtes.
- Une source `.unknown` n'est plus une navigation (`SyncPillEntry.tapOutcome` rend `.advance`) : VoiceOver ne promet plus « ouvrir l'emplacement » au-dessus d'un toucher qui ne fait qu'avancer (revue du lot).
- Reste ouvert : l'indice est encore annoncé pour une story sans utilisateur courant et un identifiant de conversation vide, cas que seule la racine sait trancher ; la story en publication d'une première story (aucun groupe encore) s'ouvre comme « Ma story » (chargement puis « introuvable » si le groupe n'arrive pas), à confirmer à la recette. Miroir Android : lot `pastille-synchro-globale-affichage` (#15527).
