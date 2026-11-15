## Leçon 89 — Une capacité client complète, testée et jamais alimentée est un défaut serveur, pas une feature en attente (2026-08-10, routine messaging, cycle 60)

Le SDK iOS portait `resolvedLastMessagePreview` — la résolution du Prisme pour la ligne de liste —
avec douze témoins, une facette dédiée pour l'écrire atomiquement, et une doc en trois paragraphes.
Le champ qu'elle lit valait `nil` pour tout le monde depuis toujours : `GET /conversations` ne
sélectionnait ni `Message.translations` ni `Message.originalLanguage`.

Rien ne signalait le trou. Les douze témoins passaient — ils construisent leur propre fixture. La
suite gateway passait — elle ne teste que ce que la route renvoie, pas ce qu'elle DEVRAIT renvoyer.
Le seul indice était dans la doc du champ SDK : « when the gateway starts shipping these in
`/conversations` it will be wired through the API → domain converter ». Une phrase au futur, écrite
par quelqu'un qui savait, restée vraie pendant des mois.

Et elle renvoyait à un contournement (`ConversationListViewModel.attachLastMessageTranslations`)
dont le nom n'apparaît **nulle part ailleurs dans le dépôt** : la doc décrivait un repli qui
n'existait pas, ce qui rendait le trou encore plus invisible — on lisait « c'est couvert
autrement ».

**Règle** : une capacité client entièrement écrite et testée n'est PAS la preuve que la donnée
arrive. Le geste qui tranche, et il est mécanique : prendre le champ que le client lit et chercher
son PRODUCTEUR sur tout le dépôt. Zéro producteur = défaut serveur en production, pas travail
restant. C'est le miroir de la leçon 87 (là, la colonne était écrite et jamais lue ; ici, elle est
lue et jamais écrite) — et les deux se cherchent avec le même `grep`, dans les deux sens.

**Corollaire sur les réserves au futur.** La leçon 76 disait qu'une réserve écrite en bas d'une ADR
est un défaut daté. Celle-ci l'étend au commentaire de code : « until then the field stays nil »
n'est pas une note d'implémentation, c'est un bug report que son auteur a rangé dans le seul endroit
qu'aucune suite ne lit. Quand on en croise un, on ne le laisse pas au futur — on mesure le trou
immédiatement.
