## Leçon 160 — Avant de RÉTABLIR un fichier cassé sur main, chercher qui d'autre est déjà en train de le réparer

Cycle 122 (`MessageDayStickyOverlay.swift`).

`main` ne compilait plus : #2982 avait supprimé trois enums du fichier en laissant leurs cinq
lecteurs en place. Diagnostic correct, réparation immédiate — j'ai rétabli le fichier dans son état
d'avant #2982, poussé, notifié. **Trois minutes plus tard**, #2984 fusionnait le VRAI correctif :
elle gardait la simplification voulue et ne remettait que le seul symbole dont les appelants ont
besoin. Les deux réparations ont atterri dans le même lot ; la mienne est passée en dernier, donc
elle a gagné le fichier — et réintroduit 105 lignes que l'équipe venait de retirer deux fois. Il a
fallu un quatrième commit pour rendre le fichier à sa forme voulue.

**Ce qui manquait n'est pas un test, c'est un regard.** Une casse de compilation sur `main` est
publique et gênante pour tout le monde : la probabilité que quelqu'un d'autre soit déjà dessus est
ÉLEVÉE, et elle croît avec l'ancienneté de la casse. Le geste de trois secondes qui l'aurait dit :

```bash
git ls-remote origin 'refs/heads/*' | grep -i <mot-clé-du-fichier-cassé>
# et, sur les branches candidates : le run CI du gate concerné est-il vert ?
```

Ici `claude/meeshy-header-icons-overflow-fe1mna-fixed` — le suffixe `-fixed` disait tout — portait
un run « iOS Tests » **vert** deux minutes avant mon push.

**Règle : réparer la casse d'un autre est légitime ; le faire sans regarder si la réparation existe
déjà ne l'est pas.** Avant tout rétablissement d'un fichier qu'on n'a pas écrit, énumérer les
branches distantes qui le touchent et lire leur verdict CI. S'il y en a une verte, l'ATTENDRE ou la
reprendre — jamais en écrire une seconde en parallèle.

**Corollaire — « rétablir l'état d'avant » est la réparation la plus grossière, pas la plus sûre.**
Elle a l'air conservatrice parce qu'elle revient à du code qui a compilé. Mais elle annule aussi
tout ce qui a été DÉLIBÉRÉMENT changé depuis, et elle le fait en silence : ni conflit, ni test
rouge, puisque l'API publique était identique des deux côtés — c'est précisément ce qui a rendu
l'écrasement invisible au compilateur. La réparation minimale n'est pas « remettre le fichier
d'hier », c'est **remettre le plus petit symbole qui manque à ses lecteurs**, ce qu'a fait #2984.

**Corollaire — un gate qui n'a pas conclu n'est pas un gate.** L'origine de toute la séquence est
`iOS compile (PR gate)` de #2982, `cancelled` à l'instant même de la fusion. La casse n'a donc
jamais été vue par personne avant d'être sur `main`, et `ios-tests.yml` ne tournant pas sur les
pushes vers `main`, rien ne l'a rattrapée ensuite. Un `cancelled` se lit comme un rouge, jamais
comme un vert absent.
