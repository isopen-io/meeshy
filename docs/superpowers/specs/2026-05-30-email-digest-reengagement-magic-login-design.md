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
| Planificateur | `services/gateway/src/jobs/notification-digest.ts` — `setTimeout`+`setInterval`, `TARGET_HOUR_UTC = 18`, batch 50, 1 s entre lots |
| Sélection users | `processAllUsers()` → `notification.groupBy` sur `isRead:false, emailSent:false` |
| Envoi par user | `sendUserDigest(userId)` — respecte `userPreferences.notification.emailEnabled === false`, top 5 notifs, `countUnread`, `markNotificationsEmailed` (idempotence via `emailSent`/`emailSentAt`) |
| Rendu HTML | `EmailService.sendNotificationDigestEmail(params)` (`EmailService.ts` ~L1247) — HTML inline |
| i18n | `getDigestTranslations(lang)` — **déjà** fr/en/es/pt/it/de ; `lang` résolu depuis `user.systemLanguage` (`resolveLang`) |
| Sujet (fr) | `Vous avez {count} notifications non lues - Meeshy` |
| Contenu | Liste top 5 : `actorName` + `content` + temps relatif (révèle tout) |
| **CTA actuel** | `<a href="${appUrl}/notifications">` — **lien nu, aucune auth**, `appUrl = this.frontendUrl = process.env.FRONTEND_URL \|\| 'https://meeshy.me'` |
| Footer | `${appUrl}/settings/notifications` |
| Sécurité HTML | `escapeHtml()` **est déjà appliqué** à `actorName`, `content`, `userName`. ⚠️ Contrairement au brief initial, **il n'y a PAS de faille XSS** sur ces champs aujourd'hui — ne pas « corriger » un bug inexistant. |
| Tracking | pixel `${frontendUrl}/l/meeshy-emails?...` injecté par `send()` |
| Transport | `send({ to, subject, html, headers? , ... })` → Brevo → SendGrid → Mailgun. **`headers` est déjà supporté** (utile pour `List-Unsubscribe`) |

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

### 2.1 Choix de stockage : champs sur `User` (mirror du password-reset)

Le repo a déjà la convention `{purpose}Token: String?` + `{purpose}Expires: DateTime?` (`passwordResetToken`/`passwordResetExpires`, `emailVerifyToken`/`emailVerifyExpires`), tokens **en clair**, remis à `null` à la consommation.

**Décision** : mirror exact de cette convention **mais avec token hashé** (amélioration sécurité justifiée car ce token donne un accès de session complet, pas juste un reset de mot de passe).

```prisma
// packages/shared/prisma/schema.prisma — model User
magicLoginTokenHash  String?    // SHA-256 du token (jamais le token brut)
magicLoginExpires    DateTime?  // expiration
magicLoginUsedAt     DateTime?  // null = neuf ; non-null = consommé (usage unique)
```

Justification des écarts vs password-reset :
- **Hashé** : une fuite de la collection `users` ne doit pas livrer des sessions actives. (Le password-reset stocke en clair ; on ne l'aligne PAS vers le moins-disant.)
- **`magicLoginUsedAt`** explicite : usage unique sans purger immédiatement, pour pouvoir distinguer « déjà utilisé » de « expiré » côté télémétrie interne (sans le révéler au client, cf. §3).

> Alternative écartée : table dédiée `MagicLoginToken`. Plus propre pour multi-tokens concurrents, mais le digest n'émet **qu'un token par user et par run** ; la simplicité des 3 champs l'emporte. À réévaluer si on veut un token distinct par conversation/CTA.

### 2.2 Durée de vie : **24 h**

L'e-mail part à 18:00 UTC ; un utilisateur peut l'ouvrir le lendemain matin. 24 h couvre l'usage décalé sans laisser un lien de session traîner indéfiniment. (Le password-reset est à 1 h car plus sensible et déclenché à la demande ; ici c'est un envoi proactif consommé en différé.)

### 2.3 Génération & consommation — `AuthService`

