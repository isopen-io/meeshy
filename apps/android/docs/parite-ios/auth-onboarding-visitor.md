# Parité iOS → Android : `auth-onboarding-visitor`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**51 features iOS** : 26 absentes, 21 partielles, 2 divergentes, 2 complètes sur Android. **45 lots** planifiés (≈28200 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**auth-onboarding-visitor** (couverture Android estimée ≈ 25 %)

Cette partie couvre tout ce qui précède la messagerie sur iOS : splash gouverné par les étapes de boot, accueil, connexion (comptes mémorisés, 2FA, lien magique, code e-mail à 6 chiffres, mot de passe oublié par e-mail ou téléphone, nouveau mot de passe depuis un lien), inscription en phases vivantes (téléphone d’abord, e-mail, carte d’identité, code dans la carte, feu d’artifice d’arrivée), fermeture de session expliquée, barrière d’âge, onboarding en 8 cartes avec points et récapitulatif, entrée sans compte (lien de partage invité, World Wide en 2 étapes, contenu public visiteur avec carte d’invitation) et le SDK d’authentification (rafraîchissement mono-vol, propriété des requêtes 401, multi-comptes, preuves par lien avec fenêtre d’adoption, déconnexion serveur avec reprises).
Android couvre le noyau : connexion identifiant/mot de passe avec sélecteur de comptes (affichage seul), sélecteur d’environnement debug, lien magique avec compte à rebours, mot de passe oublié par e-mail, inscription en UN écran (génération précédente de l’iOS), jonction par lien de partage invité, splash à durée fixe, App Links magic-link/chat/join, rafraîchissement de jeton via Authenticator OkHttp.
Absent côté Android : accueil, onboarding entier (8 cartes), 2FA à la connexion (un compte 2FA ne peut pas se connecter), vérification d’e-mail par code (une réponse « verification-required » échoue au décodage), écran « nouveau mot de passe » et son lien, avis de session fermée et événement auth:session-revoked, barrière d’âge 403, multi-comptes réels, entrée World Wide, écran visiteur de contenu public, feuille d’attachements invité, feu d’artifice d’arrivée, bascule de compte par lien avec confirmation, demande runtime POST_NOTIFICATIONS.
Divergent : l’inscription Android (un seul formulaire nom/e-mail/téléphone/mot de passe) ne suit plus la refonte iOS en phases (#8288, #9343) ; la validation du lien magique déconnecte sans confirmation là où iOS demande « Ouvrir un autre compte ? ».
Ordre conseillé : contrat API d’auth (2FA, vérification e-mail, reset, déconnexion serveur) puis portes d’entrée P0 (2FA, code e-mail, nouveau mot de passe), session (avis de fermeture, multi-comptes, preuve par lien), refonte inscription, onboarding, entrées sans compte. Les 17 fichiers Vitrine et 2 lanceurs d’aperçu sont des outils DEBUG sans équivalent produit. AppDelegate recoupe le domaine notifications : à réconcilier avec la partie correspondante.

## Notes transverses

VOLUME ET PRINCIPE. 52 lots, ~32 700 lignes Kotlin tests compris (les estimations incluent les tests, environ 40 % du total). Les 19 fichiers Vitrine et les 2 lanceurs d'aperçu iOS (debug seulement) ne sont PAS portés. Les features 'complete' (auth-login-server-environment, auth-signup-language-legal) sont sautées. Le sélecteur d'environnement et la puce de langue d'inscription restent intacts : les lots qui refactorent LoginScreen.kt et SignupScreen.kt doivent les conserver (tests existants à garder verts).

CONVENTIONS OBSERVÉES (à suivre, pas celles de l'exemple de la consigne). Les packages de feature sont me.meeshy.app.<feature> (par exemple me.meeshy.app.auth) alors que le namespace Gradle est me.meeshy.feature.auth ; les modèles purs vivent dans core/model/src/main/kotlin/me/meeshy/sdk/model/auth/ ; le réseau dans core/network/.../net/api/*Api.kt ; l'onboarding vit dans :feature:auth sous le sous-package me.meeshy.app.onboarding (aucun nouveau module Gradle : cela évite de toucher settings.gradle.kts et app/build.gradle.kts, et feature->feature est interdit, donc story, amis, chat et réglages sont câblés par lambdas depuis :app). Aucun gate local hors jvm-check de :core:model : la logique est poussée dans :core:model pour être prouvée en TDD local (./apps/android/meeshy.sh jvm-check), l'écran reste mince, le seul vert fait foi est la CI android.yml.

POINTS CHAUDS ET SÉQUENÇAGE (le découpage a été fait pour que deux lots d'une même vague ne se touchent pas ; les depends_on encodent aussi l'ordre d'édition des fichiers partagés).
1) MeeshyApp.kt fait 1202 lignes, au-dessus du plafond dur de 1200 : ajouter y est interdit. Seul le lot racine-session-et-navigation-auth le modifie, pour EXTRAIRE les routes d'auth vers AuthNavGraph.kt (et réduire le fichier sous 1000). Tous les lots suivants créent leur propre <X>Destination.kt sous app/.../navigation/auth/ et ajoutent UNE ligne dans AuthNavGraph.kt (conflit trivial). Le splash retire son bloc de MeeshyApp.kt (réduction, pas ajout).
2) AuthRepository.kt est édité dans l'ordre contrat -> plan-ouverture-fermeture -> deconnexion-fermee-cote-serveur ; les autres lots passent par des classes neuves (ProvenSessionOpener, AccountSwitcher, EmailVerificationWatcher, PasswordResetRepository...) qui appellent l'API publique d'AuthRepository (adoptSession rendu public par le lot contrat).
3) LoginScreen.kt, AuthViewModel.kt et le réducteur LoginFlow : chaîne atomes -> connexion-identite-visuelle (extrait SavedAccountsPicker.kt, EnvironmentSelector.kt, LoginCredentialsForm.kt, LoginBrandHeader.kt) -> connexion-double-facteur -> verification-email-par-code -> selecteur-de-comptes-et-reglages.
4) AccountRecoveryScreens.kt et AccountRecoveryViewModels.kt : lien-magique-code-et-empreinte extrait MagicLink* vers des fichiers neufs, puis mot-de-passe-oublie-par-telephone extrait Forgot* (il dépend donc du premier).
5) AndroidManifest.xml : seul liens-entrants-classes-une-fois ajoute des intent-filters (verify-email, reset-password, email-link, /l/, post, reel, story, signup) ; les autres lots consomment ses routes. Les fragments (#token=) sont portés par intent.dataString : le classifieur doit les lire (loi iOS EmailLinkSecret : le secret peut vivre dans le fragment).
6) Chaînes : chaque lot crée SON fichier de ressources (feature/auth/src/main/res/values{,-fr,-es,-pt}/strings_<lot>.xml) plutôt que d'éditer strings.xml, pour éviter les conflits d'ajout en fin de fichier. Seuls en/fr/es/pt existent côté Android alors que l'iOS sert 7 langues d'interface (de, it, ar en plus) : lot i18n transverse à ouvrir hors domaine (values-de/it/ar + locales_config) ; l'arabe impose en outre une vérification RTL. La liste de langues du World Wide utilise les noms natifs de LanguageData, sans ressource.
7) Hilt : ne pas ajouter de @Provides à SdkModule.kt ; chaque lot qui lie une dépendance crée son module (modèle : ShareLinkEntryModule.kt). Les nouvelles routes Retrofit doivent vivre dans une interface *Api.kt (ApiPathLiteralGuardTest) ; les routes inventées côté client sont interdites, on suit AuthEndpoint.swift.

COMPOSANTS PARTAGÉS. EmailCodeEntry (lot verification-email-par-code) sert le lien magique, la carte d'inscription, la porte d'activation et la carte e-mail d'onboarding. FireworksCanvas (lot fete-d-arrivee) sert aussi la carte 'Compte validé'. SessionOpeningGate + ProvenSessionOpener (lot preuve-par-lien) sont la seule porte d'ouverture de session sur preuve. OneShotSlot et LoginHandoffs (lot connexion-identite-visuelle) portent les transferts d'intention vers la connexion (e-mail tapé à l'inscription, 'Changer/Ajouter un compte'). Un hôte de toasts de feedback global n'existe pas encore (MeeshyToast ne fournit que le composant ; NotificationToastHost est le niveau réseau) : le lot racine crée FeedbackToastCenter + OverlayHost, que la barrière d'âge, l'avis de fermeture, le rapport de plantage et les toasts de lien consomment.

