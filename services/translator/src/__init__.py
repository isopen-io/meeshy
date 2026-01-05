"""
Service de traduction Meeshy
Architecture: FastAPI + Prisma + NLLB + Redis + gRPC/ZMQ

Ce service implémente l'architecture de traduction complète selon les spécifications Meeshy:
- CRUD complet sur Messages et MessageTranslations
- Traduction multi-langues avec modèles NLLB (200+ langues)
- Cache Redis avec fallback local
- Communication via API REST, gRPC et ZeroMQ
- Support de la détection automatique de langue
"""

__version__ = "1.0.0"
__author__ = "Meeshy Team"
__description__ = "Service de traduction haute performance avec support multi-langues"
