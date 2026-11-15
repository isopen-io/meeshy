## 2026-11-14 — Une tournure neuve du Jeu se cherche d'abord dans les listes « périmées » des gardes (#17394)

### Ce qui s'est passé

Pour que la frappe gratuite ne dise plus « sans te faire perdre un niveau », la boucle du Jeu a écrit « sans toucher à
ton niveau » dans les sept langues, sur le web, le catalogue iOS, le `defaultValue` Swift et Android. Les gardes web
étaient vertes. Mais `ProgressionConceptGuardTests` (iOS) tient une liste de phrases PÉRIMÉES, et « sans toucher à ton
niveau » y figure : c'était l'ancienne promesse, fausse depuis #10892, que la frappe épargne le niveau. La CI iOS ne
tournant pas pendant le gel `CI_DEV_SEUL`, rien ne l'aurait dit avant la levée du gel.

### La règle

- Avant d'adopter une tournure neuve dans un catalogue du Jeu, chercher la chaîne exacte dans les témoins des trois
  plateformes : `grep -rn "<tournure>" apps/ios/MeeshyTests packages/MeeshySDK/Tests apps/web/src apps/android/*/src/test`.
  Une liste `stale`, `banned` ou « ancienne loi » qui la contient dit qu'elle a déjà servi à dire autre chose.
- Quand une garde native ne peut pas tourner ici, la rejouer à la main sur le catalogue (quelques lignes de Python ou
  de Node sur `Localizable.xcstrings`), et le dire dans la PR comme une preuve locale.
