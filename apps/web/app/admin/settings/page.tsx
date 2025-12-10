'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Settings,
  Database,
  Shield,
  Globe,
  Zap,
  MessageSquare,
  Upload,
  Server,
  Lock,
  AlertTriangle,
  Info,
  Save,
  RotateCcw,
  HelpCircle
} from 'lucide-react';

// Types pour les configurations
interface ConfigSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  settings: ConfigSetting[];
}

interface ConfigSetting {
  key: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  value: string | number | boolean;
  defaultValue: string | number | boolean;
  envVar?: string;
  options?: { label: string; value: string }[];
  unit?: string;
  implemented: boolean;
  category: 'security' | 'performance' | 'features' | 'system';
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [hasChanges, setHasChanges] = useState(false);

  // Configuration complète du système
  const configSections: ConfigSection[] = [
    {
      id: 'general',
      title: 'Configuration générale',
      description: 'Paramètres globaux de l\'application',
      icon: Settings,
      settings: [
        {
          key: 'NODE_ENV',
          label: 'Environnement',
          description: 'Environnement d\'exécution de l\'application',
          type: 'select',
          value: 'production',
          defaultValue: 'production',
          envVar: 'NODE_ENV',
          options: [
            { label: 'Production', value: 'production' },
            { label: 'Development', value: 'development' },
            { label: 'Test', value: 'test' }
          ],
          implemented: true,
          category: 'system'
        },
        {
          key: 'DOMAIN',
          label: 'Domaine principal',
          description: 'Nom de domaine de l\'application',
          type: 'text',
          value: 'meeshy.me',
          defaultValue: 'localhost',
          envVar: 'DOMAIN',
          implemented: true,
          category: 'system'
        },
        {
          key: 'FRONTEND_URL',
          label: 'URL Frontend',
          description: 'URL complète du frontend (utilisée pour les liens)',
          type: 'text',
          value: 'https://meeshy.me',
          defaultValue: 'http://localhost:3100',
          envVar: 'FRONTEND_URL',
          implemented: true,
          category: 'system'
        },
        {
          key: 'BACKEND_URL',
          label: 'URL Backend',
          description: 'URL complète du backend (API)',
          type: 'text',
          value: 'https://api.meeshy.me',
          defaultValue: 'http://localhost:3000',
          envVar: 'BACKEND_URL',
          implemented: true,
          category: 'system'
        },
        {
          key: 'USE_HTTPS',
          label: 'Utiliser HTTPS',
          description: 'Activer le protocole HTTPS pour toutes les communications',
          type: 'boolean',
          value: true,
          defaultValue: false,
          envVar: 'USE_HTTPS',
          implemented: true,
          category: 'security'
        },
        {
          key: 'DEBUG',
          label: 'Mode Debug',
          description: 'Activer les logs détaillés pour le débogage',
          type: 'boolean',
          value: false,
          defaultValue: false,
          envVar: 'DEBUG',
          implemented: true,
          category: 'system'
        }
      ]
    },
    {
      id: 'database',
      title: 'Base de données',
      description: 'Configuration de la base de données PostgreSQL',
      icon: Database,
      settings: [
        {
          key: 'DATABASE_URL',
          label: 'URL de connexion',
          description: 'URL de connexion PostgreSQL (format: postgresql://user:password@host:port/db)',
          type: 'text',
          value: 'postgresql://meeshy:***@localhost:5432/meeshy',
          defaultValue: '',
          envVar: 'DATABASE_URL',
          implemented: true,
          category: 'system'
        },
        {
          key: 'FORCE_DB_RESET',
          label: 'Réinitialisation forcée',
          description: 'DANGER : Réinitialiser complètement la base de données au démarrage',
          type: 'boolean',
          value: false,
          defaultValue: false,
          envVar: 'FORCE_DB_RESET',
          implemented: true,
          category: 'system'
        },
        {
          key: 'DB_POOL_SIZE',
          label: 'Taille du pool de connexions',
          description: 'Nombre maximum de connexions simultanées à la base de données',
          type: 'number',
          value: 20,
          defaultValue: 10,
          envVar: 'DB_POOL_SIZE',
          implemented: false,
          category: 'performance'
        },
        {
          key: 'DB_CONNECTION_TIMEOUT',
          label: 'Timeout de connexion',
          description: 'Durée maximale pour établir une connexion (en secondes)',
          type: 'number',
          value: 30,
          defaultValue: 30,
          unit: 's',
          envVar: 'DB_CONNECTION_TIMEOUT',
          implemented: false,
          category: 'performance'
        }
      ]
    },
    {
      id: 'security',
      title: 'Sécurité',
      description: 'Paramètres de sécurité et authentification',
      icon: Shield,
      settings: [
        {
          key: 'JWT_SECRET',
          label: 'Clé secrète JWT',
          description: 'Clé utilisée pour signer les tokens JWT (ne jamais exposer)',
          type: 'text',
          value: '••••••••••••••••',
          defaultValue: 'meeshy-secret-key-dev',
          envVar: 'JWT_SECRET',
          implemented: true,
          category: 'security'
        },
        {
          key: 'JWT_EXPIRY',
          label: 'Durée de validité JWT',
          description: 'Durée de validité des tokens d\'authentification',
          type: 'number',
          value: 7,
          defaultValue: 7,
          unit: 'jours',
          envVar: 'JWT_EXPIRY',
          implemented: false,
          category: 'security'
        },
        {
          key: 'CORS_ORIGINS',
          label: 'Origines CORS autorisées',
          description: 'Liste des domaines autorisés à accéder à l\'API (séparés par virgule)',
          type: 'text',
          value: 'https://meeshy.me,https://www.meeshy.me',
          defaultValue: 'http://localhost:3100',
          envVar: 'CORS_ORIGINS',
          implemented: true,
          category: 'security'
        },
        {
          key: 'MAX_LOGIN_ATTEMPTS',
          label: 'Tentatives de connexion max',
          description: 'Nombre de tentatives avant blocage temporaire du compte',
          type: 'number',
          value: 5,
          defaultValue: 5,
          envVar: 'MAX_LOGIN_ATTEMPTS',
          implemented: false,
          category: 'security'
        },
        {
          key: 'LOCKOUT_DURATION',
          label: 'Durée de blocage',
          description: 'Durée de blocage après échec de connexions multiples',
          type: 'number',
          value: 30,
          defaultValue: 30,
          unit: 'minutes',
          envVar: 'LOCKOUT_DURATION',
          implemented: false,
          category: 'security'
        },
        {
          key: 'PASSWORD_MIN_LENGTH',
          label: 'Longueur minimale mot de passe',
          description: 'Nombre minimum de caractères requis pour les mots de passe',
          type: 'number',
          value: 8,
          defaultValue: 8,
          envVar: 'PASSWORD_MIN_LENGTH',
          implemented: false,
          category: 'security'
        }
      ]
    },
    {
      id: 'rate-limiting',
      title: 'Rate Limiting',
      description: 'Protection contre les abus et surcharge',
      icon: Zap,
      settings: [
        {
          key: 'ENABLE_RATE_LIMITING',
          label: 'Activer rate limiting',
          description: 'Limiter le nombre de requêtes par utilisateur',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_RATE_LIMITING',
          implemented: true,
          category: 'performance'
        },
        {
          key: 'RATE_LIMIT_MAX',
          label: 'Nombre maximum de requêtes',
          description: 'Nombre de requêtes autorisées par fenêtre de temps',
          type: 'number',
          value: 100,
          defaultValue: 100,
          envVar: 'RATE_LIMIT_MAX',
          implemented: true,
          category: 'performance'
        },
        {
          key: 'RATE_LIMIT_WINDOW',
          label: 'Fenêtre de temps',
          description: 'Durée de la fenêtre pour le rate limiting',
          type: 'number',
          value: 60000,
          defaultValue: 60000,
          unit: 'ms',
          envVar: 'RATE_LIMIT_WINDOW',
          implemented: true,
          category: 'performance'
        },
        {
          key: 'RATE_LIMIT_BAN_DURATION',
          label: 'Durée de bannissement',
          description: 'Durée du bannissement temporaire après dépassement des limites',
          type: 'number',
          value: 15,
          defaultValue: 15,
          unit: 'minutes',
          envVar: 'RATE_LIMIT_BAN_DURATION',
          implemented: false,
          category: 'performance'
        }
      ]
    },
    {
      id: 'messages',
      title: 'Messages et contenus',
      description: 'Configuration des messages et traductions',
      icon: MessageSquare,
      settings: [
        {
          key: 'MAX_MESSAGE_LENGTH',
          label: 'Longueur maximale message',
          description: 'Nombre maximum de caractères par message',
          type: 'number',
          value: 2000,
          defaultValue: 2000,
          envVar: 'MAX_MESSAGE_LENGTH',
          implemented: true,
          category: 'features'
        },
        {
          key: 'MAX_TEXT_ATTACHMENT_THRESHOLD',
          label: 'Seuil pièce jointe texte',
          description: 'Longueur à partir de laquelle le texte devient une pièce jointe',
          type: 'number',
          value: 2000,
          defaultValue: 2000,
          envVar: 'MAX_TEXT_ATTACHMENT_THRESHOLD',
          implemented: true,
          category: 'features'
        },
        {
          key: 'MAX_TRANSLATION_LENGTH',
          label: 'Longueur max traduction',
          description: 'Longueur maximale d\'un message pouvant être traduit',
          type: 'number',
          value: 10000,
          defaultValue: 10000,
          envVar: 'MAX_TRANSLATION_LENGTH',
          implemented: true,
          category: 'features'
        },
        {
          key: 'AUTO_TRANSLATE',
          label: 'Traduction automatique',
          description: 'Activer la traduction automatique des messages',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'AUTO_TRANSLATE',
          implemented: false,
          category: 'features'
        },
        {
          key: 'MESSAGE_RETENTION_DAYS',
          label: 'Rétention des messages',
          description: 'Durée de conservation des messages supprimés (0 = permanent)',
          type: 'number',
          value: 30,
          defaultValue: 30,
          unit: 'jours',
          envVar: 'MESSAGE_RETENTION_DAYS',
          implemented: false,
          category: 'system'
        },
        {
          key: 'ENABLE_MESSAGE_EDIT',
          label: 'Autoriser l\'édition',
          description: 'Permettre aux utilisateurs de modifier leurs messages',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_MESSAGE_EDIT',
          implemented: false,
          category: 'features'
        },
        {
          key: 'MESSAGE_EDIT_TIME_LIMIT',
          label: 'Limite d\'édition',
          description: 'Durée pendant laquelle un message peut être modifié (0 = illimité)',
          type: 'number',
          value: 15,
          defaultValue: 15,
          unit: 'minutes',
          envVar: 'MESSAGE_EDIT_TIME_LIMIT',
          implemented: false,
          category: 'features'
        }
      ]
    },
    {
      id: 'uploads',
      title: 'Upload et stockage',
      description: 'Configuration des fichiers et médias',
      icon: Upload,
      settings: [
        {
          key: 'UPLOAD_PATH',
          label: 'Dossier d\'upload',
          description: 'Chemin du dossier où sont stockés les fichiers uploadés',
          type: 'text',
          value: '/app/uploads/attachments',
          defaultValue: './uploads/attachments',
          envVar: 'UPLOAD_PATH',
          implemented: true,
          category: 'system'
        },
        {
          key: 'PUBLIC_URL',
          label: 'URL publique des uploads',
          description: 'URL publique pour accéder aux fichiers uploadés',
          type: 'text',
          value: 'https://api.meeshy.me',
          defaultValue: 'http://localhost:3000',
          envVar: 'PUBLIC_URL',
          implemented: true,
          category: 'system'
        },
        {
          key: 'MAX_FILE_SIZE',
          label: 'Taille maximale fichier',
          description: 'Taille maximale autorisée pour un fichier',
          type: 'number',
          value: 50,
          defaultValue: 50,
          unit: 'MB',
          envVar: 'MAX_FILE_SIZE',
          implemented: false,
          category: 'features'
        },
        {
          key: 'MAX_IMAGE_SIZE',
          label: 'Taille maximale image',
          description: 'Taille maximale pour les images',
          type: 'number',
          value: 10,
          defaultValue: 10,
          unit: 'MB',
          envVar: 'MAX_IMAGE_SIZE',
          implemented: false,
          category: 'features'
        },
        {
          key: 'MAX_VIDEO_SIZE',
          label: 'Taille maximale vidéo',
          description: 'Taille maximale pour les vidéos',
          type: 'number',
          value: 100,
          defaultValue: 100,
          unit: 'MB',
          envVar: 'MAX_VIDEO_SIZE',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ALLOWED_IMAGE_TYPES',
          label: 'Types d\'images autorisés',
          description: 'Extensions d\'images acceptées (séparées par virgule)',
          type: 'text',
          value: 'jpg,jpeg,png,gif,webp',
          defaultValue: 'jpg,jpeg,png,gif,webp',
          envVar: 'ALLOWED_IMAGE_TYPES',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ALLOWED_VIDEO_TYPES',
          label: 'Types de vidéos autorisés',
          description: 'Extensions de vidéos acceptées (séparées par virgule)',
          type: 'text',
          value: 'mp4,webm,mov',
          defaultValue: 'mp4,webm,mov',
          envVar: 'ALLOWED_VIDEO_TYPES',
          implemented: false,
          category: 'features'
        },
        {
          key: 'AUTO_COMPRESS_IMAGES',
          label: 'Compression auto des images',
          description: 'Compresser automatiquement les images uploadées',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'AUTO_COMPRESS_IMAGES',
          implemented: false,
          category: 'performance'
        },
        {
          key: 'IMAGE_QUALITY',
          label: 'Qualité compression',
          description: 'Qualité de compression des images (0-100)',
          type: 'number',
          value: 85,
          defaultValue: 85,
          unit: '%',
          envVar: 'IMAGE_QUALITY',
          implemented: false,
          category: 'performance'
        }
      ]
    },
    {
      id: 'server',
      title: 'Serveur et réseau',
      description: 'Configuration du serveur et des services',
      icon: Server,
      settings: [
        {
          key: 'PORT',
          label: 'Port du serveur',
          description: 'Port sur lequel le serveur écoute les requêtes HTTP',
          type: 'number',
          value: 3000,
          defaultValue: 3000,
          envVar: 'PORT',
          implemented: true,
          category: 'system'
        },
        {
          key: 'ZMQ_TRANSLATOR_PORT',
          label: 'Port service traduction',
          description: 'Port ZMQ pour le service de traduction',
          type: 'number',
          value: 5555,
          defaultValue: 5555,
          envVar: 'ZMQ_TRANSLATOR_PORT',
          implemented: true,
          category: 'system'
        },
        {
          key: 'LOCAL_IP',
          label: 'IP locale',
          description: 'Adresse IP locale du serveur',
          type: 'text',
          value: '192.168.1.39',
          defaultValue: '127.0.0.1',
          envVar: 'LOCAL_IP',
          implemented: true,
          category: 'system'
        },
        {
          key: 'SERVER_TIMEOUT',
          label: 'Timeout serveur',
          description: 'Durée maximale de traitement d\'une requête',
          type: 'number',
          value: 30,
          defaultValue: 30,
          unit: 's',
          envVar: 'SERVER_TIMEOUT',
          implemented: false,
          category: 'performance'
        },
        {
          key: 'KEEP_ALIVE_TIMEOUT',
          label: 'Keep-alive timeout',
          description: 'Durée de maintien des connexions HTTP',
          type: 'number',
          value: 65,
          defaultValue: 65,
          unit: 's',
          envVar: 'KEEP_ALIVE_TIMEOUT',
          implemented: false,
          category: 'performance'
        },
        {
          key: 'MAX_CONNECTIONS',
          label: 'Connexions simultanées max',
          description: 'Nombre maximum de connexions simultanées',
          type: 'number',
          value: 1000,
          defaultValue: 1000,
          envVar: 'MAX_CONNECTIONS',
          implemented: false,
          category: 'performance'
        }
      ]
    },
    {
      id: 'features',
      title: 'Fonctionnalités',
      description: 'Activation/désactivation des fonctionnalités',
      icon: Globe,
      settings: [
        {
          key: 'ENABLE_COMMUNITIES',
          label: 'Activer les communautés',
          description: 'Permettre la création et gestion de communautés',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_COMMUNITIES',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_ANONYMOUS',
          label: 'Activer mode anonyme',
          description: 'Permettre les utilisateurs anonymes via liens de partage',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_ANONYMOUS',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_VOICE_CALLS',
          label: 'Activer appels vocaux',
          description: 'Activer les appels vocaux et vidéo WebRTC',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_VOICE_CALLS',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_REACTIONS',
          label: 'Activer réactions',
          description: 'Permettre les réactions emoji sur les messages',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_REACTIONS',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_MENTIONS',
          label: 'Activer mentions',
          description: 'Permettre les mentions @utilisateur dans les messages',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_MENTIONS',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_NOTIFICATIONS',
          label: 'Activer notifications',
          description: 'Système de notifications en temps réel',
          type: 'boolean',
          value: true,
          defaultValue: true,
          envVar: 'ENABLE_NOTIFICATIONS',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_EMAIL_NOTIFICATIONS',
          label: 'Notifications par email',
          description: 'Envoyer des notifications par email',
          type: 'boolean',
          value: false,
          defaultValue: false,
          envVar: 'ENABLE_EMAIL_NOTIFICATIONS',
          implemented: false,
          category: 'features'
        },
        {
          key: 'ENABLE_MAINTENANCE_MODE',
          label: 'Mode maintenance',
          description: 'Activer le mode maintenance (bloque l\'accès)',
          type: 'boolean',
          value: false,
          defaultValue: false,
          envVar: 'ENABLE_MAINTENANCE_MODE',
          implemented: false,
          category: 'system'
        }
      ]
    }
  ];

