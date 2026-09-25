## Leçon 464 — Un constat consigné LÀ OÙ IL A ÉTÉ PAYÉ ne protège pas ses jumeaux

Formulation d'une session voisine, tirée de #4915 : deux gardes filtrent
`APIError.serverError` alors qu'`APIClient` compte **23 `throw MeeshyError` et
zéro `throw APIError`**. Elles ne s'exécutent jamais — une story supprimée
s'annonce « hors ligne », un participant parti donne « Fiche indisponible ».

Le dépôt le SAVAIT : `StoryViewerView:1290` porte le constat, mesuré, depuis un
lot antérieur. Il est écrit à l'endroit où le défaut a été payé, et il n'a
protégé aucune des deux gardes qui reproduisent la même erreur ailleurs. Pire,
elle l'a découvert **en copiant** l'une d'elles pour sa propre règle : elle
serait née morte, et son témoin l'aurait déclarée juste — un test qui fabrique
lui-même un `APIError` passe au vert sans rien prouver du terrain.

> **Un commentaire protège la ligne qu'il touche, jamais la famille à laquelle
> elle appartient.** Il n'a ni portée, ni mécanisme, ni moyen de rougir. Ce qui
> protège une famille est une GARDE exécutable — un témoin qui balaie tous les
> sites, ou un type qui rend l'erreur impossible.

Trois fois la même forme dans la même journée, sur trois matières :

| le constat consigné | ce qu'il n'a pas protégé |
|---|---|
| `StoryViewerView:1290` — « le client ne jette jamais d'`APIError` » | les deux gardes de 404 qui filtrent `APIError` (#4915) |
| le doc-comment de `storyEffectsV3.ts` — « ce convertisseur RECOMPOSE, toute clé ajoutée s'y perd » | les quatre morsures suivantes sur ce même fichier (#4832, #4840, #4905) |
| ma fiche mémoire sur les mesures au simulateur, piège n°1 — « `simctl install` ne remplace pas le dylib » | la sonde d'une voisine, qui n'a jamais tourné |

Dans les trois cas le texte était JUSTE, lisible, et au bon endroit. Aucun n'a
rien arrêté. Le seul qui ait fini par tenir est celui qu'on a remplacé par un
mécanisme : le convertisseur qui RÉPAND ne peut plus perdre de clé (#4905), là
où son commentaire n'avait fait que raconter quatre fois la même perte.

**Le test à s'appliquer en écrivant un constat** : *est-ce que j'écris ceci
parce que je ne peux pas le rendre exécutable, ou parce que je n'ai pas cherché
comment ?* La première réponse est légitime et fréquente ; la seconde est un
mécanisme qu'on s'épargne.
