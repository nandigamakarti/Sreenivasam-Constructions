export interface Project {
  id: string;
  name: string;
  location: string;
  status: 'planning' | 'ongoing' | 'completed';
  project_total_sqft?: number | null;
  project_docs_folder_url?: string | null;
  elevation_image_url?: string | null;
  created_at: string;
  total_contributions: number;
  total_expenses: number;
  handler_reimbursement_due: number;
}

export interface Contribution {
  id: string;
  project_id: string;
  partner_name: string;
  partner_email?: string;
  amount: number;
  contribution_type: 'account_credit' | 'direct_expense';
  mode: 'cash' | 'bank_transfer' | 'cheque' | 'upi';
  date: string;
  notes?: string;
  vendor_name?: string | null;
  purpose?: string | null;
  proof?: string | null;
  contractor_id?: string | null;
}

export interface Expense {
  id: string;
  project_id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paid_by: string;
  vendor_name?: string | null;
  notes?: string;
  contractor_id?: string | null;
}

export interface ProjectContractor {
  id: string;
  project_id: string;
  contractor_name: string;
  type: 'fixed' | 'per_sqft';
  fixed_amount?: number | null;
  rate_per_sqft?: number | null;
  total_sqft?: number | null;
  calculated_total: number;
  already_paid: number;
  remaining_amount: number;
  created_at: string;
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
  total_contribution: number;
  total_account_credits: number;
  total_direct_contributions: number;
  total_buyer_payments_received: number;
  total_buyer_receivables: number;
  total_buyer_pending: number;
  total_expenses: number;
  cash_balance: number;
  contributor_share: { partner_name: string; amount: number }[];
  monthly_flow: { month: string; account_credit_in: number; direct_expense: number; buyer_payments_in: number; expenses_out: number }[];
  expense_category_split: { category: string; amount: number }[];
  total_contract_value: number;
  total_paid_to_contractors: number;
  total_remaining_contractor_payables: number;
}

export interface ProjectSummary {
  project_id: string;
  project_name: string;
  total_contribution: number;
  total_account_credits: number;
  total_direct_contributions: number;
  buyer_payments_received: number;
  total_buyer_receivables: number;
  buyer_pending: number;
  total_expenses: number;
  cash_balance: number;
  contributor_share: { partner_name: string; amount: number }[];
  monthly_flow: { month: string; account_credit_in: number; direct_expense: number; buyer_payments_in: number; expenses_out: number }[];
  expense_category_split: { category: string; amount: number }[];
}
