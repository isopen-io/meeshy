# Parité iOS → Android : `contacts-friends`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**24 features iOS** : 11 absentes, 9 partielles, 4 divergentes, 0 complètes sur Android. **31 lots** planifiés (≈20320 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**contacts-friends** (couverture Android estimée ≈ 28 %)

Sur iOS, ce lot couvre tout le graphe social : le hub Personnes (onglets Appels / Clavier / Contacts avec pager glissable et en-tête repliable), l'annuaire d'amis cache-first, le répertoire du téléphone synchronisé avec le serveur (lot de 2000, jeton syncStartedAt, replace/merge), la découverte (invitation e-mail/SMS, recherche, « Retrouver mes contacts sur Meeshy »), les demandes d'amis reçues/envoyées en outbox optimiste, les utilisateurs bloqués, les cartes de visite vCard dans les bulles (bulle, fiche, partage, résolution des comptes), le flux « Validez votre compte » et la feuille d'invitation par lien. Côté Android (module :feature:contacts + sdk-core/friend + feature/calls), la base est réelle mais étroite : liste d'amis (SWR Room, présence socket, humeur), demandes reçues/envoyées, découverte avec bouton de connexion inline et invitation e-mail/SMS, liste des bloqués avec confirmation et dépose durable en outbox, journal d'appels (Tous/Manqués, pagination, pull-to-refresh). Absents : le clavier, tout le pipeline carnet d'adresses (aucune permission READ_CONTACTS, aucun appel à /directory/contacts, /users/me/contacts/match ou /contacts/resolve), les cartes de visite, l'activation de compte et le concept de hub à pager. Divergences structurelles : un seul écran à 4 onglets (Contacts, Demandes, Découvrir, Bloqués) au lieu de deux hubs, le journal d'appels hors du hub, routes REST legacy (friend-requests/{id}, users/me/blocked-users) à la place des routes canoniques /directory/*, avatars sans URL d'image ni contour décoré, accepter/refuser une demande en ligne seulement (pas de RESPOND_FRIEND_REQUEST en outbox), aucun toast/haptique ni pull-to-refresh sur la plupart des onglets. Parité estimée autour de 28 % du comportement visible de ce périmètre.

## Notes transverses

VUE D'ENSEMBLE. 32 lots, ordre conseillé en 5 vagues. V1 (parallèles, fichiers disjoints) : amis-blocages-routes-canoniques, plausibilite-numero-telephone, profil-repeint-user-updated, socle-ui-personnes, retours-haptiques-et-toasts, actions-personne-ecrire-connecter-inviter, carnet-adresses-modeles-et-api, journal-appels-donnees, resolution-contacts-partages, carte-visite-vcard, validation-compte-invitation. V2 : connexion-amis-hors-ligne, coordinateur-blocage, carnet-adresses-synchronisation, journal-appels-ui, clavier-numerique, annuaire-amis-instantane, annuaire-affilies, feuille-ajout-numero. V3 : demandes-amis-instantanees (P0), bloques-deblocage-instantane, blocage-depuis-profil-et-discussion, decouvrir-invitations-recherche, annuaire-repertoire-telephone, carte-visite-bulle. V4 : hub-personnes, retrouver-contacts-sur-meeshy, carte-visite-fiche-detail, carte-visite-partage, invitation-conversation-lien. V5 : decouverte-personnes, notification-ajout-contact. Chaîne P0 (le seul bloquant produit réel) : amis-blocages-routes-canoniques -> connexion-amis-hors-ligne -> demandes-amis-instantanees, plus socle-ui-personnes, retours-haptiques-et-toasts et profil-repeint-user-updated qui l'alimentent.

