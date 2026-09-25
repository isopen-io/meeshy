## Leçon 326

**Une protection posée sur une porte manque à sa voisine — et la voisine est dans un AUTRE fichier.**

#4157 a retiré `conversationShareLink.linkId` — le secret qui permet de REJOINDRE une conversation —
de `GET /admin/share-links`, et lui a dédié un geste souverain tracé (`POST …/reveal`). Travail
juste, documenté, testé. Le même secret continuait de sortir par
`GET /admin/users/:id/activity`, écrit dans `routes/admin/users.ts`, à des rôles pour qui
`canViewSensitiveData` vaut `false` — avec `trackingLink.token` et `affiliateToken.token` au
passage.

Le lot ne l'avait pas manqué par négligence : il travaillait `content.ts`, et rien dans ce fichier
ne mentionne son jumeau. **Une correction de fuite se cherche par la DONNÉE, jamais par le
fichier** — `grep` sur le nom de la colonne, pas sur la route qu'on corrige.

C'est le § 275 (« une protection se mesure sur tout ce que la charge TRANSPORTE ») avec l'axe
tourné : là on balayait la charge d'UN site ; ici on balaie les SITES d'une même donnée.

**Le corollaire de garde, trouvé au même endroit.** `GET /admin/users/:id/media` servait
`fileUrl` + `thumbnailUrl` sans lire `isViewOnce`, `isBlurred` ni `effectFlags` : un média à vue
unique sortait entier par une porte d'administration, pendant que l'éventail de notifications le
retenait avec la MÊME garde (`maskedAttachment`), à quatre fichiers de là. Le témoin qui tient ça
n'est pas celui de la charge — c'est celui du `select` :

> **Une garde sans sa colonne ne garde rien.** Retirer les trois champs du `select` en gardant le
> filtre le fait lire `undefined` partout et laisser tout passer, sans qu'aucune assertion de
> charge ne tombe — le fixture, lui, porte toujours les champs. Il faut donc un témoin qui affirme
> que les colonnes de protection sont DEMANDÉES, à côté de celui qui affirme que la charge est
> amputée.

Et le double de Prisma doit **honorer le `select`**, sinon le témoin de charge ne peut tomber que
sur une fuite à la sérialisation, jamais sur celle qu'on corrige : une colonne secrète effectivement
demandée à la base. Même famille que le mock qui ignore le `where`.

---
