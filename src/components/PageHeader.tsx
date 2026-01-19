import { Button } from '@/components/ui/button';
import { LucideIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  backPath?: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
  actions?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  }[];
}

export function PageHeader({ title, subtitle, backPath, action, actions }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-6 md:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {backPath && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(backPath)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {Array.isArray(actions) && actions.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-2 self-start sm:self-auto">
            {actions.map((a) => (
              <Button key={a.label} onClick={a.onClick} variant={a.variant || 'default'}>
                {a.icon && <a.icon className="h-4 w-4 mr-2" />}
                {a.label}
              </Button>
            ))}
          </div>
        ) : action ? (
          <Button onClick={action.onClick} className="self-start sm:self-auto">
            {action.icon && <action.icon className="h-4 w-4 mr-2" />}
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
