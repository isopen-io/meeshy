# Distinguer la CONNEXION de l'ACTIVITÉ — plan de correction

> **Pour les exécutants :** utiliser `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Les étapes sont des cases à cocher.

**Goal :** séparer deux notions aujourd'hui confondues dans un seul champ — *quelqu'un
utilise son compte* (CONNEXION) et *quelque chose s'est passé sous son identité*
(ACTIVITÉ) — puis faire que l'agent ne s'appuie que sur la première, au bon moment.

**Architecture :** aucune colonne nouvelle. Les deux horloges existent déjà et sont
correctes ; ce qui manque, ce sont les gardes qui les empêchent de mentir, et un
consommateur qui lise la bonne.

| notion | horloge | ce qu'elle vaut |
|---|---|---|
| **CONNEXION** | `UserSession.lastActivityAt` sur une session `isValid` **et** non expirée | écrite par le middleware d'authentification (access token) et `AuthService` (login / refresh). Propre. |
| **ACTIVITÉ** | `User.lastActiveAt` | écrite par les sockets, le typing, l'admission par lien. Utile pour la pastille de présence ; **inapte** à décider d'une absence. |

**Tech stack :** Fastify 5 + Prisma (MongoDB), Socket.IO, Jest, Next.js 15 (legacy).

**Spec :** issues #5712 (sessions), #5703 (critère de l'agent), #5663 (rotation).

## Contraintes globales

- **TDD strict.** Aucun code de production sans témoin rouge d'abord.
- **Aucune migration destructive.** MongoDB : les champs existants ne sont ni
  renommés ni supprimés.
- **`User.lastActiveAt` n'est PAS supprimé** : la pastille de présence en dépend
  (`getUserPresenceStatus`, règle 1/3/5 du `CLAUDE.md` racine, trois clients).
  On corrige qui l'écrit, pas ce qu'elle est.
- **Ordre imposé par le RISQUE croissant.** Les lots se livrent dans l'ordre A1 → A2 →
  C2 → C1 → B1 → A3. Chacun est livrable seul et réversible seul.
- **A3 est le seul lot qui touche l'authentification.** Il vient en dernier, derrière un
  drapeau de configuration, et ne se livre pas le même jour qu'un autre lot.

---

## Vue d'ensemble des lots

| lot | ce qu'il ferme | risque | issue |
|---|---|---|---|
| **A1** | `extendSessionExpiry` ressuscite une session morte | **nul** — aucun appelant en production | #5712 |
| **A2** | 140 sessions expirées se déclarent valides | faible — données, réversible | #5712 |
| **C2** | l'agent parle à quelqu'un revenu pendant le délai de livraison | faible — agent seul | #5703 |
| **C1** | le critère de sélection documenté et verrouillé par un témoin | nul | #5703 |
| **B1** | le legacy rouvre une socket avec un jeton expiré | moyen — client | #5712 |
| **A3** | l'auth socket accepte un JWT dont la session est morte | **élevé** | #5712 |

---

## Structure des fichiers

| fichier | responsabilité |
|---|---|
| `services/gateway/src/services/SessionService.ts` | A1 : garde d'expiration sur `extendSessionExpiry` |
| `services/gateway/src/jobs/session-expiry-sweep.ts` *(créer)* | A2 : balayage d'invalidation |
| `services/agent/src/delivery/presence-recheck.ts` *(créer)* | C2 : la loi « est-il encore absent ? », pure |
| `services/agent/src/delivery/redis-delivery-queue.ts` | C2 : câblage de la revérification |
| `services/agent/src/memory/mongo-persistence.ts` | C1 : témoin de non-régression du critère |
| `apps/web/services/auth-manager.service.ts` | B1 : garde d'échéance côté legacy |
| `services/gateway/src/socketio/handlers/AuthHandler.ts` | A3 : refus d'un JWT sans session vivante |

---

## Lot A1 — `extendSessionExpiry` refuse une session expirée

**Files :**
- Modify : `services/gateway/src/services/SessionService.ts` (fonction `extendSessionExpiry`)
- Test : `services/gateway/src/__tests__/unit/services/SessionService.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit : `extendSessionExpiry(token, days?) => Promise<boolean>` — rend `false` sur
  session expirée, signature inchangée.