RISQUES. (a) Multi-comptes : les données ne sont pas namespacées par compte (SessionTeardown vide tout) ; décision retenue = purge + réhydratation à la bascule (jamais Room par compte), documentée dans le lot bascule. (b) Le splash Android a un plancher de 1200 ms contre 400 ms sur iOS ; le lot splash le remplace par la levée pilotée par le boot (plafond 2 s). (c) Les lots push (canaux, actions, silencieux) recoupent le domaine notifications : à dédupliquer par l'orchestrateur ; le Telecom ConnectionService (équivalent PushKit/CallKit) est laissé au domaine appels (ext:calls-telecom-connection-service) et n'a pas de lot ici. (d) Rétrocompatibilité (#9223) : tout décodage de motif, de statut ou de champ inconnu doit être tolérant (motif de révocation inconnu = déconnexion générique, statut de login inconnu = échec typé), jamais un crash de décodage. (e) Une réponse 'verification-required' ou 'requires2FA' échoue aujourd'hui au décodage : le lot contrat doit passer AVANT tout lot d'écran, et garder login() inchangé pour que AuthViewModel compile sans modification. (f) Le cycle d'inventaire contenu-visiteur <-> portée-visiteur est cassé : la portée (clé visiteur + file) passe d'abord. (g) GET /world (entrée World Wide), GET/PATCH /me/onboarding, la déclaration de date de naissance et le contenu public visiteur n'ont aucune interface Android : chaque lot crée son *Api.kt.

ORDRE DE VAGUES CONSEILLÉ. V1 (sans dépendance) : contrat-api-authentification, rafraichissement-session-sans-melange, atomes-authentification-champs-boutons-marque, langue-interface-appliquee-au-demarrage, canaux-et-categories-de-notification, onboarding-etat-serveur-et-file. V2 : racine-session-et-navigation-auth, plan-ouverture-fermeture-session, coffre-de-jetons-par-compte, audience-visiteur-comptee-une-fois, profil-optimiste-confirme-ou-retabli, preuve-par-lien-fenetre-d-adoption, inscription-regles-identite-et-telephone, onboarding-calque-et-mise-en-page, actions-de-notification, donnees-silencieuses-et-contenu-protege, changer-mot-de-passe-sans-mot-de-passe-actuel. V3 : connexion-identite-visuelle-et-saisie, liens-entrants-classes-une-fois, deconnexion-fermee-cote-serveur, avis-de-session-fermee, barriere-d-age-minimum, splash-leve-par-le-boot, accueil-premier-lancement, cycle-de-vie-premier-plan-arriere-plan, rapport-de-plantage-au-lancement-suivant, fete-d-arrivee-adresse-confirmee, onboarding-illustrations-animees. V4 : connexion-double-facteur, nouveau-mot-de-passe-depuis-le-lien, bascule-de-compte-et-isolation, session-invitee-par-lien-et-fin-d-acces, contenu-public-visiteur, onboarding-hote-presence-et-points. V5 : verification-email-par-code, inscription-par-phases, ouvrir-un-lien-de-connexion-confirme, entree-world-wide-sans-compte, pieces-jointes-invite-selon-le-lien, onboarding-cartes (langues-e-mail, date-de-naissance, global-recapitulatif, story, amis, permission). V6 : lien-magique-code-et-empreinte, porte-de-validation-d-e-mail, selecteur-de-comptes-et-reglages, compte-supprime-retire-de-l-appareil, inscription-adresse-deja-prise, inscription-valider-maintenant, mot-de-passe-oublie-par-telephone.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `atomes-authentification-champs-boutons-marque` | B | P0 | M | 600 |  | Les champs, boutons et éléments de marque d'authentification se ressemblent partout |
| `canaux-et-categories-de-notification` | B | P0 | M | 700 | socle-pipeline-push-et-cycle-de-vie | Chaque type de notification a son canal et son regroupement, dès le démarrage |
| `connexion-double-facteur` | B | P0 | M | 380 | contrat-api-authentification, connexion-identite-visuelle-et-saisie | Un compte protégé par 2FA peut se connecter avec son code à 6 chiffres |
| `connexion-identite-visuelle-et-saisie` | B | P0 | M | 600 | atomes-authentification-champs-boutons-marque, racine-session-et-navigation-auth | L'écran de connexion a l'identité visuelle Meeshy et une saisie agréable |
| `contrat-api-authentification` | B | P0 | L | 900 |  | Tous les parcours d'authentification parlent le même contrat serveur |
| `liens-entrants-classes-une-fois` | B | P0 | M | 650 | racine-session-et-navigation-auth, socle-points-d-extension-de-l-app | Un lien reçu (partage, connexion, vérification, réinitialisation, contenu) ouvre le bon écran, avec ou sans session |
| `nouveau-mot-de-passe-depuis-le-lien` | B | P0 | M | 800 | contrat-api-authentification, atomes-authentification-champs-boutons-marque, liens-entrants-classes-une-fois, racine-session-et-navigation-auth | Choisir un nouveau mot de passe depuis le lien reçu, avec 2FA si le compte en a une |
| `plan-ouverture-fermeture-session` | B | P0 | M | 700 | session-renouvellement-un-seul-vol, contrat-api-authentification, socle-points-d-extension-de-l-app | Ouvrir ou fermer une session exécute toujours les mêmes étapes, dans le même ordre |
| `preuve-par-lien-fenetre-d-adoption` | B | P0 | M | 700 | contrat-api-authentification, session-renouvellement-un-seul-vol | Une preuve par e-mail ouvre la session sans jamais écraser un autre compte |
| `racine-session-et-navigation-auth` | B | P0 | L | 850 | session-renouvellement-un-seul-vol, socle-points-d-extension-de-l-app | La racine bascule proprement entre connexion, app connectée et couvertures |
| `verification-email-par-code` | B | P0 | L | 950 | contrat-api-authentification, preuve-par-lien-fenetre-d-adoption, atomes-authentification-champs-boutons-marque, connexion-double-facteur | Valider son adresse e-mail avec un code à 6 chiffres, ou en ouvrant le lien ailleurs |
| `accueil-premier-lancement` | B | P1 | S | 340 | racine-session-et-navigation-auth, atomes-authentification-champs-boutons-marque | Au premier lancement, l'accueil propose Créer un compte ou Se connecter |
| `avis-de-session-fermee` | B | P1 | M | 520 | racine-session-et-navigation-auth, session-renouvellement-un-seul-vol, socle-points-d-extension-de-l-app | Quand la session est fermée, l'app explique pourquoi avant de redemander la connexion |
| `barriere-d-age-minimum` | B | P1 | M | 380 | racine-session-et-navigation-auth, reseau-pipeline-reessai-erreurs | Un compte de moins de 13 ans voit un écran définitif, pas une erreur qui boucle |
| `bascule-de-compte-et-isolation` | B | P1 | M | 750 | coffre-securise-par-compte, plan-ouverture-fermeture-session, deconnexion-fermee-cote-serveur, socle-points-d-extension-de-l-app | Changer de compte ne laisse rien du précédent et ne se télescope jamais |
| `contenu-public-visiteur` | B | P1 | L | 1000 | racine-session-et-navigation-auth, liens-entrants-classes-une-fois, audience-visiteur-comptee-une-fois, routeur-de-navigation-hubs-et-cibles-differees, etats-vides-et-echecs-de-contenu | Un lien vers une publication, un réel ou une story s'ouvre pour un visiteur sans compte |
| `deconnexion-fermee-cote-serveur` | B | P1 | S | 280 | contrat-api-authentification, plan-ouverture-fermeture-session | Se déconnecter ferme aussi la session côté serveur, avec reprises |
| `entree-world-wide-sans-compte` | B | P1 | M | 750 | session-invitee-par-lien-et-fin-d-acces, connexion-identite-visuelle-et-saisie, reseau-pipeline-reessai-erreurs | Entrer dans World Wide sans compte : votre nom, votre langue, et c'est parti |
| `inscription-adresse-deja-prise` | B | P1 | M | 600 | inscription-par-phases, lien-magique-code-et-empreinte, verification-email-par-code | Quand l'adresse est déjà utilisée, proposer « Est-ce vous ? » plutôt qu'un simple refus |
| `inscription-par-phases` | B | P1 | L | 1100 | inscription-regles-identite-et-telephone, atomes-authentification-champs-boutons-marque, connexion-identite-visuelle-et-saisie, racine-session-et-navigation-auth | S'inscrire en quelques gestes : le téléphone d'abord, puis l'adresse, puis la carte du compte |
| `inscription-regles-identite-et-telephone` | B | P1 | M | 750 | contrat-api-authentification | L'inscription dérive un nom et un pseudo pour vous, et dit pourquoi un numéro est refusé |
| `inscription-valider-maintenant` | B | P1 | M | 450 | inscription-par-phases, verification-email-par-code, preuve-par-lien-fenetre-d-adoption, fete-d-arrivee-adresse-confirmee | « Valider mon compte maintenant » montre le code dans la carte, puis fête l'arrivée |
| `langue-interface-appliquee-au-demarrage` | B | P1 | S | 180 | socle-points-d-extension-de-l-app | La langue de l'interface est appliquée à toute l'app avant le premier écran |
| `lien-magique-code-et-empreinte` | B | P1 | M | 550 | verification-email-par-code, preuve-par-lien-fenetre-d-adoption, connexion-identite-visuelle-et-saisie | Se connecter sans mot de passe avec un lien ET un code, lié à l'appareil demandeur |
| `mot-de-passe-oublie-par-telephone` | B | P1 | M | 750 | contrat-api-authentification, atomes-authentification-champs-boutons-marque, nouveau-mot-de-passe-depuis-le-lien, lien-magique-code-et-empreinte | Retrouver son compte par téléphone quand on a oublié son mot de passe |
| `onboarding-calque-et-mise-en-page` | B | P1 | L | 900 | atomes-authentification-champs-boutons-marque | Le parcours d'accueil est un calque fluide avec progression et mise en page de carte partagée |
| `onboarding-carte-date-de-naissance` | B | P1 | M | 420 | onboarding-hote-presence-et-points, onboarding-calque-et-mise-en-page, barriere-d-age-minimum | Déclarer sa date de naissance, ou passer l'étape, avec une réponse claire sous 13 ans |
| `onboarding-cartes-global-et-recapitulatif` | B | P1 | M | 800 | onboarding-hote-presence-et-points, onboarding-illustrations-animees | Dire bonjour à tout le monde dans Global, puis voir ses points, son niveau et sa série |
| `onboarding-cartes-langues-et-e-mail` | B | P1 | M | 550 | onboarding-hote-presence-et-points, onboarding-calque-et-mise-en-page, contrat-api-authentification | Confirmer ses langues et valider son adresse dès l'accueil |
| `onboarding-etat-serveur-et-file` | B | P1 | M | 800 | consentements-par-finalite, reseau-pipeline-reessai-erreurs | L'onboarding choisit ses cartes depuis l'état serveur et ne se rejoue jamais |
| `onboarding-hote-presence-et-points` | B | P1 | M | 750 | onboarding-etat-serveur-et-file, onboarding-calque-et-mise-en-page, racine-session-et-navigation-auth | L'accueil démarre au bon moment, une seule fois, et les autres invites lui cèdent la place |
| `onboarding-illustrations-animees` | B | P1 | M | 750 | onboarding-calque-et-mise-en-page | Chaque carte d'accueil a son illustration animée, douce et réduite sur demande |
| `ouvrir-un-lien-de-connexion-confirme` | B | P1 | M | 600 | preuve-par-lien-fenetre-d-adoption, bascule-de-compte-et-isolation, liens-entrants-classes-une-fois | Ouvrir un lien de connexion ou de vérification demande confirmation avant de changer de compte |
| `permission-notifications-au-bon-moment` | B | P1 | M | 520 | onboarding-hote-presence-et-points, onboarding-illustrations-animees | Autoriser les notifications au bon moment, avec une carte qui explique pourquoi |
| `pieces-jointes-invite-selon-le-lien` | B | P1 | M | 520 | session-invitee-par-lien-et-fin-d-acces, carte-lien-donnees, chat-viewmodel-state-split | En invité, partager seulement ce que le lien autorise (texte, audio, image, PDF) |
| `porte-de-validation-d-e-mail` | B | P1 | M | 520 | verification-email-par-code, refus-types-limite-du-jour-mode-lent | Avant de publier, d'inviter ou de créer un lien, valider son e-mail sans perdre l'action |
| `selecteur-de-comptes-et-reglages` | B | P1 | M | 500 | bascule-de-compte-et-isolation, verification-email-par-code, logout-confirmation-and-overlay, socle-points-d-extension-de-l-app, settings-hub-iso-layout | Reprendre un compte mémorisé en saisissant seulement son mot de passe, ou sans rien saisir s'il est gardé |
| `session-invitee-par-lien-et-fin-d-acces` | B | P1 | M | 800 | racine-session-et-navigation-auth, liens-entrants-classes-une-fois, socket-routage-evenements-ordre-arrivee | Rejoindre une conversation par lien sans compte, avec un écran dédié quand l'accès prend fin |
| `splash-leve-par-le-boot` | B | P1 | M | 420 | racine-session-et-navigation-auth, plan-ouverture-fermeture-session, atomes-authentification-champs-boutons-marque, socle-points-d-extension-de-l-app | Le splash se lève dès que l'app est prête, ni plus tôt ni trop tard |
| `audience-visiteur-comptee-une-fois` | B | P2 | M | 450 | session-renouvellement-un-seul-vol | Compter un lecteur sans compte une seule fois, sans jamais savoir qui il est |
| `changer-mot-de-passe-sans-mot-de-passe-actuel` | B | P2 | S | 200 | contrat-api-authentification, atomes-authentification-champs-boutons-marque | Définir un premier mot de passe depuis les réglages quand on n'en a pas encore |
| `compte-supprime-retire-de-l-appareil` | B | P2 | S | 300 | bascule-de-compte-et-isolation, avis-de-session-fermee, refus-de-session-compte-supprime-age-invite, socle-points-d-extension-de-l-app, socket-connexion-jeton-identite-idempotente | Un compte supprimé côté serveur quitte l'appareil avec ses jetons et son cache |
| `fete-d-arrivee-adresse-confirmee` | B | P2 | M | 620 | preuve-par-lien-fenetre-d-adoption, racine-session-et-navigation-auth | L'adresse confirmée déclenche un feu d'artifice pendant que l'app prépare vos conversations |
| `onboarding-carte-amis-et-carnet` | B | P2 | L | 900 | onboarding-hote-presence-et-points, onboarding-illustrations-animees | Retrouver ses amis dans son carnet d'adresses ou parmi des suggestions |
| `onboarding-carte-story` | B | P2 | M | 650 | onboarding-hote-presence-et-points, onboarding-illustrations-animees, porte-de-validation-d-e-mail | Publier sa première story depuis l'accueil, avec chaque état du téléversement |

### Lots fusionnés ou retirés par l'architecture

- `rafraichissement-session-sans-melange` → `session-renouvellement-un-seul-vol` (merge-into) : Même renouvellement du JWT en un seul vol ; la loi « un refus ne démonte que le compte qui l'a reçu » et hasResolvedStoredSession rejoignent l'authenticator.
- `coffre-de-jetons-par-compte` → `coffre-securise-par-compte` (merge-into) : Même coffre Keystore de jetons par compte. Hérite : session-renouvellement-un-seul-vol.
- `cycle-de-vie-premier-plan-arriere-plan` → `transitions-arriere-plan-premier-plan` (merge-into) : Même transition arrière-plan / premier plan. Hérite : plan-ouverture-fermeture-session.
- `rapport-de-plantage-au-lancement-suivant` → `diagnostics-de-crash-natifs-et-rapport-distant` (merge-into) : Même rapport de plantage au lancement suivant.
- `profil-optimiste-confirme-ou-retabli` → `profile-own-edit-save` (merge-into) : Même profil optimiste confirmé ou rétabli.
- `donnees-silencieuses-et-contenu-protege` → `synchro-push-silencieux-et-accuses-de-reception` (drop-duplicate) : Même traitement des data-messages silencieux ; la protection de contenu est portée par textes-push-proteges-et-repli et bouclier-capture-ecran-android.
- `actions-de-notification` → `actions-repondre-et-marquer-lu` (drop-duplicate) : Mêmes actions de notification ; les actions contextuelles restent dans actions-notification-contextuelles.

## Features

### Valider son adresse e-mail avec un code à 6 chiffres, ou en ouvrant le lien reçu ailleurs

`auth-email-verification-code` · Android : **absente** · P0 · effort M

Après une connexion ou une inscription qui exige l’activation, une feuille « Vérifiez votre email » affiche une accroche selon le cas (compte créé, activation requise, code envoyé), le champ du code (clavier numérique, oneTimeCode), « Vérifier » et « Renvoyer le code » (confirmation « Code renvoyé ! »). Pendant l’attente, l’app interroge toutes les 3 s (15 min max) si l’adresse a été prouvée ailleurs : le bandeau « Adresse confirmée ✓ — saisissez le code reçu pour vous connecter sur ce téléphone » apparaît. Succès : coche « Email vérifié ! » puis ouverture de session et fête d’arrivée. Erreurs distinctes : code invalide, expiré, mot de passe faible, trop de tentatives, hors ligne.

Écarts :
- Routes absentes d’AuthApi : vérification d’e-mail (code + adresse), renvoi du code, statut de vérification par pendingSessionToken
- Modèles LoginOutcome.verificationRequired / PendingEmailVerification (status « verification-required », accountCreated, pendingSessionToken) : la réponse est aujourd’hui décodée comme AuthSession et échoue
- Écran/feuille de saisie du code + composant EmailCodeEntry réutilisable (inscription, lien magique, porte d’activation)
- Surveillance de preuve ailleurs : boucle 3 s, limite 15 min, arrêt sur 401/410, bandeau « Adresse confirmée ✓ »
- Textes d’erreur typés (invalide, expiré, mot de passe faible, trop de tentatives, hors ligne, renvoi impossible) et variantes d’accroche selon EmailVerificationLead
- Renvoi avec confirmation 3 s « Code renvoyé ! », états annoncés (a11y) en cours d’envoi/vérification
- Autofill du code reçu par e-mail (Autofill OTP Android) et masquage du clavier après saisie complète

Rendu : Feuille avec titre « Vérifiez votre email », sous-titre en gras sur l’adresse, champ code centré gros chiffres espacés, bouton principal dégradé « Vérifier » avec spinner, lien « Renvoyer le code » qui passe en vert « Code renvoyé ! », coche animée easeInOut 0,3 s au succès, bandeau succès vert pour « Adresse confirmée ».

Transposition Android : textContentType oneTimeCode -> autofillHints + SMS/e-mail OTP ; Task.sleep boucle -> coroutine avec délai annulable

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`
- `apps/ios/Meeshy/Features/Auth/Views/EmailCodeEntry.swift`
- `apps/ios/Meeshy/Features/Auth/ViewModels/EmailVerificationViewModel.swift`
- `apps/ios/Meeshy/Features/Auth/EmailProofErrorText.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/EmailVerificationModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/EmailVerificationWatch.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/OtpVerification.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactViewModel.kt`

### Un compte protégé par 2FA peut se connecter avec son code à 6 chiffres

`auth-login-two-factor` · Android : **absente** · P0 · effort S

Quand la passerelle répond requires2FA, l’écran de connexion passe à une étape dédiée : titre et description, champ numérique de 6 chiffres (code TOTP ou de secours), bouton « Se connecter » actif dès 6 caractères, bouton « Annuler » qui revient au formulaire. Le jeton à deux facteurs fourni par la passerelle est rejoué avec le code pour obtenir la session ; les erreurs s’affichent sous le champ.

Écarts :
- Champs requires2FA et twoFactorToken dans la réponse de login, et route de complétion 2FA (AuthEndpoint.loginN2Fa) absents d’AuthApi : un compte 2FA ne peut pas se connecter sur Android
- Étape UI 2FA dans LoginScreen : titre/description, champ numérique 6 chiffres (oneTimeCode), bouton désactivé < 6, « Annuler » qui efface le jeton et revient
- Gestion des erreurs (code invalide, trop de tentatives) et de la fenêtre d’adoption du second facteur (SecondFactorRequired, 4 min de repli)
- Accessibilité : libellé « auth.login.two_factor.label », focus automatique, clavier numérique

Rendu : Même colonne centrale que la connexion ; icône bouclier au-dessus du titre, description secondaire centrée, champ 6 chiffres espacés (police monospacée large), deux boutons empilés : principal dégradé, annuler texte secondaire.

Transposition Android : textContentType oneTimeCode -> autofillHints SMS/OTP + KeyboardType.NumberPassword

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/TwoFactorScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`

### Choisir un nouveau mot de passe depuis le lien reçu, avec 2FA si le compte en a une

`auth-password-reset-new-password` · Android : **absente** · P0 · effort M

Le lien de réinitialisation ouvre, par-dessus tout, l’écran « Nouveau mot de passe » : vérification préalable du jeton (valide ou non, 2FA exigée), champs mot de passe et confirmation (« Les mots de passe ne correspondent pas »), code à 6 chiffres de l’application d’authentification si le compte est protégé. Résultats typés : enregistré (« Se connecter »), lien invalide ou expiré, trop de codes incorrects (lien désactivé), mot de passe trop faible, déjà utilisé, compte verrouillé, trop de tentatives, hors ligne, erreur avec référence. « Demander un nouveau lien » rouvre la demande.

Écarts :
- Aucun écran, route de navigation ni App Link pour le lien de réinitialisation : l’e-mail « mot de passe oublié » mène nulle part sur Android
- Routes réseau de vérification du jeton (valid, requires2FA) et d’envoi (token, newPassword, confirmPassword, twoFactorCode)
- Port du PasswordResetFlow pur (phases form/saved/linkInvalid/attemptsExhausted, notices) et du mapping PasswordResetOutcome par code/texte/statut 429-400
- Présentation par-dessus n’importe quel écran (même connecté) et enchaînement « demander un nouveau lien »
- Indicateur de force du mot de passe et libellés d’erreur précis ; saisie du code 2FA assainie à 6 chiffres

Rendu : Écran plein : titre « Nouveau mot de passe », deux AuthTextField sécurisés avec œil, encart de force, champ code si exigé, bouton principal « Enregistrer le mot de passe » ; état succès avec coche et « Se connecter » ; états lien invalide / trop de codes avec icône d’avertissement et bouton « Demander un nouveau lien ».

Transposition Android : UIHostingController présenté sur le contrôleur le plus haut -> destination plein écran avec deep link App Link

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyNewPasswordView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/PasswordReset.swift`
- `apps/ios/Meeshy/Features/Auth/PasswordResetLinkPresenter.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AccountRecoveryScreens.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### Avant de publier, d’inviter ou de créer un lien, demander de valider son e-mail sans perdre l’action

`auth-activation-email-gate` · Android : **absente** · P1 · effort S

Quand une action exige une adresse prouvée (publier, inviter par e-mail, créer un lien, dépasser 5 liens actifs), une porte « Validez votre adresse e-mail » s’ouvre avec la phrase adaptée (« Votre publication est conservée et partira dès le code validé »), la saisie du code et « Plus tard ». Les demandeurs en attente reprennent automatiquement dès que le code est juste. Elle ne s’affiche pas pendant l’onboarding et ne reproche plus l’adresse déjà prouvée.

Écarts :
- Contrôleur de porte (emailKnownUnproven, verifyEmail(for: reason)) avec attente partagée des demandeurs et résolution unique
- Raisons publish / invite / link / moreLinks et phrases localisées
- Écran de porte en feuille avec saisie du code (réutilise le composant de vérification) et « Plus tard »
- Câblage dans les publications, invitations par e-mail et création de liens du dépôt Android

Rendu : Feuille avec titre « Validez votre adresse e-mail », phrase contextuelle secondaire, saisie du code, bouton « Plus tard » en texte discret.

Transposition Android : CancellableWaiters -> CompletableDeferred partagés

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Activation/EmailVerificationGateController.swift`
- `apps/ios/Meeshy/Features/Activation/EmailVerificationGateScreen.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactViewModel.kt`

### Un compte de moins de 13 ans voit un écran définitif, pas une erreur qui boucle

`auth-age-gate` · Android : **absente** · P1 · effort S

Après une déclaration sous 13 ans, la connexion, le lien magique et le rafraîchissement du jeton répondent 403 AGE_BELOW_MINIMUM. Le transport signale ce cas ; un contrôleur permanent affiche par-dessus l’écran de connexion comme par-dessus une session fermée un écran « Meeshy est réservé aux 13 ans et plus » (icône main levée, texte, bouton unique qui déconnecte).

Écarts :
- Détection du 403 AGE_BELOW_MINIMUM dans le transport (intercepteur) et signal global
- Overlay racine au-dessus de la connexion et de l’app connectée, rendu modal (a11y) avec icône main levée en dégradé de marque, titre, corps, bouton pleine largeur
- Acquittement : déconnexion si connecté, sans reconnexion qui boucle
- Messages localisés « ageGate.body » et « onboarding.age.refused.* »

Rendu : Écran centré : symbole 72 dp (plafonné 110 dp), titre title2 bold, corps muted centré, bouton capsule dégradé de marque hauteur ≥ 50 en bas ; fond dégradé principal.

Transposition Android : NotificationCenter -> SharedFlow du SessionExpiryNotifier ; overlay -> Dialog plein écran

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Onboarding/AgeGate.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/AuthExpiryInterceptor.kt`

### Une preuve par e-mail ouvre la session sans jamais écraser un autre compte

`auth-email-proof-session-adoption` · Android : **absente** · P1 · effort M

Une preuve reçue (code, lien magique, vérification) devient une EmailProvenSession avec sa fenêtre d’adoption (durée servie par la passerelle moins une marge de 60 s, bornée à 30 min ; repli 9 min session / 4 min second facteur). L’app l’installe seulement hors changement de compte, peut la poser en tenant la session de l’inscription, bascule vers le compte prouvé (switchToProvenAccount) ou l’écarte (discard) ; une session refusée est refermée côté passerelle. La SessionOpeningGate retient l’ouverture tant qu’une feuille d’accès est affichée et l’exécute à sa fermeture.

Écarts :
- Types EmailProvenSession, SecondFactorRequired, LinkConfirmationRequired et ProvenAdoptionWindow (miroir de packages/shared/utils/proven-session-adoption.ts) à porter en Kotlin pur avec tests
- Installation/ouverture de session distincte de la réponse réseau (aujourd’hui storeSession est immédiat dans loginWithMagicLink)
- Fermeture côté passerelle d’une session prouvée mais refusée (SessionReplacementRefused, AccountSwitchUnderway)
- Porte d’ouverture différée : la session ne s’ouvre qu’une fois la feuille d’accès fermée, et une preuve par lien ferme la feuille affichée
- Inscription qui TIENT sa session (registerHoldingSession) tant que le code n’est pas saisi, avec délai de grâce

Rendu : Aucun visuel propre ; contrat de séquencement : fermer la feuille, puis ouvrir la session pour éviter une présentation orpheline.

Transposition Android : ObservableObject SessionOpeningGate -> StateFlow + SharedFlow dans le ViewModel racine

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager+EmailAccess.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/ProvenAdoptionWindow.swift`
- `apps/ios/Meeshy/Features/Auth/SessionOpeningGate.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/MagicLinkValidateViewModel.kt`

### Se déconnecter ferme aussi la session côté serveur, avec reprises

`auth-logout-server-close` · Android : **absente** · P1 · effort S

La déconnexion locale est immédiate et la fermeture côté passerelle est tentée avec trois essais (0 s, 1 s, 5 s). Un 401 signifie que la session est déjà close et arrête les essais ; l’échec final est journalisé comme session pouvant subsister.

Écarts :
- AuthRepository.logout() n’appelle aucune route serveur (AuthApi n’a pas de logout) : la session reste ouverte côté passerelle
- Route de déconnexion avec jeton explicite (le jeton local est effacé avant l’appel) et 3 essais avec reprise 1 s / 5 s en tâche de fond (WorkManager si hors ligne)
- Arrêt immédiat sur 401 (session déjà close)
- Journalisation d’échec définitif

Rendu : Aucun visuel ; la déconnexion reste instantanée à l’écran.

Transposition Android : Task détaché -> coroutine NonCancellable / WorkManager OneTimeWork

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthServerLogout.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`

### Déclarer sa date de naissance, ou passer l’étape, avec une réponse claire sous 13 ans

`auth-onboarding-card-age` · Android : **absente** · P1 · effort S

Quand la passerelle sert l’étape, une carte demande la date de naissance par sélecteur (plage 120 ans, valeur initiale 13 ans), « Confirmer » ou « Passer » (âge inconnu = aucune restriction). La passerelle décide : sous 13 ans Meeshy n’est pas ouvert (carte de refus définitive avec déconnexion), de 13 à 17 ans Global se lit sans s’écrire. États : envoi, date invalide, échec, refus.

Écarts :
- Carte âge avec DatePicker (Material3) limité à 120 ans et initial 13 ans ; bouton Confirmer inactif tant que non choisi
- Route de déclaration de la date de naissance et erreurs typées (belowMinimumAge, alreadySet, unsupported, invalidDate, unavailable)
- Carte de refus < 13 ans (définitive) avec déconnexion ; continuité avec la barrière d’âge (auth-age-gate)
- Écriture Global fermée pour 13-17 ans : la carte Global se retire quand la restriction ferme le composeur

Rendu : Carte avec sélecteur de date en roue/calendrier centré, message d’erreur sous le sélecteur selon l’état, boutons « Confirmer » et « Passer » ; refus : icône main levée dégradé de marque, titre, corps, bouton de déconnexion.

Transposition Android : DatePicker iOS -> Material3 DatePicker ; Calendar -> java.time

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingAge.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingAgeCard.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`

### Valider son adresse e-mail pendant l’accueil, avec renvoi du lien et reprise automatique

`auth-onboarding-card-email` · Android : **absente** · P1 · effort S

La carte e-mail n’existe que pour un compte DÉCLARÉ non vérifié : elle montre l’adresse, propose « Renvoyer le lien » avec états envoi/envoyé/échec/attente, et se referme d’elle-même quand le serveur annonce l’adresse vérifiée (relecture au retour au premier plan). Si l’adresse est validée alors que la carte n’est pas courante, elle quitte la file sans bruit.

Écarts :
- Carte e-mail avec adresse (« onboarding.email.address »), bouton de renvoi et libellés d’état (envoyé / échec / en attente)
- Relecture de l’état d’onboarding au retour au premier plan pour détecter emailVerified
- Sortie silencieuse de la file si l’adresse est validée ailleurs
- Dépend de la route de renvoi de vérification (auth-api-contract)

Rendu : Illustration enveloppe ; ligne d’adresse avec icône, états (coche verte, sablier) en label secondaire ; bouton primaire « Renvoyer le lien ».

Transposition Android : scenePhase active -> Lifecycle ON_RESUME

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactViewModel.kt`

### Dire bonjour à tout le monde dans Global, déjà rédigé dans vos langues

`auth-onboarding-card-global-greeting` · Android : **absente** · P1 · effort S

La carte Global propose un message de salutation composé à partir de 8 modèles (nom + noms des langues du lecteur, formatés localement), modifiable dans un éditeur multiligne, et l’envoie dans la conversation Global. L’envoi donne un retour (envoi, envoyé, échec avec réessayer) et une récompense de points ; la langue d’origine n’est déclarée que si le gabarit est intact. Un compte de 13 à 17 ans qui lit Global sans y écrire voit la carte s’effacer.

Écarts :
- Carte Global avec éditeur (placeholder, indice de modification) et bouton Envoyer/Réessayer
- 8 gabarits de salutation localisés avec ListFormatter des noms de langues ; choix aléatoire stable et rafraîchi tant que le brouillon n’est pas touché
- Envoi via l’API de messages avec originalLanguage conditionnel et récompense réelle (poids content+conversation, servi par la passerelle)
- Retrait automatique si l’écriture est fermée (restriction 13-17 ans)
- Annonce et animation « +N points »

Rendu : Illustration globe ; champ multiligne arrondi avec indication « modifiable » ; états envoi (spinner), envoyé (coche + gain animé), échec (texte + Réessayer).

Transposition Android : ListFormatter -> android.icu.text.ListFormatter

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingGreeting.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Confirmer ses langues dès l’accueil pour lire tout le monde dans la sienne

`auth-onboarding-card-languages` · Android : **absente** · P1 · effort S

Première carte : la langue principale (pré-remplie depuis le profil ou l’appareil) et une langue secondaire facultative se choisissent dans des listes, avec un message qui explique le Prisme. « Confirmer » n’envoie la mise à jour du profil que si les langues ont changé (ou si le profil n’en avait pas), puis enregistre l’étape ; un échec affiche un toast sans bloquer.

Écarts :
- Carte langues (principale + secondaire facultative, libellé « Changer ») dans l’overlay d’onboarding
- Pré-remplissage : langue du profil, sinon langue de l’appareil ; secondaire = régionale si différente
- Envoi conditionnel de systemLanguage/regionalLanguage et toast d’échec « onboarding.languages.failed »
- Texte du Prisme (clés onboarding.languages.*) et accessibilité des sélecteurs

Rendu : Illustration prisme qui se retourne au toucher ; deux sections « Langue principale » / « Langue secondaire » en puces sélectionnables ; bouton primaire « Confirmer ».

Transposition Android : Menu/Picker -> LanguagePickerSheet existant

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LanguagePickerSheet.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/LanguageStepSelection.kt`

### Autoriser les notifications au bon moment, avec une carte qui explique pourquoi

`auth-onboarding-card-notifications` · Android : **absente** · P1 · effort S

Dernière carte avant le récapitulatif quand la permission est encore indéterminée : une cloche qui sonne, un message sur ce que l’utilisateur recevra, « Oui, prévenez-moi » (demande système) et « Pas maintenant ». La demande du démarrage à froid est reportée tant que cette carte est possible ; l’état de permission est lu avant de planifier l’étape.

Écarts :
- Carte notifications et résultat enregistré (done) ; permission POST_NOTIFICATIONS déclarée mais jamais demandée sur Android
- État de permission lu avant planification (notDetermined / authorized / denied) via ActivityResultContracts.RequestPermission et shouldShowRationale
- Report de l’invite du démarrage à froid pendant que la carte est planifiée (OnboardingPushPermissionGate)
- Chemin d’échec : refus définitif -> renvoi vers les paramètres de notification de l’app

Rendu : Illustration cloche (anneau + secousse ressort 0,25/0,25 à 0,3 s puis retour) ; deux boutons : primaire « Oui, prévenez-moi », secondaire « Pas maintenant ».

Transposition Android : UNUserNotificationCenter.requestAuthorization -> POST_NOTIFICATIONS (API 33+)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingFlow.swift`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelInstaller.kt`

### L’onboarding choisit ses cartes depuis l’état serveur et ne se rejoue jamais

`auth-onboarding-flow-engine` · Android : **absente** · P1 · effort M

Après la première arrivée, l’app lit l’état d’onboarding du compte (GET me/onboarding) : éligibilité, étapes vues ou pré-cochées, conversation Global, suggestions, e-mail vérifié, âge servi, restriction d’écriture. Elle compose la file des cartes (langues, âge, e-mail, Global, story, amis) plus notifications si la permission est indéterminée, puis un récapitulatif ; chaque carte est enregistrée de façon idempotente (done/skipped) via PATCH. Le parcours attend qu’un deep link, la célébration d’arrivée ou une destination tablette ait fini, se règle par utilisateur (clé locale) et signale sa présence aux autres demandeurs de permission push pour éviter qu’ils passent devant. Les points se lisent depuis le catalogue d’engagement.

Écarts :
- Aucun module onboarding Android : ni service GET/PATCH me/onboarding, ni modèles (OnboardingStepId, outcome, état, suggestions, récompenses)
- Moteur de file : pendingGestureSteps (languages, age, email, global, story, friends) selon l’état serveur, sauts (productifs déjà faits) et ordre
- Hôte monté sur chaque racine : retenu tant qu’un deep link mène ailleurs, qu’une célébration d’arrivée est en cours ou qu’une destination tablette est ouverte ; ne démarre que si non réglé localement et éligible
- Actions : suivant, plus tard, tout passer, terminer (enregistrement idempotent, rejeu sans effet)
- Récompenses par étape (barème du catalogue d’engagement, pondération serveur) et pastille de points de session
- Signal de présence + porte de permission push : la carte notifications passe avant l’invite du démarrage à froid
- État de réglage par utilisateur (clé locale) pour ne pas relire le serveur ; journal de contexte

Rendu : Aucun visuel propre ; ordre et conditions des cartes sont le contrat produit (miroir web).

Transposition Android : UserDefaults settled -> DataStore ; Combine -> StateFlow/Flow

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingFlow.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/OnboardingService.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingPresenceSignal.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingPushPermissionGate.swift`

</details>

### Le parcours d’accueil est un calque fluide avec points, progression et récompenses animées

`auth-onboarding-overlay-ui` · Android : **absente** · P1 · effort L

Un calque plein écran (rendu inaccessible sous lui pour les lecteurs d’écran) pose un fond, une barre haute (pastille de points de session, « Tout passer »), une barre de progression par étape et la carte courante qui glisse de droite à gauche en ressort (fondu sous Reduce Motion). Chaque carte partage une mise en page (illustration animée, titre, message, contenu, actions primaire/secondaire). Un gain de points fait voler « +N » du bas vers la pastille avec rebond, annonce vocale et haptique de succès. Illustrations animées : prisme (retourne), Global (apparition), story (anneau), amis, e-mail, notifications (cloche qui sonne), trophée.

Écarts :
- Calque d’onboarding Compose (Dialog plein écran) avec fond OnboardingBackdrop, barre haute et barre de progression (position/total)
- Transition de carte asymétrique (entrée droite + fondu, sortie gauche + fondu ; fondu seul sous animations réduites) et ressort 0,5/0,86
- Pastille de points + vol de « +N » (offset 280 à 0, échelle 1,6 à 0,4, rebond de la pastille) avec annonce et haptique
- Composants : OnboardingCardLayout (illustration mise à l’échelle min 0,6 selon la place), boutons primaire/secondaire, jauge de niveau, puces
- Sept illustrations animées (prisme, Global, story, amis, e-mail, notifications, trophée) en Compose
- Tailles dynamiques plafonnées (accessibility2) ; calque isModal/focus piégé

Rendu : Fond dégradé indigo avec halo ; pastille de points arrondie en haut à gauche (sparkles + nombre), « Tout passer » texte secondaire (cible 44) en haut à droite ; barre de progression par segments ; carte centrée avec illustration au-dessus du titre (rounded bold), message secondaire, contenu, boutons empilés (primaire dégradé, secondaire texte) ; animations de ressort douces, aucune boucle infinie sous Reduce Motion.

Transposition Android : overlay SwiftUI -> Dialog Compose plein écran ; accessibilityAddTraits(.isModal) -> semantics paneTitle/isTraversalGroup

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingOverlay.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingVisuals.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingIllustrations.swift`

</details>

### Quand la session est fermée, l’app explique pourquoi avant de redemander la connexion

`auth-session-closed-notice` · Android : **absente** · P1 · effort S

Lorsque la passerelle ferme la session (événement auth:session-revoked avec motif), l’app affiche une feuille expliquant la cause : équipe Meeshy (avec lien de contact support@meeshy.me), appareil déconnecté depuis un autre appareil, mot de passe changé (avec contact), toutes les sessions fermées, session expirée, adresse e-mail à confirmer, ou déconnexion simple. Chaque motif a son icône et son texte ; le bouton « Se reconnecter » acquitte l’avis. Un motif inconnu d’un ancien binaire se traite comme une déconnexion générique.

Écarts :
- Écoute de l’événement socket auth:session-revoked (jamais écouté) avec décodage tolérant du motif (SessionRevocationReason.unknown)
- Avis de révocation en état (identifiable, horodaté) exposé à la racine et acquittable
- Feuille d’avis avec 7 variantes (icône, titre, message), lien de contact support pour adminRevoke et passwordChanged, bouton « Se reconnecter »
- Aujourd’hui SessionExpiryNotifier déconnecte silencieusement : l’utilisateur ne comprend pas pourquoi il revoit la connexion
- Soft re-auth : conserver le compte mémorisé et ne vider que le jeton actif

Rendu : Feuille scrollable centrée : grande icône SF équivalent (bouclier, appareil barré, clé, déconnexion, horloge, enveloppe) en indigo500, titre title bold, message body secondaire centré, bouton pleine largeur dégradé rayon md hauteur ≥ 50, lien de contact discret si pertinent.

Transposition Android : sheet iOS -> ModalBottomSheet ; lien mailto -> Intent ACTION_SENDTO

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Auth/SessionClosedNoticeView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/SessionRevocation.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/SessionExpiryNotifier.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/AuthExpiryInterceptor.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### « Valider mon compte maintenant » crée le compte et montre le code dans la carte, puis fête l’arrivée

`auth-signup-validate-now-verified` · Android : **absente** · P1 · effort S

Depuis la carte d’identité, « Valider mon compte maintenant » crée le compte en tenant la session (délai de grâce) et fait paraître DANS la carte la saisie du code à 6 chiffres (« Entrez le code à 6 chiffres envoyé à …, ou ouvrez le lien reçu »). Le code juste, ou le lien ouvert ailleurs, passe la carte à « Compte validé ! Tout est prêt : vos proches vous lisent dans votre langue » avec sceau vert, feu d’artifice, haptique de succès et annonce vocale ; le bouton principal devient « Parler aux autres » et ouvre la session puis l’app. Une inscription sans code reste permise pendant le délai de grâce.

Écarts :
- Étape « code » dans la carte (EmailCodeEntry embarqué) et surveillance de preuve ailleurs, partagées avec l’écran de vérification
- Création de compte avec session tenue (registerHoldingSession) puis ouverture via ProvenSessionOpener au clic « Parler aux autres »
- Étape « validé » : sceau vert dans un disque 72 dp, titre rounded bold, texte secondaire, feu d’artifice dans la carte (désactivé sous animations réduites), haptique success, annonce « Compte validé ! »
- Cas du refus d’ouverture de session (sessionNotOpened) et du compte validé sans session

Rendu : Étape code : texte footnote secondaire puis champ code ; étape validé : disque vert 16 % + sceau, titre « Compte validé ! » (title rounded bold), sous-texte centré, feux d’artifice clippés à la forme de la carte (rayon xxl continu).

Transposition Android : HapticFeedback.success -> HapticFeedbackType.Confirm ; annonce VoiceOver -> semantics liveRegion

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Auth/Signup/SignupView+Card.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupViewModel.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupPhases.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupViewModel.kt`

### Un lien vers une publication, un réel ou une story s’ouvre pour un visiteur sans compte

`auth-visitor-content-landing` · Android : **absente** · P1 · effort M

Quand un lien universel de publication, de réel ou de story arrive sans session, un écran visiteur s’affiche au-dessus de la connexion : le contenu public (média + texte + auteur) avec lecture automatique de la première vidéo, et une carte d’invitation « [Nom] vous a partagé ce réel/cette publication/cette story » (ou « Rejoignez Meeshy ») avec « Créer un compte », « Se connecter » et « Continuer à regarder ». Contenu refusé (« Ce contenu n’est pas accessible ») et chargement échoué (« Réessayer ») ont leurs états. Le lien n’est pas consommé : il s’ouvre encore après la connexion.

Écarts :
- Aucun écran visiteur : un lien de publication/réel/story sans session n’est ni routé ni affiché
- Chargeur de contenu public (served / refused / failed) et lecteur du post pour visiteur : médias, vidéo primaire en autoplay, texte, auteur et @pseudo
- Carte d’invitation avec le partageur suivi (TrackedLinkSharer), libellés par type de contenu, actions Créer un compte / Se connecter / Continuer à regarder (masquable) et Réessayer
- Présentation en couverture plein écran conditionnée par éligibilité (aucune session, rien d’autre ne couvre la racine), bouton fermer (cible 44) avec fond translucide
- Après « Créer un compte »/« Se connecter » : refermer puis ouvrir l’écran de compte derrière (didDismiss), en gardant le lien en attente
- Remontée de portée visiteur (voir auth-visitor-reach-reporting)

Rendu : Fond système, contenu défilant, carte d'invitation ancrée en bas (transition bas + opacité 250 ms) ; bouton fermer rond translucide en haut à gauche, glyphe clair sur fond neutre ; fond de refus neutre ; titre et corps de la carte en typographie body, boutons empilés (principal Créer un compte).

Transposition Android : fullScreenCover -> destination plein écran ; MeeshyVideoPlayer -> ExoPlayer/Media3 du module feed

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VisitorContentView.swift`
- `apps/ios/Meeshy/MeeshyApp+VisitorContent.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### L’accueil du premier lancement propose Créer un compte ou Se connecter

`auth-welcome-screen` · Android : **absente** · P1 · effort S

Plein écran présenté une seule fois (drapeau hasCompletedOnboarding) avant l’écran de connexion quand aucune session, aucun lien invité ni lien visiteur ne le préempte : logo animé, titre « Meeshy » en dégradé de marque, tagline « Écrivez dans votre langue. Tout le monde vous lit dans la sienne. », deux boutons de 52 pt (« Créer un compte » plein dégradé, « Se connecter » contour) et la signature de marque. « Créer un compte » ouvre l’inscription en plein écran ; l’accueil est soldé dès que le compte existe ou qu’on choisit « Se connecter » (l’e-mail déjà tapé est transmis à la connexion).

Écarts :
- Écran d’accueil Compose inexistant : l’app démarre directement sur Routes.LOGIN
- Drapeau persistant (DataStore) « accueil soldé » et règle de présentation : jamais si session ouverte, lien invité/visiteur en attente ou splash encore couvrant
- Transmission de l’e-mail saisi dans l’inscription vers la connexion (LoginEmailHandoff) quand on bascule vers « Se connecter »
- Tagline et libellés « welcome.* » à ajouter aux strings fr/en/es/pt (+ de/it/ar si supportées)
- Haptique medium sur Créer un compte, light sur Se connecter ; accessibilityHint « Ouvre le formulaire d’inscription » / « Ouvre l’écran de connexion »
- Inscription ouverte en plein écran avec overlay de toasts propre (toast d’un lien refusé visible au-dessus de l’accueil)

Rendu : Fond dégradé du thème, colonne centrée avec espaceurs haut/bas ; logo animé 100 dp trait 10 non continu ; titre largeTitle+6 rounded bold en dégradé purple700 vers purple500 ; tagline body secondaire centrée, marges 32 dp ; deux boutons pleine largeur (marges 32 dp), rayon md, hauteur min 52 dp : plein dégradé de marque texte blanc bold / contour inputBorder 0,6 texte primaire semibold ; BrandSignature en pied ; largeur de formulaire bornée sur tablette (formColumnWidth).

Transposition Android : fullScreenCover iOS -> destination Navigation Compose plein écran (ou Dialog fullscreen) ; AppStorage -> DataStore Preferences

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/WelcomeView.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LoginScreen.kt`

### Entrer dans World Wide sans compte : votre nom, votre langue, et c’est parti

`auth-world-guest-entry` · Android : **absente** · P1 · effort M

Depuis l’écran de connexion, une entrée « Entrer dans [titre du World] » mène en deux étapes à la conversation globale : (1) « Comment doit-on vous appeler ? » (nom 1 à 50 caractères), (2) « Bonjour [nom], vous lirez tout en… » avec la langue principale proposée depuis l’appareil parmi sept langues d’interface (fr, en, es, pt, de, it, ar). La disponibilité est vérifiée (GET /world) ; indisponible, hors ligne et échec d’entrée ont leurs messages. Une session déjà mémorisée reprend directement. Le titre vient toujours du serveur.

Écarts :
- Aucune entrée World : ni route de lecture de l’entrée (WorldEntry), ni entrée sur l’écran de connexion, ni conversation de type global en invité
- Deux étapes (nom puis langue) avec barre de 3 capsules de progression, retour/fermeture, annonce « Étape 1 sur 3 »
- Langue proposée depuis la locale appareil limitée aux 7 langues d’interface, repli fr
- Jonction en invité par clé de lien avec pseudo et langue ; session mémorisée et reprise automatique
- Messages : entrée indisponible, hors ligne, échec ; coquille de conversation World (titre, avatar, bannière, nombre de membres plafonné)
- Mêmes mots que le web et la planche « Login »/« Onboarding » (clés worldEntry.*)

Rendu : Fond du thème avec halo radial indigo500 (18 % sombre / 10 % clair) centré à 20 % de hauteur ; barre du haut : chevron retour, 3 capsules 24x4 dp (remplies jusqu’à l’étape), spacer 44 ; carte « Sans compte · votre nom et votre langue » avec séparateur « ou avec votre compte » ; transition à ressort 0,42/0,9 (aucune sous Reduce Motion).

Transposition Android : fullScreenCover -> destination plein écran ; ProgressView -> LinearProgressIndicator/capsules

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Auth/WorldEntry/WorldGuestEntryView.swift`
- `apps/ios/Meeshy/Features/Auth/WorldEntry/WorldGuestEntryViewModel.swift`
- `apps/ios/Meeshy/Features/Auth/WorldEntry/WorldGuestEntryCopy.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/AnonymousSessionRepository.kt`

### Un compte supprimé côté serveur quitte l’appareil avec ses jetons et son cache

`auth-account-deleted-retirement` · Android : **absente** · P2 · effort S

Quand la passerelle indique qu’un compte nommé est supprimé (purge confirmée, irréversible), il quitte le sélecteur de comptes avec ses jetons et son cache ; s’il est ouvert, sa session est démontée d’abord, sans inviter à se reconnecter. Aucun autre compte n’est touché : le retrait attend la fin d’un changement de compte puis ne vise que le compte nommé.

Écarts :
- Signal « compte supprimé » (AccountDeletedSignal) émis par le transport et consommé par l’auth
- Retrait du compte du sélecteur, de ses jetons Keystore et de son cache ; démontage de la session si c’est l’actif
- Loi pure : le retrait ne démonte la session ouverte que si c’est le compte retiré
- Pas de réauthentification proposée pour un compte en attente de retrait

Rendu : Aucun visuel propre ; le compte disparaît du sélecteur, sans erreur affichée.

Transposition Android : NotificationCenter signal -> SharedFlow dans le SDK

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager+AccountDeletion.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`

### L’adresse confirmée déclenche un feu d’artifice pendant que l’app prépare vos conversations

`auth-arrival-celebration` · Android : **absente** · P2 · effort S

Quand une adresse est prouvée (code ou lien), un écran plein affiche « Adresse confirmée ! — Nous préparons vos conversations… » avec un feu d’artifice dessiné en Canvas pendant 2,6 s (ou un simple fondu si animations réduites), haptique de succès et annonce « Adresse confirmée — connexion… » ; une action d’accessibilité « Continuer » permet de passer. En arrière-plan, l’app précharge le fil, les deux premiers réels et la liste d’amis pour que l’arrivée soit instantanée.

Écarts :
- Contrôleur de célébration (début, préparation sans fête, passage, réinitialisation à la déconnexion) avec tenue de 2,6 s annulable
- Canvas de feux d’artifice (particules) en Compose avec mode fondu sous animations réduites
- Préchargement d’arrivée : premier fil, 2 réels prêts (sans preroll), amis ; chaque utilisateur une seule fois
- Haptique succès, annonce d’accessibilité et action « Continuer » pour sauter
- Option « célébrer » vs « préparer seulement » (l’inscription a sa propre fête dans la carte)

Rendu : Fond du thème, feux d’artifice multicolores dans les teintes de marque, titre « Adresse confirmée ! » (title rounded bold) et ligne secondaire « Nous préparons vos conversations… » centrés ; fondu 300 ms vers l’app.

Transposition Android : Canvas + TimelineView SwiftUI -> Compose Canvas + withFrameNanos ; UIAccessibility.post -> semantics liveRegion

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Auth/Arrival/ArrivalCelebrationController.swift`
- `apps/ios/Meeshy/Features/Auth/Arrival/ArrivalCelebrationView.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeViewModel.kt`

### En invité, partager seulement ce que le lien autorise (texte, audio, image, PDF)

`auth-guest-attachment-sheet` · Android : **absente** · P2 · effort S

Le bouton pièce jointe d’un invité ouvre une feuille « Partager dans [conversation] » avec des tuiles pour les seuls types autorisés (fichier texte .txt, audio, image, PDF), une note « Sans compte, … accepte vos messages, vos vocaux, des images », l’invitation « Créez un compte pour partager le reste » et « Annuler ». Chaque sélection est triée avant tout envoi : type refusé ou fichier trop lourd donne un refus localisé dans la feuille (et un message précis quand la passerelle refuse). Le salon World plafonne encore ces types.

Écarts :
- Modèle GuestAttachmentAllowance (types autorisés, tailles maximum, verdict par fichier) et GuestAttachmentKind (text/audio/image/pdf) ; Android force aujourd’hui canSendFiles/images sans tailles ni types
- Feuille Compose avec grille 2 colonnes de tuiles (icône teintée, libellé), sélecteur de fichiers SAF filtré par type, multi-sélection
- Tri avant envoi (acceptés / refusés avec raison kind ou size) et textes de refus serveur
- Plafond « World invité » (worldGuestCeiling) pour les sessions issues de World Wide
- Note et invitation à créer un compte avec ouverture de l’inscription

Rendu : Feuille moyenne/grande avec poignée ; tuiles 96 dp min, rayon lg, fond noir 35 % (sombre) ou blanc, liseré indigo200 ; pastille circulaire teintée par type (texte indigo400, audio succès, image avertissement, PDF info) ; bouton Annuler contour indigo300.

Transposition Android : fileImporter -> ActivityResultContracts.OpenMultipleDocuments

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/GuestAttachmentCopy.swift`
- `apps/ios/Meeshy/Features/Main/Views/GuestAttachmentSheet.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AnonymousSession.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Retrouver ses amis dans son carnet d’adresses ou parmi des suggestions

`auth-onboarding-card-friends-contacts` · Android : **absente** · P2 · effort M

La carte amis montre jusqu’à 3 suggestions (dépliables) avec « Ajouter » / « Ajouté » et une récompense en attente. Elle offre aussi de chercher les amis dans les contacts du téléphone : promesse de confidentialité, demande de permission, recherche (seuls les inscrits sont gardés), liste triée trouvée, « personne trouvé » avec invitation par SMS, accès refusé avec raccourci vers les réglages. Un refus passe l’étape sans bloquer ; « Plus tard » ou « Continuer » selon que des demandes sont envoyées.

Écarts :
- Carte amis : suggestions serveur (3 puis « voir plus »), demande d’ami optimiste avec état échec, ligne de récompense en attente
- Phase carnet (OnboardingContactsPhase : unavailable, offer, searching, found, declined, deniedBySystem, failed) et permission READ_CONTACTS (absente du manifeste) ; le carnet appareil n’est pas branché côté Android (ContactList.kt le dit)
- Synchronisation du répertoire en mode remplacement et liste des inscrits seulement, sans soi-même, dédoublonnée, triée
- Invitation par SMS (Intent ACTION_SENDTO sms:) avec message localisé quand personne n’est trouvé ; raccourci vers les paramètres de l’app si refus système ; réessai au retour au premier plan
- Actions primaire/secondaire contextuelles (« Plus tard » si aucune demande, « Continuer » sinon)

Rendu : Rangées d’amis : avatar, nom, @pseudo, langues, bouton Ajouter (devient Ajouté en succès, accessible avec libellés a11y) ; bandeau de promesse avec icône main levée ; chevrons « Voir plus ».

Transposition Android : CNContactStore -> ContactsContract + READ_CONTACTS ; MFMessageComposeViewController -> Intent ACTION_SENDTO

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingContacts.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingFriendsCard.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/DiscoverTab.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/DiscoverViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`

### Publier sa première story depuis l’accueil, avec chaque état du téléversement

`auth-onboarding-card-story` · Android : **absente** · P2 · effort M

La carte story ouvre le compositeur de stories ; au retour elle suit le téléversement : envoi en cours, échec (réessayer), refus de contenu, publiée (récompense). Si l’e-mail n’est pas vérifié, elle l’explique et renvoie vers la vérification. L’audience par défaut (amis ou publique) est annoncée. Le résultat se lit sur les téléversements en vol, pas seulement sur la fermeture du compositeur.

Écarts :
- Carte story avec boutons Créer / Réessayer / Continuer selon OnboardingStoryState (idle, publishing, failed, rejected, published)
- Suivi des téléversements ouverts/clos par identifiants (storyComposerOpened/Closed/UploadsChanged/Succeeded/Rejected)
- Blocage par e-mail non vérifié (canPublishStory == false) avec lien vers la porte d’activation
- Libellé d’audience par défaut (amis / publique) et récompense de publication

Rendu : Illustration anneau animé (1,6 s) ; bloc d’état avec icône et détail (« Envoi… », « Échec », « Refusé »), bouton primaire contextuel.

Transposition Android : sheet du compositeur -> destination du compositeur de stories (feature:stories)

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories`

### Le récapitulatif de fin montre points, niveau, série et badges, puis ouvre Global ou le jeu

`auth-onboarding-recap` · Android : **absente** · P2 · effort S

La dernière carte relit les chiffres RÉELS du serveur (points, niveau avec jauge, jours de série, badges) et montre un trophée ; son message change selon qu’un geste productif a été fait (corps), rien (vide) ou une série à poursuivre (« Revenez demain : jour N+1 »). Actions : « Explorer Global » (ouvre la conversation), « C’est fait », et « Le jeu » quand disponible. La pastille de points de session disparaît à ce moment.

Écarts :
- Carte récapitulatif avec statistiques (sparkles/points, star/niveau, flamme/série, rosette/badges) et jauge de niveau
- Lecture de la progression d’engagement (élan, seuils de niveau, poids de familles) servie par la passerelle ; crédit réel par étape (creditedPoints) et facteur d’élan
- Message conditionnel (a produit / vide / demain) avec formatage localisé des nombres
- Actions Explorer Global / C’est fait / Le jeu, fin d’onboarding (finish) et règlement local par utilisateur

Rendu : Trophée animé (apparition ressort 0,55/0,55), quatre puces statistiques en grille avec icône teintée, jauge de niveau, boutons primaire « Explorer Global » et secondaire « C’est fait ».

Transposition Android : jeu Meeshy (feature:gamification éventuelle) à lier si présent

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Onboarding/OnboardingCards.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingViewModel.swift`
- `apps/ios/Meeshy/Features/Onboarding/OnboardingVisuals.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EngagementSessions.kt`

### Compter un lecteur sans compte une seule fois, sans jamais savoir qui il est

`auth-visitor-reach-reporting` · Android : **absente** · P2 · effort S

Un lecteur sans compte reçoit une clé aléatoire « visitor_ » stockée dans le trousseau et envoyée en jeton de session ; elle est effacée dès qu’un compte se connecte. Les événements d’audience qu’il produit sont mis en file persistante (500 max, empreinte SHA-256 de la clé), envoyés groupés après 2 s, au retour de connexion et au retour au premier plan, puis retirés à l’acquittement.

Écarts :
- Générateur de clé visiteur persistant (préfixe visitor_, Keystore), purge à la connexion
- File d’événements sociaux persistée (500 max) avec empreinte d’identité et vidage différé, sur reconnexion réseau et foreground
- En-tête X-Session-Token = jeton invité sinon clé visiteur ; connaissance des jetons connus pour l’acquittement
- Test unitaire du plafond, de la restauration et du vidage idempotent

Rendu : Aucun visuel ; contrat de confidentialité : aucun identifiant d’appareil, seulement une empreinte HMAC côté serveur.

Transposition Android : UserDefaults + Keychain -> DataStore + Keystore ; Combine reconnect -> Flow du moniteur réseau

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/VisitorReachReporter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/VisitorReaderKey.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/AnonymousSessionRepository.kt`

### Ouvrir un lien de connexion ou de vérification demande confirmation avant de changer de compte

`auth-sign-in-link-opener` · Android : **divergente** · P1 · effort M

Un lien magique ou de vérification d’e-mail ouvert (à froid ou à chaud, connecté ou non) est prouvé auprès de la passerelle. Si le lien n’a pas été demandé par cet appareil, l’app montre l’identité du compte à ouvrir et demande confirmation ; si une session différente est ouverte, une alerte « Ouvrir un autre compte ? » nomme les deux comptes (« N’ouvrez ce compte que s’il est le vôtre »). Succès : toast « Connexion réussie ! » ou « Email vérifié ! » (avec fête d’arrivée pour une vérification) ; échec : message précis (lien invalide ou expiré, second facteur requis, session refusée).

Écarts :
- Android déconnecte silencieusement le compte ouvert puis valide le lien : aucune confirmation « Ouvrir un autre compte ? » ni message nommant les comptes
- Variante lien de vérification d’e-mail (token + adresse) absente ; seul /auth/magic-link est routé
- Branche « confirmation requise » (requiresConfirmation + identité masquée du compte) et rejeu avec confirm = true
- Branche second facteur requis sur un lien, et bascule de compte via switchToProvenAccount avec refus typés (expiré, échec, session déjà en bascule)
- Toasts de succès « Connexion réussie ! » / « Email vérifié ! » et fête d’arrivée pour une vérification
- Dialogue de confirmation modal avec réponse asynchrone (accepté / refusé / indisponible)

Rendu : Alerte système : titre « Ouvrir un autre compte ? », message avec les deux libellés (nom affiché ou @pseudo), boutons « Annuler » et « Ouvrir ce compte » (action principale).

Transposition Android : UIAlertController -> AlertDialog Compose ; toasts -> FeedbackToast global

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Auth/SignInLinkOpener.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/MagicLinkValidateViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/MagicLinkValidateScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`

### S’inscrire en quelques gestes : le téléphone d’abord, puis l’adresse, puis la carte du compte

`auth-signup-phased-flow` · Android : **divergente** · P1 · effort M

L’inscription est un seul écran dont les phases paraissent progressivement et ne disparaissent jamais : numéro (requis par l’écran, avec pays), adresse e-mail dès qu’un numéro plausible existe, puis la carte « Votre compte » (nom affiché et @pseudo pré-dérivés et modifiables, mot de passe facultatif qui n’apparaît qu’une fois l’identité définie, avec l’aide « Pourquoi mettre un mot de passe maintenant ? »), la puce de langue de lecture, le bouton « S’inscrire » (actif dès la carte et un formulaire prêt) et « Déjà un compte ? Se connecter ». Les refus se posent sous chaque champ (pseudo trop court/long/caractères, numéro, nom, adresse) avec haptique d’erreur ; le code de parrainage éventuel part avec la requête.

Écarts :
- Android est la génération précédente (nom affiché, e-mail, téléphone facultatif, mot de passe obligatoire, langue) : l’iOS est passé à des phases vivantes (SignupProgress monotone, #8288) et à un téléphone REQUIS par l’écran (#9343)
- Machine SignupPhases (phone/email/card/code/verified), SignupPrimaryAction (S’inscrire/Parler aux autres) et règle phoneRefusalShown
- Carte d’identité : nom affiché et @pseudo dérivés (RegistrationIdentity.pseudoSlug/capitalizeName/slugDAdresse, bornes 2 à 16), champ pseudo avec refus en direct (tooShort/tooLong/invalidCharacters) et suggestions de pseudos libres
- Mot de passe facultatif (6 caractères min) révélé à l’identité définie et jamais refermé, aide dépliable ; Android l’exige
- RegisterRequest sans affiliateToken/affiliateSessionKey/claimEmail ; parrainage en attente (PendingReferralStore) non porté
- Retours haptiques error/success, annonces VoiceOver/TalkBack « Compte validé ! », transitions de phase (ressort 0,42/0,8, opacité+déplacement+échelle 0,97 ; opacité seule sous Reduce Motion)
- Verre liquide de la carte (fond translucide flou + liseré inputBorder) à traduire en surface Material translucide ; fermeture du clavier au toucher hors champ et au défilement

Rendu : Fond dégradé du thème ; croix de fermeture dans sa propre barre (pas en inset flottant) ; en-tête « Créer votre compte » (header) + sous-titre « Vous lirez tout le monde dans votre langue. » ; champs en cartes rayon xxl avec liseré inputBorder 0,5 (indigo500 0,6 au focus) ; carte d’identité en verre liquide, titre rounded bold ; bouton principal dégradé pleine largeur, 0,6 d’opacité si inactif ; lignes d’erreur rouge caption sous le champ ; marges 24 dp, espacement xl entre blocs.

Transposition Android : fullScreenCover + scrollDismissesKeyboard -> destination plein écran + nestedScroll/IME dismiss ; adaptiveLiquidGlass -> surface Material3 translucide

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Auth/Signup/SignupView.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupView+Card.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupPhases.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/SignupForm.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/RegistrationIdentity.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupForm.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupSubmitError.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupRegionInference.kt`

### Tous les parcours d’authentification parlent le même contrat serveur

`auth-api-contract` · Android : **partielle** · P0 · effort M

Le service d’authentification iOS expose : connexion (rememberDevice), complétion 2FA, inscription (parrainage, revendication d’e-mail, conflit de numéro), lien magique (empreinte d’appareil, confirmation), mot de passe oublié/réinitialisé (vérification du jeton, code 2FA), code SMS et vérification de téléphone, vérification et renvoi d’e-mail, statut de vérification, disponibilité, propriété de numéro, rafraîchissement, changement de mot de passe et has-password, me, déconnexion. Les modèles portent les réponses spéciales (verification-required, requires2FA, requiresConfirmation, adoptWithinSeconds, phoneOwnershipConflict).

Écarts :
- Routes absentes d’AuthApi : complétion 2FA à la connexion, vérification et renvoi d’e-mail, statut de vérification, vérification du jeton de réinitialisation et envoi du nouveau mot de passe, mot de passe oublié par téléphone (3 routes), code SMS/vérification de téléphone, propriété de numéro, déconnexion, has-password
- LoginResponseData tolérant : token/user optionnels, status « verification-required », accountCreated, email, pendingSessionToken, requires2FA, twoFactorToken, requiresConfirmation + account, linkIntent, maskedEmail, adoptWithinSeconds
- LoginRequest sans rememberDevice ; RegisterRequest sans affiliateToken, affiliateSessionKey, claimEmail ; MagicLinkRequest sans deviceFingerprint/linkDeviceHash ; MagicLinkValidateRequest sans linkDeviceSecret ni confirm
- Erreurs typées (APIRejection avec code, owner masqué d’e-mail, suggestions) alignées sur MeeshyError
- Décodage tolérant des champs de MeeshyUI/MeeshyUser (activation, emailVerifiedAt, deactivatedAt, profileDecor, signalIdentityKeyPublic)

Rendu : Aucun visuel ; contrat de données partagé avec packages/shared (types) comme source de vérité.

Transposition Android : APIClient Swift -> Retrofit + kotlinx.serialization (AuthApi)

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Auth.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`

### Les notifications arrivent avec leurs actions (répondre, marquer lu, accepter, rappeler) dès le démarrage

`auth-app-delegate-push-bootstrap` · Android : **partielle** · P0 · effort L

Au démarrage l’app enregistre ses catégories de notification (message, mention, demande d’ami, social, social commentable, appel entrant, appel manqué, localisation, contact, invitation, audio, éphémère) et leurs actions (réponse inline, marquer lu, ouvrir, commenter, accepter, refuser, rappeler, répondre/refuser un appel, ouvrir dans Plans, ajouter un contact, rejoindre une invitation), le push VoIP, les tâches de fond, les pushes silencieux (une seule complétion garantie + fin de tâche), la présentation au premier plan, le traitement des réponses et le balayage des bannières éphémères expirées et des fichiers temporaires. Il installe aussi le voile de contenu protégé, le rapporteur de capture d’écran, le retrait de compte supprimé et le consentement analytics.

Écarts :
- Actions de notification : réponse inline (RemoteInput), marquer lu, commenter, accepter/refuser une demande d’ami, rappeler, ouvrir dans Maps, ajouter un contact, rejoindre une invitation (seules refuser-appel et ouverture existent)
- Canaux et groupes par catégorie (messages, mentions, social, amis, appels entrants avec sonnerie, appels manqués, éphémères, audio) et regroupement par conversation ; aujourd’hui deux canaux (messages, appels)
- Demande runtime de POST_NOTIFICATIONS (Android 13+) : permission déclarée mais jamais demandée
- Traitement des data-messages silencieux avec travail expédié (WorkManager) et garantie de fin unique, équivalent du budget de tâche d’arrière-plan
- Retrait des bannières éphémères expirées et des bannières livrées une fois lues (NotificationRevocation couvre une partie)
- Masquage du contenu protégé dans les récents/captures (FLAG_SECURE, équivalent ProtectedContentSnapshotVeil) et rapport de capture d’écran (ScreenCaptureCallback Android 14)
- Balayage périodique des fichiers temporaires média ; consentement analytics au démarrage ; retrait automatique d’un compte supprimé côté serveur
- Enregistrement PushKit/CallKit -> Telecom ConnectionService avec FCM haute priorité (à réconcilier avec le domaine appels/notifications)

Rendu : Bannières : titre = expéditeur/conversation, corps = texte servi dans la langue du lecteur (Prisme), icône de marque, couleur d’accent de conversation ; actions avec libellés localisés ; sonnerie dédiée pour les appels ; vérifier la cohérence avec le domaine notifications.

Transposition Android : UNUserNotificationCenter + catégories/actions -> NotificationChannel/Group + NotificationCompat.Action (RemoteInput) ; PushKit/CallKit -> Telecom ConnectionService + FCM data haute priorité ; NSE -> FCM data-message handler

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/AppDelegate.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelInstaller.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelIds.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/PushTokenHandler.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationRevocation.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/IncomingCallRingStore.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### La racine bascule proprement entre connexion, application connectée et couvertures

`auth-root-session-gate` · Android : **partielle** · P0 · effort M

La racine lit un instantané de session (connecté, session stockée résolue, bascule de compte en cours, avis de révocation, langue système) et choisit entre l’écran de connexion et l’app connectée. Au-dessus : couverture invité (lien de partage), couverture visiteur (contenu public), accueil, bandeau « lien en attente » sous la connexion, feuille d’avis de session fermée, hôte d’overlays global (toasts, barrière d’âge, feuille de rapports de crash). Sur iPad, des fenêtres détachées (conversation, réels) partagent les mêmes overlays.

Écarts :
- État « session stockée résolue » (hasResolvedStoredSession) distinct de isAuthenticated pour ne jamais flasher la connexion pendant la restauration
- Règles de présentation ordonnées (invité > visiteur > accueil/onboarding) isolées dans un objet pur testable (équivalent RootPresentationRules)
- Bandeau « lien en attente » au-dessus de la connexion quand un lien nécessitant un compte est retenu (animation easeOut 250 ms)
- Feuille modale d’avis de session fermée (voir auth-session-closed-notice) pilotée par l’instantané de session
- Hôte d’overlays racine : toasts de feedback, barrière d’âge, feuille des rapports de crash (aujourd’hui CrashReportScreen n’existe que dans Réglages)
- Verrou isSwitchingAccount qui bloque connexion/reprise/preuve par lien pendant un changement de compte
- Fenêtres détachées iPad -> multi-fenêtre/bureau Android et pliables (P2)

Rendu : Transitions de couverture en fondu 250 ms ; bandeau de lien en attente en inset haut sous la barre système ; l’ordre de superposition est un contrat : invité/visiteur au-dessus de la connexion, accueil au-dessus, overlays de toasts toujours au sommet.

Transposition Android : WindowGroup + fullScreenCover iOS -> NavHost + destinations plein écran/Dialog ; iPad détaché -> fenêtres adaptatives (tablette/pliable)

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/App/AppRootGate.swift`
- `apps/ios/Meeshy/App/AppRootSession.swift`
- `apps/ios/Meeshy/App/SessionContent.swift`
- `apps/ios/Meeshy/App/OverlayHost.swift`
- `apps/ios/Meeshy/MeeshyApp.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthViewModel.kt`

### Ouvrir ou fermer une session exécute toujours les mêmes étapes, dans le même ordre

`auth-session-open-close-plan` · Android : **partielle** · P0 · effort M

Un plan pur ordonne l’ouverture (tag crash, replay du lien de partage en attente, coordinateurs de notifications, cache, publication de stories, hydratation des amitiés, reconnexion des sockets, pont du store conversations, invite de permission push, compteur de non-lus, ré-enregistrement des jetons push/VoIP, envoi du bundle E2EE, migration trousseau) et la fermeture (reset notifications, vider amitiés, sessions E2EE, délier le cache, désenregistrer VoIP, terminer l’appel actif, couper sockets et relais, annuler les tâches de fond). La séquence de lancement et les hooks de cycle de vie (premier plan, arrière-plan) s’y rattachent : resync des notifications, rafraîchissement du profil (au plus 1/min), balayage disque, emitAppForeground, coordinateur d’arrière-plan unique.

Écarts :
- Plan d’ouverture et de fermeture formalisé (objets purs testables) : aujourd’hui les effets sont éparpillés entre AuthViewModel, ChromeViewModel.warmUp et RealtimeSessionCoordinator
- Étapes de fermeture manquantes : terminer l’appel actif, désenregistrer le service d’appel, annuler les tâches WorkManager, vider les sessions E2EE, couper les relais
- Ouverture : ré-enregistrement du jeton FCM, rafraîchissement du compteur de non-lus, envoi du bundle E2EE, replay du lien de partage en attente d’un compte
- Retour au premier plan : rafraîchissement du profil avec limite 60 s, resync des lacunes de notifications, balayage disque borné (10 min), vidage des actions widgets ; réarmer le socket uniquement après un vrai retour d’arrière-plan
- Passage en arrière-plan : coordinateur unique (arrêt des lecteurs, flush des caches, ack des pushes, arrêt des heartbeats, planification WorkManager, synchro widgets) et checkpoint des sessions d’engagement
- Notification du bon état « isCallActive » aux sockets pour ne pas reconnecter pendant un appel

Rendu : Pas de visuel ; contrat d’ordre et d’idempotence uniquement (un plan, une exécution par transition d’état d’authentification).

Transposition Android : Hooks UIApplication/ScenePhase -> ProcessLifecycleOwner + WorkManager ; BGTaskScheduler -> WorkManager ; Keychain migration -> EncryptedSharedPreferences/Keystore

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/App/SessionTransitionPlan.swift`
- `apps/ios/Meeshy/MeeshyApp+LaunchSequence.swift`
- `apps/ios/Meeshy/MeeshyApp+Lifecycle.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MeeshyApplication.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeSessionCoordinator.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`

### La session se restaure, se rafraîchit et se défend sans jamais mélanger les comptes

`auth-session-refresh-ownership` · Android : **partielle** · P0 · effort M

Au démarrage, l’app restaure la session du compte actif depuis le trousseau et marque la restauration comme résolue ; elle décode l’expiration du JWT (marge 30 s), rafraîchit en vol unique (une seule tâche partagée) et rejoue une requête 401 uniquement si elle partait avec le jeton du compte actif de la session courante (génération, jetons retirés mémorisés). Un refus d’authentification ne démonte que le compte qui l’a reçu ; la session déconnectée conserve le compte mémorisé pour une reconnexion en un geste. Le profil se relit au plus une fois par minute et ne remplace pas un état optimiste plus récent.

Écarts :
- Rafraîchissement mono-vol explicite (une tâche partagée) et rejeu conditionné à la propriété de la requête (jeton présenté, génération de session, mémoire de 8 jetons retirés)
- Loi de réauthentification : un refus ne s’applique qu’au compte actif, sous la génération courante, hors sortie de session
- État hasResolvedStoredSession publié et verrous isSwitchingAccount / isLeavingActiveSession
- Limite de relecture du profil (60 s) et garde de génération pour qu’une réponse tardive n’écrase pas une session remplacée
- Origine de session (login, registration, lien) conservée (SessionOrigin) pour la fête d’arrivée et la permission push
- Ajout du refresh proactif quand le JWT approche l’expiration avec la sessionToken glissante (shouldRefreshBeforeSend existe, vérifier le câblage complet)

Rendu : Aucun visuel propre ; invariant de sécurité : jamais de jeton d’un compte rejoué pour un autre.

Transposition Android : Keychain -> EncryptedSharedPreferences/Keystore (EncryptedTokenStore) ; actor/Task -> Mutex + Deferred partagé

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManaging.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager+RequestOwnership.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager+Reauthentication.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthJWTExpiry.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/RefreshAuthenticator.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/AuthExpiryInterceptor.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/SessionExpiryNotifier.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/JwtExpiry.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`

### Aucune extension système ne garde l’identité après la déconnexion

`auth-extension-session-snapshot` · Android : **partielle** · P1 · effort S

Sur iOS un instantané de session vit dans l’App Group pour que les extensions (notification, widget, partage) lisent l’identité courante sans accéder à l’app ; il est purgé comme première opération de la déconnexion, idempotente, pour qu’un plantage en cours de route ne laisse pas d’identité orpheline.

Écarts :
- Les widgets Glance et le service FCM tournent dans le processus de l’app : pas d’instantané à écrire, mais la déconnexion ne purge ni les données de widgets, ni les raccourcis dynamiques, ni les notifications affichées
- Ajouter à SessionTeardown : ShortcutManager.removeAllDynamicShortcuts, mise à jour/vidage des widgets, annulation des notifications actives
- Ordre de purge : première opération de la déconnexion, idempotente

Rendu : Aucun visuel ; après déconnexion, widgets et raccourcis doivent afficher l’état déconnecté.

Transposition Android : App Group UserDefaults -> sans objet (même processus) ; widgets WidgetKit -> Glance ; NSE -> FCM data handler dans le processus principal

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/SessionSnapshotStore.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/shortcuts/DynamicShortcutsPublisher.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/WidgetEntryPoint.kt`

### Un lien reçu (partage, connexion, vérification, contenu) ouvre le bon écran, avec ou sans session

`auth-external-entry-deeplinks` · Android : **partielle** · P1 · effort M

Toute URL entrante est classée en une entrée externe : relais de partage, composition de partage, lien de connexion (magic link ou vérification d’e-mail avec adresse), ou deep link. Un lien reçu avant la fin de la vérification de session est retenu (pas d’invité fantôme), puis : join/chat -> session invité, magic/verification -> ouverture de session, lien externe /l/token -> navigateur, publication/réel/story -> écran visiteur sans consommer le lien. Les liens non reconnus retombent sur le navigateur. Un appel de rappel (activité startCall) n’est composé que si la session est résolue ET connectée.

Écarts :
- Classification unique des entrées (équivalent ExternalEntry) : LaunchRouter ne connaît que https://meeshy.me/auth/magic-link
- Lien de vérification d’e-mail (token + adresse) et lien de réinitialisation de mot de passe : filtres d’intents App Links et routes de navigation absents
- Liens /l/token de cible externe ouverts dans le navigateur sans session ; liens non reconnus renvoyés au navigateur
- Lien retenu tant que la restauration de session n’est pas résolue, puis rejoué (join/chat -> invité, publication/réel/story -> visiteur)
- Relais de partage et composition de partage via intents ACTION_SEND (ShareTargetActivity existe, vérifier la parité avec ShareRelay/ShareCompose)
- Rappel d’appel (Intent ACTION_CALL / raccourci) conditionné à session résolue et connectée
- Pas d’écran de confirmation si un lien d’un autre compte arrive en session ouverte (voir auth-sign-in-link-opener)

Rendu : Pas de visuel propre ; le lien en attente se matérialise par le bandeau de connexion (voir auth-root-session-gate).

Transposition Android : Universal Links + onOpenURL -> Android App Links (assetlinks.json) + onNewIntent/navDeepLink ; NSUserActivity startCall -> Intent ACTION_CALL / App Shortcuts

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/App/ExternalEntry.swift`
- `apps/ios/Meeshy/App/ExternalEntryHandlers.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`

### Rejoindre une conversation par lien sans compte, avec un écran dédié si l’accès prend fin

`auth-guest-share-link-session` · Android : **partielle** · P1 · effort M

Un lien de partage ouvert sans session présente une couverture plein écran : la conversation en mode invité (permissions réduites, pas d’ouverture de profils) si une session invité existe, sinon le formulaire/atterrissage de jonction. La session invité est mémorisée par lien (jeton, participant, permissions, types de pièces jointes autorisés) ; quitter l’efface et la révoque côté passerelle. Si le lien échoue (expiré ou accès retiré, événement meeshyGuestSessionEnded), un écran explique la cause et propose de coller un nouveau lien. « Créer un compte » depuis l’invitation rejoue le lien après connexion.

Écarts :
- Écran de fin de session invité (lien expiré / accès retiré) piloté par l’événement socket de fin, avec champ « coller un nouveau lien » qui reconstruit la session
- Mémorisation de plusieurs sessions invité par lien (clé par identifiant) et effacement + révocation serveur (leave) en quittant ; AnonymousSessionStore Android ne tient qu’une seule session
- Contexte de session sans allowedAttachmentKinds ni plafond World invité (voir auth-guest-attachment-sheet)
- Couverture plein écran au-dessus de la racine sans compte (mode invité) avec profils refusés (Router refusesProfiles) et signal « conversation en lecture »
- Demande de compte depuis l’invitation : mémoriser le lien en attente et le rejouer après connexion (replayShareLinkAwaitingAccount)
- Capteur de coupure : déconnecter le socket et vider le jeton de l’API quand la passerelle refuse la session

Rendu : Écran de fin : grande icône (horloge ou profil barré), titre « Ce lien a expiré » / « Votre accès a été retiré », message secondaire, champ pour coller un lien avec bouton actif seulement si le lien est reconnu (join/chat).

Transposition Android : fullScreenCover racine -> destination plein écran hors NavHost connecté ; Keychain AnonymousSessionStore -> DataStore chiffré (existant)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/App/GuestSessionCover.swift`
- `apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift`
- `apps/ios/Meeshy/Features/Main/Services/AnonymousSessionStore.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryResolver.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/AnonymousSessionRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/AnonymousSessionStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AnonymousSession.kt`

### Les champs et boutons d’authentification se ressemblent partout

`auth-input-atoms` · Android : **partielle** · P1 · effort S

Atomes partagés : champ de texte (icône à gauche, bord indigo au focus, texte secure), champ mot de passe avec œil et état annoncé « Affiché/Masqué », bouton d’action (état activé/désactivé animé), indicateur de force du mot de passe sur 6 niveaux (Trop faible à Excellent), et bouton (i) qui déplie une aide avec haptique légère.

Écarts :
- Champ mot de passe réutilisable (MeeshyPasswordField) avec bascule de visibilité et état annoncé (« Affiché »/« Masqué ») ; login et inscription Android utilisent des OutlinedTextField standards
- AuthTextField Compose : icône leading, bord indigo500 0,6 au focus, type de clavier/contenu (username, email, oneTimeCode, password)
- AuthActionButton : états activé/désactivé animés (ressort rapide), spinner, apparence nommée
- Indicateur de force visuel sur 6 niveaux (la logique PasswordStrength existe, mais n’est montrée que dans Changer le mot de passe) à brancher dans nouveau mot de passe
- Haptique légère à l’ouverture de l’aide ; AuthInfoDisclosure existe, aligner l’animation et le libellé accessible

Rendu : Champs sur fond inputBackground rayon md, liseré inputBorder 0,5 (indigo500 0,6 au focus), icône 18 dp muted ; jauge de force segmentée colorée (rouge à vert) avec libellé à droite ; bouton d’action dégradé de marque, opacité 0,6 inactif.

Transposition Android : SecureField -> OutlinedTextField + PasswordVisualTransformation ; Haptic light -> HapticFeedbackType.TextHandleMove/ContextClick

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthActionButton.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthInfoHint.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthTextField.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/MeeshyPasswordField.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/PasswordStrengthIndicator.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthInfoDisclosure.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PasswordStrength.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PasswordRequirements.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyPrimaryButton.kt`

### La langue de l’interface est appliquée avant le démarrage de l’app

`auth-interface-language-bootstrap` · Android : **partielle** · P1 · effort S

Le point d’entrée du processus écrit la langue d’interface choisie AVANT que l’app ne démarre, pour que le bundle, Locale.current et les vues système (sélecteur de photos, dates, « Annuler ») lisent tous la même langue. La langue est mise en cache depuis le profil (systemLanguage) dès la restauration de session et rafraîchie à chaque changement, y compris pour les notifications.

Écarts :
- Application de la locale au niveau Application/Activity (AppCompatDelegate.setApplicationLocales ou LocaleManager Android 13+) : aujourd’hui LocalizedContent ne surcharge que le contexte Compose, donc dialogues système et sélecteurs peuvent rester dans l’autre langue
- Cache de la langue dérivé de currentUser.systemLanguage dès la restauration de session, avant le premier rendu
- Rafraîchissement de la langue des notifications (canaux/templates FCM) au changement de systemLanguage

Rendu : Aucun visuel propre ; vérifier le RTL (arabe) et les formats de date/nombre à la volée.

Transposition Android : AppleLanguages + UILanguageOverride -> per-app language (LocaleManager / AppCompatDelegate) appliqué dans Application.onCreate

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/MeeshyLaunch.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/theme/LanguageViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppLanguage.kt`

### Le splash se lève dès que l’app est prête, jamais plus tôt ni trop tard

`auth-launch-splash-boot-gate` · Android : **partielle** · P1 · effort S

Le splash couvre l’app tant que le boot n’a pas atteint ses étapes (cache, outbox, file de réglages, session, liste de conversations) : plancher de 400 ms, plafond de 2 s, fondu de 300 ms, trois phases covering/fading/gone, et un journal qui dit si la levée vient de la disponibilité ou du plafond (avec l’étape bloquée). Le visuel (SplashScreen) montre le logo, la tagline « splash.tagline » et la signature de marque, avec animation à ressorts séquencée et pulsation, respectant Reduce Motion.

Écarts :
- Levée pilotée par la disponibilité du boot (étapes cache, outbox, settingsQueue, session, conversationList) au lieu du délai fixe SPLASH_MIN_DURATION_MS = 1200 ms
- Contrôleur à trois phases covering/fading/gone avec plancher 400 ms, plafond 2 s et fondu 300 ms (le splash Android disparaît sans fondu piloté)
- Journal Timber de la raison de levée (ready ou ceiling + étape en attente) pour diagnostiquer les démarrages lents
- Tagline localisée « splash.tagline » et séquence d’animation à ressorts (logo, titre, tagline) + pulsation continue, désactivées sous animations réduites
- Continuité visuelle entre l’API SplashScreen Android 12+ (icône animée) et le splash Compose pour éviter le double flash

Rendu : Fond du thème, logo central tracé progressivement, titre et tagline apparaissant en ressort (response 0,35 à 0,4 ; amortissement 0,6 à 0,7 ; décalages 0,2 s et 0,35 s), pulsation easeInOut 1,5 s en boucle, BrandSignature en pied ; fondu de sortie 300 ms ; aucune animation infinie si Reduce Motion.

Transposition Android : Splash SwiftUI superposé -> androidx.core.splashscreen (setKeepOnScreenCondition) + overlay Compose MeeshySplashScreen

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LaunchSplash.swift`
- `apps/ios/Meeshy/Features/Main/Views/SplashScreen.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/SplashLogoGeometry.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`

### Se connecter avec son identifiant et son mot de passe, dans l’identité visuelle Meeshy

`auth-login-form` · Android : **partielle** · P1 · effort M

L’écran de connexion montre un fond dégradé avec halos ambiants pulsants, le logo animé et le titre « Meeshy » en dégradé, puis la section adaptée (étape 2FA, sélecteur de comptes ou formulaire normal), le lien « Créer un compte » et la signature de marque. Le formulaire propose identifiant, mot de passe avec œil, bouton « Se connecter » (désactivé tant que vide, spinner pendant l’envoi), « Se connecter sans mot de passe » et « Mot de passe oublié ? ». Les erreurs apparaissent en ressort et s’effacent à la frappe. Les feuilles (mot de passe oublié, code e-mail, lien magique) et l’inscription plein écran se referment quand un lien prouve une session.

Écarts :
- Habillage de marque : fond dégradé du thème + halos ambiants (pulsation 2 s easeInOut en boucle, coupée sous animations réduites), logo animé 100 dp, titre « Meeshy » dégradé purple700 à purple500 avec ombre, apparition des champs en ressort (0,7/0,8, délai 0,2 s) ; Android affiche un BrandLogo + « Bon retour » Material standard
- Champ mot de passe avec bouton œil et état annoncé « Affiché/Masqué » (MeeshyPasswordField) ; Android n’a qu’une PasswordVisualTransformation sans bascule
- Bouton principal : spinner pendant l’envoi, désactivation visuelle, rebond au toucher, retour haptique ; erreur animée et effacée à la frappe
- Clavier : identifiant sans majuscule ni correction automatique, remplissage automatique (Credential Manager/Autofill), toucher hors champ ferme le clavier
- Branches de LoginOutcome absentes : twoFactorRequired (étape 2FA) et verificationRequired (feuille de code e-mail) ; une réponse sans token échoue aujourd’hui au décodage AuthSession
- Corps de requête sans rememberDevice/keepSignedIn (LoginRequest n’a que username/password)
- Pré-remplissage depuis l’inscription (LoginEmailHandoff) et depuis « Changer de compte » (LoginAccountHandoff) ; l’e-mail valide tapé alimente lien magique et mot de passe oublié
- Mot de passe oublié / lien magique / code e-mail / inscription présentés en feuilles et plein écran avec overlay de toasts, avec fermeture automatique quand un lien prouve une session (SessionOpeningGate)
- Signature de marque en pied (version · build, « by services.ceo » cliquable) et hiérarchie des liens (créer un compte discret + dégradé, sans-mot-de-passe avec icône, oublié)

Rendu : Colonne centrée, espacement MeeshySpacing (xxl sous le logo, xxxl+lg sous le titre), champs sur fond inputBackground bord inputBorder, bouton principal dégradé de marque rayon md hauteur 50 à 52, liens secondaires en MeeshyFont subhead semibold, signature de marque centrée en pied, couleurs via tokens de thème (jamais codées en dur), largeur bornée sur tablette.

Transposition Android : TextField secure + Keychain autofill -> OutlinedTextField + Credential Manager/Autofill ; sheet/fullScreenCover -> ModalBottomSheet/destination plein écran

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LoginScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthViewModel.kt`, `apps/android/feature/auth/src/main/res/values-fr/strings.xml`

### Reprendre un compte mémorisé en saisissant seulement son mot de passe

`auth-login-saved-accounts` · Android : **partielle** · P1 · effort S

Quand des comptes sont mémorisés, la connexion affiche d’abord leur liste (avatar, nom, @pseudo, état de session), « Autre compte » bascule vers le formulaire normal, un compte tapé ouvre sa saisie de mot de passe avec retour. La case « Rester connecté sur cet appareil » est proposée pour un compte supplémentaire. Un compte se retire de la liste par menu contextuel destructif « Supprimer ce compte ». Un compte à ouvrir depuis Réglages (« Changer de compte », « Ajouter un compte ») arrive directement sur son formulaire.

Écarts :
- Case « Rester connecté sur cet appareil » (offersKeepSignedIn) liée à rememberDevice et à la conservation de la session du compte quitté
- État de chaque ligne (session conservée / mot de passe requis) et avatar réel du compte
- Intentions de transfert LoginAccountHandoff (.addAccount / .account(id)) pour arriver directement sur le bon formulaire depuis Réglages
- Focus automatique du champ mot de passe 0,35 s après sélection ; transitions à ressort 0,4/0,8 ; haptique light ; rebond au toucher
- Menu contextuel (appui long) « Supprimer ce compte » avec rôle destructif en plus de l’icône de retrait actuelle
- Un compte conservé se reprend sans mot de passe (dépend de auth-multi-account)

Rendu : Lignes arrondies fond inputBackground et liseré inputBorder 0,3 ; avatar 40 dp avec nom (body semibold) et @pseudo (caption muted) ; flèche de retour dans un cercle 36 dp (cible 44) ; « Autre compte » en bouton secondaire ; transitions de bascule picker/formulaire en ressort.

Transposition Android : contextMenu iOS -> appui long + DropdownMenu ; Keychain par compte -> Keystore par compte

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LoginScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SavedAccounts.kt`

### Se connecter sans mot de passe en recevant un lien et un code par e-mail

`auth-magic-link-request` · Android : **partielle** · P1 · effort M

La feuille « Connexion par e-mail » demande l’adresse (contrôle strict), envoie le lien, puis passe à l’attente « E-mail envoyé · Code et lien envoyés à … » : saisie du code à 6 chiffres intégrée, compte à rebours de validité (annoncé en durée parlée), « Lien expiré, renvoyez-en un nouveau », « Renvoyer » désactivé pendant le décompte, aide dépliable « Comment ça marche » / « Rien reçu ? » (regarder les indésirables). Le lien envoyé est lié à l’appareil demandeur (empreinte) pour que l’ouverture sur un autre appareil exige une confirmation. L’adresse déjà tapée en connexion préremplit le champ.

Écarts :
- Saisie du code à 6 chiffres dans l’attente (EmailCodeEntry) en plus du lien ; l’attente Android n’offre que le lien
- Surveillance de preuve ailleurs (pendingSessionToken) pour afficher « Adresse confirmée » et demander le code
- Empreinte d’appareil liée au lien (linkDeviceHash/deviceFingerprint) et secret de validation côté appareil, absents de MagicLinkRequestBody
- Pré-remplissage de l’adresse depuis le champ identifiant de la connexion ; fermeture de la feuille et ouverture de session via la porte d’ouverture
- Compte à rebours annoncé en durée parlée (accessibilité) et bouton Annuler ; présentation en feuille modale plutôt qu’écran de navigation
- Réutilisation d’une demande déjà envoyée (adoptAlreadySent) quand un lien a été envoyé depuis l’inscription

Rendu : Étape 1 : en-tête explicatif + champ e-mail + bouton « Recevoir le lien » dégradé ; étape 2 : icône enveloppe, titre « E-mail envoyé », adresse en gras, champ code, compte à rebours monospace discret, bouton « Renvoyer » indigo400 grisé tant que le décompte court, bandeau d’expiration en avertissement.

Transposition Android : sheet iOS -> ModalBottomSheet ; Timer Task -> coroutine tick 1 s (MagicLinkCountdown existe)

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AccountRecoveryScreens.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AccountRecoveryViewModels.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/MagicLinkCountdown.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthInfoDisclosure.kt`

### Plusieurs comptes sur l’appareil, repris sans mot de passe quand on les garde

`auth-multi-account` · Android : **partielle** · P1 · effort M

Chaque compte a ses jetons sous des clés propres ; un seul est actif, les autres, s’ils sont gardés, dorment et se reprennent sans mot de passe. Quitter un compte (changement ou ajout) passe par la même sortie que la déconnexion (sockets, services, caches, files, brouillons) pour ne rien laisser au suivant ; sa session est fermée côté passerelle s’il n’est pas gardé. Le changement de compte est verrouillé (aucune connexion, reprise ou preuve par lien en parallèle) et possède son propre échec (expiré, échec).

Écarts :
- SavedAccountsStore ne mémorise que l’affichage (id, pseudo, avatar, dernière activité) : aucun jeton par compte, donc aucune reprise sans mot de passe ni changement de compte
- Coffre de jetons par compte (Keystore) avec compte actif, session conservée/non conservée (keepSignedIn) et fermeture serveur du compte non gardé
- switchAccount / suspendActiveSession / leaveActiveSession avec verrou isSwitchingAccount et attente de fin de bascule
- Isolation des données par compte (Room par compte ou purge + réhydratation) ; aujourd’hui clearAllTables à la déconnexion
- Intégration UI : « Changer de compte » et « Ajouter un compte » dans Réglages avec intentions de transfert vers la connexion
- Migration des anciennes clés (LegacyAuthKeyMigration) : à adapter en migration des préférences héritées Android si pertinent

Rendu : Sélecteur de comptes (voir auth-login-saved-accounts) et entrée Réglages ; transition de bascule avec indicateur de chargement plein écran.

Transposition Android : Keychain multi-clés -> Android Keystore + EncryptedSharedPreferences par compte ; AccountManager non requis

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager+Accounts.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/LegacyAuthKeyMigration.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SavedAccounts.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`

### Retrouver son compte par e-mail ou par téléphone quand on a oublié son mot de passe

`auth-password-reset-request` · Android : **partielle** · P1 · effort M

La feuille « Mot de passe oublié » propose deux modes. E-mail : l’adresse reçoit un lien pour choisir un nouveau mot de passe (« Jamais eu de mot de passe ? Ce même lien vous permet d’en créer un »), puis confirmation « E-mail envoyé · Ouvrez le lien reçu à … » avec aide « Rien reçu ? ». Téléphone : recherche du compte par numéro et pays, identité masquée « Compte trouvé », vérification par nom d’utilisateur et e-mail complets, code SMS à 6 chiffres, puis passage à l’écran du nouveau mot de passe avec le jeton obtenu.

Écarts :
- Mode téléphone entièrement absent côté UI et réseau : routes de recherche par numéro, vérification d’identité et vérification du code SMS (PhoneRecovery.kt n’existe que comme modèle pur)
- Sélecteur de mode E-mail/Téléphone (contrôle segmenté) et réutilisation du sélecteur de pays
- Écran d’après-code : jeton de réinitialisation puis navigation vers le nouveau mot de passe (voir auth-password-reset-new-password)
- Pré-remplissage de l’adresse depuis la connexion ; présentation en feuille avec bouton Fermer ; intégration aux toasts globaux
- Libellés d’erreur : « Aucun compte trouvé avec ce numéro », « Informations incorrectes », « Code invalide »

Rendu : Feuille avec barre de titre et Fermer ; segmenté en tête ; chaque étape sur AuthTextField (icône à gauche, bord indigo au focus) + AuthActionButton plein ; message d’erreur en rouge caption sous le champ ; confirmation d’envoi avec icône enveloppe et aide dépliable.

Transposition Android : Picker segmenté -> SingleChoiceSegmentedButtonRow ; sheet -> ModalBottomSheet

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/ForgotPasswordInput.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AccountRecoveryScreens.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AccountRecoveryViewModels.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/EmailRecovery.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/PhoneRecovery.kt`

### Quand l’adresse est déjà utilisée, proposer « Est-ce vous ? » plutôt qu’un simple refus

`auth-signup-email-taken-recovery` · Android : **partielle** · P1 · effort M

Si la passerelle répond que l’adresse est prise, l’inscription n’impasse pas : sous le champ, elle affiche le titulaire masqué (« Est-ce vous ? »), puis deux issues. « C’est moi — récupérer mon compte » envoie un code et un lien de connexion à l’adresse (attente de type lien magique) ; « Ce n’est pas moi » rejoue l’inscription en REVENDIQUANT l’adresse (le compte est créé sans session et n’entre que par le code envoyé à cette adresse) ; « Mot de passe oublié ? » est proposé à côté. Les gestes ne valent que pour l’adresse refusée : corrigée, ils disparaissent.

Écarts :
- Android n’offre qu’un lien « Se connecter » sous le message « Un compte utilise déjà cette adresse » : ni titulaire masqué, ni envoi de lien de connexion, ni revendication (claimEmail)
- Modèle APIRejection.EmailOwner (détenteur masqué) et repli quand la passerelle ne le sert pas
- Action « Recevoir un lien de connexion » (code + lien, avec attente de type lien magique) avec erreur dite sous le geste, jamais au bandeau
- Revendication d’adresse (« Ce n’est pas moi ») avec note « Le code envoyé à cette adresse sera demandé pour l’obtenir » et écran du code
- Lien « Mot de passe oublié ? » depuis l’inscription (feuille) ; mise en page horizontale ou verticale selon la largeur

Rendu : Bloc « Est-ce vous ? » en en-tête (heading) avec ligne titulaire masqué (nom partiel, @pseudo, e-mail partiel) ; actions de récupération en boutons texte indigo avec icône, « Ce n’est pas moi » en bouton secondaire ; messages d’erreur sous le geste.

Transposition Android : ViewThatFits horizontal/vertical -> FlowRow

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Auth/Signup/SignupView+Card.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupViewModel.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupSubmitError.kt`

### Saisir son numéro avec le bon pays, et savoir pourquoi il est refusé

`auth-signup-phone-country` · Android : **partielle** · P1 · effort S

Le champ téléphone combine un bouton pays (drapeau, indicatif, chevron, ouvre une feuille de recherche par pays ou indicatif) et la saisie du numéro ; la valeur est épurée au collage (un numéro international perd l’indicatif déjà porté par le pays). Le refus (manquant, trop court, suite identique, motif répété) ne se dit pas pendant la première frappe mais dès que le champ est quitté avec une saisie, qu’un envoi est tenté ou qu’un numéro donné est effacé. Le bénéfice du numéro est rappelé : « Il vous permettra de vous connecter, et à vos proches de vous retrouver. »

Écarts :
- Règles de plausibilité du numéro (PhonePlausibility : tooShort, identicalRun, repeatedPattern) et messages de refus associés ; Android ne vérifie que la longueur/chiffres
- Timing d’affichage du refus (champ quitté, envoi tenté, numéro effacé) via notePhoneFieldLeft/isPhoneChecked
- Libellé d’accessibilité du pays et indice « Changer de pays » ; champ avec annonce du refus en lecteur d’écran
- Texte d’avantage du numéro en indice d’accessibilité (« Il vous permettra… »)
- Numéro REQUIS par l’écran (directive #9343) alors que l’Android actuel le laisse facultatif

Rendu : Rangée verre liquide : bouton pays (drapeau + indicatif + chevron, hauteur ≥ 48) séparé par un trait fin puis champ téléphone ; liseré indigo500 0,6 au focus ; texte d’erreur rouge sous la rangée ; feuille de pays avec recherche et coche sur le pays choisi.

Transposition Android : searchable sheet -> ModalBottomSheet avec champ de recherche (CountryPickerSheet existe)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Auth/Signup/SignupView+Phone.swift`
- `apps/ios/Meeshy/Features/Auth/Signup/SignupCountrySheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/CountryPickerSheet.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/CountryCatalog.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupAvailability.kt`

### Après un plantage, l’app le dit au lancement suivant et propose le rapport

`auth-app-crash-diagnostics-bootstrap` · Android : **partielle** · P2 · effort S

Le démarrage installe la capture de crash/hangs et au lancement suivant un toast « Plantage précédent (+N) : résumé » s’affiche ; il ouvre une feuille listant les rapports. Chaque rapport est journalisé avec sa pile, et l’utilisateur courant est ajouté ou retiré des rapports à l’ouverture/fermeture de session.

Écarts :
- Toast de lancement « Plantage précédent » avec ouverture de la feuille des rapports (seul l’écran des Réglages existe)
- Étiquetage des rapports avec l’identifiant utilisateur à l’ouverture de session, retiré à la fermeture
- Capture des ANR/OOM/crashs natifs via ApplicationExitInfo (équivalent MetricKit)

Rendu : Toast d’information cliquable (type info) ; feuille modale liste des rapports avec type, horodatage, résumé et détails.

Transposition Android : MetricKit/CrashDiagnosticsManager -> UncaughtExceptionHandler + ApplicationExitInfo

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/AppDelegate.swift`
- `apps/ios/Meeshy/MeeshyApp.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashDiagnosticsRecorder.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashReportScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashReportViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/FileCrashDiagnosticsStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/diagnostics/CrashReportFormatter.kt`

### Changer son mot de passe depuis les réglages, même sans en avoir encore

`auth-change-password-form` · Android : **partielle** · P2 · effort S

Le formulaire demande le mot de passe actuel seulement si le compte en a un (hasPassword), puis le nouveau (8 caractères min) et sa confirmation ; il n’est soumettable que si longueur et correspondance sont bonnes. Un compte créé par lien magique (sans mot de passe) peut en définir un premier sans saisir de mot de passe actuel.

Écarts :
- Prise en charge de hasPassword (route has-password) : Android exige toujours le mot de passe actuel et bloque un compte sans mot de passe
- Valeur soumise du mot de passe actuel nulle quand le compte n’en a pas
- Règle iOS sans exigence « nouveau différent de l’ancien » : vérifier l’alignement des règles de soumission

Rendu : Trois champs (actuel conditionnel, nouveau, confirmation) avec indicateur de force et messages de correspondance.

Transposition Android : Form SwiftUI -> ChangePasswordScreen existant

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Auth/PasswordChangeForm.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ChangePasswordForm.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ChangePasswordScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ChangePasswordViewModel.kt`

### Mon profil change tout de suite à l’écran, puis se confirme ou se rétablit

`auth-current-user-profile-sync` · Android : **partielle** · P2 · effort S

Les modifications de profil (nom affiché, bio, avatar, visibilité de la voix) sont appliquées localement sur l’utilisateur courant, persistées en attente dans le trousseau, puis confirmées par la relecture serveur (qui ne réécrase pas un état optimiste plus récent) ou restaurées depuis un instantané en cas d’échec. Le décor de profil de MON compte se repeint dès qu’un événement socket arrive.

Écarts :
- Instantané ProfileSnapshot + restauration (restoreLocalProfileSnapshot) sur échec réseau ; Android applique mais ne rétablit pas explicitement
- Profil en attente persisté (pendingProfile) pour survivre à un redémarrage avant confirmation
- Règle resolveServerUserWithOptimistic : la relecture serveur ne remplace pas un changement local en cours
- Champ profileDecor (ServedProfileDecor) et événement socket ProfileDecorUpdatedEvent pour repeindre son propre décor
- Champs MeeshyUser manquants : activation (UserActivation), deactivatedAt, voicePublic/voiceSample*

Rendu : Aucun visuel propre ; retour optimiste immédiat sur avatar, nom et bio dans toutes les surfaces.

Transposition Android : Keychain pendingProfile -> DataStore chiffré

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager+ProfileDecor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`

### Les builds de développement choisissent le serveur (Production, Staging, Local, Personnalisé)

`auth-login-server-environment` · Android : **complète** · P2 · effort S

Un sélecteur de pastilles propose les environnements ; « Personnalisé » révèle un champ d’hôte avec validation, et une ligne « Connecté à : … » rappelle l’origine active. Il n’existe que dans les binaires de développement (simulateur iOS, builds debug Android) : jamais dans un binaire publié.

Rendu : Déjà reproduit : pastilles d’environnement, champ d’hôte avec coche d’application, ligne « Connecté à : … ».

Transposition Android : targetEnvironment(simulator) -> BuildConfig.DEBUG (config.enableLogging)

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LoginScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/ServerEnvironment.kt`

### Choisir sa langue de lecture et consulter les conditions avant de s’inscrire

`auth-signup-language-legal` · Android : **complète** · P2 · effort S

Sous la carte, une puce « Vous lirez Meeshy en [Langue] » (avec « Changer ») ouvre une feuille « Langue de lecture » (liste avec nom natif et drapeau, bouton Terminé) ; la langue par défaut vient de l’appareil et la langue régionale est déduite du pays. Une mention « En continuant, vous acceptez… » ouvre les Conditions d’utilisation et la Politique de confidentialité dans des feuilles.

Rendu : Déjà reproduit : puce de langue, feuille de choix, mention légale cliquable.

Transposition Android : sheet iOS -> LanguagePickerSheet ; documents légaux -> LegalDocumentScreen

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Auth/Signup/SignupView.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/SignupScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LanguagePickerSheet.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/LegalDocumentScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupRegionInference.kt`

