import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { config } from './config.js';
import { supabaseAdmin, supabaseProjectRef } from './supabaseClient.js';
import { authenticate } from './middleware/auth.js';
import { emailService } from './services/emailService.js';
import {
  generateProjectReport,
  generateContributionsReport,
  generateExpensesReport,
  generateFlatInstallmentsReport,
  generateFlatsReport,
  generateContributorWiseContributionsReport,
} from './services/reportService.js';
import { logger } from './logger.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '..', '..', 'dist');

function fireAndForget(promise, label) {
  Promise.resolve(promise).catch((err) => logger.error({ err }, label || 'Background task failed'));
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://*.supabase.co"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/debug/supabase', ...(process.env.NODE_ENV === 'production' ? [authenticate] : []), async (req, res) => {
  try {
    const urlHost = (() => {
      try {
        return new URL(config.supabaseUrl || '').host;
      } catch {
        return config.supabaseUrl || null;
      }
    })();

    const countTable = async (table) => {
      try {
        const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
        if (error) return { ok: false, count: null, error: { message: error.message, code: error.code } };
        return { ok: true, count: typeof count === 'number' ? count : null, error: null };
      } catch (e) {
        return { ok: false, count: null, error: { message: e instanceof Error ? e.message : 'Count failed' } };
      }
    };

    const probe = async (name, fn) => {
      try {
        const out = await fn();
        const err = out?.error;
        return {
          ok: !err,
          error: err ? { message: err.message, code: err.code, details: err.details, hint: err.hint } : null,
        };
      } catch (e) {
        return {
          ok: false,
          error: { message: e instanceof Error ? e.message : 'Probe failed' },
        };
      }
    };

    const probes = {
      projects: await probe('projects', () =>
        supabaseAdmin
          .from('projects')
          .select('id, project_total_sqft, project_docs_folder_url, elevation_image_url')
          .limit(1),
      ),
      project_contractors: await probe('project_contractors', () =>
        supabaseAdmin
          .from('project_contractors')
          .select('id, project_id, contractor_name, type, fixed_amount, rate_per_sqft, total_sqft, calculated_total, already_paid, remaining_amount')
          .limit(1),
      ),
      partner_contributions: await probe('partner_contributions', () =>
        supabaseAdmin.from('partner_contributions').select('id, project_id, contractor_id').limit(1),
      ),
      expenses: await probe('expenses', () => supabaseAdmin.from('expenses').select('id, project_id, contractor_id').limit(1)),
      flats: await probe('flats', () => supabaseAdmin.from('flats').select('id, project_id, total_cost').limit(1)),
      flat_payments: await probe('flat_payments', () => supabaseAdmin.from('flat_payments').select('id, flat_id, amount').limit(1)),
      transaction_audit_logs: await probe('transaction_audit_logs', () =>
        supabaseAdmin.from('transaction_audit_logs').select('id, transaction_id, project_id').limit(1),
      ),
      settings: await probe('settings', () => supabaseAdmin.from('settings').select('key, value').limit(1)),
    };

    const counts = {
      projects: await countTable('projects'),
      project_contractors: await countTable('project_contractors'),
      partner_contributions: await countTable('partner_contributions'),
      expenses: await countTable('expenses'),
      flats: await countTable('flats'),
      flat_payments: await countTable('flat_payments'),
      transaction_audit_logs: await countTable('transaction_audit_logs'),
      settings: await countTable('settings'),
    };

    return res.json({
      supabase: {
        url_host: urlHost,
        project_ref: supabaseProjectRef,
        has_service_role_key: Boolean(config.supabaseServiceRoleKey),
      },
      probes,
      counts,
    });
  } catch (err) {
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Debug probe failed' });
  }
});

app.get('/api/dashboard-stats', authenticate, async (_req, res) => {
  try {
    const stats = await computeDashboardStats();
    return res.json(stats);
  } catch (err) {
    logger.error({ err }, 'Failed to compute dashboard stats');
    return res.status(500).json({ message: 'Failed to compute dashboard stats' });
  }
});

app.delete('/contributions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('partner_contributions')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ message: 'Contribution not found' });

    const effectiveContractor = (existing.contribution_type || 'account_credit').toLowerCase() === 'direct_expense'
      ? (existing.contractor_id || null)
      : null;
    const amount = toNumber(existing.amount);

    const { error } = await supabaseAdmin.from('partner_contributions').delete().eq('id', id);
    if (error) return res.status(400).json({ message: error.message });

    if (effectiveContractor) {
      await applyContractorPaymentDelta({ contractorId: effectiveContractor, deltaAmount: -amount });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete contribution');
    return res.status(500).json({ message: 'Failed to delete contribution' });
  }
});

app.delete('/expenses/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ message: 'Expense not found' });

    const contractorId = existing.contractor_id || null;
    const amount = toNumber(existing.amount);

    const { error } = await supabaseAdmin.from('expenses').delete().eq('id', id);
    if (error) return res.status(400).json({ message: error.message });

    if (contractorId) {
      await applyContractorPaymentDelta({ contractorId, deltaAmount: -amount });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete expense');
    return res.status(500).json({ message: 'Failed to delete expense' });
  }
});

app.put('/projects/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await fetchProject(id);
    if (!existing) return res.status(404).json({ message: 'Project not found' });

    const update = { ...req.body };
    if (update.project_total_sqft !== undefined && update.project_total_sqft !== null) {
      update.project_total_sqft = toNumber(update.project_total_sqft);
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    if (update.project_total_sqft !== undefined) {
      const contractors = await listContractors(id);
      await Promise.all(
        contractors.map(async (c) => {
          const total_sqft = toNumber(update.project_total_sqft);
          const { calculated_total, remaining_amount } = recalcContractorFields({
            type: c.type,
            fixed_amount: c.fixed_amount,
            rate_per_sqft: c.rate_per_sqft,
            total_sqft,
            already_paid: c.already_paid,
          });
          const payload = { total_sqft, calculated_total, remaining_amount };
          const { error: uerr } = await supabaseAdmin.from('project_contractors').update(payload).eq('id', c.id);
          if (uerr) throw new Error(uerr.message);
        }),
      );
    }

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update project');
    return res.status(500).json({ message: 'Failed to update project' });
  }
});

