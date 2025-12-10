'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Shield, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface AccessDeniedProps {
  title?: string;
  description?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  variant?: 'forbidden' | 'unauthorized' | 'not-found' | 'error';
  className?: string;
}

export function AccessDenied({
  title,
  description,
  showBackButton = true,
  showHomeButton = true,
  variant = 'forbidden',
  className = ""
}: AccessDeniedProps) {
  const router = useRouter();
  const { t } = useI18n('common');

  const getVariantStyles = () => {
    switch (variant) {
      case 'forbidden':
        return {
          bg: 'bg-gradient-to-br from-red-50 to-orange-100',
          icon: Shield,
          iconColor: 'text-red-500',
          titleColor: 'text-red-700',
          descriptionColor: 'text-red-600'
        };
      case 'unauthorized':
        return {
          bg: 'bg-gradient-to-br from-yellow-50 to-orange-100',
          icon: AlertTriangle,
          iconColor: 'text-yellow-600',
          titleColor: 'text-yellow-700',
          descriptionColor: 'text-yellow-600'
        };
      case 'not-found':
        return {
          bg: 'bg-gradient-to-br from-gray-50 to-gray-100',
          icon: AlertTriangle,
          iconColor: 'text-gray-500',
          titleColor: 'text-gray-700',
          descriptionColor: 'text-gray-600'
        };
      case 'error':
        return {
          bg: 'bg-gradient-to-br from-red-50 to-pink-100',
          icon: AlertTriangle,
          iconColor: 'text-red-500',
          titleColor: 'text-red-700',
          descriptionColor: 'text-red-600'
        };
      default:
        return {
          bg: 'bg-gradient-to-br from-red-50 to-orange-100',
          icon: Shield,
          iconColor: 'text-red-500',
          titleColor: 'text-red-700',
          descriptionColor: 'text-red-600'
        };
    }
  };

  const styles = getVariantStyles();
  const IconComponent = styles.icon;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${styles.bg} ${className}`}>
      <Card className="w-full max-w-md shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className={`p-3 rounded-full bg-white/50 shadow-sm`}>
              <IconComponent className={`h-12 w-12 ${styles.iconColor}`} />
            </div>
          </div>
          <CardTitle className={`text-2xl font-bold ${styles.titleColor}`}>
            {title || t('accessDenied.title')}
          </CardTitle>
          <CardDescription className={`text-base ${styles.descriptionColor}`}>
            {description || t('accessDenied.description')}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {showBackButton && (
              <Button 
                onClick={() => router.back()}
                variant="outline"
                className="flex items-center justify-center space-x-2 flex-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t('accessDenied.back')}</span>
              </Button>
            )}
            
            {showHomeButton && (
              <Button 
                onClick={() => router.push('/')}
                className="flex items-center justify-center space-x-2 flex-1"
              >
                <Home className="h-4 w-4" />
                <span>{t('accessDenied.home')}</span>
              </Button>
            )}
          </div>
          
          {variant === 'forbidden' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                💡 <strong>{t('accessDenied.tip.title')}</strong> {t('accessDenied.tip.message')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
