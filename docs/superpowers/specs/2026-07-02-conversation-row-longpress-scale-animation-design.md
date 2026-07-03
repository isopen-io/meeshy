# Conversation Row Long-Press Scale Animation

**Date:** 2026-07-02  
**Scope:** iOS app — ConversationRowItem animation feedback  
**Effort:** 1-2 hours

---

## Overview

When a user long-presses a conversation in the list, the conversation row provides tactile visual feedback:
1. **Scale reduction** to 90% of original size (0.35s, spring bounce)
2. **Simultaneous menu appearance** — overlay slides up from bottom + fades in
3. **Smooth reset** when menu is dismissed or gesture cancelled

This transforms a passive long-press into an active, satisfying interaction — the row "responds" before the menu appears.

---

## Requirements

### Visual Behavior
- **Scale factor during reduction:** 90% (0.10 scale delta from 1.0)
- **Animation duration:** 0.35s total (spring physics, no separate phases)
- **Animation curve:** `spring(response: 0.35, dampingFraction: 0.7)`
  - This gives a natural overshoot + bounce-back effect
  - Response: 0.35s (how quickly spring accelerates)
  - Damping: 0.7 (slight overshoot, not too bouncy)
- **Menu entry:** Slide from bottom + fade in, **synchronized** with scale animation
- **Reset:** Scale back to 1.0 smoothly when menu closes or gesture is cancelled

### Interaction Timing
| Event | Duration | Animation | Notes |
|-------|----------|-----------|-------|
| Long-press gesture trigger | — | — | minimumDuration: 0.4s (existing) |
| Scale to 90% | 0.35s | spring | Simultaneous with... |
| Menu slide+fade | 0.35s | spring | ...same curve, same duration |
| Haptic feedback | Instant | — | `.medium()` on press (existing) |
| Reset on dismiss | 0.35s | spring | User taps overlay, outside, or cancels |

### State Management
- **Single `@State` in ConversationRowItem:** `isPressed: Bool`
- **Lifecycle:**
  - `isPressed = false` initially
  - `isPressed = true` when long-press gesture fires
  - Remains `true` while menu is visible
  - Returns to `false` when menu closes (parent callback or binding)
- **No shared state** — row is isolated; parent coordinates menu visibility

---

## Architecture

### ConversationRowItem Changes

**New property:**
```swift
@State private var isPressed = false
```

**Gesture handler update:**
```swift
.onLongPressGesture(minimumDuration: 0.4) {
    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
        isPressed = true
    }
    HapticFeedback.medium()
    onLongPress()  // Parent opens menu overlay
}
```

**Scale effect application:**
```swift
.scaleEffect(isPressed ? 0.90 : 1.0)
.animation(.spring(response: 0.35, dampingFraction: 0.7), value: isPressed)
```

### Parent Coordination (ConversationListView)

The parent's `onLongPress()` callback must:
1. **Open the menu overlay** — triggered instantly when `onLongPress()` fires
2. **Close the menu** — when user dismisses it
3. **Reset the row state** — call a parent callback or use a binding to set `isPressed = false`

This is typically done via a ViewModel callback or environment value passed to the row.

**Existing pattern:** The menu is already opened via `ConversationListView`'s state machine (e.g., `@State var selectedConversationForMenu: Conversation?`). The reset happens when that state clears.

---

## Animation Curve Justification

**Why spring(0.35, 0.7) and not others?**

| Curve | Feel | Use Case |
|-------|------|----------|
| `spring(0.3, 0.6)` | Snappy, little bounce | Too stiff for this context |
| **`spring(0.35, 0.7)`** | **Responsive, playful bounce** | **← Goldilocks for "press feedback"** |
| `spring(0.4, 0.8)` | Slow, lots of wobble | Too slow (target is "fast") |
| `easeInOut(0.35)` | Linear, no bounce | Boring, no tactile feedback |