app.patch('/api/projects/:projectId/status', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const existing = await fetchProject(projectId);
    if (!existing) return res.status(404).json({ message: 'Project not found' });

    const nextStatus = String(req.body?.status || '').toLowerCase().trim();
    if (!['planning', 'ongoing', 'completed'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid status. Allowed: planning, ongoing, completed' });
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ status: nextStatus })
      .eq('id', projectId)
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update project status');
    return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to update project status' });
  }
});

app.delete('/api/projects/:projectId', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const existing = await fetchProject(projectId);
    if (!existing) return res.status(404).json({ message: 'Project not found' });

    const countForProject = async (table) => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      if (error) throw new Error(error.message);
      return Number(count || 0);
    };

    const contributionsCount = await countForProject('partner_contributions');
    const expensesCount = await countForProject('expenses');
    const flatsCount = await countForProject('flats');
    const contractorsCount = await countForProject('project_contractors');

    let flatPaymentsCount = 0;
    if (flatsCount > 0) {
      const { data: flats = [], error: flatsErr } = await supabaseAdmin.from('flats').select('id').eq('project_id', projectId);
      if (flatsErr) throw new Error(flatsErr.message);
      const flatIds = (flats || []).map((f) => f.id).filter(Boolean);
      if (flatIds.length) {
        const { count, error } = await supabaseAdmin
          .from('flat_payments')
          .select('id', { count: 'exact', head: true })
          .in('flat_id', flatIds);
        if (error) throw new Error(error.message);
        flatPaymentsCount = Number(count || 0);
      }
    }

    const blocking = {
      partner_contributions: contributionsCount,
      expenses: expensesCount,
      flats: flatsCount,
      flat_payments: flatPaymentsCount,
      project_contractors: contractorsCount,
    };

    const hasBlocking = Object.values(blocking).some((n) => Number(n) > 0);
    if (hasBlocking) {
      return res.status(409).json({
        message: 'Project cannot be deleted because dependent records exist. Remove related records first.',
        blocking,
      });
    }

    const { error } = await supabaseAdmin.from('projects').delete().eq('id', projectId);
    if (error) return res.status(400).json({ message: error.message });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete project');
    return res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to delete project' });
  }
});

app.get('/api/project/:projectId/contractors', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await fetchProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const contractors = await listContractors(projectId);
    return res.json(contractors);
  } catch (err) {
    logger.error({ err }, 'Failed to list contractors');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to list contractors' });
  }
});

// Aliases for "contracts" routes (same underlying contractor agreements)
app.get('/api/projects/:projectId/contracts', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await fetchProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const contractors = await listContractors(projectId);
    return res.json(contractors);
  } catch (err) {
    logger.error({ err }, 'Failed to list contracts');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to list contracts' });
  }
});

async function createContractorForProject({ projectId, contractor_name, type, fixed_amount, rate_per_sqft }) {
  const project = await fetchProject(projectId);
  if (!project) {
    const e = new Error('Project not found');
    e.statusCode = 404;
    throw e;
  }

  const normalizedType = String(type || '').toLowerCase();
  if (!['fixed', 'per_sqft'].includes(normalizedType)) {
    const e = new Error('Invalid contractor type');
    e.statusCode = 400;
    throw e;
  }
  if (normalizedType === 'fixed' && fixed_amount === undefined) {
    const e = new Error('fixed_amount is required for fixed contracts');
    e.statusCode = 400;
    throw e;
  }
  if (normalizedType === 'per_sqft' && rate_per_sqft === undefined) {
    const e = new Error('rate_per_sqft is required for per_sqft contracts');
    e.statusCode = 400;
    throw e;
  }

  const total_sqft = toNumber(project.project_total_sqft);
  const { calculated_total, remaining_amount } = recalcContractorFields({
    type: normalizedType,
    fixed_amount,
    rate_per_sqft,
    total_sqft,
    already_paid: 0,
  });

  const { data, error } = await supabaseAdmin
    .from('project_contractors')
    .insert({
      project_id: projectId,
      contractor_name,
      type: normalizedType,
      fixed_amount: normalizedType === 'fixed' ? toNumber(fixed_amount) : null,
      rate_per_sqft: normalizedType === 'per_sqft' ? toNumber(rate_per_sqft) : null,
      total_sqft,
      calculated_total,
      already_paid: 0,
      remaining_amount,
    })
    .select()
    .single();
  if (error) {
    const e = new Error(error.message);
    e.statusCode = 400;
    throw e;
  }
  return data;
}

async function updateContractorById({ id, body }) {
  const existing = await fetchContractor(id);
  if (!existing) {
    const e = new Error('Contractor not found');
    e.statusCode = 404;
    throw e;
  }
  const project = await fetchProject(existing.project_id);
  if (!project) {
    const e = new Error('Project not found');
    e.statusCode = 404;
    throw e;
  }

  const nextType = String(body?.type || existing.type || '').toLowerCase();
  if (!['fixed', 'per_sqft'].includes(nextType)) {
    const e = new Error('Invalid contractor type');
    e.statusCode = 400;
    throw e;
  }
  const total_sqft = toNumber(project.project_total_sqft);
  const fixed_amount = nextType === 'fixed' ? toNumber(body?.fixed_amount ?? existing.fixed_amount) : null;
  const rate_per_sqft = nextType === 'per_sqft' ? toNumber(body?.rate_per_sqft ?? existing.rate_per_sqft) : null;
  const { calculated_total, remaining_amount } = recalcContractorFields({
    type: nextType,
    fixed_amount,
    rate_per_sqft,
    total_sqft,
    already_paid: existing.already_paid,
  });

  const { data, error } = await supabaseAdmin
    .from('project_contractors')
    .update({
      contractor_name: body?.contractor_name ?? existing.contractor_name,
      type: nextType,
      fixed_amount,
      rate_per_sqft,
      total_sqft,
      calculated_total,
      remaining_amount,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    const e = new Error(error.message);
    e.statusCode = 400;
    throw e;
  }
  return data;
}

async function deleteContractorById({ id }) {
  const existing = await fetchContractor(id);
  if (!existing) {
    const e = new Error('Contractor not found');
    e.statusCode = 404;
    throw e;
  }
  const { error } = await supabaseAdmin.from('project_contractors').delete().eq('id', id);
  if (error) {
    const e = new Error(error.message);
    e.statusCode = 400;
    throw e;
  }
  return { ok: true };
}

app.post('/api/contractors', authenticate, async (req, res) => {
  try {
    const { project_id, contractor_name, type, fixed_amount, rate_per_sqft } = req.body;
    const data = await createContractorForProject({
      projectId: project_id,
      contractor_name,
      type,
      fixed_amount,
      rate_per_sqft,
    });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create contractor');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to create contractor' });
  }
});

