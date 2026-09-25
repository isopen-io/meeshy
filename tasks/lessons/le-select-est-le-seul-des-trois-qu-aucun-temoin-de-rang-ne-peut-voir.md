## Le SELECT est le seul des trois qu'aucun témoin de rang ne peut voir

C'est le point à retenir pour la prochaine passe. Un mock Prisma rend ce qu'on
lui dit **quel que soit le `select`** : un témoin de rang passe donc au vert sur
un site dont la requête ne ramène pas les colonnes du Prisme, et la descente est
morte en production sans que rien ne rougisse. Le résolveur reçoit un objet dont
les rangs 2 à 4 sont `undefined` et rend un rang 1 parfaitement plausible.

> **Quand une règle dépend d'une PROJECTION, la garder exige un témoin qui
> regarde la REQUÊTE — pas seulement le rendu.** C'est la seule famille de ce lot
> qui assert sur un appel plutôt que sur une valeur, et c'est justifié : le
> défaut vit dans l'espace exact que le double de test efface.
