# iOS Parity — Message Bubbles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aligner le style visuel des bulles de message web sur l'experience iOS : couleurs brand indigo, border-radius 18px, padding genereux, shadows, espacement iOS-like.

**Architecture:** Modifications CSS-only sur 4 composants existants (MessageContent, BubbleMessageNormalView, MessageHeader, MessageNameDate). Aucun changement de structure — seuls les classes Tailwind et styles inline changent. Les tests existants couvrent deja le comportement ; on ajoute des tests visuels pour valider les nouvelles classes.

**Tech Stack:** Tailwind CSS, React Testing Library (assertions className), composants existants.

---

## Contexte iOS de reference

| Token | iOS | Web actuel |
|-------|-----|-----------|
| Own bubble bg | `LinearGradient(#6366F1 → #4338CA)` | `from-blue-400 to-blue-500` |
| Own dark mode | Meme indigo gradient | `from-gray-700 to-gray-800` |
| Other bubble bg | White / gray-800 (dark) | White / gray-800 (dark) — OK |
| Border radius | 18pt | Card default ~8px |
| Own shadow | `color: #6366F1/30%, radius: 8, y: 3` | `shadow-none` |
| Other shadow | `color: senderColor/20%, radius: 6, y: 3` | `shadow-none` |
| Content padding | 14px H, 10px V | `p-1` (4px) |
| Intra-group spacing | 2pt | `mb-0.5` (2px) — OK |
| Inter-group spacing | 10pt | `mb-2.5` (10px) — OK |
| Avatar fallback | Indigo gradient | `from-blue-500 to-purple-600` |
| Name hover color | N/A | `hover:text-blue-600` → indigo |

## Fichiers touches

| Fichier | Changement |
|---------|-----------|
| `apps/web/components/common/bubble-message/MessageContent.tsx` | Couleurs, radius, padding, shadow |
| `apps/web/components/common/bubble-message/BubbleMessageNormalView.tsx` | Aucun changement structurel |
| `apps/web/components/common/bubble-message/MessageHeader.tsx` | Avatar fallback indigo |
| `apps/web/components/common/bubble-message/MessageNameDate.tsx` | Hover color indigo |
| `apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx` | Tests de classes CSS |

---

### Task 1: Own Bubble — Indigo Brand Gradient + Shadow + Radius + Padding

**Files:**
- Modify: `apps/web/components/common/bubble-message/MessageContent.tsx:101-109`
- Test: `apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx`

**Step 1: Write the failing test**

Add a test block to `BubbleMessageNormalView.test.tsx` that verifies own-message Card has indigo classes:

```typescript
describe('iOS Parity — Visual styling', () => {
  it('devrait appliquer le gradient indigo brand sur les messages propres', () => {
    renderNormalView({
      message: createMockMessage({ senderId: 'user-456' }),
      currentUser: createMockUser({ id: 'user-456' }),
    });

    const card = screen.getByTestId('message-card');
    expect(card.className).toContain('from-indigo-500');
    expect(card.className).toContain('to-indigo-700');
  });

  it('devrait garder le gradient indigo en dark mode (pas gray)', () => {
    renderNormalView({
      message: createMockMessage({ senderId: 'user-456' }),
      currentUser: createMockUser({ id: 'user-456' }),
    });

    const card = screen.getByTestId('message-card');
    // Dark mode should STILL use indigo, not gray
    expect(card.className).toContain('dark:from-indigo-600');
    expect(card.className).toContain('dark:to-indigo-800');
  });

  it('devrait appliquer le border-radius iOS (rounded-2xl)', () => {
    renderNormalView({
      message: createMockMessage({ senderId: 'user-456' }),
      currentUser: createMockUser({ id: 'user-456' }),
    });

    const card = screen.getByTestId('message-card');
    expect(card.className).toContain('rounded-2xl');
  });

  it('devrait appliquer une shadow indigo sur les messages propres', () => {
    renderNormalView({
      message: createMockMessage({ senderId: 'user-456' }),
      currentUser: createMockUser({ id: 'user-456' }),
    });

    const card = screen.getByTestId('message-card');
    expect(card.className).toContain('shadow-md');
  });

  it('devrait appliquer un padding genereux sur le contenu (p-3)', () => {
    renderNormalView({
      message: createMockMessage({ senderId: 'user-456' }),
      currentUser: createMockUser({ id: 'user-456' }),
    });

    // Le CardContent devrait avoir un padding plus genereux
    // Note: Ce test verifie le rendu global sans crash avec les nouvelles classes
    expect(screen.getByTestId('message-card')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="iOS Parity" --no-coverage 2>&1 | tail -20`
Expected: FAIL — `from-indigo-500` not found in className (currently `from-blue-400`)