```ts
// services/gateway/src/services/AuthService.ts
import crypto from 'crypto';

private static hashMagic(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Génère un magic token, stocke son hash, renvoie le token EN CLAIR (pour l'URL). */
async generateMagicLoginToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex'); // 256 bits
  await this.prisma.user.update({
    where: { id: userId },
    data: {
      magicLoginTokenHash: AuthService.hashMagic(token),
      magicLoginExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      magicLoginUsedAt: null,
    },
  });
  return token;
}

/** Valide + consomme (usage unique). Renvoie null sur tout échec (pas de leak de la raison). */
async consumeMagicLoginToken(token: string): Promise<{ jwt: string; user: User } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = AuthService.hashMagic(token);
  const user = await this.prisma.user.findFirst({
    where: {
      magicLoginTokenHash: hash,
      magicLoginExpires: { gt: new Date() },
      magicLoginUsedAt: null,
    },
  });
  if (!user) return null;
  // Consommation atomique : ne consommer que si toujours non-utilisé.
  const claimed = await this.prisma.user.updateMany({
    where: { id: user.id, magicLoginUsedAt: null },
    data: { magicLoginUsedAt: new Date() },
  });
  if (claimed.count !== 1) return null; // course perdue → déjà consommé
  return { jwt: this.generateToken(user.id), user }; // generateToken existant, JWT 7 j
}
```

Notes :
- Le `findFirst` par `magicLoginTokenHash` est une comparaison d'égalité indexée ; le secret n'est jamais comparé en clair côté app (le risque timing porte sur un hash, pas sur le token). Un index sur `magicLoginTokenHash` est recommandé.
- L'usage unique est garanti par `updateMany … where magicLoginUsedAt: null` (CAS atomique) — protège contre la double-consommation concurrente (préchargement client mail + clic réel).

---

## 3. Endpoint de consommation — `POST /api/v1/auth/magic`

Ajouté dans le routeur auth (préfixe `/api/v1/auth`, helpers `sendSuccess`/`sendError`, rate-limit `@fastify/rate-limit` Redis déjà en place).

```ts
fastify.post<{ Body: { token: string; redirect?: string } }>(
  '/magic',
  { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
  async (request, reply) => {
    const { token, redirect } = request.body ?? {};
    if (!token || typeof token !== 'string') {
      return sendError(reply, 'INVALID_INPUT', 'Token requis', 400);
    }
    const result = await authService.consumeMagicLoginToken(token);
    if (!result) {
      // Réponse UNIQUE quel que soit le motif (invalide / expiré / déjà utilisé) — pas de leak.
      return sendError(reply, 'INVALID_TOKEN', 'Lien invalide ou expiré', 400);
    }
    await prisma.user.update({
      where: { id: result.user.id },
      data: { lastSeen: new Date(), isOnline: true },
    });
    return sendSuccess(reply, {
      token: result.jwt,
      user: sanitizeUser(result.user),
      redirect: sanitizeRedirect(redirect), // cf. §3.1
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
- Rate-limit IP 10 / 15 min (mirror des autres routes auth).
- Réponse d'échec **indifférenciée** (pas de distinction invalide/expiré/utilisé).
- Usage unique atomique (`updateMany … magicLoginUsedAt: null`).
- `redirect` borné aux chemins internes.

### 3.3 Page web de consommation

L'e-mail pointe vers une page web `/(auth)/magic` qui fait un **POST** (jamais la consommation au simple GET — voir §6 préchargement), stocke le JWT, puis `window.location = redirect`.

> ⚠️ À confirmer pendant l'implémentation : **type de routeur Next.js** d'`apps/web` (App Router `app/` vs Pages Router `pages/`) et **chemin exact de la page reset-password** existante à mirrorer. La page magic doit reprendre le même mécanisme de lecture de query param + appel `fetch` au gateway que la page reset-password actuelle. (Lookup non finalisé dans cette session — étape 0 de l'implémentation.)

Pseudo-page :

```tsx
// lit ?token & ?redirect → POST /api/v1/auth/magic → stocke data.token → redirect
// états : "Connexion en cours…" / "Lien expiré" (avec lien vers /login)
```

---

## 4. CTA & deep-link dans l'e-mail

### 4.1 URL

```
${appUrl}/auth/magic?token={TOKEN}&redirect=/conversations/{conversationId}
  &utm_source=email&utm_medium=digest&utm_campaign=evening-reengagement&utm_content={variante}
