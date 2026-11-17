/**
 * LA TABLE DES 64 SYMBOLES de la méthode « emoji » de `m.sas.v1` (Matrix), dans l'ordre de leur
 * numéro (0 à 63), avec leur nom dans les sept langues du catalogue — confirmation d'un appareil
 * par code court (#18906, #19154).
 *
 * GÉNÉRÉE depuis `fixtures/e2ee-device-verification/sas-emoji-v1.json`, elle-même dérivée de
 * matrix-org/matrix-spec `data-definitions/sas-emoji.json` (SHA-256
 * `2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887`), Apache-2.0 ; modifiée par
 * Meeshy le 2026-11-17 : clés renommées, sept langues retenues, métadonnées ajoutées. Texte de la
 * licence : `fixtures/e2ee-device-verification/LICENSE-sas-emoji.txt`. Une application qui affiche
 * ces noms les cite dans sa page de licences tierces (spécification § 4.5).
 *
 * Ne pas éditer à la main : le témoin `__tests__/device-verification-vectors.test.ts` la compare,
 * symbole par symbole et nom par nom, au fichier dont elle vient.
 */

export const SAS_EMOJI_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt-BR', 'ar'] as const;
export type SasEmojiLanguage = (typeof SAS_EMOJI_LANGUAGES)[number];

export type SasEmoji = { readonly emoji: string; readonly names: Readonly<Record<SasEmojiLanguage, string>> };

