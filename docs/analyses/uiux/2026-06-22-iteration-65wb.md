# Analyse UI/UX — Itération 65wbb (web)

## Contexte de continuité
- Base : `main` HEAD post-merge collision storm 65wb (`ConversationSettingsModal`, agent `s5hyhl`).
- **Collision de numérotation** : un agent web parallèle a aussi pris « 65wb » (mergé en premier
  sur `main`). Mon itération est **renumérotée 65wbb** ; les docs `65wb` canoniques de `main`
  (ConversationSettingsModal) sont conservés tels quels.
- Surface choisie **strictement orthogonale** à toutes les PR récentes (#858/#859/#860/#861/#862/#863
  et le 65wb de `s5hyhl`) : la **page de détails d'un lien de tracking**
  `app/links/tracked/[token]/page.tsx` (destination de navigation depuis `/links#tracked`).

## Classe d'anti-pattern ciblée
`t('key') || 'fallback'` (`use-i18n.ts` renvoie la clé brute truthy quand la clé est absente
→ le `||` court-circuite dessus → l'utilisateur voit la **clé brute** ; et quand la clé existe,
le fallback est du **dead-code**). Suite du différé 60w+.

## ⚠️ C'était un VRAI bug, pas seulement du dead-code
Sur les **15 occurrences** de l'anti-pattern dans ce fichier, **7 clés étaient totalement absentes**
des 4 locales (`tracking.errors.{authRequired, unauthorized, notFound, authRequiredTitle,
authRequiredDesc, unauthorizedTitle, unauthorizedDesc}`). Conséquence en production :

- **Toasts** d'erreur auth/403/404 → affichaient la **clé brute** littérale
  (`tracking.errors.authRequired`, etc.) à TOUS les utilisateurs.
- **Écran d'erreur plein cadre** (titre + description) pour les cas « authentification requise »
  et « accès refusé » → **clé brute** affichée en titre/description.

Les 8 autres occurrences pointaient des clés **déjà présentes** ×4 (dead-code + flash-of-raw-keys).

## Fichiers audités & corrigés

| Fichier | Namespace | Occ. corrigées | Nature avant | Après |
|---------|-----------|----------------|--------------|-------|
| `app/links/tracked/[token]/page.tsx` | links | 15 (`t()\|\|fb`) + 1 FR figé + 2 labels FR | clés absentes (clé brute) / dead-code / `Une erreur inattendue…` / `{n} clics`/`{n} uniques` | `t(key, 'EN')` (anti-flash, leçon 50w) ; FR figé → `tracking.details.unexpectedError` ; labels → `tracking.details.{clicksCount,uniqueCount}` (interpolation `{count}` existante) |

## Clés locales
**Ajoutées ×4 locales (fr/en/es/pt)** — 8 nouvelles clés :
`links.tracking.errors.{authRequired, unauthorized, notFound, authRequiredTitle, authRequiredDesc,
unauthorizedTitle, unauthorizedDesc}` + `links.tracking.details.unexpectedError`.

**Réutilisées (déjà ×4)** : `tracking.details.{linkNotFound, linkNotFoundDescription, backToLinks,
clicksCount, uniqueCount}`, `tracking.errors.statsFailed`.

## Décisions
- Fallback EN exact en 2ᵉ argument (leçon 50w) ; anciens fallbacks FR figés = rupture Prisme.
- `clicksCount`/`uniqueCount` réutilisent l'interpolation `{count}` déjà présente ×4 → 0 clé neuve.
- `errorMessage.includes('non trouvé')` (branchement backend) + commentaires FR internes intacts.

## Vérifications
- `grep` anti-pattern `t()||` = 0 ; `grep` FR user-facing = 0 (hors backend-error + commentaires).
- 4 `links.json` valides (`jq empty`), append-only, parité 14 clés `tracking.errors` ×4.
- Tests `__tests__/app/links/tracked/token/page.test.tsx` : 30 passed / 8 skipped, inchangés.

## ✅ SOLDÉ en 65wbb — NE PLUS re-flagger
- `app/links/tracked/[token]/page.tsx` (anti-pattern `t()||fb`, FR figé `unexpectedError`,
  labels `clics`/`uniques`).
- `links.tracking.errors.{authRequired, unauthorized, notFound, authRequiredTitle, authRequiredDesc,
  unauthorizedTitle, unauthorizedDesc}` + `links.tracking.details.unexpectedError`.
