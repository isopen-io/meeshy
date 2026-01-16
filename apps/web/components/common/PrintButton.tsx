'use client';

import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface PrintButtonProps {
  label?: string;
}

export function PrintButton({ label = 'Imprimer' }: PrintButtonProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Button onClick={handlePrint} variant="outline" className="flex items-center space-x-2">
      <Printer className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}
