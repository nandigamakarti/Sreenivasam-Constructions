import { Project, Contribution, Expense, Flat, Installment, DashboardStats } from '@/types';

// Mock data
const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Sunrise Heights',
    location: 'Mumbai, Maharashtra',
    status: 'active',
    created_at: '2024-01-15',
    total_contributions: 5000000,
    total_expenses: 3200000,
    handler_reimbursement_due: 150000,
  },
  {
    id: '2',
    name: 'Green Valley Apartments',
    location: 'Pune, Maharashtra',
    status: 'active',
    created_at: '2024-03-20',
    total_contributions: 8000000,
    total_expenses: 4500000,
    handler_reimbursement_due: 200000,
  },
  {
    id: '3',
    name: 'Metro Plaza',
    location: 'Bangalore, Karnataka',
    status: 'completed',
    created_at: '2023-06-10',
    total_contributions: 12000000,
    total_expenses: 11500000,
    handler_reimbursement_due: 0,
  },
];

const mockContributions: Contribution[] = [
  { id: '1', project_id: '1', partner_name: 'Rajesh Kumar', amount: 2000000, mode: 'bank_transfer', date: '2024-01-20', notes: 'Initial investment' },
  { id: '2', project_id: '1', partner_name: 'Amit Shah', amount: 1500000, mode: 'cheque', date: '2024-02-15', notes: 'Second tranche' },
  { id: '3', project_id: '1', partner_name: 'Priya Patel', amount: 1500000, mode: 'upi', date: '2024-03-10' },
  { id: '4', project_id: '2', partner_name: 'Suresh Mehta', amount: 4000000, mode: 'bank_transfer', date: '2024-03-25' },
  { id: '5', project_id: '2', partner_name: 'Vikram Singh', amount: 4000000, mode: 'bank_transfer', date: '2024-04-05' },
];

const mockExpenses: Expense[] = [
  { id: '1', project_id: '1', title: 'Land Purchase', category: 'Land', amount: 2000000, date: '2024-01-25', paid_by: 'Company', vendor: 'Land Registry' },
  { id: '2', project_id: '1', title: 'Foundation Work', category: 'Construction', amount: 800000, date: '2024-02-20', paid_by: 'Company', vendor: 'ABC Builders' },
  { id: '3', project_id: '1', title: 'Permits & Approvals', category: 'Legal', amount: 400000, date: '2024-03-05', paid_by: 'Rajesh Kumar', vendor: 'Municipal Corp' },
  { id: '4', project_id: '2', title: 'Land Acquisition', category: 'Land', amount: 3000000, date: '2024-03-30', paid_by: 'Company' },
  { id: '5', project_id: '2', title: 'Architect Fees', category: 'Professional', amount: 500000, date: '2024-04-10', paid_by: 'Company', vendor: 'Design Studio' },
];

const mockFlats: Flat[] = [
  { id: '1', project_id: '1', flat_no: 'A-101', buyer_name: 'Mahesh Verma', total_cost: 4500000, paid: 2000000, status: 'booked' },
  { id: '2', project_id: '1', flat_no: 'A-102', buyer_name: 'Sunita Sharma', total_cost: 4800000, paid: 4800000, status: 'sold' },
  { id: '3', project_id: '1', flat_no: 'A-103', buyer_name: '', total_cost: 4600000, paid: 0, status: 'available' },
  { id: '4', project_id: '2', flat_no: 'B-201', buyer_name: 'Ravi Gupta', total_cost: 5500000, paid: 3000000, status: 'booked' },
  { id: '5', project_id: '2', flat_no: 'B-202', buyer_name: 'Neha Joshi', total_cost: 5200000, paid: 5200000, status: 'sold' },
];

