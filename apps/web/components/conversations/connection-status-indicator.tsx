'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

interface ConnectionStatusIndicatorProps {
  className?: string;
}

export function ConnectionStatusIndicator({ 
  className
}: ConnectionStatusIndicatorProps) {
  const [connectionStatus, setConnectionStatus] = useState<{
    isConnected: boolean;
    hasSocket: boolean;
  }>({ isConnected: false, hasSocket: false });
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Surveiller l'état de connexion
  useEffect(() => {
    const checkConnection = () => {
      const diagnostics = meeshySocketIOService.getConnectionDiagnostics();
      const newStatus = {
        isConnected: diagnostics.isConnected,
        hasSocket: diagnostics.hasSocket
      };
      
      setConnectionStatus(newStatus);
      
      // Déterminer si en reconnexion (a un socket mais pas connecté)
      setIsReconnecting(newStatus.hasSocket && !newStatus.isConnected);
    };

    // Vérification initiale
    checkConnection();

    // Vérifier toutes les secondes
    const interval = setInterval(checkConnection, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fonction de reconnexion manuelle
  const handleReconnect = () => {
    setIsReconnecting(true);
    meeshySocketIOService.reconnect();
    
    // Arrêter l'animation de reconnexion après 3 secondes
    setTimeout(() => {
      setIsReconnecting(false);
    }, 3000);
  };

  // Ne rien afficher si tout est OK
  if (connectionStatus.isConnected) {
    return null;
  }

  return (
    <button
      onClick={handleReconnect}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer hover:opacity-80",
        isReconnecting
          ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
          : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30",
        className
      )}
      title={isReconnecting ? "Reconnexion en cours..." : "Cliquez pour reconnecter"}
    >
      {isReconnecting ? (
        <>
          <span className="animate-spin">🟡</span>
          <span>Reconnct</span>
        </>
      ) : (
        <>
          <span>🔴</span>
          <span>Connect</span>
        </>
      )}
    </button>
  );
}

