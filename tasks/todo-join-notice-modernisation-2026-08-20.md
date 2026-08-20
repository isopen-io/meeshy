# Avis d'arrivée modernisé (2026-08-20) — LIVRÉ

Demande : le message système « X a rejoint la conversation » (visiteur anonyme) doit être
traduisible dans la langue du lecteur, sans icône téléphone, avec le nom donné et le pseudo
anonyme chacun à sa place, et les règles du lien d'entrée visibles.

## Causes racines trouvées
- [x] **Icône téléphone + texte français** : `MeeshyMessage.joinNotice` avait sa CodingKey mais
      ni décodage ni encodage — perdu au round-trip du cache GRDB ; toute conversation ROUVERTE
      retombait sur la vue système générique (téléphone) avec le repli français, alors que
      `BubbleJoinNoticeView` (traduisible, sans téléphone) existait depuis le 18/08.
      Vérifié en PROD : le REST sert bien metadata + messageSource — le défaut était client.
- [x] **Visiteurs anonymes** : la surface lien (`routes/links/types.ts`) ne déclarait ni
      `metadata`, ni `messageSource`, ni `senderId` — la population même que l'avis concerne
      recevait le message sans son sens (fast-json-stringify strippe le non-déclaré).
- [x] **« @ » vide** : le fil sert `sender.username: ""` pour un anonyme → « @ » nu sous le nom.

## Livré (commits 2c7663b66 gateway/shared, 4c29d3c74 clients)
- [x] Shared : `JoinNoticeMetadata` + `username`, `givenName`, `linkRules` (validés par
      `parseJoinNotice`) ; jumeau Swift étendu (decode tolérant, encode complet)
- [x] Gateway : porte anonyme pose pseudo + nom donné + règles du lien (shareLink déjà en
      mémoire) ; surface lien sérialise metadata/messageSource/senderId (additionalProperties,
      aucun default)
- [x] SDK : fix round-trip `joinNotice` (pattern callSummary) + test round-trip verrouillé
- [x] App : `JoinNoticePresentation` (nom donné en principal, @pseudo jamais redondant),
      `BubbleJoinNoticeView` 2 lignes (badge « sans compte », rangée de règles teinte/éteint,
      VoiceOver en toutes lettres), 6 clés × 7 langues, `SenderIdentity.handle` tait le @ vide
- [x] Web : parité nom donné + @handle dans `JoinNoticeMessage`
- [x] Gates : shared 2315 vitest, gateway 231+13+26 jest + tsc, SDK 11 XCTest,
      app 102 XCTest (gardes localisation comprises), web 8 RTL
