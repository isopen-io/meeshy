'use client';

import { useUser, useIsAuthChecking } from '@/stores';
import { useAuth } from '@/hooks/use-auth';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useState, useEffect } from 'react';
import { authManager } from '@/services/auth-manager.service';

export default function AuthStatusPage() {
  const user = useUser(); const isAuthChecking = useIsAuthChecking();
  const { isAuthenticated: useAuthAuthenticated, isChecking: useAuthChecking } = useAuth();
  const { isAuthenticated: guardAuthenticated, isChecking: guardChecking } = useAuthGuard();
  const [localStorageData, setLocalStorageData] = useState<any>({});

  useEffect(() => {
    // Récupérer les données localStorage
    const token = authManager.getAuthToken();
    const userData = JSON.stringify(authManager.getCurrentUser() || {});
    
    setLocalStorageData({
      auth_token: token ? `${token.substring(0, 20)}...` : null,
      user: userData ? JSON.parse(userData) : null
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-4xl w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Statut d&apos;authentification</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* État du contexte global */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Contexte Global (useUser)</h2>
            
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-semibold">isAuthChecking:</h3>
              <p className={`font-mono ${isAuthChecking ? 'text-orange-600' : 'text-green-600'}`}>
                {isAuthChecking ? 'true' : 'false'}
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-semibold">User:</h3>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                {user ? JSON.stringify(user, null, 2) : 'null'}
              </pre>
            </div>
          </div>

          {/* État des hooks d'authentification */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Hooks d&apos;authentification</h2>
            
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-semibold">useAuth:</h3>
              <p className="text-sm">
                <span className="font-mono">isAuthenticated:</span> 
                <span className={`ml-2 ${useAuthAuthenticated ? 'text-green-600' : 'text-red-600'}`}>
                  {useAuthAuthenticated ? 'true' : 'false'}
                </span>
              </p>
              <p className="text-sm">
                <span className="font-mono">isChecking:</span> 
                <span className={`ml-2 ${useAuthChecking ? 'text-orange-600' : 'text-green-600'}`}>
                  {useAuthChecking ? 'true' : 'false'}
                </span>
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-semibold">useAuthGuard:</h3>
              <p className="text-sm">
                <span className="font-mono">isAuthenticated:</span> 
                <span className={`ml-2 ${guardAuthenticated ? 'text-green-600' : 'text-red-600'}`}>
                  {guardAuthenticated ? 'true' : 'false'}
                </span>
              </p>
              <p className="text-sm">
                <span className="font-mono">isChecking:</span> 
                <span className={`ml-2 ${guardChecking ? 'text-orange-600' : 'text-green-600'}`}>
                  {guardChecking ? 'true' : 'false'}
                </span>
              </p>
            </div>
          </div>

          {/* Données localStorage */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">localStorage</h2>
            
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-semibold">auth_token:</h3>
              <p className="font-mono text-sm">
                {localStorageData.auth_token ? localStorageData.auth_token : 'Absent'}
              </p>
            </div>
            
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-semibold">user:</h3>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                {localStorageData.user ? JSON.stringify(localStorageData.user, null, 2) : 'Absent'}
              </pre>
            </div>
            

          </div>

          {/* Actions de débogage */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">Actions de débogage</h2>
            
            <div className="space-y-2">
              <button 
                onClick={() => window.location.reload()}
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Recharger la page
              </button>
              
              <button 
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full p-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Nettoyer localStorage et recharger
              </button>
              
              <button 
                onClick={() => {
                }}
                className="w-full p-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Log debug dans la console
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
