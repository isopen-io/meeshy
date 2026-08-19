# Références de personnes dans les posts — Plan web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au web la parité complète : référencer quelqu'un selon quatre modes depuis les quatre composers, surligner correctement, afficher la rangée « Avec … », et ouvrir un contenu expiré quand le serveur l'autorise.

**Architecture:** Une règle pure TypeScript dans `packages/shared` — jumelle exacte de son homologue Swift — porte l'état déclaré et les transitions. Deux composants React (menu de mode, feuille de sélection) l'exposent, réutilisés par les quatre composers. Le rendu ne linkifie que ce que le serveur a validé.

**Tech Stack:** Next.js 15, React, TypeScript strict, Zustand, Tailwind, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-19-post-references-design.md`

**Dépend de :** `docs/superpowers/plans/2026-08-19-post-references-gateway.md`. Indépendant du plan iOS — les deux peuvent avancer en parallèle une fois le gateway livré, sauf la Task 1 ici, qui produit la règle partagée que le plan iOS **ne** consomme pas (le Swift a la sienne, testée séparément ; ce sont deux miroirs, pas un partage de code).

## Global Constraints

- **TDD non négociable** : aucun code de production sans test rouge d'abord.
- **TypeScript strict, jamais `any`** — `unknown` + validation aux frontières.
- **Immutabilité** : pas de mutation, méthodes de tableau plutôt que boucles.
- **Pas de commentaires superflus** — le code se lit ; les commentaires expliquent *pourquoi*, jamais *quoi*.
- **Types partagés dans `packages/shared/types/`** — source unique, importés via `@meeshy/shared`.
- **Imports ESM avec `.js`** dans `packages/shared` : un import sans extension fait crasher la prod.
- **Tests** : `cd apps/web && bun run test`. Le `tsc` du web n'est **pas** un gate propre — ne pas s'y fier seul.
- **Valeurs exactes** : le droit d'accès vient de `post.referenceAccess`, **jamais recalculé** depuis `expiresAt`.
- **Le web n'a pas de canevas** : PINNED n'est proposé nulle part ici (voir §9 de la spec). `StoryComposer.tsx` compose des effets, mais aucune couche de badge n'y existe — l'option revient à la convergence.

---

### Task 1: Types partagés et règle pure

**Files:**
- Create: `packages/shared/types/post-reference.ts`
- Create: `packages/shared/utils/composer-references.ts`
- Modify: `packages/shared/types/index.ts`
- Test: `packages/shared/__tests__/composer-references.test.ts`

**Interfaces:**
- Consumes: rien
- Produces:
  - `type PostReferenceDisplay = 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT'`
  - `type PostReference = { userId: string; username: string; displayName: string | null; avatar: string | null; display: PostReferenceDisplay }`
  - `type ReferenceAccess = 'none' | 'granted' | 'consumed'`
  - `type ComposerReference = { username: string; userId?: string; display: PostReferenceDisplay }`
  - `upsertReference`, `removeReference`, `referencePayload`, `removingHandle`, `DECLARABLE_DISPLAYS`

- [ ] **Step 1: Écrire les tests rouges**

