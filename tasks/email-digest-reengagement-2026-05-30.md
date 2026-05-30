# Tâche — Spec e-mail digest → réengagement magic-login (2026-05-30)

**Statut** : spec rédigée, EN ATTENTE de validation utilisateur avant tout code.
**Décision produit actée** : magic-login **1 clic** + **écrire la spec d'abord** (pas d'implémentation).

## Livrable
- `docs/superpowers/specs/2026-05-30-email-digest-reengagement-magic-login-design.md`

## Résumé
Migrer le digest e-mail du soir (18:00 UTC, `jobs/notification-digest.ts` →
`EmailService.sendNotificationDigestEmail`) d'un digest passif (qui dévoile
acteur+aperçu, CTA `/notifications` non authentifié) vers un e-mail de
réengagement **teaser** + **CTA magic-login 1 clic** qui reconnecte (JWT 7 j)
et deep-link vers la conversation.

Cœur technique : jeton magic-login mirror du password-reset MAIS **hashé**
(`magicLoginTokenHash`/`magicLoginExpires`/`magicLoginUsedAt`), TTL 24 h, usage
unique atomique, endpoint `POST /api/v1/auth/magic` (no-leak, rate-limit,
sanitizeRedirect anti-open-redirect), page web POST (anti-préchargement mail),
List-Unsubscribe RFC 8058, UTM.

## Corrections vs brief initial (ancré sur le vrai code, vérifié verbatim)
- ❌ Pas de faille XSS `userName`/`actorName` : `escapeHtml` est DÉJÀ appliqué
  (EmailService.ts:1665-1695).
- Vrais noms : `sendNotificationDigestEmail`, `jobs/notification-digest.ts`.
- ❌ Le password-reset n'est PAS des champs sur `User` : c'est une **table
  dédiée hashée `PasswordResetToken`** (`tokenHash`/`expiresAt`/`usedAt`/
  `isRevoked` + métadonnées) + job `cleanup-expired-tokens.ts`. → la spec
  recommande désormais un **modèle dédié `MagicLoginToken`** (mirror exact),
  PAS 3 champs sur User. TTL reset = 15 min (pas 1 h).
- ❌ `send()` ne supporte PAS `headers` custom (Brevo/SendGrid/Mailgun figés
  via axios) → List-Unsubscribe EXIGE d'étendre `EmailData.headers` + les 3
  transports. Corrigé dans la spec.
- Web = Next.js **App Router** ; mirror = `apps/web/app/reset-password/page.tsx`
  (`useSearchParams` + `buildApiUrl` + `passwordResetService`). Page cible :
  `apps/web/app/auth/magic/page.tsx` + `magicLoginService`.
- Rate-limit = limiters Redis maison en `preHandler` (mirror login.ts), pas
  `@fastify/rate-limit` direct.

## Points ouverts (cf. §11 de la spec)
1. Routeur web (App vs Pages) + page reset-password à mirrorer — reco Phase 0.
2. Transfert d'e-mail = accès session : accepter 1 clic ou page de confirmation ?
3. Token de désinscription dédié vs scoppé.
4. TTL 24 h vs 12 h.
5. Suppression totale de la liste vs teaser partiel.

## Prochaine étape
Attendre l'arbitrage utilisateur sur les points ouverts, puis implémenter en
TDD selon le plan §9 (Phase 0 reco → 1 schema/service → 2 endpoint → 3 page →
4 e-mail → 5 job → 6 désinscription → 7 mesure/rollout).
