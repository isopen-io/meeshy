## 2026-10-05 : Le Jeu Meeshy — la loi dans le CŒUR, les briques dans l'UI, les routes écrites à la main

**Contexte** : le Jeu Meeshy (#9373, conception `docs/product/jeu-meeshy-conception.html`) a UNE loi, écrite en
TypeScript (`packages/shared/utils/game/*`), qui fixe niveaux, prix de frappe, Gloire, trésor, Flamme, missions,
coffre et guides. iOS doit la rejouer à l'identique, et poser des objets dessinés (pièce, écu, coupe, badge, anneau,
flamme, coffre) que l'app compose en célébrations.

**Décision** :
- **La loi vit dans `MeeshySDK/Game/`** (cœur, sans SwiftUI) : fonctions pures, entiers, aucune horloge ni aléa
  implicite — le jour est une clé `AAAA-MM-JJ` que l'appelant fournit. Elle est REJOUÉE par `GameLawVectorTests` sur
  `packages/shared/fixtures/reading-modes/game.vectors.json` (208 cas, 20 lois) : sur divergence, le TS a raison.
  Une loi ajoutée au fichier sans miroir Swift fait échouer le test (`GameLawVectorError.unknownLaw`), jamais un vert
  silencieux.
- **Le bloc `game` se lit à côté de la charge d'engagement, jamais à moitié** : `APIEngagementProgress.game` est décodé
  en `try?` — un bloc incompris ne coûte pas la progression, et l'écran n'affiche alors aucun élément du jeu.
- **Les écritures** (`GameService`, protocoles `GameServiceProviding` et suivants) portent un `requestId` par INTENTION.
  **Mise à jour 2026-10-07 (#9535) : les routes ne sont plus écrites à la main.** Le manifeste de la passerelle porte
  `/me/game/*` et `/users/:userId/game*` ; `MeEndpoint.game*` et `UsersEndpoint.byUserIdGame*` sont générés, et
  `GameService` les appelle. `GameEndpoint` et la table de chemins de `GameRoutes` sont retirés ; `GameRoutesTests`
  compare les adresses du catalogue à `GAME_ROUTES` et `GAME_INTEGRATION_ROUTES`. Ce que la jumelle disait et que le
  générateur ne dit pas vit à la main dans `Networking/Endpoints/GameEndpointPolicy.swift` : les refus 409 typés
  (`rejectionPolicy == .structured`) et les fabriques qui ENCODENT un identifiant venu d'une charge serveur avant de
  l'écrire dans le chemin.
- **Les briques vivent dans `MeeshyUI/Game/`** : elles DESSINENT (les chemins SVG de la planche sont lus par
  `GameSVGPath`, pas recopiés), reçoivent des paramètres opaques et ne touchent aucun singleton Meeshy. Décoratives et
  masquées par défaut ; l'hôte qui connaît la phrase localisée passe `accessibilityLabel`. Les chiffres dessinés
  suivent Dynamic Type, bornés à ×1,3.
- **Les shaders Metal sont des briques** (`Resources/Shaders/GameShaders.metal`, `ShaderLibrary.bundle(.module)`) : le
  reflet, l'onde et l'irisation, en modificateurs iOS 17+ avec repli en dégradé sous iOS 16. L'hôte fournit `progress`
  et `tilt` ; il décide QUAND, COMBIEN DE TEMPS et D'OÙ vient l'inclinaison. Hors de son temps un modificateur ne pose
  aucun effet ; sous Reduce Motion le reflet et l'onde ne jouent pas.

**Alternatives rejetées** :
- *Recopier les dessins en `addCurve`.* Une jumelle du SVG qui diverge à la première retouche de la planche.
- *Une classe `GameState` dans le SDK.* C'est de l'orchestration produit (quand célébrer, quoi montrer) : app-side.
- *Un `Date.now()` dans la loi.* Deux clients qui diffèrent d'une minute de fuseau tireraient des missions différentes.

**Conséquence** : le miroir Kotlin n'est PAS tenu (développement Android gelé, directive 2026-09-16) — la dette se
consigne, elle ne se solde pas.
