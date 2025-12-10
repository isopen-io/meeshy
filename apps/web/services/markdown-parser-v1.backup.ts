/**
 * Service de parsing markdown léger et maîtrisé
 * Supporte les fonctionnalités de base sans dépendances externes lourdes
 */

import hljs from 'highlight.js/lib/core';
// Import des langages les plus courants pour réduire la taille du bundle
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

export interface MarkdownNode {
  type:
    | 'paragraph'
    | 'heading'
    | 'code-block'
    | 'blockquote'
    | 'list'
    | 'list-item'
    | 'horizontal-rule'
    | 'line-break'
    | 'text'
    | 'bold'
    | 'italic'
    | 'strikethrough'
    | 'code-inline'
    | 'link'
    | 'image'
    | 'table'
    | 'table-row'
    | 'table-cell'
    | 'task-list-item'
    | 'emoji';
  content?: string;
  children?: MarkdownNode[];
  level?: number; // Pour les headings (1-6)
  language?: string; // Pour les code blocks
  url?: string; // Pour les liens et images
  alt?: string; // Pour les images
  ordered?: boolean; // Pour les listes
  checked?: boolean; // Pour les task lists
  isHeader?: boolean; // Pour les cellules de table header
  align?: 'left' | 'center' | 'right'; // Pour l'alignement des cellules
  emojiCode?: string; // Pour les emojis (:smile:)
  indent?: number; // Pour l'indentation des listes (0, 2, 4, 6, etc.)
}

/**
 * Map des emoji shortcodes vers leurs caractères Unicode
 */
