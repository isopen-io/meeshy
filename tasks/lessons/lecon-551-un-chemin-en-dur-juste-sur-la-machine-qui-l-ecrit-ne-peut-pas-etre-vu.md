## Leçon 551 — Un chemin en dur JUSTE sur la machine qui l'écrit ne peut pas être vu localement

**Le fait.** Le témoin de virtualisation lançait Chromium ainsi :

```js
chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' })
```

Vert localement, et pour la meilleure des mauvaises raisons : ce chemin EXISTE
dans le conteneur de développement. En CI :

```
browserType.launch: Failed to launch chromium because executable
  doesn't exist at /opt/pw-browsers/chromium
```

**Ce que le dépôt savait déjà.** Deux témoins plus anciens portaient la bonne
forme — un candidat, une garde `existsSync`, et le repli sur la résolution de
Playwright elle-même (celle qui vaut après `playwright install`). Deux autres
codaient un chemin en dur. **La règle était donc écrite quatre fois et de deux
façons**, et c'est l'endroit qu'aucun travail de CI n'exécutait qui portait la
mauvaise. Le sixième témoin a recopié la moitié qu'il avait sous les yeux.

**La règle.** Un réglage d'ENVIRONNEMENT — chemin de binaire, port, répertoire
de cache — écrit à plusieurs endroits finit écrit de plusieurs façons. Il
n'appartient pas au témoin qui s'en sert mais à un module qu'ils partagent
tous : `scripts/lib/browser.mjs` ici, six appelants, une seule ligne à corriger
le jour où le conteneur change de version.

**Ce qui rend ce défaut particulier.** Il est structurellement invisible à
l'endroit où on l'écrit : le chemin codé en dur est celui de la machine qui
l'écrit, donc il est JUSTE là, et le témoin est vert. Aucune relecture locale,
aucune exécution locale, aucune mutation locale ne peut le montrer. **La seule
question qui l'attrape se pose à l'écriture** : *cette valeur est-elle vraie
ailleurs que sur cette machine ?* — et pour un chemin absolu la réponse est
non par défaut.

**Corollaire, à ne pas manquer.** Reproduire le défaut demandait de simuler
l'absence du binaire (`CHROMIUM=/n-existe-pas`), et cette simulation NE
reproduit pas la CI non plus : le bac à sable porte une révision de Chromium
que la version de Playwright du dépôt ne connaît pas. La preuve du correctif
n'est donc pas une exécution mais une IDENTITÉ : le nouveau chemin de code est
exactement celui que deux témoins verts en CI empruntent déjà. Le dire est plus
honnête que de prétendre l'avoir mesuré.
