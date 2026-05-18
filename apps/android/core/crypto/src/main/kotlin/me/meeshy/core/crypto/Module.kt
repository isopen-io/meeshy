package me.meeshy.core.crypto

/**
 * End-to-end encryption — isolated as a small, reviewable security surface
 * (ARCHITECTURE.md §8; ADR-018/019/020).
 *
 * Populated in Phase 3, gated behind the threat model: `libsignal` pairwise
 * (X3DH + Double Ratchet), Sender Keys group encryption, multi-device session
 * stores, and call-media keying. Fail-closed.
 */
internal object CryptoModulePlaceholder