ROUTES LEGACY : la passerelle sert encore friend-requests/{id}, users/me/blocked-users et users/{id}/block en alias dépréciés ; leur retrait est conditionné au DÉCOMPTE des appels Android (#4164 c.7-8, compteur #4275). Android n'a jamais migré : amis-blocages-routes-canoniques est ce qui débloque ce retrait, et il garde les lignes d'outbox BLOCK_USER/UNBLOCK_USER déjà en file rejouables (rétrocompatibilité, directive 2026-10-03). Aucun changement serveur n'est requis par ce domaine : vérifié dans services/gateway que directory/friend-requests (direction, status=pending, cursor, PATCH action accept|reject|cancel|dismiss), directory/blocks, directory/contacts (PUT/PATCH + syncStartedAt/isFinalBatch), users/me/contacts/match, calls/history (q, type, filter) et DELETE calls/history[/:callId] existent. Les chaînes de route Android (calls, contacts, contacts/discover, contacts/blocked) restent STABLES pour les liens profonds, seules les destinations changent.

ARCHITECTURE DE MODULES. Jamais feature -> feature : le hub Personnes vit dans :feature:contacts avec des slots (callsTab, phonebookContent, affiliatesContent) que :app câble ; CallsTab est dans :feature:calls ; tout composant partagé par calls ET contacts (champ de recherche, pastilles, squelette, bouton d'onglet, ConnectControl, ligne d'annuaire) vit dans :sdk-ui (package ui.component.people). Les ViewModels d'onglet sont scopés à l'entrée de navigation du hub (hiltViewModel), donc survivent aux changements d'onglet sans lot dédié. Contrat commun des onglets : isActive: Boolean + onCollapseProgressChange: (Float) -> Unit (0..1, calculé par ScrollOffsetReporter via CollapsibleHeaderMotion).

FICHIERS CHAUDS (conflits probables entre lots et avec d'autres domaines) : MeeshyApp.kt (touché par retours-haptiques, demandes-amis, bloques, hub, decouverte, validation-compte : éditions localisées, à enchaîner par vague) ; MeeshyApi.kt + NetworkModule.kt (une ligne par nouvelle interface *Api : carnet, resolve, affiliates, auth) ; OutboxModel.kt + OutboxFlushWorker.kt (nouvelle kind RESPOND_FRIEND_REQUEST : le when exhaustif d'OutboxLaneMap force la mise à jour) ; SdkModule.kt (bindings DataStore/lecteur de carnet, constructeur de DefaultSessionTeardown) ; CollapsibleHeader.kt (paramètres ADDITIFS navigationIcon/accessory, ajoutés par hub-personnes, valeurs par défaut = comportement actuel) ; MeeshyUser.kt (champ activation) ; BubbleContent/BubbleContentBuilder/MessageBubble (contactCards) ; ChatScreen/ChatViewModel (partage de contact). Recommandation de portée : chaque lot ajoute ses chaînes dans un fichier dédié res/values{,-fr,-es,-pt}/strings_<sujet>.xml au lieu d'éditer le strings.xml commun (suppression des conflits de fusion triviaux).

ROOM : MeeshyDatabase est en version 16 avec fallbackToDestructiveMigration() : TOUT ajout d'entité efface les caches ET l'outbox à la mise à jour de l'app. Ce domaine n'ajoute qu'UNE entité (PhonebookContactEntity, lot carnet-adresses-synchronisation) ; le journal d'appels par requête reste en mémoire (LRU) au lieu d'une colonne de requête, les affiliés passent par un snapshot DataStore. À grouper avec les autres bumps de schéma d'autres domaines dans une même vague, et à signaler comme risque de perte de file hors ligne.

AVATARS (dépendance transverse majeure, ext:avatar-image-profile-decor) : MeeshyAvatar n'accepte ni URL d'image ni contour de profil (initiales seulement), FriendRequestUser/BlockedUser/UserSearchResult n'ont pas de profileDecor (ServedProfileDecor côté iOS), alors que quasi tous les écrans de ce domaine rendent des avatars. Le wrapper PersonAvatar (socle-ui-personnes) centralise ce point d'extension : un seul fichier à changer quand la brique commune arrive ; en attendant il retombe sur les initiales + couleur DynamicColorGenerator.colorForName.

TOASTS / HAPTIQUES : MeeshyFeedbackToast existe comme atome mais AUCUN présentateur (file, durée, annonce TalkBack, purge à la déconnexion) ni mapping haptique n'existe côté Android alors que iOS a FeedbackToastManager + HapticFeedback globaux. Le lot retours-haptiques-et-toasts les livre ; il recoupe probablement d'autres domaines (chat, profil, réglages) : le premier arrivé fait foi, les autres réutilisent FeedbackToastCenter/MeeshyHaptics.

USER:UPDATED : Android n'écoute pas cet événement (iOS : UserProfileRepaint, #9307 ; web : repaintProfile). profil-repeint-user-updated livre le flux, la loi pure de repeinture et les extensions pour les modèles de ce domaine ; le domaine chat/conversations devra y ajouter ses extensions (participants, expéditeurs) dans SES fichiers sans toucher UserUpdatedEvent.kt.

LOI DE PRÉSENCE (CLAUDE.md, directive 2026-08-25) : la visibilité est décidée par le serveur (amis acceptés, soi, ADMIN+) ; un client ne fabrique ni ne prolonge une présence. Toute ligne (amis, répertoire, affiliés, résultats Découvrir/Clavier, journal d'appels) rend une présence ABSENTE comme AUCUN point. Dérivation unique UserPresence.state(now) (60 s / 3 min / 5 min, hors ligne = aucun point sur avatar, gris réservé aux affichages labellisés) ; LivePresenceClock (tick 30 s, lifecycle-aware) recalcule la décroissance sans événement. typing:start = en ligne (hors périmètre).

PRISME / ACCENT : les noms de personnes ne sont pas des contenus traduits ; le Prisme ne s'applique ici qu'aux libellés d'interface (4 langues Android : en/fr/es/pt, iOS en porte plus : écart hors domaine) et à l'heure relative (RelativeTimeLongText déjà présent). Le texte du SMS d'invitation reste la chaîne littérale iOS, volontairement non localisée. Couleurs : avatar = DynamicColorGenerator.colorForName ; carte de visite et feuille d'invitation par lien utilisent l'accent de CONVERSATION (ConversationAccent), jamais une couleur codée en dur ; états sémantiques (erreur/succès) restent statiques via MeeshyPalette.

CARNET D'ADRESSES = DONNÉE PERSONNELLE (directives 2026-10-03 #9225/#9230) : READ_CONTACTS n'est demandée que dans le contexte (bouton Synchroniser / Retrouver mes contacts, avec rationale puis redirection Réglages en cas de refus définitif), jamais au lancement ; le serveur ne conserve en clair que les inscrits, le client n'écrit rien d'autre dans Room que ce que renvoie GET directory/contacts ; les corps de directory/contacts, users/me/contacts/match et contacts/resolve DOIVENT être ajoutés à SensitiveBodyLoggingGuard (lot carnet-adresses-modeles-et-api) ; clearAllTables() de SessionTeardown purge déjà la table du carnet à la déconnexion. Partager une fiche (PickContact) et ajouter un contact (ACTION_INSERT_OR_EDIT) ne demandent AUCUNE permission. À déclarer dans la fiche de confidentialité Play Store (data safety).

TESTS : sdk-ui n'a que junit+truth, feature:contacts et feature:calls n'ont ni Compose UI test ni mockk côté UI : le lot socle-ui-personnes ajoute robolectric + compose-ui-test-junit4 + ui-test-manifest (modèle feature:auth) à sdk-ui, feature:contacts et feature:calls. Les tests d'endpoint suivent PublicProfileEndpointTest (requête capturée au dernier maillon réseau) ; ApiPathLiteralGuardTest impose que tout littéral de chemin vive dans une interface *Api.kt.

ÉCARTS ASSUMÉS PAR RAPPORT À iOS (même comportement visible, meilleure ingénierie) : demandes envoyées lues par curseur avec status=pending côté serveur (remplace le contournement iOS de 5 pages par atteinte sur offset) ; revalidation du journal d'appels = 1 page fusionnée à la queue en cache (le CacheSource actuel balaie jusqu'à 30 pages à chaque revalidation) ; le déblocage et l'acceptation passent par l'outbox (iOS bloque en ligne pour la réponse aux demandes avant #7924).

HORS DOMAINE MAIS RENCONTRÉ : fiche de détail d'appel, CallBackDialer, CallDialReadiness, CallLinkConfirmation, CallStarter (domaine calls : ext:call-detail-sheet ; le tap sur ligne est un callback câblé sur le rappel direct actuel en attendant) ; lecteur de statut pour l'humeur (ext:status-viewer) ; EmailVerificationGate (auth) ; GameContactStrip de la fiche de contact (jeux) ; impression des statuts visibles (ext:status-impression) ; signal social négatif block (ext:social-negative-signals) ; actions rapides de notification Android (ext:push-notification-actions) ; barre d'onboarding (signal de présence consulté par l'hôte d'activation). Affiliés : AffiliatesListView/ViewModel d'iOS n'étaient pas dans l'inventaire mais sont référencés par le filtre Affiliés ; lot annuaire-affilies, à dédupliquer avec un éventuel domaine settings/affiliation qui poserait AffiliateApi.

LIMITES TABLETTE / RTL / A11Y : feuilles et formulaires de ce domaine (ajout de numéro, validation de compte, invitation par lien, fiche de contact) utilisent formColumnWidth() ; listes en pleine largeur ; flèches avec Icons.AutoMirrored ; cibles 44 dp ; libellés composés TalkBack par ligne ; le HorizontalPager du hub doit laisser le geste retour système aux bords. Dégel Android : directive #11570 (2026-10-22), le Kotlin natif est désormais la cible de parité iso ; apps/web/android (coque Capacitor) hors périmètre.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `amis-blocages-routes-canoniques` | D | P0 | M | 520 |  | Amis, demandes et blocages passent par les routes canoniques /directory, lus par curseur |
| `connexion-amis-hors-ligne` | D | P0 | M | 650 | amis-blocages-routes-canoniques, persist-outbox-registre-senders | Envoyer, accepter ou refuser une demande d'ami est instantané, même hors connexion |
| `demandes-amis-instantanees` | D | P0 | M | 1000 | amis-blocages-routes-canoniques, connexion-amis-hors-ligne, profil-repeint-user-updated, socle-ui-personnes, toasts-de-retour-globaux, socle-points-d-extension-de-l-app | Mes demandes d'amis reçues et envoyées s'acceptent, se refusent et s'annulent instantanément, même hors ligne |
| `profil-repeint-user-updated` | D | P0 | M | 400 | persist-messages-repository-decoupage, socket-routage-evenements-ordre-arrivee | Un contact renommé ou qui change de photo est repeint partout sans relecture |
| `socle-ui-personnes` | D | P0 | M | 850 | avatar-unique-et-branchement-social, contours-d-avatar-equipes | Les écrans Personnes partagent la même recherche, les mêmes pastilles et le même squelette |
| `actions-personne-ecrire-connecter-inviter` | D | P1 | S | 400 |  | Écrire, se connecter ou inviter quelqu'un suit une seule règle et un seul geste partout |
| `annuaire-amis-instantane` | D | P1 | M | 800 | amis-blocages-routes-canoniques, profil-repeint-user-updated, socle-ui-personnes, toasts-de-retour-globaux | Mes amis s'affichent instantanément, en ligne d'abord, avec filtres, recherche et compteurs |
| `annuaire-repertoire-telephone` | D | P1 | M | 900 | carnet-adresses-synchronisation, socle-ui-personnes, toasts-de-retour-globaux, actions-personne-ecrire-connecter-inviter, feuille-ajout-numero | L'onglet Répertoire liste mon carnet, qui est sur Meeshy et qui je peux inviter |
| `blocage-depuis-profil-et-discussion` | D | P1 | M | 480 | coordinateur-blocage, socle-ui-personnes, toasts-de-retour-globaux, liste-decoupage-viewmodel, profile-own-page-split | Je peux bloquer ou débloquer quelqu'un depuis son profil ou une conversation, avec confirmation |
| `bloques-deblocage-instantane` | D | P1 | M | 650 | coordinateur-blocage, socle-ui-personnes, toasts-de-retour-globaux, socle-points-d-extension-de-l-app | La liste des utilisateurs bloqués se débloque avec confirmation, balayage et retour immédiat |
| `carnet-adresses-modeles-et-api` | D | P1 | M | 750 | reseau-pipeline-reessai-erreurs | Le carnet synchronisé et les contacts inscrits ont leurs modèles et leurs routes /directory |
| `carnet-adresses-synchronisation` | D | P1 | M | 900 | carnet-adresses-modeles-et-api, consentements-par-finalite, persist-room-migrations, dependances-gradle-scene-medias | Mon carnet d'adresses se synchronise avec Meeshy par lots, sans jamais purger par erreur |
| `carte-visite-bulle` | D | P1 | L | 1300 | carte-visite-vcard, resolution-contacts-partages, actions-personne-ecrire-connecter-inviter, connexion-amis-hors-ligne, toasts-de-retour-globaux, message-fil-decodage-complet-et-tolerant, piece-jointe-fil-complet-et-protection, composer-glass-shell, chat-bulle-decoupage-composants | Un contact partagé s'affiche dans la conversation comme une carte, avec « Se connecter » ou « Écrire » en un tap |
| `carte-visite-vcard` | D | P1 | M | 750 |  | Une carte de visite (vCard) se lit, s'écrit et se nomme correctement |
| `clavier-numerique` | D | P1 | M | 650 | socle-ui-personnes, toasts-de-retour-globaux, actions-personne-ecrire-connecter-inviter | Le clavier numérique retrouve une personne Meeshy par numéro ou par nom et l'appelle |
| `coordinateur-blocage` | D | P1 | S | 380 | amis-blocages-routes-canoniques | Bloquer ou débloquer est instantané et se corrige seul en cas d'échec définitif |
| `decouverte-personnes` | D | P1 | S | 450 | hub-personnes, decouvrir-invitations-recherche, demandes-amis-instantanees, bloques-deblocage-instantane, socle-points-d-extension-de-l-app | Découverte d'utilisateurs : sous-onglets Découvrir, Demandes et Bloqués dans cet ordre |
| `decouvrir-invitations-recherche` | D | P1 | M | 900 | socle-ui-personnes, toasts-de-retour-globaux, actions-personne-ecrire-connecter-inviter, connexion-amis-hors-ligne | Découvrir : inviter par e-mail ou SMS, chercher des utilisateurs Meeshy et se connecter en un tap |
| `hub-personnes` | D | P1 | M | 650 | socle-ui-personnes, toasts-de-retour-globaux, journal-appels-ui, clavier-numerique, annuaire-amis-instantane, annuaire-repertoire-telephone, annuaire-affilies, socle-points-d-extension-de-l-app | Le hub Personnes s'ouvre sur Appels, Clavier ou Contacts, avec onglets glissables et en-tête qui se replie |
| `journal-appels-donnees` | D | P1 | M | 620 |  | Le journal d'appels se cherche côté serveur, se filtre par type et s'efface ligne à ligne |
| `journal-appels-ui` | D | P1 | M | 950 | journal-appels-donnees, socle-ui-personnes, toasts-de-retour-globaux, calls-database-schema-v17 | Le journal d'appels se cherche, se filtre, s'efface par balayage et se rappelle en audio ou vidéo |
| `plausibilite-numero-telephone` | D | P1 | S | 280 |  | Un numéro manifestement faux est refusé avant l'envoi, partout où l'on saisit un téléphone |
| `retrouver-contacts-sur-meeshy` | D | P1 | M | 520 | carnet-adresses-synchronisation, feuille-ajout-numero, decouvrir-invitations-recherche | « Retrouver mes contacts sur Meeshy » montre qui de mon carnet est déjà inscrit |
| `validation-compte-invitation` | D | P1 | M | 900 | socle-points-d-extension-de-l-app | « Validez votre compte » : prouver mon e-mail et ajouter mon numéro sans quitter l'app |
| `annuaire-affilies` | D | P2 | M | 560 | socle-ui-personnes, toasts-de-retour-globaux, actions-personne-ecrire-connecter-inviter, parrainage-liens-affilies, socle-points-d-extension-de-l-app, reseau-pipeline-reessai-erreurs | Mes filleuls s'affichent dans Contacts > Affiliés, avec « Lui écrire » |
| `carte-visite-fiche-detail` | D | P2 | M | 700 | carte-visite-bulle, carte-visite-vcard, resolution-contacts-partages, toasts-de-retour-globaux | La fiche du contact partagé affiche tous ses champs, se copie à l'appui long et propose Ajouter ou Inviter |
| `carte-visite-partage` | D | P2 | M | 450 | carte-visite-vcard, toasts-de-retour-globaux, composer-glass-shell, chat-viewmodel-state-split | Je partage un contact de mon carnet comme carte de visite dans une conversation |
| `feuille-ajout-numero` | D | P2 | S | 480 | plausibilite-numero-telephone, toasts-de-retour-globaux | Avant de chercher mes contacts, Meeshy me propose d'ajouter mon numéro, sans jamais me bloquer |
| `invitation-conversation-lien` | D | P2 | M | 800 | toasts-de-retour-globaux, liste-decoupage-ecran-jetons-lentille | Inviter dans une conversation : un lien prêt à copier ou partager, personnalisable en option |
| `notification-ajout-contact` | D | P2 | S | 280 | carte-visite-fiche-detail, actions-notification-contextuelles, socle-pipeline-push-et-cycle-de-vie | Appuyer sur la notification d'un nouveau contact ouvre sa fiche prête à être enregistrée |
| `resolution-contacts-partages` | D | P2 | S | 400 | socle-points-d-extension-de-l-app, reseau-pipeline-reessai-erreurs | Un contact partagé est reconnu comme compte Meeshy sans rappeler le serveur à chaque affichage |

### Lots fusionnés ou retirés par l'architecture

- `retours-haptiques-et-toasts` → `toasts-de-retour-globaux` (drop-duplicate) : Même présentateur de toasts global et mêmes haptiques (MeeshyHaptics).

## Features

### « Validez votre compte » : prouver mon e-mail et ajouter mon numéro sans quitter l'app

`cf-activation-invite` · Android : **absente** · P1 · effort M

De J7 à J28, un compte dont l'adresse n'est pas prouvée reçoit à l'ouverture de l'app (au plus une fois par jour civil local et par appareil, jour mémorisé dès l'ouverture) une feuille « Validez votre compte » : phrase d'accroche selon les jours restants (aucun/0 : « pour continuer à l'utiliser sans interruption », 1 jour, N jours « Ensuite, la connexion demandera un code »), lignes de preuve « Adresse vérifiée ✓ » / « Numéro vérifié ✓ », étape e-mail (« Recevoir le code » → POST /auth/resend-verification puis saisie du code sur place par EmailCodeEntry, jamais une seconde machine), étape numéro (« Ajouter mon numéro » ouvre SecurityView, section Téléphone), message final « Votre compte est validé. Merci ! », bouton « Plus tard » / « Fermer » (Échap au clavier). L'hôte (activationInviteHost) écoute AuthManager.currentUser et l'état d'onboarding (aucune superposition de deux plein écrans), absorbe les preuves qui arrivent par l'utilisateur courant (emailVerifiedAt, phoneVerifiedAt) au lieu de se rouvrir, et rafraîchit la session après preuve. ActivationEmailStep est réutilisable avec envoi automatique à l'ouverture (garde de l'e-mail, #8365).

Écarts :
- Ajouter UserActivation à MeeshyUser (phase invite/done…, deadline, missing: [email, phone], invites, daysLeft(now)) ; MeeshyUser n'a que emailVerifiedAt et phoneVerifiedAt
- ActivationInviteViewModel : règle d'ouverture (phase invite, quelque chose à demander, pas déjà montrée aujourd'hui) avec magasin du jour civil local (DataStore), absorption des preuves, prove(channel), dismiss
- Hôte au niveau de la racine d'activité : écoute de l'utilisateur courant et du signal de présence de l'onboarding (ne rien ouvrir si l'onboarding est affiché)
- Étape e-mail : appel POST /auth/resend-verification, saisie du code (EmailCodeEntry : composant et machine d'état à porter dans :feature:auth), rafraîchissement /auth/me après preuve
- Étape numéro : ouvrir l'écran Sécurité > Téléphone (changePhone/verifyPhoneChange déjà présents dans AccountContactViewModel)
- Libellés localisés (4 langues) : titre, accroche à 3 variantes, états de preuve, étapes, Plus tard / Fermer, message final
- Fermeture par la touche retour système et clavier physique (Échap), feuille à largeur de formulaire sur tablette

Rendu : Titre title2 arrondi bold, accroche subheadline textSecondary ; preuves footnote semibold success ; boutons hauteur 48 dp rayon md (« Recevoir le code » en dégradé de marque texte blanc bold ; « Ajouter mon numéro » contour indigo400 strong) ; « Plus tard » indigo400 semibold hauteur 44 ; fond theme.backgroundPrimary ; padding xxl.

Transposition Android : UserDefaults jour civil -> DataStore (clé activation_invite_shown_on) ; sheet -> ModalBottomSheet plein écran ; onReceive(currentUser) -> collect du flux de session

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Activation/ActivationInviteHost.swift`
- `apps/ios/Meeshy/Features/Activation/ActivationInviteView.swift`
- `apps/ios/Meeshy/Features/Activation/ActivationInviteViewModel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactViewModel.kt`

### Un contact partagé s'affiche dans la conversation comme une carte, avec « Se connecter » ou « Écrire » en un tap

`cf-contact-card-bubble` · Android : **absente** · P1 · effort L

Dans une bulle, un fichier .vcf / text/vcard devient ContactCardView : carte en verre 256 pt à liseré accent. En-tête cliquable : avatar du compte Meeshy apparié ou pastille dégradée avec icône personne, libellé « CONTACT PARTAGÉ » (caption2 majuscules accent), nom (2 lignes), premier téléphone en chiffres tabulaires, chevron ; tap (haptique léger) ouvre la fiche détaillée. Si un compte Meeshy correspond (ContactResolveService), une rangée d'actions apparaît selon la relation (ContactAccountActions.resolve : soi = rien ; ami = Écrire plein ; demande envoyée = état « Demande envoyée » + Écrire ; demande reçue = état « Vous a envoyé une demande » + Écrire ; aucune = Se connecter plein + Écrire contour). Se connecter est optimiste via l'outbox (relation → requestSent, rollback + toast « Impossible d'envoyer la demande » + haptique erreur) ; Écrire ouvre/crée la conversation directe puis navigue. ContactCardViewModel charge la vCard avec VCardAttachmentLoader (cache mémoire NSCache 200, cache disque d'images, fichiers locaux), affiche « Contact illisible » si le parsing échoue, et pré-remplit depuis les caches synchrones. Accessibilité : étiquette composée (contact partagé, téléphone, sur Meeshy @identifiant).

Écarts :
- Détection d'une pièce jointe carte de visite (mime text/vcard ou extension .vcf, nom de repli « Contact partagé ») dans le rendu des bulles ; aujourd'hui seul le modèle SharedContact existe, sans rendu
- Parseur/écrivain vCard dans le SDK Android (VCard, VCardParser, VCardWriter, ContactCardFile : noms, téléphones, e-mails, adresses, organisation, titre, URLs, anniversaire, note) avec tests
- Chargeur de vCard avec cache mémoire LRU (200) + cache disque + fichiers locaux, états chargé / illisible
- ContactCardViewModel : résolution des comptes, relation optimiste, connexion via l'outbox SEND_FRIEND_REQUEST (existe), ouverture de conversation directe, ensemble busyUserIds anti double-tap
- ContactAccountActions.resolve (table relation → actions) en Kotlin pur testé ; ContactCardField (téléphone, e-mail, adresse, organisation, poste, site, anniversaire, note) avec libellés Mobile / Domicile / Travail / Principal / iPhone / Fax / Bip / Autre
- Composable de carte 256 dp en verre, liseré accent, avatar 36 dp, états d'action (boutons capsule plein/contour accent, libellés d'état), haptiques (léger à l'ouverture, succès/erreur à la connexion)
- Étiquette d'accessibilité composée et indice « Appuyer pour ouvrir le contact »

Rendu : Carte largeur 256 dp, padding md, rayon lg continu, bordure accent alpha medium 1 dp ; libellé caption2 semibold majuscules accent ; nom subheadline bold ; téléphone footnote monospaced ; boutons d'action hauteur 44 dp capsule (plein accent texte blanc / contour accent alpha 0.14), police footnote (compact) ou subheadline (prominent) semibold, échelle min 0,8.

Transposition Android : adaptiveGlass -> surface translucide Material3 avec bordure accent ; NSCache -> LruCache ; DeepLinkRouter.pendingDeepLink -> navigation Routes.chat(id)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
- `apps/ios/Meeshy/Features/Main/Components/ContactCard/ContactCardViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Components/ContactCard/ContactCardRules.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`

### Mon carnet d'adresses se synchronise avec Meeshy par lots, sans jamais purger par erreur

`cf-contact-sync-engine` · Android : **absente** · P1 · effort M

ContactSyncService lit le carnet de l'appareil (nom, téléphones, e-mails, pseudonymes = surnom + profils sociaux) via un lecteur injectable, ne garde que les fiches avec au moins un téléphone, un e-mail ou un identifiant, découpe en lots de 2000 et synchronise avec ContactDirectoryService : PUT (replace) ou PATCH (merge) sur /directory/contacts ; une découpe multi-lots passe en merge, répète le jeton syncStartedAt (horloge serveur du premier lot) et ne pose isFinalBatch qu'au dernier lot en replace (la purge n'a lieu qu'au final) ; repli « legacySingleShot » si la gateway ne renvoie pas de jeton (lot tronqué en merge). Résultat : totalContacts, processedContacts, syncedCount, matchedCount, removedCount. findFriendsFromContacts passe par POST /users/me/contacts/match (ContactMatchService) par lots. ContactDirectoryService lit aussi GET /directory/contacts (limit, filter all/meeshy/invitable, cursor, q, updatedSince) ; listAll pagine jusqu'à 500 pages de 100. Le code pays par défaut vient de la région de l'appareil.

Écarts :
- Déclarer READ_CONTACTS et implémenter le flux de permission (non déterminé / accordé / refusé / refus définitif) avec erreur typée ContactSyncError.accessDenied et message « Accès aux contacts refusé. Tu peux l'activer dans Réglages. »
- DeviceContactBookReading Android : requêtes ContactsContract.Data (StructuredName, Phone, Email, Nickname, Im/Website) hors thread principal, normalisation des numéros tels que fournis, nom = prénom + nom
- ContactDirectoryApi (Retrofit) : PUT/PATCH /api/v1/directory/contacts, GET /api/v1/directory/contacts avec limit, filter, cursor, q, updatedSince ; modèles DirectoryContact, MatchedContactUser, DirectorySyncRequest/Result, ContactMatchEntry, DirectoryFilter, DirectorySyncMode
- Algorithme de lots : taille 2000, mode forcé merge si plusieurs lots, jeton syncStartedAt répété, isFinalBatch au dernier lot seulement en replace, repli legacy single-shot ; agrégation des compteurs et removedCount du dernier lot
- ContactMatchApi : POST /api/v1/users/me/contacts/match par lots avec defaultCountry (Locale / TelephonyManager)
- listAll paginé (pages de 100, plafond 500 pages, journalisation si tronqué) et cache persistant « phonebook:all » (Room) avec lecture SWR
- Synchronisation silencieuse au premier chargement si le répertoire serveur est vide ET la permission déjà accordée (jamais de demande de permission surprise)
- Tests de pureté : batches(), cartographie des entrées, fusion des résultats (portage des tests iOS de ContactSyncService)

Rendu : Aucune UI propre : les erreurs sont affichées par les toasts des écrans appelants (Répertoire, Découvrir).

Transposition Android : CNContactStore -> ContentResolver + ContactsContract.CommonDataKinds ; permission Contacts -> READ_CONTACTS (runtime) ; Locale.current.region -> Locale.getDefault().country ; synchronisation en arrière-plan optionnelle -> WorkManager

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ContactSyncService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ContactDirectoryService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ContactMatchService.swift`

</details>

### Le clavier numérique retrouve une personne Meeshy par numéro ou par nom et l'appelle

`cf-dial-keypad` · Android : **absente** · P1 · effort M

KeypadTab : champ « Numéro ou nom » (26 pt arrondi, centré), pavé 4x3 (1 2 3 / 4 5 6 / 7 8 9 / + 0 #) avec lettres ABC…, touches 72x56 sans fond, bouton retour arrière (appui long 0,4 s = tout effacer, action d'accessibilité nommée), résultats entre champ et pavé. KeypadViewModel classe la saisie : numéro (chiffres + - ( ) . espaces, au moins 3 chiffres) → recherche par téléphone (GET users/phone/{chiffres}, un 404 = aucun résultat normal) ; sinon nom (au moins 2 caractères) → users/search limit 20 ; debounce 300 ms, résultats d'une saisie périmée ignorés. États : spinner pendant la recherche, « Aucun contact trouvé / Vérifiez le numéro ou le nom saisi », invite « Composez un numéro ou un nom » à l'état initial ou en erreur. Chaque résultat : avatar avec présence et contour, nom, @identifiant, tap = fiche profil, bouton d'appel (menu audio/vidéo) dont le repli, sans conversation directe, ouvre le profil.

Écarts :
- Écran/onglet Clavier complet (aucun équivalent n'existe) : champ, pavé 4x3, retour arrière avec appui long = effacer tout, haptique léger à chaque touche, haptique medium à l'effacement total
- KeypadViewModel : classification numéro / nom, seuils (3 chiffres, 2 caractères), debounce 300 ms, garde de requête courante, états idle / loading / loaded / error
- Recherche par téléphone via UserApi.getProfileByPhone (existe : users/phone/{phone}) avec 404 traité comme « aucun résultat » ; recherche par nom via UserApi.search (existe)
- Lignes de résultat avec présence résolue, contour, tap = profil, bouton d'appel avec menu Appel vocal / Appel vidéo et repli profil si aucune conversation directe
- Hints d'état (invite, aucun contact trouvé, spinner indigo500) et libellés d'accessibilité : champ, touche (chiffre), effacer, tout effacer, résultat + ouvrir le profil
- Brancher le démarrage d'appel sur le flux d'appel existant (CallViewModel / CallRoute) en passant userId + conversationId optionnel

Rendu : Champ 64 dp de haut, texte 26 sp arrondi medium centré, séparateur bas opacité light ; touches 72x56 dp, chiffre 30 sp arrondi regular textPrimary, lettres 9 sp semibold tracking 1 textMuted ; espacement horizontal 28 dp, vertical mdPlus ; séparateur haut du pavé ; spinner indigo500.

Transposition Android : TextField .phonePad + pavé custom -> OutlinedTextField sans clavier système + Grid de boutons ; LongPressGesture -> combinedClickable(onLongClick) ; CallStarter -> navigation CallRoute.start

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift`
- `apps/ios/Meeshy/Features/Contacts/KeypadViewModel.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`

### « Retrouver mes contacts sur Meeshy » montre qui de mon carnet est déjà inscrit

`cf-discover-device-import` · Android : **absente** · P1 · effort M

Dans Découvrir, le bouton pleine largeur « Retrouver mes contacts sur Meeshy » (contour indigo500, spinner pendant l'import) propose d'abord la feuille « Ajoute ton numéro » si le compte n'a pas de numéro (PhonePromptPolicy), puis synchronise le carnet (syncDirectory mode replace), relit TOUT le répertoire filtré « meeshy » par pages, et affiche la section « Déjà sur Meeshy » : lignes avatar/humeur/présence avec nom (ou « Dans tes contacts : nom du carnet »), tap = profil, ConnectionActionView. Aucun inscrit : toast « Aucun de tes contacts n'est encore sur Meeshy — invite-les ! ». Refus d'accès : toast « Accès aux contacts refusé. Tu peux l'activer dans Réglages. ».

Écarts :
- Bouton d'import avec états (repos, spinner, désactivé) et description d'accessibilité “Retrouver mes contacts qui sont déjà sur Meeshy”
- Demande de permission runtime READ_CONTACTS (rationale + redirection vers les réglages si refus définitif) : la permission n'est pas déclarée dans AndroidManifest
- Section « Déjà sur Meeshy » (carte en verre, titre avec icône person.2.wave.2.fill) alimentée par GET directory/contacts?filter=meeshy paginé ; libellé « Dans tes contacts : … » si le nom du carnet diffère
- Toasts et haptiques : succès (haptique), aucun inscrit, accès refusé, échec générique « Impossible d'importer les contacts »
- Enchaînement avec l'invite de numéro avant l'import (cf-phone-prompt) puis relance de l'import à la fermeture

Rendu : Bouton rayon smPlus, contour indigo500 alpha medium 1 dp, icône person.crop.circle.badge.plus callout medium, texte subheadline semibold indigo500 ; section en carte de verre padding mdPlus.

Transposition Android : CNContactStore -> ContactsContract via ContentResolver + permission READ_CONTACTS (ActivityResultContracts.RequestPermission)

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift`
- `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.kt`
- `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift`
- `apps/ios/Meeshy/Features/Contacts/PhonePromptPolicy.swift`

</details>

### Un numéro manifestement faux (trop court, 11111…, 123123…) est refusé avant l'envoi

`cf-phone-plausibility` · Android : **absente** · P1 · effort S

PhonePlausibility est la règle pure partagée par l'inscription et le mot de passe oublié : au moins 9 chiffres, pas de suite de 5 chiffres identiques, pas de motif répété (unité de 1 à 4 chiffres répétée au moins 3 fois sur toute la longueur). Elle rend un motif de refus (too-short, identical-run, repeated-pattern) ou null.

Écarts :
- Objet pur PhonePlausibility dans :core:model (digitsOnly, refusal, isPlausible) avec les constantes minDigits 9, maxIdenticalRun 5, maxRepeatedUnit 4 et tests unitaires JVM
- Brancher la règle sur l'inscription, le parcours « mot de passe oublié par téléphone » et la feuille d'ajout de numéro, avec message d'erreur localisé par motif

Rendu : Message d'erreur inline sous le champ téléphone, couleur error, caption.

Transposition Android : Kotlin pur dans :core:model (aucune dépendance Android)

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/PhonePlausibility.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupViewModel.kt`

### L'onglet Répertoire liste mon carnet, qui est sur Meeshy et qui je peux inviter

`cf-phonebook-directory` · Android : **absente** · P1 · effort M

Dans Contacts, le filtre Répertoire monte PhonebookListView : champ de recherche + bouton de synchronisation rond indigo500 38 pt (spinner pendant la sync, zone tactile 44 pt), pastilles Tous / Sur Meeshy (n) / À inviter, liste de DirectoryPersonRow (nom du carnet d'abord, sous-titre, avatar du compte apparié, présence, contour ; action « Lui écrire » pour un compte Meeshy → ouvre/crée la conversation directe et y navigue, « Inviter » pour les autres → composeur SMS pré-rempli « Salut {nom} ! Rejoins-moi sur Meeshy : https://meeshy.me/download »). La recherche filtre localement (nom, identifiant, e-mails, téléphones) ; sans résultat local et au moins 2 caractères, elle relaie vers la plateforme (users/search, débounce 300 ms) sous l'en-tête « Sur Meeshy, hors de ton répertoire ». États : squelette sur cache froid, « Répertoire vide » + indice de synchronisation, « Aucun résultat », erreurs toast (SMS indisponible, contact sans numéro). Cache-first SWR (« phonebook:all »), tirer-pour-rafraîchir, toast « %d contacts synchronisés, %d sur Meeshy ».

Écarts :
- Écran/composable Répertoire complet avec état (contacts, loadState, isSyncing, filtre, recherche, résultats plateforme) et dérivés (visibleContacts, meeshyCount) ; aujourd'hui le filtre Phonebook de ContactFilter est un pass-through sans source de données
- Bouton de synchronisation (icône arrows, spinner, désactivé en cours) précédé de l'invite de numéro si nécessaire (cf-phone-prompt)
- Filtres Tous / Sur Meeshy (compteur) / À inviter ; recherche locale multi-champs ; relais plateforme avec debounce 300 ms et rejet des réponses périmées, exclusion de soi
- Action « Lui écrire » : ouvrir/créer la conversation directe (ConversationCreator équivalent) puis naviguer + haptique succès ; action « Inviter » : intent SMS pré-rempli avec le message à nom, erreurs “Cet appareil ne peut pas envoyer de SMS” et “Ce contact n'a pas de numéro”
- DirectoryContact.resolvedName (nom du carnet d'abord), subtitle, invitablePhoneNumber, asContactMatch ; lecture cache-first avec revalidation et préservation du cache affiché en cas d'échec réseau
- États vides : « Répertoire vide / Synchronise ton carnet d'adresses pour retrouver tes contacts sur Meeshy » et « Aucun résultat » ; squelette partagé
- Libellés de compteur (n) cachés à 0 et libellé d'accessibilité “sur Meeshy / pas encore sur Meeshy”

Rendu : En-tête : champ de recherche + bouton rond 38 dp indigo500 (hit target 44 dp) ; pastilles défilantes ; lignes DirectoryPersonRow ; en-tête de section caption semibold muted avec mini spinner ; bouton d'action capsule (Lui écrire plein indigo500 / Inviter contour indigo500 alpha strong), icônes bubble.left.fill / paperplane.fill.

Transposition Android : MFMessageComposeViewController -> ACTION_SENDTO smsto: ; refreshable -> PullToRefreshBox ; routeur.navigateToConversation -> Routes.chat(id)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Contacts/PhonebookListView.swift`
- `apps/ios/Meeshy/Features/Contacts/PhonebookViewModel.swift`
- `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`

### La fiche du contact partagé affiche tous ses champs, se copie à l'appui long et propose Ajouter ou Inviter

`cf-contact-card-detail-sheet` · Android : **absente** · P2 · effort M

ContactCardDetailSheet est une fiche modale plein écran sur fond flouté (matériau ultra fin + voile noir, tap pour fermer, Échap) où la carte entre en ressort 0.38/0.86 (échelle 0,94 → 1, simple fondu si réduction des animations). En-tête : pastille dégradée accent à initiales 52 pt, nom title3 bold, « poste · organisation », bouton fermer 44 pt. Corps défilant : liste de champs (téléphone, e-mail, adresse, organisation, poste, site, anniversaire sans année localisé en UTC, note) avec icône accent, libellé et valeur ; appui long 0,4 s copie la valeur (haptique succès + toast « %@ copié »), action d'accessibilité Copier. Pour chaque compte Meeshy trouvé : section « SUR MESHYY » (bannière 84 pt ou dégradé, avatar chevauchant, nom, @identifiant, bio, bande GameContactStrip de trois coupes, rangée d'actions prominente qui ferme la fiche avant de naviguer). Pied : « Ajouter aux contacts » (ouvre l'éditeur de contact inconnu pré-rempli depuis la vCard) et, si aucun compte et un téléphone, « Inviter sur Meeshy » (composeur SMS avec le message nominatif).

Écarts :
- Dialogue/fiche plein écran avec flou d'arrière-plan (RenderEffect ou voile), animation d'entrée ressort / fondu selon les réglages d'animation, fermeture par tap extérieur, bouton retour système et bouton fermer
- Liste de champs avec icônes (phone, mail, place, business, work, link, cake, note), libellés localisés, appui long = copier dans le presse-papiers + haptique + toast « %@ copié » ; action d'accessibilité Copier
- Formatage de l'anniversaire sans année (jour + mois localisés, fuseau UTC) et avec année
- Section « Sur Meeshy » : bannière, avatar chevauchant, bio, bande de jeux (GameContactStrip, hors lot) et rangée d'actions prominente
- Pied : Ajouter aux contacts (Intent ACTION_INSERT_OR_EDIT avec ContactsContract.Intents.Insert pré-rempli) ; Inviter sur Meeshy (ACTION_SENDTO smsto: + message nominatif) si aucun compte
- Initiales d'avatar (MeeshyAvatar.initials) et libellés d'accessibilité (Fermer la fiche, étiquette champ + valeur)

Rendu : Carte maxWidth 520, rayon 28 continu, bordure accent alpha medium, ombre rayon 24 y 10 ; groupe de champs fond primary alpha faint rayon md, séparateurs décalés de 48 ; bannière 84 dp ; section Sur Meeshy en-tête caption semibold majuscules accent ; boutons de pied capsule accent alpha light hauteur 44 dp.

Transposition Android : CNContactViewController(forUnknownContact) -> Intent ACTION_INSERT_OR_EDIT (ContactsContract.Contacts.CONTENT_ITEM_TYPE) ; UIPasteboard -> ClipboardManager ; ultraThinMaterial -> voile + blur (API 31+) avec repli opaque

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ContactCard/ContactCardDetailSheet.swift`

</details>

### Je partage un contact de mon carnet comme carte de visite dans une conversation

`cf-contact-card-share` · Android : **absente** · P2 · effort M

ContactPickerView (CNContactPickerViewController) laisse choisir une fiche du carnet ; ContactCardExporter la convertit en vCard (sérialisation système sans photo, repli VCardWriter), nom de fichier « Nom du contact.vcf » assaini (60 caractères max, caractères interdits retirés) écrit dans un dossier temporaire unique, puis le fichier est joint au message comme n'importe quelle pièce jointe (type text/vcard). Une fiche vide est refusée.

Écarts :
- Entrée « Contact » dans le menu de pièces jointes du composer (ACTION_PICK sur ContactsContract.Contacts.CONTENT_URI ou ActivityResultContracts.PickContact)
- Export en vCard 3.0/4.0 depuis le contact choisi (ContentResolver : nom, téléphones typés, e-mails, adresses, organisation, poste, URLs, anniversaire ; sans photo) via VCardWriter ; refus si fiche vide
- Nom de fichier assaini (caractères / \ : ? % * | " < > retirés, 60 caractères max, repli « contact ») + dossier temporaire unique ; envoi via le pipeline d'upload existant avec mime text/vcard
- Tests purs : fileName(for:), conversion vers VCard

Rendu : Aucun écran propre : le sélecteur est le sélecteur système ; la pièce jointe apparaît dans le composer comme une vignette de contact.

Transposition Android : CNContactPickerViewController -> ActivityResultContracts.PickContact ; CNContactVCardSerialization -> VCardWriter maison ; dossier temporaire -> cacheDir/UUID/

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ContactCard/ContactCardExporter.swift`
- `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Un contact partagé est reconnu comme compte Meeshy sans rappeler le serveur à chaque affichage

`cf-contact-resolve-service` · Android : **absente** · P2 · effort S

ContactResolveService résout une carte de visite (téléphones, e-mails) en comptes publics via POST /contacts/resolve : cache mémoire de 200 entrées à fraîcheur 10 min, mémoire d'échec 2 min (sert l'ancien résultat), coalescence des requêtes identiques en vol, cachedAccounts synchrone pour un premier rendu instantané, updateRelation qui réécrit la relation (ami, demande envoyée…) dans toutes les entrées, purge à la déconnexion (annule les tâches en vol).

Écarts :
- ContactResolveApi (POST /api/v1/contacts/resolve) et modèles ContactResolveRequest/Response, PublicContactAccount (userId, username, displayName, avatarUrl, bannerUrl, bio, relation), ContactRelation (current, friend, requestSent, requestReceived, none)
- Registre thread-safe : LRU 200, fraîcheur 600 s, backoff d'échec 120 s, tâches en vol dédupliquées, réécriture de relation, purge de session
- Tests de pureté sur la politique de cache (fraîcheur, échec, coalescence)

Rendu : Aucune UI : alimente la carte de visite.

Transposition Android : Locked(Ledger) -> Mutex + Map dans un singleton Hilt ; Task -> Deferred coroutine

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ContactResolveService.swift`

</details>

### Appuyer sur la notification d'un nouveau contact ouvre sa fiche prête à être enregistrée

`cf-notification-contact-presenter` · Android : **absente** · P2 · effort S

NotificationContactPresenter présente, 700 ms après l'ouverture (le temps que l'app soit en avant-plan), la fiche « contact inconnu » pré-remplie depuis la carte de la notification (nom coupé en prénom / nom, téléphone mobile, e-mail) avec un bouton Fermer, sans actions système.

Écarts :
- Détail de notification de type contact (NotificationContactCard : nom, téléphone, e-mail) dans NotificationDestination et le routage push
- Lancement d'un Intent ACTION_INSERT_OR_EDIT pré-rempli (NAME, PHONE avec TYPE_MOBILE, EMAIL) après un délai d'environ 700 ms quand l'app est au premier plan
- Séparation prénom / nom : premier mot / reste

Rendu : Écran système d'ajout de contact ; aucun style propre à Meeshy.

Transposition Android : CNContactViewController(forUnknownContact:) -> Intent ACTION_INSERT_OR_EDIT + ContactsContract.Intents.Insert

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ContactCard/NotificationContactPresenter.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`

### Découverte d'utilisateurs : sous-onglets Découvrir, Demandes, Bloqués dans cet ordre

`cf-discovery-hub-shell` · Android : **divergente** · P1 · effort S

Les trois surfaces de gestion de connexions ont quitté l'annuaire : DiscoveryTab (Découvrir avec loupe, Demandes avec person.badge.plus, Bloqués avec hand.raised.fill) forme les sous-onglets de PeopleDiscoveryView, joignable depuis l'échelle du menu flottant et par deep link (Route.peopleDiscovery(DiscoveryTab)). Les sous-onglets partagent HubTabButton (avec badge de compteur) avec le hub Personnes. Découvrir est l'atterrissage par défaut, puis Demandes, puis Bloqués.

Écarts :
- Séparer l'écran Découverte (Découvrir / Demandes / Bloqués) de l'annuaire : l'onglet Contacts quitte ce TabRow et passe dans le hub Personnes
- Réordonner les sous-onglets : Découvrir (par défaut), Demandes, Bloqués ; icônes search / person_add / front_hand
- Deep link et paramètre d'onglet initial par enum DiscoveryTab (Routes.CONTACTS_DISCOVER existe, mais pas de variante Demandes ni de routage depuis notifications)
- Badge de compteur sur l'onglet Demandes (déjà présent sur Android pour les demandes reçues) à reporter dans la barre HubTabButton partagée
- Accès depuis l'échelle du menu flottant (MeeshyMenuFab) vers Découverte et vers Appels

Rendu : Même barre d'onglets que le hub Personnes (HubTabButton) : icône + titre caption semibold, soulignement 2 dp indigo500 ; en-tête repliable identique.

Transposition Android : PeopleDiscoveryView -> écran Compose à 3 onglets (TabRow ou barre HubTab partagée) avec contenu paginé ou conditionnel

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Le hub Personnes s'ouvre sur Appels, Clavier ou Contacts, avec onglets glissables et en-tête qui se replie

`cf-people-hub-shell` · Android : **divergente** · P1 · effort M

ContactsHubView est la racine « Personnes » : trois onglets primaires (Appels, Clavier, Contacts) sous un CollapsibleHeader qui se replie au scroll de l'onglet actif, une barre d'onglets (HubTabButton : icône + titre + soulignement indigo animé) et un TabView paginé que l'on balaie horizontalement. Chaque onglet remonte son offset de scroll au hub (ContactsScrollSentinel + reportsContactsScroll, double voie iOS 16-17 / iOS 18+). Le changement d'onglet remet l'en-tête déployé et déclenche un retour haptique léger. L'onglet initial est paramétrable (l'échelle du menu flottant atterrit sur Appels). Les ViewModels (clavier, appels, liste, répertoire, affiliés) vivent au niveau du hub pour survivre aux allers-retours entre onglets.

Écarts :
- Remplacer le TabRow à 4 onglets par un hub à 3 onglets Appels / Clavier / Contacts ; aujourd'hui le journal d'appels est un écran séparé (route calls) et le clavier n'existe pas
- Pager horizontal glissable (HorizontalPager) synchronisé avec la barre d'onglets, animation ressort (response 0.4 / damping 0.8) au changement d'onglet
- En-tête repliable : titre = nom de l'onglet actif, flèche retour indigo500, se replie avec l'offset de scroll de l'onglet actif (nestedScroll / TopAppBar exitUntilCollapsed ou en-tête custom) et se redéploie au changement d'onglet
- Barre d'onglets personnalisée (icône phone.fill / circle.grid.3x3.fill / person.2.fill, titre caption semibold, soulignement 2 dp indigo500 animé) avec description d'accessibilité “Onglet X” et état sélectionné
- Paramètre d'onglet initial (Appels depuis l'échelle du menu flottant, Contacts par défaut) et route de navigation dédiée
- Retour haptique léger au changement d'onglet ; ViewModels des onglets conservés au niveau du hub (pas recréés à chaque onglet)

Rendu : Fond theme.backgroundPrimary ; barre d'onglets pleine largeur, 3 cellules égales, séparateur bas à opacité medium ; onglet sélectionné indigo500, non sélectionné textMuted ; texte caption semibold, icône footnote medium ; soulignement 2 dp indigo500 avec ressort 0.3/0.7 ; badge rond indigo500 blanc caption2 bold si compteur > 0.

Transposition Android : TabView .page -> HorizontalPager ; CollapsibleHeader -> TopAppBar avec enterAlways/exitUntilCollapsed ou en-tête custom pilotée par nestedScroll ; HapticFeedback.light -> LocalHapticFeedback (TextHandleMove)

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift`
- `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsScreen.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsViewModel.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Les écrans Contacts partagent la même barre de recherche, les mêmes pastilles de filtre et le même squelette de chargement

`cf-shared-ui-kit` · Android : **divergente** · P1 · effort M

ContactsShared et ContactsSkeletonList regroupent les briques communes : ContactsSearchField (loupe, champ sans autocorrection, bouton d'effacement, fond inputBackground, rayon sm), ContactsFilterChip (capsule indigo500 pleine si sélectionnée, sinon contour indigo900 à opacité medium ; variante cible 44 pt), DirectoryPersonRow (avatar + nom + sous-titre + bouton capsule « Lui écrire » plein / « Inviter » discret, Equatable) , ContactsSkeletonList (5 lignes avatar + deux barres avec shimmer, jamais de spinner nu sur cache vide), l'extension LoadState.collapsedForList, le libellé localisé de CallDirection (appel émis / reçu / manqué) et l'extension Date.relativeTimeString.

Écarts :
- Composable ContactsSearchField partagé (placeholder, croix d'effacement avec description d'accessibilité “Effacer la recherche”, fond inputBackground, rayon 8-10 dp) à la place des OutlinedTextField Material de chaque onglet
- Composable ContactsFilterChip en capsule (indigo500 plein sélectionné ; contour indigo900 alpha medium sinon ; minHeight 44 dp optionnel) à la place des FilterChip Material
- Composable DirectoryPersonRow (action Écrire plein / Inviter contour) pour répertoire, résultats plateforme et affiliés
- ContactsSkeletonList : 5 lignes surface en dégradé teinté + avatar 44 dp + barres 120x14 et 80x11 avec shimmer, remplaçant les CircularProgressIndicator des onglets Contacts, Découvrir, Bloqués, Demandes
- Composable d'état vide commun (icône + titre + sous-titre) à la place du simple Text centré
- Formatter de temps relatif long (“il y a 3 min”) partagé et libellés de direction d'appel localisés (émis / reçu / manqué)
- Clés de chaînes en 4 langues (fr, en, es, pt) pour tous les libellés du hub : seules en/fr/es/pt existent, vérifier la parité des clés iOS contacts.*

Rendu : Rayons MeeshyRadius sm/md, paddings MeeshySpacing mdPlus/xsPlus, chip footnote semibold, séparateurs Divider opacité light décalés de 70 dp, textes subheadline semibold (nom) / caption medium (identifiant), couleurs indigo500 / textMuted / success / warning / error.

Transposition Android : Briques SwiftUI -> composables dans :sdk-ui ou :feature:contacts ; shimmer -> MeeshySkeletonBox existant

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`
- `apps/ios/Meeshy/Features/Contacts/ContactsSkeletonList.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsListTab.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/DiscoverTab.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`

### Inviter dans une conversation : un lien prêt à copier ou partager, personnalisable en option

`cf-invite-friends-sheet` · Android : **divergente** · P2 · effort M

InviteFriendsSheet (depuis la liste de conversations) crée le lien d'invitation en arrière-plan dès l'ouverture avec des défauts sûrs (messages, images, historique autorisés ; fichiers refusés ; pseudo requis) et le présente dans une carte en deux phases. Phase 1 : carte (icône de conversation selon le type, nom, « n membres · type »), message d'invitation modifiable (2 à 4 lignes, placeholder par défaut), puce du lien en monospace avec bouton « Copier » → « Copié ! » vert pendant 1,5 s (haptique succès), résumé « expiration + icônes de permissions » (étiquette d'accessibilité composée), gros bouton « Partager » en dégradé de l'accent de la conversation (régénère le lien si les options ont changé, puis feuille de partage système), « Personnaliser les options ». Phase 2 : sections IDENTITÉ (nom du lien), LIMITES (expiration Jamais / 24 h / 7 j / 30 j / 3 mois, limiter les utilisations avec stepper 1–10 000), PERMISSIONS (messages, images, fichiers, historique), ACCÈS (compte requis, pseudo, e-mail). Création via ShareLinkService.createShareLink.

Écarts :
- Créer le lien automatiquement à l'ouverture avec les défauts iOS (allowMessages/Images/History vrai, allowFiles faux, requireNickname vrai) ; Android exige de remplir un formulaire complet avant toute création
- Carte d'aperçu en phase 1 : en-tête de conversation (icône selon le type, accent), message d'invitation modifiable, puce du lien avec copie + feedback « Copié ! » 1,5 s, résumé expiration/permissions
- Bouton « Partager » en dégradé qui régénère le lien si les options ont été modifiées (optionsModified) puis ouvre le chooser système ; “Personnaliser les options” déplie les sections IDENTITÉ / LIMITES / PERMISSIONS / ACCÈS avec transition
- Expirations Jamais / 24 h / 7 j / 30 j / 3 mois (existent), limite d'utilisations avec stepper pas 1 puis 10, valeur max 10 000
- Point d'entrée « Inviter » depuis la liste de conversations (action de ligne / menu) ouvrant cette feuille ; la route actuelle n'existe que depuis la barre du chat pour modérateurs
- Étiquettes d'accessibilité (Copier le lien d'invitation, Partager le lien, Personnaliser les options, résumé des permissions)

Rendu : Carte rayon xl en matériau fin avec bordure accent alpha light ; icône de conversation dans un cercle 44 dp accent alpha light ; puce du lien fond accent alpha subtle rayon sm, texte monospace accent ; bouton Partager hauteur ~56 dp rayon lg dégradé accent→accent intense, texte headline bold blanc ; sections en cartes avec icônes colorées (error, info).

Transposition Android : ShareSheet (UIActivityViewController) -> Intent.createChooser(ACTION_SEND) ; UIPasteboard -> ClipboardManager ; .sheet -> ModalBottomSheet

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/CreateShareLinkScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkPickerScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`

### Mes demandes d'amis reçues et envoyées s'acceptent, se refusent et s'annulent instantanément, même hors ligne

`cf-friend-requests-inbox` · Android : **partielle** · P0 · effort M

RequestsTab : deux pastilles Reçues (n) / Envoyées (n) avec ressort et haptique léger. Reçue : avatar (humeur, contour), nom, @identifiant, message de la demande ou « Souhaite entrer en contact avec vous », ancienneté, deux boutons ronds 44 pt (croix neutre = refuser, coche verte en dégradé = accepter). Envoyée : avatar, nom, @identifiant, ancienneté, capsule « En attente » (warning) et bouton « Annuler » (contour error). États vides illustrés (Aucune demande reçue / envoyée + sous-titre), tirer-pour-rafraîchir, pagination quand la dernière ligne apparaît (30 par page ; envoyées : seulement status pending, jusqu'à 5 pages par atteinte). RequestsViewModel est cache-first (CacheFirstLoader par direction), accepte/refuse en optimiste via l'outbox (respondFriendRequest avec ClientMutationId, FriendshipCache mis à jour, ami injecté dans le cache persistant, rollback sur événement exhausted), annule via DELETE-équivalent (dismiss) avec rollback, toasts (Connexion acceptée / Demande refusée / Demande annulée et leurs échecs) et haptiques (succès, medium, erreur), repeint les lignes sur user:updated. FriendRequestListView est l'écran autonome « Demandes d'amis » (route friends.requests) : mêmes lignes, et à l'ouverture il marque lues les notifications friend_request, contact_request, friend_accepted, contact_accepted.

Écarts :
- Accepter/refuser doivent passer par l'outbox : ajouter OutboxKind.RESPOND_FRIEND_REQUEST (cmid, lane friend, payload action accept/reject) + MutationSender + rollback sur échec définitif ; aujourd'hui l'appel est en ligne seulement et échoue hors connexion
- Remplacer les deux sections “Reçues / Envoyées” d'une même liste par deux pastilles avec compteurs (n) et ressort ; état vide propre à chaque direction avec icône et sous-titre
- Ligne reçue : message de la demande (2 lignes) ou « Souhaite entrer en contact avec vous », ancienneté relative, boutons ronds 44 dp (croix muted / coche en dégradé success), libellés d'accessibilité “Accepter / Refuser la demande de X”
- Ligne envoyée : capsule « En attente » (warning alpha light) + bouton Annuler contour error ; n'afficher que les demandes pending
- Pagination par offset au bas de liste (30 par page ; envoyées : filtre pending, 5 pages max par atteinte) — Android ne charge que 20 par direction sans suite
- Toasts (Connexion acceptée, Demande refusée, Demande annulée, échecs) et haptiques succès/medium/erreur ; aucun retour utilisateur aujourd'hui hors errorMessage non affiché
- Injection optimiste de l'ami accepté dans le cache persistant (liste d'amis) avant le retour réseau, invalidation des caches d'amis
- Tirer-pour-rafraîchir par direction ; repeindre sur user:updated
- Écran autonome « Demandes d'amis » (route dédiée) qui marque lues les notifications friend_request / contact_request / friend_accepted / contact_accepted à l'ouverture
- Avatars avec URL, humeur et contour ; squelette partagé au lieu du spinner

Rendu : Pastilles : texte footnote semibold + (n) caption bold, capsule indigo500 pleine / contour indigo900 ; lignes padding xl/md ; bouton refuser cercle 44 dp fond textMuted alpha light ; bouton accepter cercle 44 dp dégradé success→successDeep ; capsule En attente warning alpha light ; Annuler capsule contour error alpha medium ; transition opacité + déplacement trailing 0,2 s.

Transposition Android : OfflineQueue.enqueue(.respondFriendRequest) -> OutboxRepository.enqueue + OutboxFlushWorker ; FeedbackToastManager -> MeeshyFeedbackToast ; markRead -> NotificationsRepository

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Contacts/RequestsTab.swift`
- `apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsScreen.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRequestListRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendshipCache.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/UserRequests.kt`

### Bloquer ou débloquer quelqu'un depuis n'importe où est instantané et se corrige seul en cas d'échec

`cf-block-action` · Android : **partielle** · P1 · effort S

BlockActionCoordinator est l'unique point d'entrée de blocage depuis le profil, le menu d'une conversation, etc. : il capture l'état précédent, applique le changement optimiste dans le BlockService, met en file l'action blockUser / unblockUser dans l'outbox (ClientMutationId), observe le flux d'issue et, sur événement exhausted ou échec d'enqueue, restaure l'état et montre un toast « Impossible de bloquer / débloquer cet utilisateur » avec haptique d'erreur.

Écarts :
- Aucun point d'entrée UI pour bloquer (profil, menu de conversation, en-tête de chat) : seule la voie de déblocage de la liste appelle setBlockedDurably
- Coordinateur applicatif (BlockActionCoordinator) avec capture de l'état précédent, observation de l'issue de l'outbox (rollback + message sur échec définitif) et déclenchement du OutboxFlushWorker
- Toast d'erreur localisé et haptique d'erreur en cas de rollback ; dialogue de confirmation avant de bloquer
- Propagation immédiate à toutes les surfaces (messages d'une personne bloquée, présence, suggestions) via BlockCache

Rendu : Toast d'erreur MeeshyFeedbackToast (kind Error) ; action destructive du menu en rouge error.

Transposition Android : OfflineQueue.shared -> OutboxRepository + OutboxFlushWorker ; outcomeStream -> flux d'état des lignes de l'outbox

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/BlockActionCoordinator.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`

### Bloquer et débloquer passent par les routes canoniques et mettent à jour toute l'app aussitôt

`cf-block-service-sdk` · Android : **partielle** · P1 · effort S

BlockService (SDK) : PUT /directory/blocks/{userId} (bloquer, émet l'événement social négatif block sur le profil), DELETE /directory/blocks/{userId} (débloquer), GET /directory/blocks (liste, hydrate l'ensemble blockedUserIds), isBlocked, setBlockedOptimistic (mise à jour locale instantanée publiée aux vues), refreshCache, reset à la déconnexion. Le modèle BlockedUser porte id, username, displayName, avatar, blockedAt et name = displayName ?? username.

Écarts :
- Routes : BlockApi vise users/me/blocked-users et users/{id}/block (legacy) ; migrer vers GET /directory/blocks et PUT|DELETE /directory/blocks/{userId} (rétrocompatible : l'ancien chemin reste servi)
- Émission de l'événement social négatif « block » (SocialInteractionEvents) à chaque blocage pour que le fil, les stories et les suggestions masquent la personne
- Vider BlockCache et les listes persistées à la déconnexion (reset de session) ; refreshCache au démarrage de session
- BlockedUser.blockedAt (date) dans le modèle si absent du décodeur Android

Rendu : Aucune UI : couche données.

Transposition Android : BlockServiceProviding -> BlockRepository + BlockCache (SSOT) ; SocialEventsV2Hub -> bus d'événements social existant côté Android

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/BlockService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/BlockApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockCache.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/BlockedUser.kt`

### La liste des utilisateurs bloqués se débloque avec confirmation, balayage et retour immédiat

`cf-blocked-users-list` · Android : **partielle** · P1 · effort S

BlockedTab (onglet de la découverte) et BlockedUsersView (écran autonome « Utilisateurs bloqués », en-tête repliable, accent error) listent les comptes bloqués : avatar (masqué des lecteurs d'écran), nom, @identifiant, bouton « Débloquer » (contour warning dans l'onglet, capsule error dans l'écran autonome) qui ouvre une alerte « Débloquer ? / Débloquer X ? ». Le ViewModel est cache-first (CacheFirstLoader « blocked:list »), tire-pour-rafraîchir, déblocage optimiste via l'outbox (unblockUser avec cmid) : la ligne disparaît, BlockService.setBlockedOptimistic met à jour le cache global, toast « Utilisateur débloqué » + haptique medium ; rollback + toast d'erreur si l'outbox refuse ou épuise. L'écran autonome offre en plus un balayage trailing vert « Débloquer » (plein balayage), un squelette de 4 lignes en verre et un état vide « Aucun utilisateur bloqué ».

Écarts :
- Tirer-pour-rafraîchir (loadBlocked(forceNetwork)) ; aucun geste de rafraîchissement aujourd'hui
- Toasts « Utilisateur débloqué » / « Impossible de débloquer » et haptique medium/erreur ; écoute de l'issue durable de l'outbox (rollback de la ligne sur échec définitif, pas seulement sur échec d'enqueue local)
- État vide illustré (icône hand.raised.slash, titre « Aucun utilisateur bloqué », sous-titre « Les personnes que vous bloquez apparaîtront ici. ») et squelette partagé au lieu du CircularProgressIndicator
- Écran autonome « Utilisateurs bloqués » (accès Paramètres > Confidentialité) avec en-tête repliable accent error, lignes en carte teintée error, balayage trailing vert avec confirmation, bouton capsule error alpha light
- Avatars avec URL ; bouton Débloquer en contour warning (onglet) ; description d'accessibilité “Débloquer X”
- Afficher l'erreur de chargement seulement hors-ligne/échec réel (aujourd'hui OK) et garder la liste en cache lorsqu'une revalidation échoue

Rendu : Ligne : avatar 44 dp, nom subheadline semibold, @username caption muted ; bouton Débloquer capsule contour warning alpha medium (onglet) ; apparition ressort 0.4/0.8 avec délai 0,04 s × index ; écran autonome : lignes en carte surfaceGradient teintée error + bordure.

Transposition Android : swipeActions -> SwipeToDismissBox ; alert -> AlertDialog (déjà présent) ; CollapsibleHeader -> TopAppBar repliable

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift`
- `apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/BlockedTab.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/BlockedListViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockedListRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockCache.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/BlockedUser.kt`

### Le journal d'appels se cherche, se filtre, s'efface par balayage et se rappelle en audio ou vidéo

`cf-calls-journal` · Android : **partielle** · P1 · effort M

CallsTab est le journal d'appels sur trois mois : champ de recherche répondu par le serveur (debounce 250 ms, paramètre q), pastilles Tous / Manqués / Vidéo, bouton « Tout effacer » (dialogue de confirmation « Effacer tout le journal d'appels ? — Les autres participants gardent le leur »), bannière d'échec d'effacement rejetable, liste paginée par curseur (pages de 30, fenêtre de 90 jours, ligne de chargement en bas), lignes Equatable (avatar avec présence connue, nom rouge si manqué, participants d'un appel de groupe « A, B +N », icône de direction, icône vidéo, ancienneté relative, durée) avec bouton rond de rappel qui ouvre un menu appel vocal / appel vidéo, tap = fiche de détail d'appel, balayage trailing = effacer (hide) avec retour haptique, action d'accessibilité nommée. Le ViewModel est cache-first (CacheFirstLoader par requête filtre+type+recherche, jointure de la queue en cache), tire-pour-rafraîchir en forçant le réseau, effacement optimiste avec rollback.

Écarts :
- Champ de recherche serveur (debounce 250 ms) : ajouter les paramètres q et type à GET calls/history (CallHistoryApi n'expose que cursor, limit, filter) ; états “Aucun appel ne correspond à « q »” + sous-titre « Le journal couvre les trois derniers mois »
- Pastille Vidéo (type=video) en plus de Tous / Manqués ; clé de cache par requête (filtre, type, recherche repliée sans casse ni diacritiques)
- Effacer une ligne : balayage trailing (SwipeToDismissBox) → DELETE calls/history/{callId}, suppression optimiste, rollback et bannière d'erreur si l'API échoue ; action d'accessibilité nommée Effacer
- Tout effacer : bouton rouge + dialogue de confirmation → DELETE calls/history, rollback, invalidation du cache
- Bannière d'échec d'effacement (« L'effacement a échoué. Réessayez. ») rejetable avec croix 44 dp
- Ligne : bouton rond de rappel (icône téléphone ou caméra selon l'appel) ouvrant un menu Appel vocal / Appel vidéo ; tap sur la ligne ouvre la fiche de détail d'appel (aujourd'hui tap = rappel direct via CallRoute.redial)
- Ligne : ligne des participants d'un appel de groupe (deux noms puis +N), icône vidéo, durée à côté de l'ancienneté, présence connue sur l'avatar, libellé d'accessibilité complet (type, direction, ancienneté, durée)
- Fenêtre de journal 90 jours, plafond d'éléments en cache, jointure de la page fraîche avec la queue en cache ; ligne de chargement des appels plus anciens avec spinner
- Empty states illustrés (Aucun appel récent + sous-titre) et squelette de contacts partagé
- Fiche de détail d'appel (CallDetailSheet, hors lot) et intégration au hub Personnes comme premier onglet

Rendu : Ligne : avatar 44 dp + nom subheadline semibold (error si manqué) + participants caption muted + rangée [icône direction caption2 bold, icône vidéo, temps relatif caption medium, « · durée »] ; bouton de rappel 44x44 cercle indigo500 alpha light, icône indigo500 ; séparateur décalé de 70 dp ; bannière d'erreur rayon smPlus fond error alpha light ; haptique medium au clear.

Transposition Android : swipeActions -> SwipeToDismissBox ; Menu -> DropdownMenu ; confirmationDialog -> AlertDialog ; CallStarter -> CallRoute/Telecom existants (feature/calls)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Contacts/CallsTab.swift`
- `apps/ios/Meeshy/Features/Contacts/CallsViewModel.swift`
- `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryViewModel.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryList.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/CallHistoryApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/CallHistoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/CallHistoryCacheSource.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallRecord.kt`

### Mes amis s'affichent instantanément, en ligne d'abord, avec filtres, recherche et compteurs

`cf-contacts-directory-list` · Android : **partielle** · P1 · effort M

ContactsListTab affiche l'annuaire des amis : pastilles de filtre défilantes (Tous, En ligne, Hors ligne, Répertoire, Affiliés) avec compteurs, champ de recherche (nom ou identifiant), liste paresseuse de lignes Equatable (avatar avec humeur, présence résolue et contour de profil, nom, @identifiant, « En ligne » en vert ou « Vu il y a… »), chevron, tap = ouverture de la fiche profil, tap sur l'humeur = lecteur de statut. Le ViewModel lit les amis depuis le cache persistant (fresh: affichage + revalidation si le FriendshipCache mémoire diverge ; stale: affichage + revalidation silencieuse ; vide: squelette), pagine /directory/friend-requests (direction any, status accepted, curseur, pages de 100, plafond 500), agrège via FriendListAggregator (dédoublonnage, exclusion de soi, tri en ligne puis dernière activité), réconcilie avec le FriendshipCache (retraits locaux, ajouts = refetch silencieux), repeint les lignes sur user:updated, tire-pour-rafraîchir en forçant le réseau. Les filtres Répertoire et Affiliés basculent le contenu vers PhonebookListView et AffiliatesListView.

Écarts :
- Tap sur une ligne = ouvrir la fiche profil (aujourd'hui la ligne n'est pas cliquable) ; tap sur l'emoji d'humeur = ouvrir le statut
- Ligne : libellé « En ligne » vert (success) ou « Vu il y a… » en caption2 muted, chevron de fin, description d'accessibilité composée (nom, @identifiant, en ligne / vu / hors ligne) ; aujourd'hui seul le point de présence est rendu
- Filtres Répertoire et Affiliés réellement branchés (Android les ignore : labelRes → All, absents de SELECTABLE_FILTERS) avec compteurs (n) cachés quand 0 ; pastilles défilantes horizontalement
- Tirer-pour-rafraîchir qui force le réseau (PullToRefreshBox) ; aucun geste de rafraîchissement n'existe
- Pagination des amis par curseur sur GET directory/friend-requests?direction=any&status=accepted&limit=100 jusqu'au plafond 500 ; Android lit une seule page de 100 reçues + 100 envoyées (liste tronquée au-delà)
- Repeindre les lignes sur l'événement socket user:updated (nom, avatar, contour) sans relecture ; aujourd'hui seule la présence est recouverte
- Squelette shimmer de 5 lignes à la place du CircularProgressIndicator sur cache froid
- Avatar avec URL d'image et contour de profil (ring) : MeeshyAvatar Android n'accepte ni URL ni décor de contour (initiales seulement)
- État vide illustré (icône person.2.slash + titre « Aucun contact » / « Aucun résultat ») ; champ de recherche masqué quand la liste est vide, effacement par croix
- Retour haptique léger au changement de filtre ; comptage d'impression des statuts visibles (countsImpression)
- Rafraîchissement de la présence à l'écran sans nouvel événement (LivePresence : la décroissance 60 s / 3 min / 5 min doit se recalculer à l'horloge)

Rendu : Ligne : avatar userListItem (44 dp) + colonne nom subheadline semibold / @username caption medium muted / ligne présence caption2 ; couleur d'avatar DynamicColorGenerator.colorForName(nom) ; padding horizontal xl, vertical md ; pastilles en capsule indigo500 ; point de présence vert 34D399 pulsant (en ligne), orange FBBF24 (away), gris 9CA3AF (idle), aucun point hors ligne ; ordre : en ligne d'abord puis lastActiveAt décroissant.

Transposition Android : refreshable -> PullToRefreshBox ; LazyVStack -> LazyColumn avec clés ; EmptyStateView -> composable commun ; LivePresence -> ticker 30 s dans le ViewModel

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`
- `apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift`
- `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsListTab.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsListViewModel.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/PresenceOverlay.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendListRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendshipCache.kt`

### Découvrir : inviter par e-mail ou SMS, chercher des utilisateurs Meeshy et se connecter en un tap

`cf-discover-search-invite` · Android : **partielle** · P1 · effort M

DiscoverTab empile : carte d'invitation par e-mail (champ + bouton Envoyer, POST invitations/email, toast « Invitation envoyée à … », champ vidé, haptique succès/erreur), carte d'invitation par SMS (composeur MFMessageCompose pré-rempli « Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download », toast « SMS non disponible » sinon), bouton « Retrouver mes contacts sur Meeshy » (voir cf-discover-device-import), section « Déjà sur Meeshy » et recherche d'utilisateurs (loupe, au moins 2 caractères, spinner, « Aucun utilisateur trouvé »). Sans requête, la liste montre les suggestions du serveur (recherche vide, limit 20) en cache-first stale-while-revalidate ; tirer pour rafraîchir recharge les suggestions. Chaque résultat : avatar (humeur, présence, contour), nom, @identifiant, tap sur avatar ou nom = fiche profil, ConnectionActionView (Se connecter / En attente / Accepter / Contact / Bloqué) avec toasts d'erreur et de succès, apparition en cascade (ressort + délai 0,04 s par ligne).

Écarts :
- Tap sur l'avatar ou le nom d'un résultat = ouvrir la fiche profil (aucune navigation aujourd'hui)
- Lignes : humeur, présence résolue, contour de profil et URL d'avatar (MeeshyAvatar Android ne les porte pas) ; libellés d'accessibilité “Voir le profil”
- Toasts de succès/erreur (Invitation envoyée à X, Impossible d'envoyer l'invitation, SMS non disponible) et haptiques succès/erreur ; Android affiche seulement une erreur en ligne (MeeshyFeedbackToast existe dans :sdk-ui)
- Tirer-pour-rafraîchir qui recharge les suggestions (ne rien faire si une requête est tapée)
- Cartes d'invitation en verre (glassCard), titre avec icône envelope.fill / message.fill, boutons capsule indigo500 désactivés à 40 % d'opacité ; ordre exact : invitations, import, contacts trouvés, recherche
- Animation d'apparition en cascade des lignes (ressort 0.4/0.8, délai 0,04 s × index) ; état « aucun résultat » avec grande loupe atténuée
- Texte du SMS d'invitation : conserver la chaîne littérale iOS (non localisée) ; vérifier le repli quand aucune application SMS n'existe
- Section « Déjà sur Meeshy » et bouton d'import des contacts (cf-discover-device-import)

Rendu : Cartes padding mdPlus en verre ; Label subheadline semibold ; champs rayon sm fond inputBackground ; bouton Envoyer capsule indigo500 (alpha 0.4 désactivé), texte footnote semibold blanc ; lignes padding xs/smPlus ; avatar 44 dp ; nom subheadline semibold, @username caption medium muted.

Transposition Android : MFMessageComposeViewController -> Intent.ACTION_SENDTO smsto: + extra sms_body ; FeedbackToastManager -> MeeshyFeedbackToast ; ConnectionActionView -> ConnectControl existant

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift`
- `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/DiscoverTab.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/DiscoverViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/DiscoverSearch.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/SuggestionsRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/UserRelationshipResolver.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRequestSend.kt`

### Les demandes d'amis utilisent les routes canoniques /directory, par curseur et dans les deux sens

`cf-friend-service-sdk` · Android : **partielle** · P1 · effort S

FriendService (SDK) expose : envoi POST /directory/friend-requests, liste par curseur GET /directory/friend-requests (direction received\|sent\|any, status, q, cursor, limit), lectures par offset historiques (received, sent, /users/friend-requests pour les deux sens), réponse PATCH /directory/friend-requests/{id} avec action accept\|reject, annulation par PATCH action dismiss, invitation e-mail POST /invitations/email. Le protocole FriendServiceProviding donne une implémentation par défaut de la liste par curseur au-dessus des lectures par offset.

Écarts :
- respond doit viser PATCH /directory/friend-requests/{id} avec body {action: accept|reject} ; Android envoie {status: accepted|rejected} sur la route legacy PATCH friend-requests/{id}
- deleteRequest doit être PATCH /directory/friend-requests/{id} {action: dismiss} ; Android appelle DELETE friend-requests/{id} (legacy)
- Utiliser la lecture par curseur (déjà déclarée : FriendApi.friendRequests) comme source de la liste d'amis et des demandes à la place des lectures par offset qui sautent des lignes quand une demande est créée pendant la pagination
- Exposer allFriendRequests (/users/friend-requests, status accepted) si nécessaire à la parité, et un FriendListAggregator unique partagé avec la sélection de destinataires d'une nouvelle conversation
- Tests de contrat sur les routes et les corps (rétrocompatibilité : l'ancien chemin reste servi tant que des clients l'utilisent)

Rendu : Aucune UI : couche réseau.

Transposition Android : FriendServiceProviding -> FriendRepository (déjà idiomatique) ; PaginatedAPIResponse -> ApiResponse avec pagination.nextCursor

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/FriendApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Friend.kt`

### Avant de chercher mes contacts, Meeshy me propose d'ajouter mon numéro (jamais bloquant)

`cf-phone-prompt` · Android : **partielle** · P2 · effort S

PhonePromptPolicy décide d'offrir la feuille quand l'utilisateur n'est pas anonyme et n'a pas de numéro. PhonePromptSheet (détents medium/large, poignée visible) : en-tête « Ajoute ton numéro » + bénéfice (retrouvailles par numéro, connexion), étape 1 champ téléphone (contenu telephoneNumber, clavier phonePad, focus auto) + « Recevoir le code par SMS », étape 2 champ code à 6 chiffres (oneTimeCode, monospace centré) + « Vérifier » + « Modifier », erreur inline en rouge, bouton « Plus tard » toujours disponible. Dismiss après vérification ; dans tous les cas (vérifié ou Plus tard) la recherche de contacts continue (onDismiss → onContinue). PhoneChangeFlowModel porte l'état idle/editing/codeSent, nettoie le code (6 chiffres), appelle changePhone puis verifyPhoneChange et rafraîchit la session ; un 400 = « Code incorrect ou expiré ».

Écarts :
- Feuille modale (ModalBottomSheet à demi-hauteur extensible) « Ajoute ton numéro » réutilisant la machine d'état de AccountContactViewModel (changePhone / verifyPhoneChange, code 6 chiffres) ; aujourd'hui ce flux n'existe que dans Paramètres > Compte
- PhonePromptPolicy : offrir seulement si utilisateur non anonyme et numéro vide ; callback onContinue exécuté à la fermeture quel que soit le résultat
- Bouton « Plus tard » 44 dp (libellé d'accessibilité « Plus tard, chercher mes contacts sans ajouter de numéro »), focus automatique du champ, étape « Code envoyé par SMS » avec bouton Modifier
- Haptiques succès/erreur et messages d'erreur : code incorrect ou expiré (400), erreur générique ; rafraîchissement de la session après vérification (/auth/me)
- Câblage depuis Découvrir (import) et Répertoire (synchroniser)

Rendu : En-tête icône person.crop.circle.badge.plus en dégradé de marque, titre title3 bold centré, bénéfice subheadline secondaire ; champs minHeight 50 dp rayon md fond textMuted alpha subtle ; bouton principal capsule indigo500 (alpha 0.4 désactivé) avec spinner blanc ; « Plus tard » subheadline semibold textSecondary.

Transposition Android : sheet + presentationDetents -> ModalBottomSheet ; textContentType oneTimeCode -> KeyboardType.NumberPassword + autofill SMS Retriever

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Contacts/PhonePromptPolicy.swift`
- `apps/ios/Meeshy/Features/Contacts/PhonePromptSheet.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/PhoneChangeFlowModel.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/UserRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`