const EMOJI_MAP: Record<string, string> = {
  // Smileys & Emotion
  smile: '😊', grin: '😁', joy: '😂', rofl: '🤣', relaxed: '☺️',
  blush: '😊', innocent: '😇', wink: '😉', heart_eyes: '😍',
  kissing_heart: '😘', kissing: '😗', yum: '😋', stuck_out_tongue: '😛',
  stuck_out_tongue_winking_eye: '😜', zany_face: '🤪', thinking: '🤔',
  neutral_face: '😐', expressionless: '😑', no_mouth: '😶', smirk: '😏',
  unamused: '😒', roll_eyes: '🙄', grimacing: '😬', lying_face: '🤥',
  relieved: '😌', pensive: '😔', sleepy: '😪', drooling_face: '🤤',
  sleeping: '😴', mask: '😷', face_with_thermometer: '🤒', dizzy_face: '😵',
  rage: '😡', angry: '😠', triumph: '😤', cry: '😢', sob: '😭',
  scream: '😱', confounded: '😖', persevere: '😣', disappointed: '😞',
  sweat: '😓', weary: '😩', tired_face: '😫', yawning_face: '🥱',
  sunglasses: '😎', nerd_face: '🤓', face_with_monocle: '🧐',

  // Gestures & Body Parts
  thumbsup: '👍', thumbsdown: '👎', ok_hand: '👌', punch: '👊',
  fist: '✊', v: '✌️', wave: '👋', raised_hand: '✋', vulcan_salute: '🖖',
  clap: '👏', pray: '🙏', handshake: '🤝', muscle: '💪',

  // Hearts & Love
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', brown_heart: '🤎',
  white_heart: '🤍', broken_heart: '💔', heart_exclamation: '❣️',
  two_hearts: '💕', sparkling_heart: '💖', heartpulse: '💗',
  heartbeat: '💓', revolving_hearts: '💞', cupid: '💘',

  // Nature & Animals
  dog: '🐶', cat: '🐱', mouse: '🐭', rabbit: '🐰', fox: '🦊',
  bear: '🐻', panda_face: '🐼', tiger: '🐯', lion: '🦁', cow: '🐮',
  pig: '🐷', monkey: '🐵', chicken: '🐔', penguin: '🐧', bird: '🐦',
  unicorn: '🦄', horse: '🐴', bee: '🐝', bug: '🐛', butterfly: '🦋',
  tree: '🌳', seedling: '🌱', palm_tree: '🌴', cactus: '🌵',
  tulip: '🌷', rose: '🌹', hibiscus: '🌺', sunflower: '🌻',

  // Food & Drink
  apple: '🍎', banana: '🍌', grapes: '🍇', watermelon: '🍉',
  orange: '🍊', lemon: '🍋', peach: '🍑', cherries: '🍒',
  strawberry: '🍓', kiwi: '🥝', tomato: '🍅', avocado: '🥑',
  eggplant: '🍆', potato: '🥔', carrot: '🥕', corn: '🌽',
  pizza: '🍕', hamburger: '🍔', hotdog: '🌭', taco: '🌮',
  burrito: '🌯', sushi: '🍣', ramen: '🍜', curry: '🍛',
  rice: '🍚', bento: '🍱', bread: '🍞', croissant: '🥐',
  cake: '🍰', birthday: '🎂', cookie: '🍪', chocolate_bar: '🍫',
  candy: '🍬', lollipop: '🍭', doughnut: '🍩', icecream: '🍦',
  coffee: '☕', tea: '🍵', wine_glass: '🍷', beer: '🍺',

  // Activities & Sports
  soccer: '⚽', basketball: '🏀', football: '🏈', baseball: '⚾',
  tennis: '🎾', volleyball: '🏐', rugby_football: '🏉', '8ball': '🎱',
  golf: '⛳', medal: '🏅', trophy: '🏆', dart: '🎯',

  // Travel & Places
  rocket: '🚀', airplane: '✈️', car: '🚗', taxi: '🚕', bus: '🚌',
  train: '🚆', ship: '🚢', anchor: '⚓', bike: '🚴',
  house: '🏠', office: '🏢', hospital: '🏥', bank: '🏦',
  hotel: '🏨', church: '⛪', mountain: '⛰️', beach: '🏖️',

  // Objects
  phone: '📱', computer: '💻', keyboard: '⌨️', email: '📧',
  envelope: '✉️', pencil: '✏️', pen: '🖊️', book: '📖',
  books: '📚', bulb: '💡', fire: '🔥', bomb: '💣',
  gun: '🔫', wrench: '🔧', hammer: '🔨', key: '🔑',
  lock: '🔒', unlock: '🔓', bell: '🔔', gift: '🎁',
  balloon: '🎈', tada: '🎉', confetti_ball: '🎊',

  // Symbols
  check: '✅', x: '❌', warning: '⚠️', bangbang: '‼️',
  question: '❓', grey_question: '❔', exclamation: '❗',
  star: '⭐', sparkles: '✨', zap: '⚡', boom: '💥',
  zzz: '💤', dash: '💨', arrow_right: '➡️', arrow_left: '⬅️',
  arrow_up: '⬆️', arrow_down: '⬇️', recycle: '♻️',
  white_check_mark: '✅', heavy_check_mark: '✔️',

  // Flags (quelques populaires)
  fr: '🇫🇷', us: '🇺🇸', gb: '🇬🇧', de: '🇩🇪', es: '🇪🇸',
  it: '🇮🇹', pt: '🇵🇹', br: '🇧🇷', ca: '🇨🇦', jp: '🇯🇵',
  cn: '🇨🇳', kr: '🇰🇷', in: '🇮🇳', ru: '🇷🇺',

  // Autres
  '+1': '👍', '-1': '👎', 'point_right': '👉', 'point_left': '👈',
  'point_up': '☝️', 'point_down': '👇',
};

/**
 * Échappe les caractères HTML pour éviter les injections XSS
 */
const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => map[char]);
};

/**
 * Traite les URLs de tracking Meeshy (m+TOKEN) en les convertissant en liens cliquables
 * Cette fonction doit être appelée AVANT le parsing markdown
 */
const processMeeshyUrls = (text: string): string => {
  // Regex pour détecter les liens de tracking Meeshy: m+TOKEN
  const meeshyUrlRegex = /(m\+[A-Z0-9]+)/g;
  return text.replace(meeshyUrlRegex, (match) => {
    return `[${match}](${match})`;
  });
};

/**
 * Parse les éléments inline (gras, italique, liens, etc.)
 */
