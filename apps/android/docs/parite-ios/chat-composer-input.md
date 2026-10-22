# Parité iOS → Android : `chat-composer-input`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**43 features iOS** : 17 absentes, 19 partielles, 6 divergentes, 1 complètes sur Android. **36 lots** planifiés (≈26970 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**chat-composer-input** (couverture Android estimée ≈ 22 %)

Cette partie couvre tout ce qui sert a ECRIRE et ENVOYER sur iOS : la barre UniversalComposerBar (plaque de verre, etat minimise, barre d'outils, rails ephemere/flou/vue unique/effets, emojis rapides, bouton d'envoi, touche Retour qui envoie), la saisie assistee (mentions, mise en forme, collage et depot de fichiers), le panneau de pieces jointes avec zone d'attente et plan d'envoi multi-pieces, les bandeaux reponse/edition et les zones qui remplacent le composeur, la voix, les lieux (selecteur, cartes, partage en direct), les stickers et la boutique de packs (SDK domaines, magasin adresse par contenu, vitrine unifiee), l'outbox durable (dispatcher, planification, reprise apres echec), la camera in-app (infrastructure de capture) et quelques surfaces voisines (connexion par lien avec liaison appareil, hub de liens, pilule d'appel, ligne de conversation, orchestrateur de bulle).
Sur Android, le composeur est un ChatComposer de 670 lignes (champ Material, tiroir de pieces en rangee, pastille de langue, pilule vocale, avis lecture seule et mode lent) adosse a de bonnes briques pures du SDK (MentionComposer, ComposerSendGate, DraftAutosave, LargePasteDetector, LinkPreviewCache, outbox WorkManager a 22 types). L'envoi est outbox-first, alors que iOS poste en REST direct avec repli socket puis outbox.
Il manque l'ensemble de l'experience riche : plaque de verre et etat minimise, zone d'attente des pieces (Android envoie des la selection), plan d'envoi par groupes, protections armables avec teinte et contagion, emojis rapides, touche Retour, barre de format, depot/collage de fichiers, lieux (aucune carte dans l'app), stickers et tout le moteur de packs/boutique, repli socket et classification des refus, camera in-app, liaison appareil du lien de connexion.
Le point dur de fondation est l'outbox (13 types de mutation iOS absents) et le modele de piece en attente, dont presque toute la chaine depend. Estimation de couverture : environ 22 % de la surface iOS de cette partie atteint l'iso (un seul item complet, une quinzaine partiels, une dizaine divergents, le reste absent).

## Notes transverses

VÉRIFICATIONS CONTRE L'ARBRE RÉEL (corrections de l'inventaire) : (1) `SharedPlace` EXISTE déjà dans :core:model (`SharedPlace.kt`, consommé par le feed) : il manque seulement le champ `location` sur `SendMessageRequest`/`ApiMessage` et le producteur côté `MessageRepository.sendOptimistic`. (2) `OutboxEntity` n'a NI `nextAttemptAt` NI auteur : le backoff est celui de WorkManager (`Result.retry`, 10 s exponentiel), donc le « minuteur à l'échéance » et la garde de propriété exigent des colonnes Room. (3) Les octets des médias en attente vivent dans une colonne BLOB Room (`MediaBlobEntity.bytes`) : une ligne > ~2 Mo dépasse la fenêtre de curseur SQLite, donc toute vidéo ou grosse photo en file est illisible, et 199 pièces en `ByteArray` sont un risque d'OOM. Le lot `durable-media-queue-file-backed` est un PRÉREQUIS P0 de tout le plateau de pièces. (4) `DatabaseModule` construit Room avec `fallbackToDestructiveMigration()` et `exportSchema = false` (version 16) : toute montée de version efface aujourd'hui l'outbox ET les messages non envoyés. Les deux lots qui touchent le schéma (`durable-media-queue-file-backed` 16→17, `outbox-sender-registry-and-guards` 17→18) doivent écrire des `Migration` explicites, les tester sur un DDL v16 écrit à la main (Robolectric), et ne garder le repli destructif que pour le downgrade. Leur chaîne `depends_on` SÉRIALISE volontairement les migrations : aucun autre lot du domaine ne doit bumper `MeeshyDatabase.version`. (5) `ConversationDraftStore` clé `draft:<convId>` sans userId (fuite entre comptes sauf `clearAll` au teardown). (6) Le gateway expose déjà `routes/mentions.ts` (suggestions contextId/contextType), `message-sticker.ts` et `location` côté schéma message, et les packs (`packages/shared/types/content-pack.ts`, vecteurs `packages/shared/design/packs/*.json`) : les lots Android sont additifs et rétrocompatibles (champs optionnels, anciens clients inchangés). (7) Pas de CameraX, pas de bibliothèque de carte, pas de Play Services dans `gradle/libs.versions.toml` : les lots `camera-in-app-capture` et `map-surface-engine` ajoutent ces dépendances (édition de `libs.versions.toml`, à fusionner en dernier ou à sérialiser). (8) `cmp-clipboard` est complet (rien à faire) et `cmp-keyboard` est déjà à moitié couvert par `imePadding()` : seul le suivi de la liste image par image reste.

POINTS CHAUDS DE FICHIERS (budget 1000-1200 lignes, plafond dur 1200) : `ChatScreen.kt` fait 2953 lignes, `ChatViewModel.kt` 2248, `MeeshyApp.kt` 1202, `ChatComposer.kt` 670. Ils sont déjà hors budget : interdit d'y ajouter. Règle donnée à tous les lots : on EXTRAIT d'abord (nouveaux fichiers `Composer*.kt`, contrôleurs injectés dans le ViewModel), et l'on ne laisse dans ces fichiers que du câblage de quelques lignes. Le lot `composer-state-and-isolation` doit RÉDUIRE `ChatViewModel.kt` (extraction de `ChatComposerController`) et `composer-glass-shell` réduit `ChatComposer.kt` à un assemblage (< 300 lignes) en déplaçant mécaniquement la pastille de langue, l'aperçu presse-papiers et l'avis mode lent dans leurs fichiers : ces deux lots passent EN PREMIER et SEULS sur ces fichiers, les suivants n'y ajoutent que des lignes de câblage. Pour éviter les conflits sur `strings.xml` (4 locales : values, -fr, -es, -pt), chaque lot crée ses propres ressources `composer_<sujet>_strings.xml` par locale (Android fusionne tous les fichiers de `values*/`).

