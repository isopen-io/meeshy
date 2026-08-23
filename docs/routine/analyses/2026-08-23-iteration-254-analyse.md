# Analyse — Itération 254 : retirer le `SecurityMonitor` mort (supplanté par les `securityEvent.create` en ligne)

## Current state

`services/gateway/src/services/SecurityMonitor.ts` (347 lignes) expose une classe
`SecurityMonitor` — « Real-time security event monitoring, anomaly detection, and
alerting » — avec un constructeur qui initialise des seuils, charge des e-mails
admin et démarre un `setInterval` de nettoyage, plus une douzaine de méthodes
(`logEvent`, `logBatch`, `getRecentEvents`, `getMetrics`, `getUserEvents`,
`checkThresholds`, `sendAlert`, `addAdminEmail`, `getAlertStats`, …).

Son unique consommateur est son propre test,
`src/__tests__/unit/services/SecurityMonitor.test.ts` (404 lignes). Aucune route,
aucun job, aucun service ne l'instancie.

Pendant ce temps, le journal d'événements de sécurité que la production exécute
réellement est **en ligne** : `db.securityEvent.create({ … })` appelé
directement dans six modules vivants —
`SessionService`, `PasswordResetService`, `PhonePasswordResetService`,
`PhoneTransferService`, `MagicLinkService` et le job `unlock-accounts`.

## Problems identified

1. **Code mort avec test-décoration.** 751 lignes (source + test) qui ne peuvent
   pas tomber en cas de régression produit : le test exerce une classe que rien
   n'appelle. Faux signal de couverture.
2. **Homonymie fonctionnelle / duplication.** Deux implémentations du « log
   d'événement de sécurité » coexistent : la classe orpheline et le
   `securityEvent.create` en ligne des six modules. La classe est la copie morte.
3. **Qualité non tenue.** La classe recourt largement à `any`
   (`metadata?: any`, `getMetrics(): Promise<any>`, `getAlertStats(): any`),
   ce que la charte TypeScript du dépôt interdit — signe qu'elle n'a jamais
   atteint le niveau production.

## Root causes

Service « aspirationnel » (anomaly detection + alerting e-mail) esquissé mais
jamais câblé ; la production a résolu le besoin minimal (persister l'événement)
en ligne, laissant la classe complète en orbite morte. Même patron que les
itérations 250 / 252 / 253.

## Business impact

Nul en exécution (jamais chargé). Coût = friction de maintenance : un lecteur
suppose à tort que l'alerting de sécurité est actif ; toute évolution du modèle
`SecurityEvent` doit maintenir un fichier fantôme et son test.

## Technical impact

- −751 lignes de dette (source 347 + test 404).
- Suppression d'une source de `any` dans le gateway.
- Un seul chemin de journalisation d'événement sécurité reste : l'appel en ligne.

## Risk assessment

Très faible. Suppression pure de code jamais exécuté + son unique témoin.
`tsc --noEmit` gateway reste à 0 après retrait (vérifié). Aucun autre module
n'importe la classe ni ses ré-exports de types (`SecurityEventData`,
`SecurityAlert`, `SecurityEventType/Severity/Status`) — ces types proviennent de
`@meeshy/shared/utils/validation`, seule source consommée ailleurs.

Seul point mesuré : l'effet sur la couverture globale (retrait de lignes
couvertes du numérateur ET du dénominateur), négligeable et vérifié par une
exécution `test:coverage` complète avant publication (seuils 87/80/86/83).

## Proposed improvements

Supprimer les deux fichiers. Aucun remplacement nécessaire : le chemin vivant
(`securityEvent.create` en ligne) est déjà la source de vérité.

## Expected benefits

Dépôt gateway allégé de 751 lignes de dette, un chemin de journalisation unique,
une source de `any` en moins, couverture désormais mesurée uniquement sur du code
exécuté.

## Implementation complexity

Triviale : `git rm` × 2, `tsc`, `test:coverage`.

## Validation criteria

- `tsc --noEmit` gateway exit 0 (avant et après). ✅
- Aucune référence de code résiduelle à `SecurityMonitor` (hors docs historiques).
- `bun run test:coverage` verte, seuils 87/80/86/83 tenus.
- Chemin vivant (`securityEvent.create` × 6 modules) inchangé.

## Suivi — série dette de code mort

- 250 : `_findUsersForLanguage`
- 252 : `TranslationCache` Redis (homonyme mort)
- 253 : `CaptchaService` (doublon de `verifyCaptcha` en ligne)
- **254 : `SecurityMonitor` (doublon des `securityEvent.create` en ligne)**

Prochain candidat potentiel du même patron : rechercher d'autres services
gateway instanciés uniquement par leur test (`grep` « importé seulement par
son test »).
