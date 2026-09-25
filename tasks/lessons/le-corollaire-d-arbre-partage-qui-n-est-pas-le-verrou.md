## Le corollaire d'arbre partagé, qui n'est pas le verrou

Le verrou `build.db` fait peur mais échoue franchement — il se voit. Le vrai
danger de l'arbre partagé est un build qui **LIT pendant qu'une autre session
ÉCRIT** : une session pair a rapporté dix `extra argument 'keyboardIsUp' in
call` sur un fichier de témoins pendant que j'ajoutais ce paramètre. Sa
compilation avait la SOURCE d'avant en cache et les TÉMOINS d'après — une erreur
qui n'existait dans aucun des deux états, seulement dans leur mélange.

> **Quand une erreur accuse un fichier qu'une autre session édite en ce moment,
> la relire APRÈS son commit avant de la traiter.** Le diagnostic peut être
> exact sur les faits et faux sur la cause, parce que la cause est temporelle.

Et le verrou lui-même accuse volontiers le voisin : le mien était tenu par mon
PROPRE `SWBBuildService`, qui n'avait pas rendu la main deux secondes après la
sortie en 0 de mon build précédent. `lsof` sur le `build.db` avant d'accuser.