The 0.35/0.7 combo gives:
- Quick response (0.35s latency feels snappy)
- Overshoot that reaches ~100% before settling (visual "pop")
- No excess wobble (damping 0.7 kills oscillations by frame 3-4)

---

## Testing Checklist

### Behavior
- [ ] Long-press → scale animates to 90% (visually ~10% smaller)
- [ ] Scale animation coincides with menu sliding in from bottom
- [ ] Both animations complete in ~0.35s
- [ ] Menu stays open; row stays at 90% scale
- [ ] Closing menu → row scales back to 100% smoothly
- [ ] Gesture cancellation → row returns to 100% without opening menu

### Edge Cases
- [ ] Rapid taps don't trigger long-press (existing behavior preserved)
- [ ] Dragging during long-press (swipe actions) cancels animation
- [ ] Multiple rows: one scales, others unaffected
- [ ] Rotation/orientation change: animation state resets

### Performance
- [ ] 60 FPS during scale animation on iPhone 12+
- [ ] No jank or dropped frames during menu slide+fade

### Accessibility
- [ ] VoiceOver: long-press action still reads correctly
- [ ] Haptic feedback fires as expected
- [ ] Scale change is not relied upon for understanding (visual enhancement only)

---

## Implementation Order

1. **Add `@State` to ConversationRowItem**
2. **Update `.onLongPressGesture()` callback** with `withAnimation { isPressed = true }`
3. **Apply `.scaleEffect()` and `.animation()`** to ThemedConversationRow
4. **Test in simulator** — verify timing, scale, menu coordination
5. **Device test** — ensure smooth 60 FPS, haptic feedback
6. **Cleanup** — remove any old menu-opening logic that might conflict

---

## Files to Modify

1. **`apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`**
   - Add `@State private var isPressed` to `ConversationRowItem`
   - Update `.onLongPressGesture()` handler
   - Add `.scaleEffect()` and `.animation()` modifiers

2. **`apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`** (if needed)
   - Verify `onLongPress()` callback opens menu overlay correctly
   - Confirm menu closes reset state (via binding or callback)

3. **Tests** (if applicable)
   - No unit tests required (animation is UI-only)
   - Manual QA: simulator + device verification

---

## Success Criteria

✅ User long-presses → immediate tactile feedback (scale down)  
✅ Menu appears synchronized with scale animation (no lag)  
✅ Scale bounces back naturally via spring physics  
✅ Animation completes in ~0.35s (feels snappy)  
✅ Reset is smooth when menu closes  
✅ Works on iOS 16+ (spring animations are native)  
✅ No performance regression (60 FPS maintained)

---

## Notes & Decisions

### Why Not Use `.onLongPressGesture()`'s Built-in Phases?

SwiftUI's `.onLongPressGesture()` doesn't expose gesture phases (begin/end). We use a local `@State` as a workaround, which is fine because:
- The row's press state is independent (no cross-row coordination needed)
- The parent already manages menu visibility separately
- This keeps the row component isolated and testable

If more complex gesture tracking is needed in the future, we can bridge to `UIGestureRecognizer`, but it's overkill for this use case.

### Why Spring Animation Over EaseInOut?

Spring animations provide:
- **Natural overshoot** — the row "pops" back, not just fades
- **Tactile feedback** — feels like a physical response, not a tween
- **Personality** — matches iOS design language (similar to notification slide-in, swipe interactions)

EaseInOut would be smoother but feels sterile.

---

## Dependencies

- **iOS:** 16.0+ (spring animations native)
- **Swift:** 6.0+
- **Frameworks:** SwiftUI (existing), HapticFeedback (existing)
- **No new packages required**

---

## Rollback Plan

If animation feels wrong during testing:
1. Adjust spring params: `response: 0.3–0.4`, `dampingFraction: 0.65–0.75`
2. Adjust scale factor: `0.85–0.95` instead of `0.90`
3. If spring feels "wrong," fall back to `withAnimation(.easeInOut(duration: 0.35))`

All changes are isolated to `ConversationRowItem`, so no cascading breaks.