```

- `token` : magic token en clair (64 hex).
- `redirect` : deep-link interne (conversation la plus récente, sinon `/conversations`).
- UTM : mesure du réengagement (cf. §8).

### 4.2 Un seul token par e-mail

`sendUserDigest` génère **un** magic token (un login = un token) ; tous les CTA de l'e-mail le réutilisent. Le premier clic le consomme ; les CTA suivants retombent gracieusement sur la page « lien expiré » → l'utilisateur déjà connecté navigue normalement. (Si on veut plusieurs CTA indépendamment cliquables après coup, passer à une table de tokens — hors périmètre v1.)

### 4.3 Modification `EmailService.sendNotificationDigestEmail`

- Nouveau param `magicUrl: string` (construit par le job, qui seul connaît `redirect`).
- Remplacer `href="${appUrl}/notifications"` par `href="${magicUrl}"`.
- Conserver `escapeHtml` sur les champs user (déjà en place).
- Ajouter l'en-tête `List-Unsubscribe` via `headers` de `send()` (cf. §7).

---

## 5. Copywriting de réengagement (FR + i18n)

Garder le branding indigo (`linear-gradient(135deg,#6366F1,#4338CA)`).

### 5.1 Variantes de sujet (A/B via `utm_content`)

| Code | Sujet FR |
|---|---|
| `fomo` | `📲 {actor} t'a écrit sur Meeshy` |
| `count` | `⏰ {count} personnes attendent ta réponse` |
| `social` | `🎉 Ça bouge sur Meeshy — un coup d'œil ?` |

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
| **Rejeu / double-conso** | `magicLoginUsedAt` + CAS atomique `updateMany`. |
| **Brute-force** | 256 bits d'entropie + rate-limit 10/15 min + expiration 24 h. |
| **Open redirect post-login** | `sanitizeRedirect` (chemins internes uniquement). |
| **Leak du motif d'échec** | Réponse 400 unique. |
| **XSS e-mail** | Déjà couvert (`escapeHtml` sur `name`/`actor`/`content`). Maintenir lors du refactor. |
| **Révocation** | Le token est purgé (`null`) au `DELETE user` / logout global ; expiration 24 h plafonne l'exposition. |

> Si l'analyse de risque ultérieure juge le transfert d'e-mail trop sensible, bascule possible vers « page de confirmation intermédiaire » (1 clic de plus) **sans changer le modèle de token** — c'est purement la page web qui ajoute un bouton « Confirmer ».

---

## 7. Désinscription & délivrabilité (RFC 8058)

- Ajouter l'en-tête **`List-Unsubscribe`** + **`List-Unsubscribe-Post: List-Unsubscribe=One-Click`** via le param `headers` de `send()` (déjà supporté côté transport).
- URL : `${appUrl}/api/v1/email/unsubscribe?token=...` (token de désinscription distinct, non-authentifiant, ou réutilise le magic token avec scope limité — **préférer un token dédié non-session**).
- Le contrôle existant `userPreferences.notification.emailEnabled === false` reste la source de vérité ; l'endpoint one-click bascule ce flag.
- Bénéfice : meilleur placement boîte de réception, conformité Gmail/Yahoo 2024.

---

## 8. Mesure

- UTM sur chaque CTA (`utm_source=email`, `utm_medium=digest`, `utm_campaign=evening-reengagement`, `utm_content={variante}`).
- Events à tracker (web) : `magic_token_consumed`, `magic_login_success`, `magic_login_failed{reason}`.
- KPIs : delivery rate, CTR (clic/envoi), token consumption rate, login success rate, **DAU réactivés** (inactifs ≥1 j reconnectés via e-mail).
- Le pixel de tracking existant (`/l/meeshy-emails`) reste en place pour l'ouverture.

---

## 9. Plan d'implémentation incrémental (TDD-first)

> Le repo impose TDD (RED→GREEN→REFACTOR). Chaque phase : tests d'abord.

**Phase 0 — Reco** : confirmer le routeur Next.js d'`apps/web` + chemin page reset-password (mirror cible).

**Phase 1 — Schema + AuthService** (déployable seul, non-breaking)
- RED : tests `AuthService` (génère token 64 hex ; stocke un **hash** ≠ token ; expiration ~24 h ; `consume` renvoie JWT+user ; rejette invalide/expiré ; **usage unique** ; CAS atomique sur double-appel).
- Schema Prisma : `magicLoginTokenHash`, `magicLoginExpires`, `magicLoginUsedAt` (+ index sur le hash).
- GREEN : `generateMagicLoginToken` / `consumeMagicLoginToken`.

**Phase 2 — Endpoint** `POST /api/v1/auth/magic`
- RED : 200+JWT sur token valide ; 400 sur invalide/expiré/utilisé (réponse identique) ; rate-limit 429 ; `sanitizeRedirect` rejette `//` et URLs absolues.
- GREEN : route + helpers existants.

**Phase 3 — Page web** `/auth/magic` (mirror reset-password)
- POST au chargement, stockage JWT, redirect interne, état « lien expiré ».

**Phase 4 — EmailService teaser + CTA tokenisé**
- RED : l'e-mail contient `auth/magic?token=` + `redirect=/conversations` ; `escapeHtml` préservé ; sujet/teaser par locale ; **pas** de liste détaillée acteur+aperçu (assertion d'absence).
- GREEN : nouveau param `magicUrl`, copy teaser, clés i18n.

