## Leçon 315 — un instantané ENTIER envoyé depuis une TRANCHE perd tout ce que la tranche ne déclare pas, et le verbe décide si la perte est silencieuse (2026-08-28, cycle 136)

Trois écritures de préférences du web envoyaient, pour corps, l'état complet
d'une tranche de store (`get().privacy`, `get().notifications`) — sur un `PUT`
que la passerelle traite en REMPLACEMENT, Zod comblant les clés absentes par
leurs `default()`.

Or **une tranche de store est presque toujours un sous-ensemble STRICT du
document qu'elle représente**, et personne ne l'écrit nulle part :
`StorePrivacyPreferences` est un `Pick` de 8 champs sur 17,
`StoreNotificationPreferences` de 14 sur 33. Le cas le plus cher n'était même
pas un oubli : la tranche `privacy` ne peut **structurellement pas** porter le
bloc chiffrement du même document — `syncPrivacy` l'en retire, une autre tranche
en est le porteur. Basculer n'importe quel réglage de confidentialité remettait
donc les quatre réglages de chiffrement aux défauts, et les conversations neuves
cessaient d'être chiffrées automatiquement sans qu'un seul écran le dise.

> **La question à poser à toute écriture qui envoie « l'état courant » n'est pas
> « cet état est-il à jour ? » mais « cet état est-il COMPLET pour le document
> qu'il va remplacer ? »** — et la réponse est non dès qu'une projection
> (`Pick`, un `...rest` de destructuration, un sélecteur) s'est interposée entre
> le document et la variable qu'on répand. La projection est visible à la
> DÉCLARATION du type, à cent lignes du site d'écriture ; le site d'écriture, lui,
> se lit comme un envoi honnête de tout ce qu'on a.

Trois corollaires, tous mesurés dans ce lot :

- **Le verbe n'est pas un détail de transport, c'est le choix de qui décide des
  champs absents.** `PUT` dit « voici le document » et laisse les défauts du
  schéma trancher ; `PATCH` dit « voici ce qui change » et laisse le serveur
  tenir le reste. Une écriture partielle envoyée en `PUT` n'est pas « un peu
  trop large » : elle est destructrice, et de façon d'autant plus discrète que
  les défauts du schéma sont plausibles (`false`, `'optional'`).
- **Une gravité conditionnelle et une gravité inconditionnelle vivent dans le
  même code.** Sur `notifications`, la tranche est complétée à l'exécution par
  le répandu de la réponse serveur : la perte n'a lieu qu'après une hydratation
  ÉCHOUÉE. Sur `privacy`, aucune exécution ne peut la compléter. Le même défaut,
  écrit deux fois, avec deux fenêtres — ne pas conclure d'un site que la classe
  est bénigne.
- **Envoyer le SOUMIS ne corrige pas seulement l'instance, il ferme la classe.**
  Tant que le corps est un instantané complet, tout champ ajouté au schéma
  partagé et non ajouté au `Pick` du store devient une perte de données
  silencieuse au prochain réglage touché — une régression que rien ne signale,
  posée par un lot qui parlait d'autre chose.

**Et la jumelle avait raison, en nommant l'exemplaire fautif.**
`PrivacyPreferenceSyncBody` (Android) PATCHe et documente exactement ce risque :
« a body that omits the encryption keys leaves the server's encryption
preferences untouched instead of silently stamping the device defaults over a
value the user may have set on **web/iOS** ». iOS PATCHe aussi. Le web était le
seul des trois clients sur le verbe destructeur — et le seul que la
documentation d'Android désignait comme l'endroit où l'utilisateur pose la
valeur détruite. C'est la leçon 307 sous sa forme la plus nette : **une règle
écrite, motivée, et écrite par quelqu'un qui a nommé votre surface, ne vous est
toujours pas appliquée.** Devant une règle bien documentée sur un client,
demander non pas « est-elle juste ? » mais **« les deux autres la citent-ils ? »**.

Corollaire de témoin, et c'est ce qui a laissé le défaut vivre : les témoins
d'écriture préexistants mesuraient l'état optimiste et le rejet — jamais la
MÉTHODE, jamais le CORPS. Aucune augmentation de couverture qui ne pose pas ces
deux questions-là ne pouvait l'attraper. Prolonge « un témoin d'écriture assert
sur l'EFFET, jamais sur le statut » : sur une écriture distante, **le corps
envoyé EST une partie de l'effet.**
