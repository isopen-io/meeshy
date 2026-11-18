## Un pin vit dans autant de lockfiles que le dépôt en TIENT (cycle 176, #19480)

J'ai épinglé `@playwright/test` dans `package.json` et dans `bun.lock`, mesuré
que `bun install --dry-run` résolvait bien la version exacte, et poussé.
`Gardes du dépôt` est tombé : **le dépôt tient DEUX lockfiles**, et
`pnpm-lock.yaml` — celui sur lequel tourne Turborepo — portait encore l'ancienne
portée.

La vérification que j'avais faite était juste et ne pouvait pas voir le défaut :
`bun install --dry-run` interroge le gestionnaire que j'utilisais, donc il
confirmait exactement la moitié que je venais d'écrire.

> **Une preuve obtenue avec l'outil qu'on vient de configurer ne prouve que cet
> outil.** La question à poser à tout changement de dépendance n'est pas
> « ma résolution est-elle bonne ? » mais **« combien de fichiers de ce dépôt
> décrivent l'arbre installé, et les ai-je tous vus ? »** — un
> `ls *lock* pnpm-lock.yaml yarn.lock` coûte une seconde.

### L'attribution se contrôle, elle ne se suppose pas

Le réflexe, devant un rouge sur une PR, est de se demander s'il préexistait. Ici
le contrôle était immédiat et décisif :

| arbre | verdict de `check-lockfile-alignment.mjs` |
|---|---|
| manifestes de `dev` (`git checkout origin/dev -- …`) | self-test 14/14, « alignés » |
| mon seul `bun.lock` | **2 désalignements** |

Le rouge était le mien. **Un `git checkout origin/dev -- <fichiers>` encadré d'un
retour à `HEAD` est le contrôle le moins cher du dépôt**, et il tranche en une
commande ce qu'une lecture de diff laisse ouvert. À noter : mon premier essai de
contrôle fut un `git stash`, qui n'a rien fait — les changements étaient
**déjà commités**, donc l'arbre était propre. Un contrôle qui ne contrôle rien
rend un verdict rassurant.

### Réparer par le geste que la garde prescrit

La garde imprimait son propre remède (`pnpm install --lockfile-only`). L'employer
plutôt qu'éditer à la main a donné un diff confiné — playwright, plus le retrait
d'un `fsevents` optionnel que la nouvelle version ne déclare plus — et un
recoupement gratuit : **les trois empreintes écrites par pnpm étaient identiques
à celles que j'avais lues au registre** pour l'édition chirurgicale de
`bun.lock`. Les deux lockfiles décrivaient bien le même arbre.

> Quand un outil imprime son remède, l'exécuter rend en prime une CONTRE-MESURE
> de ce qu'on avait fait à la main.
