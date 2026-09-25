## 2025-01: Encryption - Signal Protocol + AES-256-GCM serveur
**Statut**: Accept
**Contexte**: Trois modes de chiffrement selon le besoin (E2EE, serveur, hybride)
**Decision**: Signal Protocol (`@signalapp/libsignal-client`), ServerKeyVault avec envelope encryption, LRU cache 500 cls/30min TTL
**Alternatives rejet**: Custom crypto (ne jamais rouler le sien), AES seul (pas de forward secrecy)
**Cons**: E2EE dsactive la traduction, Signal Protocol ncessite impl ct client
