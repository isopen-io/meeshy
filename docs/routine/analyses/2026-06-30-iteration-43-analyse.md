# Iteration 43 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 42 (lot « Source unique du formatage de durée — F18 », mergé dans `main` :
commit `ee17b02`, `packages/shared/utils/duration-format.ts:formatClock` consommé par
`call-summary.ts` (shared), `NotificationService.ts` (gateway), `use-call-duration.ts`
+ `audio-formatters.ts` (web)). Le plan iter 42 désigne explicitement **F18b**
(unification des formateurs de **date/temps relatif** → `packages/shared`, i18n-aware)
comme « le prolongement naturel de F18 une fois le couplage `t()`/locale cadré ».

Audit relancé du spectre récent → ancien. Surfaces testables sur ce runner Linux :
- **shared vitest** : baseline **1190/1190 vert** (gate bloquante).
- **web jest** : opérationnel (`notification-helpers.test.ts` **73/73 vert**).
- gateway jest : `prisma generate` requiert un téléchargement réseau bloqué ici ; **mais
  F18b ne touche pas le gateway** (aucun formatage de date relatif côté serveur — vérifié).
- iOS/SDK : non testables ici.

## Audit — constat vérifié (F18b)

### Réimplémentation × 3 du même algorithme de classification « temps écoulé »
Trois fonctions web réimplémentent **le même algorithme** de classification d'un délai
écoulé (`now / minutes / hours / days / au-delà`) avec un découpage de seuils **identique**
(< 1 min, < 60 min, < 24 h, < 7 j, puis date absolue), seules les **clés i18n** et le
**rendu de queue** diffèrent :

| # | Fichier | Signature | Clés i18n | Queue (≥ seuil) |
|---|---------|-----------|-----------|-----------------|
| 1 | `apps/web/utils/notification-helpers.ts:207` `formatNotificationTimeAgo` | `(ts, t, locale)` | `timeAgo.now/minute/hour/day` (`.replace('{count}',…)`) | `toLocaleDateString(locale,{day:'numeric',month:'short'})` à ≥ 7 j |
| 2 | `apps/web/utils/v2/transform-conversation.ts:24` `formatRelativeTime` (privée) | `(date, t, locale)` | `timeCompact.now/minutes/hours/days` (`{count}`) | `toLocaleDateString(locale,{day,month:'short'})` à ≥ 7 j |
| 3 | `apps/web/components/feed/PostsFeedScreen.tsx:43` `formatRelativeTime` (locale) | `(date, t)` | `time.now/minutes/hours/days` | **pas de plafond** : `days` au-delà de 24 h |

Équivalence arithmétique vérifiée : `floor(floor(diffMs/60000)/60) === floor(diffMs/3_600_000)`
et `floor(floor(…)/24) === floor(diffMs/86_400_000)` — les trois calculent donc exactement
les mêmes paliers, à la seule variante du plafond hebdomadaire (#3 = ∞).

C'est une violation directe du principe **Single Source of Truth** (CLAUDE.md : « Each data
type has ONE source. No reimplementation ») et de la règle de pureté SDK (le **building
block** stateless — la classification — doit être partagé ; la **présentation i18n** reste
app-side). État de l'art : une fonction pure `classifyRelativeTime(targetMs, nowMs, opts)`
qui retourne un **bucket discriminé**, chaque site rendant ses propres chaînes via son `t()`.
Impact MOYEN (pureté/unification), couvert par la gate bloquante (vitest) + web jest,
**comportement préservable octet pour octet** (chaque site garde ses clés et sa queue) →
risque FAIBLE.

### Écarté de ce lot (hétérogène — reporté F18c)
- `formatRelativeDate` / `formatConversationDate` (`date-format.ts`) : logique **calendaire**
  (différence à minuit) + queue « jour de semaine + heure » et « hier HH:mm » — découpage
  distinct (hybride elapsed/calendaire). Refactor à part avec revue locales.
- `formatContentPublishedAt` (`notification-helpers.ts:238`) : gère le **futur**, des
  frontières calendaires (`startOfToday`/`startOfYesterday`) et un format absolu jour+heure —
  trop spécifique pour le bucket commun.
- `formatRelativeDate` (`FriendRequestCard.tsx:34`) : granularité **jours uniquement** —
  consommable par le bucket mais buckets distincts ; inclus seulement si risque nul.

## Décision iter 43 — lot « Source unique de la classification temps-relatif (F18b) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Créer `packages/shared/utils/relative-time.ts` : `classifyRelativeTime(targetMs, nowMs, { beyondDays? })` pur → union `RelativeTimeBucket` (`now`/`minutes`/`hours`/`days`/`beyond`) ; TDD vitest ; exporté du barrel `utils` | Pureté / SSOT — gate bloquante shared |
| B | Web : `formatNotificationTimeAgo`, `transform-conversation.ts:formatRelativeTime`, `PostsFeedScreen.tsx:formatRelativeTime` délèguent au bucket (clés + queue + plafond préservés via options) | Dédup ; web jest |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F18c | Unifier les formateurs **calendaires** (`formatRelativeDate`, `formatConversationDate`, `formatContentPublishedAt`, `FriendRequestCard`) → shared, avec helper calendaire (midnight/yesterday) | MOYEN | Découpage hybride elapsed/calendaire + queues hétérogènes ; revue locales |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit sémantique + backfill |
| F23 | `getUnreadCountsForParticipants` N counts → agrégation mono-requête | MOYEN (BP) | `floor` par participant ; risque sur donnée visible |

## Gain estimé global
Élimination de **3 réimplémentations** du même algorithme de classification temps-écoulé au
profit d'un building block pur, testé et partagé dans `packages/shared` — conformité Single
Source of Truth + pureté SDK (classification partagée / présentation i18n app-side), sortie
préservée octet pour octet sur chaque site appelant. Couvert par la gate bloquante shared
(vitest) + web jest (`notification-helpers` 73/73).
