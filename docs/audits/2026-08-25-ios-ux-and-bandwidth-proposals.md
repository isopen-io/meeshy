# Propositions UX, bande passante et suites — audit iOS 2026-08-25

Ce document synthétise l'audit iOS multi-agents du 25/08/2026 mené sur 8 directives produit, avec réfutation adversariale : un agent « sceptique » relit et corrige ou réfute chaque constat avant classement. Il ne contient QUE des propositions et des arbitrages à trancher par le porteur produit — les défauts confirmés (verdict `confirmed`, non contredits) sont corrigés dans une vague de code séparée et ne sont pas repris ici, sauf quand ils encadrent une proposition. Lecture : chaque item suit le schéma constat (preuve fichier:ligne) → proposition concrète → coût/risque → décision attendue. Quand un « CORRIGÉ » du sceptique existe, il PRÉVAUT sur la proposition initiale et remplace celle-ci telle quelle. Sources : `brief-proposals.md` (constats proposés) et `digest.md` (résumés par lentille, dont le tableau de parcours § Directive 8 et le bilan bande passante § Directive 7).

## Directive 8 — Expérience utilisateur (UX)

### Carte des parcours (lentille 8)

Depuis l'accueil connecté (liste de conversations, boutons flottants Flux/Avatar) :

| Feature | Parcours (gestes) | Verdict |
|---|---|---|
| Rejoindre un appel en cours | pilule permanente, 1 tap (RootView.swift:95) | Fluide |
| Escalade audio→vidéo en appel | 1 tap (CallView.swift:1692) | Fluide |
| Démarrer un appel | menu du header, 2 taps | Fluide |
| Répondre à un message | swipe, 1 geste | Fluide |
| Réagir | appui long + emoji, 2 gestes | Fluide |
| Prisme : voir l'original / autre langue | drapeaux + bouton translate dans le pied de bulle (BubbleStandardLayout.swift:1154-1190), 1 tap | Fluide |
| Rechercher dans la conversation | 1 tap | Fluide |
| Recherche globale | 1 tap | Fluide |
| Créer une story | tray, 1 geste | Fluide |
| Nouvelle conversation | « + » du header, 1 geste | Fluide |
| Épingler / muter / marquer non lue une conversation | appui long + tap, 2 gestes | Fluide |
| Appels manqués | avatar + « Appels », 2 gestes | Fluide |
| Partager un lien de conversation | 2 gestes | Fluide |
| Photo | 2 gestes | Fluide |
| Profil | appui long avatar, 1 geste | Fluide |
| Épingler / partager / transférer un MESSAGE | appui long → « Plus… » → item, 3 gestes (arbitrage produit assumé, MessageActionResolver.swift:199-208) | Enfoui |
| Envoyer un VOCAL dans le fil | 2 gestes avant de parler (la variante minimisée du même composeur offre le micro en 1) | Enfoui |
| Bloquer un utilisateur depuis la liste | 4 gestes | Enfoui |
| Synchroniser ses contacts | ~5 gestes, puce « Répertoire » atteignable après deux écrans | Enfoui |
| 9 accès rapides (story/mood/post/inviter/lien) | en QUEUE de liste, après un défilement complet | Enfoui |
| Changer sa langue principale (cœur du Prisme) | 5 gestes en mode édition du profil | Enfoui |
| Auto-traduction | interrupteur unique gardé par `canManageMembers && !isDirect` (ConversationSettingsView.swift:328-336) — inaccessible en conversation directe et à tout membre non-admin | Introuvable |
| Modes de lecture Script/Rivière | puce parfaite (1 tap = cycle, appui long = menu) mais drapeau bêta OFF par défaut (décision produit, non remise en cause ici) | Introuvable |

Verdict global du digest : la navigation de conversation est excellente et le Prisme de LECTURE est à un tap ; ce qui manque, ce sont les COMMANDES du Prisme (langue principale, auto-traduction) et le micro.

### L8-P1 — Changer sa langue principale coûte 5 gestes et vit dans le mode édition du profil

**Constat.** Parcours mesuré : appui long sur le bouton avatar → `router.push(.profile)` (RootView.swift:2060-2067) → tap « Modifier » (ProfileView.swift:173-181, `isEditing = true`) → défiler jusqu'à `languagesSection` → tap « Langue principale » (ProfileView.swift:430-437) → choisir dans `ProfileLanguagePickerSheet` (:453-462) → « Enregistrer ». Les lignes sont `.disabled(!isEditing)` (:727). En comparaison, la langue d'INTERFACE — réglage bien moins structurant — est à 3 gestes et modifiable sans mode édition (SettingsView.swift:368-403, `interfaceLanguageRow`, un `Menu` inline dans `appearanceSection`).