  const handleSave = () => {
    // TO IMPLEMENT: Sauvegarder les configurations
    console.log('Sauvegarde des configurations...');
    setHasChanges(false);
  };

  const handleReset = () => {
    // TO IMPLEMENT: Réinitialiser aux valeurs par défaut
    console.log('Réinitialisation aux valeurs par défaut...');
    setHasChanges(false);
  };

  const renderSetting = (setting: ConfigSetting) => {
    const isImplemented = setting.implemented;

    return (
      <div key={setting.key} className="space-y-3 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <Label htmlFor={setting.key} className="text-sm font-medium">
                {setting.label}
              </Label>
              {!isImplemented && (
                <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                  <HelpCircle className="h-3 w-3 mr-1" />
                  TO IMPLEMENT
                </Badge>
              )}
              {setting.envVar && (
                <Badge variant="outline" className="text-xs font-mono">
                  {setting.envVar}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {setting.description}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {setting.type === 'boolean' ? (
            <div className="flex items-center space-x-2">
              <Switch
                id={setting.key}
                checked={setting.value as boolean}
                disabled={!isImplemented}
                onCheckedChange={() => setHasChanges(true)}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {setting.value ? 'Activé' : 'Désactivé'}
              </span>
            </div>
          ) : setting.type === 'select' ? (
            <select
              id={setting.key}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              value={setting.value as string}
              disabled={!isImplemented}
              onChange={() => setHasChanges(true)}
            >
              {setting.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center space-x-2 flex-1">
              <Input
                id={setting.key}
                type={setting.type}
                value={setting.value as string | number}
                disabled={!isImplemented}
                onChange={() => setHasChanges(true)}
                className="flex-1"
              />
              {setting.unit && (
                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {setting.unit}
                </span>
              )}
            </div>
          )}
        </div>

        {setting.defaultValue !== setting.value && isImplemented && (
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <Info className="h-3 w-3" />
            <span>Valeur par défaut : {String(setting.defaultValue)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout currentPage="/admin/settings">
      <div className="space-y-6">
        {/* Header avec gradient */}
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
                <p className="text-slate-100 mt-1">Paramètres globaux et variables d'environnement</p>
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
                onClick={handleReset}
                className="text-white hover:bg-white/20"
                disabled={!hasChanges}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
              <Button
                variant="ghost"
                onClick={handleSave}
                className="text-white hover:bg-white/20 bg-white/10"
                disabled={!hasChanges}
              >
                <Save className="h-4 w-4 mr-2" />
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>

        {/* Alertes importantes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-orange-900 dark:text-orange-100 text-sm">
                    Configuration sensible
                  </h4>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                    Certains paramètres nécessitent un redémarrage du serveur pour prendre effet.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                    Variables d'environnement
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Les paramètres marqués avec un badge ENV sont configurés via fichier .env
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs de configuration */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 gap-2">
            {configSections.map(section => {
              const Icon = section.icon;
              const notImplementedCount = section.settings.filter(s => !s.implemented).length;

              return (
                <TabsTrigger key={section.id} value={section.id} className="relative">
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{section.title.split(' ')[0]}</span>
                  {notImplementedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600"
                    >
                      {notImplementedCount}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {configSections.map(section => (
            <TabsContent key={section.id} value={section.id} className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    {React.createElement(section.icon, {
                      className: 'h-6 w-6 text-slate-600 dark:text-slate-400'
                    })}
                    <div className="flex-1">
                      <CardTitle>{section.title}</CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        {section.settings.filter(s => s.implemented).length}/{section.settings.length} implémentés
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {section.settings.map(setting => renderSetting(setting))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Statistiques des configurations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Lock className="h-5 w-5 text-slate-600" />
              <span>Statut de la configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  {configSections.reduce((acc, section) =>
                    acc + section.settings.filter(s => s.implemented).length, 0
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Paramètres implémentés</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                  {configSections.reduce((acc, section) =>
                    acc + section.settings.filter(s => !s.implemented).length, 0
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">À implémenter</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {configSections.reduce((acc, section) =>
                    acc + section.settings.filter(s => s.category === 'security').length, 0
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Paramètres sécurité</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  {configSections.length}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Catégories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
