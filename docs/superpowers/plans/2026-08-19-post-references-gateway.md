# Références de personnes dans les posts — Plan gateway

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de référencer une personne dans un post, un réel, une story ou un statut selon quatre modes d'exposition (INLINE / PINNED / NOTE / SILENT), lui ouvrir le contenu même expiré, et le notifier de la même façon quel que soit le mode.

**Architecture:** Le client ne déclare que ce que le texte ne peut pas porter (PINNED, NOTE, SILENT) ; le serveur relit les `@handle` de `content` **et** de `storyEffects.textObjects[].text` pour dériver INLINE lui-même. Le droit d'accès par référence est vérifié par une unité unique (`resolveReferenceAccess`) que toutes les ouvertures détaillées appellent, et il se consomme sur `POST /posts/:postId/view` — jamais sur une lecture, qu'un prefetch déclencherait.

**Tech Stack:** TypeScript strict, Fastify 5, Prisma + MongoDB 8, Zod, Jest (exécuté sous bun).

**Spec:** `docs/superpowers/specs/2026-08-19-post-references-design.md`

## Global Constraints

- **Portée de ce plan : gateway uniquement.** Les clients iOS et web font l'objet de plans distincts, écrits après celui-ci. Ce plan produit un backend complet et testable seul.
- **TDD non négociable** : aucun code de production sans test rouge d'abord (`CLAUDE.md`).
- **TypeScript strict, jamais `any`** — `unknown` + validation si le type est réellement inconnu.
- **Pas de paire booléen + horodatage** : un `DateTime?` nullable suffit (`null`/absent = faux).
- **Prisma-Mongo** : `{ champ: null }` ne matche **pas** un champ absent. Tout filtre sur un champ optionnel s'écrit `{ OR: [{ champ: { isSet: false } }, { champ: null }] }`.
- **Immutabilité** : pas de mutation, méthodes de tableau plutôt que boucles.
- **Commandes de test** : `cd services/gateway && bun run test -- <chemin> -t "<nom>"`. Suite complète : `bun run test:coverage` (740/740 suites vertes attendues).
- **Prérequis d'environnement** (sinon ~17 suites échouent) :
  ```bash
  bun install --ignore-scripts
  cd packages/shared && npx prisma generate --generator client && bun run build
  ```
- **Vocabulaire** : `PostType` vaut `POST | REEL | STORY | STATUS`. **MOOD n'existe pas** — c'est le nom produit de STATUS.
- **Valeurs exactes** : fenêtre de consultation post-expiration = **24 h**. Plafond de grâce du balayage = **7 jours après `expiresAt`**. Extrait de notification = **100 caractères**.

---

### Task 1: Schéma — enum à 4 modes, horodatage de consommation, migration

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (enum `PostMentionSource` ~ligne 4171, model `PostMention` ~ligne 4186)
- Create: `scripts/migrations/migrate-post-mention-display.ts`
- Test: `services/gateway/src/__tests__/unit/services/posts/postMentionDisplay.test.ts`

**Interfaces:**
- Consumes: rien (première tâche)
- Produces: `PostMentionDisplay` (enum Prisma : `INLINE | PINNED | NOTE | SILENT`), `PostMention.display: PostMentionDisplay?`, `PostMention.expiredViewAt: DateTime?`, et le type TS `PostMentionDisplayValue = 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT'` exporté depuis `services/gateway/src/services/posts/postMentions.ts`

- [ ] **Step 1: Écrire le test rouge du lecteur de mode**

Créer `services/gateway/src/__tests__/unit/services/posts/postMentionDisplay.test.ts` :

```ts
/**
 * `readDisplay` — comment une ligne `PostMention` déjà en base se lit.
 *
 * Une ligne écrite avant le discriminant n'a PAS le champ (sous MongoDB, un
 * `@default` ne s'applique qu'à l'écriture). Elle doit se lire INLINE : c'était
 * la seule voie qui existait quand elle a été écrite.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readDisplay } from '../../../../services/posts/postMentions';

describe('readDisplay', () => {
  it('lit INLINE quand le champ est absent', () => {
    expect(readDisplay(undefined)).toBe('INLINE');
  });

  it('lit INLINE quand le champ est null', () => {
    expect(readDisplay(null)).toBe('INLINE');
  });

  it('rend le mode tel quel quand il est renseigné', () => {
    expect(readDisplay('PINNED')).toBe('PINNED');
    expect(readDisplay('NOTE')).toBe('NOTE');
    expect(readDisplay('SILENT')).toBe('SILENT');
    expect(readDisplay('INLINE')).toBe('INLINE');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postMentionDisplay.test.ts
```

Attendu : FAIL — `readDisplay is not a function` (l'export n'existe pas).

- [ ] **Step 3: Modifier le schéma Prisma**

Dans `packages/shared/prisma/schema.prisma`, remplacer l'enum `PostMentionSource` par :

```prisma
/// Comment une référence se montre — et, par voie de conséquence, comment
/// l'édition la réconcilie.
///
/// INLINE est DÉRIVÉ : le client ne le déclare jamais. Le serveur relit les
/// `@handle` du contenu à chaque écriture, valide l'existence de la personne,
/// et pose ce mode lui-même. Les trois autres sont DÉCLARÉS — le texte ne peut
/// pas les porter, donc rien ne permettrait de les relire.
enum PostMentionDisplay {
  /// `@handle` écrit dans le texte (légende ou objet texte de canevas).
  /// Relu à chaque édition : retiré du texte, il disparaît.
  INLINE
  /// Badge posé sur le canevas. Déclaré, tri-état à l'édition.
  PINNED
  /// Rangée « Avec … » sous le contenu. Déclaré, tri-état.
  NOTE
  /// Métadonnée seule : notifiée, invisible pour les tiers. Déclaré, tri-état.
  SILENT
}
```

Puis, dans le model `PostMention`, remplacer le champ `source` et ajouter l'horodatage :

```prisma
  /// OPTIONNEL, et sans `@default` : sous MongoDB un `@default` ne s'applique
  /// qu'à l'ÉCRITURE — les lignes déjà en base n'ont pas ce champ, et un champ
  /// requis absent fait échouer la LECTURE. Absent se lit INLINE.
  display           PostMentionDisplay?

  /// Début de l'UNIQUE fenêtre de 24 h accordée APRÈS expiration du contenu.
  /// Absent = droit intact. Nullable seul, sans booléen jumeau.
  ///
  /// La ligne SURVIT à la consommation : la détruire fausserait l'inbox
  /// `/mentions`, les compteurs et l'affinité de recommandation
  /// (`PostFeedService.getMentionsByPost`).
  expiredViewAt     DateTime?
```

- [ ] **Step 4: Régénérer le client Prisma**

```bash
cd packages/shared && npx prisma generate --generator client && bun run build
```

Attendu : génération sans erreur. `PostMentionSource` disparaît des types générés.

- [ ] **Step 5: Écrire `readDisplay`**

Dans `services/gateway/src/services/posts/postMentions.ts`, remplacer le type `PostMentionSourceValue` par :

```ts
/**
 * Miroir de l'enum Prisma `PostMentionDisplay`. Deux familles, deux
 * réconciliations : INLINE est relu dans le texte à chaque édition, les trois
 * autres ne bougent que si le client renvoie leur liste.
 */
export type PostMentionDisplayValue = 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT';

/** Les seuls modes qu'un client a le droit de DÉCLARER. INLINE est dérivé. */
export type DeclarablePostMentionDisplay = Exclude<PostMentionDisplayValue, 'INLINE'>;

/**
 * Le mode d'une ligne déjà en base. `null` comme `undefined` se lisent INLINE :
 * c'était la seule voie qui existait avant le discriminant, et c'est ce que
 * faisait la réconciliation d'alors.
 */
export function readDisplay(
  display: PostMentionDisplayValue | null | undefined
): PostMentionDisplayValue {
  return display ?? 'INLINE';
}
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postMentionDisplay.test.ts
```

Attendu : PASS — 3 tests.

- [ ] **Step 7: Écrire le script de migration**

Créer `scripts/migrations/migrate-post-mention-display.ts` :

```ts
/**
 * `PostMention.source` → `PostMention.display`.
 *
 * `CONTENT` devient `INLINE`, `CANVAS` devient `PINNED`. Les lignes SANS champ
 * ne sont pas touchées : elles se lisent déjà INLINE (`readDisplay`), et les
 * réécrire coûterait une passe complète pour un résultat identique.
 *
 * Piège Prisma-Mongo : `{ source: null }` ne matche PAS un document où la clé
 * est absente. On cible donc `isSet: true`, seul prédicat qui distingue « champ
 * présent » de « champ jamais écrit ».
 *
 * Usage : npx tsx scripts/migrations/migrate-post-mention-display.ts [--dry-run]
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const MAPPING = [
  { from: 'CONTENT', to: 'INLINE' },
  { from: 'CANVAS', to: 'PINNED' },
] as const;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  try {
    for (const { from, to } of MAPPING) {
      const matched = await prisma.postMention.count({
        where: { source: { isSet: true, equals: from } } as never,
      });

      if (dryRun) {
        console.log(`[dry-run] ${from} → ${to} : ${matched} ligne(s)`);
        continue;
      }

      const result = await prisma.$runCommandRaw({
        update: 'PostMention',
        updates: [{
          q: { source: from },
          u: { $set: { display: to }, $unset: { source: '' } },
          multi: true,
        }],
      });
      console.log(`${from} → ${to} : ${matched} ligne(s) attendues, résultat`, result);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[migrate-post-mention-display] échec', error);
  process.exit(1);
});
```

- [ ] **Step 8: Vérifier le script à blanc**

```bash
npx tsx scripts/migrations/migrate-post-mention-display.ts --dry-run
```

Attendu : deux lignes de comptage, aucune écriture. Si la connexion MongoDB n'est pas disponible en local, l'échec de connexion est acceptable à ce stade — le script sera joué à la migration.

- [ ] **Step 9: Committer**

```bash
git add packages/shared/prisma/schema.prisma \
        scripts/migrations/migrate-post-mention-display.ts \
        services/gateway/src/services/posts/postMentions.ts \
        services/gateway/src/__tests__/unit/services/posts/postMentionDisplay.test.ts
git commit -m "feat(shared,gateway): quatre modes d'exposition pour une référence de post

Une pastille de canevas et une note sous le contenu ne se montrent pas
pareil, et une référence silencieuse ne se montre pas du tout — l'ancien
discriminant CONTENT/CANVAS ne savait dire que d'où venait la ligne."
```

---

### Task 2: Dérivation INLINE — lire les deux sources de texte

**Files:**
- Create: `services/gateway/src/services/posts/mentionableText.ts`
- Test: `services/gateway/src/__tests__/unit/services/posts/mentionableText.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: `collectMentionableText(params: { content?: string | null; storyEffects?: unknown }): string[]` — les fragments de texte dans lesquels un `@handle` compte comme mention INLINE, badges de référence exclus

**Pourquoi cette tâche existe :** une story n'écrit pas son texte dans `content`. La légende y vit, mais le texte porté par la slide vit dans `storyEffects.textObjects[].text`, que le gateway ne lit pas du tout aujourd'hui. Et un badge PINNED **est** un objet texte portant `@pseudo` : le lire naïvement le re-dériverait en INLINE, écrasant le mode choisi par l'auteur.

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/mentionableText.test.ts` :

```ts
/**
 * `collectMentionableText` — où le serveur a le droit de lire un `@handle`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { collectMentionableText } from '../../../../services/posts/mentionableText';

describe('collectMentionableText', () => {
  it('rend la légende seule quand il n\'y a pas d\'effets', () => {
    expect(collectMentionableText({ content: 'salut @alice' })).toEqual(['salut @alice']);
  });

  it('rend un tableau vide quand il n\'y a ni légende ni effets', () => {
    expect(collectMentionableText({ content: null })).toEqual([]);
  });

  it('lit AUSSI le texte des objets de canevas', () => {
    const result = collectMentionableText({
      content: 'ma story',
      storyEffects: { textObjects: [{ id: 't1', text: 'coucou @bob' }] },
    });

    expect(result).toEqual(['ma story', 'coucou @bob']);
  });

  it('IGNORE un objet texte qui est un badge de référence', () => {
    const result = collectMentionableText({
      content: 'ma story',
      storyEffects: {
        textObjects: [
          { id: 't1', text: '@alice', referenceUserId: 'u-alice' },
          { id: 't2', text: 'coucou @bob' },
        ],
      },
    });

    expect(result).toEqual(['ma story', 'coucou @bob']);
  });

  it('survit à des effets malformés sans lever', () => {
    expect(collectMentionableText({ content: 'x', storyEffects: 'pas un objet' })).toEqual(['x']);
    expect(collectMentionableText({ content: 'x', storyEffects: { textObjects: 'nope' } })).toEqual(['x']);
    expect(collectMentionableText({ content: 'x', storyEffects: { textObjects: [null, 42] } })).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/mentionableText.test.ts
```

Attendu : FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `services/gateway/src/services/posts/mentionableText.ts` :