app.post('/api/projects/:projectId/contracts', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { contractor_name, type, fixed_amount, rate_per_sqft } = req.body;
    const data = await createContractorForProject({ projectId, contractor_name, type, fixed_amount, rate_per_sqft });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create contract');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to create contract' });
  }
});

app.put('/api/contractors/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await updateContractorById({ id, body: req.body });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update contractor');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to update contractor' });
  }
});

app.put('/api/contracts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await updateContractorById({ id, body: req.body });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update contract');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to update contract' });
  }
});

app.delete('/api/contractors/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteContractorById({ id });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to delete contractor');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to delete contractor' });
  }
});

app.delete('/api/contracts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteContractorById({ id });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to delete contract');
    const status = err && err.statusCode ? err.statusCode : 500;
    return res.status(status).json({ message: err instanceof Error ? err.message : 'Failed to delete contract' });
  }
});


async function fetchContractor(contractorId) {
  const { data, error } = await supabaseAdmin
    .from('project_contractors')
    .select('*')
    .eq('id', contractorId)
    .single();
  if (error) return null;
  return data;
}

async function listContractors(projectId) {
  const { data, error } = await supabaseAdmin
    .from('project_contractors')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) {
    const msg = String(error.message || 'Failed to load contractors');
    const lower = msg.toLowerCase();
    if (lower.includes('schema cache') || lower.includes('could not find table') || lower.includes('project_contractors')) {
      const e = new Error(
        "Supabase schema cache is missing table public.project_contractors. Run the safe SQL to create it and execute: select pg_notify('pgrst','reload schema');",
      );
      e.statusCode = 503;
      throw e;
    }
    throw new Error(msg);
  }
  return data || [];
}

function computeContractorTotals(contractors) {
  const totals = (contractors || []).reduce(
    (acc, c) => {
      acc.total_contract_value += toNumber(c.calculated_total);
      acc.total_paid_to_contractors += toNumber(c.already_paid);
      acc.total_remaining_contractor_payables += toNumber(c.remaining_amount);
      return acc;
    },
    { total_contract_value: 0, total_paid_to_contractors: 0, total_remaining_contractor_payables: 0 },
  );
  return totals;
}

function recalcContractorFields({ type, fixed_amount, rate_per_sqft, total_sqft, already_paid }) {
  const normalizedType = String(type || 'fixed').toLowerCase();
  const sqft = toNumber(total_sqft);
  const paid = toNumber(already_paid);
  const fixed = toNumber(fixed_amount);
  const rate = toNumber(rate_per_sqft);
  const calculated_total = normalizedType === 'per_sqft' ? rate * sqft : fixed;
  const remaining_amount = calculated_total - paid;
  return { calculated_total, remaining_amount };
}

async function applyContractorPaymentDelta({ contractorId, deltaAmount }) {
  if (!contractorId) return;
  const contractor = await fetchContractor(contractorId);
  if (!contractor) throw new Error('Contractor not found');
  const nextPaid = toNumber(contractor.already_paid) + toNumber(deltaAmount);
  const { calculated_total, remaining_amount } = recalcContractorFields({
    type: contractor.type,
    fixed_amount: contractor.fixed_amount,
    rate_per_sqft: contractor.rate_per_sqft,
    total_sqft: contractor.total_sqft,
    already_paid: nextPaid,
  });
  const { error } = await supabaseAdmin
    .from('project_contractors')
    .update({ already_paid: nextPaid, calculated_total, remaining_amount })
    .eq('id', contractorId);
  if (error) throw new Error(error.message);
}

app.get('/api/project/:projectId/summary', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await fetchProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const summary = await computeProjectSummary(projectId);
    return res.json({ project_id: projectId, project_name: project.name, ...summary });
  } catch (err) {
    logger.error({ err }, 'Failed to compute project summary');
    return res.status(500).json({ message: 'Failed to compute project summary' });
  }
});

function sendExcel(res, report) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  const buffer = Buffer.isBuffer(report.buffer) ? report.buffer : Buffer.from(report.buffer);
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
}

