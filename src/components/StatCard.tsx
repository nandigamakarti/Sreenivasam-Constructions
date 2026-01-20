import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
  iconClassName?: string;
  onClick?: () => void;
  to?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className, iconClassName, onClick, to }: StatCardProps) {
  const isInteractive = Boolean(to || onClick);

  const cardClassName = cn(
    "bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow duration-200",
    isInteractive ? "cursor-pointer hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" : null,
    className,
  );

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl md:text-3xl font-display font-bold text-card-foreground">{value}</p>
          {trend && (
            <p
              className={cn(
                "text-xs font-medium",
                trend.positive ? "text-success" : "text-destructive",
              )}
            >
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-lg", iconClassName || "bg-primary/10")}>
          <Icon className={cn("h-6 w-6", iconClassName ? "text-card" : "text-primary")} />
        </div>
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cardClassName} aria-label={title}>
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cardClassName}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {content}
    </div>
  );
}
