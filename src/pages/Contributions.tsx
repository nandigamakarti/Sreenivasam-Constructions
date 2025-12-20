import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { api } from '@/services/api';
import { Project, Contribution } from '@/types';
import { Loader2 } from 'lucide-react';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function Contributions() {
  const [contributions, setContributions] = useState<(Contribution & { project_name: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projects = await api.getProjects();
        const allContributions = await Promise.all(
          projects.map(async (project: Project) => {
            const projectContributions = await api.getContributions(project.id);
            return projectContributions.map((c: Contribution) => ({ ...c, project_name: project.name }));
          })
        );
        setContributions(allContributions.flat());
      } catch (error) {
        console.error('Failed to fetch contributions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const columns = [
    { key: 'project_name' as const, header: 'Project' },
    { key: 'partner_name' as const, header: 'Partner Name' },
    { key: 'amount' as const, header: 'Amount', render: (c: Contribution & { project_name: string }) => formatCurrency(c.amount) },
    { key: 'mode' as const, header: 'Mode', render: (c: Contribution & { project_name: string }) => c.mode.replace('_', ' ').toUpperCase() },
    { key: 'date' as const, header: 'Date', render: (c: Contribution & { project_name: string }) => new Date(c.date).toLocaleDateString('en-IN') },
    { key: 'notes' as const, header: 'Notes' },
  ];

  const total = contributions.reduce((sum, c) => sum + c.amount, 0);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="animate-fade-in">
        <PageHeader
          title="All Contributions"
          subtitle="View contributions across all projects"
        />

        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            Total Contributions: <span className="font-semibold text-foreground text-lg">{formatCurrency(total)}</span>
          </p>
        </div>

        <DataTable
          data={contributions}
          columns={columns}
          searchKeys={['partner_name', 'project_name']}
          emptyMessage="No contributions found"
        />
      </div>
    </Layout>
  );
}
