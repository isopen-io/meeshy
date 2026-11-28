# Audit global du monorepo — rapport exécutif (2026-11-28)

Branches : `isopen-io/meeshy` et `isopen-io/andp`, `claude/monorepo-engineering-discovery-tu6gw9`. Base auditée : `dev` @ 829707d0 ; la branche contient `dev` @ 1d56c70f.

## En chiffres
| | |
|---|---|
| Applications | 4 — web/PWA, coque Android Capacitor (hors service), iOS, Android natif |
| Services | 3 — gateway, agent, translator |
| Bibliothèques partagées | 5 — shared, design-tokens, MeeshySDK, LibSignalClient, libsignal-wasm |
| Dépôt voisin | 1 — andp |
| Composants audités | 13, plus les 24 workflows et l'infrastructure |
| Constats vérifiés | 25 (2 hauts, 14 moyens, 9 bas) |
| Corrigés | 4 (1 haut, 3 moyens) |
| Restants | 21 (1 haut, 11 moyens, 9 bas) — `../BACKLOG.md` |
| Signalements écartés après vérification | 4 — décisions documentées du dépôt, pas des défauts |

## Builds et tests (exécutés ici sauf mention)
| Projet | Build | Tests |
|---|---|---|
| shared | PASS | 11 105 / 11 105 |
| gateway | PASS | 45 628 / 45 646 — 17 échecs, tous dans 6 suites de codecs d'image que le conteneur ne sait pas jouer |
| agent | PASS | 505 / 505 |
| web | PASS | 35 637 / 35 638 (le dernier passe sous le bun épinglé) |
| design-tokens | — | 29 / 29 |
| andp | — | 929 / 929 |
| translator | CI | BLOCKED ici ; PASS en CI @ 7e0ba3f7 |
| Android, SDK Swift | CI | PASS en CI (commits antérieurs à la tête) |
| iOS | CI | dernier run concluant en échec ; correctif fusionné, non encore rejoué |

## Ce qui a été fait
1. **Sécurité** : la clé privée App Store Connect ne peut plus partir dans un artefact de CI (#20758) ; andp ne suit plus une URL étrangère avec son jeton et n'attend plus indéfiniment.
2. **Contrat** : le contrat ZMQ passerelle ↔ agent a une source unique et un témoin (#20759).
3. **Outillage** : inventaire redécouvrable et détection des consommateurs transitifs, relevé de base rejouable, sept agents, six skills, deux hooks de garde testés (#20763).
4. **Preuve** : base mesurée avant modification, rejeu complet des consommateurs sur l'arbre fusionné, revue indépendante dont les cinq défauts ont été corrigés.

## Ce qui n'a pas été fait, et pourquoi
- **Pas de refactorisation de masse ni d'optimisation** : aucun goulot n'a été mesuré, et le dépôt porte des dizaines de sessions en parallèle sur les mêmes fichiers.
- **Pas de montée de dépendances** : `bun.lock` ne se committe que depuis le bun épinglé, dans un lot dédié.
- **Pas de mesure de performance d'exécution** : ni base, ni charge, ni appareil dans le conteneur.
- **Pas de revue de sécurité route par route**, pas de bout en bout réel.
- **Pas de PR, de fusion, de déploiement ni de promotion.**

## Priorités proposées
1. B3 — épingler andp par SHA sur le chemin de publication iOS.
2. B4 — aligner l'interprète Python de l'image du traducteur sur celui que la CI teste.
3. B12 / B13 — épingler les actions tierces ; rendre Trivy bloquant ; ajouter un scan de secrets.
4. B2b — donner une source unique au contrat ZMQ du traducteur.
5. B16 / R1 — déclencher iOS et le SDK sur les fichiers de contrat.

Sécurité : `security-report.md`. Livraison : `../RELEASE-STATUS.md`. Rapports par application : `application-reports/`.