- [ ] **Étape 1 : écrire le témoin rouge**

```typescript
it('refuse de prolonger une session déjà expirée', async () => {
  // Une session expirée hier : la prolonger la ressusciterait.
  mockPrisma.userSession.findFirst.mockResolvedValue(null);

  const result = await extendSessionExpiry('token-dune-session-morte', 30);

  expect(result).toBe(false);
  expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
});

it('passe expiresAt au filtre de lecture', async () => {
  mockPrisma.userSession.findFirst.mockResolvedValue(null);
  const avant = Date.now();

  await extendSessionExpiry('un-token');

  const where = mockPrisma.userSession.findFirst.mock.calls[0][0].where;
  expect(where.expiresAt.gt).toBeInstanceOf(Date);
  expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(avant - 5_000);
});
```

- [ ] **Étape 2 : vérifier qu'il échoue**

Run : `cd services/gateway && npx jest src/__tests__/unit/services/SessionService.test.ts -t "expirée"`
Attendu : ÉCHEC — `where.expiresAt` vaut `undefined`.

- [ ] **Étape 3 : poser la garde**

```typescript
const session = await db.userSession.findFirst({
  // Une session EXPIRÉE ne se prolonge pas — la prolonger la ressusciterait.
  // `validateSession` porte déjà ce filtre ; cette jumelle l'avait oublié (#5712).
  where: { sessionToken, isValid: true, expiresAt: { gt: new Date() } },
});
```

- [ ] **Étape 4 : vérifier le vert**

Run : `cd services/gateway && npx jest src/__tests__/unit/services/SessionService.test.ts`
Attendu : toutes vertes, y compris les trois témoins préexistants de `extendSessionExpiry`.

- [ ] **Étape 5 : committer**

```bash
git add services/gateway/src/services/SessionService.ts \
        services/gateway/src/__tests__/unit/services/SessionService.test.ts
git commit -m "fix(gateway): une session expirée ne se prolonge plus

Refs #5712"
```

---

## Lot A2 — Une session expirée cesse de se déclarer valide

**Files :**
- Create : `services/gateway/src/jobs/session-expiry-sweep.ts`
- Test : `services/gateway/src/__tests__/unit/jobs/session-expiry-sweep.test.ts`
- Modify : `services/gateway/src/server.ts` (enregistrement du balayage)

**Interfaces :**
- Produit : `sweepExpiredSessions(prisma) => Promise<number>` — nombre de sessions
  invalidées.

- [ ] **Étape 1 : écrire le témoin rouge**

```typescript
describe('sweepExpiredSessions()', () => {
  it('invalide les sessions expirées encore marquées valides', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 140 });
    const prisma = { userSession: { updateMany } } as never;

    expect(await sweepExpiredSessions(prisma)).toBe(140);

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.isValid).toBe(true);
    expect(arg.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(arg.data.isValid).toBe(false);
    expect(arg.data.invalidatedReason).toBe('expired');
    expect(arg.data.invalidatedAt).toBeInstanceOf(Date);
  });

  it('ne touche pas les sessions encore valides', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = { userSession: { updateMany } } as never;

    expect(await sweepExpiredSessions(prisma)).toBe(0);
  });
});
```

- [ ] **Étape 2 : vérifier qu'il échoue**

Run : `cd services/gateway && npx jest src/__tests__/unit/jobs/session-expiry-sweep.test.ts`
Attendu : ÉCHEC — le module n'existe pas.

