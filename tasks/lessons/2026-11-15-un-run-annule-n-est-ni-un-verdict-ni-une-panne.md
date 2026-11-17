## Un run ANNULÉ n'est ni un verdict ni une panne — et le mécanisme est souvent écrit dans le workflow lui-même (2026-11-15, #18701)

*Cycle 171 de la routine d'amélioration continue du temps réel. Erreur de MA part, rattrapée avant d'être publiée.*

**La règle, en une phrase : avant de conclure qu'une CI est en panne, lire les COMMENTAIRES du workflow — le comportement qu'on prend pour un incident peut y être documenté, mesuré et VOULU.**

Ce qui s'est passé. Mon lot ne pouvait pas obtenir de verdict : treize dispatches annulés, puis — après la fusion — **treize runs de `dev` annulés d'affilée**, là où `dev` concluait toutes les heures jusqu'à 21 h 03. J'ai écrit, dans mon propre fil, que « le dépôt fusionne à l'aveugle », et j'ai commencé à rédiger l'issue qui le dirait.

Elle aurait été fausse. Le bloc `concurrency` de `ci.yml` porte, juste au-dessus de lui, trente lignes qui décrivent EXACTEMENT ce que je venais d'observer, avec la mesure qui les a établies :

- sur `dev`, `cancel-in-progress` est **faux** : le run EN COURS va au bout, donc `dev` obtient toujours un verdict ;
- seul le run **EN ATTENTE** est évincé par un arrivant plus récent, et GitHub n'en garde qu'un à la fois — d'où une rafale d'« annulés » quand une vague de fusions automatiques pousse treize fois en quatorze minutes ;
- le symptôme d'une vraie famine est nommé pour qui le chercherait : `run_started_at - created_at` qui **GRANDIT** d'un run à l'autre. Vérifié sur mon cas : `run_started_at == created_at`, sans exception.

Et le commentaire finit par l'avertissement que j'allais ignorer : **« Ne pas lire une file d'attente comme une panne. »**

Pourquoi l'erreur était facile. Un `conclusion: "cancelled"` se lit comme un échec — il est rouge dans l'interface, il fait échouer l'agrégateur (`Verdict CI` juge rouge des jobs annulés), et il réveille la session avec un événement intitulé « CI check failed ». Trois signaux concordants, tous dérivés du même fait, et **aucun des trois ne distingue un run évincé d'un run cassé**. La seule chose qui les sépare est l'ÂGE du run au moment de son annulation, et personne ne la regarde spontanément.

Le corollaire opérationnel, pour la prochaine fois : **un run annulé ne se compte ni comme vert ni comme rouge — il ne se compte pas.** Ma boucle de relance l'avait compris pour les dispatches (elle re-dispatchait sur `cancelled` au lieu de conclure) ; mon RAISONNEMENT, lui, a basculé en « panne » dès que le même motif est apparu sur `dev`. L'instrument était juste, l'interprétation non.

Et la forme générale, qui ne tient pas qu'à la CI : **quand un comportement d'infrastructure surprend, le site qui le produit est le premier endroit à lire, pas le dernier.** J'ai interrogé l'API quinze fois, listé les workflows, cherché un annuleur — toutes des mesures du DEHORS — avant d'ouvrir le fichier dont la question était le sujet. Le dépôt y avait laissé la réponse, avec sa date et ses chiffres.
