"""
Configuration pytest pour les tests d'intégration

Définit les markers et fixtures communes pour les tests e2e.
"""

import pytest


def pytest_configure(config):
    """Enregistrer les markers personnalisés"""
    config.addinivalue_line(
        "markers",
        "e2e: Tests d'intégration end-to-end (skip en CI)"
    )


def pytest_collection_modifyitems(config, items):
    """
    Modifier les tests collectés pour ajouter des markers automatiques
    """
    # Skip les tests e2e en CI (détecté par variable d'environnement CI=true)
    import os
    if os.environ.get("CI") == "true":
        skip_e2e = pytest.mark.skip(reason="Tests e2e désactivés en CI")
        for item in items:
            if "e2e" in item.keywords:
                item.add_marker(skip_e2e)
