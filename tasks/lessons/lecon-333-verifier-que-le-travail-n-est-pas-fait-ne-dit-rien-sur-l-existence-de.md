## Leçon 333 — vérifier que le TRAVAIL n'est pas fait ne dit rien sur l'existence de l'ISSUE : chercher le SYMPTÔME avant d'en ouvrir une

**Contexte (2026-08-30, boucle de livraison API).** En instruisant une liste de
suivis, j'ai mesuré que `thirdPartyServicesConsentAt` était lu par trois gardes
de `ConsentValidationService` et écrit par **aucune route** — la clé n'étant pas
déclarée dans `ApplicationPreferenceSchema`, Zod la strippe en silence. Défaut
réel, mesuré site par site : deux préférences inactivables pour tout le monde,
sous un message d'erreur nommant une preuve inexistante.

J'ai ouvert **#4343**. Elle a été fermée : **#4242 existait depuis la veille**,
décrivait le même défaut, et son analyse était au moins aussi complète — elle
nommait en plus la raison pour laquelle les témoins existants ne l'attrapent pas
(ils injectent la clé dans le document de test au lieu de la faire passer par la
route).

**J'avais pourtant fait une vérification.** La leçon 329 venait de me coûter cher
dans l'autre sens — un `git log --grep` avait rendu vide sur une issue
entièrement livrée — et j'en avais tiré la bonne règle : vérifier dans le CODE
qu'un travail n'est pas déjà fait. Je l'ai appliquée, et elle a répondu juste :
le correctif n'existait pas.

> **Ce sont deux questions distinctes, et l'une ne répond pas à l'autre.**
> « Ce défaut est-il corrigé ? » se mesure dans le code. « Ce défaut est-il déjà
> RANGÉ ? » se mesure dans le tracker. Un défaut non corrigé peut être
> parfaitement documenté, priorisé et attribué — c'est même le cas NORMAL dans un
> dépôt qui se pilote par issues.

Le biais est mécanique : j'ai cherché ce que je savais chercher. Ma vérification
portait sur la proposition que j'avais formulée (« est-ce déjà fait ? »), et son
succès m'a donné le sentiment d'avoir été rigoureux — ce qui a supprimé
l'occasion de poser la seconde question. **Une vérification réussie sur la
mauvaise proposition coûte plus cher qu'aucune vérification**, parce qu'elle
achète la confiance sans la justifier. C'est exactement la forme du cycle 107 :
*un balayage qui cherche UN idiome mesure sa popularité, pas une propriété.*

**Le geste qui l'attrape coûte un appel**, et il se fait AVANT d'écrire le corps
de l'issue — pas après, quand on est déjà investi :

```
search_issues : repo:<dépôt> is:issue <SYMPTÔME> in:title,body
```

Et le symptôme est le **nom du champ, de la route ou de la colonne** — jamais la
formule qu'on vient d'inventer pour le titre. Deux personnes qui décrivent le
même défaut choisissent presque toujours des titres différents ; elles citent en
revanche le même identifiant. Ici, `thirdPartyServicesConsentAt` rendait #4242 du
premier coup ; « consentement que personne ne peut accorder » n'aurait rien rendu.

**Corollaire de session parallèle, et c'est ce qui rend la règle non
négociable** : plusieurs sessions instruisaient ce dépôt la même nuit. Un doublon
n'est pas seulement du travail perdu à l'écriture — il coûte à celui qui doit le
TRIER, et il fragmente la discussion d'un défaut sur deux fils dont ni l'un ni
l'autre n'a l'histoire complète. Sur un dépôt piloté par issues, **ouvrir est une
écriture partagée**, à traiter avec la même prudence qu'un commit sur un
carrefour.