const sumAmount = (rows) => (rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

const toNumber = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

function computeContributionAggregates(contributions) {
  const totalsByType = (contributions || []).reduce(
    (acc, c) => {
      const t = (c.contribution_type || 'account_credit').toLowerCase();
      const amt = toNumber(c.amount);
      if (t === 'direct_expense') {
        acc.total_direct_contributions += amt;
      } else {
        acc.total_account_credits += amt;
      }
      const partner = (c.partner_name || '').trim() || 'Unknown';
      acc.byPartner.set(partner, (acc.byPartner.get(partner) || 0) + amt);
      return acc;
    },
    { total_account_credits: 0, total_direct_contributions: 0, byPartner: new Map() },
  );

  const total_contribution = totalsByType.total_account_credits + totalsByType.total_direct_contributions;
  const contributor_share = Array.from(totalsByType.byPartner.entries())
    .map(([partner_name, amount]) => ({ partner_name, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    total_contribution,
    total_account_credits: totalsByType.total_account_credits,
    total_direct_contributions: totalsByType.total_direct_contributions,
    contributor_share,
  };
}

function computeMonthlyFlow({ contributions, expenses, installments }) {
  const monthKey = (dateStr) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const byMonth = new Map();

  (contributions || []).forEach((c) => {
    const t = (c.contribution_type || 'account_credit').toLowerCase();
    const k = monthKey(c.date);
    if (k === 'Unknown') return;
    const entry = byMonth.get(k) || { month: k, account_credit_in: 0, direct_expense: 0, buyer_payments_in: 0, expenses_out: 0 };
    const amt = toNumber(c.amount);
    if (t === 'direct_expense') entry.direct_expense += amt;
    else entry.account_credit_in += amt;
    byMonth.set(k, entry);
  });

  (installments || []).forEach((i) => {
    const k = monthKey(i.date);
    if (k === 'Unknown') return;
    const entry = byMonth.get(k) || { month: k, account_credit_in: 0, direct_expense: 0, buyer_payments_in: 0, expenses_out: 0 };
    entry.buyer_payments_in += toNumber(i.amount);
    byMonth.set(k, entry);
  });

  (expenses || []).forEach((e) => {
    const k = monthKey(e.date);
    if (k === 'Unknown') return;
    const entry = byMonth.get(k) || { month: k, account_credit_in: 0, direct_expense: 0, buyer_payments_in: 0, expenses_out: 0 };
    entry.expenses_out += toNumber(e.amount);
    byMonth.set(k, entry);
  });

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function computeExpenseCategorySplit(expenses) {
  const byCat = new Map();
  (expenses || []).forEach((e) => {
    const cat = (e.category || '').trim() || 'Uncategorized';
    byCat.set(cat, (byCat.get(cat) || 0) + toNumber(e.amount));
  });
  return Array.from(byCat.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

async function computeProjectSummary(projectId) {
  const [{ data: contributions = [] }, { data: expenses = [] }, contractors, { data: flats = [] }] = await Promise.all([
    supabaseAdmin
      .from('partner_contributions')
      .select('amount, contribution_type, partner_name, date')
      .eq('project_id', projectId),
    supabaseAdmin.from('expenses').select('amount, category, date').eq('project_id', projectId),
    listContractors(projectId).catch(() => []),
    supabaseAdmin.from('flats').select('id, total_cost').eq('project_id', projectId),
  ]);

  const flatIds = (flats || []).map((f) => f.id);
  const { data: installments = [] } = flatIds.length
    ? await supabaseAdmin.from('flat_payments').select('amount, date, flat_id').in('flat_id', flatIds)
    : { data: [] };

  const contribAgg = computeContributionAggregates(contributions);
  const total_expenses = sumAmount(expenses);

  const buyer_payments_received = sumAmount(installments);
  const total_buyer_receivables = (flats || []).reduce((sum, f) => sum + toNumber(f.total_cost), 0);
  const buyer_pending = Math.max(total_buyer_receivables - buyer_payments_received, 0);

  const cash_balance = contribAgg.total_account_credits + buyer_payments_received - total_expenses;

  const monthly_flow = computeMonthlyFlow({ contributions, expenses, installments });
  const expense_category_split = computeExpenseCategorySplit(expenses);
  const contractor_totals = computeContractorTotals(contractors);

  return {
    ...contribAgg,
    buyer_payments_received,
    total_buyer_receivables,
    buyer_pending,
    total_expenses,
    cash_balance,
    monthly_flow,
    expense_category_split,
    ...contractor_totals,
  };
}

async function computeDashboardStats() {
  const [{ data: projects = [] }, { data: contributions = [] }, { data: expenses = [] }, { data: contractors = [] }, { data: flats = [] }, { data: installments = [] }] = await Promise.all([
    supabaseAdmin.from('projects').select('id'),
    supabaseAdmin.from('partner_contributions').select('amount, contribution_type, partner_name, date'),
    supabaseAdmin.from('expenses').select('amount, category, date'),
    supabaseAdmin.from('project_contractors').select('calculated_total, already_paid, remaining_amount'),
    supabaseAdmin.from('flats').select('id, total_cost'),
    supabaseAdmin.from('flat_payments').select('amount, date, flat_id'),
  ]);

  const contribAgg = computeContributionAggregates(contributions);
  const total_expenses = sumAmount(expenses);

  const total_buyer_payments_received = sumAmount(installments);
  const total_buyer_receivables = (flats || []).reduce((sum, f) => sum + toNumber(f.total_cost), 0);
  const total_buyer_pending = Math.max(total_buyer_receivables - total_buyer_payments_received, 0);

  const cash_balance = contribAgg.total_account_credits + total_buyer_payments_received - total_expenses;

  const monthly_flow = computeMonthlyFlow({ contributions, expenses, installments });
  const expense_category_split = computeExpenseCategorySplit(expenses);
  const contractor_totals = computeContractorTotals(contractors);

  return {
    total_projects: projects.length,
    total_contribution: contribAgg.total_contribution,
    total_account_credits: contribAgg.total_account_credits,
    total_direct_contributions: contribAgg.total_direct_contributions,
    total_buyer_payments_received,
    total_buyer_receivables,
    total_buyer_pending,
    total_expenses,
    cash_balance,
    contributor_share: contribAgg.contributor_share,
    monthly_flow,
    expense_category_split,
    ...contractor_totals,
  };
}

async function logAudit({ transactionId, projectId, userId, oldValues, newValues }) {
  const { error } = await supabaseAdmin.from('transaction_audit_logs').insert({
    transaction_id: transactionId,
    project_id: projectId,
    changed_by: userId || null,
    old_values: oldValues,
    new_values: newValues,
  });
  if (error) logger.error({ error }, 'Failed to log audit entry');
}

async function calculateBalance(projectId) {
  const summary = await computeProjectSummary(projectId);
  return {
    contributions: summary.total_contribution,
    buyer_payments_received: summary.buyer_payments_received,
    expenses: summary.total_expenses,
    balance: summary.cash_balance,
  };
}

async function fetchProject(projectId) {
  const { data, error } = await supabaseAdmin.from('projects').select('*').eq('id', projectId).single();
  if (error) {
    logger.error({ error }, 'Failed to fetch project');
    return null;
  }
  return data;
}

app.post('/projects', authenticate, async (req, res) => {
  try {
    const { name, location, status, project_total_sqft, project_docs_folder_url, elevation_image_url } = req.body;
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        name,
        location,
        status,
        project_total_sqft: project_total_sqft !== undefined && project_total_sqft !== null ? toNumber(project_total_sqft) : null,
        project_docs_folder_url: project_docs_folder_url || null,
        elevation_image_url: elevation_image_url || null,
        created_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create project');
    return res.status(500).json({ message: 'Failed to create project' });
  }
});

app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const { name, location, status, project_total_sqft, project_docs_folder_url, elevation_image_url } = req.body;
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        name,
        location,
        status,
        project_total_sqft: project_total_sqft !== undefined && project_total_sqft !== null ? toNumber(project_total_sqft) : null,
        project_docs_folder_url: project_docs_folder_url || null,
        elevation_image_url: elevation_image_url || null,
        created_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create project');
    return res.status(500).json({ message: 'Failed to create project' });
  }
});

app.get('/api/settings/global-docs-folder', authenticate, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key,value')
      .eq('key', 'global_docs_folder_url')
      .single();
    if (error) {
      return res.json({ global_docs_folder_url: null });
    }
    return res.json({ global_docs_folder_url: data?.value || null });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch global docs folder setting');
    return res.status(500).json({ message: 'Failed to fetch setting' });
  }
});

app.put('/api/settings/global-docs-folder', authenticate, async (req, res) => {
  try {
    const { global_docs_folder_url } = req.body;
    const value = global_docs_folder_url ? String(global_docs_folder_url).trim() : null;
    const { data, error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: 'global_docs_folder_url', value }, { onConflict: 'key' })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.json({ global_docs_folder_url: data?.value || null });
  } catch (err) {
    logger.error({ err }, 'Failed to update global docs folder setting');
    return res.status(500).json({ message: 'Failed to update setting' });
  }
});

