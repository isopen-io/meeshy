## 2026-10-05 : le jeu côté app — la loi vient du SDK, les chorégraphies sont des FONCTIONS du temps, la photo ne quitte jamais l'appareil
**Statut**: Retenu (2026-10-05 — #9383, #9381, #9379, #9382).

**Contexte**: la loi du jeu (`packages/shared/utils/game`) et son miroir Swift (`MeeshySDK/Game`, rejoué sur `game.vectors.json`) sont livrés, avec les briques de dessin et les shaders (`MeeshyUI/Game`). Restait à les brancher dans l'app : l'écran Progression, le guide de Mee et Meo, les chorégraphies, les moments photo. Le web a livré les mêmes écrans (`apps/web/src/routes/progression-game*.tsx`) : l'app en est le miroir, mot pour mot.

**Décision**:
1. **Le bloc `game` voyage dans la charge `GET /me/engagement` et dans son cache.** `ProgressionViewModel` garde la charge servie (`snapshot`), dont `progress` et `game` sont dérivés. Les gestes (frappe, changement de mission, coffre, gel, rallumage) capturent l'instantané, appliquent la mise à jour optimiste (`GameOptimistic`, recalculée par la MÊME loi que la passerelle), envoient, et RESTAURENT l'instantané sur échec. L'identifiant d'idempotence est généré une fois par intention et ne se renouvelle qu'après un succès. Un refus d'état (409) fait relire l'écran.
2. **Une chorégraphie est une fonction pure du temps** (`GameTimeline`), lue à chaque image par `ChoreographyClock` (`TimelineView`, mise en pause au repos). Les durées de la planche (frappe 1,2 s, rang 1,6 s, niveau 0,6 s, niveau perdu 0,8 s, badge 0,7 s, coffre 1,4 s) sont des constantes testées, et le haptique (`GameHapticPattern`) tombe sur les MÊMES instants : aucun minuteur, aucun lien d'affichage laissé vivant hors écran. Les shaders du SDK s'y posent (iOS 17+) avec leur repli iOS 16 ; sous « réduire les animations » tout devient un fondu. `CADisableMinimumFrameDurationOnPhone` autorise les 120 images par seconde.
3. **Le guide est une session par ouverture d'écran** (`GameGuideSession`) : l'intégration d'abord, sinon UN moment choisi par la loi (`GameGuide.chooseMoment`) ; une carte est « vue » dès qu'elle s'affiche, sa clé part au serveur ET entre dans le cache. Un geste en vol suspend toute célébration : un geste refusé ne laisse ni carte, ni clé vue.
4. **La photo reste sur l'appareil.** Caméra avant par `AVCaptureSession` + `AVCapturePhotoOutput` (qui, contrairement à `CameraModel`, n'enregistre RIEN dans Photos à la prise), image finale par `ImageRenderer` en 9:16 et 1:1, carnet en Application Support par compte (`GamePhotoNotebook`, sept jours d'attente), enregistrement par `PhotoLibraryManager` (ajout seul), repli galerie par `PhotosPicker` (hors processus, sans permission). Une garde de source interdit tout chemin vers le réseau dans `Game/Photo`.

**Alternatives rejetées**:
- Animer par `withAnimation` implicite : la durée exacte, le haptique calé sur l'impact et la preuve sans écran deviennent impossibles.
- Réutiliser `CameraModel` pour le selfie : il écrit la photo brute dans la photothèque à chaque prise.
- Un seul ViewModel de jeu séparé de la progression : les mises à jour optimistes touchent la charge servie, qu'il faudrait alors dédoubler.

**Conséquences**:
- La ligne « badges qui redescendent » de l'aperçu et le moment « un badge s'est éteint » lisent `GameMintBadgeImpact`, un port Swift du plan de débit (`computeMeeshMintPlan`) qui rend `nil` — jamais zéro — quand le serveur ne sert pas les points par axe.
- Reste à faire, consigné dans les issues : `BadgeStage` (0,7 s) attend un hôte qui montre les badges avec `GameBadgeView` ; le plan de débit n'a pas encore de vecteurs partagés rejoués par les deux plateformes.
- Le miroir Kotlin est gelé (directive 2026-09-16) et ne reçoit rien de ce lot.
- Preuve : run `ci/jeu-ios-10` (37292059807), suite complète — aucun témoin du jeu en échec ; deux cliquets de charte (`Color(hex:)`, `cornerRadius`) restent rouges à cause des littéraux du SDK (`GameMaterial`, `LevelRingView`), hors de ce lot.
