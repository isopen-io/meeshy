# Spec — Migration du digest e-mail du soir vers un e-mail de réengagement (magic-login 1 clic)

- **Date** : 2026-05-30
- **Auteur** : Claude (session magic-login digest)
- **Statut** : Proposé — à valider avant implémentation
- **Décision produit actée** : magic-login **1 clic** (le lien connecte directement, JWT posé, deep-link vers la conversation). Friction zéro assumée ; mitigations sécurité ci-dessous.

---

## 1. Contexte & objectif

### 1.1 État actuel (vérifié dans le code)

| Élément | Fichier / valeur réelle |
|---|---|
| Planificateur | Classe `NotificationDigestJob` (`services/gateway/src/jobs/notification-digest.ts`) — `start()` pose `setTimeout`→`setInterval(24h)`, `TARGET_HOUR_UTC = 18`, `BATCH_SIZE = 50`, `BATCH_DELAY_MS = 1000`, `MAX_NOTIFICATIONS_IN_EMAIL = 5` |
| Sélection users | `doWork()` → `prisma.notification.findMany({ where: { isRead: false }, select: { userId, delivery } })` puis **filtrage applicatif** `isNotYetEmailed(delivery)` (lit `delivery.emailSent` du JSON) → `Map<userId, count>`. PAS de `groupBy` SQL. |
| Envoi par user | `processUser(userId, unreadCount)` — skip si `userPreferences.notification.emailEnabled === false` ; `findMany` notifs `isRead:false`, re-filtre `isNotYetEmailed`, `slice(0, MAX_NOTIFICATIONS_IN_EMAIL)` ; après succès, `notification.updateMany({ data: { delivery: { emailSent:true, emailSentAt, pushSent:false } } })` (idempotence via le JSON `delivery`) |
| Rendu HTML | `EmailService.sendNotificationDigestEmail(data: NotificationDigestEmailData)` (`EmailService.ts:1657`) — HTML inline |
| i18n | `getDigestTranslations(lang)` (`EmailService.ts:1768`) — **déjà** fr/en/es/pt/it/de ; `lang = user.systemLanguage \|\| 'en'` (résolu dans le job) |
| Sujet (fr) | `Vous avez {count} notifications non lues - Meeshy` |
| Contenu | Liste top 5 : `actorName` + `content` + `formatTimeAgo` (révèle tout) |
| **CTA actuel** | `<a href="${data.markAllReadUrl}">` = `${frontendUrl}/notifications?markAllRead=true` — **lien nu, aucune auth**. `frontendUrl = process.env.FRONTEND_URL \|\| 'https://meeshy.me'` (`EmailService.ts:727`) |
| Footer | `data.settingsUrl` = `${frontendUrl}/settings#notifications` |
| Sécurité HTML | `escapeHtml()` **est déjà appliqué** à `actorName`, `content`, `userName`. ⚠️ Contrairement au brief initial, **il n'y a PAS de faille XSS** sur ces champs aujourd'hui — ne pas « corriger » un bug inexistant. |
| Tracking | pixel `${frontendUrl}/l/meeshy-emails?...` injecté par `send()` |
| Transport | `sendEmail({ to, subject, html, text, trackingType?, trackingLang? })` → Brevo → SendGrid → Mailgun (fallback). ⚠️ **PAS** de headers custom : `EmailData` n'a pas de champ `headers` et les 3 `sendVia*` figent leurs payloads axios → `List-Unsubscribe` exige d'étendre le transport (cf. §7) |

### 1.2 Problème produit

L'e-mail **dévoile déjà tout le contenu** (expéditeur + aperçu). L'utilisateur lit le digest et n'a **aucune incitation à ouvrir l'app**. Le CTA n'authentifie pas → atterrissage sur le login → friction → abandon.

### 1.3 Objectif

Transformer le digest **passif** en e-mail de **réengagement teaser** :
1. **Réduire le contenu révélé** (créer curiosité / manque) — on annonce *qu'il se passe quelque chose*, sans livrer le message.
2. **CTA magic-login 1 clic** : le lien reconnecte automatiquement (JWT 7 j existant) et **deep-link** vers la (ou les) conversation(s) concernée(s).

### 1.4 Non-objectifs

- Pas de refonte du planificateur (horaire, batching, idempotence inchangés).
- Pas de changement du transport e-mail (Brevo/SendGrid/Mailgun).
- Pas de magic-login pour le flux de **partage de conversation** (couvert par `MagicLinkService`, hors périmètre).

