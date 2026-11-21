## Deux sessions sur une issue : ce qui CORRIGE reste, ce qui RÉÉCRIT se jette

**2026-11-21, cycle 197 bis (#20143).** Deux sessions de la même routine ont pris
#20129 en parallèle. L'autre a fusionné la première.

### Ce que la doctrine du dépôt couvre, et ce qu'elle ne couvre pas

« Le corollaire d'asymétrie : quand deux lots se disputent un fichier, **celui
qui n'a rien écrit cède** » suppose qu'un des deux n'a rien écrit. Ici les deux
avaient écrit, et l'un avait fusionné — six fichiers en conflit, dont les cinq
sites du correctif.

La directive #18654 donne la marche à suivre (*la correction déjà sur `dev` se
garde, et le lot s'y adapte*), et elle suffit. Mais appliquée mécaniquement elle
jetterait aussi ce que mon lot avait de VRAI, donc le tri se fait sur un
critère, et il n'est pas « quelle version est la meilleure ? » :

> **Qu'est-ce qui, dans mon lot, est une CORRECTION de ce qui est fusionné, et
> qu'est-ce qui n'est qu'une autre façon de l'écrire ?** La seconde catégorie se
> jette sans négociation et sans regret : elle ne coûte que ce qu'on a déjà payé.
> La première devient un lot de suite, avec sa propre issue — et sa preuve est
> une mutation qui REVIENT à la version fusionnée et fait rougir un témoin.

Jeté, dans ce lot : un helper pour une loi que la version fusionnée écrit en
ligne (aucun gain mesurable), une taxonomie de cliquet plus fine (aucune mesure
de plus), mon journal de cycle (renommé). Gardé : la pagination contre un plafond
silencieux, le drapeau d'incomplétude, le producteur unique.

### Le vrai cadeau de la collision

L'audit adversarial de MA version a rendu sept constats, et **deux décrivaient
mot pour mot la version FUSIONNÉE** — un `take: 10_000` commenté « ne tronque
rien de réaliste », et un « la prochaine passe reprendra le reste » que
`MaintenanceService` démentait à l'endroit qui décide.

> **Un audit de son propre lot audite aussi le lot d'en face, quand les deux ont
> résolu la même question.** Avant de jeter ses constats avec sa version, les
> relire contre ce qui est fusionné : ce qui était vrai de mon code a de bonnes
> chances d'être vrai du leur, pour la raison qui nous a fait écrire la même
> chose.

### Le coût, pour la prochaine fois

Ma branche a été poussée dans les quinze minutes (règle #5243) et la collision
n'a pas été évitée pour autant : l'autre session avait commencé avant, et aucune
des deux n'a relevé la branche de l'autre. La règle réduit la FENÊTRE, elle ne
supprime pas la collision — c'est écrit dans la doctrine, et c'est vérifié.

Ce qui aurait coûté une minute : au moment de CHOISIR l'issue, lire
`git ls-remote --heads origin 'refs/heads/claude/*'` **et** les PR ouvertes qui
la citent (`gh pr list --search 20129`). J'avais fait la première — aucun nom de
branche ne parlait d'export ni de purge — et pas la seconde. **Un nom de branche
ne dit pas sur quoi elle travaille ; une PR, si.**
