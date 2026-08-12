# Itération 64wb — Analyse UI/UX (web)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web`) UNIQUEMENT
**Surface** : page d'authentification Magic Link `app/auth/magic-link/page.tsx`
**Classe de défaut** : anti-pattern i18n systémique `t('clé') || 'fallback'` (cf. clusters 60w/60wb/61w/62w/63w)

## Revue préalable (doublons & couverture)

- **Doublons d'analyses** : `docs/analyses/uiux/` contient 60+ fichiers. Aucun doublon de contenu détecté pour cette surface — `app/auth/magic-link/page.tsx` n'apparaît dans AUCUNE analyse/plan antérieur. Les 10 fichiers `components/auth/**` du cluster 60wb (#808) **excluent** explicitement `magic-link/page.tsx` (sous `app/auth/`, pas `components/auth/`).
- **Couverture des PR en vol** (vérifiée via `list_pull_requests` le 2026-06-22) : 6 PR web ouvertes (#852 details-sidebar, #853 audio-effects tiles, #854 /me profile, #855 _archived removal, #857 banners, #858 voice-profile tooltip iter-64w). **Aucune** ne touche `magic-link`. Surface orthogonale confirmée.
- **Plans complets ?** Le gros cluster `t()||fallback` (~40 fichiers restants documentés en 60w/60wb) reste ouvert et se résorbe par lots bornés orthogonaux. Cette itération en solde un lot self-contained majeur (44+ occurrences sur une seule page).

## Constat

`app/auth/magic-link/page.tsx` (page de connexion sans mot de passe, surface d'**entrée** auth) accumule **46 occurrences** de l'anti-pattern `t('clé') || 'fallback FR'`.

Double défaut, identique au cluster déjà soldé (leçon 50w) :
1. **Code mort** : `use-i18n.ts` retourne `fallback || key` — sans 2e argument, `t('clé')` renvoie la **clé brute** (truthy), donc le secours `|| 'fallback'` n'est JAMAIS atteint.
2. **Flash de clé brute / rupture Prisme** : pendant le chargement async du namespace ou si une clé manque, la **clé brute** (`magicLink.title`) s'affiche au lieu d'un texte lisible. Les fallbacks étaient en **français figé** → rupture Prisme pour un utilisateur EN/ES/PT.

### Bug réel détecté (au-delà de l'anti-pattern mécanique)
Vue « Magic Link bloqué » : `t('featureGate.backToHome') || 'Retour à l'accueil'`. La clé `featureGate.backToHome` vit dans le namespace **`common`**, pas `auth` (hook `useI18n('auth')`). Elle ne résout donc JAMAIS → la **chaîne brute `featureGate.backToHome`** s'affichait sur le bouton « Retour à l'accueil ». Bug visible, jamais signalé.

## Correctif appliqué

- **45 occurrences** `t('clé') || 'FR'` → `t('clé', 'EN exacte du locale')`. Valeurs EN reprises **mot pour mot** des locales `en/auth.json` existantes (anti-flash + anti-incohérence). Les clés `auth.magicLink.*`, `auth.register.*`, `auth.login.rememberDevice` existent déjà ×4 locales (en/fr/es/pt) — **0 clé manquante** sur ce lot.
- **2 occurrences à paramètres** (`expiresIn {time}`, `retriesRemaining {count}`) : le `||` était mort ET illégal (signature `t(key, paramsOrFallback)` exclusive) → suppression du fallback ; l'interpolation fonctionne via les clés existantes.
- **1 bug `featureGate.backToHome`** → nouvelle clé `auth.magicLink.backToHome` ajoutée ×4 locales (EN « Back to Home », FR « Retour à l'accueil », ES « Volver al inicio », PT « Voltar para o início ») + référence corrigée `t('magicLink.backToHome', 'Back to Home')`.

Diff : 1 fichier composant + 4 locales (1 ligne chacune, insertion chirurgicale préservant le formatage d'origine). `grep` anti-pattern résiduel = **0** sur le fichier.

## Vérifications

- `grep` final `t(...)\s*\|\|` sur le fichier = 0 (le `result.error || t(...)` légitime conservé — ce n'est PAS l'anti-pattern).
- JSON ×4 valides ; clé `backToHome` présente partout.
- Aucun test n'assert sur les chaînes FR retirées (`account-recovery-modal.test.tsx` mocke `t` pour un AUTRE composant — non impacté).
- Échappement des apostrophes EN vérifié (`We\'ve`, `Can\'t`, `we\'ll`).
- Parité dark mode / a11y / gestes : page déjà conforme (dark variants partout, `aria-hidden` sur icônes décoratives, blobs animés `motion`). Aucune régression — seule la couche i18n change.

## Statut : ✅ COMPLÈTE & CORRIGÉE

**NE PLUS re-flagger** `app/auth/magic-link/page.tsx` pour l'anti-pattern `t()||fallback` ni la clé `auth.magicLink.backToHome`. Surface entièrement internationalisée et anti-flash.
