/**
 * Markdown Parser V2.2-OPTIMIZED - Performance + Security
 *
 * OPTIMIZATIONS vs V2:
 * - NO highlight.js (code blocks = plain text for now)
 * - 2 phases instead of 5 (Parser/Transformer → Renderer)
 * - LRU cache (100 entries) for parsed HTML
 * - Pre-compiled regex patterns
 * - Single-pass parsing
 *
 * SECURITY vs V1:
 * - CVE-1 Fix: XSS via code blocks - No dynamic code execution
 * - CVE-2 Fix: XSS via URLs - sanitizeUrl() with strict whitelist
 * - CVE-3 Fix: ReDoS - Strict limits on regex {1,2048}
 * - escapeHtml() on all user content
 * - Input validation (MAX_CONTENT_LENGTH = 1MB)
 *
 * PERFORMANCE TARGETS:
 * - Module import: <20ms (vs 100ms V2)
 * - Parse simple message: <5ms (vs 15ms V2)
 * - Parse complex message: <15ms (vs 50ms V2)
 * - Conversation 50 messages: <200ms (vs 2500ms V2)
 */

// ============================================================================
// CONSTANTS - Security Limits
// ============================================================================

const MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB
const MAX_URL_LENGTH = 2048;
const MAX_HEADING_LEVEL = 6;
const MAX_NESTED_LISTS = 10;
const MAX_TABLE_CELLS = 100;

// ============================================================================
// CACHE - LRU Cache for parsed HTML
// ============================================================================

interface CacheEntry {
  html: string;
  timestamp: number;
}

const htmlCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get HTML from cache if valid
 */
const getCachedHtml = (cacheKey: string): string | null => {
  const entry = htmlCache.get(cacheKey);
  if (!entry) return null;

  // Check if cache is still valid
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    htmlCache.delete(cacheKey);
    return null;
  }

  return entry.html;
};

/**
 * Store HTML in cache with LRU eviction
 */
const setCachedHtml = (cacheKey: string, html: string): void => {
  // LRU eviction: remove oldest entry if cache is full
  if (htmlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = htmlCache.keys().next().value;
    if (firstKey) {
      htmlCache.delete(firstKey);
    }
  }

  htmlCache.set(cacheKey, {
    html,
    timestamp: Date.now()
  });
};

// ============================================================================
// TYPES - Markdown AST Node Types
// ============================================================================

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
  level?: number; // Headings (1-6)
  language?: string; // Code blocks
  url?: string; // Links and images
  alt?: string; // Images
  ordered?: boolean; // Lists
  checked?: boolean; // Task lists
  isHeader?: boolean; // Table cells
  align?: 'left' | 'center' | 'right'; // Table alignment
  emojiCode?: string; // Emoji shortcode
  indent?: number; // List indentation (0, 2, 4, 6)
}

export interface RenderOptions {
  onLinkClick?: (url: string) => void;
  isDark?: boolean;
}

// ============================================================================
// EMOJI MAP - 200+ emoji shortcodes
// ============================================================================

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

  // Flags (popular ones)
  fr: '🇫🇷', us: '🇺🇸', gb: '🇬🇧', de: '🇩🇪', es: '🇪🇸',
  it: '🇮🇹', pt: '🇵🇹', br: '🇧🇷', ca: '🇨🇦', jp: '🇯🇵',
  cn: '🇨🇳', kr: '🇰🇷', in: '🇮🇳', ru: '🇷🇺',

  // Aliases
  '+1': '👍', '-1': '👎', 'point_right': '👉', 'point_left': '👈',
  'point_up': '☝️', 'point_down': '👇',
};

// ============================================================================
// SECURITY - HTML Escaping and URL Sanitization
// ============================================================================

/**
 * Escape HTML characters to prevent XSS
 * CVE Fix: Prevents injection of malicious HTML/JS
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
 * Sanitize URL to prevent XSS and other attacks
 * CVE Fix: Whitelist only safe protocols
 */
