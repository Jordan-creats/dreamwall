const nodemailer = require('nodemailer');

let transporter = null;

function initMail() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log('[mail] SMTP 未配置，邮件功能不可用');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port) || 587,
    secure: false,
    auth: { user, pass },
  });

  transporter.verify((err) => {
    if (err) console.error('[mail] SMTP 连接失败:', err.message);
    else console.log('[mail] SMTP 已就绪');
  });

  return transporter;
}

function getTransporter() {
  return transporter;
}

/**
 * 发送密码重置邮件
 * @param {string} to - 收件人邮箱
 * @param {string} code - 6位验证码
 */
async function sendResetCode(to, code) {
  if (!transporter) throw new Error('邮件服务未配置');

  const info = await transporter.sendMail({
    from: `"光影集" <${process.env.SMTP_USER}>`,
    to,
    subject: '光影集 · 密码重置验证码',
    text: `您的密码重置验证码是：${code}（15分钟内有效）。如非本人操作，请忽略此邮件。`,
    html: `
      <div style="max-width:480px;margin:0 auto;padding:32px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0e0e16;color:#ededf2;border-radius:16px;border:1px solid rgba(255,255,255,.06)">
        <h2 style="color:#a855f7;margin:0 0 24px">光影集 · 密码重置</h2>
        <p style="color:#9494a8;margin:0 0 16px">您正在申请重置密码，验证码如下：</p>
        <div style="background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
          <span style="font-size:32px;font-weight:800;letter-spacing:6px;color:#a855f7">${code}</span>
        </div>
        <p style="color:#545468;font-size:13px;margin:0">有效期 15 分钟。如非本人操作，请忽略此邮件。</p>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,.05);margin:20px 0">
        <p style="color:#545468;font-size:12px;margin:0">光影集 · 高清壁纸素材库</p>
      </div>`,
  });

  return info;
}

module.exports = { initMail, getTransporter, sendResetCode };
