# Index des risques

Chaque risque est adossé à une issue, qui fait foi.

| Risque | Portée | Gravité | Issue |
|---|---|---|---|
| Ce qui est servi n'est pas ce qui est testé : les images résolvent leurs dépendances sans lockfile ni épingles, `zod` 4.6.7 contre 4.4.3 | passerelle, agent, web | élevée | #20730, #6235, #11546 |
| Une image tierce `latest` avec le socket Docker sur l'hôte partagé | infrastructure | moyenne | #20731 |
| Avis de sécurité publiés sur des paquets épinglés | arbre de test et de CI | moyenne | #20725 |
| Un vert qui n'a rien exécuté (scripts du traducteur, lint) | racine | faible | #20732 |
| Un rouge local que la CI ne reproduit pas (fuseau) | web | faible | #20729 |
| Deux gestionnaires, deux résolutions : pnpm ne lit pas `overrides` | agent, voie pnpm | moyenne | #20730 |
| Aucun ESLint sur aucun paquet TypeScript | web, passerelle, agent, shared | faible, connu | noté dans `ci.yml`, #20732 |