- [ ] **Étape 3 : écrire le balayage**

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Une session dont `expiresAt` est dépassé cesse de se déclarer valide.
 *
 * Mesuré le 2026-09-08 : 140 lignes expirées portaient `isValid: true`, dont
 * certaines depuis mars — 41 % des sessions dites valides, sur 34 utilisateurs.
 * Aucun accès n'en découlait (`validateSession` filtre sur `expiresAt`), mais
 * toute lecture qui se fie à `isValid` sans joindre `expiresAt` conclut faux :
 * l'espace admin, les statistiques, et le diagnostic de #5703 s'y sont trompés.
 */
export async function sweepExpiredSessions(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.userSession.updateMany({
    where: { isValid: true, expiresAt: { lt: new Date() } },
    data: { isValid: false, invalidatedAt: new Date(), invalidatedReason: 'expired' },
  });
  return count;
}
```

- [ ] **Étape 4 : vérifier le vert**

Run : `cd services/gateway && npx jest src/__tests__/unit/jobs/session-expiry-sweep.test.ts`

- [ ] **Étape 5 : brancher le balayage au démarrage**

Dans `server.ts`, à côté des autres tâches périodiques, toutes les 6 heures :

```typescript
setInterval(() => {
  sweepExpiredSessions(this.prisma)
    .then((n) => { if (n > 0) logger.info(`[Sessions] ${n} session(s) expirée(s) invalidée(s)`); })
    .catch((err) => logger.error('[Sessions] Balayage échoué', err));
}, 6 * 60 * 60 * 1000).unref();
```

- [ ] **Étape 6 : committer**

```bash
git add services/gateway/src/jobs/session-expiry-sweep.ts \
        services/gateway/src/__tests__/unit/jobs/session-expiry-sweep.test.ts \
        services/gateway/src/server.ts
git commit -m "fix(gateway): une session expirée cesse de se déclarer valide

Refs #5712"
```

---

## Lot C2 — L'agent revérifie la présence AU MOMENT de livrer

C'est le trou le plus visible pour l'utilisateur. Une action est enfilée avec un délai
allant jusqu'à **360 minutes** (`maxDelayMinutes`), et `redis-delivery-queue.ts` ne
revérifie **rien** avant de livrer. Si la personne revient entre-temps, l'agent parle à
sa place **pendant qu'elle est connectée**.

**Files :**
- Create : `services/agent/src/delivery/presence-recheck.ts`
- Create : `services/agent/src/__tests__/delivery/presence-recheck.test.ts`
- Modify : `services/agent/src/delivery/redis-delivery-queue.ts` (méthode `deliver`)

**Interfaces :**
- Produit : `peutEncoreParler(etat) => boolean` où
  `etat = { isOnline: boolean; derniereConnexionMs: number | null; seuilHeures: number; maintenantMs: number }`.
- Consomme : `MongoPersistence` — ajouter
  `getPresenceForDelivery(userId) => Promise<{ isOnline: boolean; derniereConnexionMs: number | null }>`.

- [ ] **Étape 1 : écrire le témoin rouge de la loi**

```typescript
import { peutEncoreParler } from '../../delivery/presence-recheck';

const HEURE = 3_600_000;
const MAINTENANT = 1_800_000_000_000;

