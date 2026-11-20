## Un cliquet qui garde la REQUÊTE ne dit rien de la PROJECTION (cycle 186, #19938)

*2026-11-19, cycle 186, #19938.*

### Le motif

Une loi qui se prononce sur des colonnes publie son `select` et pose un cliquet :
« tout consommateur doit les SÉLECTIONNER » (`MESSAGE_LIVENESS_SELECT`, #17208).
Le cliquet est juste, et il attrape le consommateur qui retape la liste à la
main dans sa requête.

Il ne peut rien dire du cran d'après. Entre la requête et le verdict, un
consommateur qui met la ligne en CACHE, la mêle à d'autres faits ou la
transporte entre deux unités la **reprojette** — et c'est là que la colonne se
perd :

```ts
select: { id: true, createdAt: true, ...MESSAGE_LIVENESS_SELECT },   // ✅ la loi
})) as Array<{ id: string; createdAt?; deletedAt?; expiresAt? }>;     // ❌ le mensonge
…
{ createdAt: …, deletedAt: …, expiresAt: … }                          // ❌ la perte
```

### Pourquoi rien ne rougit

Trois protections échouent ensemble, et c'est leur conjonction qui fait durer le
défaut :

1. **Le type de la loi a tous ses champs optionnels** — il doit l'être, puisqu'il
   accepte des lignes de provenances diverses. Une ligne amputée le satisfait.
2. **Un `as Array<…>` AFFIRME la forme amputée** : il déclare moins que ce que le
   `select` ramène, et c'est lui qui aveugle `tsc`.
3. **Le double de test projette lui aussi en dur** : un site qui demande la
   colonne et la jette rend alors **exactement le même résultat qu'un site
   juste**. Aucun témoin de verdict ne peut tomber.

### La règle

> **Suivre une colonne de la requête au verdict, pas de la loi à la requête.**
> Le cliquet du `select` garde la première moitié du trajet ; la seconde moitié
> n'est gardée par rien tant que la RECOPIE n'a pas de site unique.

Remède appliqué : la recopie vit à SON site, collée au `select` et au verdict
(`messageLivenessRowOf`), avec un cliquet qui compare ses clés à celles du
`select`. Ajouter une quatrième preuve se fait en touchant trois déclarations
voisines, et l'oubli tombe sur la DÉCLARATION, avant tout scénario.

### Et le corollaire sur les doubles

Le dépôt connaissait « un double de test ment aussi par ce qu'il ACCEPTE »
(cycle 112). Voici la face qui manquait :

> **Un double ment aussi par ce qu'il REND.** Un double Prisma qui projette des
> colonnes en dur rend le même résultat quel que soit le `select` de l'appelant
> — donc il couvre un site juste et un site amputé avec le même vert.

Un double de lecture rend ce que l'appelant a DEMANDÉ : `args.select` est une
donnée du double, pas une décoration.
