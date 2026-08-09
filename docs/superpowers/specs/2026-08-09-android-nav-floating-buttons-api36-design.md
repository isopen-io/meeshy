# Navigation Android : deux boutons flottants, compatibilité Oreo → Android 17, expiration de session

Date : 2026-08-09
Statut : design validé, en attente de plan d'implémentation

## Problème

### 1. Le routage ne se pilote pas pareil sur les deux plateformes

L'utilisateur « ne s'y retrouve pas » entre iOS et Android, et l'écart est structurel.

- **iOS** porte **deux** boutons flottants librement déplaçables
  (`FreeFloatingButtonsContainer`, `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift`),
  câblés dans `RootView.swift:1742` : gauche = Flux, droite = avatar + menu.
- **Android** porte **un** bouton unique, fixe en bas à droite
  (`apps/android/sdk-ui/.../chrome/MeeshyMenuFab.kt`, 168 lignes), qui déplie 8 entrées. Son
  commentaire annonce pourtant « iOS parity (Option A) » : la barre d'onglets a bien été retirée,
  mais la parité s'est arrêtée à un bouton, ancré.

Ce n'est pas cosmétique : c'est la carte mentale du routage qui diffère.

### 2. La configuration SDK va bloquer les publications dans trois semaines

Le projet est en `targetSdk 35`. Or, **à partir du 31 août 2026**, Google Play exige `targetSdk 36`
minimum pour **toute nouvelle app et toute mise à jour** — extension possible jusqu'au
1ᵉʳ novembre 2026. En l'état, aucune mise à jour ne pourra être publiée après cette date.

### 3. Une session expirée est présentée comme une panne réseau

Constaté en lançant l'app sur émulateur : une session expirée produit `401`/`403` sur
`/api/v1/conversations`, `/api/v1/posts/feed/stories` et `/api/v1/friend-requests`, mais l'écran
affiche « Couldn't load conversations — Check your connection and try again ». Le message accuse le
réseau alors que le réseau fonctionne, et l'utilisateur n'a aucun moyen de comprendre qu'il doit se
reconnecter.

## Décisions

| Sujet | Décision |
|---|---|
| Parité FAB | Complète : deux boutons déplaçables, position persistée |
| `minSdk` | **26 (Android 8.0 Oreo)** — inchangé, c'est le plancher à préserver |
| `compileSdk` | **37 (Android 17)** — compiler contre le dernier SDK |
| `targetSdk` | **36 (Android 16)** — conformité Play sans les ruptures d'Android 17 |
| AGP / Gradle | **AGP 8.13** (dernière 8.x), pas le saut majeur AGP 9 |
| Compatibilité | Dossier `compatibility/`, calqué sur le pattern iOS `Adaptive*` |
| Appui long gauche | Ouvre le **Feed Réels** — sur iOS **et** Android |
| Session expirée | Rediriger vers l'écran de connexion sur 401 |
| Découpage | 2 PR : Android groupé, iOS à part |

### Pourquoi `compileSdk 37` mais `targetSdk 36`

Les deux réglages répondent à deux questions différentes. `compileSdk` ouvre l'accès aux API
récentes sans rien changer au comportement ; `targetSdk` active les changements de comportement du
système. Compiler en 37 donne accès à tout ce qu'Android 17 apporte — exploitable via la couche de
compatibilité — tandis que cibler 36 satisfait l'échéance Play sans encaisser les ruptures
d'Android 17, dont trois toucheraient Meeshy de plein fouet :

- **audio en arrière-plan durci** : service de premier plan avec capacité *while-in-use* obligatoire
  (messages vocaux, TTS, appels) ;
- **orientation et redimensionnement ignorés** sur écrans ≥ 600 dp, **sans opt-out** (il existait
  encore en Android 16) ;
- **`ACCESS_LOCAL_NETWORK`** devenue obligatoire pour la découverte réseau local.

Le passage ultérieur à `targetSdk 37` devient alors un changement de chiffre plus le traitement de
ces trois points, la couche de compat étant déjà en place.

### Pourquoi AGP 8.13 et non AGP 9.3

`compileSdk 36` **et** `compileSdk 37` exigent l'un comme l'autre AGP ≥ 8.9 : le coût est identique,
choisir 36 n'économiserait rien. AGP 8.13 est la dernière 8.x et suffit pour compiler en 37.

AGP 9.3.0 est la dernière stable (juillet 2026) mais impose **Gradle 9.5** — un saut de version
majeure depuis les AGP 8.7.3 / Gradle 8.11.1 du projet. Ce saut est un chantier en soi, avec ses
propres ruptures ; le mêler à une refonte de navigation rendrait toute régression indémêlable. Il
est explicitement remis à plus tard.

