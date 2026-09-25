## Un `PATCH` n'applique que ce que son corps NOMME (2026-08-16, cycle 49)

**Contexte** : `ZodObject.partial()` enveloppe chaque champ dans `optional()`
sans lui retirer son `default()`. Parser un corps partiel contre un schéma
défaillé rend le schéma ENTIER, garni de ses défauts — 13 à 33 clés selon la
catégorie de préférences. Toute fusion `{ ...existant, ...validé }` était donc
inerte : le second terme couvrait le premier, et un `PATCH` d'un interrupteur
remettait tous les autres réglages de la catégorie à leur défaut.

**Décision** : `utils/partial-update.ts` → `submittedKeysOnly(validé, corps)`.
La validation de Zod est conservée intégralement ; sa SORTIE est réduite aux
clés de premier niveau que le corps de la requête porte.

**Pourquoi le corps et non le schéma** : après coup, rien dans la sortie de Zod
ne distingue un défaut injecté d'une valeur envoyée qui lui ressemble —
`{ a: true }` a la même forme dans les deux cas. Le corps est la seule source
qui dise ce que l'appelant a NOMMÉ.

**Alternatives rejetées** :
- **Déballer les `ZodDefault` du schéma avant `partial()`.** Demande de
  parcourir des `_def` internes, casse à chaque nouvelle enveloppe (`nullable`,
  `catch`, `pipe`), et ne dit toujours rien des clés imbriquées.
- **Retirer les `default()` des sept schémas.** Ils servent au `PUT`, dont le
  contrat EST « remplace complètement, comble ce qui manque ». Les retirer
  déplacerait le défaut d'un verbe à l'autre.
- **Ne rien changer et documenter « envoyez toujours l'objet complet ».** C'est
  la sémantique de `PUT` ; `PATCH` existerait alors sans raison, et les deux
  clients qui l'appellent déjà partiellement resteraient en faute.

**Conséquences** : la fusion partielle redevient partielle sur les sept
catégories de préférences et sur `PATCH /admin/agent/topics/:id`. La borne est
explicite : la réduction ne descend PAS dans les objets imbriqués — aucun schéma
appelant n'en porte aujourd'hui, et la fusion profonde sera une décision à
prendre une seule fois, dans ce module.
