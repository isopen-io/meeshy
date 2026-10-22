# Parité iOS → Android : `community-groups-global`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**30 features iOS** : 19 absentes, 11 partielles, 0 divergentes, 0 complètes sur Android. **23 lots** planifiés (≈14990 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**community-groups-global** (couverture Android estimée ≈ 30 %)

Cette partie couvre sur iOS : les communautés (liste en grille, fiche, création, réglages, membres, invitations, ajout de canaux, liens de partage de communauté), le parrainage et les affiliés, le parcours « Rejoindre par lien » (page d'invitation, formulaire anonyme, succès), la gestion des membres d'une conversation (liste, fiche participant, modération, ajout, avatars actifs de l'en-tête), les appels de groupe en maillage (signalisation, roster, grille, modération), la recherche globale, la création de conversation, la création de lien de partage et la découverte « à proximité » (consentement, carte de densité).
Android : le socle réseau/modèle des communautés existe (CommunityApi, CommunityRepository, Community.kt, Affiliate.kt, CommunityLink.kt) mais AUCUN écran communauté, parrainage, page d'invitation, appel de groupe, avatars actifs d'en-tête, consentement/carte de proximité n'existe.
Déjà présents et à compléter (partial) : formulaire invité + résolveur d'entrée par lien (sans page d'invitation ni écran de bienvenue), feuille des membres avec modération (en ligne seulement, sans présence/contour/swipe/quitter le groupe), fiche participant (sans droits éditables, sans réglages du lien, sans cache-first), ajout de participant, recherche globale (sans local-first FTS, sans états hors-ligne/erreur/réessayer), nouvelle conversation (sans contacts d'abord, sans bloqués), création de lien de partage.
Plus gros chantiers : maillage d'appel de groupe (L, un RTCPeerConnection par membre + routage de signaux + grille/une), page d'invitation (M-L, visuel très travaillé), carte de densité Nearby (L, aucune dépendance carte dans le build), écrans communauté (M × 7).
Estimation : environ 30 % de la surface iOS de cette partie est couverte côté Android, essentiellement en couches données/politiques pures ; la quasi-totalité du rendu communautaire, des appels de groupe et de la proximité reste à construire.

## Notes transverses

VERIFIE CONTRE L'ARBRE REEL (corrections de l'inventaire) :
1) Invitation communautaire en lot : AUCUN endpoint batch. iOS CommunityService.invite(userIds:) boucle sur l'invitation unitaire et compte les echecs. Le lot socle ne change pas CommunityApi pour ca (juste une boucle dans CommunityRepository).
2) Le titre d'affichage d'une conversation existe deja : ApiConversation.displayTitle(currentUserId) dans sdk-core/.../theme/ConversationAccent.kt. DynamicColorGenerator est dans sdk-core (me.meeshy.sdk.theme), PAS dans sdk-ui. formatCompactCount existe mais est PRIVE a feature:profile (UserStatsPresentation.kt) : il est deplace dans :core:model par le lot socle (feature -> feature interdit), le profil delegue.
3) Moderation d'appel de groupe : couper un micro = socket call:mute-participant {callId, targetUserId} ; retirer = REST DELETE /api/v1/calls/{callId}/participants/{participantId} (CallModerationRemoteService iOS). Cote cible, l'evenement entrant call:muted-by-moderator {callId, byUserId} coupe le micro local. Ce n'est pas deux emissions socket comme l'inventaire le disait.
4) Decouvrabilite : le champ de REQUETE de creation de post est discoverabilityPrecision (EXACT|NEIGHBORHOOD|CITY|REGION), pas geoPrecision (geoPrecision/geoPoint sont les champs servis en lecture). ApiPost Android n'a ni geoPoint ni geoPrecision. Android lit Nearby par GET social/posts?scope=nearby ; la densite est GET posts/nearby/density (absente).
5) MessageSocketManager n'ecoute NI participant:rights-updated NI user:updated (seulement participant:role-updated, conversation:participant-left, conversation:participant-banned) : le lot fiche-participant les ajoute.
6) LanguageData.nativeName est replie en ASCII (« Francais »). Les autonymes de la page d'invitation et du formulaire invite doivent venir de Locale(code).getDisplayLanguage(Locale(code)).
7) Android ne livre que 4 jeux de chaines (values, values-fr, values-es, values-pt) et non 7 : toute exigence « 7 locales » se lit « les 4 jeux livres par le module » jusqu'a ce que le domaine i18n ajoute les 3 autres.
8) MeeshyAvatar porte presence + humeur + anneau de story, mais PAS de contour de profil equipe (ProfileDecorWearer) : dependance ext:meeshy-avatar-profile-decor pour tous les lots qui l'exigent.
9) ConversationRepository.participantProfile documente « pas de cache » (faits gates par lecteur). Le lot fiche-participant l'inverse (cache par lecteur, purge a la deconnexion et au changement de role du lecteur) pour tenir le cache-first iOS : ADR obligatoire dans apps/android/decisions.md avant fusion.
10) iOS perd l'emoji choisi a la creation d'une communaute (selectedEmoji sert l'apercu seulement). Android le persiste localement apres creation (gain) ; a signaler cote iOS.
11) Aucune emission de telemetrie SocialEventsV2 n'existe sur Android (seulement ImpressionBatcher) : ext:social-events-v2-emitter.

ARCHITECTURE DE LIVRAISON :
- Nouveau module :feature:communities (ARCHITECTURE.md §2 le prevoit deja) cree par le lot communautes-liste-et-fiche (settings.gradle.kts, app/build.gradle.kts, build.gradle.kts calque sur feature/contacts, package me.meeshy.app.communities, namespace me.meeshy.feature.communities). Les routes vivent dans un NOUVEAU fichier app/.../navigation/CommunitiesNavGraph.kt (une seule ligne ajoutee dans MeeshyApp.kt) pour ne pas aggraver MeeshyApp.kt (1202 lignes, deja au plafond).
- Les lots de communautes sont ordonnes pour qu'AUCUN controle ne soit mort a la fusion : la liste ouvre la fiche (meme lot), le (+) et le CTA du vide arrivent avec la creation, Membres/Inviter avec le lot membres, Channel/Reglages avec le lot reglages ; chacun ajoute son bouton a CommunityDetailScreen.kt, d'ou la chaine depends_on stricte (a ne pas paralleliser).
- Persistance : UNE table Room generique keyed_json_cache (lot cache-json-par-cle-room) reutilisee par communautes, parrainage, liens de communaute, participants, fiche participant. Un seul bump de schema (16 -> 17) avec une Migration additive ; le lot recherche-index-local-fts fait 17 -> 18. ATTENTION : DatabaseModule utilise fallbackToDestructiveMigration() ; sans Migration explicite un bump detruit l'outbox (messages en attente non envoyes). Les deux bumps de ce domaine doivent donc fournir une Migration additive testee.
- Deconnexion : SessionTeardown fait deja database.clearAllTables() (le cache JSON par cle est donc purge sans code), et les DataStore par id (apparence communaute) doivent s'ajouter a la liste de purge de SessionTeardown.kt si elles contiennent des donnees propres a l'utilisateur.

