'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, RotateCcw } from 'lucide-react';

interface SettingsHeaderProps {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
}

export function SettingsHeader({
  hasChanges,
  isSaving,
  onSave,
  onReset,
}: SettingsHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-gradient-to-r from-slate-600 to-gray-600 rounded-lg p-6 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin')}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuration du système</h1>
            <p className="text-slate-100 mt-1">
              Paramètres globaux et variables d'environnement
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {hasChanges && (
            <Badge className="bg-orange-500">
              Modifications non sauvegardées
            </Badge>
          )}
          <Button
            variant="ghost"
            onClick={onReset}
            className="text-white hover:bg-white/20"
            disabled={!hasChanges || isSaving}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Réinitialiser
          </Button>
          <Button
            variant="ghost"
            onClick={onSave}
            className="text-white hover:bg-white/20 bg-white/10"
            disabled={!hasChanges || isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
