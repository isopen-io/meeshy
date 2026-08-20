# Iteration 223 — Intégrité du contenu : séquences `$` dans l'interpolation i18n du frontend web (video-calls)

## Protocole (démarrage)
`main` @ `3ccd8a72` (dernier commit : feat android — verrou de conversation par code PIN).
Branche `claude/brave-archimedes-2z4mri` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install --ignore-scripts` (le postinstall `grpc-tools` échoue derrière le
proxy sortant, cf. CLAUDE.md) puis `bun run build` dans `packages/shared` (le web mappe
`@meeshy/shared/*` → `dist`).

### Audit anti-doublon (8 PRs ouvertes au démarrage)
- **#3218 / #3220** — *DOUBLONS* : tous deux corrigent la même classe `$`-sequence dans
  `services/gateway/src/services/EmailService.ts` (noms d'affichage d'amis). #3218 est le plus complet
  (introduit `utils/string-replace.ts` → `replaceLiteral`). La classe `$`-sequence est **close côté
  gateway** (messaging `7b70bfa1`, tracking iter 221, email #3218). **Zéro chevauchement** avec la
  présente itération — je ne touche PAS `EmailService`.
- **#3217** — modernisation iOS (Date/Concurrency/Design tokens). Surface iOS, non testable ici, aucun
  fichier partagé. Zéro chevauchement.
- **#3138–#3164** — dependabot (CI actions + framer-motion web). Aucun fichier applicatif touché.

**Sélection : Priorité 1 — propagation de la classe `$`-sequence au frontend web `apps/web`**, jamais
couverte par aucune des itérations 219→222 (toutes gateway) ni par aucune PR ouverte.

## Current state (avant correctif)

Le catalogue i18n web interpole des placeholders `{name}` via le replacer-fonction `$`-safe intégré à
`t(key, params)` (`hooks/use-i18n.ts:186` : `value.replace(/\{(\w+)\}/g, (m, k) => params[k]?.toString() || m)`).
Or plusieurs sites du frontend **court-circuitent ce SSOT** en réimplémentant l'interpolation à la main
via `t('clé').replace('{name}', valeurUtilisateur)` — exactement le piège JS que les pipelines gateway
ont éradiqué. `String.prototype.replace(needle, replacementString)` interprète `$$`, `$&`, `` $` ``,
`$'` **dans la chaîne de remplacement**, que la recherche soit une chaîne ou une regex.

Sites touchés, où la valeur injectée est un **nom d'affichage contrôlé par l'utilisateur** rendu en
temps réel dans l'UI d'appel vidéo :

| Fichier | Ligne | Valeur injectée |
|---|---|---|
| `components/video-calls/CallQualityOverlay.tsx` | 68/69 (`title`+`aria-label`) | nom du pair au lien dégradé |
| `components/video-calls/CallQualityOverlay.tsx` | 81 (pastille) | nom du pair partageant son écran |
| `components/video-calls/VideoStream.tsx` | 146 (ligne « a quitté ») | nom du participant parti |

Comportement buggé prouvé RED (nom `A$&B $$ C$'D`) :
`aria-label` = `remoteAlerts.qualityDegraded A{name}B $ CD` — **fuite de la sentinelle `{name}`**, `$$`
avalé, `$'` mutilé. Idem ligne « a quitté ».

## Problems identified
1. **Bug de content-integrity dans l'UI temps réel.** Un pair dont le nom d'affichage contient une
   `$`-sequence voit son nom mutilé dans les alertes d'appel (qualité dégradée, capture d'écran,
   déconnexion) — et la sentinelle interne `{name}` fuite dans le contenu accessible (`aria-label`) et
   visible. Régression d'accessibilité (le lecteur d'écran annonce `{name}`).
2. **Violation du SSOT i18n (duplication).** Trois sites réimplémentent l'interpolation `{name}` à la
   main au lieu d'emprunter le chemin `t(key, params)` déjà `$`-safe. Incohérence avec le reste de
   l'app qui passe params.

## Root causes
- `String.prototype.replace(search, replacementString)` applique la substitution `$` à la chaîne de
  remplacement **indépendamment** du type de la recherche (piège JS classique).
- Le replacer-fonction `$`-safe existe déjà dans `t(key, params)` mais n'était pas emprunté par ces
  sites — chacun re-tricotait `.replace('{name}', nom)`.

## Business impact
Faible fréquence (nom contenant `$`) mais 100 % de mutilation quand elle survient, sur un chemin
visible et en temps réel (appel vidéo). La fuite de `{name}` dégrade la perception de qualité produit.

## Technical impact
Correctif minimal, pas de nouveau code : les 3 sites passent de
`t('clé').replace('{name}', nom)` → `t('clé', { name: nom })`. Zéro nouvelle API, zéro dépendance,
sémantique first-occurrence préservée (identique pour tout nom sans `$`).

## Risk assessment
Très faible. `t(key, params)` est le chemin i18n canonique déjà couvert par les tests existants. Les
mocks `t` des suites video-calls sont mis à niveau pour refléter fidèlement le replacer-fonction réel
(paramètre `params`), garantissant que le test RED prouve bien le bug et que GREEN prouve le correctif.

## Proposed improvements (implémenté)
- `CallQualityOverlay.tsx` : 3 sites → `t(key, { name })`.
- `VideoStream.tsx` : 1 site → `t('stream.participantLeft', { name: participantName || t('stream.participant') })`.
- Tests : suite RED→GREEN dans `CallQualityOverlay.test.tsx` et `VideoStream.test.tsx` (nom
  `A$&B $$ C$'D` inséré verbatim, aucune fuite `{name}`), mocks `t` alignés sur le replacer-fonction
  réel dans les 3 suites concernées (dont `VideoCallInterface.test.tsx`).

## Expected benefits
Intégrité du contenu + accessibilité restaurées sur l'UI d'appel ; convergence vers le SSOT
d'interpolation i18n ; suppression de 3 réimplémentations manuelles.

## Implementation complexity
Triviale (5 fichiers, +71/−7). RED prouvé, GREEN vérifié : `jest __tests__/components/video-calls/`
→ 125/125.

## Validation criteria
- [x] RED prouvé contre le code non corrigé (fuite `{name}`, `$$` avalé).
- [x] GREEN : 11/11 CallQualityOverlay, 12/12 VideoStream, 125/125 dossier video-calls.
- [x] `tsc --noEmit` : zéro **nouvelle** erreur sur les fichiers changés (backlog web préexistant de
      1267 erreurs, indépendant, hors périmètre CI web).
- [x] Non-régression : noms ordinaires (`Alice`, `Bob`) inchangés dans toutes les suites existantes.

## Follow-ups (hors périmètre, notés)
- Sites `t(...).replace('{...}', valeur)` restants à valeur **non** `$`-risquée (nombres formatés,
  `id.slice()`, `formatTime`) : sûrs par construction, non touchés (blast radius minimal).
- Sites à valeur semi-contrôlée à faible risque : `use-conversation-item-actions.ts:109` (emoji d'un
  picker fermé), `settings/user-settings.tsx:664/1140` (email propre de l'utilisateur). Candidats à
  une passe de convergence ultérieure vers `t(key, params)`.
- Un lint-rule bannissant `t(...).replace(...)` au profit de `t(key, params)` rendrait la garde
  structurelle (comme le `replaceLiteral` proposé côté gateway par #3218).
