import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const config = {
  port: Number(process.env.PORT) || 4000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  projectAppUrl: process.env.PROJECT_APP_URL || 'https://sreenivasam-construction-projects.example.com',
  emailFrom: process.env.EMAIL_FROM || 'Sreenivasam Construction Projects <no-reply@example.com>',
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: (process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  },
};