app.get('/projects', authenticate, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('projects').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to list projects');
    return res.status(500).json({ message: 'Failed to list projects' });
  }
});

app.get('/api/projects', authenticate, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('projects').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to list projects');
    return res.status(500).json({ message: 'Failed to list projects' });
  }
});

app.get('/projects/:id', authenticate, async (req, res) => {
  try {
    const project = await fetchProject(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const totals = await calculateBalance(project.id);
    return res.json({ ...project, totals });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch project');
    return res.status(500).json({ message: 'Failed to fetch project' });
  }
});

app.get('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const project = await fetchProject(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const totals = await calculateBalance(project.id);
    return res.json({ ...project, totals });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch project');
    return res.status(500).json({ message: 'Failed to fetch project' });
  }
});

app.post('/contributions', authenticate, async (req, res) => {
  try {
    const {
      project_id,
      partner_name,
      partner_email,
      amount,
      mode,
      date,
      notes,
      contribution_type,
      vendor_name,
      purpose,
      proof,
      contractor_id,
    } = req.body;
    const project = await fetchProject(project_id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const normalizedType = (contribution_type || 'account_credit').toLowerCase();
    if (!['account_credit', 'direct_expense'].includes(normalizedType)) {
      return res.status(400).json({ message: 'Invalid contribution_type' });
    }
    if (normalizedType === 'direct_expense') {
      if (!vendor_name || !purpose) {
        return res.status(400).json({ message: 'vendor_name and purpose are required for direct_expense' });
      }
    }

    let normalizedContractorId = contractor_id || null;
    if (normalizedType !== 'direct_expense') normalizedContractorId = null;
    if (normalizedContractorId) {
      const contractor = await fetchContractor(normalizedContractorId);
      if (!contractor || contractor.project_id !== project_id) {
        return res.status(400).json({ message: 'Invalid contractor_id' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('partner_contributions')
      .insert({
        project_id,
        partner_name,
        partner_email,
        amount,
        mode,
        date,
        notes,
        contribution_type: normalizedType,
        vendor_name: normalizedType === 'direct_expense' ? vendor_name : null,
        purpose: normalizedType === 'direct_expense' ? purpose : null,
        proof: normalizedType === 'direct_expense' ? proof : null,
        contractor_id: normalizedContractorId,
        updated_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    if (normalizedContractorId) {
      await applyContractorPaymentDelta({ contractorId: normalizedContractorId, deltaAmount: toNumber(amount) });
    }

    const summary = await computeProjectSummary(project_id);
    const balance = await calculateBalance(project_id);
    await logAudit({ transactionId: data.id, projectId: project_id, userId: req.user?.id || null, oldValues: null, newValues: data });
    fireAndForget(
      emailService.sendTransactionEmail({
        projectId: project_id,
        projectName: project.name,
        transactionType: 'Partner contribution added',
        amount,
        date,
        actorName: req.user.email || req.user.id,
        contributionType: normalizedType,
        vendorName: normalizedType === 'direct_expense' ? vendor_name : null,
        purpose: normalizedType === 'direct_expense' ? purpose : null,
        proof: normalizedType === 'direct_expense' ? proof : null,
        cashBalance: summary.cash_balance,
        totalContribution: summary.total_contribution,
        contributorShare: summary.contributor_share,
        updatedBalance: balance.balance,
        projectLink: `${config.projectAppUrl}/projects/${project_id}`,
        notes,
      }),
      'Contribution email failed',
    );

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create contribution');
    return res.status(500).json({ message: 'Failed to create contribution' });
  }
});

app.put('/contributions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('partner_contributions')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ message: 'Contribution not found' });

    const nextType = (req.body?.contribution_type || existing.contribution_type || 'account_credit').toLowerCase();
    if (!['account_credit', 'direct_expense'].includes(nextType)) {
      return res.status(400).json({ message: 'Invalid contribution_type' });
    }
    if (nextType === 'direct_expense') {
      const vName = req.body?.vendor_name ?? existing.vendor_name;
      const purp = req.body?.purpose ?? existing.purpose;
      if (!vName || !purp) {
        return res.status(400).json({ message: 'vendor_name and purpose are required for direct_expense' });
      }
    }

    let nextContractorId = req.body?.contractor_id ?? existing.contractor_id ?? null;
    if (nextType !== 'direct_expense') nextContractorId = null;
    if (nextContractorId) {
      const contractor = await fetchContractor(nextContractorId);
      if (!contractor || contractor.project_id !== existing.project_id) {
        return res.status(400).json({ message: 'Invalid contractor_id' });
      }
    }

    const update = {
      partner_name: req.body?.partner_name ?? existing.partner_name,
      partner_email: req.body?.partner_email ?? existing.partner_email,
      amount: req.body?.amount ?? existing.amount,
      mode: req.body?.mode ?? existing.mode,
      date: req.body?.date ?? existing.date,
      notes: req.body?.notes ?? existing.notes,
      contribution_type: nextType,
      vendor_name: nextType === 'direct_expense' ? (req.body?.vendor_name ?? existing.vendor_name) : null,
      purpose: nextType === 'direct_expense' ? (req.body?.purpose ?? existing.purpose) : null,
      proof: nextType === 'direct_expense' ? (req.body?.proof ?? existing.proof) : null,
      contractor_id: nextContractorId,
      updated_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('partner_contributions')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    const oldEffectiveContractor = (existing.contribution_type || 'account_credit').toLowerCase() === 'direct_expense'
      ? (existing.contractor_id || null)
      : null;
    const newEffectiveContractor = nextType === 'direct_expense' ? (nextContractorId || null) : null;
    const oldAmount = toNumber(existing.amount);
    const newAmount = toNumber(data.amount);

    if (oldEffectiveContractor && oldEffectiveContractor !== newEffectiveContractor) {
      await applyContractorPaymentDelta({ contractorId: oldEffectiveContractor, deltaAmount: -oldAmount });
    }
    if (newEffectiveContractor && oldEffectiveContractor !== newEffectiveContractor) {
      await applyContractorPaymentDelta({ contractorId: newEffectiveContractor, deltaAmount: newAmount });
    }
    if (newEffectiveContractor && oldEffectiveContractor === newEffectiveContractor && oldAmount !== newAmount) {
      await applyContractorPaymentDelta({ contractorId: newEffectiveContractor, deltaAmount: newAmount - oldAmount });
    }

    const balance = await calculateBalance(existing.project_id);
    const project = await fetchProject(existing.project_id);
    const summary = await computeProjectSummary(existing.project_id);
    await logAudit({ transactionId: id, projectId: existing.project_id, userId: req.user?.id || null, oldValues: existing, newValues: data });
    fireAndForget(
      emailService.sendTransactionEmail({
        projectId: existing.project_id,
        projectName: project?.name || 'Project',
        transactionType: 'Contribution updated',
        amount: data.amount,
        date: data.date,
        actorName: req.user.email || req.user.id,
        contributionType: (data.contribution_type || 'account_credit').toLowerCase(),
        vendorName: (data.contribution_type || '').toLowerCase() === 'direct_expense' ? data.vendor_name : null,
        purpose: (data.contribution_type || '').toLowerCase() === 'direct_expense' ? data.purpose : null,
        proof: (data.contribution_type || '').toLowerCase() === 'direct_expense' ? data.proof : null,
        cashBalance: summary.cash_balance,
        totalContribution: summary.total_contribution,
        contributorShare: summary.contributor_share,
        updatedBalance: balance.balance,
        projectLink: `${config.projectAppUrl}/projects/${existing.project_id}`,
        notes: data.notes,
      }),
      'Contribution update email failed',
    );

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update contribution');
    return res.status(500).json({ message: 'Failed to update contribution' });
  }
});

app.get('/contributions/:projectId', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('partner_contributions')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false });
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to list contributions');
    return res.status(500).json({ message: 'Failed to list contributions' });
  }
});

app.post('/expenses', authenticate, async (req, res) => {
  try {
    const { project_id, title, category, amount, date, paid_by, vendor_name, notes, contractor_id } = req.body;
    const project = await fetchProject(project_id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (contractor_id) {
      const contractor = await fetchContractor(contractor_id);
      if (!contractor || contractor.project_id !== project_id) {
        return res.status(400).json({ message: 'Invalid contractor_id' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        project_id,
        title,
        category,
        amount,
        date,
        paid_by,
        vendor_name,
        notes,
        contractor_id: contractor_id || null,
        updated_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    const summary = await computeProjectSummary(project_id);
    await logAudit({ transactionId: data.id, projectId: project_id, userId: req.user?.id || null, oldValues: null, newValues: data });
    fireAndForget(emailService.sendTransactionEmail({
      projectId: project_id,
      projectName: project.name,
      transactionType: 'Expense added',
      transactionCategory: 'expense',
      amount,
      date,
      actorName: req.user.email || req.user.id,
      cashBalance: summary.cash_balance,
      totalContribution: summary.total_contribution,
      contributorShare: summary.contributor_share,
      projectLink: `${config.projectAppUrl}/projects/${project_id}`,
      notes,
    }), 'Expense email failed');

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create expense');
    return res.status(500).json({ message: 'Failed to create expense' });
  }
});

app.put('/expenses/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ message: 'Expense not found' });

    // Validate contractor link (optional)
    const nextContractorId = req.body?.contractor_id ?? existing.contractor_id ?? null;
    if (nextContractorId) {
      const contractor = await fetchContractor(nextContractorId);
      if (!contractor || contractor.project_id !== existing.project_id) {
        return res.status(400).json({ message: 'Invalid contractor_id' });
      }
    }

    const update = {
      title: req.body?.title ?? existing.title,
      category: req.body?.category ?? existing.category,
      amount: req.body?.amount !== undefined ? toNumber(req.body.amount) : existing.amount,
      date: req.body?.date ?? existing.date,
      paid_by: req.body?.paid_by ?? existing.paid_by,
      vendor_name: req.body?.vendor_name ?? existing.vendor_name,
      notes: req.body?.notes ?? existing.notes,
      contractor_id: nextContractorId,
      updated_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    // Adjust contractor paid totals based on delta
    const oldContractorId = existing.contractor_id || null;
    const newContractorId = data.contractor_id || null;
    const oldAmount = toNumber(existing.amount);
    const newAmount = toNumber(data.amount);

    if (oldContractorId && oldContractorId !== newContractorId) {
      await applyContractorPaymentDelta({ contractorId: oldContractorId, deltaAmount: -oldAmount });
    }
    if (newContractorId && oldContractorId !== newContractorId) {
      await applyContractorPaymentDelta({ contractorId: newContractorId, deltaAmount: newAmount });
    }
    if (newContractorId && oldContractorId === newContractorId && oldAmount !== newAmount) {
      await applyContractorPaymentDelta({ contractorId: newContractorId, deltaAmount: newAmount - oldAmount });
    }

    const project = await fetchProject(existing.project_id);
    const summary = await computeProjectSummary(existing.project_id);
    await logAudit({ transactionId: id, projectId: existing.project_id, userId: req.user?.id || null, oldValues: existing, newValues: data });
    fireAndForget(
      emailService.sendTransactionEmail({
        projectId: existing.project_id,
        projectName: project?.name || 'Project',
        transactionType: 'Expense updated',
        transactionCategory: 'expense',
        amount: data.amount,
        date: data.date,
        actorName: req.user.email || req.user.id,
        cashBalance: summary.cash_balance,
        totalContribution: summary.total_contribution,
        contributorShare: summary.contributor_share,
        projectLink: `${config.projectAppUrl}/projects/${existing.project_id}`,
        notes: data.notes,
      }),
      'Expense update email failed',
    );

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update expense');
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to update expense' });
  }
});

app.get('/expenses/:projectId', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false });
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to list expenses');
    return res.status(500).json({ message: 'Failed to list expenses' });
  }
});

app.post('/flats', authenticate, async (req, res) => {
  try {
    const { project_id, flat_no, buyer_name, buyer_email, total_cost, status } = req.body;
    const project = await fetchProject(project_id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const { data, error } = await supabaseAdmin
      .from('flats')
      .insert({ project_id, flat_no, buyer_name, buyer_email, total_cost, status })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create flat');
    return res.status(500).json({ message: 'Failed to create flat' });
  }
});

app.put('/flats/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchError } = await supabaseAdmin.from('flats').select('*').eq('id', id).single();
    if (fetchError || !existing) return res.status(404).json({ message: 'Flat not found' });

    const nextStatus = req.body?.status !== undefined ? String(req.body.status).toLowerCase().trim() : existing.status;
    if (nextStatus && !['available', 'booked', 'sold'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid flat status. Allowed: available, booked, sold' });
    }

    const update = {
      flat_no: req.body?.flat_no ?? existing.flat_no,
      buyer_name: req.body?.buyer_name ?? existing.buyer_name,
      total_cost: req.body?.total_cost !== undefined ? toNumber(req.body.total_cost) : existing.total_cost,
      status: nextStatus,
    };

    const { data, error } = await supabaseAdmin.from('flats').update(update).eq('id', id).select().single();
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update flat');
    return res.status(500).json({ message: 'Failed to update flat' });
  }
});

app.get('/flats/:projectId', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { data: flats, error } = await supabaseAdmin.from('flats').select('*').eq('project_id', projectId);
    if (error) return res.status(400).json({ message: error.message });

    const flatIds = (flats || []).map((f) => f.id);
    const { data: payments = [] } = flatIds.length
      ? await supabaseAdmin.from('flat_payments').select('*').in('flat_id', flatIds)
      : { data: [] };
    const paidMap = payments.reduce((acc, p) => {
      acc[p.flat_id] = (acc[p.flat_id] || 0) + Number(p.amount || 0);
      return acc;
    }, {});

    const enriched = (flats || []).map((flat) => ({
      ...flat,
      paid_amount: paidMap[flat.id] || 0,
    }));

    return res.json(enriched);
  } catch (err) {
    logger.error({ err }, 'Failed to list flats');
    return res.status(500).json({ message: 'Failed to list flats' });
  }
});

