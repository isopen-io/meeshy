## Leçon 486 — Une factorisation qui RENFORCE une règle fait rougir la garde qui la protégeait

Le socle et l'en-tête du mood peignaient chacun leur flèche « Publier », avec
leur libellé, leur plancher de 44 pt, leur `.disabled(!canPublishDocument)` et
leurs trois attributs d'accessibilité. Deux écritures d'un même geste — et deux
glyphes déjà divergents (`arrow.up.circle` d'un côté, `arrow.up` de l'autre).

Les factoriser en `publishCapsuleLabel` + `publishCapsule(_:)` a fait tomber
**cinq témoins d'un coup**. Aucun ne mesurait quelque chose de faux : ils
lisaient le CORPS de `var publishButton` et y cherchaient ce qui venait d'en
sortir.

> **Une garde de source ancre sur une PLACE, pas sur une propriété.** Elle ne
> peut pas distinguer « ce site a perdu sa protection » de « la protection a
> déménagé chez un voisin » — les deux se lisent comme l'absence d'une chaîne.

La réponse qui coûte le moins n'est ni de revenir en arrière, ni de supprimer
le témoin : c'est de le **re-viser sur le nouveau site ET d'ajouter l'assertion
qui manquait**. Ici, « chaque flèche MONTE le libellé partagé ». Sans elle, une
troisième flèche écrite plus tard composerait le sien et passerait au vert : la
garde couvrirait un site sur trois en affirmant les couvrir tous.

Le compteur de lectures (`if socleShowsLabels` : 3 → 2) BAISSE, et c'est le
signe qu'il faut lire à l'endroit — moins de lectures pour le même nombre de
contrôles est exactement ce qu'un fusible « une seule règle » cherche à obtenir.
Le réflexe inverse — remonter le nombre jusqu'à ce que ça passe — aurait laissé
la garde verte sur une valeur qui ne veut plus rien dire.

Voir [[reference_negative_source_guards_die_silently]] et
[[reference_a_guard_can_punish_the_first_step_toward_its_own_rule]].
