import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { api } from '@/services/api';
import { Project, Expense } from '@/types';
import { Loader2 } from 'lucide-react';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function Expenses() {
  const [expenses, setExpenses] = useState<(Expense & { project_name: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projects = await api.getProjects();
        const allExpenses = await Promise.all(
          projects.map(async (project: Project) => {
            const projectExpenses = await api.getExpenses(project.id);
            return projectExpenses.map((e: Expense) => ({ ...e, project_name: project.name }));
          })
        );
        setExpenses(allExpenses.flat());
      } catch (error) {
        console.error('Failed to fetch expenses:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const columns = [
    { key: 'project_name' as const, header: 'Project' },
    { key: 'title' as const, header: 'Title' },
    { key: 'category' as const, header: 'Category' },
    { key: 'amount' as const, header: 'Amount', render: (e: Expense & { project_name: string }) => formatCurrency(e.amount) },
    { key: 'date' as const, header: 'Date', render: (e: Expense & { project_name: string }) => new Date(e.date).toLocaleDateString('en-IN') },
    { key: 'paid_by' as const, header: 'Paid By' },
    { key: 'vendor_name' as const, header: 'Vendor' },
  ];

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

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
          title="All Expenses"
          subtitle="View expenses across all projects"
        />

        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            Total Expenses: <span className="font-semibold text-foreground text-lg">{formatCurrency(total)}</span>
          </p>
        </div>

        <DataTable
          data={expenses}
          columns={columns}
          searchKeys={['title', 'category', 'project_name']}
          emptyMessage="No expenses found"
        />
      </div>
    </Layout>
  );
}