Créer `packages/shared/__tests__/composer-references.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  upsertReference,
  removeReference,
  referencePayload,
  removingHandle,
  DECLARABLE_DISPLAYS,
} from '../utils/composer-references.js';

describe('upsertReference', () => {
  it('ajoute une personne absente', () => {
    const result = upsertReference({ username: 'alice', display: 'NOTE' }, []);
    expect(result).toEqual([{ username: 'alice', display: 'NOTE' }]);
  });

  it('change le mode EN PLACE quand elle est déjà là', () => {
    const existing = [
      { username: 'alice', display: 'PINNED' as const },
      { username: 'bob', display: 'SILENT' as const },
    ];
    const result = upsertReference({ username: 'Alice', display: 'NOTE' }, existing);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ username: 'alice', display: 'NOTE' });
    expect(result[1].username).toBe('bob');
  });
});

describe('removeReference', () => {
  it('retire sans tenir compte de la casse', () => {
    expect(removeReference('ALICE', [{ username: 'alice', display: 'NOTE' }])).toEqual([]);
  });
});

describe('referencePayload', () => {
  it('porte le mode de chaque référence', () => {
    const payload = referencePayload([
      { username: 'alice', display: 'PINNED' },
      { username: 'bob', userId: 'u-bob', display: 'SILENT' },
    ]);

    expect(payload).toEqual([
      { username: 'alice', display: 'PINNED' },
      { userId: 'u-bob', display: 'SILENT' },
    ]);
  });

  it('ne déclare JAMAIS INLINE — le serveur le dérive du texte', () => {
    expect(referencePayload([{ username: 'alice', display: 'INLINE' }])).toEqual([]);
  });
});

describe('removingHandle', () => {
  it('retire le handle et l\'espace qu\'il laisserait', () => {
    expect(removingHandle('alice', 'Soirée avec @alice hier')).toBe('Soirée avec hier');
    expect(removingHandle('alice', '@alice')).toBe('');
    expect(removingHandle('alice', 'bravo @Alice !')).toBe('bravo !');
  });

  it('laisse les autres handles tranquilles', () => {
    expect(removingHandle('alice', '@alice et @alicia')).toBe('et @alicia');
  });
});

describe('DECLARABLE_DISPLAYS', () => {
  it('exclut INLINE', () => {
    expect(DECLARABLE_DISPLAYS).toEqual(['PINNED', 'NOTE', 'SILENT']);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd packages/shared && bun run test -- __tests__/composer-references.test.ts
```

Attendu : FAIL — module introuvable.

- [ ] **Step 3: Écrire les types**

Créer `packages/shared/types/post-reference.ts` :

```ts
/**
 * Comment une référence se montre dans un contenu.
 *
 * INLINE est DÉRIVÉ par le serveur, qui relit les `@handle` du texte — le
 * client ne le déclare jamais. Les trois autres sont déclarés : le texte ne
 * peut pas les porter.
 */
export type PostReferenceDisplay = 'INLINE' | 'PINNED' | 'NOTE' | 'SILENT';

/**
 * Une personne référencée, telle que le serveur la sert.
 *
 * Le profil arrive RÉSOLU AU CHARGEMENT : quelqu'un qui change de nom
 * d'affichage apparaît sous son nom actuel, pas sous celui qu'il portait à la
 * publication.
 */
export type PostReference = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly display: PostReferenceDisplay;
};

/**
 * Le droit d'ouvrir un contenu expiré parce qu'on y est référencé — DÉCLARÉ par
 * le serveur, jamais recalculé côté client.
 *
 * Le client ne voit que `expiresAt` et ignore tout de la référence : déduire
 * l'accès localement ferait refuser un contenu que le serveur autorise.
 */
export type ReferenceAccess = 'none' | 'granted' | 'consumed';

/** Une personne que l'auteur a choisi de nommer, et comment. */
export type ComposerReference = {
  readonly username: string;
  readonly userId?: string;
  readonly display: PostReferenceDisplay;
};

/** Ce que le client envoie dans `mentions` de `POST /posts`. */
export type PostReferenceInput = {
  readonly userId?: string;
  readonly username?: string;
  readonly display: Exclude<PostReferenceDisplay, 'INLINE'>;
};
```

- [ ] **Step 4: Écrire la règle**

Créer `packages/shared/utils/composer-references.ts` :

