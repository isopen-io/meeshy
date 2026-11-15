## Une refonte de DISPOSITION garde le chrome partagé et ce que le porteur avait posé (2026-10-07, #9563, #9564)

La refonte de « Progression » (une carte par concept, une fiche par concept, un
tableau de bord) a été jugée « beaucoup mieux » par le porteur, et corrigée sur
trois points qu'aucun témoin n'avait fait rougir :

1. **Les fiches montaient un en-tête statique maison** (`GamePageHeader` sur iOS,
   un `<header>` posé AU-DESSUS du défilement sur le web) alors que le dépôt a un
   composant partagé depuis la directive du 2026-09-14 (`CollapsibleHeaderPage`,
   #6480, #6481) : grand titre, barre translucide quand le contenu défile dessous,
   retour en disque de verre.
2. **Le compteur de Meeshes avait quitté l'en-tête** — retiré sur le web, déplacé
   dans la fiche sur iOS — alors qu'il y avait été posé par deux directives
   (#5839, #6480). Deux agents, deux lectures, et un écart de plus entre les
   plateformes.
3. **Rien ne répondait au toucher** : un badge, une pastille, un blason se
   regardaient sans s'ouvrir.

> **Le brief d'une refonte énumère ce qui ne bouge PAS, pas seulement ce qui
> change.** « Simplifier la page » a été lu comme « tout ce qui n'est pas une
> ligne de concept s'en va » — y compris le chrome que l'écran partageait avec le
> reste de l'application et une entrée d'en-tête que le porteur avait demandée.

Règles tirées :

- **Avant de lancer un lot d'écran, lire l'en-tête de l'écran d'avant et le
  nommer dans le brief** : composant partagé à garder, entrées de l'en-tête à
  garder. Une page neuve qui écrit son propre en-tête est un défaut, pas un choix.
- **Un élément retiré par une refonte se cherche dans `git log` avant de partir** :
  s'il a été posé par une directive (son commentaire la cite presque toujours),
  il ne se retire que par une autre directive.
- **Dans un écran de jeu, tout élément qui porte un sens se touche** : un rebond
  (une seule courbe pour tout le jeu), puis une modale avec les précisions de CET
  élément. C'est à écrire dans le brief dès le premier lot, avec « animations
  réduites » et le retour du focus.
- **Deux agents qui livrent le même écran sur deux plateformes reçoivent la même
  liste de ce qui reste en place** ; sinon chacun tranche seul et la parité se
  perd dans les silences du brief.
