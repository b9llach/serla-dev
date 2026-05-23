// Email configuration
// Set ENABLE_EMAIL=true in .env.local to enable email sending
// When disabled, emails are logged to console for development

const EMAIL_ENABLED = process.env.ENABLE_EMAIL === 'true';
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@serla.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!EMAIL_ENABLED) {
    console.log('------- EMAIL (dev mode - not sent) -------');
    console.log('To:', options.to);
    console.log('Subject:', options.subject);
    console.log('Text:', options.text);
    console.log('--------------------------------------------');
    return true;
  }

  // When email is enabled, you can integrate with your preferred email provider
  // Examples: Resend, SendGrid, AWS SES, Postmark, etc.
  // For now, we'll use a placeholder that you can implement

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set but ENABLE_EMAIL is true');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to send email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Reset your Serla password',
    text: `
You requested a password reset for your Serla account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, you can safely ignore this email.
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #ffffff; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 500; margin-bottom: 24px; color: #ffffff;">Reset your password</h1>
    <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">
      You requested a password reset for your Serla account. Click the button below to reset your password.
    </p>
    <a href="${resetUrl}" style="display: inline-block; background-color: #ffffff; color: #09090b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-bottom: 24px;">
      Reset Password
    </a>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin-top: 24px;">
      This link will expire in 1 hour.
    </p>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6;">
      If you didn't request this, you can safely ignore this email.
    </p>
    <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;">
    <p style="color: #52525b; font-size: 12px;">
      Serla - Privacy-focused analytics
    </p>
  </div>
</body>
</html>
    `.trim(),
  });
}

export async function sendWelcomeEmail(email: string, name?: string): Promise<boolean> {
  const dashboardUrl = `${APP_URL}/dashboard`;
  const docsUrl = `${APP_URL}/docs`;
  const greeting = name ? `Hi ${name}` : 'Welcome';

  return sendEmail({
    to: email,
    subject: 'Welcome to Serla',
    text: `
${greeting},

Thanks for signing up for Serla. You now have access to privacy-focused analytics for your projects.

Get started:
1. Go to your dashboard: ${dashboardUrl}
2. Copy your API key from Settings
3. Add the Serla SDK to your project
4. Start tracking events

Read the docs: ${docsUrl}

- The Serla Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #ffffff; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 500; margin-bottom: 24px; color: #ffffff;">${greeting}</h1>
    <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">
      Thanks for signing up for Serla. You now have access to privacy-focused analytics for your projects.
    </p>
    <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 8px; font-weight: 500;">Get started:</p>
    <ol style="color: #a1a1aa; line-height: 1.8; margin-bottom: 24px; padding-left: 20px;">
      <li>Go to your dashboard</li>
      <li>Copy your API key from Settings</li>
      <li>Add the Serla SDK to your project</li>
      <li>Start tracking events</li>
    </ol>
    <a href="${dashboardUrl}" style="display: inline-block; background-color: #ffffff; color: #09090b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-bottom: 16px;">
      Go to Dashboard
    </a>
    <p style="margin-top: 24px;">
      <a href="${docsUrl}" style="color: #a1a1aa; text-decoration: underline;">Read the docs</a>
    </p>
    <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;">
    <p style="color: #52525b; font-size: 12px;">
      Serla - Privacy-focused analytics
    </p>
  </div>
</body>
</html>
    `.trim(),
  });
}

export async function sendEmailVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${APP_URL}/auth/verify-email?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Verify your Serla email',
    text: `
Welcome to Serla!

Click the link below to verify your email address:
${verifyUrl}

This link will expire in 24 hours.
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #ffffff; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 500; margin-bottom: 24px; color: #ffffff;">Verify your email</h1>
    <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">
      Welcome to Serla! Click the button below to verify your email address.
    </p>
    <a href="${verifyUrl}" style="display: inline-block; background-color: #ffffff; color: #09090b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-bottom: 24px;">
      Verify Email
    </a>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin-top: 24px;">
      This link will expire in 24 hours.
    </p>
    <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;">
    <p style="color: #52525b; font-size: 12px;">
      Serla - Privacy-focused analytics
    </p>
  </div>
</body>
</html>
    `.trim(),
  });
}