```ts
import type {
  ComposerReference,
  PostReferenceDisplay,
  PostReferenceInput,
} from '../types/post-reference.js';

/**
 * Les modes qu'un CLIENT peut déclarer. INLINE en est absent : le serveur le
 * dérive en relisant le texte, et le déclarer ouvrirait un second chemin vers
 * le même fait, que le premier désaccord ferait diverger.
 */
export const DECLARABLE_DISPLAYS: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = [
  'PINNED',
  'NOTE',
  'SILENT',
];

/**
 * Ajoute une personne, ou change son mode si elle est déjà là.
 *
 * EN PLACE, pas en fin de liste : choisir un mode et en changer sont le même
 * geste côté UI, et voir la pastille sauter au bout de la rangée à chaque
 * changement donnerait l'impression d'avoir ajouté quelqu'un.
 */
export function upsertReference(
  reference: ComposerReference,
  references: readonly ComposerReference[]
): ComposerReference[] {
  const key = reference.username.toLowerCase();
  const index = references.findIndex((r) => r.username.toLowerCase() === key);
  if (index === -1) return [...references, { ...reference, username: key }];

  return references.map((r, i) => (i === index ? { ...r, display: reference.display } : r));
}

/** Retire une personne. Insensible à la casse — le serveur résout de même. */
export function removeReference(
  username: string,
  references: readonly ComposerReference[]
): ComposerReference[] {
  const key = username.toLowerCase();
  return references.filter((r) => r.username.toLowerCase() !== key);
}

/** Ce que la publication DÉCLARE au serveur : les non-INLINE, et elles seules. */
export function referencePayload(
  references: readonly ComposerReference[]
): PostReferenceInput[] {
  return references.flatMap((reference) => {
    if (reference.display === 'INLINE') return [];
    const display = reference.display;
    return [reference.userId ? { userId: reference.userId, display } : { username: reference.username, display }];
  });
}

/**
 * Retire un `@handle` du texte, avec l'espace qu'il laisserait derrière lui.
 *
 * C'est la transition INLINE → autre chose : passer une référence en note ou en
 * silence n'a de sens que si le pseudo quitte la phrase. Frontière de mot à
 * droite : `@alice` ne doit pas emporter `@alicia`.
 */
export function removingHandle(username: string, text: string): string {
  const escaped = username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pattern = new RegExp(`\\s*@${escaped}(?![\\p{L}\\p{N}_.-])`, 'giu');
  return text.replace(pattern, '').trim();
}
```

- [ ] **Step 5: Exporter depuis l'index**

Ajouter à `packages/shared/types/index.ts` :

```ts
export type {
  PostReferenceDisplay,
  PostReference,
  ReferenceAccess,
  ComposerReference,
  PostReferenceInput,
} from './post-reference.js';
```

- [ ] **Step 6: Lancer les tests + le build de shared**

```bash
cd packages/shared && bun run test -- __tests__/composer-references.test.ts && bun run build
```

Attendu : PASS — 8 tests, build vert. **Le build est indispensable** : le gateway et le web
importent depuis `dist`, et un type absent de `dist` fait échouer leurs suites.

- [ ] **Step 7: Committer**

```bash
git add packages/shared/types/post-reference.ts \
        packages/shared/utils/composer-references.ts \
        packages/shared/types/index.ts \
        packages/shared/__tests__/composer-references.test.ts
git commit -m "feat(shared): la règle des références, jumelle exacte de son homologue Swift

Choisir un mode et en changer sont le même geste : upsert remplace EN PLACE
plutôt qu'en fin de liste. Et le payload ne déclare jamais INLINE — le
serveur le dérive du texte."
```

---

### Task 2: Surlignage — ne linkifier que ce qui existe

**Files:**
- Modify: `apps/web/components/v2/PostContentText.tsx`
- Test: `apps/web/components/v2/__tests__/PostContentText.test.tsx`

**Interfaces:**
- Consumes: `PostReference` (Task 1)
- Produces: `PostContentText({ content, references, className })`

**Le défaut corrigé :** `PostContentText` linkifie **tout** `@handle` par regex locale, sans savoir si la personne existe. `@nimportequoi` devient un lien vers `/u/nimportequoi` — un profil qui n'existe pas.

- [ ] **Step 1: Écrire les tests rouges**

Créer `apps/web/components/v2/__tests__/PostContentText.test.tsx` :

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostContentText } from '../PostContentText';

const ALICE = {
  userId: 'u-a', username: 'alice', displayName: 'Alice B.', avatar: null, display: 'INLINE' as const,
};