## Stratégie de compatibilité Oreo → Android 17

Le principe demandé : **le plancher Oreo reste garanti, mais chaque version intermédiaire est
exploitée quand elle est présente** — pas de nivellement par le plus petit dénominateur commun.

Nouveau package `compatibility/` dans `sdk-ui`, calqué sur
`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/` (12 helpers `Adaptive*`, chacun encapsulant son
`#available` et exposant une API unique aux appelants). Transposition Android : chaque helper
encapsule son `Build.VERSION.SDK_INT >= Build.VERSION_CODES.*` et expose **une seule** fonction, de
sorte qu'aucun appelant ne porte de test de version.

Règle reprise de la convention iOS : **ne créer un helper que si l'ancienne et la nouvelle API ne
sont pas toutes deux disponibles au plancher**. Si l'API récente existe déjà en API 26, l'appeler
directement — pas de shim décoratif.

Capacités à router par ce dossier (liste à compléter par un audit à l'implémentation, chaque entrée
devant être vérifiée avant d'être codée) :

| Depuis | Capacité | Repli sous le seuil |
|---|---|---|
| API 31 | Couleurs dynamiques Material You, API `SplashScreen` | Palette Meeshy statique |
| API 33 | Permission runtime `POST_NOTIFICATIONS`, langue par app | Pas de demande, langue applicative |
| API 34 | Predictive back, types de services de premier plan | Back classique |
| API 35/36 | Edge-to-edge et insets | Gestion manuelle des insets |
| API 37 | Nouveautés Android 17 accessibles via `compileSdk 37` | Comportement 36 |

Chaque helper est testé aux deux bornes : au-dessus du seuil et en dessous.

## Périmètre

### PR 1 — Android : `feat/android-nav-api36`

#### 1.1 Montée de la configuration SDK

| Élément | Avant | Après |
|---|---|---|
| `compileSdk` | 35 | 37 |
| `targetSdk` | 35 | 36 |
| `minSdk` | 26 | 26 (inchangé) |
| AGP | 8.7.3 | 8.13 |
| Gradle wrapper | 8.11.1 | minimum exigé par AGP 8.13, à lire dans ses release notes avant d'écrire le wrapper (non figé ici : la valeur n'a pas été vérifiée) |
| SDK local | `platforms;android-35` | + `platforms;android-36`, `android-37.0`, `build-tools;37.x` |
| AVD | API 35 | AVD API 36 **conservé en plus** d'un AVD API 35 |
| JDK | 17 | 17 (inchangé) |

Deux AVD sont maintenus délibérément : la promesse « Oreo → 17 » ne se vérifie pas sur une seule
version. Les tests manuels passent au minimum sur API 35 et API 36.

`targetSdk 36` rend l'**edge-to-edge obligatoire**. C'est traité dans cette PR parce que le
placement des boutons flottants dépend directement des insets : séparer les deux ferait replacer les
boutons deux fois.

#### 1.2 Deux boutons flottants

Nouveau composable `MeeshyFloatingButtons` dans `sdk-ui/component/chrome/`. `MeeshyMenuFab` **n'est
pas supprimé** : il devient le contenu déployé du bouton droit, avec ses 8 entrées et leur sémantique
`popUpTo`/`saveState`/`restoreState` déjà en place.

Conformément à la règle de pureté SDK du projet, le composable est agnostique : il reçoit positions,
lambdas et contenu. Le mapping « quel bouton → quelle route » reste app-side, dans `MeeshyApp.kt`.

| | Bouton gauche | Bouton droit |
|---|---|---|
| Visuel | Icône Flux | Avatar utilisateur + badge notifications non lues |
| Tap | → `Routes.FEED` | Déplie le menu |
| 2ᵉ tap | — | Ouvre le profil, referme le menu |
| Appui long | → `Routes.reels()` | Raccourci direct profil |

Le bouton gauche **navigue via le `NavHost`** (avec `saveState`/`restoreState` comme les autres
destinations de premier niveau) plutôt que d'imiter l'overlay iOS : c'est l'idiome de navigation
Android déjà en place, et l'overlay est une spécificité SwiftUI.

