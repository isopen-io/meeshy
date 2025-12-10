'use client';

interface TranslationProviderProps {
  children: React.ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  // This component is no longer needed as we use LanguageContext directly
  // We keep it only for compatibility but it just renders children
  return <>{children}</>;
}
