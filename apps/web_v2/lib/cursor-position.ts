/**
 * Calcule la position exacte du curseur dans un textarea
 * Retourne les coordonnées x et y du curseur pour positionner l'autocomplete
 */
export function getCursorPosition(
  textarea: HTMLTextAreaElement,
  cursorIndex: number
): { x: number; y: number } {
  // Créer un div miroir pour calculer la position du curseur
  const div = document.createElement('div');
  const computed = window.getComputedStyle(textarea);

  // Copier tous les styles du textarea vers le div
  const styles = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'wordSpacing',
    'whiteSpace',
    'wordWrap',
    'wordBreak',
    'textAlign',
    'direction',
    'tabSize'
  ];

  styles.forEach(style => {
    (div.style as any)[style] = (computed as any)[style];
  });

  // Get textarea position FIRST (before adding div to DOM)
  const textareaRect = textarea.getBoundingClientRect();

  // Styles spéciaux pour le positionnement du div
  // IMPORTANT: Utiliser position: fixed pour être dans le même référentiel que le textarea
  // (que le textarea soit dans un conteneur fixed ou non, getBoundingClientRect retourne
  // toujours des coordonnées relatives au viewport)
  div.style.position = 'fixed';
  div.style.top = `${textareaRect.top}px`; // Position relative au viewport
  div.style.left = `${textareaRect.left}px`;
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap'; // Important pour le wrapping comme textarea
  div.style.wordWrap = 'break-word';
  div.style.overflow = 'hidden';
  div.style.height = 'auto'; // Laisser le div grandir naturellement
  div.style.pointerEvents = 'none'; // Éviter toute interaction

  // Ajouter le texte avant le curseur
  const textBeforeCursor = textarea.value.substring(0, cursorIndex);
  const textNode = document.createTextNode(textBeforeCursor);
  div.appendChild(textNode);

  // Créer un span pour marquer la position exacte du curseur
  const span = document.createElement('span');
  span.textContent = '|';
  div.appendChild(span);

  // Ajouter le texte après le curseur (optionnel mais aide au wrapping)
  const textAfterCursor = textarea.value.substring(cursorIndex);
  const textNodeAfter = document.createTextNode(textAfterCursor);
  div.appendChild(textNodeAfter);

  // Ajouter temporairement au DOM
  document.body.appendChild(div);

  // Obtenir les positions du span (curseur) et du div miroir
  const spanRect = span.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();

  // Calculer la position relative du span dans le div
  // Ces offsets représentent la position du curseur dans le textarea
  const offsetX = spanRect.left - divRect.left;
  const offsetY = spanRect.top - divRect.top;

  // Calculer la position absolue du curseur dans le viewport
  // textareaRect est déjà relatif au viewport (getBoundingClientRect)
  // On ajoute l'offset du curseur dans le textarea et on soustrait le scroll interne
  const x = textareaRect.left + offsetX - textarea.scrollLeft;
  const y = textareaRect.top + offsetY - textarea.scrollTop;

  // Nettoyer
  document.body.removeChild(div);

  return { x, y };
}

/**
 * Version alternative pour les textareas dans des conteneurs position:fixed
 * Utilise position:fixed pour le div miroir pour être dans le même référentiel
 */
