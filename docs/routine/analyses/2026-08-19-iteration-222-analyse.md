# Itération 222 — Analyse : fuite de sentinelle `$` dans les emails d'amitié (`EmailService`)

**Date** : 2026-08-19
**Priorité** : 1 (feature récemment durcie — classe de bug `$`-substitution, cf. itér. 219-221)
**Branche** : `claude/brave-archimedes-4rqsh2`

## Continuité

Les itérations 219→221 ont éradiqué la classe de bug `String.prototype.replace(search, replacementString)`
dans les pipelines de contenu du gateway (`MessagingService.processLinksInContent` puis
`TrackingLinkService.processExplicitLinksInContent`). La note **Future Considerations** de l'itér. 221
désignait deux chantiers restants :

1. `EmailService` : nombreux `.replace('{token}', value)` où `value` peut porter un `$`.
2. Un helper `replaceLiteral(haystack, needle, value)` centralisé (SSOT anti-`$`) + règle lint.

Cette itération traite les DEUX en un seul geste minimal et vérifié.

## Current state

`EmailService` interpole ses gabarits i18n via `template.replace('{token}', value)`. Audit exhaustif
des 10 sites `.replace('{…}', …)` :

| Ligne | Token | Source de `value` | Risque `$` |
|-------|-------|-------------------|------------|
| 805/817 | `{year}` | année calculée | non (numérique) |
| 977/994/1188 | `{hours}`/`{minutes}` | `.toString()` numérique | non |
| 1529/1564 | `{date}` | date formatée interne | négligeable |
| 1872 | `{count}` | `.toString()` numérique | non |
| **1198** | `{sender}` | **`data.senderName` (nom d'affichage utilisateur)** | **OUI** |
| **1211** | `{accepter}` | **`data.accepterName` (nom d'affichage utilisateur)** | **OUI** |

## Problems identified

Un utilisateur dont le nom d'affichage contient une séquence `$` corrompt **silencieusement** l'intro
des emails « demande d'ami » (`sendFriendRequestEmail`) et « ami accepté » (`sendFriendAcceptedEmail`),
sur les rendus HTML **et** texte. Reproduction prouvée (test RED) avec `accepterName = "B$'ob $& $$"` :

```
B accepted your friend request on Meeshy.ob {accepter} $ accepted your friend request on Meeshy.
```

- `$'` a réinjecté toute la portion post-match du gabarit ;
- `$&` a réinjecté le token `{accepter}` lui-même — **fuite de la sentinelle interne** dans le contenu
  destiné à l'utilisateur ;
- `$$` s'est effondré en `$`.

## Root causes

`String.prototype.replace(search, replacementString)` applique la substitution `$` à la chaîne de
remplacement indépendamment du type de `search`. Seuls les sites alimentés par des **données
utilisateur** (`senderName`, `accepterName`) sont atteints ; les sites numériques sont `$`-free par
construction, ce qui masquait le défaut. Même famille que les itérations 219-221, jamais propagée à
`EmailService`.

## Business impact

Corruption visible de deux emails transactionnels de fort trafic (onboarding social : demandes d'ami et
acceptations). Fuite d'un détail d'implémentation (`{accepter}`, `{sender}`) dans un message de marque.
Atteinte directe à la fidélité du contenu sur un point de contact utilisateur soigné.

## Technical impact

- Élimine la classe `$`-substitution sur les 2 sites `EmailService` alimentés par données utilisateur.
- Introduit `replaceLiteral(haystack, needle, value)` — SSOT anti-`$` réutilisable (leaf util pure,
  zéro dépendance), matérialisant la recommandation d'itér. 221.
- Zéro changement de contrat, de schéma, de format de token, de chemin de lecture.

## Risk assessment

**Très faible.** `replaceLiteral` = `haystack.replace(needle, () => value)` : sémantique
première-occurrence **identique** au `replace(string, string)` remplacé ; seul le comportement pour les
valeurs contenant `$` change (de corrompu à verbatim). Toutes les entrées sans `$` sont inchangées
(non-régression couverte par les tests existants + suite complète `EmailService` verte : 82/82).

## Proposed improvements

1. Nouveau `services/gateway/src/utils/string-replace.ts` → `replaceLiteral`.
2. `sendFriendRequestEmail` L1198 et `sendFriendAcceptedEmail` L1211 : `replaceLiteral(...)`.
3. Sites numériques laissés inchangés (impact minimal, aucun risque, pas de bruit).

## Expected benefits

Emails d'amitié fidèles quel que soit le nom d'affichage ; plus de fuite de sentinelle ; helper SSOT
prêt à être adopté par tout futur gabarit à token.

## Implementation complexity

Très faible : +1 fichier util (1 fonction), +1 import, 2 sites re-câblés, +10 tests helper, +2 tests
EmailService (RED→GREEN).

## Validation criteria

- **RED prouvé** (production non corrigée) : les 2 tests EmailService échouent — nom mutilé, token
  `{sender}`/`{accepter}` fuité.
- **GREEN** : helper 10/10, suite `EmailService` 82/82, `tsc --noEmit` gateway 0 erreur (après build
  `@meeshy/shared`).

## Future Considerations

- **Règle lint** interdisant `String.prototype.replace(x, <var string>)` au profit de `replaceLiteral`
  (SSOT applicable) — bloquée tant que le gateway n'est pas migré vers `eslint.config.js` (flat config ;
  l'env actuel casse sur ESLint 10 + `.eslintrc` legacy). Candidat d'une itération d'outillage dédiée.
- **Adoption progressive** de `replaceLiteral` par `MessagingService`/`TrackingLinkService` (qui
  utilisent des `() => value` inline) pour converger vers un unique SSOT nommé.
