## Leçon 409 — Une clé qui sert d'INDEX et de GARDE D'IDEMPOTENCE à la fois se casse en deux dès que l'index cesse d'être total

**Le lot.** #4724 : la rangée haute du composer montrait une tuile par média du
document — un son, un PDF, une image posée sur la scène compris. La loi à poser
était simple : une tuile dit le FOND d'une slide, et rien d'autre.

**Ce que la loi a cassé en passant.** `slideIdByMediaURL` disait « ce média a
fondé cette slide ». La boucle d'ingestion s'en servait AUSSI comme garde
d'idempotence : `where slideIdByMediaURL[media.sourceURL] == nil` voulait dire
« pas encore posé ». Les deux sens coïncidaient tant que TOUT média fondait une
slide. Dès qu'un média peut être posé sans rien fonder, ils divergent — et la
divergence ne se voit pas : la boucle se contente de re-poser le même média à
chaque changement de la liste, indéfiniment, sans erreur ni trace. C'est
`applyContentMedia`, idempotent de son côté, qui aurait absorbé le défaut en
silence.

> **Un index TOTAL peut servir de garde ; un index PARTIEL ne le peut plus, et
> rien ne rougit le jour où il le devient.** Avant de restreindre ce qu'un index
> contient, chercher qui l'interroge pour une question qu'il ne pose pas —
> « existe-t-il ? » au lieu de « où est-il ? ».

**Le correctif.** Une seconde mémoire (`mediaRoleByURL`) qui dit ce que CHAQUE
média est devenu, et qui porte la garde. Elle s'oublie avec son média, sinon
re-choisir le même fichier après un retrait serait sauté — exactement le défaut
que `viewModel.reset()` ferme pour `carriedContentSources`, à un cran de plus.
