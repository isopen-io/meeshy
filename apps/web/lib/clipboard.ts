/**
 * Utilitaire pour copier du texte dans le presse-papiers avec fallbacks
 * Compatible iOS, Android et tous les navigateurs modernes
 */

export async function copyToClipboard(text: string, inputSelector?: string): Promise<{ success: boolean; message: string }> {
  try {
    // Méthode 1: API Clipboard moderne (iOS 13.4+, Chrome 63+, Firefox 53+)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return { success: true, message: 'Copié dans le presse-papiers' };
    }

    // Méthode 2: Fallback avec textarea temporaire (compatible iOS et anciens navigateurs)
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // Style pour iOS - le textarea doit être visible mais hors écran
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);

    // Focus et sélection (important pour iOS)
    textArea.focus();
    textArea.select();

    // Pour iOS, nous devons utiliser setSelectionRange
    try {
      textArea.setSelectionRange(0, text.length);
    } catch (err) {
      // Certains navigateurs ne supportent pas setSelectionRange sur tous les éléments
    }

    // Exécuter la commande copy
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      success = false;
    }

    // Nettoyer
    document.body.removeChild(textArea);

    if (success) {
      return { success: true, message: 'Copié dans le presse-papiers' };
    }

    // Méthode 3: Si un input selector est fourni, l'utiliser
    if (inputSelector) {
      const inputElement = document.querySelector(inputSelector) as HTMLInputElement;
      if (inputElement) {
        inputElement.value = text;
        inputElement.select();
        inputElement.setSelectionRange(0, 99999);
        return { success: false, message: 'Texte sélectionné - utilisez Ctrl+C pour copier' };
      }
    }

    return { success: false, message: 'Copie automatique non disponible - veuillez copier manuellement' };
  } catch (error) {
    console.warn('Erreur lors de la copie:', error);
    return { success: false, message: 'Erreur lors de la copie' };
  }
}

/**
 * Vérifie si la copie automatique est disponible
 */
export function isClipboardSupported(): boolean {
  return !!(navigator.clipboard && window.isSecureContext);
}
