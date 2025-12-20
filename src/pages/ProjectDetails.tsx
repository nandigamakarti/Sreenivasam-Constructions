import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { DataTable } from '@/components/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { api } from '@/services/api';
import { Project, Contribution, Expense, Flat } from '@/types';
import { HandCoins, Receipt, Wallet, Building2, AlertCircle, Plus, Loader2, Edit } from 'lucide-react';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog states
  const [contributionDialog, setContributionDialog] = useState(false);
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [flatDialog, setFlatDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Contribution | Expense | null>(null);

  // Form states
  const [contributionForm, setContributionForm] = useState({
    partner_name: '',
    amount: '',
    mode: 'bank_transfer' as Contribution['mode'],
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paid_by: '',
    vendor: '',
    notes: '',
  });

  const [flatForm, setFlatForm] = useState({
    flat_no: '',
    buyer_name: '',
    total_cost: '',
    status: 'available' as Flat['status'],
  });

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [projectData, contributionsData, expensesData, flatsData] = await Promise.all([
        api.getProject(id!),
        api.getContributions(id!),
        api.getExpenses(id!),
        api.getFlats(id!),
      ]);
      setProject(projectData || null);
      setContributions(contributionsData);
      setExpenses(expensesData);
      setFlats(flatsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContribution = async () => {
    if (!contributionForm.partner_name || !contributionForm.amount) {
      toast({ title: 'Error', description: 'Please fill required fields', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await api.updateContribution(editingItem.id, {
          ...contributionForm,
          amount: Number(contributionForm.amount),
        });
        toast({ title: 'Success', description: 'Contribution updated' });
      } else {
        await api.createContribution({
          ...contributionForm,
          project_id: id!,
          amount: Number(contributionForm.amount),
        });
        toast({ title: 'Success', description: 'Contribution added' });
      }
      setContributionDialog(false);
      resetContributionForm();
      fetchData();
    } catch {
      toast({ title: 'Error', description: 'Operation failed', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseForm.title || !expenseForm.amount || !expenseForm.category) {
      toast({ title: 'Error', description: 'Please fill required fields', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await api.updateExpense(editingItem.id, {
          ...expenseForm,
          amount: Number(expenseForm.amount),
        });
        toast({ title: 'Success', description: 'Expense updated' });
      } else {
        await api.createExpense({
          ...expenseForm,
          project_id: id!,
          amount: Number(expenseForm.amount),
        });
        toast({ title: 'Success', description: 'Expense added' });
      }
      setExpenseDialog(false);
      resetExpenseForm();
      fetchData();
    } catch {
      toast({ title: 'Error', description: 'Operation failed', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddFlat = async () => {
    if (!flatForm.flat_no || !flatForm.total_cost) {
      toast({ title: 'Error', description: 'Please fill required fields', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await api.createFlat({
        ...flatForm,
        project_id: id!,
        total_cost: Number(flatForm.total_cost),
        paid: 0,
      });
      toast({ title: 'Success', description: 'Flat added' });
      setFlatDialog(false);
      setFlatForm({ flat_no: '', buyer_name: '', total_cost: '', status: 'available' });
      fetchData();
    } catch {
      toast({ title: 'Error', description: 'Operation failed', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetContributionForm = () => {
    setContributionForm({
      partner_name: '',
      amount: '',
      mode: 'bank_transfer',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setEditingItem(null);
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      title: '',
      category: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      paid_by: '',
      vendor: '',
      notes: '',
    });
    setEditingItem(null);
  };

  const openEditContribution = (contribution: Contribution) => {
    setEditingItem(contribution);
    setContributionForm({
      partner_name: contribution.partner_name,
      amount: contribution.amount.toString(),
      mode: contribution.mode,
      date: contribution.date,
      notes: contribution.notes || '',
    });
    setContributionDialog(true);
  };

  const openEditExpense = (expense: Expense) => {
    setEditingItem(expense);
    setExpenseForm({
      title: expense.title,
      category: expense.category,
      amount: expense.amount.toString(),
      date: expense.date,
      paid_by: expense.paid_by,
      vendor: expense.vendor || '',
      notes: expense.notes || '',
    });
    setExpenseDialog(true);
  };

  if (isLoading || !project) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const totalContributions = contributions.reduce((sum, c) => sum + c.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const balance = totalContributions - totalExpenses;

  const contributionColumns = [
    { key: 'partner_name' as const, header: 'Partner Name' },
    { key: 'amount' as const, header: 'Amount', render: (c: Contribution) => formatCurrency(c.amount) },
    { key: 'mode' as const, header: 'Mode', render: (c: Contribution) => c.mode.replace('_', ' ').toUpperCase() },
    { key: 'date' as const, header: 'Date', render: (c: Contribution) => new Date(c.date).toLocaleDateString('en-IN') },
    { key: 'notes' as const, header: 'Notes' },
    {
      key: 'actions',
      header: '',
      render: (c: Contribution) => (
        <Button variant="ghost" size="sm" onClick={() => openEditContribution(c)}>
          <Edit className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const expenseColumns = [
    { key: 'title' as const, header: 'Title' },
    { key: 'category' as const, header: 'Category' },
    { key: 'amount' as const, header: 'Amount', render: (e: Expense) => formatCurrency(e.amount) },
    { key: 'date' as const, header: 'Date', render: (e: Expense) => new Date(e.date).toLocaleDateString('en-IN') },
    { key: 'paid_by' as const, header: 'Paid By' },
    {
      key: 'actions',
      header: '',
      render: (e: Expense) => (
        <Button variant="ghost" size="sm" onClick={() => openEditExpense(e)}>
          <Edit className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const flatColumns = [
    { key: 'flat_no' as const, header: 'Flat No' },
    { key: 'buyer_name' as const, header: 'Buyer', render: (f: Flat) => f.buyer_name || '-' },
    { key: 'total_cost' as const, header: 'Total Cost', render: (f: Flat) => formatCurrency(f.total_cost) },
    { key: 'paid' as const, header: 'Paid', render: (f: Flat) => formatCurrency(f.paid) },
    { key: 'pending' as const, header: 'Pending', render: (f: Flat) => formatCurrency(f.total_cost - f.paid) },
    {
      key: 'status' as const,
      header: 'Status',
      render: (f: Flat) => {
        const colors = {
          available: 'bg-muted text-muted-foreground',
          booked: 'bg-warning/10 text-warning',
          sold: 'bg-success/10 text-success',
        };
        return <Badge variant="outline" className={colors[f.status]}>{f.status}</Badge>;
      },
    },
  ];

  return (
    <Layout>
      <div className="animate-fade-in">
        <PageHeader
          title={project.name}
          subtitle={project.location}
          backPath="/projects"
        />

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto gap-1">
            <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
            <TabsTrigger value="contributions" className="text-sm">Contributions</TabsTrigger>
            <TabsTrigger value="expenses" className="text-sm">Expenses</TabsTrigger>
            <TabsTrigger value="flats" className="text-sm">Flats</TabsTrigger>
            <TabsTrigger value="reports" className="text-sm">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Contributions" value={formatCurrency(totalContributions)} icon={HandCoins} iconClassName="bg-success" />
              <StatCard title="Total Expenses" value={formatCurrency(totalExpenses)} icon={Receipt} iconClassName="bg-destructive" />
              <StatCard title="Balance" value={formatCurrency(balance)} icon={Wallet} iconClassName="bg-primary" />
              <StatCard title="Handler Due" value={formatCurrency(project.handler_reimbursement_due)} icon={AlertCircle} iconClassName="bg-warning" />
            </div>
          </TabsContent>

          <TabsContent value="contributions" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Partner Contributions</h2>
              <Button onClick={() => { resetContributionForm(); setContributionDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Contribution
              </Button>
            </div>
            <div className="bg-card rounded-lg border border-border p-4 mb-4">
              <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatCurrency(totalContributions)}</span></p>
            </div>
            <DataTable data={contributions} columns={contributionColumns} searchKeys={['partner_name']} onExport={() => toast({ title: 'Export', description: 'Downloading Excel...' })} />
          </TabsContent>

          <TabsContent value="expenses" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Project Expenses</h2>
              <Button onClick={() => { resetExpenseForm(); setExpenseDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Expense
              </Button>
            </div>
            <div className="bg-card rounded-lg border border-border p-4 mb-4 flex gap-6">
              <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatCurrency(totalExpenses)}</span></p>
              <p className="text-sm text-muted-foreground">Balance: <span className="font-semibold text-foreground">{formatCurrency(balance)}</span></p>
            </div>
            <DataTable data={expenses} columns={expenseColumns} searchKeys={['title', 'category']} onExport={() => toast({ title: 'Export', description: 'Downloading Excel...' })} />
          </TabsContent>

          <TabsContent value="flats" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Flats & Installments</h2>
              <Button onClick={() => setFlatDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />Add Flat
              </Button>
            </div>
            <DataTable data={flats} columns={flatColumns} searchKeys={['flat_no', 'buyer_name']} onExport={() => toast({ title: 'Export', description: 'Downloading Excel...' })} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <h2 className="text-lg font-semibold">Download Reports</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {['Contribution Report', 'Expense Report', 'Flat Report', 'Full Project Report'].map((report) => (
                <Button key={report} variant="outline" className="h-24 flex-col" onClick={() => toast({ title: 'Download', description: `Generating ${report}...` })}>
                  <span className="font-medium">{report}</span>
                  <span className="text-xs text-muted-foreground mt-1">Excel</span>
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Contribution Dialog */}
        <Dialog open={contributionDialog} onOpenChange={(open) => { setContributionDialog(open); if (!open) resetContributionForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Contribution</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Partner Name *</Label>
                  <Input value={contributionForm.partner_name} onChange={(e) => setContributionForm({ ...contributionForm, partner_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input type="number" value={contributionForm.amount} onChange={(e) => setContributionForm({ ...contributionForm, amount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={contributionForm.mode} onValueChange={(v) => setContributionForm({ ...contributionForm, mode: v as Contribution['mode'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={contributionForm.date} onChange={(e) => setContributionForm({ ...contributionForm, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={contributionForm.notes} onChange={(e) => setContributionForm({ ...contributionForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setContributionDialog(false)}>Cancel</Button>
              <Button onClick={handleAddContribution} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingItem ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Expense Dialog */}
        <Dialog open={expenseDialog} onOpenChange={(open) => { setExpenseDialog(open); if (!open) resetExpenseForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Input value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} placeholder="e.g. Construction, Legal" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Paid By</Label>
                  <Input value={expenseForm.paid_by} onChange={(e) => setExpenseForm({ ...expenseForm, paid_by: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Input value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExpenseDialog(false)}>Cancel</Button>
              <Button onClick={handleAddExpense} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingItem ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Flat Dialog */}
        <Dialog open={flatDialog} onOpenChange={setFlatDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Flat</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Flat No *</Label>
                  <Input value={flatForm.flat_no} onChange={(e) => setFlatForm({ ...flatForm, flat_no: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Buyer Name</Label>
                  <Input value={flatForm.buyer_name} onChange={(e) => setFlatForm({ ...flatForm, buyer_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Cost *</Label>
                  <Input type="number" value={flatForm.total_cost} onChange={(e) => setFlatForm({ ...flatForm, total_cost: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={flatForm.status} onValueChange={(v) => setFlatForm({ ...flatForm, status: v as Flat['status'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="booked">Booked</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFlatDialog(false)}>Cancel</Button>
              <Button onClick={handleAddFlat} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Add Flat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
