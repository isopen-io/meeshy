## Leçon 383 — Une projection non déclarée au schéma ne rougit nulle part

**Cycle #3909 (2026-09-01).** L'issue affirmait « le serveur expose déjà
`currentUserConsumption` ». **Il ne l'exposait plus** : #4177 l'avait retiré, à
raison — le champ n'était déclaré nulle part dans `messageAttachmentSchema`,
donc `fast-json-stringify` le retirait de CHAQUE réponse. Deux requêtes Prisma
par page payées depuis juin 2026 pour un champ qu'aucun client n'a jamais reçu.

Câbler le client sans lire le commentaire laissé sur place aurait produit un
lecteur parfaitement correct branché sur `undefined` — un contrôle NON ALIMENTÉ,
que rien ne distingue d'une reprise « pas encore utilisée ».

> **Une projection non déclarée coûte, s'exécute, et passe les tests de route** —
> qui lisent le handler, jamais la charge sérialisée. L'ordre est donc :
> DÉCLARATION → projection → lecteur, et le témoin garde les DEUX moitiés :
> retirer l'une ou l'autre doit faire rougir le même fichier.

Corollaire de méthode, déjà payé au cycle #4625 : **la prémisse d'une issue est
DATÉE, le code ne l'est pas.** Deux issues sur trois ce jour-là reposaient sur un
état du dépôt qui avait changé depuis leur rédaction.
