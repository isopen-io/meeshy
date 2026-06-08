# Iteration 13 — Analyse d'optimisation

**Date**: 2026-06-08
**Branche**: claude/brave-archimedes-OnFYZ-iter13

## Résumé

Migration des derniers services gateway sans enhancedLogger (SecurityMonitor, SmsService, route voice-analysis), ajout de `.unref()` sur l'interval de SecurityMonitor, et cap de 10 000 entrées sur `eventCounts` pour protéger contre les attaques volumétriques.

## Problèmes identifiés

### A. SecurityMonitor.ts — 3 console.* + interval sans unref + Map non bornée
- 2 `console.error` dans les handlers logEvent/logBatchEvents
- 1 `console.log` dans le cleanup (devrait être debug)
- L'interval de cleanup (10 min) sans `.unref?.()`
- `eventCounts` Map sans borne maximale — lors d'une attaque avec de nombreuses IPs uniques, peut croître sans limite entre deux cycles de cleanup

### B. voice-analysis.ts — 1 console.error
Le seul appel `console.error` dans la route de vérification du service prisma. Fichier non couvert aux itérations précédentes.

### C. SmsService.ts — 9 console.* calls
9 appels `console.warn/log/error` sans logger structuré. Dernier service gateway de routing avec des données opérationnelles (numéros de téléphone, résultats d'envoi) qui bénéficieront de la PII redaction de Pino.

## Portée des changements

| Fichier | Type |
|---------|------|
| `services/gateway/src/services/SecurityMonitor.ts` | Logger + unref + Map cap 10k |
| `services/gateway/src/routes/voice-analysis.ts` | Logger migration |
| `services/gateway/src/services/SmsService.ts` | Logger migration |
