## La coquille « ami WhatsApp » n'existe qu'au staging, derrière la porte pair externe et l'accès de l'équipe (2026-11-10, #17116)

### Contexte
Chantier #17007, design `docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md` § 4 « Preuve de bout
en bout » : une coquille web joue l'ami WhatsApp contre le staging, chiffre avec le pont WASM libsignal (#17114)
et parle à la passerelle par la porte « pair externe » (#17115), qu'aucune route ne branchait encore.

### Décision (en cours d'écriture — branche `claude/dma-coquille-web`)
- Les routes de la porte n'existent que si `selectExternalPeer` l'ouvre (staging déclaré ou développement) :
  la production ne les monte pas, la coquille non plus.
- Agir pour un appareil WhatsApp simulé exige un compte de l'équipe ; agir pour un appareil Meeshy exige d'être
  ce compte.