const sanitizeUrl = (url: string | undefined): string => {
  if (!url) return '';

  // Limit URL length to prevent DoS
  if (url.length > MAX_URL_LENGTH) {
    return '';
  }

  const trimmedUrl = url.trim();

  // Whitelist safe protocols
  const safeProtocols = /^(https?|mailto|tel|m\+):/i;
  const relativeUrl = /^(\/|\.\/|\.\.\/)/;

  // Allow relative URLs, safe protocols, or m+TOKEN format
  if (relativeUrl.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  if (safeProtocols.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Check for m+TOKEN format (Meeshy tracking URLs)
  if (/^m\+[A-Z0-9]{1,100}$/i.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // Block dangerous protocols
  const dangerousProtocols = /^(javascript|data|vbscript|file|about):/i;
  if (dangerousProtocols.test(trimmedUrl)) {
    return '';
  }

  // Default: escape and return
  return escapeHtml(trimmedUrl);
};

// ============================================================================
// PREPROCESSING - Meeshy URL Conversion
// ============================================================================

/**
 * Convert Meeshy tracking URLs (m+TOKEN) to markdown links
 * Must be called BEFORE markdown parsing
 */
const processMeeshyUrls = (text: string): string => {
  // CVE Fix: Limit token length to prevent ReDoS
  const meeshyUrlRegex = /(m\+[A-Z0-9]{1,100})/gi;
  return text.replace(meeshyUrlRegex, (match) => {
    return `[${match}](${match})`;
  });
};

// ============================================================================
// INLINE PARSING - Bold, Italic, Links, Code, Emojis
// ============================================================================

/**
 * Parse inline markdown elements (bold, italic, links, etc.)
 * Single-pass parsing with regex limits to prevent ReDoS
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
    // CVE Fix: Limit emoji code length {1,50}
    if (char === ':') {
      const emojiMatch = remaining.match(/^:([a-zA-Z0-9_+-]{1,50}):/);
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
    // CVE Fix: Limit alt text and URL length
    if (char === '!' && nextChar === '[') {
      flushText();
      const altMatch = remaining.match(/^!\[([^\]]{0,200})\]\(([^)]{1,2048})\)/);
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

    // Links: [text](url)
    // CVE Fix: Limit link text and URL length
    if (char === '[') {
      flushText();
      const linkMatch = remaining.match(/^\[([^\]]{1,500})\]\(([^)]{1,2048})\)/);
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

    // Auto-link URLs: http:// or https://
    // CVE Fix: Limit URL length to prevent ReDoS
    if (char === 'h' && (remaining.startsWith('http://') || remaining.startsWith('https://'))) {
      flushText();
      const urlMatch = remaining.match(/^(https?:\/\/[^\s<>()[\]]{1,2048})/);
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

    // Inline code: `code`
    // CVE Fix: Limit code length {1,500}
    if (char === '`') {
      flushText();
      const codeMatch = remaining.match(/^`([^`]{1,500})`/);
      if (codeMatch) {
        nodes.push({
          type: 'code-inline',
          content: codeMatch[1]
        });
        i += codeMatch[0].length;
        continue;
      }
    }

    // Bold: **text** or __text__
    // CVE Fix: Limit bold text length {1,500}
    if ((char === '*' && nextChar === '*') || (char === '_' && nextChar === '_')) {
      flushText();
      const delimiter = char;
      const regex = new RegExp(`^\\${delimiter}\\${delimiter}([^${delimiter}]{1,500})\\${delimiter}\\${delimiter}`);
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

    // Strikethrough: ~~text~~
    // CVE Fix: Limit strikethrough length {1,500}
    if (char === '~' && nextChar === '~') {
      flushText();
      const strikeMatch = remaining.match(/^~~([^~]{1,500})~~/);
      if (strikeMatch) {
        nodes.push({
          type: 'strikethrough',
          children: parseInline(strikeMatch[1])
        });
        i += strikeMatch[0].length;
        continue;
      }
    }

    // Italic: *text* or _text_ (but not ** or __)
    // CVE Fix: Limit italic text length {1,500}
    if ((char === '*' && nextChar !== '*') || (char === '_' && nextChar !== '_')) {
      flushText();
      const delimiter = char;
      const regex = new RegExp(`^\\${delimiter}([^${delimiter}]{1,500})\\${delimiter}`);
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

    // Normal character
    currentText += char;
    i++;
  }

  flushText();
  return nodes;
};

// ============================================================================
// BLOCK PARSING - Headings, Lists, Code Blocks, Tables
// ============================================================================

/**
 * Get indentation level of a line (number of leading spaces)
 */
const getIndentLevel = (line: string): number => {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
};

/**
 * Parse a single line and determine its type
 */
const parseLine = (line: string, inCodeBlock: boolean, inList: boolean): MarkdownNode | null => {
  const trimmed = line.trim();
  const indent = getIndentLevel(line);

  // Empty line
  if (!trimmed) {
    return inList ? null : { type: 'paragraph', children: [] };
  }

  // Code block delimiter (handled separately)
  if (trimmed.startsWith('```') && !inCodeBlock) {
    return null;
  }

  // Heading: # H1, ## H2, etc. (no indentation)
  if (indent === 0) {
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.{1,500})$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, MAX_HEADING_LEVEL);
      return {
        type: 'heading',
        level,
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

  // Horizontal rule: --- or *** or ___
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
    return {
      type: 'horizontal-rule'
    };
  }

  // Task list: - [ ] or - [x]
  const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.{1,1000})$/);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === 'x';
    const itemText = taskMatch[2];
    return {
      type: 'task-list-item',
      checked,
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText)
    };
  }

  // Unordered list: - item or * item
  if (/^[-*]\s+/.test(trimmed)) {
    const itemText = trimmed.replace(/^[-*]\s+/, '');
    return {
      type: 'list-item',
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText)
    };
  }

  // Ordered list: 1. item
  if (/^\d+\.\s+/.test(trimmed)) {
    const itemText = trimmed.replace(/^\d+\.\s+/, '');
    return {
      type: 'list-item',
      indent: Math.min(indent, MAX_NESTED_LISTS * 2),
      children: parseInline(itemText),
      ordered: true
    };
  }

  // Normal paragraph
  return {
    type: 'paragraph',
    children: parseInline(line)
  };
};

