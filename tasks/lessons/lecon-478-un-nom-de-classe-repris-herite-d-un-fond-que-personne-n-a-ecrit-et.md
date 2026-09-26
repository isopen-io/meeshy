## Leçon 478 — Un nom de classe REPRIS hérite d'un fond que personne n'a écrit, et seul un vrai navigateur le voit

**Le fait (2026-09-03, #4897).** L'écran `/search` affiche, à côté du titre de
chaque groupe, le nombre de lignes montrées. La feuille lui donnait sa teinte :

```css
.groupe>.entete .compte{font-size:var(--text-sm);color:var(--color-text-muted)}
```

Irréprochable — une encre certifiée par le gate des jetons sur les quatre plans,
aucune couleur écrite à la main, aucun pixel. Et pourtant `axe` a mesuré **1,03:1
en sombre, 1,06:1 en clair** : de l'encre sourde sur l'ACCENT.

**La cause n'est dans aucune des deux déclarations.** `.compte` appartient déjà à
`app/connecte/feuille.ts`, que cet écran charge :

```css
.compte{…;background:var(--color-primary);color:var(--color-on-primary)}
```

C'est la pastille de non-lus — pleine, peinte à l'accent, et l'un des cinq
emplois NOMMÉS de la règle 13. Le sélecteur de la recherche, plus spécifique, a
gagné sur la COULEUR DU TEXTE et perdu sur le FOND, qu'il ne mentionne pas. Un
fond que personne n'a voulu, hérité d'une feuille voisine par la seule
coïncidence d'un nom.

> **Réemployer un nom de classe, c'est hériter de TOUT ce que les autres
> feuilles chargées lui ont donné — y compris ce qu'on ne redéclare pas.** La
> question à poser à chaque classe neuve n'est pas « ce nom décrit-il bien mon
> élément ? » mais **« ce nom appartient-il déjà à quelqu'un dans les feuilles
> que cet écran charge ? »**. `.compte`, `.titre`, `.entete`, `.meta`, `.etat`
> sont les plus exposés : ils décrivent un RÔLE, donc plusieurs surfaces les
> trouvent naturels.

**Ce qui rend la leçon chère : aucun témoin du dépôt ne pouvait le voir.**

| garde | ce qu'elle regarde | verdict |
|---|---|---|
| `charte.test.ts` (règle 1) | la feuille écrit-elle une couleur ? | verte — elle n'en écrit aucune |
| `charte.test.ts` (règle 13) | quels sélecteurs peignent à l'accent ? | verte — le NOTRE ne le fait pas, c'est l'AUTRE |
| `check-jetons.mjs` | les paires encre/plan tiennent-elles 4,5:1 ? | verte — la paire réelle n'est pas une paire de la table |
| `jest-axe` sur le HTML servi | la structure est-elle correcte ? | verte — **jsdom ne calcule aucune couleur, et `color-contrast` y est SAUTÉE sans un mot** |

Le seul instrument qui l'attrape est `axe` dans un VRAI navigateur, où la
cascade s'applique et les couleurs sont calculées. C'est exactement la raison
d'être des suites `*-a11y.spec.ts`, et le premier défaut qu'elles trouvent qui
ne soit pas un oubli de structure.

**Corollaire de méthode, mesuré le même soir :** la règle 13 énumère les
sélecteurs qui PEIGNENT à l'accent, pas ceux qui le RÉCEPTIONNENT. Un
inventaire d'émetteurs ne dit rien des héritiers — c'est la leçon 261 (« une
énumération de sites porte deux affirmations ») transposée à la cascade CSS.

Voisines : la 477 (une sonde dont le matériau vient de la production s'éteint
quand la production grandit) — même soirée, même famille : ce qui décide n'est
pas ce que le code DIT, c'est ce que l'environnement lui APPORTE.
