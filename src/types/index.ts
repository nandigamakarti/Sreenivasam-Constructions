export interface Project {
  id: string;
  name: string;
  location: string;
  status: 'active' | 'completed' | 'on-hold';
  created_at: string;
  total_contributions: number;
  total_expenses: number;
  handler_reimbursement_due: number;
}

export interface Contribution {
  id: string;
  project_id: string;
  partner_name: string;
  amount: number;
  mode: 'cash' | 'bank_transfer' | 'cheque' | 'upi';
  date: string;
  notes?: string;
}

export interface Expense {
  id: string;
  project_id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paid_by: string;
  vendor?: string;
  notes?: string;
}

export interface Flat {
  id: string;
  project_id: string;
  flat_no: string;
  buyer_name: string;
  total_cost: number;
  paid: number;
  status: 'booked' | 'sold' | 'available';
}

export interface Installment {
  id: string;
  flat_id: string;
  amount: number;
  date: string;
  mode: 'cash' | 'bank_transfer' | 'cheque' | 'upi';
  notes?: string;
}

export interface DashboardStats {
  total_projects: number;
  total_contributions: number;
  total_expenses: number;
  remaining_balance: number;
  flats_count: number;
  pending_dues: number;
}