**Proposition.** Ajouter dans `SettingsView.appearanceSection`, juste sous `interfaceLanguageRow` (SettingsView.swift:368), une ligne « Langue principale » construite avec le `settingsRow(icon:title:color:)` EXISTANT, présentant la feuille EXISTANTE `ProfileLanguagePickerSheet` (ProfileView.swift:453-462) et enregistrant par le MÊME chemin que le profil (`saveProfile` / PATCH `users/profile`) — aucun nouveau client réseau, aucune duplication de la résolution de langue. La section Langues du profil reste en place inchangée. Composant réutilisé : `settingsRow`. Couleur : palette des Réglages existante (réglage hors contexte conversation, pas d'accent color à appliquer).

**Coût estimé.** Petit — une ligne + une feuille déjà écrites.

**Risques.** Deux sites écriraient `systemLanguage` : ils DOIVENT partager l'appel de sauvegarde du profil, sinon l'un des deux périme le cache utilisateur. Aucune collision de gestes (aucun geste neuf).

**Décision attendue.** Dupliquer ce réglage dans les Réglages (en gardant le profil), ou l'y DÉPLACER en laissant dans le profil un simple renvoi ? `safe_now: false`.

### L8-P2 — L'auto-traduction n'a aucun interrupteur atteignable en conversation directe ni pour un membre non-admin

**Constat.** Unique interrupteur du dépôt iOS : ConversationSettingsView.swift:326-338 (`Toggle("", isOn: $viewModel.autoTranslateEnabled)`), rendu dans `permissionsSection`, gardée à :44-45 (`if viewModel.currentUserRole.hasMinimumRole(.admin)`). Les DEUX portes d'entrée de l'écran sont gardées plus tôt encore : ConversationInfoSheet.swift:195 (`if canManageMembers && !isDirect`) et :564-565, avec `canManageMembers` = creator/admin/moderator (:66-69) et `isDirect` = `conversation.type == .direct` (:63). Côté app, `autoTranslateEnabled` n'est ailleurs que LU (ConversationListViewModel.swift:1034-1035, via socket).

**Proposition.** Ajouter une ligne dans la section « Mon affichage » de `ConversationPreferencesTab` (ConversationPreferencesTab.swift:159, atteignable en 2 gestes : tap du titre → onglet Préférences) en réutilisant le `settingsToggleRow(icon:iconColor:title:isOn:)` EXISTANT (:430-448) avec `iconColor: accentColor` — couleur d'accent de la conversation, déjà passée à la vue. NE PAS déplacer ni dupliquer le réglage ADMIN de `ConversationSettingsView` : ce sont deux portées différentes si le serveur les distingue.

**Coût estimé.** Petit côté vue ; potentiellement moyen côté contrat serveur.

**Risques.** `autoTranslateEnabled` est aujourd'hui une propriété de CONVERSATION que la passerelle réserve peut-être aux admins ; s'il n'existe pas de préférence par LECTEUR, poser ce toggle pour un membre simple lui laisserait modifier la conversation des autres. Aucune collision de gestes.

**Décision attendue.** `autoTranslateEnabled` est-il une propriété de la CONVERSATION (admin-only, comme le suppose ConversationSettingsView.swift:44) ou existe-t-il/faut-il créer une préférence par LECTEUR côté passerelle ? `safe_now: false`.

### L8-P3 — Envoyer un vocal coûte 2 gestes avant de parler, alors que la variante minimisée du même composeur offre le micro en 1

**Constat.** Dans le fil, le vocal n'existe que comme tuile du carrousel : UniversalComposerBar+Attachments.swift:271-283 (`CarouselTile(id: "voice", …) { closeAttachMenu(); startRecording() }`) — tap (+) puis tap « Vocal ». `actionButton` (UniversalComposerBar.swift:912-921) renvoie toujours `sendButton`, éteint (`opacity 0.4`, `allowsHitTesting(false)`) tant que `hasContent` est faux. Le micro à UN geste existe déjà sur la variante MINIMISÉE du même fichier (:446-480, `expandAndStartRecording()`, `mic.fill`) — variante que `ConversationView` n'utilise pas.

**Proposition.** Câbler un appui long sur l'emplacement d'action quand il est éteint : dans `actionButton` (UniversalComposerBar.swift:912-921), garder `sendButton` visible et ajouter, quand `!isReady && resolvedShowVoice`, un `.onLongPressGesture { HapticFeedback.medium(); startRecording() }` (suppose de garder le hit-testing actif dans cet état, aujourd'hui coupé par `allowsHitTesting(isReady)`) en laissant le TAP inerte. Réutilise `startRecording()`, la barre d'enregistrement et le carrousel tels quels ; la tuile « Vocal » reste en place — un geste non signalé ne peut pas être le seul accès (même doctrine que RootView.swift:2051-2053 sur les Réels). Composant réutilisé : `sendButton` existant.

**Coût estimé.** Petit.

**Risques (collisions de gestes).** L'appui long ne doit pas armer le TAP d'envoi au relâchement (motif déjà rencontré : `suppressToastTap`, RootView.swift:250-252) ; ne doit pas exister quand `resolvedShowVoice == false` ; un geste non découvrable a besoin d'un `accessibilityHint`, comme le bouton Flux.

**Décision attendue.** Geste caché acceptable en produit ? `safe_now: false`.

### L8-P4 — Les neuf accès rapides ne sont atteignables qu'en queue de liste

**Constat.** ConversationListQuickActions.swift:5-17 : le bloc a « deux rôles : des portes utiles quand le fil des conversations s'arrête, et une HAUTEUR de queue » ; `Action.tiles(isEmptyState:)` (:76-78) rend les 9 tuiles hors état vide. Le routage existe et fonctionne (ConversationListView.swift:1512-1520). Mais rien ne les expose en tête : le header ne porte que deux boutons (ConversationListView+Overlays.swift:1061-1081, `link.badge.plus` et `plus`), AUCUN n'a de geste long.

**Proposition.** Attacher un `.contextMenu` (ou un appui long) au bouton « + » du header (ConversationListView+Overlays.swift:1071-1081) listant les mêmes `ConversationListQuickActions.Action` (icône + `title` déjà localisés, :22-49) et appelant le MÊME routeur d'actions que la queue de liste (ConversationListView.swift:1511-1521) — un seul site de décision, deux surfaces. Le bloc de queue reste intact.

**Coût estimé.** Petit.

**Risques (collisions de gestes).** Aucune : ce bouton n'a aujourd'hui aucun geste long, et il est déjà masqué pendant le défilement (`.hiddenWhileScrolling()`, :1140). Un menu contextuel sur un bouton 40×40 en verre adaptatif doit être testé à l'échelle Dynamic Type max.

**Décision attendue.** Quels items, quel ordre dans le menu contextuel ? `safe_now: false`.

### L8-P5 — La tuile « Voir mes contacts sur Meeshy » n'ouvre pas le répertoire qu'elle promet

**Constat.** ConversationListQuickActions.swift:40 : la tuile s'intitule « Voir mes contacts sur Meeshy », doc-comment (:68-72) « retrouver ses contacts sur Meeshy (synchronisation du carnet) ». Son routage : ConversationListView.swift:1513 `case .myContacts: router.push(.contacts(.contacts))` — l'onglet Contacts par défaut. Or la synchronisation du carnet vit derrière la puce `.phonebook` (ContactsListTab.swift:83-88). `Route.contacts` ne transporte qu'un `PeopleTab`, jamais un `ContactFilter`.

**Proposition.** Étendre `Route.contacts` d'un paramètre optionnel `initialFilter: ContactFilter?` (défaut `nil`, aucun appelant existant à modifier), le relayer à `ContactsListTab` pour un `setFilter` initial, router `.myContacts` vers `.contacts(.contacts, initialFilter: .phonebook)`. Aucun nouvel écran, aucune permission demandée plus tôt (`PhonebookListView` garde sa propre demande d'accès au carnet).

**Coût estimé.** Petit à moyen.

**Risques.** `Route` est `Hashable` et sert de valeur de pile — ajouter un cas associé impose de vérifier `displayTitle` et les tests de navigation existants.

**Décision attendue.** La tuile doit-elle ouvrir le carnet synchronisable ou l'annuaire Contacts par défaut ? `safe_now: false`.

### L8-I2 — Le titre de l'écran d'accueil est un littéral anglais/français mixte, non localisé

**Constat.** ConversationListView+Overlays.swift:1040 — `Text("Meeshy Chats")` : seul texte NON localisé du header, entouré de six libellés qui passent tous par `String(localized:)` (:1070, :1081, :1117, :1129).

**Proposition.** Si le nom n'est pas contractuel : `Text(String(localized: "conversation.list.title", defaultValue: "Meeshy Chats", bundle: .main))` + entrée catalogue en 7 langues. Dégradé, police et `minimumScaleFactor` inchangés.

**Coût estimé.** Petit.

**Risques.** Aucun techniquement — un titre plus long est déjà absorbé par `lineLimit(1) + minimumScaleFactor(0.55)` (:1047-1048).

**Décision attendue.** « Meeshy Chats » est-il un nom de produit contractuel (App Store, marque) ? Si oui, l'item tombe et mérite un commentaire à la place d'un correctif. `safe_now: false`.

## Directive 7 — Bande passante

### Bilan de la roadmap de mai

**FAIT (côté serveur + HTTP iOS).** La roadmap de mai est largement SOLDÉE : `perMessageDeflate` (gateway), compression Traefik, ETag/304, `URLCache`, WebSocket, watermark `after=`, pull-to-refresh qui ne purge plus les MÉDIAS, audio 64 kbps, participants `take: 5`.

**PARTIEL / NON FAIT — trois défauts dominants, tous du même genre : un mécanisme d'économie existe, et le chemin qui consomme ne le branche pas** (ces trois-là sont `confirmed`, déjà traités dans la vague de code séparée — rappelés ici pour situer le bilan) :
1. Le gateway compresse les trames WebSocket depuis le sprint bande passante ; le client iOS n'a JAMAIS passé `.compress` — `SocketEngine.compress` reste `false`, Starscream n'annonce pas `permessage-deflate`, aucune trame temps réel iOS n'est compressée (BW-IOS-01). QW1 (quick win n°1 de tout l'audit) n'a jamais atteint iOS.
2. `MediaDownloadPolicyEngine` + l'écran Réglages « Vidéo : Wi-Fi uniquement » existent, sont testés, et le prefetch des STORIES et du FEED ne les consultent pas (BW-IOS-02/03) — vidéos et audio téléchargés en entier sur cellulaire et en Low Data Mode. Le correctif jumeau a déjà été fait pour le carrousel de bulles en 2026-07-21.
3. `?languages=` (filtre Prisme serveur, texte ET audio) est livré des deux côtés depuis juin ; aucun appelant iOS ne le passe (BW-IOS-04), alors que les trois chemins de lecture jettent déjà toute traduction hors Prisme côté client.

**Ordre de grandeur cumulé** pour un profil mobile actif : **8–35 Mo/jour** évitables, dont l'écrasante majorité (stories + feed) sur le seul cellulaire.

Ce qui suit est ce qui reste PROPOSITION (non confirmé comme défaut, ou confirmé mais laissé à l'arbitrage produit) : BW-GW-01/02/03/04 et BW-IOS-06/08/10/11.

### BW-IOS-06 — Le pull-to-refresh purge tout le cache messages, ce qui réarme le prefetch réseau des 20 conversations de tête

**Constat.** ConversationListViewModel.swift:1958-1962 — `invalidatePullRefreshScope()` commence par `await CacheCoordinator.shared.messages.invalidateAll()`. Ce n'est PAS une expiration : `GRDBCacheStore.invalidateAll()` (GRDBCacheStore.swift:350-358) vide le cache mémoire ET appelle `deleteAllL2()` — les lignes disque sont SUPPRIMÉES. Conséquence en aval : `performLoadConversations` termine par `prefetchTopConversationMessages()` (lignes 1661-1662), qui ne saute une conversation que si son cache rend `.fresh`/`.stale` non vide (lignes 2223-2228) — après la purge, le prefetch réseau des 20 conversations de tête est intégralement réarmé par le pull lui-même.

**Proposition.** Retirer la seule ligne `await CacheCoordinator.shared.messages.invalidateAll()` (ConversationListViewModel.swift:1962) et mettre à jour le doc-comment au-dessus (lignes 1959-1961). Ne toucher à AUCUN des huit autres stores du périmètre (`participants`, `stories`, préférences, catégories, tags, `profiles`, `invalidateTranslationCaches()`) — chacun a sa propre raison, `stories` étant explicitement solidaire de `StoryViewModel.loadStories(forceNetwork:)`.

**Économie estimée.** Évite de réarmer jusqu'à 20 requêtes réseau (messages + traductions complètes) à chaque pull-to-refresh.

**Effort.** Trivial — retrait d'une ligne + doc-comment.

**Ce qui change de visible.** Après un pull, l'ouverture d'une conversation peint le cache puis se revalide au lieu d'afficher un écran vide pendant le fetch — contrat Cache-First/SWR du CLAUDE.md, pas une perte de fraîcheur (la requête réseau part dans les deux cas). Un message édité/supprimé pendant l'absence reste rattrapé par `refreshMessagesFromAPI` (`forceOverwrite: true`) et par les événements socket.

### BW-GW-01 — `speakerAnalysis` et les champs OCR/vision/qualité vocale sont sérialisés dans chaque liste de messages ; iOS n'en décode aucun

**Constat.** packages/shared/types/api-schemas.ts:436-473 déclare `speakerAnalysis` (`speakers[]`, `segments[]` avec `startMs/endMs/durationMs`) — fast-json-stringify le SÉRIALISE. Suivent `voiceQualityAnalysis` (:478-484, `additionalProperties: true`), `pageCount`, `documentLayout`, `imageDescription`, `detectedObjects`, `ocrRegions` (:486-491), et `primarySpeakerId`/`senderVoiceIdentified`/`senderSpeakerId` (:433-435). `cleanAttachmentsForApi` (services/gateway/src/routes/conversations/messages.ts:177) ne retire rien de tout cela : il ne réécrit que `segments[].voiceSimilarityScore`. iOS n'en décode AUCUN champ.

**Proposition.** Ajouter au querystring de `GET /conversations/:id/messages` un opt-out symétrique de `languages`, par exemple `include_voice_analysis` (défaut `'true'` = comportement actuel, web inchangé), déclaré à côté de `languages` (messages.ts:373) et lu au même endroit (:449). Quand `'false'`, `cleanAttachmentsForApi` supprime `cleaned.transcription.speakerAnalysis` et `cleaned.transcription.voiceQualityAnalysis`. Côté SDK : `includeVoiceAnalysis: Bool = true` sur `MessageService.list/listBefore/listAfter/listAround` (même patron que `languagesQueryItem`), passé à `false` par les appelants iOS. Se limiter à ces DEUX champs dans ce lot — `detectedObjects`/`ocrRegions`/`documentLayout` sont d'une autre famille et méritent leur propre mesure.

**Économie estimée.** Non chiffrée dans le digest — question ouverte : taille réelle d'un `speakerAnalysis` de production non mesurée (quelques centaines d'octets ou quelques kilo-octets ?).

