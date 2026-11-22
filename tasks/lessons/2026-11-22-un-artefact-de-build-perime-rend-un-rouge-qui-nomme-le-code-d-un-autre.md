## Un artefact de build périmé rend un rouge qui NOMME le code d'un autre — et la signature change à chaque fois

*(2026-11-22, #20315, cycles 209→214)*

### Le fait

Trois fois en une nuit, sur un arbre à jour de `dev`, un rouge local a désigné
le code d'un lot fraîchement fusionné par quelqu'un d'autre. Aucun n'était un
défaut : les trois venaient d'un artefact de build périmé dans le conteneur, et
les trois avaient une signature DIFFÉRENTE.

| artefact | ce que le rouge dit |
|---|---|
| `packages/shared/dist` | `TypeError: communitiesEndpoints.byIdJoinLink is not a function` |
| `packages/shared/dist` | `Clé du jeu « undefined » lue en « fr » avant que sa partie du catalogue soit chargée` |
| client Prisma généré | `TS2353: 'joinLinkPausedAt' does not exist in type 'CommunityUpdateInput'` |

Un export manquant, une clé de catalogue `undefined`, un champ Prisma inconnu :
rien qui ressemble à « ton arbre n'est pas préparé ». Le symptôme vit en AVAL de
la cause, donc il porte le nom du code qui l'a révélé — toujours le plus récent,
c'est-à-dire celui qu'on vient de fusionner.

### La règle

**Un rouge local qui nomme le code d'un lot fraîchement fusionné se confronte
d'abord à l'ARBRE, pas au lot.** La CI construit `packages/shared` et génère le
client Prisma elle-même : elle ne voit jamais ces trois-là. Donc **un rouge local
que la CI ne reproduit pas est un rouge d'arbre jusqu'à preuve du contraire**, et
la preuve coûte une commande.

### Pourquoi la règle ne va pas de soi

Le dépôt a déjà la règle inverse, et elle est juste : « une CI rouge sur des
témoins qu'on n'a pas touchés se diagnostique en neutralisant ses PROPRES
témoins » (2026-11-15). Celle-ci est son miroir — rouge LOCAL, CI verte — et les
deux se distinguent par une seule question : **où le rouge se produit-il, et où
ne se produit-il pas ?** Un rouge qui n'existe que chez soi accuse l'arbre ; un
rouge qui n'existe qu'en CI accuse le lot.

Le coût de confondre les deux n'est pas le temps perdu à instruire un faux
défaut : c'est de « corriger » du code juste, en rendant vert chez soi ce qui
était déjà vert partout ailleurs.

### Ce que ça a donné de bon

La même mesure a servi à dire quelque chose de vrai : sur `dev` correctement
préparé, la suite complète d'`apps/web` rend **35 034 verts / 1 rouge sur
2 707 fichiers**, et l'unique rouge est celui qu'on sait nommer (#20285, la garde
des `act()` sous bun 1.4.4). Un arbre propre transforme un « 3 rouges » illisible
en une phrase qu'on peut défendre.
