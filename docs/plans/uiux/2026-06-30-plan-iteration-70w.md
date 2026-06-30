# Plan — Itération 70w (web)

**Surface** : `components/auth/PhoneResetFlow.tsx` (flux reset mot de passe par téléphone)
**Classe** : anti-pattern i18n `t('clé') || 'fallback FR'` + clé EN manquante (rupture Prisme)

## Étapes
1. [x] Audit parité locales `auth.phoneReset.*` / `auth.otp.*` (en/fr/es/pt) → `identityHint` manquante en EN.
2. [x] Ajouter `phoneReset.identityHint` à `en/auth.json` (insertion chirurgicale, parité rétablie).
3. [x] Convertir les 56 `t('clé') || 'FR'` → `t('clé', 'EN exacte')` (anti-flash, leçon 50w).
4. [x] Mettre à jour le commentaire interne périmé (`French fallbacks` → `English fallbacks`).
5. [x] Vérifs : grep anti-pattern = 0, grep FR = 0, symdiff JSON = 0, test jest 39/39.
6. [ ] Commit + push branche + PR + CI vert → merge `main`.

## Garde-fous
- Orthogonal aux PR en vol #1084 (create-link) / #1077 (verify-phone) / #1081 (shared).
- Valeurs de secours = valeur EN mot pour mot (anti-incohérence).
- Aucune nouvelle clé hors `identityHint` ; pas de reformat des locales.