**Effort.** Petit — un paramètre querystring + un flag SDK.

**Ce qui change de visible.** Rien pour le web (défaut `true` inchangé) ; iOS reçoit une charge JSON plus légère par liste de messages. Risque nul tant que le défaut reste `true`.

### BW-GW-02 — Le gateway collecte les quatre rangs de Prisme de chaque participant comme langues cibles ; chaque traduction est diffusée à toute la room

**Constat.** `MessageTranslationService._extractConversationLanguages` (services/gateway/src/services/message-translation/MessageTranslationService.ts:821) lit pour chaque participant `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`, `deviceLocale` (select lignes 852-861) puis `resolveUserLanguagesOrdered(u, {deviceLocale})` — ajoute tous les codes retournés à l'ensemble des langues cibles (lignes 888-893), SANS lire `translateToSystemLanguage`/`translateToRegionalLanguage` (0 occurrence dans le fichier) — item 2.12/S5 du doc de mai non fait. L'ajout de `deviceLocale` (règle 4 du Prisme) a ÉLARGI l'ensemble depuis.

**Proposition (deux gestes SÉPARÉS, à mesurer avant de choisir).** (a) dans `_extractConversationLanguages`, n'ajouter `systemLanguage` que si `user.translateToSystemLanguage !== false` et `regionalLanguage` que si `translateToRegionalLanguage !== false` (colonnes déjà modélisées en Prisma, cf. CLAUDE.md § « Prisma Schema vs MongoDB Reality ») ; (b) router `message:translation` par `ROOMS.user(id)` pour les seuls destinataires dont le Prisme couvre `targetLanguage`.

**Coût / effort.** (a) petit ; (b) change la sémantique de fan-out et interfère avec `translation:request` (exploration à la demande) — moyen à élevé.

**Ce qui change de visible.** (a) réduit ce qui est TRADUIT — peut retirer une traduction qu'un lecteur voit aujourd'hui ; (b) change qui reçoit quoi sur la socket.

**Risques.** Classé `proposal`, PAS `safe_now` : (a) risque de rétrograder un lecteur sur l'original (interdit par la règle 1 du Prisme) si mal cadré ; toute évolution touche aussi le pipeline TTS et la génération de médias, donc le stockage.

**Décision attendue.** Arbitrage produit sur (a) et (b), séparément.

### BW-GW-03 — Pas de variantes responsive pour les avatars (512 px unique) ni pour `PostMedia`

**Constat.** services/gateway/src/services/image/ImageProcessingService.ts:3 `AVATAR_SIZE = 512` ; `processAvatar` (lignes 8-13) produit UN seul JPEG 512×512 q80, aucune route de redimensionnement à la volée. `imageVariants` n'existe QUE sur `MessageAttachment` (schema.prisma:898) — `PostMedia` (schema.prisma:3336-3369) ne porte que `fileUrl`/`thumbnailUrl`/`thumbHash`. `ImageVariantSelector` (packages/MeeshySDK/.../ImageVariantSelector.swift:18), complet et testé, n'a que trois appelants (pièces jointes de message).

**Proposition.** Serveur — générer 2-3 variantes à l'upload d'avatar (`processAvatar`) et les exposer sur le même modèle que `MessageAttachment.imageVariants`, puis idem pour `PostMedia`. Client — brancher `ImageVariantSelector.bestImageURL` sur le composant d'avatar et sur le rendu des médias de post.

**Économie estimée.** Un avatar 96/128 px WebP pour les listes au lieu de l'original 512 px, sur CHAQUE avatar affiché en liste — non chiffrée dans le digest.

**Effort.** Moyen à élevé — migration de schéma, backfill des avatars existants, décision sur les tailles.

