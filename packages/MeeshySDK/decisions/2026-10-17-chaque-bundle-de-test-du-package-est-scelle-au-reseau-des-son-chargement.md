## 2026-10-17 : Chaque bundle de test du package est scellé au réseau dès son chargement (#10854)

**Contexte**

L'app scelle son hôte de test (`TestHarnessNetworkSeal`, b75466f822). Les bundles
`MeeshySDKTests` et `MeeshyUITests` tournent dans un autre hôte (xctest) et ne
l'étaient pas : mesuré le 2026-10-17 par un `URLProtocol` compteur, une suite
complète émettait 195 requêtes, dont 121 sondages `GET gate.meeshy.me/socket.io`
(sockets armées par `AccountDeletedSignalTests`, `GuestSessionEndTests` et leurs
boucles de reconnexion), des `GET /directory/blocks`, `/me/consents`,
`/me/preferences`, `/notifications/unread-count`, six
`POST /notifications/…/read` vers la production, et des médias de fixture.

**Décision**

- Le MÉCANISME vit dans le SDK : `NetworkTransportSeal.install(onRefusal:)`
  (`URLProtocol` refusant sur `URLSession.shared`, échange des constructeurs
  `.default` / `.ephemeral`, `SocketConfig.sealTransport()`). Il ne sait pas
  s'il tourne sous test ; l'app et la cible de support prennent la DÉCISION.
- La cible `MeeshyTestSupport` (dépendance des seules cibles de test, aucun
  produit) l'installe au chargement du bundle par un constructeur C
  (`MeeshyTestSupportLoader`, `__attribute__((constructor))`) — SPM ne donne ni
  Info.plist ni `NSPrincipalClass`, et une classe de base ou un `setUp` ne
  couvre que les classes qui s'en souviennent.
- Levée nommée : `TEST_RUNNER_MEESHY_TEST_LIVE_NETWORK=1`, comme l'app.
- Un test qui a besoin d'un OBJET socket l'arme contre le loopback
  (`SocketConfig.$loopbackOrigin`, ignoré pour toute autre origine) : le
  sondage passe par une session `.default`, que le sceau refuse.
- Toute nouvelle `.testTarget` dépend de `MeeshyTestSupport` — garde
  `TestBundleNetworkSealTests.test_everyTestTargetOfThePackage_dependsOnTheSeal`.
