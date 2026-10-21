## 2026-10-11: D-P4 — On cloisonne par compte les PRÉFÉRENCES de packs, jamais leurs OCTETS ; l'élagage garde l'union des étagères des comptes connus (#10148)

**Statut** : Accepté (lot LP0 ; appliqué par LP1 et LP2).

**Contexte** : un appareil peut porter plusieurs comptes. L'installation d'un pack est une préférence de COMPTE (une ligne `UserStickerPack`) ; les octets d'un pack officiel sont publics et adressés par contenu.

**Décision** : l'étagère et le cache d'installation se cloisonnent par compte ; les octets, jamais. L'élagage garde l'UNION des étagères des comptes connus sur l'appareil, plus les baux ouverts (une reprise de photo en cours) ; l'élagage propre à un compte n'intervient qu'au RETRAIT de ce compte. Les transitions sont figées par `design/packs/presence-vectors.json`, rejoué tel quel par LP1 et LP2.

**Alternatives rejetées** : élaguer « selon le compte courant » — retélécharger plusieurs Mo à chaque changement de compte (contre PP5), sans rien gagner en confidentialité, les octets étant publics.

**Conséquences** : le cache iOS `Caches/sticker-packs.json`, aujourd'hui commun aux comptes, se cloisonne au LP2.