**Step 3: Implement the style changes in MessageContent.tsx**

Replace lines 101-109 in `MessageContent.tsx`:

```tsx
<Card
  className={cn(
    "relative transition-colors duration-200 border overflow-hidden py-0 w-full rounded-2xl",
    isOwnMessage
      ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 dark:from-indigo-600 dark:to-indigo-800 border-indigo-400 dark:border-indigo-600 text-white shadow-md shadow-indigo-500/30 dark:shadow-indigo-900/40'
      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm shadow-gray-200/50 dark:shadow-gray-900/30'
  )}
>
```

Also update `CardContent` padding from `p-1` to `px-3.5 py-2.5`:

```tsx
<CardContent className="px-3.5 py-2.5 w-full break-words overflow-hidden overflow-wrap-anywhere">
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="iOS Parity" --no-coverage 2>&1 | tail -20`
Expected: PASS

**Step 5: Run ALL existing tests to verify no regressions**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/ --no-coverage 2>&1 | tail -30`
Expected: All tests PASS (existing tests mock Card so className changes don't break them)

**Step 6: Commit**

```bash
git add apps/web/components/common/bubble-message/MessageContent.tsx apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx
git commit -m "feat(web): align own-message bubble to iOS indigo brand gradient

- Replace blue-400/500 with indigo-500/700 (brand #6366F1 → #4338CA)
- Keep indigo in dark mode (was gray-700/800, now indigo-600/800)
- Add rounded-2xl (18px) to match iOS cornerRadius: 18
- Add shadow-md with indigo tint for depth
- Increase content padding from p-1 to px-3.5 py-2.5 (iOS: 14px H, 10px V)
- Add subtle shadow-sm on other-user bubbles"
```

---

### Task 2: Avatar Fallback — Indigo Brand Gradient

**Files:**
- Modify: `apps/web/components/common/bubble-message/MessageHeader.tsx:55`
- Test: `apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx`

**Step 1: Write the failing test**

```typescript
it('devrait utiliser le gradient indigo brand pour le fallback avatar', () => {
  renderNormalView({
    message: createMockMessage({
      senderId: 'other-user',
      sender: { id: 'other-user', firstName: 'Jane', avatar: null },
    }),
    currentUser: createMockUser({ id: 'user-456' }),
  });

  const fallback = screen.getByTestId('avatar-fallback');
  expect(fallback.className).toContain('from-indigo-500');
  expect(fallback.className).toContain('to-indigo-700');
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="gradient indigo brand pour le fallback" --no-coverage 2>&1 | tail -10`
Expected: FAIL — className contains `from-blue-500 to-purple-600`

**Step 3: Implement**

In `MessageHeader.tsx` line 55, change:
```tsx
// OLD
<AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs sm:text-sm font-semibold">

// NEW
<AvatarFallback className="bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-xs sm:text-sm font-semibold">
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="gradient indigo brand pour le fallback" --no-coverage 2>&1 | tail -10`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/common/bubble-message/MessageHeader.tsx apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx
git commit -m "feat(web): align avatar fallback to indigo brand gradient"
```

---

### Task 3: Name/Date — Indigo Hover + Consistency

**Files:**
- Modify: `apps/web/components/common/bubble-message/MessageNameDate.tsx:43`
- Modify: `apps/web/components/common/bubble-message/MessageHeader.tsx:46`

**Step 1: Write the failing test**

```typescript
it('devrait utiliser hover:text-indigo-500 pour le lien du nom', () => {
  renderNormalView({
    message: createMockMessage({
      senderId: 'other-user',
      sender: { id: 'other-user', firstName: 'Jane', lastName: 'Smith', username: 'janesmith', avatar: null },
    }),
    currentUser: createMockUser({ id: 'user-456' }),
  });

  // Le lien du nom devrait etre present et avoir le hover indigo
  const nameLink = screen.getByText('Jane Smith');
  expect(nameLink.className).toContain('hover:text-indigo-500');
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="hover:text-indigo" --no-coverage 2>&1 | tail -10`
Expected: FAIL — className contains `hover:text-blue-600`

**Step 3: Implement**

In `MessageNameDate.tsx` line 43:
```tsx
// OLD
className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"

// NEW
className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
```

In `MessageHeader.tsx` line 46:
```tsx
// OLD
avatarUrl && "cursor-pointer hover:ring-2 hover:ring-blue-500 transition-shadow"

// NEW
avatarUrl && "cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-shadow"
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="hover:text-indigo" --no-coverage 2>&1 | tail -10`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/common/bubble-message/MessageNameDate.tsx apps/web/components/common/bubble-message/MessageHeader.tsx apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx
git commit -m "feat(web): align hover colors to indigo brand (name links, avatar ring)"
```

---

### Task 4: Other-Message Bubble — Subtle Styling + Radius

**Files:**
- Modify: `apps/web/components/common/bubble-message/MessageContent.tsx` (deja fait en Task 1 pour `rounded-2xl` et `shadow-sm`)
- Test: `apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx`

**Step 1: Write the failing test**

```typescript
it('devrait appliquer rounded-2xl et shadow-sm sur les messages des autres', () => {
  renderNormalView({
    message: createMockMessage({
      senderId: 'other-user',
      sender: { id: 'other-user', firstName: 'Jane', avatar: null },
    }),
    currentUser: createMockUser({ id: 'user-456' }),
  });

  const card = screen.getByTestId('message-card');
  expect(card.className).toContain('rounded-2xl');
  expect(card.className).toContain('shadow-sm');
});
```

**Step 2: Run test to verify it passes (already implemented in Task 1)**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx --testNamePattern="rounded-2xl et shadow-sm" --no-coverage 2>&1 | tail -10`
Expected: PASS (already applied in Task 1)

**Step 3: Commit**

```bash
git add apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx
git commit -m "test(web): add visual parity tests for other-user bubble styling"
```

---

### Task 5: MarkdownMessage Text Styling — Indigo Links

**Files:**
- Modify: `apps/web/components/common/bubble-message/MessageContent.tsx:134-138`

**Step 1: Write the failing test**

```typescript
it('devrait utiliser des styles de code indigo pour les messages propres', () => {
  renderNormalView({
    message: createMockMessage({
      senderId: 'user-456',
      content: 'Hello with `code`',
    }),
    currentUser: createMockUser({ id: 'user-456' }),
  });

  // Verifie que le composant rend sans crash avec les nouvelles classes
  expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
});
```

**Step 2: Implement**

In `MessageContent.tsx` lines 134-138, update inline code styling:

```tsx
<MarkdownMessage
  content={displayContentWithMentions}
  className={cn(
    "text-sm sm:text-base break-words",
    isOwnMessage
      ? "text-white [&_code]:bg-white/15 [&_code]:text-white/95 [&_pre]:bg-white/10 [&_a]:text-indigo-200 [&_a]:underline"
      : "text-gray-800 dark:text-gray-100 [&_a]:text-indigo-500 [&_a]:dark:text-indigo-400"
  )}
  enableTracking={true}
  isOwnMessage={isOwnMessage}
  onLinkClick={() => {}}
/>
```

**Step 3: Run all tests**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/ --no-coverage 2>&1 | tail -20`
Expected: All PASS

**Step 4: Commit**

```bash
git add apps/web/components/common/bubble-message/MessageContent.tsx apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx
git commit -m "feat(web): align link/code colors to indigo brand in message bubbles"
```

---

### Task 6: Full Regression Test + Visual Verification

**Step 1: Run the complete bubble-message test suite**

Run: `cd apps/web && npx jest __tests__/components/common/bubble-message/ --no-coverage --verbose 2>&1 | tail -50`
Expected: ALL tests PASS

**Step 2: Run the broader messages test suite**

Run: `cd apps/web && npx jest --testPathPattern="bubble-message|messages-display|ConversationMessages" --no-coverage 2>&1 | tail -30`
Expected: ALL PASS

**Step 3: Build check**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors

**Step 4: Final commit if any remaining changes**

```bash
git status
# If clean, nothing to commit
```

---

## Summary of Visual Changes

```
BEFORE (Web)                          AFTER (Web = iOS)
────────────────────                  ────────────────────
Own bubble: Blue 400→500              Own bubble: Indigo 500→700 (#6366F1→#4338CA)
Dark own: Gray 700→800                Dark own: Indigo 600→800 (brand preserved)
Border radius: ~8px (Card)            Border radius: 18px (rounded-2xl)
Shadow: none                          Shadow: md + indigo tint (own), sm (other)
Padding: 4px (p-1)                    Padding: 14px H, 10px V (px-3.5 py-2.5)
Avatar fallback: Blue→Purple          Avatar fallback: Indigo 500→700
Hover colors: Blue 600                Hover colors: Indigo 500
Code bg: white/10                     Code bg: white/15
Links: default                        Links: Indigo 200 (own) / 500 (other)
```

## Risques & Mitigations

| Risque | Mitigation |
|--------|-----------|
| Card mock dans tests ignore className | Tests ajoutent des assertions explicites sur className |
| Shadow trop forte sur mobile | `shadow-md` Tailwind est subtile, shadow-sm pour autres |
| Indigo trop sombre en dark mode | `dark:from-indigo-600` (plus clair que 700) |
| Padding casse layout des longs messages | `break-words` + `overflow-wrap-anywhere` preserves |