**Ce qui change de visible.** Gain réseau récurrent contre un RE-téléchargement de masse une fois (les avatars en cache disque sont keyés par URL — `CachePolicy.images`, TTL 1 an — changer d'URL invalide tout le parc). Les images CHIFFRÉES n'ont pas de variantes : le repli `originalURL` de `ImageVariantSelector` (étape 5) doit rester le chemin par défaut.

### BW-IOS-08 — `prefetchTopConversationMessages` : 20 requêtes parallèles de 20 messages à chaque chargement de liste sur cache froid

**Constat.** ConversationListViewModel.swift:2207 — `Array(conversations.prefix(20))` (ligne 2208), puis pour chaque conversation dont le cache ne rend pas `.fresh`/`.stale` non vide (garde lignes 2223-2228) : `messageService.list(offset: 0, limit: 20, includeReplies: true, includeTranslations: true)` (lignes 2231-2237), appelé en fin de `performLoadConversations` (ligne 1662). La garde SWR est correcte et le `staleTTL` des messages est de 2 min (`ttl` 6 mois, CachePolicy.swift:51) — le cas nominal saute bien ; reste le cold start réel et la purge décrite en BW-IOS-06.

**Proposition.** Le doc de mai proposait la suppression pure — NON recommandée telle quelle : ce cache alimente l'ouverture INSTANTANÉE d'une conversation (Instant App § Cache-First), bénéfice produit réel. Geste minimal et sûr : garder le prefetch mais le conditionner à `NetworkConditionMonitor.shared.condition == .wifi` (ou `.wifi || .goodCellular`), et réduire `limit: 20` → `limit: 10`.

**Économie estimée.** Jusqu'à 20 requêtes parallèles de 20 messages (traductions complètes) évitées sur cellulaire à chaque cache froid.

**Effort.** Petit — une condition réseau + un changement de constante.

**Ce qui change de visible.** Sur cellulaire, la première ouverture d'une conversation non encore visitée affiche son squelette au lieu du cache ; sur Wi-Fi, aucun changement. Ramener 20 → 5 conversations est un arbitrage produit DISTINCT, à mesurer séparément.

### BW-IOS-10 — Tous les téléchargements média passent par `URLSession.shared`, hors du pool/pinning/HTTP-3 d'`APIClient`

**Constat.** packages/MeeshySDK/.../DiskCacheStore.swift:389 — `URLSession.shared.data(for: request)` dans `networkData(for:url:)`, le funnel UNIQUE de tous les médias. `APIClient` configure pourtant une session dédiée : `URLCache` 10 Mo/50 Mo (APIClient.swift:500-506), `CertificatePinningDelegate` (:510), `assumesHTTP3Capable = true` par requête (:590) — rien de cela ne s'applique aux médias.

**Proposition.** Injecter la session dans `DiskCacheStore` (paramètre `session: URLSession = .shared` sur l'init, câblé à `APIClient.shared.urlSession` par `CacheCoordinator`) et poser `urlRequest.assumesHTTP3Capable = true` dans `Self.networkRequest(for:...)` (DiskCacheStore.swift:404). Se limiter à `DiskCacheStore` — les six autres sites (MeeshyVideoThumbnail.swift:189, DocumentViewerView.swift:264, etc.) sont des usages ponctuels à traiter séparément.

**Économie estimée.** Gain de transport (HTTP/3, pool de connexions partagé) sur le volume DOMINANT (médias) ; non chiffré.

**Effort.** Petit à moyen.

**Ce qui change de visible.** Rien pour l'utilisateur en fonctionnement normal.

**Risques.** `APIClient.clearHTTPCache()` (APIClient.swift:519-521) purge le `URLCache` de cette session au logout — vérifier qu'aucun média n'est doublement mis en cache (`URLCache` + `DiskCacheStore`) ; envisager `config.urlCache = nil` sur le chemin média si le double stockage se confirme.

### BW-GW-04 — `cacheKey` et `cached` voyagent dans chaque `message:translation` alors que `cacheKey` est dérivable

**Constat.** services/gateway/src/socketio/buildTranslationEvent.ts:86-87 — `cacheKey: \`${messageId}_${resolvedSourceLanguage}_${targetLanguage}\`, cached,` — `cacheKey` est intégralement DÉRIVABLE des trois champs déjà présents dans le même objet. Le modèle iOS ne le décode pas (ConversationSocketHandler.swift:1034-1042). Item HAUTE-06 du doc `01-socketio.md`, non traité.

**Proposition.** Retirer `cacheKey` du littéral (buildTranslationEvent.ts:86) et du type `TranslationData` (packages/shared/types/socketio-events.ts). Traiter `cached` séparément : vérifier d'abord s'il a un lecteur web avant de le retirer.

**Économie estimée.** Faible gain unitaire — « à faire en même temps qu'un autre passage sur ce fichier, pas seul ».

**Effort.** Petit.

**Ce qui change de visible.** Rien.

**Risques.** À prouver sur les TROIS clients (web, iOS, Android) avant de retirer un champ du contrat partagé.

### BW-IOS-11 — FirebaseAnalytics + Crashlytics + Performance embarqués, instrumentant automatiquement toutes les requêtes réseau

**Constat.** apps/ios/project.yml:172-179 déclare `FirebaseCore`, `FirebaseAnalytics`, `FirebaseCrashlytics`, `FirebasePerformance` (`FirebaseMessaging` retiré, commentaire lignes 138-141). `FirebasePerformance` swizzle `URLSession` et produit une trace par requête HTTP ; `FirebaseAnalytics` remonte ses événements sur son propre calendrier. Aucun réglage d'échantillonnage ni de désactivation conditionnelle (`grep firebase_performance_collection_enabled|FirebasePerformanceCollectionEnabled` : rien).

**Proposition.** Ne rien changer sans mesure. Geste 1 — MESURER (`URLSessionTaskMetrics` ou Charles/Proxyman) la part de `firebaselogging`/`app-measurement` dans le trafic sortant. Geste 2, selon le résultat — réduire l'échantillonnage de Performance via `Info.plist`, ou désactiver la collecte automatique de traces réseau.

**Économie estimée.** Inconnue tant que non mesurée.

**Effort.** Mesure = petit ; désactivation = petit.

**Ce qui change de visible.** Rien pour l'utilisateur ; perte de signal en production sur les traces réseau et/ou événements produit si désactivé.

**Risques.** Arbitrage observabilité/produit — décision d'équipe, pas un défaut de bande passante.

## Directives 5–6 — Appels

### L5-F1 — Aucune bannière globale « Reprendre » après relance, alors que `GET /calls/active` existe côté gateway

**Constat.** La route de crash-recovery dédiée existe et documente exactement son usage — services/gateway/src/routes/calls.ts:1072, description « Retrieve the currently active call for the authenticated user. Used for crash recovery », filtre `status: { in: ['initiated','ringing','connecting','active','reconnecting'] }` + garde de participation `OR: [{leftAt:null},{leftAt:{isSet:false}}]` (calls.ts:1119-1129). Aucun appelant : `grep "calls/active" apps/ios packages/MeeshySDK apps/web` ne rend qu'un doc-comment (CallModels.swift:212).

Le sceptique a RÉFUTÉ la classification initiale « defect » (verdict : `refuted`). Les faits bruts sont confirmés inchangés — la route existe, `ActiveCallService.swift` n'expose que `activeCall(conversationId:)`, `CallEventsHandler.ts` limite le replay à `status in [initiated,ringing]` + fenêtre de 60 s + `initiatorId != userId`. Le raisonnement complet du sceptique est TRONQUÉ dans le digest source, coupé sur la mention de `FloatingCallPillView.swift:118` qui « gate » déjà quelque chose. La proposition elle-même (brief-proposals.md, § RISQUE) confirme la piste : « le header pose « Rejoindre » en parallèle » quand la conversation concernée est déjà ouverte — la reprise après un force-quit/crash est donc DÉJÀ signalée dans le cas où l'utilisateur rouvre lui-même la conversation, ce qui explique le plus probablement la reclassification « hors défaut confirmé ». Reste manquant : le cas où l'utilisateur NE rouvre PAS la conversation concernée (l'app démarre ailleurs) — c'est exactement le scénario que la proposition ci-dessous adresse. Réfutation intégrale récupérée depuis la source complète — `FloatingCallPillView.swift:118` gate sur `callManager.displayMode == .pip && callManager.callState.isActive && !callManager.isSystemPiPActive`. Le constat est réfuté sur trois points. (1) L'énoncé « la relance ne montre RIEN » est FAUX : le gateway poste un VRAI message système dans la conversation dès `call:initiate` — `services/gateway/src/services/CallService.ts:2977-2988`, `this.prisma.message.create({ … content: summary.content, messageType: 'system', … })`, avec `content` = `call_ongoing_audio|video` → « Appel audio/vidéo en cours » (`packages/shared/utils/call-summary.ts:363-371`, via `FRENCH_LABELS`). Ce message devient le dernier message de la conversation et la ligne de liste le rend telle quelle : `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift:502-503`, `resolvedPreviewText` → `conversation.resolvedLastMessagePreview(...)`. Après relance, la conversation qui héberge l'appel s'annonce donc « Appel en cours » dans la LISTE — une surface globale ; l'utilisateur ne « devine » pas. (2) L'énoncé « et seulement pendant la fenêtre de grâce serveur » est FAUX pour l'affordance existante : la fenêtre de 60 s appartient au SEUL `call:check-active` ; le chemin réellement emprunté par le header (`ConversationView+Header.swift:333-341` → `ActiveCallService.activeCall(conversationId:)` → `GET /conversations/:id/active-call`) aboutit à `services/gateway/src/services/CallService.ts:2290-2297`, `findFirst({ where: { conversationId, status: { in: ACTIVE_STATUSES } } })` — AUCUN filtre temporel : la pill « Rejoindre » reste donc offerte tant que l'appel vit côté serveur. (3) Aucune directive ni aucun contrat n'est contredit — condition de la sévérité `defect` : l'absence n'est pas iOS-spécifique, Android DÉCLARE la route (`apps/android/core/network/.../api/ActiveCallApi.kt:25`, `@GET("calls/active")`) sans la consommer non plus, le web non plus ; `tasks/calls-audit-2026-07-11.md:406` déclare la feature rejoin Android « COMPLÈTE » après la seule sonde par conversation. Conclusion du sceptique : l'observation mérite d'être reversée en `proposal` (ou `improvement` limité au SDK, sans UI), pas en `defect` — verdict réfuté.

**Proposition (reclassée `proposal`).** 1) SDK — ajouter à `ActiveCallServiceProviding` (packages/MeeshySDK/.../ActiveCallService.swift:5) une méthode `func activeCall() async throws -> ActiveCallSession?` qui frappe `/calls/active` et rend `nil` sur 404 (`NO_ACTIVE_CALL`), réutilisant le décodeur `ActiveCallSession` déjà écrit (même schéma `callSessionSchema`, calls.ts:1085) — aucune nouvelle route, aucun nouveau type. 2) App — un état publié `pendingRejoin: ActiveCallSession?` sur `CallManager`, renseigné par un appel unique depuis le point de bootstrap existant (RootView.swift:760-762, le `.task` qui fait déjà `MessageSocketManager.shared.connect()`), gardé par `callState == .idle`. 3) UI — une bannière montée dans `CallPresentationLayer`, au MÊME emplacement que la bannière call-waiting existante (RootView.swift:144-159, composant réutilisé), tap → `CallManager.rejoinActiveCall(...)` déjà écrit (CallManager.swift:1307), identifiants tirés de `session.remoteParticipant(currentUserId:)` (déjà écrit, CallModels.swift:245). Effacement sur `callEnded` par match de `callId`, comme le fait déjà le header (ConversationView+Header.swift:122-127). Accent color : bannière alignée sur le traitement visuel déjà en place pour call-waiting, pas de nouvelle palette.

**Coût.** Faible côté SDK/gateway (lecture seule, route déjà déployée, rate-limitée par `ROUTE_RATE_LIMITS.callOperations`) ; petit à moyen côté app (nouvel état + bannière réutilisant des composants existants).

**Risques (collisions de gestes).** Double affordance si l'utilisateur est déjà DANS la conversation concernée (le header pose déjà « Rejoindre » en parallèle) — à trancher en masquant la bannière quand `router.currentConversationId == session.conv[...]`.

**Décision attendue.** Où déclencher l'appel réseau (à chaque retour au premier plan, coût du seau `callOperations` 10 req/min, vs. `.task` de RootView une fois par montage, vs. rejouer aussi sur `didReconnect`) ; la bannière doit-elle s'afficher aussi quand l'appel a été refusé/quitté par CE device mais reste actif ailleurs (le filtre `leftAt` exclut ce cas par construction) ; traiter iOS et web (`OngoingCallBanner`, même absence de consommateur de `/calls/active`) dans le même lot ou iOS d'abord.

