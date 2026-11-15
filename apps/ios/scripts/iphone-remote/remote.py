"""Envoie une commande à la télécommande XCUITest de l'iPhone (#10682) et imprime sa réponse."""
import os
import socket
import sys

END = b"\n<<END>>\n"


def main() -> int:
    command = " ".join(sys.argv[1:])
    try:
        # iPhone relié en Wi-Fi : iproxy (USB seulement) ne passe pas, viser l'adresse du tunnel CoreDevice
        # (`devicectl device info details` → Tunnel IP Address) par IPHONE_REMOTE_HOST.
        connection = socket.create_connection((os.environ.get("IPHONE_REMOTE_HOST", "127.0.0.1"), int(os.environ.get("IPHONE_REMOTE_PORT", "8100"))), timeout=120)
    except ConnectionRefusedError:
        print("télécommande injoignable : lancer d'abord « iphone-remote.sh start »", file=sys.stderr)
        return 2
    with connection:
        connection.sendall((command + "\n").encode())
        answer = b""
        while not answer.endswith(END):
            chunk = connection.recv(65536)
            if not chunk:
                break
            answer += chunk
    text = answer.removesuffix(END).decode(errors="replace")
    print(text)
    return 1 if text.startswith(("absent", "commande inconnue", "lien")) else 0


if __name__ == "__main__":
    sys.exit(main())