describe('peutEncoreParler()', () => {
  it('refuse quand la personne est revenue EN LIGNE', () => {
    expect(peutEncoreParler({
      isOnline: true, derniereConnexionMs: null, seuilHeures: 72, maintenantMs: MAINTENANT,
    })).toBe(false);
  });

  it('refuse quand elle s\'est reconnectée depuis la mise en file', () => {
    expect(peutEncoreParler({
      isOnline: false,
      derniereConnexionMs: MAINTENANT - 2 * HEURE,
      seuilHeures: 72,
      maintenantMs: MAINTENANT,
    })).toBe(false);
  });

  it('accepte quand elle est toujours absente', () => {
    expect(peutEncoreParler({
      isOnline: false,
      derniereConnexionMs: MAINTENANT - 200 * HEURE,
      seuilHeures: 72,
      maintenantMs: MAINTENANT,
    })).toBe(true);
  });

  it('accepte quand elle n\'a JAMAIS eu de session', () => {
    expect(peutEncoreParler({
      isOnline: false, derniereConnexionMs: null, seuilHeures: 72, maintenantMs: MAINTENANT,
    })).toBe(true);
  });
});
```

- [ ] **Étape 2 : vérifier qu'il échoue**

Run : `cd services/agent && npx jest src/__tests__/delivery/presence-recheck.test.ts`
Attendu : ÉCHEC — le module n'existe pas.

- [ ] **Étape 3 : écrire la loi**

```typescript
/**
 * « Est-il encore absent ? » — posée AU MOMENT DE LIVRER, pas à la sélection.
 *
 * Une action peut attendre jusqu'à 360 minutes en file (`maxDelayMinutes`). La
 * sélection l'a jugée légitime il y a six heures ; entre-temps la personne a pu
 * revenir. Livrer sans redemander, c'est parler à sa place PENDANT qu'elle est là
 * — le défaut le plus visible que l'agent puisse produire.
 *
 * `derniereConnexionMs` est l'horloge de CONNEXION (`UserSession.lastActivityAt`
 * sur une session vivante), jamais `User.lastActiveAt` : cette dernière est
 * écrite par une socket qui se rouvre toute seule (#5703, #5712).
 *
 * `null` ⇒ aucune session : la personne ne s'est jamais connectée sur la période
 * retenue, donc elle est bien absente.
 */
