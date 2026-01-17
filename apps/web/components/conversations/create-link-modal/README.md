# Create Link Modal

A modular, performant wizard for creating shareable conversation links with advanced configuration options.

## Features

- ✨ **Multi-step wizard** with smooth navigation
- 🔗 **Link identifier validation** with real-time availability checking
- 👥 **Flexible permissions** for anonymous users
- 🌍 **Language restrictions** support
- 📱 **Mobile responsive** design
- ♿ **Accessibility** compliant (WCAG 2.1 AA)
- ⚡ **Optimized performance** with code splitting
- 🎨 **Dark mode** support

## Usage

```typescript
import { CreateLinkModalV2 } from '@/components/conversations/create-link-modal';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <CreateLinkModalV2
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onLinkCreated={() => {
        console.log('Link created successfully!');
        setIsOpen(false);
      }}
    />
  );
}
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | Yes | Controls modal visibility |
| `onClose` | `() => void` | Yes | Called when modal is closed |
| `onLinkCreated` | `() => void` | Yes | Called after successful link creation |
| `preGeneratedLink` | `string` | No | Pre-existing link to display |
| `preGeneratedToken` | `string` | No | Pre-existing token to display |

## Wizard Steps

### Step 1: Conversation Selection
Users can either:
- Create a new conversation (with members)
- Select an existing conversation

### Step 2: Configuration
Configure link settings:
- **Duration**: 1 day to 2 years
- **Usage limits**: Unlimited or specific count
- **Account requirements**: Optional or mandatory
- **Permissions**: Messages, files, images, history
- **Requirements**: Nickname, email, birthday
- **Languages**: Restrict by language

### Step 3: Summary & Generation
- Review all settings
- Edit link identifier
- Add welcome message
- Generate link

## Architecture

### Hooks

#### `useConversationSelection`
Manages conversation selection and creation:
```typescript
const {
  conversations,
  selectedConversationId,
  setSelectedConversationId,
  createNewConversation,
  setCreateNewConversation,
  newConversationData,
  setNewConversationData,
  filteredUsers,
  reset
} = useConversationSelection(currentUser, isOpen);
```

#### `useLinkSettings`
Manages link configuration:
```typescript
const {
  linkTitle,
  setLinkTitle,
  expirationDays,
  setExpirationDays,
  requireAccount,
  setRequireAccount,
  getLinkSettings,
  reset
} = useLinkSettings();
```

#### `useLinkValidation`
Validates link identifiers:
```typescript
const {
  linkIdentifierCheckStatus, // 'idle' | 'checking' | 'available' | 'taken'
  generateIdentifier
} = useLinkValidation(linkIdentifier);
```

#### `useLinkWizard`
Orchestrates wizard flow:
```typescript
const {
  currentStep,
  nextStep,
  prevStep,
  canProceedToNext,
  generateLink,
  generatedLink,
  isCreating
} = useLinkWizard({
  isOpen,
  currentUser,
  conversations,
  selectedConversationId,
  linkSettings
});
```

### Components

#### Step Components (Lazy Loaded)
- `LinkTypeStep`: Conversation selection
- `LinkConfigStep`: Settings configuration
- `LinkSummaryStep`: Final review

#### Section Components
- `ConversationSection`: New conversation form
- `LinkSettingsSection`: Duration and limits
- `PermissionsSection`: Permission toggles
- `LanguagesSection`: Language selection
- `SummaryDetails`: Configuration summary

#### Shared Components
- `SelectableSquare`: Checkbox card UI
- `InfoIcon`: Tooltip helper
- `SuccessView`: Success state

## Performance

### Code Splitting
Steps are loaded on-demand:
```typescript
const LinkTypeStep = lazy(() => import('./steps/LinkTypeStep'));
const LinkConfigStep = lazy(() => import('./steps/LinkConfigStep'));
const LinkSummaryStep = lazy(() => import('./steps/LinkSummaryStep'));
```

### Bundle Size
- **Initial load**: ~50KB (main component + first step)
- **Step 2**: ~35KB (config sections)
- **Step 3**: ~30KB (summary)
- **Total**: ~115KB (loaded progressively)

### Optimization Tips
1. Preload next step on current step load
2. Memoize expensive computations
3. Use virtual scrolling for long lists
4. Debounce search inputs (already implemented)

## Customization

### Constants
Override in `constants.ts`:
```typescript
export const DURATION_OPTIONS = [
  { value: 1, labelKey: '...', descriptionKey: '...' },
  // Add custom durations
];

export const DEFAULT_LINK_SETTINGS = {
  expirationDays: 7, // Change default
  requireAccount: false,
  // ...
};
```

### Styling
Use Tailwind classes or customize via `className` props:
```typescript
<Card className="custom-border custom-background">
  <CardContent>...</CardContent>
</Card>
```

### Translations
All text is i18n-ready via `useI18n('modals')`:
```json
{
  "createLinkModal": {
    "title": "Create Shareable Link",
    "steps": {
      "selectConversation": "Select Conversation"
    }
  }
}
```

## Accessibility

### Keyboard Navigation
- `Tab`: Navigate between fields
- `Enter`: Proceed to next step / submit
- `Escape`: Close modal
- `Arrow keys`: Navigate lists

### Screen Readers
- Semantic HTML elements
- ARIA labels on all inputs
- Progress announcements
- Error messaging

### Focus Management
- Auto-focus on step entry
- Focus trap within modal
- Return focus on close

## Testing

### Unit Tests
```bash
# Test hooks
npm test -- useConversationSelection.test
npm test -- useLinkSettings.test
npm test -- useLinkValidation.test
npm test -- useLinkWizard.test

# Test components
npm test -- LinkTypeStep.test
npm test -- LinkConfigStep.test
```

### Integration Tests
```bash
npm test -- create-link-modal.integration.test
```

### E2E Tests
```bash
npm run test:e2e -- link-creation.spec.ts
```

## Troubleshooting

### Link identifier shows as "taken" immediately
**Cause**: Debounce delay
**Solution**: Wait 500ms for validation to complete

### Modal doesn't close after link creation
**Cause**: Missing `onLinkCreated` callback
**Solution**: Ensure `onLinkCreated` is properly implemented

### Steps not loading
**Cause**: Dynamic import failure
**Solution**: Check network tab for chunk load errors

### Translations missing
**Cause**: Missing i18n keys
**Solution**: Verify all keys exist in locale files

## Contributing

### Adding a New Step
1. Create step component in `steps/`
2. Add lazy import in main modal
3. Update `TOTAL_WIZARD_STEPS` constant
4. Add step title translation
5. Update wizard navigation logic

### Adding a New Permission
1. Add state to `useLinkSettings`
2. Add UI in `PermissionsSection`
3. Update `getLinkSettings` return value
4. Add to API request body in `useLinkWizard`
5. Update `SummaryDetails` display

### Adding a New Validation
1. Add validation logic to `useLinkValidation`
2. Display error in relevant step
3. Update `canProceedToNext` logic
4. Add error translation

## License

This component is part of the Meeshy platform and follows the project's license.

## Support

For issues or questions:
- Check the [Migration Guide](./MIGRATION.md)
- Review inline documentation
- Contact the frontend team
- Create a GitHub issue
