# Rapport de non-régression (2026-11-28)

Arbre validé : branche `claude/monorepo-engineering-discovery-tu6gw9`, **`dev` @ 1d56c70f fusionnée dedans** (fusion sans conflit). Machine : conteneur de session, bun 1.4.4.

Périmètre (`node .amsf/scripts/inventaire.mjs --affected origin/dev`) : modifiés `@meeshy/shared`, `@meeshy/gateway`, `@meeshy/agent` ; consommateur transitif `@meeshy/web` ; aucun projet natif ; hors projet : un workflow, `.claude/`, `.amsf/`.

| Projet | Gate | Base (`dev` @ 829707d0) | Après, arbre fusionné | Verdict |
|---|---|---|---|---|
| `packages/shared` | typage / build | PASS | PASS | PASS |
| | tests | 469 fichiers, 11 097 | 470 fichiers, 11 105 | PASS (+ le témoin du contrat ; il compte 10 cas depuis la revue, rejoué seul : 10 / 10) |
| | `action-policy-vectors:check`, `translator-languages:check` | PASS | PASS | PASS |
| `services/agent` | typage / build / tests | PASS · 52 suites, 505 | PASS · 52 suites, 505 | PASS |
| `services/gateway` | typage / build | PASS | PASS | PASS |
| | tests | 3 058 / 3 067 suites (9 rouges d'environnement) | **3 065 / 3 071 suites, 45 628 / 45 646 tests** | PASS — les 6 rouges sont les suites de codecs d'image de la base ; aucun rouge neuf |
| `apps/web` | typage / build | PASS | PASS | PASS |
| | tests | 35 637 / 35 638 | non rejoués : aucune source web modifiée, et le changement de `shared` est additif | NOT VERIFIED (typage et build le couvrent) |
| Dépôt | `check-bun-lockfile-parity`, `check-ci-build-order`, `check-tracked-symlinks`, `ci-affected --self-test` | — | PASS | PASS |
| Hooks | `bash .amsf/scripts/test-hooks.sh` | — | 42 / 42 | PASS |
| `isopen-io/andp` | `pytest tests/` | 924 | 929 | PASS |

Le nombre de suites de la passerelle passe de 3 067 à 3 071 parce que `dev` a avancé entre les deux relevés (7 commits fusionnés), pas à cause de la session.

## Témoins qui peuvent rougir
- Contrat ZMQ : poussé rouge avant l'implémentation (`3310dacf`) ; rejoué avec un fichier sonde qui redéclare `agent:response` dans `services/agent/src/zmq` : 1 rouge, la sonde nommée.
- andp : 5 témoins rouges avant le correctif.

## Non prouvé ici
- iOS, Android, SDK Swift, traducteur : aucun de leurs fichiers n'est modifié ; leurs jobs CI tourneront sur la PR.
- `ios-release.yml` : le comportement réel d'`upload-artifact@v7` avec le motif d'exclusion ne se prouve que par un run `target=appstore` suivi de l'inspection de l'artefact. Statut : NOT VERIFIED.
- Aucun rejeu sous bun 1.3.14 de l'ensemble (seul le témoin `act-leak-guard` l'a été).

## Revue indépendante
Agent `auditeur-adversarial`, sur un diff qu'il n'a pas écrit : contrat ZMQ, workflow et andp jugés conformes ; **deux défauts élevés et trois moyens trouvés dans les hooks et les skills, tous corrigés** (`d6f81617`) ; les cas qu'il a reproduits sont devenus des témoins de `test-hooks.sh`.