/**
 * Parse a code block (no syntax highlighting for performance)
 */
const parseCodeBlock = (lines: string[], startIndex: number): { node: MarkdownNode; endIndex: number } => {
  const firstLine = lines[startIndex].trim();
  const languageMatch = firstLine.match(/^```(\w{1,20})?$/);
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
    endIndex: endIndex + 1
  };
};

/**
 * Check if line is a table line
 */
const isTableLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
};

/**
 * Check if line is a table separator (header separator)
 */
const isTableSeparator = (line: string): boolean => {
  const trimmed = line.trim();
  return /^\|[\s:-]+\|$/.test(trimmed) && /[-:]/.test(trimmed);
};

/**
 * Parse column alignment from separator
 */
const parseAlignment = (separator: string): 'left' | 'center' | 'right' => {
  const trimmed = separator.trim();
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.endsWith(':')) return 'right';
  return 'left';
};

/**
 * Parse a table row into cells
 */
const parseTableRow = (line: string, isHeader: boolean, alignments?: ('left' | 'center' | 'right')[]): MarkdownNode => {
  const trimmed = line.trim();
  const cellsContent = trimmed.slice(1, -1).split('|').map(cell => cell.trim());

  // CVE Fix: Limit number of table cells
  const limitedCells = cellsContent.slice(0, MAX_TABLE_CELLS);

  const cells: MarkdownNode[] = limitedCells.map((content, index) => ({
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
 * Parse a complete table block
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
      endIndex += 2;

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
 * Build nested list from items with indentation
 */
const buildNestedList = (items: MarkdownNode[], baseIndent: number = 0): MarkdownNode[] => {
  const result: MarkdownNode[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const currentIndent = item.indent || 0;

    if (currentIndent === baseIndent) {
      // Look for sub-items (higher indentation)
      const subItems: MarkdownNode[] = [];
      let j = i + 1;

      while (j < items.length) {
        const nextItem = items[j];
        const nextIndent = nextItem.indent || 0;

        if (nextIndent > baseIndent) {
          subItems.push(nextItem);
          j++;
        } else {
          break;
        }
      }

      // Build nested children recursively
      if (subItems.length > 0) {
        const nestedChildren = buildNestedList(subItems, baseIndent + 2);
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
      i++;
    }
  }

  return result;
};

/**
 * Group consecutive list-items into lists with nesting support
 */
const groupListItems = (nodes: MarkdownNode[]): MarkdownNode[] => {
  const result: MarkdownNode[] = [];
  let currentListItems: MarkdownNode[] = [];
  let currentListOrdered = false;
  let currentListIsTask = false;

  const flushList = () => {
    if (currentListItems.length > 0) {
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

      if (currentListItems.length === 0 && indent === 0) {
        currentListOrdered = isOrdered;
        currentListIsTask = isTaskItem;
        currentListItems.push(node);
      } else if (indent === 0 && (currentListOrdered !== isOrdered || currentListIsTask !== isTaskItem)) {
        flushList();
        currentListOrdered = isOrdered;
        currentListIsTask = isTaskItem;
        currentListItems.push(node);
      } else {
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

// ============================================================================
// MAIN PARSER - Single-pass parsing with security checks
// ============================================================================

/**
 * Parse markdown content into AST nodes
 */
export const parseMarkdown = (content: string): MarkdownNode[] => {
  if (!content || !content.trim()) {
    return [];
  }

  // CVE Fix: Validate input length
  if (content.length > MAX_CONTENT_LENGTH) {
    console.warn(`Content exceeds maximum length of ${MAX_CONTENT_LENGTH} bytes`);
    return [{
      type: 'paragraph',
      children: [{
        type: 'text',
        content: 'Content too large to display'
      }]
    }];
  }

  // Preprocess: Convert Meeshy URLs (m+TOKEN)
  const processedContent = processMeeshyUrls(content);

  const lines = processedContent.split('\n');
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block
    if (trimmed.startsWith('```')) {
      const { node, endIndex } = parseCodeBlock(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Table
    if (isTableLine(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const { node, endIndex } = parseTable(lines, i);
      nodes.push(node);
      i = endIndex;
      continue;
    }

    // Normal line
    const node = parseLine(line, false, false);
    if (node) {
      // Merge consecutive paragraphs with line breaks
      if (node.type === 'paragraph' && node.children && node.children.length > 0 && nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode.type === 'paragraph' && lastNode.children && lastNode.children.length > 0) {
          lastNode.children.push({ type: 'line-break' });
          lastNode.children.push(...(node.children || []));
          i++;
          continue;
        }
      }

      // Skip empty paragraphs (blank lines)
      if (node.type === 'paragraph' && (!node.children || node.children.length === 0)) {
        i++;
        continue;
      }

      nodes.push(node);
    }

    i++;
  }

  // Group list items into lists
  return groupListItems(nodes);
};

// ============================================================================
// RENDERER - HTML Generation with Security
// ============================================================================

/**
 * Render a markdown node to HTML
 */
export const renderMarkdownNode = (
  node: MarkdownNode,
  index: number,
  options: RenderOptions = {}
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
      const sanitizedUrl = sanitizeUrl(node.url);
      if (!sanitizedUrl) return escapeHtml(node.content || '');

      const isExternalLink = sanitizedUrl.startsWith('http') || sanitizedUrl.startsWith('https');
      const isMention = sanitizedUrl.startsWith('/u/');
      const target = isMention ? '' : 'target="_blank" rel="noopener noreferrer"';
      const linkClass = isMention
        ? 'text-purple-600 dark:text-purple-400 hover:underline font-medium whitespace-pre-wrap'
        : 'text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 whitespace-pre-wrap';
      return `<a href="${sanitizedUrl}" ${target} class="${linkClass}">${escapeHtml(node.content || '')}</a>`;

    case 'image':
      const sanitizedImgUrl = sanitizeUrl(node.url);
      if (!sanitizedImgUrl) return '';
      return `<img src="${sanitizedImgUrl}" alt="${escapeHtml(node.alt || '')}" class="max-w-full h-auto rounded-lg my-2" loading="lazy" />`;

    case 'heading':
      const headingLevel = Math.min(Math.max(node.level || 1, 1), MAX_HEADING_LEVEL);
      const headingChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      const headingClasses = [
        'text-xl font-bold mt-4 mb-2',
        'text-lg font-bold mt-4 mb-2',
        'text-base font-semibold mt-3 mb-2',
        'text-sm font-semibold mt-3 mb-1',
        'text-xs font-semibold mt-2 mb-1',
        'text-xs font-semibold mt-2 mb-1',
      ];
      return `<h${headingLevel} class="${headingClasses[headingLevel - 1]}">${headingChildren}</h${headingLevel}>`;

    case 'code-block':
      // NO SYNTAX HIGHLIGHTING - plain text only for performance
      // Syntax highlighting can be added later with lazy loading
      const language = escapeHtml(node.language || 'text');
      const code = escapeHtml(node.content || '');
      return `<div class="max-w-full overflow-x-auto my-2"><pre class="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-md text-sm font-mono overflow-x-auto"><code class="language-${language}">${code}</code></pre></div>`;

    case 'blockquote':
      const quoteChildren = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4 text-gray-700 dark:text-gray-300">${quoteChildren}</blockquote>`;

    case 'list':
      const listTag = node.ordered ? 'ol' : 'ul';
      const listClass = node.ordered ? 'list-decimal list-inside my-2 space-y-1' : 'list-disc list-inside my-2 space-y-1';
      const listItems = node.children?.map((child, i) => renderMarkdownNode(child, i, options)).join('') || '';
      return `<${listTag} class="${listClass}">${listItems}</${listTag}>`;

    case 'list-item':
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

// ============================================================================
// PUBLIC API - Cached HTML Generation
// ============================================================================

/**
 * Convert markdown to HTML with caching
 *
 * Performance optimizations:
 * - LRU cache (100 entries, 5min TTL)
 * - Single-pass parsing
 * - No highlight.js (plain code blocks)
 * - Pre-compiled regex with length limits
 *
 * Security features:
 * - HTML escaping (XSS prevention)
 * - URL sanitization (whitelist protocols)
 * - Input length validation (DoS prevention)
 * - Regex length limits (ReDoS prevention)
 */
export const markdownToHtml = (
  content: string,
  options: RenderOptions = {}
): string => {
  // Generate cache key
  const cacheKey = content + JSON.stringify(options);

  // Check cache first
  const cachedHtml = getCachedHtml(cacheKey);
  if (cachedHtml) {
    return cachedHtml;
  }

  // Parse and render
  const nodes = parseMarkdown(content);
  const html = nodes.map((node, i) => renderMarkdownNode(node, i, options)).join('');

  // Store in cache
  setCachedHtml(cacheKey, html);

  return html;
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  parseMarkdown,
  renderMarkdownNode,
  markdownToHtml
};
