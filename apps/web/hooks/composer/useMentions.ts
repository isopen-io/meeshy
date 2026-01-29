/**
 * Hook de gestion des mentions @username
 * Gère: détection, autocomplete, insertion
 *
 * @module hooks/composer/useMentions
 */

'use client';

import { useState, useCallback, useRef } from 'react';

interface MentionPosition {
  top?: number;
  bottom?: number;
  left: number;
}

interface UseMentionsOptions {
  /** ID de la conversation (doit être un ObjectId MongoDB valide) */
  conversationId?: string;
}

interface UseMentionsReturn {
  /** Afficher l'autocomplete */
  showMentionAutocomplete: boolean;
  /** Query de recherche (sans @) */
  mentionQuery: string;
  /** Position de l'autocomplete */
  mentionPosition: MentionPosition;
  /** IDs des utilisateurs mentionnés */
  mentionedUserIds: string[];
  /** Handler pour le changement de texte */
  handleTextChange: (
    value: string,
    cursorPosition: number,
    textarea: HTMLTextAreaElement | null
  ) => void;
  /** Handler pour la sélection d'une mention */
  handleMentionSelect: (
    username: string,
    userId: string,
    textarea: HTMLTextAreaElement | null,
    currentValue: string,
    onChange: (v: string) => void
  ) => void;
  /** Fermer l'autocomplete */
  closeMentionAutocomplete: () => void;
  /** Effacer les utilisateurs mentionnés */
  clearMentionedUserIds: () => void;
  /** Obtenir les IDs mentionnés */
  getMentionedUserIds: () => string[];
}

// Regex pour détecter une mention en cours de frappe
const MENTION_REGEX = /@(\w{0,30})$/;

// Regex pour valider un ObjectId MongoDB
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/**
 * Détecte une mention en cours à la position du curseur
 */
function detectMentionAtCursor(
  text: string,
  cursorPosition: number
): { query: string; start: number } | null {
  // Extraire le texte avant le curseur
  const textBeforeCursor = text.substring(0, cursorPosition);

  // Chercher @ suivi de caractères word
  const match = textBeforeCursor.match(MENTION_REGEX);
  if (!match) return null;

  return {
    query: match[1], // Le texte après @
    start: cursorPosition - match[0].length, // Position du @
  };
}

/**
 * Calcule la position du curseur dans un textarea
 * Crée un élément miroir pour mesurer précisément
 */
