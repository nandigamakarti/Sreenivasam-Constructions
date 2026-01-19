import { Project, Contribution, Expense, Flat, Installment, DashboardStats, ProjectSummary, ProjectContractor } from '@/types';
import { supabase } from '@/lib/supabase';

function resolveApiBase(): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!raw) return '';

  const isLikelyProdHost =
    typeof window !== 'undefined' &&
    window.location &&
    window.location.hostname &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);

  const lower = raw.toLowerCase();
  if (isLikelyProdHost && (lower.includes('localhost') || lower.includes('127.0.0.1'))) {
    return '';
  }

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      // Validate URL
      // eslint-disable-next-line no-new
      new URL(raw);
      return raw.replace(/\/$/, '');
    }
  } catch {
    return '';
  }

  if (raw.startsWith('/')) return raw.replace(/\/$/, '');
  return '';
}

const API_BASE = resolveApiBase();

async function getAuthHeaders() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Session error:', error);
      throw new Error('Session error: ' + error.message);
    }
    
    if (!session) {
      console.warn('No session found, redirecting to login');
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new Error('Not authenticated');
    }
    
    if (!session.access_token) {
      console.warn('No access token in session, trying to refresh');
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshedSession || !refreshedSession.access_token) {
        console.error('Failed to refresh session:', refreshError);
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        throw new Error('Session expired. Please login again.');
      }
      
      return {
        'Authorization': `Bearer ${refreshedSession.access_token}`,
        'Content-Type': 'application/json',
      };
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  } catch (err) {
    console.error('getAuthHeaders error:', err);
    throw err;
  }
}

async function apiFetchBlob(url: string, options: RequestInit = {}): Promise<{ blob: Blob; filename?: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = 'Request failed';
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const contentDisposition = response.headers.get('content-disposition') || undefined;
  let filename: string | undefined;
  if (contentDisposition) {
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
    filename = decodeURIComponent((match?.[1] || match?.[2] || '').trim()) || undefined;
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error('Received empty file from server');
  }
  return { blob, filename };
}

async function apiFetch(url: string, options: RequestInit = {}, retries = 2): Promise<any> {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid - redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
        throw new Error('Session expired. Please login again.');
      }
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      let msg = error.message || `HTTP ${response.status}`;
      if (error && error.blocking && typeof error.blocking === 'object') {
        const parts = Object.entries(error.blocking)
          .map(([k, v]) => `${k}:${Number(v) || 0}`)
          .filter((x) => !x.endsWith(':0'));
        if (parts.length) msg = `${msg} (${parts.join(', ')})`;
      }
      throw new Error(msg);
    }
    return response.json();
  } catch (err) {
    // Retry if session might not be ready yet (only for first attempt)
    if (retries > 0 && err instanceof Error && err.message.includes('Not authenticated')) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      return apiFetch(url, options, retries - 1);
    }
    
    if (err instanceof Error && (err.message.includes('Not authenticated') || err.message.includes('Session'))) {
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
    throw err;
  }
}

