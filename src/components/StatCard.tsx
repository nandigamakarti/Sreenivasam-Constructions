import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
  iconClassName?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className, iconClassName }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow duration-200",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl md:text-3xl font-display font-bold text-card-foreground">{value}</p>
          {trend && (
            <p className={cn(
              "text-xs font-medium",
              trend.positive ? "text-success" : "text-destructive"
            )}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn(
          "p-3 rounded-lg",
          iconClassName || "bg-primary/10"
        )}>
          <Icon className={cn("h-6 w-6", iconClassName ? "text-card" : "text-primary")} />
        </div>
      </div>
    </div>
  );
}
