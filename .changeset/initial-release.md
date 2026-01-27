---
"@meeshy/web": minor
"@meeshy/gateway": minor
"@meeshy/translator": minor
"@meeshy/shared": minor
---

Premier release avec système de versioning automatisé

**Corrections CI/CD:**
- Fix scan Trivy pour utiliser les tags `latest` et `staging`
- Standardisation tagging Docker: production → `latest`, staging → `staging`
- Auto-génération de changesets depuis conventional commits

**Fonctionnalités principales:**
- Traduction vocale multi-locuteurs avec diarisation
- Clonage vocal avec Chatterbox Multilingual (23 langues)
- E2EE avec Signal Protocol
- Magic Link et authentification 2FA
- Notifications push Firebase
- Cache multi-niveaux pour performance
- Interface web Next.js avec i18n (FR, EN, ES, PT, IT, DE)
- API Gateway Fastify avec ZMQ
- Service ML Python avec Whisper, NLLB, TTS

**Infrastructure:**
- Docker Compose production et staging séparés
- Traefik v3.6 avec Let's Encrypt
- MongoDB 8.0 avec replica set
- Redis 8 pour cache
- Architecture monorepo avec Turborepo
- CI/CD GitHub Actions complet
