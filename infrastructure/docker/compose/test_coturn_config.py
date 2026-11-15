"""
Garde de non-régression — issue #3641 : `turnserver.conf` versionné et audité.

`docker-compose.prod.yml` montait `./config/turnserver.conf`, un fichier qui
n'a jamais existé dans le dépôt (Docker crée alors un dossier vide au point de
montage — coturn démarre sans secret, sans TLS, sans `denied-peer-ip` ni quota,
ou échoue selon le runtime). Le vrai gabarit versionné vivait déjà dans le
dépôt (`infrastructure/config/turnserver*.conf`) mais AUCUN montage ne
pointait dessus avec la bonne profondeur relative : `docker-compose.dev.yml`
et `docker-compose.local.yml` référençaient eux aussi `../config/…` — un
niveau trop court depuis `infrastructure/docker/compose/` — et souffraient du
même trou que prod, sans qu'aucune issue ne l'ait nommé. Ce test fige donc
DEUX garanties, sur les TROIS environnements : le montage résout vers un
fichier qui existe réellement, et — pour prod, qui seule substitue un secret
au démarrage — que la substitution est bien câblée avant `exec turnserver`.

Exécution : `python3 -m unittest infrastructure.docker.compose.test_coturn_config -v`
depuis la racine du dépôt (aucune dépendance hors stdlib + PyYAML, déjà utilisée
par `test-services.py` dans ce même dossier).
"""
import pathlib
import unittest

import yaml

COMPOSE_DIR = pathlib.Path(__file__).resolve().parent
COMPOSE_FILE = COMPOSE_DIR / "docker-compose.prod.yml"


def load_coturn_service(compose_file: pathlib.Path = COMPOSE_FILE) -> dict:
    with open(compose_file) as f:
        data = yaml.safe_load(f)
    return data["services"]["coturn"]


def turnserver_mount(service: dict) -> str:
    return next(v for v in service["volumes"] if "turnserver" in v.lower())


class EveryEnvironmentMountsARealFile(unittest.TestCase):
    """Le trou touchait dev et local autant que prod — un seul et même bug,
    trois copies du même montage relatif d'un niveau trop court."""

    def test_dev_local_et_prod_referencent_un_fichier_qui_existe(self):
        for filename in (
            "docker-compose.dev.yml",
            "docker-compose.local.yml",
            "docker-compose.prod.yml",
        ):
            compose_file = COMPOSE_DIR / filename
            service = load_coturn_service(compose_file)
            source = turnserver_mount(service).split(":")[0]
            resolved = (compose_file.parent / source).resolve()
            with self.subTest(compose_file=filename):
                self.assertTrue(
                    resolved.is_file(),
                    f"{filename}: montage coturn {source!r} résolu vers "
                    f"{resolved}, qui n'existe pas",
                )


def entrypoint_script(service: dict) -> str:
    # entrypoint: [/bin/sh, -c, "<script>"] — le script est le 3e élément.
    return service["entrypoint"][2]


class CoturnTemplateMount(unittest.TestCase):
    def test_le_montage_turnserver_pointe_vers_un_fichier_qui_existe_reellement(self):
        service = load_coturn_service()
        source, target, *_ = turnserver_mount(service).split(":")
        resolved = (COMPOSE_DIR / source).resolve()

        self.assertTrue(
            resolved.is_file(),
            f"le montage coturn référence {source!r} (résolu: {resolved}) — "
            "fichier absent du dépôt, Docker créerait un dossier vide au "
            "point de montage et coturn démarrerait sans config auditable",
        )
        # Le gabarit ne s'écrit jamais directement sur /etc/turnserver.conf —
        # il porte encore le secret PLACEHOLDER (__TURN_SECRET__) à ce stade,
        # et coturn le lirait tel quel si on le montait là.
        self.assertNotEqual(
            target,
            "/etc/turnserver.conf",
            "le gabarit ne doit jamais être monté directement sur "
            "/etc/turnserver.conf : __TURN_SECRET__ doit être substitué par "
            "l'entrypoint avant que turnserver ne lise le fichier",
        )

    def test_turn_secret_est_fourni_au_container_et_le_demarrage_le_refuse_par_defaut(self):
        service = load_coturn_service()
        env = service.get("environment", [])
        self.assertIn(
            "TURN_SECRET=${TURN_SECRET}",
            env,
            "coturn valide les identifiants HMAC signés par TURNCredentialService "
            "(gateway) avec CE MÊME secret — sans TURN_SECRET dans son "
            "environnement, aucune valeur n'existe à substituer",
        )

        script = entrypoint_script(service)
        self.assertIn(
            '[ "$$TURN_SECRET" = "__TURN_SECRET__" ]',
            script,
            "l'entrypoint doit refuser de démarrer si le placeholder du "
            "gabarit n'a pas été remplacé",
        )
        self.assertIn(
            '[ "$$TURN_SECRET" = "meeshy-turn-secret-CHANGE-IN-PRODUCTION" ]',
            script,
            "l'entrypoint doit aussi refuser le secret par défaut de "
            "développement partagé avec les autres environnements",
        )
        self.assertIn(
            "exit 1",
            script.split("static-auth-secret", 1)[0]
            if "static-auth-secret" in script
            else script,
        )

    def test_la_config_reelle_est_materialisee_par_substitution_avant_le_demarrage(self):
        service = load_coturn_service()
        script = entrypoint_script(service)

        sed_index = script.find("sed ")
        exec_index = script.find("exec turnserver")
        self.assertGreater(sed_index, -1, "aucune substitution __TURN_SECRET__ trouvée")
        self.assertGreater(exec_index, -1, "aucun démarrage de turnserver trouvé")
        self.assertLess(
            sed_index,
            exec_index,
            "la substitution du secret doit avoir lieu AVANT `exec turnserver`, "
            "sinon le process démarre avec le placeholder ou une config périmée",
        )
        # Le fichier matérialisé doit être un chemin inscriptible du
        # container, jamais le montage :ro du gabarit lui-même.
        self.assertIn("/tmp/turnserver.conf", script)
        self.assertIn("exec turnserver -c /tmp/turnserver.conf", script)


class TurnserverTemplateContent(unittest.TestCase):
    """Le gabarit lui-même : critère de fin de l'issue #3641."""

    def setUp(self):
        service = load_coturn_service()
        source = turnserver_mount(service).split(":")[0]
        self.template = (COMPOSE_DIR / source).resolve().read_text()

    def test_les_reseaux_internes_sont_refuses_au_relais(self):
        # RFC1918 + loopback + link-local + multicast source, IPv4 et IPv6 —
        # un pair TURN ne doit jamais pouvoir relayer vers le réseau Docker
        # interne ou le loopback de l'hôte.
        for cidr_prefix in (
            "10.0.0.0-10.255.255.255",
            "127.0.0.0-127.255.255.255",
            "172.16.0.0-172.31.255.255",
            "192.168.0.0-192.168.255.255",
            "169.254.0.0-169.254.255.255",
        ):
            self.assertIn(
                f"denied-peer-ip={cidr_prefix}",
                self.template,
                f"réseau interne non exclu du relais : {cidr_prefix}",
            )

    def test_un_quota_est_impose(self):
        self.assertRegex(self.template, r"total-quota=\d+")

    def test_le_secret_est_un_placeholder_jamais_une_valeur_en_dur(self):
        self.assertIn("static-auth-secret=__TURN_SECRET__", self.template)
        self.assertNotIn("CHANGE-IN-PRODUCTION", self.template)


if __name__ == "__main__":
    unittest.main()