```ts
/**
 * Les fragments de texte dans lesquels un `@handle` compte comme référence
 * INLINE.
 *
 * DEUX sources, et c'est le cœur de cette unité : une story n'écrit pas son
 * texte dans `content`. La légende y vit, mais le texte porté par la slide vit
 * dans `storyEffects.textObjects[].text` — que la résolution de mentions ne
 * lisait pas du tout. Taper `@alice` dans un objet texte ne produisait donc
 * AUCUNE ligne `PostMention`, aucune notification, aucun surlignage.
 *
 * Les BADGES de référence sont exclus. Un badge PINNED est lui aussi un objet
 * texte portant `@pseudo` — c'est ce qui lui donne gratuitement déplacement,
 * rotation, z-order et export. Le lire ici le re-dériverait en INLINE à chaque
 * édition, écrasant le mode que l'auteur a choisi. `referenceUserId` est
 * exactement ce qui distingue un badge d'une phrase.
 *
 * `storyEffects` arrive en `unknown` : c'est un Json Prisma, validé par un
 * schéma `passthrough()` qui n'en garantit pas la forme. Tout ce qui n'est pas
 * lisible est ignoré plutôt que de faire échouer une publication.
 */

type MentionableTextParams = {
  readonly content?: string | null;
  readonly storyEffects?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Le texte d'un objet de canevas, ou `null` s'il n'y en a pas à lire — objet
 * malformé, texte vide, ou badge de référence.
 */
function readableText(entry: unknown): string | null {
  if (!isRecord(entry)) return null;
  if (typeof entry.referenceUserId === 'string' && entry.referenceUserId.length > 0) return null;
  const text = entry.text;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

export function collectMentionableText(params: MentionableTextParams): string[] {
  const caption = params.content && params.content.length > 0 ? [params.content] : [];

  if (!isRecord(params.storyEffects)) return caption;
  const objects = params.storyEffects.textObjects;
  if (!Array.isArray(objects)) return caption;

  return [
    ...caption,
    ...objects
      .map(readableText)
      .filter((text): text is string => text !== null),
  ];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/mentionableText.test.ts
```

Attendu : PASS — 5 tests.

- [ ] **Step 5: Committer**

```bash
git add services/gateway/src/services/posts/mentionableText.ts \
        services/gateway/src/__tests__/unit/services/posts/mentionableText.test.ts
git commit -m "feat(gateway): un @handle tapé sur le canevas d'une story ne nommait personne

Le texte d'une story ne vit pas dans sa légende mais dans storyEffects —
que la résolution de mentions ne lisait pas. Les badges de référence en
sont exclus : ce sont des objets texte eux aussi, et les relire les
retransformerait en mentions de texte à la première édition."
```

---

### Task 3: Réconciliation — modes déclarés et règle de précédence

**Files:**
- Modify: `services/gateway/src/services/posts/postMentions.ts`
- Modify: `services/gateway/src/services/MentionService.ts:1020-1042` (`createPostMentions`)
- Modify: `services/gateway/src/routes/posts/types.ts:196-227` (schémas Zod)
- Test: `services/gateway/src/__tests__/unit/services/posts/postMentions.test.ts` (existant, à étendre)

**Interfaces:**
- Consumes: `PostMentionDisplayValue`, `DeclarablePostMentionDisplay`, `readDisplay` (Task 1) ; `collectMentionableText` (Task 2)
- Produces:
  - `DeclaredPostMention = { readonly userId?: string; readonly username?: string; readonly display: DeclarablePostMentionDisplay }`
  - `PostMentionResolver.createPostMentions(postId: string, mentionedUserIds: string[], display: PostMentionDisplayValue): Promise<void>`
  - `resolvePostMentions` / `reconcilePostMentions` acceptent `storyEffects?: unknown` et un `declared` porteur de mode
  - `PostReferenceInputSchema` (Zod) rejetant `display: 'INLINE'`

**La règle de précédence** (une personne, un mode, car `@@unique([postId, mentionedUserId])`) :

| Situation | Mode retenu |
|---|---|
| Déclarée PINNED ou NOTE **+** nommée dans le texte | le mode **déclaré** |
| Déclarée SILENT **+** nommée dans le texte | **INLINE** |
| Nommée dans le texte seulement | INLINE |
| Déclarée seulement | le mode déclaré |

- [ ] **Step 1: Écrire les tests rouges de précédence**

Ajouter à `services/gateway/src/__tests__/unit/services/posts/postMentions.test.ts` :

```ts
describe('resolvePostMentions — précédence des modes', () => {
  it('laisse un PINNED déclaré gagner sur le texte qui nomme la même personne', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'bravo @alice',
      declared: [{ username: 'alice', display: 'PINNED' }],
    });

    expect(mentionService.createPostMentions).toHaveBeenCalledTimes(1);
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'PINNED');
  });

  it('fait perdre un SILENT déclaré contre le texte — on ne cache pas ce qui est écrit', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'bravo @alice',
      declared: [{ username: 'alice', display: 'SILENT' }],
    });

    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'INLINE');
  });

  it('dérive INLINE depuis le texte du CANEVAS, pas seulement depuis la légende', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: null,
      storyEffects: { textObjects: [{ id: 't1', text: 'coucou @alice' }] },
    });

    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'INLINE');
  });

  it('n\'interroge NI la base NI le service quand aucune source ne porte de @ ni de déclaration', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    const result = await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'rien ici',
      storyEffects: { textObjects: [{ id: 't1', text: 'ni la' }] },
    });

    expect(result.reconciled).toBe(true);
    expect(mentionService.extractMentions).not.toHaveBeenCalled();
    expect(mentionService.createPostMentions).not.toHaveBeenCalled();
  });
});

describe('reconcilePostMentions — tri-état par mode déclaré', () => {
  it('préserve les trois modes déclarés quand le client n\'en parle pas', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-bob', display: 'PINNED' },
          { mentionedUserId: 'u-carol', display: 'SILENT' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'texte sans arobase',
      declared: undefined,
    });

    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
    expect(result.mentionedUserIds).toEqual(expect.arrayContaining(['u-bob', 'u-carol']));
    expect(result.reconciled).toBe(true);
  });

  it('efface toutes les déclarées quand le client envoie une liste vide', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-bob', display: 'NOTE' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'texte sans arobase',
      declared: [],
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-bob'] } },
    });
  });

  it('lit une ligne sans champ display comme INLINE — donc relue dans le texte', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-alice', display: null },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'le pseudo a disparu du texte',
      declared: undefined,
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-alice'] } },
    });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postMentions.test.ts
```

Attendu : FAIL sur les nouveaux cas (`createPostMentions` appelé avec `'CONTENT'` au lieu de `'PINNED'` / `'INLINE'`, `storyEffects` ignoré).

- [ ] **Step 3: Étendre `PostMentionResolver` et `DeclaredPostMention`**

Dans `services/gateway/src/services/posts/postMentions.ts`, remplacer les déclarations correspondantes :

```ts
export interface PostMentionResolver {
  extractMentions(content: string): string[];
  resolveUsernames(usernames: string[]): Promise<Map<string, { id: string }>>;
  createPostMentions(
    postId: string,
    mentionedUserIds: string[],
    display: PostMentionDisplayValue
  ): Promise<void>;
}

/**
 * Une personne que le post NOMME sans que son texte le dise.
 *
 * `userId` OU `username` — un sélecteur rend un `User.id`, un canevas ne porte
 * que le `@handle` qu'il affiche, et c'est LUI qui survit à un brouillon repris
 * trois jours plus tard.
 *
 * `display` est REQUIS et ne peut pas valoir INLINE : le client ne déclare que
 * ce que le texte ne peut pas porter. INLINE est dérivé par le serveur.
 */
export interface DeclaredPostMention {
  readonly userId?: string;
  readonly username?: string;
  readonly display: DeclarablePostMentionDisplay;
}
```

Ajouter `storyEffects` aux paramètres :

```ts
export interface PostMentionParams {
  prisma: PostMentionPrisma;
  mentionService: PostMentionResolver | null | undefined;
  notificationService: PostMentionNotifier | null | undefined;
  post: MentionTargetPost;
  content: string | null | undefined;
  /**
   * Les effets du post, quand il en a. La dérivation INLINE y lit le texte des
   * objets de canevas — c'est là que vit le texte d'une story, pas dans
   * `content`. Voir `collectMentionableText`.
   */
  storyEffects?: unknown;
  declared?: readonly DeclaredPostMention[];
  onError?: (error: unknown) => void;
}
```

- [ ] **Step 4: Écrire la résolution par mode**

Toujours dans `postMentions.ts`, remplacer `resolveMentionedUserIds`, `resolveDeclaredUserIds` et `persistBySource` par :

```ts
/**
 * Les `User.id` que le TEXTE nomme — légende et objets de canevas confondus,
 * badges exclus (`collectMentionableText`).
 */
async function resolveTextUserIds(
  mentionService: PostMentionResolver,
  params: PostMentionParams
): Promise<string[]> {
  const fragments = collectMentionableText({
    content: params.content,
    storyEffects: params.storyEffects,
  });
  const usernames = fragments.flatMap((fragment) => mentionService.extractMentions(fragment));
  if (usernames.length === 0) return [];

  const userMap = await mentionService.resolveUsernames(usernames);
  return Array.from(userMap.values()).map((user) => user.id);
}

/**
 * Les mentions DÉCLARÉES, résolues en `User.id` et gardant leur mode.
 * Dédupliqué en préservant l'ordre de déclaration — c'est celui du canevas,
 * donc celui que l'auteur a posé.
 */
async function resolveDeclared(
  mentionService: PostMentionResolver,
  declared: readonly DeclaredPostMention[] | undefined
): Promise<Map<string, DeclarablePostMentionDisplay>> {
  const resolved = new Map<string, DeclarablePostMentionDisplay>();
  if (!declared || declared.length === 0) return resolved;

  const byUsername = declared.filter((mention) => !mention.userId && mention.username);
  const usernameMap = byUsername.length > 0
    ? await mentionService.resolveUsernames(
        byUsername.map((mention) => mention.username as string)
      )
    : new Map<string, { id: string }>();

  for (const mention of declared) {
    const id = mention.userId
      ?? (mention.username ? usernameMap.get(mention.username.toLowerCase())?.id : undefined);
    if (!id || resolved.has(id)) continue;
    resolved.set(id, mention.display);
  }
  return resolved;
}

/**
 * Le mode FINAL de chaque personne, précédence appliquée.
 *
 * Une personne nommée des deux côtés garde son mode DÉCLARÉ — c'est un choix
 * explicite de l'auteur, là où INLINE n'est qu'un défaut dérivé ; faire gagner
 * le texte détruirait le badge dès que le pseudo apparaît aussi dans la
 * légende. SEUL SILENT perd contre le texte : on ne peut pas cacher ce qui est
 * écrit, et prétendre le contraire donnerait à l'auteur une discrétion que le
 * rendu contredit aussitôt.
 */
function applyPrecedence(
  textUserIds: readonly string[],
  declared: ReadonlyMap<string, DeclarablePostMentionDisplay>
): Map<string, PostMentionDisplayValue> {
  const final = new Map<string, PostMentionDisplayValue>();

  for (const id of textUserIds) {
    const declaredMode = declared.get(id);
    final.set(id, declaredMode && declaredMode !== 'SILENT' ? declaredMode : 'INLINE');
  }
  for (const [id, mode] of declared.entries()) {
    if (!final.has(id)) final.set(id, mode);
  }
  return final;
}

/**
 * Écrit chaque lot sous SON mode. Un appel par mode et non un seul : c'est le
 * discriminant qui dit, à l'édition suivante, laquelle relire dans le texte —
 * un lot fusionné les rendrait toutes relisibles, et la première correction de
 * frappe effacerait les badges du canevas.
 *
 * La garde du lot vide vit ici plutôt que dans `createPostMentions` : lui la
 * porte déjà, mais l'appeler pour rien brouillerait le compte d'appels que
 * lisent les tests.
 */
async function persistByDisplay(
  mentionService: PostMentionResolver,
  postId: string,
  modes: ReadonlyMap<string, PostMentionDisplayValue>
): Promise<void> {
  const ORDER: readonly PostMentionDisplayValue[] = ['INLINE', 'PINNED', 'NOTE', 'SILENT'];

  for (const mode of ORDER) {
    const ids = [...modes.entries()]
      .filter(([, value]) => value === mode)
      .map(([id]) => id);
    if (ids.length > 0) {
      await mentionService.createPostMentions(postId, ids, mode);
    }
  }
}
```

Ajouter l'import en tête de fichier :

```ts
import { collectMentionableText } from './mentionableText';
```

- [ ] **Step 5: Recâbler `resolvePostMentions` et `reconcilePostMentions`**

Remplacer le corps des deux exports par :