Le FAB passe de l'icône « + » à l'avatar de l'utilisateur ; « Nouvelle conversation » reste la
première entrée du menu. L'entrée **« Feed » est retirée** du menu (un tap y mène), l'entrée
**« Réels » est conservée** (un appui long n'est pas découvrable et ne doit pas être le seul chemin).

Les boutons ne s'affichent que sur les destinations de premier niveau (`tabRoutes`), comme
aujourd'hui — pas dans une conversation ouverte, un appel ou le composeur de story.

#### 1.3 Déplacement et persistance

Position stockée **normalisée** (0–1) comme iOS (`ButtonPosition`), ce qui la rend indépendante de la
taille d'écran et de la rotation. Drag via `detectDragGestures`, aimantation au bord le plus proche
au relâchement, position persistée en `DataStore` sous deux clés distinctes (gauche, droite).

La logique de position vit dans une **unité pure** (normalisation, aimantation, bornage aux insets),
testable sans UI ; le composable ne fait que l'appeler et dessiner.

#### 1.4 Session expirée

Sur `401` — et sur le `403` d'authentification — l'app renvoie vers l'écran de connexion au lieu
d'afficher une erreur réseau. Le point d'application est l'intercepteur OkHttp / la couche
`AuthRepository`, **pas** chaque écran : les trois routes constatées échouent indépendamment, et un
traitement par écran laisserait le prochain appelant reproduire le défaut.

L'écran d'erreur conserve son message réseau pour les vraies pannes réseau : les deux cas doivent
rester distinguables.

### PR 2 — iOS : appui long gauche → Réels

Modifier `onLeftLongPress` dans `RootView.swift` pour ouvrir le Feed Réels au lieu de répéter
l'action du tap, et corriger les commentaires qui documentent le comportement retiré.

Ce geste **existait et avait été supprimé délibérément** : `RootView.swift:1742` indique
« Long-press : même action que le tap. Les Reels se lancent depuis le bouton dédié du header
"Meeshy Feed" ». La spec le rétablit sur décision produit. Le bouton Réels du header iOS **reste en
place** — un geste caché ne doit pas devenir le seul accès.

À vérifier à l'implémentation : si le défaut « 401 présenté comme panne réseau » existe aussi sur
iOS, le signaler sans le traiter ici.

## Tests

TDD, conformément au projet : test en échec d'abord, code minimal ensuite.

| Unité | Ce qui est vérifié |
|---|---|
| Position (unité pure) | Normalisation, aimantation au bord, bornage aux insets, restauration |
| Persistance | Position écrite puis relue à froid ; valeur par défaut si absente |
| Routage | Tap gauche → Feed ; appui long gauche → Réels ; tap droit → menu ; 2ᵉ tap → profil ; appui long droit → profil |
| Menu | « Feed » absent des entrées ; « Réels » présent |
| Visibilité | Boutons présents sur les destinations de premier niveau, absents ailleurs |
| Compatibilité | Chaque helper testé au-dessus **et** en dessous de son seuil d'API |
| Session | 401 → redirection login ; panne réseau réelle → message réseau |

Android : `./apps/android/meeshy.sh test`, plus une vérification manuelle sur AVD 35 **et** 36.
iOS : `./apps/ios/meeshy.sh test`.

## Hors périmètre

- **AGP 9.x / Gradle 9.5** : chantier distinct, à planifier séparément.
- **`targetSdk 37`** : nécessite de traiter l'audio en arrière-plan, l'orientation sur grands écrans
  et `ACCESS_LOCAL_NETWORK`. À reprendre une fois la couche de compat en place.
- Remonter Kotlin ou Compose BOM au-delà de ce qu'AGP 8.13 exige.
- Toucher aux 8 entrées du menu autrement qu'en retirant « Feed ».
- Corriger le défaut 401 côté iOS (à signaler, pas à traiter).

## Risques

- **Edge-to-edge** : `targetSdk 36` l'impose et peut décaler des écrans qui comptaient sur des insets
  gérés par le système. Le lot doit être relu écran par écran, pas seulement sur les boutons.
- **Aimantation contre gestes système** : un bouton collé au bord bas peut entrer en conflit avec la
  navigation gestuelle ; le bornage doit tenir compte de la barre de gestes.
- **Avatar absent** : le bouton droit porte l'avatar ; il faut un repli explicite (initiales ou
  icône) sans quoi le bouton principal de navigation apparaît vide.
- **Échéance Play du 31 août 2026** : si le lot ne peut pas être livré à temps, `targetSdk 36` peut
  être extrait en PR minimale et livré seul — c'est la partie contrainte par une date externe.

## Sources

- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Set up the Android 17 SDK](https://developer.android.com/about/versions/17/setup-sdk)
- [Set up the Android 16 SDK](https://developer.android.com/about/versions/16/setup-sdk)
- [Behavior changes: apps targeting Android 17](https://developer.android.com/about/versions/17/behavior-changes-17)
- [Android Gradle plugin release notes](https://developer.android.com/build/releases/gradle-plugin)