### L5-F3 — Rejoindre un appel de GROUPE est impossible sur iOS alors que le gateway l'accepte désormais

**Constat.** Gateway — services/gateway/src/services/CallService.ts:1060-1061 (« only DIRECT and GROUP support video calls ») et :83 `MAX_CALL_PARTICIPANTS = 9999` — le verrou « cap dur à 2 » décrit dans tasks/2026-08-13-group-calls-gap-analysis.md (§S1) a été LEVÉ depuis. iOS — ConversationView+Header.swift:55 `guard isDirect, let userId = conversation?.participantUserId else { return AnyView(EmptyView()) }` : aucune pastille d'appel n'est proposée hors conversation directe.

**Proposition.** AUCUN correctif minimal — passer iOS en multi-pair (une `RTCPeerConnection` par participant, `Map<participantId,…>` comme le web) est une REFONTE de `CallManager`/`P2PWebRTCClient`, pas une levée de garde. Retirer le `guard isDirect` sans le moteur donnerait un appel de groupe où l'iPhone n'entend qu'un seul pair.

**Coût.** Refonte, non chiffrée — hors périmètre d'une décision de revue.

**Risques.** N/A — aucune modification proposée avant arbitrage.

**Décision attendue.** iOS reste-t-il 1:1 (documenté explicitement, un appel de groupe initié depuis le web restant invisible aux iPhones de la conversation), ou un maillage multi-pairs est-il planifié ? `tasks/2026-08-13-group-calls-gap-analysis.md` tient déjà l'inventaire, mais son §S1 est PÉRIMÉ (cap passé de 2 à 9999) et doit être corrigé quelle que soit la décision.

### L5-F4 — La fenêtre de grâce serveur (30 s sans socket) est toujours plus courte qu'un redémarrage de téléphone

**Constat.** services/gateway/src/socketio/CallEventsHandler.ts:217 `DISCONNECT_GRACE_MS = 30_000`. L'extension n'est accordée QUE si l'utilisateur a encore un socket vivant (:747-757, `fetchSockets` + `userBack`), sinon la branche d'extension (`GRACE_EXTENSION_MS = 15_000`, `MAX_GRACE_EXTENSIONS = 4`, lignes 227-229) exige elle aussi « ANY live socket ». Un téléphone en cours de REBOOT n'a AUCUN socket : la grâce expire à 30 s et `leaveCall` termine l'appel 1:1 avant le retour du device. Le volet token, lui, est correct (AppDelegate.swift:85, réenregistrement inconditionnel).

**Proposition.** AUCUN correctif sans arbitrage produit — allonger `DISCONNECT_GRACE_MS` fait patienter le pair resté connecté et interfère avec le palier heartbeat (CallCleanupService.ts:47, `HEARTBEAT_TIMEOUT_MS = 120_000`, gardé explicitement au-dessus du total 30+4×15=90 s par le commentaire des lignes 222-223 de CallEventsHandler). Toute évolution touche les DEUX constantes ensemble. Recommandation : livrer L5-F1 d'abord (il rend la fenêtre force-quit/crash réellement exploitable), puis mesurer avant de toucher aux durées.

**Coût.** Non chiffré — dépend de la mesure demandée en décision.

**Risques.** Une hausse de la grâce sans hausse conjointe du palier heartbeat inverserait l'ordre des deux filets et rouvrirait les appels zombies documentés en vague 3.

**Décision attendue.** La fenêtre actuelle est-elle assumée telle quelle (directive reformulée en « après un crash / force-quit » seulement), ou allongée pour couvrir un reboot (au prix de faire attendre le pair) ? Quelle est la durée réelle observée d'un reboot iPhone jusqu'à la reconnexion du socket sur ce parc — sans cette mesure, tout choix de `DISCONNECT_GRACE_MS` est arbitraire.

### L6-5 — La vidéo sortante partage la priorité réseau `.high` de l'audio

**Constat.** P2PWebRTCClient.swift:446-448 (audio) — « networkPriority = .high → DSCP EF (Expedited Forwarding, 46) for VoIP audio », `encoding.networkPriority = .high`. P2PWebRTCClient.swift:515-517 (vidéo) — « networkPriority = .high → DSCP AF41 », `encoding.networkPriority = .high`. Les DEUX flux portent la MÊME valeur d'énumération (`RTCPriorityHigh`) ; seul le mapping DSCP interne à libwebrtc les distingue.

