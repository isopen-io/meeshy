## Deux branches chacune SOUS un plafond par fichier fusionnent AU-DESSUS, et aucun verdict d'avant-fusion ne peut le voir (#19939)

*2026-11-20, #19939.*

### La mesure

| arbre | `MessageHandler.ts` | plafond (`DETTE_HERITEE`) | cliquet |
|---|---:|---:|---|
| ancêtre commun | 2252 | 2269 | — |
| `origin/dev` (après #19943, +15) | **2267** | 2269 | **vert** |
| ma branche (après #19939, +14) | **2266** | 2269 | **vert** |
| la FUSION des deux | **2281** | 2269 | **ROUGE** |

Les deux côtés sont justes. Les deux CI sont vertes. **La somme ne l'est pas**,
et c'est arithmétique : un plafond par fichier n'est pas additif, alors qu'un
merge, lui, additionne.

### La règle

> **Un cliquet qui borne une valeur par FICHIER ne peut pas être vérifié avant
> la fusion.** Chaque branche mesure sa propre distance au plafond ; aucune ne
> mesure la somme. Le seul arbre où la question a un sens est l'arbre FUSIONNÉ —
> qui n'existe, par construction, qu'après la fusion.

C'est exactement ce que la directive porteur du 2026-11-15 (#18654) prescrit —
*« fusionner `dev` dans sa branche, puis REJOUER les gardes sur l'arbre
FUSIONNÉ »* — et ce cas en est la démonstration la plus nette que j'aie
rencontrée : la CI de ma branche était verte sur `a5a447a2b0`, et si j'avais
fusionné sur la foi de ce verdict, `dev` serait passé rouge pour tout le monde,
sur un cliquet qu'aucune des deux PR n'avait fait rougir.

**La directive n'est donc pas une précaution de style.** Elle est la seule
mesure possible pour toute une classe de gardes : les cumulatives (budget de
taille, dette de `any`, cohésion, cumul de couverture). Pour celles-là, « ma CI
est verte » ne veut rien dire d'autre que « ma branche seule est verte ».

### Le corollaire de réparation : ne pas golfer le cliquet

Ma première réparation a extrait la construction de l'entrée de file vers un
helper. **Elle a fait GRANDIR le fichier d'une ligne** : un appel à huit
paramètres nommés est plus long que le littéral qu'il remplace. On peut toujours
gagner des lignes en les allongeant — c'est ce que mesure un cliquet de LIGNES —
et ce serait échanger une mesure contre du code moins lisible.

Ce qui a marché, et c'est le même geste que deux fois plus tôt dans la session :
**déplacer la RAISON vers le module qui porte la règle.** Les dix lignes de
commentaire au site d'appel (#9646, cycle 147, #17026) ne décrivaient pas ce
site — elles décrivaient la loi, et valent de TOUS ses appelants. Elles vivent
dans `editedAudience.ts`, le site en garde deux lignes et un renvoi, et le
fichier passe à **2268**.

> Quand un fichier dépasse, la question n'est pas « quelles lignes puis-je
> enlever ? » mais **« laquelle de ces lignes ne parle pas de ce fichier ? »**.
> Un commentaire qui explique une loi partagée est, littéralement, au mauvais
> endroit — et le déplacer paie deux fois : le budget, et le prochain appelant
> qui lira la loi au lieu de la recopier.

### Ce que ça change dans l'ordre des opérations

Avant de fusionner, et pas seulement avant d'ouvrir la PR : fusionner `dev`,
**rejouer les gardes CUMULATIVES en premier** (elles sont les seules dont le
verdict change à la fusion sans qu'aucun fichier n'ait de conflit), puis
redispatcher la CI. Un `git merge` qui s'annonce « clean, no conflicts » ne dit
rien de ces gardes : il n'y avait effectivement aucun conflit TEXTUEL.
