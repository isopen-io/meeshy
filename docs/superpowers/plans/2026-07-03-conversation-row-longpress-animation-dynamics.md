# Long-Press Animation Dynamics — Amélioration Visibilité & Rebond

> **Pour agentic workers :** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'animation du long-press **perceptiblement plus dynamique et rebondissante** lors du long-press sur une ligne conversation, et améliorer le collapse du preview avec feedback visuel.

**Architecture:** 
- Long-press sur ligne → scale animation + haptic + couleur de feedback
- Preview ouverture → zoom rebond + menu slide-up coordonné
- Collapse preview → scale progressive + blur + opacity pour feedback
- Drop sur section → placeholder visuel + animation placement

**Tech Stack:** SwiftUI spring animations, gesture feedback, haptic engine.

## Global Constraints

- iOS 16.0+ (no iOS 15 shape API differences)
- Spring physics: prioritize perceptible motion (dampingFraction ≤ 0.70 pour rebond visible)
- Haptic feedback coordonnée (pas de duplication)
- Aucun DragGesture sur les lignes (scroll compatibility)
- Tous les gestes visuels en .overlay ou .gesture local, jamais plein-ligne

---

## Task 1: Amplifier le rebond du long-press ligne

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift:128`

**Interfaces:**
- Consumes: Current `.animation(.spring(response: 0.65, dampingFraction: 0.99), value: isActivelyPressed)`
- Produces: Spring avec dampingFraction ≤ 0.70 pour rebond visible

**Steps:**

- [ ] **Step 1: Audit current spring behavior**

Run on simulator iPhone 16 Pro:
```bash
./apps/ios/meeshy.sh run
# Long-press sur une ligne, observer le scale 0.90 → 1.0
# Vérifier : le rebond est-il visible ? Dure ~1.5s ?
```

- [ ] **Step 2: Identifier le bon dampingFraction**

Tester 3 variantes in-code avec comments:
- Option A (current): `response: 0.65, dampingFraction: 0.99` — très amorti, rebond quasi-invisible
- Option B: `response: 0.60, dampingFraction: 0.68` — rebond visible 1-2 oscillations
- Option C: `response: 0.55, dampingFraction: 0.65` — rebond plus prononcé, 2-3 oscillations

```swift
// BEFORE (line 128)
.animation(.spring(response: 0.65, dampingFraction: 0.99), value: isActivelyPressed)

// AFTER (pick B or C based on feel)
.animation(.spring(response: 0.60, dampingFraction: 0.68), value: isActivelyPressed)
```

- [ ] **Step 3: Test on simulator**

```bash
./apps/ios/meeshy.sh run
# Long-press 5-6 fois sur des lignes différentes
# Vérifier : rebond visible et satisfaisant ?
```

- [ ] **Step 4: Add visual feedback (blur/opacity) during press**

Ajouter un `.blur()` optionnel ou `.opacity()` durant la press (optionnel, test d'abord sans):

```swift
.scaleEffect(isActivelyPressed ? 0.90 : 1.0)
+ .blur(radius: isActivelyPressed ? 0.3 : 0) // Subtle
```

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift
git commit -m "perf(ios/longpress): amplify row scale animation dampingFraction for visible rebounce"
```

---

## Task 2: Amplifier le rebond du preview ouverture (overlay)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift:402`

**Interfaces:**
- Consumes: Current `.spring(response: 0.44, dampingFraction: 0.6)`
- Produces: Spring avec plus de rebond visible (menu + preview ensemble)

**Steps:**

- [ ] **Step 1: Test current preview opening animation**

```bash
./apps/ios/meeshy.sh run
# Long-press sur une ligne
# Vérifier : le preview grandit et le menu remonte ensemble ?
# Le rebond est visible ?
```

- [ ] **Step 2: Propose improved spring**

Tester:
```swift
// BEFORE (line 402)
.spring(response: 0.44, dampingFraction: 0.6)

// AFTER (more bouncy opening)
.spring(response: 0.45, dampingFraction: 0.58)
```

- [ ] **Step 3: Add menu offset animation coordination**

Le menu doit animé son offset(.y) en syncro avec preview scale:

```swift
// Line 392: current static
.offset(y: contextMenuAppeared ? 0 : 70)

// AFTER: coordinate with preview scale (visual effect)
.offset(y: contextMenuAppeared ? 0 : min(70, CGFloat(70 * (1.0 - previewScale))))
// This creates illusion of menu pushing up as preview grows
```

- [ ] **Step 4: Test coordination**

```bash
./apps/ios/meeshy.sh run
# Long-press, observe preview + menu animation sync
# More bouncy, more coordinated ?
```

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift
git commit -m "perf(ios/longpress): improve preview opening animation and menu sync"
```

---

## Task 3: Enhance preview collapse visual feedback

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift:417-439`

**Interfaces:**
- Consumes: Current `previewCollapseGesture` with scale-only feedback
- Produces: Enhanced feedback (scale + blur + opacity + offset) during collapse

