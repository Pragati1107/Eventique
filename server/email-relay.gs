/**
 * Eventique OTP email sender (Google Apps Script).
 * Render's free plan blocks SMTP, so the server POSTs here and Gmail sends the email.
 *
 * Setup: script.google.com → New project → paste this file → set SECRET (same value as
 * EMAIL_WEBHOOK_SECRET in Render) → Deploy → New deployment → Web app →
 * Execute as: Me, Who has access: Anyone → Deploy → copy the /exec URL into EMAIL_WEBHOOK_URL.
 * After editing this file, use Deploy → Manage deployments → Edit → Version: New version.
 */
const SECRET = 'PASTE-THE-SAME-SECRET-AS-RENDER';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!SECRET || d.secret !== SECRET) return out({ ok: false, error: 'bad secret' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.to || '')) return out({ ok: false, error: 'bad address' });
    if (MailApp.getRemainingDailyQuota() < 1) return out({ ok: false, error: 'daily quota reached' });
    MailApp.sendEmail({ to: d.to, subject: String(d.subject || 'Your Eventique code').slice(0, 150), htmlBody: d.html, body: d.text, name: d.fromName || 'Eventique' });
    return out({ ok: true, left: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

/** Open the /exec URL in a browser to check the deployment works. */
function doGet() { return out({ ok: true, service: 'eventique-email', left: MailApp.getRemainingDailyQuota() }); }

/** Run this once from the editor (select testSend → Run) to grant Gmail permission. */
function testSend() { MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Eventique test', 'Email sending works.'); }

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