ORDRE DE VAGUES SUGGÉRÉ (sans collision de fichiers au sein d'une vague) : V1 = durable-media-queue-file-backed, message-payload-location-sticker-wire, pending-attachments-model, composer-state-and-isolation, emoji-picker-full-catalog, link-preview-card-parity, mention-contacts-and-lookup, location-sharing-preferences, map-surface-engine, packs-domain-and-service, bubble-protection-shield-and-notices, signin-link-device-binding-confirmation, pending-link-and-referral, links-hub, call-pill-controls-and-action-button. V2 = composer-glass-shell, outbox-sender-registry-and-guards, packs-content-store-and-presence, pack-shop-state-and-cache, frame-usage-law-and-models, mention-suggestion-panel-ui, location-message-card, sticker-template-renderer. V3 = composer-toolbar-strip, composer-banners, composer-zones, composer-text-entry-behaviors, composer-keyboard-and-panel-dock, composer-attachment-tray, multi-attachment-send-plan, outbox-kinds-conversations-and-reports, outbox-kinds-posts-and-comments, outbox-flush-scheduling-and-status-queue, conversation-row-sync-and-join, pack-shop-ui-and-settings. V4 = composer-protections, composer-quick-emoji-send, attachment-panel-tiles-and-recent-media, composer-voice-recorder, composer-paste-drop, camera-in-app-capture, gallery-reply-composer, composer-draft-durable, sticker-conversation-sheet-and-send, location-picker-screen, send-failure-recovery. V5 = composer-text-sticker-frames, received-sticker-sheet, live-location-sharing.

LOTS À REVUE ADVERSARIALE avant fusion (CLAUDE.md : auth, migration de données, protection de contenu) : signin-link-device-binding-confirmation (login CSRF, secret appareil), durable-media-queue-file-backed et outbox-sender-registry-and-guards (migration Room + garde de propriété entre comptes : une mutation de A ne doit jamais partir sous B), bubble-protection-shield-and-notices (FLAG_SECURE, vue unique / éphémère : « qu'est-ce qui part À CÔTÉ ? » vignette, URL, nom de fichier, aperçu dans les récents), packs-content-store-and-presence (intégrité SHA-256, aucun fichier inconnu effacé).

DÉCISIONS PRODUIT À OUVRIR (issues `décision-produit`, jamais une ligne de doc) : (a) moteur de carte et fournisseur de tuiles (MapLibre + style OSM/MapTiler vs Google Maps Compose : clé, licence, hors ligne) : le lot `map-surface-engine` isole le choix derrière une interface `MapSurface` pour que le moteur soit remplaçable ; (b) emplacement du micro (iOS : DANS le champ à gauche, masqué au focus) : tranché dans `composer-voice-recorder` selon iOS ; (c) couleur de l'éphémère (rouge d'alerte sur la barre vs orange sur le fil, #7677 côté iOS) : le lot protections suit iOS (rouge) ; (d) familles de gabarits de stickers hors `text` (≈ 20 familles `StickerTemplates+*.swift`) : le lot `sticker-template-renderer` livre le moteur et la famille `text`, les autres familles relèvent du domaine stories (`ext:sticker-template-families`) ; (e) éditeur de pièce du plateau (retouche image/vidéo/scène) : `ext:attachment-editor`, le plateau expose le contrat de remplacement par id et dégrade en aperçu + retrait tant que l'éditeur n'existe pas.

AVANTAGES ANDROID À CONSERVER (ne pas régresser pour l'iso) : `ComposerSendGate` + `ComposerAffordances` (permissions invités, mode lent, appliqués à TOUS les chemins d'envoi, ce qu'iOS ne fait pas), pré-filtrage des tuiles par permission (loi 4 : pas de porte sans effet), pièce `text/plain` du presse-papiers réellement envoyée, chaîne upload -> greffe -> envoi durable et hors ligne (iOS téléverse en synchrone), types d'outbox propres à Android (PIN_MESSAGE, UNPIN_MESSAGE, BOOKMARK_POST, UNBOOKMARK_POST, MARK_UNREAD, UPDATE_PRIVACY_SETTINGS). L'architecture outbox-first d'Android est CONSERVÉE : `send-failure-recovery` porte les EFFETS utilisateur d'iOS (refus définitif sans boucle, retrait de la bulle, repli socket, toast), pas son choix REST direct.

LOIS TRANSVERSES À RESPECTER PARTOUT : accent de conversation (`accentColor`) pour tout composant de contexte conversationnel (plaque, bouton d'envoi, plateau, bandeaux, panneau, pastilles) ; couleurs sémantiques statiques pour erreur/succès et pour les protections (jetons `stateViewOnce` / `stateConcealed` ABSENTS de `MeeshyPalette` : créés par `composer-protections`) ; Prisme : la pastille de langue du composeur reste pilotée par `ComposerLanguageState` + `LanguageResolver.resolveUserLanguage` (jamais de repli sur `translations.first`), l'aperçu de ligne de conversation reste celui du Prisme (`LastMessagePreviewResolver`) ; présence : un point de présence vient uniquement de la charge servie (`presenceByUserId`/`isOnline` servis), `offline` = aucun point, aucune présence fabriquée dans les lignes de mention ; cache-first (aucun spinner sur cache non vide : vitrine de packs, contacts de mention, brouillons) ; mouvement réduit respecté (fondu simple) ; cibles 44 dp et libellés TalkBack sur chaque porte.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `attachment-panel-tiles-and-recent-media` | C | P0 | L | 1300 | composer-keyboard-and-panel-dock, composer-attachment-tray, pending-attachments-model, composer-glass-shell | Le bouton + ouvre un panneau à la hauteur du clavier avec mes médias récents et l'accès à toute la photothèque |
| `composer-attachment-tray` | C | P0 | M | 1100 | pending-attachments-model, composer-glass-shell, persist-media-file-queue | Mes pièces choisies attendent dans un plateau au-dessus du champ, que je peux apercevoir, éditer ou retirer avant d'envoyer |
| `composer-glass-shell` | C | P0 | M | 1100 | composer-state-and-isolation | La barre de composition est une plaque de verre unique qui s'adapte au contexte et se replie d'un geste |
| `composer-keyboard-and-panel-dock` | C | P0 | M | 850 | composer-glass-shell, emoji-picker-full-catalog | Le fil suit exactement le clavier, et le panneau de pièces ou d'emojis prend la place du clavier sans saut |
| `composer-state-and-isolation` | C | P0 | M | 900 | chat-screen-hosts-and-composer-split, chat-viewmodel-state-split | Taper une lettre ou enregistrer un vocal ne recompose que la barre, jamais le fil |
| `emoji-picker-full-catalog` | C | P0 | S | 450 |  | Je trouve n'importe quel emoji par catégorie, recherche ou récents, depuis le composeur comme depuis une réaction |
| `multi-attachment-send-plan` | C | P0 | M | 850 | pending-attachments-model, envoi-message-relation-typee-et-requete, persist-media-file-queue, composer-state-and-isolation, persist-messages-repository-decoupage, chat-viewmodel-state-split | Un envoi avec plusieurs pièces part en bulles ordonnées : légende sur les photos, réponse sur la première |
| `pending-attachments-model` | C | P0 | M | 900 | chat-viewmodel-state-split | Mes pièces choisies deviennent des objets en attente que je peux préparer, remplacer et retirer avant d'envoyer |
| `camera-in-app-capture` | C | P1 | L | 1200 | composer-attachment-tray, composer-toolbar-strip, dependances-gradle-scene-medias, composer-glass-shell | La caméra du composeur s'arme vite, bascule d'objectif sans écran noir et rend la prise comme dans le viseur |
| `composer-banners` | C | P1 | M | 600 | composer-glass-shell, chat-viewmodel-state-split | Je vois à quel message je réponds ou que je modifie, avec un aperçu riche de la pièce citée |
| `composer-draft-durable` | C | P1 | M | 600 | pending-attachments-model, composer-banners, socle-points-d-extension-de-l-app, chat-viewmodel-state-split | Un brouillon reste intact quand je quitte la conversation, tue l'app ou change de compte |
| `composer-protections` | C | P1 | M | 900 | composer-toolbar-strip, composer-glass-shell, chat-viewmodel-state-split | J'arme éphémère, flou ou vue unique en un geste et la barre prend la couleur de la protection |
| `composer-quick-emoji-send` | C | P1 | M | 650 | composer-glass-shell, emoji-picker-full-catalog, composer-text-entry-behaviors, chat-viewmodel-state-split | Tant que rien n'est écrit, l'emplacement d'envoi propose mes emojis rapides, et un envoi dessiné devient possible |
| `composer-text-entry-behaviors` | C | P1 | M | 520 | composer-glass-shell | La touche Retour envoie sans jamais envoyer par accident, et je mets du gras, de l'italique, du souligné ou du barré à la sélection |
| `composer-toolbar-strip` | C | P1 | M | 550 | composer-glass-shell | La barre d'outils regroupe protections, effets, sticker, langue, photos et caméra dans un bandeau défilant |
| `composer-voice-recorder` | C | P1 | M | 600 | composer-attachment-tray, multi-attachment-send-plan, composer-glass-shell, message-fil-decodage-complet-et-tolerant, chat-viewmodel-state-split | J'enregistre un vocal dans une barre pleine largeur, puis je l'ajoute aux pièces ou je l'envoie |
| `composer-zones` | C | P1 | S | 400 | composer-glass-shell, chat-viewmodel-state-split | Quand je ne peux pas écrire, le composeur est remplacé par une zone qui explique pourquoi et propose la sortie |
| `conversation-row-sync-and-join` | C | P1 | S | 320 | persist-outbox-schema-metadonnees, liste-decoupage-viewmodel | La ligne de conversation montre la synchro en attente, l'écran ouvert du pair et le bouton Rejoindre l'appel |
| `location-picker-screen` | C | P1 | M | 1100 | map-surface-engine, location-sharing-preferences, envoi-message-relation-typee-et-requete, multi-attachment-send-plan, attachment-panel-tiles-and-recent-media, composer-glass-shell | Je choisis un lieu sur une carte (recherche, autour de moi, recentrage) et je l'envoie avec nom et adresse |
| `map-surface-engine` | C | P1 | M | 700 | dependances-gradle-scene-medias | L'application sait dessiner une carte interactive et une vignette de carte statique |
| `mention-contacts-and-lookup` | C | P1 | M | 550 | socle-points-d-extension-de-l-app, chat-viewmodel-state-split | Taper @ propose instantanément mes contacts depuis le cache, puis l'annuaire contextuel |
| `mention-suggestion-panel-ui` | C | P1 | M | 550 | mention-contacts-and-lookup, composer-glass-shell | La liste @ montre avatars, présence et un état vide en toutes lettres, en panneau ou en bande |
| `outbox-flush-scheduling-and-status-queue` | C | P1 | M | 550 | persist-outbox-schema-metadonnees, socle-points-d-extension-de-l-app, persist-outbox-registre-senders, chat-viewmodel-state-split | Un envoi différé est retenté à l'heure juste et mes accusés de réception partent même hors ligne |
| `pack-shop-state-and-cache` | C | P1 | M | 700 | packs-domain-and-service | La boutique s'ouvre sur sa dernière version connue, achète avec mes Meeshes et gère les refus proprement |
| `pack-shop-ui-and-settings` | C | P1 | L | 1400 | pack-shop-state-and-cache, packs-content-store-and-presence, frame-usage-law-and-models, socle-points-d-extension-de-l-app | La boutique de packs liste stickers, cadres, fonds, contours et bannières, que j'installe, retire ou achète en un tap |
| `packs-content-store-and-presence` | C | P1 | L | 1300 | packs-domain-and-service | Les fichiers de mes packs se téléchargent vérifiés, une seule fois, et s'effacent sans casser un autre pack |
| `packs-domain-and-service` | C | P1 | M | 1100 | socle-points-d-extension-de-l-app | Mes packs de stickers, cadres, fonds, contours et bannières s'installent et se retirent sans rien perdre |
| `send-failure-recovery` | C | P1 | M | 650 | persist-outbox-schema-metadonnees, composer-zones, persist-messages-repository-decoupage, socket-routage-evenements-ordre-arrivee | Un envoi refusé pour de bon n'est pas retenté en boucle, et je sais pourquoi |
| `sticker-conversation-sheet-and-send` | C | P1 | M | 900 | gabarits-socle-registre-et-contour, composer-toolbar-strip, multi-attachment-send-plan, packs-domain-and-service, envoi-message-relation-typee-et-requete, chat-sticker-wire-and-rasterizer, composer-glass-shell, chat-viewmodel-state-split, chat-bulle-decoupage-composants | J'envoie un sticker comme un message à part entière : l'image part tout de suite et le texte du sticker reste lisible par tous |
| `composer-paste-drop` | C | P2 | S | 450 | composer-attachment-tray, composer-text-entry-behaviors, composer-glass-shell | Je dépose ou colle une image, une vidéo, un son ou un document directement dans le composeur |
| `composer-text-sticker-frames` | C | P2 | S | 400 | composer-quick-emoji-send, sticker-conversation-sheet-and-send, chat-viewmodel-state-split | Mon texte part dessiné dans un cadre à mots choisi parmi dix, d'un appui long sur Envoyer |
| `frame-usage-law-and-models` | C | P2 | M | 1000 | packs-domain-and-service | Chaque cadre dit où il est utilisable et la loi d'usage refuse ce qui n'a pas le droit d'être proposé |
| `links-hub` | C | P2 | M | 480 | socle-points-d-extension-de-l-app | Un hub 'Mes liens' regroupe mes liens de partage, de suivi, de communauté et d'affiliation |
| `live-location-sharing` | C | P2 | M | 650 | location-picker-screen, socket-routage-evenements-ordre-arrivee | Je partage ma position en direct avec ma conversation pour une durée choisie |
| `location-sharing-preferences` | C | P2 | S | 320 |  | Je règle la précision de mon partage de position et le style de carte une fois pour toutes |
| `received-sticker-sheet` | C | P2 | S | 380 | sticker-conversation-sheet-and-send, pack-shop-ui-and-settings, composer-glass-shell | Je touche un sticker reçu pour le voir en grand, l'ajouter à mes stickers ou ouvrir son pack |

### Lots fusionnés ou retirés par l'architecture

- `outbox-sender-registry-and-guards` → `persist-outbox-schema-metadonnees` (merge-into) : Propriétaire de la mutation (garde inter-comptes), prochain essai et attente des prérequis = mêmes colonnes outbox ; une seule migration.
- `durable-media-queue-file-backed` → `persist-media-file-queue` (drop-duplicate) : Même file de médias sur fichier (fin des BLOB Room > 2 Mo).
- `signin-link-device-binding-confirmation` → `ouvrir-un-lien-de-connexion-confirme` (merge-into) : Même confirmation de lien de connexion lié à l'appareil.
- `pending-link-and-referral` → `liens-entrants-classes-une-fois` (merge-into) : Même conservation du lien reçu sans compte, ouvert après connexion.
- `bubble-protection-shield-and-notices` → `bouclier-capture-ecran-android` (merge-into) : Même bouclier de capture pour la vue unique ; le rendu par nature est porté par voile-puce-et-flou-des-contenus-proteges.
- `gallery-reply-composer` → `chat-gallery-host-bridge` (drop-duplicate) : Même réponse à une pièce depuis la galerie. Hérite : composer-banners.
- `location-message-card` → `chat-position-carte-et-plein-ecran` (merge-into) : Même carte de lieu partagé dans la bulle. Hérite : map-surface-engine, envoi-message-relation-typee-et-requete.
- `link-preview-card-parity` → `chat-lien-integre-video-conversation-apercu` (merge-into) : Même aperçu de lien dans la bulle.
- `message-payload-location-sticker-wire` → `envoi-message-relation-typee-et-requete` (merge-into) : Même requête d'envoi portant lieu et sticker.
- `call-pill-controls-and-action-button` → `calls-bubble-and-minimized-pill` (merge-into) : Même pilule d'appel réduite.
- `outbox-kinds-conversations-and-reports` → `persist-outbox-kinds-compte-amis-conversations` (merge-into) : Mêmes kinds outbox conversation / ami / signalement.
- `outbox-kinds-posts-and-comments` → `post-publish-outbox` (drop-duplicate) : Mêmes kinds outbox de posts, commentaires et republications (post-publish-outbox, comment-send-outbox, persist-outbox-kinds-social-stories).
- `sticker-template-renderer` → `gabarits-socle-registre-et-contour` (drop-duplicate) : Même moteur de gabarits de stickers ; la rastérisation = chat-sticker-wire-and-rasterizer.

## Features

### Mes pieces choisies attendent dans un plateau au-dessus du champ, que je peux editer, apercevoir ou retirer avant d'envoyer

`cmp-tray` · Android : **absente** · P0 · effort M

ComposerAttachmentZone : plateau horizontal de 100 pt (fond degrade de surface teinte accent + bordure) qui montre, dans l'ordre : les pieces EN PREPARATION (AttachmentLoadingTile : decompression -> compression -> vignette -> ThumbHash, annulable), les pieces pretes (ComposerAttachmentTile 56x56 : vignette ou dessin de type — onde d'un son, epingle d'un lieu —, glyphe central 'Editer' si toucher edite, badge de retrait dans le coin, libelle dessous), et la tuile du lieu en attente. Toucher une piece ouvre son editeur (scene / retouche; une image ou video retouchee REMPLACE la piece par id, l'ancien fichier est rendu a purger, une piece partie pendant la retouche ne revient pas); appui long = apercu quick-look plein ecran (image agrandie / video lue) + action Supprimer; le retrait supprime aussi le fichier temporaire, la vignette et coupe la lecture d'un vocal. Meme plateau pour messages et commentaires. Import de documents (ComposerFileImporter) : copie de chaque fichier choisi dans un temp (portee de securite), taille et mime resolus, toast 'Echec de l'import de <nom>' sans piece fantome. Jusqu'a 199 medias sans multiplier les bulles.

Écarts :
- Introduire un modele de piece en attente (id, type, fichier local, vignette, mime, taille, duree, dimensions, couleur de vignette, asset MediaStore, etat preparing / ready) tenu par le ViewModel; aujourd'hui toute selection (fichier, photo, camera, vocal) est envoyee IMMEDIATEMENT via onPickFile, sans possibilite de verifier, editer ni retirer.
- Plateau horizontal de 100 dp (LazyRow) a fond degrade accent + bordure, tuiles 56x56 dp, libelle sous la tuile (60 dp), badge de retrait en coin, glyphe d'edition central, dessin par type (onde audio, epingle de lieu) a defaut de vignette, tuile du lieu en attente.
- Tuiles de chargement pour les pieces en preparation (compression image / video, vignette, ThumbHash) avec bouton Annuler, et placement dans la zone une fois pretes.
- Toucher une piece => editeur (retouche d'image, video, scene) et remplacement par id (PendingImageEditReplacement / PendingVideoEditReplacement) avec nettoyage de l'ancien fichier; ignorer si la piece a quitte le plateau.
- Appui long => apercu plein ecran (image zoomable / video) + menu Supprimer; retrait = supprimer le fichier temporaire, la vignette, couper la lecture d'un vocal en attente; haptique light.
- Import de documents : copie vers le cache avec resolution de nom / taille / mime, echec par fichier => toast 'Echec de l'import de <nom>' et piece ignoree (pas de piece fantome); multi-selection.
- Plafond de selection de 199 medias et indication du depassement; reutiliser le meme plateau pour les commentaires de feed (aujourd'hui une pastille de texte).
- Vocal enregistre place dans le plateau (stop + 'ajouter aux pieces jointes') avant envoi, voir cmp-voice.

Rendu : Plateau hauteur 100 dp, rayon lg, fond surfaceGradient teinte accent + bordure accent 0,3; tuiles 56x56 dp, badge de retrait cercle en coin haut droit, libelle caption medium 1 ligne; animation d'insertion/retrait en ressort (0,3/0,8).

Transposition Android : ScrollView horizontale => LazyRow; contextMenu + preview => LongPress + Dialog/BottomSheet d'apercu; fileImporter + security scope => OpenMultipleDocuments + copie en cache; ThumbHash => bibliotheque thumbhash JVM.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerAttachmentZone.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ComposerAttachments.swift`
- `apps/ios/Meeshy/Features/Main/Views/PendingImageEditReplacement.swift`
- `apps/ios/Meeshy/Features/Main/Views/PendingVideoEditReplacement.swift`
- `apps/ios/Meeshy/Features/Main/Views/ComposerFileImporter.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`

### Je choisis un lieu sur une carte (recherche, autour de moi, recentrage) et je l'envoie avec nom et adresse

`cmp-location-picker` · Android : **absente** · P1 · effort L

LocationPickerView : feuille plein ecran avec carte interactive, pin qui se SOULEVE pendant que la camera bouge (MapPinLift), champ de recherche 'Rechercher un lieu...' (MKLocalSearch, bouton Effacer), bouton 'Autour de moi' (points d'interet proches), resultats avec nom + categorie, recentrage sur ma position, geocodage inverse ('Recherche de l'adresse...'), invite 'Deplacez la carte pour choisir', gestion des autorisations (notDetermined / refusee) et des erreurs, bouton reglages de partage (precision, style de carte), carte inferieure titre + adresse + coordonnees monospace + badge de precision, bouton Confirmer en degrade conversation (haptique success) qui emet un SharedPlace COMPLET (coordonnees, nom, adresse, categorie POI, precision appliquee). Couleurs de la carte adaptees pour rester lisibles sur plan / hybride / satellite (luminosite plafonnee 0,60 clair / plancher 0,70 sombre). LocationPickerModel (CLLocationManager + geocoder) est nonisolated.

Écarts :
- Choisir et integrer une bibliotheque de carte (Google Maps Compose, MapLibre ou osmdroid) : aucune carte n'existe dans l'application; verifier la cle / licence et le mode hors-ligne.
- Modele SharedPlace (latitude, longitude, nom, adresse, categorie POI, precision) et champ location du message (messageSchema.location cote passerelle) produit par ApiMessage / MessageRepository; la tuile Position est volontairement desactivee dans l'echelle de pieces faute de producteur.
- Ecran de selection : carte plein ecran, pin qui se souleve pendant le deplacement, recherche (Geocoder / Places), Autour de moi, recentrage, geocodage inverse avec etat 'Recherche de l'adresse...', invite de deplacement, bouton Confirmer en degrade de la conversation + haptique success.
- Gestion des permissions de localisation (precise vs approximative sur Android 12+), refus, fournisseur desactive, erreurs; reutiliser awaitFreshLocationFix.
- Precision de partage appliquee au point emis (voir cmp-location-prefs) et badge de precision dans la carte inferieure.
- Couleurs de marqueur adaptees pour rester lisibles sur tous les styles de carte (plafond / plancher de luminosite).

Rendu : Carte plein cadre, pin accent de la conversation qui s'eleve avec ombre, carte inferieure arrondie 'glass' avec titre semi-bold, adresse 2 lignes, coordonnees monospace caption + badge precision, CTA Confirmer pleine largeur en degrade primaire -> accent (hue -30), contrôles flottants ronds (reglages, recentrer).

Transposition Android : MapKit / CoreLocation / MKLocalSearch => Google Maps SDK (ou MapLibre) + FusedLocationProvider / LocationManager + Geocoder + Places; sheet => ModalBottomSheet plein ecran ou ecran de navigation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/location/DeviceLocationFix.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Location.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### La liste @ s'affiche instantanement avec mes contacts, sans attendre le reseau

`cmp-mention-contacts` · Android : **absente** · P1 · effort S

MentionContactsStore sert les amis acceptes de la liste @ : snapshot memoire synchrone, loadCached() depuis le cache GRDB des amis, refreshIfNeeded() reseau SEULEMENT si le cache est vide ou perime (10 minutes), jamais deux fois en parallele, pagination 100 jusqu'a 500, retour apres echec reseau seulement apres 60 s, un echec ne vide rien, remise a zero a la deconnexion / changement de compte pour ne pas servir les amis du compte precedent. Le cache est le meme que celui de la liste de contacts (meme cle, meme lecture complete).

Écarts :
- Creer un magasin de contacts pour la liste @ : snapshot memoire, lecture cache Room/DataStore des amis, refresh reseau conditionnel (vide ou perime > 10 min), single-flight, pagination 100 -> plafond 500, fenetre de 60 s apres echec.
- L'exposer a MentionComposer comme strate 'contacts' avant participants et annuaire (aujourd'hui MentionRoster ne lit que les participants de la conversation).
- Reinitialisation a la deconnexion / changement de compte (SessionTeardown) pour ne pas fuiter la liste d'un compte a l'autre.
- Echauffer le cache au montage du composeur (sans reseau) et au `@` (avec reseau si perime).

Rendu : Aucun rendu propre : accelere l'apparition de la liste @ (aucun spinner si le cache a des donnees, regle Cache-First).

Transposition Android : GRDB/CacheResult => Room + StateFlow; Task single-flight => Mutex / Deferred partage.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MentionContactsStore.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MentionRoster.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendshipCache.kt`

### La boutique s'ouvre sur sa derniere version connue, achete avec mes Meeshes et gere les refus proprement

`cmp-pack-shop-state` · Android : **absente** · P1 · effort M

Modeles et etat de la vitrine unique : ShopPack (pack + prix + possession), PackShopSection (domaine + packs), PackShopResponse (sections + solde de Meeshes), achat (PackPurchaseRequest/Response), PackHTTPStatus (isInsufficientMeeshes, isDefinitiveRefusal, code), PackShopService (GET vitrine par domaines, POST achat), PackShopState et ses transitions pures (chargement, succes, echec, achat en cours, rafraichissement apres 403). PackShopSnapshotStore : derniere vitrine connue (Cache-First SWR) — frais 1 minute, servable perime jusqu'a 7 jours, au-dela lecture depuis zero; cle par ensemble de domaines; lignes fantomes seulement a froid.

Écarts :
- Modeles ShopPack / PackShopSection / PackShopResponse (sections + solde) / achat, miroirs des types partages, avec decodage tolerant aux champs ou domaines inconnus.
- PackShopService (vitrine par domaines, achat), PackHTTPStatus (solde insuffisant, refus definitif, 403 => rechargement).
- Etat de la vitrine avec transitions pures (sections nulles = jamais charge, achat en cours par slug, echec) et lecture CacheResult (fresh / stale / expired / empty).
- Snapshot store: stocker la derniere vitrine (par ensemble de domaines), frais 1 min, servable 7 jours; afficher le stale immediatement + rafraichir en silence; lignes squelette seulement quand le cache est vide ou expire.

Rendu : Aucun rendu propre; conditionne l'etat Cache-First de la vitrine (pas de spinner si cache non vide).

Transposition Android : CachePolicy ttl/staleTTL => regle SWR du cache Android (Room + horodatage); UserDefaults => DataStore.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Packs/PackShopModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/PackShopSnapshotStore.swift`

</details>

### La boutique de packs liste stickers, cadres, fonds, contours et bannieres, que j'installe, retire ou achete en un tap

`cmp-pack-shop-ui` · Android : **absente** · P1 · effort M

Reglages > Packs et telechargements (PacksSettingsView) : puces de domaine defilantes (Stickers, Cadres du jeu, Fonds, Contours, Bannieres, Cadres de banniere; selection en degrade de marque, cible 44), lien profond meeshy://settings/packs?domaine=... avec pack mis en avant (rangee centree et contouree). Vitrine unifiee (UnifiedShopView) : solde 'Meeshes : N', rangees PackRow (couverture PackCover, auteur 'par X', pastille 'Possede', description, bouton Installer / Retirer ou 'Acheter . N'), erreurs ('La boutique n'a pas pu se charger. Reessaie.' + Reessayer; 'Il te manque des Meeshes pour ce pack.'), etat vide 'Rien a decouvrir ici pour l'instant.', haptique light, a11y d'achat ('Acheter X pour N Meeshes'). PackShopView : rangees de stickers avec install / retrait optimiste, images de pack decodees (StoredPackImage, PackImageDecoder). Pour les cadres : onglet Boutique + un onglet par pack installe (cadres et leur usage).

Écarts :
- Ecran Reglages > Packs et telechargements avec puces de domaine, deep link meeshy://settings/packs?domaine=... (domaine inconnu => premier domaine), pack mis en avant.
- Vitrine unifiee: solde 'Meeshes : N', rangees de packs (couverture, auteur, 'Possede', description, prix), boutons Installer / Retirer / Acheter . N, etat d'achat en cours, refus 'solde insuffisant', refus definitif, 403 => rechargement.
- Etats: chargement a froid (lignes fantomes), erreur avec Reessayer, vide, hors ligne (servir le dernier contenu connu).
- Images de packs stockees (decodage hors thread principal, cache) et couverture par domaine (PackCover).
- Onglets de packs installes pour les cadres (montrent les cadres et leur usage), onglet Boutique.
- Haptiques light et libelles localises sticker.shop.* / shop.* / settings.packs.*; mouvements reduits.

Rendu : Puces capsule 36 dp (cible 44), selection en degrade de marque et texte blanc, non selectionne fond textPrimary 0,08; rangees avec couverture carree, titre semi-bold, 'par X' secondaire, bouton plein pour Acheter, contour sur le pack cible; erreur en MeeshyColors.error.

Transposition Android : CollapsibleHeaderPage => TopAppBar a collapse (LargeTopAppBar); scroll horizontal de puces => LazyRow; route de reglages => destination de navigation Compose avec argument domaine.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Packs/PackShopView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Packs/UnifiedShopView.swift`
- `apps/ios/Meeshy/Features/Main/Views/PacksSettingsView.swift`

</details>

### Mes packs (stickers, cadres, fonds, contours, bannieres) s'installent, se telechargent verifies et s'effacent sans rien perdre

`cmp-packs-engine` · Android : **absente** · P1 · effort L

Moteur de packs par DOMAINES (PackDomain : sticker, glory-frame, wallpaper, avatar-ring, banner, banner-frame, unknown tolere) : PackService par domaine (catalogue, installes, detail, installer PUT / retirer DELETE; routes /sticker-packs et /packs/<domaine>, achat pour les domaines payants), decodage par item (un pack illisible tombe seul). PackStore (app) : cache par compte, revalidation a chaque apparition, bascule optimiste (PackShelfState : togglingInstall, settled, rollback, `installed == nil` = on ne sait pas, trois packs integres par defaut). ContentAddressedStore : fichiers adresses par empreinte SHA-256 (jamais revalides, lecture disque verifiee, telechargement unique, fichier altere = retelecharge, hors sauvegarde cloud, jamais evinces sous pression memoire), PackAssetFetching GET /api/v1/pack-assets/<fichier>. PackPresence : machine PURE absent / queued(network\|wifi\|user) / downloading / ready / stale / failed(integrity\|network\|space, retry nextSession\|backoff\|spaceFreed) rejouee sur des vecteurs partages. PackFileRetention + PackFilePruner + PackFileIndex : retirer un pack efface ses fichiers SAUF ceux encore references par un autre pack retenu (tous comptes de l'appareil), un cadre garde dans un carnet ou un bail; un fichier inconnu n'est jamais efface. StickerPackStore/StickerPackService : facade stickers sur /sticker-packs inchange a l'octet.

Écarts :
- Creer le module de packs : PackDomain (domaines tolerants a l'inconnu), InstallablePack, PackRoutes par domaine, PackService<Pack> (catalogue, installed, detail, setInstalled) avec decodage par item, miroir de packages/shared/types/content-pack.ts.
- Magasin PackStore par compte avec cache (Room/DataStore), revalidation a l'apparition et bascule optimiste + confirmation + rollback (PackShelfState); regle 'installed == null' => servir les trois packs integres.
- ContentAddressedStore : stockage par SHA-256 dans filesDir/meeshy-packs (exclu du backup Auto), verification a chaque lecture, telechargement unique GET /api/v1/pack-assets/<fichier> (public, immuable), deduplication des requetes en vol, refus de DigestMismatch; ne jamais passer par le cache d'images evincable.
- Machine PackPresence pure (absent, queued, downloading, ready, stale, failed) + file de telechargement (WorkManager : Wi-Fi seulement, reseau, espace) rejouee sur les vecteurs partages packages/shared/design/packs/presence-vectors.json.
- Loi d'elagage PackFileRetention + PackFileIndex (manifeste par pack, fichiers 'superseded') + PackFilePruner : ne supprimer que les fichiers non references par un pack retenu de n'importe quel compte, un carnet ou un bail.
- Facade Stickers (StickerPackService / StickerPackStore) sur /sticker-packs, trois packs integres installes par defaut (Mee, Meo, duos).
- Reprise apres fin de session : echec d'integrite 'prochaine session', coupure 'au retour du reseau', espace 'quand la place est liberee'.

Rendu : Pas d'ecran : alimente la vitrine, les stickers, les cadres. Cache-First: la vitrine et l'etagere s'affichent depuis le disque sans spinner.

Transposition Android : CryptoKit SHA-256 => MessageDigest; Application Support => context.filesDir (noBackupFilesDir); URLSession => OkHttp; actor => Mutex/CoroutineScope; vecteurs partages lus depuis packages/shared (resource de test).

<details><summary>Sources iOS (9)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Packs/PackDomain.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/PackService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/PackPresence.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/ContentAddressedStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/PackFileRetention.swift`
- `apps/ios/Meeshy/Features/Main/Services/PackStore.swift`
- `apps/ios/Meeshy/Features/Main/Services/PackFilePruner.swift`
- `apps/ios/Meeshy/Features/Main/Services/StickerPackStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/StickerPackService.swift`

</details>

### Un lien recu sans compte n'est pas perdu: l'ecran de connexion le dit et l'ouvre apres la connexion

`cmp-pending-link` · Android : **absente** · P1 · effort S

PendingLinkNotice: bandeau sur l'ecran de connexion 'Connectez-vous : le contenu qu'on vous a partage s'ouvrira juste apres.' (icone lien, fond indigo 500 a l'opacite subtle, coins md, transition haut + fondu) visible tant qu'un deep link de contenu (post, story, reel, profil, communaute...) est en attente (DeepLinkRouter.pendingDeepLink) ; le lien s'ouvre des que la racine se monte apres la connexion. PendingReferralStore + ReferralCode: le code d'invitation (aff_... campagne ou ref_... compte, forme validee: non vide, <= 128 car., sans blanc, casse conservee) est memorise entre l'ouverture du lien et l'inscription et expire apres 30 jours (miroir du web); un code mal forme n'efface rien; oublie une fois le compte cree.

Écarts :
- Conserver le deep link de contenu recu sans session (post, story, reel, profil, communaute...) et l'ouvrir apres connexion/inscription; Android ne gere que le magic link et le join invite via LaunchRouter.
- Bandeau PendingLinkNotice sur l'ecran de connexion/inscription (libelle auth.pendingLink.notice, icone lien, fond indigo 500 subtle, coins md, hauteur mini 44, animation haut + fondu), visible tant qu'un lien est en attente.
- ReferralCode (normalisation: trim, non vide, <= 128, sans blanc) + PendingReferralStore (DataStore, TTL 30 jours, remember / recall / forget) ; transmettre le code au registre a l'inscription; miroir de apps/web/src/lib/view/referral-code.ts.
- Lire le code des liens d'invitation (aff_ / ref_) a l'ouverture du lien et le conserver malgre les relancements; effacer apres creation de compte.

Rendu : Bandeau pleine largeur sous le titre de connexion, icone lien 'link' indigo, texte footnote medium sur 2 lignes, marges 16, ne bloque pas le formulaire.

Transposition Android : DeepLinkRouter.pendingDeepLink => etat tenu par LaunchRouter/ViewModel de session; UserDefaults + Date => DataStore + horloge injectee.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Auth/Views/PendingLinkNotice.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/PendingReferralStore.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Affiliate.kt`

### La touche Retour envoie le message, sans jamais envoyer par accident ni ressusciter le texte

`cmp-return-key` · Android : **absente** · P1 · effort S

ComposerReturnKey : le champ est un TextField multi-ligne dont Retour insere un saut de ligne; la regle observe la mutation du texte et envoie si le texte finit par un saut de ligne, grandi d'EXACTEMENT un caractere (un collage multi-lignes ne part jamais), avec libelle submitLabel send / return suivant la limite des 7 mots (au-dela de 7 mots Retour passe a la ligne) et teinte de l'accent; Maj+Retour / Option+Retour (clavier materiel) force le saut de ligne. L'appui long pour saut de ligne est refuse (frontiere du processus du clavier). ComposerFieldAfterSend decide ce que vaut le champ apres envoi selon QUI a envoye (hote via onCustomSend : on suit sa source; barre : on suit l'etat local) pour ne jamais ressusciter ni effacer a tort le texte; ComposerSendAlignment aligne le texte local sur l'hote vide pour fermer la course text -> textBinding differee d'un tour de rendu.

Écarts :
- Configurer le champ avec KeyboardOptions(imeAction = ImeAction.Send) + KeyboardActions(onSend) tant que le texte fait 7 mots ou moins; au-dela de 7 mots, ImeAction.Default (saut de ligne) et libelle de touche coherent.
- Garde anti-envoi par collage : n'envoyer que si le texte a grandi d'un seul caractere finissant par saut de ligne (retirer le saut avant envoi); jamais sur un collage multi-ligne.
- Clavier materiel (tablette / Chromebook) : Maj+Entree = saut de ligne, Entree = envoi (onPreviewKeyEvent).
- Apres envoi, appliquer ComposerFieldAfterSend : champ vide seulement si l'envoi a eu lieu (l'envoi peut etre refuse : lecture seule, mode lent, contenu vide), sans resurrection du texte par une synchro differee entre etat local et ViewModel.
- Teinter la touche d'envoi du clavier avec l'accent de la conversation si la plateforme le permet (sinon le bouton d'envoi du champ).

Rendu : Pas de rendu propre; le libelle de la touche suit la fonction (Envoyer / Retour). Pas de fenetre double-retour (retarderait chaque envoi).

Transposition Android : submitLabel(.send)/onSubmit => ImeAction.Send + KeyboardActions; onKeyPress(Maj+Retour) => Modifier.onPreviewKeyEvent; tint de la touche => non controlable sous Android, remplace par le bouton d'envoi accentue.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerReturnKey.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerFieldAfterSend.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerSendAlignment.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### Un lien de connexion me demande de confirmer le compte, et il est lie a l'appareil qui l'a demande

`cmp-signin-confirm` · Android : **absente** · P1 · effort M

LinkSignInConfirmationSheet: quand la passerelle repond requiresConfirmation, la feuille 'Se connecter en tant que @x ?' montre l'avatar (charge SEULEMENT depuis Meeshy, sinon initiales: une URL libre pisterait celui qui ouvre le lien), le nom (omis s'il repete le @), l'adresse masquee par la passerelle, un message de remplacement quand un AUTRE compte est ouvert (AccountReplacementAlert), et pour une REVENDICATION d'adresse la phrase 'Cette adresse sera rattachee a @x et retiree de tout autre compte Meeshy.' avec bouton 'Rattacher l'adresse et se connecter'; deux reponses (connecter / refuser). LinkDeviceBinding: a la demande du lien l'appareil tire un secret (32 octets aleatoires, base64url sans remplissage), le garde dans le trousseau (ThisDeviceOnly) et n'envoie que son EMPREINTE SHA-256 hexa; a l'ouverture il presente le secret; un lien ouvert ailleurs ou forge par un tiers n'ouvre aucune session sans confirmation (login CSRF). Un apercu DEBUG existe (argument de lancement, etats fresh / replacing / claim).

Écarts :
- Android valide le magic link directement (loginWithMagicLink, apres deconnexion de tout compte ouvert) sans liaison appareil ni etape de confirmation; ajouter la liaison: secret de 32 octets (SecureRandom, base64url) stocke dans EncryptedSharedPreferences/Keystore (non sauvegarde, appareil seul), empreinte SHA-256 hexa envoyee a la demande du lien, secret presente a la consommation.
- Gerer la reponse requiresConfirmation de la passerelle (id, username, displayName, avatar, maskedEmail, intent signIn | claimEmail) et afficher la feuille de confirmation avant d'ouvrir la session.
- Feuille 'Se connecter en tant que @x ?': avatar Meeshy-only (sinon initiales), nom omis s'il repete le pseudo, adresse masquee, phrase de revendication et libelle du bouton adaptes a l'intention, avertissement de remplacement si un autre compte est ouvert.
- Eviter de deconnecter le compte courant AVANT la confirmation (aujourd'hui logout puis validation): confirmer d'abord, remplacer ensuite (AccountReplacementAlert).
- Oubli du secret une fois la preuve rendue definitive (forget) ; tolerance si le secret ne peut pas etre genere (la demande part sans liaison, le lien passera par la confirmation).
- Libelles localises signInLink.deviceConfirm.*; apercu de dev equivalent (preview Compose / ecran de debug) pour les trois etats.

Rendu : Feuille basse coins xxl, avatar rond en tete, titre 'Se connecter en tant que @x ?', message secondaire, adresse masquee en monospace discret, boutons plein largeur (confirmer en accent, refuser en texte); phrase de revendication en avertissement.

Transposition Android : Keychain ThisDeviceOnly => EncryptedSharedPreferences (MasterKey Keystore) avec exclusion du backup; SecRandomCopyBytes => SecureRandom; Sheet => ModalBottomSheet.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Auth/LinkSignInConfirmationSheet.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/LinkDeviceBinding.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/MagicLinkValidateViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/MagicLinkValidateScreen.kt`

### J'envoie un sticker comme un message a part entiere, l'image part tout de suite et le texte du sticker reste lisible par tous

`cmp-sticker-send` · Android : **absente** · P1 · effort M

StickerSendPipeline : la bulle optimiste apparait AVANT l'encodage (l'image est deja rasterisee) ; le PNG est encode et ecrit hors du fil principal ; le nom de fichier derive de l'id de la piece (stable, l'URL locale sert de fileUrl a la bulle et au cache d'apercu) ; un sticker ANIME (GIF / WebP d'un pack cinematique) part tel quel avec son type, jamais reencode en PNG. StickerAltText : alt ET caption portent le texte que le sticker montre (titre du sticker Mee, sinon les valeurs des emplacements DANS L'ORDRE du gabarit, sinon l'emoji) ; nil et jamais chaine vide ; ordre stable meme pour un gabarit inconnu (cles triees). StickerOptimisticAttachment construit la piece optimiste (poids 0, dimensions image x echelle, vignette = URL locale) avec alt / caption. La feuille se ferme au choix (un sticker est un message, pas une decoration), les gabarits partent contournes de blanc.

Écarts :
- Modele MessageSticker (templateId, slots, animation, emoji) dans :core:model et champ sticker du message cote Android (ApiMessage / LocalMessage); aujourd'hui les stickers n'existent que comme elements de canvas de story.
- Feuille de stickers de conversation (equivalent MeeshyStickerSheet) qui ENVOIE le choix comme message, se ferme au choix, gabarits avec contour blanc (diesCut), porte de boutique 'vitrine'.
- Pipeline d'envoi : bulle optimiste immediate avec bitmap deja rasterise (cache d'apercu amorce sous la cle de l'URL locale), puis encodage PNG + ecriture fichier + upload sur Dispatchers.IO; nom de fichier derive de l'id de la piece.
- Sticker anime (GIF / WebP de pack) envoye TEL QUEL avec son mime type (OriginalFile), extension selon le mime (gif, webp, png par defaut).
- Texte alternatif / legende du sticker : titre du Mee, sinon valeurs des emplacements dans l'ordre du gabarit (tableau, jamais le dictionnaire), sinon emoji ; null et jamais ''.
- Piece optimiste (StickerOptimisticAttachment) : poids 0, largeur / hauteur = image x densite, vignette = fichier local, alt = caption = texte du sticker.
- Chaine upload -> envoi via l'outbox existante (UPLOAD_MEDIA + SEND_MESSAGE) avec les metadonnees sticker dans le payload.

Rendu : Sticker rendu SANS chrome de bulle (comme un emoji libre), 512 pt a 2x en source, avec bande de reactions a l'accent du recu; la bulle optimiste montre l'image locale instantanement.

Transposition Android : UIImage.pngData => Bitmap.compress(PNG) sur Dispatchers.IO; GIF/WebP animes => Coil AnimatedImageDecoder (API 28+); alt => contentDescription.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StickerSendPipeline.swift`
- `apps/ios/Meeshy/Features/Main/Services/StickerAltText.swift`
- `apps/ios/Meeshy/Features/Main/Views/StickerOptimisticAttachment.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

### Je mets des mots en gras, italique, souligne ou barre depuis une barre qui apparait a la selection

`cmp-format-bar` · Android : **absente** · P2 · effort S

Des qu'un mot est selectionne dans le champ (iOS 18+, TextSelection), ComposerFormatBar paraît au-dessus du champ : quatre boutons B / I / U / S de 44x36 dessines dans leur style (gras heavy, italique serif, souligne, barre) avec haptique light et libelles composer.format.*. ComposerTextFormat.toggle pose ou retire l'emphase avec les memes marqueurs que le web (** * __ ~~) : selection vide => paire posee, curseur entre les deux; selection deja encadree (dedans ou autour) => retrait; sinon encadrement sans les blancs de bord; l'italique ne se confond pas avec le gras (parite des etoiles); positions bornees pour les graphemes soudes. Le curseur suit l'ecriture (caretFollowsWrite).

Écarts :
- Porter ComposerTextFormat (toggle pur : marqueurs **, *, __, ~~; selection vide / deja encadree / encadrement sans blancs; garde de parite des etoiles; bornage) en Kotlin dans :core:model avec tests, miroir de packages/shared/utils/text-format.ts.
- Barre de format affichee au-dessus du champ des qu'une selection non vide existe (TextFieldValue.selection), 4 boutons 44x36 dp dessines dans leur style, fond accent a l'opacite light, coins sm.
- Repositionner le curseur / la selection apres chaque bascule (caretFollowsWrite), en comptant en graphemes (BreakIterator / Character) et non en unites UTF-16.
- Libelles localises composer.format.bar / bold / italic / underline / strikethrough, haptique light.
- Le rendu cote lecture existe deja (MessageTextParser, RichMessageText) : verifier que les marqueurs __ et ~~ sont bien rendus souligne / barre.

Rendu : Boutons B (gras heavy), I (serif italique), U (souligne), S (barre), 44x36, fond accent 0,15-light, rayon sm, espacement 6; la barre disparait quand la selection se vide.

Transposition Android : TextSelection (iOS 18+) => TextFieldValue.selection (toutes versions Android, pas de plancher de version); bandeau => Row au-dessus du champ avec AnimatedVisibility.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerFormatBar.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerTextFormat.swift`
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Format.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageTextParser.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/RichMessageText.kt`

### Chaque cadre dit ou il est utilisable et la loi d'usage refuse ce qui n'a pas le droit d'etre propose

`cmp-frame-law` · Android : **absente** · P2 · effort M

Loi d'usage des cadres (FrameUsage, miroir de packages/shared/types/frame-usage.ts) : un cadre DECLARE son usage; chaque surface demande FrameUsageLaw.canUseFrame avant de le proposer et chaque puce affiche describeFrameUsage. Surfaces libres (appel video en direct, photo, video, avatar, banniere), moments du jeu (tier, meesh, treasury, flame, day, level-100), cadres de capture d'appel (capture \| live), cadres de rang (uniquement pour le rang indique), de prestige, de succes (par rarete); un cadre libre ne s'applique pas aux succes; un cadre appel-video peut servir la capture hors appel mais un cadre capture seule ne sert PAS les appels. GloryFramePlacement : cible d'un cadre (rang + division, palier, edition de Meesh first/silver/gold/prism, palier du tresor, seuil de Flamme, realisation du jour, rarete d'un succes) qui doit dire la meme chose que l'usage. FramePackModels : pack de cadres servi par /packs/glory-frame, fichiers adresses par contenu (PackAssetRef/File), noms localises, collections, contrat (couches, emplacements de texte, oiseaux), chaines d'un pack par langue. Vecteurs partages rejoues (le TS a raison en cas de divergence).

Écarts :
- Porter FrameUsage / FrameUsageLaw (canUseFrame, describeFrameUsage) en Kotlin pur dans :core:model avec les vecteurs packages/shared/design/packs/frame-usage-vectors.json rejoues en test.
- Porter GloryFrameAppliesTo / MeeshFrameEdition / fits(usage) (placement dans la loi) et le decodage de la cible.
- Porter FramePack (nom localise, collection, version, contrat) et PackAssetRef/File (nom = empreinte SHA-256), GloryFramePackContract (couches, emplacements de texte, oiseaux) et PackStringKey pour les chaines par langue.
- Les cadres de bannieres (banner-frame, centre transparent) et les contours d'avatar (avatar-ring) partagent ces modeles : prevoir l'extension.
- Consommation cote UI (peintre de cadres, cadres d'appel video, capture) hors de cette feature mais dependante de la loi.

Rendu : Sans rendu propre; fournit les libelles d'usage affiches sur chaque puce / vignette de cadre ('Rang Or II', 'Appels video', etc.).

Transposition Android : Codable enums associes => sealed interfaces kotlinx.serialization avec serializer polymorphe tolerant; vecteurs JSON partages lus depuis packages/shared (copie de test generee).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Packs/FramePackModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/FrameUsage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Packs/GloryFramePlacement.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/FrameLuminance.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DarkFramePolicy.kt`

### Je reponds a une photo ou une video pendant que je la regarde en galerie, sans fermer la galerie

`cmp-gallery-reply` · Android : **absente** · P2 · effort M

GalleryReplyComposerLayer : depuis la galerie media d'une conversation, un tap sur Repondre fait monter une barre MediaReplyComposerBar liee a la piece courante; le brouillon est PAR PIECE (deux photos d'un lot se commentent separement), la langue de composition est retenue a travers le montage / demontage, l'envoi (texte, langue) part vers la piece, la barre redescend pour rendre le media entier et la galerie NE SE REFERME PAS; un second tap sur Repondre la remonte; gestion de l'inset clavier (MediaReplyKeyboardInset, effets d'envoi / d'annulation), transition bas + fondu, haptique light.

Écarts :
- Barre de reponse a une piece dans la galerie (citation de la piece : vignette + auteur), brouillon par piece, langue retenue, envoi (texte, langue) qui cree un message en reponse ancre sur la piece (quotedAttachment).
- Galerie qui reste ouverte apres envoi ou annulation; la barre redescend et le media est rendu entier.
- Gestion de l'IME : le clavier d'abord, la barre ensuite (envoi / annulation) sans saut de mise en page.
- Action Repondre dans l'overlay media qui ouvre / ferme la barre; transition bas + fondu; haptique.

Rendu : Barre en bas de la galerie sur fond sombre translucide, vignette de la piece citee a gauche du champ, bouton envoyer accent; le media reste visible au-dessus.

Transposition Android : MediaReplyComposerBar => variante de la barre universelle en mode 'reponse media' (placeholder, pas de pieces) dans l'overlay de la galerie; inset clavier => imePadding + WindowInsetsAnimation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+ReplyComposer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### Je regle la precision de mon partage de position et le style de carte une fois pour toutes

`cmp-location-prefs` · Android : **absente** · P2 · effort S

LocationSharingSettingsSection/Sheet : section 'Precision du partage' (Exacte, Autour ~100 m, Quartier ~1 km, Ville ~10 km, avec icones scope / circle.dashed / house / building.2) et section 'Type de carte' (Plan, Hybride, Satellite), libelles cote app, titre de feuille 'Partage de position', bouton Termine, ouverte depuis le selecteur de lieu. LocationSharingPreferencesStore persiste la preference (cle me.meeshy.locationSharingPreferences, defauts .exact en repli sur toute lecture echouee) avec debounce de 100 ms et publication.

Écarts :
- Modele LocationPrecision (exact, around ~100 m, neighborhood ~1 km, city ~10 km) avec fonction pure qui degrade les coordonnees (arrondi/bruit) et modele SharedMapStyle (standard, hybrid, imagery) dans :core:model.
- Magasin de preferences (DataStore) avec lecture tolerante (defaut .exact si illisible ou valeur d'enum inconnue d'une version future) et ecriture debouncee 100 ms.
- Section 'Precision du partage' et 'Type de carte' (cartes selectables avec icone + libelle) integrables dans Reglages > Confidentialite et dans la feuille 'Partage de position' ouverte depuis le selecteur de lieu.
- Libelles localises location.precision.* (titre + badge court) et location.map-style.*, titre de lieu sans redite nom / adresse (placeTitle).

Rendu : Liste de cartes selectables 2 lignes (titre + sous-titre) avec icone et coche, accent de la conversation; feuille avec titre centre et bouton Termine a droite.

Transposition Android : UserDefaults JSON => DataStore Preferences/Proto; Section de reglages => item de l'ecran de parametres de confidentialite.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationSharingPreferencesStore.swift`

</details>

### Je depose ou colle une image, une video, un son ou un document directement dans le composeur

`cmp-paste-drop` · Android : **absente** · P2 · effort M

ComposerPasteInterceptor installe un UITextPasteDelegate sur la UITextView du champ : le champ ACCEPTE une image, video, son ou document colles (sans quoi Coller n'apparait pas) et l'OBJET part en piece jointe via onIngest (jamais son chemin); un texte qui ferait depasser la limite d'un message part en .txt et le champ reste tel quel (decision pure PastedContentRouter). ComposerDropTargetModifier couvre toute la bande (champ, barre d'outils, bandeaux, tiroir) : indication 'Deposer ici', copie de chaque element dans le conteneur de l'app (l'hote en devient proprietaire), collage d'URL file://, toast partage 'Impossible d'importer : <liste>' avec nom 'element sans nom' en repli. Sert iPad / macOS / Share de fichiers.

Écarts :
- Accepter le contenu riche colle dans le champ (Modifier.contentReceiver / ReceiveContentListener : images, GIF et stickers du clavier Gboard, video, audio, documents) et l'envoyer comme pieces; aujourd'hui seule l'heuristique de gros texte existe.
- Cible de depot sur toute la bande du composeur (Modifier.dragAndDropTarget, ClipDescription multi-types) avec indication visuelle 'Deposer ici' (composer.drop.hint) pour les tablettes / ChromeOS / multi-fenetre.
- Routeur de collage pur (PastedContentRouter) : texte court => champ; texte > limite d'un message => piece .txt; objet binaire => piece; testable en JVM.
- Copier chaque element depose / colle dans le cache de l'app (le URI temporaire s'eteint) avant ingestion; en cas d'echec, toast 'Impossible d'importer : <noms>' (composer.ingest.failed) et nom de repli 'element sans nom'.
- Nettoyage des fichiers copies quand la piece est retiree ou envoyee.

Rendu : Surcouche translucide aux coins du composeur avec libelle 'Deposer ici' centre, bordure accent en pointille sur la zone de depot; toast d'erreur style feedback global.

Transposition Android : UITextPasteDelegate => ReceiveContentListener (Compose 1.7 contentReceiver); onDrop NSItemProvider => dragAndDropTarget + DragAndDropEvent; security-scoped URL => ContentResolver + takePersistableUriPermission / copie en cache.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerPasteInterceptor.swift`
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Drop.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LargePasteDetector.kt`

### Je touche un sticker recu pour le voir en grand, l'ajouter a mes stickers ou ouvrir son pack

`cmp-sticker-sheet` · Android : **absente** · P2 · effort M

StickerSheetView : feuille avec le sticker en 220 pt (artwork), ligne 'Envoye par <nom>' (StickerSheetLinks.senderLine), ligne favori pour ce qu'on POSSEDE deja (emoji, gabarit du catalogue, Mee) ou ligne bibliotheque ('Dans mes stickers' avec coche, ou 'Ajouter a mes stickers' pour un sticker libre savable), ligne 'Voir le pack' qui ouvre la vitrine centree sur le pack (deep link packShop domaine sticker + slug extrait de pack.<slug>.<cle>), detents medium / large, haptique light; le modificateur StickerSheetOnTap pose le tap sur la bulle sans manger les autres gestes.

Écarts :
- Fiche du sticker recu (ModalBottomSheet medium / large) avec l'artwork 220 dp, ligne 'Envoye par X', ligne favori ou bibliotheque selon que le sticker est deja possede, ligne 'Voir le pack'.
- Parser pur du templateId de pack (pack.<slug>.<cle>) et lien profond vers la boutique (domaine sticker, pack cible) ; ne rien offrir pour un emoji, un gabarit du catalogue ou une image libre.
- Bibliotheque 'Mes stickers' : ajout d'un sticker recu savable, etat 'Dans mes stickers', favoris (StickerUsageStore).
- Tap sur le sticker de la bulle ouvre la fiche sans entrer en conflit avec appui long (menu) et double tap.
- Libelles message.sticker.inLibrary / add / viewPack / from, accessibilite du sticker (BubbleSticker.accessibilityLabel).

Rendu : Artwork centre 220 dp, ligne sous le titre en subhead secondaire, lignes d'action a hauteur 44+ avec icone et libelle, coche verte (icone seule en vert, texte a l'encre du theme pour le contraste).