const parseInline = (text: string): MarkdownNode[] => {
  const nodes: MarkdownNode[] = [];
  let currentText = '';
  let i = 0;

  const flushText = () => {
    if (currentText) {
      nodes.push({ type: 'text', content: currentText });
      currentText = '';
    }
  };

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];
    const remaining = text.slice(i);

    // Emojis: :emoji_code:
    if (char === ':') {
      const emojiMatch = remaining.match(/^:([a-zA-Z0-9_+-]+):/);
      if (emojiMatch) {
        const emojiCode = emojiMatch[1];
        if (EMOJI_MAP[emojiCode]) {
          flushText();
          nodes.push({
            type: 'emoji',
            emojiCode,
            content: EMOJI_MAP[emojiCode]
          });
          i += emojiMatch[0].length;
          continue;
        }
      }
    }

    // Images: ![alt](url)
    if (char === '!' && nextChar === '[') {
      flushText();
      const altMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (altMatch) {
        nodes.push({
          type: 'image',
          alt: altMatch[1],
          url: altMatch[2]
        });
        i += altMatch[0].length;
        continue;
      }
    }

    // Liens: [text](url)
    if (char === '[') {
      flushText();
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        nodes.push({
          type: 'link',
          content: linkMatch[1],
          url: linkMatch[2]
        });
        i += linkMatch[0].length;
        continue;
      }
    }

    // URLs automatiques: http:// ou https:// (après les liens markdown pour ne pas interférer)
    if (char === 'h' && (remaining.startsWith('http://') || remaining.startsWith('https://'))) {
      flushText();
      // Détecter l'URL complète (jusqu'au premier espace, retour à ligne, ou caractères spéciaux)
      const urlMatch = remaining.match(/^(https?:\/\/[^\s<>()[\]]+)/);
      if (urlMatch) {
        const url = urlMatch[1];
        nodes.push({
          type: 'link',
          content: url,
          url: url
        });
        i += url.length;
        continue;
      }
    }

    // Code inline: `code`
    if (char === '`') {
      flushText();
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        nodes.push({
          type: 'code-inline',
          content: codeMatch[1]
        });
        i += codeMatch[0].length;
        continue;
      }
    }

    // Gras: **text** ou __text__
    if ((char === '*' && nextChar === '*') || (char === '_' && nextChar === '_')) {
      flushText();
      const delimiter = char + nextChar;
      const regex = new RegExp(`^\\${char}\\${char}([^${char}]+)\\${char}\\${char}`);
      const boldMatch = remaining.match(regex);
      if (boldMatch) {
        nodes.push({
          type: 'bold',
          children: parseInline(boldMatch[1])
        });
        i += boldMatch[0].length;
        continue;
      }
    }

    // Barré: ~~text~~
    if (char === '~' && nextChar === '~') {
      flushText();
      const strikeMatch = remaining.match(/^~~([^~]+)~~/);
      if (strikeMatch) {
        nodes.push({
          type: 'strikethrough',
          children: parseInline(strikeMatch[1])
        });
        i += strikeMatch[0].length;
        continue;
      }
    }

    // Italique: *text* ou _text_ (mais pas ** ou __)
    if ((char === '*' && nextChar !== '*') || (char === '_' && nextChar !== '_')) {
      flushText();
      const regex = new RegExp(`^\\${char}([^${char}]+)\\${char}`);
      const italicMatch = remaining.match(regex);
      if (italicMatch) {
        nodes.push({
          type: 'italic',
          children: parseInline(italicMatch[1])
        });
        i += italicMatch[0].length;
        continue;
      }
    }

    // Caractère normal
    currentText += char;
    i++;
  }

  flushText();
  return nodes;
};

/**
 * Détecte le niveau d'indentation d'une ligne (nombre d'espaces au début)
 */
const getIndentLevel = (line: string): number => {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
};

/**
 * Parse une ligne et détermine son type
 */
