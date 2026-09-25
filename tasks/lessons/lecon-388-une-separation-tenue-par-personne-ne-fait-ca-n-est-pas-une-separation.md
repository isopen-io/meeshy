## Leçon 388 — Une séparation tenue par « personne ne fait ça » n'est pas une séparation

**Lot #4670 (2026-09-01).** Le porteur signale, capture à l'appui, une piste de
7 s lue à DEUX endroits : la pastille près de l'avatar et la carte sous le texte.

Lecture du code : les deux colonnes ne peuvent pas se croiser.
`resolvedBackgroundAudio` ne lit que la scène, `ComposerForegroundSound.resolve`
ne lit que la liste média du document. Deux magasins, aucun pont — la tentation
est de répondre « ce n'est pas possible » et de chercher ailleurs.

C'est vrai, et c'est une propriété des **quatre sites qui ÉCRIVENT** des sons
(`applyCreatedAudio`, `ingestSoundFiles`, `attachPastedAudio`, la reprise de
brouillon), jamais une garantie de ce qui LIT. Le jour où l'un d'eux pose le
même fichier des deux côtés — ou le jour où un cinquième naît — la pastille se
remet à mentir sans qu'une ligne ait changé chez le lecteur.

> **« Aucun chemin actuel ne produit cet état » décrit l'ARBRE D'APPEL
> d'aujourd'hui, pas l'invariant.** Un invariant se lit chez celui qui SERT la
> valeur ; une propriété d'appelants se relit à chaque ajout d'appelant, et
> personne ne sait qu'il doit la relire.

Le correctif tient en une fonction (`ComposerSoundColumn.avatarBadge`) et son
témoin s'écrit **sur le cas que la structure rate** — le même fichier des deux
côtés. Un témoin sur le cas nominal (un fond ici, un contenu là) serait passé au
vert sans que la loi existe : c'est la forme de la leçon 261 (un témoin de rang
s'écrit sur un rang autre que le premier) appliquée à une séparation de sources.
