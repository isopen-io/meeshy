## Leçon 387 — Retirer un contrôle, c'est déménager ce qu'il SAVAIT — pas seulement l'effacer

**Lot #4669 (2026-09-01).** Le porteur demande de retirer la pastille « Ajouter
un son » du socle : elle fait doublon depuis que deux autres chemins ouvrent la
même feuille. Le geste paraît soustractif — un `if` et une propriété calculée en
moins.

Elle était pourtant le **seul endroit du composer qui affichait
`soundAuthorUsername`**. La retirer telle quelle aurait fait disparaître
l'attribution d'un son emprunté partout dans l'app, et **aucun témoin ne l'aurait
signalé** : les tests assertaient que la composition RENDAIT le crédit, jamais
qu'elle était MONTRÉE quelque part.

> **Un contrôle qu'on retire emporte trois choses distinctes** : son geste (ici
> un doublon, donc gratuit), sa PLACE (reprise par la pastille de l'avatar), et
> ce qu'il DISAIT — la seule des trois qu'une revue de diff ne montre pas, parce
> qu'elle vit dans une règle que le diff ne touche pas.

La question à poser avant toute suppression n'est pas « ce bouton fait-il double
emploi ? » mais **« quelle est la seule chose que ce bouton affichait ? »**. La
réponse se cherche dans ses LECTURES, pas dans ses actions : ici
`ComposerSocleSound.label` lisait `name`, `soundAuthorUsername` et `duration`,
et deux de ces trois champs n'avaient aucun autre afficheur.

Corollaire de témoin, vécu dans le même lot : `ComposerSocleDensityTests` gardait
le plancher de 44 pt sur quatre ancres, dont `soundChip`. Retirer l'ancre fait
repasser la garde au vert **en ayant rendu la protection à un contrôle sans la
lui redonner ailleurs**. Le plancher a suivi le son jusqu'à la pastille de
l'avatar, et un témoin neuf l'y épingle — sans quoi la suppression aurait éteint
un cliquet en croyant le déplacer.
