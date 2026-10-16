## Événements sociaux v2 : chaque interaction avec un contenu est capturée, exploitable plus tard — enveloppe, cible générique, contexte de listing, catalogue typé, capture d'écran, défilement (2026-10-13)

> Suite de #10483 (`2026-10-13-chaque-affichage-est-compte-avec-ou-sans-compte-10483.md`), qui a fait de `POST /api/v1/social/events` la porte UNIQUE de la télémétrie de lecture. Demande du porteur (2026-10-13) : « ajouter ce qui manque. Il faut capturer l'événement screenshot aussi ! défilement sur le contenu aussi ! Essaye d'avoir un événement complet avec la SOTA qu'on pourra exploiter le moment venu ! » Pilotage : milestone « Chaque interaction avec un contenu est capturée, exploitable plus tard » (échéance 2026-10-27), issue chapeau et une issue par famille (#10499 et ses filles, section Pilotage en fin de fichier).

### Contexte — ce que la porte sait dire aujourd'hui, et ce qui lui manque

Ce que #10491 livre : cinq types (`impression`, `open`, `view`, `dwell`, `download`) en union DISCRIMINÉE Zod sur `type`, lot ≤ 200, `surface` (`CONTENT_SURFACES`), `origin` et `provenance` (`content-reach.ts`), compte (JWT) ou anonyme (`readerKey` HMAC), filtre d'audience en une passe avant écriture, débit 120/min par compte et 60 événements/min par lecteur anonyme. Stockage : compteurs sur `Post`, lignes `PostImpression` (sans TTL), `PostView` (unique par lecteur), `AnonymousPostOpen` (TTL 90 j), `PostEngagement` (sessions `dwell`, idempotentes sur `sessionId`, `actions[]` en TEXTE LIBRE `{type ≤ 40 car., atMs}`).

Ce qui manque, relevé dans le code :

| manque | conséquence aujourd'hui |
|---|---|
| aucun identifiant d'événement | un lot rejoué après un ACK perdu compte deux fois (seul `dwell` est idempotent, par `sessionId`) |
| aucune heure d'occurrence | une file hors ligne vidée le lendemain date tout de l'heure de RÉCEPTION |
| aucun contexte d'application (session, plateforme, version, OS, réseau, langue) | impossible de séparer une régression iOS 3.4 d'un creux d'audience ; impossible de mesurer le Prisme (« ce contenu lu traduit est-il plus engageant ? ») |
| aucune position dans le listing, aucun identifiant de requête de fil, aucune source de classement | le classement ne peut pas apprendre (CTR par position, biais de position non corrigeable) |
| impression = « rendu », jamais « visible » | aucune impression VISIBLE au sens MRC |
| cible = `postId` seul | un commentaire, un profil, un hashtag, un son, un lien ne peuvent pas être la cible d'un événement |
| `actions[]` en texte libre | aucun schéma, aucune agrégation fiable ; « like », « liked », « reaction » coexistent potentiellement |
| aucun signal négatif, aucune qualité de lecture vidéo, aucun clic sortant, aucune recherche, aucune notification ouverte, aucune capture d'écran, aucun défilement | la moitié des signaux qu'utilisent les grandes plateformes pour classer et pour diagnostiquer manquent |

Ce qui existe AILLEURS et que la télémétrie ne remplace pas : réagir, commenter, partager (`shareCount`), enregistrer, s'abonner, signaler, bloquer ont chacun leur route REST de MUTATION, qui reste la seule à modifier un état ou un compteur. La v2 les CONTEXTUALISE (depuis quel écran, à quelle position, après combien de secondes de lecture, traduit ou non) ; elle n'incrémente jamais un compteur qu'une mutation incrémente déjà. Et l'annonce de capture d'un MESSAGE éphémère (#9617, `ContentCaptureReporter`, `ContentCaptureService`) est un mécanisme de PRODUIT (prévenir l'expéditeur) : la v2 n'y touche pas et ne capture rien dans les conversations.

### État de l'art — ce qu'on reprend, de qui