**Steps:**

- [ ] **Step 1: Add blur during collapse**

```swift
// In ConversationPreviewView container (line 298-311)
.scaleEffect(previewScale, anchor: .bottom)
.offset(y: dragOffsetY)
.opacity(contextMenuAppeared ? 1 : 0)
.blur(radius: previewScale < 0.5 ? 2.0 * (1.0 - previewScale) : 0)  // NEW: blur when collapsed
.gesture(previewCollapseGesture)
```

- [ ] **Step 2: Adjust collapse gesture spring**

```swift
// Line 434: improve spring for collapse feedback
.spring(response: 0.35, dampingFraction: 0.8)
// → 
.spring(response: 0.30, dampingFraction: 0.72)  // Faster, slightly more bouncy
```

- [ ] **Step 3: Test collapse animation**

```bash
./apps/ios/meeshy.sh run
# Long-press, drag preview upward to collapse
# Verify: blur effect, scale reduction, snap-back feel
```

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift
git commit -m "ux(ios/longpress): add blur + improve spring on preview collapse for enhanced feedback"
```

---

## Task 4: Add visual section drop target indicators

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` (sectionView)

**Interfaces:**
- Consumes: Existing drop target infrastructure (commented, dormant)
- Produces: Visual highlight when preview hovers over section drop zone

**Steps:**

- [ ] **Step 1: Inspect current drop infrastructure**

Check `SectionDropDelegate` and `handleDrop` (currently commented):
```bash
grep -n "SectionDropDelegate\|handleDrop\|dropTargetSection" \
  apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift | head -20
```

- [ ] **Step 2: Add @State for drop target**

```swift
@State private var dropTargetSection: String? = nil  // Track hover section
```

- [ ] **Step 3: Add visual indicator to section headers**

```swift
// In sectionView, add condition:
VStack(spacing: 8) {
    Text(section.name)
        .font(.headline)
        .foregroundStyle(dropTargetSection == section.id ? .blue : .primary)
        .scaleEffect(dropTargetSection == section.id ? 1.05 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: dropTargetSection)
}
```

- [ ] **Step 4: Integrate with preview gestures (future)**

Leave commented for now with clear TODOs:
```swift
// TODO: Wire previewCollapseGesture drop detection to update dropTargetSection
// Requires tracking preview position + section frames (GeometryReader)
```

- [ ] **Step 5: Document for future implementation**

Add comment explaining the architecture for drag-to-drop (to be implemented via previewCollapseGesture geometry tracking).

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "ux(ios/longpress): prepare visual drop target indicators for future drag-n-drop to sections"
```

---

## Task 5: Verify local animations match design intent

**Files:**
- Testing: Run on simulator (no file changes)

**Steps:**

- [ ] **Step 1: Comprehensive animation test**

```bash
./apps/ios/meeshy.sh run

# Test sequence (repeat 3x for consistency):
# 1. Long-press a conversation row
#    ✓ Row scales to 0.90 with visible rebounce
#    ✓ Preview/menu appear with coordinated zoom + slide
#    ✓ Both animations synchronized

# 2. Drag preview upward
#    ✓ Preview shrinks progressively
#    ✓ Blur effect visible when collapsed < 50%
#    ✓ Menu remains stable

# 3. Release at < 45% scale
#    ✓ Preview snaps to 0 (collapsed) with spring
#    ✓ Snap-back feels snappy (dampingFraction 0.72)

# 4. Release at > 45% scale
#    ✓ Preview returns to 1.0 with spring
#    ✓ Re-expansion feels bouncy

# 5. Drag preview downward > 110pt
#    ✓ Menu closes smoothly (response: 0.3)
#    ✓ Rubber-band feel on downward drag before threshold
```

- [ ] **Step 2: Compare before/after (if video needed)**

Create quick side-by-side test (mental note for now, optional record):
- Before: dampingFraction 0.99 (very smooth, minimal rebounce)
- After: dampingFraction 0.68 (visible 1-2 bounces)

- [ ] **Step 3: Confirm all three tasks shipped**

```bash
git log --oneline -3
# Should see 3 commits from Tasks 1-3
```

- [ ] **Step 4: No additional commit needed**

All work verified above; mark complete.

---

## Verification Checklist

- [ ] Long-press row: rebounce visible (not just smooth)
- [ ] Preview open: coordinated zoom + menu slide
- [ ] Preview collapse: blur effect + fast spring
- [ ] No scroll regression (test scrolling during long-press)
- [ ] No haptic duplication (one medium at long-press, no extra)
- [ ] Drop target indicators prepared (visual groundwork, not wired yet)

---

## Next Steps (Deferred)

1. **Drag-n-drop to sections** : Requires GeometryReader + drop zone tracking on preview position
2. **Animation polish** : Further dampingFraction tuning based on user feedback
3. **Haptic enhancements** : Add notification/success haptics on section drop (deferred)
4. **iPad multitask** : Replace UIScreen.main.bounds with containerRelativeFrame (deferred)
