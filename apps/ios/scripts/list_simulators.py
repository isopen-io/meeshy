#!/usr/bin/env python3
"""Élit les simulateurs d'une FAMILLE par leur TYPE D'APPAREIL (#6838).

Le NOM d'un simulateur est libre ; sa FAMILLE ne l'est pas. Les simulateurs du
projet — `Meeshy-iOS26`, `Meeshy-iOS18` — ne portent pas « iPhone » dans leur
nom, et `meeshy.sh` les élisait par `grep -E "iPhone"`. Le jour où le nettoyage
demandé par le porteur n'a laissé que `Meeshy-iOS26`, tout build local est mort
sur « No iPhone simulators found » alors que la machine existait ET tournait.

Rend une ligne par simulateur disponible : UDID<TAB>NOM<TAB>ÉTAT, dans l'ordre
où le script veut les essayer — bootés d'abord (on ne redémarre pas ce qui
tourne), puis les modèles « Pro », puis le reste, chaque groupe trié par nom
pour que deux appels rendent le même ordre.
"""
import json
import subprocess
import sys

FAMILLES = {
    "iPhone": "com.apple.CoreSimulator.SimDeviceType.iPhone",
    "iPad": "com.apple.CoreSimulator.SimDeviceType.iPad",
}


def elire(charge: dict, famille: str) -> list[tuple[str, str, str]]:
    prefixe = FAMILLES.get(famille)
    if prefixe is None:
        return []
    retenus = []
    for appareils in charge.get("devices", {}).values():
        for appareil in appareils:
            if not appareil.get("isAvailable", False):
                continue
            # Le type porte la famille ; le nom ne la porte pas forcément.
            if not str(appareil.get("deviceTypeIdentifier", "")).startswith(prefixe):
                continue
            retenus.append((appareil.get("udid", ""),
                            appareil.get("name", ""),
                            appareil.get("state", "")))

    def rang(ligne: tuple[str, str, str]) -> tuple[int, int, str]:
        _, nom, etat = ligne
        return (0 if etat == "Booted" else 1,
                0 if "Pro" in nom else 1,
                nom)

    return sorted((l for l in retenus if l[0]), key=rang)


def main() -> int:
    args = sys.argv[1:]
    famille = "iPhone"
    source = None
    if args and args[0] == "--from-json":
        source = args[1]
        args = args[2:]
    if args:
        famille = args[0]

    if source:
        with open(source, encoding="utf-8") as fichier:
            charge = json.load(fichier)
    else:
        sortie = subprocess.run(["xcrun", "simctl", "list", "devices", "--json"],
                                capture_output=True, text=True, check=False)
        if sortie.returncode != 0:
            return 1
        charge = json.loads(sortie.stdout or "{}")

    for udid, nom, etat in elire(charge, famille):
        print(f"{udid}\t{nom}\t{etat}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