export const SAS_EMOJI_TABLE: readonly SasEmoji[] = [
  { emoji: '🐶', names: { fr: 'Chien', en: 'Dog', es: 'Perro', de: 'Hund', it: 'Cane', 'pt-BR': 'Cachorro', ar: 'كلب' } },
  { emoji: '🐱', names: { fr: 'Chat', en: 'Cat', es: 'Gato', de: 'Katze', it: 'Gatto', 'pt-BR': 'Gato', ar: 'هِرَّة' } },
  { emoji: '🦁', names: { fr: 'Lion', en: 'Lion', es: 'León', de: 'Löwe', it: 'Leone', 'pt-BR': 'Leão', ar: 'أَسَد' } },
  { emoji: '🐎', names: { fr: 'Cheval', en: 'Horse', es: 'Caballo', de: 'Pferd', it: 'Cavallo', 'pt-BR': 'Cavalo', ar: 'حِصَان' } },
  { emoji: '🦄', names: { fr: 'Licorne', en: 'Unicorn', es: 'Unicornio', de: 'Einhorn', it: 'Unicorno', 'pt-BR': 'Unicórnio', ar: 'حصان وحيد القرن' } },
  { emoji: '🐷', names: { fr: 'Cochon', en: 'Pig', es: 'Cerdo', de: 'Schwein', it: 'Maiale', 'pt-BR': 'Porco', ar: 'خِنزِير' } },
  { emoji: '🐘', names: { fr: 'Éléphant', en: 'Elephant', es: 'Elefante', de: 'Elefant', it: 'Elefante', 'pt-BR': 'Elefante', ar: 'فِيل' } },
  { emoji: '🐰', names: { fr: 'Lapin', en: 'Rabbit', es: 'Conejo', de: 'Hase', it: 'Coniglio', 'pt-BR': 'Coelho', ar: 'أَرنَب' } },
  { emoji: '🐼', names: { fr: 'Panda', en: 'Panda', es: 'Panda', de: 'Panda', it: 'Panda', 'pt-BR': 'Panda', ar: 'باندَا' } },
  { emoji: '🐓', names: { fr: 'Coq', en: 'Rooster', es: 'Gallo', de: 'Hahn', it: 'Gallo', 'pt-BR': 'Galo', ar: 'دِيك' } },
  { emoji: '🐧', names: { fr: 'Manchot', en: 'Penguin', es: 'Pingüino', de: 'Pinguin', it: 'Pinguino', 'pt-BR': 'Pinguim', ar: 'بطريق' } },
  { emoji: '🐢', names: { fr: 'Tortue', en: 'Turtle', es: 'Tortuga', de: 'Schildkröte', it: 'Tartaruga', 'pt-BR': 'Tartaruga', ar: 'سُلحفاة' } },
  { emoji: '🐟', names: { fr: 'Poisson', en: 'Fish', es: 'Pez', de: 'Fisch', it: 'Pesce', 'pt-BR': 'Peixe', ar: 'سَمَكة' } },
  { emoji: '🐙', names: { fr: 'Poulpe', en: 'Octopus', es: 'Pulpo', de: 'Oktopus', it: 'Polpo', 'pt-BR': 'Polvo', ar: 'أُخطُبُوط' } },
  { emoji: '🦋', names: { fr: 'Papillon', en: 'Butterfly', es: 'Mariposa', de: 'Schmetterling', it: 'Farfalla', 'pt-BR': 'Borboleta', ar: 'فَرَاشَة' } },
  { emoji: '🌷', names: { fr: 'Fleur', en: 'Flower', es: 'Flor', de: 'Blume', it: 'Fiore', 'pt-BR': 'Flor', ar: 'زَهرَة' } },
  { emoji: '🌳', names: { fr: 'Arbre', en: 'Tree', es: 'Árbol', de: 'Baum', it: 'Albero', 'pt-BR': 'Árvore', ar: 'شَجَرَة' } },
  { emoji: '🌵', names: { fr: 'Cactus', en: 'Cactus', es: 'Cactus', de: 'Kaktus', it: 'Cactus', 'pt-BR': 'Cacto', ar: 'صبار' } },
  { emoji: '🍄', names: { fr: 'Champignon', en: 'Mushroom', es: 'Seta', de: 'Pilz', it: 'Fungo', 'pt-BR': 'Cogumelo', ar: 'فُطر' } },
  { emoji: '🌏', names: { fr: 'Globe', en: 'Globe', es: 'Globo', de: 'Globus', it: 'Globo', 'pt-BR': 'Globo', ar: 'كُرَةٌ أرضِيَّة' } },
  { emoji: '🌙', names: { fr: 'Lune', en: 'Moon', es: 'Luna', de: 'Mond', it: 'Luna', 'pt-BR': 'Lua', ar: 'قَمَر' } },
  { emoji: '☁️', names: { fr: 'Nuage', en: 'Cloud', es: 'Nube', de: 'Wolke', it: 'Nuvola', 'pt-BR': 'Nuvem', ar: 'سَحابَة' } },
  { emoji: '🔥', names: { fr: 'Feu', en: 'Fire', es: 'Fuego', de: 'Feuer', it: 'Fuoco', 'pt-BR': 'Fogo', ar: 'نار' } },
  { emoji: '🍌', names: { fr: 'Banane', en: 'Banana', es: 'Plátano', de: 'Banane', it: 'Banana', 'pt-BR': 'Banana', ar: 'مَوزَة' } },
  { emoji: '🍎', names: { fr: 'Pomme', en: 'Apple', es: 'Manzana', de: 'Apfel', it: 'Mela', 'pt-BR': 'Maçã', ar: 'تُفَّاحَة' } },
  { emoji: '🍓', names: { fr: 'Fraise', en: 'Strawberry', es: 'Fresa', de: 'Erdbeere', it: 'Fragola', 'pt-BR': 'Morango', ar: 'فَراوِلَة' } },
  { emoji: '🌽', names: { fr: 'Maïs', en: 'Corn', es: 'Maíz', de: 'Mais', it: 'Mais', 'pt-BR': 'Milho', ar: 'ذُرَة' } },
  { emoji: '🍕', names: { fr: 'Pizza', en: 'Pizza', es: 'Pizza', de: 'Pizza', it: 'Pizza', 'pt-BR': 'Pizza', ar: 'بِيتزا' } },
  { emoji: '🎂', names: { fr: 'Gâteau', en: 'Cake', es: 'Tarta', de: 'Kuchen', it: 'Torta', 'pt-BR': 'Bolo', ar: 'كَعكَة' } },
  { emoji: '❤️', names: { fr: 'Cœur', en: 'Heart', es: 'Corazón', de: 'Herz', it: 'Cuore', 'pt-BR': 'Coração', ar: 'قَلب' } },
  { emoji: '😀', names: { fr: 'Sourire', en: 'Smiley', es: 'Emoticono', de: 'Lächeln', it: 'Faccina sorridente', 'pt-BR': 'Sorriso', ar: 'اِبتِسَامَة' } },
  { emoji: '🤖', names: { fr: 'Robot', en: 'Robot', es: 'Robot', de: 'Roboter', it: 'Robot', 'pt-BR': 'Robô', ar: 'رُوبُوت' } },
  { emoji: '🎩', names: { fr: 'Chapeau', en: 'Hat', es: 'Sombrero', de: 'Hut', it: 'Cappello', 'pt-BR': 'Chapéu', ar: 'قُبَّعَة' } },
  { emoji: '👓', names: { fr: 'Lunettes', en: 'Glasses', es: 'Gafas', de: 'Brille', it: 'Occhiali', 'pt-BR': 'Óculos', ar: 'نَظَّارَة' } },
  { emoji: '🔧', names: { fr: 'Clé à molette', en: 'Spanner', es: 'Llave inglesa', de: 'Schraubenschlüssel', it: 'Chiave inglese', 'pt-BR': 'Chave inglesa', ar: 'مِفتَاحُ رَبط' } },
  { emoji: '🎅', names: { fr: 'Père Noël', en: 'Santa', es: 'Papá Noel', de: 'Weihnachtsmann', it: 'Babbo Natale', 'pt-BR': 'Papai-noel', ar: 'سانتا' } },
  { emoji: '👍', names: { fr: 'Pouce en l’air', en: 'Thumbs Up', es: 'Pulgar arriba', de: 'Daumen Hoch', it: 'Pollice alzato', 'pt-BR': 'Joinha', ar: 'رَفعُ إِبهَام' } },
  { emoji: '☂️', names: { fr: 'Parapluie', en: 'Umbrella', es: 'Paraguas', de: 'Regenschirm', it: 'Ombrello', 'pt-BR': 'Guarda-chuva', ar: 'مِظَلَّة' } },
  { emoji: '⌛', names: { fr: 'Sablier', en: 'Hourglass', es: 'Reloj de arena', de: 'Sanduhr', it: 'Clessidra', 'pt-BR': 'Ampulheta', ar: 'سَاعَةٌ رَملِيَّة' } },
  { emoji: '⏰', names: { fr: 'Réveil', en: 'Clock', es: 'Reloj', de: 'Uhr', it: 'Orologio', 'pt-BR': 'Relógio', ar: 'سَاعَة' } },
  { emoji: '🎁', names: { fr: 'Cadeau', en: 'Gift', es: 'Regalo', de: 'Geschenk', it: 'Regalo', 'pt-BR': 'Presente', ar: 'هَدِيَّة' } },
  { emoji: '💡', names: { fr: 'Ampoule', en: 'Light Bulb', es: 'Bombilla', de: 'Glühbirne', it: 'Lampadina', 'pt-BR': 'Lâmpada', ar: 'مِصبَاح' } },
  { emoji: '📕', names: { fr: 'Livre', en: 'Book', es: 'Libro', de: 'Buch', it: 'Libro', 'pt-BR': 'Livro', ar: 'كِتَاب' } },
  { emoji: '✏️', names: { fr: 'Crayon', en: 'Pencil', es: 'Lápiz', de: 'Bleistift', it: 'Matita', 'pt-BR': 'Lápis', ar: 'قَلَمُ رَصاص' } },
  { emoji: '📎', names: { fr: 'Trombone', en: 'Paperclip', es: 'Clip', de: 'Büroklammer', it: 'Graffetta', 'pt-BR': 'Clipe de papel', ar: 'مِشبَكُ وَرَق' } },
  { emoji: '✂️', names: { fr: 'Ciseaux', en: 'Scissors', es: 'Tijeras', de: 'Schere', it: 'Forbici', 'pt-BR': 'Tesoura', ar: 'مِقَصّ' } },
  { emoji: '🔒', names: { fr: 'Cadenas', en: 'Lock', es: 'Candado', de: 'Schloss', it: 'Lucchetto', 'pt-BR': 'Cadeado', ar: 'قُفل' } },
  { emoji: '🔑', names: { fr: 'Clé', en: 'Key', es: 'Llave', de: 'Schlüssel', it: 'Chiave', 'pt-BR': 'Chave', ar: 'مِفتَاح' } },
  { emoji: '🔨', names: { fr: 'Marteau', en: 'Hammer', es: 'Martillo', de: 'Hammer', it: 'Martello', 'pt-BR': 'Martelo', ar: 'مِطرَقَة' } },
  { emoji: '☎️', names: { fr: 'Téléphone', en: 'Telephone', es: 'Teléfono', de: 'Telefon', it: 'Telefono', 'pt-BR': 'Telefone', ar: 'تِلِفُون' } },
  { emoji: '🏁', names: { fr: 'Drapeau', en: 'Flag', es: 'Bandera', de: 'Flagge', it: 'Bandiera', 'pt-BR': 'Bandeira', ar: 'عَلَم' } },
  { emoji: '🚂', names: { fr: 'Train', en: 'Train', es: 'Tren', de: 'Zug', it: 'Treno', 'pt-BR': 'Trem', ar: 'قِطَار' } },
  { emoji: '🚲', names: { fr: 'Vélo', en: 'Bicycle', es: 'Bicicleta', de: 'Fahrrad', it: 'Bicicletta', 'pt-BR': 'Bicicleta', ar: 'دَرّاجَة' } },
  { emoji: '✈️', names: { fr: 'Avion', en: 'Aeroplane', es: 'Avión', de: 'Flugzeug', it: 'Aeroplano', 'pt-BR': 'Avião', ar: 'طَائِرة' } },
  { emoji: '🚀', names: { fr: 'Fusée', en: 'Rocket', es: 'Cohete', de: 'Rakete', it: 'Razzo', 'pt-BR': 'Foguete', ar: 'صَارُوخ' } },
  { emoji: '🏆', names: { fr: 'Trophée', en: 'Trophy', es: 'Trofeo', de: 'Pokal', it: 'Trofeo', 'pt-BR': 'Troféu', ar: 'كَأسُ النَّصر' } },
  { emoji: '⚽', names: { fr: 'Ballon', en: 'Ball', es: 'Bola', de: 'Ball', it: 'Palla', 'pt-BR': 'Bola', ar: 'كُرَة' } },
  { emoji: '🎸', names: { fr: 'Guitare', en: 'Guitar', es: 'Guitarra', de: 'Gitarre', it: 'Chitarra', 'pt-BR': 'Guitarra', ar: 'غيتار' } },
  { emoji: '🎺', names: { fr: 'Trompette', en: 'Trumpet', es: 'Trompeta', de: 'Trompete', it: 'Trombetta', 'pt-BR': 'Trombeta', ar: 'بُوق' } },
  { emoji: '🔔', names: { fr: 'Cloche', en: 'Bell', es: 'Campana', de: 'Glocke', it: 'Campana', 'pt-BR': 'Sino', ar: 'جَرَس' } },
  { emoji: '⚓', names: { fr: 'Ancre', en: 'Anchor', es: 'Ancla', de: 'Anker', it: 'Ancora', 'pt-BR': 'Âncora', ar: 'مِرسَاة' } },
  { emoji: '🎧', names: { fr: 'Casque audio', en: 'Headphones', es: 'Cascos', de: 'Kopfhörer', it: 'Cuffie', 'pt-BR': 'Fones de ouvido', ar: 'سَمّاعَة رَأس' } },
  { emoji: '📁', names: { fr: 'Dossier', en: 'Folder', es: 'Carpeta', de: 'Ordner', it: 'Cartella', 'pt-BR': 'Pasta', ar: 'مُجَلَّد' } },
  { emoji: '📌', names: { fr: 'Punaise', en: 'Pin', es: 'Alfiler', de: 'Stecknadel', it: 'Puntina', 'pt-BR': 'Alfinete', ar: 'دَبُّوس' } },
];