export function peutEncoreParler(etat: {
  readonly isOnline: boolean;
  readonly derniereConnexionMs: number | null;
  readonly seuilHeures: number;
  readonly maintenantMs: number;
}): boolean {
  if (etat.isOnline) return false;
  if (etat.derniereConnexionMs === null) return true;
  return etat.derniereConnexionMs < etat.maintenantMs - etat.seuilHeures * 3_600_000;
}
```

- [ ] **Étape 4 : vérifier le vert**

Run : `cd services/agent && npx jest src/__tests__/delivery/presence-recheck.test.ts`

- [ ] **Étape 5 : témoin rouge de la LECTURE de présence**

```typescript
it('lit la connexion sur une session VIVANTE, jamais sur User.lastActiveAt', async () => {
  const findFirst = jest.fn().mockResolvedValue({ lastActivityAt: new Date(1_000) });
  const findUnique = jest.fn().mockResolvedValue({ isOnline: false });
  const persistence = new MongoPersistence({
    userSession: { findFirst }, user: { findUnique },
  } as never);

  const p = await persistence.getPresenceForDelivery('u1');

  const where = findFirst.mock.calls[0][0].where;
  expect(where.userId).toBe('u1');
  expect(where.isValid).toBe(true);
  expect(where.expiresAt.gt).toBeInstanceOf(Date);
  expect(p.derniereConnexionMs).toBe(1_000);
  expect(p.isOnline).toBe(false);
});
```

- [ ] **Étape 6 : implémenter la lecture**

```typescript
async getPresenceForDelivery(userId: string): Promise<{ isOnline: boolean; derniereConnexionMs: number | null }> {
  const [session, user] = await Promise.all([
    this.prisma.userSession.findFirst({
      // Session VIVANTE seulement : une session expirée ne prouve aucune présence,
      // et 140 d'entre elles se déclaraient valides en production (#5712).
      where: { userId, isValid: true, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
      select: { lastActivityAt: true },
    }),
    this.prisma.user.findUnique({ where: { id: userId }, select: { isOnline: true } }),
  ]);
  return {
    isOnline: user?.isOnline ?? false,
    derniereConnexionMs: session?.lastActivityAt?.getTime() ?? null,
  };
}
```

- [ ] **Étape 7 : câbler dans `deliver()`**

Dans `redis-delivery-queue.ts`, au début de `deliver(item)` — **avant** tout envoi :

```typescript
const presence = await this.persistence.getPresenceForDelivery(item.action.asUserId);
if (!peutEncoreParler({
  isOnline: presence.isOnline,
  derniereConnexionMs: presence.derniereConnexionMs,
  seuilHeures: item.inactivityThresholdHours ?? 72,
  maintenantMs: Date.now(),
})) {
  console.log(`[DeliveryQueue] Action abandonnée : ${item.action.asUserId} est revenu`);
  return; // l'item est retiré de la file, pas rejoué
}
```

- [ ] **Étape 8 : témoin d'intégration de l'abandon**

```typescript
it('abandonne une action dont l\'utilisateur est revenu en ligne', async () => {
  const persistence = { getPresenceForDelivery: jest.fn().mockResolvedValue({ isOnline: true, derniereConnexionMs: null }) };
  const zmq = { publishMessage: jest.fn(), publishReaction: jest.fn() };
  const queue = new RedisDeliveryQueue(redisMock, zmq as never, persistence as never);

  await queue.deliver(itemDeTest());

  expect(zmq.publishMessage).not.toHaveBeenCalled();
});
```

- [ ] **Étape 9 : vérifier le vert et la suite complète**

Run : `cd services/agent && npx jest && npx tsc --noEmit`
Attendu : toutes vertes, types propres.

- [ ] **Étape 10 : committer**

```bash
git add services/agent/src/delivery/ services/agent/src/__tests__/delivery/ \
        services/agent/src/memory/mongo-persistence.ts
git commit -m "feat(agent): l'agent revérifie l'absence au moment de livrer, pas seulement de choisir

Refs #5703"
```

---

## Lot C1 — Verrouiller le critère de sélection par un témoin de non-régression

Le critère est **déjà** posé (commits `7c84e622df` et `6b902c8abc`). Ce lot ne change
aucun comportement : il empêche le retour en arrière.

**Files :**
- Test : `services/agent/src/__tests__/memory/connexion-vs-activite-guard.test.ts` *(créer)*

- [ ] **Étape 1 : écrire la garde de source**

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde de NON-RÉGRESSION : `User.lastActiveAt` ne doit jamais redevenir le
 * critère de sélection. Elle est écrite par une socket qui se rouvre seule
 * (#5703) ; seule la CONNEXION — `UserSession.lastActivityAt` sur session
 * vivante — décide d'une absence.
 *
 * Une garde de SOURCE prouve qu'une ligne existe, pas qu'elle s'exécute : les
 * témoins de comportement voisins (`mongo-persistence-connexion.test.ts`) sont
 * la vraie preuve. Celle-ci empêche seulement la marche arrière silencieuse.
 */
it('les sélecteurs ne filtrent JAMAIS sur user.lastActiveAt', () => {
  const source = readFileSync(join(__dirname, '../../memory/mongo-persistence.ts'), 'utf8');
  const selecteurs = source.slice(source.indexOf('async getPotentialControlledUsers'));

  expect(selecteurs).not.toMatch(/user:\s*\{[^}]*lastActiveAt/s);
  expect(selecteurs).toMatch(/sessions:\s*\{\s*none:\s*\{\s*lastActivityAt/);
});
```

- [ ] **Étape 2 : vérifier qu'elle passe SUR LE CODE ACTUEL, et qu'elle tomberait sinon**

Run : `cd services/agent && npx jest src/__tests__/memory/connexion-vs-activite-guard.test.ts`
Attendu : VERT. Puis remettre temporairement `lastActiveAt: { lt: threshold }` dans le
`user:` d'un sélecteur, relancer, constater le ROUGE, et annuler la modification.
**Une garde qu'on n'a pas vue tomber ne garde rien.**

- [ ] **Étape 3 : committer**

```bash
git add services/agent/src/__tests__/memory/connexion-vs-activite-guard.test.ts
git commit -m "test(agent): le critère de sélection ne peut plus revenir à lastActiveAt

Refs #5703"
```

---

## Lot B1 — Le legacy cesse d'utiliser une session authentifiée expirée

Le legacy vérifie l'échéance **uniquement pour les sessions anonymes**
(`auth-manager.service.ts:233`). La v3.1 le fait déjà pour les sessions
authentifiées (`persisted.expiresAt <= now()`). Ce lot porte la symétrie manquante.

**Files :**
- Modify : `apps/web/services/auth-manager.service.ts`
- Test : `apps/web/__tests__/services/auth-manager.session-expiry.test.ts` *(créer)*

- [ ] **Étape 1 : écrire le témoin rouge**

```typescript
it('rejette une session authentifiée dont l\'échéance est passée', () => {
  const manager = createAuthManager();
  manager.persist({ token: 't', user: userDeTest(), expiresAt: Date.now() - 60_000 });

  expect(manager.restore()).toBeNull();
});

it('conserve une session authentifiée encore valide', () => {
  const manager = createAuthManager();
  manager.persist({ token: 't', user: userDeTest(), expiresAt: Date.now() + 3_600_000 });

  expect(manager.restore()?.token).toBe('t');
});
```

- [ ] **Étape 2 : vérifier qu'il échoue**

Run : `cd apps/web && npx jest __tests__/services/auth-manager.session-expiry.test.ts`

- [ ] **Étape 3 : poser la garde, symétrique de celle de l'anonyme**

```typescript
// Symétrique de la garde des sessions ANONYMES (ligne 233), et de ce que fait
// déjà la v3.1. Sans elle, le legacy garde un jeton mort et rouvre une socket
// avec — ce qui écrit `lastActiveAt` côté serveur et fait paraître présente une
// personne absente depuis des mois (#5712).
if (session.expiresAt && Date.now() > session.expiresAt) {
  this.clear();
  return null;
}
```

- [ ] **Étape 4 : vérifier le vert, puis la suite du service d'auth**

Run : `cd apps/web && npx jest __tests__/services/auth`
Attendu : vertes. **Vérifier aussi le cliquet de dette** :
`bash scripts/check-lint-debt.sh` — il ne doit pas monter.

- [ ] **Étape 5 : committer**

```bash
git add apps/web/services/auth-manager.service.ts \
        apps/web/__tests__/services/auth-manager.session-expiry.test.ts
git commit -m "fix(web): le legacy ne réutilise plus une session authentifiée expirée

Refs #5712"
```

---

## Lot A3 — L'authentification socket exige une session vivante

**Le lot le plus sensible du plan.** Il peut déconnecter des utilisateurs en
production s'il se trompe. À livrer seul, un jour où quelqu'un peut surveiller.

**Files :**
- Modify : `services/gateway/src/socketio/handlers/AuthHandler.ts` (autour de la ligne 293)
- Test : `services/gateway/src/__tests__/unit/socketio/auth-handler-session.test.ts` *(créer)*

- [ ] **Étape 1 : écrire les témoins rouges — les DEUX sens**

```typescript
it('accepte une socket dont la session est vivante', async () => {
  prisma.userSession.findFirst.mockResolvedValue({ id: 's1' });
  const ok = await authenticateSocket(socketAvecJwtValide());
  expect(ok).toBe(true);
});

it('REFUSE une socket dont le JWT est bon mais la session morte', async () => {
  prisma.userSession.findFirst.mockResolvedValue(null);
  const ok = await authenticateSocket(socketAvecJwtValide());
  expect(ok).toBe(false);
});

it('n\'écrit AUCUNE activité quand la session est morte', async () => {
  prisma.userSession.findFirst.mockResolvedValue(null);
  await authenticateSocket(socketAvecJwtValide());
  expect(maintenanceService.updateUserOnlineStatus).not.toHaveBeenCalled();
});
```

- [ ] **Étape 2 : vérifier qu'ils échouent**

Run : `cd services/gateway && npx jest src/__tests__/unit/socketio/auth-handler-session.test.ts`

- [ ] **Étape 3 : poser la garde DERRIÈRE UN DRAPEAU**

```typescript
// Une socket s'authentifiait sur le seul JWT, sans vérifier que la UserSession
// vit encore : une appli installée avec un jeton mort rouvrait sa socket et
// faisait écrire `lastActiveAt`, donc paraître présente une personne absente
// depuis des mois (#5712).
//
// Derrière un drapeau : ce chemin porte TOUTES les connexions temps réel de la
// production. On l'arme après observation, on le désarme sans redéploiement.
if (process.env.SOCKET_REQUIRES_LIVE_SESSION === 'true') {
  const vivante = await this.prisma.userSession.findFirst({
    where: { userId: user.id, isValid: true, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!vivante) {
    logger.warn('[AuthHandler] Socket refusée : aucune session vivante', { userId: user.id });
    return false;
  }
}
```

- [ ] **Étape 4 : vérifier le vert dans les deux positions du drapeau**

Run : `cd services/gateway && npx jest src/__tests__/unit/socketio/`
Attendu : vertes drapeau armé **et** désarmé — le test pose `process.env` lui-même.

- [ ] **Étape 5 : MESURER avant d'armer**

Sur la production, drapeau **désarmé**, compter ce que la garde refuserait :

```bash
ssh root@meeshy.me 'docker exec meeshy-database mongosh "mongodb://localhost:27017/meeshy" --quiet --eval "
var vivantes = db.UserSession.distinct(\"userId\", {isValid:true, expiresAt:{\$gt:new Date()}});
print(\"utilisateurs AVEC session vivante : \" + vivantes.length);
print(\"connectés SANS session vivante    : \" + db.User.countDocuments({isOnline:true, _id:{\$nin:vivantes}}));
"'
```

**Critère de décision :** si des utilisateurs en ligne n'ont aucune session vivante, la
garde les déconnecterait. **Ne pas armer** — comprendre d'abord pourquoi (jetons longue
durée, clients qui ne renouvellent pas leur session), et traiter cette cause.

