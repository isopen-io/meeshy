## Leçon 231 — un témoin qui ne peut pas tomber ne protège rien : il ATTESTE, et son attestation survit au démenti (2026-08-17, routine messagerie, cycle 62)

Numérotée 231 et non 228 : `tasks/lessons.md` s'arrête à la 227, mais six sites de
code citent une « Leçon 230 » (et un une 222) absentes du carnet. Sauter au-dessus
des numéros réservés évite d'écrire un doublon de texte différent.

Le cycle 61 a réparé un défaut vieux de plusieurs mois — la pastille de
reconnexion refusée à toute la population des invités de lien partagé — et **la
suite censée le garder est restée VERTE après le fix**, en attestant l'ancien
comportement, dans DEUX témoins jumeaux du même fichier. Le fichier
ré-implémentait le corps des méthodes de production dans des helpers `*Impl` et
testait ces copies.

Ce que le cycle 62 mesure en le retirant : la copie n'était pas seulement
incapable de tomber, elle avait **dérivé jusqu'à prouver le contraire de la
production sur le point le plus cher du contrat**. La production place le rejeu de
la file hors-ligne (destructif) APRÈS le `try` qui entoure la construction de
l'instantané de présence (cosmétique), pour qu'un accroc Mongo ne l'échoue jamais ;
la copie les plaçait DEDANS — l'inverse exact de la régression que son propre
en-tête annonçait garder. Deux témoins du même contrat s'opposaient donc à deux
répertoires d'écart, et rien ne pouvait le signaler puisque l'un ne peut pas
tomber.

Trois règles, du particulier au général :

1. **Ne jamais tester une copie.** Ré-implémenter une méthode dans le test crée un
   second système qui dérive en silence, avec les honneurs du vert. Le prétexte
   habituel — « le vrai objet ne s'importe pas en test » — a une date de
   péremption : ici un harnais construisant un vrai manager existait déjà.
2. **Livrer une garde en prouvant son ROUGE.** Mettre chaque témoin en face de la
   mutation qu'il nomme, sur la production, puis restaurer. C'est la seule mesure
   qui distingue un témoin d'une décoration — et elle a un corollaire : *vérifier
   qu'aucun autre témoin ne tombe*, sans quoi la mutation prouve trop.
3. **Une garde ne peut pas se prouver par un canal que le dommage n'emprunte
   pas.** Un `.catch` sur promesse DÉTACHÉE ne se voit pas dans le retour de son
   appelant (la promesse est abandonnée : l'appelant résout `undefined` gardé ou
   non) ; il se voit dans le verdict du runtime,
   `process.on('unhandledRejection')`. Le témoin « swallowed » de la copie
   attestait un `try/catch` là où seul le `.catch` compte. Demander « par quel
   canal le dommage se manifesterait-il ? » AVANT d'écrire l'assertion.

La forme la plus dangereuse de cette classe : un dispositif de test qui se lit
comme une source de vérité. Même famille, retirée au même cycle : une table de 21
constantes recopiée dans une fabrique `jest.mock('@meeshy/shared/*')` d'`apps/web`
qui n'intercepte rien (vérifié : une valeur remplacée par une chaîne absurde ne
fait tomber aucun des 53 témoins). Un contrat recopié dérive ; recopié dans un
dispositif inerte, il dérive ET fait autorité.
