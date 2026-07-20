/**
 * Normalise le markdown en corrigeant les espaces incorrects introduits par la traduction
 * et en préservant les retours chariot (Windows \r\n et Linux \n)
 *
 * Stratégie:
 * 1. Normaliser les retours chariot Windows (\r\n) vers Linux (\n)
 * 2. Préserver les retours chariot multiples en les convertissant en <br> HTML
 * 3. Normaliser les headers Markdown (# à ######)
 * 4. Remplacer les espaces mal placés par des espaces insécables (U+00A0)
 *
 * Corrige :
 * - `\r\n` → `\n` (normalisation Windows → Linux)
 * - `\n` → `<br/>` (chaque retour à la ligne est préservé en messagerie)
 * - `#texte` → `# texte` (headers mal formatés)
 * - `# texte #` → `# texte` (headers avec # de fermeture)
 * - `** texte **` → `** texte **` (espaces insécables)
 * - `* texte *` → `* texte *` (espaces insécables)
 *
 * Protège :
 * - Blocs de code (```) : pas de conversion <br/>
 * - Séparateurs horizontaux (---, ***, ___) : garde \n\n autour pour ReactMarkdown
 * - Diagrammes Mermaid dans les code blocks
 *
 * Préserve :
 * - Le nombre exact de retours à la ligne (chaque `\n` → un `<br/>`)
 * - Les espaces entre les mots dans le contenu
 *
 * Pur et sans dépendance (aucun import `react-markdown`) : source unique importée à la fois par
 * `MarkdownMessage.tsx` (rendu) et par les tests unitaires. Le composant `MarkdownMessage` étant
 * mocké par Jest pour éviter les soucis ESM de `react-markdown`, isoler cette fonction ici est ce
 * qui permet au test de valider le VRAI code de production plutôt qu'une copie qui dérive.
 *
 * @see MarkdownMessage.tsx — consommateur de rendu
 * @see __tests__/normalizeMarkdown.test.ts — couverture unitaire
 */