- [ ] **Étape 6 : committer le code désarmé**

```bash
git add services/gateway/src/socketio/handlers/AuthHandler.ts \
        services/gateway/src/__tests__/unit/socketio/auth-handler-session.test.ts
git commit -m "feat(gateway): la socket peut exiger une session vivante (drapeau, désarmé)

Refs #5712"
```

- [ ] **Étape 7 : armer, séparément, après lecture de la mesure**

Décision du porteur, sur la mesure de l'étape 5. Armer en posant
`SOCKET_REQUIRES_LIVE_SESSION=true` dans le `.env` de production, puis surveiller
`[AuthHandler] Socket refusée` pendant une heure. Désarmer au moindre doute.

---

## Auto-revue du plan

**Couverture de la spec :** #5712 → A1 (prolongation), A2 (hygiène), B1 (legacy), A3
(socket). #5703 → C1 (critère verrouillé), C2 (moment de livrer). #5663 → déjà livré,
non rejoué ici.

**Placeholders :** aucun. Chaque étape porte son code et sa commande.

**Cohérence des types :** `peutEncoreParler` consomme exactement ce que
`getPresenceForDelivery` produit (`isOnline: boolean`, `derniereConnexionMs: number | null`).
`sweepExpiredSessions` rend `number`, consommé par le `setInterval` de A2.

**Ce que le plan ne fait PAS, et pourquoi :**
- Il n'ajoute **aucune colonne**. Les deux horloges existent ; le défaut était l'absence
  de gardes et le mauvais consommateur.
- Il ne supprime pas `User.lastActiveAt` : la pastille de présence en dépend sur les
  trois clients.
- Il ne touche pas au calcul de présence (règle 1/3/5) : hors sujet, et changer les deux
  à la fois rendrait toute régression indiagnosticable.
