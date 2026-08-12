"""Métadonnées du build gravées dans l'image, remontées au runtime.

Le Dockerfile pose déjà ``org.opencontainers.image.revision`` depuis le
build-arg ``VCS_REF``, que ``.github/workflows/docker.yml`` alimente avec
``github.sha``. Un label OCI n'est cependant lisible que par ``docker inspect``
sur la machine hôte : depuis l'extérieur, identifier le code en production
supposait de corréler l'uptime du container avec l'horodatage des tags
``sha-<short>`` du registre — une inférence, jamais une lecture.

MIROIR de ``packages/shared/utils/build-info.ts``. Les noms de champs
(``commit``, ``commitShort``, ``builtAt``) viennent de là et doivent le rester :
c'est ce qui permet de comparer les ``/health`` des trois services sans
traduction. Toute évolution touche les DEUX fichiers.
"""

from __future__ import annotations

import os
from typing import Dict, Mapping, Optional

SHORT_SHA_LENGTH = 7

BuildInfo = Dict[str, Optional[str]]


def _read_non_empty(value: Optional[str]) -> Optional[str]:
    stripped = (value or "").strip()
    return stripped or None


def resolve_build_info(env: Optional[Mapping[str, str]] = None) -> BuildInfo:
    """Retourne le commit et la date gravés dans l'image.

    Aucune valeur de repli n'est fabriquée : une image sans commit gravé rend
    ``None``, pas ``"unknown"`` ni ``"dev"``. Un repli plausible rendrait une
    lecture morte indiscernable d'une lecture réussie — exactement le défaut
    corrigé ici.
    """
    source = os.environ if env is None else env
    commit = _read_non_empty(source.get("GIT_COMMIT"))

    return {
        "commit": commit,
        "commitShort": commit[:SHORT_SHA_LENGTH] if commit else None,
        "builtAt": _read_non_empty(source.get("BUILD_DATE")),
    }
