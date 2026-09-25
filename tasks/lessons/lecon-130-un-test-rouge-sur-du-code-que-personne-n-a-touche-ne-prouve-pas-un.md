## Leçon 130 — un test rouge sur du code que personne n'a touché ne prouve pas un défaut, il prouve un DÉSACCORD (2026-08-12, routine messaging, cycle 89)

`main` était rouge : 8 suites gateway, 35 tests, depuis un lot d'intégration de 48 fichiers de test.
Le job `Test gateway` échouait sur `main` ET sur toute PR — donc plus rien ne pouvait être mergé,
par personne. Aucun des 35 échecs n'était un défaut de production.

1. **Mesurer le DELTA avant de diagnostiquer quoi que ce soit.** Le premier réflexe utile n'est pas
   de lire le test rouge, c'est de le rejouer sur `main` en checkout détaché avec le MÊME
   `node_modules`. Liste identique, comptes identiques ⇒ la branche est hors de cause, et la
   question change complètement de nature. Cinq minutes qui évitent de chercher un défaut chez soi.
2. **Trancher en lisant ce que la production justifie d'elle-même.** Six des huit suites portaient,
   en face, un commentaire de production expliquant pourquoi la forme attendue par le test était
   exactement celle qu'un correctif avait retirée : `deletedAt: null` qui n'apparie rien sur Mongo,
   `currentUses + 1` qui est une course, `userId` nu qui n'est pas un credential, « pas de requête
   DB » qui était le trou de sécurité. Le test décrivait le BUG. Un dépôt qui documente ses
   correctifs à l'endroit du correctif rend cet arbitrage mécanique — c'est le retour sur
   investissement des commentaires-qui-expliquent-pourquoi.
3. **Un double de test incomplet produit un échec qui ACCUSE la production.** Trois des huit
   suites échouaient uniquement parce qu'il manquait une méthode au double (`updateMany`,
   `connect`, `findFirst`) : la méthode réelle levait, le `catch` avalait, et le test rendait
   « `internal_error` » ou « 0 appel ». Le symptôme désigne la production ; la cause est dans le
   mock. Signature à reconnaître : *tous* les cas d'une méthode rendent la même erreur générique.
4. **Ne jamais écrire de production pour satisfaire un test imaginé.** `sendNotificationToUser`
   n'existait nulle part, dans aucune version, et rien ne l'appelait. Lui donner une implémentation
   aurait produit du code mort — sous garantie de test, donc protégé de toute suppression future.
   Le test part.
5. **Réparer la CI d'autrui n'est pas une digression quand elle bloque la sienne.** La règle « ne
   pas élargir le périmètre » cède devant un fait simple : tant que `main` est rouge, aucun travail
   ne peut être livré. Le repérer tôt (au premier échec de CI) coûte une passe ; le repérer tard
   coûte le cycle.