export function getCursorPositionForFixed(
  textarea: HTMLTextAreaElement,
  cursorIndex: number
): { x: number; y: number } {
  // Créer un div miroir pour calculer la position du curseur
  const div = document.createElement('div');
  const computed = window.getComputedStyle(textarea);

  // Copier tous les styles du textarea vers le div
  const styles = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'wordSpacing',
    'whiteSpace',
    'wordWrap',
    'wordBreak',
    'textAlign',
    'direction',
    'tabSize'
  ];

  styles.forEach(style => {
    (div.style as any)[style] = (computed as any)[style];
  });

  // Get textarea position FIRST (before adding div to DOM)
  const textareaRect = textarea.getBoundingClientRect();

  // IMPORTANT: Utiliser position: fixed pour être dans le même référentiel que le textarea
  // (quand le textarea est dans un conteneur fixed)
  div.style.position = 'fixed';
  div.style.top = `${textareaRect.top}px`;
  div.style.left = `${textareaRect.left}px`;
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.overflow = 'hidden';
  div.style.height = 'auto';
  div.style.pointerEvents = 'none';

  // Ajouter le texte avant le curseur
  const textBeforeCursor = textarea.value.substring(0, cursorIndex);
  const textNode = document.createTextNode(textBeforeCursor);
  div.appendChild(textNode);

  // Créer un span pour marquer la position exacte du curseur
  const span = document.createElement('span');
  span.textContent = '|';
  div.appendChild(span);

  // Ajouter le texte après le curseur
  const textAfterCursor = textarea.value.substring(cursorIndex);
  const textNodeAfter = document.createTextNode(textAfterCursor);
  div.appendChild(textNodeAfter);

  // Ajouter temporairement au DOM
  document.body.appendChild(div);

  // Obtenir les positions
  const spanRect = span.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();

  // Calculer la position relative du span dans le div
  const offsetX = spanRect.left - divRect.left;
  const offsetY = spanRect.top - divRect.top;

  // Calculer la position absolue du curseur dans le viewport
  const x = textareaRect.left + offsetX - textarea.scrollLeft;
  const y = textareaRect.top + offsetY - textarea.scrollTop;

  // Nettoyer
  document.body.removeChild(div);

  return { x, y };
}

/**
 * Ajuste la position de l'autocomplete pour qu'elle reste visible dans le viewport
 * @param x Position horizontale du curseur
 * @param y Position verticale du curseur (haut de la ligne)
 * @param autocompleteWidth Largeur de l'autocomplete
 * @param autocompleteHeight Hauteur de l'autocomplete
 * @param lineHeight Hauteur de ligne (pour positionner sous la ligne)
 */
export function adjustPositionForViewport(
  x: number,
  y: number,
  autocompleteWidth: number = 224,
  autocompleteHeight: number = 256,
  lineHeight: number = 24
): { top?: number; bottom?: number; left: number } {
  const viewportWidth = window.innerWidth;

  // Utiliser Visual Viewport API pour obtenir le vrai espace visible
  // (sans le clavier virtuel sur mobile)
  const viewportHeight = window.visualViewport?.height || window.innerHeight;

  // Détecter mobile et adapter la hauteur de l'autocomplete
  const isMobile = window.innerWidth < 768;
  const effectiveAutocompleteHeight = isMobile ? Math.min(autocompleteHeight, 180) : autocompleteHeight;

  // Ajuster la position horizontale
  let adjustedLeft = x;
  if (adjustedLeft + autocompleteWidth > viewportWidth - 20) {
    adjustedLeft = viewportWidth - autocompleteWidth - 20;
  }
  if (adjustedLeft < 20) {
    adjustedLeft = 20;
  }

  // Ajuster la position verticale
  // y est la position du HAUT de la ligne du curseur
  const yBelow = y + lineHeight; // Position sous la ligne
  const spaceBelow = viewportHeight - yBelow;
  const spaceAbove = y;

  if (spaceBelow >= effectiveAutocompleteHeight + 10) {
    // Assez d'espace en dessous - afficher sous la ligne du curseur
    return {
      top: yBelow + 5, // Petit décalage sous la ligne
      left: adjustedLeft
    };
  } else if (spaceAbove >= effectiveAutocompleteHeight + 10) {
    // Pas assez d'espace en dessous mais assez au-dessus - afficher au-dessus de la ligne
    return {
      top: y - effectiveAutocompleteHeight - 5, // Au-dessus de la ligne du curseur
      left: adjustedLeft
    };
  } else {
    // Pas assez d'espace des deux côtés - centrer verticalement
    return {
      top: Math.max(20, (viewportHeight - effectiveAutocompleteHeight) / 2),
      left: adjustedLeft
    };
  }
}
