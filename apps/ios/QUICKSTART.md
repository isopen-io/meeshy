# Quick Start Guide - Setting Up MeeshySDK and MeeshyUI

This guide will help you set up the MeeshySDK and MeeshyUI modules in your Xcode project.

## Prerequisites

- Xcode 15.0 or later
- iOS 17.0+ / macOS 14.0+ deployment target
- Swift 5.9+

## Setup Options

### Option 1: In an Existing Xcode Project

#### Step 1: Add the Package

1. In Xcode, go to **File → Add Package Dependencies...**
2. Enter the repository URL (or use local path if developing locally)
3. Select version or branch
4. Click **Add Package**

#### Step 2: Add Modules to Your Target

1. Select your app target
2. Go to **General → Frameworks, Libraries, and Embedded Content**
3. Click **+** and add:
   - `MeeshySDK`
   - `MeeshyUI` (if you need UI components)

#### Step 3: Build Your Project

Press **⌘B** to build. The import errors should now be resolved!

### Option 2: Using Swift Package Manager (Command Line)

If you're building from the command line or in a different environment:

```bash
# Build the package
swift build

# Run tests
swift test

# Build for release
swift build -c release
```

### Option 3: Local Development

If you're developing the SDK and app together:

1. Add the Package.swift file to your project root
2. Create the `Sources/` directory structure as shown in README.md
3. In your Xcode project settings, add a local package dependency pointing to the project root
4. The modules will appear as separate targets

## Verifying the Setup

### Test Import

Create a new Swift file and try importing:

```swift
import MeeshySDK
import MeeshyUI

// This should compile without errors
let conversation = MeeshyConversation(
    identifier: "test",
    type: .direct,
    title: "Test"
)
```

### Check Build Log

Look for these messages in the build log:
- ✅ Building MeeshySDK
- ✅ Building MeeshyUI
- ✅ Building [YourAppTarget]

## Common Issues and Solutions

### Issue: "Unable to find module dependency"

**Solutions:**
1. Clean build folder: **Product → Clean Build Folder** (⇧⌘K)
2. Reset package caches: **File → Packages → Reset Package Caches**
3. Quit and restart Xcode
4. Delete `~/Library/Developer/Xcode/DerivedData/[YourProject]`

### Issue: "No such module 'MeeshySDK'"

**Solutions:**
1. Verify the package is added to your project dependencies
2. Check that your target includes the module in **Build Phases → Dependencies**
3. Ensure the module is imported in **General → Frameworks, Libraries, and Embedded Content**

### Issue: Type ambiguity errors

If you have both local types and SDK types with similar names:

**Solution:** Use the type aliases provided in `Conversation.swift` and `Message.swift`:

```swift
// Instead of defining local types, use:
typealias Conversation = MeeshyConversation
typealias Message = MeeshyMessage
```

### Issue: Swift version compatibility

**Solution:** Update Package.swift to match your Swift version:

```swift
// swift-tools-version: 5.9  // or 6.0 for Swift 6
```

## Next Steps

Once setup is complete:

1. **Explore the Models**: Check out `CoreModels.swift` to see all available types
2. **Use UI Components**: Import `MeeshyUI` and add components to your views
3. **Run Tests**: Verify everything works with `swift test` or ⌘U in Xcode
4. **Read the README**: See `README.md` for detailed usage examples

## Project Structure After Setup

```
YourProject/
├── Package.swift                 # Package definition
├── Sources/
│   ├── MeeshySDK/               # SDK module
│   │   ├── MeeshySDK.swift
│   │   └── CoreModels.swift
│   └── MeeshyUI/                # UI module
│       └── MeeshyUI.swift
├── Tests/
│   └── MeeshySDKTests/
│       └── CoreModelsTests.swift
└── YourApp/                     # Your app target
    ├── Views/
    ├── ViewModels/
    ├── Conversation.swift       # Type aliases
    ├── Message.swift            # Type aliases
    └── ...
```

## Integration Checklist

- [ ] Package.swift created with both modules
- [ ] Sources/MeeshySDK/ directory with model files
- [ ] Sources/MeeshyUI/ directory with UI components
- [ ] Package added to Xcode project
- [ ] Modules added to app target dependencies
- [ ] Project builds without import errors
- [ ] Tests run successfully
- [ ] Type aliases configured in app layer

## Need Help?

If you're still experiencing issues:

1. Check that all files are in the correct directory structure
2. Verify your Swift and Xcode versions meet requirements
3. Try creating a fresh Xcode project and adding the package
4. Review the error messages carefully - they often indicate missing dependencies

## Building for Distribution

When you're ready to distribute your SDK:

### As a Swift Package

```swift
// In Package.swift, set appropriate version and products
.library(
    name: "MeeshySDK",
    type: .dynamic, // or .static
    targets: ["MeeshySDK"]
)
```

### As an XCFramework

```bash
# Build for multiple platforms
xcodebuild archive -scheme MeeshySDK -destination "generic/platform=iOS" -archivePath "build/ios"
xcodebuild archive -scheme MeeshySDK -destination "generic/platform=iOS Simulator" -archivePath "build/ios-sim"

# Create XCFramework
xcodebuild -create-xcframework \
  -framework build/ios.xcarchive/Products/Library/Frameworks/MeeshySDK.framework \
  -framework build/ios-sim.xcarchive/Products/Library/Frameworks/MeeshySDK.framework \
  -output MeeshySDK.xcframework
```

Happy coding! 🚀
