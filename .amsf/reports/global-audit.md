# Audit global — 2026-11-27

Base : `dev` @ `467263ce24`, passe du 2026-11-27. Détail des mesures : `../baselines/2026-11-27.md`.

## Chiffres

| Mesure | Valeur |
|---|---|
| Applications | 3 (web, iOS, Android) |
| Services | 3 (passerelle, agent, traducteur) |
| Bibliothèques | 3 (shared, design-tokens, MeeshySDK), plus 2 tiers embarqués |
| Composants audités en profondeur (phases A à E) | 0 |
| Composants dont le build, le type-check et les tests ont été rejoués | 3 (shared, design-tokens, web) |
| Constats | 7 |
| Corrigés sur branche | 2 (#20725, #20729) |
| Ouverts | 4 (#20730, #20731, #20732, #20737) |
| Déjà pris par une autre session | 1 (PR #20719) |

## Ce que la passe a établi

1. Le dépôt est un Turborepo sur workspaces pnpm, installé sous bun 1.3.14 en CI. Pas de cycle, pas de traversée de sources de production entre applications et services.
2. `dev` est rouge sur une garde de contrat de `packages/shared` ; la PR #20719 la répare et porte des conflits.
3. Les images de la passerelle, de l'agent et du web ne contiennent pas les versions de dépendances que la CI a testées (#20730). C'est le seul constat qui bloque un feu vert de release.
4. Quatre épingles de sécurité tenaient des versions vulnérables dans l'arbre de test (#20725).
5. Les compose de production tirent quatre images tierces sans version (#20731).

## Ce que la passe n'a pas fait

Aucun audit fonctionnel, de qualité de code, de performance ou de sécurité applicative par application. Aucune mesure de performance. Aucune revue indépendante. Aucun déploiement. Le dépôt compte environ 28 000 fichiers source ; une passe ne les lit pas.