---

## 2. Cœur technique — jeton magic-login

### 2.1 Choix de stockage : table dédiée `MagicLoginToken` (mirror exact du password-reset)

**Correction (post-vérification du code réel)** : contrairement à l'hypothèse initiale, le repo **ne** stocke **pas** les tokens de reset sur le modèle `User`. Il utilise une **table dédiée hashée** `PasswordResetToken` (`packages/shared/prisma/schema.prisma`) :

```prisma
model PasswordResetToken {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  userId        String    @db.ObjectId
  tokenHash     String    @unique   // SHA-256 (JAMAIS le token brut)
  expiresAt     DateTime            // 15 min
  usedAt        DateTime?           // null = inutilisé
  isRevoked     Boolean   @default(false)
  revokedReason String?
  ipAddress     String?
  userAgent     String?
  // … metadata anomalie
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId]) @@index([expiresAt])
}
```

Sur `User` : seulement la relation (`passwordResetTokens PasswordResetToken[]`). Un **job de purge** existe déjà (`services/gateway/src/jobs/cleanup-expired-tokens.ts`).

**Décision** : mirror **exact** de cette convention → nouveau modèle dédié `MagicLoginToken` (et NON des champs sur `User`). C'est la convention maison et ça gère nativement le multi-token (plusieurs envois sans écraser un token encore valide).

```prisma
model MagicLoginToken {
  id         String    @id @default(auto()) @map("_id") @db.ObjectId
  userId     String    @db.ObjectId
  tokenHash  String    @unique   // SHA-256 du token brut
  redirect   String?             // deep-link interne validé (cf. §3.1)
  expiresAt  DateTime            // +24 h (cf. §2.2)
  usedAt     DateTime?           // null = neuf ; non-null = consommé (usage unique)
  ipAddress  String?             // IP de consommation (anomalie)
  userAgent  String?
  createdAt  DateTime  @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId]) @@index([expiresAt])
}
```
+ relation `magicLoginTokens MagicLoginToken[]` sur `User`, + étendre `cleanup-expired-tokens.ts` pour purger aussi cette table.

### 2.2 Durée de vie : **24 h**

L'e-mail part à 18:00 UTC ; un utilisateur peut l'ouvrir le lendemain matin. 24 h couvre l'usage décalé sans laisser un lien de session traîner indéfiniment. (Le password-reset est à **15 min** car plus sensible et déclenché à la demande ; ici c'est un envoi proactif consommé en différé — d'où le TTL plus long. Voir point ouvert §11.4 si on veut réduire à 12 h.)

### 2.3 Génération & consommation — `AuthService`

```ts
// services/gateway/src/services/AuthService.ts
import crypto from 'crypto';

private static hashMagic(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Génère un magic token, persiste son hash dans MagicLoginToken, renvoie le token EN CLAIR. */
async generateMagicLoginToken(userId: string, redirect?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex'); // 256 bits
  await this.prisma.magicLoginToken.create({
    data: {
      userId,
      tokenHash: AuthService.hashMagic(token),
      redirect: redirect ?? null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

/** Valide + consomme (usage unique). Renvoie null sur tout échec (pas de leak de la raison). */
async consumeMagicLoginToken(token: string, ctx?: { ip?: string; ua?: string })
  : Promise<{ jwt: string; user: User; redirect: string | null } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = AuthService.hashMagic(token);
  // Consommation atomique : ne marquer usedAt que si encore non-utilisé ET non-expiré.
  const claimed = await this.prisma.magicLoginToken.updateMany({
    where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), ipAddress: ctx?.ip ?? null, userAgent: ctx?.ua ?? null },
  });
  if (claimed.count !== 1) return null; // invalide / expiré / déjà consommé (course perdue)
  const record = await this.prisma.magicLoginToken.findUnique({
    where: { tokenHash: hash }, include: { user: true },
  });
  if (!record?.user) return null;
  return { jwt: this.generateToken(record.user.id), user: record.user, redirect: record.redirect };
}
```

