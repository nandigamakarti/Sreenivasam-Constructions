import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { api } from '@/services/api';
import { Project, Flat } from '@/types';
import { Loader2 } from 'lucide-react';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function Flats() {
  const [flats, setFlats] = useState<(Flat & { project_name: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projects = await api.getProjects();
        const allFlats = await Promise.all(
          projects.map(async (project: Project) => {
            const projectFlats = await api.getFlats(project.id);
            return projectFlats.map((f: Flat) => ({ ...f, project_name: project.name }));
          })
        );
        setFlats(allFlats.flat());
      } catch (error) {
        console.error('Failed to fetch flats:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const columns = [
    { key: 'project_name' as const, header: 'Project' },
    { key: 'flat_no' as const, header: 'Flat No' },
    { key: 'buyer_name' as const, header: 'Buyer', render: (f: Flat & { project_name: string }) => f.buyer_name || '-' },
    { key: 'total_cost' as const, header: 'Total Cost', render: (f: Flat & { project_name: string }) => formatCurrency(f.total_cost) },
    { key: 'paid' as const, header: 'Paid', render: (f: Flat & { project_name: string }) => formatCurrency(f.paid) },
    { key: 'pending' as const, header: 'Pending', render: (f: Flat & { project_name: string }) => formatCurrency(f.total_cost - f.paid) },
    {
      key: 'status' as const,
      header: 'Status',
      render: (f: Flat & { project_name: string }) => {
        const colors = {
          available: 'bg-muted text-muted-foreground',
          booked: 'bg-warning/10 text-warning border-warning/20',
          sold: 'bg-success/10 text-success border-success/20',
        };
        return <Badge variant="outline" className={colors[f.status]}>{f.status}</Badge>;
      },
    },
  ];

  const totalPending = flats.reduce((sum, f) => sum + (f.total_cost - f.paid), 0);

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
          title="All Flats"
          subtitle="View flats across all projects"
        />

        <div className="bg-card rounded-lg border border-border p-4 mb-6 flex gap-6">
          <p className="text-sm text-muted-foreground">
            Total Flats: <span className="font-semibold text-foreground">{flats.length}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Pending Dues: <span className="font-semibold text-foreground">{formatCurrency(totalPending)}</span>
          </p>
        </div>

        <DataTable
          data={flats}
          columns={columns}
          searchKeys={['flat_no', 'buyer_name', 'project_name']}
          emptyMessage="No flats found"
        />
      </div>
    </Layout>
  );
}
