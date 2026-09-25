## Leçon 184 — Quand un fait a un porteur ET un drapeau, le code finit par lire le drapeau (2026-08-15, routine temps réel, cycle 33)

Le schéma d'envoi REST compte `encryptedContent` parmi les porteurs de contenu :
un corps n'apportant que du chiffré est un message valide. La route consommait
ce chiffré sous condition d'`isEncrypted` — un booléen SÉPARÉ, optionnel, que le
schéma n'a jamais lié au chiffré.

**Les deux ordres perdaient.** Chiffré sans le drapeau : la charge chiffrée est
jetée, et le corps que le schéma venait d'approuver ressort en 400 « contenu
vide ». Drapeau sans le chiffré : `ciphertext: encryptedContent!` ment, et le
message est écrit EN CLAIR avec `isEncrypted: false`, puis traduit, scanné,
poussé en notification. Un message déclaré chiffré, rétrogradé sans un mot.

**La règle.** Un fait porté par une donnée ne doit jamais être relu à travers un
drapeau posé à côté. `encryptedContent` EST le fait du chiffrement ; `isEncrypted`
n'en est qu'un écho, et un écho peut arriver seul. Gater sur l'écho, c'est
garantir qu'un jour les deux divergeront — et le code lira le mauvais. Le dépôt
interdit déjà la forme la plus connue de cette faute (« pas de booléen redondant
avec un timestamp », CLAUDE.md) : elle vaut à l'identique pour tout booléen
d'entrée qui double un champ porteur. Le chemin socket, lui, était juste depuis
toujours — il teste `!data.encryptedPayload`, la présence, jamais un booléen.

**Le corollaire sur l'ordre des correctifs.** Le même champ portait un troisième
défaut : `encryptionMode` rejetait sur sa casse le `"E2EE"` qu'iOS émet.
Normaliser la casse SEULE aurait converti un 400 franc en rétrogradation
silencieuse — le corps serait enfin passé la validation, pour se faire écrire en
clair. **Lever une barrière d'entrée avant d'avoir réparé ce qui est derrière
transforme un refus en corruption.** Vérifier systématiquement ce qu'un
assouplissement de validateur laisse désormais atteindre.

**Le signal qu'on aurait pu lire plus tôt.** Deux clients avaient CONTOURNÉ la
branche au lieu de la signaler : le web refuse son repli REST pour les messages
chiffrés (« REST can't handle E2EE yet »), iOS documente la même impasse dans
son `decisions.md`. Un contournement écrit dans le code client est un rapport de
bug serveur que personne n'a déposé — les relire comme tels.

Parente de la leçon 183 (cycle 32) : là-bas une branche de validateur sans
implémentation, ici une branche dont l'implémentation était conditionnée à un
AUTRE champ. Même famille — la suite de tests couvrait la conjonction des deux
champs, jamais l'un sans l'autre, c'est-à-dire jamais ce que le schéma admet.
