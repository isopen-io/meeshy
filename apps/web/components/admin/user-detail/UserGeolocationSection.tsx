'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Globe, Clock, Monitor, Wifi } from 'lucide-react';

interface UserGeolocationSectionProps {
  user: any;
}

function countryCodeToFlag(code: string | null): string {
  if (!code || code.length !== 2) return '';
  const codePoints = [...code.toUpperCase()].map(
    c => 0x1f1e6 - 65 + c.charCodeAt(0)
  );
  return String.fromCodePoint(...codePoints);
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-gray-600 dark:text-gray-400 text-sm shrink-0">{label}</span>
      <span className={`text-sm font-medium dark:text-gray-200 text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function DeviceRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col space-y-1">
      <span className="text-gray-600 dark:text-gray-400 text-xs">{label}</span>
      <span className="font-mono text-xs text-gray-900 dark:text-gray-200 break-all">{value}</span>
    </div>
  );
}

export function UserGeolocationSection({ user }: UserGeolocationSectionProps) {
  const hasLastLogin = user.lastLoginIp || user.lastLoginLocation || user.lastLoginDevice;
  const hasRegistration = user.registrationIp || user.registrationLocation || user.registrationDevice || user.registrationCountry;

  if (!hasLastLogin && !hasRegistration && !user.timezone) return null;

  const regFlag = countryCodeToFlag(user.registrationCountry);

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <MapPin className="h-5 w-5" />
          <span>Géolocalisation & Appareil</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {user.timezone && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-800 dark:text-blue-300">
              Fuseau horaire : <span className="font-medium">{user.timezone}</span>
            </span>
          </div>
        )}

        {hasLastLogin && (
          <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
              <h4 className="font-semibold text-sm dark:text-gray-100">Derniere connexion</h4>
            </div>
            <div className="space-y-2">
              <InfoRow label="Localisation" value={user.lastLoginLocation} />
              <InfoRow label="Adresse IP" value={user.lastLoginIp} mono />
              <DeviceRow label="Appareil" value={user.lastLoginDevice} />
            </div>
          </div>
        )}

        {hasRegistration && (
          <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h4 className="font-semibold text-sm dark:text-gray-100">Contexte d'inscription</h4>
            </div>
            <div className="space-y-2">
              <InfoRow label="Localisation" value={user.registrationLocation} />
              {user.registrationCountry && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400 text-sm">Pays</span>
                  <span className="text-sm font-medium dark:text-gray-200">
                    {regFlag && <span className="mr-1.5">{regFlag}</span>}
                    {user.registrationCountry}
                  </span>
                </div>
              )}
              <InfoRow label="Adresse IP" value={user.registrationIp} mono />
              <DeviceRow label="Appareil" value={user.registrationDevice} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
