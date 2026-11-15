## 2026-11-05 — Une PR se fusionne sur le VERDICT de son dispatch, jamais avant, et sur le pointeur fusionné, jamais sur le sien (#16176)

La PR #16192 (plein écran audio : Réagir, Répondre sur place, Transférer) a été
fusionnée dans `dev` à 23:08:54, cinquante et une secondes après la CRÉATION du
`workflow_dispatch` d'`android.yml` sur sa tête (run 41931223427). Ce run n'a
démarré qu'à 23:28 et s'est conclu ROUGE à 23:54 : le témoin
`AudioFullscreenActionsTest` ne compilait pas (matchers MockK `any()` hors de la
portée d'un `coEvery`). `:feature:chat:testDebugUnitTest` ne compilant plus, AUCUN
témoin du module ne tournait sur `dev` — y compris ceux qui gardent qu'un vocal
protégé n'est ni transférable ni réactif depuis le plein écran.

> **Un dispatch CRÉÉ n'est pas un dispatch VERT.** La CI des PR étant gelée, le
> seul verdict est la conclusion du run, au SHA de tête. Tant qu'elle n'est pas
> `success` pour chaque job, la PR n'est pas prouvée — et une erreur de
> COMPILATION ne prouve rien, ni pour le lot ni pour ses voisins.

La réparation a rejoué le défaut une couche plus bas. Deux correctifs ÉQUIVALENTS
sont nés en parallèle : `616a1cc9b0` sur la branche du lot (PR #16213) et
`82e63c494a` poussé directement sur `dev`. Ils ne différaient que par la PLACE
d'une ligne, `import io.mockk.MockKMatcherScope`. Git a fusionné #16213 sans
conflit (`mergeable_state: clean`) et a gardé les DEUX lignes. Or Kotlin 2.1
refuse l'import en double d'une CLASSE (`conflicting import: imported name
'MockKMatcherScope' is ambiguous`) — il tolère celui d'une fonction, ce qui rend
le piège rare donc invisible. `dev` est reparti rouge sur le même module.

> **« Sans conflit » est un verdict de TEXTE, pas de compilation.** Dès que la base
> d'une PR a bougé, la preuve faite sur sa tête est périmée : elle se refait sur le
> pointeur qui sera fusionné (la base actuelle + la PR). Et quand la base a reçu
> entre-temps un correctif équivalent, la PR n'a plus rien à apporter : elle se
> ferme, elle ne se fusionne pas « pour être sûr ».

Le témoin qui l'attrape sans SDK Android : le compilateur Kotlin du cache Gradle
(`kotlin-compiler-embeddable`), lancé sur le seul bloc d'imports du fichier et une
souche des classes importées. Rouge en quelques secondes, là où la CI rend son
verdict en quarante minutes.

Corollaire de la leçon 88 (une session concurrente peut pousser un correctif
identique avant le tien) : la revérification ne s'arrête pas avant le PUSH, elle
vaut aussi avant la FUSION.
