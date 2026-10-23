import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/config.service.js';

export type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };

/**
 * Sends mail through SMTP (e.g. Gmail with an app password). When SMTP is not
 * configured nothing is sent and the caller carries on: mail is a
 * notification, never a condition for saving data.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  constructor(private readonly config: AppConfig) {}

  get enabled() {
    return !!this.config.get('SMTP_HOST');
  }

  private transport() {
    this.transporter ??= nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get('SMTP_PORT'),
      secure: this.config.get('SMTP_SECURE'),
      auth: this.config.get('SMTP_USER') ? { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASS') } : undefined,
    });
    return this.transporter;
  }

  async send(mail: Mail): Promise<boolean> {
    if (!this.enabled) {
      this.logger.log({ subject: mail.subject }, 'mail not configured (SMTP_HOST empty): skipped');
      return false;
    }
    const from = this.config.get('MAIL_FROM') || `Đất Vàng Group <${this.config.get('SMTP_USER')}>`;
    try {
      await this.transport().sendMail({ from, ...mail });
      return true;
    } catch (err) {
      // Never log credentials or the message body (customer data).
      this.logger.warn({ err: (err as Error).message, subject: mail.subject }, 'mail sending failed');
      return false;
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
