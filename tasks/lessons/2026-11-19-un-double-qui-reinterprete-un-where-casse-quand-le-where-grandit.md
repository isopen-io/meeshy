## Un double qui RÉ-INTERPRÈTE un `where` au lieu de l'ÉVALUER casse quand le `where` grandit — et les suites du gateway vivent dans DEUX arborescences, dont une seule se lance par habitude (2026-11-19, #19906)

**Contexte.** Le lot descend l'éligibilité d'un groupe d'appel dans le `where` de
`findExactCallGroups` : trois `unsetOrNull` rejoignent les clauses de participation
déjà présentes sous `AND`. Les quatre familles de suites que j'avais lancées étaient
vertes, `tsc` à zéro. La CI a rendu **9 témoins rouges** dans une suite que je
n'avais jamais exécutée.

**Le défaut du double.** `src/services/calls/__tests__/callGroupConversation.test.ts`
ne lisait pas le `where`, il le TRADUISAIT :

```ts
const required = where.AND.map((clause) => clause.participants.some.userId);
```

La ligne affirme, sans le dire, que **toute** clause de `AND` est une clause de
participation. Elle était vraie le jour où elle a été écrite. Tant qu'elle l'était,
le double ignorait en silence tout ce que la production aurait pu ajouter au `where`
— un filtre de confidentialité, un prédicat de soft-state — et ses témoins
continuaient d'attester le contraire de ce que la requête faisait. Elle a cessé de
l'être, et le double a cassé par `TypeError` sur `clause.participants.some`.

> **Un double qui ré-interprète une requête est un second implémenteur de la
> requête**, avec les deux défauts d'une jumelle : il dérive en silence quand elle
> ne grandit pas de la façon qu'il suppose, et il casse bruyamment quand elle
> grandit autrement. La forme juste est de l'ÉVALUER — ici `findConversationsIn`,
> qui délègue à `matchesMongoWhere` : relation `participants` (`some`/`every`/
> `none`), prédicats `unsetOrNull`, séparation de la clé absente et de la clé nulle,
> ordre et borne. Le double n'a plus à savoir ce que la requête VEUT DIRE ; il
> l'applique.

Les deux moitiés de ce défaut étaient déjà dans la doctrine du dépôt — « un double
PARTIEL perd en silence tout ce que le module GAGNE » et « un double ment aussi par
ce qu'il ACCEPTE ». Ce cas ajoute que les deux énoncés visent la même ligne : ce qui
rend un double partiel est très souvent une TRADUCTION du contrat au lieu d'une
évaluation.

**La seconde moitié, bêtement mécanique, et plus coûteuse.** Les suites du gateway
vivent dans **deux** arborescences :

```
src/__tests__/**                   lancé par habitude
src/<module>/__tests__/**           oublié
```

J'avais lancé `src/__tests__/unit/services/calls/`, `.../talkie/`,
`.../conversations/` et `.../socketio/` — 144 suites, 1556 témoins verts — et la
suite fautive était dans `src/services/calls/__tests__/`, à côté du fichier que je
venais de modifier. **Le chemin du code modifié n'indique pas le chemin de ses
témoins**, et choisir les suites par leur ressemblance au chemin que je viens
d'éditer laisse dehors tout ce qui est rangé selon l'autre convention.

> La parade n'est pas de se souvenir des deux arborescences : c'est de lancer la
> suite ENTIÈRE avant de pousser (`npx jest -w 3` depuis `services/gateway`), et de
> ne sélectionner des suites que pendant la boucle rouge-vert. Une sélection est un
> outil d'itération, jamais une preuve de livraison — et la preuve qu'elle n'en est
> pas une, c'est que ses 1556 témoins verts ne disaient rien des 9 rouges.

**Mesure.** 9 témoins, une suite, trouvés par la CI après que `tsc` et quatre
familles de suites avaient dit vert. Le double remplacé, la même suite rend 12/12 —
et elle garde désormais ce que la requête FAIT, y compris les clauses qu'un lot
futur y ajoutera.
