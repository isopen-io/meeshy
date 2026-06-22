# Plan — Itération 59w (web) : accessibilité i18n des saisies OTP

## Objectif
Internationaliser et compléter les labels d'accessibilité des **4 saisies de code
OTP** des flows d'authentification (récupération, reset téléphone, vérification
téléphone, vérification 2FA). Surface orthogonale au cluster feed/reels en forte
contention (agents parallèles).

## Base de départ
- Branche : `claude/practical-fermat-se47fi`, resynchronisée sur `main` HEAD
  `98f2ce5` (post-merge #666/#774/#776).

## Étapes
1. **i18n** — Ajouter bloc `auth.otp` (2 clés) dans `locales/{en,fr,es,pt}/auth.json` :
   - `groupLabel` : "{length}-digit verification code" (+ FR/ES/PT)
   - `digitLabel` : "Digit {index} of {total}" (+ FR/ES/PT)
   - Insertion additive après `"auth": {` (diff minimal, round-trip JSON validé). ✅
2. **`components/auth/recovery/OTPInput.tsx`** — import + `useI18n('auth')` ;
   remplacer les 2 `aria-label` FR figés par `t('otp.groupLabel'/'otp.digitLabel')`. ✅
3. **`components/auth/PhoneResetFlow.tsx`** — `useI18n('auth')` dans l'`OTPInput`
   inline ; remplacer les 2 `aria-label` FR figés. ✅
4. **`app/auth/verify-phone/page.tsx`** — `useI18n('auth')` dans l'`OTPInput`
   inline ; **ajouter** `role="group"` + 2 `aria-label` + `autoComplete="one-time-code"`. ✅
5. **`app/auth/verify-2fa/page.tsx`** — idem (length variable via prop). ✅

## Vérification
- Grep FR résiduel (`Chiffre `/`Code de vérification`) → vide. ✅
- JSON valide ×4 locales, parité 2 clés. ✅
- Interpolation `{length}`/`{index}`/`{total}` confirmée (`use-i18n.ts`). ✅
- Typecheck/build délégué au CI (`node_modules` absent en routine).

## Hors périmètre (différé)
- `config-modal.tsx` (libellés onglets FR) → 60w.
- `PhoneResetFlow.tsx:490` `sr-only` `Indicatif pays`.
- `AttachmentPreviewReply.tsx` title/aria FR.
- feed/reels → agents parallèles.

## Merge
PR vers `main` ; après merge, mettre à jour `branch-tracking.md` + supprimer la branche.
</content>
