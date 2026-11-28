# Constats de l'audit du 2026-11-28 (relevé — l'état vit dans les issues)

Chaque ligne a été vérifiée dans le code par l'orchestrateur, pas seulement rapportée par un agent. « Décision » = le dépôt documente un choix délibéré : ce n'est pas un défaut, la ligne n'est là que pour ne pas le « redécouvrir ».

## Corrigés dans cette session
| # | Sév. | Constat | Projet | Issue / commit |
|---|---|---|---|---|
| B1 | Haute | L'artefact `andp-state` de `ios-release.yml` emportait `.andp/secrets.yml` (clé privée App Store Connect), ou cassait le chemin App Store selon le défaut d'`upload-artifact`. Latent : le workflow n'a jamais abouti (5 runs en échec). | CI iOS | #20758, `8675a97c` |
| B2a | Moyenne | Contrat ZMQ passerelle ↔ agent écrit deux fois, sans témoin de parité ; `sendEvent` non typé. | shared, gateway, agent | #20759 |
| A1 | Moyenne | andp : aucune requête App Store Connect n'avait de délai d'expiration. | andp | `isopen-io/andp` `35f6a13` |
| A2 | Moyenne | andp : le JWT partait vers toute URL absolue (`links.next` vient du corps de la réponse). | andp | idem |

## Ouverts — à transformer en issues par le porteur ou la prochaine session
| # | Sév. | Constat | Preuve | Pourquoi pas corrigé ici |
|---|---|---|---|---|
| B3 | Haute | Le chemin de publication iOS installe andp par `@v1` flottant (`ios-release.yml:49,77`, `ios-beta-trigger.yml:107`) ; seule la porte de préparation est épinglée par SHA. `ios-beta-trigger` importe en plus un module interne d'andp. | lecture | Épingler demande de choisir le SHA et de le monter avec andp : décision de livraison. |
| B4 | Moyenne | L'image du traducteur tourne en Python 3.11 (`Dockerfile:27`) ; la CI teste en 3.10 et `pyproject.toml:26` exige `<3.11`. L'interprète livré n'est jamais testé. | lecture | Changer l'interprète de production d'un service ML : à valider sur staging. |
| B2b | Moyenne | Contrat ZMQ passerelle ↔ traducteur : interfaces TS et dictionnaires Python tenus à la main, un seul témoin ciblé. | lecture | Demande un schéma commun TS/Python (JSON Schema généré) : lot dédié. |
| B10 | Moyenne | `services/agent/src/llm/providers/anthropic-provider.ts:13` charge `@anthropic-ai/sdk` par `require`, absent de `package.json` : `LLM_PROVIDER=anthropic` lève à l'exécution. | lecture | Ajouter une dépendance modifie `bun.lock`, qui ne se committe que depuis bun 1.3.14 dans un lot dédié. |
| B12 | Moyenne | Actions tierces flottantes : `aquasecurity/trivy-action@master` (`ci.yml:2675`, `docker.yml:731`), `jlumbroso/free-disk-space@main` (`docker.yml:339`, dans le job qui se connecte ensuite à Docker Hub). | grep | Épingler par SHA demande de résoudre les SHA en ligne ; non joignable de façon vérifiable ici. |
| B13 | Moyenne | Trivy n'est pas bloquant ; aucun scan de secrets (gitleaks ou équivalent) en CI. | lecture CI | Choix de politique de CI. |
| B16 | Moyenne | `ios.yml` ne compile que sur PR (tests sur mot-clé) ; `ios.yml` et `sdk-tests.yml` ne se déclenchent pas sur un changement générique de `packages/shared`. Atténué par le cliquet de génération Swift. | lecture CI | Coût macOS : arbitrage du porteur. |
| B17 | Moyenne | `apps/web` : `bun run gate` enchaîne ≈ 110 étapes que la CI rejoue une par une ; rien ne vérifie que les deux listes coïncident. | `ci.yml:322` | Garde à écrire : lot dédié. |
| B9 | Moyenne | `packages/libsignal-wasm` n'a aucun workflow ; son artefact wasm est committé dans `apps/web`. | grep workflows | Demande une chaîne Rust en CI. |
| B18 | Basse | `dompurify` épinglé à 3.4.11 ; avis jusqu'à 3.4.16 (dont un XSS modéré en mode `IN_PLACE`). Aucun usage d'`IN_PLACE` trouvé dans `apps/web/src`. | `bun audit` | Lockfile (voir B10). |
| B7 | Basse | Trois scripts de la passerelle importent des chemins qui n'existent pas (`scripts/migrate-user-fields.ts:10`, `force-migration.ts:6`, `migrate-audio-to-json.ts:15`). | grep | Scripts de migration : retirer ou réparer est une décision. |
| B8 | Basse | Dépendances gRPC déclarées (passerelle, traducteur), aucun code ne les utilise. | grep | Lockfile + image ML. |
| B11 | Basse | Le Dockerfile du traducteur pose `ZMQ_TRANSLATOR_PUSH_PORT`/`PUB_PORT`, `main.py:167` lit `TRANSLATOR_ZMQ_PULL_PORT`/`PUB_PORT`. Les défauts coïncident. | lecture | Sans effet aujourd'hui. |
| B14 | Basse | Les compose dev et local nomment par défaut `isopen/meeshy-web:latest`, que plus rien ne construit. | lecture | — |
| B15 | Basse | `services/agent` et `apps/web` absents de `sync-versions.js`, `auto-changeset.js` et `release.yml`. | lecture | Cohérent avec « la production vient de `dev` » ; à clarifier. |
| B19 | Basse | Une garde web (`act-leak-guard.test.ts`) passe sous bun 1.3.14 et échoue sous 1.4.4. | rejoué sous les deux | À traiter dans le lot qui montera bun. |
| A3–A7 | Moy./Basse | andp : scripts qui simulent le succès sans `xcodebuild` ; trois commits après 1.18.0 sans version ; `artifact-manager.sh:21,24` (`\$(basename {})`) ; `andp --help` sort en 2 ; pas de job Linux ni de lint en CI. | rapport andp | Hors périmètre de cette session. |

## Décisions du dépôt (ne pas rouvrir)
- Le déploiement staging part même si un build de la matrice échoue (`docker.yml`, commentaire au-dessus du `if:` du job de déploiement).
- `zod` reste à 4.4.3 malgré l'avis sur < 4.6.6 : #6235 (4.5 change l'unité de 242 bornes).
- Pas de `--frozen-lockfile` dans les Dockerfiles : documenté dans `apps/web/Dockerfile`.
- Jetons de session du web en `localStorage` : assumé (`apps/web/src/lib/api/session.ts`).
- Le traducteur n'authentifie ni HTTP ni ZMQ : la frontière est le réseau Docker (`services/translator/CLAUDE.md`).
- Pas de migration automatique à la promotion : une migration de production attend le feu vert du porteur.
- Un test de l'agent importe l'évaluateur de `where` de la passerelle (`mongo-persistence-living-participation.test.ts:38`) : choix écrit dans `services/agent/CLAUDE.md` (« il s'importe à travers les paquets plutôt que de se recopier »).