```ts
export async function resolvePostMentions(params: PostMentionParams): Promise<ResolvedPostMentions> {
  const { mentionService, declared } = params;

  if (!mentionService) return UNRESOLVED;

  // Le court-circuit couvre les DEUX voies : un post sans `@` nulle part ET
  // sans mention déclarée ne doit coûter aucune requête.
  const fragments = collectMentionableText({
    content: params.content,
    storyEffects: params.storyEffects,
  });
  const namesInText = fragments.some((fragment) => fragment.includes('@'));
  const namesDeclared = Boolean(declared && declared.length > 0);
  if (!namesInText && !namesDeclared) return NO_MENTIONS;

  try {
    const textUserIds = namesInText ? await resolveTextUserIds(mentionService, params) : [];
    const declaredModes = await resolveDeclared(mentionService, declared);
    const modes = applyPrecedence(textUserIds, declaredModes);

    const mentionedUserIds = [...modes.keys()];
    if (mentionedUserIds.length === 0) return NO_MENTIONS;

    await persistByDisplay(mentionService, params.post.id, modes);
    notifyNewlyMentioned(params, mentionedUserIds);

    return { mentionedUserIds, newlyMentionedUserIds: mentionedUserIds, reconciled: true };
  } catch (error) {
    params.onError?.(error);
    return UNRESOLVED;
  }
}

export async function reconcilePostMentions(params: PostMentionParams): Promise<ResolvedPostMentions> {
  const { prisma, mentionService } = params;

  if (!mentionService) return UNRESOLVED;

  try {
    // L'ensemble précédent est la seule source de « qui est parti » et de « qui
    // est nouveau ». Sa lecture est DANS le try : en échec, la réconciliation
    // ne peut plus garantir qu'elle ne détruit rien, donc elle s'abstient.
    const previousRows = await prisma.postMention.findMany({
      where: { postId: params.post.id },
      select: { mentionedUserId: true, display: true },
    });
    const previousUserIds = previousRows.map((row) => row.mentionedUserId);
    const previousDeclared = new Map<string, DeclarablePostMentionDisplay>(
      previousRows
        .map((row) => [row.mentionedUserId, readDisplay(row.display)] as const)
        .filter((entry): entry is readonly [string, DeclarablePostMentionDisplay] =>
          entry[1] !== 'INLINE')
    );

    const fragments = collectMentionableText({
      content: params.content,
      storyEffects: params.storyEffects,
    });
    const textUserIds = fragments.some((fragment) => fragment.includes('@'))
      ? await resolveTextUserIds(mentionService, params)
      : [];

    // TRI-ÉTAT : sans liste, les déclarées SURVIVENT. Les déduire du texte les
    // effacerait à la première correction de frappe — elles n'y sont pas,
    // c'est leur raison d'être.
    const declaredModes = params.declared === undefined
      ? previousDeclared
      : await resolveDeclared(mentionService, params.declared);

    const modes = applyPrecedence(textUserIds, declaredModes);
    const mentionedUserIds = [...modes.keys()];

    const previous = new Set(previousUserIds);
    const retained = new Set(mentionedUserIds);
    const departedUserIds = previousUserIds.filter((id) => !retained.has(id));
    const newlyMentionedUserIds = mentionedUserIds.filter((id) => !previous.has(id));

    if (departedUserIds.length > 0) {
      await prisma.postMention.deleteMany({
        where: { postId: params.post.id, mentionedUserId: { in: departedUserIds } },
      });
    }

    const newModes = new Map(
      [...modes.entries()].filter(([id]) => newlyMentionedUserIds.includes(id))
    );
    await persistByDisplay(mentionService, params.post.id, newModes);
    notifyNewlyMentioned(params, newlyMentionedUserIds);

    return { mentionedUserIds, newlyMentionedUserIds, reconciled: true };
  } catch (error) {
    params.onError?.(error);
    return UNRESOLVED;
  }
}
```

- [ ] **Step 6: Mettre `createPostMentions` au nouveau discriminant**

Dans `services/gateway/src/services/MentionService.ts`, remplacer la signature (~ligne 1020) :

```ts
  async createPostMentions(
    postId: string,
    mentionedUserIds: string[],
    display: 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT' = 'INLINE'
  ): Promise<void> {
    if (mentionedUserIds.length === 0) return;

    await Promise.allSettled(
      mentionedUserIds.map(userId =>
        this.prisma.postMention.create({
          data: {
            postId,
            mentionedUserId: userId,
            display,
          },
        }).catch((error: any) => {
          if (error.code !== 'P2002') {
            logger.error(`Error creating post mention for user ${userId}:`, error);
          }
        })
      )
    );
  }
```

- [ ] **Step 7: Étendre les schémas Zod**

Dans `services/gateway/src/routes/posts/types.ts`, remplacer `PostMentionInputSchema` :

```ts
/**
 * Une personne que le post NOMME sans que son texte le dise.
 *
 * `display` est REQUIS et n'accepte PAS `INLINE` : le client ne déclare que ce
 * que le texte ne peut pas porter. INLINE est dérivé par le serveur, qui relit
 * les `@handle` de la légende ET des objets de canevas — accepter une
 * déclaration INLINE ouvrirait un second chemin vers le même fait, et les deux
 * divergeraient au premier désaccord.
 */
export const PostReferenceInputSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  username: z.string().min(1).max(64).optional(),
  /**
   * OPTIONNEL, défaut PINNED — et ce n'est pas une commodité.
   *
   * `PostMentionInput` (SDK iOS) ne porte que `userId` et `username` : toute
   * app DÉJÀ INSTALLÉE envoie `{ username }` nu. Le rendre requis ferait
   * échouer la validation et rendrait 400 sur toute publication de story
   * portant une pastille, pour chaque version en circulation.
   *
   * PINNED parce que c'est EXACTEMENT ce que faisait l'ancien canal CANVAS :
   * un client ancien continue de se comporter à l'identique, sans le savoir.
   *
   * INLINE reste hors de l'énumération : le serveur le dérive du texte, et
   * l'accepter en déclaration ouvrirait un second chemin vers le même fait.
   */
  display: z.enum(['PINNED', 'NOTE', 'SILENT']).default('PINNED'),
}).refine((m) => Boolean(m.userId || m.username), {
  message: 'userId ou username requis',
});
```

Écrire d'abord le test rouge de compatibilité, dans
`services/gateway/src/__tests__/unit/routes/posts/postReferenceInputSchema.test.ts` :

```ts
/**
 * Le contrat que les apps DÉJÀ INSTALLÉES respectent — elles n'ont jamais
 * envoyé de `display`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostReferenceInputSchema } from '../../../../routes/posts/types';

describe('PostReferenceInputSchema', () => {
  it('accepte un payload d\'app ancienne et le lit PINNED', () => {
    const parsed = PostReferenceInputSchema.parse({ username: 'alice' });
    expect(parsed.display).toBe('PINNED');
  });

  it('accepte les trois modes déclarables', () => {
    for (const display of ['PINNED', 'NOTE', 'SILENT'] as const) {
      expect(PostReferenceInputSchema.parse({ username: 'alice', display }).display).toBe(display);
    }
  });

  it('REFUSE une déclaration INLINE — le serveur la dérive', () => {
    expect(() => PostReferenceInputSchema.parse({ username: 'alice', display: 'INLINE' })).toThrow();
  });

  it('exige userId ou username', () => {
    expect(() => PostReferenceInputSchema.parse({ display: 'NOTE' })).toThrow();
  });
});
```

Puis, dans `CreatePostSchema` et `UpdatePostSchema`, remplacer la ligne `mentions` :

```ts
  mentions: z.array(PostReferenceInputSchema).max(50).optional(),
```

Enfin, déclarer `referenceUserId` dans `StoryTextObjectSchema` (~ligne 114), avant le
`.passthrough()` :

```ts
  /**
   * `User.id` quand cet objet EST un badge de référence, absent pour du texte
   * libre. C'est LUI que `collectMentionableText` lit pour exclure le badge de
   * la dérivation INLINE — sans quoi chaque badge se retransformerait en
   * mention de texte à la première édition.
   *
   * `passthrough()` le laisserait déjà passer, mais NON BORNÉ : seul le
   * garde-fou global de 256 KB l'arrêterait, et un champ que le serveur LIT
   * mérite d'être validé comme les autres.
   */
  referenceUserId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
```

- [ ] **Step 8: Passer `storyEffects` depuis les routes**

