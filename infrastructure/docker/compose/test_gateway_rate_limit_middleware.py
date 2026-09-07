"""
Garde de non-régression — issue #3622 : le middleware Traefik `rate-limit`
existe mais n'est attaché à aucun routeur gateway.

`config/dynamic.yaml` déclare `rate-limit` (100 req/s, burst 50) depuis le
provider `file` de Traefik — chargé par `docker-compose.prod.yml`
(`--providers.file.filename=/dynamic.yaml`). `docker-compose.staging.yml` ne
possède pas son propre service Traefik : `gateway-staging` rejoint le réseau
externe `meeshy-network` que Traefik (démarré par la stack prod) publie, donc
`rate-limit@file` y est également disponible.

Sans ce middleware sur le routeur, la seule protection de débit à la porte
d'entrée est applicative (`registerGlobalRateLimiter`, 300 req/min PAR clé
`request.ip`) — aucune limite n'existe au niveau du reverse proxy, avant même
que Fastify n'ouvre une connexion et exécute son propre pipeline de
middlewares. C'est une couche de défense en profondeur distincte, pas un
doublon : Traefik peut absorber un flot avant qu'il n'atteigne le processus
Node.

Exécution : `python3 -m unittest infrastructure.docker.compose.test_gateway_rate_limit_middleware -v`
depuis la racine du dépôt.
"""
import pathlib
import unittest

import yaml

COMPOSE_DIR = pathlib.Path(__file__).resolve().parent
DYNAMIC_CONFIG = COMPOSE_DIR / "config" / "dynamic.yaml"

GATEWAY_ROUTERS = (
    ("docker-compose.prod.yml", "gateway"),
    ("docker-compose.staging.yml", "gateway-staging"),
)


def load_service(compose_file: pathlib.Path, service_name: str) -> dict:
    with open(compose_file) as f:
        data = yaml.safe_load(f)
    return data["services"][service_name]


def router_middlewares(service: dict, router_name: str) -> list[str]:
    label_prefix = f"traefik.http.routers.{router_name}.middlewares="
    for label in service["labels"]:
        if label.startswith(label_prefix):
            return label[len(label_prefix):].split(",")
    raise AssertionError(f"aucun label {label_prefix!r} trouvé")


class RateLimitMiddlewareIsDefined(unittest.TestCase):
    """Prérequis : le middleware que le routeur doit référencer existe."""

    def test_rate_limit_est_declare_dans_la_config_dynamique(self):
        with open(DYNAMIC_CONFIG) as f:
            dynamic = yaml.safe_load(f)
        self.assertIn(
            "rate-limit",
            dynamic["http"]["middlewares"],
            f"{DYNAMIC_CONFIG} ne déclare plus 'rate-limit' — "
            "rate-limit@file référencerait un middleware inexistant",
        )


class GatewayRouterAttachesRateLimit(unittest.TestCase):
    """Le coeur de #3622 : le routeur gateway (prod ET staging) référence
    rate-limit@file, sans perdre compress@file au passage."""

    def test_le_routeur_gateway_attache_rate_limit_et_compress(self):
        for filename, router_name in GATEWAY_ROUTERS:
            compose_file = COMPOSE_DIR / filename
            service = load_service(compose_file, router_name)
            middlewares = router_middlewares(service, router_name)
            with self.subTest(compose_file=filename, router=router_name):
                self.assertIn(
                    "rate-limit@file",
                    middlewares,
                    f"{filename}: le routeur {router_name!r} ne référence pas "
                    "rate-limit@file — aucune limite de débit n'est appliquée "
                    "au niveau du reverse proxy",
                )
                self.assertIn(
                    "compress@file",
                    middlewares,
                    f"{filename}: le routeur {router_name!r} a perdu compress@file",
                )


if __name__ == "__main__":
    unittest.main()
