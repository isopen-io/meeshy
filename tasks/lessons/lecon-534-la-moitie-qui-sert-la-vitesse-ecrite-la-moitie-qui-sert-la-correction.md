## Leçon 534 — La moitié qui sert la VITESSE écrite, la moitié qui sert la CORRECTION oubliée

**Trois défauts trouvés le 2026-09-05, tous de la même forme**, et la
répétition est ce qui la rend nommable.

| lot | la moitié ÉCRITE | la moitié OUBLIÉE |
|---|---|---|
| upload du fond de slide | `CacheCoordinator.images.adoptImage(localFile:for:)` — le cache adopte l'URL serveur | rien n'écrit l'id serveur dans l'objet du CANVAS |
| `ComposerPreUploadRegistry` | téléverse dès la pose, écrit `postMediaId` dans le canvas — la composition est fluide | `stopForPublication()` l'arrête et **aucun chemin ne lit ses résultats** : la publication re-téléverse tout |
| `PostSceneCard` (trouvé par la session voisine) | le document dit ce qu'il faut peindre | aucun `carrier` remis au player — « sans porteur, le player sert une coquille », écrit dans son propre doc-comment |

> **Une PRÉSENCE rassure plus qu'une absence n'alerte.** Devant
> `adoptImage(...)` douze lignes plus haut, l'œil enregistre « l'adoption est
> faite » et passe. Il n'y a pas d'absence à remarquer : il y a une moitié
> présente, correcte, et qui répond à une AUTRE question.

**Ce qui distingue les deux moitiés, et permet de les chercher** : l'une sert
la PERFORMANCE (cache, pré-montée, rendu immédiat), l'autre sert la
CORRECTION (l'identité qui part sur le fil). La première se remarque tout de
suite quand elle manque — l'écran rame. La seconde ne se remarque JAMAIS chez
l'auteur : son propre appareil a le fichier en cache, la scène se peint chez
lui, et c'est le viewer suivant qui voit du blanc.

> **La question qui les attrape** : *ce que je viens d'obtenir du serveur, qui
> d'autre doit l'apprendre ?* Posée devant chaque `let result = try await
> upload…`, elle rend les trois défauts ci-dessus en une lecture. Posée devant
> le code qui l'entoure, elle n'en rend aucun — parce que le voisinage est
> juste.

**Corollaire de datation.** Le porteur a dit « il y a trois jours ça
fonctionnait », et la donnée lui a donné raison au jour près : les posts du
02-09 n'avaient PAS de canvas (médias simples, grille de tuiles), ceux du
05-09 en ont un et il est orphelin. **Un « ça marchait avant » se vérifie sur
les DONNÉES produites, pas sur le code** — l'API rendait la réponse en une
requête, là où la lecture du diff aurait demandé une heure.

**Et un défaut d'isolation qui n'est pas un détail** : `nonisolated enum` ne
transmet rien à ses `extension`. La règle pure était inatteignable depuis
`OutboxDispatcher`, qui dispatche hors du fil principal — même piège que
`SocialMediaCaption` (leçon 473). Une règle sur des VALEURS doit porter
`nonisolated` sur CHAQUE déclaration, l'énuméré comme ses extensions.
