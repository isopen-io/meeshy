## Une affirmation d'ABSENCE tirée d'un relevé TRONQUÉ n'est pas une mesure (cycle 172, #18760)

*2026-11-15.*

### Le fait

Mes `workflow_dispatch` de CI mouraient tous. Pour savoir si la règle de
concurrence du dépôt (`cancel-in-progress`) en rendait compte, j'ai posé la
bonne question — **y a-t-il un run postérieur dans le même groupe ?** — et je
l'ai posée à l'API avec `perPage: 2`, puis `perPage: 3`.

Réponse lue : « le run suivant est créé APRÈS l'annulation, donc pas de
successeur ». J'en ai tiré une correction publique : « ce n'est pas la règle de
concurrence », écrite dans le journal, sur la PR, et dans une issue.

Le relevé COMPLET porte **douze** runs. Avec eux : une autre session du compte
dispatche sur la même branche, et l'un de ses runs a bel et bien annulé le mien.
La règle de concurrence était à l'œuvre — là où j'affirmais qu'elle ne l'était
pas.

### Pourquoi l'erreur est passée

Le raisonnement était juste, l'instrument ne pouvait pas le servir. Un relevé
trié par date DÉCROISSANTE et coupé à deux entrées montre les deux plus
RÉCENTES : il ne peut pas, par construction, exhiber un run intermédiaire. Et il
ne signale rien — il rend deux lignes parfaitement valides, qui se lisent comme
l'ensemble.

> **La question n'est pas « ai-je vérifié ? » mais « mon instrument POUVAIT-IL
> voir ce que j'affirme absent ? »** Un `perPage`, un `head -n`, un `| head -5`,
> un `limit`, un filtre d'événement, un `--depth` de clone : tous rendent un
> résultat vrai sur ce qu'ils montrent et muet sur ce qu'ils coupent. Une
> affirmation d'EXISTENCE survit à la troncature ; une affirmation d'ABSENCE
> n'en survit jamais.

### Ce qui rend ce cas instructif plutôt qu'anecdotique

**J'avais écrit cette leçon le même jour, dans ce dépôt**, à propos d'un
balayage qui écartait les sites dont il ne savait pas résoudre le nom : *« zéro
trouvé » et « zéro existe » ne sont pas la même affirmation ; un balayage qui
écarte ce qu'il ne sait pas résoudre doit PUBLIER ce qu'il écarte.*

Puis je l'ai rejouée, quelques heures plus tard, sur un paramètre de pagination.
La leçon connue n'a pas protégé, et il faut dire pourquoi : je l'avais rangée
comme une règle sur les BALAYAGES DE CODE — un objet, un domaine, un outil. Elle
porte en réalité sur **toute collection interrogée par un instrument qui coupe**,
et l'API d'un forge en est une.

> Une leçon rangée sous l'outil qui l'a produite ne se déclenche pas devant un
> autre outil. Ce qui la rend portable est la PROPRIÉTÉ — ici : *l'absence ne se
> mesure que sur un ensemble complet* — pas l'anecdote qui l'a révélée.

### La pratique

- Avant toute phrase de la forme « il n'y a pas de X », demander d'abord
  **combien l'instrument en a regardé**, et le comparer au total qu'il annonce
  (`total_count`, le nombre de lignes, la profondeur du clone). Les deux chiffres
  étaient là : `total_count: 8`, puis `9`, puis `12`, à côté de mes deux lignes.
- Une correction publique d'une affirmation antérieure mérite le relevé
  **complet**, pas un relevé plus soigneux : c'est le moment où l'on est le plus
  certain, donc le moins enclin à élargir la fenêtre.
- Et séparer, dans ce qu'on écrit, **ce qui est mesuré** de **ce qui est inféré**
  — la mesure survit à une erreur d'inférence, l'inverse n'est pas vrai. C'est ce
  qui a sauvé le corps de #18760 : sa table venait d'une page complète, et elle
  tient encore après que mes deux commentaires ont été retirés.
