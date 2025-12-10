'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { getDefaultPermissions } from '@/utils/user-adapter';

import { authManager } from '@/services/auth-manager.service';

interface DebugInfo {
  token: string | null;
  userFromLocalStorage: any;
  userFromAPI: any;
  permissionsFromAPI: any;
  permissionsFromDefault: any;
  canAccessAdmin: boolean;
  role: string;
}

const AdminDebug: React.FC = () => {
  const router = useRouter();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDebugInfo = async () => {
      try {
        setLoading(true);
        const token = authManager.getAuthToken();
        const userFromLocalStorage = JSON.stringify(authManager.getCurrentUser() || {});
        
        let userFromAPI = null;
        let permissionsFromAPI = null;
        let canAccessAdmin = false;
        let role = 'UNKNOWN';

        if (token) {
          // Charger l'utilisateur depuis l'API
          const userResponse = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.ME), {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            userFromAPI = userData;
            
            if (userData.success && userData.data?.user) {
              const user = userData.data.user;
              permissionsFromAPI = user.permissions;
              canAccessAdmin = user.permissions?.canAccessAdmin || false;
              role = user.role || 'UNKNOWN';
            }
          }
        }

        // Calculer les permissions par défaut
        const permissionsFromDefault = getDefaultPermissions(role);

        setDebugInfo({
          token,
          userFromLocalStorage: userFromLocalStorage ? JSON.parse(userFromLocalStorage) : null,
          userFromAPI,
          permissionsFromAPI,
          permissionsFromDefault,
          canAccessAdmin,
          role
        });

      } catch (error) {
        console.error('Erreur lors du chargement des informations de debug:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDebugInfo();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Chargement des informations de debug...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Debug - Accès Administration</h1>
        <Button onClick={() => router.push('/admin')}>
          Retour à l'admin
        </Button>
      </div>

      {debugInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informations générales */}
          <Card>
            <CardHeader>
              <CardTitle>Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <strong>Token présent:</strong> {debugInfo.token ? 'Oui' : 'Non'}
              </div>
              <div>
                <strong>Rôle:</strong> {debugInfo.role}
              </div>
              <div>
                <strong>Peut accéder à l'admin:</strong> 
                <span className={debugInfo.canAccessAdmin ? 'text-green-600 ml-2' : 'text-red-600 ml-2'}>
                  {debugInfo.canAccessAdmin ? 'Oui' : 'Non'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Utilisateur depuis localStorage */}
          <Card>
            <CardHeader>
              <CardTitle>Utilisateur (localStorage)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(debugInfo.userFromLocalStorage, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Réponse API */}
          <Card>
            <CardHeader>
              <CardTitle>Réponse API /auth/me</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(debugInfo.userFromAPI, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Permissions depuis API */}
          <Card>
            <CardHeader>
              <CardTitle>Permissions (API)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(debugInfo.permissionsFromAPI, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Permissions par défaut */}
          <Card>
            <CardHeader>
              <CardTitle>Permissions (par défaut)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(debugInfo.permissionsFromDefault, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminDebug;
