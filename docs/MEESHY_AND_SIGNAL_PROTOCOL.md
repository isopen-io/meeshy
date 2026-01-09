# Meeshy End-to-End Encryption Architecture

## Signal Protocol Implementation for DMA Interoperability

---

## Table of Contents

1. [Overview](#overview)
2. [Security Goals](#security-goals)
3. [Cryptographic Primitives](#cryptographic-primitives)
4. [Key Hierarchy](#key-hierarchy)
5. [X3DH Key Agreement Protocol](#x3dh-key-agreement-protocol)
6. [Double Ratchet Algorithm](#double-ratchet-algorithm)
7. [Pre-Key Management](#pre-key-management)
8. [Message Encryption Flow](#message-encryption-flow)
9. [Session Lifecycle](#session-lifecycle)
10. [Database Schema](#database-schema)
11. [API Endpoints](#api-endpoints)
12. [Security Measures](#security-measures)
13. [DMA Compliance](#dma-compliance)

---

## Overview

Meeshy implements end-to-end encryption (E2EE) using the Signal Protocol, ensuring that messages can only be read by the intended recipients. This implementation supports DMA (Digital Markets Act) interoperability requirements, allowing secure communication across different messaging platforms.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MEESHY E2EE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐                              ┌─────────────┐           │
│  │   User A    │                              │   User B    │           │
│  │  (Sender)   │                              │ (Recipient) │           │
│  └──────┬──────┘                              └──────┬──────┘           │
│         │                                            │                  │
│         ▼                                            ▼                  │
│  ┌─────────────┐                              ┌─────────────┐           │
│  │Signal Client│◄────────────────────────────►│Signal Client│           │
│  │   Engine    │     E2EE Message Exchange    │   Engine    │           │
│  └──────┬──────┘                              └──────┬──────┘           │
│         │                                            │                  │
│         │         ┌─────────────────────┐            │                  │
│         └────────►│   Meeshy Gateway    │◄───────────┘                  │
│                   │  (Encrypted Relay)  │                               │
│                   └──────────┬──────────┘                               │
│                              │                                          │
│                              ▼                                          │
│                   ┌─────────────────────┐                               │
│                   │     MongoDB         │                               │
│                   │  (Encrypted Data)   │                               │
│                   └─────────────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Goals

### Forward Secrecy
Each message uses unique encryption keys. Compromise of current keys does not expose past messages.

### Post-Compromise Security
After a key compromise, security is restored once new key material is exchanged.

### Deniability
Participants cannot cryptographically prove the origin of messages to third parties.

### Zero-Knowledge Server
The Meeshy server never has access to plaintext messages or private keys.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY PROPERTIES                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ Forward Secrecy │  │  Post-Compromise │  │   Deniability   │          │
│  │                 │  │     Security     │  │                 │          │
│  │  Past messages  │  │ Future messages  │  │ Cannot prove    │          │
│  │  remain safe    │  │ become safe      │  │ message origin  │          │
│  │  if key leaks   │  │ after recovery   │  │ to third party  │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│           │                    │                    │                   │
│           └────────────────────┼────────────────────┘                   │
│                                ▼                                        │
│                    ┌─────────────────────┐                              │
│                    │  SIGNAL PROTOCOL    │                              │
│                    │   Double Ratchet    │                              │
│                    └─────────────────────┘                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Cryptographic Primitives

Meeshy uses industry-standard cryptographic algorithms:

| Component | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| Identity Keys | ECDH P-256 | 256 bits | Long-term identity |
| Pre-Keys | ECDH P-256 | 256 bits | Session establishment |
| Signed Pre-Keys | ECDH P-256 | 256 bits | Authenticated key exchange |
| Ratchet Keys | ECDH P-256 | 256 bits | Forward secrecy |
| Message Keys | AES-256-GCM | 256 bits | Message encryption |
| KDF | HKDF-SHA256 | Variable | Key derivation |
| Signatures | ECDSA P-256 | 256 bits | Authentication |
| Post-Quantum (Optional) | Kyber-768 | 2400 bits | Quantum resistance |

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CRYPTOGRAPHIC STACK                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Layer 4: Message Encryption                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AES-256-GCM                                  │    │
│  │           (Authenticated Encryption with Associated Data)       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                ▲                                        │
│                                │                                        │
│  Layer 3: Key Derivation                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    HKDF-SHA256                                  │    │
│  │              (HMAC-based Key Derivation Function)               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                ▲                                        │
│                                │                                        │
│  Layer 2: Key Agreement                                                 │
│  ┌────────────────────────────┬────────────────────────────────────┐    │
│  │      ECDH P-256            │        Kyber-768 (PQ)              │    │
│  │  (Elliptic Curve DH)       │    (Post-Quantum KEM)              │    │
│  └────────────────────────────┴────────────────────────────────────┘    │
│                                ▲                                        │
│                                │                                        │
│  Layer 1: Digital Signatures                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ECDSA P-256                                  │    │
│  │           (Elliptic Curve Digital Signature Algorithm)          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Hierarchy

Meeshy maintains a hierarchical key structure for secure message encryption:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          KEY HIERARCHY                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌────────────────────┐                               │
│                    │   Identity Key     │  Long-term (years)            │
│                    │   (Public/Private) │  Generated once per device    │
│                    └─────────┬──────────┘                               │
│                              │                                          │
│              ┌───────────────┼───────────────┐                          │
│              ▼               ▼               ▼                          │
│     ┌────────────────┐ ┌───────────────┐ ┌────────────────┐             │
│     │  Signed        │ │   One-Time    │ │  Kyber Keys    │             │
│     │  Pre-Key       │ │   Pre-Keys    │ │  (PQ Optional) │             │
│     │  (Monthly)     │ │   (Per Use)   │ │  (Per Session) │             │
│     └───────┬────────┘ └───────┬───────┘ └───────┬────────┘             │
│             │                  │                 │                      │
│             └──────────────────┼─────────────────┘                      │
│                                ▼                                        │
│                    ┌────────────────────┐                               │
│                    │   Shared Secret    │  From X3DH                    │
│                    │   (Session Root)   │                               │
│                    └─────────┬──────────┘                               │
│                              │                                          │
│              ┌───────────────┴───────────────┐                          │
│              ▼                               ▼                          │
│     ┌────────────────┐              ┌────────────────┐                  │
│     │  Root Key      │─────────────►│  Chain Key     │                  │
│     │  (Per Session) │              │  (Per Ratchet) │                  │
│     └────────────────┘              └───────┬────────┘                  │
│                                             │                           │
│                                             ▼                           │
│                                    ┌────────────────┐                   │
│                                    │  Message Key   │  Per message      │
│                                    │  (Ephemeral)   │  Deleted after    │
│                                    └────────────────┘  encryption       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Types Explained

| Key Type | Lifetime | Purpose |
|----------|----------|---------|
| Identity Key | Permanent | Long-term identity, signs pre-keys |
| Signed Pre-Key | ~30 days | Authenticated ephemeral key for X3DH |
| One-Time Pre-Keys | Single use | Forward secrecy for initial message |
| Root Key | Session lifetime | Derives new chain keys |
| Chain Key | Per ratchet step | Derives message keys |
| Message Key | Single message | Encrypts one message, then deleted |

---

## X3DH Key Agreement Protocol

The Extended Triple Diffie-Hellman (X3DH) protocol establishes a shared secret between two parties who may not be online simultaneously.

### Protocol Participants

- **Alice (Initiator)**: Wants to send a message to Bob
- **Bob (Recipient)**: Has published pre-key bundle to server

### Bob's Pre-Key Bundle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       BOB'S PRE-KEY BUNDLE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     Identity Key (IKB)                           │   │
│  │               Bob's long-term public key                         │   │
│  │                    [32 bytes - P-256]                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   Signed Pre-Key (SPKB)                          │   │
│  │          Medium-term key, signed by Identity Key                 │   │
│  │                    [32 bytes - P-256]                            │   │
│  │                                                                  │   │
│  │  Signature: Sign(IKB_private, Encode(SPKB))                      │   │
│  │                    [64 bytes - ECDSA]                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   One-Time Pre-Key (OPKB)                        │   │
│  │           Single-use key for forward secrecy                     │   │
│  │                    [32 bytes - P-256]                            │   │
│  │                                                                  │   │
│  │  Note: Deleted after first use, optional but recommended         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   Kyber Pre-Key (KPKB) [Optional]                │   │
│  │          Post-quantum key encapsulation mechanism                │   │
│  │                   [1184 bytes - Kyber768]                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     Registration ID                              │   │
│  │            Unique device identifier [4 bytes]                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### X3DH Key Agreement Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        X3DH KEY AGREEMENT                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ALICE                      SERVER                        BOB           │
│    │                          │                            │            │
│    │                          │   ┌──────────────────┐     │            │
│    │                          │◄──│ Upload Pre-Key   │─────┤            │
│    │                          │   │ Bundle           │     │            │
│    │                          │   └──────────────────┘     │            │
│    │                          │                            │            │
│    │   ┌──────────────────┐   │                            │            │
│    ├───│ Request Bob's    │──►│                            │            │
│    │   │ Pre-Key Bundle   │   │                            │            │
│    │   └──────────────────┘   │                            │            │
│    │                          │                            │            │
│    │   ┌──────────────────┐   │                            │            │
│    │◄──│ Return Bundle    │───┤                            │            │
│    │   │ IKB, SPKB, OPKB  │   │                            │            │
│    │   └──────────────────┘   │                            │            │
│    │                          │                            │            │
│    │   ┌──────────────────────────────────────────────┐    │            │
│    │   │ 1. Verify signature on SPKB                  │    │            │
│    │   │ 2. Generate ephemeral key pair (EKA)         │    │            │
│    │   │ 3. Calculate DH values:                      │    │            │
│    │   │    DH1 = DH(IKA, SPKB)                       │    │            │
│    │   │    DH2 = DH(EKA, IKB)                        │    │            │
│    │   │    DH3 = DH(EKA, SPKB)                       │    │            │
│    │   │    DH4 = DH(EKA, OPKB)  [if OPKB present]    │    │            │
│    │   │ 4. SK = KDF(DH1 || DH2 || DH3 || DH4)        │    │            │
│    │   └──────────────────────────────────────────────┘    │            │
│    │                          │                            │            │
│    │   ┌──────────────────┐   │                            │            │
│    ├───│ Initial Message  │──►│──────────────────────────►│            │
│    │   │ IKA, EKA,        │   │                            │            │
│    │   │ prekey_id,       │   │                            │            │
│    │   │ ciphertext       │   │                            │            │
│    │   └──────────────────┘   │                            │            │
│    │                          │                            │            │
│    │                          │   ┌──────────────────────────────────┐  │
│    │                          │   │ 1. Look up pre-keys by ID        │  │
│    │                          │   │ 2. Calculate same DH values      │  │
│    │                          │   │ 3. Derive shared secret SK       │  │
│    │                          │   │ 4. Delete OPKB (one-time use)    │  │
│    │                          │   │ 5. Decrypt and verify message    │  │
│    │                          │   └──────────────────────────────────┘  │
│    │                          │                            │            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Diffie-Hellman Calculations

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      DH CALCULATIONS IN X3DH                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Alice's Keys:                     Bob's Keys:                          │
│  ┌────────────────┐                ┌────────────────┐                   │
│  │ IKA (Identity) │                │ IKB (Identity) │                   │
│  │ EKA (Ephemeral)│                │ SPKB (Signed)  │                   │
│  └────────────────┘                │ OPKB (One-Time)│                   │
│                                    └────────────────┘                   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  DH1 = ECDH(IKA_private, SPKB_public)                          │    │
│  │        └─ Proves Alice owns IKA                                │    │
│  │                                                                 │    │
│  │  DH2 = ECDH(EKA_private, IKB_public)                           │    │
│  │        └─ Provides forward secrecy                             │    │
│  │                                                                 │    │
│  │  DH3 = ECDH(EKA_private, SPKB_public)                          │    │
│  │        └─ Links ephemeral to signed pre-key                    │    │
│  │                                                                 │    │
│  │  DH4 = ECDH(EKA_private, OPKB_public)  [optional]              │    │
│  │        └─ Additional forward secrecy                           │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │                                                         │   │    │
│  │  │  SharedSecret = HKDF(                                   │   │    │
│  │  │      salt = zeros[32],                                  │   │    │
│  │  │      ikm  = DH1 || DH2 || DH3 || DH4,                   │   │    │
│  │  │      info = "MeeshyX3DH",                               │   │    │
│  │  │      L    = 32                                          │   │    │
│  │  │  )                                                      │   │    │
│  │  │                                                         │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Double Ratchet Algorithm

After X3DH establishes a shared secret, the Double Ratchet algorithm maintains forward secrecy and post-compromise security for all subsequent messages.

### Double Ratchet Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOUBLE RATCHET COMPONENTS                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    DH RATCHET                                   │    │
│  │                                                                 │    │
│  │  • New DH key pair generated when sending after receiving       │    │
│  │  • Provides post-compromise security                            │    │
│  │  • Updates root key with each DH exchange                       │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                          │                                              │
│                          ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    SYMMETRIC RATCHET                            │    │
│  │                                                                 │    │
│  │  • Chain key updates with each message                          │    │
│  │  • Provides forward secrecy                                     │    │
│  │  • Separate sending and receiving chains                        │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                          │                                              │
│                          ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    MESSAGE KEYS                                 │    │
│  │                                                                 │    │
│  │  • Derived from chain key for each message                      │    │
│  │  • Used once then deleted                                       │    │
│  │  • Never reused or stored                                       │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Ratchet State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       RATCHET SESSION STATE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   DHs: DH Ratchet key pair (our current ratchet key pair)       │   │
│  │                                                                  │   │
│  │   DHr: DH Ratchet public key (their current ratchet public key) │   │
│  │                                                                  │   │
│  │   RK:  Root Key (32 bytes)                                       │   │
│  │                                                                  │   │
│  │   CKs: Sending chain key (32 bytes)                              │   │
│  │                                                                  │   │
│  │   CKr: Receiving chain key (32 bytes)                            │   │
│  │                                                                  │   │
│  │   Ns:  Sending message number                                    │   │
│  │                                                                  │   │
│  │   Nr:  Receiving message number                                  │   │
│  │                                                                  │   │
│  │   PN:  Previous sending chain message number                     │   │
│  │                                                                  │   │
│  │   MKSKIPPED: Skipped message keys (for out-of-order messages)   │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Double Ratchet Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOUBLE RATCHET MESSAGE FLOW                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ALICE                                                   BOB            │
│    │                                                      │             │
│    │  ┌─────────────────────────────────────────────┐     │             │
│    │  │ Initialize with X3DH shared secret (SK)    │     │             │
│    │  │ RK = SK                                    │     │             │
│    │  │ DHs = Alice's ephemeral from X3DH          │     │             │
│    │  └─────────────────────────────────────────────┘     │             │
│    │                                                      │             │
│    │  Message 1: Alice → Bob                              │             │
│    │  ┌─────────────────────────────────────────────┐     │             │
│    │  │ 1. CKs, MK = KDF(RK, DH(DHs, DHr))         │     │             │
│    │  │ 2. Encrypt: AES-GCM(MK, plaintext)         │     │             │
│    │  │ 3. Send: (DHs_public, Ns, ciphertext)      │     │             │
│    │  │ 4. CKs = KDF(CKs) for next message         │     │             │
│    │  │ 5. Delete MK immediately                   │     │             │
│    │  └─────────────────────────────────────────────┘     │             │
│    │─────────────────────────────────────────────────────►│             │
│    │                                                      │             │
│    │                       ┌─────────────────────────────────────────┐  │
│    │                       │ 1. Receive DHs_public, perform ratchet  │  │
│    │                       │ 2. RK, CKr = KDF(RK, DH(DHr, DHs))     │  │
│    │                       │ 3. MK = KDF(CKr)                       │  │
│    │                       │ 4. Decrypt: AES-GCM(MK, ciphertext)    │  │
│    │                       │ 5. Delete MK immediately               │  │
│    │                       └─────────────────────────────────────────┘  │
│    │                                                      │             │
│    │  Message 2: Bob → Alice                              │             │
│    │                       ┌─────────────────────────────────────────┐  │
│    │                       │ 1. Generate new DHr (DH ratchet step)  │  │
│    │                       │ 2. RK, CKs = KDF(RK, DH(new_DHr, DHs)) │  │
│    │                       │ 3. MK = KDF(CKs)                       │  │
│    │                       │ 4. Encrypt message                     │  │
│    │                       └─────────────────────────────────────────┘  │
│    │◄─────────────────────────────────────────────────────│             │
│    │                                                      │             │
│    │  ┌─────────────────────────────────────────────┐     │             │
│    │  │ 1. Perform DH ratchet with new DHr         │     │             │
│    │  │ 2. Derive new chain keys                   │     │             │
│    │  │ 3. Decrypt message                         │     │             │
│    │  └─────────────────────────────────────────────┘     │             │
│    │                                                      │             │
│         ... continues with alternating DH ratchets ...                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Derivation Functions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      KDF CHAIN OPERATIONS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  DH Ratchet Step (when receiving new DH public key):                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  dh_output = ECDH(our_private, their_public)                   │    │
│  │                                                                 │    │
│  │  (RK_new, CK_new) = HKDF(                                      │    │
│  │      salt = RK_old,                                            │    │
│  │      ikm  = dh_output,                                         │    │
│  │      info = "MeeshyRatchet",                                   │    │
│  │      L    = 64                                                 │    │
│  │  )                                                              │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Symmetric Ratchet Step (for each message):                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  CK_new = HMAC-SHA256(CK, 0x02)     // Chain key update        │    │
│  │  MK     = HMAC-SHA256(CK, 0x01)     // Message key             │    │
│  │                                                                 │    │
│  │  // MK is then expanded to encryption key + IV + auth key      │    │
│  │  (enc_key, iv, auth_key) = HKDF(MK, "MeeshyMessage", 80)       │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Pre-Key Management

### Pre-Key Pool Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PRE-KEY POOL MANAGEMENT                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    PRE-KEY POOL                                 │    │
│  │                                                                 │    │
│  │  Target Size: 100 keys                                          │    │
│  │  Replenish Threshold: 20 keys remaining                         │    │
│  │  Batch Generation: 50 keys at a time                            │    │
│  │                                                                 │    │
│  │  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐  │    │
│  │  │ PK1 │ PK2 │ PK3 │ PK4 │ PK5 │ ... │ PK95│ PK96│ PK97│ PK98│  │    │
│  │  │     │     │     │     │     │     │     │     │     │     │  │    │
│  │  │USED │USED │ ◄── │     │     │     │     │     │     │     │  │    │
│  │  │     │     │NEXT │     │     │     │     │     │     │     │  │    │
│  │  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘  │    │
│  │                                                                 │    │
│  │  Storage: MongoDB as JSON string                                │    │
│  │  Collection: signal_pre_key_bundles                             │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Atomic Consumption Flow:                                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. BEGIN TRANSACTION                                           │    │
│  │  2. SELECT preKeyPool FROM bundles WHERE userId = ? FOR UPDATE │    │
│  │  3. Parse JSON pool                                             │    │
│  │  4. Pop first available key                                     │    │
│  │  5. UPDATE bundles SET preKeyPool = ? WHERE userId = ?         │    │
│  │  6. COMMIT                                                      │    │
│  │                                                                 │    │
│  │  Note: Prevents race conditions where same key served twice     │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pre-Key Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PRE-KEY LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐                                                        │
│  │  GENERATED  │  Key pair created                                      │
│  │             │  Private key stored locally                            │
│  │             │  Public key uploaded to server                         │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────┐                                                        │
│  │   STORED    │  Available in pre-key pool                             │
│  │             │  Waiting to be requested                               │
│  │             │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ▼ Another user requests bundle                                  │
│  ┌─────────────┐                                                        │
│  │   SERVED    │  Included in pre-key bundle response                   │
│  │             │  Atomically removed from pool                          │
│  │             │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ▼ First message received                                        │
│  ┌─────────────┐                                                        │
│  │   CONSUMED  │  Used to derive shared secret                          │
│  │             │  Private key deleted after use                         │
│  │             │  Never reused                                          │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────┐                                                        │
│  │   DELETED   │  Securely wiped from memory                            │
│  │             │  Cannot be recovered                                   │
│  │             │                                                        │
│  └─────────────┘                                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Message Encryption Flow

### Complete Message Encryption Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MESSAGE ENCRYPTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SENDER                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. PREPARE MESSAGE                                             │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ plaintext = {                                             │  │    │
│  │  │   content: "Hello, World!",                               │  │    │
│  │  │   timestamp: 1704067200000,                               │  │    │
│  │  │   contentType: "text/plain"                               │  │    │
│  │  │ }                                                         │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  2. DERIVE MESSAGE KEY (from Double Ratchet chain)              │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ MK = HMAC-SHA256(ChainKey, 0x01)                         │  │    │
│  │  │ ChainKey = HMAC-SHA256(ChainKey, 0x02)  // Update chain  │  │    │
│  │  │                                                          │  │    │
│  │  │ (enc_key, iv, auth_key) = HKDF(MK, "MeeshyMsg", 80)     │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  3. ENCRYPT MESSAGE                                             │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ ciphertext = AES-256-GCM(                                │  │    │
│  │  │   key = enc_key,                                         │  │    │
│  │  │   iv = random_iv,                                        │  │    │
│  │  │   plaintext = JSON.stringify(plaintext),                 │  │    │
│  │  │   aad = sender_id || recipient_id || timestamp           │  │    │
│  │  │ )                                                        │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  4. SIGN MESSAGE                                                │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ signature = ECDSA-P256(                                  │  │    │
│  │  │   private_key = identity_key_private,                    │  │    │
│  │  │   message = SHA256(header || ciphertext)                 │  │    │
│  │  │ )                                                        │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  5. PACKAGE FOR TRANSMISSION                                    │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ encrypted_message = {                                    │  │    │
│  │  │   header: {                                              │  │    │
│  │  │     sender_dh_public: current_dh_public,                 │  │    │
│  │  │     message_number: Ns,                                  │  │    │
│  │  │     previous_chain_length: PN                            │  │    │
│  │  │   },                                                     │  │    │
│  │  │   ciphertext: base64(ciphertext),                        │  │    │
│  │  │   iv: base64(iv),                                        │  │    │
│  │  │   authTag: base64(auth_tag),                             │  │    │
│  │  │   signature: base64(signature)                           │  │    │
│  │  │ }                                                        │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  6. DELETE MESSAGE KEY                                          │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ // Immediate secure deletion                             │  │    │
│  │  │ enc_key.fill(0);                                         │  │    │
│  │  │ MK.fill(0);                                              │  │    │
│  │  │ // Forward secrecy: can't decrypt again                  │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Message Decryption Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MESSAGE DECRYPTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  RECIPIENT                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. RECEIVE ENCRYPTED MESSAGE                                   │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ Parse: header, ciphertext, iv, authTag, signature        │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  2. VERIFY SIGNATURE (STRICT - REJECT IF INVALID)               │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ isValid = ECDSA-Verify(                                  │  │    │
│  │  │   public_key = sender_identity_public,                   │  │    │
│  │  │   signature = signature,                                 │  │    │
│  │  │   message = SHA256(header || ciphertext)                 │  │    │
│  │  │ )                                                        │  │    │
│  │  │                                                          │  │    │
│  │  │ if (!isValid) throw "SIGNATURE_VERIFICATION_FAILED"      │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  3. PERFORM DH RATCHET (if new DH key received)                 │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ if (header.sender_dh != stored_their_dh) {               │  │    │
│  │  │   // DH Ratchet step                                     │  │    │
│  │  │   dh_out = ECDH(our_dh_private, header.sender_dh)        │  │    │
│  │  │   (RK, CKr) = HKDF(RK, dh_out)                           │  │    │
│  │  │   stored_their_dh = header.sender_dh                     │  │    │
│  │  │ }                                                        │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  4. DERIVE MESSAGE KEY                                          │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ // Handle out-of-order messages                          │  │    │
│  │  │ while (Nr < header.message_number) {                     │  │    │
│  │  │   skipped_keys[Nr] = HMAC(CKr, 0x01)                     │  │    │
│  │  │   CKr = HMAC(CKr, 0x02)                                  │  │    │
│  │  │   Nr++                                                   │  │    │
│  │  │ }                                                        │  │    │
│  │  │ MK = HMAC(CKr, 0x01)                                     │  │    │
│  │  │ CKr = HMAC(CKr, 0x02)                                    │  │    │
│  │  │ (enc_key, iv, auth_key) = HKDF(MK, "MeeshyMsg", 80)     │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  5. DECRYPT MESSAGE                                             │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ plaintext = AES-256-GCM-Decrypt(                         │  │    │
│  │  │   key = enc_key,                                         │  │    │
│  │  │   iv = iv,                                               │  │    │
│  │  │   ciphertext = ciphertext,                               │  │    │
│  │  │   authTag = authTag,                                     │  │    │
│  │  │   aad = sender_id || recipient_id || timestamp           │  │    │
│  │  │ )                                                        │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                          │                                      │    │
│  │                          ▼                                      │    │
│  │  6. DELETE MESSAGE KEY                                          │    │
│  │  ┌───────────────────────────────────────────────────────────┐  │    │
│  │  │ enc_key.fill(0);                                         │  │    │
│  │  │ MK.fill(0);                                              │  │    │
│  │  └───────────────────────────────────────────────────────────┘  │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      E2EE SESSION LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                         ┌──────────────┐                                │
│                         │   CREATED    │                                │
│                         │              │                                │
│                         │ User joins   │                                │
│                         │ conversation │                                │
│                         └──────┬───────┘                                │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         INITIALIZING                            │    │
│  │                                                                 │    │
│  │  1. Fetch recipient's pre-key bundle from server                │    │
│  │  2. Verify signed pre-key signature                             │    │
│  │  3. Generate ephemeral key pair                                 │    │
│  │  4. Perform X3DH key agreement                                  │    │
│  │  5. Initialize Double Ratchet with shared secret                │    │
│  │                                                                 │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                       │
│                                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                          ACTIVE                                 │    │
│  │                                                                 │    │
│  │  • Messages encrypted with current chain key                    │    │
│  │  • DH ratchet performed on send after receive                   │    │
│  │  • Symmetric ratchet performed for each message                 │    │
│  │  • Session state persisted to database                          │    │
│  │                                                                 │    │
│  │  Events:                                                        │    │
│  │  - Send message → encrypt, update sending chain                 │    │
│  │  - Receive message → decrypt, update receiving chain            │    │
│  │  - Key refresh → rotate signed pre-key (every 30 days)          │    │
│  │                                                                 │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                       │
│                 ┌───────────────┼───────────────┐                       │
│                 │               │               │                       │
│                 ▼               ▼               ▼                       │
│          ┌───────────┐   ┌───────────┐   ┌───────────┐                  │
│          │  EXPIRED  │   │  CLOSED   │   │ SUSPENDED │                  │
│          │           │   │           │   │           │                  │
│          │ Key TTL   │   │ User left │   │ Security  │                  │
│          │ exceeded  │   │ convo     │   │ concern   │                  │
│          └─────┬─────┘   └─────┬─────┘   └─────┬─────┘                  │
│                │               │               │                        │
│                └───────────────┼───────────────┘                        │
│                                │                                        │
│                                ▼                                        │
│                         ┌──────────────┐                                │
│                         │   CLEANUP    │                                │
│                         │              │                                │
│                         │ All keys     │                                │
│                         │ securely     │                                │
│                         │ deleted      │                                │
│                         └──────────────┘                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Session Recovery

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SESSION RECOVERY FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Scenario: Session state lost or corrupted                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. DETECT SESSION ISSUE                                        │    │
│  │     - Decryption failure                                        │    │
│  │     - Missing chain key                                         │    │
│  │     - Message counter mismatch                                  │    │
│  │                                                                 │    │
│  │  2. NOTIFY PARTIES                                              │    │
│  │     - Send session reset request                                │    │
│  │     - Both parties clear session state                          │    │
│  │                                                                 │    │
│  │  3. RE-ESTABLISH SESSION                                        │    │
│  │     - Initiator fetches fresh pre-key bundle                    │    │
│  │     - Perform new X3DH exchange                                 │    │
│  │     - Initialize fresh Double Ratchet                           │    │
│  │                                                                 │    │
│  │  4. RESUME MESSAGING                                            │    │
│  │     - New session with fresh keys                               │    │
│  │     - Previous messages remain encrypted                        │    │
│  │     - Forward secrecy maintained                                │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Note: Some messages may be lost during recovery.                       │
│  This is a security feature - prevents replay attacks.                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### MongoDB Collections

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      MONGODB SCHEMA                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Collection: signal_pre_key_bundles                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  {                                                              │    │
│  │    "_id": ObjectId,                                             │    │
│  │    "userId": String (unique index),                             │    │
│  │                                                                 │    │
│  │    // Identity Key (long-term, base64 encoded)                  │    │
│  │    "identityKey": String,                                       │    │
│  │                                                                 │    │
│  │    // Registration ID (unique device identifier)                │    │
│  │    "registrationId": Number,                                    │    │
│  │    "deviceId": Number,                                          │    │
│  │                                                                 │    │
│  │    // Current one-time pre-key (nullable after use)             │    │
│  │    "preKeyId": Number | null,                                   │    │
│  │    "preKeyPublic": String | null,                               │    │
│  │                                                                 │    │
│  │    // Signed pre-key (rotated monthly)                          │    │
│  │    "signedPreKeyId": Number,                                    │    │
│  │    "signedPreKeyPublic": String,                                │    │
│  │    "signedPreKeySignature": String,                             │    │
│  │                                                                 │    │
│  │    // Post-quantum keys (optional, Kyber)                       │    │
│  │    "kyberPreKeyId": Number | null,                              │    │
│  │    "kyberPreKeyPublic": String | null,                          │    │
│  │    "kyberPreKeySignature": String | null,                       │    │
│  │                                                                 │    │
│  │    // Pre-key pool (JSON array of available keys)               │    │
│  │    "preKeyPool": String,  // JSON: [{id, publicKey}, ...]       │    │
│  │                                                                 │    │
│  │    // Timestamps                                                │    │
│  │    "createdAt": DateTime,                                       │    │
│  │    "lastRotatedAt": DateTime                                    │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Collection: signal_sessions                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  {                                                              │    │
│  │    "_id": ObjectId,                                             │    │
│  │    "sessionId": String (unique),                                │    │
│  │    "userId": String (indexed),                                  │    │
│  │    "recipientId": String (indexed),                             │    │
│  │    "conversationId": String (indexed),                          │    │
│  │                                                                 │    │
│  │    // Encrypted session state (Double Ratchet)                  │    │
│  │    "encryptedState": String,                                    │    │
│  │                                                                 │    │
│  │    // Session metadata                                          │    │
│  │    "status": "active" | "expired" | "suspended",                │    │
│  │    "lastMessageAt": DateTime,                                   │    │
│  │    "messageCount": Number,                                      │    │
│  │                                                                 │    │
│  │    // Timestamps                                                │    │
│  │    "createdAt": DateTime,                                       │    │
│  │    "updatedAt": DateTime                                        │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Collection: encrypted_messages                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  {                                                              │    │
│  │    "_id": ObjectId,                                             │    │
│  │    "messageId": String (unique),                                │    │
│  │    "conversationId": String (indexed),                          │    │
│  │    "senderId": String (indexed),                                │    │
│  │                                                                 │    │
│  │    // Encrypted content (server cannot read)                    │    │
│  │    "encryptedContent": String,  // Base64                       │    │
│  │    "iv": String,                // Base64                       │    │
│  │    "authTag": String,           // Base64                       │    │
│  │                                                                 │    │
│  │    // Signal Protocol header                                    │    │
│  │    "signalHeader": {                                            │    │
│  │      "senderDhPublic": String,                                  │    │
│  │      "messageNumber": Number,                                   │    │
│  │      "previousChainLength": Number                              │    │
│  │    },                                                           │    │
│  │                                                                 │    │
│  │    // Digital signature                                         │    │
│  │    "signature": String,                                         │    │
│  │                                                                 │    │
│  │    // Metadata (not encrypted)                                  │    │
│  │    "contentType": String,                                       │    │
│  │    "timestamp": DateTime,                                       │    │
│  │    "status": "sent" | "delivered" | "read"                      │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Prisma Schema

```prisma
// Signal Protocol Pre-Key Bundle
model SignalPreKeyBundle {
  id                    String    @id @default(auto()) @map("_id") @db.ObjectId
  userId                String    @unique

  // Identity Key
  identityKey           String
  registrationId        Int
  deviceId              Int

  // One-Time Pre-Key (nullable - consumed on use)
  preKeyId              Int?
  preKeyPublic          String?

  // Signed Pre-Key (rotated monthly)
  signedPreKeyId        Int
  signedPreKeyPublic    String
  signedPreKeySignature String

  // Post-Quantum Kyber Keys (optional)
  kyberPreKeyId         Int?
  kyberPreKeyPublic     String?
  kyberPreKeySignature  String?

  // Pre-Key Pool (JSON string of available keys)
  preKeyPool            String?

  createdAt             DateTime  @default(now())
  lastRotatedAt         DateTime  @default(now())

  @@map("signal_pre_key_bundles")
}

// E2EE Session
model SignalSession {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  sessionId       String    @unique
  userId          String
  recipientId     String
  conversationId  String

  // Encrypted session state
  encryptedState  String

  // Metadata
  status          String    @default("active")
  lastMessageAt   DateTime?
  messageCount    Int       @default(0)

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId])
  @@index([recipientId])
  @@index([conversationId])
  @@map("signal_sessions")
}
```

---

## API Endpoints

### Signal Protocol REST API

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SIGNAL PROTOCOL API                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Base URL: /api/signal                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  POST /keys                                                     │    │
│  │                                                                 │    │
│  │  Description: Generate and store pre-key bundle                 │    │
│  │  Auth: Required                                                 │    │
│  │  Rate Limit: 5 requests/minute                                  │    │
│  │                                                                 │    │
│  │  Response: {                                                    │    │
│  │    success: true,                                               │    │
│  │    data: {                                                      │    │
│  │      registrationId: 12345,                                     │    │
│  │      deviceId: 1,                                               │    │
│  │      preKeyId: 42,                                              │    │
│  │      signedPreKeyId: 1                                          │    │
│  │    }                                                            │    │
│  │  }                                                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  GET /keys/:userId                                              │    │
│  │                                                                 │    │
│  │  Description: Get user's pre-key bundle                         │    │
│  │  Auth: Required                                                 │    │
│  │  Rate Limit: 30 requests/minute                                 │    │
│  │  Authorization: Must share conversation OR be friends           │    │
│  │                                                                 │    │
│  │  Response: {                                                    │    │
│  │    success: true,                                               │    │
│  │    data: {                                                      │    │
│  │      identityKey: Uint8Array,                                   │    │
│  │      registrationId: 12345,                                     │    │
│  │      deviceId: 1,                                               │    │
│  │      preKeyId: 42,                                              │    │
│  │      preKeyPublic: Uint8Array,                                  │    │
│  │      signedPreKeyId: 1,                                         │    │
│  │      signedPreKeyPublic: Uint8Array,                            │    │
│  │      signedPreKeySignature: Uint8Array,                         │    │
│  │      kyberPreKeyId: 1,        // Optional                       │    │
│  │      kyberPreKeyPublic: Uint8Array  // Optional                 │    │
│  │    }                                                            │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  │  Errors:                                                        │    │
│  │  - 403: Not authorized (no shared conversation/friendship)      │    │
│  │  - 404: User has not generated keys                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  POST /session/establish                                        │    │
│  │                                                                 │    │
│  │  Description: Establish E2EE session with another user          │    │
│  │  Auth: Required                                                 │    │
│  │  Rate Limit: 20 requests/minute                                 │    │
│  │  Authorization: Both users must be conversation participants    │    │
│  │                                                                 │    │
│  │  Request: {                                                     │    │
│  │    recipientUserId: "user-456",                                 │    │
│  │    conversationId: "conv-789"                                   │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  │  Response: {                                                    │    │
│  │    success: true,                                               │    │
│  │    message: "E2EE session established successfully"             │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  │  Errors:                                                        │    │
│  │  - 403: Not a participant in conversation                       │    │
│  │  - 404: Recipient has not generated keys                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Request/Response Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    API REQUEST FLOW                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  CLIENT                    GATEWAY                     DATABASE         │
│    │                          │                            │            │
│    │  POST /keys              │                            │            │
│    │────────────────────────►│                            │            │
│    │                          │                            │            │
│    │                    ┌─────┴─────┐                      │            │
│    │                    │  Auth     │                      │            │
│    │                    │  Check    │                      │            │
│    │                    └─────┬─────┘                      │            │
│    │                          │                            │            │
│    │                    ┌─────┴─────┐                      │            │
│    │                    │  Rate     │                      │            │
│    │                    │  Limit    │                      │            │
│    │                    └─────┬─────┘                      │            │
│    │                          │                            │            │
│    │                    ┌─────┴─────┐                      │            │
│    │                    │ Generate  │                      │            │
│    │                    │ Pre-Key   │                      │            │
│    │                    │ Bundle    │                      │            │
│    │                    └─────┬─────┘                      │            │
│    │                          │                            │            │
│    │                          │  UPSERT bundle             │            │
│    │                          │───────────────────────────►│            │
│    │                          │                            │            │
│    │                          │◄───────────────────────────│            │
│    │                          │                            │            │
│    │◄────────────────────────│                            │            │
│    │  { success: true, ... }  │                            │            │
│    │                          │                            │            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Measures

### Rate Limiting

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       RATE LIMITING                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┬──────────────┬─────────────────────────────────┐    │
│  │    Endpoint    │  Limit/Min   │         Purpose                 │    │
│  ├────────────────┼──────────────┼─────────────────────────────────┤    │
│  │ POST /keys     │      5       │ Prevent key exhaustion attack   │    │
│  │ GET /keys/:id  │     30       │ Prevent key scraping            │    │
│  │ POST /session  │     20       │ Prevent session flooding        │    │
│  │ Messages       │     20       │ Prevent message spam            │    │
│  │ Global API     │    300       │ Prevent API abuse               │    │
│  └────────────────┴──────────────┴─────────────────────────────────┘    │
│                                                                         │
│  Key generation:                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  rate_limit_key = `signal:keys:post:${userId}`                 │    │
│  │  window = 60 seconds                                            │    │
│  │  max_requests = 5                                               │    │
│  │                                                                 │    │
│  │  Response on limit exceeded:                                    │    │
│  │  {                                                              │    │
│  │    success: false,                                              │    │
│  │    error: "Too many key generation requests",                   │    │
│  │    statusCode: 429                                              │    │
│  │  }                                                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Authorization Checks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  GET /keys/:targetUserId                                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. Authenticate request (JWT/session)                          │    │
│  │     └─ Extract requestingUserId                                 │    │
│  │                                                                 │    │
│  │  2. Check shared conversation                                   │    │
│  │     ┌───────────────────────────────────────────────────────┐   │    │
│  │     │ SELECT * FROM conversation_members                    │   │    │
│  │     │ WHERE userId = requestingUserId                       │   │    │
│  │     │ AND conversationId IN (                               │   │    │
│  │     │   SELECT conversationId FROM conversation_members     │   │    │
│  │     │   WHERE userId = targetUserId                         │   │    │
│  │     │ )                                                     │   │    │
│  │     └───────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  3. Check friendship (fallback)                                 │    │
│  │     ┌───────────────────────────────────────────────────────┐   │    │
│  │     │ SELECT * FROM friend_requests                         │   │    │
│  │     │ WHERE (                                               │   │    │
│  │     │   (senderId = requestingUserId AND                    │   │    │
│  │     │    receiverId = targetUserId)                         │   │    │
│  │     │   OR                                                  │   │    │
│  │     │   (senderId = targetUserId AND                        │   │    │
│  │     │    receiverId = requestingUserId)                     │   │    │
│  │     │ )                                                     │   │    │
│  │     │ AND status = 'accepted'                               │   │    │
│  │     └───────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  4. Decision                                                    │    │
│  │     ┌───────────────────────────────────────────────────────┐   │    │
│  │     │ if (!sharedConversation && !areFriends) {            │   │    │
│  │     │   logger.warn('SECURITY: Unauthorized key request');  │   │    │
│  │     │   return 403 Forbidden;                               │   │    │
│  │     │ }                                                     │   │    │
│  │     └───────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Memory Security

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MEMORY SECURITY                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Sensitive Data Lifecycle:                                              │
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │   Created    │────►│    Used      │────►│   Deleted    │             │
│  │              │     │              │     │              │             │
│  │ Key material │     │ Encryption/  │     │ Zeroized in  │             │
│  │ generated    │     │ Decryption   │     │ memory       │             │
│  └──────────────┘     └──────────────┘     └──────────────┘             │
│                                                                         │
│  Secure Deletion:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  // Immediately zero out sensitive data                         │    │
│  │  function secureDelete(buffer: Uint8Array): void {             │    │
│  │    buffer.fill(0);  // Overwrite with zeros                    │    │
│  │    // Prevent compiler optimization from removing fill          │    │
│  │    if (buffer[0] !== 0) throw new Error('Secure delete failed');│    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  │  // Applied to:                                                 │    │
│  │  - Message keys (after each encrypt/decrypt)                    │    │
│  │  - Chain keys (when ratcheting forward)                         │    │
│  │  - Session state (on logout/shutdown)                           │    │
│  │  - Pre-key private material (after consumption)                 │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Shutdown Cleanup:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  async shutdown(): Promise<void> {                              │    │
│  │    // 1. Clear Double Ratchet sessions                          │    │
│  │    for (const session of this.sessions) {                       │    │
│  │      session.clearSensitiveData();                              │    │
│  │    }                                                            │    │
│  │                                                                 │    │
│  │    // 2. Clear key vault                                        │    │
│  │    this.keyVault.clearAllKeys();                                │    │
│  │                                                                 │    │
│  │    // 3. Clear Signal service                                   │    │
│  │    this.signalService.clearAllSensitiveData();                  │    │
│  │                                                                 │    │
│  │    // 4. Nullify references                                     │    │
│  │    this.sessions.clear();                                       │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Signature Verification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 STRICT SIGNATURE VERIFICATION                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  // SECURITY: Reject messages with invalid signatures           │    │
│  │  // (Do NOT just warn - this prevents message spoofing)         │    │
│  │                                                                 │    │
│  │  async verifyMessageSignature(                                  │    │
│  │    message: EncryptedMessage,                                   │    │
│  │    senderIdentityKey: Uint8Array                                │    │
│  │  ): Promise<boolean> {                                          │    │
│  │                                                                 │    │
│  │    const isValid = await this.crypto.verify(                    │    │
│  │      senderIdentityKey,                                         │    │
│  │      message.signature,                                         │    │
│  │      SHA256(message.header + message.ciphertext)                │    │
│  │    );                                                           │    │
│  │                                                                 │    │
│  │    if (!isValid) {                                              │    │
│  │      logger.error(                                              │    │
│  │        'SECURITY: Signature verification FAILED',              │    │
│  │        { senderId: message.senderId }                           │    │
│  │      );                                                         │    │
│  │      throw new Error('Message signature verification failed');  │    │
│  │    }                                                            │    │
│  │                                                                 │    │
│  │    return true;                                                 │    │
│  │  }                                                              │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Why strict verification matters:                                       │
│  - Prevents message tampering                                           │
│  - Prevents sender impersonation                                        │
│  - Ensures message authenticity                                         │
│  - Required for non-repudiation                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## DMA Compliance

### Digital Markets Act Interoperability

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DMA INTEROPERABILITY                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  The Digital Markets Act (DMA) requires "gatekeepers" to enable         │
│  interoperability with other messaging services while maintaining       │
│  end-to-end encryption.                                                 │
│                                                                         │
│  Meeshy's implementation supports:                                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. CROSS-PLATFORM KEY EXCHANGE                                 │    │
│  │     - Standard Signal Protocol compatible                       │    │
│  │     - Pre-key bundles can be shared across platforms            │    │
│  │     - X3DH works with any Signal-compatible client              │    │
│  │                                                                 │    │
│  │  2. MESSAGE FORMAT COMPATIBILITY                                │    │
│  │     - Standard encrypted message format                         │    │
│  │     - Protobuf-compatible message structure                     │    │
│  │     - Platform-agnostic encryption                              │    │
│  │                                                                 │    │
│  │  3. IDENTITY VERIFICATION                                       │    │
│  │     - Safety numbers for cross-platform verification            │    │
│  │     - Identity key fingerprints                                 │    │
│  │     - Out-of-band verification support                          │    │
│  │                                                                 │    │
│  │  4. POST-QUANTUM READINESS                                      │    │
│  │     - Optional Kyber key encapsulation                          │    │
│  │     - Hybrid encryption mode available                          │    │
│  │     - Future-proof against quantum attacks                      │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interoperability Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                CROSS-PLATFORM MESSAGING                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────┐          ┌────────────┐          ┌────────────┐         │
│  │  Meeshy    │          │ Federation │          │  External  │         │
│  │  Client    │◄────────►│  Gateway   │◄────────►│  Messenger │         │
│  └────────────┘          └────────────┘          └────────────┘         │
│                                                                         │
│                      ┌──────────────────┐                               │
│                      │  Key Translation │                               │
│                      │     Service      │                               │
│                      └────────┬─────────┘                               │
│                               │                                         │
│           ┌───────────────────┼───────────────────┐                     │
│           ▼                   ▼                   ▼                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│  │ Signal Protocol │ │ Signal Protocol │ │ Signal Protocol │            │
│  │   (Meeshy)      │ │   (WhatsApp)    │ │   (iMessage*)   │            │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘            │
│                                                                         │
│  * Requires Apple compliance with DMA                                   │
│                                                                         │
│  Federation Flow:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  1. User A (Meeshy) wants to message User B (External)          │    │
│  │  2. Federation Gateway requests User B's pre-key bundle         │    │
│  │  3. Gateway translates bundle to Meeshy format (if needed)      │    │
│  │  4. User A performs X3DH with translated bundle                 │    │
│  │  5. Message encrypted with standard Signal Protocol             │    │
│  │  6. Gateway forwards to External platform                       │    │
│  │  7. External platform decrypts with User B's keys               │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Files

### Core Files

| File | Purpose |
|------|---------|
| `SignalProtocolEngine.ts` | Core Signal Protocol implementation |
| `SignalKeyManager.ts` | Key generation and management |
| `DoubleRatchet.ts` | Double Ratchet algorithm |
| `EncryptionService.ts` | High-level encryption API |
| `signal-protocol.ts` | REST API routes |
| `rate-limiter.ts` | Rate limiting middleware |

### File Structure

```
services/gateway/src/
├── dma-interoperability/
│   └── signal-protocol/
│       ├── SignalProtocolEngine.ts    # Main engine
│       ├── SignalKeyManager.ts        # Key management
│       ├── DoubleRatchet.ts           # Ratchet algorithm
│       └── X3DHKeyAgreement.ts        # Key agreement
├── services/
│   └── EncryptionService.ts           # Service layer
├── routes/
│   └── signal-protocol.ts             # API endpoints
├── middleware/
│   ├── auth.ts                        # Authentication
│   └── rate-limiter.ts                # Rate limiting
└── prisma/
    └── schema.prisma                  # Database schema
```

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **X3DH** | Extended Triple Diffie-Hellman - key agreement protocol |
| **Double Ratchet** | Algorithm providing forward secrecy and self-healing |
| **Pre-Key** | One-time public key for asynchronous session setup |
| **Identity Key** | Long-term key pair for user identity |
| **Chain Key** | Symmetric key for deriving message keys |
| **Root Key** | Master secret for deriving chain keys |
| **Kyber** | Post-quantum key encapsulation mechanism |
| **HKDF** | HMAC-based Key Derivation Function |
| **ECDH** | Elliptic Curve Diffie-Hellman |
| **ECDSA** | Elliptic Curve Digital Signature Algorithm |

### References

1. Signal Protocol Specification: https://signal.org/docs/
2. X3DH Key Agreement: https://signal.org/docs/specifications/x3dh/
3. Double Ratchet Algorithm: https://signal.org/docs/specifications/doubleratchet/
4. NIST Post-Quantum Cryptography: https://csrc.nist.gov/projects/post-quantum-cryptography
5. Digital Markets Act: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R1925

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Meeshy Security Team*
