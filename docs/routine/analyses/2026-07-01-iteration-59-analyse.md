# Iteration 59 — Analyse d'optimisation (2026-07-01)

## Contexte
Continuité directe de l'iter 58. La note de continuité désignait explicitement le prochain grain :
« composants *countdown/expiry* (sémantique **future**, source unique distincte à créer) ». Trois
scouts parallèles (countdown/expiry, slug/sanitize, formatage/bande passante) ont confirmé cette piste
comme la plus propre et la plus « provable ».

## Constat — réimplémentations locales du « temps restant avant expiration »

Le cluster **temps relatif passé** possède déjà sa source unique (`classifyRelativeTime`, iter 43→58).
Le cluster symétrique **temps restant (futur)** — utilisé pour le compte à rebours d'expiration des
stories (TTL 24 h) — est **réimplémenté à l'identique dans trois endroits** :

| Cible | Fonction | Sortie non-expirée | Cas expiré |
|-------|----------|--------------------|-----------|
| `apps/web/lib/story-transforms.ts:363` | `timeRemaining(expiresAt)` | `Xm` / `XhYm` / `Xh` | `null` |
| `apps/web/components/v2/StoryViewer.tsx:847` | IIFE inline | `Xm` / `XhYm` / `Xh` | `null` (rend rien) |
| `apps/web/components/v2/StatusBar.tsx:38` | `getTimeRemaining(expiresAt)` | `Xm` / `XhYm` / `Xh` | `'Expire'` |

Arithmétique identique dans les trois :
```
diff = new Date(expiresAt).getTime() - Date.now()
minutes = floor(diff / 60000) ; hours = floor(minutes / 60)
hours >= 1 → `${hours}h${minutes%60 > 0 ? `${minutes%60}m` : ''}` ; sinon `${minutes}m`
```

### Équivalence de comportement (non-régression prouvée)
- La **sortie non-expirée est byte-identique** dans les trois (même arrondi entier imbriqué, même
  format `Xh`, `XhYm`, `Xm`).
- Seul le **cas expiré diffère** : `story-transforms`/`StoryViewer` → `null` ; `StatusBar` → `'Expire'`.
- Un canonique retournant `string | null` (`null` quand `diff <= 0`) capture les trois : `StatusBar`
  ajoute simplement `?? 'Expire'` au site d'appel.
- Tests existants verrouillant la sortie : `story-transforms.test.ts` + `story-transforms-extended.test.ts`
  (`null` expiré, `30m`, `1h30m`, `2h`). Le wrapper délégant conserve ces assertions vertes.

### Problèmes (cohérence + état de l'art)
1. **Triple réimplémentation** de la même arithmétique de compte à rebours.
2. **Asymétrie** : le passé a `classifyRelativeTime` (pur, `now` injecté, testé) ; le futur n'a rien.
3. **Risque de dérive** de format (`2h` vs `2h0m`, seuil `>= 1 h`) répliqué N×.

## Décision iter 59 — lot « Source unique — temps restant avant expiration (F28) »
Créer le canonique **pur** `formatTimeRemaining(targetMs, nowMs): string | null` dans
`packages/shared/utils/time-remaining.ts` (miroir de `classifyRelativeTime` : `now` injecté, déterministe,
trivialement testable). Converger les trois réimplémentations dessus sans changer la sortie visible.

## Baseline runner (parité CI)
- `bun install` OK ; `prisma generate` OK ; `packages/shared` build OK (dist présent).
- `packages/shared` : vitest (`__tests__/utils/`).
- `apps/web` : jest. Tests `timeRemaining` existants verts (baseline).

## Consignés pour itérations futures (issus des 3 scouts)

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F29 | Génération de slug/identifiant réimplémentée 6× (web + gateway) avec suffixes divergents (timestamp vs hex) | MOYEN | Sorties **non identiques** → non-régression non triviale |
| F30 | `EmailService.escapeHtml` (gateway) omet l'échappement de `'` — vecteur XSS en attribut simple-quote | HAUT (sécurité) | Correction réelle ; risque snapshots email → itération dédiée |
| F31 | `sanitizeJson`/`sanitizeUsername` dupliqués à l'identique web `xss-protection.ts` ↔ gateway `sanitize.ts` → promouvoir dans `@meeshy/shared` | MOYEN | Traverse les frontières de package |
| F32 | Formatage d'octets : `media-compression.ts` + `AttachmentDetails.tsx` réimplémentent le canonique `formatFileSize` (`@meeshy/shared/types/attachment`) à l'identique (<1 To) | FAIBLE | Cluster propre — candidat iter 60 |
| F33 | `formatClock` (durée) réimplémenté 8-10× dans web (`formatDuration` locaux) | MOYEN | Grand lot ; seuils/format à auditer par fichier |
| F34 | Constantes TTL magiques (`24*60*60*1000`, `7j`) éparpillées → `time-constants.ts` | FAIBLE | Balayage large |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |

## Gain
Cluster **temps restant (futur)** unifié sur une source unique pure et testée, symétrique de
`classifyRelativeTime` pour le passé. Plus aucune réimplémentation manuelle du compte à rebours
d'expiration dans `apps/web`. Prochain grain candidat : F32 (octets) ou F33 (durée), tous deux avec
canonique déjà existant.