POINTS CHAUDS DE CONFLIT (a serialiser par depends_on / ordre de merge) :
- MeeshyApp.kt (1202 l.), ChatScreen.kt (2953 l.), FeedComposerSheet.kt (1127 l.), CallViewModel.kt (872 l.), ConversationRepository.kt, MessageSocketManager.kt, CallSignalManager.kt, NetworkModule.kt + MeeshyApi.kt (une ligne par nouvelle API Retrofit : lots parrainage, moderation d'appel, densite), strings.xml des modules (x4 langues). Regle de lot : tout nouveau composable/logique va dans un NOUVEAU fichier ; les fichiers deja hors budget ne recoivent que des modifications de site d'appel.
- ext:navigation-split-MeeshyApp (hors domaine) : decouper MeeshyApp.kt en sous-graphes par feature serait un prealable utile avant la vague communautes.

COMPOSANTS PARTAGES A FOURNIR (ext:) : contour de profil equipe sur MeeshyAvatar ; anneau de story par utilisateur (StoryRingState existe, source par userId manquante hors feature:conversations) ; flux en ligne/hors ligne exploitable par les ecrans (NetworkConditionMonitor existe dans sdk-core/media) ; pipeline image selection + recadrage + compression avant upload (aujourd'hui PickVisualMedia + MediaRepository.upload sans recadrage) ; emetteur SocialEventsV2 ; composable d'etat vide generique (EmptyStateVisual vit dans feature:conversations) a promouvoir en sdk-ui ; tokens indigo/violet de marque.

LOIS TRANSVERSALES A RESPECTER : presence = PresenceState/meeshyPresenceDotColor (online vert, away orange, idle gris, offline AUCUN point ; absence de donnee serveur = aucun point, jamais fabrique ; frappe = en ligne) ; accent de contexte = accent derive (communaute : couleur locale sinon DynamicColorGenerator.colorForName(nom)), jamais de couleur codee en dur ; Prisme : tout apercu/extrait traduit passe par le resolveur existant (rang strict, jamais translations.first) ; cache-first (Fresh/Stale servis sans spinner, squelette seulement a froid) ; optimistic update avec rollback ; pas de bouton mort.

DECISIONS PRODUIT NON PORTEES (a ouvrir comme issues decision-produit, pas de dette Android) : (a) le bouton coeur de la fiche communaute pour les non-admins est inerte sur iOS (« Reagir a la communaute ») : non porte ; (b) la StatusBubble de NewConversationView (withStatusBubble) : non portee, aucune surface equivalente ; (c) les membres de conversation restent une feuille plein hauteur (ModalBottomSheet) au lieu d'un ecran pousse comme iOS : equivalence de hierarchie jugee suffisante.

RISQUES : appel de groupe en maillage (plafond 6 par la passerelle, batterie/CPU, TURN, regression possible de l'appel 1:1 et de Telecom ConnectionService : les lots appel-groupe-* doivent garder le chemin 1:1 intact et le prouver par tests) ; choix du SDK de carte (recommandation : MapLibre Native, sans cle ni dependance Play Services, clustering natif par source GeoJSON ; a figer par ADR dans le lot carte, entree dans gradle/libs.versions.toml) ; cache de la fiche participant (decision de securite, voir 9) ; telemetrie de decouverte bloquee par l'emetteur SocialEventsV2.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `nouvelle-conversation-contacts-d-abord` | D | P0 | M | 620 | avatar-unique-et-branchement-social, contours-d-avatar-equipes | Je démarre une conversation en choisissant d'abord parmi mes contacts, puis par recherche |
| `recherche-globale-ecran-etats` | D | P0 | M | 650 | recherche-globale-local-d-abord | Je cherche partout avec onglets, surlignage, récents et des états hors ligne ou en erreur clairs |
| `recherche-globale-local-d-abord` | D | P0 | M | 820 | recherche-index-local-fts, reseau-en-ligne-source-unique | La recherche globale répond tout de suite depuis l'appareil avant le réseau et dit quand un volet est tombé |
| `recherche-index-local-fts` | D | P0 | M | 520 | persist-cache-entries-store, persist-messages-schema-colonnes-locales, persist-room-migrations | La recherche trouve mes messages et conversations sur l'appareil, même sans réseau |
| `communautes-creation` | D | P1 | M | 620 | communautes-liste-et-fiche | Je crée une communauté avec aperçu en direct, emoji, confidentialité et premiers membres |
| `communautes-liste-et-fiche` | D | P1 | M | 1300 | communautes-socle-donnees, couleurs-de-marque-et-contraste-aa, etats-vides-et-echecs-de-contenu, socle-points-d-extension-de-l-app | Je parcours mes communautés en grille et j'ouvre la fiche d'une communauté |
| `communautes-membres-et-invitations` | D | P1 | M | 720 | communautes-liste-et-fiche | Je consulte les membres d'une communauté par rôle, en admin je change un rôle ou je retire quelqu'un, et j'invite des personnes |
| `communautes-socle-donnees` | D | P1 | M | 600 | persist-cache-entries-store | Mes communautés se chargent, se mettent en cache et se gèrent par un service unique |
| `fiche-participant-droits-et-temps-reel` | D | P1 | M | 760 | participants-cache-hors-ligne, actions-message-et-conversation-loi, socket-routage-evenements-ordre-arrivee | J'ouvre la fiche d'un participant instantanément et, en admin, je règle ses droits et son historique |
| `lien-partage-creation-sections` | D | P1 | S | 340 |  | Je crée un lien de partage avec un sélecteur de conversation par sections et des règles lisibles |
| `membres-conversation-liste-riche` | D | P1 | M | 860 | participants-cache-hors-ligne, avatar-unique-et-branchement-social, contours-d-avatar-equipes | Je consulte les membres d'une conversation avec leur présence, les retire par balayage, change leur rôle, en ajoute et quitte le groupe |
| `moderation-membres-politique-et-section` | D | P1 | M | 470 | membres-conversation-liste-riche | En tant qu'admin, je promeus, rétrograde, expulse ou bannis un membre avec la bonne clé et les bons droits |
| `participants-cache-hors-ligne` | D | P1 | S | 360 | persist-cache-entries-store | La liste des membres s'affiche tout de suite depuis le cache et survit au hors-ligne |
| `rejoindre-formulaire-invite` | D | P1 | S | 320 |  | Je rejoins une conversation sans compte avec un formulaire complet et des erreurs compréhensibles |
| `rejoindre-page-invitation-ecran` | D | P1 | M | 880 | rejoindre-page-invitation-regles, couleurs-de-marque-et-contraste-aa, images-instantanees-et-politique-de-telechargement | J'ouvre une invitation et je vois qui m'invite, le groupe, ce qu'on y parle et mes choix pour entrer |
| `rejoindre-page-invitation-regles` | D | P1 | M | 450 |  | Les règles de la page d'invitation (droits d'un invité, validité, langues, choix d'entrée) sont fiables et testées |
| `rejoindre-parcours-bienvenue-et-erreur` | D | P1 | M | 480 | rejoindre-formulaire-invite, rejoindre-page-invitation-ecran, socle-points-d-extension-de-l-app | Le parcours « Rejoindre par lien » enchaîne accueil, formulaire, bienvenue ou erreur avec réessai |
| `communautes-liens-de-partage` | D | P2 | M | 520 | communautes-creation, communautes-socle-donnees, socle-points-d-extension-de-l-app | Je retrouve les liens des communautés que j'administre, avec statistiques, copie et partage |
| `communautes-reglages-et-channels` | D | P2 | M | 1050 | communautes-membres-et-invitations, photo-d-entite-recadrage-et-compression | Je règle ma communauté (nom, confidentialité, avatar, bannière, couleur, emoji, départ) et j'y ajoute des channels |
| `en-tete-conversation-membres-actifs` | D | P2 | S | 380 | fiche-participant-droits-et-temps-reel, avatar-unique-et-branchement-social, contours-d-avatar-equipes, story-tray-cache-first-delta-and-realtime, composer-glass-shell, chat-viewmodel-state-split | Je vois dans l'en-tête de conversation les trois participants les plus actifs et j'ouvre leur story ou leur profil |
| `parrainage-liens-affilies` | D | P2 | M | 650 | persist-cache-entries-store, couleurs-de-marque-et-contraste-aa, socle-points-d-extension-de-l-app, reseau-pipeline-reessai-erreurs, settings-hub-iso-layout | Je gère mon parrainage : liens d'affiliation, statistiques, copie, partage et suppression |
| `proximite-carte-et-modes` | D | P2 | M | 1100 | proximite-densite-regles-et-donnees, place-map-and-fullscreen, dependances-gradle-scene-medias | Sur Nearby, je lis une carte de densité, des épingles groupées et des halos de précision |
| `proximite-densite-regles-et-donnees` | D | P2 | M | 520 | lieux-de-publication-proximite-et-stickers | Les données de proximité (cellules de densité, épingles, palette froid-chaud) sont lues et normalisées |

### Lots fusionnés ou retirés par l'architecture

- `cache-json-par-cle-room` → `persist-cache-entries-store` (drop-duplicate) : Même table de cache JSON par clé ; communautés, parrainage, participants s'y rangent comme CacheStore.
- `proximite-consentement-decouvrabilite` → `lieux-de-publication-proximite-et-stickers` (merge-into) : Même choix de découvrabilité à proximité à la publication.
- `parrainage-filleuls-onglet-contacts` → `annuaire-affilies` (drop-duplicate) : Même onglet Affiliés des contacts. Hérite : parrainage-liens-affilies.
- `recherche-telemetrie-decouverte` → `analytics-link-discovery-events` (merge-into) : Même mesure de la découverte de personnes sans texte tapé. Hérite : recherche-globale-local-d-abord.
- `appel-groupe-regles-pures` → `calls-group-mesh-engine` (merge-into) : Mêmes règles d'appel de groupe ; core:model/call les porte.
- `appel-groupe-moteur-multi-pairs` → `calls-group-mesh-engine` (drop-duplicate) : Même moteur multi-pairs.
- `appel-groupe-coordinateur-maillage` → `calls-group-mesh-engine` (drop-duplicate) : Même coordinateur de maillage.
- `appel-groupe-grille-et-projecteur` → `calls-group-stage-and-start` (drop-duplicate) : Même grille et mise à la une.
- `appel-groupe-moderation-admin` → `calls-participant-controls-and-reactions` (drop-duplicate) : Même modération des participants.

## Features

### Je crée une communauté avec aperçu en direct, emoji, confidentialité et premiers membres

`gcom-community-create` · Android : **absente** · P1 · effort M

Écran « Nouvelle communauté » : carte d'aperçu de 160 pt qui se met à jour en direct (dégradé de la couleur dérivée du nom, emoji incliné de -8 degrés en haut à droite, nom ou « Ma communauté », description, puce Privée/Publique), champs Nom (obligatoire), Identifiant (préfixe fixe « mshy_ », minuscules sans correction) et Description multiligne, sélecteur horizontal de 15 emojis populaires (bascule sélection/désélection, ressort), interrupteur de confidentialité (privée par défaut, texte « Seuls les membres invités peuvent rejoindre » / « Tout le monde peut découvrir et rejoindre »), recherche de membres à ajouter (dès 2 caractères, hors soi) avec pastilles de membres sélectionnés, bouton « Créer la communauté ». La création poste la communauté puis ajoute chaque membre en rôle member (échecs ignorés) ; une erreur ouvre une alerte.

Écarts :
- Créer l'écran Compose avec carte d'aperçu animée (ressort 0,4/0,7 sur nom et emoji) et couleur d'accent = DynamicColorGenerator.colorForName(name vide = « New »).
- Validation : nom non vide après trim ; identifiant omis s'il est vide ; description omise si vide ; privé par défaut.
- Emojis populaires (🚀 🎮 🎵 📚 💻 🎨 ❤️ 🔥 ⭐ 🌱 🌍 🏆 📸 🍿 🎉), cases 44 dp, sélection avec fond teinté accent 25 %, liseré 2 dp et échelle 1,1.
- Recherche de membres : annulation de la tâche précédente, seuil de 2 caractères, limite 10, exclure l'utilisateur courant, pastilles retirables, indicateur de recherche.
- Séquence de création : create puis addMember(role member) pour chaque sélectionné en best-effort ; retour de la communauté créée à l'hôte pour navigation.
- Alerte d'erreur (titre Erreur, message par défaut « Une erreur est survenue ») ; bouton désactivé pendant la création avec indicateur.
- Option Android recommandée : vérifier la disponibilité de l'identifiant avec checkIdentifier (déjà dans l'API) pendant la saisie, iOS ne l'appelle pas.

Rendu : Carte d'aperçu 160 dp coins xl avec ombre 12 teintée accent 35 % ; champs sur fond backgroundSecondary 50 % coins sm ; icônes lock.shield.fill ou eye.fill dégradées dans la ligne de confidentialité ; bouton de création pleine largeur dégradé indigo.

Transposition Android : alert vers AlertDialog ; Toggle vers Switch ; scroll horizontal des emojis vers LazyRow ; clavier .never autocapitalize vers KeyboardOptions(capitalization = None).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Community/CommunityCreateView.swift`
- `apps/ios/Meeshy/Features/Community/CommunityCreateViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityCreateScreen.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Community.kt`

### J'ouvre une communauté : bannière, avatar, statistiques, actions et onglets Channels / Feed

`gcom-community-detail` · Android : **absente** · P1 · effort M

Fiche communauté : bannière de 190 pt avec dégradé, avatar 72 pt chevauchant de 36 pt, nom, description sur 2 lignes, puce Privée/Publique, bloc de statistiques (membres, channels), grille d'actions (Membres toujours ; Inviter si membre ; Channel si admin ; Réglages si créateur, sinon Rejoindre si non membre), bouton rouge « Quitter la communauté » pour un membre non créateur. En-tête flottant sur la bannière : retour, puis menu ⋯ pour un admin (Réglages si créateur, Quitter sinon) ou bouton cœur pour les autres. Sélecteur segmenté Channels / Feed : liste de canaux (icône #, titre résolu, description, nombre de membres) avec état vide et CTA « Créer un Channel » ; Feed = état vide avec CTA « Créer un post » masqué si l'hôte n'en fournit pas. Les canaux ne se chargent que pour un membre ; couleur et emoji locaux relus après réglages.

Écarts :
- Créer l'écran Compose avec en-tête flottant (boutons ronds 40 dp, fond noir 35 %) superposé à la bannière de 190 dp, dégradé noir 30 % en pied et avatar 72 dp décalé de 36 dp avec liseré de la couleur de fond.
- Règles d'appartenance : isCreator = createdBy == moi ; isMember = créateur ou présent dans members ; rôle = rôle du membre, sinon admin si créateur ; isAdmin = rôle >= admin ou créateur.
- Charger les canaux (GET communities/{id}/conversations) seulement si l'utilisateur est membre ; états chargement (spinner seulement si aucune communauté), erreur avec EmptyState icône triangle, titre Erreur et bouton Réessayer.
- Actions conditionnelles : Membres (toujours), Inviter (membre), Channel (admin, ouvre la feuille d'ajout de canal), Réglages (créateur) ou Rejoindre (non membre, relance load après join), bouton rouge de sortie (membre non créateur) avec alerte « Quitter la communauté ? / Vous ne pourrez plus accéder aux channels de cette communauté. ».
- Menu ⋯ des admins : Réglages (créateur seul) et Quitter (admin non créateur). Divergence à trancher : le bouton cœur des non-admins est inerte sur iOS (commentaire « Réagir à la communauté »), ne pas porter un bouton mort.
- Onglets segmentés Channels / Feed ; liste de canaux avec icône # sur carré teinté brandPrimary 10 %, titre, description, compteur de membres, séparateurs décalés de 60 dp ; états vides avec CTA conditionnel.
- Relire la couleur et l'emoji locaux (DataStore) après fermeture des réglages et recharger la fiche ; sortie (quitter/supprimer) = fermeture de l'écran hôte.
- Cache-first : afficher la fiche en cache immédiatement puis revalider (iOS recharge sans cache).

Rendu : Titre titleSize gras arrondi, description subheadSize secondaire sur 2 lignes ; stats sur fond backgroundSecondary 50 % coins smPlus avec séparateur vertical de 30 dp et icône brandPrimary ; boutons d'action en cartes verticales icône lg + libellé footnote ; bouton de sortie fond error 10 % texte error ; avatar coins lgPlus.

Transposition Android : Picker segmenté vers SingleChoiceSegmentedButtonRow ; Menu vers DropdownMenu ; alert vers AlertDialog ; sheet vers ModalBottomSheet ; ScrollView avec en-tête flottant vers Box + LazyColumn avec TopAppBar transparent.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Community/CommunityDetailView.swift`
- `apps/ios/Meeshy/Features/Community/CommunityDetailViewModel.swift`
- `apps/ios/Meeshy/Features/Community/CommunityConversationTitles.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailScreen.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Community.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`

### J'invite des personnes dans ma communauté par recherche et je vois qui est déjà invité

`gcom-community-invite` · Android : **absente** · P1 · effort S

Feuille « Invite Members » : champ de recherche (dès 2 caractères, 20 résultats), liste de résultats avec avatar (présence, contour), nom, @pseudo et bouton capsule indigo « Invite » (désactivé pendant l'envoi) qui devient une coche verte après succès, section « Recently Invited » des personnes invitées pendant la session, état vide « No Users Found / Try a different search term », bouton Terminé.

Écarts :
- Créer la feuille Compose avec champ de recherche, résultats, liste « récemment invités » et bouton Terminé.
- Recherche utilisateurs limite 20 déclenchée à la frappe avec seuil de 2 caractères et débounce ; vider les résultats sous le seuil.
- Invitation POST communities/{id}/invite par utilisateur ; marquer invitedUserIds, ajouter à recentlyInvited, désactiver le bouton pendant l'envoi (invitingUserId).
- États : recherche en cours, aucun résultat, échec d'invitation (iOS journalise seulement ; Android doit afficher un message d'erreur et laisser réessayer).

Rendu : Lignes avatar userListItem + nom bodySize gras arrondi + @pseudo smallSize ; bouton capsule fond indigo500 texte blanc subheadSize gras ; coche success xl ; séparateurs décalés de 68 dp.

Transposition Android : sheet vers ModalBottomSheet ; navigationTitle + toolbar vers TopAppBar de feuille.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Community/CommunityInviteView.swift`
- `apps/ios/Meeshy/Features/Community/CommunityInviteViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityInviteScreen.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`

### Je parcours les communautés en grille de cartes avec recherche, défilement infini et tirer pour rafraîchir

`gcom-community-list` · Android : **absente** · P1 · effort M

Écran « Communautés » : en-tête repliable avec retour et bouton (+) dégradé indigo pour créer, champ de recherche (débounce 0,35 s, actif dès 2 caractères, croix d'effacement), grille de deux colonnes de cartes de 180 pt (bannière plein cadre ou dégradé de la couleur d'accent dérivée du nom, avatar rond de 44 pt cerclé en haut à droite, puce Privée/Publique en haut à gauche, nom, description sur 2 lignes, compteurs membres et canaux compacts). Pagination par offset (20) avec chargement au bas de grille, pull-to-refresh, état de chargement initial, état vide avec icône, titre, sous-titre et bouton « Créer une communauté ».

Écarts :
- Créer l'écran Compose CommunityListScreen (LazyVerticalGrid 2 colonnes, espacement 14 dp, padding 16 dp) et sa route de navigation, avec point d'entrée dans le menu radial / réglages.
- Carte de communauté : hauteur 180 dp, coins xl, ombre teintée par la couleur d'accent, dégradé noir 65 % en bas, rotation de l'avatar de -8 degrés et réduction à 0,95 à l'appui (ressort 0,25/0,65).
- Couleur d'accent = community.color sinon DynamicColorGenerator.colorForName(name) (déjà présent dans sdk-core/theme).
- Compteurs compacts (1,2k) pour membres et canaux : réutiliser ou créer l'équivalent de CompactCountLabel.
- Recherche : débounce 350 ms, requête envoyée seulement si au moins 2 caractères, annulation de la requête précédente, remise à zéro de l'offset.
- Pagination offset 20 avec dédoublonnage par id et indicateur de chargement en fin de grille ; pull-to-refresh qui réinitialise l'offset.
- Animation d'entrée des cartes en ressort (réponse 0,4, amortissement 0,7) avec délai de 40 ms par index.
- États à dessiner (iOS n'affiche aucune erreur, Android doit le faire) : chargement initial, vide avec CTA, erreur réseau avec Réessayer, hors-ligne avec liste en cache (cache-first).

Rendu : Cartes 180 dp, coins xl, bannière plein cadre avec dégradé sombre en pied ; titre bodySize gras arrondi blanc (2 lignes, réduction 0,8) ; puce privacité noire 25 % avec icône cadenas ou globe ; en-tête titre « Communautés » + (+) dégradé indigo500 vers indigo700 ; état vide : icône person.3 dégradée, titre subtitleSize gras, bouton capsule dégradé horizontal.

Transposition Android : LazyVGrid vers LazyVerticalGrid ; refreshable vers PullToRefreshBox ; CollapsibleHeader vers TopAppBar à défilement (LargeTopAppBar collapsing) ; MeeshyPointerPlainButtonStyle vers clickable avec indication personnalisée.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Community/CommunityListView.swift`
- `apps/ios/Meeshy/Features/Community/CommunityListViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityListScreen.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`

### Je consulte les membres d'une communauté par rôle et, en admin, je change un rôle ou je retire quelqu'un

`gcom-community-members` · Android : **absente** · P1 · effort M

Écran « Members » : liste groupée par rôle décroissant (Creators, Admins, Moderators, Members) avec en-têtes en capitales (icône du rôle, intitulé, compteur) sur fond secondaire 30 %, pagination par offset (30) au bas de liste, pull-to-refresh, état vide « No Members » avec CTA Inviter, bouton Inviter (person.badge.plus) pour un membre. Chaque ligne : avatar avec présence et contour, nom, rôle coloré (créateur ambre, admin rouge, modérateur indigo, membre discret). Pour un admin, menu ⋯ par ligne : choisir un rôle parmi les quatre (le rôle actuel est grisé) et « Remove ». Après changement de rôle la liste se recharge ; après retrait la ligne disparaît localement.

Écarts :
- Créer l'écran Compose avec LazyColumn à en-têtes collants (stickyHeader) par rôle, tri par niveau décroissant (CommunityMemberSection.sections).
- Pagination offset 30 avec dédoublonnage, chargement en bas de liste, pull-to-refresh, états chargement / vide (CTA Inviter) / erreur (iOS n'en dessine pas).
- Dérivation de isMember (je figure dans la liste) et isCurrentUserAdmin (rôle >= admin) ; bouton Inviter visible pour tout membre.
- Ligne de membre : avatar userListItem avec présence et contour, nom (« Unknown » si absent), icône + libellé de rôle colorés selon le rôle.
- Menu admin par ligne : changer de rôle (PATCH members/{memberId}/role avec l'id du MEMBRE puis refresh) et retirer (DELETE members/{userId} avec l'id utilisateur, retrait local immédiat) ; confirmation recommandée pour le retrait, absente sur iOS.
- Feuille d'invitation affichée depuis l'écran et rechargement de la liste à sa fermeture.

Rendu : En-tête de section smallSize gras arrondi en capitales, compteur footnote atténué ; lignes padding lg/smPlus, séparateurs décalés de 68 dp ; couleurs de rôle : warning (créateur), error (admin), indigo500 (modérateur), textMuted (membre).

Transposition Android : Section/header vers stickyHeader ; Menu vers DropdownMenu ; navigationTitle inline vers TopAppBar centrée.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Community/CommunityMembersView.swift`
- `apps/ios/Meeshy/Features/Community/CommunityMembersViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityMembersScreen.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityMemberSection.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Community.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`

### Je participe à un appel de groupe : chaque membre est relié en pair-à-pair et les signaux sont routés au bon pair

`gcom-group-call-mesh` · Android : **absente** · P1 · effort L

Le coordinateur de maillage tient une connexion WebRTC par membre en plus du pair principal géré par le gestionnaire d'appel : routage des signaux call:signal (offre, réponse, ice-candidate avec negotiationId) vers le principal, un pair du maillage ou l'ignorer (écho de soi), règle « celui qui est déjà dans l'appel offre au nouvel arrivant », file des signaux reçus avant l'existence du lien, reprise quand le principal est parti (siège libéré), rafraîchissement des serveurs ICE, recopie du micro et de la caméra locaux, échantillonnage des niveaux audio pour savoir qui parle, titre de conversation de groupe, gestion de la fin d'appel. Contrats testables : liens de pairs, émetteur de signaux, hôte d'appel.

Écarts :
- Android ne gère qu'un seul pair WebRTC (appel 1:1) : introduire GroupPeerLink (un PeerConnection par membre, politesse, négociation par negotiationId, flux audio/vidéo, canal de contrôle) et sa fabrique injectable.
- Porter GroupSignalRouting en logique pure testée : destination(from, localUserId, primaryUserId, isGroupCall, primaryVacated) et shouldOfferToArrival ; un appel direct ne passe jamais par le maillage ; un from absent reste au principal.
- Porter le coordinateur : handleIncomingCall, handleParticipantJoined (offre au nouvel arrivant si déjà dans l'appel), handleParticipantLeft, handleMediaToggled, handleIceServersRefreshed, consume(signal), tampon des signaux précoces, reprise du principal et siège libéré.
- Ajouter les types de messages sortants/entrants (GroupCallOutgoingSignal.payload avec to/from/negotiationId/sdp/candidate/sdpMid/sdpMLineIndex ; GroupCallIncomingSignal depuis CallSignalPayload).
- Échantillonnage périodique des niveaux audio par pair (getStats) pour calculer speakingUserIds ; enrichissement des noms par ActiveCallSession.
- Plafond de participants (CallRules.maxParticipants, 6) et gestion du maillage plein ; fermeture propre (teardown) à la fin.
- Mapper la persistance d'appel vers Telecom ConnectionService déjà en place ; vérifier que le routage des signaux ne régresse pas l'appel 1:1 existant.

Rendu : Aucun rendu propre ; conditionne la grille, les pastilles « parle » et les états « Reconnexion… » de la scène.

Transposition Android : RTCPeerConnection iOS vers org.webrtc.PeerConnection (une instance par membre) ; CallKit vers Telecom ConnectionService déjà présent ; acteur MainActor vers coroutines sur Dispatchers.Main.immediate.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/GroupCallMeshCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/Services/GroupCallMeshContracts.swift`
- `apps/ios/Meeshy/Features/Main/Services/GroupSignalRouting.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`

### Je sais qui est dans l'appel de groupe, son état micro / caméra / partage, et le titre de l'appel

`gcom-group-call-roster` · Android : **absente** · P1 · effort S

GroupCallRoster : liste ordonnée des membres distants (nom, avatar, principal, micro coupé, caméra, partage d'écran, état du lien : connexion / connecté / reconnexion), capacité plafonnée (admission refusée si plein), fusion des mises à jour sans doublon, retrait, application d'un changement de média (audio, vidéo, écran) et d'un état de lien. Titre d'appel : titre du groupe sinon « A, B +N » (deux noms puis compteur) ou « Participants à l'appel », « Participant » pour un nom absent.

Écarts :
- Créer les modèles purs GroupCallMember, GroupCallArrival (depuis les données de participant d'événement), GroupCallLinkState, GroupCallMediaKind et GroupCallRoster immuable avec admitting / removing / applying / updatingLink.
- Règles : ignorer l'arrivée de soi ou d'un id vide, mettre à jour un membre existant sans le dupliquer, refuser l'admission quand participantCount >= capacity, isFull, participantCount = membres + 1.
- Titre de l'appel : titre du groupe non vide sinon deux premiers noms + « +N », libellés « Participant » et « Participants à l'appel » localisés ; format « %@ +%lld » (compteur) localisé.
- Tests unitaires purs (JUnit) de toutes les règles.

Rendu : Aucun rendu ; fournit l'état affiché par la scène (tuiles, pastilles micro, reconnexion).

Transposition Android : struct Equatable vers data class immuable ; with(...) vers copy(...).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/GroupCallRoster.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/ActiveCallSession.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`

### Pendant un appel de groupe, je vois tout le monde en grille, je mets quelqu'un à la une et je zoome un partage d'écran

`gcom-group-call-stage` · Android : **absente** · P1 · effort M

Scène d'appel de groupe posée entre l'en-tête et la pilule de commandes, affichée dès deux membres distants (ou un membre tenu par le maillage). Grille de tuiles égales, moi d'abord puis ordre d'arrivée, sans réagencement quand quelqu'un parle (liseré animé 0,2 s) : 1 plein écran ; 2 empilées (côte à côte en paysage) ; 3-4 en 2×2 ; 5-6 en 2×3 (3×2 en paysage). Toucher une tuile la met à la une (projecteur) avec bande de vignettes (filmstrip), retour à la grille, plein écran ; un partage d'écran y monte seul ; pincement pour zoomer, double toucher pour réinitialiser. Tuile : vidéo ou avatar, plaque de nom, indicateurs micro coupé / reconnexion, couleur d'accent par personne. Accessibilité : étiquette, valeur (parle, micro coupé, caméra coupée, partage, reconnexion) et action « Mettre à la une » ; réduction des animations respectée.

Écarts :
- Porter GroupCallGridLayout.layout(tileCount, isLandscape) en logique pure (1→1×1 ; 2→1×2 ou 2×1 paysage ; 3-4→2×2 ; 5+→2×3 ou 3×2 paysage ; plafond de 6).
- Créer GroupCallStageTile (id, colorKey, displayName, avatar, isLocal, isSpeaking, isMicMuted, showsVideo, isScreenSharing, isReconnecting) et GroupCallStage.tiles(roster, speakingUserIds, localName « Vous », ...), isShown(isMeshActive, roster).
- Composable de grille (cases de taille égale calculées sur la taille disponible) + mode projecteur (tuile à la une, bande de vignettes verticale ou horizontale), retour à la grille, plein écran, toucher sur la scène pour afficher/masquer les commandes.
- Zoom par pincement sur la tuile à la une (pleine capture pour un partage d'écran) et double toucher pour réinitialiser.
- Tuile : rendu vidéo (SurfaceViewRenderer par membre via VideoRenderer), repli avatar, plaque de nom, liseré animé quand quelqu'un parle (0,2 s easeOut, désactivé si animations réduites), icônes micro coupé et reconnexion.
- Couleur d'accent stable par personne (équivalent CallSpeakerColor.hex(for:)) identique à celle des sous-titres.
- Accessibilité TalkBack : étiquette = nom ou « Participant », valeur composée (Parle, Micro coupé, Caméra coupée, Partage son écran, Reconnexion…), action « Mettre à la une », libellés « Revenir à la grille » et « Plein écran ».
- Insérer la scène dans CallScreen entre l'en-tête et la pilule de commandes en suivant la disposition réelle (pas de marges fixes).

Rendu : Tuiles de taille égale, espacement fixe, coins arrondis, plaque de nom en bas à gauche, liseré de couleur d'accent qui s'illumine (0,2 s) quand la personne parle ; bande de vignettes en bordure du projecteur ; fond sombre.

Transposition Android : LazyVGrid avec GridItem fixe vers Layout personnalisé ou LazyVerticalGrid fixe ; MagnificationGesture vers detectTransformGestures ; accessibilityReduceMotion vers Settings.Global.ANIMATOR_DURATION_SCALE / LocalReduceMotion.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/GroupCallStageView.swift`
- `apps/ios/Meeshy/Features/Main/Services/GroupCallGridLayout.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/VideoRenderer.kt`

### J'ouvre une invitation et je vois qui m'invite, le groupe, ce qu'on y parle et mes choix pour entrer

`gcom-join-invite-landing` · Android : **absente** · P1 · effort M

Page d'accueil d'invitation, identique avec ou sans compte : en-tête (fermer rond, titre « Invitation » en capitales), bloc invitant (avatar 52 pt cerclé du dégradé de marque, « Prénom t'invite », @pseudo, message en bulle à coin supérieur asymétrique, RTL géré), carte du groupe (bannière 112 pt ou dégradé indigo→violet, logo arrondi 76 pt chevauchant, titre, type · date de création, description, adresse /chat/<linkId> avec Copier / Repartager), tuiles de faits (personnes, langues parlées), barre de répartition des langues (6 segments max, autonymes, pourcentages mesurés), carte « En anonyme, tu pourras » (droits autorisés / non autorisés, champs demandés, langues acceptées, validité du lien et places restantes), panneau de choix en bas (Rejoindre avec mon compte avec initiales, Continuer / Rejoindre / Reprendre en anonyme, Se connecter, Créer un compte, avis « compte requis » ou « lien fermé »).

Écarts :
- Étendre ShareLinkInfo : guestRights (allowAnonymousMessages / Images / Files / ViewHistory avec défauts du schéma), address canonique /chat/<linkId>, ShareLinkStats complet, spokenLanguageShares (LanguageShare code, fraction, isMeasured), expiresAt typé, daysLeft(now), remainingPlaces, banner et avatar de la conversation, creator.name.
- Ajouter landingChoices(isSignedIn, now) (joinWithAccount, joinAnonymously, signIn, signUp ; lien fermé quand expiré ou plein) et InviteRequestedField (name, nickname, email, birthday) comme règles pures testables.
- Créer InviteLandingScreen en Compose : en-tête fixe, contenu défilant, panneau de choix ancré en bas (insets), fond dégradé indigo50→blanc (sombre : indigo950→noir) et cartes avec surface/liseré indigo.
- Bloc invitant : avatar 52 dp avec double anneau (blanc puis dégradé de marque), titre « X t'invite » titleSize extra-gras arrondi, bulle de message avec coin supérieur du côté de départ à 6 dp (miroir en RTL), liseré et ombre indigo.
- Carte du groupe : bannière 112 dp (image ou dégradé indigo600→purple600→purple500), logo 76 dp coins xlPlus chevauchant de 45 %, titre à 2 lignes, « Type · créé le … », description, ligne d'adresse avec Copier (haptique succès + annonce « Lien copié ») et Repartager (ACTION_SEND).
- Tuiles de faits (personnes / langues, pluriels localisés) et LanguageShareBar : barre de 10 dp en capsule de segments (6 max, regroupement du reste en « … »), légende en grille adaptative 140 dp, nom (autonyme) et pourcentage séparés pour éviter l'inversion RTL, résumé d'accessibilité.
- Carte des droits d'un invité : lignes autorisé / non autorisé annoncées (« Autorisé : … »), champs demandés (liste localisée), langues acceptées (autonymes ou « toutes »), validité (« encore N jours », « sans limite de durée », « expiré ») et places restantes.
- Panneau de choix : bouton principal dégradé indigo500→purple600 de 56 dp avec initiales du compte, boutons secondaires, légendes (« Tu choisis juste un nom. Aucun compte à créer. »), avis compte requis et lien fermé ; haptiques moyen (principal) et léger (secondaires).
- Textes (InviteLandingCopy) dans les 7 locales, y compris les formes plurielles et les types de conversation (Conversation privée, Groupe, Public, Global, Communauté, Canal).

Rendu : Cartes coins 28 dp avec ombre indigo600 14 % (clair) ; typographie arrondie extra-grasse pour titres ; fond dégradé vertical ; boutons 56 dp coins lgPlus ; en-tête semi-opaque 94 % ; tuiles de faits valeur displaySize extra-grasse.

Transposition Android : safeAreaInset vers Scaffold avec bottomBar ; ShareLink vers ACTION_SEND ; UIPasteboard vers ClipboardManager ; ListFormatter vers android.icu.text.ListFormatter ; Locale autonym vers Locale.getDisplayLanguage(locale du code).

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteLandingView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteInviterHeader.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteGroupCard.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteGroupFacts.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteChoicesPanel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteLandingCopy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/InviteCardSurface.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/InviteLanding/LanguageShareBar.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLink.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkEntryPolicy.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`

### La liste des membres s'affiche tout de suite depuis le cache, se complète par curseur et survit au hors-ligne

`gcom-participants-cache-service` · Android : **absente** · P1 · effort M

ParticipantService (acteur) charge la première page (30) en SWR : cache frais ou périmé servi sans réseau, forceRefresh en mode « récupérer puis remplacer » (le cache n'est touché qu'après réponse du réseau), repli sur la charge disque expirée si le réseau échoue (Offline Graceful Degradation), pagination par curseur avec hasMore et totalCount, mises à jour locales du rôle et du retrait (compteur décrémenté) et invalidation. Évite la liste vide hors ligne et les réécritures concurrentes.

Écarts :
- ConversationRepository.participants est en ligne uniquement (« Online-only ») : ajouter un cache Room des participants par conversation avec horodatage et politique fresh / stale / expired.
- Première page : servir immédiatement le cache non vide (frais ou périmé) ; revalider en silence ; forceRefresh = récupérer puis remplacer, sans invalider avant la réponse.
- En cas d'échec du rafraîchissement, resservir la charge expirée du disque plutôt qu'une liste vide ; dernière page déjà atteinte = renvoyer le disque.
- Mises à jour locales sans réseau : updateRole (id utilisateur ou id participant, rôle en minuscules) et removeParticipant (met à jour totalCount) ; invalidate(conversationId).
- Brancher les événements socket participant:role-updated, conversation:participant-left et conversation:participant-banned sur ces mutations (déjà écoutés par ConversationMembersViewModel, à reporter dans le cache).

Rendu : Pas de rendu direct ; conditionne l'absence de spinner sur cache non vide dans la liste des membres et la feuille d'info.

Transposition Android : actor Swift vers Mutex/Flow dans un repository @Singleton ; CacheCoordinator.participants vers DAO Room avec TTL.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ParticipantService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MemberRoster.kt`

### Je gère mon parrainage : liens d'affiliation, statistiques, copie, partage et suppression

`gcom-affiliate-program` · Android : **absente** · P2 · effort M

Écran « Parrainage » : bouton (+) en verre dans l'en-tête, trois cartes de statistiques (Liens, Inscrits, Clics), section « MES LIENS » listant mes jetons d'affiliation (nom, clics, inscrits en vert) avec trois actions par ligne (copier le lien avec haptique, partager par la feuille système, supprimer en rouge) ; état vide « Aucun lien de parrainage / Créez un lien pour inviter vos amis ». La création ouvre une feuille « Nouveau lien » (nom obligatoire, utilisations max optionnelle au clavier numérique, bouton Créer le lien avec spinner, erreur annoncée à VoiceOver). Cache-first (affiliateTokens), suppression optimiste avec retour arrière et haptique d'erreur.

Écarts :
- Créer AffiliateApi (GET/POST/DELETE des jetons d'affiliation paginés, GET statistiques) et AffiliateRepository ; les modèles AffiliateToken, AffiliateStats et CreateAffiliateTokenRequest existent déjà.
- Créer l'écran Compose Parrainage (stats, liste, état vide) et la feuille de création (nom requis trim, maxUses entier optionnel, bouton désactivé tant que le nom est vide).
- Actions de ligne : copier affiliateLink avec retour haptique, partager via Intent ACTION_SEND (glyphe atténué et masqué TalkBack si pas de lien), supprimer avec retrait immédiat puis rollback + haptique d'erreur en cas d'échec.
- Cache-first : jetons servis depuis Room (fresh : sans réseau ; stale : affichage puis revalidation ; vide : spinner).
- Accessibilité : étiquettes « Copier / Partager / Supprimer le lien de parrainage », cartes de stats fusionnées, annonce vocale de l'erreur de création.
- Point d'entrée Parrainage dans les réglages ou le menu.

Rendu : Teinte brandPrimary ; cartes surfaceGradient avec liseré 1 dp ; en-tête de section « MES LIENS » footnote gras arrondi avec espacement de lettres 1,2 ; cartes de stats icône lg + valeur title3 gras + libellé caption.

Transposition Android : adaptiveGlass sur le bouton (+) vers surface semi-transparente avec flou (RenderEffect) ou Surface tonale ; UIAccessibility.announcement vers semantics liveRegion ; ShareLink vers ACTION_SEND.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`
- `apps/ios/Meeshy/Features/Main/Views/AffiliateCreateView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/AffiliateService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Affiliate.kt`

### Je vois mes filleuls dans l'onglet Affiliés des contacts et je leur écris en un geste

`gcom-affiliate-referrals-list` · Android : **absente** · P2 · effort S

Onglet « Affiliés » du carnet de contacts : champ de recherche « Rechercher un affilié » (nom ou @pseudo), liste de filleuls (avatar, nom, @pseudo, présence vivante) avec action « Écrire » qui ouvre ou crée la conversation directe puis y navigue (haptique de succès) ; pull-to-refresh ; squelette au démarrage à froid, états vides « Aucun affilié » avec indication de partager son lien et « Aucun résultat » ; erreur « Impossible de charger les affiliés » seulement si rien n'est affiché. Cache-first (stats d'affiliation).

Écarts :
- Aujourd'hui ContactFilter.Affiliates existe mais renvoie la liste complète et son libellé est celui de « Tous » : câbler une vraie source (GET des statistiques d'affiliation, champ referrals) et un libellé « Affiliés ».
- Modèle AffiliateReferral (referredUser: id, username, avatar, isOnline ; resolvedName) à ajouter à Affiliate.kt.
- Créer l'onglet avec recherche locale (nom ou @pseudo, insensible à la casse), ligne DirectoryPerson avec présence et action Écrire.
- Action Écrire : ouvrir ou créer la conversation directe (équivalent ConversationCreator.openDirectConversation) puis naviguer ; haptique de succès.
- Cache-first (fresh / stale + revalidation / expired) ; squelette seulement sur cache vide ; message d'erreur uniquement si la liste est vide.
- États vides distincts selon qu'il n'y a aucun affilié ou aucun résultat de recherche.

Rendu : Réutiliser la rangée d'annuaire des contacts (avatar + nom + sous-titre @pseudo + pastille de présence + bouton Écrire) ; champ de recherche padding lg/sm.

Transposition Android : refreshable vers PullToRefreshBox ; navigation vers conversation par route chat.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Contacts/AffiliatesListView.swift`
- `apps/ios/Meeshy/Features/Contacts/AffiliatesViewModel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsListTab.kt`

### J'ajoute une conversation existante comme channel de la communauté, y compris en la déplaçant d'une autre

`gcom-community-add-channel` · Android : **absente** · P2 · effort M

Feuille « Ajouter un channel » : liste paginée (20) de mes conversations qui n'appartiennent pas déjà à cette communauté, recherche locale (« Rechercher une conversation... »), chaque ligne montre icône #, titre résolu, nombre de membres et, si la conversation appartient à une autre communauté, l'étiquette ambre « Autre communauté » avec flèche ambre ; un toucher ajoute (plus vert indigo) ou, pour une conversation d'une autre communauté, ouvre l'alerte « Déplacer cette conversation ? » (Déplacer / Annuler). Pendant l'ajout la ligne affiche un spinner et la liste est désactivée ; la conversation ajoutée disparaît de la liste et l'hôte recharge ses canaux. États vides : « Aucune conversation disponible » + indication, « Aucun résultat ».

Écarts :
- Créer la feuille Compose avec liste paginée (offset 20, chargement en bas de liste, indicateur isLoadingMore) et champ de recherche locale sur titre.
- Filtrer les conversations dont communityId == communauté courante ; calculer les titres (listTitle) pour tout le lot et fusionner à chaque page ; dédoublonner par id.
- Ajout par POST communities/{id}/conversations/{conversationId} ; AlertDialog de confirmation de déplacement pour une conversation d'une autre communauté ; annulation qui efface la cible en attente.
- Ligne : icône # sur carré brandPrimary 10 %, compteur membres (icône person.2), badge ambre « Autre communauté » avec icône d'échange, glyphe d'action à droite (plus ou flèche ambre ou spinner).
- États : chargement, erreur (message), vide, aucun résultat ; callback onAdded pour recharger la fiche communauté.

Rendu : Rangées en cartes sur fond backgroundSecondary 30 % ; amber500 pour l'état « autre communauté » ; glyphes plus.circle.fill de taille xl.

Transposition Android : List insetGrouped vers LazyColumn dans des cartes ; searchable vers SearchBar Material3 ; alert vers AlertDialog.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Community/AddChannelSheet.swift`
- `apps/ios/Meeshy/Features/Community/CommunityAddChannelViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityAddChannelScreen.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`

### Je retrouve les liens de partage des communautés que j'administre, avec statistiques, copie et partage

`gcom-community-links` · Android : **absente** · P2 · effort M

Écran « Liens communauté » : en-tête (retour, titre, bouton + vers la création d'une communauté), trois cartes de statistiques (Groupes, Actifs, Membres), section « MES COMMUNAUTÉS » listant les communautés où je suis admin ou modérateur (GET communities/mine?role=admin,moderator) avec nom, « N membres · identifiant », bouton copier (haptique succès) et chevron ; état vide dédié. Le détail d'un lien montre l'en-tête (icône personnes, nom, URL de jointure monospace), les actions Copier (coche temporaire), Partager (feuille système) et Identifier (copie de l'identifiant), deux cartes (Membres, Statut Actif/Inactif) et le bloc INFORMATIONS (identifiant, lien complet, date de création). Cache-first : la liste en cache s'affiche immédiatement puis se revalide.

Écarts :
- Ajouter à CommunityApi l'appel GET communities/mine avec le paramètre role=admin,moderator et le modèle minimal (id, name, identifier, isActive, memberCount, createdAt) puis la projection vers CommunityLink avec joinUrl = origine web + chemin de jointure.
- Calcul des statistiques (total, actives, membres cumulés) équivalent de CommunityLinkService.stats(links:).
- Créer l'écran liste (cartes de stats à teinte communityAccent, rangées avec copier, chevron, pull-to-refresh, état vide « Aucune communauté administrée ») et l'écran détail (actions Copier/Partager/Identifier, stats, informations).
- Copie dans le presse-papiers avec retour (coche 2 s sur le détail, annonce d'accessibilité « Lien copié », action d'accessibilité nommée « Copier le lien » sur la rangée) ; partage via Intent ACTION_SEND.
- Cache-first (fresh/stale/expired) via Room pour la liste ; spinner uniquement sur cache vide.
- Point d'entrée dans le menu / réglages ; (+) mène à la création de communauté.

Rendu : Couleur communityAccent partout ; cartes surfaceGradient teintées avec liseré 1 dp à 10-15 % ; icône person.3.fill dans un cercle 40-60 dp ; texte URL en monospace ; en-tête sur backgroundGradient.

Transposition Android : ShareLink vers Intent.createChooser(ACTION_SEND) ; UIPasteboard vers ClipboardManager ; NavigationLink vers navigation Compose.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityLinkService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CommunityLink.kt`

### Je règle ma communauté : nom, description, confidentialité, avatar, bannière, couleur, emoji, suppression ou départ

`gcom-community-settings` · Android : **absente** · P2 · effort M

Feuille « Réglages » : bannière de 120 pt modifiable (sélecteur de photo, recadrage et compression 800 Ko) et avatar de 80 pt modifiable (500 Ko) avec indicateurs de téléversement, carte Couleur (pastilles de 38 pt avec coche et accessibilité), champ Emoji local, section Infos (nom, description multiligne), section Confidentialité (interrupteur, libellé « Sur invitation » / « Ouverte à tous »), zone dangereuse (Supprimer la communauté pour le créateur, Quitter pour les autres) avec alertes de confirmation. Enregistrer est désactivé sans changement (hasChanges) ; seuls les champs modifiés partent au PUT ; couleur et emoji sont stockés localement. Toasts de succès/échec pour avatar, bannière et mise à jour. Les images passent par le même chemin que les images de profil (uploadImage), jamais par le téléversement de pièces jointes.

Écarts :
- Créer l'écran Compose en feuille plein écran avec barre Annuler / Réglages / Enregistrer (spinner pendant la sauvegarde, désactivé sans changement).
- Calcul hasChanges sur nom, description, confidentialité, avatar, bannière, couleur, emoji ; PUT communauté avec champs différentiels uniquement (avatar ou bannière vide = null).
- Sélection d'image via Photo Picker, recadrage (ratio avatar carré, bannière large), compression à 500 Ko (avatar) et 800 Ko (bannière) puis téléversement par le chemin d'images de profil (UserRepository.uploadImage) ; indicateurs de progression par visuel.
- Palette de pastilles de couleur 38 dp avec coche blanche, liseré 2 dp semi-transparent et description d'accessibilité « couleur X » ; champ emoji local avec placeholder 🏘️.
- Enregistrement local de la couleur et de l'emoji (DataStore) et projection dans la communauté renvoyée à l'hôte.
- Zone dangereuse : Supprimer (créateur uniquement) et Quitter (non créateur) avec AlertDialog destructives (« Cette action est irréversible. Tous les membres, canaux et messages seront supprimés définitivement. » / « Vous n'aurez plus accès aux canaux et messages de cette communauté. ») et rappels onDeleted / onLeft à l'hôte.
- Toasts (Snackbar) : mise à jour, avatar/bannière téléversé ou en échec ; alerte d'erreur (« Une erreur s'est produite »).

Rendu : Bannière 120 dp avec bouton « Modifier » en superposition, avatar 80 dp recouvrant ; sections à entêtes en petites capitales ; danger en rouge error ; fond d'écran backgroundPrimary.

Transposition Android : PhotosPicker + entityImagePickerFlow vers ActivityResultContracts.PickVisualMedia + recadrage ; NotificationCenter meeshy.showToast vers SnackbarHost ou bus d'événements UI ; alert vers AlertDialog.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Community/CommunitySettingsView.swift`
- `apps/ios/Meeshy/Features/Community/CommunitySettingsViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsScreen.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`

### Je vois dans l'en-tête de conversation les trois participants les plus actifs, et j'ouvre leur story ou leur profil

`gcom-conversation-header-active-members` · Android : **absente** · P2 · effort M

L'en-tête d'une conversation de groupe affiche une pile d'avatars des trois personnes qui ont le plus écrit dans les messages chargés (hors moi). Un toucher ouvre la story si elle n'a pas été vue, sinon le profil (fiche de participation pour un visiteur sans compte) ; l'appui long ouvre un menu dont l'ordre est Voir la story (si une story existe), Voir le profil, Conversation, Envoyer un message. Chaque avatar porte son contour équipé et son identité de fiche, sans passer par un compte inexistant pour un invité.

Écarts :
- Ajouter la règle pure ConversationActiveMember.ranked(messages, limit 3) : décompte par expéditeur hors soi, tri décroissant, premier message gardé pour nom / couleur / avatar / clé de présence.
- Ajouter les règles pures ConversationHeaderMemberTap.resolve(storyState) (story non vue = story, sinon profil) et ConversationHeaderMemberMenuEntry.entries(storyState).
- Ajouter dans l'en-tête de ChatScreen une pile d'avatars chevauchants (la pile du frappeur TypingAvatarCluster existe, ne pas la confondre) avec anneau de story et contour de profil.
- Brancher le toucher et l'appui long (menu contextuel) vers StoryViewer, la fiche participant, les détails de conversation et l'ouverture d'un DM.
- Mémoriser le calcul dérivé (cache de projection) pour ne pas le refaire à chaque message.

Rendu : Avatars de 28-32 dp qui se chevauchent à gauche du titre, anneau de story coloré quand non vue, contour de profil dans l'empreinte de l'avatar.

Transposition Android : AvatarContextMenuItem vers DropdownMenu ancré sur appui long ; ProfileSheetUser.from(message) vers modèle de fiche existant côté chat.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationHeaderActiveMember.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### En tant qu'admin d'un appel de groupe, je coupe le micro d'un participant ou je le retire depuis sa tuile

`gcom-group-call-moderation` · Android : **absente** · P2 · effort S

Menu contextuel (appui long) sur la tuile d'un participant distant, visible seulement pour l'admin d'appel (jamais sur sa propre tuile) : « Couper le micro » et « Retirer » (destructif) avec confirmation (dialogue de confirmation nommant la personne). Les mêmes actions sont exposées comme actions d'accessibilité nommées. La passerelle tranche le droit.

Écarts :
- Ajouter les émissions socket de modération d'appel (mute du participant cible, retrait du participant) à CallSignalManager et la règle mayModerate(targetUserId, viewerId) (admin d'appel, pas soi-même).
- Menu contextuel sur tuile (appui long) : « Couper le micro » et « Retirer » ; absent pour ma tuile et pour les non-admins.
- AlertDialog de confirmation de retrait nommant le participant (« Retirer <nom> de l'appel ? ») avec boutons Retirer (destructif) et Annuler.
- Actions TalkBack nommées équivalentes (customActions) pour couper le micro et retirer.
- Libellés localisés (muteParticipant, removeParticipant, removeConfirm(name), cancel) dans les 7 locales.

Rendu : Menu à deux entrées avec icônes mic.slash et person.fill.xmark ; entrée destructive en rouge.

Transposition Android : contextMenu vers combinedClickable(onLongClick) + DropdownMenu ; confirmationDialog vers AlertDialog ; accessibilityAction(named:) vers semantics customActions.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/GroupCallStageView+Moderation.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`

### Sur Nearby, je lis une carte de densité (cellules froid→chaud), des épingles groupées et des halos de précision

`gcom-nearby-density-map` · Android : **absente** · P2 · effort L

Carte de découverte à proximité : mode densité (cercles de cellule par grille, rayon = demi-cellule, couleur bleu profond→rouge normalisée sur la cellule la plus dense de la vue, opacité 0,18→0,60), mode épingles (annotations avec regroupement en grappes, sous-titre du lieu, halo de précision) et mode populaire ; toucher sur une grappe zoome pour la dérouler, toucher sur une épingle ouvre la publication, recentrage de la carte à l'initiative de l'utilisateur détecté (geste utilisateur significatif) avec déclenchement du rechargement. Utilise une carte native avec superpositions, les cellules et pins viennent du gateway.

Écarts :
- Android n'a que la liste Nearby (NearbyScreen) : aucune dépendance carte dans le build ; choisir et ajouter un SDK de carte (Maps Compose ou MapLibre) et gérer clé / thème clair-sombre.
- Ajouter l'appel de densité (cellules NearbyDensityCell avec cellLat, cellLng, count ; tailles de cellule NearbyDensityCellSize) et les pins NearbyMapPin (geoPoint d'abord, badge de lieu en repli) à PostApi / PostRepository.
- Porter NearbyDensityPalette en logique pure : normalized(count, hottest), components(normalized) en interpolation bleu (0,16/0,42/0,94) vers rouge (0,94/0,24/0,18), fillAlpha = 0,18 + 0,42 × t.
- Dessiner les cellules (cercles de rayon kilometers × 500 m, remplissage et trait), les halos de précision et les marqueurs avec regroupement (cluster) ; toucher grappe = zoom pour montrer les membres, toucher épingle = publication.
- Recentrage sur geste utilisateur significatif (déplacement minimal) avec débounce avant le rechargement, rayon calculé de la région visible.
- Bascule liste / carte et modes densité / épingles / populaire dans NearbyScreen ; états chargement, vide avec raison (NearbyEmptyReason) et erreur.
- Accessibilité de la carte : alternative liste, descriptions des marqueurs.

Rendu : Gradient bleu profond (0,16/0,42/0,94) vers rouge (0,94/0,24/0,18) ; cellules translucides pour laisser lire la carte ; marqueurs standard groupés ; halo de précision autour de l'épingle.

Transposition Android : MKMapView + MKOverlay vers Google Maps Compose (Circle, Marker, clustering) ou MapLibre ; UIGestureRecognizer vers callbacks de caméra (onCameraMoveStarted avec REASON_GESTURE).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/NearbyDensityOverlay.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyViewModel.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### En publiant avec un lieu, je choisis séparément de rendre mon contenu trouvable à proximité et à quelle précision

`gcom-nearby-discoverability-consent` · Android : **absente** · P2 · effort M

Contrôle de consentement « Rendre ce contenu trouvable à proximité » du compositeur (post et compositeur Meeshy) : second opt-in indépendant du lieu affiché, fermé par défaut, replié avec résumé (« Trouvable à proximité » / « Non trouvable à proximité »), interrupteur, sélecteur de précision en puces défilantes (Exacte, Quartier ~1 km, Ville ~10 km, Région ~100 km), préréglé sur la dernière précision réellement utilisée sinon la plus grossière (Région). Le grain revendiqué ne dépasse jamais la coordonnée envoyée : le partage de position plafonne les paliers offerts avec explication (« Votre partage de position limite la précision à … ») et tout resserrement de la mémoire est dit (« Votre dernier choix … a été resserré à … ») ; avertissement quand le lieu affiché part à l'adresse exacte ; confirmation « Ce contenu sera trouvable au grain … ». Le consentement porte sur UNE publication et se referme au nettoyage du compositeur.

Écarts :
- Ajouter les types DiscoverabilityPrecision (exact, neighborhood, city, region ; clamped(under:), allowedTiers(under: LocationPrecision)) et LocationPrecision / LocationSharingPreferences (lastDiscoverabilityPrecision) côté Android.
- Porter NearbyDiscoverabilityChoice en logique pure : off par défaut, tier mémorisé pré-sélectionné mais clampé, offeredTiers du plus fin au plus grossier, narrowedFrom, sharedCoordinateIsExact, isCappedBySharing, precisionToSend (null = clé omise) et tierToMemorize, gestes setDiscoverable / select / reset.
- Étendre CreatePostRequest avec la précision de découvrabilité (geoPrecision) ; n'envoyer rien tant que l'interrupteur n'est pas ouvert.
- Créer le composable de consentement : en-tête repliable (chevron, résumé, nom du lieu, bouton Retirer le lieu), interrupteur lié au geste du modèle, sélecteur de puces avec icônes (scope, house, building.2, globe) défilant jusqu'à la sélection, notes (plafonnement, resserrement, adresse exacte, application) avec icône.
- Mémoriser le palier utilisé à la publication (DataStore) et refermer le consentement au nettoyage du compositeur.
- Offrir le contrôle seulement quand un lieu est posé et que la visibilité le permet (NearbyDiscoverabilityLabels.offers(hasPlace, visibility)).
- Libellés localisés (7 locales), annonces d'accessibilité « Déplié / Replié » et hint de l'interrupteur.

Rendu : Carte repliable avec icône mappin.and.ellipse, résumé en caption ; puces de précision avec icône et libellé, sélectionnée teintée d'accent ; notes d'information avec icône discrète et texte footnote atténué.

Transposition Android : Toggle vers Switch ; ScrollViewReader vers LazyListState.animateScrollToItem ; UserDefaults vers DataStore.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/NearbyDiscoverabilityControl.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/NearbyDiscoverabilityChoice.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### La recherche répond tout de suite depuis l'appareil (conversations, messages, utilisateurs) avant le réseau, et mesure l'usage

`gcom-global-search-local-first` · Android : **partielle** · P0 · effort M

Le ViewModel lance trois volets en parallèle après un débounce de 300 ms (seuil 2 caractères, annulation de la recherche précédente) : conversations (FTS local puis réseau, fusion dédoublonnée), utilisateurs (cache local puis réseau, identifiant de recherche servi par la passerelle) et messages (FTS5 local, cache LRU mémoire de 5 requêtes à TTL 2 min, réseau en éventail par conversation, fusion). Les événements socket de mise à jour/suppression de conversation vident le cache LRU. L'identifiant de recherche relie la soumission au résultat touché dans la télémétrie de découverte (texte jamais envoyé) ; les récentes sont plafonnées à 10.

Écarts :
- Ajouter la recherche locale d'abord (Room FTS) pour messages, conversations et utilisateurs, fusionnée au réseau avec dédoublonnage par id, de sorte que des résultats s'affichent hors-ligne et avant la réponse serveur.
- Retirer la dépendance au réseau pour l'éventail de messages : aujourd'hui Android cherche dans les 10 premières conversations trouvées (5 messages chacune) ; ajouter le chemin FTS local et le chemin éventail serveur de repli.
- Ajouter la télémétrie de découverte : emit search-submitted (searchId servi, nombre de personnes, jamais le texte) et profile-result-tapped (userId, position) ; conserver searchId servi par meta.searchId de la page de personnes.
- Cache LRU des requêtes : aligner capacité (5), TTL (2 min), clé = requête normalisée en minuscules ; invalider sur conversation:updated, closed et deleted (partiellement présent).
- Persistance à froid du cache de requêtes (iOS : en mémoire seulement, suivi consigné) : optionnel côté Android.
- Résultat par volet {items, failure} et ordre de priorité des erreurs (conversations, personnes, messages) pour l'écran.

Rendu : Aucun rendu direct ; conditionne la sensation « instantanée » (dimension 2) : aucun spinner quand des résultats locaux existent.

Transposition Android : GRDB FTS5 vers Room FTS4/FTS5 ; Combine debounce vers Flow.debounce ; Task annulable vers Job annulé par mapLatest.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/GlobalSearchViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/search/GlobalSearchRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/search/SearchQueryCache.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/search/SearchTextFolder.kt`

### Je cherche partout (messages, conversations, utilisateurs) avec onglets, surlignage, récents et états hors-ligne / erreur

`gcom-global-search-screen` · Android : **partielle** · P0 · effort M

Recherche globale : champ « Rechercher partout... » avec effacement, trois onglets avec compteurs (Messages, Conversations, Utilisateurs) et étiquettes d'accessibilité « N résultats », résultats de messages avec extrait surligné, conversations (icône par type, titre, dernier message avec états protégés « 1 message caché », « 1 message vue unique », « Message expiré », « Disparaît après lecture »), utilisateurs (avatar, nom, @pseudo, pastille « En ligne », ouvrant la fiche en feuille). État initial « Rechercher dans Meeshy » ou liste de recherches récentes (relancer au toucher, supprimer, tout effacer), « Recherche en cours... », « Aucun résultat / Essayez avec d'autres termes », hors-ligne (icône wifi.slash + Réessayer), erreur avec Réessayer, bannière discrète de panne partielle sans effacer la liste, indicateur discret de revalidation sans remplacer les résultats par un spinner.

Écarts :
- Remplacer le repli silencieux « volet en échec = liste vide » (GlobalSearchRepository.orEmpty) par un résultat par volet {items, failure} : afficher l'état d'erreur avec Réessayer quand rien n'est affiché, une bannière discrète quand des résultats existent, et ne jamais dire « Aucun résultat » quand le réseau est tombé.
- Ajouter l'état hors-ligne (icône wifi.slash, message de connexion, bouton Réessayer) et retryLastSearch qui rejoue la dernière requête lancée via la tâche de recherche.
- États de chargement : loading (cold start sans résultat), cachedStale (indicateur discret en surimpression, jamais un spinner qui remplace la liste) et loaded ; hasDisplayedResults toutes familles confondues.
- Ligne de conversation : afficher le dernier message avec les libellés de protection (message caché, vue unique, expiré, disparaît après lecture) et l'icône par type de conversation.
- Ligne d'utilisateur : toucher ouvre la fiche profil en feuille ; pastille « En ligne » via la présence résolue ; contour de profil équipé.
- Accessibilité : étiquettes composées par ligne (« Message de … dans … »), « N résultats » par onglet, annonces de recherche, action nommée « Supprimer des recherches récentes », en-têtes de section.
- Retours haptiques légers sur onglet, résultat, relance d'une recherche récente.
- Les récentes sont plafonnées à 10 ; vérifier l'équivalence avec RecentSearchesStore et la clé globalSearch.recentSearches.

Rendu : Onglets avec icône (text.bubble.fill, bubble.left.and.bubble.right.fill, person.2.fill) et compteur ; surlignage de l'extrait ; états vides centrés icône + titre + sous-titre ; panneau de recherches récentes avec en-tête « Recherches récentes » et action Effacer.

Transposition Android : TextField + tabs vers OutlinedTextField + TabRow ; AttributedString surligné vers AnnotatedString (MessageTextParser.highlightedSegments existe) ; EmptyStateView vers composant d'état vide existant.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/GlobalSearchScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/GlobalSearchViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/search/GlobalSearchRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/search/RecentSearchesStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/search/SearchQueryCache.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/search/RecentSearches.kt`

### Je démarre une conversation directe ou de groupe en choisissant d'abord parmi mes contacts, puis par recherche

`gcom-new-conversation` · Android : **partielle** · P0 · effort M

Écran « Nouvelle conversation » : sélection multiple avec pastilles retirables, nom du groupe demandé dès deux personnes (mode groupe), champ « Rechercher un utilisateur… » (débounce 350 ms, 2 caractères), section « Vos contacts » affichée avant toute recherche (amis acceptés, cache-first : liste en cache immédiate, squelette seulement à froid, revalidation silencieuse, pagination par curseur jusqu'à 500), état « Aucun contact / Recherchez un utilisateur pour démarrer une conversation », échec de recherche distinct du vide, utilisateurs bloqués grisés et non sélectionnables (badge « Bloqué »), présence vivante, bouton Créer avec spinner, création (direct si 1 personne, groupe sinon avec titre) puis fermeture et navigation vers la conversation (haptique succès), erreurs « Vous ne pouvez pas démarrer de conversation avec cet utilisateur. » ou « Impossible de créer la conversation ».

Écarts :
- Ajouter l'approche contacts d'abord : charger les amis acceptés (cache Room partagé avec l'annuaire, jamais deux écrivains), les afficher dès l'ouverture sous l'en-tête « Vos contacts » avant toute saisie ; squelette uniquement à froid, état vide dédié.
- Pagination des relations acceptées (pages de 100, plafond 500) et agrégation par la définition partagée de « contact » (FriendListAggregator) pour ne pas perdre les relations où je suis receveur.
- État de panne de recherche (searchFailed) distinct de « Aucun utilisateur trouvé ».
- Utilisateurs bloqués : lecture de BlockService, ligne grisée, badge « Bloqué », non sélectionnable, mise à jour en direct au blocage/déblocage.
- Message d'erreur dédié quand le serveur refuse pour blocage (« Vous ne pouvez pas démarrer de conversation avec cet utilisateur. ») vs générique ; alerte d'erreur et haptique d'erreur.
- Présence vivante dans les lignes (point vert/orange/gris selon la règle 1/3/5 min) et libellé d'accessibilité composé (nom, bloqué, en ligne) ; état sélectionné annoncé.
- Navigation après création : fermer la feuille puis ouvrir la conversation avec un court délai (0,3 s) et haptique de succès ; contour de profil équipé sur les avatars.
- Pastille de statut (StatusBubble) intégrée à l'écran (withStatusBubble) : décision de parité à trancher.

Rendu : En-tête avec retour et bouton Créer (accent 818CF8) ; champ de nom de groupe sous l'en-tête en mode groupe ; barre de pastilles sélectionnées ; fond backgroundGradient ; lignes avatar + nom + @pseudo + coche de sélection.

Transposition Android : Task débounce vers Flow.debounce ; Logger privacy vers Timber sans PII ; withStatusBubble vers surface de statut existante côté feed si conservée.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/NewConversationViewModel.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationViewModel.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationLogic.kt`

### J'ajoute un membre à la conversation en le cherchant par nom ou @pseudo

`gcom-add-participant` · Android : **partielle** · P1 · effort S

Feuille « Ajouter un membre » : champ de recherche (nom ou @pseudo) avec croix et indicateur de recherche, résultats avec avatar, nom, @pseudo ; un utilisateur déjà membre ou tout juste ajouté affiche le badge « Membre » ; sinon bouton « Ajouter » (spinner pendant l'envoi) ; états « Recherchez par nom ou @pseudo » et « Aucun utilisateur trouvé » ; échec = « Impossible d'ajouter ce membre. » avec haptique d'erreur, succès = haptique de succès.

Écarts :
- Ajouter les retours haptiques succès et erreur (HapticFeedback / VibrationEffect) sur ajout réussi ou échoué.
- Rendre le contour de profil équipé (ProfileDecorWearer) sur l'avatar des résultats.
- Message d'erreur localisé « Impossible d'ajouter ce membre. » affiché de façon visible (Android expose errorMessage brut du réseau).
- Étiquette d'accessibilité « Ajouter <nom> » et annonce de « Recherche en cours ».

Rendu : Rangées avatar + nom/pseudo + bouton « Ajouter » capsule ; badge « Membre » atténué ; état d'invite centré avec icône.

Transposition Android : sheet vers ModalBottomSheet ; HapticFeedback vers LocalHapticFeedback.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/AddParticipantSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/AddParticipantViewModel.kt`

### Les communautés se chargent et se gèrent par un service unique (CRUD, membres, invitations, canaux)

`gcom-community-data-layer` · Android : **partielle** · P1 · effort S

CommunityService expose list/search/get/create/update/delete, la liste paginée des membres (offset), l'ajout d'un membre avec rôle, le changement de rôle, le retrait, join/leave, invite (un id ou un lot d'ids), checkIdentifier et les canaux d'une communauté (getConversations, addConversation). CommunityScreenModels fixe les contrats d'état consommés par les sept écrans (liste, détail, création, invitation, membres, réglages, ajout de canal) et les textes de toasts des réglages. Les modèles portent le rôle communautaire (creator > admin > moderator > member) et se projettent en MeeshyCommunity (couleur, emoji, avatar, bannière, compteurs).

Écarts :
- Ajouter l'invitation en lot (POST communities/{id}/invite avec userIds) absente de CommunityApi et CommunityRepository.
- Ajouter le modèle de présentation Community (id, name, description, avatar, banner, color, emoji, isPrivate, createdBy, memberCount, conversationCount avec repli sur _count) équivalent de toCommunity() ; seul ApiCommunity existe.
- Ajouter sur ApiCommunityMember une propriété communityRole (String vers MemberRole) et, pour MemberRole, l'icône et le libellé localisé (Créateurs, Admins, Modérateurs, Membres ; Creator, Admin, Moderator, Member).
- Persister la couleur et l'emoji locaux par communauté (iOS : UserDefaults community.color.<id> et community.emoji.<id>, défaut brandPrimary et vide) dans DataStore.
- Cache-first : aucune entité Room ni SWR pour liste, membres et canaux d'une communauté ; servir fresh/stale immédiatement et revalider en silence, spinner seulement sur cache vide.
- Fournir les chaînes de toasts (Communauté mise à jour, Avatar téléversé, Échec du téléchargement de l'avatar, Bannière téléversée, Échec du téléchargement de la bannière) dans les 7 locales.
- Fournir le titre d'affichage d'une conversation-canal (équivalent de APIConversation.listTitle(currentUserId), conversation directe = nom du pair) utilisé par la fiche communauté et l'ajout de canal.

Rendu : Aucun rendu propre ; fixe les noms de chaînes et les règles de rôle réutilisées par tous les écrans communauté.

Transposition Android : UserDefaults vers DataStore Preferences ; CacheCoordinator vers Room + politique SWR du sdk-core ; protocoles *Modeling vers interfaces de ViewModel Hilt exposant StateFlow.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityScreenModels.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/CommunityApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Community.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MemberRole.kt`

### Je consulte les membres d'une conversation, les ouvre, en retire par balayage ou menu, change leur rôle et quitte le groupe

`gcom-conversation-members-roster` · Android : **partielle** · P1 · effort M

Écran « Membres » : liste paginée par curseur (30) avec compteur accordé au pluriel (« 3 membres », « 199+ membres » quand plafonné), ligne = avatar avec présence résolue, humeur, « est dans la conversation », contour, nom (« (vous) » pour soi), badge de rôle (Admin rouge, Modo orange), @pseudo et colonne « Depuis » (date courte), toucher = fiche participant, visiteurs anonymes cliquables. Balayage à gauche = Retirer, appui long = menu contextuel (promouvoir modérateur/administrateur, rétrograder, retirer du groupe) selon le rôle, confirmations (« Retirer ce membre ? », « Changer le rôle ? », « Quitter le groupe ? »), bouton Ajouter en barre, bouton « Quitter le groupe » en pied, état vide « Aucun membre », squelette de lignes au chargement, pagination infinie, retours haptiques succès/erreur et alertes d'erreur.

Écarts :
- La feuille Android (ModalBottomSheet) n'affiche ni présence, ni humeur, ni indicateur « est dans la conversation », ni contour de profil, ni colonne « Depuis » : brancher MeeshyAvatar enrichi (présence résolue, ring) et la date d'arrivée courte (jour + mois abrégé, année sur 2 chiffres hors année courante).
- Le badge de rôle iOS est une capsule colorée (Admin/creator rouge, Modo orange) ; Android a un RoleBadge texte : aligner couleur, capsule et libellés.
- Ajouter le balayage à gauche (SwipeToDismissBox) « Retirer » avec confirmation, en complément du menu ⋯ ; l'appui long ouvre le menu contextuel des changements de rôle.
- Ajouter l'alerte de confirmation de changement de rôle (« Changer le rôle ? / Passer ce membre en … ») ; Android applique le rôle sans confirmation.
- Ajouter le bouton « Quitter le groupe » avec confirmation (« Quitter le groupe ? / Vous ne pourrez plus voir les messages de ce groupe. ») ; Android ne l'offre que par balayage dans la liste des conversations.
- Squelette de lignes (cercle 36 dp + deux barres, shimmer) au démarrage à froid, état vide « Aucun membre », et alerte d'erreur générique ; retours haptiques success/error sur retrait, rôle et départ.
- Compteur « N membres » accordé au pluriel par ressource plurals (7 locales, règle arabe à 6 formes) et forme plafonnée « 199+ ».
- Ouvrir la fiche d'un visiteur anonyme (traits bouton) et marquer « vous » sur sa propre ligne ; navigation plein écran vs feuille : décision d'écran à trancher (iOS pousse un écran, Android ouvre une feuille depuis le chat).

Rendu : Avatar 36-40 dp, nom labelSize semi-gras, badge microSize gras blanc sur capsule, @pseudo footnote atténué, colonne « Depuis » microSize/captionSize à droite ; padding horizontal xl / vertical smPlus ; bouton Quitter rouge discret en pied.

Transposition Android : swipeActions vers SwipeToDismissBox ; contextMenu vers combinedClickable(onLongClick) + DropdownMenu ; alert vers AlertDialog ; accessibilityLabel composé vers semantics(mergeDescendants).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationInfoMemberRow.swift`
- `apps/ios/Meeshy/Features/Main/Components/MembersCountLabel.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MemberRoster.kt`

### Je rejoins une conversation sans compte en renseignant mon nom, pseudo, e-mail, date de naissance et langue

`gcom-join-anonymous-form` · Android : **partielle** · P1 · effort S

Formulaire invité : prénom et nom obligatoires, pseudo et e-mail obligatoires seulement si le lien l'exige (sinon section « Optionnel »), date de naissance (sélecteur compact) quand requise, choix de langue parmi 14 (fr, en, es, de, it, pt, nl, pl, tr, ru, ar, zh, ja, ko avec leur autonyme) préréglé sur la première langue de l'appareil offerte (repli fr), champs avec liseré indigo au focus, validation (e-mail contient @ et .), bouton « Rejoindre » avec spinner, bouton retour qui revient à l'accueil. Les erreurs sont traduites par statut (404 introuvable, 409/410 message serveur, 429 « Trop d'utilisateurs connectes », interdit, auth). La requête n'envoie que les champs non vides.

Écarts :
- Étendre la liste de langues proposées (Android : quelques puces GUEST_LANGUAGES) aux 14 langues avec autonymes, présentées dans un sélecteur déroulant plutôt qu'en rangée de puces.
- Langue par défaut = première langue de l'appareil offerte (normalisée), repli fr ; Android prend fr par défaut.
- Date de naissance : utiliser un DatePicker Material (date passée, format ISO envoyé) au lieu d'un champ texte ; n'envoyer la date que si requise.
- Mapper les erreurs par statut : 404 « Ce lien de conversation est introuvable », 409/410 message du serveur, 429 « Trop d'utilisateurs connectes », interdit avec raison, 5xx « Erreur lors de la connexion ».
- Section « Informations requises » vs « Optionnel » (pseudo et e-mail passent d'une section à l'autre selon requireNickname / requireEmail) et liseré indigo au focus.
- Validation e-mail (contient @ et .) quand requis ; divergence à garder : Android propose une suggestion de pseudo (GuestJoinForm.suggestingUsername), gain à conserver.

Rendu : Champs avec icône à gauche, fond secondaire, liseré indigo400 60 % au focus ; titre « Rejoindre la conversation » ; bouton de soumission pleine largeur dégradé de marque avec spinner.

Transposition Android : DatePicker compact vers DatePickerDialog Material3 ; FocusState vers FocusRequester + onFocusChanged ; Picker menu vers ExposedDropdownMenuBox.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/AnonymousJoinFormView.swift`
- `apps/ios/Meeshy/Features/JoinFlow/JoinFlowViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowModeling.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowCopy.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GuestJoinForm.kt`

### Le parcours « Rejoindre par lien » enchaîne chargement, accueil, formulaire, bienvenue ou erreur avec réessai

`gcom-join-flow-container` · Android : **partielle** · P1 · effort M

Feuille de parcours à cinq phases : chargement du lien (« Chargement du lien... »), aperçu (page d'invitation), formulaire anonyme, succès (« Bienvenue ! Vous avez rejoint <titre> en tant que <pseudo> » et bouton « Ouvrir la conversation » qui renvoie la réponse à l'hôte), erreur (« Lien indisponible » + Réessayer + Fermer). Le point d'entrée peut sauter l'accueil (formulaire direct). Un choix de compte (se connecter, créer un compte, rejoindre avec mon compte) ferme la feuille et rend la main à l'hôte. Transitions en ressort (glissement latéral + fondu, échelle pour le succès) et poignée de feuille visible. Le fournisseur de lien est injectable (JoinFlowLinkProviding).

Écarts :
- Android résout l'entrée (ShareLinkEntryPolicy, choix de compte / anonyme, reprise de session invité) mais n'a ni phase d'aperçu (page d'invitation) ni écran de succès : ajouter la phase preview qui montre la page d'invitation avant tout choix.
- Ajouter l'écran de succès : pastille verte 100 dp avec coche 56, « Bienvenue ! », phrase « Vous avez rejoint <titre ou la conversation> en tant que <pseudo> », bouton « Ouvrir la conversation » dégradé de marque ; Android navigue aujourd'hui directement dans le chat.
- État d'erreur « Lien indisponible » avec message mappé (404, 410 serveur) et boutons Réessayer / Fermer.
- Entrée directe au formulaire (JoinFlowEntry.anonymousForm) et retour qui revient à l'accueil quand l'entrée était l'accueil, sinon ferme.
- Animations de phase : ressort 0,4/0,8, glissement latéral + fondu pour aperçu et formulaire, échelle + fondu pour le succès ; en-tête « Rejoindre » avec croix hors aperçu.
- Isoler le chargement du lien derrière une interface JoinFlowLinkProviding (getLinkInfo, joinAnonymously) pour les tests.

Rendu : Fond backgroundPrimary avec deux halos flous indigo (300 dp et 200 dp, 4 % d'opacité) ; succès : cercle success 15 %, titre titleSize gras arrondi ; erreur : icône, titre, message et deux boutons.

Transposition Android : sheet avec presentationDragIndicator vers ModalBottomSheet plein écran ou destination de navigation Compose ; deep links /join et /chat/<linkId> déjà routés vers GUEST_JOIN ; AnimatedContent pour les transitions de phase.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/JoinFlow/JoinFlowSheet.swift`
- `apps/ios/Meeshy/Features/JoinFlow/JoinFlowLinkProviding.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowScreen.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkEntryPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/sharelink/ShareLinkJoinRepository.kt`

### En tant qu'admin, je promeus, rétrograde, expulse ou bannis un membre avec le bon identifiant

`gcom-member-moderation` · Android : **partielle** · P1 · effort M

Section de gestion des membres (dans les réglages d'une conversation) : recherche de membre, liste avec badge de rôle (Créateur, Admin, Modérateur), menu ⋯ par ligne et bouton « Ajouter un membre » pour modérateur et plus. La politique MemberActionPolicy décide seule des gestes : rétrograder/promouvoir seulement pour les comptes et selon le rang (créateur peut nommer admin, admin peut nommer modérateur), expulser toujours, bannir seulement pour admin et plus (invalide le lien de partage d'entrée), et surtout quelle clé part au gateway (User.id pour les comptes, Participant.id pour un visiteur sans compte) pour éviter les 404 et les retraits sans effet.

Écarts :
- La politique Android (MemberModeration) distingue retrait, rôle et bannissement mais pas la clé : implémenter la sélection targetKey = userId ?? participant.id pour expulser et bannir un visiteur sans compte, et réserver le changement de rang aux comptes.
- Aligner les règles de rang : rôle courant > rôle cible exigé pour toute action ; promotion admin réservée au créateur ; promotion modérateur dès admin pour un membre ; rétrogradation pour tout rôle > membre ; bannir exige admin ou plus.
- Les rôles effectifs lisent conversationRole avant le rôle plateforme (ne pas confondre un ADMIN plateforme avec un admin de conversation).
- Ajouter la section de gestion embarquée dans les réglages de conversation (barre de recherche locale des membres, bouton « Ajouter un membre » pour modérateur+, état vide « Aucun membre trouvé », chargement) ; Android n'a que la feuille des membres.
- Libellés et icônes des actions : Promouvoir administrateur (bouclier), Promouvoir Modérateur (bouclier coché), Rétrograder Membre (personne), Expulser (personne barrée), Bannir (main levée), actions destructives en rouge.
- Étiquette d'accessibilité « Options pour <nom> » sur le menu ⋯ et badge de rôle (Créateur ambre, Admin rouge, Modérateur indigo).

Rendu : Section à fond backgroundSecondary 70 % coins lg et liseré couleur de section 10-15 % ; avatars 36 dp ; recherche capsule fond textMuted 8 % ; séparateurs décalés de 60 dp à 40 %.

Transposition Android : Menu vers DropdownMenu ; section repliable des réglages de conversation vers LazyColumn item.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift`
- `apps/ios/Meeshy/Features/Main/Components/MemberActionPolicy.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MemberModeration.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersSheet.kt`

### J'ouvre la fiche d'un participant, instantanément depuis le cache, et un admin règle ses droits et son historique

`gcom-participant-profile` · Android : **partielle** · P1 · effort M

Feuille « Fiche du participant » (moyenne / grande) : en-tête avec masque violet et pastille « sans compte » pour un visiteur, nom complet, @pseudo ; bloc d'informations (langue, pays, arrivé le, par le lien, e-mail et naissance masqués « fourni, réservé aux modérateurs » quand non servis) ; section « Dans cette conversation » (droits : en lecture seule on liste les refus, en édition pour hôtes huit interrupteurs verts par droit annoncé, un seul droit envoyé par écriture) ; octroi d'historique par date (sélecteur de date plafonné à aujourd'hui, effacer, lecture seule pour un modérateur, erreur annoncée) ; « Réglages du lien » (désactivé, entrées n/max, expire le, exige pseudo / e-mail / naissance, langues admises). Cache-first : le cache est peint tout de suite, la synchro part à l'ouverture, un 404 dit « Cette personne a quitté la conversation » et efface la copie. Mise à jour en direct sur participant:rights-updated et user:updated.

Écarts :
- Rendre les interrupteurs de droits éditables quand entryLink est servi (la présence d'entryLink est la réponse du gateway à « puis-je écrire ») : PATCH participants/{participantId}/rights avec un seul droit par écriture, réponse résolue reposée telle quelle, une écriture à la fois ; Android n'affiche que les refus.
- Ajouter les huit libellés autorisés (voir les messages antérieurs, écrire, photos, fichiers, vidéos, audio, liens, partager sa position) en plus des libellés de refus.
- Ajouter la section « Réglages du lien » : état désactivé en orange, entrées n/max, expiration, exigences jointes par « · », langues admises en majuscules.
- Ajouter les lignes d'information manquantes : langue, pays, arrivé le (date + heure), e-mail et naissance avec libellé masqué « fourni, réservé aux modérateurs ».
- En-tête d'un visiteur : masque violet (theatermasks), pastille « sans compte » violette, nom complet résolu.
- Cache-first : peindre la fiche en cache avant le réseau, synchroniser à l'ouverture, ne montrer le chargement que sur cache vide, ne pas retirer la fiche sur échec de synchro ; message distinct « Cette personne a quitté la conversation » (404) vs « Fiche indisponible ».
- Temps réel : appliquer participant:rights-updated (présence de la clé historyVisibleFrom = efface ou pose ; absence = ne rien affirmer) et user:updated (nom / photo) sans relecture.
- Octroi d'historique : le message d'erreur « Échec de la mise à jour » doit être annoncé (liveRegion) ; sélecteur de date plafonné à aujourd'hui avec bouton effacer à 48 dp.

Rendu : Bloc d'infos fond backgroundSecondary coins lg continus ; titres de section en capitales captionSize semi-gras atténué ; section Réglages du lien encadrée d'un liseré pointillé 1 dp (4/3) à 30 % ; interrupteurs teintés success.

Transposition Android : presentationDetents medium/large vers ModalBottomSheet partiellement étendu ; Toggle vers Switch ; DatePicker vers DatePickerDialog ; UIAccessibility.announcement vers liveRegion.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ParticipantProfileSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/ParticipantProfileLoader.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationParticipantProfile.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ParticipantProfileProjection.kt`

### Je crée un lien de partage d'une conversation avec règles d'accès, permissions, limites et expiration

`gcom-share-link-create` · Android : **partielle** · P1 · effort S

Formulaire « Nouveau lien de partage » : choix du groupe / de la communauté / du canal (sélecteur par sections Groupes, Communautés, Canaux & Public avec recherche), identité (nom, description, slug d'URL optionnel), accès invités (compte requis, pseudonyme requis, e-mail requis, date de naissance requise ; « compte requis » désactive les trois autres), permissions des invités anonymes (messages, images, fichiers, historique), limites (nombre maximal d'utilisations avec pas, expiration Jamais / 24 h / 7 j / 30 j / 3 mois), bouton « Créer le lien de partage » dégradé (désactivé sans conversation) avec « Création en cours… », erreur en pied de formulaire, haptique de succès puis remise du lien créé à l'hôte.

Écarts :
- Le choix de la conversation est un écran séparé (ShareLinkPickerScreen) sans sections ; intégrer dans le formulaire une ligne « Choisir un groupe ou une communauté » qui ouvre un sélecteur à sections (Groupes, Communautés, Canaux & Public) avec recherche « Rechercher un groupe… », icône et libellé du type de conversation sur la sélection.
- Pluriel localisé du nombre d'utilisations (« 1 utilisation maximum » / « N utilisations maximum ») et libellé « Illimité » ; stepper avec pas plutôt qu'un champ numérique brut.
- Sous-titres explicatifs par section et par option (ex. « Seuls les membres Meeshy peuvent rejoindre », « Permet le contrôle d'âge »), icônes de section et badges d'icônes colorés.
- Bouton de création : dégradé shareAccent→indigo300, état désactivé translucide sans conversation, libellé « Création en cours… », animation du changement d'état (ressort 0,3/0,8).
- Haptique de succès à la création, retour d'erreur visible avec icône ; accessibilité des interrupteurs (nom + sous-titre) et du bouton de sélection de conversation (indice « Choisit la conversation à partager »).
- Écran de lien créé (Android l'a déjà : copier / partager) à conserver, c'est un gain sur iOS.

Rendu : Sections à entête capitales caption2 semi-gras avec icône ; lignes d'interrupteur avec titre + sous-titre ; bouton principal 56 dp coins lg ; fond sombre translucide en l'absence de sélection.

Transposition Android : Stepper vers boutons +/- ou Slider discret ; Picker menu vers ExposedDropdownMenu / puces FilterChip (déjà présentes) ; sheet de sélection vers ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/CreateShareLinkScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/CreateShareLinkViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CreateShareLinkForm.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkPickerScreen.kt`