| référence | ce qu'elle tranche | repris ici |
|---|---|---|
| **Snowplow** (self-describing events + entités de contexte, `event_id`, trois horloges `dvce_created_tstamp` / `dvce_sent_tstamp` / `collector_tstamp` → `derived_tstamp`) | un événement = un schéma versionné + des contextes attachés ; l'horloge de l'appareil se CORRIGE par l'écart envoi/réception | `eventId`, `occurredAt` + `sentAt` au lot ⇒ `derivedAt = receivedAt − (sentAt − occurredAt)` ; schéma par type, version au lot |
| **Segment Spec** (`messageId`, `timestamp` / `sentAt` / `receivedAt`, objet `context` : app, device, os, network, locale, screen) | le contexte voyage UNE fois, à côté des événements ; les événements e-commerce ont un catalogue nommé (`Product Clicked`, position, list_id) | `context` au niveau du LOT ; `listing.position`, `listing.feedRequestId` (le `list_id` de Segment) |
| **OpenTelemetry semantic conventions** (`session.id`, `app.*`, `os.name/version`, `device.model.identifier`, `network.connection.type/subtype`, `event.name`) | noms stables et énumérations ouvertes pour le contexte d'exécution | `context.appSessionId`, `os`, `network.type/subtype` nommés à l'identique de leur sens OTel |
| **IAB / MRC Viewable Impression Guidelines** | affichage : ≥ 50 % des pixels visibles ≥ 1 s continue ; vidéo : ≥ 50 % ≥ 2 s continues | `visibility.viewable` calculé client selon ces deux seuils, plus `maxVisibleFraction` et `visibleMs` bruts |
| **Mux Data / Conviva** (QoE vidéo) | startup time, rebuffer count/duration/ratio, playback failure, exit-before-video-start, bitrate/rendition changes, une VUE de lecture = une session résumée | type `playback` : UN résumé par session de lecture, jamais un battement |
| **YouTube / TikTok / Instagram** (signaux publics : watch time, average view duration, audience retention, completion, rewatch/loop, share, save, « Pas intéressé », skip, CTR d'impression) | les signaux de classement sont : temps regardé, complétion, boucles, partages, enregistrements, signaux négatifs EXPLICITES et IMPLICITES (skip rapide) | `playback.quartiles`, `loops`, `negative.quick_skip`, `interaction.share.destination`, `interaction.save` |
| **CNIL** (mesure d'audience exemptée de consentement si strictement limitée ; durée de vie 13 mois, données conservées ≤ 25 mois) | séparer MESURE (exemptée) et COMPORTEMENT (consentie) | deux classes d'événements, durées de conservation alignées (brut ≤ 90 j, agrégats ≤ 25 mois) |

### Décision

#### 1. Enveloppe — tout champ nouveau est FACULTATIF

**Au niveau du LOT** (objet `context`, envoyé une fois par requête — un ancien serveur le retire en silence, `z.object` non strict) :

| champ | type | sens |
|---|---|---|
| `schemaVersion` | `2` | version du contrat ; absent ⇒ 1 |
| `sentAt` | ISO 8601 | heure de l'appareil à l'ENVOI (correction d'horloge) |
| `appSessionId` | UUID v4 | session d'application : nouvelle après 30 min d'inactivité ou au démarrage à froid (règle Segment/Firebase) ; jamais l'identifiant d'appareil |
| `platform` | `ios` · `web` · `android_shell` · `pwa` | |
| `appVersion`, `build` | chaîne ≤ 20 | |
| `os` | `{ name, version }` (version MAJEURE.mineure seulement) | |
| `deviceClass` | `phone` · `tablet` · `desktop` | jamais le modèle exact (empreinte) |
| `network` | `{ type: wifi·cellular·ethernet·offline·unknown, subtype?: 2g·3g·4g·5g }` | `NWPathMonitor` (iOS), `navigator.connection.effectiveType` quand il existe (web) |
| `uiLanguage` | BCP-47 court | langue de l'application (`systemLanguage`) |
| `deviceLocale` | BCP-47 court | rang 4 du Prisme |
| `consent` | `granted` · `denied` · `unknown` | consentement d'analyse tel que le client le connaît ; la passerelle fait foi (point 6). Règle client (2026-10-13, vie privée d'abord tant que #10511 n'est pas tranchée) : bascule « Analytique » coupée, valeur par défaut comprise ⇒ `denied`, toujours, même si la passerelle garde un accord plus ancien ; bascule active ⇒ `granted` seulement si la passerelle l'a confirmé (`GET /me/consents`), `unknown` sinon. Le comptage #10483 ne lit pas ce champ |
| `capabilities` | sous-ensemble de `screenshot` · `screen_recording` · `scroll` · `playback_qoe` | ce que CE client sait détecter : l'absence d'un type ne se lit pas comme zéro (un navigateur ne voit aucune capture) |
| `sampling` | `{ [type]: 0..1 }` | taux appliqué par le client (point 7) |

**Au niveau de CHAQUE événement**, en plus des champs de son type :

| champ | type | sens |
|---|---|---|
| `eventId` | UUID v4 (v7 accepté) | idempotence : index unique ; un rejeu est un no-op |
| `occurredAt` | ISO 8601 | heure de l'appareil à l'OCCURRENCE |
| `target` | `{ kind, id, parent? }` | point 2 |
| `surface` | `CONTENT_SURFACES` (étendue, point 2) | |
| `listing` | point 3 | |
| `prism` | `{ displayedLanguage, originalLanguage?, translated: bool, translationSource?: server·device }` | ce que le lecteur a VU — mesure du Prisme ; `device` = traduction sur l'appareil (E2EE, #9224) |

**Horloge** : la passerelle range `receivedAt` (son heure), `occurredAt` tel que reçu, et `derivedAt = receivedAt − (sentAt − occurredAt)` (Snowplow) — c'est `derivedAt` qu'on agrège. `derivedAt` hors de `[receivedAt − 72 h, receivedAt + 5 min]` ⇒ ramené à `receivedAt` et `clockSkewed: true`. Les événements de plus de 72 h sont IGNORÉS (une file hors ligne plus vieille n'a plus de sens d'audience et ouvrirait une porte au rejeu massif).

#### 2. Cible générique

`target = { kind, id, parent?: { kind, id } }`, `kind ∈ post · reel · story · status · comment · profile · hashtag · sound · community · link · notification` — énumération dans `packages/shared/types/social-events-v2.ts`, valeur INCONNUE ⇒ événement ignoré (compté `ignored`), jamais le lot.

- `id` : ObjectId pour `post/reel/story/status/comment/profile/community/sound/notification` ; nom normalisé (minuscules, sans `#`, ≤ 100) pour `hashtag` ; pour `link`, l'id du lien de suivi s'il en est un, sinon le DOMAINE enregistrable (eTLD+1) — jamais l'URL complète ni sa requête.
- `parent` : le post d'un commentaire, le post qui porte un lien, la story qui porte un sticker.
- Les cinq types existants gardent `postId` (obligatoire, inchangé) ; `target` y est facultatif et redondant. Les types v2 exigent `target` ; `postId` n'y existe pas.
- **Audience** : pour `post/reel/story/status/comment`, le filtre d'audience EXISTANT (`filterConsumablePostIds` / `readServableToAnonymous`, sur le post ou sur le `parent` d'un commentaire) s'applique AVANT toute écriture, comme aujourd'hui ; ce qui n'y survit pas est `rejected`, sans oracle d'existence. `profile/hashtag/sound/community/link/notification` : pas de garde de lecture (aucun compteur ne bouge, rien n'est servi), mais l'identifiant est validé en forme ; `notification` doit appartenir à l'acteur (sinon `rejected`).
- `CONTENT_SURFACES` s'étend (additif, ancien serveur : valeur inconnue ignorée) de `search`, `notifications`, `comments`, `link_preview`, `conversation_citation`… — la liste exacte est posée par l'issue gateway, dans `content-surfaces.ts` et nulle part ailleurs.

#### 3. Contexte de listing et impression VISIBLE

Facultatif sur `impression`, `open`, et sur tout type v2 émis DEPUIS un listing :

| champ | sens |
|---|---|
| `listing.feedRequestId` | identifiant OPAQUE servi par la passerelle dans la réponse de la page de fil (`meta.feedRequestId`, additif) — relie l'impression à la page servie et à la version du classement |
| `listing.position` | rang 0-indexé dans le listing tel que RENDU (après insertion des stories, publicités futures…) |
| `listing.rankingSource` | `following` · `for_you` · `trending` · `nearby` · `search` · `hashtag` · `sound` · `profile` · `bookmarks` · `other` — servi aussi par la passerelle, par item (`meta.rankingSource` ou champ additif de l'item) |
| `listing.listingSessionId` | UUID du passage dans CE listing (point 5, défilement) |

`visibility = { maxVisibleFraction: 0..1 (2 décimales), visibleMs, viewable: bool }`, sur `impression` seulement. `viewable` suit le MRC : ≥ 0,5 de la surface ≥ 1 000 ms continues ; pour une vidéo en lecture, ≥ 0,5 ≥ 2 000 ms continues. **La règle de comptage du porteur ne change pas** : chaque listing est une impression (`impressionCount`) ; `viewable` est un ATTRIBUT rangé sur la ligne, qui alimentera plus tard `viewableImpressionCount` sans toucher au compteur existant. Conséquence client : l'impression part au RENDU comme aujourd'hui (pas de délai qui ferait perdre une impression), et un `impression` porte la visibilité si elle est connue au moment du lot ; sinon un événement v2 `visibility` (`target`, `listing.position`, les trois champs) la complète, relié par `impressionEventId`.

#### 4. Catalogue typé — les types v2

Chaque type a un schéma Zod FERMÉ sur ses champs, OUVERT sur les valeurs d'énumération (inconnue ⇒ `other` ou événement ignoré, dit par type). Les verbes sont au passé (« ce qui s'est passé »), un `action` discrimine dans la famille.

| `type` | `action` (énumération) | champs propres | ce que la mutation REST fait déjà |
|---|---|---|---|
| `interaction` | `react` · `unreact` · `comment_open` · `comment_submit` · `share` · `save` · `unsave` · `follow` · `unfollow` · `profile_tap` · `hashtag_tap` · `sound_tap` · `mention_tap` · `caption_expand` · `translation_toggle` · `original_view` · `repost` · `quote` · `download_open` | `share.destination` (`copy_link` · `conversation` · `native_sheet` · `story` · `repost` · `external_app` · `other`), `dwellBeforeMs` (lecture écoulée avant le geste), `mutationId?` (id retourné par la route de mutation) | compteur, état, notification — la v2 ne recompte RIEN |
| `negative` | `quick_skip` · `not_interested` · `see_less` · `hide` · `hide_author` · `mute_author` · `report_open` · `report_submit` · `block` · `unfollow_from_content` | `reasonCode?` (énumération du signalement existant), `visibleMs` (pour `quick_skip`) | signalement, blocage, masquage : leur route |
| `playback` | `session` (une seule action : le RÉSUMÉ) | `playbackId`, `mediaId`, `mediaDurationMs`, `startupMs` (jusqu'à la 1re image), `exitBeforeStart: bool`, `playedMs`, `rebufferCount`, `rebufferMs`, `errorCode?`/`errorDomain?` (code, jamais un message), `avgBitrateKbps?`, `renditionChanges`, `loops`, `pauses`, `seeks`, `mutedAtStart`, `muteToggles`, `captionsOn`, `quartiles` (bitmask 25/50/75/100), `exitReason` (`completed` · `swiped` · `closed` · `backgrounded` · `error` · `other`) | — (`dwell` garde ses `watchSamples` ; `playback` le complète, il ne le remplace pas) |
| `link` | `outbound_click` · `tracking_link_followed` · `preview_open` | `target.kind = link`, `domain` (eTLD+1), `trackingLinkId?` | le lien de suivi compte son clic côté redirection (`/l/`) : la v2 ne le recompte pas, elle dit d'OÙ il a été touché |
| `discovery` | `search_submitted` · `search_result_click` · `search_abandoned` · `profile_visit` · `hashtag_visit` · `sound_visit` · `community_visit` | `searchId` (UUID client, relie soumission et clics), `queryLength`, `queryLanguage?`, `queryFingerprint?` (point 6), `resultCount`, `resultKind`, `listing.position` | — |
| `story` | `reply_sent` · `quick_reaction` · `poll_vote` · `sticker_tap` · `link_sticker_tap` · `mention_sticker_tap` · `exit_before_end` · `tap_forward` · `tap_back` · `swipe_next_author` · `hold_pause` | `slideIndex`, `slideCount`, `elapsedMs` (dans la slide) | réponse, réaction, vote : leurs routes |
| `notification` | `received` · `displayed` · `opened` · `dismissed` | `target.kind = notification`, `notificationType`, `channel` (`apns` · `fcm` · `webpush` · `in_app`), `deliveryLatencyMs?` (envoi serveur → réception), `parent?` (le contenu visé) | — |
| `screen_capture` | `screenshot` · `recording_started` · `recording_stopped` | `visibleTargets` (≤ 10 `{kind,id,visibleFraction}` — ce qui était À L'ÉCRAN), `recordingMs?` (au stop), `surface` | — (#9617 garde l'annonce des MESSAGES éphémères, hors périmètre) |
| `scroll` | `listing` · `content` | point 5 | — |
| `visibility` | `measured` | point 3 | — |

#### 5. Défilement — agrégé par passage, jamais par image

`scroll.listing` — UN événement par passage dans un listing (`listingSessionId`), émis à la sortie de l'écran, au passage en arrière-plan, ou toutes les 60 s d'un passage qui dure (l'événement suivant porte le même `listingSessionId` et un `segment` croissant ; l'agrégat somme) :

`durationMs`, `activeScrollMs`, `itemsRendered`, `itemsViewable` (distincts au sens MRC), `maxPosition`, `distancePt` (points logiques, indépendants de la densité), `velocityHistogram` (`[<500, 500–1500, 1500–4000, ≥4000]` pt/s, en ms passées dans chaque classe), `directionChanges`, `upDistanceRatio` (0..1), `flings`, `stops` (arrêts ≥ 1 s), `refreshes` (tirer pour rafraîchir), `paginations`, `reachedEnd`.

`scroll.content` — le défilement À L'INTÉRIEUR d'un contenu, un événement par contenu et par ouverture : `target`, `contentKind` (`carousel` · `long_text` · `comments` · `story_slides` · `thread`), `itemsTotal`, `maxIndexReached`, `swipes`, `maxScrollFraction` (0..1), `readThroughFraction` (part du texte passée dans le cadre), `durationMs`.

Mesure côté client : l'échantillon de vitesse est lu au plus à 10 Hz (iOS : `scrollViewDidScroll` filtré par horloge, ou `CADisplayLink` décimé ; web : `scroll` passif + `requestAnimationFrame` décimé), cumulé en mémoire dans un accumulateur borné (taille fixe), et rien ne part avant la fin du passage : **aucune écriture, aucun réseau, aucune allocation par image**. Témoin de fluidité : l'accumulateur ne fait que des additions sur des entiers.

#### 6. Vie privée

- **Deux classes d'événements**. MESURE (exemptée, pseudonyme) : `impression`, `open`, `view`, `download`, `dwell` (inchangés : ils gardent leur rangement actuel), `visibility`, `playback`, `notification`. COMPORTEMENT : `interaction`, `negative`, `discovery`, `story`, `link`, `scroll`, `screen_capture`. Un événement de comportement d'un COMPTE n'est rattaché à son `userId` que si `User.analyticsConsentAt` est posé (la passerelle lit le consentement, jamais le client) ; sinon il est rangé SANS acteur (`actorKind: none`) — il nourrit les agrégats par contenu, jamais un profil. La qualification juridique exacte (intérêt légitime pour la mesure, consentement pour le classement personnalisé) est confiée à l'agent `conformite-juridique` et à une issue `décision-produit` ; elle ne remplace pas un avis juridique signé. Tant qu'elle n'est pas tranchée, la règle ci-dessus (la plus restrictive des deux lectures pour le comportement) s'applique.
- **Anonymes** : `readerKey` HMAC comme aujourd'hui ; DEUX seaux de débit par lecteur et par adresse (`AnonymousBudgetScope`, `routes/social/anonymousReader.ts`) — le comptage (vue, ouverture, impression) et la v2, 60/min par lecteur et 600/min par adresse chacun : le défilement d'un visiteur ne fait jamais refuser ses vues ; types admis : `impression`, `open`, `view` (comme aujourd'hui ; `dwell` et `download` restent refusés en 403), et en v2 `visibility`, `playback`, `scroll`, `screen_capture`, `link`, `discovery` (sans acteur rangé : la `readerKey` ne sert qu'au débit). Jamais d'IP, jamais de jeton brut, jamais d'agent utilisateur brut (la passerelle ne garde que `platform`/`os` déclarés).
- **Recherche** : le texte saisi ne quitte JAMAIS l'appareil dans un événement. `queryFingerprint = HMAC-SHA256(SEARCH_FINGERPRINT_SECRET, texte normalisé)` est calculé PAR LA PASSERELLE sur la requête de recherche elle-même (qui porte déjà le texte) et renvoyé avec les résultats sous `meta.searchId` ; l'événement ne porte que `searchId`, `queryLength`, `queryLanguage`. Un futur « recherches populaires » passera par un agrégat à k-anonymat (≥ 20 lecteurs distincts par jour) — issue à part, rien de cela en v2.
- **Capture d'écran** : on range QU'il y a eu capture, quelle surface, quels contenus étaient visibles — jamais l'image, jamais le contenu. Une capture faite DANS une conversation n'est pas un `screen_capture` v2 (#9617 la gère, E2EE oblige).
- **Liens** : domaine enregistrable seulement.
- **Données libres** : aucune chaîne libre dans un événement v2 ; chaque chaîne est une énumération, un identifiant ou un code borné (≤ 64). Taille d'un événement sérialisé ≤ 2 Kio, sinon ignoré.

#### 7. Échantillonnage

- Jamais échantillonnés : les types de COMPTAGE (`impression`, `open`, `view`, `download`, `dwell`) et `screen_capture`, `negative`, `interaction`, `notification`, `link`, `discovery`, `story` (rares et précieux).
- Échantillonnables par la passerelle sans nouvelle version d'app : `scroll`, `playback`, `visibility`. La réponse porte `data.sampling: { scroll, playback, visibility }` (valeur de `SOCIAL_EVENTS_V2_SAMPLING`, défaut 1) ; le client tire au sort UNE fois par `appSessionId` (pas par événement : une session est entière ou absente) et déclare le taux dans `context.sampling`, que les agrégats utilisent pour redresser (poids = 1/taux).
- Interrupteur d'urgence : `SOCIAL_EVENTS_V2_ENABLED=false` ⇒ les types v2 sont acquittés (`ignored`) sans écriture.

#### 8. Compatibilité — un ancien serveur ne fait jamais perdre un compte

1. **Les cinq types existants ne changent pas** de champs obligatoires. Enveloppe, `target`, `listing`, `visibility`, `prism` y sont facultatifs : un ancien serveur les retire (objet non strict), un nouveau les range.
2. **Les types v2 voyagent dans une requête À PART**, jamais avec un type de comptage — la règle déjà appliquée à `open` : l'ancien serveur (#10491 comme `dev`/`main`) refuse en 400 un lot qui porte un `type` inconnu (union discriminée), et ce refus ne doit emporter que des événements v2.
3. **Capacité annoncée** : la nouvelle passerelle répond `data.accepts: ['impression', …, 'scroll']` et l'en-tête `X-Social-Events-Version: 2`. Un client qui ne l'a pas encore lu envoie ses événements v2 une fois ; un 400 sur une requête v2 ⇒ les événements v2 de la file sont JETÉS (pas de rejeu) et la file v2 se met en sommeil jusqu'au prochain démarrage à froid ou pendant 1 h.
4. **Le nouveau serveur parse ÉVÉNEMENT PAR ÉVÉNEMENT** : le corps est `{ events: unknown[] ≤ 200 }`, chaque élément passe par `SocialEventSchema.safeParse` ; un `type` inconnu ou un événement invalide est compté `ignored` (champ additif de la réponse), et le reste du lot s'écrit. Un client plus neuf que le serveur ne perd donc rien de ce que le serveur sait lire. `recorded` et `rejected` gardent leur sens.
5. Valeurs d'énumération inconnues : ignorées (champ ôté) ou rabattues sur `other`, selon le type — jamais un refus.
6. Débit : les types v2 partagent le seau du compte (120 req/min) et le budget anonyme en ÉVÉNEMENTS ; cadence client : un lot v2 au plus toutes les 10 s ou à 50 événements, et à la sortie (iOS : `beginBackgroundTask`, web : `pagehide` + `keepalive` ≤ 100).

#### 9. Stockage — une collection append-only, bornée, écrite par lots

**Les compteurs et les tables de comptage ne bougent pas** (`Post.*Count`, `PostImpression`, `PostView`, `AnonymousPostOpen`, `PostEngagement`). Les champs nouveaux des types existants se rangent sur LEURS lignes (colonnes facultatives de `PostImpression` : `eventId`, `position`, `feedRequestId`, `rankingSource`, `viewable`, `visibleFraction`, `visibleMs`, `appSessionId`, `platform`). `PostImpression` reçoit un `expiresAt` (TTL) — elle n'en a aucun et c'est la table la plus volumineuse. Sa durée, et celle de `PostEngagement`, est réglable (§ Conservation du brut de lecture, plus bas) ; 90 j à l'origine, 25 mois par défaut depuis la décision porteur du 2026-10-16.

Les types v2 vont dans **`ContentEvent`** (nouveau modèle Prisma, collection MongoDB) :

| champ | |
|---|---|
| `eventId` (unique, partiel sur existence), `type`, `action` | |
| `day` (entier `AAAAMMJJ`, UTC, de `derivedAt`) | clé de partition logique des agrégats |
| `derivedAt`, `occurredAt`, `receivedAt`, `clockSkewed?` | |
| `actorKind` (`user` · `none`), `userId?` | `userId` seulement avec consentement (point 6) ; jamais de `readerKey` rangée |
| `appSessionId?`, `platform?`, `appVersion?`, `osName?`, `osVersion?`, `network?`, `uiLanguage?` | contexte aplati — les agrégats groupent dessus sans `$lookup` |
| `targetKind`, `targetId`, `parentKind?`, `parentId?`, `surface?` | |
| `listing?`, `prism?`, `props` (Json, schéma par type) , `sampleRate` | |
| `expiresAt` | TTL : 30 j pour `scroll`, `playback`, `visibility` ; 90 j pour les autres |

Index : `{eventId}` unique partiel · `{targetKind, targetId, day}` · `{userId, day}` partiel · `{type, action, day}` · `{expiresAt}` TTL (`expireAfterSeconds: 0`). Le moteur Prisma MongoDB ne sait pas déclarer un TTL : l'index se pose par migration IDEMPOTENTE nommée (le précédent `ANONYMOUS_POST_OPEN_TTL_INDEX`), jamais par `prisma db push` en staging/production.

Écriture : UNE `insertMany({ ordered: false })` par requête (le lot est déjà groupé), un doublon d'`eventId` (E11000) est un rejeu, compté `recorded` côté client et non réécrit. Moins de 1 000 utilisateurs : rien de plus. Seuil de bascule (mesuré, pas présumé : p95 de la route > 50 ms ou > 300 écritures/s soutenues) : file Redis Stream `social-events:v2` (`XADD MAXLEN ~ 1 000 000`) vidée par un groupe de consommateurs en lots de 500 / 1 s — la passerelle reste sans état. Une collection time-series MongoDB 8 (compression, TTL natif) est l'étape suivante pour `scroll` / `playback` si le volume l'exige ; elle interdit l'index unique, donc l'idempotence y passerait par la file.

**Volume estimé à 100 000 inscrits** (hypothèse : 30 % actifs par jour ; par actif et par jour : 150 impressions, 30 vues, 20 interactions, 10 sessions de lecture, 6 passages de défilement, 10 défilements de contenu, 5 notifications, 3 découvertes, 0,2 capture) :

| | par jour | débit moyen / crête ×5 | taille |
|---|---|---|---|
| impressions (`PostImpression`, existant) | 4,5 M lignes | 52/s · 260/s | ~180 o + index ⇒ ~1,2 Go/j, 90 j ≈ 110 Go — d'où le TTL ; au-delà, agrégat journalier |
| `ContentEvent` (v2) | ≈ 1,6 M | 19/s · 95/s | ~450 o + index ⇒ ~0,9 Go/j ; ≈ 50 Go à l'équilibre (30/90 j) |
| requêtes HTTP | ≈ 0,5 M (lots de ~20) | 6/s · 30/s | |

Moins de 1 000 utilisateurs : ~0,5 Go à l'équilibre. Rien n'empêche 100 000 : écriture par lots, aucun état en processus, TTL, index bornés.

#### 10. Lecture future — les agrégats prévus

Un job quotidien (03:00 UTC, idempotent par `day`, `$group` + `$merge`) remplit **`ContentEventDaily`** `(day, targetKind, targetId, type, action, surface, platform)` → `count`, `distinctActors` (HyperLogLog Redis `PFADD` du jour, jamais une liste), sommes et histogrammes utiles par type, redressés par `sampleRate`. Conservation : 25 mois. Lectures prévues, aucune servie en v2 :

- CTR par position et par source de classement (correction du biais de position) ; taux d'impression VISIBLE ;
- rétention d'audience vidéo (quartiles), temps de démarrage p50/p95, taux de rebuffering, échecs de lecture par plateforme/version/réseau ;
- taux de signaux négatifs par contenu et par auteur (entrée du classement, de la modération) ;
- profondeur et vitesse de défilement par surface (fatigue du fil), lecture des carrousels et textes longs ;
- captures d'écran par contenu (popularité « hors plateforme », et décision produit possible : prévenir l'auteur d'une story, comme Snapchat — issue `décision-produit`, rien en v2) ;
- effet du Prisme (traduit vs original) sur la complétion et l'engagement ;
- entonnoir notification reçue → affichée → ouverte → vue ;
- recherche : taux de clic, position du clic, recherches sans clic.

#### 11. Capture d'écran — ce qui est détectable, et rien d'autre

| plateforme | capture (screenshot) | enregistrement d'écran |
|---|---|---|
| **iOS** | `UIApplication.userDidTakeScreenshotNotification` — APRÈS coup, sans l'image, sans pouvoir l'empêcher ; fiable sur l'app au premier plan | `UIScreen.main.isCaptured` + `UIScreen.capturedDidChangeNotification` (iOS 11+ ; `UITraitCollection.sceneCaptureState` à partir d'iOS 17) — VRAI aussi pour la recopie AirPlay et la capture par QuickTime : on range `recording_started` avec `captureKind: recording_or_mirroring`, jamais « enregistrement » seul |
| **coque Android** (`apps/web/android`) | `Activity.registerScreenCaptureCallback` à partir d'Android 14 (API 34, permission `DETECT_SCREEN_CAPTURE`) — un greffon Capacitor minimal ; avant API 34 : RIEN de fiable (l'observation du dossier Captures exige une permission de stockage : refusé) | aucune API publique de détection ; `FLAG_SECURE` empêche, il ne détecte pas — rien |
| **web / PWA** | AUCUNE API. La touche `PrintScreen` n'arrive pas toujours au document (Windows : souvent interceptée par le système ; macOS ⌘⇧3/4/5 : jamais) ; `getDisplayMedia` ne voit que la capture que la page démarre elle-même | aucune |

Le web n'émet donc AUCUN `screen_capture` et déclare `capabilities` sans `screenshot` : une absence de capture web n'est pas un zéro. iOS réutilise la détection de #9617 (un seul observateur de notification dans l'app : `ContentCaptureReporter` gagne un second abonné « contenu social », il n'en naît pas un second), avec des sources propres aux surfaces de contenu (fil, réels, détail, story, profil) qui exposent leurs cibles visibles — le même protocole `ContentCaptureSource`, pas un registre de plus.

### Conséquences

- Un rejeu, une file hors ligne, une version d'app, un réseau lent, une traduction affichée, une position dans le fil sont enfin LISIBLES ; les familles manquantes (négatif, QoE, liens, découverte, stories, notifications, capture, défilement) ont un schéma.
- Coût : un modèle Prisma de plus, deux migrations d'index (TTL `ContentEvent`, TTL `PostImpression`), une requête v2 de plus par lot côté client, ~0,9 Go/j à 100 000 inscrits.
- Rien n'est affiché en v2 : la capture précède l'exploitation, comme demandé. Chaque lecture future est une issue à part.
- Android Kotlin (gelé) ne reçoit rien ; la coque Android de `apps/web` reçoit le greffon de capture (API 34+).

### Mise en œuvre de la passerelle (2026-10-13) — ce qui s'écarte du texte ci-dessus, et pourquoi

La revue de conformité (huit corrections O1–O8, recommandations R1–R8) prime sur le texte d'origine. La passerelle l'applique ainsi :

| point | ce que fait le code | site |
|---|---|---|
| idempotence | l'`eventId` BRUT n'est rangé nulle part : sa CLÉ HMAC (`eventKey`, secret des clés de lecteur) l'est — sur `PostImpression` pour l'impression d'un compte, dans un REÇU sans acteur ni contexte (`ContentEvent`, `action = receipt`, 4 j) pour une vue, une ouverture ou une impression anonyme, sur la ligne v2 sinon. Le « sel du jour » de O1 n'est pas nécessaire : un `eventId` est propre à UN événement, une ligne n'en porte qu'un, et sa clé ne relie rien | `services/social/contentEvents.ts`, `countingReplays.ts`, `impressionRows.ts` |
| lecture du lot | `events: unknown[] ≤ 200` puis `safeParse` par élément ; type inconnu, événement invalide, v2 > 2 Kio ou > 72 h ⇒ `ignored`. Seule la FORME du lot reste un 400 | `routes/social/eventsEnvelope.ts` |
| consentement | trois issues pour un compte, lues par la passerelle. `granted` ⇔ `analyticsConsentAt` ET `dataProcessingConsentAt` posés, pas de refus, âge déclaré ≥ 15 ans (R8) — SEUL le serveur accorde : un client qui dit `granted` sans consentement serveur reste sans acteur. `denied` ⇔ le client dit `denied` OU le compte a RETIRÉ l'analyse (`User.analyticsConsentWithdrawnAt`, posé par `PUT /me/consents` au retrait de `analytics` ou `data-processing`, effacé quand l'analyse est de nouveau accordée avec son parent) ⇒ AUCUNE ligne `ContentEvent` (les événements v2 sont acquittés `ignored`), seuls les compteurs du comptage #10483 bougent, et `PostImpression` perd ses colonnes de mesure (O4). `unknown` / rien de tranché ⇒ `not_granted` : ligne sans acteur, contexte réduit. Lu une fois par lot, et seulement si une écriture en dépend (2026-10-13, correctif du signalement « privacy-consent-bypass ») | `services/social/eventPrivacy.ts`, `routes/me/consents.ts` |
| sans acteur (O1, O2, R4, R5) | ni `userId`, ni `appSessionId`, ni `feedRequestId`, ni `listingSessionId`, ni `searchId`, ni `impressionEventId`, ni `mutationId` ; OS en majeure, réseau sans sous-type ; anonyme : plateforme et langue d'interface seules ; bloquer / masquer / faire taire un auteur ne s'attribue jamais | `services/social/socialEventsV2.ts` |
| retrait (O4) | `PUT /me/consents/analytics` ou `data-processing` à `false` détache `ContentEvent` (sans acteur, identifiants de liaison retirés, OS en majeure) et retire session et page de `PostImpression` | `services/social/consentWithdrawal.ts` |
| recherche (O3) | `meta.searchId` OPAQUE et SCELLÉ sur `/users/search` et `/communities/search` : `hex(iv aléatoire 12 o ‖ empreinte chiffrée ‖ tag 16 o)`, AES-256-GCM sous une clé dérivée par HKDF-SHA256 de `SEARCH_FINGERPRINT_SECRET` avec un libellé DISTINCT de celui de la clé d'empreinte ; seule la passerelle l'ouvre à l'ingestion. Le format d'origine (`nonce.empreinte.signature`) servait l'empreinte EN CLAIR : un ORACLE — n'importe quel compte soumettait des requêtes candidates, lisait leurs empreintes et retrouvait par dictionnaire les recherches rangées ; il est refusé à l'ingestion (aucune empreinte rangée). Sans état côté passerelle ; empreinte rangée seulement pour un compte consenti ; `q`, `query`, `search`, `term` tus dans toute adresse journalisée. Sans `SEARCH_FINGERPRINT_SECRET` valable en production, AUCUNE empreinte n'est calculée et la recherche répond quand même (fail-closed sans casser la recherche) | `services/social/searchFingerprint.ts`, `utils/redact-reader-file-url.ts` |
| mesure ≠ personnalisation (O5) | la fatigue d'impression du fil (lecture de `PostImpression` par compte) n'a lieu qu'avec le consentement ; une garde interdit toute autre lecture par `userId` | `services/posts/seenCounts.ts` |
| effacement, export (O6) | la purge efface `PostImpression`, `PostEngagement`, `PostView` et `ContentEvent` du compte ; `GET /me/export` gagne `readingActivity` ; `PostImpression.user` reçoit `onDelete: Cascade` | `services/social/readingTelemetryErasure.ts`, `routes/me/export-reading.ts` |
| conservation (O7) | `PostImpression` et `PostEngagement` neuves : `expiresAt = création + durée`, la durée venant d'UNE source réglable (`RAW_READING_RETENTION_DAYS`, 760 j par défaut — § Conservation du brut de lecture) ; index TTL et unique partiel posés à chaque démarrage (`ensureSocialEventIndexes`) ; l'EXISTANT reçoit `createdAt + durée` par la migration nommée `scripts/migrations/2026-10-13-social-events-v2-retention.ts`, qui RALLONGE aussi les lignes datées à 90 j — en production après feu vert du porteur et sauvegarde vérifiée | `config/raw-reading-retention.ts`, `services/social/socialEventIndexes.ts`, `socialEventsRetentionMigration.ts` |
| O8 | une garde interdit à toute route de lire `ContentEvent` (hors écriture, purge, retrait, index, export de soi) et de nommer `screen_capture` / `profile_visit` | `__tests__/security/social-events-v2-privacy-guard.test.ts` |
| listing | `meta.feedRequestId` (tiré au hasard, gardé nulle part) et `rankingSource` par élément sur les huit scopes de `GET /social/posts` qui passent par `envoyerFeedUnifie` | `services/social/listingContext.ts` |

Restes, chacun à suivre par son issue : `feedRequestId` sur les scopes `hashtag`, `sound`, `nearby` (leur réponse doit rester identique clé à clé à leur route historique) ; l'exclusion des réels déjà vus lit `PostView` par compte sans consentement — qualification à trancher avec #10511 ; `SEARCH_FINGERPRINT_SECRET` déclaré dans les compositions du dépôt (2026-10-13), à POSER sur les serveurs de staging et de production (agent `sre-infra`) ; les agrégats quotidiens et leur seuil k ≥ 10 (#10512).

Note de pilotage : plusieurs commits de la passerelle citent `#10506` pour la recherche et `#10509` pour le consentement ; selon la table ci-dessous, la recherche relève de `#10505` et le consentement de `#10500`/`#10502`.

### Pilotage

Milestone #175 « Chaque interaction avec un contenu est capturée, exploitable plus tard » (échéance 2026-10-27). Chapeau #10499.

| issue | famille | § |
|---|---|---|
| #10500 | enveloppe, contexte, idempotence, compatibilité | 1, 8 |
| #10501 | contexte de listing, impression visible MRC | 3 |
| #10502 | cible générique, `interaction` | 2, 4 |
| #10503 | `negative` | 4 |
| #10504 | `playback` (QoE) | 4, 7 |
| #10505 | `link`, `discovery` | 4, 6 |
| #10506 | `story` | 4 |
| #10507 | `notification` | 4 |
| #10508 | `screen_capture` | 4, 6, 11 |
| #10509 | `scroll` | 5 |
| #10510 | stockage `ContentEvent`, TTL `PostImpression` | 9 |
| #10511 | qualification juridique (`décision-produit`) | 6 |
| #10512 | agrégats quotidiens | 10 |

### Le comptage ne perd rien (porteur, 2026-10-13 — #10553)

Règle du porteur : « tant que l'information arrive, on compte ; on améliorera quand on constatera des cas de triche. »

- **Pas d'âge limite pour le comptage.** La règle des 72 h ne vaut plus que pour les événements v2 (comportement). Une impression, une vue, une ouverture, une séance ou un téléchargement comptent quel que soit leur âge : une file hors ligne restée dix jours ne perd rien (`deriveEventClock`, `ageless`).
- **Un reçu ne dit rien du contenu ni de la personne.** Le reçu de déduplication (`ContentEvent`, `action = receipt`, 30 jours) ne porte plus ni cible ni heure de l'événement : une clé HMAC, le type, le jour de réception, une échéance. Il s'écrit donc aussi pour un compte qui REFUSE l'analyse — sans lui, un renvoi après une coupure réseau compterait deux fois. La phrase « un compte qui refuse l'analyse ne laisse aucune ligne » se lit : aucune ligne de COMPORTEMENT ; le reçu n'en est pas une.
- **Un comptage en échec rend son reçu, et seulement le sien.** Le reçu s'écrit avant l'effet ; si l'effet lève, le reçu est retiré avant que l'erreur ne remonte (`releaseCountingReceipts`), et la ligne d'impression à clé d'un compte aussi (`removeKeyedImpressions`). Le renvoi du client compte.
- **Un reçu qui ne s'écrit pas n'empêche pas de compter.** Le lot est alors compté sans déduplication.
- **Ce qu'on accepte en échange** : seuls les reçus des événements dont l'effet n'est pas parti sont rendus, donc ce qui a compté ne recompte pas ; mais un événement rejoué après l'échéance de son reçu (30 jours) recompte. Le sens de l'erreur est choisi : compter une fois de trop plutôt que perdre.

Témoins : `src/__tests__/unit/routes/social/events-counting-never-loses.test.ts`.

### Conservation du brut de lecture (décision porteur du 2026-10-16)

Décision : https://github.com/isopen-io/meeshy/issues/10510#issuecomment-6222116672 — elle supplante, pour ces deux tables seulement, les « 90 j » écrits plus haut.

- `PostImpression` et `PostEngagement` ne sont plus purgées à 90 jours. Leur conservation est **réglable par une seule source**, `RAW_READING_RETENTION_DAYS` (jours entiers, lue par `rawReadingRetentionMs()` dans `src/config/raw-reading-retention.ts`), **25 mois (760 j) par défaut** ; une valeur vide ou illisible sert le défaut.
- Les quatre sites qui créent une ligne (`impressionRows.ts`, `viewImpressions.ts`, les deux écritures de `postReach.ts`) et la migration nommée lisent cette même fonction : une ligne neuve et une ligne rétrodatée vivent la même durée.
- La migration rallonge les lignes que la première version avait datées à 90 j (`expiresAt < createdAt + durée` ⇒ recalcul) ; elle ne raccourcit jamais une échéance et reste idempotente. Staging en autonomie ; production après feu vert du porteur et sauvegarde vérifiée.
- `ContentEvent` (30/90 j) et `AnonymousPostOpen` (90 j) ne changent pas.
