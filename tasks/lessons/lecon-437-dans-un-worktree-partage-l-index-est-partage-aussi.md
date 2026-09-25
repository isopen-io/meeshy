## Leçon 437 — Dans un worktree partagé, l'INDEX est partagé aussi

**Le fait (2026-09-02).** Deux sessions devaient toucher le même
`Localizable.xcstrings` — l'une pour deux clés neuves, l'autre pour sept valeurs.
Chacune a appliqué, indépendamment et sans se concerter, la même parade : *je
fabrique un blob depuis `HEAD` avec ma seule modification, je le stage à la main
avec `git update-index --cacheinfo`, je committe l'index.*

La parade est juste contre le DISQUE et fausse contre l'INDEX. Chacune a relu
l'index une minute plus tard et y a trouvé le blob de l'AUTRE, plus ses fichiers
stagés. Un `git commit` sans chemins aurait, dans les deux sens, emporté le lot
du voisin et écrasé sa moitié du catalogue.

> **Fabriquer un blob à la main protège du contenu du disque, pas de l'index —
> qui n'appartient à personne dans un worktree partagé.** Entre le
> `update-index` et le `commit`, n'importe qui peut avoir stagé autre chose, y
> compris à la même place.

**Ce qui a sauvé les deux lots**, et c'est la règle à garder : `git add` du
fichier partagé TEL QU'IL EST SUR DISQUE (les deux travaux réunis), puis
`git commit -- <chemins>` de son seul code — qui prend l'ARBRE et ignore
l'index. Le fichier partagé part alors avec le commit de celui des deux qui le
tient, en portant les deux travaux.

**Le piège jumeau, payé par la voisine.** Sa parade de secours — « je compare à
`origin/dev` avant de committer » — l'a fait lire le diff À L'ENVERS : elle a
pris les `-` pour mon travail alors que ce sont les lignes de la référence, en a
conclu que ma valeur était déjà poussée, et a repris le fichier depuis
`origin/dev` — effaçant mes sept valeurs, qu'elle a restaurées dans la foulée.
Dans `git diff <ref> -- <fichier>`, `+` est le DISQUE.

> Les deux moitiés se résument en une phrase : **sur un arbre partagé, le seul
> état qu'on possède est celui qu'on vient d'écrire, et il faut le relire juste
> avant de committer.**
