## Leçon 330

**Une garde de source qui balaie le DISQUE est rouge chez l'un et verte en CI — et personne ne peut la refermer.**

La garde de chemins d'API du web (#4285) énumérait ses fichiers par `readdirSync`. Elle tombait
donc sur `apps/web/components/debug/NotificationDebugPanel.tsx`, qui appelle
`buildApiUrl('/notifications')` — et qui est **ignoré par `.gitignore:313`**. Résultat mesuré sur un
arbre propre : la garde est rouge chez quiconque possède ce dossier local, verte en intégration
continue.

C'est pire qu'un faux positif ordinaire, parce qu'**aucun commit ne peut la rendre verte** : le
fichier fautif n'est pas dans le dépôt. La seule issue offerte au développeur est de désactiver la
garde ou de l'ignorer — et ce dépôt a déjà payé 464 témoins passés au vert en perdant leur
protection (§ gardes négatives).

> `git ls-files` est la seule réponse autoritative à « que contient le dépôt ? ». Une garde de
> dépôt énumère le DÉPÔT ; le balayage disque ne reste qu'en repli, si git est indisponible —
> mieux vaut une garde trop large qu'aucune garde.

Et le correctif se prouve **dans les deux sens** : la garde doit encore rougir sur un littéral
introduit dans un fichier SUIVI. Retirer un faux rouge sans vérifier cela, c'est retirer les dents
en croyant retirer le bruit.

Le piège se reconnaît à une question : *ce que ma garde balaie est-il ce que la CI verra ?* Il a une
famille — le `.gitignore` de ce dépôt masque déjà `Cache/` du SDK et tout `Models/`, produisant des
tests **verts par omission**. Ici l'omission joue dans l'autre sens, mais c'est la même racine :
le disque et le dépôt ne sont pas le même ensemble.
