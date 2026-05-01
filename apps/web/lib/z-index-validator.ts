/**
 * Z-Index Validator - Outil de diagnostic et validation
 * Utilitaire pour déboguer et valider le système de z-index
 */

import { Z_INDEX } from './z-index';

export interface ZIndexIssue {
  element: Element;
  issue: string;
  currentZIndex: string;
  expectedZIndex: number;
  position: string;
}

/**
 * Valide que tous les overlays Radix ont les bons z-index
 */
export function validateRadixZIndexes(): ZIndexIssue[] {
  const issues: ZIndexIssue[] = [];

  // Vérifier les popovers
  document.querySelectorAll('[data-radix-popover-content]').forEach((el) => {
    const style = window.getComputedStyle(el);
    const zIndex = parseInt(style.zIndex);
    
    if (isNaN(zIndex) || zIndex < 99999) {
      issues.push({
        element: el,
        issue: 'Popover z-index trop bas',
        currentZIndex: style.zIndex,
        expectedZIndex: 99999,
        position: style.position
      });
    }
  });

  // Vérifier les dropdowns
  document.querySelectorAll('[data-radix-dropdown-menu-content]').forEach((el) => {
    const style = window.getComputedStyle(el);
    const zIndex = parseInt(style.zIndex);
    
    if (isNaN(zIndex) || zIndex < 9998) {
      issues.push({
        element: el,
        issue: 'Dropdown z-index trop bas',
        currentZIndex: style.zIndex,
        expectedZIndex: 9998,
        position: style.position
      });
    }
  });

  return issues;
}

/**
 * Affiche un rapport complet dans la console
 */
export function logZIndexReport() {
  console.group('🎯 RAPPORT Z-INDEX MEESHY');
  
  console.group('📊 Hiérarchie configurée');
  Object.entries(Z_INDEX).forEach(() => {
  });
  console.groupEnd();

  console.group('🔍 Éléments actifs dans le DOM');
  document.querySelectorAll('[data-radix-popover-content]');
  document.querySelectorAll('[data-radix-dropdown-menu-content]');
  document.querySelectorAll('[data-radix-tooltip-content]');
  document.querySelectorAll('[data-radix-portal]');

  console.groupEnd();

  console.group('⚠️ Problèmes détectés');
  const issues = validateRadixZIndexes();

  if (issues.length === 0) {
  } else {
    issues.forEach(() => {
    });
  }
  console.groupEnd();
  
  console.groupEnd();
  
  return {
    configured: Z_INDEX,
    active: {
      popovers: popovers.length,
      dropdowns: dropdowns.length,
      tooltips: tooltips.length,
      portals: portals.length
    },
    issues
  };
}

/**
 * Active le mode debug visuel (bordures colorées)
 */
export function enableZIndexDebugMode() {
  const style = document.createElement('style');
  style.id = 'z-index-debug';
  style.textContent = `
    [data-radix-popover-content] {
      outline: 3px solid red !important;
      outline-offset: -3px;
    }
    
    [data-radix-popper-content-wrapper] {
      outline: 3px solid blue !important;
      outline-offset: -3px;
    }
    
    .bubble-message {
      outline: 1px solid green !important;
    }
    
    [data-radix-portal] {
      outline: 3px solid purple !important;
      outline-offset: -3px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Désactive le mode debug visuel
 */
export function disableZIndexDebugMode() {
  const style = document.getElementById('z-index-debug');
  if (style) {
    style.remove();
  }
}

/**
 * Ajoute les utilitaires de debug au window global (dev only)
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as Record<string, unknown>).meeshyZIndex = {
    validate: validateRadixZIndexes,
    report: logZIndexReport,
    debug: enableZIndexDebugMode,
    stopDebug: disableZIndexDebugMode,
    help: () => {
    }
  };
}

