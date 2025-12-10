'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  href?: string;
  className?: string;
  showText?: boolean;
  iconClassName?: string;
  textClassName?: string;
}

/**
 * Logo Large - Pour pages de connexion/inscription
 * Icône + Texte en grand format
 */
export function LargeLogo({ 
  href = '/', 
  className,
  iconClassName,
  textClassName 
}: LogoProps) {
  const LogoContent = (
    <div className={cn("flex flex-col items-center space-y-3", className)}>
      <MessageSquare className={cn("h-16 w-16 text-primary", iconClassName)} />
      <h1 className={cn("text-4xl font-bold text-gray-900 dark:text-white", textClassName)}>
        Meeshy
      </h1>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
        {LogoContent}
      </Link>
    );
  }

  return LogoContent;
}

/**
 * Logo Medium - Pour headers de pages
 * Icône + Texte en format moyen
 */
export function MediumLogo({ 
  href = '/', 
  className,
  showText = true,
  iconClassName,
  textClassName 
}: LogoProps) {
  const LogoContent = (
    <div className={cn("flex items-center space-x-3", className)}>
      <MessageSquare className={cn("h-10 w-10 text-primary", iconClassName)} />
      {showText && (
        <span className={cn("text-2xl font-bold text-gray-900 dark:text-white", textClassName)}>
          Meeshy
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
        {LogoContent}
      </Link>
    );
  }

  return LogoContent;
}

/**
 * Logo Small - Pour navigation bars (style Header)
 * Format identique au AppHeader
 */
export function SmallLogo({ 
  href = '/', 
  className,
  showText = true,
  iconClassName,
  textClassName 
}: LogoProps) {
  const LogoContent = (
    <div className={cn("flex items-center space-x-2", className)}>
      <MessageSquare className={cn("h-8 w-8 text-primary", iconClassName)} />
      {showText && (
        <span className={cn("text-xl font-bold text-gray-900 dark:text-white", textClassName)}>
          Meeshy
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
        {LogoContent}
      </Link>
    );
  }

  return LogoContent;
}

/**
 * Logo Icon Only - Juste l'icône
 */
export function IconLogo({ 
  href = '/', 
  className,
  iconClassName 
}: Omit<LogoProps, 'showText' | 'textClassName'>) {
  const LogoContent = (
    <MessageSquare className={cn("h-10 w-10 text-primary", iconClassName, className)} />
  );

  if (href) {
    return (
      <Link href={href} className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
        {LogoContent}
      </Link>
    );
  }

  return LogoContent;
}

/**
 * Logo Custom - Tailles personnalisables
 */
interface CustomLogoProps extends LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function CustomLogo({ 
  href = '/', 
  className,
  showText = true,
  size = 'md',
  iconClassName,
  textClassName
}: CustomLogoProps) {
  const sizeClasses = {
    xs: { icon: 'h-6 w-6', text: 'text-base', space: 'space-x-1.5' },
    sm: { icon: 'h-8 w-8', text: 'text-xl', space: 'space-x-2' },
    md: { icon: 'h-10 w-10', text: 'text-2xl', space: 'space-x-3' },
    lg: { icon: 'h-12 w-12', text: 'text-3xl', space: 'space-x-3' },
    xl: { icon: 'h-16 w-16', text: 'text-4xl', space: 'space-x-4' },
  };

  const sizes = sizeClasses[size];

  const LogoContent = (
    <div className={cn("flex items-center", sizes.space, className)}>
      <MessageSquare className={cn(sizes.icon, "text-primary", iconClassName)} />
      {showText && (
        <span className={cn(
          sizes.text,
          "font-bold text-gray-900 dark:text-white",
          textClassName
        )}>
          Meeshy
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block cursor-pointer hover:opacity-80 transition-opacity">
        {LogoContent}
      </Link>
    );
  }

  return LogoContent;
}

// Export all as named exports
export default {
  Large: LargeLogo,
  Medium: MediumLogo,
  Small: SmallLogo,
  Icon: IconLogo,
  Custom: CustomLogo,
};
