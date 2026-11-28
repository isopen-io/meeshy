# Rapport de sécurité (2026-11-28)

Aucune valeur de secret n'apparaît dans ce rapport ni dans le reste de `.amsf/`.

## Corrigé
| Sév. | Constat | Correctif |
|---|---|---|
| Haute (latente) | `ios-release.yml` téléversait `.andp` entier, donc la clé privée App Store Connect, dans un artefact conservé 7 jours. Le workflow n'ayant jamais abouti, aucune fuite n'est constatée. | #20758 : exclusion explicite de `.andp/secrets.yml` |
| Moyenne | andp envoyait son JWT à toute URL absolue lue dans une réponse. | `isopen-io/andp` `35f6a13` |
| Moyenne | andp sans délai d'expiration HTTP. | idem |

## Gardes ajoutées
- `.claude/hooks/garde-ecritures.sh` : refuse d'écrire un fichier d'identifiants, un lockfile, ou un contenu qui ressemble à un secret.
- `.claude/hooks/garde-commandes.sh` : refuse le push forcé ou la suppression de `dev`/`main`, `rm -rf` de la racine ou de `.git`, `--no-verify`, une purge de données de production.
- Témoin : `bash .amsf/scripts/test-hooks.sh` (31 cas). Ce sont des filets fail-open, pas une frontière.

## Ouvert
| Sév. | Constat | Réf. |
|---|---|---|
| Haute | Chemin de publication iOS sur une référence flottante d'andp | B3 |
| Moyenne | Actions tierces sur `@master` / `@main` dans des jobs à secrets | B12 |
| Moyenne | Trivy non bloquant ; pas de scan de secrets en CI | B13 |
| Moyenne | Interprète Python livré non testé | B4 |
| Basse | Traducteur sans authentification (frontière réseau, décision documentée) | R5 |
| Basse | `dompurify` 3.4.11 | B18 |

## Dépendances (`bun audit`, 2026-11-28)
14 avis : 5 hauts, 3 modérés, 6 bas.
- `zod` < 4.6.6 (haut, exécution) : épingle volontaire, #6235.
- `happy-dom` (2 hauts), `deepmerge-ts`, `effect` (hauts) : chaîne de test et d'outillage, pas le code servi — à confirmer paquet par paquet avant de fermer.
- `dompurify` (1 modéré, 5 bas), `glob`, `minimatch`, `fast-xml-parser`.
Aucune épingle n'a été montée ici : `bun.lock` ne se committe que depuis bun 1.3.14, dans un lot dédié.

## Non couvert
Pas de revue route par route des ≈ 884 routes (autorisations, IDOR), pas de test d'intrusion, pas d'audit cryptographique : NOT VERIFIED. Le dépôt outille ces sujets avec `auditeur-adversarial` et `crypto-e2ee`, qui ne remplacent pas un audit tiers.

Statut global : **aucune vulnérabilité critique ou haute introduite par la session ; une haute latente corrigée ; une haute ouverte (B3).**