Dans `services/gateway/src/routes/posts/core.ts`, aux deux appels (~ligne 180 pour la création, ~ligne 336 pour l'édition), ajouter le champ :

```ts
        storyEffects: parsed.data.storyEffects,
        declared: parsed.data.mentions,
```

- [ ] **Step 9: Aligner l'écriture et la lecture sur `deletedAt`**

Aujourd'hui l'écriture (`resolveUsernames`) ne filtre **rien** tandis que la lecture
(`resolveMentionedUsers`) filtre `isActive: true` : une référence peut être persistée puis
rester invisible à jamais.

Écrire d'abord le test rouge, dans `services/gateway/src/__tests__/unit/services/MentionServiceResolve.test.ts` :

```ts
/**
 * `resolveUsernames` — qui est référençable.
 *
 * Règle unique, appliquée à l'écriture comme à la lecture : `deletedAt` exclut,
 * `isActive` n'exclut pas. Un compte supprimé n'est pas référençable ; un compte
 * simplement inactif l'est — c'est déjà le choix de l'autocomplete, et quelqu'un
 * qui apparaît dans le sélecteur doit pouvoir être nommé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MentionService } from '../../../services/MentionService';

describe('MentionService.resolveUsernames', () => {
  it('exclut les comptes supprimés, sans exclure les comptes inactifs', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([]);
    const service = new MentionService({ user: { findMany } } as never);

    await service.resolveUsernames(['alice']);

    const where = findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ isSet: false });
    expect(where.isActive).toBeUndefined();
  });
});
```

Le lancer (`bun run test -- src/__tests__/unit/services/MentionServiceResolve.test.ts`) : FAIL,
`where.deletedAt` est `undefined`.

Puis, dans `services/gateway/src/services/MentionService.ts`, méthode `resolveUsernames`,
remplacer le commentaire et le `where` :

```ts
    // Règle unique écriture/lecture : `deletedAt` exclut, `isActive` n'exclut
    // pas. Un compte supprimé n'est pas référençable ; un compte inactif l'est
    // — c'est déjà le choix assumé de l'autocomplete, et quelqu'un qui apparaît
    // dans le sélecteur doit pouvoir être nommé. Sans le premier filtre,
    // l'écriture persistait des références que la lecture n'affichait jamais.
    //
    // `isSet: false` et non `null` : sous MongoDB, un compte jamais supprimé ne
    // porte pas la clé du tout, et `{ deletedAt: null }` ne le matcherait pas.
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: { isSet: false },
        OR: usernames.map(username => ({
          username: {
            equals: username,
            mode: 'insensitive'
          }
        }))
      },
```

- [ ] **Step 10: Lancer les tests pour vérifier qu'ils passent**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postMentions.test.ts \
                                       src/__tests__/unit/services/MentionServiceResolve.test.ts
```

Attendu : PASS, y compris les cas préexistants (ceux qui attendaient `'CONTENT'` doivent être mis à jour en `'INLINE'` — c'est le même fait sous son nouveau nom).

- [ ] **Step 11: Committer**

```bash
git add services/gateway/src/services/posts/postMentions.ts \
        services/gateway/src/services/MentionService.ts \
        services/gateway/src/routes/posts/types.ts \
        services/gateway/src/routes/posts/core.ts \
        services/gateway/src/__tests__/unit/services/posts/postMentions.test.ts \
        services/gateway/src/__tests__/unit/services/MentionServiceResolve.test.ts
git commit -m "feat(gateway): l'auteur choisit comment une référence se montre

Un badge posé sur le canevas ne devait pas disparaître parce que le pseudo
apparaît aussi dans la légende : le mode déclaré gagne sur le texte. Seul
SILENT perd contre lui — on ne peut pas cacher ce qui est écrit."
```

---

### Task 4: Retirer la notification quand la référence disparaît

**Files:**
- Modify: `services/gateway/src/services/posts/postMentions.ts` (`reconcilePostMentions`)
- Create: `services/gateway/src/services/posts/retractMentionNotifications.ts`
- Test: `services/gateway/src/__tests__/unit/services/posts/retractMentionNotifications.test.ts`

**Interfaces:**
- Consumes: `reconcilePostMentions` et son lot `departedUserIds` (Task 3)
- Produces: `retractMentionNotifications(params: { prisma: RetractMentionPrisma; postId: string; departedUserIds: readonly string[]; announcer?: RetractedNotificationAnnouncer }): Promise<void>`

**Pourquoi :** retirer une référence révoque l'accès qu'elle avait ouvert. Sa notification, elle, survivrait et pointerait vers un contenu désormais fermé. Le dépôt a déjà le patron — `retractCommentNotifications.ts`, septième occurrence d'une famille ouverte aux cycles 46 à 51 : le lien vit dans un blob JSON, la ligne porte une copie dénormalisée de l'extrait, et aucun filtre de lecture ne peut rattraper.

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/retractMentionNotifications.test.ts` :

```ts
/**
 * Retirer les notifications qu'une référence retirée avait produites.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { retractMentionNotifications } from '../../../../services/posts/retractMentionNotifications';

function makePrisma(deleted = 1) {
  return {
    notification: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: deleted }),
    },
  } as any;
}

describe('retractMentionNotifications', () => {
  it('ne touche à rien quand personne n\'est parti', async () => {
    const prisma = makePrisma();
    await retractMentionNotifications({ prisma, postId: 'post-1', departedUserIds: [] });
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  it('retire les user_mentioned des seuls partants, sur les DEUX chemins JSON', async () => {
    const prisma = makePrisma();
    await retractMentionNotifications({
      prisma, postId: 'post-1', departedUserIds: ['u-bob', 'u-carol'],
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['u-bob', 'u-carol'] },
        type: { in: ['user_mentioned', 'mention'] },
        OR: [
          { context: { path: ['postId'], equals: 'post-1' } },
          { metadata: { path: ['postId'], equals: 'post-1' } },
        ],
      },
    });
  });

  it('ne lève jamais — une notification survivante ne doit pas défaire une édition', async () => {
    const prisma = {
      notification: {
        deleteMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      },
    } as any;
    const onError = jest.fn();

    await expect(
      retractMentionNotifications({ prisma, postId: 'post-1', departedUserIds: ['u-bob'], onError })
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/retractMentionNotifications.test.ts
```

Attendu : FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `services/gateway/src/services/posts/retractMentionNotifications.ts` :

```ts
/**
 * Retirer les notifications qu'une référence retirée avait produites — huitième
 * occurrence de la famille ouverte aux cycles 46 à 51.
 *
 * Même cause que ses aînées : le retrait est DOUX (la ligne `PostMention` est
 * supprimée, mais la notification vit dans une autre collection), le lien vers
 * le post vit dans un blob JSON — donc aucune relation déclarée ne pourrait
 * s'en charger — et la ligne garde une copie DÉNORMALISÉE de l'extrait, si
 * bien qu'aucun filtre à la lecture ne peut rattraper.
 *
 * RETRAIT, pas neutralisation : l'accès que la référence ouvrait vient d'être
 * révoqué, donc le `action: view_post` de la ligne mènerait à un contenu fermé.
 *
 * DEUX chemins JSON, comme pour les commentaires : `createPostMentionNotificationsBatch`
 * écrit `postId` dans `context` ET dans `metadata`. Ne filtrer que l'un des
 * deux laisserait la moitié des lignes en base.
 *
 * Best-effort — ne lève jamais. Une notification survivante ne doit pas
 * transformer une édition réussie en 500.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type RetractMentionPrisma = Pick<PrismaClient, 'notification'>;

/** Les deux types que le dépôt utilise pour une mention (`mention` est l'alias historique). */
const MENTION_TYPES = ['user_mentioned', 'mention'] as const;

export async function retractMentionNotifications(params: {
  prisma: RetractMentionPrisma;
  postId: string;
  departedUserIds: readonly string[];
  onError?: (error: unknown) => void;
}): Promise<void> {
  if (params.departedUserIds.length === 0) return;

  try {
    await params.prisma.notification.deleteMany({
      where: {
        userId: { in: [...params.departedUserIds] },
        type: { in: [...MENTION_TYPES] },
        OR: [
          { context: { path: ['postId'], equals: params.postId } },
          { metadata: { path: ['postId'], equals: params.postId } },
        ],
      },
    });
  } catch (error) {
    params.onError?.(error);
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/retractMentionNotifications.test.ts
```

Attendu : PASS — 3 tests.

- [ ] **Step 5: Brancher sur la réconciliation**

Dans `services/gateway/src/services/posts/postMentions.ts`, ajouter l'import puis, dans `reconcilePostMentions`, juste après le bloc `deleteMany` :

```ts
    if (departedUserIds.length > 0) {
      await prisma.postMention.deleteMany({
        where: { postId: params.post.id, mentionedUserId: { in: departedUserIds } },
      });
      await retractMentionNotifications({
        prisma: prisma as unknown as RetractMentionPrisma,
        postId: params.post.id,
        departedUserIds,
        onError: params.onError,
      });
    }
```

Étendre `PostMentionPrisma` pour porter le délégué :

```ts
export type PostMentionPrisma = Pick<PrismaClient, 'postMention' | 'notification'>;
```

Et supprimer le `as unknown as RetractMentionPrisma` devenu inutile :

```ts
      await retractMentionNotifications({
        prisma,
        postId: params.post.id,
        departedUserIds,
        onError: params.onError,
      });
```

- [ ] **Step 6: Écrire le test d'intégration de la réconciliation**

Ajouter à `services/gateway/src/__tests__/unit/services/posts/postMentions.test.ts` :

```ts
describe('reconcilePostMentions — rétractation', () => {
  it('retire la notification de la personne dont la référence disparaît', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-bob', display: 'NOTE' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      notification: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'plus personne', declared: [],
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(1);
  });
});
```

Ajouter `notification: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) }` au `makePrisma` par défaut du fichier, pour que les cas existants ne cassent pas.

- [ ] **Step 7: Lancer les tests**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/
```

Attendu : PASS sur les quatre fichiers du dossier.

- [ ] **Step 8: Committer**

```bash
git add services/gateway/src/services/posts/retractMentionNotifications.ts \
        services/gateway/src/services/posts/postMentions.ts \
        services/gateway/src/__tests__/unit/services/posts/retractMentionNotifications.test.ts \
        services/gateway/src/__tests__/unit/services/posts/postMentions.test.ts
git commit -m "fix(gateway): une référence retirée laissait sa notification pointer vers un accès révoqué

Huitième occurrence de la famille : le lien vit dans un blob JSON, la ligne
porte une copie dénormalisée de l'extrait, aucun filtre de lecture ne
rattrape. Retrait, pas neutralisation — le contenu est fermé pour de bon."
```

---

### Task 5: Lecture — la relation remplace le re-parsing du texte

**Files:**
- Modify: `services/gateway/src/services/posts/postIncludes.ts:245-250` (`postInclude`)
- Modify: `services/gateway/src/routes/posts/feed.ts:10-22` (retrait de `collectPostContents`)
- Modify: `services/gateway/src/routes/posts/core.ts`, `comments.ts`, `interactions.ts` (retrait des appels `resolveMentionedUsers`)
- Test: `services/gateway/src/__tests__/unit/services/posts/postReferencePayload.test.ts`

**Interfaces:**
- Consumes: `PostMentionDisplayValue`, `readDisplay` (Task 1)
- Produces: `postMentionInclude` (forme Prisma), `PostReference = { userId: string; username: string; displayName: string | null; avatar: string | null; display: PostMentionDisplayValue }`, `toPostReferences(rows): PostReference[]`

**Ce que ça corrige :** `resolveMentionedUsers` re-parse le texte à chaque lecture. C'est la cause directe du surlignage faux côté web, et ça rend structurellement impossible d'afficher une référence que le texte ne porte pas. La fonction elle-même **reste** — `routes/conversations/messages.ts:1380` l'utilise pour les messages, et rien ne change pour eux.

**Non-régression — vérifié avant d'écrire cette tâche.** Retirer `meta.mentionedUsers` des routes de post ne casse aucun client :

| Consommateur | État |
|---|---|
| `ConversationSyncEngine.swift:854` (`response.meta?.mentionedUsers`) | chemin **messages** — intact, aucune route message n'est touchée |
| `APIPost.mentionedUsers` (`PostModels.swift:193`) | décodé et persisté (`PostRecord.mentionedUsersJson`), mais **le gateway ne l'écrit jamais sur un post** — ni en REST (c'est dans `meta`), ni en socket. Champ **mort**, toujours `nil` |
| `PostContentText.tsx` (web) | ne lit pas `mentionedUsers` du tout — il linkifie par regex locale. C'est le bug que la Task corrige |
| Aucun chemin iOS ne lit `meta.mentionedUsers` pour un post | vérifié par grep sur `packages/MeeshySDK/Sources` et `apps/ios` |

Deux conséquences pour les plans clients : `APIPost.mentionedUsers` et `PostRecord.mentionedUsersJson` sont à **supprimer** (champs morts), et `UserDisplayNameCache` gagne son alimentation depuis le nouveau champ `mentions`, qui lui arrivera enfin réellement.

**Pas de troncature Fastify à craindre** : aucune route de lecture de post ne déclare de `response` schema (seuls `/impression` et `/impressions/batch` ont un `schema`, limité à `params` et `body`). Le champ `mentions` ne sera donc pas silencieusement supprimé de la charge utile.

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/postReferencePayload.test.ts` :

```ts
/**
 * `toPostReferences` — la forme sous laquelle une référence quitte le serveur.
 *
 * Le `displayName` est celui DU MOMENT, résolu au chargement : une personne qui
 * change de nom d'affichage doit apparaître sous son nom actuel, pas sous celui
 * qu'elle portait à la publication.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { toPostReferences } from '../../../../services/posts/postReferences';

const ROW = {
  display: 'NOTE' as const,
  mentionedUser: { id: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: 'a.png' },
};

describe('toPostReferences', () => {
  it('aplatit la relation en une entrée porteuse du mode', () => {
    expect(toPostReferences([ROW])).toEqual([
      { userId: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: 'a.png', display: 'NOTE' },
    ]);
  });

  it('lit une ligne sans mode comme INLINE', () => {
    expect(toPostReferences([{ ...ROW, display: null }])[0].display).toBe('INLINE');
  });

  it('ignore une ligne dont l\'utilisateur n\'a pas pu être chargé', () => {
    expect(toPostReferences([{ ...ROW, mentionedUser: null }])).toEqual([]);
  });

  it('rend un tableau vide pour une relation absente', () => {
    expect(toPostReferences(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postReferencePayload.test.ts
```

Attendu : FAIL — module introuvable.

- [ ] **Step 3: Écrire l'unité de transport**

Créer `services/gateway/src/services/posts/postReferences.ts` :

```ts
/**
 * La forme sous laquelle une référence quitte le serveur.
 *
 * Elle porte le PROFIL, pas seulement un pseudo : la rangée « Avec … » a besoin
 * du nom d'affichage et de l'avatar, et un champ plat de usernames obligerait à
 * les résoudre une seconde fois. Résolu au CHARGEMENT, donc toujours à jour —
 * une personne qui change de nom apparaît sous son nom actuel.
 */

import type { PostMentionDisplayValue } from './postMentions';
import { readDisplay } from './postMentions';

export interface PostReference {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly display: PostMentionDisplayValue;
}

type PostMentionRow = {
  readonly display?: PostMentionDisplayValue | null;
  readonly mentionedUser?: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string | null;
    readonly avatar: string | null;
  } | null;
};

export function toPostReferences(rows: readonly PostMentionRow[] | undefined): PostReference[] {
  if (!rows) return [];

  return rows.flatMap((row) => {
    const user = row.mentionedUser;
    if (!user) return [];
    return [{
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      display: readDisplay(row.display),
    }];
  });
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postReferencePayload.test.ts
```

Attendu : PASS — 4 tests.

- [ ] **Step 5: Ajouter la relation à `postInclude`**

Dans `services/gateway/src/services/posts/postIncludes.ts`, avant `postInclude` :

```ts
/**
 * Les références VISIBLES d'un post — jamais les silencieuses.
 *
 * Le filtre vit dans le `select`, pas dans une projection applicative : une
 * charge utile identique pour tous les lecteurs ne peut pas fuiter. Le détail
 * du post, lui, projette (voir `postReferences.ts`) — mais c'est une lecture
 * unitaire, jamais un feed mis en cache sous une clé partagée.
 *
 * Piège Prisma-Mongo : `{ display: { not: 'SILENT' } }` ne matche PAS les
 * lignes où le champ est ABSENT — c'est-à-dire toutes celles écrites avant le
 * discriminant, qui se lisent pourtant INLINE et doivent donc apparaître. D'où
 * le `OR` explicite sur les trois modes visibles plus l'absence.
 */
export const postMentionInclude = Prisma.validator<Prisma.Post$mentionsArgs>()({
  where: {
    OR: [
      { display: { in: ['INLINE', 'PINNED', 'NOTE'] } },
      { display: { isSet: false } },
      { display: null },
    ],
  },
  select: {
    display: true,
    mentionedUser: { select: authorSelect },
  },
});
```

Puis étendre `postInclude` :

```ts
export const postInclude = Prisma.validator<Prisma.PostInclude>()({
  author: { select: authorSelect },
  media: mediaInclude,
  comments: commentsPreviewInclude,
  repostOf: repostOfInclude,
  mentions: postMentionInclude,
});
```

`storyPostInclude` hérite par spread — rien à y faire.

- [ ] **Step 6: Retirer le re-parsing des routes de post**

Dans `services/gateway/src/routes/posts/feed.ts` : supprimer la fonction `collectPostContents` (lignes 10-22), l'import de `resolveMentionedUsers` (ligne 7), et les huit blocs `const …Contents = collectPostContents(…)` / `…MentionedUsers = await resolveMentionedUsers(…)` avec leur `meta.mentionedUsers`.

Même retrait dans `core.ts` (lignes ~147, ~248, ~310), `comments.ts` (~89, ~129, ~377) et `interactions.ts`.

**Ne pas toucher** à `services/gateway/src/routes/conversations/messages.ts:1380` : les messages continuent d'utiliser `resolveMentionedUsers`, et rien ne change pour eux.

- [ ] **Step 7: Lancer la suite des routes de post**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/routes/posts/
```

Attendu : PASS. Les tests qui affirmaient `meta.mentionedUsers` doivent être réécrits pour affirmer `data.mentions` — c'est le même fait sous une meilleure forme.

- [ ] **Step 8: Committer**

```bash
git add services/gateway/src/services/posts/postReferences.ts \
        services/gateway/src/services/posts/postIncludes.ts \
        services/gateway/src/routes/posts/ \
        services/gateway/src/__tests__/unit/services/posts/postReferencePayload.test.ts \
        services/gateway/src/__tests__/unit/routes/posts/
git commit -m "fix(gateway): le surlignage d'un post se devinait au lieu de se lire

La lecture re-parsait le texte à chaque requête au lieu de lire les lignes
déjà persistées — d'où un @nimportequoi linkifié vers un profil inexistant,
et l'impossibilité d'afficher une référence que le texte ne porte pas."
```

---

### Task 6: Projection au détail — l'auteur et la personne concernée voient les silencieuses

**Files:**
- Modify: `services/gateway/src/services/PostService.ts:599-605` (`getPostById`)
- Modify: `services/gateway/src/services/posts/postReferences.ts`
- Test: `services/gateway/src/__tests__/unit/services/posts/postReferenceProjection.test.ts`

**Interfaces:**
- Consumes: `PostReference`, `toPostReferences` (Task 5)
- Produces: `projectReferencesForViewer(params: { references: readonly PostReference[]; authorId: string; viewerId: string | undefined }): PostReference[]`

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/postReferenceProjection.test.ts` :

```ts
/**
 * Qui voit qu'une référence SILENT existe.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { projectReferencesForViewer } from '../../../../services/posts/postReferences';
import type { PostReference } from '../../../../services/posts/postReferences';

const ALICE: PostReference = {
  userId: 'u-alice', username: 'alice', displayName: 'Alice', avatar: null, display: 'INLINE',
};
const CAROL: PostReference = {
  userId: 'u-carol', username: 'carol', displayName: 'Carol', avatar: null, display: 'SILENT',
};
const ALL = [ALICE, CAROL];

describe('projectReferencesForViewer', () => {
  it('rend TOUT à l\'auteur — il doit pouvoir retirer une silencieuse', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: 'u-author' }))
      .toEqual(ALL);
  });

  it('rend les visibles PLUS la sienne à la personne silencieusement référencée', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: 'u-carol' }))
      .toEqual([ALICE, CAROL]);
  });

  it('rend les visibles SEULEMENT à un tiers', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: 'u-bob' }))
      .toEqual([ALICE]);
  });

  it('rend les visibles seulement à un lecteur anonyme', () => {
    expect(projectReferencesForViewer({ references: ALL, authorId: 'u-author', viewerId: undefined }))
      .toEqual([ALICE]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postReferenceProjection.test.ts
```

Attendu : FAIL — `projectReferencesForViewer` n'existe pas.

- [ ] **Step 3: Écrire la projection**

Ajouter à `services/gateway/src/services/posts/postReferences.ts` :

```ts
/**
 * Ce qu'un lecteur donné a le droit de savoir des références d'un post.
 *
 * Trois réponses, et la distinction n'est pas cosmétique : l'AUTEUR doit voir
 * ses silencieuses pour pouvoir en retirer une, la personne CONCERNÉE doit voir
 * la sienne — sans quoi la notification qu'elle vient de recevoir n'a aucune
 * réponse dans le contenu — et un tiers ne doit rien en savoir, sinon le mode
 * silencieux ne veut plus rien dire.
 *
 * Réservé aux lectures UNITAIRES. Un feed sert la même charge utile à tout le
 * monde et filtre au niveau du `select` (`postMentionInclude`) : y projeter
 * ferait dépendre d'un lecteur une réponse mise en cache sous une clé partagée.
 */
export function projectReferencesForViewer(params: {
  references: readonly PostReference[];
  authorId: string;
  viewerId: string | undefined;
}): PostReference[] {
  const { references, authorId, viewerId } = params;
  if (viewerId && viewerId === authorId) return [...references];

  return references.filter(
    (reference) => reference.display !== 'SILENT' || reference.userId === viewerId
  );
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postReferenceProjection.test.ts
```

Attendu : PASS — 4 tests.

- [ ] **Step 5: Charger TOUTES les références au détail**

Dans `services/gateway/src/services/PostService.ts`, méthode `getPostById`, remplacer l'`include` par une forme qui ne filtre pas — la projection s'en charge ensuite :

```ts
  async getPostById(postId: string, viewerUserId?: string) {
    const visibilityFilter = await this.buildVisibilityFilter(viewerUserId);
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
      include: {
        ...postInclude,
        // Le détail charge TOUTES les références, silencieuses comprises : c'est
        // `projectReferencesForViewer` qui décide de ce que CE lecteur en voit.
        // Filtrer ici priverait l'auteur de sa propre liste.
        mentions: { select: { display: true, mentionedUser: { select: authorSelect } } },
      },
    });
    if (!post) return null;

    const references = projectReferencesForViewer({
      references: toPostReferences(post.mentions),
      authorId: post.authorId,
      viewerId: viewerUserId,
    });
```

Puis remplacer `mentions` par les références projetées dans chacun des deux `return` de la méthode :

```ts
    if (!viewerUserId) {
      return {
        ...post,
        mentions: references,
        currentUserReactions: [],
        isLikedByMe: false,
        isBookmarkedByMe: false,
        isRepostedByMe: false,
      };
    }
```

Et, à la fin de la méthode, ajouter `mentions: references` à l'objet rendu.

Ajouter les imports en tête de fichier :

```ts
import { projectReferencesForViewer, toPostReferences } from './posts/postReferences';
import { authorSelect } from './posts/postIncludes';
```

- [ ] **Step 6: Lancer la suite du service**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/ src/__tests__/unit/routes/posts/core.test.ts
```

Attendu : PASS.

- [ ] **Step 7: Committer**

```bash
git add services/gateway/src/services/posts/postReferences.ts \
        services/gateway/src/services/PostService.ts \
        services/gateway/src/__tests__/unit/services/posts/postReferenceProjection.test.ts
git commit -m "feat(gateway): une référence silencieuse se montre à deux personnes, pas à trois

L'auteur doit pouvoir en retirer une, la personne nommée doit trouver dans
le contenu la réponse à la notification qu'elle vient de recevoir. Un tiers
n'en sait rien — sinon le mode silencieux ne veut plus rien dire."
```

---

### Task 7: `resolveReferenceAccess` — être référencé ouvre le contenu

**Files:**
- Create: `services/gateway/src/services/posts/referenceAccess.ts`
- Modify: `services/gateway/src/services/posts/postVisibility.ts` (`canUserViewPost`)
- Test: `services/gateway/src/__tests__/unit/services/posts/referenceAccess.test.ts`

**Interfaces:**
- Consumes: `PostAclPrisma`, `PostVisibilityRecord` (existants dans `postVisibility.ts`)
- Produces:
  - `type ReferenceAccessVerdict = 'none' | 'granted' | 'consumed'`
  - `resolveReferenceAccess(params: { prisma: ReferenceAccessPrisma; post: ReferenceAccessPost; viewerId: string | undefined; now: Date }): Promise<ReferenceAccessVerdict>`
  - `type ReferenceAccessPost = { id: string; type: string; expiresAt: Date | null }`
  - `REFERENCE_VIEW_WINDOW_MS = 24 * 3600_000`

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/referenceAccess.test.ts` :

```ts
/**
 * `resolveReferenceAccess` — le droit qu'une référence ouvre.
 *
 * Contenu vivant : illimité. Contenu expiré : une fenêtre de 24 h, ouverte par
 * la première vue et jamais rafraîchie. Passé la fenêtre, plus rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolveReferenceAccess } from '../../../../services/posts/referenceAccess';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;

function makePrisma(row: unknown) {
  return {
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(row) },
  } as any;
}

const LIVE = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() + HOUR) };
const EXPIRED = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };

describe('resolveReferenceAccess', () => {
  it('rend "none" pour un lecteur anonyme', async () => {
    const prisma = makePrisma(null);
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: undefined, now: NOW }))
      .toBe('none');
    expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
  });

  it('rend "none" quand le lecteur n\'est pas référencé', async () => {
    const prisma = makePrisma(null);
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('none');
  });

  it('rend "granted" sur un contenu VIVANT, droit intact', async () => {
    const prisma = makePrisma({ expiredViewAt: null });
    expect(await resolveReferenceAccess({ prisma, post: LIVE, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "granted" sur un contenu vivant MÊME si une fenêtre passée est close', async () => {
    const prisma = makePrisma({ expiredViewAt: new Date(NOW.getTime() - 48 * HOUR) });
    expect(await resolveReferenceAccess({ prisma, post: LIVE, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "granted" sur un contenu expiré dont le droit n\'a jamais servi', async () => {
    const prisma = makePrisma({ expiredViewAt: null });
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "granted" pendant les 24 h qui suivent la première vue', async () => {
    const prisma = makePrisma({ expiredViewAt: new Date(NOW.getTime() - 23 * HOUR) });
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "consumed" une fois la fenêtre de 24 h écoulée', async () => {
    const prisma = makePrisma({ expiredViewAt: new Date(NOW.getTime() - 25 * HOUR) });
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('consumed');
  });

  it('rend "granted" pour un contenu sans échéance', async () => {
    const prisma = makePrisma({ expiredViewAt: null });
    const permanent = { id: 'p1', type: 'POST', expiresAt: null };
    expect(await resolveReferenceAccess({ prisma, post: permanent, viewerId: 'u-bob', now: NOW }))
      .toBe('granted');
  });

  it('rend "none" plutôt que de lever quand la lecture échoue', async () => {
    const prisma = {
      postMention: { findUnique: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as any;
    expect(await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW }))
      .toBe('none');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/referenceAccess.test.ts
```

Attendu : FAIL — module introuvable.

- [ ] **Step 3: Écrire l'unité**

Créer `services/gateway/src/services/posts/referenceAccess.ts` :

```ts
/**
 * Le droit qu'une référence ouvre sur un contenu — la SEULE unité qui en
 * décide.
 *
 * Elle existe pour la raison qui a fait naître `messageMentions.ts` : quand une
 * règle vit dans les appelants, il suffit d'un nouvel appelant pour la perdre.
 * Les ouvertures détaillées sont nombreuses — `GET /posts/:postId`, ouverture
 * de story, de statut, de réel — et aucune ne doit la réimplémenter.
 *
 * La règle :
 *
 *   contenu vivant   → accès sans limite, comme un membre de l'audience
 *   contenu expiré   → une fenêtre de 24 h, ouverte par la première vue
 *   contenu supprimé → hors de portée d'ici (le filtre `deletedAt` a déjà
 *                      écarté le post avant qu'on arrive)
 *
 * Une FENÊTRE et non un instant : un droit qui s'éteint au premier affichage
 * punit ce que l'utilisateur ne contrôle pas — coupure réseau, changement
 * d'appareil, app tuée pendant la lecture. « Au moins une fois » serait
 * respecté à la lettre et trahi en pratique.
 *
 * Cette unité ne CONSOMME rien : elle lit. La consommation est un acte
 * explicite, posé par `POST /posts/:postId/view` (`consumeReferenceView`), et
 * jamais un effet de bord d'une lecture — la NSE préfetche le post à la
 * réception de la notification, et la revalidation cache-first relit derrière.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type ReferenceAccessPrisma = Pick<PrismaClient, 'postMention'>;

/** Ce qu'une décision d'accès a besoin de savoir du post. */
export type ReferenceAccessPost = {
  readonly id: string;
  readonly type: string;
  readonly expiresAt: Date | null;
};

/**
 * `none`     — pas de référence pour ce lecteur ; l'expiration s'applique normalement
 * `granted`  — droit intact, ou fenêtre encore ouverte : afficher malgré l'expiration
 * `consumed` — droit éteint : écran « ce contenu n'est plus disponible »
 */
export type ReferenceAccessVerdict = 'none' | 'granted' | 'consumed';

/** Durée pendant laquelle un contenu expiré reste ouvrable après la première vue. */
export const REFERENCE_VIEW_WINDOW_MS = 24 * 3600_000;

export async function resolveReferenceAccess(params: {
  prisma: ReferenceAccessPrisma;
  post: ReferenceAccessPost;
  viewerId: string | undefined;
  now: Date;
}): Promise<ReferenceAccessVerdict> {
  const { prisma, post, viewerId, now } = params;
  if (!viewerId) return 'none';

  try {
    const reference = await prisma.postMention.findUnique({
      where: { post_user_mention_unique: { postId: post.id, mentionedUserId: viewerId } },
      select: { expiredViewAt: true },
    });
    if (!reference) return 'none';

    // Contenu vivant : la référence n'a rien à dépenser. Une fenêtre close par
    // une expiration PASSÉE ne doit pas fermer un contenu republié depuis.
    const expired = post.expiresAt !== null && post.expiresAt.getTime() <= now.getTime();
    if (!expired) return 'granted';

    const openedAt = reference.expiredViewAt;
    if (!openedAt) return 'granted';

    return now.getTime() - openedAt.getTime() < REFERENCE_VIEW_WINDOW_MS ? 'granted' : 'consumed';
  } catch {
    // Une lecture en échec ne doit pas OUVRIR un contenu : `none` laisse la
    // règle d'audience ordinaire trancher, ce qui est la réponse sûre.
    return 'none';
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/referenceAccess.test.ts
```

Attendu : PASS — 9 tests.

- [ ] **Step 5: Écrire le test rouge de la branche ACL**

Ajouter à `services/gateway/src/__tests__/unit/services/posts/postAudienceConsumption.test.ts` :

```ts
describe('canUserViewPost — branche référence', () => {
  it('ouvre un post FRIENDS à un non-ami qui y est référencé', async () => {
    const prisma = {
      friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      postMention: {
        findUnique: jest.fn<any>().mockResolvedValue({ expiredViewAt: null }),
      },
    } as any;

    const allowed = await canUserViewPost(
      prisma,
      { authorId: 'u-author', visibility: 'FRIENDS', visibilityUserIds: [], id: 'p1' },
      'u-stranger',
      { includeDirectContacts: true, includeReferenced: true }
    );

    expect(allowed).toBe(true);
  });

  it('laisse un non-ami NON référencé dehors', async () => {
    const prisma = {
      friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    } as any;

    const allowed = await canUserViewPost(
      prisma,
      { authorId: 'u-author', visibility: 'FRIENDS', visibilityUserIds: [], id: 'p1' },
      'u-stranger',
      { includeDirectContacts: true, includeReferenced: true }
    );

    expect(allowed).toBe(false);
  });
});
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/postAudienceConsumption.test.ts -t "branche référence"
```

Attendu : FAIL — le premier cas rend `false`.

- [ ] **Step 7: Ajouter la branche — côté CONSOMMATION seulement**

⚠️ **Le piège de cette tâche.** `canUserConsumePost` et `canUserInteractWithPost` appellent
tous deux `canUserViewPost` et **ne diffèrent que par leurs options**. Poser la branche dans
`canUserViewPost` sans la garder ouvrirait donc aussi l'INTERACTION : tout référencé pourrait
réagir et commenter, ce qui casse l'asymétrie « voir ⊇ interagir » — décision produit du
2026-07-08, que le fichier protège explicitement (« les deux ne sont PAS identiques ; ne pas
réaligner l'un sur l'autre sans re-décider l'ACL d'interaction »).

La branche est donc gouvernée par une option, comme `includeDirectContacts` l'est déjà.

Dans `services/gateway/src/services/posts/postVisibility.ts` :

- étendre `PostVisibilityRecord` d'un `id: string`, et `POST_ACL_SELECT` de `id: true` — sinon
  `loadCommentPostAcl` rend un record sans `id` et la branche interroge `undefined` ;
- étendre `PostAclPrisma` de `'postMention'` ;
- insérer la branche **après** le court-circuit auteur et **avant** le `switch` :

```ts
export async function canUserViewPost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId: string,
  options: { includeDirectContacts?: boolean; includeReferenced?: boolean } = {}
): Promise<boolean> {
  if (post.authorId === userId) return true;

  // Être NOMMÉ dans un contenu l'ouvre — décision produit 2026-08-19. La
  // branche vit AVANT le switch parce qu'elle traverse toutes les visibilités :
  // un référencé passe une story FRIENDS sans être ami, et un EXCEPT ne le vise
  // pas puisque l'auteur vient précisément de le nommer.
  //
  // `includeReferenced` la garde, exactement comme `includeDirectContacts`
  // garde l'élargissement de la branche FRIENDS : elle n'ouvre que la
  // CONSOMMATION. Être nommé ne donne pas le droit de réagir ni de commenter —
  // l'asymétrie « voir ⊇ interagir » (2026-07-08) tient toujours, et cette
  // option est ce qui la rend exécutable plutôt que déclarative.
  //
  // Le verdict ne regarde ici que l'EXISTENCE de la référence, pas l'expiration :
  // celle-ci n'a de sens qu'à l'ouverture d'un contenu précis, et c'est
  // `resolveReferenceAccess` qui la tranche.
  if (options.includeReferenced) {
    const referenced = await prisma.postMention.findUnique({
      where: { post_user_mention_unique: { postId: post.id, mentionedUserId: userId } },
      select: { id: true },
    }).catch(() => null);
    if (referenced) return true;
  }

  switch (post.visibility) {
```

Puis, dans `canUserConsumePost` **seulement** :

```ts
  return canUserViewPost(prisma, post, userId, {
    includeDirectContacts: true,
    includeReferenced: true,
  });
```

`canUserInteractWithPost` reste **inchangé**.

- [ ] **Step 7bis: Verrouiller l'asymétrie par un test**

Ajouter à `services/gateway/src/__tests__/unit/services/posts/postAudienceConsumption.test.ts` :

```ts
it('laisse un référencé CONSOMMER mais pas INTERAGIR', async () => {
  const prisma = {
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postMention: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'm1' }) },
  } as any;
  const post = { id: 'p1', authorId: 'u-author', visibility: 'FRIENDS', visibilityUserIds: [] };

  expect(await canUserConsumePost(prisma, post, 'u-stranger')).toBe(true);
  expect(await canUserInteractWithPost(prisma, post, 'u-stranger')).toBe(false);
});
```

- [ ] **Step 8: Lancer la suite de visibilité**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/
```

Attendu : PASS. Les appelants de `canUserViewPost` doivent désormais passer `id` dans le record — le compilateur les désigne un par un.

- [ ] **Step 9: Committer**

```bash
git add services/gateway/src/services/posts/referenceAccess.ts \
        services/gateway/src/services/posts/postVisibility.ts \
        services/gateway/src/__tests__/unit/services/posts/referenceAccess.test.ts \
        services/gateway/src/__tests__/unit/services/posts/postAudienceConsumption.test.ts
git commit -m "feat(gateway): être nommé dans un contenu l'ouvre, même expiré

Une seule unité en décide, pour la raison qui a fait naître messageMentions :
quand une règle vit dans ses appelants, il suffit d'un appelant de plus pour
la perdre. Une fenêtre de 24 h et non un instant — un droit qui s'éteint au
premier affichage punit une coupure réseau ou un changement d'appareil."
```

---

### Task 8: Consommation sur `POST /posts/:postId/view`

**Files:**
- Modify: `services/gateway/src/services/posts/referenceAccess.ts`
- Modify: `services/gateway/src/services/PostService.ts:1646` (`recordView`)
- Test: `services/gateway/src/__tests__/unit/services/posts/referenceViewConsumption.test.ts`

**Interfaces:**
- Consumes: `ReferenceAccessPrisma`, `ReferenceAccessPost`, `REFERENCE_VIEW_WINDOW_MS` (Task 7)
- Produces: `consumeReferenceView(params: { prisma: ReferenceAccessPrisma; post: ReferenceAccessPost; viewerId: string; now: Date }): Promise<void>`

**Pourquoi pas sur la lecture :** trois chemins déjà en place dépenseraient le droit avant tout affichage — la NSE préfetche le post à la réception de la notification (`StoryNotificationTargetViewModel` draine `NSEPendingPostConsumer`), la revalidation cache-first relit derrière, et le pull-to-refresh relit encore.

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/referenceViewConsumption.test.ts` :

```ts
/**
 * `consumeReferenceView` — l'acte explicite qui ouvre la fenêtre de 24 h.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { consumeReferenceView } from '../../../../services/posts/referenceAccess';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;

function makePrisma() {
  return {
    postMention: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

const EXPIRED = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };
const LIVE = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() + HOUR) };
const PERMANENT = { id: 'p1', type: 'POST', expiresAt: null };

describe('consumeReferenceView', () => {
  it('n\'écrit RIEN sur un contenu vivant', async () => {
    const prisma = makePrisma();
    await consumeReferenceView({ prisma, post: LIVE, viewerId: 'u-bob', now: NOW });
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });

  it('n\'écrit RIEN sur un contenu sans échéance', async () => {
    const prisma = makePrisma();
    await consumeReferenceView({ prisma, post: PERMANENT, viewerId: 'u-bob', now: NOW });
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });

  it('ouvre la fenêtre sur un contenu expiré, et SEULEMENT si elle ne l\'est pas déjà', async () => {
    const prisma = makePrisma();
    await consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });

    // `updateMany` + filtre sur l'absence : c'est ce qui rend l'appel
    // idempotent. Un `update` nu réécrirait l'horodatage à chaque vue, et la
    // fenêtre glisserait indéfiniment — le droit ne s'éteindrait jamais.
    expect(prisma.postMention.updateMany).toHaveBeenCalledWith({
      where: {
        postId: 'p1',
        mentionedUserId: 'u-bob',
        OR: [{ expiredViewAt: { isSet: false } }, { expiredViewAt: null }],
      },
      data: { expiredViewAt: NOW },
    });
  });

  it('ne lève jamais — une vue perdue ne doit pas casser un affichage réussi', async () => {
    const prisma = {
      postMention: { updateMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as any;
    await expect(
      consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/referenceViewConsumption.test.ts
```

Attendu : FAIL — `consumeReferenceView` n'existe pas.

- [ ] **Step 3: Écrire la consommation**

Ajouter à `services/gateway/src/services/posts/referenceAccess.ts` :

```ts
/**
 * Ouvre la fenêtre de consultation d'un contenu EXPIRÉ — l'acte explicite, posé
 * par `POST /posts/:postId/view` quand le contenu est réellement affiché.
 *
 * `updateMany` avec un filtre sur l'absence, jamais `update` : l'appel doit
 * être IDEMPOTENT. Un client rejoue sa vue à chaque reprise d'affichage, et
 * réécrire l'horodatage ferait glisser la fenêtre indéfiniment — le droit ne
 * s'éteindrait jamais, ce qui est exactement ce que la fenêtre existe pour
 * empêcher.
 *
 * Piège Prisma-Mongo : `{ expiredViewAt: null }` ne matche pas un document où
 * la clé est ABSENTE, c'est-à-dire toutes les références jamais consommées.
 * Les deux branches sont nécessaires.
 *
 * Best-effort — ne lève jamais : une vue perdue ne doit pas transformer un
 * affichage réussi en erreur.
 */
export async function consumeReferenceView(params: {
  prisma: ReferenceAccessPrisma;
  post: ReferenceAccessPost;
  viewerId: string;
  now: Date;
}): Promise<void> {
  const { prisma, post, viewerId, now } = params;

  const expired = post.expiresAt !== null && post.expiresAt.getTime() <= now.getTime();
  if (!expired) return;

  try {
    await prisma.postMention.updateMany({
      where: {
        postId: post.id,
        mentionedUserId: viewerId,
        OR: [{ expiredViewAt: { isSet: false } }, { expiredViewAt: null }],
      },
      data: { expiredViewAt: now },
    });
  } catch {
    // Silencieux à dessein : l'appelant a déjà rendu le contenu.
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/referenceViewConsumption.test.ts
```

Attendu : PASS — 4 tests.

- [ ] **Step 5: Brancher sur `recordView`**

Dans `services/gateway/src/services/PostService.ts`, méthode `recordView`, le filtre de visibilité écarte aujourd'hui un référencé hors audience — il faut le rattraper et consommer :

```ts
  async recordView(postId: string, userId: string, duration?: number): Promise<boolean> {
    try {
      const visibilityFilter = await this.buildVisibilityFilter(userId);
      const post = await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
        select: {
          id: true, authorId: true, repostOfId: true, originalRepostOfId: true,
          type: true, expiresAt: true,
        },
      });

      // Un référencé HORS audience ne passe pas le filtre ci-dessus — c'est
      // pourtant lui que la référence a le droit d'amener ici. On relit sans
      // filtre, et seule la référence décide.
      const target = post ?? await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED },
        select: {
          id: true, authorId: true, repostOfId: true, originalRepostOfId: true,
          type: true, expiresAt: true,
        },
      });
      if (!target) return false;

      const now = new Date();
      const access = await resolveReferenceAccess({
        prisma: this.prisma,
        post: { id: target.id, type: target.type, expiresAt: target.expiresAt },
        viewerId: userId,
        now,
      });

      // Ni membre de l'audience, ni référencé : rien à enregistrer.
      if (!post && access !== 'granted') return false;
      if (access === 'consumed') return false;

      // La vue DÉCLARÉE est le seul acte qui dépense le droit. Une lecture ne
      // consomme jamais rien — la NSE préfetche, le cache revalide, le
      // pull-to-refresh relit.
      if (access === 'granted') {
        await consumeReferenceView({
          prisma: this.prisma,
          post: { id: target.id, type: target.type, expiresAt: target.expiresAt },
          viewerId: userId,
          now,
        });
      }
```

La suite de la méthode (sanitisation de `duration`, crédit de vue, crédit de la racine) reste inchangée — remplacer les usages de `post.` par `target.` dans ce qui suit.

Ajouter l'import :

```ts
import { consumeReferenceView, resolveReferenceAccess } from './posts/referenceAccess';
```

- [ ] **Step 6: Écrire le test rouge de la garde « lire ne consomme pas »**

C'est la garde qui verrouille tout §3.3 de la spec — elle se teste au niveau du service, là où
la dépense aurait lieu, sans monter de harnais HTTP.

Ajouter à `services/gateway/src/__tests__/unit/services/posts/referenceViewConsumption.test.ts` :

```ts
describe('lire ne consomme jamais un droit', () => {
  it('trois lectures d\'un contenu expiré n\'écrivent aucun expiredViewAt', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
    const findUnique = jest.fn<any>().mockResolvedValue({ expiredViewAt: null });
    const prisma = { postMention: { updateMany, findUnique } } as any;

    // `resolveReferenceAccess` est le SEUL chemin qu'une lecture emprunte :
    // GET /posts/:id, l'ouverture de story et l'ouverture de statut passent
    // tous par lui. S'il n'écrit pas, aucune lecture n'écrit.
    await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });
    await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });
    await resolveReferenceAccess({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejouer la vue ne fait PAS glisser la fenêtre', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
    const prisma = { postMention: { updateMany } } as any;
    const later = new Date(NOW.getTime() + 3 * HOUR);

    await consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: NOW });
    await consumeReferenceView({ prisma, post: EXPIRED, viewerId: 'u-bob', now: later });

    // Les deux appels partent, mais le filtre sur l'absence fait que le second
    // ne matche plus rien en base : c'est lui, et non un compte d'appels, qui
    // garantit l'idempotence.
    for (const call of updateMany.mock.calls) {
      expect(call[0].where.OR).toEqual([
        { expiredViewAt: { isSet: false } },
        { expiredViewAt: null },
      ]);
    }
  });
});
```

Ajouter l'import de `resolveReferenceAccess` en tête du fichier.

- [ ] **Step 7: Lancer les tests**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/ src/__tests__/unit/routes/posts/
```

Attendu : PASS.

- [ ] **Step 8: Committer**

```bash
git add services/gateway/src/services/posts/referenceAccess.ts \
        services/gateway/src/services/PostService.ts \
        services/gateway/src/__tests__/unit/services/posts/referenceViewConsumption.test.ts \
        services/gateway/src/__tests__/unit/routes/posts/core.test.ts
git commit -m "feat(gateway): le droit de voir un contenu expiré se dépense à la vue, pas à la lecture

La NSE préfetche le post dès la réception de la notification et la
revalidation cache-first relit derrière : posée sur GET, la consommation
aurait éteint le droit pendant que le téléphone était dans une poche.
updateMany filtré sur l'absence, pour que rejouer la vue ne fasse pas
glisser la fenêtre indéfiniment."
```

---

### Task 9: Le balayage épargne les statuts dont un droit vit encore

**Files:**
- Modify: `services/gateway/src/services/ExpiredStoriesCleanupService.ts:144-200`
- Modify: `services/gateway/src/services/posts/ephemeralPosts.ts`
- Test: `services/gateway/src/__tests__/unit/services/posts/expiredCleanupReferences.test.ts`

**Interfaces:**
- Consumes: `REFERENCE_VIEW_WINDOW_MS` (Task 7)
- Produces: `REFERENCE_SWEEP_GRACE_MS = 7 * 24 * 3600_000`, `buildSweepableFilter(now: Date): Record<string, unknown>`

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/expiredCleanupReferences.test.ts` :

```ts
/**
 * Un statut référencé ne doit pas être détruit avant que la personne nommée
 * ait pu l'ouvrir — sinon la promesse « vous le verrez au moins une fois » est
 * fausse dès la deuxième heure.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { buildSweepableFilter, REFERENCE_SWEEP_GRACE_MS } from '../../../../services/posts/ephemeralPosts';

const NOW = new Date('2026-08-19T12:00:00.000Z');

describe('buildSweepableFilter', () => {
  it('exige que le post soit expiré', () => {
    const filter = buildSweepableFilter(NOW) as any;
    expect(filter.expiresAt).toEqual({ lt: NOW });
  });

  it('épargne un post portant une référence dont le droit vit encore', () => {
    const filter = buildSweepableFilter(NOW) as any;
    const windowStart = new Date(NOW.getTime() - 24 * 3600_000);

    expect(filter.OR).toEqual([
      // plus aucune référence vivante…
      {
        mentions: {
          none: {
            OR: [
              { expiredViewAt: { isSet: false } },
              { expiredViewAt: null },
              { expiredViewAt: { gt: windowStart } },
            ],
          },
        },
      },
      // …ou le plafond de grâce est dépassé, quoi qu'il arrive
      { expiresAt: { lt: new Date(NOW.getTime() - REFERENCE_SWEEP_GRACE_MS) } },
    ]);
  });

  it('fixe le plafond de grâce à 7 jours', () => {
    expect(REFERENCE_SWEEP_GRACE_MS).toBe(7 * 24 * 3600_000);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/expiredCleanupReferences.test.ts
```

Attendu : FAIL — `buildSweepableFilter` n'existe pas.

- [ ] **Step 3: Écrire le filtre**

Ajouter à `services/gateway/src/services/posts/ephemeralPosts.ts` :

```ts
import { REFERENCE_VIEW_WINDOW_MS } from './referenceAccess';

/**
 * Combien de temps un contenu éphémère RÉFÉRENCÉ survit à son échéance quand
 * personne n'ouvre jamais sa notification.
 *
 * Sans ce plafond, une seule référence suffirait à garder un statut en vie
 * pour toujours : le filtre n'épargne que les droits INTACTS, et un droit que
 * personne n'exerce reste intact indéfiniment.
 *
 * Aligné sur `EPHEMERAL_AUTHOR_ARCHIVE_MS` — même ordre de grandeur, même
 * intuition : au-delà d'une semaine, plus personne ne revient.
 */
export const REFERENCE_SWEEP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ce qu'un balayeur a le droit de détruire.
 *
 * Un statut RÉFÉRENCÉ porte une promesse — « vous le verrez au moins une
 * fois » — que sa destruction rendrait fausse dès la deuxième heure. Il est
 * donc épargné tant qu'au moins une de ses références garde un droit vivant :
 * jamais consommée, ou dans sa fenêtre de 24 h.
 *
 * Piège Prisma-Mongo : `{ expiredViewAt: null }` ne matche pas un champ ABSENT,
 * c'est-à-dire précisément les références jamais consommées — celles qu'il faut
 * le plus épargner. Les trois branches sont nécessaires.
 */
export function buildSweepableFilter(now: Date): Record<string, unknown> {
  const windowStart = new Date(now.getTime() - REFERENCE_VIEW_WINDOW_MS);

  return {
    expiresAt: { lt: now },
    OR: [
      {
        mentions: {
          none: {
            OR: [
              { expiredViewAt: { isSet: false } },
              { expiredViewAt: null },
              { expiredViewAt: { gt: windowStart } },
            ],
          },
        },
      },
      { expiresAt: { lt: new Date(now.getTime() - REFERENCE_SWEEP_GRACE_MS) } },
    ],
  };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/expiredCleanupReferences.test.ts
```

Attendu : PASS — 3 tests.

- [ ] **Step 5: Brancher sur le balayeur**

Dans `services/gateway/src/services/ExpiredStoriesCleanupService.ts`, aux deux endroits qui composent un `where` (~lignes 144 et 190), remplacer le prédicat d'échéance par le filtre partagé :

```ts
          type: { in: [...SWEPT_POST_TYPES] },
          ...buildSweepableFilter(now),
```

en veillant à ce que `now` soit lu **une seule fois** en tête de la passe — deux lectures d'horloge dans la même passe produiraient deux fenêtres différentes.

Ajouter l'import :

```ts
import { buildSweepableFilter, EPHEMERAL_AUTHOR_ARCHIVE_MS, SWEPT_POST_TYPES } from './posts/ephemeralPosts';
```

- [ ] **Step 6: Lancer la suite du balayeur — LES DEUX fichiers**

⚠️ **Deux fichiers de test portent le même nom** dans ce dépôt :

```bash
cd services/gateway
bun run test -- src/__tests__/unit/ExpiredStoriesCleanupService.test.ts
bun run test -- src/__tests__/unit/services/ExpiredStoriesCleanupService.test.ts
```

N'en lancer qu'un laisse l'autre rouge sans qu'on le voie — le piège s'est déjà produit sur
`SocialEventsHandler.test.ts`. Attendu : PASS sur les deux.

- [ ] **Step 7: Committer**

```bash
git add services/gateway/src/services/posts/ephemeralPosts.ts \
        services/gateway/src/services/ExpiredStoriesCleanupService.ts \
        services/gateway/src/__tests__/unit/services/posts/expiredCleanupReferences.test.ts
git commit -m "feat(gateway): un statut référencé survit au balayeur tant qu'un droit vit

Une heure de vie et une promesse de le montrer au moins une fois ne
tiennent pas ensemble sans cette garde. Plafond de grâce à sept jours :
un droit que personne n'exerce reste intact indéfiniment, et une seule
référence suffirait à garder le statut en vie pour toujours."
```

---

### Task 10: Notification — le libellé suit le type du contenu

**Files:**
- Modify: `packages/shared/utils/notification-strings.ts:790-792`
- Modify: `services/gateway/src/services/notifications/NotificationService.ts:2449-2456` (retrait de `filterPostConsumers`)
- Test: `services/gateway/src/__tests__/unit/services/notifications/mentionNotificationLabel.test.ts`

**Interfaces:**
- Consumes: `postType` (déjà présent dans le metadata des notifications de mention)
- Produces: clés de traduction `reference.post` / `reference.reel` / `reference.story` / `reference.status`, dans les 7 langues

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/notifications/mentionNotificationLabel.test.ts` :

```ts
/**
 * « X vous a référencé dans son … » — un libellé par type de contenu.
 *
 * Quatre et non cinq : STATUS et MOOD sont le même type (`PostType` vaut
 * POST | REEL | STORY | STATUS), MOOD n'étant que son nom produit. Le catalogue
 * connaît pourtant `NotificationPostKind = 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'`
 * — les deux valeurs peuvent donc arriver, et se rabattent sur le même libellé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { buildNotificationDisplay } from '@meeshy/shared/utils/notification-strings';

describe('user_mentioned — libellé par type de contenu', () => {
  const cases = [
    { postType: 'POST', expected: 'publication' },
    { postType: 'REEL', expected: 'réel' },
    { postType: 'STORY', expected: 'story' },
    { postType: 'STATUS', expected: 'statut' },
    { postType: 'MOOD', expected: 'statut' },
  ] as const;

  for (const { postType, expected } of cases) {
    it(`nomme un ${postType} dans le titre`, () => {
      const display = buildNotificationDisplay('fr', {
        type: 'user_mentioned',
        actorName: 'Alice',
        postType,
      } as never);

      expect(display.title?.toLowerCase()).toContain(expected);
    });
  }

  it('retombe sur « vous a mentionné » sans type de contenu (conversation)', () => {
    const display = buildNotificationDisplay('fr', {
      type: 'user_mentioned',
      actorName: 'Alice',
    } as never);

    expect(display.title).toBe('Alice vous a mentionné');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/notifications/mentionNotificationLabel.test.ts
```

Attendu : FAIL — le titre est le même pour les quatre types.

- [ ] **Step 3: Brancher le libellé sur `postType`**

Dans `packages/shared/utils/notification-strings.ts`, `buildNotificationDisplay` dispose déjà
de `kind = normalizePostKind(input.postType)` — c'est lui qui rabat MOOD, et il n'y a donc
aucun helper à écrire. Remplacer le cas `user_mentioned` (~ligne 790) :

```ts
    // ── Référence dans un contenu, ou mention en conversation / commentaire ──
    case 'mention':
    case 'user_mentioned':
      // Le type du contenu décide du libellé. Absent, c'est une mention en
      // conversation ou en commentaire : le libellé générique reste le bon.
      return kind
        ? framed(ns(REFERENCE_KEY_BY_KIND[kind]), nounCap)
        : framed(notificationString(L, 'mention'), nounCap);
```

Ajouter, près des autres constantes du fichier :

```ts
/**
 * La clé de libellé par type de contenu référençant.
 *
 * MOOD et STATUS partagent la même : `PostType` n'a que quatre valeurs, MOOD
 * étant le nom PRODUIT de STATUS. `NotificationPostKind` en connaît cinq, et
 * les notifications déjà en base peuvent porter l'une ou l'autre.
 */
const REFERENCE_KEY_BY_KIND: Record<NotificationPostKind, NotificationStringKey> = {
  POST: 'reference.post',
  REEL: 'reference.reel',
  STORY: 'reference.story',
  STATUS: 'reference.status',
  MOOD: 'reference.status',
};
```

- [ ] **Step 4: Déclarer et traduire les clés dans les 7 langues**

D'abord les déclarer dans `NOTIFICATION_STRING_KEYS` (~ligne 18), à côté de `'mention'` :

```ts
  'mention', 'someone',
  'reference.post', 'reference.reel', 'reference.story', 'reference.status',
```

Puis, dans **chacun** des sept dictionnaires de langue, ajouter les quatre entrées juste après
`'mention'` — elles suivent exactement la forme des `'friend.*'` voisines (un fragment
d'action, sans l'acteur, que `framed` préfixe) :

```ts
    // fr
    'reference.post': 'vous a référencé dans sa publication',
    'reference.reel': 'vous a référencé dans son réel',
    'reference.story': 'vous a référencé dans sa story',
    'reference.status': 'vous a référencé dans son statut',
    // en
    'reference.post': 'referenced you in their post',
    'reference.reel': 'referenced you in their reel',
    'reference.story': 'referenced you in their story',
    'reference.status': 'referenced you in their status',
    // es
    'reference.post': 'te referenció en su publicación',
    'reference.reel': 'te referenció en su reel',
    'reference.story': 'te referenció en su historia',
    'reference.status': 'te referenció en su estado',
    // pt
    'reference.post': 'referenciou você na publicação dele(a)',
    'reference.reel': 'referenciou você no reel dele(a)',
    'reference.story': 'referenciou você na story dele(a)',
    'reference.status': 'referenciou você no status dele(a)',
    // it
    'reference.post': 'ti ha menzionato nel suo post',
    'reference.reel': 'ti ha menzionato nel suo reel',
    'reference.story': 'ti ha menzionato nella sua storia',
    'reference.status': 'ti ha menzionato nel suo stato',
```

Les deux langues restantes suivent le même patron — les identifier en lisant les clés du
dictionnaire voisin de `'it'` dans le fichier, et traduire dans le même registre.

⚠️ **Accents obligatoires** : le cliquet français est aveugle aux clés sans accent, une entrée
écrite `reference` ou `refrencé` passerait le gate sans être vue. `référencé` porte ses deux
accents dans les quatre clés françaises ; `referenció` porte le sien en espagnol.

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/notifications/mentionNotificationLabel.test.ts
```

Attendu : PASS — 5 tests.

- [ ] **Step 6: Retirer `filterPostConsumers` du chemin de référence**

Dans `services/gateway/src/services/notifications/NotificationService.ts`, méthode `createPostMentionNotificationsBatch` (~ligne 2449), remplacer le bloc d'audience :

```ts
    // La garde d'audience est RETIRÉE du chemin de référence — décision produit
    // 2026-08-19. Elle empêchait l'extrait d'un post FRIENDS de partir vers un
    // non-ami ; mais nommer quelqu'un lui OUVRE désormais le contenu, donc la
    // garde n'a plus d'objet : elle taisait précisément les gens que l'auteur
    // venait de désigner.
    //
    // Ce qui protège à sa place vit dans le composer, pas ici : il avertit
    // l'auteur quand la personne choisie n'appartient pas à son audience. C'est
    // la SEULE protection restante — ne pas la traiter comme cosmétique.
    const audience = params.mentionedUserIds;
    if (audience.length === 0) return;
```

Supprimer l'import de `filterPostConsumers` s'il n'est plus utilisé ailleurs dans le fichier — **il l'est** (`createCommentMentionNotificationsBatch`, ~ligne 2344, et ~ligne 2165) : le laisser en place.

- [ ] **Step 7: Mettre à jour les tests d'audience**

Fichier exact : `services/gateway/src/__tests__/unit/services/NotificationService.mentionaudience.test.ts`.

Les cas affirmant qu'un référencé hors audience **n'est pas** notifié doivent être inversés : il
l'est désormais, et c'est le comportement voulu. Réécrire l'intention dans le nom du test plutôt
que de supprimer le cas — le fichier documente une décision produit, et l'effacer effacerait la
trace de ce qui a changé et pourquoi.

⚠️ **Ne toucher qu'aux cas de mention de POST.** Le même fichier couvre les mentions en
COMMENTAIRE (`createCommentMentionNotificationsBatch`), qui gardent `filterPostConsumers` :
commenter n'ouvre aucun droit, l'audience y reste souveraine.

- [ ] **Step 8: Lancer la suite complète du gateway**

```bash
cd services/gateway && bun run test:coverage
```

Attendu : 740/740 suites vertes (le total peut avoir augmenté du fait des nouveaux fichiers).

- [ ] **Step 9: Committer**

```bash
git add packages/shared/utils/notification-strings.ts \
        services/gateway/src/services/notifications/NotificationService.ts \
        services/gateway/src/__tests__/unit/services/notifications/
git commit -m "feat(shared,gateway): la notification dit dans QUOI la personne a été référencée

Un libellé par type de contenu, dérivé du postType déjà porté par le
metadata. Et la garde d'audience quitte ce chemin : elle taisait
précisément les gens que l'auteur venait de désigner, alors que les
nommer leur ouvre désormais le contenu."
```

---

### Task 11: Le verdict d'accès voyage avec le contenu

**Files:**
- Modify: `services/gateway/src/services/PostService.ts` (`getPostById`)
- Modify: `services/gateway/src/services/PostFeedService.ts` (`getStories`)
- Test: `services/gateway/src/__tests__/unit/services/posts/referenceAccessPayload.test.ts`

**Interfaces:**
- Consumes: `resolveReferenceAccess`, `ReferenceAccessVerdict` (Task 7)
- Produces: champ `referenceAccess: ReferenceAccessVerdict` sur toute charge utile de contenu éphémère

**Pourquoi :** `StoryNotificationTargetViewModel` calcule `isExpired(cached)` **localement**, à partir de `expiresAt`. Laissé tel quel, il refuserait d'afficher un contenu que le serveur autorise — le droit de référence lui est invisible. Le client ne doit pas déduire un droit qu'il ne peut pas voir.

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/services/posts/referenceAccessPayload.test.ts` :

```ts
/**
 * Le verdict d'accès voyage AVEC le contenu — le client ne le déduit pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { attachReferenceAccess } from '../../../../services/posts/referenceAccess';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const HOUR = 3600_000;

describe('attachReferenceAccess', () => {
  it('pose "none" quand le lecteur n\'est pas référencé', async () => {
    const prisma = { postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) } } as any;
    const post = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };

    const result = await attachReferenceAccess({ prisma, post, viewerId: 'u-bob', now: NOW });

    expect(result).toEqual({ ...post, referenceAccess: 'none' });
  });

  it('pose "granted" sur un contenu expiré dont le droit est intact', async () => {
    const prisma = {
      postMention: { findUnique: jest.fn<any>().mockResolvedValue({ expiredViewAt: null }) },
    } as any;
    const post = { id: 'p1', type: 'STORY', expiresAt: new Date(NOW.getTime() - HOUR) };

    const result = await attachReferenceAccess({ prisma, post, viewerId: 'u-bob', now: NOW });

    expect(result.referenceAccess).toBe('granted');
  });

  it('préserve tous les autres champs du post', async () => {
    const prisma = { postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) } } as any;
    const post = { id: 'p1', type: 'STORY', expiresAt: null, content: 'coucou', authorId: 'u-a' };

    const result = await attachReferenceAccess({ prisma, post, viewerId: 'u-bob', now: NOW });

    expect(result.content).toBe('coucou');
    expect(result.authorId).toBe('u-a');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/referenceAccessPayload.test.ts
```

Attendu : FAIL — `attachReferenceAccess` n'existe pas.

- [ ] **Step 3: Écrire l'attachement**

Ajouter à `services/gateway/src/services/posts/referenceAccess.ts` :

```ts
/**
 * Pose le verdict sur la charge utile d'un contenu.
 *
 * Il voyage AVEC le contenu parce que le client ne peut pas le déduire : il ne
 * voit que `expiresAt`, et la référence lui est invisible. Sans ce champ, un
 * viewer refuserait d'afficher un contenu que le serveur autorise — il calcule
 * l'expiration en local (`StoryItem.isExpired`), et c'est tout ce qu'il sait.
 *
 * Le client garde `isExpired()` pour ce qu'il sait faire — masquer du tray,
 * griser un aperçu — mais l'OUVERTURE obéit à ce champ.
 */
export async function attachReferenceAccess<T extends ReferenceAccessPost>(params: {
  prisma: ReferenceAccessPrisma;
  post: T;
  viewerId: string | undefined;
  now: Date;
}): Promise<T & { referenceAccess: ReferenceAccessVerdict }> {
  const referenceAccess = await resolveReferenceAccess({
    prisma: params.prisma,
    post: params.post,
    viewerId: params.viewerId,
    now: params.now,
  });
  return { ...params.post, referenceAccess };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/referenceAccessPayload.test.ts
```

Attendu : PASS — 3 tests.

- [ ] **Step 5: Poser le champ sur le détail de post**

Dans `services/gateway/src/services/PostService.ts`, méthode `getPostById`, envelopper les deux `return` par l'attachement :

```ts
    const now = new Date();
    const withAccess = await attachReferenceAccess({
      prisma: this.prisma,
      post: { ...post, mentions: references } as never,
      viewerId: viewerUserId,
      now,
    });
```

puis rendre `withAccess` (enrichi des drapeaux personnels comme aujourd'hui).

Ajouter l'import :

```ts
import { attachReferenceAccess } from './posts/referenceAccess';
```

- [ ] **Step 6: Poser le champ sur les stories du tray**

Dans `services/gateway/src/services/PostFeedService.ts`, méthode `getStories`, mapper les items avant de les rendre. Un `findUnique` par item serait N+1 : lire les références du lecteur **en une seule requête**, puis résoudre en mémoire.

```ts
    // UNE requête pour tout le lot, pas une par story. `getMentionsByPost` fait
    // déjà exactement ça pour l'affinité — même patron, même raison.
    const referenceRows = viewerUserId
      ? await this.prisma.postMention.findMany({
          where: { postId: { in: items.map((item) => item.id) }, mentionedUserId: viewerUserId },
          select: { postId: true, expiredViewAt: true },
        })
      : [];
    const referenceByPost = new Map(referenceRows.map((row) => [row.postId, row.expiredViewAt]));

    const now = new Date();
    const withAccess = items.map((item) => {
      if (!referenceByPost.has(item.id)) return { ...item, referenceAccess: 'none' as const };
      const expired = item.expiresAt !== null && item.expiresAt.getTime() <= now.getTime();
      if (!expired) return { ...item, referenceAccess: 'granted' as const };
      const openedAt = referenceByPost.get(item.id) ?? null;
      if (!openedAt) return { ...item, referenceAccess: 'granted' as const };
      const stillOpen = now.getTime() - openedAt.getTime() < REFERENCE_VIEW_WINDOW_MS;
      return { ...item, referenceAccess: stillOpen ? ('granted' as const) : ('consumed' as const) };
    });
```

⚠️ Cette résolution en mémoire duplique la règle de `resolveReferenceAccess`. Extraire le cœur
dans une fonction pure partagée par les deux — `verdictFor(expiresAt, expiredViewAt, now)` — et
la faire appeler par les deux chemins, plutôt que de laisser deux copies diverger.

- [ ] **Step 7: Lancer les suites touchées**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/posts/ \
                                       src/__tests__/unit/routes/posts/
```

Attendu : PASS.

- [ ] **Step 8: Committer**

```bash
git add services/gateway/src/services/posts/referenceAccess.ts \
        services/gateway/src/services/PostService.ts \
        services/gateway/src/services/PostFeedService.ts \
        services/gateway/src/__tests__/unit/services/posts/referenceAccessPayload.test.ts
git commit -m "feat(gateway): le droit de voir un contenu expiré se déclare, il ne se déduit pas

Le viewer calcule l'expiration en local et ne voit pas la référence : sans
ce verdict dans la charge utile, il refuserait d'afficher un contenu que le
serveur autorise. Une requête pour tout le tray, pas une par story."
```

---

## Vérification finale

- [ ] **Suite complète sous bun, comme la CI**

```bash
cd services/gateway && bun run test:coverage
```

- [ ] **Compilation stricte** — les tests ne remplacent pas `tsc`

```bash
cd services/gateway && npx tsc --noEmit
```

- [ ] **Le contrat OpenAPI reflète le nouveau champ** — vérifier que `mentions` apparaît bien dans les réponses de post et que `display` y est documenté.

## Non-régression — ce qui a été vérifié avant d'écrire ce plan

| Risque | Verdict |
|---|---|
| **Troncature silencieuse Fastify** du nouveau champ `mentions` | ✅ aucun `response` schema sur les routes de lecture de post — seuls `/impression` et `/impressions/batch` déclarent un `schema`, limité à `params`/`body` |
| **Clients cassés par le retrait de `meta.mentionedUsers`** | ✅ aucun chemin post ne le lit. Le seul lecteur (`ConversationSyncEngine.swift:854`) est le chemin **messages**, intact |
| **`APIPost.mentionedUsers` privé de source** | ✅ il n'en a jamais eu : le gateway ne l'écrit sur un post ni en REST ni en socket. Champ mort — à supprimer dans le plan iOS |
| **Interaction ouverte par erreur aux référencés** | ⚠️ **risque réel** — `canUserConsumePost` et `canUserInteractWithPost` partagent `canUserViewPost`. Neutralisé par l'option `includeReferenced` (Task 7) et verrouillé par le test de Task 7bis |
| **Mentions en COMMENTAIRE affectées** | ✅ `createCommentMentionNotificationsBatch` garde `filterPostConsumers` : commenter n'ouvre aucun droit, l'audience y reste souveraine |
| **Messages de conversation affectés** | ✅ `messageMentions.ts`, `Mention`, `Message.validatedMentions` et `resolveMentionedUsers` côté messages : aucun changement |
| **Deux fichiers de test homonymes** (`ExpiredStoriesCleanupService.test.ts`) | ⚠️ les deux doivent être lancés (Task 9, Step 6) |
| **Stories existantes sans badge marqué** | ✅ `collectMentionableText` ne trouve aucun `referenceUserId` à exclure — comportement correct pour l'existant, et le champ arrive avec le plan iOS |
| **Lignes `PostMention` antérieures au discriminant** | ✅ `readDisplay` les lit INLINE ; `postMentionInclude` les inclut via la branche `isSet: false` |
| **Apps iOS déjà installées** | ⚠️ **risque critique** — `PostMentionInput` n'a que `userId`/`username`. Un `display` requis aurait rendu 400 sur chaque publication de story portant une pastille. Neutralisé par `.default('PINNED')` (Task 3) et verrouillé par `postReferenceInputSchema.test.ts` |
| **Stories publiées par le web avec un `@` dans un objet texte** | ℹ️ **changement de comportement voulu** : elles produiront désormais une référence INLINE là où elles n'en produisaient aucune. C'est la correction du défaut, pas une régression |

## Ce que ce plan ne fait pas

- **iOS et web** : plans distincts, écrits après celui-ci. Tant qu'ils ne sont pas livrés, le serveur accepte les déclarations mais aucun client n'en émet — la dérivation INLINE continue de fonctionner seule, et rien ne régresse.
- **Badge PINNED sur un contenu sans canevas** (POST, REEL, STATUS) : le mode est accepté par l'API, mais aucune surface ne l'affiche tant que la convergence des composers n'a pas donné un canevas à tous les types. Les clients masquent l'option.
- **`StoryTextObject.referenceUserId`** : le champ est LU par le gateway (Task 2) mais ÉCRIT par iOS — il arrive avec le plan client. D'ici là, `collectMentionableText` ne trouve simplement aucun badge à exclure, ce qui est le comportement correct pour les stories existantes.
