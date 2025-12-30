import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { DataTable } from '@/components/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { api } from '@/services/api';
import { Project, Contribution, Expense, Flat, ProjectSummary, ProjectContractor, Installment } from '@/types';
import { HandCoins, Receipt, Wallet, Building2, AlertCircle, Plus, Loader2, Edit, Trash2, ExternalLink, FileText, Image } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const toFiniteNumber = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (amount: unknown) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(toFiniteNumber(amount));
};

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [contractors, setContractors] = useState<ProjectContractor[]>([]);
  const [installmentsDialogOpen, setInstallmentsDialogOpen] = useState(false);
  const [installmentsFlat, setInstallmentsFlat] = useState<Flat | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentForm, setInstallmentForm] = useState({
    amount: '' as string,
    date: new Date().toISOString().split('T')[0],
    mode: 'bank_transfer' as Installment['mode'],
    notes: '' as string,
  });
  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [elevationDialogOpen, setElevationDialogOpen] = useState(false);
  const [elevationUrl, setElevationUrl] = useState<string>('');
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Dialog states
  const [contributionDialog, setContributionDialog] = useState(false);
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [flatDialog, setFlatDialog] = useState(false);
  const [contractorDialog, setContractorDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Contribution | Expense | null>(null);
  const [editingFlat, setEditingFlat] = useState<Flat | null>(null);
  const [editingContractor, setEditingContractor] = useState<ProjectContractor | null>(null);

  const [selectedPartnerForReport, setSelectedPartnerForReport] = useState<string>('');
  const [isDownloadingPartnerReport, setIsDownloadingPartnerReport] = useState(false);

  // Form states
  const [contributionForm, setContributionForm] = useState({
    partner_name: '',
    partner_email: '',
    amount: '',
    contribution_type: 'account_credit' as Contribution['contribution_type'],
    vendor_name: '',
    purpose: '',
    proof: '',
    contractor_id: '' as string,
    mode: 'bank_transfer' as Contribution['mode'],
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [contribFilterPartner, setContribFilterPartner] = useState<string>('all');
  const [contribFilterType, setContribFilterType] = useState<'all' | Contribution['contribution_type']>('all');
  const [contribFilterFrom, setContribFilterFrom] = useState<string>('');
  const [contribFilterTo, setContribFilterTo] = useState<string>('');

  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paid_by: '',
    vendor_name: '',
    notes: '',
    contractor_id: '' as string,
  });

  const [projectSqft, setProjectSqft] = useState<string>('');
  const [contractorForm, setContractorForm] = useState({
    contractor_name: '',
    type: 'fixed' as ProjectContractor['type'],
    fixed_amount: '',
    rate_per_sqft: '',
  });

  const [flatForm, setFlatForm] = useState({
    flat_no: '',
    buyer_name: '',
    total_cost: '',
    status: 'available' as Flat['status'],
  });

  // Get unique partners from existing contributions
  const existingPartners = Array.from(
    new Map(
      contributions
        .filter(c => c.partner_name && c.partner_email)
        .map(c => [c.partner_name, { name: c.partner_name, email: c.partner_email }])
    ).values()
  );
  const [isNewPartner, setIsNewPartner] = useState(true);

  const filteredContributions = contributions.filter((c) => {
    const partnerOk = contribFilterPartner === 'all' ? true : (c.partner_name || '').trim() === contribFilterPartner;
    const typeOk = contribFilterType === 'all' ? true : (c.contribution_type || 'account_credit') === contribFilterType;
    const dateStr = c.date;
    const fromOk = contribFilterFrom ? dateStr >= contribFilterFrom : true;
    const toOk = contribFilterTo ? dateStr <= contribFilterTo : true;
    return partnerOk && typeOk && fromOk && toOk;
  });

  const filteredTotalsByPartner = Array.from(
    filteredContributions.reduce((map, c) => {
      const name = (c.partner_name || '').trim() || 'Unknown';
      const amount = Number(c.amount || 0);
      map.set(name, (map.get(name) || 0) + (Number.isFinite(amount) ? amount : 0));
      return map;
    }, new Map<string, number>())
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const filteredAccountCredits = filteredContributions.reduce((sum, c) => {
    const amt = Number(c.amount || 0);
    if ((c.contribution_type || 'account_credit') !== 'account_credit') return sum;
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);

  const filteredDirectExpenses = filteredContributions.reduce((sum, c) => {
    const amt = Number(c.amount || 0);
    if ((c.contribution_type || 'account_credit') !== 'direct_expense') return sum;
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);

  const filteredTotalContribution = filteredAccountCredits + filteredDirectExpenses;

  const contributionTotalsByPartner = Array.from(
    contributions.reduce((map, c) => {
      const name = (c.partner_name || '').trim() || 'Unknown';
      const amount = Number(c.amount || 0);
      map.set(name, (map.get(name) || 0) + (Number.isFinite(amount) ? amount : 0));
      return map;
    }, new Map<string, number>())
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const expenseTotalsByCategory = Array.from(
    expenses.reduce((map, e) => {
      const cat = (e.category || '').trim() || 'Uncategorized';
      const amount = Number(e.amount || 0);
      map.set(cat, (map.get(cat) || 0) + (Number.isFinite(amount) ? amount : 0));
      return map;
    }, new Map<string, number>())
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const totalContributionAmount = contributionTotalsByPartner.reduce((sum, p) => sum + Number(p.total || 0), 0);
  const totalExpenseAmount = expenseTotalsByCategory.reduce((sum, p) => sum + Number(p.total || 0), 0);

  useEffect(() => {
    if (!selectedPartnerForReport && contributionTotalsByPartner.length > 0) {
      setSelectedPartnerForReport(contributionTotalsByPartner[0].name);
    }
  }, [selectedPartnerForReport, contributionTotalsByPartner]);

  const pieColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0ea5e9', '#db2777'];

  const handleDownloadPartnerReport = async () => {
    if (!id) return;
    const partnerName = (selectedPartnerForReport || '').trim();
    if (!partnerName) {
      toast({ title: 'Select Partner', description: 'Please select a partner to download the report', variant: 'destructive' });
      return;
    }

    setIsDownloadingPartnerReport(true);
    toast({ title: 'Preparing…', description: 'Generating partner Excel report. Please wait.' });

    try {
      const result = await api.getContributorContributionsReport(id, partnerName);
      const blob = result.blob;
      const fallbackName = `${partnerName.replace(/[^a-z0-9]/gi, '_')}-contributions.xlsx`;
      const filename = result.filename || fallbackName;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      toast({ title: 'Downloaded', description: 'Partner report downloaded successfully.' });
    } catch (error) {
      console.error('Partner report download error:', error);
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Failed to download partner report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingPartnerReport(false);
    }
  };

  const resetInstallmentForm = () => {
    setInstallmentForm({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      mode: 'bank_transfer',
      notes: '',
    });
    setEditingInstallment(null);
  };

  const openInstallments = async (flat: Flat) => {
    setInstallmentsFlat(flat);
    setInstallments([]);
    resetInstallmentForm();
    setInstallmentsDialogOpen(true);
    try {
      const data = await api.getInstallments(flat.id);
      setInstallments(data || []);
    } catch (e) {
      console.error('Failed to load installments:', e);
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load installments',
        variant: 'destructive',
      });
    }
  };

  const openEditInstallment = (i: Installment) => {
    setEditingInstallment(i);
    setInstallmentForm({
      amount: String(i.amount ?? ''),
      date: String(i.date || new Date().toISOString().split('T')[0]),
      mode: (i.mode || 'bank_transfer') as Installment['mode'],
      notes: String(i.notes || ''),
    });
  };

  const handleSaveInstallment = async () => {
    if (!installmentsFlat) return;
    if (!installmentForm.amount) {
      toast({ title: 'Error', description: 'Amount is required', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingInstallment) {
        await api.updateInstallment(editingInstallment.id, {
          amount: Number(installmentForm.amount),
          date: installmentForm.date,
          mode: installmentForm.mode,
          notes: installmentForm.notes,
        });
        toast({ title: 'Updated', description: 'Installment updated' });
      } else {
        await api.createInstallment({
          flat_id: installmentsFlat.id,
          amount: Number(installmentForm.amount),
          date: installmentForm.date,
          mode: installmentForm.mode,
          notes: installmentForm.notes,
        } as any);
        toast({ title: 'Added', description: 'Installment added' });
      }

      const data = await api.getInstallments(installmentsFlat.id);
      setInstallments(data || []);
      resetInstallmentForm();
      fetchData();
    } catch (e) {
      console.error('Failed to save installment:', e);
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to save installment', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInstallment = async (i: Installment) => {
    if (!installmentsFlat) return;
    if (!window.confirm('Delete installment?')) return;
    setIsSubmitting(true);
    try {
      await api.deleteInstallment(i.id);
      toast({ title: 'Deleted', description: 'Installment deleted' });
      const data = await api.getInstallments(installmentsFlat.id);
      setInstallments(data || []);
      resetInstallmentForm();
      fetchData();
    } catch (e) {
      console.error('Failed to delete installment:', e);
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete installment', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    // Wait for auth to be ready before fetching data
    if (!authLoading && isAuthenticated && id) {
      fetchData();
    } else if (!authLoading && !isAuthenticated) {
      setIsLoading(false);
    }
  }, [id, authLoading, isAuthenticated]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [projectRes, summaryRes, contributionsRes, expensesRes, flatsRes] = await Promise.allSettled([
        api.getProject(id!),
        api.getProjectSummary(id!),
        api.getContributions(id!),
        api.getExpenses(id!),
        api.getFlats(id!),
      ]);

      if (projectRes.status === 'fulfilled') {
        setProject(projectRes.value || null);
        setProjectSqft(String(projectRes.value?.project_total_sqft ?? ''));
        setElevationUrl(String(projectRes.value?.elevation_image_url ?? ''));
      } else {
        setProject(null);
        toast({
          title: 'Error',
          description: projectRes.reason instanceof Error ? projectRes.reason.message : 'Failed to load project',
          variant: 'destructive',
        });
      }

      if (summaryRes.status === 'fulfilled') setProjectSummary(summaryRes.value || null);
      else setProjectSummary(null);

      if (contributionsRes.status === 'fulfilled') setContributions(contributionsRes.value || []);
      else {
        setContributions([]);
        toast({
          title: 'Warning',
          description: contributionsRes.reason instanceof Error ? contributionsRes.reason.message : 'Failed to load contributions',
          variant: 'destructive',
        });
      }

      if (expensesRes.status === 'fulfilled') setExpenses(expensesRes.value || []);
      else {
        setExpenses([]);
        toast({
          title: 'Warning',
          description: expensesRes.reason instanceof Error ? expensesRes.reason.message : 'Failed to load expenses',
          variant: 'destructive',
        });
      }

      if (flatsRes.status === 'fulfilled') setFlats(flatsRes.value || []);
      else {
        setFlats([]);
        toast({
          title: 'Warning',
          description: flatsRes.reason instanceof Error ? flatsRes.reason.message : 'Failed to load flats',
          variant: 'destructive',
        });
      }

      setContractors([]);

      try {
        const contractorsData = await api.getProjectContractors(id!);
        setContractors(contractorsData || []);
      } catch (e) {
        console.error('Failed to list contractors:', e);
        toast({
          title: 'Error',
          description: e instanceof Error ? e.message : 'Failed to list contractors',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load project data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContribution = async () => {
    if (!contributionForm.partner_name || !contributionForm.amount) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    // Only require email for new partners
    if (isNewPartner && !contributionForm.partner_email) {
      toast({ title: 'Error', description: 'Partner email is required for new partners', variant: 'destructive' });
      return;
    }
    if (contributionForm.contribution_type === 'direct_expense') {
      if (!contributionForm.vendor_name || !contributionForm.purpose) {
        toast({ title: 'Error', description: 'Vendor name and purpose are required for direct expense', variant: 'destructive' });
        return;
      }
    }
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await api.updateContribution(editingItem.id, {
          ...contributionForm,
          amount: Number(contributionForm.amount),
          contractor_id: contributionForm.contractor_id || null,
        });
        toast({ title: 'Success', description: 'Contribution updated' });
      } else {
        await api.createContribution({
          ...contributionForm,
          project_id: id!,
          amount: Number(contributionForm.amount),
          contractor_id: contributionForm.contractor_id || null,
        });
        toast({ title: 'Success', description: 'Contribution added' });
      }
      setContributionDialog(false);
      resetContributionForm();
      fetchData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Operation failed',
        variant: 'destructive',
      });
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
          contractor_id: expenseForm.contractor_id || null,
        });
        toast({ title: 'Success', description: 'Expense updated' });
      } else {
        await api.createExpense({
          ...expenseForm,
          project_id: id!,
          amount: Number(expenseForm.amount),
          contractor_id: expenseForm.contractor_id || null,
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
      if (editingFlat) {
        await api.updateFlat(editingFlat.id, {
          flat_no: flatForm.flat_no,
          buyer_name: flatForm.buyer_name,
          total_cost: Number(flatForm.total_cost),
          status: flatForm.status,
        } as any);
        toast({ title: 'Success', description: 'Flat updated' });
      } else {
        await api.createFlat({
          ...flatForm,
          project_id: id!,
          total_cost: Number(flatForm.total_cost),
          paid: 0,
        });
        toast({ title: 'Success', description: 'Flat added' });
      }
      setFlatDialog(false);
      setEditingFlat(null);
      setFlatForm({ flat_no: '', buyer_name: '', total_cost: '', status: 'available' });
      fetchData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Operation failed',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditFlat = (f: Flat) => {
    setEditingFlat(f);
    setFlatForm({
      flat_no: f.flat_no,
      buyer_name: f.buyer_name || '',
      total_cost: String(f.total_cost ?? ''),
      status: f.status,
    });
    setFlatDialog(true);
  };

  const resetContributionForm = () => {
    setContributionForm({
      partner_name: '',
      partner_email: '',
      amount: '',
      contribution_type: 'account_credit',
      vendor_name: '',
      purpose: '',
      proof: '',
      contractor_id: '',
      mode: 'bank_transfer',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setEditingItem(null);
    setIsNewPartner(true);
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      title: '',
      category: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      paid_by: '',
      vendor_name: '',
      notes: '',
      contractor_id: '',
    });
    setEditingItem(null);
  };

  const openEditContribution = (contribution: Contribution) => {
    setEditingItem(contribution);
    setContributionForm({
      partner_name: contribution.partner_name,
      partner_email: contribution.partner_email || '',
      amount: contribution.amount.toString(),
      contribution_type: contribution.contribution_type || 'account_credit',
      vendor_name: contribution.vendor_name || '',
      purpose: contribution.purpose || '',
      proof: contribution.proof || '',
      contractor_id: (contribution.contractor_id as string) || '',
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
      vendor_name: expense.vendor_name || '',
      notes: expense.notes || '',
      contractor_id: (expense.contractor_id as string) || '',
    });
    setExpenseDialog(true);
  };

  const resetContractorForm = () => {
    setContractorForm({ contractor_name: '', type: 'fixed', fixed_amount: '', rate_per_sqft: '' });
    setEditingContractor(null);
  };

  const openAddContractor = () => {
    resetContractorForm();
    setContractorDialog(true);
  };

  const openEditContractor = (c: ProjectContractor) => {
    setEditingContractor(c);
    setContractorForm({
      contractor_name: c.contractor_name,
      type: c.type,
      fixed_amount: c.fixed_amount != null ? String(c.fixed_amount) : '',
      rate_per_sqft: c.rate_per_sqft != null ? String(c.rate_per_sqft) : '',
    });
    setContractorDialog(true);
  };

  const handleSaveProjectSqft = async () => {
    if (!project) return;
    setIsSubmitting(true);
    try {
      await api.updateProject(project.id, { project_total_sqft: projectSqft ? Number(projectSqft) : null });
      toast({ title: 'Saved', description: 'Project total sqft updated' });
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to update sqft', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveContractor = async () => {
    if (!project) return;
    if (!contractorForm.contractor_name) {
      toast({ title: 'Error', description: 'Contractor name is required', variant: 'destructive' });
      return;
    }
    if (contractorForm.type === 'fixed' && !contractorForm.fixed_amount) {
      toast({ title: 'Error', description: 'Fixed amount is required', variant: 'destructive' });
      return;
    }
    if (contractorForm.type === 'per_sqft' && !contractorForm.rate_per_sqft) {
      toast({ title: 'Error', description: 'Rate per sqft is required', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingContractor) {
        await api.updateContractor(editingContractor.id, {
          contractor_name: contractorForm.contractor_name,
          type: contractorForm.type,
          fixed_amount: contractorForm.type === 'fixed' ? Number(contractorForm.fixed_amount) : null,
          rate_per_sqft: contractorForm.type === 'per_sqft' ? Number(contractorForm.rate_per_sqft) : null,
        });
        toast({ title: 'Updated', description: 'Contractor updated' });
      } else {
        await api.createContractor({
          project_id: project.id,
          contractor_name: contractorForm.contractor_name,
          type: contractorForm.type,
          fixed_amount: contractorForm.type === 'fixed' ? Number(contractorForm.fixed_amount) : undefined,
          rate_per_sqft: contractorForm.type === 'per_sqft' ? Number(contractorForm.rate_per_sqft) : undefined,
        });
        toast({ title: 'Added', description: 'Contractor added' });
      }
      setContractorDialog(false);
      resetContractorForm();
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save contractor', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContractor = async (c: ProjectContractor) => {
    if (!window.confirm('Delete contractor?')) return;
    setIsSubmitting(true);
    try {
      await api.deleteContractor(c.id);
      toast({ title: 'Deleted', description: 'Contractor deleted' });
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete contractor', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto py-16">
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="text-lg font-semibold mb-2">Project failed to load</div>
            <div className="text-sm text-muted-foreground mb-4">Please retry. If this persists, check backend logs and Supabase connectivity.</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/projects')}>Back</Button>
              <Button onClick={() => fetchData()}>Retry</Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const totalContributions = toFiniteNumber(projectSummary?.total_contribution);
  const totalExpenses = toFiniteNumber(projectSummary?.total_expenses);
  const cashBalance = toFiniteNumber(projectSummary?.cash_balance);
  const totalAccountCredits = toFiniteNumber(projectSummary?.total_account_credits);
  const totalDirectContributions = toFiniteNumber(projectSummary?.total_direct_contributions);

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
    {
      key: 'paid' as const,
      header: 'Paid',
      render: (f: Flat) => formatCurrency((f as any).paid_amount ?? f.paid ?? 0),
    },
    {
      key: 'pending' as const,
      header: 'Pending',
      render: (f: Flat) => formatCurrency(toFiniteNumber(f.total_cost) - toFiniteNumber((f as any).paid_amount ?? f.paid ?? 0)),
    },
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
    {
      key: 'actions',
      header: '',
      render: (f: Flat) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEditFlat(f)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => openInstallments(f)}>
            Installments
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <div className="animate-fade-in">
        <PageHeader
          title={project.name}
          subtitle={
            <div className="flex flex-col gap-1">
              <div>{project.location}</div>
              {project.project_code ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Code:</span>
                  <span className="font-mono text-foreground">{project.project_code}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(String(project.project_code));
                        toast({ title: 'Copied', description: 'Project code copied.' });
                      } catch {
                        toast({ title: 'Copy failed', description: 'Could not copy project code.', variant: 'destructive' });
                      }
                    }}
                  >
                    Copy
                  </Button>
                </div>
              ) : null}
            </div>
          }
          backPath="/projects"
          actions={[
            ...(String(project.status || '').toLowerCase() === 'completed'
              ? []
              : [
                  {
                    label: 'Mark Completed',
                    icon: AlertCircle,
                    variant: 'outline' as const,
                    onClick: () => setCompleteDialogOpen(true),
                  },
                ]),
            {
              label: 'Contracts',
              icon: FileText,
              variant: 'outline' as const,
              onClick: () => setActiveTab('contracts'),
            },
            {
              label: 'Project Docs',
              icon: ExternalLink,
              variant: 'outline' as const,
              onClick: () => {
                const url = (project.project_docs_folder_url || '').trim();
                if (!url) {
                  toast({ title: 'No link', description: 'No Project Docs folder URL set for this project.', variant: 'destructive' });
                  return;
                }
                window.open(url, '_blank', 'noopener,noreferrer');
              },
            },
            {
              label: 'Elevation',
              icon: Image,
              variant: 'outline' as const,
              onClick: () => {
                const url = (project.elevation_image_url || '').trim();
                if (!url) {
                  toast({ title: 'No image', description: 'No elevation image URL set for this project.', variant: 'destructive' });
                  return;
                }
                window.open(url, '_blank', 'noopener,noreferrer');
              },
            },
            {
              label: 'Set Elevation',
              icon: Edit,
              variant: 'outline' as const,
              onClick: () => setElevationDialogOpen(true),
            },
            {
              label: 'Delete Project',
              icon: Trash2,
              variant: 'destructive' as const,
              onClick: () => setDeleteDialogOpen(true),
            },
          ]}
        />

        <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark project completed?</DialogTitle>
              <DialogDescription>
                This will set the project status to completed. You can still view reports and history.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!project) return;
                  setIsSubmitting(true);
                  try {
                    const updated = await api.updateProjectStatus(project.id, 'completed');
                    setProject(updated);
                    toast({ title: 'Success', description: 'Project marked as completed.' });
                    setCompleteDialogOpen(false);
                  } catch (e) {
                    toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to update project status', variant: 'destructive' });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Mark Completed
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this project?</DialogTitle>
              <DialogDescription>
                This is a permanent action. Deletion is blocked if this project has contributions, expenses, flats, payments, or contracts.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!project) return;
                  setIsSubmitting(true);
                  try {
                    await api.deleteProject(project.id);
                    toast({ title: 'Deleted', description: 'Project deleted successfully.' });
                    setDeleteDialogOpen(false);
                    navigate('/projects');
                  } catch (e) {
                    toast({ title: 'Delete blocked', description: e instanceof Error ? e.message : 'Failed to delete project', variant: 'destructive' });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={elevationDialogOpen} onOpenChange={setElevationDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Elevation Image</DialogTitle>
              <DialogDescription>Set or update the elevation image URL for this project.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Elevation Image URL</Label>
                <Input value={elevationUrl} onChange={(e) => setElevationUrl(e.target.value)} placeholder="Image URL" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setElevationDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!project) return;
                  setIsSubmitting(true);
                  try {
                    await api.updateProject(project.id, { elevation_image_url: elevationUrl ? elevationUrl : null });
                    toast({ title: 'Saved', description: 'Elevation image updated' });
                    setElevationDialogOpen(false);
                    fetchData();
                  } catch (e) {
                    toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to update elevation image', variant: 'destructive' });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto gap-1">
            <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
            <TabsTrigger value="contributions" className="text-sm">Contributions</TabsTrigger>
            <TabsTrigger value="expenses" className="text-sm">Expenses</TabsTrigger>
            <TabsTrigger value="flats" className="text-sm">Flats</TabsTrigger>
            <TabsTrigger value="contracts" className="text-sm">Contracts / Service Agreements</TabsTrigger>
            <TabsTrigger value="reports" className="text-sm">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Contributions" value={formatCurrency(totalContributions)} icon={HandCoins} iconClassName="bg-success" />
              <StatCard title="Total Expenses" value={formatCurrency(totalExpenses)} icon={Receipt} iconClassName="bg-destructive" />
              <StatCard title="Cash Balance" value={formatCurrency(cashBalance)} icon={Wallet} iconClassName="bg-primary" />
              <StatCard title="Handler Due" value={formatCurrency(Number(project.handler_reimbursement_due || 0))} icon={AlertCircle} iconClassName="bg-warning" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard title="Total Buyer Receivables" value={formatCurrency(projectSummary?.total_buyer_receivables || 0)} icon={Building2} iconClassName="bg-accent" />
              <StatCard title="Buyer Payments Received" value={formatCurrency(projectSummary?.buyer_payments_received || 0)} icon={Building2} iconClassName="bg-muted" />
              <StatCard title="Buyer Pending Amount" value={formatCurrency(projectSummary?.buyer_pending || 0)} icon={AlertCircle} iconClassName="bg-warning" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Account Credits" value={formatCurrency(totalAccountCredits)} icon={HandCoins} iconClassName="bg-success" />
              <StatCard title="Total Direct Contributions" value={formatCurrency(totalDirectContributions)} icon={HandCoins} iconClassName="bg-muted" />
              <StatCard title="Total Spent from Fund" value={formatCurrency(totalExpenses)} icon={Receipt} iconClassName="bg-destructive" />
              <StatCard title="Total Contribution" value={formatCurrency(totalContributions)} icon={Wallet} iconClassName="bg-primary" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Project Financial Summary</h3>
                  <div className="text-xs text-muted-foreground">Cash Balance: <span className="font-semibold text-foreground">{formatCurrency(cashBalance)}</span></div>
                </div>

                {(totalContributions <= 0 && totalExpenses <= 0) ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">No financial data yet.</div>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Total Contribution', total: totalContributions },
                            { name: 'Expenses', total: totalExpenses },
                            { name: 'Cash Balance', total: Math.max(cashBalance, 0) },
                          ]}
                          dataKey="total"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          innerRadius={55}
                        >
                          <Cell fill="#16a34a" />
                          <Cell fill="#dc2626" />
                          <Cell fill="#2563eb" />
                        </Pie>
                        <Tooltip
                          formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value || 0)), String(name)]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="bg-card rounded-lg border border-border p-4 lg:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Expense Category Split</h3>
                  <div className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatCurrency(totalExpenses)}</span></div>
                </div>

                {expenseTotalsByCategory.length === 0 || totalExpenseAmount <= 0 ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">No expenses yet.</div>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseTotalsByCategory.map((c) => ({ name: c.name, total: c.total }))}
                          dataKey="total"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                        >
                          {expenseTotalsByCategory.map((_, idx) => (
                            <Cell key={`exp-cat-${idx}`} fill={pieColors[(idx + 2) % pieColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: unknown, _name, props: any) => {
                            const amount = Number(value || 0);
                            const pct = totalExpenseAmount > 0 ? (amount / totalExpenseAmount) * 100 : 0;
                            const label = props?.payload?.name || 'Category';
                            return [`${formatCurrency(amount)} (${pct.toFixed(1)}%)`, label];
                          }}
                        />
                        <Legend
                          formatter={(value: any, entry: any) => {
                            const amount = Number(entry?.payload?.total || 0);
                            const pct = totalExpenseAmount > 0 ? (amount / totalExpenseAmount) * 100 : 0;
                            return `${value} • ${pct.toFixed(1)}%`;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contracts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Contracts / Service Agreements</h2>
                <p className="text-sm text-muted-foreground">Manage contractor agreements and link payments via expenses / direct vendor payments.</p>
              </div>
              <Button onClick={openAddContractor}>
                <Plus className="h-4 w-4 mr-2" />Add Contractor
              </Button>
            </div>

            <div className="bg-card rounded-lg border border-border p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <Label htmlFor="projectSqft">Project Total Sqft</Label>
                  <Input id="projectSqft" value={projectSqft} onChange={(e) => setProjectSqft(e.target.value)} placeholder="e.g. 2500" />
                </div>
                <div>
                  <Button onClick={handleSaveProjectSqft} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Sqft
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="py-2 pr-3">Contractor</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">Paid</th>
                      <th className="py-2 pr-3">Remaining</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractors.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">No contractors yet.</td>
                      </tr>
                    ) : (
                      contractors.map((c) => (
                        <tr key={c.id} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-medium">{c.contractor_name}</td>
                          <td className="py-2 pr-3">{c.type === 'per_sqft' ? 'Per Sqft' : 'Fixed'}</td>
                          <td className="py-2 pr-3">{formatCurrency(Number(c.calculated_total || 0))}</td>
                          <td className="py-2 pr-3">{formatCurrency(Number(c.already_paid || 0))}</td>
                          <td className="py-2 pr-3">{formatCurrency(Number(c.remaining_amount || 0))}</td>
                          <td className="py-2 pr-3 text-right">
                            <Button variant="ghost" size="sm" onClick={() => openEditContractor(c)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteContractor(c)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contributions" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Partner Contributions</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="w-full sm:w-[220px]">
                  <Select value={selectedPartnerForReport} onValueChange={setSelectedPartnerForReport}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner" />
                    </SelectTrigger>
                    <SelectContent>
                      {contributionTotalsByPartner.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isDownloadingPartnerReport || contributionTotalsByPartner.length === 0}
                  onClick={handleDownloadPartnerReport}
                >
                  {isDownloadingPartnerReport ? 'Preparing…' : 'Download Partner Report'}
                </Button>

                <Button onClick={() => { resetContributionForm(); setContributionDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Add Contribution
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Partner</Label>
                  <Select value={contribFilterPartner} onValueChange={setContribFilterPartner}>
                    <SelectTrigger>
                      <SelectValue placeholder="All partners" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {Array.from(new Set(contributions.map((c) => (c.partner_name || '').trim()).filter(Boolean))).map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={contribFilterType} onValueChange={(v) => setContribFilterType(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="account_credit">Account Credit</SelectItem>
                      <SelectItem value="direct_expense">Direct Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>From</Label>
                  <Input type="date" value={contribFilterFrom} onChange={(e) => setContribFilterFrom(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>To</Label>
                  <Input type="date" value={contribFilterTo} onChange={(e) => setContribFilterTo(e.target.value)} />
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-between">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                  <div className="bg-muted/30 rounded-md p-3">
                    <div className="text-xs text-muted-foreground">Filtered Total Contribution</div>
                    <div className="font-semibold">{formatCurrency(filteredTotalContribution)}</div>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3">
                    <div className="text-xs text-muted-foreground">Account Credits</div>
                    <div className="font-semibold">{formatCurrency(filteredAccountCredits)}</div>
                  </div>
                  <div className="bg-muted/30 rounded-md p-3">
                    <div className="text-xs text-muted-foreground">Direct Expenses</div>
                    <div className="font-semibold">{formatCurrency(filteredDirectExpenses)}</div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setContribFilterPartner('all');
                    setContribFilterType('all');
                    setContribFilterFrom('');
                    setContribFilterTo('');
                  }}
                >
                  Reset Filters
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Contribution Share</h3>
                <div className="text-xs text-muted-foreground">Filtered Total: <span className="font-semibold text-foreground">{formatCurrency(filteredTotalContribution)}</span></div>
              </div>

              {filteredTotalsByPartner.length === 0 || filteredTotalContribution <= 0 ? (
                <div className="text-sm text-muted-foreground py-10 text-center">No contributions yet. Add a contribution to see the chart.</div>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={filteredTotalsByPartner}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={55}
                      >
                        {filteredTotalsByPartner.map((_, idx) => (
                          <Cell key={`cell-${idx}`} fill={pieColors[idx % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: unknown, _name, props: any) => {
                          const amount = Number(value || 0);
                          const pct = filteredTotalContribution > 0 ? (amount / filteredTotalContribution) * 100 : 0;
                          const label = props?.payload?.name || 'Partner';
                          return [
                            `${formatCurrency(amount)} (${pct.toFixed(1)}%)`,
                            label,
                          ];
                        }}
                      />
                      <Legend
                        formatter={(value: any, entry: any) => {
                          const amount = Number(entry?.payload?.total || 0);
                          const pct = filteredTotalContribution > 0 ? (amount / filteredTotalContribution) * 100 : 0;
                          return `${value} • ${pct.toFixed(1)}%`;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-4 mb-4">
              <p className="text-sm text-muted-foreground">Showing: <span className="font-semibold text-foreground">{filteredContributions.length}</span> rows</p>
            </div>
            <DataTable data={filteredContributions} columns={contributionColumns} searchKeys={['partner_name']} onExport={() => toast({ title: 'Export', description: 'Downloading Excel...' })} />
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
              <p className="text-sm text-muted-foreground">Cash Balance: <span className="font-semibold text-foreground">{formatCurrency(cashBalance)}</span></p>
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

          <Dialog
            open={installmentsDialogOpen}
            onOpenChange={(open) => {
              setInstallmentsDialogOpen(open);
              if (!open) {
                setInstallmentsFlat(null);
                setInstallments([]);
                resetInstallmentForm();
              }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Installments {installmentsFlat ? `• Flat ${installmentsFlat.flat_no}` : ''}</DialogTitle>
                <DialogDescription>View, add, edit, or delete buyer installments.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="bg-muted/30 rounded-md p-3">
                  <div className="text-xs text-muted-foreground">Total Paid</div>
                  <div className="font-semibold">
                    {formatCurrency(installments.reduce((sum, i) => sum + toFiniteNumber(i.amount), 0))}
                  </div>
                </div>

                <div className="overflow-x-auto border border-border rounded-md">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Mode</th>
                        <th className="py-2 px-3">Notes</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {installments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">No installments yet.</td>
                        </tr>
                      ) : (
                        installments.map((i) => (
                          <tr key={i.id} className="border-b border-border/60">
                            <td className="py-2 px-3">{new Date(i.date).toLocaleDateString('en-IN')}</td>
                            <td className="py-2 px-3">{formatCurrency(i.amount)}</td>
                            <td className="py-2 px-3">{String(i.mode || '').replace('_', ' ').toUpperCase()}</td>
                            <td className="py-2 px-3">{i.notes || ''}</td>
                            <td className="py-2 px-3 text-right">
                              <Button variant="ghost" size="sm" onClick={() => openEditInstallment(i)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteInstallment(i)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input type="number" value={installmentForm.amount} onChange={(e) => setInstallmentForm({ ...installmentForm, amount: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={installmentForm.date} onChange={(e) => setInstallmentForm({ ...installmentForm, date: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select value={installmentForm.mode} onValueChange={(v) => setInstallmentForm({ ...installmentForm, mode: v as Installment['mode'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input value={installmentForm.notes} onChange={(e) => setInstallmentForm({ ...installmentForm, notes: e.target.value })} />
                  </div>
                </div>
              </div>

              <DialogFooter>
                {editingInstallment ? (
                  <Button variant="outline" onClick={resetInstallmentForm} disabled={isSubmitting}>
                    Cancel Edit
                  </Button>
                ) : null}
                <Button onClick={handleSaveInstallment} disabled={isSubmitting || !installmentsFlat}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingInstallment ? 'Update Installment' : 'Add Installment'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TabsContent value="reports" className="space-y-4">
            <h2 className="text-lg font-semibold">Download Reports</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-24 flex-col"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    toast({ title: 'Generating report...', description: 'Please wait' });
                    const result = await api.getProjectReport(id!);
                    const blob = result.blob;
                    
                    if (!blob || blob.size === 0) {
                      throw new Error('Received empty file');
                    }
                    
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = result.filename || `${(project?.name || 'project').replace(/[^a-z0-9]/gi, '_')}-report.xlsx`;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    
                    // Cleanup after a short delay
                    setTimeout(() => {
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    }, 100);
                    
                    toast({ title: 'Success', description: 'Report downloaded successfully' });
                  } catch (error) {
                    console.error('Download error:', error);
                    toast({
                      title: 'Error',
                      description: error instanceof Error ? error.message : 'Failed to download report. Please try again.',
                      variant: 'destructive',
                    });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mb-2" />
                    <span className="text-xs">Generating...</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Full Project Report</span>
                    <span className="text-xs text-muted-foreground mt-1">Excel</span>
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Contribution Dialog */}
        <Dialog open={contributionDialog} onOpenChange={(open) => { setContributionDialog(open); if (!open) resetContributionForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Contribution</DialogTitle>
              <DialogDescription>
                {editingItem ? 'Update the contribution details below.' : 'Add a new partner contribution. Partner email is required for email notifications.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {!editingItem && existingPartners.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Existing Partner or Add New</Label>
                  <Select
                    value={isNewPartner ? 'new' : contributionForm.partner_name}
                    onValueChange={(value) => {
                      if (value === 'new') {
                        setIsNewPartner(true);
                        setContributionForm({ ...contributionForm, partner_name: '', partner_email: '' });
                      } else {
                        setIsNewPartner(false);
                        const partner = existingPartners.find((p) => p.name === value);
                        if (partner) {
                          setContributionForm({
                            ...contributionForm,
                            partner_name: partner.name,
                            partner_email: partner.email || '',
                          });
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner or add new" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">+ Add New Partner</SelectItem>
                      {existingPartners.map((partner) => (
                        <SelectItem key={partner.name} value={partner.name}>
                          {partner.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Partner Name *</Label>
                  <Input
                    value={contributionForm.partner_name}
                    onChange={(e) => setContributionForm({ ...contributionForm, partner_name: e.target.value })}
                    disabled={!isNewPartner && !editingItem && existingPartners.length > 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Partner Email {isNewPartner || editingItem ? '*' : ''}</Label>
                  <Input
                    type="email"
                    value={contributionForm.partner_email}
                    onChange={(e) => setContributionForm({ ...contributionForm, partner_email: e.target.value })}
                    placeholder="partner@example.com"
                    disabled={!isNewPartner && !editingItem && existingPartners.length > 0}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input type="number" value={contributionForm.amount} onChange={(e) => setContributionForm({ ...contributionForm, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={contributionForm.date} onChange={(e) => setContributionForm({ ...contributionForm, date: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={contributionForm.mode} onValueChange={(v) => setContributionForm({ ...contributionForm, mode: v as Contribution['mode'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contribution Type</Label>
                  <Select value={contributionForm.contribution_type} onValueChange={(v) => setContributionForm({ ...contributionForm, contribution_type: v as Contribution['contribution_type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="account_credit">Account Credit</SelectItem>
                      <SelectItem value="direct_expense">Direct Expense (Vendor Paid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {contributionForm.contribution_type === 'direct_expense' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vendor Name *</Label>
                    <Input value={contributionForm.vendor_name} onChange={(e) => setContributionForm({ ...contributionForm, vendor_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contractor (optional)</Label>
                    <Select value={contributionForm.contractor_id || 'none'} onValueChange={(v) => setContributionForm({ ...contributionForm, contractor_id: v === 'none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {contractors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.contractor_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Purpose / Notes *</Label>
                    <Input value={contributionForm.purpose} onChange={(e) => setContributionForm({ ...contributionForm, purpose: e.target.value })} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Proof (optional)</Label>
                    <Input value={contributionForm.proof} onChange={(e) => setContributionForm({ ...contributionForm, proof: e.target.value })} />
                  </div>
                </div>
              )}

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
              <DialogDescription>
                {editingItem ? 'Update the expense details below.' : 'Add a new expense for this project.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Input value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Paid By</Label>
                  <Input value={expenseForm.paid_by} onChange={(e) => setExpenseForm({ ...expenseForm, paid_by: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Input value={expenseForm.vendor_name} onChange={(e) => setExpenseForm({ ...expenseForm, vendor_name: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Contractor (optional)</Label>
                <Select value={expenseForm.contractor_id || 'none'} onValueChange={(v) => setExpenseForm({ ...expenseForm, contractor_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contractors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.contractor_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        <Dialog
          open={flatDialog}
          onOpenChange={(open) => {
            setFlatDialog(open);
            if (!open) {
              setEditingFlat(null);
              setFlatForm({ flat_no: '', buyer_name: '', total_cost: '', status: 'available' });
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingFlat ? 'Edit Flat' : 'Add Flat'}</DialogTitle>
              <DialogDescription>
                Add a new flat to this project. You can add installments later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Flat No *</Label>
                  <Input value={flatForm.flat_no} onChange={(e) => setFlatForm({ ...flatForm, flat_no: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Buyer Name</Label>
                  <Input value={flatForm.buyer_name} onChange={(e) => setFlatForm({ ...flatForm, buyer_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {editingFlat ? 'Update Flat' : 'Add Flat'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={contractorDialog} onOpenChange={(open) => { setContractorDialog(open); if (!open) resetContractorForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContractor ? 'Edit Contractor' : 'Add Contractor'}</DialogTitle>
              <DialogDescription>Define a fixed or per sqft service agreement.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Contractor Name</Label>
                <Input value={contractorForm.contractor_name} onChange={(e) => setContractorForm({ ...contractorForm, contractor_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={contractorForm.type} onValueChange={(v) => setContractorForm({ ...contractorForm, type: v as ProjectContractor['type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="per_sqft">Per Sqft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{contractorForm.type === 'fixed' ? 'Fixed Amount' : 'Rate per Sqft'}</Label>
                  <Input
                    type="number"
                    value={contractorForm.type === 'fixed' ? contractorForm.fixed_amount : contractorForm.rate_per_sqft}
                    onChange={(e) => setContractorForm({
                      ...contractorForm,
                      fixed_amount: contractorForm.type === 'fixed' ? e.target.value : contractorForm.fixed_amount,
                      rate_per_sqft: contractorForm.type === 'per_sqft' ? e.target.value : contractorForm.rate_per_sqft,
                    })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setContractorDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveContractor} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingContractor ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