const mockInstallments: Installment[] = [
  { id: '1', flat_id: '1', amount: 1000000, date: '2024-02-01', mode: 'bank_transfer', notes: 'Booking amount' },
  { id: '2', flat_id: '1', amount: 1000000, date: '2024-04-01', mode: 'bank_transfer', notes: 'Second installment' },
  { id: '3', flat_id: '4', amount: 2000000, date: '2024-04-15', mode: 'cheque', notes: 'Booking amount' },
  { id: '4', flat_id: '4', amount: 1000000, date: '2024-05-15', mode: 'bank_transfer' },
];

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// API Functions
export const api = {
  // Projects
  async getProjects(): Promise<Project[]> {
    await delay(300);
    return mockProjects;
  },

  async getProject(id: string): Promise<Project | undefined> {
    await delay(200);
    return mockProjects.find(p => p.id === id);
  },

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'total_contributions' | 'total_expenses' | 'handler_reimbursement_due'>): Promise<Project> {
    await delay(300);
    const newProject: Project = {
      ...project,
      id: Date.now().toString(),
      created_at: new Date().toISOString().split('T')[0],
      total_contributions: 0,
      total_expenses: 0,
      handler_reimbursement_due: 0,
    };
    mockProjects.push(newProject);
    return newProject;
  },

  // Contributions
  async getContributions(projectId: string): Promise<Contribution[]> {
    await delay(200);
    return mockContributions.filter(c => c.project_id === projectId);
  },

  async createContribution(contribution: Omit<Contribution, 'id'>): Promise<Contribution> {
    await delay(300);
    const newContribution: Contribution = {
      ...contribution,
      id: Date.now().toString(),
    };
    mockContributions.push(newContribution);
    // Trigger email API (placeholder)
    await api.sendTransactionEmail('contribution', newContribution);
    return newContribution;
  },

  async updateContribution(id: string, data: Partial<Contribution>): Promise<Contribution> {
    await delay(300);
    const index = mockContributions.findIndex(c => c.id === id);
    if (index !== -1) {
      mockContributions[index] = { ...mockContributions[index], ...data };
      await api.sendTransactionEmail('contribution_update', mockContributions[index]);
      return mockContributions[index];
    }
    throw new Error('Contribution not found');
  },

  // Expenses
  async getExpenses(projectId: string): Promise<Expense[]> {
    await delay(200);
    return mockExpenses.filter(e => e.project_id === projectId);
  },

  async createExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
    await delay(300);
    const newExpense: Expense = {
      ...expense,
      id: Date.now().toString(),
    };
    mockExpenses.push(newExpense);
    await api.sendTransactionEmail('expense', newExpense);
    return newExpense;
  },

  async updateExpense(id: string, data: Partial<Expense>): Promise<Expense> {
    await delay(300);
    const index = mockExpenses.findIndex(e => e.id === id);
    if (index !== -1) {
      mockExpenses[index] = { ...mockExpenses[index], ...data };
      await api.sendTransactionEmail('expense_update', mockExpenses[index]);
      return mockExpenses[index];
    }
    throw new Error('Expense not found');
  },

  // Flats
  async getFlats(projectId: string): Promise<Flat[]> {
    await delay(200);
    return mockFlats.filter(f => f.project_id === projectId);
  },

  async getFlat(id: string): Promise<Flat | undefined> {
    await delay(200);
    return mockFlats.find(f => f.id === id);
  },

  async createFlat(flat: Omit<Flat, 'id'>): Promise<Flat> {
    await delay(300);
    const newFlat: Flat = {
      ...flat,
      id: Date.now().toString(),
    };
    mockFlats.push(newFlat);
    return newFlat;
  },

  async updateFlat(id: string, data: Partial<Flat>): Promise<Flat> {
    await delay(300);
    const index = mockFlats.findIndex(f => f.id === id);
    if (index !== -1) {
      mockFlats[index] = { ...mockFlats[index], ...data };
      return mockFlats[index];
    }
    throw new Error('Flat not found');
  },

  // Installments
  async getInstallments(flatId: string): Promise<Installment[]> {
    await delay(200);
    return mockInstallments.filter(i => i.flat_id === flatId);
  },

  async createInstallment(installment: Omit<Installment, 'id'>): Promise<Installment> {
    await delay(300);
    const newInstallment: Installment = {
      ...installment,
      id: Date.now().toString(),
    };
    mockInstallments.push(newInstallment);
    
    // Update flat paid amount
    const flat = mockFlats.find(f => f.id === installment.flat_id);
    if (flat) {
      flat.paid += installment.amount;
      if (flat.paid >= flat.total_cost) {
        flat.status = 'sold';
      }
    }
    
    await api.sendTransactionEmail('installment', newInstallment);
    return newInstallment;
  },

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    await delay(300);
    const totalContributions = mockContributions.reduce((sum, c) => sum + c.amount, 0);
    const totalExpenses = mockExpenses.reduce((sum, e) => sum + e.amount, 0);
    const pendingDues = mockFlats.reduce((sum, f) => sum + (f.total_cost - f.paid), 0);
    
    return {
      total_projects: mockProjects.length,
      total_contributions: totalContributions,
      total_expenses: totalExpenses,
      remaining_balance: totalContributions - totalExpenses,
      flats_count: mockFlats.length,
      pending_dues: pendingDues,
    };
  },

  // Reports (placeholder - would generate actual reports)
  async getProjectReport(projectId: string): Promise<Blob> {
    await delay(500);
    // Placeholder - would return actual Excel/PDF
    return new Blob(['Report data'], { type: 'application/octet-stream' });
  },

  // Email API (placeholder)
  async sendTransactionEmail(type: string, data: unknown): Promise<void> {
    await delay(100);
    console.log(`[EMAIL API] Sending ${type} notification:`, data);
    // POST /api/email/transaction would be called here
  },
};