app.get('/flat/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: flat, error } = await supabaseAdmin.from('flats').select('*').eq('id', id).single();
    if (error || !flat) return res.status(404).json({ message: 'Flat not found' });
    const { data: installments = [] } = await supabaseAdmin
      .from('flat_payments')
      .select('*')
      .eq('flat_id', id)
      .order('date', { ascending: false });
    const paid_amount = sumAmount(installments);
    return res.json({ ...flat, installments, paid_amount });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch flat');
    return res.status(500).json({ message: 'Failed to fetch flat' });
  }
});

app.post('/flat/installment', authenticate, async (req, res) => {
  try {
    const { flat_id, amount, date, mode, notes } = req.body;
    const { data: flat, error: flatError } = await supabaseAdmin.from('flats').select('*').eq('id', flat_id).single();
    if (flatError || !flat) return res.status(404).json({ message: 'Flat not found' });
    const project = await fetchProject(flat.project_id);

    const { data, error } = await supabaseAdmin
      .from('flat_payments')
      .insert({ flat_id, amount, date, mode, notes })
      .select()
      .single();
    if (error) return res.status(400).json({ message: error.message });

    const summary = await computeProjectSummary(flat.project_id);
    await logAudit({ transactionId: data.id, projectId: flat.project_id, userId: req.user?.id || null, oldValues: null, newValues: data });
    fireAndForget(emailService.sendTransactionEmail({
      projectId: flat.project_id,
      projectName: project?.name || 'Project',
      transactionType: 'Flat installment added',
      transactionCategory: 'flat payment',
      amount,
      date,
      actorName: req.user.email || req.user.id,
      cashBalance: summary.cash_balance,
      totalContribution: summary.total_contribution,
      contributorShare: summary.contributor_share,
      projectLink: `${config.projectAppUrl}/projects/${flat.project_id}`,
      notes,
    }), 'Installment email failed');

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to create installment');
    return res.status(500).json({ message: 'Failed to create installment' });
  }
});

