## Leçon 485 — Une note qui dit « il n'y a pas d'horloge » peut parler d'une AUTRE horloge

`StoryCanvasUIView+Rendering.swift:242` porte, depuis longtemps :

> « le reconfigure est gaté sur la composition et l'`.edit` n'a pas de
> display-link »

Je l'ai citée comme PREUVE dans le corps d'une issue, avant de mesurer :
« même dégatée, la pose ne serait recalculée par personne ». La phrase existe
bien. Elle est vraie du lien de **lecture**, celui qui avance `currentTime`.
Elle est fausse de `editDisplayLink`, qui existe (`+Playback.swift:467`), tourne
à 60–120 Hz, entretient la régulation d'horloge (#3906) et le fond de verre des
textes — et que `didMoveToWindow` arme à chaque apparition.

Ce que la mesure a changé, et c'est pour ça qu'elle valait le détour :

| avant mesure | après mesure |
|---|---|
| « il faut CRÉER une horloge en édition » | « il faut ACCROCHER une passe à celle qui existe » |
| — | « et surtout ne PAS faire avancer `currentTime` » : un objet dont la fenêtre temporelle serait passée disparaîtrait de la scène qu'on compose |

Le second point est le vrai gain. Le remède naïf — faire avancer le playhead en
édition pour que la pose se recalcule — aurait *marché* pour les décorations et
fait disparaître les autres objets, un défaut qu'on n'aurait relié à rien.

> **Une phrase qui NIE l'existence de quelque chose désigne toujours un
> exemplaire précis, jamais la catégorie.** « Il n'y a pas de display-link »,
> « aucune route n'écrit ce champ », « ce n'est appelé nulle part » : chacune est
> vraie d'un référent que son auteur avait en tête et qu'il n'a pas nommé. La
> vérifier coûte un `grep` sur le NOM du mécanisme, pas sur la phrase.

C'est la jumelle de [[reference_no_route_writes_it_does_not_mean_nothing_wrote_it]]
et de la règle « une valeur DÉDUITE n'est pas une valeur LUE » : ici la valeur
avait été lue, mais dans un doc-comment — et un doc-comment est une valeur
DÉDUITE par quelqu'un d'autre, à une date qu'il n'a pas écrite.
