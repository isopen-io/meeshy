We are going to replace `LocalStore` with `GRDB`.
The current `LocalStore` has:
- `saveConversations([MeeshyConversation])`
- `loadConversations() -> [MeeshyConversation]`
- `saveMessages([MeeshyMessage], for: String)`
- `loadMessages(for: String) -> [MeeshyMessage]`
- `cleanupStaleMessageCaches()`
- `clearAll()`

We added `GRDB` to the `MeeshySDK` package.
Now we will update `LocalStore.swift` to use `GRDB` internally, keeping the same public interface so the rest of the app compiles immediately without changes.

We will write `LocalStore.swift` using `GRDB`.
