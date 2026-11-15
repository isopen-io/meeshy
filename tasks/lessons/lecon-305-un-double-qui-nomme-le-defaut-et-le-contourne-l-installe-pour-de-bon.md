## Leçon 305 — un double qui NOMME le défaut et le contourne l'installe pour de bon (2026-08-28, cycle 129)

`DELETE /me/preferences/categories/:categoryId` détachait les conversations en
écrivant sur `ConversationPreference` — le magasin **clé/valeur** générique du
schéma (`key` / `value` / `valueType`), qui ne déclare ni `categoryId` ni aucun
lien vers une catégorie. La colonne vit sur `UserConversationPreferences`. Le
client Prisma généré refuse l'appel **avant tout aller-retour**
(`PrismaClientValidationError`), donc le `$transaction` levait et la route rendait
500 : **aucune catégorie de conversation n'a jamais pu être supprimée.**

Ce qui rend le cas instructif n'est pas l'erreur de modèle — c'est ce qui l'a
tenue en vie. Le double d'une des trois suites portait, mot pour mot :

```ts
// categories.ts uses prisma.conversationPreference.updateMany on DELETE
// (pre-existing) — keep the surface so the route doesn't crash.
conversationPreference: { updateMany: jest.fn<any>() },
// Real model name (in case Phase 1 fixes the surface).
userConversationPreferences: { updateMany: jest.fn<any>() },
```

Le mauvais modèle avait été **vu**, **nommé**, et **contourné dans le test**.
Quelqu'un a su exactement ce qui n'allait pas, a écrit « real model name », et a
posé une surface pour que la route ne tombe pas.

> **Poser une surface de double pour empêcher une route de tomber, c'est
> supprimer le seul signal qui la ferait réparer.** Le double n'a pas caché le
> défaut par ignorance : il l'a documenté puis neutralisé. La question à poser
> devant tout commentaire de double qui décrit une bizarrerie de production —
> « pre-existing », « keep the surface », « in case X fixes it » — est celle du
> cycle 91 bis, appliquée un cran plus haut : **et c'est bien ?**

Trois corollaires, tous mesurés dans le lot :

- **Un double ment aussi par ce qu'il ACCEPTE** (règle connue, cycle 114) — et
  ici la forme fautive n'était pas une VALEUR impossible mais un **MODÈLE**
  impossible. Le double du gate neuf refuse comme le vrai client ; c'est la seule
  forme qui puisse tomber, et elle a fait tomber **8 témoins sur 8**, y compris
  celui qui n'assertait que la diffusion de `CATEGORY_DELETED`.
- **`tsc` ne l'attrape pas.** Mesuré sous le `tsconfig` réel du gateway
  (`strict: false`) : la ligne EXACTE de production rend `EXIT=0`. La même erreur
  de modèle prise isolément tombe en `TS2353` — ce qui rend le constat pire, pas
  meilleur : **on ne peut pas conclure d'un site qu'un gate voit une classe.**
- **Quand on change la méthode Prisma qu'un handler appelle, on repointe le
  témoin d'erreur.** Celui du DELETE rejetait `$transaction`, que la route
  n'appelle plus : il passait au vert par le chemin nominal en croyant tenir le
  chemin d'erreur.

**Et la jumelle était déjà corrigée ailleurs.** Le même fichier diffusait
`CATEGORIES_REORDERED` en nommant ce qui avait été DEMANDÉ, pas ce qui avait été
ÉCRIT — exactement ce que le cycle 128 avait réparé sur le réordonnancement des
communautés, règle écrite dans le `CLAUDE.md` du gateway. Le lot 128 avait fermé
« le réordonnancement des PRÉFÉRENCES » ; les CATÉGORIES ne sont pas des
préférences dans cette langue-là, et elles portent pourtant le même geste, le
même filtre d'appartenance et la même fuite (confirmer à l'appelant l'existence
d'une catégorie qui n'est pas à lui). C'est la leçon 261 une fois de plus : *ce
que je viens de nommer est-il la propriété, ou seulement le mot par lequel je
l'ai trouvée ?*
