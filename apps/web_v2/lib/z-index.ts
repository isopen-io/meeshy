/**
 * Système de z-index unifié pour Meeshy
 * Maintient une hiérarchie cohérente pour éviter les conflits d'affichage
 */

export const Z_INDEX = {
  // Base layers: 0-9
  BASE: 0,
  BELOW: 1,
  
  // UI Components: 10-39
  CARD: 10,
  BUTTON: 15,
  INPUT: 20,
  
  // Navigation et Headers: 40-49
  MOBILE_OVERLAY: 40,
  NAVIGATION_SIDEBAR: 45,
  HEADER: 50,
  
  // Overlays légers: 50-59
  REALTIME_INDICATOR: 55,
  
  // Popovers et Dropdowns: 60-79
  TOOLTIP: 60,
  DROPDOWN_MENU: 65,
  POPOVER: 70,
  TRANSLATION_POPOVER: 75, // Plus élevé que popover standard
  
  // Modals: 80-99
  MODAL: 80,
  MODAL_OVERLAY: 85,
  
  // Toasts et Notifications: 100+
  TOAST: 100,
  NOTIFICATION: 110,
  
  // Maximum (Urgence/Debug)
  MAX: 9999
} as const;

export type ZIndex = typeof Z_INDEX[keyof typeof Z_INDEX];

/**
 * Utilitaire pour appliquer un z-index avec le préfixe Tailwind
 */
export const zIndex = (value: ZIndex): string => `z-[${value}]`;

/**
 * Classes CSS prêtes à utiliser avec Tailwind
 */
export const Z_CLASSES = {
  BASE: zIndex(Z_INDEX.BASE),
  BELOW: zIndex(Z_INDEX.BELOW),
  CARD: zIndex(Z_INDEX.CARD),
  BUTTON: zIndex(Z_INDEX.BUTTON),
  INPUT: zIndex(Z_INDEX.INPUT),
  MOBILE_OVERLAY: zIndex(Z_INDEX.MOBILE_OVERLAY),
  NAVIGATION_SIDEBAR: zIndex(Z_INDEX.NAVIGATION_SIDEBAR),
  HEADER: zIndex(Z_INDEX.HEADER),
  REALTIME_INDICATOR: zIndex(Z_INDEX.REALTIME_INDICATOR),
  TOOLTIP: zIndex(Z_INDEX.TOOLTIP),
  DROPDOWN_MENU: zIndex(Z_INDEX.DROPDOWN_MENU),
  POPOVER: zIndex(Z_INDEX.POPOVER),
  TRANSLATION_POPOVER: zIndex(Z_INDEX.TRANSLATION_POPOVER),
  MODAL: zIndex(Z_INDEX.MODAL),
  MODAL_OVERLAY: zIndex(Z_INDEX.MODAL_OVERLAY),
  TOAST: zIndex(Z_INDEX.TOAST),
  NOTIFICATION: zIndex(Z_INDEX.NOTIFICATION),
  MAX: zIndex(Z_INDEX.MAX)
} as const;

/**
 * Style objects pour les propriétés CSS directes
 */
export const Z_STYLES = {
  BASE: { zIndex: Z_INDEX.BASE },
  BELOW: { zIndex: Z_INDEX.BELOW },
  CARD: { zIndex: Z_INDEX.CARD },
  BUTTON: { zIndex: Z_INDEX.BUTTON },
  INPUT: { zIndex: Z_INDEX.INPUT },
  MOBILE_OVERLAY: { zIndex: Z_INDEX.MOBILE_OVERLAY },
  NAVIGATION_SIDEBAR: { zIndex: Z_INDEX.NAVIGATION_SIDEBAR },
  HEADER: { zIndex: Z_INDEX.HEADER },
  REALTIME_INDICATOR: { zIndex: Z_INDEX.REALTIME_INDICATOR },
  TOOLTIP: { zIndex: Z_INDEX.TOOLTIP },
  DROPDOWN_MENU: { zIndex: Z_INDEX.DROPDOWN_MENU },
  POPOVER: { zIndex: Z_INDEX.POPOVER },
  TRANSLATION_POPOVER: { zIndex: Z_INDEX.TRANSLATION_POPOVER },
  MODAL: { zIndex: Z_INDEX.MODAL },
  MODAL_OVERLAY: { zIndex: Z_INDEX.MODAL_OVERLAY },
  TOAST: { zIndex: Z_INDEX.TOAST },
  NOTIFICATION: { zIndex: Z_INDEX.NOTIFICATION },
  MAX: { zIndex: Z_INDEX.MAX }
} as const;

/**
 * Hook pour diagnostiquer les problèmes de z-index
 */
export const useZIndexDebug = () => {
  const logZIndexHierarchy = () => {
    console.group('🎯 Hiérarchie Z-Index Meeshy');
    Object.entries(Z_INDEX).forEach(([key, value]) => {
    });
    console.groupEnd();
  };

  const checkElementZIndex = (element: HTMLElement) => {
    const computedStyle = window.getComputedStyle(element);
    const zIndex = computedStyle.zIndex;
    const position = computedStyle.position;
    
    return { zIndex, position, element };
  };

  return {
    logZIndexHierarchy,
    checkElementZIndex
  };
};