Transposition Android : sheet detents => ModalBottomSheet; DeepLink.packShop => route de navigation Compose (meeshy://settings/packs?domaine=sticker&pack=...).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StickerSheetView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StickerSheetLinks.swift`

</details>

### Mon texte part dessine dans un cadre a mots choisi parmi dix, d'un appui long sur Envoyer

`cmp-text-sticker` · Android : **absente** · P2 · effort M

Appui long sur le bouton d'envoi (texte present, hote capable) : feuille de dix cadres a mots rendus avec le texte tape (grille 3 colonnes, vignettes de 104 pt), classes par usage (ComposerTextStickerChoice : recents > favoris > premier du catalogue de la famille text, filtre sur les gabarits qui ont un emplacement texte), choisir ENVOIE directement un message-sticker et vide le champ, usage note dans StickerUsageStore, haptique medium. La pastille dynamique fait tourner les cadres (#6537) en commencant par celui qu'emploie l'auteur.

Écarts :
- Porter le catalogue de gabarits de stickers (StickerTemplateCatalog, famille text, emplacements typés) dans :core:model; Android n'a qu'un StickerCatalog d'emojis cote stories.
- Rendu d'un gabarit avec ses emplacements remplis (StickerTemplatePreview / StickerSlotFiller) via Compose Canvas, reutilisable en vignette 104 dp et en PNG a l'envoi.
- Feuille des cadres (ModalBottomSheet) : grille 3 colonnes espacee de 10, ordre par rotation (recents > favoris > catalogue), choix = envoi immediat + fermeture, sans etape de confirmation.
- Magasin d'usage des stickers (recents, favoris, noteUse) persiste (DataStore) pour classer et faire tourner la pastille.
- Action d'accessibilite 'Parcourir les cadres' sur le bouton d'envoi; condition de visibilite = hote capable d'envoyer un sticker ET texte present ET hors edition.

Rendu : Vignettes carrees de 104 dp, espacement 10, titre de navigation, aucun menu systeme (un menu ne montre que du texte, ici il faut comparer des dessins).

Transposition Android : LazyVGrid + sheet => LazyVerticalGrid dans ModalBottomSheet; rendu des gabarits => Canvas Compose; UserDefaults => DataStore.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerTextStickerChoice.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerTextStickerSheet.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`

### La barre de composition est une plaque de verre unique qui s'adapte au contexte et se replie d'un geste

`cmp-bar-shell` · Android : **divergente** · P0 · effort L

UniversalComposerBar est le composeur reutilisable de tout le produit (conversation, commentaires, reponse a un media, canvas de story, apercu de notification). Il porte : deux styles (sombre translucide / clair themé), un ComposerMode qui fixe placeholder, longueur max et les portes visibles (voix, pieces, ephemere, vue unique, effets), un etat MINIMISE (bouton flottant Ecrire / Micro) deplie au toucher et replie par balayage vers le bas (seuil 80 pt, resistance 0,5, poignee), UNE plaque de verre qui contient bandeaux reponse/edition, pieces en attente, rails, barre d'outils et rangee de saisie, l'accent et le degrade secondaire de la conversation (la protection armee teinte toute la barre), un repli (chevron) fourni par l'hote et pose dans l'angle de la plaque, des callbacks d'interaction (pause des stories), un declencheur de focus, une liaison de texte externe (edition) et une mise en cache de brouillon par contexte. L'etat du composeur de conversation (pickers, lieu en attente, langue, reponse, edition, plafond de 199 medias, feuille stickers, panneau emoji) est un struct dedie, et le dock empile suggestions de mention, zone du composeur et panneau emoji sur un sol commun (pastille de synchro). Le texte et le vumetre vivent dans des hotes isoles (ComposerTextHost, ComposerAudioHost) pour que seule la barre se reevalue a la frappe ou a 20 Hz pendant un vocal; la chaine de vues est faite de frontieres nominales (anti-debordement de pile).

Écarts :
- Remplacer la Surface + Row Material (OutlinedTextField, boutons icone en ligne) par la plaque de verre iOS : un seul conteneur arrondi translucide qui enveloppe bandeaux, zone de pieces, rails, barre d'outils et rangee de saisie; champ en capsule sans contour Material, qui grandit de 1 a 5 lignes (Android plafonne a 4).
- Introduire un modele de mode partage (equivalent de ComposerMode) : placeholder, maxLength, showVoice, showAttachment, showEphemeral, showViewOnce, showEffects, showPermanentEffects, afin que commentaires, story et reponse media reutilisent la meme barre au lieu d'un composeur par ecran (aujourd'hui ChatComposer est specifique au chat).
- Etat minimise : bouton flottant Ecrire / Micro, transition scale 0,6 + fondu, depliage au tap (ou demarrage direct de l'enregistrement via le micro), repli par glissement vers le bas (seuil 80 dp, facteur 0,5, ressort), callbacks onExpand / onCollapse.
- Accent et degrade secondaire de la conversation sur le bouton d'envoi et le focus du champ; teinte de protection dominante (ephemere rouge d'alerte > vue unique > flou) appliquee a la capsule entiere, voir cmp-protections.
- Slot de repli (chevron) fourni par l'hote (ComposerFoldControl), pose dans l'angle haut droit de la plaque, survivant ou non a l'enregistrement; compatible avec une feuille d'hote qui compte sa hauteur (le panneau cede).
- Callbacks d'hote : onAnyInteraction (pause des stories), onHasContentChange, focusTrigger, liaison de texte externe pour l'edition, injection d'emoji depuis l'exterieur, pieces externes.
- Isoler la frappe et le vumetre dans des etats Compose distincts (StateFlow dedie / derivedStateOf) pour ne pas recomposer tout l'ecran de chat a chaque caractere ou a 20 Hz pendant un vocal; mesurer avec le profileur de recomposition.
- Etat du composeur de conversation structure (pickers ouverts, lieu en attente, reponse, edition, plafond 199 medias, feuille stickers, panneau emoji) au lieu de booleens disperses dans ChatUiState.
- Dock : suggestions de mention + zone du composeur + panneau emoji empiles sur un sol commun, panneau emoji qui glisse a la place du clavier (hauteur 260) sans decalage de la rangee de saisie; sol sur lequel s'accroche la pastille de synchronisation et qui suit le clavier.
- Barre transparente sans fond propre (directive 2026-08-26) avec zone de degagement bas calculee selon clavier / panneau (ComposerBottomClearance) et insets de la fenetre (multi-fenetre, pliables).

Rendu : Capsule de saisie hauteur mini 44 dp, coins continus (MeeshyRadius.lg), bordure degradee accent -> indigo 600 au focus (opacite 0,55 / 0,45), teinte protection 0,25 clair / 0,35 sombre; plaque de verre avec bordure hairline; espacements MeeshySpacing (xs 4, sm 8, md 12, lg 16); ressorts response 0,3-0,35 / damping 0,8; mouvement reduit => fondu simple; typographie callout pour le champ, caption2 monospace pour le compteur; toutes les couleurs conversationnelles viennent de accentColor, jamais en dur.

Transposition Android : SwiftUI + Liquid Glass => Compose Surface translucide (RenderEffect blur sur API 31+, repli couleur opaque theme en dessous) dans une Column; DragGesture => Modifier.draggable / anchoredDraggable; focus => FocusRequester; ViewModifier nominaux => composables separes; ComposerTextHost => etat de texte isole (TextFieldState).

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift`
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerModels.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ComposerBarSlot.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ConversationComposerLayers.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ComposerDock.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationComposerState.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerSendGate.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerAttachmentPolicy.kt`

### Je vois a quel message je reponds ou que je modifie, avec apercu riche de la piece citee

`cmp-banners` · Android : **divergente** · P1 · effort M

ConversationView+ComposerBanners : bandeau de REPONSE riche — barre d'accent, titre (Vous \| nom \| Humeur pour une reponse a une humeur / story), texte cite, vignette de la piece citee (image / video), badge audio, tuile de lieu, repli d'icone par type, bouton Annuler la reponse, libelle parle pour VoiceOver ('Reponse a X : <apercu>'), flux de citation (ComposerQuotedFlow); bandeau d'EDITION (titre 'Modifier le message' + bouton Annuler la modification, libelle 'Modification du message en cours') avec beginEdit / submitEdit / cancelEdit qui pousse le texte du message dans le champ et l'applique. Les bandeaux vivent DANS le verre. La reponse porte aussi la contagion de protection du message cite (voir cmp-protections). Le plateau de pieces en attente est monte via une rangee custom.

Écarts :
- Bandeau de reponse riche : barre verticale d'accent, titre auteur (Vous / nom / Humeur), apercu de texte sur 1-2 lignes, vignette de la piece citee, badge audio, tuile de lieu et icones de repli par type; aujourd'hui une seule ligne 'En reponse a <label>' avec une icone.
- Reponse a une story ou une humeur : titre 'Humeur', emoji d'humeur, citation bornee au DM de l'auteur (admission).
- Texte parle pour TalkBack : 'Reponse a X : <apercu>' (QuotedReplyPresentation.spokenPreview).
- Bandeau d'edition au style iOS (titre + annuler + libelle d'etat 'Modification en cours') et logique beginEdit / submitEdit / cancelEdit alignee (la sauvegarde existe; verifier le visuel).
- Les bandeaux doivent etre rendus DANS la plaque de verre de la barre, au-dessus du plateau de pieces, avec transition d'apparition (spring 0,3/0,8).
- Brancher la contagion de protection a l'armement de la reponse (voir cmp-protections).

Rendu : Bandeau a barre d'accent gauche de 3-4 dp, fond accent translucide, titre label semi-bold accent, apercu footnote textSecondary 2 lignes, vignette 36-44 dp coins sm a droite, croix d'annulation 44 dp.

Transposition Android : QuotedReplyPresentation => presentateur pur Kotlin; vignettes => Coil; Voiceover => TalkBack semantics.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ComposerBanners.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/SwipeToReply.kt`

### La camera in-app s'arme vite, bascule d'objectif sans ecran noir et rend la prise comme dans le viseur

`cmp-camera-infra` · Android : **divergente** · P1 · effort M

Infrastructure de capture du composeur (la vue ComposerViewfinder est dans une autre partie): ComposerCaptureSessionQueue = UNE file serie pour configurer / lancer / arreter la session (le dernier voeu gagne: une rafale arme / desarme / arme finit en marche), ComposerCameraPreparedInputs = l'entree de l'AUTRE objectif creee a l'avance et gardee apres une bascule (aller-retour sans rien recreer), ComposerCameraInputSwap = bascule atomique (la nouvelle entree nait d'abord, retrait + ajout dans UNE configuration, un refus remet l'ancienne: jamais d'aperçu noir ni de position qui ment), ComposerCameraSwitchRule = couverture floue de la derniere trame (largeur 270, flou 18, maintien 0,2 s, attente de trame 0,12 s, le bouton se tait pendant la bascule, reaffirmation du zoom), ComposerCaptureCamera = commandes (bascule, zoom affiche, torche, photo + flash, mise au point en un point avec glissement, attente que l'objectif puisse prendre, prise precedente en attente) et suivi de la lumiere (torche rallumee au retour arriere, ecran allume en avant avec flash), ComposerCaptureMirrorRule = photo et video de la camera avant en miroir ET debout, trames brutes du look en direct non miroitees, ComposerCameraFirstFrameClock = mesure armement -> premiere trame en ms (prechauffee vs a froid).

Écarts :
- Android lance les intents SYSTEME (ACTION_IMAGE_CAPTURE / ACTION_VIDEO_CAPTURE) apres un choix Photo / Video; l'iso demande un viseur in-app (CameraX) integre au composeur.
- Module de capture CameraX: session pre-chauffee a l'ouverture du composeur, executeur serie unique pour bind / unbind (dernier voeu gagne).
- Bascule d'objectif sans ecran noir: garder l'entree opposee prete, bascule atomique (refus => ancienne en place, position publiee juste), couverture floue de la derniere trame (270 px, flou 18) maintenue 0,2 s, bouton desactive pendant la bascule.
- Commandes: zoom (facteur affiche, plage), torche (niveau), flash photo, mise au point/exposition au toucher (smooth pendant une prise), attente que l'objectif puisse prendre (timeout), prise precedente en attente.
- Suivi de la lumiere a la bascule: torche eteinte en avant / rallumee en arriere pendant une video, ecran blanc de remplissage en avant quand le flash est actif.
- Regle de miroir: photo et video avant en miroir et debout, trames d'analyse du look en direct brutes; rotation portrait selon la sortie.
- Horloge de premiere trame (log 'camera first frame: N ms (prewarmed|cold)') pour mesurer l'armement.

Rendu : Viseur plein ecran sous le composeur, bascule avec fondu flou de la derniere trame, zoom par pincement, mise au point par tap avec reticule, bouton de bascule qui se grise pendant la transition; miroir naturel en camera avant.

Transposition Android : AVCaptureSession => CameraX (ProcessCameraProvider, Preview, ImageCapture, VideoCapture); DispatchQueue serie => Executor mono-thread; torche/flash => CameraControl.enableTorch / ImageCapture.flashMode; permission => CAMERA (deja declaree).

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerCameraFirstFrameClock.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerCameraInputSwap.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerCameraPreparedInputs.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerCameraSwitch.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerCaptureCamera.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerCaptureMirrorRule.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerCaptureSessionQueue.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerCameraChooser.kt`

### Un lien dans un message affiche une carte compacte (site, titre, description, vignette) qui se charge sans bloquer

`cmp-link-preview` · Android : **divergente** · P1 · effort S

LinkPreviewCard : carte compacte sous la bulle (reutilisable en citation, messages favoris) a barre d'accent gauche de 3 pt, nom du site en majuscules, titre sur 2 lignes, description sur 2 lignes, vignette a droite, hauteur mini 64, trois etats (squelette, carte, carte statique d'echec : jamais de spinner infini), tap = ouverture dans une feuille Safari, accessibilite en phrase ('Apercu du lien : site. titre. description', trait lien, hint 'Ouvre le lien dans le navigateur'). LinkPreviewStore resout les metadonnees OpenGraph par URL canonique (suppression des traceurs) avec cache memoire + disque (7 jours, evince au chargement), cache negatif de 30 min pour les echecs, deduplication des requetes, purge au logout (confidentialite). LinkPreviewFetcher : timeout 4 s, corps max 512 Ko, UA Meeshy, OpenGraph / Twitter card / repli HTML, inFlight partage.

Écarts :
- Mise en page: Android rend une carte VERTICALE (bande image 140 dp au-dessus du corps, largeur max 280) quand iOS rend une carte compacte HORIZONTALE (barre d'accent gauche 3 dp, texte, vignette a droite, hauteur mini 64); aligner.
- Etat squelette dedie (shimmer) pendant le chargement et carte statique d'echec; Android affiche une puce 'chip' tamisee (Loading) ou le lien nu: verifier le rendu des trois etats.
- Cache persistant sur disque avec TTL de 7 jours (evince au chargement); le cache Android est en memoire seulement (perdu a chaque lancement).
- Delai reseau 4 s (Android 8 s) pour que le lien lent ne retarde pas le fil.
- Reutiliser la carte dans les citations de reponse et les messages favoris sans cabler dix couches (composant autonome qui resout lui-meme son URL).
- Libelles a11y: linkpreview.a11y.label / label-failed / label-loading / hint, trait lien; ouverture dans un onglet in-app (Custom Tab, deja present).

Rendu : Carte coins sm, fond teinte accent 0,10, barre d'accent 3 dp, nom de site caption semi-bold uppercase tracking 0,3 en accent, titre subhead semi-bold 2 lignes, description footnote 2 lignes, vignette carre a droite; couleurs indigo50/indigo950 selon le theme.

Transposition Android : SFSafariViewController => Chrome Custom Tabs (ChatLinkOpener existant); URLSession ephemeral => OkHttp; cache disque => fichier JSON ou Room; NSDataDetector => Linkify / regex.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/LinkPreviewCard.swift`
- `apps/ios/Meeshy/Features/Main/Services/LinkPreviewStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/LinkPreviewFetcher.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewCard.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewCache.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewFetcher.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewParser.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewState.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatLinkOpener.kt`

### Un envoi refuse pour de bon n'est pas retente en boucle, et je sais pourquoi

`cmp-send-failure` · Android : **divergente** · P1 · effort M

SendFailureRecovery classe un echec d'envoi: refus DEFINITIF (retenter ne reussira jamais) => ni repli socket ni outbox: restriction d'ecriture qui ferme le composeur (la bulle est retiree, withdraw), mode lent 'nouvel arrivant' (la bulle est tenue, holdSlowMode, NewcomerSlowMode), destinataire bloque (toast 'Vous ne pouvez pas ecrire a cet utilisateur.', enregistre l'echec); sinon, si eligible, REPLI SOCKET: le coordinateur reemet UNE fois avec le MEME clientMessageId (dedup passerelle), pose pendingServerIds avant l'ack, enregistre tempId -> serverId pour que message:new se reconcilie sans doublon; sinon enregistre l'echec et met en file durable (outbox). Journalisation de perf ios.send.fail / .ack / .fail.blocked avec durees.

Écarts :
- Architecture differente: Android est outbox-first (bulle optimiste + ligne SEND_MESSAGE, puis WorkManager) alors qu'iOS tente le POST REST direct puis repli socket puis outbox. Decider si l'on garde l'outbox-first (robuste) mais alors porter l'effet utilisateur de chaque branche ci-dessous.
- Classifier les refus DEFINITIFS (restriction d'ecriture, mode lent arrivant, destinataire bloque, 4xx non retentables) dans le drainer: marquer la ligne EXHAUSTED tout de suite, sans backoff, au lieu de la retenter jusqu'a epuisement.
- Restriction d'ecriture qui ferme le composeur: retirer la bulle optimiste et basculer la zone du composeur en lecture seule/fermee (ConversationWriteRestriction).
- Mode lent 'nouvel arrivant': tenir la bulle (envoi differe jusqu'a la fin du delai) plutot que la faire echouer; aujourd'hui SlowModePolicy bloque seulement les nouveaux envois cote composeur.
- Destinataire bloque: toast 'Vous ne pouvez pas ecrire a cet utilisateur.' (conversation.send.blocked) et bulle en echec.
- Repli socket (message:send / send-with-attachments) avec le MEME clientMessageId quand le REST echoue, enregistrement tempId -> serverId avant l'ack pour reconcilier message:new sans doublon.
- Mesures de perf equivalentes (duree jusqu'a l'ack / l'echec, transport) pour le suivi des p95 d'envoi.

Rendu : Toast d'erreur global (FeedbackToastManager) pour le blocage; bulle en echec avec action reessayer; composeur remplace par une zone explicative en cas de restriction.

Transposition Android : SendRecoveryHooks (closures) => interface de callbacks ou Flow d'evenements d'envoi; Logger.messages => Timber/Log avec tags perf.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/SendFailureRecovery.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDrainer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/SlowModePolicy.kt`

### La barre d'outils du composeur regroupe protections, effets, sticker, langue et portes photo/camera dans un bandeau defilant

`cmp-toolbar-strip` · Android : **divergente** · P1 · effort M

Au-dessus du champ, un bandeau horizontal defilant (ComposerToolbarStrip, avec fondu de depassement) porte dans l'ordre : bascule ephemere, bascule flou, bascule vue unique, bouton effets, porte Sticker (seulement si l'hote sait l'ouvrir), puis la pastille de langue d'ecriture EPINGLEE (derniere de la bande, ne passe jamais sous les portes), et une bande de fin non defilante : compteur n/max (apparait a 80 % de la limite, rouge a la limite, monospace), porte Photos, porte Camera et chevron de repli. La pastille de langue est un menu (drapeau seul une fois replie, nom natif dans la liste), libelle d'accessibilite Langue du message. Les portes de fin sont construites hors du chemin de rendu (AsyncRenderRow). Le bandeau disparait pendant l'enregistrement.

Écarts :
- Creer le bandeau d'outils au-dessus du champ (LazyRow/Row scrollable) au lieu des icones en ligne a gauche du champ; ajouter l'indicateur de depassement (fondu degrade au bord) quand le contenu defile encore.
- Epingler la pastille de langue a la fin de la zone defilante (jamais masquee par les portes de droite) et la rendre en drapeau seul une fois repliee, avec liste drapeau + nom natif (LanguageData.quickTranslationLanguages) dans le menu.
- Compteur de caracteres n/max visible des 80 % de maxLength, police monospace caption2 semi-bold, rouge a la limite, transition d'opacite.
- Portes de fin : Photos et Camera en boutons verre 30 dp (cible 44 dp) a droite du bandeau, puis chevron de repli; construction hors recomposition lourde.
- Porte Sticker conditionnelle (rendue seulement si l'ecran sait ouvrir la feuille de stickers) a la place de l'ancien indicateur de ton passif; retirer l'emoji de sentiment du champ si l'on veut l'iso (iOS l'a remplace par le sticker).
- Le bandeau (hors repli) se masque pendant l'enregistrement vocal et le repli reste seul a droite si l'hote le demande.
- Libelles localises : composer.attach.photo, composer.attach.camera, composer.attach.sticker, a11y.composer.language (+ hint Choisir la langue d'envoi du message).

Rendu : Boutons de 30 dp de glyphe dans cibles de 44 dp, capsules a coins pleins, etat actif = capsule teintee (opacite 0,15, bordure 0,3), icones SF => Material Symbols equivalents (camera, photo library, sticker); compteur monospace; haptique light sur chaque bouton.

Transposition Android : ScrollView horizontale => LazyRow; Menu SwiftUI => DropdownMenu / ModalBottomSheet; glassDoorButton => IconButton 44 dp avec fond translucide.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Toolbar.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### Le bouton + ouvre un panneau de pieces a la hauteur du clavier, avec mes medias recents et l'acces a toute la photothèque

`cmp-attach-panel` · Android : **partielle** · P0 · effort L

UniversalComposerBar+Attachments : le bouton + bascule entre clavier et panneau de pieces qui prend la place du clavier a la MEME hauteur (derniere hauteur mesuree, bornee par ComposerPanelHeightLaw : max 55 % de la fenetre, reserve de 180 pt pour la barre, plancher des medias recents 460 pt en largeur regular / 324 en compacte, trame de clavier degeneree ou flottante ignoree). Le panneau porte un carrousel de tuiles en degrade qui apparaissent en cascade (Photos, Fichier, Contact, Position, Vocal, Emoji; chacune conditionnee a un hote qui sait l'ouvrir), une poignee de 4 pt (glisser vers le haut >= 44 pt ou vitesse projetee => etire le panneau et ouvre toute la photothèque avec presélection des assets deja coches; vers le bas => ferme; haptique medium; action d'accessibilite 'Ouvrir toute la photothèque'), une bande de 40 medias recents (tap = ajoute, appui long = apercu / Editer, multi-selection, assets deja ajoutes marques et non repris), et la fermeture par glisser vers le bas de la barre. Exclusivite entre clavier, carrousel et panneau emoji de l'hote (onShowAttachments / onAttachmentsVisibilityChange pour suspendre une story). Taper le champ ramene le clavier.

Écarts :
- Remplacer la rangee de tuiles posee au-dessus du champ par un panneau qui prend la place de l'IME a la meme hauteur (derniere hauteur WindowInsets.ime memorisee), borne par une loi de hauteur testee : 55 % de la fenetre, reserve 180 dp, plancher 324 dp compact / 460 dp large, trame degeneree ignoree, multi-fenetre / pliables.
- Tuile Contact (ContactsContract picker -> vCard en piece jointe) et tuile Position (aujourd'hui desactivee faute de producteur de champ location).
- Animation d'apparition en cascade des tuiles (delai 0,04 s * index) et libelles composer.attach.photo / file / contact / location / voice / emoji; ordre iOS fige.
- Bande de medias recents : grille des 40 derniers medias (MediaStore + permission READ_MEDIA_IMAGES/VIDEO ou Photo Picker), multi-selection, marque des assets deja ajoutes, appui long => apercu plein ecran + 'Editer', raccourci poignee vers le selecteur systeme avec presélection (EXTRA_PICK_IMAGES_MAX / Photo Picker ordonne).
- Poignee du panneau : loi pure ComposerPanelHandleLaw (seuils -44/+44 dp, prediction x2) => ouvrir la photothèque complete (etirement du panneau + selecteur systeme), fermer, ignorer; haptique medium; action d'accessibilite nommee.
- Fermer par balayage vers le bas de la barre; taper le champ ramene le clavier; exclusivite clavier / panneau / emoji avec onShowAttachments et onAttachmentsVisibilityChange.
- Conditionner chaque tuile au droit d'envoyer ET a l'existence d'un gestionnaire (loi 4 : pas de porte sans effet) : le pre-filtrage par ComposerAffordances existe deja, a conserver (avantage Android).

Rendu : Tuiles rondes en degrade de couleur propre (Photos 9B59B6, Camera F8B500, Fichier 45B7D1, Position 2ECC71, Vocal E74C3C, Emoji FF9F43 deja fournies par ComposerAttachmentLadder), libelle sous la tuile, poignee capsule de 4 dp, fond verre; mouvement reduit => pas de cascade.

Transposition Android : PhotosPicker (preselection par itemIdentifier) => Photo Picker (ActivityResultContracts.PickMultipleVisualMedia) + MediaStore pour la bande; fileImporter => OpenMultipleDocuments; CNContactPicker => ContactsContract.Contacts + construction vCard; hauteur clavier => WindowInsets.ime + WindowInsetsAnimation.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerPanelHandleLaw.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerPanelHeightLaw.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentLadder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerCameraChooser.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerAttachmentPolicy.kt`

### Chaque bulle se rend selon sa nature: standard, sticker sans bulle, vue unique, supprimee, ephemere, notice d'appel ou d'arrivee

`cmp-bubble` · Android : **partielle** · P0 · effort M

ThemedMessageBubble est l'orchestrateur: il construit UN BubbleContent par re-evaluation (texte traduit par le Prisme, audios traduits, langue secondaire, edition, destinataires) puis dispatche par nature: systeme (notice d'appel avec rappel, notice d'arrivee qui ouvre le profil, notice generique), supprime (tombeau; vide si expire), vue unique scellee/ouverte (puce, ouverture au toucher, haptique medium, brulure), ephemere expire (rien), sticker (feuille BubbleSticker SANS chrome de bulle), standard (BubbleStandardLayout). Couches communes: bouclier de capture (captureShield: vue unique ou flamme rendues dans la couche securisee), brulure d'ephemere (ephemeralBurn), filigrane flamme-oeil a cheval sur le bord d'attaque (afterReadWatermark), retouche vue unique, duree de revelation du flou lue des preferences, sinon annulee a la disparition, effets poses sur la bulle (pas sur la rangee), ouverture du profil de l'expediteur, couleur de la bulle recue = accent de l'expediteur melange a l'indigo, double tap (QuickReactionDoubleTap) reserve aux bulles standard pour les cellules media. Rendu Equatable pour ne pas re-rendre les cellules de collection.

Écarts :
- Mise en page sticker SANS chrome de bulle (comme un emoji libre) avec bande de reactions a l'accent du recu: absente (pas de modele sticker).
- Bouclier de capture: appliquer FLAG_SECURE / ecran securise (ou masque) sur les contenus vue unique et ephemere 'flamme' ; aucune occurrence de FLAG_SECURE dans l'app.
- Notices systeme dediees: notice d'appel avec rappel (BubbleCallNoticeView, onCallBack) et notice d'arrivee (BubbleJoinNoticeView, ouverture du profil) en plus de la notice generique deja presente.
- Puce de vue unique scellee/ouverte (etat sealed/opened, hint, ouverture au toucher avec haptique medium, consommation serveur onConsumeViewOnce) ; Android a un tombeau 'brule' mais verifier la puce scellee interactive.
- Filigrane flamme-oeil a cheval sur le bord d'attaque des messages 'detruit apres lecture' et animation de brulure (ephemeralBurn) a l'expiration.
- Retouche de vue unique (viewOnceRetouch) : declenchement de la consommation apres retouche.
- Duree de revelation du flou lue des preferences (applyBlurRevealDurationFromPrefs), annulee a la disparition.
- Couleur de bulle recue = melange de l'accent de l'expediteur et de l'indigo de marque (DynamicColorGenerator.blendTwo), identique pour la bulle et le strip de reactions d'un sticker.
- Egalite/stabilite des cellules: @Immutable BubbleContent + cle stable pour eviter les recompositions (equivalent EquatableMessageBubble).

Rendu : Bulle standard coins arrondis avec accent de l'expediteur, sticker nu, tombeau italique muted, chip de vue unique avec glyphe, flamme-oeil en filigrane, animation de consumation (scale + fondu) avant retrait de la ligne; mouvement reduit => fondu.

Transposition Android : captureShield => WindowManager.LayoutParams.FLAG_SECURE (par fenetre) ou Modifier de masquage; contextMenu natif => menu overlay existant (MessageOverlay*); Equatable => @Stable data class.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleRenderKindPresenter.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageEffectModifiers.kt`

### Mes actions hors ligne (messages, commentaires, posts, reponses, conversations, signalements) partent dans l'ordre des que le reseau revient

`cmp-outbox` · Android : **partielle** · P0 · effort L

OutboxDispatcher route chaque OutboxRecord vers le bon service : sendMessage, editMessage, deleteMessage, sendReaction, blockUser/unblockUser, sendFriendRequest/respondFriendRequest, updateProfile, markAsRead, markStoryViewed, consumeAfterRead, reportContentCapture, reportAttachmentStatus, createConversation, updateConversation, updateSettings, createPost, toggleLikePost, createComment, deleteComment, toggleLikeComment, repostPost, publishStory/repostStory. Garanties : reconciliation durable d'un envoi reussi (serverAck applique par le dispatcher meme sans ViewModel vivant, ligne optimiste -> .sent, PendingIdRecord, retrait des doublons du cache, evenement retrySucceeded), echec de rejeu inscrit sur la ligne (la bulle passe en echec au lieu de rester 'envoi' jusqu'a l'epuisement; reports et annulations ne sont pas des echecs), partage multi-destinataires qui COPIE les pieces de l'origine (copyAttachmentsFromMessageId, attente typee OutboxDeferralError sans consommer de tentative, borne OutboxFlusher.fanoutOriginWaitTimeout, origine serveur connue court-circuite GRDB), rejeu audio multi-pistes, charge corrompue acceptee puis supprimee, commentaires avec medias rejoues (CommentPublisher signe par jeton verifie contre l'auteur de la ligne; une ligne sans auteur s'epuise sans rien envoyer ni supprimer; fichiers dans le dossier de l'auteur; aucune piece disparue; jamais d'envoi ampute), marquage lu avec liste plafonnee, corps de requete dedies (CreatePostBody, CreateCommentBody avec ancre de media cite, UpdateProfile*, MarkAsReadBody), nettoyage best-effort des fichiers temporaires.

Écarts :
- Types de mutation iOS absents du OutboxKind Android (22 types) : RESPOND_FRIEND_REQUEST, MARK_STORY_VIEWED, CONSUME_AFTER_READ, REPORT_CONTENT_CAPTURE, REPORT_ATTACHMENT_STATUS, CREATE_CONVERSATION, UPDATE_CONVERSATION, CREATE_POST, CREATE_COMMENT, DELETE_COMMENT, TOGGLE_LIKE_COMMENT, REPOST_POST, REPOST_STORY; ajouter payloads, senders, rollbacks optimistes et lanes.
- Commentaires avec medias rejoues hors ligne: fichiers sous un dossier d'attente par cmid, un televersement grave par piece, rejeu des seules pieces manquantes, plan CommentMediaReplay; refus si la piece a disparu (422, jamais d'envoi ampute).
- Garde de propriete: la ligne porte son auteur; un rejeu pendant une bascule de compte ne part pas et ne s'efface pas (attend son auteur, sans consommer de budget); relance manuelle donne un auteur.
- Partage multi-destinataires: copyAttachmentsFromMessageId + attente typee de l'origine (deferral qui ne consomme pas de tentative, borne de temps), origine serveur connue court-circuitant la resolution locale.
- Reconciliation durable d'un envoi reussi dans le dispatcher (ack serveur applique meme sans ViewModel; ligne optimiste -> envoye + enregistrement id temp -> serveur) pour eviter le doublon apres rechargement a froid; echec de rejeu inscrit sur la bulle (visible 'non envoye').
- Rejeu audio multi-pistes (localAudioPaths + ancien localAudioPath) et canal socket send-with-attachments qui ne transmet pas la copie de pieces (echouer fort plutot que d'envoyer un message vide de sa promesse).
- Charge corrompue acceptee puis supprimee par le flusher (jamais boucle infinie); nettoyage best-effort des fichiers temporaires apres rejeu.
- Corps de requete dedies et testes (CreatePostBody avec ancre de media cite, CreateCommentBody, MarkAsReadBody avec liste plafonnee et langues cadrees, UpdateProfile avatar / champs).
- Android a des types que iOS n'a pas (PIN_MESSAGE, BOOKMARK_POST, MARK_UNREAD, UPDATE_PRIVACY_SETTINGS): les conserver, ne pas les retirer pour l'iso.

Rendu : Indicateurs visibles: horloge d'envoi / sablier hors ligne sur la bulle, 'non envoye' avec reessayer, pastille de synchronisation en attente (fleches circulaires) sur la ligne de conversation.

Transposition Android : GRDB + OutboxFlusher => Room (OutboxEntity) + OutboxDrainer / OutboxFlushWorker (WorkManager); OfflineQueue publishOutcome => SharedFlow d'OutboxOutcome; fichiers pending-media => filesDir/pending-media/<cmid>/.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift`
- `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher+Messages.swift`
- `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher+Comments.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDrainer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDependencyKey.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxPayloadGrafts.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Un envoi avec plusieurs pieces part en bulles ordonnees, la legende sur les photos, la reponse sur la premiere

`cmp-send-plan` · Android : **partielle** · P0 · effort M

MultiAttachmentSendPlanner decide comment texte + pieces se decoupent a l'envoi : pieces groupees par categorie (audio vs visuel image\|video\|fichier\|lieu), une bulle par groupe non vide, dans l'ordre de premiere apparition; le texte est la LEGENDE du groupe visuel (5 photos + legende = UN message) et, sans groupe visuel, reste un message a part envoye en dernier; la reference de reponse / transfert n'est portee que par le PREMIER message. OutgoingMediaGroup construit une fois les groupes envoyables (tempId stables partages entre phase optimiste et phase d'upload, amorcage du cache d'images hors thread principal, ThumbHash pour video / audio). OutgoingAttachmentRules : popup de consentement vocal (une fois par session, audio present + consentement manquant), lecture des octets hors MainActor, motif d'echec avec conseil 'Reduisez le nombre de pieces jointes (N en cours)' quand N > 1, type de bulle optimiste lu sur toutes les pieces (un document n'est pas une photo). SendEligibility : envoyable des qu'il y a texte non vide, une piece OU un lieu. SendPlaceTileLaw : le lieu part, la tuile se retire a l'instant et se restaure seulement si l'envoi echoue (sauf lieu choisi entre-temps). ComposerSendRelation : relation du message = reponse a story (avec reference) \| reponse a message (avec ancre de piece citee) \| aucune.

Écarts :
- Planificateur pur : grouper audio / visuel (image, video, fichier, lieu), legende sur le groupe visuel, texte seul en dernier sans visuel, reponse portee par le premier message uniquement; Android envoie une piece = un message, sans regroupement ni legende.
- Groupes envoyables avec tempId stables partages par la bulle optimiste et l'upload (la chaine upload -> graft -> send existe pour un fichier : l'etendre a N pieces par bulle avec un graft par piece), amorcage du cache d'images hors thread principal.
- Envoi optimiste de la bulle multi-pieces avec vignettes locales (ThumbHash / miniature) avant la fin de l'upload; type de bulle optimiste deduit de toutes les pieces.
- Consentement vocal a l'envoi d'audio (popup une fois par session de conversation; le refus envoie l'audio sans transcription / traduction) : regle shouldPromptVoiceConsent.
- Message d'echec d'upload avec conseil de reduire le nombre de pieces quand plusieurs sont en jeu (libelle localise).
- SendEligibility : accepter lieu seul comme contenu porteur (texte | pieces | lieu) dans les deux portes (composeur et transport).
- Lieu en attente : retrait immediat de la tuile a l'envoi et restauration sur echec seulement (SendPlaceTileLaw), sans ecraser un lieu choisi pendant l'aller-retour.
- Relation d'envoi (reponse a story avec reference | reponse a message avec ancre de piece citee | aucune) transportee dans le payload de l'outbox.
- Concurrence d'upload bornee (TusUploadManager.maxConcurrent) : groupe entier confie a la file, pas une boucle sequentielle.

Rendu : Bulle sortante avec grille de miniatures + legende et horloge d'envoi; aucune bulle supplementaire pour 199 photos; messages d'echec dans la bulle avec action reessayer.

Transposition Android : Task.detached(priority: .utility) => withContext(Dispatchers.IO); amorce de cache d'image => Coil MemoryCache + DiskCache; TUS => TusUploadRepository existant.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MultiAttachmentSendPlanner.swift`
- `apps/ios/Meeshy/Features/Main/Views/OutgoingMediaGroup.swift`
- `apps/ios/Meeshy/Features/Main/Views/OutgoingAttachmentRules.swift`
- `apps/ios/Meeshy/Features/Main/Services/SendEligibility.swift`
- `apps/ios/Meeshy/Features/Main/Views/SendPlaceTileLaw.swift`
- `apps/ios/Meeshy/Features/Main/Views/ComposerSendRelation.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadSender.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerSendGate.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxPayloadGrafts.kt`

### Tant que rien n'est ecrit, l'emplacement d'envoi propose des emojis rapides; un appui long sur Envoyer ouvre les cadres a mots

`cmp-action-slot` · Android : **partielle** · P1 · effort M

L'emplacement de 44 pt a droite du champ change de contenu selon ComposerActionSlot.resolve : une rangee d'emojis rapides (les 20 derniers utilises, 3,5 visibles, defilable a la main avec glissement prioritaire des 8 pt, repli au debut, garde d'arrivee anti double-tap) quand il n'y a ni texte, ni piece, ni enregistrement, ni edition; sinon le bouton d'envoi rond (degrade accent, coche en edition orange, rebond a l'envoi, invisible mais montée si rien a envoyer). La bascule se fait par une transition tourbillon (grossissement + rotation). Un tap sur un emoji l'ENVOIE directement via handleSend (texte pose puis vide, source unique), l'enregistre dans l'historique, un appui long (0,45 s) ouvre la feuille complete des emojis. Un appui long sur le bouton d'envoi (texte present, hote capable) ouvre la feuille des cadres a mots. EmojiUsageTracker compte l'usage avec un ordre deterministe (compte, rang canonique, emoji). handleSend orchestre l'envoi (onCustomSend / onSendMessage / onSend), la detection de langue (seuil 0,86) et l'expansion / minimisation.

Écarts :
- Rangee d'emojis rapides dans l'emplacement d'envoi quand le champ est vide : 20 derniers emojis (historique recent), 3,5 cellules visibles, defilement horizontal avec glissement, retour au debut, cible >= 44 dp (decision ouverte), fond verre arrondi.
- Tap sur un emoji rapide = envoi direct (via la meme porte que le bouton d'envoi, jamais une branche dupliquee) + enregistrement d'usage; appui long 0,45 s = feuille complete d'emojis qui envoie le choix; garde d'arrivee (QuickEmojiArrivalGuard) contre le second tap d'un double tap sur Envoyer.
- Bouton d'envoi toujours monte (44 dp) mais invisible s'il n'y a rien a envoyer; degrade accent / secondaire de la conversation; version edition en coche orange; rebond (sendBounce) et transition tourbillon (scale + rotation) lors des bascules; label d'accessibilite 'Envoyer le message' / 'Enregistrer les modifications' + hint.
- Regle pure ComposerActionSlot.resolve (quickEmoji / send) et limite des sept mots (textStickerWordLimit) portees en Kotlin testable.
- Appui long sur Envoyer avec texte => ouverture de la feuille des cadres a mots (voir cmp-text-sticker), avec action d'accessibilite nommee 'Parcourir les cadres'.
- Compteur d'usage d'emojis deterministe (EmojiUsageTracker) deja en partie couvert par EmojiUsageStore/Ranker : verifier le tie-break (compte desc, rang canonique, chaine) et l'historique des 20 derniers utilises (RecentEmojiHistory).
- Detection de langue de saisie en direct avec seuil de confiance 0,86 (ComposerLanguageResolver) et force a l'etat verrouille: verifier que ComposerLanguageState applique le meme seuil et la meme priorite (override manuel > detecte).
- Le bouton micro de la rangee de droite (affiche quand le champ est vide) disparait au profit des emojis rapides : decider de l'emplacement du micro (iOS le met DANS le champ a gauche, masque au focus).

Rendu : Rangee de hauteur 44 dp, largeur = 3 cellules de 32 dp + 2 gouttieres de 3 dp, cellule = (largeur - 3*3)/3,5, glyphe = 75 % de la cellule, cadre verre coins lg continus; bouton d'envoi 44 dp circulaire, ombre douce; haptiques: light a l'envoi, medium a l'ouverture de la feuille par appui long.

Transposition Android : LongPressGesture + simultaneousGesture => combinedClickable(onLongClick) + haptique; tourbillon => AnimatedContent avec scale/rotation; UserDefaults => DataStore.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerActionSlot.swift`
- `apps/ios/Meeshy/Features/Main/Components/QuickEmojiGrid.swift`
- `apps/ios/Meeshy/Features/Main/Components/EmojiUsageTracker.swift`
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Send.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/EmojiUsageStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EmojiUsageRanker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ComposerLanguageState.kt`

### Pendant un appel, une pilule en haut de l'app me ramene a l'appel et me laisse couper le micro ou raccrocher

`cmp-call-pill` · Android : **partielle** · P1 · effort M

FloatingCallPillView: banniere pleine largeur indigo en APLAT au sommet de l'app quand l'appel est actif en mode PiP (hors plein ecran et hors PiP systeme), visuel du participant (44), nom, ligne d'etat (sonnerie / connexion / reconnexion en ambre ou rouge, duree verte une fois etablie avec glyphe de signal code couleur, qui ouvre la feuille 'Qualite' de l'appel), boutons Couper/Reactiver le micro et Raccrocher, tap = retour au plein ecran, glissement horizontal (seuil 10, vitesse) = reduire en bulle repliee (bord et fraction verticale memorises), transition de barre du haut (descend du haut, sort par le haut, fondu si mouvement reduit), calage sous la bande du haut ou le dernier mini-lecteur, accessibilite complete (action 'Reduire en bulle', duree annoncee).

Écarts :
- Ajouter les boutons Couper/Reactiver le micro et Raccrocher dans la pilule (aujourd'hui seulement tap pour rouvrir l'ecran d'appel).
- Ligne d'etat: glyphe de signal (qualite) + duree verte; tap sur la ligne ouvre la feuille 'Qualite' (callQualityDetailSheet).
- Fond en APLAT indigo (blanc sur indigo, contraste verifie) au lieu du backgroundSecondary actuel et avatar rond de 44 dp (image du participant, pas seulement initiale).
- Glissement horizontal pour reduire la pilule en bulle repliee (bord et position memorises), actions d'accessibilite 'Reduire en bulle', 'Touchez pour revenir a l'appel'.
- Transition d'entree/sortie de la barre du haut (descend du haut, repart par le haut; fondu si mouvement reduit) et calage sous la barre systeme / le mini-lecteur.
- Se masquer pendant le PiP systeme et le plein ecran d'appel (deja partiellement via CallPillPresenter.shouldShow).

Rendu : Banniere pleine largeur hauteur mini 64, fond indigo aplat, texte blanc (nom subheadline medium, duree caption monospaced), signal vert, boutons ronds 40 dp (micro neutre, raccrocher rouge erreur avec degrade), haptique light/error/success selon l'action.

Transposition Android : FloatingCallPillView => overlay Compose dans MeeshyApp (CallPill); PiP systeme => enterPictureInPictureMode; bulle repliee => overlay SYSTEM_ALERT_WINDOW optionnel ou bulle interne.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPill.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallUiState.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### La ligne de conversation montre chaleur d'activite, brouillon, frappe, synchro en attente et appel en cours

`cmp-conv-row` · Android : **partielle** · P1 · effort S

ThemedConversationRow (liste): fond en degrade 'chaleur' (activite recente, non-lus, membres, epingle -> opacite du degrade accent -> secondaire), avatar dynamique avec anneau de story, presence, humeur (badge tappable), lignes de tags avec calcul de largeur et '+N', type d'une conversation non directe, emoji de reaction favori, indicateur de synchro en attente (fleches circulaires) quand une mutation par utilisateur est dans l'outbox, horodatage relatif qui ticke chaque minute (RelativeTimestampText), apercu du dernier message resolu par le Prisme (langue du lecteur), 'Brouillon : ...' a la place de l'apercu, indicateur de frappe nominatif, 'le pair a l'ecran ouvert' (isPeerHere), bouton 'Rejoindre' l'appel en cours, selection iPad (barre d'accent), menu contextuel (infos, voir le profil, creer un lien de partage), a11y en phrase (muet, epingle, synchro en attente). Egalite (Equatable) pour ne pas re-rendre la ligne.

Écarts :
- Indicateur de synchro en attente (fleches circulaires) quand une mutation de la conversation (epingle, muet, archive, section) est encore dans l'outbox: absent de ConversationRow.
- Pastille 'le pair a l'ecran de CETTE conversation' (isPeerHere) et bouton 'Rejoindre' l'appel en cours dans la ligne d'apercu: non trouves cote Android.
- Verifier la parite fine: formule de chaleur (0,40 recence + 0,35 non-lus + 0,15 membres + 0,10 epingle; opacites 0,03+0,10h sombre / 0,02+0,08h clair), tags avec '+N' reserve 32 dp, type badge, emoji de reaction, horodatage vivant chaque minute, selection tablette (barre d'accent).
- Menu contextuel: ajouter 'Creer un lien de partage' et 'Voir le profil' / 'Infos conversation' alignes sur iOS (ConversationContextMenu a verifier).
- Libelles d'accessibilite en phrase (conversation avec X, apercu, muet, epingle, synchro en attente).

Rendu : Rangee avec avatar + colonne (tags, nom 2 lignes, heure, apercu), badge non-lu, fond chaleur pastel -> vibrant, rayon md qui se resserre avec le balayage, bordure accent 0,45 quand selectionnee.

Transposition Android : Equatable + .equatable() => @Stable / Immutable + key dans LazyColumn; swipeProgress => SwipeToDismissBox (deja present).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationActivityHeat.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationPreviewMessages.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTypingRoster.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRowTime.kt`

### Un brouillon reste intact quand on quitte la conversation, tue l'app ou change de compte

`cmp-draft-persistence` · Android : **partielle** · P1 · effort M

Le texte du composeur vit dans un modele isole (ConversationComposerTextModel) dont la persistance suit une politique produit : ecriture immediate en fin de mot (espace, retour ligne) ou champ vide, fenetre de 400 ms en milieu de mot, flush immediat a la sortie de vue, a la perte de focus clavier (appel, feuille) et au passage en arriere-plan. DraftStore sauvegarde par utilisateur et par conversation (cle meeshy_draft_<userId>_<convId>, migration des cles legacy qui fuyaient entre comptes) : texte, reponse armee aplatie (id, auteur, apercu, isMe, auteur de story, emoji d'humeur), langue choisie, drapeaux d'effets, flou, duree ephemere et references de pieces jointes COPIEES dans un dossier durable (le tmp d'iOS est purgeable), avec identifiant d'asset photothèque. Un brouillon est vide si aucun contenu; seul le texte non vide leve le badge Brouillon de la liste. Purge des brouillons expires, flux d'evenements consomme par la liste (re-tri) et projection DraftSummary.

Écarts :
- Persister les pieces jointes du brouillon : copier les fichiers dans un dossier durable par conversation (filesDir/drafts/<convId>) et stocker des references (id, nom stocke, nom d'origine, mime, taille, duree, largeur/hauteur, couleur de vignette, id MediaStore); restaurer la zone d'attente au retour. Android ne garde aujourd'hui que texte + replyToId + effets + langue.
- Etendre ConversationDraft aux champs de reponse restituables sans le message en memoire : replyAuthorName, replyPreviewText, replyIsMe, replyStoryAuthorId, replyMoodEmoji, avec admission (une citation de story/humeur ne se restaure que dans le DM de son auteur).
- Aligner la politique d'ecriture sur iOS : immediate en fin de mot ou champ vide, debounce 400 ms en milieu de mot, flush sur onStop / perte de focus IME / ProcessLifecycle background; verifier que DraftAutosave ne declenche pas d'ecriture DataStore par caractere et ne re-trie pas la liste a chaque frappe.
- Cle de stockage prefixee par userId (multi-comptes) avec migration, en plus du clearAll au teardown de session deja present.
- Purge des brouillons expires (purgeExpired) et flux de mutations; projection DraftSummary (previewText, updatedAt) calculee une fois pour la ligne de liste.
- Regle isEffectivelyEmpty complete (texte vide + aucune reponse + aucun effet + pas de flou + pas de duree + pas de piece) alignee sur le seul texte non vide pour le badge de liste (hasDraftText).

Rendu : Pas d'ecran propre : le brouillon apparait dans la ligne de conversation (libelle Brouillon : + apercu, tri flottant) et se restaure a l'ouverture, texte, citation et pieces exactement comme laisses, sans animation parasite.

Transposition Android : UserDefaults/fichiers => DataStore (Preferences ou Proto) + filesDir pour les pieces durables; Combine publisher => Flow; scenePhase / disappear => LifecycleEventObserver ON_STOP.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationComposerTextModel.swift`
- `apps/ios/Meeshy/Features/Main/Services/DraftStore.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/ConversationDraftStore.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/DraftAutosave.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationDraft.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DraftAwareOrdering.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DraftDiscard.kt`

### Je trouve n'importe quel emoji par categorie, recherche ou recents, depuis le composeur comme depuis une reaction

`cmp-emoji-picker` · Android : **partielle** · P1 · effort M

EmojiPickerView/EmojiPickerSheet : grille avec 10 categories (Recents, Smileys, Personnes, Animaux, Nourriture, Activites, Voyages, Objets, Symboles, Drapeaux), champ de recherche (bouton Effacer), section Reactions rapides et Utilises recemment, gestionnaire de donnees d'emojis (EmojiDataManager) charge hors du fil principal, style de bouton a echelle. Embarquable dans une feuille detents ou dans le panneau emoji a la place du clavier (EmojiKeyboardPanel). Sert l'insertion dans le champ, l'envoi direct d'un emoji rapide et le choix de reaction.

Écarts :
- Passer de 6 categories (reactions, faces, gestures, hearts, animals, objects) aux 10 categories iOS (ajouter Nourriture, Activites, Voyages, Symboles, Drapeaux, Recents) avec les libelles emoji.category.*.
- Ajouter la recherche (champ + bouton Effacer la recherche, filtrage par nom / mots-cles localises).
- Sections Reactions rapides et Utilises recemment en tete de grille, alimentees par l'historique d'usage.
- Panneau emoji inline a la place du clavier (hauteur 260, transition bas -> haut), en plus de la feuille modale actuelle, pour une bascule clavier <-> emoji sans saut.
- Chargement du catalogue complet hors du thread principal (equivalent EmojiDataManager) pour ne pas bloquer le premier affichage; grille virtualisee.
- Animation d'echelle au tap (EmojiScaleButtonStyle) et haptique.

Rendu : Grille adaptative de cellules 44 dp, en-tetes de section avec icone (face.smiling / clock), onglets de categories en pastilles, champ de recherche arrondi avec icone loupe, couleurs theme (textSecondary pour titres de section).

Transposition Android : Sheet presentationDetents => ModalBottomSheet (partial + expanded); EmojiKeyboardPanel => panneau Compose sous la barre en alternance avec WindowInsets.ime; recherche => TextField + filtre.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EmojiCatalog.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerEmojiInsertion.kt`

### Le fil de messages suit exactement le clavier, et un menu de message ferme le clavier au lieu de s'ouvrir dessous

`cmp-keyboard` · Android : **partielle** · P1 · effort S

KeyboardTransition decode les notifications clavier (frame d'arrivee, duree, courbe) en un type valeur; ConversationView.keyboardHeight et listInsetTransition gardent la reserve basse du fil (contentInset) sur la MEME courbe que le clavier PENDANT le mouvement seulement (isLive + liveSlack 0,1 s), puis plus (sinon la croissance du composeur clavier baisse traine de 0,25 s); le pas de safeAreaBottom (~34 pt) n'est pas lu reactivement. KeyboardTransitionObserver (ViewModifier) observe keyboardWillShow / WillHide. MessageMenuKeyboard.dismiss ferme le premier repondeur (quel que soit le champ qui detient le clavier) quand un menu de message s'ouvre, sur les deux chemins (geste custom < iOS 26 et contextMenu natif >= iOS 26).

Écarts :
- Le composeur utilise imePadding() (suit l'IME de facon native), mais la liste de messages doit suivre la meme animation: utiliser WindowInsetsAnimationCompat / WindowInsets.ime animee et ajuster le padding bas de la LazyColumn image par image, sans animation doublee apres le mouvement.
- Garder la hauteur du composeur gelee pendant l'animation de clavier (mesure du composeur) pour que le fil ne saute pas lors des bascules clavier <-> panneau de pieces.
- Fermer le clavier (FocusManager.clearFocus + SoftwareKeyboardController.hide) quand un menu / overlay de message s'ouvre, depuis un seul point appele par tous les chemins du menu.
- Fallback de duree 250 ms quand la plateforme n'annonce pas la sienne; support clavier materiel.

Rendu : Mouvement continu et synchrone: la barre et le bas du fil glissent ensemble sur la courbe du clavier, sans a-coup ni retard.

Transposition Android : UIResponder.keyboardWillChangeFrame => WindowInsetsAnimationCompat.Callback / ViewCompat.setWindowInsetsAnimationCallback; resignFirstResponder => LocalFocusManager.clearFocus().

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/KeyboardTransition.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Keyboard.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageMenuKeyboard.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`

### Un lieu partage s'affiche en carte avec apercu de la carte, nom, adresse et ouverture dans Plans

`cmp-location-card` · Android : **partielle** · P1 · effort M

LocationMessageView : carte de 260 pt (hauteur de carte 150 + barre d'info 44, geometrie FIXE connue avant la vignette et les donnees pour que la cellule soit mesuree une fois), vignette de carte STATIQUE (MKMapSnapshotter, region ~500 m, apparence clair / sombre, cache NSCache de 64 entrees par lat/lon/taille/apparence), barre d'info avec titre (nom du lieu ou 'Position partagee') + sous-titre adresse + bouton 'Ouvrir dans Plans', tap = plein ecran, action d'accessibilite 'Ouvrir dans Plans'. Rendu unique pour message, post et commentaire (SharedPlace) ; init historique par coordonnees brutes conservee.

Écarts :
- Android rend un chip compact (icone epingle + nom / coordonnees) : remplacer par la carte iOS 260 dp x (150 + 44) avec vignette de carte statique.
- Fournisseur de vignette de carte statique (Static Maps / MapLibre snapshot) injectable, region ~500 m, clair / sombre, cache LRU de 64 entrees par (lat, lon, taille, apparence); geometrie fixe pour ne pas faire sauter la liste.
- Barre d'info 44 dp : titre (nom ou 'Position partagee'), sous-titre adresse, bouton Ouvrir dans Plans (intent geo: / Google Maps), sans redite nom / adresse.
- Tap = ecran plein ecran de la carte (LocationFullscreenView) + action d'accessibilite 'Ouvrir dans Plans' et libelle 'Position : <nom>'; hint 'Touchez pour ouvrir la carte en plein ecran'.
- Meme composant pour messages, posts et commentaires (SharedPlace) : aujourd'hui FeedPostLocationSticker est separe.

Rendu : Carte coins md continus, fond systemBackground 0,95, carte 150 dp non interactive, barre d'info 44 dp avec titre small semi-bold et sous-titre caption secondaire, icone 'arrow.up.right.square' accent.

Transposition Android : MKMapSnapshotter => Static Maps tiles ou MapLibre snapshot; NSCache => LruCache<String, Bitmap>; openInMaps => Intent ACTION_VIEW geo:lat,lon?q=.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMapThumbnailProvider.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedLocationPresentation.kt`

### Taper @ propose les bonnes personnes tout de suite, cache d'abord, puis l'annuaire

`cmp-mention` · Android : **partielle** · P1 · effort M

MentionComposerController sert tout composeur (conversation, post, commentaire, story, brouillon de publication) selon la regle de 2026-09-24 : `@` seul => contacts (cache) puis participants du contexte, sans reseau; `@a` => memes resultats filtres localement; `@al` (2 lettres) => resultats filtres puis les AUTRES trouves au reseau (recherche contextuelle conversation/post, ou annuaire pour un brouillon non publie), avec debounce et affinage local instantane; ordre contacts > participants > autres sans doublon ni soi-meme (MentionSuggestionRule). Etats : requete active, isResolving (squelette seulement pendant qu'une recherche est en vol), liste vide = 'personne' ecrit en toutes lettres (jamais un faux vide 300 ms avant de chercher), showsSuggestions. Deux presentations : panneau vertical (MentionSuggestionPanel : avatar avec presence et contour de profil, nom, @pseudo, cible 44) pour post / commentaires, et bande horizontale pleine largeur ancrée en bas (ComposerMentionStrip) pour l'ecran de publication, avec contraste garanti selon le fond (plateau sombre / scene). draftMentions memorise les mentions inserees; le service MentionService resout contextId + contextType (conversation \| post) et rend inConversation / isFriend / badge / profileDecor.

Écarts :
- Brancher l'endpoint contextuel de suggestions (contextId + contextType conversation|post) au lieu de l'annuaire generique seul (DirectoryMentionSearch); l'annuaire ne sert que pour un brouillon non publie.
- Regle d'etape pure (MentionLookupRule.stage) : `@` et `@x` sans reseau, reseau des 2 lettres avec debounce, les 'autres' deja connus restent affiches pendant l'affinage; aujourd'hui seul le seuil de 2 lettres existe.
- Ordre contacts > participants > autres sans doublon ni soi (MentionSuggestionRule); Android merge locaux puis distants sans la strate 'contacts' (voir cmp-mention-contacts).
- Etat isResolving + squelette de lignes uniquement pendant la recherche, et message 'personne' (ComposerDocumentCopy.mentionEmpty) quand la liste est vide : Android n'affiche RIEN si suggestions vides (MentionSuggestionStrip retourne tot).
- Lignes riches : avatar image + indicateur de presence (LivePresence) + contour de profil (profileDecor) + nom semi-bold + @pseudo + cible 44 dp; Android affiche un MeeshyAvatar d'initiales de 36 dp sans presence.
- Variante bande horizontale pleine largeur (composer de publication / story) avec gestion du contraste selon le fond (plateau sombre vs scene) et capsule opaque, a cote du panneau vertical.
- Participants de contexte pour post/commentaires (auteur puis commentateurs, MentionParticipants) et pseudos sans handle exclus.
- draftMentions : conserver et exposer la liste des mentions inserees pour construire le payload d'envoi; reset apres envoi (deja present).

Rendu : Lignes de 44+ dp: avatar (userListItem), displayName semi-bold label, @pseudo small en textSecondary; panneau fond materiau, bande horizontale en capsules (fond primaire du schema, opaque) sans fond propre; texte 'aucune personne' en subhead medium; squelette de 3 lignes pendant la recherche.

Transposition Android : ObservableObject + Combine objectWillChange => StateFlow dans un ViewModel; Task debounce => Flow.debounce / mapLatest; LivePresence => collect de la presence.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MentionComposerController.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerMentionControllerBox.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerMentionStrip.swift`
- `apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift`
- `apps/ios/Meeshy/Features/Main/Components/MentionParticipants.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/MentionService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/mention/MentionComposer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/mention/MentionSearch.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MentionRoster.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentMentionRoster.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MentionCandidate.kt`

### L'envoi differe est retente tout seul au bon moment, et mes accuses de reception hors ligne finissent par partir

`cmp-outbox-sched` · Android : **partielle** · P1 · effort M

OutboxFlushTrigger.flushNow vide la file immediatement apres un enqueue (une reaction n'a pas d'autre chemin d'envoi); OutboxRetryScheduler possede l'UNIQUE minuteur de re-flush: des qu'un vidage laisse un enregistrement en backoff exponentiel, il (re)arme un minuteur unique a l'echeance (nextAttemptAt), deduplique (schedule annule le precedent), rearme aussi au retour reseau, a la connexion socket et a chaque mutation. PendingStatusQueue (acteur): file persistante des accuses 'recu' / 'lu' d'une conversation hors ligne (plafond 100, expiration 24 h, rejet des conversationId vides qui 404 pour toujours), flush vers byConversationIdMarkAsRead / MarkAsReceived, les echecs restent.

Écarts :
- Verifier que le worker WorkManager est relance a l'echeance du premier backoff (nextAttemptAt) et non a la prochaine occasion (demarrage, retour au premier plan, enqueue): ajouter un planificateur unique OneTimeWork avec delai calcule, deduplique par nom unique (REPLACE).
- Declencheurs de rearmement: retour reseau (ConnectivityManager callback), reconnexion socket, nouvelle mutation, retour au premier plan, BGTask equivalent (periodic work).
- Flush immediat apres chaque enqueue d'une mutation sans autre chemin d'envoi (reactions, etc.): OutboxFlushWorker.buildRequest existe, a systematiser via un trigger unique.
- File d'accuses 'recu' / 'lu' hors ligne: Android n'a que READ_RECEIPT dans l'outbox; ajouter l'accuse de reception ('received'), plafond 100 et expiration 24 h, rejet des conversationId vides, conservation des echecs.
- Etat observable 'prochain essai a ...' pour l'UI (pastille de synchro / bulle en attente).

Rendu : Pas d'ecran propre; ressenti: l'envoi se rattrape sans action, sans attendre une ouverture de l'app.

Transposition Android : Task + AnyCancellable => WorkManager (OneTimeWorkRequest avec setInitialDelay / BackoffPolicy.EXPONENTIAL) + ConnectivityManager.NetworkCallback; UserDefaults => DataStore ou Room.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/OutboxFlushScheduling.swift`
- `apps/ios/Meeshy/Features/Main/Services/PendingStatusQueue.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushPlan.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### J'arme ephemere, flou ou vue unique en un geste et la barre prend la couleur de la protection

`cmp-protections` · Android : **partielle** · P1 · effort M

Trois bascules de masquage dans la barre d'outils : EPHEMERE (flamme-oeil = detruit apres lecture, ou duree via un rail de pastilles Desactive / 15 s / durees), FLOU (revele au tap) et VUE UNIQUE (cercle 1), plus le panneau d'effets (baguette, panneau inline et non feuille) et, pour les commentaires, des effets permanents inline (Lueur, Pulsation, Arc-en-ciel, Scintillant). Regles : flou et vue unique sont exclusifs (toggleVeil); la protection la plus forte parmi les armees (ephemere > vue unique > flou) teinte la barre entiere, ephemere en rouge d'alerte, vue unique violet d'etat, flou gris d'etat, et le dégradé prend la teinte sur les DEUX arrets; une reponse a un message protege IMPOSE sa protection (contagion de citation) : bascule affichee armee et verrouillee avec cadenas, non desarmable; l'accessibilite annonce armé / impose. Les rails s'ouvrent en ressort au-dessus de la barre d'outils avec marge de 8 pt et se ferment entre eux.

Écarts :
- Ajouter les trois bascules dediees dans la barre d'outils (ephemere, flou, vue unique) : aujourd'hui ces effets ne s'arment que dans la feuille modale EffectsPickerSheet ouverte par une icone d'etincelles.
- Remplacer la feuille modale d'effets par un panneau inline (rail qui s'ouvre au-dessus de la barre d'outils, fond railSurface 0,3 noir / 0,9 blanc, coins lg, marge haute 8) et un panneau d'effets permanents inline pour les commentaires.
- Ajouter l'option ephemere flamme-oeil (detruit apres lecture, EphemeralChoice.afterRead) en plus des durees, avec le glyphe FlameEye et le libelle propre; chip Desactive.
- Exclusivite flou / vue unique (toggleVeil) et masquage de ces bascules selon le mode (commentaire, edition, apercu de notification).
- Teinte de protection dominante (ephemere #erreur, vue unique stateViewOnce, flou stateConcealed) sur la capsule, le bord et les deux arrets du degrade du bouton d'envoi, avec priorite ephemere > vue unique > flou.
- Contagion de citation (ReplyProtectionContagion) : repondre a un message flou/ephemere arme et verrouille la meme protection (cadenas, accessibilite 'impose par le message cite'); porter l'etat Imposed du SDK et armer a la selection de reponse.
- Indicateurs d'etat : compteur d'effets actifs (a11y 'N effet(s) actif(s)'), libelles composer.blur.label / composer.viewonce.label, duree affichee dans la pastille d'ephemere.
- Conserver les animations spring (0,3/0,8) et le haptique light sur chaque bascule.

Rendu : Capsules a padding horizontal 8 / vertical 4, fond de la couleur de protection a 0,15 + bordure 0,3 (0,5 pt), texte caption2 bold pour la duree / le mot Flou / Vue unique, glyphe 'cercle 1' pour la vue unique; barre rouge pour ephemere, violet pour vue unique, gris pour flou; cadenas minuscule sur les protections imposees.

Transposition Android : HapticFeedback.light => HapticFeedbackType.TextHandleMove ou performHapticFeedback(CLOCK_TICK); symboles SF => icones Material (hourglass, blur_on, visibility, auto_awesome); spring => spring(dampingRatio 0.8, stiffness medium).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Protections.swift`
- `apps/ios/Meeshy/Features/Main/Components/ComposerProtection.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsPicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsEditor.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EphemeralLifecycle.kt`

### J'enregistre un message vocal dans une barre pleine largeur avec onde, chrono, annuler, ajouter aux pieces ou envoyer

`cmp-voice` · Android : **partielle** · P1 · effort M

Le micro vit DANS le champ (a gauche, masque au focus) ; l'enregistrement remplace la rangee par une pilule pleine largeur facon iMessage : bouton Annuler (supprime la prise, hint 'Supprime le message vocal en cours'), onde de 15 niveaux interpolee, chrono, bouton Stop (arrete et PLACE le vocal dans les pieces pour l'editer avant envoi) et bouton Envoyer (arrete et envoie brut). Duree minimale 0,5 s sous laquelle l'envoi est desactive (haptique error si trop court, medium au demarrage / a l'envoi, light a l'arret). La prise appartient au parent (AudioRecorderManager) : quatre relais obligatoires (start, stopToAttachment, send, cancel) + etat externe (isRecording, duree, niveaux) pour qu'aucun hote ne pose un vocal muet; ComposerAudioHost isole l'abonnement au vumetre (20 Hz). Depuis l'etat minimise, le micro deplie PUIS demarre. La barre d'outils disparait pendant la prise; mouvement reduit => fondu.

Écarts :
- Stop et Envoyer sont identiques sur Android (finishVoiceRecording envoie dans les deux cas, 'pas de plateau') : ajouter le vrai comportement Stop => deposer le vocal dans le plateau de pieces pour edition / ecoute avant envoi, Envoyer => envoi immediat.
- Micro DANS le champ (a gauche, masque au focus) comme iOS, au lieu du bouton en fin de rangee qui remplace Envoyer.
- Onde de 15 niveaux interpolee en temps reel et couleur accent; chrono; verifier le rendu de VoiceRecordingPill (184 lignes) contre la pilule iOS (annuler a gauche, onde, chrono, stop, envoi).
- Haptiques : medium au demarrage et a l'envoi, light a l'arret, error quand la prise est trop courte (< 0,5 s); bouton Envoyer desactive sous le minimum.
- Isoler l'etat du vumetre / chrono (20 Hz) du reste de l'ecran pour ne pas recomposer toute la conversation (equivalent ComposerAudioHost).
- Prise possedee par le ViewModel/service (pas par le composable) : l'enregistrement actuel est dans ChatComposer (MediaRecorder dans remember) et meurt avec la composition (rotation, navigation); deplacer vers un service/ViewModel et exposer start / stopToAttachment / send / cancel + etat.
- Demarrer l'enregistrement depuis l'etat minimise (deplier puis demarrer) et masquer la barre d'outils pendant la prise; consentement vocal (voir cmp-send-plan).

Rendu : Pilule pleine largeur padding 12/10, onde en barres arrondies teinte accent, bouton annuler neutre a gauche, stop carre et envoi fleche accent a droite; transition asymetrique scale 0,96 + fondu a l'apparition.

Transposition Android : AVAudioRecorder + metering => MediaRecorder/AudioRecord (maxAmplitude deja utilise) dans un foreground-capable service; HapticFeedback => HapticFeedbackConstants; permission micro => RequestPermission (RECORD_AUDIO deja declaree).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift`
- `apps/ios/Meeshy/Features/Main/Views/ComposerAudioHost.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingSession.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingFile.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### Quand je ne peux pas ecrire, le composeur est remplace par une zone qui explique pourquoi et propose la sortie

`cmp-zones` · Android : **partielle** · P1 · effort M

Le composeur est REMPLACE (jamais empile) par des zones d'etat : conversation fermee (bandeau 'conversation.view.closed'), conversation globale interdite aux moins de 18 ans (minorGlobalBanner), utilisateur bloque (titre, sous-titre, bouton Debloquer avec haptique medium puis success), mode lecture seule, et la barre de selection multiple qui remplace le composeur pendant la selection (#4005). La zone est choisie par l'hote qui connait l'etat (composerOrReadOnlyZone) ; chaque zone se dote de son propre materiau de fond.

Écarts :
- Zone 'conversation fermee' (texte conversation.view.closed) qui remplace le composeur.
- Zone 'global interdit aux moins de 18 ans' (conversation.composer.minorGlobal).
- Zone 'utilisateur bloque' : titre + sous-titre + bouton Debloquer (haptique medium puis success, debloque via l'API et rebascule en composeur).
- Barre de selection multiple (transferer / supprimer / etc.) qui REMPLACE le composeur pendant la selection.
- Conserver les zones deja presentes (lecture seule via ComposerReadOnlyNotice, mode lent compte a rebours) mais les aligner visuellement sur la plaque iOS (fond materiau propre, hauteur stable).
- Determiner la priorite des zones (bloque > ferme > mineur > lecture seule) dans une fonction pure testable.

Rendu : Zones pleine largeur, icone + titre + sous-titre centres, bouton Debloquer plein accent coins md, fond .regularMaterial equivalent (surface translucide), pas d'animation parasite a la bascule.

Transposition Android : composerOrReadOnlyZone => composable de decision pure (when sur un etat sealed) place dans le bottomBar de ChatScreen.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ComposerBanners.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/SlowModePolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerSendGate.kt`

### Les boutons d'action ronds du menu flottant ont un degrade, un halo qui respire et un badge

`cmp-action-btn` · Android : **partielle** · P2 · effort S

ThemedActionButton: bouton rond (46 pt par defaut, glyphe = 39 % de la taille) en degrade de sa couleur (opacite 1 -> 0,7), ombre qui respire quand il est visible (isGlowEnabled: l'echelle de menu reste montee fermee, le halo repeatForever est coupe pour ne pas chauffer sur six boutons invisibles), ressort a l'appui (response 0,15, damping 0,5), haptique light, badge de compteur, libelle et hint d'accessibilite, mouvement reduit respecte (systeme ou preference utilisateur). Utilise par l'echelle de menu flottante racine (RootFloatingChrome).

Écarts :
- Composant bouton d'action rond a degrade de couleur (1 -> 0,7) avec ombre/halo qui respire uniquement quand il est visible, ressort a l'appui et haptique; aujourd'hui la navigation Android utilise des items de menu standard (MeeshyApp).
- Badge de compteur et libelle/hint d'accessibilite; respect du mouvement reduit (systeme + preference Meeshy).
- Echelle de menu flottante racine (RootFloatingChrome) avec apparition en cascade; verifier si Android reprend le patron ou garde une barre de navigation differente.

Rendu : Cercle 46 dp, degrade topLeading -> bottomTrailing de la couleur, ombre 0,45-0,65 selon le halo, glyphe blanc semi-bold, badge rouge en coin; ressort court a l'appui.

Transposition Android : repeatForever shadow => rememberInfiniteTransition limite a la visibilite (LaunchedEffect/isVisible) ; haptique => performHapticFeedback.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ThemedActionButton.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Un hub 'Mes liens' regroupe mes liens de partage, de suivi, de communaute et d'affiliation

`cmp-links-hub` · Android : **partielle** · P2 · effort M

LinksHubView (deep link meeshy.me/links): en-tete retractable 'Mes liens', bandeau 'Gerez vos liens' / 'Partagez, suivez et monetisez votre audience', puis quatre cartes de categorie: Liens de partage ('Invitez des contacts a rejoindre vos conversations'), Liens de suivi ('Suivez les performances de vos liens de reference'), Liens communaute ('Gerez les liens d'invitation vers vos communautes'), Liens affilies ('Monetisez votre reseau avec des tokens d'affiliation'), chacune avec sa couleur d'accent (share / tracking / community / success), une action de creation rapide ('Creer un lien de partage / de tracking / affilie') ouvrant une feuille de creation, haptiques light/medium, degrade de fond du theme.

Écarts :
- Ecran hub 'Mes liens' (route /links) avec en-tete retractable, banniere et quatre cartes de categories (partage, suivi, communaute, affilies) avec accent propre; Android a les ecrans de liens de partage mais aucun point d'entree unique.
- Ecrans/creation pour les categories absentes: liens de suivi (TrackingLink), liens de communaute (CommunityLink), liens d'affiliation (Affiliate): les modeles existent, les ecrans de liste / creation sont a verifier ou creer.
- Creation rapide depuis chaque carte (feuille de creation), libelles d'accessibilite 'Creer un lien de ...', haptiques.
- Navigation: entree depuis profil / reglages et deep link meeshy.me/links.

Rendu : Cartes pleine largeur a coins lg, fond surfaceGradient teinte de l'accent + bordure, icone ronde de l'accent, titre semi-bold, description secondaire, chevron et bouton + de creation; bandeau d'en-tete en accent communaute.

Transposition Android : CollapsibleHeader => LargeTopAppBar a collapse; deep link meeshy.me/links => navDeepLink dans le graphe.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MyShareLinksScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/CreateShareLinkScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkDetailScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TrackingLink.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CommunityLink.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Affiliate.kt`

### Je partage ma position en direct avec ma conversation pour une duree choisie

`cmp-live-location` · Android : **partielle** · P2 · effort M

LocationService (SDK) emet les evenements socket de position en direct : startLiveLocation(conversationId, lat, lon, durationMinutes), updateLiveLocation (altitude, precision, vitesse, cap) et stopLiveLocation, et expose trois flux (started, updated, stopped) pour les badges de la conversation et la carte des participants. Le partage en direct tient compte de la precision choisie et s'arrete a l'echeance ou a la demande.

Écarts :
- Cote reception Android est faite (flux started / updated / stopped, fold des sessions, badges avec compte a rebours); il manque l'EMISSION : emitLiveLocationStart / Update / Stop sur MessageSocketManager (aucun emetteur trouve) et un LocationService (SDK) equivalent.
- Declencheur UI : entree 'Partager ma position en direct' (duree LiveLocationDuration) dans le selecteur de lieu / menu de pieces, arret manuel et a l'echeance.
- Mise a jour continue de la position (FusedLocation / LocationManager) avec altitude, precision, vitesse, cap, throttlee; applique la precision de partage choisie.
- Service de premier plan (type location) avec notification persistante 'Partage de position en direct' + action Arreter, et permissions arriere-plan (ACCESS_BACKGROUND_LOCATION) a demander avec justification.
- Reprise apres reconnexion socket (rejouer l'etat de la session) et arret propre a la deconnexion.

Rendu : Badge 'en direct' avec compte a rebours sur la bulle / en tete de conversation (deja present cote reception); notification persistante avec action Arreter.

Transposition Android : Live Activity / CLLocationManager background => foreground service type=location + notification en cours; PassthroughSubject => SharedFlow deja present.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/LocationService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Location.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LiveLocationEventFold.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LiveLocationSessions.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LiveLocationCountdown.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LiveLocationDuration.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/location/LiveLocationBadge.kt`

### Un long texte colle devient une piece 'contenu du presse-papier' au lieu d'inonder le champ

`cmp-clipboard` · Android : **complète** · P2 · effort S

handleClipboardCheck : lorsque le texte depasse 2000 caracteres par un collage soudain (croissance d'un coup), le contenu est retire du champ et range dans un ClipboardContent (apercu tronque, nombre de caracteres) montre dans une pastille au-dessus du champ (titre 'Contenu du presse-papiers', apercu, 'N caracteres', bouton Retirer), avec haptique medium; a l'envoi il part en piece text/plain.

Rendu : Pastille avec titre, apercu tronque, compteur 'N caracteres' et bouton de retrait avec libelle d'accessibilite; deja rendue sur Android (ClipboardContentPreview).

Transposition Android : handleClipboardCheck => LargePasteDetector (memes seuils : > 2000 car., croissance > 250) + ClipboardContentPreview; Android envoie vraiment la piece text/plain par la chaine upload -> graft -> send (iOS la previsualise puis l'envoie via le meme chemin).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LargePasteDetector.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ClipboardContent.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