const parseLine = (line: string, inCodeBlock: boolean, inList: boolean): MarkdownNode | null => {
  const trimmed = line.trim();
  const indent = getIndentLevel(line);

  // Ligne vide
  if (!trimmed) {
    return inList ? null : { type: 'paragraph', children: [] };
  }

  // Bloc de code (ne pas parser si on est déjà dans un bloc)
  if (trimmed.startsWith('```') && !inCodeBlock) {
    return null; // Sera géré par parseCodeBlock
  }

  // Heading: # H1, ## H2, etc. (pas d'indentation pour les headings)
  if (indent === 0) {
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      return {
        type: 'heading',
        level: headingMatch[1].length,
        children: parseInline(headingMatch[2])
      };
    }
  }

  // Blockquote: > text
  if (trimmed.startsWith('>')) {
    const quoteText = trimmed.slice(1).trim();
    return {
      type: 'blockquote',
      children: parseInline(quoteText)
    };
  }

  // Horizontal rule: --- ou *** ou ___
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
    return {
      type: 'horizontal-rule'
    };
  }

  // Task list: - [ ] ou - [x]
  const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === 'x';
    const itemText = taskMatch[2];
    return {
      type: 'task-list-item',
      checked,
      indent,
      children: parseInline(itemText)
    };
  }

  // Liste non ordonnée: - item ou * item
  if (/^[-*]\s+/.test(trimmed)) {
    const itemText = trimmed.replace(/^[-*]\s+/, '');
    return {
      type: 'list-item',
      indent,
      children: parseInline(itemText)
    };
  }

  // Liste ordonnée: 1. item
  if (/^\d+\.\s+/.test(trimmed)) {
    const itemText = trimmed.replace(/^\d+\.\s+/, '');
    return {
      type: 'list-item',
      indent,
      children: parseInline(itemText),
      ordered: true
    };
  }

  // Paragraphe normal
  return {
    type: 'paragraph',
    children: parseInline(line) // Garder les espaces de début pour l'indentation
  };
};

/**
 * Parse un bloc de code
 */
const parseCodeBlock = (lines: string[], startIndex: number): { node: MarkdownNode; endIndex: number } => {
  const firstLine = lines[startIndex].trim();
  const languageMatch = firstLine.match(/^```(\w+)?$/);
  const language = languageMatch ? languageMatch[1] || 'text' : 'text';

  let endIndex = startIndex + 1;
  const codeLines: string[] = [];

  while (endIndex < lines.length && !lines[endIndex].trim().startsWith('```')) {
    codeLines.push(lines[endIndex]);
    endIndex++;
  }

  return {
    node: {
      type: 'code-block',
      content: codeLines.join('\n'),
      language
    },
    endIndex: endIndex + 1 // Skip the closing ```
  };
};

/**
 * Détecte si une ligne est une ligne de table markdown
 */
const isTableLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
};

/**
 * Détecte si une ligne est un séparateur de table (header separator)
 */
const isTableSeparator = (line: string): boolean => {
  const trimmed = line.trim();
  return /^\|[\s:-]+\|$/.test(trimmed) && /[-:]/.test(trimmed);
};

/**
 * Parse l'alignement d'une colonne depuis le séparateur
 */
const parseAlignment = (separator: string): 'left' | 'center' | 'right' => {
  const trimmed = separator.trim();
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.endsWith(':')) return 'right';
  return 'left';
};

/**
 * Parse une ligne de table en cellules
 */
const parseTableRow = (line: string, isHeader: boolean, alignments?: ('left' | 'center' | 'right')[]): MarkdownNode => {
  const trimmed = line.trim();
  const cellsContent = trimmed.slice(1, -1).split('|').map(cell => cell.trim());

  const cells: MarkdownNode[] = cellsContent.map((content, index) => ({
    type: 'table-cell',
    isHeader,
    align: alignments ? alignments[index] : 'left',
    children: parseInline(content)
  }));

  return {
    type: 'table-row',
    children: cells
  };
};

/**
 * Parse un bloc de table complet
 */