app.get('/flat/installments/:flatId', authenticate, async (req, res) => {
  try {
    const { flatId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('flat_payments')
      .select('*')
      .eq('flat_id', flatId)
      .order('date', { ascending: false });
    if (error) return res.status(400).json({ message: error.message });
    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to list installments');
    return res.status(500).json({ message: 'Failed to list installments' });
  }
});

app.put('/flat/installment/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date, mode, notes } = req.body || {};

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('flat_payments')
      .select('*')
      .eq('id', id)
      .single();
    if (existingError || !existing) return res.status(404).json({ message: 'Installment not found' });

    const { data: flat, error: flatError } = await supabaseAdmin.from('flats').select('*').eq('id', existing.flat_id).single();
    if (flatError || !flat) return res.status(404).json({ message: 'Flat not found' });
    const project = await fetchProject(flat.project_id);

    const patch = {
      amount: amount !== undefined ? toNumber(amount) : existing.amount,
      date: date !== undefined ? String(date) : existing.date,
      mode: mode !== undefined ? String(mode) : existing.mode,
      notes: notes !== undefined ? String(notes) : existing.notes,
    };

    const { data, error } = await supabaseAdmin.from('flat_payments').update(patch).eq('id', id).select().single();
    if (error) return res.status(400).json({ message: error.message });

    const summary = await computeProjectSummary(flat.project_id);
    await logAudit({ transactionId: data.id, projectId: flat.project_id, userId: req.user?.id || null, oldValues: existing, newValues: data });
    fireAndForget(emailService.sendTransactionEmail({
      projectId: flat.project_id,
      projectName: project?.name || 'Project',
      transactionType: 'Flat installment updated',
      transactionCategory: 'flat payment',
      amount: patch.amount,
      date: patch.date,
      actorName: req.user.email || req.user.id,
      cashBalance: summary.cash_balance,
      totalContribution: summary.total_contribution,
      contributorShare: summary.contributor_share,
      projectLink: `${config.projectAppUrl}/projects/${flat.project_id}`,
      notes: patch.notes,
    }), 'Installment update email failed');

    return res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to update installment');
    return res.status(500).json({ message: 'Failed to update installment' });
  }
});

