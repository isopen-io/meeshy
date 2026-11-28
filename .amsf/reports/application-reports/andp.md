# isopen-io/andp — 1.18.0 (dépôt voisin, consommé par les workflows iOS)

**Rôle** : publication App Store Connect pilotée par API (CLI `andp`, serveur MCP, actions GitHub). Python ≥ 3.9, `requests`, `PyYAML`, `PyJWT`, `cryptography`.

## Vérification (2026-11-28)
| | Base @ 2a0e726 | Après (@ 35f6a13) |
|---|---|---|
| `python3 -m pytest tests/` | 924 PASS | **929 PASS** |
| `infrastructure/tests/run_tests.sh` | PASS | non rejoué |
| `apps/ios/andp.yml` de meeshy contre ses chargeurs | 9 cibles résolues, 0 erreur | — |

## Changements de la session (branche `claude/monorepo-engineering-discovery-tu6gw9`)
- `andp/asc/client.py` : délai d'expiration sur chaque requête (10 s connexion, 120 s lecture, réglable) ; le JWT ne part plus vers une autre origine que celle de l'API.
- `tests/test_client.py` : 5 témoins ; `tests/test_builds_latest.py` : le curseur de pagination de la fixture pointe l'hôte réel.
- `CHANGELOG.md` : section « Unreleased ».

## Risques restants
- A3 : `archive.sh`, `sign.sh`, `security-auditor.sh` simulent le succès sans `xcodebuild` ; `security-auditor.sh` sort en 0 après avoir trouvé des secrets.
- A4 : trois commits après 1.18.0 sans version ; meeshy épingle un SHA qui se dit « 1.18.0 » sans l'être.
- A5 : `artifact-manager.sh:21,24` (`\$(basename {})` échappé) ; A6 : `andp --help` sort en 2 ; A7 : pas de job Linux, de lint ni de matrice Python en CI.
- Côté meeshy : B3 (`@v1` flottant).

Non vérifié : existence et cible de l'étiquette `v1`, état de PyPI, tout ce qui exige Xcode ou des identifiants réels.