const parseTable = (lines: string[], startIndex: number): { node: MarkdownNode; endIndex: number } => {
  const rows: MarkdownNode[] = [];
  let endIndex = startIndex;
  let alignments: ('left' | 'center' | 'right')[] = [];

  // Parse header row
  if (isTableLine(lines[startIndex])) {
    // Check if next line is separator
    if (endIndex + 1 < lines.length && isTableSeparator(lines[endIndex + 1])) {
      const separatorLine = lines[endIndex + 1].trim();
      const separators = separatorLine.slice(1, -1).split('|').map(s => s.trim());
      alignments = separators.map(parseAlignment);

      // Parse header row
      rows.push(parseTableRow(lines[startIndex], true, alignments));
      endIndex += 2; // Skip header and separator

      // Parse body rows
      while (endIndex < lines.length && isTableLine(lines[endIndex])) {
        rows.push(parseTableRow(lines[endIndex], false, alignments));
        endIndex++;
      }
    }
  }

  return {
    node: {
      type: 'table',
      children: rows
    },
    endIndex
  };
};

/**
 * Construit une liste imbriquée à partir d'items avec indentation
 */
const buildNestedList = (items: MarkdownNode[], baseIndent: number = 0): MarkdownNode[] => {
  const result: MarkdownNode[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const currentIndent = item.indent || 0;

    // Si l'item est au niveau de base
    if (currentIndent === baseIndent) {
      // Chercher les sous-items (indentation supérieure)
      const subItems: MarkdownNode[] = [];
      let j = i + 1;

      while (j < items.length) {
        const nextItem = items[j];
        const nextIndent = nextItem.indent || 0;

        // Si l'indentation est supérieure, c'est un sous-item
        if (nextIndent > baseIndent) {
          subItems.push(nextItem);
          j++;
        } else {
          // Sinon, on arrête de chercher les sous-items
          break;
        }
      }

      // Si on a des sous-items, les construire récursivement
      if (subItems.length > 0) {
        const nestedChildren = buildNestedList(subItems, baseIndent + 2);

        // Créer une copie de l'item avec les enfants imbriqués
        const itemWithNested = {
          ...item,
          children: [
            ...(item.children || []),
            ...nestedChildren
          ]
        };
        result.push(itemWithNested);
        i = j;
      } else {
        result.push(item);
        i++;
      }
    } else {
      // Ne devrait pas arriver normalement
      i++;
    }
  }

  return result;
};

/**
 * Groupe les list-items et task-list-items consécutifs en listes avec support de l'imbrication
 */
const groupListItems = (nodes: MarkdownNode[]): MarkdownNode[] => {
  const result: MarkdownNode[] = [];
  let currentListItems: MarkdownNode[] = [];
  let currentListOrdered = false;
  let currentListIsTask = false;

  const flushList = () => {
    if (currentListItems.length > 0) {
      // Construire la liste imbriquée
      const nestedItems = buildNestedList(currentListItems, 0);

      result.push({
        type: 'list',
        ordered: currentListOrdered,
        children: nestedItems
      });
      currentListItems = [];
    }
  };

  for (const node of nodes) {
    if (node.type === 'list-item' || node.type === 'task-list-item') {
      const isTaskItem = node.type === 'task-list-item';
      const isOrdered = node.ordered || false;
      const indent = node.indent || 0;

      // Si c'est le premier item de la liste (niveau 0)
      if (currentListItems.length === 0 && indent === 0) {
        currentListOrdered = isOrdered;
        currentListIsTask = isTaskItem;
        currentListItems.push(node);
      }
      // Si c'est un item au niveau 0 mais le type change
      else if (indent === 0 && (currentListOrdered !== isOrdered || currentListIsTask !== isTaskItem)) {
        flushList();
        currentListOrdered = isOrdered;
        currentListIsTask = isTaskItem;
        currentListItems.push(node);
      }
      // Sinon, ajouter l'item (même s'il est indenté, il sera traité par buildNestedList)
      else {
        currentListItems.push(node);
      }
    } else {
      flushList();
      result.push(node);
    }
  }

  flushList();
  return result;
};

/**
 * Parse le contenu markdown complet
 */
