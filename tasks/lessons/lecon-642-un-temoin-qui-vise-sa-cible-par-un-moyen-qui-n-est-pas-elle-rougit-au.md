## Leçon 642 — un témoin qui vise sa cible par un MOYEN qui n'est pas elle rougit au premier changement de forme ; quatre fois dans un seul lot

2026-09-20, #7141 (web-v2). Le lot a monté `PrismPastille` sur deux surfaces de plus. Il n'a introduit **aucun défaut de produit** — et il a fait rougir **quatre** témoins, tous pour la même raison : chacun mesurait la bonne chose par un moyen qui n'était pas elle.

| témoin | ce qu'il MESURE | ce qu'il ÉPINGLAIT | ce qui l'a cassé |
|---|---|---|---|
| `feed-post-card.test.tsx` | le texte est au-dessus de la scène | `class="whitespace-pre-wrap text-bubble"`, la chaîne ENTIÈRE | une classe de plus (`min-w-0 flex-1`) |
| `card-model.test.ts` | la descente sert le rang 2 | l'objet `model.text` entier, par `toEqual` | deux champs ajoutés, voulus |
| `check-feed-scenes.mjs` | le texte est au-dessus de la scène | `:scope > div > p[lang]`, un CHEMIN | un niveau de plus dans l'arbre |
| `check-reading-mode.mjs` ×2, `lib/check-identity.mjs` | la pastille existe et a un effet | `aria-label*="langue d’origine"`, une chaîne TRADUISIBLE | la pastille lit le catalogue |

Le quatrième est le plus instructif : **il ne pouvait pas rougir localement.** La locale du poste est française, donc le libellé l'était aussi et le gate passait (exit 0) ; seule l'intégration continue, sous une autre locale, l'a rendu. Un témoin qui dépend d'une chaîne traduisible mesure la LANGUE du lecteur autant que le produit.

**Le remède est le même partout, et il existait déjà** : `data-feed-text`, `data-prism-toggle` sont posés pour être trouvés. Un marqueur ne change ni avec une classe, ni avec un niveau d'arbre, ni avec une langue. Quand un témoin doit désigner un nœud, lui donner un nom plutôt qu'un chemin.

**Deux corollaires de méthode, payés dans le même lot :**

1. **La CI d'une PR juge le commit de FUSION, pas la tête de branche.** « Vert sur la branche » ne dit RIEN du verdict après fusion — j'en ai conclu à un flake, à tort, et il a fallu une relance pour le voir. Pour affirmer qu'un rouge de `dev` n'est pas causé par un lot, comparer le code du commit de fusion, jamais le verdict de la branche.
2. **Un balayage BORNÉ n'établit aucune absence.** Après avoir corrigé deux sites, `grep scripts/*.mjs` m'a rendu « aucun autre » — le troisième vivait sous `scripts/lib/`, que ce glob ne descend pas. Le rouge suivant l'a nommé. Quand on conclut « il n'y en a pas d'autre », dire d'abord OÙ on a cherché.

> **Avant d'écrire une assertion, se demander ce qu'elle DEVRAIT laisser passer.** Un témoin de disposition doit survivre à une classe ; un témoin de modèle à un champ ; un témoin de structure à un niveau ; un témoin d'interface à une langue. Celui qui ne survit à rien ne garde rien — il ne fait que signaler que quelqu'un a touché au fichier.
