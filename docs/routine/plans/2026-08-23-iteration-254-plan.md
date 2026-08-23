# Plan — Itération 254 : retirer le `SecurityMonitor` mort

## Objectives

Retirer `src/services/SecurityMonitor.ts` — classe de monitoring/alerting sécurité
jamais câblée, doublon des `db.securityEvent.create(...)` en ligne qui sont le
seul journal d'événements de sécurité que la production exécute — et son test de
404 lignes qui l'exerce sans pouvoir tomber.

## Affected modules

- `services/gateway/src/services/SecurityMonitor.ts` — SUPPRIMÉ.
- `services/gateway/src/__tests__/unit/services/SecurityMonitor.test.ts` — SUPPRIMÉ.
- Docs : analyse + ce plan.

## Implementation phases

1. **Preuve du code mort** — `grep -rn "SecurityMonitor"` : seul le test importe
   le symbole ; aucun `new SecurityMonitor`, aucun import/require dynamique, aucun
   barrel ; aucune ré-export de type (`SecurityEventData`, `SecurityAlert`,
   `SecurityEventType/Severity/Status`) consommée ailleurs. ✅ fait.
2. **Preuve du chemin vivant** — `securityEvent.create` en ligne dans
   `SessionService`, `PasswordResetService`, `PhonePasswordResetService`,
   `PhoneTransferService`, `MagicLinkService`, job `unlock-accounts`. ✅ fait.
3. **Retrait** des deux fichiers (`git rm`). ✅ fait.
4. **Validation** — `tsc --noEmit` gateway (exit 0 avant/après, fait), puis
   `bun run test:coverage` complète (seuils 87/80/86/83 tenus).

## Dependencies

Aucune. Additif négatif (suppression pure). `EmailService`, `enhancedLogger`,
`PrismaClient` (imports du fichier mort) restent utilisés partout ailleurs.

## Estimated risks

Très faible : suppression de code jamais exécuté + son unique témoin. Seul point à
mesurer : effet sur la couverture globale (lignes couvertes retirées du numérateur
ET du dénominateur), négligeable, vérifié par exécution complète avant publication.

## Rollback strategy

`git revert` du commit unique restaure les deux fichiers. Aucun état persistant,
aucune migration, aucun contrat de fil.

## Validation criteria

- [x] `tsc --noEmit` gateway exit 0 (avant et après).
- [x] Aucune référence de code résiduelle à `SecurityMonitor` (hors docs).
- [x] `bun run test:coverage` verte : 840/840 suites, 19252/19252 tests ;
      couverture 95.39 %/89.46 %/93.31 %/96.09 % (seuils 87/80/86/83 tenus).
- [x] Chemin vivant (`securityEvent.create` × 6 modules) inchangé.

## Completion status

**COMPLET** — 2 fichiers supprimés (751 lignes), `tsc --noEmit` exit 0,
suite complète verte, seuils tenus.

## Progress tracking

- Analyse : `docs/routine/analyses/2026-08-23-iteration-254-analyse.md`.
- Série dette de code mort : 250, 252, 253, **254**.

## Future improvements

Balayer les services gateway importés uniquement par leur test (candidats du même
patron). Corollaire de qualité : les fichiers morts concentrent souvent des `any`
non tenus — leur retrait supprime aussi la dette de typage associée.
