# 🚀 Système d'Identité Moderne & Sécurisé - Meeshy

**Date** : 2026-01-27
**Statut** : Spécification Technique Complète
**Objectif** : Onboarding ultra-rapide (30 sec) avec vérification asynchrone et nettoyage intelligent

---

## 📋 Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture Existante](#architecture-existante)
3. [Modifications Requises](#modifications-requises)
4. [Modes d'Inscription](#modes-dinscription)
5. [Système de Niveaux de Sécurité](#système-de-niveaux-de-sécurité)
6. [Libération Intelligente d'Identifiants](#libération-intelligente-didentifiants)
7. [Détection et Gel des Emails Invalides](#détection-et-gel-des-emails-invalides)
8. [Récupération de Compte](#récupération-de-compte)
9. [Génération Automatique de Username](#génération-automatique-de-username)
10. [API et Routes](#api-et-routes)
11. [UI Composants](#ui-composants)
12. [Plan d'Implémentation](#plan-dimplémentation)

---

## 1. Vue d'Ensemble

### Vision
Permettre une inscription ultra-rapide avec **un seul identifiant** (email OU téléphone OU OAuth), vérification asynchrone non-bloquante, et nettoyage intelligent des comptes fantômes lors des tentatives de connexion.

### Principes Fondamentaux
- ✅ **Onboarding immédiat** : Connexion en 30 secondes max
- ✅ **Vérification asynchrone** : Pas de blocage à l'inscription
- ✅ **Nettoyage à la demande** : Libération lors de tentatives de connexion échouées
- ✅ **Sécurité graduée** : Plus de vérifications = plus de privilèges
- ✅ **Détection bounces** : Gel automatique des emails invalides

---

## 2. Architecture Existante

### ✅ Services Déjà Implémentés (Production-Ready)

#### **SessionService**
```typescript
// services/gateway/src/services/SessionService.ts
✅ Tokens hashés SHA-256
✅ Device tracking complet (type, vendor, model, OS, browser)
✅ Geolocation (IP, city, country, timezone)
✅ Sessions longues : Mobile (365j) vs Desktop (30j)
✅ Refresh token rotation
✅ Trusted sessions (1 an après 2FA)
✅ Limite 10 sessions/user
✅ Invalidation globale ou ciblée
✅ Cleanup automatique
```

#### **SmsService**
```typescript
// services/gateway/src/services/SmsService.ts
✅ Multi-provider (Brevo, Twilio, Vonage)
✅ Fallback automatique
✅ Brevo en priorité (€0.045/SMS)
✅ Support international
```

#### **EmailService**
```typescript
// services/gateway/src/services/EmailService.ts
✅ Multi-provider (Brevo, SendGrid, Mailgun)
✅ Fallback automatique
✅ i18n (FR, EN, ES, PT, IT, DE)
✅ Templates HTML responsive
```

#### **PasswordResetService**
```typescript
// services/gateway/src/services/PasswordResetService.ts
✅ Tokens hashés SHA-256 (15 min)
✅ Rate limiting (10 tentatives/24h)
✅ Account lockout
✅ Password history (10 derniers)
✅ CAPTCHA optionnel
✅ 2FA verification
✅ Geolocation anomaly detection
```

#### **MagicLinkService**
```typescript
// services/gateway/src/services/MagicLinkService.ts
✅ Tokens 1 minute (ultra-court)
✅ Rate limiting (3 req/heure)
✅ Remember device (server-side)
✅ Single-use tokens
✅ Email enumeration prevention
```

### ✅ Modèles Prisma Existants

```prisma
✅ UserSession - Gestion sessions avec device tracking
✅ PasswordResetToken - Reset par email
✅ PhonePasswordResetToken - Reset par SMS
✅ MagicLinkToken - Connexion passwordless
✅ SecurityEvent - Audit trail complet
```

### ✅ Champs User Existants

```prisma
✅ emailVerifiedAt / emailVerificationToken / emailVerificationExpiry
✅ phoneVerifiedAt / phoneVerificationCode / phoneVerificationExpiry
✅ twoFactorEnabledAt / twoFactorSecret / twoFactorBackupCodes
✅ failedLoginAttempts / lockedUntil / lockedReason
✅ lastPasswordChange / passwordResetAttempts
✅ lastLoginIp / lastLoginLocation / lastLoginDevice
✅ registrationIp / registrationLocation / registrationDevice
✅ deletedAt / deletedBy
```

---

## 3. Modifications Requises

### 🆕 Nouveaux Champs User

```prisma
model User {
  // ... champs existants ...

  // ============================================
  // SECURITY LEVELS & PASSWORDLESS
  // ============================================
  /// Niveau de sécurité : 0=UNVERIFIED, 1=BASIC, 2=VERIFIED, 3=SECURED
  securityLevel       Int     @default(0)

  /// Compte passwordless (OAuth pur, pas de password défini)
  passwordlessEnabled Boolean @default(false)

  // ============================================
  // LOGIN CODE (Alternative Magic Link)
  // ============================================
  /// Code temporaire de connexion (hashé SHA-256)
  loginCodeToken      String?
  /// Expiration du code (15 minutes)
  loginCodeExpiry     DateTime?
  /// Tentatives de validation (max 3)
  loginCodeAttempts   Int     @default(0)

  // ============================================
  // USERNAME MANAGEMENT
  // ============================================
  /// Date du dernier changement de username (limite 1x/semaine)
  lastUsernameChange  DateTime?
  /// Compteur de changements (audit)
  usernameChangeCount Int     @default(0)

  // ============================================
  // PORTABLE IDENTIFIER
  // ============================================
  /// Identifiant portable fédéré : @username@meeshy.me
  portableIdentifier  String? @unique

  // ============================================
  // EMAIL BOUNCE DETECTION
  // ============================================
  /// Date du dernier bounce détecté (email invalide)
  lastEmailBounceAt   DateTime?
  /// Nombre de bounces consécutifs
  emailBounceCount    Int     @default(0)
  /// Raison du bounce ("hard_bounce", "soft_bounce", "spam", "invalid")
  emailBounceReason   String?
  /// Compte gelé (email invalide)
  isFrozen            Boolean @default(false)
  frozenAt            DateTime?
  frozenReason        String? // "EMAIL_BOUNCE", "FRAUD_DETECTION", "MANUAL"

  // ============================================
  // RELATIONS
  // ============================================
  oauthConnections    OAuthConnection[]
}
```

### 🆕 Nouveau Modèle OAuthConnection

```prisma
/// Connexions OAuth (Google, GitHub, Apple, Facebook, etc.)
model OAuthConnection {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                String   @db.ObjectId
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  /// Provider : "google", "github", "apple", "facebook", "discord"
  provider              String

  /// ID utilisateur chez le provider
  providerUserId        String

  /// Username/handle chez le provider (GitHub: login, Twitter: handle)
  providerUsername      String?

  /// Email vérifié par le provider
  providerEmail         String?

  /// Email vérifié chez le provider ?
  providerEmailVerified Boolean  @default(false)

  /// Access token (chiffré AES-256-GCM)
  accessToken           String

  /// Refresh token (chiffré AES-256-GCM)
  refreshToken          String?

  /// Expiration du token
  expiresAt             DateTime?

  /// Scopes accordés (ex: ["user:email", "read:user"])
  scopes                String[] @default([])

  /// Avatar fourni par le provider
  providerAvatar        String?

  /// Date de connexion initiale
  connectedAt           DateTime @default(now())

  /// Dernière synchronisation des données
  lastSyncedAt          DateTime @default(now())

  @@unique([provider, providerUserId])
  @@index([userId])
  @@index([provider])
}
```

### 🆕 Nouveau Modèle EmailBounceEvent

```prisma
/// Événements de bounce email (webhooks Brevo)
model EmailBounceEvent {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId

  /// Email concerné
  email         String   @db.String

  /// User ID si trouvé
  userId        String?  @db.ObjectId

  /// Type de bounce : "hard_bounce", "soft_bounce", "blocked", "spam"
  bounceType    String

  /// Raison détaillée du bounce
  bounceReason  String?

  /// Code d'erreur SMTP (ex: 550, 554)
  smtpCode      Int?

  /// Message d'erreur complet
  errorMessage  String?

  /// Message ID Brevo
  messageId     String?

  /// Provider qui a envoyé (Brevo, SendGrid, etc.)
  provider      String   @default("brevo")

  /// Payload webhook complet (JSON)
  webhookPayload Json?

  /// Action prise : "USER_FROZEN", "USER_NOTIFIED", "IGNORED"
  actionTaken   String?

  createdAt     DateTime @default(now())

  @@index([email])
  @@index([userId])
  @@index([bounceType])
  @@index([createdAt])
}
```

---

## 4. Modes d'Inscription

### Option A : Inscription avec Email (20 secondes)

**Champs requis** : `email`, `firstName`, `password`
**Champs optionnels** : `lastName`

**Flux** :
```typescript
1. Validation format email (Zod)
2. Vérification disponibilité email
   → Si email existe avec compte UNVERIFIED + lastLoginAt === null :
     → Libération immédiate (voir section 6)
3. Création compte avec :
   - securityLevel: 0 (UNVERIFIED)
   - username auto-généré : alice@gmail.com → "alice"
   - portableIdentifier: "@alice@meeshy.me"
   - emailVerificationToken + expiry (24h)
4. Envoi email vérification (asynchrone, non-bloquant)
5. Connexion immédiate avec JWT
6. Badge "⚠️ Vérifiez votre email" visible partout
```

**Code Backend** :
```typescript
// services/gateway/src/routes/auth/register.ts
const user = await prisma.user.create({
  data: {
    email: normalizeEmail(data.email),
    password: await bcrypt.hash(data.password, 12),
    firstName: capitalizeName(data.firstName),
    lastName: data.lastName ? capitalizeName(data.lastName) : null,

    username: await generateUsername({ type: 'email', value: data.email }),
    portableIdentifier: `@${username}@meeshy.me`,

    securityLevel: 0, // UNVERIFIED
    emailVerifiedAt: null,
    emailVerificationToken: hashToken(rawToken),
    emailVerificationExpiry: add24Hours(),

    registrationIp: context.ip,
    registrationLocation: context.geoData?.location,
  }
});

// Envoi email vérification (asynchrone)
await emailService.sendEmailVerification(user).catch(console.error);

// Connexion immédiate
const token = generateJWT(user);
return { user, token };
```

---

### Option B : Inscription avec Téléphone (30 secondes avec SMS)

**Champs requis** : `phoneNumber`, `phoneCountryCode`, `firstName`
**Champs optionnels** : `lastName`, `password`

**Flux** :
```typescript
1. Normalisation téléphone (format E.164)
2. Vérification disponibilité
3. Génération code SMS 6 chiffres
4. Stockage temporaire Redis (10 min, 3 tentatives)
5. Envoi SMS via Brevo (SmsService existant)
6. Utilisateur entre le code
7. Validation → Création compte avec :
   - phoneVerifiedAt: new Date() ✅ Déjà vérifié !
   - securityLevel: 1 (BASIC)
   - username auto-généré depuis prénom
   - Si pas de password : random + passwordlessEnabled: true
8. Connexion immédiate
```

**Code Backend** :
```typescript
// Étape 1 : Envoi SMS
const smsCode = crypto.randomInt(100000, 999999).toString();
const hashedCode = await bcrypt.hash(smsCode, 10);

await redis.setex(
  `sms_registration:${phoneNumber}`,
  600, // 10 minutes
  JSON.stringify({
    code: hashedCode,
    attempts: 0,
    data: { phoneNumber, firstName, lastName, password }
  })
);

await smsService.send({
  to: phoneNumber,
  message: `Meeshy - Code : ${smsCode}\nValide 10 min.`
});

// Étape 2 : Validation code + création
const stored = await redis.get(`sms_registration:${phoneNumber}`);
const valid = await bcrypt.compare(code, stored.code);

if (!valid) {
  stored.attempts++;
  if (stored.attempts >= 3) {
    await redis.del(`sms_registration:${phoneNumber}`);
    throw new Error('Trop de tentatives');
  }
  throw new Error('Code invalide');
}

const user = await prisma.user.create({
  data: {
    phoneNumber: normalizePhone(stored.data.phoneNumber),
    phoneVerifiedAt: new Date(), // ✅ Déjà vérifié
    securityLevel: 1, // BASIC

    username: await generateUsername({
      type: 'phone',
      value: phoneNumber,
      firstName: stored.data.firstName
    }),

    password: stored.data.password || generateRandomPassword(),
    passwordlessEnabled: !stored.data.password,
  }
});
```

---

### Option C : Inscription OAuth (5 secondes)

**Providers supportés** : Google, GitHub, Apple, Facebook, Discord

**Flux** :
```typescript
1. Redirection OAuth
2. Callback avec code
3. Exchange code → tokens
4. Récupération profil
5. Recherche compte existant par email OU providerUserId
6. Si existe : Lier OAuth + connexion
7. Si pas existe : Création avec :
   - email (si fourni et vérifié)
   - username auto-généré
   - password random + passwordlessEnabled: true
   - securityLevel: 1 si email vérifié, sinon 0
8. Connexion immédiate
```

**Code Backend** :
```typescript
// Callback OAuth
const profile = await fetchOAuthProfile(provider, tokens.access_token);

let user = await prisma.user.findFirst({
  where: {
    OR: [
      { email: profile.email },
      { oauthConnections: { some: { provider, providerUserId: profile.id }}}
    ]
  }
});

if (!user) {
  const username = await generateUsername({
    type: 'oauth',
    value: profile.email || profile.login
  });

  user = await prisma.user.create({
    data: {
      email: profile.email,
      emailVerifiedAt: profile.email_verified ? new Date() : null,
      firstName: profile.given_name || profile.name.split(' ')[0],
      username,
      portableIdentifier: `@${username}@meeshy.me`,

      password: generateRandomPassword(),
      passwordlessEnabled: true,
      securityLevel: profile.email_verified ? 1 : 0,

      oauthConnections: {
        create: {
          provider,
          providerUserId: profile.id,
          providerEmail: profile.email,
          providerEmailVerified: profile.email_verified,
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
        }
      }
    }
  });
}

const token = generateJWT(user);
return { user, token };
```

---

## 5. Système de Niveaux de Sécurité

### Définition des Niveaux

```typescript
enum SecurityLevel {
  UNVERIFIED = 0,  // Aucune vérification
  BASIC = 1,       // Email OU téléphone vérifié
  VERIFIED = 2,    // Email ET téléphone vérifiés
  SECURED = 3,     // + 2FA activé
}
```

### Permissions par Niveau

```typescript
const PERMISSIONS = {
  0: { // UNVERIFIED
    canSendMessages: false,
    canJoinCommunities: false,
    canCreateConversations: false,
    canUploadFiles: false,
    accountLifetime: '7 days', // Nettoyage après 7j si jamais connecté
    warningMessage: "Vérifiez votre email ou téléphone pour débloquer toutes les fonctionnalités"
  },

  1: { // BASIC (email OU phone vérifié)
    canSendMessages: true,
    canJoinCommunities: true,
    canCreateConversations: true,
    canUploadFiles: true,
    maxFileSize: '10 MB',
    maxMessagesPerDay: 1000,
  },

  2: { // VERIFIED (email ET phone vérifiés)
    canSendMessages: true,
    canJoinCommunities: true,
    canCreateConversations: true,
    canUploadFiles: true,
    canCreateCommunities: true,
    maxFileSize: '100 MB',
    maxMessagesPerDay: 10000,
  },

  3: { // SECURED (+ 2FA)
    // Tous les privilèges
    canModerate: true,
    canAccessSensitiveData: true,
    canExportData: true,
    unlimitedStorage: true,
  }
};
```

### Middleware de Permissions

```typescript
// services/gateway/src/middleware/require-security-level.ts
export function requireSecurityLevel(minLevel: SecurityLevel) {
  return async (req, res, next) => {
    const user = req.user;

    if (user.securityLevel < minLevel) {
      const actions = [];

      if (minLevel >= 1 && !user.emailVerifiedAt && !user.phoneVerifiedAt) {
        actions.push('Vérifiez votre email ou téléphone');
      }

      if (minLevel >= 2) {
        if (!user.emailVerifiedAt) actions.push('Vérifiez votre email');
        if (!user.phoneVerifiedAt) actions.push('Vérifiez votre téléphone');
      }

      if (minLevel >= 3 && !user.twoFactorEnabledAt) {
        actions.push('Activez l\'authentification à deux facteurs');
      }

      return res.status(403).json({
        error: 'Niveau de sécurité insuffisant',
        required: minLevel,
        current: user.securityLevel,
        actions
      });
    }

    next();
  };
}

// Utilisation
app.post('/messages', requireSecurityLevel(1), sendMessage);
app.post('/communities', requireSecurityLevel(2), createCommunity);
```

---

## 6. Libération Intelligente d'Identifiants

### Problème
Alice crée un compte avec `alice@gmail.com`, ne vérifie jamais, abandonne.
Plus tard, la vraie Alice veut s'inscrire → **bloqué**.

### Solution : Libération lors de Tentatives de Connexion

```typescript
// services/gateway/src/services/AuthService.ts

async function handleIdentifierConflict(
  identifier: string,
  type: 'email' | 'phone'
): Promise<{ available: boolean; liberated?: boolean; reason?: string }> {

  const existing = await prisma.user.findFirst({
    where: type === 'email' ? { email: identifier } : { phoneNumber: identifier }
  });

  if (!existing) {
    return { available: true };
  }

  // Règles de libération automatique
  const canLiberate =
    existing.securityLevel === 0 && // Non vérifié
    !existing.lastLoginAt && // Jamais connecté
    (
      // Cas 1 : Passwordless (OAuth échoué) créé il y a 24h+
      (existing.passwordlessEnabled && hoursSince(existing.createdAt) >= 24) ||

      // Cas 2 : Avec password mais jamais connecté, créé il y a 7j+
      (!existing.passwordlessEnabled && daysSince(existing.createdAt) >= 7)
    );

  if (canLiberate) {
    console.log(`[AUTH] 🔓 Libération identifiant : ${identifier}`);

    // Anonymisation avant suppression
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: null,
        phoneNumber: null,
        username: `deleted_${existing.id.slice(-8)}`,
        deletedAt: new Date(),
        deletedReason: 'AUTO_CLEANUP_ON_CONFLICT'
      }
    });

    // Log sécurité
    await logSecurityEvent(existing.id, 'ACCOUNT_AUTO_DELETED', 'LOW', {
      reason: 'IDENTIFIER_LIBERATION',
      identifier,
      accountAge: daysSince(existing.createdAt)
    });

    return { available: true, liberated: true };
  }

  // Compte actif ou récent, conflit réel
  return {
    available: false,
    reason: existing.securityLevel > 0
      ? 'VERIFIED_ACCOUNT_EXISTS'
      : 'RECENT_UNVERIFIED_ACCOUNT'
  };
}
```

### Règles de Libération

| Situation | Durée avant libération | Action |
|-----------|------------------------|--------|
| OAuth pur (passwordless) + jamais connecté + UNVERIFIED | 24 heures | Anonymisation automatique |
| Avec password + jamais connecté + UNVERIFIED | 7 jours | Anonymisation automatique |
| Jamais connecté + UNVERIFIED + tentative connexion externe | Immédiat (si > 24h) | Libération sur conflit |
| Au moins 1 connexion + UNVERIFIED | Jamais | Email rappel à 6j |
| BASIC ou supérieur | Jamais | Compte protégé |

---

## 7. Détection et Gel des Emails Invalides

### Problème
Utilisateur inscrit avec email jetable ou typo (`alice@gmai.com` au lieu de `gmail.com`).
Email bounce → Compte zombie.

### Solution : Webhooks Brevo + Statut FREEZED

#### 7.1. Configuration Webhook Brevo

**Dashboard Brevo** → Webhooks → Créer :
- URL : `https://api.meeshy.me/webhooks/brevo/email-events`
- Events : `hard_bounce`, `soft_bounce`, `blocked`, `spam`
- Signature : Token secret pour validation

#### 7.2. Route Webhook

```typescript
// services/gateway/src/routes/webhooks/brevo.ts
import crypto from 'crypto';

app.post('/webhooks/brevo/email-events', async (req, res) => {
  // Vérification signature
  const signature = req.headers['x-brevo-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', process.env.BREVO_WEBHOOK_SECRET!)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  // Types de bounce
  const bounceTypes = {
    hard_bounce: 'HARD_BOUNCE', // Email invalide (permanent)
    soft_bounce: 'SOFT_BOUNCE', // Temporaire (boîte pleine)
    blocked: 'BLOCKED',         // Bloqué par serveur
    spam: 'SPAM'                // Marqué comme spam
  };

  if (event.event in bounceTypes) {
    await handleEmailBounce({
      email: event.email,
      bounceType: bounceTypes[event.event],
      bounceReason: event.reason || null,
      smtpCode: event.code || null,
      errorMessage: event.message || null,
      messageId: event['message-id'] || null,
      webhookPayload: event
    });
  }

  res.status(200).json({ received: true });
});
```

#### 7.3. Gestion des Bounces

```typescript
// services/gateway/src/services/EmailBounceService.ts

async function handleEmailBounce(data: {
  email: string;
  bounceType: string;
  bounceReason?: string;
  smtpCode?: number;
  errorMessage?: string;
  messageId?: string;
  webhookPayload: any;
}) {

  // 1. Trouver l'utilisateur
  const user = await prisma.user.findFirst({
    where: { email: data.email.toLowerCase() }
  });

  if (!user) {
    console.log(`[EmailBounce] Aucun utilisateur trouvé pour : ${data.email}`);
    return;
  }

  // 2. Enregistrer l'événement
  await prisma.emailBounceEvent.create({
    data: {
      email: data.email,
      userId: user.id,
      bounceType: data.bounceType,
      bounceReason: data.bounceReason,
      smtpCode: data.smtpCode,
      errorMessage: data.errorMessage,
      messageId: data.messageId,
      provider: 'brevo',
      webhookPayload: data.webhookPayload
    }
  });

  // 3. Logique de gel selon type de bounce
  const shouldFreeze =
    data.bounceType === 'HARD_BOUNCE' || // Email invalide permanent
    data.bounceType === 'BLOCKED' ||     // Bloqué par serveur
    (data.bounceType === 'SOFT_BOUNCE' && user.emailBounceCount >= 3); // 3 soft bounces

  if (shouldFreeze) {
    // Gel du compte
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isFrozen: true,
        frozenAt: new Date(),
        frozenReason: 'EMAIL_BOUNCE',
        lastEmailBounceAt: new Date(),
        emailBounceCount: { increment: 1 },
        emailBounceReason: data.bounceType
      }
    });

    // Log sécurité
    await logSecurityEvent(user.id, 'ACCOUNT_FROZEN', 'MEDIUM', {
      reason: 'EMAIL_BOUNCE',
      bounceType: data.bounceType,
      email: data.email
    });

    console.log(`[EmailBounce] ❄️ Compte gelé : ${user.username} (${data.email})`);

    // Notification (si téléphone vérifié)
    if (user.phoneVerifiedAt && user.phoneNumber) {
      await smsService.send({
        to: user.phoneNumber,
        message: `Meeshy : Votre email ${maskEmail(data.email)} est invalide. Mettez-le à jour sur meeshy.me/settings`
      });
    }
  } else {
    // Soft bounce : incrémenter compteur
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastEmailBounceAt: new Date(),
        emailBounceCount: { increment: 1 },
        emailBounceReason: data.bounceType
      }
    });
  }
}
```

#### 7.4. Blocage Connexion si FREEZED

```typescript
// services/gateway/src/services/AuthService.ts

async authenticate(credentials: LoginCredentials) {
  const user = await prisma.user.findFirst({
    where: { /* ... */ }
  });

  // Vérification gel du compte
  if (user.isFrozen) {
    await logSecurityEvent(user.id, 'LOGIN_ATTEMPT_FROZEN_ACCOUNT', 'MEDIUM', {
      reason: user.frozenReason,
      frozenAt: user.frozenAt
    });

    throw new Error(
      user.frozenReason === 'EMAIL_BOUNCE'
        ? 'Votre compte est gelé car votre email est invalide. Contactez support@meeshy.me'
        : 'Votre compte est gelé. Contactez support@meeshy.me'
    );
  }

  // Suite authentification normale...
}
```

#### 7.5. Dégel Manuel (Admin)

```typescript
// services/gateway/src/routes/admin/users.ts

app.post('/admin/users/:userId/unfreeze', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { newEmail } = req.body; // Nouvel email fourni

  await prisma.user.update({
    where: { id: userId },
    data: {
      isFrozen: false,
      frozenAt: null,
      frozenReason: null,
      email: newEmail ? normalizeEmail(newEmail) : undefined,
      emailVerifiedAt: newEmail ? null : undefined, // Doit revérifier
      emailBounceCount: 0,
      emailBounceReason: null,
      lastEmailBounceAt: null
    }
  });

  res.json({ success: true });
});
```

---

## 8. Récupération de Compte

### Principe : Code Temporaire Unique

Pas de "mot de passe oublié" traditionnel.
**Un seul endpoint** : `/auth/send-login-code`

### 8.1. Envoi du Code

```typescript
// POST /auth/send-login-code
interface LoginCodeRequest {
  identifier: string; // Email OU téléphone OU @username
}

async function sendLoginCode(identifier: string) {
  // Détection automatique du type
  let user: User | null = null;

  if (identifier.includes('@') && !identifier.startsWith('@')) {
    // Email
    user = await prisma.user.findUnique({ where: { email: identifier }});
  } else if (identifier.startsWith('+') || /^\d{10,}$/.test(identifier)) {
    // Téléphone
    user = await prisma.user.findFirst({ where: { phoneNumber: normalizePhone(identifier) }});
  } else {
    // Username
    user = await prisma.user.findFirst({ where: { username: identifier.replace('@', '') }});
  }

  if (!user) {
    // Sécurité : Ne pas révéler si compte existe
    return { success: true, message: 'Si ce compte existe, vous recevrez un code.' };
  }

  // Vérification gel
  if (user.isFrozen) {
    return { success: false, error: 'Compte gelé. Contactez support@meeshy.me' };
  }

  // Génération code 6 caractères alphanumériques
  const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // Ex: A3F2B1
  const hashedCode = await bcrypt.hash(code, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginCodeToken: hashedCode,
      loginCodeExpiry: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      loginCodeAttempts: 0
    }
  });

  // Envoi prioritaire SMS si vérifié, sinon email
  if (user.phoneVerifiedAt && user.phoneNumber) {
    await smsService.send({
      to: user.phoneNumber,
      message: `Meeshy - Code de connexion : ${code}\nValide 15 min.`
    });
    return { success: true, method: 'sms', masked: maskPhone(user.phoneNumber) };
  } else if (user.email) {
    await emailService.send({
      to: user.email,
      subject: 'Code de connexion Meeshy',
      html: `<p>Votre code : <strong>${code}</strong></p><p>Valide 15 minutes.</p>`
    });
    return { success: true, method: 'email', masked: maskEmail(user.email) };
  }
}
```

### 8.2. Validation du Code

```typescript
// POST /auth/verify-login-code
async function verifyLoginCode(identifier: string, code: string) {
  const user = await findUserByIdentifier(identifier);

  if (!user || !user.loginCodeToken || user.loginCodeExpiry < new Date()) {
    throw new Error('Code invalide ou expiré');
  }

  // Protection brute-force
  if (user.loginCodeAttempts >= 3) {
    await prisma.user.update({
      where: { id: user.id },
      data: { loginCodeToken: null, loginCodeExpiry: null }
    });
    throw new Error('Trop de tentatives. Demandez un nouveau code.');
  }

  const valid = await bcrypt.compare(code.toUpperCase(), user.loginCodeToken);

  if (!valid) {
    await prisma.user.update({
      where: { id: user.id },
      data: { loginCodeAttempts: { increment: 1 } }
    });
    throw new Error('Code invalide');
  }

  // Code valide → Nettoyage + connexion
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginCodeToken: null,
      loginCodeExpiry: null,
      loginCodeAttempts: 0,
      lastLoginAt: new Date()
    }
  });

  // Création session
  const sessionToken = generateSessionToken();
  const session = await createSession({ userId: user.id, token: sessionToken });

  const token = generateJWT(user);
  return { user, token, sessionToken };
}
```

---

## 9. Génération Automatique de Username

### Fonction Utilitaire

```typescript
// services/gateway/src/utils/username-generator.ts

interface UsernameSource {
  type: 'email' | 'phone' | 'oauth' | 'name';
  value: string;
  firstName?: string;
  lastName?: string;
}

export async function generateUsername(
  source: UsernameSource,
  prisma: PrismaClient
): Promise<string> {

  let base: string;

  switch (source.type) {
    case 'email':
      // alice@gmail.com → alice
      base = source.value.split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16);
      break;

    case 'phone':
      // +33612345678 + prénom Jean → jean
      if (source.firstName) {
        base = source.firstName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Enlever accents
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 16);
      } else {
        // Fallback : user_345678 (6 derniers chiffres)
        const digits = source.value.replace(/\D/g, '');
        base = `user_${digits.slice(-6)}`;
      }
      break;

    case 'oauth':
      // GitHub: octocat, Google: alice@gmail.com
      if (source.value.includes('@')) {
        base = source.value.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      } else {
        base = source.value.toLowerCase().replace(/[^a-z0-9]/g, '');
      }
      base = base.slice(0, 16);
      break;

    case 'name':
      // Jean Dupont → jeandupont
      const fullName = `${source.firstName}${source.lastName || ''}`;
      base = fullName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16);
      break;
  }

  // Garantir unicité avec suffixe
  let username = base;
  let suffix = 1;

  while (true) {
    const exists = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } }
    });

    if (!exists) break;

    // Limiter à 16 caractères total
    username = `${base.slice(0, 14)}${suffix}`;
    suffix++;
  }

  return username;
}
```

### Exemples de Génération

```typescript
// Email
generateUsername({ type: 'email', value: 'alice@gmail.com' })
→ "alice" (ou "alice1" si existe)

generateUsername({ type: 'email', value: 'jean.dupont@example.fr' })
→ "jeandupont" (ou "jeandupont2" si existe)

// Téléphone avec prénom
generateUsername({ type: 'phone', value: '+33612345678', firstName: 'Alice' })
→ "alice"

// Téléphone seul
generateUsername({ type: 'phone', value: '+33612345678' })
→ "user_345678"

// OAuth
generateUsername({ type: 'oauth', value: 'octocat' }) // GitHub
→ "octocat"

generateUsername({ type: 'oauth', value: 'alice@gmail.com' }) // Google
→ "alice"
```

---

## 10. API et Routes

### Nouvelles Routes à Créer

```typescript
// services/gateway/src/routes/auth/index.ts

// ============================================
// LOGIN CODE (Alternative Magic Link)
// ============================================

/**
 * POST /auth/send-login-code
 * Envoie un code de connexion temporaire
 */
app.post('/auth/send-login-code', async (req, res) => {
  const { identifier } = req.body; // email OU phone OU username
  const result = await sendLoginCode(identifier);
  res.json(result);
});

/**
 * POST /auth/verify-login-code
 * Valide un code de connexion
 */
app.post('/auth/verify-login-code', async (req, res) => {
  const { identifier, code } = req.body;
  const result = await verifyLoginCode(identifier, code);
  res.json(result);
});

// ============================================
// OAUTH
// ============================================

/**
 * GET /auth/oauth/:provider
 * Initie le flux OAuth (Google, GitHub, Apple, Facebook)
 */
app.get('/auth/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  const redirectUrl = getOAuthRedirectUrl(provider);
  res.redirect(redirectUrl);
});

/**
 * GET /auth/oauth/:provider/callback
 * Callback OAuth après autorisation
 */
app.get('/auth/oauth/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code } = req.query;

  const result = await handleOAuthCallback(provider, code);

  // Redirection frontend avec token
  res.redirect(`${FRONTEND_URL}/auth/callback?token=${result.token}`);
});

// ============================================
// VERIFICATION
// ============================================

/**
 * POST /auth/resend-email-verification
 * Renvoie l'email de vérification
 */
app.post('/auth/resend-email-verification', requireAuth, async (req, res) => {
  await resendEmailVerification(req.user.email);
  res.json({ success: true });
});

/**
 * POST /auth/resend-phone-verification
 * Renvoie le SMS de vérification
 */
app.post('/auth/resend-phone-verification', requireAuth, async (req, res) => {
  await resendPhoneVerification(req.user.phoneNumber);
  res.json({ success: true });
});

// ============================================
// WEBHOOKS
// ============================================

/**
 * POST /webhooks/brevo/email-events
 * Webhook Brevo pour bounces email
 */
app.post('/webhooks/brevo/email-events', async (req, res) => {
  // Validation signature
  // Traitement bounce
  res.status(200).json({ received: true });
});
```

---

## 11. UI Composants

### EmailVerificationStatus.tsx

```tsx
// apps/web/components/settings/EmailVerificationStatus.tsx
import { CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function EmailVerificationStatus({ user }) {
  const isVerified = !!user.emailVerifiedAt;
  const isFrozen = user.isFrozen && user.frozenReason === 'EMAIL_BOUNCE';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Label>Email</Label>
            <div className="flex items-center gap-2">
              <span>{user.email}</span>

              {isFrozen ? (
                <Badge variant="destructive">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Invalide (Gelé)
                </Badge>
              ) : isVerified ? (
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Vérifié
                </Badge>
              ) : (
                <Badge variant="warning">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Non vérifié
                </Badge>
              )}
            </div>
          </div>

          {!isVerified && !isFrozen && (
            <Button onClick={handleResendVerification}>
              <Mail className="mr-2 h-4 w-4" />
              Renvoyer le code
            </Button>
          )}

          {isFrozen && (
            <Button variant="destructive" onClick={handleContactSupport}>
              Contacter le support
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
```

### PhoneVerificationStatus.tsx

```tsx
// apps/web/components/settings/PhoneVerificationStatus.tsx
export function PhoneVerificationStatus({ user }) {
  const isVerified = !!user.phoneVerifiedAt;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Label>Téléphone</Label>
            <div className="flex items-center gap-2">
              <span>{user.phoneNumber || 'Non renseigné'}</span>

              {user.phoneNumber && (
                isVerified ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Vérifié
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Non vérifié
                  </Badge>
                )
              )}
            </div>
          </div>

          {user.phoneNumber && !isVerified && (
            <Button onClick={handleSendSMS}>
              <Phone className="mr-2 h-4 w-4" />
              Envoyer le code SMS
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
```

### SecurityLevelBadge.tsx

```tsx
// apps/web/components/settings/SecurityLevelBadge.tsx
export function SecurityLevelBadge({ level }) {
  const config = {
    0: { label: 'Non vérifié', color: 'destructive', icon: AlertTriangle },
    1: { label: 'Basique', color: 'warning', icon: Shield },
    2: { label: 'Vérifié', color: 'success', icon: ShieldCheck },
    3: { label: 'Sécurisé', color: 'default', icon: ShieldAlert },
  };

  const { label, color, icon: Icon } = config[level];

  return (
    <Badge variant={color}>
      <Icon className="mr-1 h-3 w-3" />
      Niveau {level} : {label}
    </Badge>
  );
}
```

---

## 12. Plan d'Implémentation

### Phase 1 : Modifications Base de Données (2h)

```bash
# Migration Prisma
npx prisma migrate dev --name add-security-levels-and-oauth

# Champs ajoutés :
- securityLevel, passwordlessEnabled
- loginCodeToken, loginCodeExpiry, loginCodeAttempts
- lastUsernameChange, usernameChangeCount
- portableIdentifier
- lastEmailBounceAt, emailBounceCount, emailBounceReason
- isFrozen, frozenAt, frozenReason

# Nouvelles tables :
- OAuthConnection
- EmailBounceEvent
```

### Phase 2 : Services Backend (4h)

```typescript
✅ SmsService (déjà existant)
✅ EmailService (déjà existant)
✅ SessionService (déjà existant)

🆕 LoginCodeService.ts (2h)
🆕 OAuthService.ts (1h)
🆕 EmailBounceService.ts (30min)
🆕 username-generator.ts (30min)
```

### Phase 3 : Routes API (3h)

```typescript
🆕 /auth/send-login-code
🆕 /auth/verify-login-code
🆕 /auth/oauth/:provider
🆕 /auth/oauth/:provider/callback
🆕 /webhooks/brevo/email-events
🆕 /admin/users/:id/unfreeze

✏️ Modifier /auth/register (gérer libération)
✏️ Modifier /auth/login (bloquer si frozen)
```

### Phase 4 : Middleware & Permissions (1h)

```typescript
🆕 require-security-level.ts
✏️ Ajouter checks securityLevel dans routes existantes
```

### Phase 5 : UI Composants (3h)

```tsx
🆕 EmailVerificationStatus.tsx
🆕 PhoneVerificationStatus.tsx
🆕 SecurityLevelBadge.tsx
🆕 OAuthConnectionsList.tsx
✏️ Intégration dans /settings#profile
```

### Phase 6 : Configuration Webhook Brevo (30min)

```bash
1. Créer webhook dans dashboard Brevo
2. URL : https://api.meeshy.me/webhooks/brevo/email-events
3. Events : hard_bounce, soft_bounce, blocked, spam
4. Secret : Générer et sauvegarder dans .env
```

### Phase 7 : Tests & Documentation (2h)

```bash
🆕 Tests unitaires LoginCodeService
🆕 Tests E2E flux OAuth
🆕 Tests webhook bounces
📝 Documentation API (Swagger)
📝 Documentation utilisateur
```

---

## 📊 Résumé des Changements

### Nouveau dans Prisma

| Entité | Type | Description |
|--------|------|-------------|
| `User.securityLevel` | Int | 0-3 : Niveau de sécurité |
| `User.passwordlessEnabled` | Boolean | Compte OAuth pur |
| `User.loginCodeToken` | String? | Code connexion temporaire |
| `User.isFrozen` | Boolean | Gel suite bounce email |
| `User.portableIdentifier` | String? | @username@meeshy.me |
| `OAuthConnection` | Model | Connexions OAuth |
| `EmailBounceEvent` | Model | Historique bounces |

### Réutilisé (Existant)

| Service | Utilisation |
|---------|-------------|
| **SessionService** | Gestion sessions robuste |
| **SmsService** | Envoi SMS via Brevo |
| **EmailService** | Envoi emails multilingues |
| **PasswordResetService** | Reset sécurisé |
| **MagicLinkService** | Base pour LoginCode |

### Nouveau

| Service | Description |
|---------|-------------|
| **LoginCodeService** | Code 6 chars (15 min) |
| **OAuthService** | OAuth multi-providers |
| **EmailBounceService** | Détection + gel bounces |
| **username-generator** | Génération intelligente |

---

## 🔐 Sécurité & Conformité

### Données Sensibles

| Donnée | Stockage | Protection |
|--------|----------|------------|
| Password | Bcrypt (cost=12) | ✅ Hashé |
| Session tokens | SHA-256 | ✅ Hashé |
| Login codes | Bcrypt | ✅ Hashé |
| OAuth tokens | AES-256-GCM | ✅ Chiffré |
| Email | Plaintext | ⚠️ Indexé |
| Phone | Plaintext E.164 | ⚠️ Indexé |

### RGPD & Privacy

- ✅ Droit à l'oubli : Soft delete avec anonymisation
- ✅ Portabilité : Export JSON complet
- ✅ Limitation durée : Auto-cleanup comptes non vérifiés
- ✅ Transparence : Notifications SMS/email lors gel
- ✅ Consentement : Opt-in explicite pour 2FA

### Rate Limiting

| Endpoint | Limite | Fenêtre |
|----------|--------|---------|
| `/auth/register` | 5 req | 1 heure |
| `/auth/login` | 10 req | 15 min |
| `/auth/send-login-code` | 3 req | 1 heure |
| `/auth/verify-login-code` | 3 tentatives | Token |

---

## 📈 Métriques de Succès

### KPIs à Suivre

1. **Taux de conversion inscription** : % qui finissent inscription
2. **Temps moyen d'inscription** : Objectif < 30 secondes
3. **Taux de vérification email** : % qui vérifient sous 24h
4. **Taux de comptes gelés** : % gelés suite bounces
5. **Taux de libération identifiants** : % comptes nettoyés

### Dashboard Admin

```typescript
// Requêtes Prisma pour métriques
const metrics = {
  totalUsers: await prisma.user.count(),
  unverified: await prisma.user.count({ where: { securityLevel: 0 }}),
  basic: await prisma.user.count({ where: { securityLevel: 1 }}),
  verified: await prisma.user.count({ where: { securityLevel: 2 }}),
  secured: await prisma.user.count({ where: { securityLevel: 3 }}),
  frozen: await prisma.user.count({ where: { isFrozen: true }}),
  passwordless: await prisma.user.count({ where: { passwordlessEnabled: true }}),
};
```

---

## ✅ Checklist Déploiement

### Avant Production

- [ ] Migration Prisma appliquée
- [ ] Webhook Brevo configuré et testé
- [ ] Variables d'environnement OAuth configurées
- [ ] Tests E2E passés (inscription, login, récupération)
- [ ] Rate limiting configuré (Redis)
- [ ] Monitoring activé (Sentry, logs)
- [ ] Documentation utilisateur publiée
- [ ] Email templates traduits (FR, EN, ES, PT)
- [ ] SMS templates validés (limites 160 caractères)

### Post-Déploiement

- [ ] Monitoring bounces email (premier jour)
- [ ] Vérification taux inscription (première semaine)
- [ ] Audit comptes gelés (J+3)
- [ ] Feedback utilisateurs collecté
- [ ] Optimisation taux conversion

---

## 📞 Support & Contact

**Questions techniques** : tech@meeshy.me
**Bounces/comptes gelés** : support@meeshy.me
**Sécurité** : security@meeshy.me

---

**Document rédigé le 2026-01-27**
**Dernière mise à jour** : 2026-01-27
**Version** : 1.0.0
