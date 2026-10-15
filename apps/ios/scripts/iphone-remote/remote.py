"""Envoie une commande à la télécommande XCUITest de l'iPhone (#10682) et imprime sa réponse."""
import socket
import sys

END = b"\n<<END>>\n"


def main() -> int:
    command = " ".join(sys.argv[1:])
    try:
        connection = socket.create_connection(("127.0.0.1", 8100), timeout=120)
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
