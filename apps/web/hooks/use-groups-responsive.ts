/**
 * Hook pour gérer la responsivité de l'interface groupes
 * Suit les Vercel React Best Practices: separation of concerns
 */

import { useState, useEffect } from 'react';

export function useGroupsResponsive(selectedGroup: any) {
  const [showGroupsList, setShowGroupsList] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Détecter si on est sur mobile
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Gérer la responsivité : masquer/afficher la liste selon la sélection
  useEffect(() => {
    if (isMobile) {
      setShowGroupsList(!selectedGroup);
    } else {
      setShowGroupsList(true);
    }
  }, [isMobile, selectedGroup]);

  return {
    showGroupsList,
    setShowGroupsList,
    isMobile
  };
}
