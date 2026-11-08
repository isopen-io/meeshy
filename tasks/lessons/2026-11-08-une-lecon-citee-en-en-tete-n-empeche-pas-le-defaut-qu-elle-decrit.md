## Une leçon CITÉE en en-tête n'empêche pas le défaut qu'elle décrit

*Cycle 147, 2026-11-08. Constat d'un audit adversarial sur un lot que je venais
d'écrire, et qui a été refusé à la fusion.*

### Ce qui s'est passé

J'ai posé une garde de confidentialité — « le texte d'une édition ne part qu'à
ceux qui ont le droit de LIRE ce message » — et j'ai écrit, dans son
doc-comment, la leçon 275 du dépôt :

> « la charge que ce site remet contient-elle autre chose que ce que je viens de
> garder ? »

Le lot a été refusé pour **deux défauts, dont un que cette phrase décrit
exactement** :

1. `mention:created` porte `content`, le texte APRÈS édition, et il est émis **à
   quatre lignes** de chaque appel que je venais de garder ;
2. `message:edited` a un SECOND transport, que deux doc-comments du dépôt
   nomment « le transport primaire », et que ma garde ne couvrait pas.

### Pourquoi la citation n'a rien protégé

Parce que **citer une leçon et l'appliquer sont deux gestes différents, et le
premier donne la sensation du second.** En écrivant la phrase, je l'ai traitée
comme une affirmation sur mon lot (« ce lot respecte 275 ») alors qu'elle est
une QUESTION à poser à un objet (« que contient l'objet que ce site remet ? »).

Une question se répond en lisant l'objet. Une affirmation se relit, et se
confirme toute seule.

### La règle pour la prochaine fois

**Une leçon ne s'écrit dans un doc-comment qu'APRÈS avoir été exécutée, et le
doc-comment dit ce qu'on a trouvé en l'exécutant — pas qu'on la connaît.**

Concrètement, pour 275 : ouvrir le fichier, chercher tous les sites qui émettent
dans un rayon de vingt lignes autour de chaque appel gardé, et les lister. Si la
liste est vide, l'écrire (« rien d'autre ne part de cette unité »). Si elle ne
l'est pas, le doc-comment nomme ce qu'on a trouvé.

Le test qui distingue les deux : **mon doc-comment nomme-t-il un objet
CONCRET ?** « la charge peut transporter autre chose » est une récitation ;
« `firstAttachmentUrl` partait sans condition douze lignes plus bas » est une
application.

### Le corollaire, qui coûte plus cher

La même erreur a produit le SECOND défaut, et sous une autre leçon :
« une garde posée sur le chemin le plus fréquenté se lit comme posée sur le
SUJET, et ne l'est que sur son CHEMIN » (cycle 127). Je l'ai citée aussi. Je
n'ai pas compté les transports.

> **Devant une garde qu'on vient de poser, la question n'est pas « ai-je cité la
> bonne leçon ? » mais « combien de sites produisent l'événement que je
> garde ? » — et elle se répond par une commande, pas par une relecture.**
> `grep` sur le nom de l'événement émis. Deux transports ici ; un gardé.

### Ce qui l'a attrapé, et ce qui ne pouvait pas

Aucun cliquet. Un cliquet garde ce que quelqu'un a déjà pensé à garder — c'est
beaucoup, et ce n'est pas un adversaire. Il a fallu un audit qui cherche à
CASSER, et qui a prouvé le rouge sur le transport oublié.

Les deux ne se remplacent pas : le cliquet empêche la régression d'une règle
connue, l'audit trouve la règle qu'on croyait appliquée.
