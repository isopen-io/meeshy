## Leçon 501 bis — Un « site unique » à portée `private` n'est unique que dans son fichier

**Contexte** : #5059. Le prédicat qui décide de détacher une story citée vivait
en `private var detachedStoryCitation` dans `BubbleStandardLayout`. Son propre
doc-comment se disait, en toutes lettres :

> « Site UNIQUE de la décision : le `body` s'en sert pour monter la carte,
> `bubbleInnerContentBody` pour ne PAS monter la citation plate. Deux prédicats
> jumeaux auraient fini par diverger. »

Il avait raison sur le risque, et il était unique — **pour la bulle**. Les deux
autres peaux (rangée plate, rivière) ne pouvaient pas l'appeler. Elles
retombaient donc sur l'aperçu PLAT, c'est-à-dire exactement le défaut que la vue
`3h` nomme — *aplatie* — et que #4098 avait corrigé pour une seule peau.

> **La question à poser à une règle qu'on déclare partagée n'est pas « combien de
> fois est-elle écrite ? » mais « QUI PEUT L'APPELER ? ».** Une règle que ses
> consommateurs n'atteignent pas se fait réécrire — ou, comme ici, se fait
> IGNORER, et le défaut passe alors pour une décision de produit.

Le mode de panne est particulièrement discret : la peau qui ne peut pas appeler
la règle ne rougit nulle part. Elle rend *quelque chose* — un aperçu correct,
juste pauvre — et seule la comparaison avec sa sœur le révèle. C'est la forme de
la leçon 490 (« deux surfaces converties sur trois, c'est une règle qui a l'air
partagée ») avec une cause plus précise : ce n'est pas l'oubli d'un site, c'est
une **portée** qui rendait le site inatteignable.

### La parade : la règle se pose sur ce que les consommateurs PARTAGENT

Elle est remontée sur `BubbleContent` — le type que les trois peaux reçoivent.
Pas dans un « helper partagé » quelconque : sur la donnée elle-même, où elle est
atteignable par construction plutôt que par discipline.

### Le corollaire : « un seul site » ne veut pas dire « un seul appelant »

Le même lot a dû élargir la garde de #5058 pour laisser une SECONDE projection
appeler `ForwardBadgePolicy`. Ce n'est pas un relâchement, et la distinction
mérite d'être tenue :

| | a le droit d'appeler la règle | pourquoi |
|---|---|---|
| **projection** (`BubbleContentBuilder`, `RiverConversationMapping`) | oui | elle seule tient encore la donnée source (`ForwardReference`) |
| **peau** (une vue) | non | elle ne voit que le modèle projeté ; l'appeler fabrique un second chemin |

> La règle « un seul site » veut dire **la règle vit à un seul endroit, et
> personne ne la réécrit**. Deux projections qui l'APPELLENT la partagent ; une
> vue qui la rappellerait créerait un chemin que rien ne tient d'accord avec le
> premier.

Et la garde qui l'exprime doit **balayer récursivement, sans liste de chemins** :
une liste se périme au premier fichier ajouté, et se périme en silence puisque
le résultat reste non vide.

### Trois pièges de mesure rencontrés dans le même lot

1. **Une garde qui énumère un arbre peut naître morte sur un chemin faux.**
   `URL(fileURLWithPath: #filePath).deletingLastPathComponent()` retire d'abord le
   NOM DU FICHIER, pas un répertoire — j'ai compté trois remontées au lieu de
   quatre. Zéro fichier balayé, et toutes les assertions vertes (`Set()` est
   sous-ensemble de tout). **Seul le témoin de non-vacuité l'a attrapé** ; il est
   la moitié du travail, pas un ornement.
2. **Une fabrique de test ne peut pas poser une propriété CALCULÉE.**
   `visualHostsReply` / `audioHostsReply` dérivent de `attachments` ; une fabrique
   qui prétendrait les passer mentirait sur le type. Les cas qu'elles gouvernent
   s'éprouvent sur la règle PURE, où ils sont exprimables.
3. **`xcodegen` ne rejoue pas sur une édition de `project.yml` seule.** Le script
   ne le lance que sur dérive de FICHIERS. Une source déclarée dans une seconde
   cible reste invisible jusqu'à un `xcodegen generate` explicite — et l'erreur
   se lit « cannot find type in scope », qui ressemble à un oubli d'import.

---
