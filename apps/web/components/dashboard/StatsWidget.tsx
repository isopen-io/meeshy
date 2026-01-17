import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface StatsWidgetProps {
  title: string;
  value: number;
  subtitle: string;
  icon: LucideIcon;
  gradient: string;
}

export function StatsWidget({ title, value, subtitle, icon: Icon, gradient }: StatsWidgetProps) {
  return (
    <Card className={`${gradient} text-white`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium dark:text-gray-100">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-sm opacity-80">{subtitle}</p>
          </div>
          <Icon className="h-8 w-8 opacity-70" />
        </div>
      </CardContent>
    </Card>
  );
}