**Proposition.** Une ligne — P2PWebRTCClient.swift:517, `encoding.networkPriority = .medium` sur la vidéo (l'audio reste `.high` en l.448), et mettre le commentaire l.515-516 en accord avec le DSCP effectivement obtenu.

**Coût estimé.** Trivial — une ligne + un commentaire.

**Risques.** Effet NON observable en test unitaire et non mesurable en lecture seule — il faut une mesure sur lien contraint avant de conclure ; un réseau qui applique réellement le DSCP pourrait déclasser la vidéo plus tôt qu'aujourd'hui, c'est l'effet recherché mais il doit être CONSTATÉ.

**Décision attendue.** Valider le changement puis mesurer sur lien contraint avant de le considérer acquis.

### L6-7 — Tableau des seuils et durées qui gouvernent la dégradation

**Constat.** Relevé ligne à ligne (valeur AUJOURD'HUI → CIBLE, justification), sources WebRTCTypes.swift, P2PWebRTCClient.swift, CallManager.swift, apps/web/lib/calls/adaptive-degradation.ts, CallEventsHandler.ts, CallCleanupService.ts.

| Paramètre | Valeur aujourd'hui | Cible | Fichier:ligne | Justification |
|---|---|---|---|---|
| Cadence des stats | `statsIntervalSeconds = 5.0` | inchangé | WebRTCTypes.swift:1095 | la politique de survie est déjà indépendante de la cadence (VideoSurvivalController.swift:53-57) |
| Anti-rebond de palier | `qualityLevelDebounceSeconds = 5.0` | inchangé | WebRTCTypes.swift:1332 | — |
| Seuil RTT excellent | `excellentRTT` 100 ms | inchangé | WebRTCTypes.swift:995 | conforme à la spec §3.9 |
| Seuil RTT bon | `goodRTT` 250 ms | inchangé | WebRTCTypes.swift:997 | conforme à la spec §3.9 |
| Seuil RTT vidéo correct | `videoFairRTT` 300 ms | inchangé | WebRTCTypes.swift:1004 | conforme à la spec §3.9 |
| Seuil RTT vidéo pauvre | `videoPoorRTT` 500 ms | inchangé | WebRTCTypes.swift:1025 | conforme à la spec §3.9 |
| Seuil RTT pauvre | `poorRTT` 800 ms | inchangé | WebRTCTypes.swift:1030 | conforme à la spec §3.9 |
| Perte de paquets (paliers) | 1 % / 5 % / 10 % | inchangés | WebRTCTypes.swift:1006-1008 | conformes à la spec §3.9 |
| Perte vidéo correcte | `videoFairPacketLoss` 3 % | inchangé | WebRTCTypes.swift:1034 | conforme à la spec §3.9 |
| Plancher bitrate vidéo | `minVideoBitrate = 100_000` | non chiffré dans la source (troncature) | WebRTCTypes.swift:1152 | — |
| Plancher bitrate critique | `criticalVideoBitrate` (valeur non récupérable) | non chiffré | WebRTCTypes.swift:1156 | — |
| Fenêtre de reprise vidéo | `videoSurvivalResumeAfterSeconds` = 10 s | 4-5 s (arbitrage à trancher) | WebRTCTypes.swift:1353 ; jumeau web apps/web/lib/calls/adaptive-degradation.ts:68 | rend le retour à l'image nette presque imperceptible mais autorise un léger va-et-vient sur un lien qui oscille |

*Note : le digest source tronque la valeur exacte de `criticalVideoBitrate` (coupé après « criticalV […] ») — non inventée ici.*

**Proposition.** Aucun correctif isolé — ce constat sert de référence chiffrée aux lots L6-1, L6-3 et L6-4 (déjà confirmés et corrigés dans la vague de code séparée). Ne changer `videoSurvivalResumeAfterSeconds` (WebRTCTypes.swift:1353) et son jumeau web qu'APRÈS que la reprise soit devenue gratuite (dépendance à L6-1), et mettre à jour les deux doc-comments qui invoquent aujourd'hui le coût de la ré-acquisition caméra pour justifier les 10 s.

**Coût.** Trivial une fois la dépendance L6-1 livrée.

**Risques.** Abaisser la fenêtre de reprise AVANT que la reprise soit gratuite ferait osciller la caméra toutes les quelques secondes — le scénario que l'hystérésis a été écrite pour empêcher.

**Décision attendue.** Une seule décision produit — abaisser la fenêtre de reprise de 10 s à 4-5 s, oui/non, et seulement après L6-1.

## Directives 1–2 — Fil et modes de lecture

### L1-06 — Script/Focal : heures et coches de chaque rangée apparaissent/s'effacent en fondu au rythme du défilement
**Constat.** FocalTimestampRevealState.swift:86-88 — `content().opacity(reveal.isRevealed ? 1:0).allowsHitTesting(reveal.isRevealed).animation(...)` ; source du basculement : le défilement lui-même (MessageListViewController.swift:2666 `noteScrollTimePillActivity()` → :718 `timestampReveal.note(.scrolled(at: now))`, garde `readingMode != .bubbles` à :709). Fermeture `ScrollTimePillLaw.lingerMs` (900 ms) après le dernier événement.
**Proposition.** Décision produit d'abord : rendre heures/coches PERMANENTES sur la rangée plate, ou les retirer de la rangée ordinaire (garder seulement la rangée élue). Si « permanentes » retenu, site UNIQUE : FocalTimestampRevealState.swift:83-89 — rendre `FocalRevealedDetail.content()` nu (plus d'opacity/allowsHitTesting/animation), ce qui sert d'un coup ses deux consommateurs (FocalMetaRow.swift:92 et 125). `ScrollTimePillLaw` reste intact.
**Coût :** petit (site unique) si « permanentes » retenu. **Risques :** élevé côté produit, faible côté technique — supprimer le révélé rend visibles en permanence des éléments que le fil au repos cachait, ce qui RENVERSE la directive du 2026-08-24 ; la ligne basse existe déjà et garde sa hauteur (FocalRow.swift:229-231), donc aucun relayout.
**Décision attendue.** La directive « SANS EFFET lorsqu'on défile » renverse-t-elle les directives du 2026-08-22/2026-08-24, ou vise-t-elle seulement le mode nominal `.bubbles` ?

### L1-07 — Focal : carte accent/chips/détails du message élu se déplacent de rangée en rangée pendant le geste
**Constat.** MessageListViewController.swift:2662 `noteFocalScrollTick` → :2938-2939 `guard readingMode == .focal, isDragging || isDecelerating` puis `applyFocalPerspectiveToVisibleCells()` → :3030-3037 élection + `syncFocalFocusDetails()`. Éléments conditionnés à `input.isFocused` : FocalRow.swift:240 (`focusCardBackground`), :245 (`focusIdentityChip`), :252 (`focusStrip`…).
**Proposition.** Ne RIEN retirer sans arbitrage écrit. Si « Focal disparaît de la route » retenu, le geste minimal existe déjà : rétablir un clamp de CONSOMMATION dans `ReadingModeController.renderDecision` (Focal/Preferences/ReadingModeController.swift:114-121) rabattant `.focal` sur `.script`, comme `clampRetiredModes` avant le 2026-08-21, et retirer `.focal` de `ReadingModeLensCatalog.displayOrder`.
**Coût :** petit — le clamp a déjà existé, ses tests aussi. **Risques :** un clamp retire un mode que la bêta expose aujourd'hui ; les préférences collantes se replieraient silencieusement sur Script.
**Décision attendue.** « Focal sans effet pendant le défilement » n'est PAS Focal — la directive du 2026-08-24 a déjà retiré échelle/opacité/compaction (MessageListViewController.swift:3015-3028), ne restent que carte et chips ; les retirer rendrait `.focal` indistinguable de `.script`.

### L1-08 — Rivière : chaque frame de défilement republie les cadres de toutes les bulles visibles
**Constat.** RiverBubbleView.swift:348-354 — chaque bulle publie son cadre dans le repère FIXE du pane (`.preference(key: MessageFramePreferenceKey.self, value: [messageId: proxy.frame(in: .named(RiverCoordinateSpace.name))])`) — un cadre en repère PANE change à chaque pixel défilé, par construction. RiverStreamHost.swift:337-339 réécrit `frames`/`horizontalOffset` à chaque `onPreferenceChange`.
**Proposition (esquisse initiale, CORRIGÉE par le sceptique — la correction prévaut).** L'esquisse proposait de passer les cadres au repère du CONTENU + ajouter un traqueur d'offset vertical. Correction : (1) le jumeau VERTICAL existe DÉJÀ — packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetTracking.swift:40, `trackScrollContentOffset` (iOS 18+), déjà consommé par une dizaine de sites, seul son CÂBLAGE manque dans `RiverStreamHost` ; (2) l'esquisse ne supprimerait PAS le défaut visé : publier en repère contenu + offset vertical laisserait un `@State` scalaire réécrit à CHAQUE frame — même défaut sous une autre forme. Le patron déjà retenu dans ce dépôt pour exactement ce problème est documenté en alternative rejetée dans `apps/ios/decisions.md:363` (« l'offset est relu par référence dans `visualEffect` », `LentilleSceneActivity`) : l'offset vit dans un objet de RÉFÉRENCE que seule la vue de tracé relit, l'hôte ne portant plus d'état de défilement. Toute mesure préalable doit donc être faite contre CE patron, pas contre l'esquisse initiale.
**Coût :** un lot, pas un one-liner — à mesurer avant d'être décidé. **Risques :** le repère du tracé porte déjà DEUX régressions visuelles documentées (RiverStreamHost.swift:326-331) ; ne rien changer laisse la Rivière plus coûteuse que le fil, sans effet visuel contraire à la directive (risque de performance, pas un défaut visible).
**Décision attendue.** Prioriser ce lot de performance avant/après R-4 (2b-5 ci-dessous), et valider le patron de relais par référence sur le fichier complet avant d'écrire du code.

### 2b-3 — Aucun événement temps réel n'atteint le Résumé Vivant une fois monté
**Constat.** LivingSummaryViewModel.swift:16-22 — `digest`, `faceRamp` figés après `init` ; aucun `subscribe`, aucun `adaptiveOnChange` (LivingSummaryHost.swift:55-63, seul `.task { refreshAgentEnrichment() }`, :56). ConversationView.swift:1506-1535 passe bien `messages: viewModel.messages` à chaque passe de body, mais l'autoclosure de `@StateObject` ne le relit pas. Conséquence : nouveau message ⇒ le compteur d'en-tête (LivingSummaryView.swift:82-90) ne bouge pas.
**Proposition.** Aucun correctif sans arbitrage — c'est ce qui distingue ce constat de 2b-2 (déjà traité séparément). Si « rafraîchir », forme identique à 2b-2 (lever `showsSkeleton`, débrayer par empreinte `RiverConversationMapping.fingerprint`). Si « instantané volontaire », un LIBELLÉ + un geste de recomposition, pas un abonnement.
**Coût :** « rafraîchir » = moyen ; « instantané volontaire » = petit. **Risques :** un rafraîchissement NON borné ferait bouger la rampe de visages et l'ordre des épisodes SOUS LE DOIGT du lecteur — exactement le geste que l'écran sert.
**Décision attendue.** Le Résumé Vivant doit-il se rafraîchir sous les yeux du lecteur qui rattrape, ou est-il un instantané volontaire ?

### 2b-5 — La bulle Rivière ne rend que du texte : média, vocal, réactions, accusés, « modifié », effets, mentions non rendus (R-4)
**Constat.** Matrice feature × mode construite fichier par fichier (Focal ≡ Script, `FocalRow` ne lit jamais `density`). Message média : rendu en Script/Focal (FocalRow.swift:381-435) mais REÇU, NON RENDU en Rivière — `RiverBubbleContent` (RiverBubbleView.swift:12-45) ne porte AUCUN attachment. Quatre lignes que l'énoncé R-4 initial ne nommait pas : accusés, « modifié », effets, mentions.
**Proposition (RESSERRÉE par le sceptique — prévaut).** NE PAS ouvrir un lot concurrent de R-4. Geste minimal immédiat : (1) amender l'énoncé R-4 (tasks/riviere-r137-montage.md:69-73) avec les quatre lignes manquantes ; (2) écrire `RiverRealtimeMatrixTests.swift` sur le modèle de la garde d'exhaustivité `FocalRealtimeMatrixTests.swift:487-497`. L'élargissement RÉEL de `RiverBubbleContent` (réutilisant FocalAttachmentBlock, FocalAudioBlock, BubbleReactionsOverlay, FocalEphemeralBadge, BubbleDeliveryCheck, FocalMetaRow, JAMAIS une seconde composition) reste le contenu de R-4 et exige la mesure de géométrie (MessageFramePreferenceKey, RiverMetrics.Lane.widthMin/widthMax) — il ne se décide pas en revue.
**Coût :** garde + amendement = petit ; élargissement R-4 = un lot, non chiffré. **Risques :** la hauteur du rang est MESURÉE et publiée pour que `RiverLaneCanvas` trace le trait — tout bloc ajouté change la géométrie ; la largeur de couloir est bornée par les tokens.
**Décision attendue.** Valider la garde d'exhaustivité + l'amendement documentaire IMMÉDIATEMENT, puis planifier séparément l'élargissement `RiverBubbleContent`.

