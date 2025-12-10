/**
 * Parser Markdown avec markdown-it
 * Utilise markdown-it + markdown-it-emoji pour un parsing robuste et performant
 *
 * FONCTIONNALITÉS:
 * - Parsing CommonMark complet via markdown-it
 * - Emojis via markdown-it-emoji (:smile:, :heart:, etc.)
 * - Retours à la ligne préservés (breaks: true)
 * - URLs auto-détectées (linkify: true)
 * - Sécurité: HTML désactivé par défaut
 * - Mentions colorées (/u/username)
 * - Liens externes avec target="_blank"
 */

import MarkdownIt from 'markdown-it';

// ============================================================================
// EMOJI MAP - Emojis populaires
// ============================================================================

const EMOJI_MAP: Record<string, string> = {
  // Smileys populaires
  smile: '😊', grin: '😁', joy: '😂', rofl: '🤣', wink: '😉',
  heart_eyes: '😍', kissing_heart: '😘', thinking: '🤔', neutral_face: '😐',
  unamused: '😒', roll_eyes: '🙄', relieved: '😌', cry: '😢', sob: '😭',
  scream: '😱', rage: '😡', angry: '😠', sunglasses: '😎',

  // Gestures
  thumbsup: '👍', thumbsdown: '👎', '+1': '👍', '-1': '👎',
  ok_hand: '👌', clap: '👏', pray: '🙏', muscle: '💪', wave: '👋',

  // Hearts
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', broken_heart: '💔',

  // Nature & Objects
  dog: '🐶', cat: '🐱', unicorn: '🦄', fire: '🔥', star: '⭐',
  sparkles: '✨', zap: '⚡', rocket: '🚀', tada: '🎉',
  phone: '📱', computer: '💻', email: '📧', check: '✅',
  x: '❌', warning: '⚠️', bulb: '💡', gift: '🎁',

  // Food
  pizza: '🍕', hamburger: '🍔', coffee: '☕', beer: '🍺',
  cake: '🍰', icecream: '🍦',
};

// ============================================================================
// CONFIGURATION MARKDOWN-IT
// ============================================================================

const md = new MarkdownIt({
  html: false,        // Désactiver HTML brut (sécurité)
  breaks: true,       // \n → <br> (important pour chat)
  linkify: true,      // Auto-détecter URLs
  typographer: true,  // Smart quotes, dashes
  quotes: '""\'\'',   // Guillemets
});

// Plugin emoji custom simple
md.core.ruler.after('inline', 'emoji', (state) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const blockToken = state.tokens[i];
    if (blockToken.type !== 'inline' || !blockToken.children) continue;

    for (let j = 0; j < blockToken.children.length; j++) {
      const token = blockToken.children[j];
      if (token.type !== 'text') continue;

      // Remplacer :emoji: par le caractère unicode
      token.content = token.content.replace(/:([a-z0-9_+-]+):/gi, (match, name) => {
        return EMOJI_MAP[name.toLowerCase()] || match;
      });
    }
  }
});

// ============================================================================
// CUSTOMISATION DES RENDERERS
// ============================================================================

/**
 * Custom renderer pour les liens
 * - Liens externes: target="_blank" rel="noopener noreferrer"
 * - Mentions (/u/username): classe spéciale, pas de target
 */
const defaultLinkOpenRender = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');

  if (hrefIndex >= 0) {
    const href = token.attrs![hrefIndex][1];
    const isMention = href.startsWith('/u/');

    if (isMention) {
      // Mention: classe purple, pas de target blank
      token.attrSet('class', 'text-purple-600 dark:text-purple-400 hover:underline font-medium');
    } else {
      // Lien externe: target blank + classes bleues
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
      token.attrSet('class', 'text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300');
    }
  }

  return defaultLinkOpenRender(tokens, idx, options, env, self);
};

/**
 * Custom renderer pour le code inline
 * Ajoute les classes Tailwind pour le style
 */
md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
  const token = tokens[idx];
  return `<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">${md.utils.escapeHtml(token.content)}</code>`;
};

/**
 * Custom renderer pour les code blocks
 * Ajoute les classes Tailwind pour le style (sans coloration syntaxique)
 */
md.renderer.rules.fence = function(tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = token.info ? md.utils.escapeHtml(token.info.trim()) : '';
  const langName = info ? info.split(/\s+/g)[0] : '';

  return `<div class="max-w-full overflow-x-auto my-2"><pre class="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-md text-sm font-mono overflow-x-auto"><code class="language-${langName}">${md.utils.escapeHtml(token.content)}</code></pre></div>\n`;
};

/**
 * Custom renderer pour les paragraphes
 * Ajoute whitespace-pre-wrap pour préserver les espaces
 */
md.renderer.rules.paragraph_open = function(tokens, idx, options, env, self) {
  return '<p class="my-2 leading-relaxed whitespace-pre-wrap">';
};

// ============================================================================
// CACHE LRU (Optionnel mais recommandé)
// ============================================================================

const MAX_CACHE_SIZE = 100;
const htmlCache = new Map<string, string>();

// ============================================================================
// API PUBLIQUE
// ============================================================================

/**
 * Convertit markdown en HTML avec cache
 */
export const markdownToHtml = (
  content: string,
  options: {
    onLinkClick?: (url: string) => void;
    isDark?: boolean;
  } = {}
): string => {
  if (!content || !content.trim()) {
    return '';
  }

  // Vérifier le cache
  const cacheKey = `${content}|${options.isDark ? 'dark' : 'light'}`;
  if (htmlCache.has(cacheKey)) {
    return htmlCache.get(cacheKey)!;
  }

  // Parser avec markdown-it
  const html = md.render(content);

  // Mettre en cache avec LRU
  if (htmlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = htmlCache.keys().next().value;
    if (firstKey !== undefined) {
      htmlCache.delete(firstKey);
    }
  }
  htmlCache.set(cacheKey, html);

  return html;
};

// ============================================================================
// COMPATIBILITÉ (parseMarkdown & renderMarkdownNode)
// ============================================================================

export interface MarkdownNode {
  type: 'paragraph' | 'code-block' | 'text' | 'heading' | 'list' | 'list-item' | 'blockquote';
  content?: string;
  children?: MarkdownNode[];
  language?: string;
  level?: number;
  ordered?: boolean;
}

/**
 * Parse markdown en AST simplifié (pour compatibilité)
 * Note: Utilise markdown-it en interne mais retourne structure simplifiée
 */
export const parseMarkdown = (content: string): MarkdownNode[] => {
  if (!content || !content.trim()) {
    return [];
  }

  // Pour la compatibilité, on retourne un seul node paragraphe
  // markdown-it gère tout en interne
  return [{
    type: 'paragraph',
    content: content
  }];
};

/**
 * Render un node markdown en HTML (pour compatibilité)
 */
export const renderMarkdownNode = (
  node: MarkdownNode,
  index: number,
  options: { isDark?: boolean } = {}
): string => {
  // Déléguer à markdownToHtml
  if (node.content) {
    return markdownToHtml(node.content, options);
  }
  return '';
};