function getCursorPosition(
  textarea: HTMLTextAreaElement,
  cursorIndex: number
): { x: number; y: number } {
  // Créer un élément miroir
  const mirror = document.createElement('div');
  const computed = window.getComputedStyle(textarea);

  // Copier les styles
  mirror.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: ${computed.width};
    height: auto;
    font-family: ${computed.fontFamily};
    font-size: ${computed.fontSize};
    font-weight: ${computed.fontWeight};
    line-height: ${computed.lineHeight};
    letter-spacing: ${computed.letterSpacing};
    padding: ${computed.padding};
    border: ${computed.border};
    white-space: pre-wrap;
    word-wrap: break-word;
  `;

  // Copier le texte jusqu'au curseur
  const textBeforeCursor = textarea.value.substring(0, cursorIndex);
  mirror.textContent = textBeforeCursor;

  // Ajouter un span pour marquer la position
  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  // Mesurer les positions relatives dans le miroir (offsetLeft/offsetTop sont relatifs au parent)
  const markerOffsetLeft = marker.offsetLeft;
  const markerOffsetTop = marker.offsetTop;

  // Nettoyer
  document.body.removeChild(mirror);

  // Retourner les positions relatives (pas absolutes)
  // offsetLeft/offsetTop donnent la position dans le conteneur, ce qui correspond à la position dans le textarea
  // Obtenir la position du textarea dans le viewport
  const textareaRect = textarea.getBoundingClientRect();

  // Calculer la position absolue dans le viewport
  return {
    x: textareaRect.left + markerOffsetLeft - textarea.scrollLeft,
    y: textareaRect.top + markerOffsetTop - textarea.scrollTop,
  };
}

/**
 * Ajuste la position pour rester visible dans le viewport
 */
function adjustPositionForViewport(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  lineHeight: number
): MentionPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x;
  let result: MentionPosition = { left: 0 };

  // Ajuster horizontalement
  if (left + menuWidth > viewportWidth - 20) {
    left = Math.max(10, viewportWidth - menuWidth - 20);
  }
  result.left = left;

  // Ajuster verticalement: afficher en haut si pas assez de place en bas
  if (y + menuHeight + lineHeight > viewportHeight - 20) {
    result.bottom = lineHeight + 10;
  } else {
    result.top = lineHeight + 5;
  }

  return result;
}

/**
 * Hook pour gérer les mentions @username
 */
export function useMentions({
  conversationId,
}: UseMentionsOptions = {}): UseMentionsReturn {
  // États
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<MentionPosition>({ left: 0 });
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  // Refs
  const mentionCursorStartRef = useRef(0);

  // Handler pour le changement de texte
  const handleTextChange = useCallback((
    value: string,
    cursorPosition: number,
    textarea: HTMLTextAreaElement | null
  ) => {
    // Vérifier que conversationId est un ObjectId valide
    const isValidObjectId = conversationId && OBJECT_ID_REGEX.test(conversationId);
    if (!isValidObjectId) {
      setShowMentionAutocomplete(false);
      setMentionQuery('');
      return;
    }

    // Détecter la mention
    const detection = detectMentionAtCursor(value, cursorPosition);

    if (detection && /^\w{0,30}$/.test(detection.query)) {

      // Calculer la position
      if (textarea) {
        const cursorPos = getCursorPosition(textarea, cursorPosition);
        const computed = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

        const adjusted = adjustPositionForViewport(
          cursorPos.x,
          cursorPos.y,
          224, // Largeur du menu
          256, // Hauteur max du menu
          lineHeight
        );

        setMentionPosition(adjusted);
      }

      mentionCursorStartRef.current = detection.start;
      setMentionQuery(detection.query);
      setShowMentionAutocomplete(true);
    } else {
      setShowMentionAutocomplete(false);
      setMentionQuery('');
    }
  }, [conversationId]);

  // Handler pour la sélection d'une mention
  const handleMentionSelect = useCallback((
    username: string,
    userId: string,
    textarea: HTMLTextAreaElement | null,
    currentValue: string,
    onChange: (v: string) => void
  ) => {
    if (!textarea) return;

    const start = mentionCursorStartRef.current;
    const beforeMention = currentValue.substring(0, start);
    const afterCursor = currentValue.substring(textarea.selectionStart);
    const newValue = `${beforeMention}@${username} ${afterCursor}`;

    onChange(newValue);
    setShowMentionAutocomplete(false);
    setMentionQuery('');

    // Ajouter l'userId sans doublon
    setMentionedUserIds(prev => {
      if (prev.includes(userId)) return prev;
      return [...prev, userId];
    });

    // Repositionner le curseur
    setTimeout(() => {
      if (textarea) {
        const newCursorPos = start + username.length + 2; // @ + username + espace
        textarea.selectionStart = newCursorPos;
        textarea.selectionEnd = newCursorPos;
        textarea.focus();
      }
    }, 0);
  }, []);

  // Fermer l'autocomplete
  const closeMentionAutocomplete = useCallback(() => {
    setShowMentionAutocomplete(false);
    setMentionQuery('');
  }, []);

  // Effacer les utilisateurs mentionnés
  const clearMentionedUserIds = useCallback(() => {
    setMentionedUserIds([]);
  }, []);

  // Getter pour les IDs
  const getMentionedUserIds = useCallback(() => {
    return mentionedUserIds;
  }, [mentionedUserIds]);

  return {
    showMentionAutocomplete,
    mentionQuery,
    mentionPosition,
    mentionedUserIds,
    handleTextChange,
    handleMentionSelect,
    closeMentionAutocomplete,
    clearMentionedUserIds,
    getMentionedUserIds,
  };
}
