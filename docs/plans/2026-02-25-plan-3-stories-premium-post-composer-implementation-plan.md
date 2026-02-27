# Plan 3: Stories & Premium Post Composer

> **Date**: 2026-02-25
> **Branch**: `feat/plan3-stories-composer`
> **Worktree**: `/Users/smpceo/Documents/v2_meeshy-feat-plan3-stories`

## Scope

### MeeshySDK (Models + Services)
1. Extend `StoryModels.swift` - Full `StoryEffects` struct with Encodable, canvas element types
2. Extend `ServiceModels.swift` - `CreatePostRequest` with `storyEffects` field
3. Extend `PostService.swift` - `createStory()` with storyEffects parameter

### MeeshyUI (Story Editor Components)
4. `StoryComposerView` - Main story creation flow (camera/gallery/text-only)
5. `StoryCanvasView` - Interactive canvas with draggable/rotatable/scalable elements
6. `StoryTextEditorView` - Rich text editing with fonts, colors, alignment
7. `FontStylePicker` - Font style selection (bold, italic, handwriting, neon, retro, typewriter)
8. `StickerPickerView` - Emoji/sticker browser and placer
9. `DrawingOverlayView` - PencilKit drawing overlay
10. `StoryFilterPicker` - CIFilter-based image filters (vintage, bw, warm, cool, etc.)
11. `StoryMusicPicker` - Music/audio track selection for stories
12. `StorySlideManager` - Multi-slide story management
13. `UnifiedPostComposer` - Unified composer for posts, stories, and statuses

### iOS App (Integration)
14. Modify `StoryTrayView` - "+" button opens composer
15. Modify `StoryViewModel` - `publishStory()` with effects
16. Modify `RootView` - Sheet presentation for composer

## Task Groups

### TG1: SDK Models (StoryEffects, Canvas Elements)
### TG2: SDK Services (PostService.createStory)
### TG3: MeeshyUI Story Editor Views
### TG4: iOS App Integration