Notes :
- `tokenHash` est `@unique` indexé → lookup O(1). Le secret n'est jamais comparé en clair côté app (le risque timing porte sur un hash, pas sur le token).
- **Usage unique atomique** : `updateMany … where { usedAt: null, expiresAt: { gt: now } }` est le CAS — il échoue (count 0) si le token est déjà consommé/expiré, protégeant contre la double-consommation concurrente (préchargement client mail + clic réel).
- Le `redirect` validé est stocké **avec le token** (et non passé en query par l'e-mail) : ça referme la surface open-redirect côté génération plutôt que côté consommation. Le query param `redirect` de l'URL devient alors redondant/optionnel — décider en impl (cf. §3.1).

---

## 3. Endpoint de consommation — `POST /api/v1/auth/magic`

Ajouté dans le routeur auth (préfixe `/api/v1/auth`). Le repo utilise des **rate-limiters Redis maison** appliqués en `preHandler` (cf. `createLoginRateLimiter`, `createAuthGlobalRateLimiter` dans `routes/auth/login.ts` / `password-reset.ts`) — mirrorer ce pattern, pas `@fastify/rate-limit` directement. Réponses via `sendSuccess`/`sendError` (`utils/response.ts`).

```ts
fastify.post<{ Body: { token: string } }>(
  '/magic',
  { preHandler: [magicLoginRateLimiter.middleware(), authGlobalRateLimiter.middleware()] },
  async (request, reply) => {
    const { token } = request.body ?? {};
    if (!token || typeof token !== 'string') {
      return sendError(reply, 'INVALID_INPUT', 'Token requis', 400);
    }
    // redirect provient du token (validé à la génération), pas du body → pas d'open-redirect ici.
    const result = await authService.consumeMagicLoginToken(token, {
      ip: request.ip,
      ua: request.headers['user-agent'],
    });
    if (!result) {
      // Réponse UNIQUE quel que soit le motif (invalide / expiré / déjà utilisé) — pas de leak.
      return sendError(reply, 'INVALID_TOKEN', 'Lien invalide ou expiré', 400);
    }
    await prisma.user.update({
      where: { id: result.user.id },
      data: { lastSeen: new Date(), isOnline: true },
    });
    return sendSuccess(reply, {
      token: result.jwt,                       // JWT 7 j (generateToken existant)
      user: formatUserResponse(result.user, permissions), // helper existant (routes/auth/types.ts) — résoudre `permissions` comme login.ts
      redirect: sanitizeRedirect(result.redirect), // borné chemins internes (§3.1)
    });
  },
);
```

### 3.1 Garde-fou open-redirect

`sanitizeRedirect` n'autorise **que des chemins internes** (`/conversations/...`) — rejette toute URL absolue (`http://`, `//evil`) pour éviter qu'un lien e-mail trafiqué ne redirige hors-domaine après login.

```ts
function sanitizeRedirect(r?: string): string {
  if (!r || !r.startsWith('/') || r.startsWith('//')) return '/conversations';
  return r;
}
```

### 3.2 Validations sécurité (récap)
- Format token `^[a-f0-9]{64}$` (rejet précoce).
- Rate-limit Redis maison en `preHandler` (mirror des autres routes auth).
- Réponse d'échec **indifférenciée** (pas de distinction invalide/expiré/utilisé).
- Usage unique atomique (`magicLoginToken.updateMany … where { usedAt: null, expiresAt: { gt: now } }`).
- `redirect` validé à la génération + re-borné aux chemins internes à la consommation.

### 3.3 Page web de consommation

L'e-mail pointe vers une page web `apps/web/app/auth/magic/page.tsx` qui fait un **POST** (jamais la consommation au simple GET — voir §6 préchargement), stocke le JWT, puis `window.location = redirect`.

**Mirror confirmé** (vérifié) : `apps/web` est en **Next.js App Router**. La page à mirrorer est `apps/web/app/reset-password/page.tsx` :
- lecture du token via `useSearchParams().get('token')` (`next/navigation`) ;
- appel gateway via un service dédié (`passwordResetService` → `fetch(buildApiUrl('/auth/...'), …)`).
La page magic crée un `magicLoginService` analogue ciblant `POST /auth/magic`.

Pseudo-page :

```tsx
// useSearchParams().get('token') → magicLoginService.consume(token)
//   → POST /api/v1/auth/magic → stocke data.token (JWT) → window.location = data.redirect
// états : "Connexion en cours…" / "Lien expiré" (lien vers /login)
```

---

## 4. CTA & deep-link dans l'e-mail

### 4.1 URL

```
${appUrl}/auth/magic?token={TOKEN}&redirect=/conversations/{conversationId}
  &utm_source=email&utm_medium=digest&utm_campaign=evening-reengagement&utm_content={variante}
```

- `token` : magic token en clair (64 hex).
- `redirect` : **stocké côté token** (cf. §2.3). Le query param `redirect` de l'URL est donc optionnel/cosmétique ; la source de vérité est `MagicLoginToken.redirect`, ce qui ferme l'open-redirect à la source.
- UTM : mesure du réengagement (cf. §8).

### 4.2 Un seul token par e-mail (v1)

`processUser` génère **un** magic token (un login = un token), avec un `redirect` = conversation la plus récente (sinon `/conversations`) ; tous les CTA de l'e-mail le réutilisent. Le premier clic le consomme ; les CTA suivants retombent sur la page « lien expiré » → mais l'utilisateur est déjà connecté, donc il navigue normalement. (Pour des CTA par-conversation indépendamment cliquables après coup, émettre **un `MagicLoginToken` par conversation** — trivial avec la table dédiée, mais hors périmètre v1.)

### 4.3 Modification `EmailService.sendNotificationDigestEmail`

- Nouveau champ `magicUrl: string` dans `NotificationDigestEmailData` (construit par le job, qui seul connaît le `redirect`).
- Remplacer `href="${data.markAllReadUrl}"` (actuellement `${frontendUrl}/notifications?markAllRead=true`) par `href="${data.magicUrl}"`.
- Conserver `escapeHtml` sur `actorName`/`content`/`name` (déjà en place — pas de bug XSS à « corriger »).
- Ajouter l'en-tête `List-Unsubscribe` — **nécessite d'étendre le transport** (cf. §7 ; `sendEmail`/`sendViaBrevo/SendGrid/Mailgun` ne propagent PAS de headers custom aujourd'hui).

---

## 5. Copywriting de réengagement (FR + i18n)

Garder le branding indigo (`linear-gradient(135deg,#6366F1,#4338CA)`).

### 5.1 Variantes de sujet (A/B via `utm_content`)

| Code | Sujet FR | Révèle l'expéditeur ? |
|---|---|---|
| `fomo` | `📲 {actor} t'a écrit sur Meeshy` | **Oui** (nom dans l'objet) |
| `count` | `⏰ {count} personnes attendent ta réponse` | Non |
| `social` | `🎉 Ça bouge sur Meeshy — un coup d'œil ?` | Non |

⚠️ **Tension à arbitrer (cf. §11.6)** : la variante `fomo` met le nom de l'expéditeur **dans l'objet de l'e-mail** — donc visible sans ouvrir, et lu par les passerelles. Cela contredit en partie l'objectif « réduire le contenu révélé » (§1.3) et le risque « transfert d'e-mail » (§6). Le nom seul (sans contenu) est un compromis courant et souvent le plus performant en CTR, mais c'est un choix produit explicite — à ne pas mélanger avec les variantes neutres `count`/`social` dans le même bucket A/B sans le décider.

### 5.2 Corps (teaser, FR)

> **Bonjour {name},**
> Il y a quelques heures, **{count} conversation(s)** se sont animées.
> Reviens voir ce que tu manques — un seul clic, sans mot de passe.
> **[ Ouvrir Meeshy ]**
> *Lien valide 24 h.*

On **n'affiche plus** la liste détaillée acteur+aperçu : seulement des compteurs agrégés (`{count}` conversations / personnes). C'est le levier produit central (curiosité > consommation passive).

### 5.3 i18n

Étendre `getDigestTranslations(lang)` avec les nouvelles clés (`subject_fomo`, `subject_count`, `teaser_intro`, `cta`, `link_validity`, `unsubscribe`) pour fr/en/es/pt/it/de (les 6 déjà supportées). `lang` reste résolu depuis `user.systemLanguage` (inchangé).

---

## 6. Sécurité & confidentialité (décision 1 clic)

| Risque | Mitigation retenue |
|---|---|
| **Préchargement du lien par le client mail** (Gmail/Outlook scannent) consommerait le token | La page `/auth/magic` consomme via **POST** déclenché par JS au chargement, pas au GET. Un scan GET de l'URL **n'atteint pas** l'endpoint POST `/api/v1/auth/magic`. |
| **Transfert d'e-mail** (A→B) | B pourrait se connecter comme A. **Assumé** pour du réengagement : le teaser ne révèle plus de contenu sensible (juste des compteurs). À documenter dans la décision produit. |
| **Fuite DB** | Token **hashé** (SHA-256) en base ; le token brut n'existe que dans l'e-mail. |
| **Rejeu / double-conso** | `MagicLoginToken.usedAt` + CAS atomique `updateMany` (count must be 1). |
| **Brute-force** | 256 bits d'entropie + rate-limiter Redis maison + expiration 24 h. |
| **Open redirect post-login** | `sanitizeRedirect` (chemins internes uniquement). |
| **Leak du motif d'échec** | Réponse 400 unique. |
| **XSS e-mail** | Déjà couvert (`escapeHtml` sur `name`/`actor`/`content`). Maintenir lors du refactor. |
| **Révocation** | `MagicLoginToken` supprimé en cascade au `DELETE user` (relation `onDelete: Cascade`) ; purge proactive possible via `deleteMany({ userId })` au logout global ; expiration 24 h plafonne l'exposition. |

> Si l'analyse de risque ultérieure juge le transfert d'e-mail trop sensible, bascule possible vers « page de confirmation intermédiaire » (1 clic de plus) **sans changer le modèle de token** — c'est purement la page web qui ajoute un bouton « Confirmer ».

---

## 7. Désinscription & délivrabilité (RFC 8058)

⚠️ **Correction** : contrairement à l'hypothèse initiale, le transport **ne propage PAS** de headers custom. `EmailData` (`{ to, subject, html, text, trackingType?, trackingLang? }`) n'a pas de champ `headers`, et `sendViaBrevo` / `sendViaSendGrid` / `sendViaMailgun` construisent des payloads axios figés. Ajouter `List-Unsubscribe` **exige donc d'étendre** :
- `EmailData` → champ `headers?: Record<string, string>`.
- `sendViaBrevo` → propriété `headers` du payload Brevo.
- `sendViaSendGrid` → tableau `headers` de la personalization / du body.
- `sendViaMailgun` → champs `h:List-Unsubscribe` (convention Mailgun).

Puis :
- En-têtes **`List-Unsubscribe: <https://…/api/v1/email/unsubscribe?token=…>, <mailto:unsub@meeshy.me>`** + **`List-Unsubscribe-Post: List-Unsubscribe=One-Click`**.
- URL : `${frontendUrl}/api/v1/email/unsubscribe?token=...` — **token dédié non-authentifiant** (NE PAS réutiliser le magic token de session). Peut être un `MagicLoginToken`-like dédié ou un HMAC `userId|purpose` vérifiable sans DB.
- Source de vérité du flag : `userPreferences.notification.emailEnabled` (déjà lu par `processUser`) ; l'endpoint one-click le bascule à `false`.
- Bénéfice : meilleur placement inbox, conformité exigences Gmail/Yahoo 2024.

---

## 8. Mesure

- UTM sur chaque CTA (`utm_source=email`, `utm_medium=digest`, `utm_campaign=evening-reengagement`, `utm_content={variante}`).
- Events à tracker (web) : `magic_token_consumed`, `magic_login_success`, `magic_login_failed{reason}`.
- KPIs : delivery rate, CTR (clic/envoi), token consumption rate, login success rate, **DAU réactivés** (inactifs ≥1 j reconnectés via e-mail).
- Le pixel de tracking existant (`/l/meeshy-emails`) reste en place pour l'ouverture.

---

## 9. Plan d'implémentation incrémental (TDD-first)

> Le repo impose TDD (RED→GREEN→REFACTOR). Chaque phase : tests d'abord.

**Phase 0 — Reco** ✅ (fait) : `apps/web` = Next.js App Router ; mirror = `apps/web/app/reset-password/page.tsx` (`useSearchParams` + `passwordResetService` + `buildApiUrl`).

**Phase 1 — Schema `MagicLoginToken` + AuthService** (déployable seul, non-breaking)
- RED : tests `AuthService` (génère token 64 hex ; persiste un **hash** ≠ token ; `expiresAt` ~24 h ; `consume` renvoie JWT+user+redirect ; rejette invalide/expiré ; **usage unique** ; CAS atomique sur double-appel concurrent).
- Schema Prisma : nouveau modèle `MagicLoginToken` (table dédiée hashée) + relation sur `User` + index `tokenHash`/`expiresAt`.
- Étendre `cleanup-expired-tokens.ts` pour purger `MagicLoginToken`.
- GREEN : `generateMagicLoginToken(userId, redirect?)` / `consumeMagicLoginToken(token, ctx?)`.

**Phase 2 — Endpoint** `POST /api/v1/auth/magic`
- RED : 200+JWT sur token valide ; 400 sur invalide/expiré/utilisé (réponse identique) ; 429 via rate-limiter maison ; `sanitizeRedirect` rejette `//` et URLs absolues.
- GREEN : route + `formatUserResponse`/`sendSuccess`/`sendError` existants.

**Phase 3 — Page web** `apps/web/app/auth/magic/page.tsx` (mirror `reset-password/page.tsx`)
- `useSearchParams().get('token')` → `magicLoginService` → `fetch(buildApiUrl('/auth/magic'), POST)` → stockage JWT → redirect interne ; état « lien expiré ».

**Phase 4 — EmailService teaser + CTA tokenisé**
- RED : l'e-mail contient `auth/magic?token=` ; `escapeHtml` préservé ; sujet/teaser par locale ; **pas** de liste détaillée acteur+aperçu (assertion d'absence).
- GREEN : champ `magicUrl` dans `NotificationDigestEmailData`, copy teaser, clés i18n étendues dans `getDigestTranslations`.

**Phase 5 — Job** `notification-digest.ts`
- `processUser` génère le token (`authService.generateMagicLoginToken(userId, redirect)`), calcule le `redirect` (conversation la plus récente), passe `magicUrl` + variante UTM à `sendNotificationDigestEmail`. Idempotence/`emailSent` inchangés.

**Phase 6 — Désinscription RFC 8058**
- **Étendre le transport** (`EmailData.headers`, propagation Brevo/SendGrid/Mailgun) ; endpoint `POST /api/v1/email/unsubscribe` (token dédié non-session) ; en-têtes `List-Unsubscribe(-Post)` ; bascule `notification.emailEnabled=false`.

**Phase 7 — Mesure + rollout graduel**
- UTM + events ; feature-flag / rollout 10 %→100 % selon CTR et taux de désinscription.

---

## 10. Récapitulatif fichier → changement

| Fichier | Changement | Phase |
|---|---|---|
| `packages/shared/prisma/schema.prisma` | **Nouveau modèle `MagicLoginToken`** (table dédiée hashée, mirror `PasswordResetToken`) + relation sur `User` | 1 |
| `services/gateway/src/services/AuthService.ts` | `generateMagicLoginToken(userId, redirect?)`, `consumeMagicLoginToken(token, ctx?)`, `hashMagic` | 1 |
| `services/gateway/src/jobs/cleanup-expired-tokens.ts` | purger aussi `MagicLoginToken` | 1 |
| routeur auth (`routes/auth/…`, mirror `login.ts`/`password-reset.ts`) | `POST /magic` (rate-limiter maison, no-leak, `sanitizeRedirect`) | 2 |
| `apps/web/app/auth/magic/page.tsx` (+ `magicLoginService`, mirror `reset-password`) | page de consommation POST → JWT → redirect | 3 |
| `services/gateway/src/services/EmailService.ts` | `NotificationDigestEmailData.magicUrl`, CTA tokenisé, copy teaser, clés i18n ; **+ `EmailData.headers` + propagation Brevo/SendGrid/Mailgun** | 4, 6 |
| `services/gateway/src/jobs/notification-digest.ts` | génère token + `redirect` + UTM, passe `magicUrl` | 5 |
| `services/gateway/src/routes/email.ts` (nouveau) | `POST /email/unsubscribe` one-click (token dédié non-session) | 6 |
| Tests gateway (`__tests__`) | AuthService, endpoint magic, EmailService (+ headers), unsubscribe | 1–6 |

---

## 11. Points ouverts à valider

1. ~~**Routeur web** (App vs Pages) + chemin reset-password à mirrorer~~ — ✅ résolu (App Router, `app/reset-password/page.tsx`).
2. **Transfert d'e-mail = accès session** : accepter le 1 clic tel quel, ou prévoir dès v1 la page de confirmation intermédiaire ?
3. **Token de désinscription** : dédié (recommandé) vs réutilisation scoppée du magic token.
4. **TTL 24 h** : OK, ou réduire (ex. 12 h) pour limiter l'exposition ?
5. **Suppression totale** de la liste détaillée vs **teaser partiel** (1 nom max sans aperçu) — arbitrage produit (curiosité vs clarté).
6. **Variante de sujet `fomo`** (nom de l'expéditeur dans l'objet) : l'inclure dans l'A/B ou s'en tenir aux sujets neutres `count`/`social` ? (Cohérence avec « contenu réduit » + risque transfert d'e-mail — cf. §5.1.)
