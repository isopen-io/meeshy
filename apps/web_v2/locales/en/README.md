# English Translations Structure

This directory contains the English translations organized by functionality and component type.

## File Organization

### Core Files
- **`common.json`** - Common translations used across the entire application (buttons, errors, validation, language names, navigation)
- **`auth.json`** - Authentication related translations (login, register, join conversation)
- **`landing.json`** - Landing page translations (hero, features, mission, CTA)

### Page-Specific Files
- **`dashboard.json`** - Dashboard page translations (stats, actions, quick actions)
- **`conversations.json`** - Conversations and communities management
- **`settings.json`** - Settings page translations (profile, translation settings, theme)
- **`pages.json`** - Static pages (about, contact, partners, not found)

### Component Files
- **`components.json`** - UI components (affiliate, header, language selector, layout, toasts)
- **`bubbleStream.json`** - Bubble stream message component (translations, time format, actions)
- **`modals.json`** - Modal dialogs (create link modal, link summary, anonymous chat)
- **`features.json`** - Specialized features (chat page, error handlers, search, conversation management)

### Legal Files
- **`legal.json`** - Legal documents (privacy policy, terms of service)

## Usage

### Import Individual Files
```typescript
import { common } from './locales/en/common.json';
import { auth } from './locales/en/auth.json';
```

### Import All Translations
```typescript
import translations from './locales/en';
// or
import { common, auth, landing } from './locales/en';
```

## Translation Keys Structure

Each file maintains the original nested structure from the main `en.json` file. For example:

```json
// common.json
{
  "common": {
    "loading": "Loading...",
    "save": "Save"
  },
  "languageNames": {
    "en": "English",
    "fr": "French"
  }
}
```

## Benefits of This Structure

1. **Modularity** - Load only the translations you need
2. **Maintainability** - Easier to find and update specific translations
3. **Team Collaboration** - Different team members can work on different files
4. **Performance** - Smaller bundle sizes when using code splitting
5. **Organization** - Clear separation of concerns

## File Sizes

- `common.json` - Core translations used everywhere
- `auth.json` - Authentication flows
- `landing.json` - Marketing and landing page content
- `dashboard.json` - Dashboard interface
- `conversations.json` - Chat and conversation management
- `settings.json` - User preferences and configuration
- `pages.json` - Static informational pages
- `components.json` - Reusable UI components
- `modals.json` - Dialog and modal content
- `features.json` - Advanced features and error handling
- `legal.json` - Privacy policy and terms of service

## Migration Notes

This structure replaces the single `en.json` file while maintaining all original translation keys and values. The `index.ts` file provides backward compatibility by exporting all translations as a single object.
