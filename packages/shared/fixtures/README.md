# Shared Fixtures

Domicile des vecteurs de test partagés (contrat Lentille/Focal, workshop `tasks/lentille-focal-workshop.md` §2.3).
Écrits par L0 (noyau TypeScript, LWS-0/1/2) — `packages/shared/`.
Lus par les 3 plateformes : shared/web (Jest, import direct), iOS (XCTest, ressource de bundle copiée par XcodeGen), Android (JUnit, ressource symlinkée par Gradle).

## `long-message/` (#8147)

- `excerpt.vectors.json` — la loi `longMessageExcerpt` (`utils/long-message.ts`) : `{ _label, input: { text }, expected: { truncated, excerpt } }`, générés en exécutant la loi TS. iOS les rejoue contre son miroir Swift.
- `focal-metrics.json` — le bloc de verre du Focal (`utils/focal-metrics.ts`, `FOCAL_METRICS`) : mêmes clés, mêmes valeurs ; iOS recopie ses constantes et les compare à ce fichier.