app.delete('/flat/installment/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('flat_payments')
      .select('*')
      .eq('id', id)
      .single();
    if (existingError || !existing) return res.status(404).json({ message: 'Installment not found' });

    const { data: flat, error: flatError } = await supabaseAdmin.from('flats').select('*').eq('id', existing.flat_id).single();
    if (flatError || !flat) return res.status(404).json({ message: 'Flat not found' });
    const project = await fetchProject(flat.project_id);

    const { error } = await supabaseAdmin.from('flat_payments').delete().eq('id', id);
    if (error) return res.status(400).json({ message: error.message });

    const summary = await computeProjectSummary(flat.project_id);
    await logAudit({ transactionId: existing.id, projectId: flat.project_id, userId: req.user?.id || null, oldValues: existing, newValues: null });
    fireAndForget(emailService.sendTransactionEmail({
      projectId: flat.project_id,
      projectName: project?.name || 'Project',
      transactionType: 'Flat installment deleted',
      transactionCategory: 'flat payment',
      amount: existing.amount,
      date: existing.date,
      actorName: req.user.email || req.user.id,
      cashBalance: summary.cash_balance,
      totalContribution: summary.total_contribution,
      contributorShare: summary.contributor_share,
      projectLink: `${config.projectAppUrl}/projects/${flat.project_id}`,
      notes: existing.notes,
    }), 'Installment delete email failed');

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete installment');
    return res.status(500).json({ message: 'Failed to delete installment' });
  }
});

app.get('/reports/project/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const report = await generateProjectReport(id);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate report');
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to generate report' });
  }
});

app.get('/reports/contributions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const report = await generateContributionsReport(id);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate contributions report');
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to generate contributions report' });
  }
});

app.get('/reports/expenses/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const report = await generateExpensesReport(id);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate expenses report');
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to generate expenses report' });
  }
});

app.get('/reports/installments/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const report = await generateFlatInstallmentsReport(id);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate flat installments report');
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to generate flat installments report' });
  }
});

app.get('/reports/flats/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const report = await generateFlatsReport(id);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate flats report');
    return res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to generate flats report' });
  }
});

app.get('/reports/project/:projectId/contributor/:partnerName', authenticate, async (req, res) => {
  try {
    const { projectId, partnerName } = req.params;
    const report = await generateContributorWiseContributionsReport(projectId, partnerName);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate contributor-wise report');
    return res.status(500).json({
      message: err instanceof Error ? err.message : 'Failed to generate contributor-wise report',
    });
  }
});

app.get('/api/reports/project/:projectId/contributor/:partnerName', authenticate, async (req, res) => {
  try {
    const { projectId, partnerName } = req.params;
    const report = await generateContributorWiseContributionsReport(projectId, partnerName);
    return sendExcel(res, report);
  } catch (err) {
    logger.error({ err }, 'Failed to generate contributor-wise report');
    return res.status(500).json({
      message: err instanceof Error ? err.message : 'Failed to generate contributor-wise report',
    });
  }
});

app.post('/email/transaction', authenticate, async (req, res) => {
  try {
    await emailService.sendTransactionEmail(req.body);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to send transaction email');
    return res.status(500).json({ message: 'Failed to send email' });
  }
});

async function sendWeeklySummaryForAllProjects(targetProjectId) {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceDate = since.toISOString().slice(0, 10);

  const { data: projects = [] } = await supabaseAdmin.from('projects').select('*');
  const targets = targetProjectId ? projects.filter((p) => p.id === targetProjectId) : projects;

  for (const project of targets) {
    const { data: contributions = [] } = await supabaseAdmin
      .from('partner_contributions')
      .select('*')
      .eq('project_id', project.id)
      .gte('date', sinceDate);

    const { data: expenses = [] } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('project_id', project.id)
      .gte('date', sinceDate);

    const { data: flats = [] } = await supabaseAdmin.from('flats').select('id').eq('project_id', project.id);
    const flatIds = flats.map((f) => f.id);
    const { data: installments = [] } = flatIds.length
      ? await supabaseAdmin.from('flat_payments').select('*').in('flat_id', flatIds).gte('date', sinceDate)
      : { data: [] };

    const balance = await calculateBalance(project.id);
    const recipients = await emailService.getPartnerEmails(project.id);
    if (!recipients.length) {
      logger.warn({ projectId: project.id }, 'Weekly summary skipped, no partner emails');
      continue;
    }

    await emailService.sendWeeklySummaryEmail({
      projectName: project.name,
      recipients,
      summary: { since: sinceDate, contributions, expenses, installments, balance },
    });
  }
}

app.post('/email/weekly-summary', authenticate, async (req, res) => {
  try {
    const { projectId } = req.body;
    await sendWeeklySummaryForAllProjects(projectId);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to send weekly summary');
    return res.status(500).json({ message: 'Failed to send weekly summary' });
  }
});

cron.schedule('0 9 * * 1', () => {
  sendWeeklySummaryForAllProjects().catch((err) => logger.error({ err }, 'Weekly summary cron failed'));
});

// Serve built frontend if available (single-port deploy)
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
        if (err) next();
      });
    }
    return next();
  });
} else {
  logger.warn({ clientDistPath }, 'Frontend dist not found; SPA static serving disabled');
}

function freePort(port) {
  try {
    const pidsRaw = execSync(`lsof -ti tcp:${port} || true`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const pids = pidsRaw
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (!pids.length) return false;

    pids.forEach((pid) => {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      } catch {
        // ignore
      }
    });
    return true;
  } catch {
    return false;
  }
}

function startServer(port, remainingRetries = 3) {
  const server = app.listen(port, () => {
    logger.info(`API and static frontend ready on :${port}`);
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && process.env.NODE_ENV !== 'production' && remainingRetries > 0) {
      logger.warn({ port }, 'Port in use, attempting to free and retry');
      try {
        server.close();
      } catch {
        // ignore
      }

      const freed = freePort(port);
      if (!freed) {
        logger.warn({ port }, 'Port in use but no process could be freed; retrying shortly');
      }
      setTimeout(() => startServer(port, remainingRetries - 1), 250);
      return;
    }
    logger.error({ err, port }, 'Failed to start server');
    process.exit(1);
  });
}

startServer(config.port);

