## Leçon 537 — Un chantier transversal qui touche TOUS les écrans invalide leurs captures cible s'il ne les régénère pas

Constat du 2026-09-05 (`compare-rendu.js` / `v3-rapport.mjs`, tour v3) : après
la livraison du chantier de navigation en une page (§ 12.11, #5104/#4472/
#4473/#5106 — un fondu inter-documents, une préconnexion au survol, un
navigateur de zone), le gate de conformité visuelle rapportait **48 vues sur
48 hors cible** (`ecart_structurel_max=0,5507`), y compris des écrans que
personne n'avait touchés dans ce tour. Diagnostic : les trois écrans livrés
(`thread`, `chats`, `rich`) portent désormais une barre de navigation globale
(logo + « Retour à l'accueil », deux boutons flottants remontés en HAUT du
document) que les captures cible ne montraient PAS — le chantier de
navigation avait changé la disposition SERVIE de chaque écran connecté, mais
`capture-cibles.js` n'avait été rejoué que pour trois vues (`thread`, `rich`,
`rights`), jamais pour les 45 autres, dont `chats`.

**La règle.**
1. Un chantier qui change la disposition COMMUNE à tous les écrans (un socle,
   un chrome, une barre persistante) est, du point de vue du gate de
   conformité, une modification de CHAQUE écran — même ceux qu'aucun commit
   du chantier n'a nommés. La régénération des captures cible n'est pas un
   pas facultatif de la PR qui livre le chantier : c'est une partie de sa
   livraison, au même titre que le code.
2. Régénérer TROIS captures sur quarante-huit après un changement de socle
   laisse un gate qui rougit partout SANS distinguer un vrai écart d'un
   référentiel périmé — le signal se perd exactement pour tout le monde, pas
   seulement pour les écrans oubliés.
3. Le témoin qui aurait dû l'attraper n'existe pas encore : un gate qui
   compare le SOCLE (chrome commun) de deux captures cible entre elles
   rougirait dès qu'une seule diverge des autres, avant même de comparer
   le contenu propre à chaque écran.
4. Devant un chantier transversal, poser la question au moment de le clore,
   pas au moment où le gate suivant rougit : « ce changement touche-t-il le
   SOCLE de plusieurs écrans, et si oui, qui régénère leurs captures ? » —
   la réponse « je n'ai régénéré que celles de mon écran » est un aveu que
   la question n'a pas été posée à la bonne échelle.
