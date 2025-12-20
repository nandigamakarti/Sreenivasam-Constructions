import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { DashboardStats } from '@/types';
import { 
  FolderKanban, 
  HandCoins, 
  Receipt, 
  Wallet, 
  Building2, 
  Clock,
  Loader2
} from 'lucide-react';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.getDashboardStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const quickActions = [
    { label: 'Projects', icon: FolderKanban, path: '/projects' },
    { label: 'Contributions', icon: HandCoins, path: '/contributions' },
    { label: 'Expenses', icon: Receipt, path: '/expenses' },
    { label: 'Flats', icon: Building2, path: '/flats' },
  ];

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all construction projects</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <StatCard
            title="Total Projects"
            value={stats?.total_projects || 0}
            icon={FolderKanban}
          />
          <StatCard
            title="Total Contributions"
            value={formatCurrency(stats?.total_contributions || 0)}
            icon={HandCoins}
            iconClassName="bg-success text-success-foreground"
          />
          <StatCard
            title="Total Expenses"
            value={formatCurrency(stats?.total_expenses || 0)}
            icon={Receipt}
            iconClassName="bg-destructive text-destructive-foreground"
          />
          <StatCard
            title="Remaining Balance"
            value={formatCurrency(stats?.remaining_balance || 0)}
            icon={Wallet}
            iconClassName="bg-primary text-primary-foreground"
          />
          <StatCard
            title="Total Flats"
            value={stats?.flats_count || 0}
            icon={Building2}
            iconClassName="bg-accent text-accent-foreground"
          />
          <StatCard
            title="Pending Dues"
            value={formatCurrency(stats?.pending_dues || 0)}
            icon={Clock}
            iconClassName="bg-warning text-warning-foreground"
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-card-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.path}
                variant="outline"
                className="h-auto py-6 flex flex-col gap-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
                onClick={() => navigate(action.path)}
              >
                <action.icon className="h-6 w-6" />
                <span className="font-medium">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
