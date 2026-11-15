## Leçon 183 — Deux suites vertes de part et d'autre d'une frontière ne couvrent pas la frontière (2026-08-15, routine temps réel, cycle 32)

`sendMessageSchema` admettait « contenu OU pièces jointes ». Les routes qui
l'emploient n'ont jamais lu `attachments`. La branche menait donc à
`processMessageLinks(content: string)` appelé avec `undefined` — un **500**
déclenchable par un invité anonyme, sur une entrée que le validateur venait
d'approuver.

**Pourquoi ça a tenu.** Les deux moitiés étaient testées, et vertes :
- les tests du SCHÉMA affirmaient `accepts attachments without content` — ils
  décrivaient fidèlement le `refine`, sans jamais demander ce que la route en
  faisait ;
- les quatre suites de ROUTE simulaient toutes `sendMessageSchema.parse` — elles
  n'ont donc jamais vu passer le corps que le vrai `refine` laissait entrer.

Chaque suite était juste sur son côté. Le défaut vivait dans l'espace entre les
deux, et aucune ne regardait cet espace.

**La règle.** Un test qui simule le validateur ne teste plus le CONTRAT
d'entrée, seulement la logique en aval d'une entrée supposée. Dès qu'un module
simule son propre validateur, il faut UNE suite qui emploie le validateur réel
et vérifie l'invariante de jonction : *tout corps que le schéma accepte doit
être servi sans erreur serveur.* Et le double du collaborateur doit être FIDÈLE
à sa signature — ici un `mockResolvedValue` permissif avalait `undefined` sans
broncher, alors que le vrai `content.match()` lève. Un double plus tolérant que
le collaborateur réel transforme un défaut en suite verte.

**Le corollaire de conception.** Une disjonction dans un validateur est une
PROMESSE de fonctionnalité. `A || B` affirme que le code sait servir B. Quand
personne n'implémente B, la disjonction ne rend pas le système permissif : elle
ouvre une porte vers du code qui suppose A. Ne jamais valider une branche que
le chemin d'écriture ne sert pas — la dispense doit arriver AVEC son
implémentation, jamais avant.

Parente des leçons 175, 178 et 180 : là-bas une garde jumelle rassurait la
relecture ; ici ce sont deux suites de tests qui se rassurent l'une l'autre.

---