### 2b-6 — Un message supprimé DISPARAÎT en Rivière, là où le Fil garde une rangée fantôme
**Constat.** RiverConversationMapping.swift:79 — `let ranked = messages.filter { !$0.isDeleted }`, raison au-dessus (:71-75) : « une bulle vide ferait un rang vide ». Même filtre dans `isVoice` (:174-176) et l'empreinte (:307). Le Fil rend une rangée FANTÔME (BubbleContentBuilder.swift:54-55, `kind = .deleted`), EXIGÉE par le contrat partagé — behaviour-matrix.json F10, témoin FocalRealtimeMatrixTests.swift:305.
**Proposition.** Si parité retenue : retirer `!$0.isDeleted` de `ranked` (:79) tout en le CONSERVANT dans `isVoice` (:174-176) — traitement déjà donné aux avis système — puis rendre le fantôme dans `RiverBubbleView.messageBox` en réutilisant `BubbleContent.kind == .deleted`. Ne PAS toucher `fingerprint` (:307) sans le même geste.
**Coût :** petit à moyen — trois sites à faire évoluer ENSEMBLE. **Risques :** le filtre est à TROIS endroits qui se répondent — n'en changer qu'un produit soit une lane fantôme, soit un plan qui ne se redessine pas.
**Décision attendue.** En Rivière, un message supprimé pour tous doit-il garder son rang avec une rangée fantôme (parité F10), ou disparaître — la raison écrite au-dessus de `ranked` devant alors être corrigée pour dire la disparition ASSUMÉE ?

### 2b-8 — Les sessions de position en direct sont reçues par trois handlers socket et lues par AUCUNE vue
**Constat.** Trois abonnements écrivent l'état : ConversationSocketHandler.swift:1185/1204/1220 (`liveLocationStarted`/`Updated`/`Stopped`). Recensement EXHAUSTIF (`grep -rn "ActiveLiveLocation"`, hors tests) : QUATRE sites, TOUS des déclarations, AUCUN rendu — :28 (protocole), :1190 (construction), ConversationStateStore.swift:34 et ConversationViewModel.swift:336 (`@Published`).
**Proposition (ÉLARGIE par le sceptique — prévaut).** Décision produit REQUISE : « la position en direct est-elle une fonctionnalité de ce cycle ? ». Si NON, retrait sur CINQ sites : trois abonnements (:1185-1226), l'exigence de protocole (:28), les DEUX `@Published`, et les TROIS façades émettrices sans appelant (ConversationViewModel.swift:4749-4765) + `LiveLocationBadge`. Si OUI, la surface manquante est d'abord l'ÉMETTEUR (aucun geste ne démarre un partage aujourd'hui).
**Coût :** retrait (si NON) = petit à moyen, cinq sites synchronisés ; ajout (si OUI) = moyen à élevé. **Risques :** le retrait touche `ConversationSocketDelegate` (:28) — changement de protocole, à faire d'un bloc.
**Décision attendue.** Le partage de position en DIRECT a-t-il une surface prévue pour ce cycle, ou `activeLiveLocations` est-il un VESTIGE à retirer entièrement (cinq sites) ?

## Suites techniques