export const normalizeMarkdown = (content: string): string => {
  let normalized = content;

  // ÉTAPE 1: Normaliser les retours chariot Windows → Linux
  // \r\n → \n (Windows vers Unix)
  normalized = normalized.replace(/\r\n/g, '\n');
  // \r → \n (anciens Mac vers Unix)
  normalized = normalized.replace(/\r/g, '\n');

  // ÉTAPE 2: Préserver les retours chariot multiples
  // Convertir les lignes vides (2+ \n consécutifs) en <br> HTML
  // Cela préserve le nombre exact de lignes vides
  // Exception: Ne pas toucher aux blocs de code (```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks: string[] = [];

  // Sauvegarder les blocs de code
  normalized = normalized.replace(codeBlockRegex, (match) => {
    codeBlocks.push(match);
    return `___CODE_BLOCK_${codeBlocks.length - 1}___`;
  });

  // ÉTAPE 2.5: Normaliser les headers Markdown AVANT la conversion des \n
  // Cela permet à ReactMarkdown de les détecter correctement

  // Corriger les headers sans espace après # : #texte → # texte
  normalized = normalized.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');

  // Corriger les headers avec espaces avant le # de fermeture : # texte # → # texte
  normalized = normalized.replace(/^(#{1,6}\s+.+?)\s+#{1,6}\s*$/gm, '$1');

  // Corriger les headers avec espaces excessifs : #  texte → # texte
  normalized = normalized.replace(/^(#{1,6})\s{2,}/gm, '$1 ');

  // Convertir les retours chariot multiples en <br/>
  // MAIS : Préserver les retours autour des séparateurs horizontaux (---, ***, ___)
  // pour que ReactMarkdown puisse les détecter

  // Détecter les lignes avec séparateurs horizontaux
  const lines = normalized.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const isHorizontalRule = /^[-*_]{3,}\s*$/.test(currentLine.trim());

    if (isHorizontalRule) {
      // C'est un séparateur : garder les retours de ligne autour
      processedLines.push(currentLine);
    } else {
      processedLines.push(currentLine);
    }
  }

  // Reconstruire et convertir les \n multiples (sauf autour des séparateurs)
  normalized = processedLines.join('\n');

  // Conversion des \n simples en <br/> pour préserver les retours à la ligne
  // (en markdown standard, un seul \n est ignoré, mais en messagerie on veut les garder)
  // D'abord traiter les \n multiples, puis les simples
  normalized = normalized.replace(/\n{2,}/g, (match, offset) => {
    // Vérifier si on est près d'un séparateur horizontal ou d'un header
    const before = normalized.substring(Math.max(0, offset - 30), offset);
    const after = normalized.substring(offset + match.length, offset + match.length + 30);

    // Détecter séparateurs horizontaux
    const hasHrBefore = /[-*_]{3,}\s*$/.test(before);
    const hasHrAfter = /^[-*_]{3,}/.test(after);

    // Détecter headers (lignes commençant par #)
    const hasHeaderBefore = /#{1,6}\s+.+$/.test(before.split('\n').pop() || '');
    const hasHeaderAfter = /^#{1,6}\s+/.test(after);

    // Si on est autour d'un HR ou d'un header, garder les \n via placeholder
    // (sera restauré après la conversion des \n simples en <br/>)
    if (hasHrBefore || hasHrAfter || hasHeaderBefore || hasHeaderAfter) {
      return '___MD_NEWLINE___'.repeat(2);
    }

    // Sinon, convertir normalement en <br/>
    const count = match.length;
    return '<br/>'.repeat(count);
  });

  // Convertir les \n simples restants en <br/> pour la messagerie
  // (en markdown standard un \n simple est ignoré, mais les utilisateurs attendent
  // que chaque retour à la ligne soit préservé dans un chat)
  normalized = normalized.replace(/\n/g, '<br/>');

  // Restaurer les \n protégés autour des éléments Markdown (HR, headers)
  normalized = normalized.replace(/___MD_NEWLINE___/g, '\n');

  // Restaurer les blocs de code
  normalized = normalized.replace(/___CODE_BLOCK_(\d+)___/g, (_, index) => {
    return codeBlocks[parseInt(index)];
  });

  // ÉTAPE 3: Corriger les espaces incorrects autour du formatage Markdown

  // Gras ** : remplacer espaces par insécables
  // ** texte ** → ** texte **
  normalized = normalized.replace(/\*\*([ \t]+)(?![\n\r])/g, '** ');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)\*\*/g, ' **');

  // Italique * : remplacer espaces par insécables (éviter les listes)
  // * texte * → * texte *
  normalized = normalized.replace(/(?<![\n\r\*])\*([ \t]+)(?![\n\r])/g, '* ');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)\*(?!\*)/g, ' *');

  // Gras alternatif __ : remplacer espaces par insécables
  // __ texte __ → __ texte __
  normalized = normalized.replace(/__([ \t]+)(?![\n\r])/g, '__ ');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)__/g, ' __');

  // Italique alternatif _ : remplacer espaces par insécables
  // _ texte _ → _ texte _
  normalized = normalized.replace(/(?<![\w\n\r])_([ \t]+)(?![\n\r])/g, '_ ');
  normalized = normalized.replace(/(?<![\n\r])([ \t]+)_(?!\w)/g, ' _');

  // Corriger les liens: [ texte ]( url ) → [texte](url)
  // Supprimer les espaces dans les crochets/parenthèses
  normalized = normalized.replace(/\[[ \t]+/g, '[');
  normalized = normalized.replace(/[ \t]+\]/g, ']');
  normalized = normalized.replace(/\([ \t]+/g, '(');
  normalized = normalized.replace(/[ \t]+\)/g, ')');

  // Corriger les codes inline: ` code ` → `code`
  normalized = normalized.replace(/`[ \t]+/g, '`');
  normalized = normalized.replace(/[ \t]+`/g, '`');

  return normalized;
};
