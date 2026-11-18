## Un témoin qui ne passe que par la PERMISSIVITÉ de son outil teste l'outil, pas le produit (cycle 176, #19480)

`dev` est rouge à sa tête. Les deux gardes qui tombent passent **en local, à la
tête de `dev`, sans rien modifier**. Aucune ligne du dépôt n'a changé.

La lecture spontanée — « un lot a cassé quelque chose » — est donc interdite par
le fait lui-même. La question juste est :

> **Qu'est-ce qui a BOUGÉ, et qui n'est pas dans le diff ?**

La réponse était dans les lignes d'INSTALLATION du log, que personne ne lit :
`+ @playwright/test@1.65.1`, puis
`Downloading Chrome for Testing 159.0.8154.6`. Le dépôt épingle Node, bun, pnpm
et Python dans l'en-tête de `ci.yml` ; **le navigateur flottait** (`^1.62.1`,
plus un `bun install` non gelé, donc une résolution au plus récent à chaque run).

### Ce que le saut de version a révélé, et non cassé

C'est le point qui décide du correctif, et il est facile de le manquer : 1.65 n'a
pas cassé deux témoins justes, il a **révélé** deux témoins qui ne mesuraient pas
ce qu'ils annonçaient.

| témoin | ce que l'outil permettait | ce qu'il mesurait vraiment |
|---|---|---|
| un clic sur une page de carrousel que l'application rend `inert` à dessein | Playwright < 1.65 ignorait `inert` dans ses contrôles d'actionnabilité | **un geste qu'aucun utilisateur ne peut faire** |
| `getComputedStyle(el).justifyContent === 'flex-end'` | Chrome < 159 sérialisait ainsi | **le navigateur**, pas l'application |

Les deux étaient donc fautifs **indépendamment de la version**. D'où la règle :

> Devant un témoin qui tombe à la montée d'un outil, ne pas demander « comment le
> faire repasser ? » mais **« sur quelle permissivité reposait-il ? »**. Si la
> réponse nomme une tolérance de l'outil, le témoin est à refaire, pas à
> adapter — et le refaire le rend meilleur sous TOUTES les versions.

### Le corollaire qui compte le plus

L'application avait **raison** : une page de carrousel hors écran doit être
`inert` (ni doigt, ni lecteur d'écran). C'est la GARDE qui, en cliquant au
travers, affirmait implicitement le contraire.

> **Quand un test et le produit se contredisent à la montée d'un outil, vérifier
> lequel des deux a raison AVANT de choisir lequel changer.** Le réflexe est de
> relâcher le produit pour faire passer le test ; ici cela aurait retiré une
> protection d'accessibilité réelle pour satisfaire un témoin qui n'exerçait
> aucun geste humain.

Et le relevé DOM a tranché une hypothèse tentante — « c'est une course, la page
devient inerte trop tard » : la sonde montre la page inerte aux deux gabarits,
dès le premier rendu, **y compris en local où le clic passe**. Une hypothèse de
timing se mesure avant d'être retenue : elle aurait conduit à ajouter une
attente, donc à garder le clic impossible.

### Et la cause racine se ferme, pas seulement ses symptômes

Un dépôt qui épingle Node, bun, pnpm et Python mais laisse flotter son
NAVIGATEUR n'a pas de chaîne de vérification reproductible : la CI peut rendre un
verdict sous un binaire que personne n'a choisi. Réparer les deux témoins sans
épingler aurait laissé le prochain Chromium casser autre chose, un mardi soir, en
accusant le dernier lot poussé.
