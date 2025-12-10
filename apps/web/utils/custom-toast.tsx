/**
 * Custom toast notifications - Toasts fonctionnels uniquement
 *
 * IMPORTANT: Les toasts métier (messages, mentions, notifications) sont gérés
 * par le système V2 dans use-notifications-v2.tsx
 *
 * Ce fichier contient uniquement:
 * - Toasts fonctionnels simples (success/error/info)
 * - Utilitaires pour le développement
 */

import { toast as sonnerToast } from 'sonner';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

/**
 * Toast fonctionnel simple (success/error/info)
 * Design épuré pour les notifications de développement
 */
function showFunctionalToast(type: 'success' | 'error' | 'info', title: string, message?: string) {
  const configs = {
    success: {
      bgClass: 'bg-green-500',
      icon: <CheckCircle className="w-4 h-4 text-white" />,
      textClass: 'text-white',
    },
    error: {
      bgClass: 'bg-red-500',
      icon: <AlertCircle className="w-4 h-4 text-white" />,
      textClass: 'text-white',
    },
    info: {
      bgClass: 'bg-blue-500',
      icon: <Info className="w-4 h-4 text-white" />,
      textClass: 'text-white',
    },
  };

  const config = configs[type];

  const ToastContent = (
    <div className={`flex items-center gap-2 px-3 py-2 ${config.bgClass} rounded-md shadow-md max-w-[280px]`}>
      {config.icon}
      <span className={`text-sm font-medium ${config.textClass} truncate`}>
        {title}
      </span>
    </div>
  );

  sonnerToast.custom(() => ToastContent, {
    duration: 3000,
    position: 'top-right',
  });
}

/**
 * DEPRECATED - Toast notification métier riche (avec avatar)
 * Ces fonctions sont maintenant gérées par le système de notifications V2
 * dans use-notifications-v2.tsx qui utilise NotificationV2 avec i18n
 *
 * Ce fichier est conservé uniquement pour:
 * - Les toasts fonctionnels (success/error/info)
 * - La page de test /test-toasts
 *
 * À supprimer lors de la migration complète vers V2
 */

/**
 * Toast simple pour succès (fonctionnel, épuré)
 */
export function showSuccessToast(title: string, message?: string) {
  showFunctionalToast('success', message ? `${title}: ${message}` : title);
}

/**
 * Toast simple pour erreur (fonctionnel, épuré)
 */
export function showErrorToast(title: string, message?: string) {
  showFunctionalToast('error', message ? `${title}: ${message}` : title);
}

/**
 * Toast simple pour info (fonctionnel, épuré)
 */
export function showInfoToast(title: string, message?: string) {
  showFunctionalToast('info', message ? `${title}: ${message}` : title);
}
