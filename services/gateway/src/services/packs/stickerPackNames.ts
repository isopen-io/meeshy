/**
 * Les noms et descriptions des packs de stickers INTÉGRÉS dans les sept langues
 * (#10738) : la vitrine unique y ajoute ces `names`, comme les autres domaines,
 * pour que la description suive la langue de l'interface. La table vit dans le
 * catalogue partagé depuis #10189 (`BUILTIN_STICKER_PACKS[].names`,
 * `@meeshy/shared`), que le web lit directement : une seule source, servie ici
 * et affichée là. Ajout au fil de la vitrine seule — les réponses de
 * `/sticker-packs` restent figées.
 */
export { builtinStickerPackNames } from '@meeshy/shared/types/sticker-pack';
