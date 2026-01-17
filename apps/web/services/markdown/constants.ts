/**
 * Markdown Parser Constants
 * - Security limits
 * - Regex patterns
 * - Emoji mappings
 */

// ============================================================================
// SECURITY LIMITS
// ============================================================================

export const MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB
export const MAX_URL_LENGTH = 2048;
export const MAX_HEADING_LEVEL = 6;
export const MAX_NESTED_LISTS = 10;
export const MAX_TABLE_CELLS = 100;

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export const MAX_CACHE_SIZE = 100;
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// REGEX PATTERNS - Pre-compiled for performance
// ============================================================================

export const PATTERNS = {
  // Emoji
  emoji: /^:([a-zA-Z0-9_+-]{1,50}):/,

  // Images
  image: /^!\[([^\]]{0,200})\]\(([^)]{1,2048})\)/,

  // Links
  link: /^\[([^\]]{1,500})\]\(([^)]{1,2048})\)/,

  // Auto-link URLs
  autoUrl: /^(https?:\/\/[^\s<>()[\]]{1,2048})/,

  // Inline code
  inlineCode: /^`([^`]{1,500})`/,

  // Bold (** or __)
  boldStar: /^\*\*([^*]{1,500})\*\*/,
  boldUnderscore: /^__([^_]{1,500})__/,

  // Strikethrough
  strikethrough: /^~~([^~]{1,500})~~/,

  // Italic (* or _)
  italicStar: /^\*([^*]{1,500})\*/,
  italicUnderscore: /^_([^_]{1,500})_/,

  // Block elements
  heading: /^(#{1,6})\s+(.{1,500})$/,
  taskList: /^[-*]\s+\[([ xX])\]\s+(.{1,1000})$/,
  unorderedList: /^[-*]\s+/,
  orderedList: /^\d+\.\s+/,
  blockquote: /^>\s*/,
  horizontalRule: /^(-{3,}|\*{3,}|_{3,})$/,
  codeBlock: /^```(\w{1,20})?$/,

  // Table
  tableLine: /^\|.+\|$/,
  tableSeparator: /^\|[\s:-]+\|$/,

  // URL protocols
  meeshyUrl: /(m\+[A-Z0-9]{1,100})/gi,
  safeProtocols: /^(https?|mailto|tel|m\+):/i,
  relativeUrl: /^(\/|\.\/|\.\.\/)/,
  dangerousProtocols: /^(javascript|data|vbscript|file|about):/i,
  meeshyToken: /^m\+[A-Z0-9]{1,100}$/i,
};

// ============================================================================
// EMOJI MAP - 200+ emoji shortcodes
// ============================================================================

export const EMOJI_MAP: Record<string, string> = {
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