export const parseMarkdown = (content: string): MarkdownNode[] => {
  if (!content || !content.trim()) {
    return [];
  }

  // Première passe: traiter les URLs Meeshy (m+TOKEN)
  const processedContent = processMeeshyUrls(content);

  const lines = processedContent.split('\n');
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Bloc de code
    if (trimmed.startsWith('```')) {
      const { node, endIndex } = parseCodeBlock(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Table markdown
    if (isTableLine(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const { node, endIndex } = parseTable(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Parse la ligne normale
    const node = parseLine(line, false, false);
    if (node) {
      // Fusionner les paragraphes consécutifs SEULEMENT s'ils ont du contenu
      // Les paragraphes vides (lignes vides) doivent créer une séparation
      if (node.type === 'paragraph' && node.children && node.children.length > 0 && nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        // Ne fusionner que si le dernier node est un paragraphe avec contenu
        if (lastNode.type === 'paragraph' && lastNode.children && lastNode.children.length > 0) {
          // Ajouter un retour à la ligne simple entre les lignes
          lastNode.children.push({ type: 'line-break' });
          lastNode.children.push(...(node.children || []));
          i++;
          continue;
        }
      }
      // Ne pas ajouter les paragraphes vides (lignes vides)
      if (node.type === 'paragraph' && (!node.children || node.children.length === 0)) {
        // Ligne vide détectée - ne rien ajouter, cela séparera les paragraphes
        i++;
        continue;
      }
      nodes.push(node);
    }

    i++;
  }

  // Grouper les list-items en listes
  return groupListItems(nodes);
};

/**
 * Rend un node markdown en HTML
 */
export const renderMarkdownNode = (
  node: MarkdownNode,
  index: number,
  options: {
    onLinkClick?: (url: string) => void;
    isDark?: boolean;
  } = {}
): string => {
  const { onLinkClick, isDark } = options;

  switch (node.type) {
    case 'text':
      return escapeHtml(node.content || '');

    case 'bold':
      const boldChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<strong class="whitespace-pre-wrap">${boldChildren}</strong>`;

    case 'italic':
      const italicChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<em class="whitespace-pre-wrap">${italicChildren}</em>`;

    case 'strikethrough':
      const strikeChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<del class="whitespace-pre-wrap">${strikeChildren}</del>`;

    case 'code-inline':
      return `<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono break-all whitespace-pre-wrap">${escapeHtml(node.content || '')}</code>`;

    case 'link':
      const isExternalLink = node.url?.startsWith('http') || node.url?.startsWith('https');
      const isMention = node.url?.startsWith('/u/');
      const target = isMention ? '' : 'target="_blank" rel="noopener noreferrer"';
      const linkClass = isMention
        ? 'text-purple-600 dark:text-purple-400 hover:underline font-medium whitespace-pre-wrap'
        : 'text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 whitespace-pre-wrap';
      return `<a href="${escapeHtml(node.url || '')}" ${target} class="${linkClass}">${escapeHtml(node.content || '')}</a>`;

    case 'image':
      return `<img src="${escapeHtml(node.url || '')}" alt="${escapeHtml(node.alt || '')}" class="max-w-full h-auto rounded-lg my-2" loading="lazy" />`;

    case 'heading':
      const headingLevel = Math.min(Math.max(node.level || 1, 1), 6);
      const headingChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      const headingClasses = [
        'text-xl font-bold mt-4 mb-2', // h1 - 20px (réduit de 40% depuis 36px)
        'text-lg font-bold mt-4 mb-2', // h2 - 18px (réduit de 40% depuis 30px)
        'text-base font-semibold mt-3 mb-2', // h3 - 16px (réduit de 33% depuis 24px)
        'text-sm font-semibold mt-3 mb-1', // h4 - 14px (réduit de 30% depuis 20px)
        'text-xs font-semibold mt-2 mb-1', // h5 - 12px (réduit de 33% depuis 18px)
        'text-xs font-semibold mt-2 mb-1', // h6 - 12px (réduit de 25% depuis 16px)
      ];
      return `<h${headingLevel} class="${headingClasses[headingLevel - 1]}">${headingChildren}</h${headingLevel}>`;

    case 'code-block':
      const language = node.language || 'text';
      const rawCode = node.content || '';

      // Appliquer la coloration syntaxique si le langage est supporté
      let highlightedCode: string;
      try {
        if (language !== 'text' && hljs.getLanguage(language)) {
          const result = hljs.highlight(rawCode, { language });
          highlightedCode = result.value;
        } else {
          // Auto-detect language if not specified or not supported
          const result = hljs.highlightAuto(rawCode);
          highlightedCode = result.value;
        }
      } catch (error) {
        // Fallback to escaped HTML if highlighting fails
        highlightedCode = escapeHtml(rawCode);
      }

      return `<div class="max-w-full overflow-x-auto my-2"><pre class="hljs bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-md text-sm font-mono overflow-x-auto"><code class="language-${escapeHtml(language)}">${highlightedCode}</code></pre></div>`;

    case 'blockquote':
      const quoteChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4 text-gray-700 dark:text-gray-300">${quoteChildren}</blockquote>`;

    case 'list':
      const listTag = node.ordered ? 'ol' : 'ul';
      const listClass = node.ordered ? 'list-decimal list-inside my-2 space-y-1' : 'list-disc list-inside my-2 space-y-1';
      const listItems = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<${listTag} class="${listClass}">${listItems}</${listTag}>`;

    case 'list-item':
      // Séparer les enfants inline des sous-listes
      const inlineChildren: MarkdownNode[] = [];
      const subLists: MarkdownNode[] = [];

      for (const child of node.children || []) {
        if (child.type === 'list') {
          subLists.push(child);
        } else {
          inlineChildren.push(child);
        }
      }

      const itemInlineContent = inlineChildren.map((child, i) => renderMarkdownNode(child, i, options)).join('');
      const itemSubLists = subLists.map((child, i) => renderMarkdownNode(child, i, options)).join('');

      return `<li>${itemInlineContent}${itemSubLists}</li>`;

    case 'paragraph':
      const paraChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<p class="my-2 leading-relaxed whitespace-pre-wrap">${paraChildren}</p>`;

    case 'horizontal-rule':
      return '<hr class="my-4 border-gray-300 dark:border-gray-600" />';

    case 'line-break':
      return '<br />';

    case 'emoji':
      return node.content || '';

    case 'table':
      const tableChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<div class="overflow-x-auto my-4"><table class="min-w-full border border-gray-300 dark:border-gray-600">${tableChildren}</table></div>`;

    case 'table-row':
      const rowChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<tr class="border-b border-gray-300 dark:border-gray-600">${rowChildren}</tr>`;

    case 'table-cell':
      const cellTag = node.isHeader ? 'th' : 'td';
      const cellChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      const cellClass = node.isHeader
        ? 'px-4 py-2 bg-gray-100 dark:bg-gray-800 font-semibold text-left border border-gray-300 dark:border-gray-600'
        : 'px-4 py-2 border border-gray-300 dark:border-gray-600';
      const alignStyle = node.align ? `text-${node.align}` : '';
      return `<${cellTag} class="${cellClass} ${alignStyle}">${cellChildren}</${cellTag}>`;

    case 'task-list-item':
      // Séparer les enfants inline des sous-listes pour les task items
      const taskInlineChildren: MarkdownNode[] = [];
      const taskSubLists: MarkdownNode[] = [];

      for (const child of node.children || []) {
        if (child.type === 'list') {
          taskSubLists.push(child);
        } else {
          taskInlineChildren.push(child);
        }
      }

      const taskInlineContent = taskInlineChildren.map((child, i) => renderMarkdownNode(child, i, options)).join('');
      const taskSubListsContent = taskSubLists.map((child, i) => renderMarkdownNode(child, i, options)).join('');
      const checked = node.checked ? 'checked' : '';

      return `<li class="flex items-start gap-2"><input type="checkbox" ${checked} disabled class="mt-1" /><span>${taskInlineContent}</span>${taskSubListsContent}</li>`;

    default:
      return '';
  }
};

/**
 * Convertit le markdown en HTML
 */
export const markdownToHtml = (
  content: string,
  options: {
    onLinkClick?: (url: string) => void;
    isDark?: boolean;
  } = {}
): string => {
  const nodes = parseMarkdown(content);
  return nodes.map((node, i) => renderMarkdownNode(node, i, options)).join('');
};
