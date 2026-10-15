## 2026-10-11 : La loi du carnet vit dans le SDK et se rejoue sur les vecteurs partagés (#10155)

**Contexte** : la loi du rattrapage et de la proposition (`photoStepsReached`, `photoCatchUp`, `photoTrackOf`,
`photoOfferFor`, `packages/shared/utils/game/photo-catch-up.ts`) avait son miroir Swift dans l'APP
(`apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCatchUp.swift`), testé par ses propres exemples, et la
dérivation de la situation depuis le bloc `game` vivait deux fois : `catchUpStandingOf` dans `apps/web` et
`PhotoCatchUpStanding.init(game:)` dans l'app. Aucun vecteur ne rejouait l'une contre l'autre ; les lots qui
s'appuient sur cette loi (cadres proposés L4, alertes L17, job serveur L19) en auraient fait trois copies.

**Décision** :
- `GamePhotoCatchUpLaw` (`Sources/MeeshySDK/Game/GamePhotoCatchUpLaw.swift`) porte la loi : moteur de règles
  sans état, il rend des identités et des emblèmes (`PhotoStepEmblem`), jamais de texte localisé. Sa place est le
  SDK, comme les autres lois du jeu (SDK Purity : paramètres opaques, aucune décision de produit).
  `PhotoTrack` et `PhotoCatchUpStanding` (avec `init(game:)`) y vivent aussi.
- L'app garde `GamePhotoCatchUp` comme ENVELOPPE, signature inchangée pour ses appelants : elle fait de chaque
  emblème un `PhotoMoment` par les constructeurs de `GamePhotoMoments` (les deux lignes localisées).
- `catchUpStandingOf` vit dans `packages/shared/utils/game/photo-catch-up.ts`, sur la projection
  `PhotoStandingSource` (les cinq blocs `glory`, `level`, `mint`, `treasury`, `flame`) : le web le réexporte,
  le job serveur le lira tel quel.
- Trois lois de vecteurs — `photo-catch-up`, `photo-offer`, `photo-standing` — produites par
  `packages/shared/__tests__/game/game-vectors-law-photo.ts` et rejouées par
  `Tests/MeeshySDKTests/Game/GameLawVectorEvaluatorPhoto.swift`. `photo-standing` pose les cinq blocs sur un
  bloc complet du même producteur (`GameBlockFixture`) et passe par le décodeur RÉEL de `GameBlock`.
- `sdk-tests.yml` se déclenche aussi sur `packages/shared/fixtures/reading-modes/game.vectors.json` : une PR qui
  ne touche que les vecteurs fait tourner le rejeu Swift.

**Règle** : un lot qui ajoute ou change une loi du jeu livre, dans la MÊME PR, la loi TS, ses vecteurs régénérés,
le miroir Swift et son évaluateur. `GameLawVectorTests` exige l'ensemble EXACT des lois : une loi TS sans
évaluateur rougit le rejeu du lot suivant, pas le sien.

**Alternatives rejetées** :
- *Garder le miroir dans l'app et lui écrire des tests d'exemples de plus.* Rien ne garantit que deux listes
  d'exemples écrites de chaque côté disent la même loi ; les vecteurs le garantissent par construction.
- *Faire porter le texte des moments par le SDK.* Les deux lignes sont localisées par le catalogue de l'app
  (`bundle: .main`) : le SDK rend l'emblème, l'app compose la phrase.
- *Mettre un bloc `game` COMPLET dans le vecteur `photo-standing`.* Toute évolution du bloc (une mission, une
  extension) régénérerait ces vecteurs sans rapport avec la loi ; les cinq blocs lus suffisent.

**Conséquence** : la loi d'alerte (L17) et la loi des cadres (L4) s'écrivent sur `GamePhotoCatchUpLaw` dans le
SDK, avec leurs vecteurs, sans repasser par l'app.
