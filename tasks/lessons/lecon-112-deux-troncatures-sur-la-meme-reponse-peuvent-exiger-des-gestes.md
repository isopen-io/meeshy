## Leçon 112 — deux troncatures sur la MÊME réponse peuvent exiger des gestes opposés ; ce qui tranche, c'est l'existence d'un curseur de reprise (2026-08-11, routine messaging, cycle 80)

`GET /posts/feed/stories?updatedSince=` tronque deux choses à la fois : sa page (plafond 50) et
ses tombstones (plafond 500). La tentation — et ce que la tête du cycle proposait — est de leur
appliquer le même remède, puisque c'est « la même famille de défaut ». C'est faux, et l'écart n'est
pas de degré mais de nature :

- **La page a un curseur de reprise, et il est exact.** Elle est filtrée par `updatedAt` mais
  ordonnée par `(createdAt, id)` — le mésappariement de la leçon 107 — SAUF que son curseur porte
  sur ce même couple. Le parcours est donc sans saut ni doublon : le geste est de **paginer**.
- **Les tombstones n'ont AUCUN curseur.** Il n'existe pas de « page suivante » de disparitions à
  demander. Le seul geste qui fasse sortir les fantômes est le **REMPLACEMENT** du tray par un
  fetch complet : le geste est d'**escalader**.

**Règle : avant de choisir entre paginer et escalader, chercher si le signal tronqué possède un
curseur de reprise — et si ce curseur est cohérent avec l'ORDRE de la page.** Les trois questions
sont distinctes et se posent dans cet ordre. Un curseur qui existe mais porte sur un autre champ
que l'`orderBy` ne vaut rien (c'est le cas des conversations, cycle 79 — d'où l'escalade là-bas).

Deux corollaires qui ont mordu ici :

- **Vérifier que le recours est un vrai recours.** Escalader vers `fullSync` avait du sens pour les
  conversations parce que cette route-là couvre tout. Ici le « fetch complet » emprunte la MÊME
  route plafonnée à 50 : l'escalade seule n'aurait rien rattrapé. Pire, c'est le chemin qui
  REMPLACE l'état affiché puis sauve le cache disque — la troncature y effaçait des stories au lieu
  d'en omettre. **Le chemin de repli mérite le même audit que le chemin nominal**, surtout quand on
  s'apprête à lui envoyer plus de trafic.
- **L'ordre de livraison n'est pas indifférent.** L'escalade des tombstones ne devient correcte que
  parce que le drain a été livré dans le même lot ; livrée seule, elle aurait pointé vers un fetch
  lui-même tronqué. Quand deux correctifs se tiennent, dire lequel rend l'autre valable.

Enfin, un réflexe à installer : **`docs/reviews/**` prescrivait déjà ce correctif** (fiche
`gwcontract-11`), sonde `take: LIMIT+1` comprise, et nommait même le RED discriminant « exactement
LIMIT ⇒ non tronqué ». Trouvée en cherchant où documenter, après avoir tout re-dérivé. Le backlog
d'audit du dépôt est une **source de conception**, pas seulement un registre à cocher : le grepper
sur le symptôme AVANT de concevoir.
