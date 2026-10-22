import nodemailer from 'nodemailer';
import type { PasswordResetMailer } from './auth';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Builds SMTP delivery or a local-only link logger for development. */
export function createPasswordResetDelivery(): { appUrl: string; mailer: PasswordResetMailer } {
  const appUrl = new URL(process.env.APP_URL ?? 'http://localhost:8787');
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 465);

  if (!['http:', 'https:'].includes(appUrl.protocol)) throw new Error('APP_URL must use HTTP or HTTPS.');
  if (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production.');
  }
  if (!host) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST and SMTP_FROM are required in production.');
    if (from || user || password) throw new Error('Configure SMTP_HOST, SMTP_FROM, and optional SMTP_USER/SMTP_PASS together.');
    return {
      appUrl: appUrl.toString(),
      mailer: {
        async sendPasswordReset(email, resetUrl) {
          console.info(`Development password reset link for ${email}: ${resetUrl}`);
        },
        async sendEmailVerification(email, verifyUrl) {
          console.info(`Development email verification link for ${email}: ${verifyUrl}`);
        },
      },
    };
  }
  if (!from || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(user) !== Boolean(password)) {
    throw new Error('Configure valid SMTP_HOST, SMTP_PORT, SMTP_FROM, and both SMTP_USER/SMTP_PASS or neither.');
  }
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });
  return {
    appUrl: appUrl.toString(),
    mailer: {
      async sendPasswordReset(email, resetUrl) {
        const safeUrl = escapeHtml(resetUrl);
        await transport.sendMail({
          from,
          to: email,
          subject: "Reset your Hindsight Hold'em password",
          text: `Use this one-time link to reset your password. It expires in 30 minutes.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
          html: `<p>Use this one-time link to reset your Hindsight Hold'em password. It expires in 30 minutes.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
        });
      },
      async sendEmailVerification(email, verifyUrl) {
        const safeUrl = escapeHtml(verifyUrl);
        await transport.sendMail({
          from,
          to: email,
          subject: "Verify your Hindsight Hold'em email",
          text: `Use this one-time link to verify your email address. It expires in 24 hours.\n\n${verifyUrl}\n\nIf you did not create this account, ignore this email.`,
          html: `<p>Use this one-time link to verify your email address. It expires in 24 hours.</p><p><a href="${safeUrl}">Verify email</a></p><p>If you did not create this account, ignore this email.</p>`,
        });
      },
    },
  };
}