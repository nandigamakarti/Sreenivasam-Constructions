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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

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
  const [projectLookup, setProjectLookup] = useState('');
  const [isOpeningProject, setIsOpeningProject] = useState(false);
  const navigate = useNavigate();

  const pieColors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0ea5e9', '#db2777'];

  const toNumber = (v: unknown) => {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  };

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

  const openProject = async () => {
    const raw = String(projectLookup || '').trim();
    if (!raw) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
    setIsOpeningProject(true);
    try {
      if (isUuid) {
        navigate(`/projects/${raw}`);
        return;
      }
      const p = await api.getProjectByCode(raw);
      navigate(`/projects/${p.id}`);
    } catch (err) {
      console.error('Failed to open project:', err);
    } finally {
      setIsOpeningProject(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all construction projects</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <div className="text-sm font-medium text-muted-foreground">Open Project</div>
            <div className="flex-1 flex flex-col sm:flex-row gap-2">
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter Project Code or Project ID"
                value={projectLookup}
                onChange={(e) => setProjectLookup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openProject();
                }}
              />
              <Button onClick={openProject} disabled={isOpeningProject || !projectLookup.trim()}>
                {isOpeningProject ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Open
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <StatCard
            title="Total Projects"
            value={stats?.total_projects || 0}
            icon={FolderKanban}
            onClick={() => navigate('/projects')}
          />
          <StatCard
            title="Total Contribution"
            value={formatCurrency(stats?.total_contribution || 0)}
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
            title="Cash Balance"
            value={formatCurrency(stats?.cash_balance || 0)}
            icon={Wallet}
            iconClassName="bg-primary text-primary-foreground"
          />
          <StatCard
            title="Buyer Payments Received"
            value={formatCurrency(stats?.total_buyer_payments_received || 0)}
            icon={Building2}
            iconClassName="bg-accent text-accent-foreground"
          />
          <StatCard
            title="Buyer Pending Amount"
            value={formatCurrency(stats?.total_buyer_pending || 0)}
            icon={Clock}
            iconClassName="bg-warning text-warning-foreground"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-card-foreground mb-1">Contributions vs Expenses vs Balance</h2>
            <p className="text-sm text-muted-foreground mb-4">Overall financial split</p>

            {!stats ? (
              <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Total Contribution', value: toNumber(stats.total_contribution) },
                        { name: 'Buyer Payments', value: toNumber(stats.total_buyer_payments_received) },
                        { name: 'Total Expenses', value: toNumber(stats.total_expenses) },
                        { name: 'Cash Balance', value: Math.max(toNumber(stats.cash_balance), 0) },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                    >
                      {[0, 1, 2, 3].map((idx) => (
                        <Cell key={`donut-${idx}`} fill={pieColors[idx % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [formatCurrency(toNumber(value)), String(name)]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-card-foreground mb-1">Monthly In vs Out Trend</h2>
            <p className="text-sm text-muted-foreground mb-4">Contributions vs expenses by month</p>

            {!stats ? (
              <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthly_flow.map((m) => ({ month: m.month, in: toNumber(m.account_credit_in) + toNumber(m.buyer_payments_in), out: toNumber(m.expenses_out) }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [formatCurrency(toNumber(value)), String(name)]}
                    />
                    <Legend />
                    <Bar dataKey="in" name="In" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="out" name="Out" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-card-foreground mb-1">Expense Category Split</h2>
          <p className="text-sm text-muted-foreground mb-4">Where money is going</p>

          {!stats ? (
            <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.expense_category_split.map((c) => ({ name: c.category, value: toNumber(c.amount) }))} dataKey="value" nameKey="name" outerRadius={100}>
                    {stats.expense_category_split.map((_, idx) => (
                      <Cell key={`cat-${idx}`} fill={pieColors[(idx + 2) % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [formatCurrency(toNumber(value)), String(name)]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
