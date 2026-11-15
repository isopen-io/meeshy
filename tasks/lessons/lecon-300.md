## Leçon 300

**Un mock qui ignore le `where` ne teste pas la requête : il teste le reste du
handler en supposant la requête juste.**

#4007 : trois routes chargeaient un lien par
`findFirst({ where: { linkId, createdBy: userId } })`, rendant `isCreator`
tautologique et le `403` d'en dessous inatteignable. Le fichier de test voisin
contenait pourtant **`returns 200 when user is conversation ADMIN`** — vert,
pendant que la production rendait 404. Son mock posait `mockResolvedValue(row)` :
la ligne revenait quel que soit le filtre. **Le seul `where` que le test ne
jouait pas était justement celui qui décidait.**

Le motif s'est représenté dans le MÊME lot, sur un autre harnais (#3941,
`conversation-update-route.test.ts`) : là, le rang était filtré DANS la requête,
si bien qu'un administrateur de plateforme simple membre n'était pas *refusé* —
sa ligne n'était jamais chargée. Le point de contrôle n'existait pas là où on le
cherchait, et le test ne pouvait pas le voir.

> **Quand une décision d'autorisation vit dans un `where`, le faux Prisma doit
> HONORER ce `where`** — sinon la garde est hors de portée du test, dans les
> deux sens. Le témoin qui l'attrape n'est pas une assertion de plus : c'est un
> faux qui applique la sémantique du filtre sur les champs scalaires.

Corollaire de conception, tiré des deux correctifs : **une décision
d'autorisation ne se prend pas dans une requête.** La requête ramène
l'appartenance ; la loi décide. C'est ce déplacement qui a rendu les deux sites
testables ET corrects — et il vaut au-delà de Prisma, partout où un filtre de
lecture fait office de garde.