**Phase 5 — Job** `notification-digest.ts`
- `sendUserDigest` génère le token (`authService.generateMagicLoginToken`), calcule le `redirect` (conversation la plus récente), passe `magicUrl` + variante UTM à `sendNotificationDigestEmail`. Idempotence/`emailSent` inchangés.

**Phase 6 — Désinscription RFC 8058**
- Endpoint `POST /api/v1/email/unsubscribe` + en-têtes `List-Unsubscribe(-Post)` ; bascule `emailEnabled=false`.

**Phase 7 — Mesure + rollout graduel**
- UTM + events ; feature-flag / rollout 10 %→100 % selon CTR et taux de désinscription.

---

## 10. Récapitulatif fichier → changement

| Fichier | Changement | Phase |
|---|---|---|
| `packages/shared/prisma/schema.prisma` | `magicLoginTokenHash`, `magicLoginExpires`, `magicLoginUsedAt` (+ index hash) sur `User` | 1 |
| `services/gateway/src/services/AuthService.ts` | `generateMagicLoginToken`, `consumeMagicLoginToken`, `hashMagic` | 1 |
| `services/gateway/src/routes/auth.ts` (routeur auth) | `POST /magic` (rate-limit, no-leak, `sanitizeRedirect`) | 2 |
| `apps/web` (`/auth/magic`, mirror reset-password) | page de consommation POST → JWT → redirect | 3 |
| `services/gateway/src/services/EmailService.ts` | `sendNotificationDigestEmail` : param `magicUrl`, CTA tokenisé, copy teaser, clés i18n, en-têtes `List-Unsubscribe` | 4, 6 |
| `services/gateway/src/jobs/notification-digest.ts` | génère token + `redirect` + UTM, passe `magicUrl` | 5 |
| `services/gateway/src/routes/email.ts` (nouveau) | `POST /email/unsubscribe` one-click | 6 |
| Tests gateway (`__tests__`) | AuthService, endpoint magic, EmailService, unsubscribe | 1–6 |

---

## 11. Points ouverts à valider

1. **Routeur web** (App vs Pages) + chemin reset-password à mirrorer — Phase 0.
2. **Transfert d'e-mail = accès session** : accepter le 1 clic tel quel, ou prévoir dès v1 la page de confirmation intermédiaire ?
3. **Token de désinscription** : dédié (recommandé) vs réutilisation scoppée du magic token.
4. **TTL 24 h** : OK, ou réduire (ex. 12 h) pour limiter l'exposition ?
5. **Suppression totale** de la liste détaillée vs **teaser partiel** (1 nom max sans aperçu) — arbitrage produit (curiosité vs clarté).
