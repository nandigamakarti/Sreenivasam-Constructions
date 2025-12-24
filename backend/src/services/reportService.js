import ExcelJS from 'exceljs';
import { supabaseAdmin } from '../supabaseClient.js';

const toNumber = (value) => Number(value || 0);

function computeContributionAggregates(contributions) {
  const acc = { total_account_credits: 0, total_direct_contributions: 0, byPartner: new Map() };
  (contributions || []).forEach((c) => {
    const t = String(c.contribution_type || 'account_credit').toLowerCase();
    const amt = toNumber(c.amount);
    if (t === 'direct_expense') acc.total_direct_contributions += amt;
    else acc.total_account_credits += amt;
    const partner = (c.partner_name || '').trim() || 'Unknown';
    acc.byPartner.set(partner, (acc.byPartner.get(partner) || 0) + amt);
  });
  const total_contribution = acc.total_account_credits + acc.total_direct_contributions;
  const contributor_share = Array.from(acc.byPartner.entries())
    .map(([partner_name, amount]) => ({ partner_name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { ...acc, total_contribution, contributor_share };
}

function addTotalsAndShareSection(sheet, { totals, contributor_share }) {
  const totalForPct = toNumber(totals.total_contribution);
  sheet.addRows([
    ['TOTALS'],
    ['Total Contributions', totals.total_contribution],
    ['Total Account Credits', totals.total_account_credits],
    ['Total Direct Contributions', totals.total_direct_contributions],
    ['Buyer Payments Received', totals.buyer_payments_received || 0],
    ['Total Buyer Receivables', totals.total_buyer_receivables || 0],
    ['Buyer Pending Amount', totals.buyer_pending || 0],
    ['Total Expenses', totals.total_expenses],
    ['Cash Balance', totals.cash_balance],
    [],
    ['CONTRIBUTION SHARE'],
    ['Partner', 'Amount', '%'],
  ]);

  (contributor_share || []).forEach((r) => {
    const amt = toNumber(r.amount);
    const pct = totalForPct > 0 ? (amt / totalForPct) * 100 : 0;
    sheet.addRow([r.partner_name, amt, `${pct.toFixed(1)}%`]);
  });

  sheet.addRow([]);
}

function addContractorsSection(sheet, contractors) {
  sheet.addRows([
    ['CONTRACTS SUMMARY'],
    ['Contractor', 'Total Contract', 'Paid', 'Remaining'],
  ]);
  (contractors || []).forEach((c) => {
    sheet.addRow([c.contractor_name, toNumber(c.calculated_total), toNumber(c.already_paid), toNumber(c.remaining_amount)]);
  });
  sheet.addRow([]);
}

async function requireProject(projectId) {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();
  if (error || !project) throw new Error('Project not found');
  return project;
}

export async function generateProjectReport(projectId) {
  const project = await requireProject(projectId);

  const { data: contributions = [] } = await supabaseAdmin
    .from('partner_contributions')
    .select('*')
    .eq('project_id', projectId);

  const { data: expenses = [] } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('project_id', projectId);

  const { data: contractors = [] } = await supabaseAdmin
    .from('project_contractors')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  const { data: flats = [] } = await supabaseAdmin.from('flats').select('*').eq('project_id', projectId);
  const flatIds = flats.map((f) => f.id);
  const { data: payments = [] } = flatIds.length
    ? await supabaseAdmin.from('flat_payments').select('*').in('flat_id', flatIds)
    : { data: [] };

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Summary');
  const contribAgg = computeContributionAggregates(contributions);
  const expenseTotal = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
  const installmentTotal = payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
  const totalBuyerReceivables = (flats || []).reduce((sum, f) => sum + toNumber(f.total_cost), 0);
  const buyerPending = Math.max(totalBuyerReceivables - installmentTotal, 0);

  const totals = {
    total_contribution: contribAgg.total_contribution,
    total_account_credits: contribAgg.total_account_credits,
    total_direct_contributions: contribAgg.total_direct_contributions,
    buyer_payments_received: installmentTotal,
    total_buyer_receivables: totalBuyerReceivables,
    buyer_pending: buyerPending,
    total_expenses: expenseTotal,
    cash_balance: contribAgg.total_account_credits + installmentTotal - expenseTotal,
  };

  summarySheet.addRows([
    ['Project', project.name],
    ['Location', project.location || ''],
    ['Status', project.status || ''],
    [],
    ['Buyer Payments Received', installmentTotal],
    ['Total Buyer Receivables', totalBuyerReceivables],
    ['Buyer Pending Amount', buyerPending],
    [],
  ]);

  addTotalsAndShareSection(summarySheet, { totals, contributor_share: contribAgg.contributor_share });
  addContractorsSection(summarySheet, contractors);

  const contribSheet = workbook.addWorksheet('Contributions');
  contribSheet.columns = [
    { header: 'Partner', key: 'partner_name', width: 20 },
    { header: 'Email', key: 'partner_email', width: 24 },
    { header: 'Type', key: 'contribution_type', width: 14 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Mode', key: 'mode', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Vendor', key: 'vendor_name', width: 18 },
    { header: 'Purpose', key: 'purpose', width: 24 },
    { header: 'Proof', key: 'proof', width: 24 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  contributions.forEach((row) => contribSheet.addRow(row));

  const expenseSheet = workbook.addWorksheet('Expenses');
  expenseSheet.columns = [
    { header: 'Title', key: 'title', width: 18 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Paid By', key: 'paid_by', width: 16 },
    { header: 'Vendor', key: 'vendor_name', width: 18 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  expenses.forEach((row) => expenseSheet.addRow(row));

  const flatsSheet = workbook.addWorksheet('Flats');
  flatsSheet.columns = [
    { header: 'Flat No', key: 'flat_no', width: 14 },
    { header: 'Buyer', key: 'buyer_name', width: 18 },
    { header: 'Buyer Email', key: 'buyer_email', width: 24 },
    { header: 'Total Cost', key: 'total_cost', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
  ];
  flats.forEach((row) => flatsSheet.addRow(row));

  const installmentsSheet = workbook.addWorksheet('Installments');
  installmentsSheet.columns = [
    { header: 'Flat Id', key: 'flat_id', width: 18 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Mode', key: 'mode', width: 14 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  payments.forEach((row) => installmentsSheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `project-${projectId}-report.xlsx`,
    projectName: project.name,
  };
}

export async function generateContributionsReport(projectId) {
  const project = await requireProject(projectId);
  const { data: contributions = [] } = await supabaseAdmin
    .from('partner_contributions')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false });

  const { data: expenses = [] } = await supabaseAdmin
    .from('expenses')
    .select('amount')
    .eq('project_id', projectId);

  const { data: contractors = [] } = await supabaseAdmin
    .from('project_contractors')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  const { data: flats = [] } = await supabaseAdmin.from('flats').select('id, total_cost').eq('project_id', projectId);
  const flatIds = flats.map((f) => f.id);
  const { data: buyerPayments = [] } = flatIds.length
    ? await supabaseAdmin.from('flat_payments').select('amount').in('flat_id', flatIds)
    : { data: [] };
  const buyerPaymentsReceived = (buyerPayments || []).reduce((sum, p) => sum + toNumber(p.amount), 0);
  const totalBuyerReceivables = (flats || []).reduce((sum, f) => sum + toNumber(f.total_cost), 0);
  const buyerPending = Math.max(totalBuyerReceivables - buyerPaymentsReceived, 0);

  const contribAgg = computeContributionAggregates(contributions);
  const expenseTotal = (expenses || []).reduce((sum, e) => sum + toNumber(e.amount), 0);
  const totals = {
    total_contribution: contribAgg.total_contribution,
    total_account_credits: contribAgg.total_account_credits,
    total_direct_contributions: contribAgg.total_direct_contributions,
    buyer_payments_received: buyerPaymentsReceived,
    total_buyer_receivables: totalBuyerReceivables,
    buyer_pending: buyerPending,
    total_expenses: expenseTotal,
    cash_balance: contribAgg.total_account_credits + buyerPaymentsReceived - expenseTotal,
  };

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Summary');
  summary.addRows([
    ['Project', project.name],
    ['Location', project.location || ''],
    ['Status', project.status || ''],
    [],
  ]);
  addTotalsAndShareSection(summary, { totals, contributor_share: contribAgg.contributor_share });
  addContractorsSection(summary, contractors);

  const sheet = workbook.addWorksheet('Contributions');
  sheet.columns = [
    { header: 'Partner', key: 'partner_name', width: 20 },
    { header: 'Email', key: 'partner_email', width: 24 },
    { header: 'Type', key: 'contribution_type', width: 14 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Mode', key: 'mode', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Vendor', key: 'vendor_name', width: 18 },
    { header: 'Purpose', key: 'purpose', width: 24 },
    { header: 'Proof', key: 'proof', width: 24 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  contributions.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `${(project.name || 'project').replace(/[^a-z0-9]/gi, '_')}-contributions.xlsx`,
    projectName: project.name,
  };
}

export async function generateExpensesReport(projectId) {
  const project = await requireProject(projectId);
  const { data: expenses = [] } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false });

  const { data: contributions = [] } = await supabaseAdmin
    .from('partner_contributions')
    .select('amount, contribution_type, partner_name')
    .eq('project_id', projectId);

  const { data: contractors = [] } = await supabaseAdmin
    .from('project_contractors')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  const { data: flats = [] } = await supabaseAdmin.from('flats').select('id, total_cost').eq('project_id', projectId);
  const flatIds = flats.map((f) => f.id);
  const { data: buyerPayments = [] } = flatIds.length
    ? await supabaseAdmin.from('flat_payments').select('amount').in('flat_id', flatIds)
    : { data: [] };
  const buyerPaymentsReceived = (buyerPayments || []).reduce((sum, p) => sum + toNumber(p.amount), 0);
  const totalBuyerReceivables = (flats || []).reduce((sum, f) => sum + toNumber(f.total_cost), 0);
  const buyerPending = Math.max(totalBuyerReceivables - buyerPaymentsReceived, 0);

  const contribAgg = computeContributionAggregates(contributions);
  const expenseTotal = (expenses || []).reduce((sum, e) => sum + toNumber(e.amount), 0);
  const totals = {
    total_contribution: contribAgg.total_contribution,
    total_account_credits: contribAgg.total_account_credits,
    total_direct_contributions: contribAgg.total_direct_contributions,
    buyer_payments_received: buyerPaymentsReceived,
    total_buyer_receivables: totalBuyerReceivables,
    buyer_pending: buyerPending,
    total_expenses: expenseTotal,
    cash_balance: contribAgg.total_account_credits + buyerPaymentsReceived - expenseTotal,
  };

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Summary');
  summary.addRows([
    ['Project', project.name],
    ['Location', project.location || ''],
    ['Status', project.status || ''],
    [],
  ]);
  addTotalsAndShareSection(summary, { totals, contributor_share: contribAgg.contributor_share });
  addContractorsSection(summary, contractors);

  const sheet = workbook.addWorksheet('Expenses');
  sheet.columns = [
    { header: 'Title', key: 'title', width: 18 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Paid By', key: 'paid_by', width: 16 },
    { header: 'Vendor', key: 'vendor_name', width: 18 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  expenses.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `${(project.name || 'project').replace(/[^a-z0-9]/gi, '_')}-expenses.xlsx`,
    projectName: project.name,
  };
}

export async function generateFlatInstallmentsReport(projectId) {
  const project = await requireProject(projectId);
  const { data: flats = [] } = await supabaseAdmin
    .from('flats')
    .select('id, flat_no, buyer_name, buyer_email')
    .eq('project_id', projectId);
  const flatIds = flats.map((f) => f.id);

  const { data: payments = [] } = flatIds.length
    ? await supabaseAdmin
        .from('flat_payments')
        .select('*')
        .in('flat_id', flatIds)
        .order('date', { ascending: false })
    : { data: [] };

  const flatById = new Map(flats.map((f) => [f.id, f]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Installments');
  sheet.columns = [
    { header: 'Flat No', key: 'flat_no', width: 14 },
    { header: 'Buyer', key: 'buyer_name', width: 18 },
    { header: 'Buyer Email', key: 'buyer_email', width: 24 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Mode', key: 'mode', width: 14 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];

  payments.forEach((p) => {
    const flat = flatById.get(p.flat_id);
    sheet.addRow({
      flat_no: flat?.flat_no || '',
      buyer_name: flat?.buyer_name || '',
      buyer_email: flat?.buyer_email || '',
      amount: p.amount,
      date: p.date,
      mode: p.mode,
      notes: p.notes,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `${(project.name || 'project').replace(/[^a-z0-9]/gi, '_')}-flat-installments.xlsx`,
    projectName: project.name,
  };
}

export async function generateFlatsReport(projectId) {
  const project = await requireProject(projectId);
  const { data: flats = [] } = await supabaseAdmin
    .from('flats')
    .select('*')
    .eq('project_id', projectId)
    .order('flat_no', { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Flats');
  sheet.columns = [
    { header: 'Flat No', key: 'flat_no', width: 14 },
    { header: 'Buyer', key: 'buyer_name', width: 18 },
    { header: 'Buyer Email', key: 'buyer_email', width: 24 },
    { header: 'Total Cost', key: 'total_cost', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
  ];
  flats.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `${(project.name || 'project').replace(/[^a-z0-9]/gi, '_')}-flats.xlsx`,
    projectName: project.name,
  };
}

export async function generateContributorWiseContributionsReport(projectId, partnerName) {
  const project = await requireProject(projectId);
  const normalizedPartnerName = String(partnerName || '').trim();
  if (!normalizedPartnerName) throw new Error('Partner name is required');

  const { data: contributions = [] } = await supabaseAdmin
    .from('partner_contributions')
    .select('*')
    .eq('project_id', projectId)
    .eq('partner_name', normalizedPartnerName)
    .order('date', { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contributions');

  sheet.addRows([
    ['Project Name', project.name],
    ['Partner Name', normalizedPartnerName],
    [],
  ]);

  sheet.columns = [
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Mode', key: 'mode', width: 16 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];

  contributions.forEach((c) => {
    sheet.addRow({
      amount: toNumber(c.amount),
      date: c.date,
      mode: c.mode,
      notes: c.notes || '',
    });
  });

  const total = contributions.reduce((sum, c) => sum + toNumber(c.amount), 0);
  sheet.addRow({});
  sheet.addRow({ amount: total, mode: 'TOTAL' });

  const safePartner = normalizedPartnerName.replace(/[^a-z0-9]/gi, '_') || 'partner';
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `${safePartner}-contributions.xlsx`,
    projectName: project.name,
  };
}

