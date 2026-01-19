import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabaseClient.js';
import { logger } from '../logger.js';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

class EmailService {
  constructor() {
    if (config.sendgridApiKey) {
      sgMail.setApiKey(config.sendgridApiKey);
      this.provider = 'sendgrid';
      logger.info('Email provider: SendGrid');
    } else if (config.smtp.host && config.smtp.user && config.smtp.pass) {
      this.provider = 'smtp';
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
        connectionTimeout: 7000,
        greetingTimeout: 7000,
        socketTimeout: 7000,
      });
      logger.info(
        {
          smtp: {
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            user_present: Boolean(config.smtp.user),
            pass_present: Boolean(config.smtp.pass),
          },
          emailFrom: config.emailFrom,
        },
        'Email provider: SMTP',
      );

      // Verify connection (non-fatal) so Render logs show the actual problem.
      Promise.resolve()
        .then(() => this.transporter.verify())
        .then(() => logger.info('SMTP verify: OK'))
        .catch((err) => logger.error({ err }, 'SMTP verify failed (non-fatal)'));
    } else {
      this.provider = 'none';
      logger.warn('No email provider configured. Set SENDGRID_API_KEY or SMTP settings.');
    }
  }

  async getPartnerEmails(projectId) {
    const { data, error } = await supabaseAdmin
      .from('partner_contributions')
      .select('partner_email')
      .eq('project_id', projectId)
      .not('partner_email', 'is', null);

    if (error) {
      logger.error({ error }, 'Failed to fetch partner emails');
      return [];
    }

    return [...new Set((data || []).map((row) => row.partner_email).filter(Boolean))];
  }

  buildTransactionHtml(payload) {
    const {
      projectName,
      transactionType,
      transactionCategory,
      amount,
      date,
      actorName,
      notes,
      contributionType,
      vendorName,
      purpose,
      proof,
      cashBalance,
      totalContribution,
      contributorShare,
    } = payload;

    const categoryLabel = transactionCategory || 'transaction';
    const isDirectExpense = (contributionType || '').toLowerCase() === 'direct_expense';
    const shareRows = Array.isArray(contributorShare) ? contributorShare : [];
    const totalForPct = Number(totalContribution || 0);
    const shareText = shareRows
      .map((row) => {
        const partner = row?.partner_name || row?.partnerName || 'Partner';
        const amt = Number(row?.amount || 0);
        const pct = totalForPct > 0 ? (amt / totalForPct) * 100 : 0;
        return `${partner} — ${formatCurrency(amt)} (${pct.toFixed(1)}%)`;
      })
      .join('<br />');

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">${projectName}</h2>
        <p style="margin: 4px 0;"><strong>Transaction Type:</strong> ${transactionType}</p>
        <p style="margin: 4px 0;"><strong>Transaction:</strong> ${categoryLabel}</p>
        <p style="margin: 4px 0;"><strong>Amount:</strong> ${formatCurrency(amount)}</p>
        <p style="margin: 4px 0;"><strong>Date:</strong> ${date || 'N/A'}</p>
        <p style="margin: 4px 0;"><strong>Added/Edited By:</strong> ${actorName || 'N/A'}</p>
        ${notes ? `<p style="margin: 4px 0;"><strong>Notes:</strong> ${notes}</p>` : ''}

        ${isDirectExpense ? `
          <div style="margin-top: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <p style="margin: 0 0 8px 0;"><strong>Direct Vendor Payment Details</strong></p>
            <p style="margin: 4px 0;"><strong>Vendor Name:</strong> ${vendorName || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Purpose / Notes:</strong> ${purpose || 'N/A'}</p>
            ${proof ? `<p style="margin: 4px 0;"><strong>Proof:</strong> ${proof}</p>` : ''}
          </div>
        ` : ''}

        <div style="margin-top: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <p style="margin: 0 0 8px 0;"><strong>Balance Summary</strong></p>
          <p style="margin: 4px 0;"><strong>Cash Balance:</strong> ${formatCurrency(cashBalance)}</p>
          <p style="margin: 4px 0;"><strong>Total Contribution:</strong> ${formatCurrency(totalContribution)}</p>
        </div>

        ${shareText ? `
          <div style="margin-top: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <p style="margin: 0 0 8px 0;"><strong>Contributor Share Summary</strong></p>
            <div style="font-size: 13px;">${shareText}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  buildWeeklySummaryHtml({ projectName, summary }) {
    const { since, contributions, expenses, installments, balance } = summary;
    const totalAccountCredits = contributions
      .filter((c) => String(c.contribution_type || 'account_credit').toLowerCase() !== 'direct_expense')
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalDirectVendorPayments = contributions
      .filter((c) => String(c.contribution_type || 'account_credit').toLowerCase() === 'direct_expense')
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalInstallments = installments.reduce((sum, i) => sum + Number(i.amount || 0), 0);

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">${projectName} - Weekly Summary</h2>
        <p style="margin:4px 0;">Since: ${since}</p>
        <ul>
          <li>Partner account credits: ${formatCurrency(totalAccountCredits)}</li>
          <li>Direct vendor payments (from partners): ${formatCurrency(totalDirectVendorPayments)}</li>
          <li>Expenses: ${expenses.length} (${formatCurrency(totalExpense)})</li>
          <li>Buyer payments received: ${installments.length} (${formatCurrency(totalInstallments)})</li>
          <li>Current balance: ${formatCurrency(balance.balance)}</li>
        </ul>
      </div>
    `;
  }

  async sendEmail({ to, subject, html }) {
    try {
      if (this.provider === 'sendgrid') {
        await sgMail.send({ to, from: config.emailFrom, subject, html });
        return { ok: true };
      }
      if (this.provider === 'smtp') {
        await this.transporter.sendMail({
          to: Array.isArray(to) ? to.join(',') : to,
          from: config.emailFrom,
          subject,
          html,
        });
        return { ok: true };
      }
      logger.warn('Email provider not configured. Skipping send.');
      return { ok: false, skipped: true };
    } catch (err) {
      logger.error(
        {
          err,
          provider: this.provider,
          emailFrom: config.emailFrom,
          to: Array.isArray(to) ? to : [to],
          subject,
        },
        'Email send failed (non-fatal)',
      );
      return { ok: false, error: err instanceof Error ? err.message : 'Email send failed' };
    }
  }

  async sendTransactionEmail(payload) {
    try {
      if (this.provider === 'none') return;

      const recipients = await this.getPartnerEmails(payload.projectId);
      if (!recipients.length) {
        logger.warn({ projectId: payload.projectId }, 'No partner emails found for project, email skipped');
        return;
      }

      const html = this.buildTransactionHtml(payload);
      const subject = `[SreeNivasam Constructions] ${payload.projectName} - ${payload.transactionType}`;
      await this.sendEmail({ to: recipients, subject, html });
    } catch (err) {
      logger.error({ err }, 'sendTransactionEmail failed (non-fatal)');
    }
  }

  async sendWeeklySummaryEmail({ projectName, recipients, summary }) {
    try {
      if (this.provider === 'none') return;
      if (!recipients.length) return;
      const html = this.buildWeeklySummaryHtml({ projectName, summary });
      const subject = `[Sreenivasam Construction Projects] Weekly summary - ${projectName}`;
      await this.sendEmail({ to: recipients, subject, html });
    } catch (err) {
      logger.error({ err }, 'sendWeeklySummaryEmail failed (non-fatal)');
    }
  }
}

export const emailService = new EmailService();

