## Leçon 405 — Dans l'IMAGE, les paquets du monorepo vivent SOUS la racine de l'app : son `tsconfig` les balaie, et rien en local ne peut le dire

**Lot `/chats/:cle` de la v3.** Déclarer `@meeshy/shared` a fait échouer la
construction de l'image sur :

```
./packages/shared/prisma/migrations/migrate-user-roles.ts:9:30
Type error: Cannot find module '../client'
```

Le client Prisma, que la v3 ne génère pas et n'a aucune raison de générer.

La cause n'est pas un oubli, c'est une **géographie** :

| | dépôt | image |
|---|---|---|
| racine de l'app | `apps/web-v3/` | `/app/` |
| paquets | `packages/` — **au-dessus** | `/app/packages/` — **dedans** |

Le `COPY packages/X/ ./packages/X/` est ce qui crée le lien de workspace ; il
place aussi les sources du paquet DANS le périmètre du glob `include` de l'app.
`tsc --noEmit`, `next build`, les 996 témoins : tout était vert en local, et le
serait resté indéfiniment.

> **Un défaut que seule la géographie de l'image produit ne se cherche pas en
> local — il se cherche dans ce qui DIFFÈRE entre les deux.** Ici : ce que le
> Dockerfile déplace.

Deux choses le rendaient invisible plus longtemps :

- `@meeshy/design-tokens` et `@meeshy/icons` étaient copiés de la même façon
  depuis des mois **sans aucun `.ts`**. Le motif était en place, dormant ; le
  premier paquet TypeScript l'a réveillé d'un coup.
- Le prix de la découverte est une construction complète — dix minutes — et le
  cycle se répète à chaque correctif tenté.

D'où le vrai livrable, qui n'est pas la ligne `"exclude": [… "packages"]` : un
invariant qui LIT les `COPY packages/…` du Dockerfile et exige que le tsconfig
les exclue. Il rend en une seconde ce que la construction met dix minutes à
dire, et il tiendra pour le paquet suivant — que personne n'aura vu venir non
plus.

Corollaire : **exclure n'empêche pas d'importer.** TypeScript suit toujours les
`.d.ts` par la résolution de modules ; `exclude` ne fait que cesser de compiler
les sources du paquet comme si elles étaient les nôtres.