describe('PostContentText', () => {
  it('linkifie un pseudo que le serveur a validé', () => {
    render(<PostContentText content="salut @alice" references={[ALICE]} />);
    expect(screen.getByRole('link', { name: '@alice' })).toHaveAttribute('href', '/u/alice');
  });

  it('NE linkifie PAS un pseudo absent des références', () => {
    render(<PostContentText content="salut @nimportequoi" references={[ALICE]} />);
    expect(screen.queryByRole('link', { name: '@nimportequoi' })).toBeNull();
    expect(screen.getByText(/@nimportequoi/)).toBeInTheDocument();
  });

  it('linkifie tout quand aucune référence n\'est fournie', () => {
    // Serveur non encore déployé : `references` absent. Conserver le
    // comportement actuel vaut mieux que ne plus rien linkifier du tout.
    render(<PostContentText content="salut @alice" />);
    expect(screen.getByRole('link', { name: '@alice' })).toBeInTheDocument();
  });

  it('NE linkifie RIEN quand la liste est vide et fournie', () => {
    // Distinction essentielle : `[]` veut dire « le serveur dit qu'il n'y en a
    // aucune », `undefined` veut dire « il ne s'est pas prononcé ».
    render(<PostContentText content="salut @alice" references={[]} />);
    expect(screen.queryByRole('link', { name: '@alice' })).toBeNull();
  });

  it('compare sans tenir compte de la casse', () => {
    render(<PostContentText content="salut @Alice" references={[ALICE]} />);
    expect(screen.getByRole('link', { name: '@Alice' })).toHaveAttribute('href', '/u/alice');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd apps/web && bun run test -- components/v2/__tests__/PostContentText.test.tsx
```

Attendu : FAIL sur les cas 2 et 4.

- [ ] **Step 3: Ajouter la validation**

Dans `PostContentText.tsx` :

```tsx
export function PostContentText({
  content,
  references,
  className,
}: {
  content: string;
  /**
   * Les références que le serveur a validées. Fourni, SEULS ces pseudos
   * deviennent des liens.
   *
   * `undefined` (serveur non déployé) linkifie tout, comme avant : ne plus rien
   * linkifier serait une régression visible. `[]` ne linkifie rien — le serveur
   * s'est prononcé, et il dit qu'il n'y en a aucune.
   */
  references?: readonly PostReference[];
  className?: string;
}) {
  const validUsernames = references
    ? new Set(references.map((r) => r.username.toLowerCase()))
    : null;
  const segments = parseSegments(content);
  …
          case 'mention':
            if (validUsernames && !validUsernames.has(segment.username.toLowerCase())) {
              return <Fragment key={i}>{segment.content}</Fragment>;
            }
            return (
              <Link key={i} href={`/u/${segment.username.toLowerCase()}`} …>
                {segment.content}
              </Link>
            );
```

⚠️ La regex du fichier (`MENTION_REGEX`) inclut déjà le tiret — elle est alignée sur
`MENTION_HANDLE_CHARS`. Ne pas la « simplifier ».

- [ ] **Step 4: Brancher sur tous les appelants**

`grep -rn "PostContentText" apps/web` et passer `references={post.mentions}` partout : carte de
feed, détail, réel, aperçu de repost.

- [ ] **Step 5: Lancer les tests, committer**

```bash
cd apps/web && bun run test -- components/v2/__tests__/PostContentText.test.tsx
git add apps/web/components/v2/PostContentText.tsx apps/web/components/v2/__tests__/PostContentText.test.tsx
git commit -m "fix(web): un @handle inexistant devenait un lien vers un profil qui n'existe pas

Le rendu linkifiait par regex, sans savoir qui existe. Il reçoit désormais
les références validées par le serveur. Liste absente = comportement
d'avant ; liste vide = le serveur s'est prononcé, on ne linkifie rien."
```

---

### Task 3: La rangée « Avec … » et le marqueur personnel

**Files:**
- Create: `apps/web/components/v2/ReferenceNoteRow.tsx`
- Modify: `apps/web/components/v2/PostCard.tsx`, `PostDetail.tsx`
- Test: `apps/web/components/v2/__tests__/ReferenceNoteRow.test.tsx`

**Interfaces:**
- Consumes: `PostReference` (Task 1)
- Produces: `ReferenceNoteRow({ references, viewerId })`

- [ ] **Step 1: Écrire les tests rouges**

```tsx
const ALICE = { userId: 'u-a', username: 'alice', displayName: 'Alice B.', avatar: null, display: 'NOTE' as const };
const BOB   = { userId: 'u-b', username: 'bob',   displayName: null,       avatar: null, display: 'INLINE' as const };
const CAROL = { userId: 'u-c', username: 'carol', displayName: 'Carol',    avatar: null, display: 'SILENT' as const };

describe('ReferenceNoteRow', () => {
  it('affiche les NOTE, sous leur nom d\'affichage', () => {
    render(<ReferenceNoteRow references={[ALICE, BOB]} viewerId="u-x" />);
    expect(screen.getByText('Alice B.')).toBeInTheDocument();
  });

  it('n\'affiche PAS les INLINE — le texte les porte déjà', () => {
    render(<ReferenceNoteRow references={[BOB]} viewerId="u-x" />);
    expect(screen.queryByText('bob')).toBeNull();
  });

  it('n\'affiche JAMAIS une SILENT à un tiers', () => {
    render(<ReferenceNoteRow references={[CAROL]} viewerId="u-x" />);
    expect(screen.queryByText('Carol')).toBeNull();
  });

  it('montre à la personne concernée qu\'elle est référencée', () => {
    render(<ReferenceNoteRow references={[CAROL]} viewerId="u-c" />);
    expect(screen.getByText(/référencé/i)).toBeInTheDocument();
  });

  it('ne rend rien quand il n\'y a rien à montrer', () => {
    const { container } = render(<ReferenceNoteRow references={[BOB]} viewerId="u-x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Lancer, échouer, implémenter**

Créer `ReferenceNoteRow.tsx`. Deux règles portées par le composant, **pas** par la couche
réseau :

```tsx
/**
 * « Avec Alice B., Bob » sous le contenu.
 *
 * SILENT n'y figure JAMAIS, d'où que vienne la charge utile. Un post détaillé
 * mis en cache puis réutilisé pour rendre une carte de feed porte les
 * silencieuses du lecteur : la garde est ICI, dans le rendu, parce que la
 * couche réseau n'a aucun moyen de savoir où sa charge utile sera réaffichée.
 *
 * PINNED n'y figure pas non plus : sur un contenu qui en porte, la pastille du
 * canevas EST déjà son affichage. Sur le web, aucun contenu n'en porte encore.
 */
```

Et le marqueur personnel, rendu **seulement** quand une SILENT désigne le lecteur : « Vous êtes
référencé·e ici ». C'est la seule réponse que la personne trouve dans le contenu à la
notification qu'elle vient de recevoir.

- [ ] **Step 3: Brancher + i18n + committer**

Poser la rangée dans `PostCard.tsx` et `PostDetail.tsx`. Ajouter les clés de traduction dans
toutes les langues du catalogue web.

```bash
cd apps/web && bun run test -- components/v2/__tests__/ReferenceNoteRow.test.tsx
git add apps/web/components/v2/ReferenceNoteRow.tsx apps/web/components/v2/PostCard.tsx \
        apps/web/components/v2/PostDetail.tsx apps/web/components/v2/__tests__/ReferenceNoteRow.test.tsx \
        apps/web/locales/
git commit -m "feat(web): la rangée « Avec … » montre ceux que le texte ne nomme pas

La garde qui écarte les silencieuses vit dans le rendu, pas dans la couche
réseau : un détail mis en cache puis réaffiché en carte de feed porte les
silencieuses du lecteur, et le réseau ignore où sa charge utile atterrira."
```

---

### Task 4: Le sélecteur — un composant, quatre composers

**Files:**
- Create: `apps/web/components/composer/ReferencePicker.tsx`
- Create: `apps/web/components/composer/ReferenceChipRow.tsx`
- Create: `apps/web/hooks/composer/useReferences.ts`
- Test: `apps/web/hooks/composer/__tests__/useReferences.test.ts`

**Interfaces:**
- Consumes: `upsertReference`, `removeReference`, `referencePayload`, `removingHandle`, `DECLARABLE_DISPLAYS` (Task 1)
- Produces:
  - `useReferences()` → `{ references, pick, drop, payload }`
  - `<ReferencePicker references onChange modes />` — la feuille
  - `<ReferenceChipRow references onOpen />` — la rangée d'état

**Grammaire (spec §7.4)** : *un tap suffit toujours ; l'appui long n'existe que pour ceux qui veulent autre chose.* Sur le web, « appui long » = **clic droit / menu contextuel**, et un appui prolongé sur tactile.

**Modes proposés sur le web : `['NOTE', 'SILENT']`.** Aucun contenu web ne porte de couche de positionnement — proposer un badge promettrait un affichage qui n'arriverait jamais (spec §9).

- [ ] **Step 1: Écrire les tests rouges du hook**

```ts
describe('useReferences', () => {
  it('pose SILENT au clic simple depuis le picker', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker'));
    expect(result.current.references).toEqual([{ username: 'alice', userId: 'u-a', display: 'SILENT' }]);
  });

  it('pose INLINE au clic simple depuis la liste @', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'textList'));
    expect(result.current.references[0].display).toBe('INLINE');
  });

  it('change le mode sans dupliquer', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker'));
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker', 'NOTE'));
    expect(result.current.references).toHaveLength(1);
    expect(result.current.references[0].display).toBe('NOTE');
  });

  it('ne met que les non-INLINE dans le payload', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'textList'));
    act(() => result.current.pick({ username: 'bob', userId: 'u-b' }, 'picker'));
    expect(result.current.payload).toEqual([{ userId: 'u-b', display: 'SILENT' }]);
  });
});
```

- [ ] **Step 2: Lancer, échouer, implémenter le hook**

```ts
/** D'où vient le geste — et donc quel mode un simple clic pose. */
type PickContext = 'picker' | 'textList';

const TAP_DEFAULT: Record<PickContext, PostReferenceDisplay> = {
  // Depuis le chip, on nomme quelqu'un SANS l'écrire : le plus discret gagne.
  picker: 'SILENT',
  // Depuis la liste @, on est en train de l'écrire : l'inline gagne.
  textList: 'INLINE',
};
```

- [ ] **Step 3: Écrire les deux composants**

`ReferencePicker.tsx` — une feuille/popover : champ de recherche, personnes en **chips
horizontaux scrollables**, déjà-référencées en tête avec leur pastille de mode et un `✕`. Elle
**ne se ferme pas** au clic : on en ajoute plusieurs d'affilée.

Le menu contextuel (clic droit + appui prolongé tactile) rend les modes de `modes` avec leur
icône, via un composant de menu déjà présent dans le dépôt (`DropdownMenu` de shadcn si
disponible — vérifier ce qu'utilisent les autres composers avant d'en introduire un).

`ReferenceChipRow.tsx` — `👤 3 personnes` avec les pastilles, qui rouvre la feuille. **Seul
endroit d'où l'auteur voit et retire ses références silencieuses.**

- [ ] **Step 4: Lancer les tests, committer**

```bash
cd apps/web && bun run test -- hooks/composer/__tests__/useReferences.test.ts
git add apps/web/components/composer/ apps/web/hooks/composer/useReferences.ts \
        apps/web/hooks/composer/__tests__/useReferences.test.ts
git commit -m "feat(web): un sélecteur de référence à modes, partagé par les composers

Deux entrées, deux défauts : depuis le chip on nomme sans écrire, donc le
plus discret gagne ; depuis la liste @ on est en train d'écrire, donc
l'inline gagne. Le menu contextuel ouvre le même choix dans les deux cas."
```

---

### Task 5: Brancher les quatre composers

**Files:**
- Modify: `apps/web/components/v2/PostComposer.tsx`
- Modify: `apps/web/components/v2/StatusComposer.tsx`
- Modify: `apps/web/components/v2/StoryComposer.tsx`
- Modify: `apps/web/components/v2/PostEditor.tsx`
- Test: `apps/web/components/v2/__tests__/PostComposerReferences.test.tsx`

**Interfaces:**
- Consumes: `useReferences`, `ReferencePicker`, `ReferenceChipRow` (Task 4)
- Produces: chaque composer envoie `mentions: payload` dans son corps de publication

- [ ] **Step 1: Écrire le test rouge**

```tsx
describe('PostComposer — références', () => {
  it('envoie les modes déclarés dans le corps de publication', async () => {
    const onPublish = vi.fn();
    render(<PostComposer onPublish={onPublish} />);

    // ouvrir le chip, choisir Alice (clic simple → SILENT), publier
    …

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] })
    );
  });

  it('n\'envoie AUCUN champ mentions quand personne n\'est référencé', async () => {
    const onPublish = vi.fn();
    render(<PostComposer onPublish={onPublish} />);
    …
    expect(onPublish.mock.calls[0][0]).not.toHaveProperty('mentions');
  });

  it('retire le @handle du texte quand on passe la référence en note', async () => {
    …
    expect(screen.getByRole('textbox')).toHaveValue('Soirée avec');
  });
});
```

- [ ] **Step 2: Lancer, échouer, brancher**

Dans chaque composer :

1. `const { references, pick, drop, payload } = useReferences();`
2. Un **chip « Mentionner »** dans la barre d'outils → `<ReferencePicker modes={['NOTE','SILENT']} />`
3. La **liste `@`** existante (`useMentions`) gagne son menu contextuel : clic = INLINE
   (comportement actuel), menu = les modes ; tout sauf INLINE appelle `removingHandle` sur le
   contenu.
4. `<ReferenceChipRow />` sous la barre d'outils.
5. Au submit : `...(payload.length > 0 ? { mentions: payload } : {})` — **ne pas envoyer un
   tableau vide** : côté serveur, `[]` signifie « efface toutes les déclarées », alors que
   l'absence signifie « je n'en parle pas » (tri-état, spec §2).

⚠️ **`PostEditor.tsx` (édition) doit envoyer le tri-état correctement** : s'il ne gère pas les
références, il ne doit **pas** envoyer `mentions` du tout — sinon chaque édition de texte
effacerait les NOTE et SILENT du post.

- [ ] **Step 3: Lancer les tests, committer**

```bash
cd apps/web && bun run test -- components/v2/__tests__/
git add apps/web/components/v2/PostComposer.tsx apps/web/components/v2/StatusComposer.tsx \
        apps/web/components/v2/StoryComposer.tsx apps/web/components/v2/PostEditor.tsx \
        apps/web/components/v2/__tests__/PostComposerReferences.test.tsx
git commit -m "feat(web): les quatre composers référencent des personnes hors du texte

Un tableau vide n'est pas l'absence : côté serveur, [] efface les
références déclarées quand l'absence les préserve. L'éditeur n'envoie donc
rien tant qu'il ne les gère pas."
```

---

### Task 6: Viewer — ouvrir un contenu expiré quand le serveur l'autorise

**Files:**
- Modify: `apps/web/components/v2/StoryViewer.tsx`
- Modify: `apps/web/hooks/social/use-stories.ts`
- Test: `apps/web/components/v2/__tests__/StoryViewerReferenceAccess.test.tsx`

**Interfaces:**
- Consumes: `ReferenceAccess` (Task 1), `post.referenceAccess`

- [ ] **Step 1: Écrire les tests rouges**

```tsx
describe('StoryViewer — accès par référence', () => {
  it('affiche une story expirée quand le droit est intact', () => {
    render(<StoryViewer story={expiredStory({ referenceAccess: 'granted' })} />);
    expect(screen.queryByText(/plus disponible/i)).toBeNull();
  });

  it('affiche l\'écran de fin quand le droit est éteint', () => {
    render(<StoryViewer story={expiredStory({ referenceAccess: 'consumed' })} />);
    expect(screen.getByText(/plus disponible/i)).toBeInTheDocument();
  });

  it('garde le comportement actuel sans référence', () => {
    render(<StoryViewer story={expiredStory({ referenceAccess: 'none' })} />);
    expect(screen.getByText(/plus disponible/i)).toBeInTheDocument();
  });

  it('ne consomme aucun droit au simple rendu', () => {
    const recordView = vi.fn();
    render(<StoryViewer story={expiredStory({ referenceAccess: 'granted' })} onView={recordView} />);
    expect(recordView).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer, échouer, implémenter**

L'ouverture obéit à `referenceAccess`, **jamais** à un calcul local sur `expiresAt`. Ce dernier
reste utilisé pour ce qu'il sait faire — afficher le temps restant (`StoryViewer.tsx:1132`),
masquer du tray.

`POST /posts/:postId/view` est appelée quand la slide est **réellement affichée**, pas au
montage, pas au prefetch. C'est elle, et elle seule, qui consomme le droit.

- [ ] **Step 3: Lancer les tests, committer**

```bash
cd apps/web && bun run test -- components/v2/__tests__/StoryViewerReferenceAccess.test.tsx
git add apps/web/components/v2/StoryViewer.tsx apps/web/hooks/social/use-stories.ts \
        apps/web/components/v2/__tests__/StoryViewerReferenceAccess.test.tsx
git commit -m "feat(web): une story expirée s'ouvre quand le serveur l'autorise

Le viewer déduisait l'expiration de expiresAt et ignorait la référence : il
refusait un contenu que le serveur autorise. Le rendu ne consomme jamais le
droit — seule la vue affichée le fait."
```

---

### Task 7: Notification — routage du tap

**Files:**
- Modify: `apps/web/utils/notification-helpers.ts`
- Test: `apps/web/utils/__tests__/notification-helpers.test.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
it('route une référence de story vers le viewer de story', () => {
  const target = resolveNotificationTarget({
    type: 'user_mentioned',
    metadata: { postType: 'STORY', entityType: 'post', postId: 'p1' },
    context: { postId: 'p1' },
  });
  expect(target).toEqual({ kind: 'story', postId: 'p1' });
});

it('route une référence de réel vers le lecteur de réels', () => {
  const target = resolveNotificationTarget({
    type: 'user_mentioned',
    metadata: { postType: 'REEL', entityType: 'post', postId: 'p1' },
    context: { postId: 'p1' },
  });
  expect(target).toEqual({ kind: 'reel', postId: 'p1' });
});
```

- [ ] **Step 2: Lancer, échouer, implémenter**

Le **libellé** vient du serveur (`notification-strings.ts`, Task 10 du plan gateway) : rien à
traduire ici. Ce qui change est le routage du tap selon `metadata.postType`.

`context.expired` reste un **marqueur visuel** et ne bloque aucun clic : un contenu dont le
droit est éteint atterrit sur l'écran de fin servi par le viewer (Task 6), pas sur un clic
refusé.

- [ ] **Step 3: Lancer les tests, committer**

```bash
cd apps/web && bun run test -- utils/__tests__/notification-helpers.test.ts
git add apps/web/utils/notification-helpers.ts apps/web/utils/__tests__/notification-helpers.test.ts
git commit -m "feat(web): le clic d'une notification de référence ouvre la surface du type"
```

---

## Vérification finale

- [ ] **Suite complète du web**

```bash
cd apps/web && bun run test
```

- [ ] **Build de production**

```bash
cd apps/web && bun run build
```

Le `tsc` du web n'est **pas** un gate propre — c'est le build qui fait foi.

- [ ] **`packages/shared` construit** — le gateway et le web importent depuis `dist` :

```bash
cd packages/shared && bun run build
```

- [ ] **i18n complet** — aucune clé manquante dans aucune langue du catalogue web.

## Non-régression

| Risque | Garde |
|---|---|
| Serveur non déployé (`mentions` absent) | `references === undefined` → linkification actuelle conservée (Task 2). Ne **jamais** substituer `[]` à `undefined` |
| `[]` envoyé par un composer qui ne gère pas les références | interdit : `mentions` n'est ajouté que si `payload.length > 0` — sinon chaque édition effacerait les NOTE et SILENT (tri-état) |
| `PostEditor` effaçant les déclarées | il n'envoie pas `mentions` tant qu'il ne les gère pas (Task 5) |
| Fuite d'une SILENT dans une carte de feed | la garde est dans `ReferenceNoteRow`, pas dans la couche réseau — un détail mis en cache peut être réaffiché n'importe où |
| Le web propose un badge invisible | `modes={['NOTE','SILENT']}` : PINNED n'est proposé nulle part sur le web |
| Régression du surlignage des messages | `PostContentText` ne sert **que** les posts ; `MarkdownMessage.tsx` et `use-message-display.ts` (messages) ne sont pas touchés |
| `removingHandle` mangeant un pseudo voisin | frontière de mot à droite, verrouillée par test (`@alice` vs `@alicia`) |
