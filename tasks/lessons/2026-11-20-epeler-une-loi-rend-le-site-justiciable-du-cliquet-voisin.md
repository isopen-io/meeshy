## Épeler une loi rend le site JUSTICIABLE du cliquet voisin — deux cliquets lisent le même littéral pour deux propriétés (2026-11-20, cycle 194, #20091, #20020)

### Le fait

Le lot #20091 a resserré quatre audiences de `isActive: true` nu vers
`PARTICIPATION_VIVANTE`. La suite complète a rendu **une** suite rouge qui
n'était pas dans le périmètre du lot : `live-audience-bound-sweep`, le cliquet
de #20020, qui tient l'inventaire des lectures de participants vivants **sans
borne**.

Trois des quatre sites resserrés y sont entrés d'un coup. Non pas parce que
leur borne avait changé — ils n'en avaient aucune ni avant ni après — mais
parce que le discriminant de ce cliquet-là ne reconnaît la question qu'à ses
deux constantes (`PARTICIPATION_VIVANTE`, `ADMITTED_FILE_READER_WHERE`). Tant
que la clause était épelée à la main, les sites étaient invisibles **aux deux
cliquets à la fois**, pour la même raison.

### La règle

> **Deux cliquets peuvent lire le MÊME littéral pour deux propriétés
> différentes.** #16690 demande « la clause est-elle juste ? » ; #20020 demande
> « la lecture est-elle bornée ? ». Réparer la première rend le site
> JUSTICIABLE de la seconde.

C'est la réciproque exacte de la leçon du cycle 192 — « un refactor qui SORT un
discriminant du littéral casse le cliquet qui le lit ». Ici on y REMET un
discriminant, et le cliquet voisin se réveille. Aucune dette n'est créée : elle
est **enregistrée**, et c'est le résultat qu'on voulait.

> Devant tout lot qui AJOUTE une constante de loi à un `where`, demander : **quel
> autre balayage cherche cette constante ?** La réponse se mesure (`grep -rl
> '<CONSTANTE>' --include='*sweep*'`), elle ne s'intuite pas — et elle se mesure
> AVANT la suite complète, sans quoi on l'apprend d'un rouge qu'on prend pour
> une régression.

### Le corollaire : ce qui retient la borne n'est pas la paresse du lot

Les trois lignes ont été gelées avec leur raison, et deux de ces raisons sont
des DÉCISIONS, pas des reports :

- **`E2EEEnvelopeRelay.directoryOf` ne peut peut-être pas être borné du tout.**
  Sa valeur alimente une comparaison EXACTE (`compareDeviceSets`) : un annuaire
  tronqué ferait refuser en `409 DEVICES_MISMATCH` **tout** envoi d'une
  conversation trop grande, et un émetteur qui s'alignerait sur la troncature
  laisserait sans enveloppe les appareils non nommés — un message chiffré qui
  n'arrive jamais, sans que personne ne le sache. `complete === false` y exige
  une LEVÉE, pas un `take`.
- **Deux éventails d'HÔTES** ont une cardinalité bornée par le PRODUIT
  (`role in creator|admin|moderator`), pas par la requête. La borne s'y pose
  avec la question « combien d'hôtes une conversation peut-elle avoir ? », qui
  n'a pas de réponse écrite.

> Une ligne d'inventaire qui dit « pas encore borné » et une ligne qui dit « ne
> peut pas l'être par un `take` » se ressemblent et n'engagent pas la même
> suite. Écrire laquelle des deux on gèle est le seul travail qui empêche le lot
> suivant de poser un `take` au mauvais endroit, en croyant solder une dette.

### Et la mesure qui a sauvé le reste du rapport

Six autres suites étaient rouges. Toutes HEIC/AVIF/EXIF, toutes « visiblement
environnementales ». Elles l'ÉTAIENT — mesuré en basculant l'arbre sur
`origin/dev` pur (0 modification, `HEAD=ad6f3c887`) et en rejouant les six :
**6 suites, 17 témoins, identiques**. Rouges sur la base, donc pas du lot.

Deux pièges évités en route, et le premier a failli passer :

- `git stash -u` ne remise que le NON COMMITÉ. Un premier essai « sans mes
  changements » tournait encore sur mes quatre correctifs, tous commités — il
  mesurait ma branche en croyant mesurer la base. **Pour comparer à la base, il
  faut y aller** (`git checkout --detach origin/dev`), pas ranger le dessus.
- Un worktree de `dev` n'a pas de `node_modules`, donc n'est pas le chemin le
  moins cher ici ; la bascule détachée l'est, le travail étant commité et poussé.
