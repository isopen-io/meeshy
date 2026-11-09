## 2026-11-09 — Une énumération de « ce que la charge TRANSPORTE » se fait dans la LANGUE du médium : cinq cycles ont fermé le texte, la base, le verrou, le fichier et la piste, et l'enveloppe CHIFFRÉE n'est aucun des deux (#17177)

La leçon 275 est outillée par une question : *« la charge que ce site remet
contient-elle autre chose que ce que je viens de garder ? »*, et elle se répond
en lisant l'objet remis ligne à ligne. Cinq passes l'ont posée sur le même objet
littéral — le `data` d'une bannière de message — et ont fermé, une par une, cinq
choses : le TEXTE (cycle 123), la BASE du Prisme (123), le VERROU de
localisation (124), le FICHIER et son étiquette (125), la PISTE traduite (128).

`encryptedContent` était entre deux d'entre elles, non gardé, depuis le début.

**Ce qui l'a rendu invisible n'est pas sa place, c'est sa NATURE.** Les cinq
gardes se répartissent en deux familles — ce qui compose une CHAÎNE, et ce qui
transporte un FICHIER — et l'enveloppe de l'appareil n'est ni l'un ni l'autre :
c'est **la charge que le LECTEUR compose lui-même.** Elle ne s'écrit nulle part
dans la bannière ; elle donne à la NSE de quoi la RÉÉCRIRE. Les deux questions
par lesquelles on balaie cet objet — « qui compose ce corps ? » (cycle 126) et
« quel fichier part avec ? » (cycle 125) — rendent toutes deux `[]` sur elle.

Le coût, mesuré : `protectedPreview` a pour préséance *éphémère > vue unique >
flouté > chiffré*, donc un message à VUE UNIQUE d'une conversation chiffrée
compose le placeholder `👁️ 🖼️` **et** laissait partir à côté de quoi l'écraser.
La NSE déchiffrait et posait le texte entier sur l'écran verrouillé. Le même
message en mode `server` était protégé : la fuite n'était pas une décision de
produit, c'était une **asymétrie de régime** — et c'est elle, pas le champ, qui
nomme le défaut.

> Avant de conclure qu'un objet est gardé, compter les FAMILLES de médium qu'il
> porte, pas les champs qu'on a fermés. Un champ dont la valeur ne s'affiche pas
> et ne se télécharge pas — un chiffré, une clé de déchiffrement locale, un
> identifiant qui permet d'aller CHERCHER — échappe par construction à tout
> balayage écrit dans la langue des deux premières.

Sites : `services/gateway/src/services/notifications/deviceEnvelopePush.ts` (la
règle, qui relit la protection chez elle), `sanitizeInputs.ts` (le second
verrou, sur la clé qui DÉCLARE), `deviceEnvelopeThreeFanOuts.test.ts`.