### 3b — `.communitySettings` (Router) : route morte portant le même bug que Conversation
**Constat.** `CommunityDetailView` reçoit `onOpenSettings: ((MeeshyCommunity) -> Void)?` (ligne 11) mais déclenche le réglage EXCLUSIVEMENT via l'état interne `showSettings = true` (lignes 173, 378) — `onOpenSettings?(...)` n'apparaît NULLE PART (grep : 0 résultat). En parallèle, RootView.swift:367-369 et iPadRootView+Panels.swift:44-48 câblent `onOpenSettings` vers un chemin MORT, `router.push(.communitySettings(community))`.
**Proposition (initiale, CORRIGÉE par le sceptique — prévaut).** La proposition initiale (« supprimer le paramètre ET les branches `.communitySettings` », regression_risk « Nul », « aucun test ne couvre la route ») est FAUSSE : DEUX suites existantes référencent la route — RouterTests.swift:71-73 et :304-310 — et AnalyticsManager.swift:54 doit rester exhaustif sur l'enum. Supprimer `Route.communitySettings` casserait la compilation du bundle de tests. Correctif CORRIGÉ, resserré : retirer UNIQUEMENT le paramètre inutilisé `onOpenSettings` de `CommunityDetailView` (:11, :29, :36) et les deux arguments qui le passent (RootView.swift:368-370, iPadRootView+Panels.swift:47-49) — sans toucher à `Route.communitySettings`, RouterTests, ni AnalyticsManager.
**Coût :** petit — retrait ciblé d'un paramètre mort. **Risques :** NUL pour le retrait resserré ; le seul risque serait de conserver le second chemin (`Route.communitySettings`) et de le brancher un jour sans corriger son `onUpdated`, reproduisant le défaut `conv-settings-stale-open-view` sur la communauté.
**Décision attendue.** Le chemin `.communitySettings` doit-il être supprimé (au prix de mettre à jour deux tests) ou réellement branché un jour (push plein écran au lieu d'un sheet) ?

### 3a — `isAnonymous ?? true` fait passer un inscrit pour anonyme après chaque sauvegarde de profil
**Constat.** Chaîne PROFIL suivie bout en bout (iOS → SDK → gateway → Prisma → réponse → `AuthManager.currentUser`). Deux défauts INDÉPENDANTS et CUMULATIFS : (1) `ProfileView.applyingProfileEdits` (ProfileView.swift:944-987) omet SEPT paramètres du constructeur `MeeshyUser`, qui retombent à `nil` au lieu d'être reportés. (2) Les réponses gateway du profil-SOI (`formatUserResponse`, PATCH `/users/me` + `/avatar` + `/banner`, GET `/auth/me` — types.ts:43-75,96-133, profile.ts:283,360-383,459-482, magic-link.ts:71) sont plus PAUVRES que `MeeshyUser` ; ces quatre sites remplacent `currentUser` EN BLOC, effaçant `isAnonymous`/`blockedUserIds`/`deviceLocale`/thumbHashes/profil vocal SANS refetch réparateur. Conséquence PROUVÉE : `isAnonymous ?? true` (2 sites) fait passer un utilisateur INSCRIT pour anonyme dans le résolveur Lentille (perte du mode `.summary`) après CHAQUE sauvegarde, jusqu'au prochain login.

Suivi séparé du sceptique (à ne pas fondre dans le lot F2 ci-dessous) : `ConversationListView.swift:859` et `ConversationListView+Overlays.swift:177` doivent lire `ConversationViewerIdentityResolver.resolve(authManager:anonymousSession:).isAnonymous` au lieu de `currentUser?.isAnonymous ?? true`, qui est aujourd'hui constamment `true` et prive TOUS les utilisateurs du mode Résumé (`ReadingModeOrchestrator.swift:390-391, 443`). C'est un défaut iOS DISTINCT, plus grave que celui décrit ci-dessus, et sa correction n'a rien à voir avec la forme des réponses gateway.

**Proposition (F2, deux pas CORRIGÉS par le sceptique, « sans arbitrage de fuite »).** Pas 1 — SÛR MAINTENANT, purement additif (userSchema filtre déjà le corps) : dans services/gateway/src/routes/users/profile.ts, faire passer PATCH `/users/me/avatar` (select 360-383) et `/users/me/banner` (459-482) par le MÊME chemin que PATCH `/users/me` — supprimer le `select` manuel et rendre `user: formatUserResponse(updatedUser, permissions)` comme à la ligne 283. Test à étendre : profile.test.ts, describe « PATCH /users/me/avatar — success » (ligne 487). F1 (report des 7 paramètres au lieu de `nil`) reste un correctif ciblé sur ProfileView.swift:944-987, non détaillé davantage dans les sources fournies.
**Coût :** petit pour le Pas 1. **Risques :** nul pour le Pas 1 (purement additif).
**Décision attendue.** Corriger les deux sites (ConversationListView.swift:859, ConversationListView+Overlays.swift:177) en lisant `ConversationViewerIdentityResolver.resolve(authManager:anonymousSession:).isAnonymous` — lot distinct de la vague B, à planifier ; il rend le mode Résumé aux utilisateurs inscrits.

### 2a — `story:created.clientMutationId` posé par la gateway, déclaré par AUCUN des 3 clients
**Constat.** packages/shared/types/post.ts:282-295, doc-comment daté « mesuré le 2026-08-25, aucun client ne le lit encore » : iOS décode `story:created` en `SocketStoryCreatedData` SANS ce champ (SocialSocketManager.swift:50-52), le web n'a AUCUNE occurrence, Android le déclare sans le consommer. À l'inverse, FeedViewModel.swift:1325/1467 montrent la réconciliation par cmid déjà câblée pour `post:created` et les commentaires.
**Proposition.** Ajouter `let clientMutationId: String?` à `SocketStoryCreatedData` et câbler la même logique que FeedViewModel.swift:1325 — SEULEMENT si/quand la story composer devient optimiste.
**Coût :** petit. **Risques :** NUL en l'état (champ optionnel non lu, aucun symptôme actuel) ; pertinent seulement si un futur chantier rend la création de story optimiste.
**Décision attendue.** La création de story doit-elle adopter le pattern optimiste des posts ? Pas d'urgence tant que non.

### 2a — `call:initiated.conversationType`/`conversationTitle` peuplés par la gateway, jamais lus par iOS (proposal réduite)
**Constat.** video-call.ts:436-443 documente le BUT — distinguer « Alice is calling you » (direct) de « Alice is calling the Design Team » (group). CallEventsHandler.ts:2436-2437 et :2570-2571 peuplent SYSTÉMATIQUEMENT les deux champs ; CallNotification.tsx (web) les UTILISE. Côté iOS, `CallOfferData` (MessageSocketManager.swift:1271-1303) ne déclare NI l'un NI l'autre ; `CallManager.swift:4620-4649` compose `callerName` sans mention de type/titre.
Le sceptique a RÉFUTÉ la qualification initiale « defect » : les FAITS sont exacts mais il n'y a NI contrat violé NI directive contredite — reclassé `proposal`.
**Proposition (RÉDUITE par le sceptique — prévaut).** (1) ajouter `conversationType: String?`/`conversationTitle: String?` à `CallOfferData` (:1271-1288) — optionnels, calqués sur le précédent `type`/`participants` déjà optionnels pour compat ascendante ; (2) les faire transiter jusqu'à `reportIncomingVoIPCall` et composer `localizedCallerName` SEULEMENT quand `conversationType == "group"`, en retombant à l'IDENTIQUE sur le nom seul sinon. Le libellé exige une clé de catalogue en 7 langues (garde catalogue, apps/ios/CLAUDE.md) — c'est ce qui interdit `safe_now`. NE PAS étendre au payload push VoIP dans le même lot (aucune preuve citée sur sa composition).
**Coût :** petit à moyen. **Risques :** moyen — touche la présentation CallKit, décision produit sur le format exact et sa localisation.
**Décision attendue.** Valider le format exact du libellé de groupe affiché par CallKit avant implémentation ; confirmer que le payload push VoIP reste HORS lot.

### L4-F2 — L'ordre d'énumération de `CNContactStore` n'est pas fixé
**Constat.** ContactSyncService.swift:186-200 — `fetchDeviceContacts` construit `CNContactFetchRequest(keysToFetch: keys)` SANS predicate NI sortOrder, puis `enumerateContacts` — AUCUN tri explicite avant `.prefix(maxContactsPerSync)`. L'ordre d'énumération d'Apple n'est PAS garanti stable : la fenêtre de 2000 fiches retenue peut VARIER d'une synchronisation à l'autre.
**Proposition.** Aucun correctif isolé — couplé à F1/F4 (contrat de lots de synchronisation pour un carnet de taille arbitraire, `proposal` non détaillée davantage dans les sources fournies). Si un plafond de lecture subsiste après F4, fixer `request.sortOrder` avant le `.prefix`, ce qui rend la fenêtre DÉTERMINISTE d'une synchronisation à l'autre.
**Coût :** petit — un paramètre sur `CNContactFetchRequest`. **Risques :** N/A tant que non modifié ; une fois modifié, à valider contre PhonebookViewModelTests.swift.
**Décision attendue.** Ce correctif dépend du contrat F4 — pour un carnet exceptionnellement volumineux, combien de requêtes séquentielles de 2000 est-il acceptable de déclencher à chaque synchronisation complète, et faut-il une empreinte locale (hash des `contactKey` déjà envoyés) pour éviter de ré-uploader un carnet inchangé ?

## Questions ouvertes

### L1
- Deux des trois effets TOLÉRÉS par la directive n'existent pas dans le dépôt : (a) aucun envol composeur→bulle, (b) aucune animation d'entrée de message.
- L1-01 : quelle constante retenir pour `truncateLimit` — 512 ou 360 ? Choix produit ; le correctif est identique dans les deux cas.
- L1-06/L1-07 : la directive « SANS EFFET lorsqu'on défile » renverse-t-elle les directives du 2026-08-22/2026-08-24, ou vise-t-elle uniquement le mode nominal `.bubbles` ?
- `flattenFocalScene(animated: true)` anime encore `reset` + `focusCard.alpha = 0` sur 0,45 s alors qu'aucune pose n'est appliquée — hors périmètre de la lentille.
- Non couvert faute de pouvoir exécuter : la mesure réelle en frames distinctes/s.

### L2a
- `authenticated` (écho serveur) n'a aucun écouteur iOS — le champ `version` n'est lu par aucun client vérifié, à confirmer.
- `message:pending-delivered` n'est lu que par web — pas de preuve d'un besoin fonctionnel équivalent côté iOS, non vérifié à 100 %.
- `USER_PREFERENCES_COMMUNITY_REORDERED` : confirmé qu'aucune UI Communities n'existe côté iOS — à confirmer que ce n'est pas une feature en cours de portage silencieux.

### L2b
- Le programme bêta est-il ON ou OFF par défaut ? (le code dit OFF, le doc-comment dit ON)
- Le Résumé Vivant doit-il se rafraîchir sous les yeux du lecteur, ou est-il un instantané volontaire ? (2b-3)
- En Rivière, un message supprimé pour tous doit-il garder son rang avec une rangée fantôme ou disparaître ? (2b-6)
- Le partage de position en DIRECT a-t-il une surface prévue, ou `activeLiveLocations` est-il un vestige à retirer ? (2b-8)
- Faut-il faire du pendant Rivière/Résumé de `FocalRealtimeMatrixTests` un cliquet — étendre `behaviour-matrix.json` (champ `surface`) plutôt qu'ajouter une suite iOS de plus ?

### L3b
- Le client web a-t-il le même défaut que `conv-settings-stale-open-view` ? Non audité dans cette passe (scope iOS/SDK/gateway).
- Faut-il promouvoir `ConversationView` à observer un store réactif unifié plutôt que de rapiécer un `@State` local ?
- Le chemin mort `.communitySettings` doit-il être supprimé ou un jour réellement branché ?

### L4
- Pour un carnet exceptionnellement volumineux, combien de requêtes séquentielles de 2000 est-il acceptable de déclencher à chaque synchronisation, et faut-il une empreinte locale ?
- Faut-il une UI de progression pendant une synchronisation multi-lots ?
- Une synchronisation multi-lots interrompue par une perte réseau doit-elle être reprise automatiquement ou laissée à la prochaine synchronisation complète ?
- Le contrat F4 doit-il anticiper web/Android dès sa conception, même si aucun des deux n'implémente la fonctionnalité aujourd'hui ?

### L5
- L5-F1 : la bannière de reprise doit-elle s'afficher aussi quand l'appel a été refusé/quitté par ce device mais reste actif ailleurs ?
- L5-F1 : où couper l'appel réseau — à chaque retour au premier plan, une fois par montage, ou aussi rejoué sur `didReconnect` ?
- L5-F4 : quelle est la durée réelle observée d'un reboot iPhone jusqu'à la reconnexion du socket sur ce parc ?
- Le web a exactement la même forme que iOS pour la reprise (`OngoingCallBanner`) — faut-il traiter les deux clients dans le même lot ?
- `tasks/2026-08-13-group-calls-gap-analysis.md` §S1 est PÉRIMÉ (cap 2→9999) — qui met le document à jour, et §S2 (`mode: CallMode.p2p` codé en dur) est-il toujours vrai à dessein ?

### L6
- L'image figée pendant les premières secondes d'une coupure du pair n'a aucune explication à l'écran — `call:reconnecting` n'est PAS relayé aux autres participants.
- La bascule thermique `.critical` falsifie l'INTENTION de l'utilisateur (coupe la piste, `isVideoEnabled = false`) — hors lentille (protection de l'appareil).
- Le plancher de gel à 1-2 fps consomme ~100 kbps en continu — `encodings[].isActive = false` libérerait tout, au prix d'une keyframe à la reprise qu'aucune API du binding iOS ne permet de forcer.
- La passerelle persiste l'état média du participant à chaque toggle — cesser d'émettre depuis la survie supprime des écritures erronées, mais les consommateurs aval (résumé d'appel, etc.) n'ont pas été vérifiés.

### L7
- Combien pèsent réellement les médias de stories et de feed en production ? (ordres de grandeur dérivés des budgets d'encodage, pas d'une mesure)
- `connectionRTT` n'a AUCUN abonné hors mocks — si personne ne prévoit de le brancher, le battement applicatif de la socket messages perd sa dernière justification.
- BW-IOS-05 : coalescence proposée plutôt que suppression de `markAsReceived`, faute d'avoir pu exclure une fenêtre multi-device.
- L'ensemble Prisme à passer dans `?languages=` doit-il inclure la langue d'ORIGINE du message (piste TTS de la langue d'origine) ?
- BW-GW-01 : taille réelle non mesurée d'un `speakerAnalysis` de production — si quelques centaines d'octets, le constat descend dans le classement.
- `HAUTE-07` (traductions incluses dans les re-diffusions `message:new`) et `MOYENNE-12` (`Post`/`Story` complet diffusé à tous les amis) restent ouvertes, hors périmètre de cette lentille.

### L8
- `autoTranslateEnabled` est-il une propriété de la CONVERSATION (admin-only) ou existe-t-il une préférence par LECTEUR côté passerelle ?
- La duplication du réglage « langue principale » entre profil et Réglages (L8-P1) est-elle souhaitée, ou faut-il l'y DÉPLACER ?
- « Meeshy Chats » est-il un nom de produit contractuel (App Store, marque) ?
- La sortie de « épingler »/« transférer » vers la feuille « Plus… » est-elle figée, alors que ce sont les gestes les plus fréquents après répondre/réagir sur d'autres messageries ?
- Le drapeau bêta `readingModes` restera-t-il OFF par défaut ?
