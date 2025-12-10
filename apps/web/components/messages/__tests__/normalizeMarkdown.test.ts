/**
 * Tests pour la fonction normalizeMarkdown
 * Vérifie la préservation des retours chariot Windows/Linux
 */

// Import de la fonction à tester (vous devrez l'exporter depuis MarkdownMessage.tsx)
// Pour ce test, nous allons recréer la fonction localement

const normalizeMarkdown = (content: string): string => {
  let normalized = content;

  // ÉTAPE 1: Normaliser les retours chariot Windows → Linux
  normalized = normalized.replace(/\r\n/g, '\n');
  normalized = normalized.replace(/\r/g, '\n');

  // ÉTAPE 2: Préserver les retours chariot multiples
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks: string[] = [];

  // Sauvegarder les blocs de code
  normalized = normalized.replace(codeBlockRegex, (match) => {
    codeBlocks.push(match);
    return `___CODE_BLOCK_${codeBlocks.length - 1}___`;
  });

  // Normaliser les headers AVANT conversion
  normalized = normalized.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
  normalized = normalized.replace(/^(#{1,6}\s+.+?)\s+#{1,6}\s*$/gm, '$1');
  normalized = normalized.replace(/^(#{1,6})\s{2,}/gm, '$1 ');

  // Convertir les retours chariot multiples en <br/>
  // MAIS préserver autour des séparateurs horizontaux
  const lines = normalized.split('\n');
  const processedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    processedLines.push(lines[i]);
  }
  normalized = processedLines.join('\n');

  normalized = normalized.replace(/\n{2,}/g, (match, offset) => {
    const before = normalized.substring(Math.max(0, offset - 30), offset);
    const after = normalized.substring(offset + match.length, offset + match.length + 30);
    const hasHrBefore = /[-*_]{3,}\s*$/.test(before);
    const hasHrAfter = /^[-*_]{3,}/.test(after);
    const hasHeaderBefore = /#{1,6}\s+.+$/.test(before.split('\n').pop() || '');
    const hasHeaderAfter = /^#{1,6}\s+/.test(after);
    if (hasHrBefore || hasHrAfter || hasHeaderBefore || hasHeaderAfter) {
      return '\n\n';
    }
    const count = match.length;
    return '<br/>'.repeat(count);
  });

  // Restaurer les blocs de code
  normalized = normalized.replace(/___CODE_BLOCK_(\d+)___/g, (_, index) => {
    return codeBlocks[parseInt(index)];
  });

  // ÉTAPE 3: Corriger les espaces incorrects
  normalized = normalized.replace(/\*\*([ \t]+)(?![\n\r])/g, '**\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)\*\*/g, '\u00A0**');
  normalized = normalized.replace(/(?<![\n\r\*])\*([ \t]+)(?![\n\r])/g, '*\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)\*(?!\*)/g, '\u00A0*');
  normalized = normalized.replace(/__([ \t]+)(?![\n\r])/g, '__\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)__/g, '\u00A0__');
  normalized = normalized.replace(/(?<![\w\n\r])_([ \t]+)(?![\n\r])/g, '_\u00A0');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)_(?!\w)/g, '\u00A0_');
  normalized = normalized.replace(/\[[ \t]+/g, '[');
  normalized = normalized.replace(/[ \t]+\]/g, ']');
  normalized = normalized.replace(/\([ \t]+/g, '(');
  normalized = normalized.replace(/[ \t]+\)/g, ')');
  normalized = normalized.replace(/`[ \t]+/g, '`');
  normalized = normalized.replace(/[ \t]+`/g, '`');

  return normalized;
};

describe('normalizeMarkdown - Line Break Handling', () => {
  describe('Windows line breaks (\\r\\n)', () => {
    it('should normalize Windows line breaks to Unix', () => {
      const input = 'Line 1\r\nLine 2\r\nLine 3';
      const expected = 'Line 1\nLine 2\nLine 3';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should handle multiple Windows line breaks', () => {
      const input = 'Line 1\r\n\r\nLine 2';
      const output = normalizeMarkdown(input);
      expect(output).toContain('<br/>');
      expect(output).not.toContain('\r');
    });
  });

  describe('Legacy Mac line breaks (\\r)', () => {
    it('should normalize Mac line breaks to Unix', () => {
      const input = 'Line 1\rLine 2\rLine 3';
      const expected = 'Line 1\nLine 2\nLine 3';
      expect(normalizeMarkdown(input)).toBe(expected);
    });
  });

  describe('Unix line breaks (\\n)', () => {
    it('should preserve single line breaks', () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const expected = 'Line 1\nLine 2\nLine 3';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should convert double line breaks to <br/><br/>', () => {
      const input = 'Line 1\n\nLine 2';
      const expected = 'Line 1<br/><br/>Line 2';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should convert triple line breaks to <br/><br/><br/>', () => {
      const input = 'Line 1\n\n\nLine 2';
      const expected = 'Line 1<br/><br/><br/>Line 2';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should convert quadruple line breaks to <br/><br/><br/><br/>', () => {
      const input = 'Line 1\n\n\n\nLine 2';
      const expected = 'Line 1<br/><br/><br/><br/>Line 2';
      expect(normalizeMarkdown(input)).toBe(expected);
    });
  });

  describe('Mixed line breaks', () => {
    it('should handle mixed Windows and Unix line breaks', () => {
      const input = 'Line 1\r\nLine 2\nLine 3\r\n\r\nLine 4';
      const output = normalizeMarkdown(input);
      expect(output).not.toContain('\r');
      expect(output).toContain('<br/>');
    });
  });

  describe('Code blocks', () => {
    it('should preserve line breaks in code blocks', () => {
      const input = '```\nfunction test() {\n\n  return true;\n}\n```';
      const output = normalizeMarkdown(input);
      expect(output).toContain('```');
      expect(output).toContain('function test() {');
      expect(output).toContain('  return true;');
      // Les <br/> ne doivent PAS être dans le code block
      const codeBlockContent = output.match(/```[\s\S]*?```/)?.[0] || '';
      expect(codeBlockContent).not.toContain('<br/>');
    });

    it('should preserve Windows line breaks in code blocks before normalization', () => {
      const input = '```\nfunction test() {\r\n\r\n  return true;\r\n}\n```';
      const output = normalizeMarkdown(input);
      const codeBlockContent = output.match(/```[\s\S]*?```/)?.[0] || '';
      expect(codeBlockContent).not.toContain('\r');
      expect(codeBlockContent).toContain('\n');
    });

    it('should handle text before and after code blocks', () => {
      const input = 'Intro\n\n```\ncode\n```\n\nOutro';
      const output = normalizeMarkdown(input);
      // Code blocks are preserved with their surrounding context
      expect(output).toContain('Intro');
      expect(output).toContain('```');
      expect(output).toContain('Outro');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(normalizeMarkdown('')).toBe('');
    });

    it('should handle string with only line breaks', () => {
      const input = '\n\n\n';
      const output = normalizeMarkdown(input);
      expect(output).toBe('<br/><br/><br/>');
    });

    it('should handle very long sequences of line breaks', () => {
      const input = 'Start\n\n\n\n\n\n\nEnd';
      const output = normalizeMarkdown(input);
      const brCount = (output.match(/<br\/>/g) || []).length;
      expect(brCount).toBe(7); // 7 \n consécutifs → 7 <br/>
    });
  });

  describe('Header normalization', () => {
    it('should add space after # when missing', () => {
      const input = '#Header';
      const expected = '# Header';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should normalize all header levels (h1-h6)', () => {
      const input = '#H1\n##H2\n###H3\n####H4\n#####H5\n######H6';
      const output = normalizeMarkdown(input);
      expect(output).toContain('# H1');
      expect(output).toContain('## H2');
      expect(output).toContain('### H3');
      expect(output).toContain('#### H4');
      expect(output).toContain('##### H5');
      expect(output).toContain('###### H6');
    });

    it('should remove closing # from headers', () => {
      const input = '# Header #';
      const expected = '# Header';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should remove closing ## from headers', () => {
      const input = '## Header ##';
      const expected = '## Header';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should normalize excessive spaces after #', () => {
      const input = '#  Header with many spaces';
      const expected = '# Header with many spaces';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should handle headers with closing # and spaces', () => {
      const input = '### Important Title ###   ';
      const expected = '### Important Title';
      expect(normalizeMarkdown(input)).toBe(expected);
    });

    it('should not modify hashtags in middle of text', () => {
      const input = 'Check out #hashtag and #another';
      const output = normalizeMarkdown(input);
      expect(output).toBe(input); // Ne doit pas changer
    });

    it('should only affect headers at start of line', () => {
      const input = 'Text before #notaheader\n#Header';
      const output = normalizeMarkdown(input);
      expect(output).toContain('Text before #notaheader');
      expect(output).toContain('# Header');
    });

    it('should handle mixed header formatting issues', () => {
      const input = '#Title\n##  Subtitle  ##\n###Content###';
      const output = normalizeMarkdown(input);
      expect(output).toContain('# Title');
      expect(output).toContain('## Subtitle');
      expect(output).toContain('### Content');
    });
  });

  describe('Horizontal rules (separators)', () => {
    it('should preserve --- horizontal rules with proper spacing', () => {
      const input = 'Text before\n\n---\n\nText after';
      const output = normalizeMarkdown(input);
      expect(output).toContain('---');
      // Doit garder \n\n autour pour que ReactMarkdown le détecte
      expect(output).toContain('\n\n---\n\n');
    });

    it('should preserve *** horizontal rules', () => {
      const input = 'Section 1\n\n***\n\nSection 2';
      const output = normalizeMarkdown(input);
      expect(output).toContain('***');
      expect(output).toContain('\n\n***\n\n');
    });

    it('should preserve ___ horizontal rules', () => {
      const input = 'Part 1\n\n___\n\nPart 2';
      const output = normalizeMarkdown(input);
      expect(output).toContain('___');
      expect(output).toContain('\n\n___\n\n');
    });

    it('should preserve multiple horizontal rules', () => {
      const input = 'A\n\n---\n\nB\n\n***\n\nC\n\n___\n\nD';
      const output = normalizeMarkdown(input);
      expect(output).toContain('---');
      expect(output).toContain('***');
      expect(output).toContain('___');
      // Pas de <br/> autour des séparateurs
      expect(output).not.toContain('<br/><br/>---');
      expect(output).not.toContain('<br/><br/>***');
      expect(output).not.toContain('<br/><br/>___');
    });

    it('should not affect --- in code blocks', () => {
      const input = '```yaml\n---\ntitle: Test\n---\n```';
      const output = normalizeMarkdown(input);
      const codeBlock = output.match(/```yaml[\s\S]*?```/)?.[0] || '';
      expect(codeBlock).toContain('---');
      // Vérifier que les --- dans le code block ne sont pas supprimés
      const dashCount = (codeBlock.match(/---/g) || []).length;
      expect(dashCount).toBe(2);
    });

    it('should handle Mermaid diagrams with --- syntax', () => {
      const input = '```mermaid\ngraph TD\n    A --- B\n```';
      const output = normalizeMarkdown(input);
      const codeBlock = output.match(/```mermaid[\s\S]*?```/)?.[0] || '';
      expect(codeBlock).toContain('A --- B');
    });
  });

  describe('Markdown formatting preservation', () => {
    it('should fix bold with spaces', () => {
      const input = '** bold text **';
      const output = normalizeMarkdown(input);
      expect(output).toContain('**\u00A0bold text\u00A0**');
    });

    it('should fix italic with spaces', () => {
      const input = '* italic *';
      const output = normalizeMarkdown(input);
      expect(output).toContain('*\u00A0italic\u00A0*');
    });

    it('should fix links with spaces', () => {
      const input = '[ link text ]( https://example.com )';
      const output = normalizeMarkdown(input);
      expect(output).toBe('[link text](https://example.com)');
    });

    it('should fix inline code with spaces', () => {
      const input = '` code `';
      const output = normalizeMarkdown(input);
      expect(output).toBe('`code`');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle a typical chat message with Windows line breaks', () => {
      const input = 'Hello!\r\n\r\nThis is a message with:\r\n- Multiple paragraphs\r\n- Windows line breaks\r\n\r\nThanks!';
      const output = normalizeMarkdown(input);
      expect(output).not.toContain('\r');
      expect(output).toContain('<br/>');
      expect(output.split('<br/>').length - 1).toBeGreaterThan(0);
    });

    it('should handle formatted text with line breaks', () => {
      const input = '**Bold text**\n\n*Italic text*\n\n`code`';
      const output = normalizeMarkdown(input);
      expect(output).toContain('**Bold text**');
      expect(output).toContain('*Italic text*');
      expect(output).toContain('`code`');
      expect(output).toContain('<br/>');
    });

    it('should handle mixed content with code blocks', () => {
      const input = 'Here is some code:\n\n```javascript\nconsole.log("hello");\n\nconsole.log("world");\n```\n\nHope this helps!';
      const output = normalizeMarkdown(input);
      // Vérifier que le contenu est présent
      expect(output).toContain('Here is some code:');
      expect(output).toContain('Hope this helps!');
      // Vérifier que le code block n'a pas de <br/> à l'intérieur
      const codeBlock = output.match(/```javascript[\s\S]*?```/)?.[0] || '';
      expect(codeBlock).not.toContain('<br/>');
      expect(codeBlock).toContain('console.log("hello");');
      expect(codeBlock).toContain('console.log("world");');
    });
  });
});

// Pour exécuter les tests :
// npm run test -- normalizeMarkdown.test.ts