// API Functions
export const api = {
  // Projects
  async getProjects(): Promise<Project[]> {
    return apiFetch('/api/projects');
  },

  async getProjectByCode(projectCode: string): Promise<Project> {
    const code = String(projectCode || '').trim();
    return apiFetch(`/api/projects/by-code/${encodeURIComponent(code)}`);
  },

  async getProject(id: string): Promise<Project> {
    return apiFetch(`/api/projects/${id}`);
  },

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    return apiFetch(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'total_contributions' | 'total_expenses' | 'handler_reimbursement_due'>): Promise<Project> {
    return apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  async updateProjectStatus(projectId: string, status: Project['status']): Promise<Project> {
    return apiFetch(`/api/projects/${projectId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async deleteProject(projectId: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });
  },

  async forceDeleteProject(projectId: string): Promise<{ ok: boolean; forced?: boolean }> {
    return apiFetch(`/api/projects/${projectId}?force=true`, {
      method: 'DELETE',
    });
  },

  async getGlobalDocsFolderUrl(): Promise<{ global_docs_folder_url: string | null }> {
    return apiFetch('/api/settings/global-docs-folder');
  },

  async updateGlobalDocsFolderUrl(global_docs_folder_url: string | null): Promise<{ global_docs_folder_url: string | null }> {
    return apiFetch('/api/settings/global-docs-folder', {
      method: 'PUT',
      body: JSON.stringify({ global_docs_folder_url }),
    });
  },

  // Contributions
  async getContributions(projectId: string): Promise<Contribution[]> {
    return apiFetch(`/contributions/${projectId}`);
  },

  async createContribution(contribution: Omit<Contribution, 'id'>): Promise<Contribution> {
    return apiFetch('/contributions', {
      method: 'POST',
      body: JSON.stringify(contribution),
    });
  },

  async updateContribution(id: string, data: Partial<Contribution>): Promise<Contribution> {
    return apiFetch(`/contributions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Expenses
  async getExpenses(projectId: string): Promise<Expense[]> {
    return apiFetch(`/expenses/${projectId}`);
  },

  async createExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
    return apiFetch('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  },

  async updateExpense(id: string, data: Partial<Expense>): Promise<Expense> {
    return apiFetch(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Flats
  async getFlats(projectId: string): Promise<Flat[]> {
    return apiFetch(`/flats/${projectId}`);
  },

  async getFlat(id: string): Promise<Flat> {
    return apiFetch(`/flat/${id}`);
  },

  async createFlat(flat: Omit<Flat, 'id'>): Promise<Flat> {
    return apiFetch('/flats', {
      method: 'POST',
      body: JSON.stringify(flat),
    });
  },

  async updateFlat(id: string, data: Partial<Flat>): Promise<Flat> {
    return apiFetch(`/flats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Installments
  async getInstallments(flatId: string): Promise<Installment[]> {
    return apiFetch(`/flat/installments/${flatId}`);
  },

  async createInstallment(installment: Omit<Installment, 'id'>): Promise<Installment> {
    return apiFetch('/flat/installment', {
      method: 'POST',
      body: JSON.stringify(installment),
    });
  },

  async updateInstallment(id: string, data: Partial<Installment>): Promise<Installment> {
    return apiFetch(`/flat/installment/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteInstallment(id: string): Promise<{ ok: boolean }> {
    return apiFetch(`/flat/installment/${id}`, {
      method: 'DELETE',
    });
  },

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    return apiFetch('/api/dashboard-stats');
  },

  async getProjectSummary(projectId: string): Promise<ProjectSummary> {
    return apiFetch(`/api/project/${projectId}/summary`);
  },

  async getProjectContractors(projectId: string): Promise<ProjectContractor[]> {
    return apiFetch(`/api/projects/${projectId}/contracts`);
  },

  async createContractor(contractor: { project_id: string; contractor_name: string; type: 'fixed' | 'per_sqft'; fixed_amount?: number; rate_per_sqft?: number }): Promise<ProjectContractor> {
    return apiFetch('/api/contractors', {
      method: 'POST',
      body: JSON.stringify(contractor),
    });
  },

  async updateContractor(id: string, data: Partial<ProjectContractor>): Promise<ProjectContractor> {
    return apiFetch(`/api/contractors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteContractor(id: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/contractors/${id}`, {
      method: 'DELETE',
    });
  },

  // Reports
  async getProjectReport(projectId: string): Promise<{ blob: Blob; filename?: string }> {
    return apiFetchBlob(`/reports/project/${projectId}`);
  },

  async getContributionsReport(projectId: string): Promise<{ blob: Blob; filename?: string }> {
    return apiFetchBlob(`/reports/contributions/${projectId}`);
  },

  async getExpensesReport(projectId: string): Promise<{ blob: Blob; filename?: string }> {
    return apiFetchBlob(`/reports/expenses/${projectId}`);
  },

  async getFlatsReport(projectId: string): Promise<{ blob: Blob; filename?: string }> {
    return apiFetchBlob(`/reports/flats/${projectId}`);
  },

  async getInstallmentsReport(projectId: string): Promise<{ blob: Blob; filename?: string }> {
    return apiFetchBlob(`/reports/installments/${projectId}`);
  },

  async getContributorContributionsReport(projectId: string, partnerName: string): Promise<{ blob: Blob; filename?: string }> {
    return apiFetchBlob(`/reports/project/${projectId}/contributor/${encodeURIComponent(partnerName)}`);
  },

  // Email (no-op from frontend perspective)
  async sendTransactionEmail(_type: string, _data: unknown): Promise<void> {
    // Backend handles this automatically
  },
};
