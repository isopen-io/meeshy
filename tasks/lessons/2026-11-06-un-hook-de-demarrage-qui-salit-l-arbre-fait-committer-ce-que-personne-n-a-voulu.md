## 2026-11-06 — Un hook de démarrage qui SALIT l'arbre fait committer ce que personne n'a voulu (#16550)

Le hook `SessionStart` du dépôt lançait `bun install --ignore-scripts`. Le bun de
l'image des conteneurs cloud (1.4.4) n'étant pas celui que la CI épingle
(`BUN_VERSION: '1.3.14'`), l'install **réécrivait** `bun.lock` : `lockfileVersion`
1 → 3. Chaque session cloud démarrait donc sur un arbre sale, sur un fichier
qu'aucune tâche n'avait demandé à toucher.

Le défaut n'est pas la saleté — c'est ce qu'elle DÉCLENCHE. Le hook `Stop` du
harnais signale « There are uncommitted changes… Please commit and push these
changes », et ce signal est juste dans le cas général. Ici il poussait vers la
seule action vraiment dangereuse : committer une **migration de format de
lockfile** produite par un bun que ni la CI ni les images Docker n'utilisent. Un
`bun.lock` en v3 sur `dev` aurait rencontré le bun 1.3.14 de tous les jobs — une
panne d'installation à l'échelle du dépôt, pour un changement que personne
n'avait voulu.

> **Un signal d'hygiène générique ne sait pas ce que le diff CONTIENT.** « Il y a
> des modifications non committées » est une observation, jamais une instruction
> de committer. Avant d'obéir, lire le diff et se demander **qui l'a écrit, et
> l'a-t-on demandé** : ce que produit l'OUTILLAGE de la session (install, build,
> génération) n'est pas du travail de la session, et se jette au lieu de se
> committer.

Le piège se referme d'autant mieux que les deux moitiés sont correctes
séparément : le hook de démarrage a raison de préparer les gates, le hook d'arrêt
a raison de signaler un arbre sale. C'est leur COMPOSITION qui fabrique
l'instruction fausse — et aucune des deux ne peut la voir depuis sa place.

**Correctif** : `--no-save`, déjà l'idiome du dépôt pour cette raison exacte
(`apps/web/Dockerfile:64`, `services/gateway/Dockerfile:77` et `:151`).
L'installation est identique (« Checked 1323 installs across 1503 packages (no
changes) ») ; seule l'écriture du lockfile est retenue. Rouge → vert mesuré :
`bun install --ignore-scripts` ⇒ 1 fichier sale, `lockfileVersion: 3` ;
`bun install --ignore-scripts --no-save` ⇒ `git status --porcelain` vide, hook
complet en sortie 0, gates verts.

**Corollaire de portée** : le correctif CONTIENT la dérive, il ne la supprime pas.
L'image reste sur un bun différent de la CI, et `CLAUDE.md` demande les deux en
phase (« bump `BUN_VERSION` in lockstep so local and CI never diverge »). Une
divergence qu'on neutralise à un endroit se consigne, sinon elle ressort par un
autre — ce qui est dit dans l'issue plutôt que laissé à la prochaine session.
