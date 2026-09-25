## Leçon 417 — Une exemption qui couvre N cas d'un seul argument doit être vérifiée sur les N

`ComposerSurfaceRouting.surface` exemptait quatre ouvertures du routage vers le
meuble, sous un argument unique : « elles n'ouvrent pas sur un choix, elles
ARRIVENT avec du contenu, et l'atelier est le seul écran qui le tienne déjà ».

Vrai de `.resume`, `.mediaSeeded`, `.videoCameraReady`. **Faux de `.cameraReady`,
qui n'arrive avec RIEN** : elle promet un viseur, que le meuble sait ouvrir
depuis toujours. Elle était entrée dans la liste par RESSEMBLANCE — et c'était
la porte la plus visible du Feed (« Créer une story »), donc celle par qui
l'ancien composer restait vivant.

Deux corollaires de forme, tirés du même lot :

- **La promesse suit la porte.** Router `.cameraReady` sans armer le viseur
  aurait tenu la lettre de la directive en perdant ce que la porte ANNONCE.
  D'où `armsCameraOnAppear`, jumelle exacte de `focusesContentOnAppear`, écrite
  à côté d'elle — jamais un `if` dans un corps de vue. Les deux ne sont jamais
  vraies ensemble : un viseur et un clavier se disputeraient l'écran.
- **L'idempotence est un état de l'HÔTE, pas de la règle.** La règle est pure et
  rend la même réponse à chaque appel, ce qui est correct pour elle et faux
  comme garde : un `.task` rejoué poserait un second viseur que rien ne referme.
