## 2026-11-24 — Une route ou un code de refus ajoutés au contrat du Jeu sont un lot quatre plateformes, même « serveur seul » (#20507)

### Ce qui s'est passé

La tranche serveur de la Flamme en veille (#17372) devait poser la loi, la route
`POST /me/game/flame/pause` et son refus `FLAME_PAUSE_NOT_ALLOWED`, et laisser le geste
aux trois clients. Le premier passage des suites partagées a rendu quatre rouges qui ne
nommaient aucun fichier serveur : deux comptes de `GAME_ROUTES` (21), et deux catalogues
natifs générés depuis le manifeste des routes.

### Pourquoi

`packages/shared/types/game-routes.ts` est LU, au texte, par des témoins hors TypeScript :
`GameRoutesTests.swift` (le catalogue iOS sert chaque clé, et `GameErrorCode` Swift a
exactement les valeurs de `GAME_ERROR_CODES`), `GameRoutesParityTest.kt` (chaque route
est déclarée par une interface Retrofit avec son verbe) et `GameErrorCodeTest.kt` (les
mêmes valeurs, et leur nombre). Le refus doit aussi avoir sa phrase : `GameCopyTests`
exige une phrase distincte par code, `GameErrorTexts.kt` et `game-copy.ts` en tiennent la
table, donc une clé dans `Localizable.xcstrings` (sept langues), le manifeste Android et
les sept catalogues web.

### La règle

- Avant d'ajouter une clé à `GAME_ROUTES` ou `GAME_ERROR_CODES`, compter ses miroirs :
  `grep -rn "game-routes.ts" apps packages --include=*.swift --include=*.kt`.
- Le lot qui ajoute la clé ajoute ses miroirs de CONTRAT (catalogue d'adresses,
  méthode Retrofit, code et phrase du refus) sur les trois clients. Le geste lui-même
  (écran, bouton) reste la tranche de chaque client.
- `routeCount` du manifeste se relève avec l'entrée ajoutée : le cliquet
  `route-manifest-ratchet` le compare au serveur assemblé et tourne en jest, même sans
  client Prisma généré.
