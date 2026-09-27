/**
 * 問い合わせいただいた方への自動返信（Netlifyのフォーム受信イベントで起動）
 *
 * この関数はNetlifyが内部的に呼び出すもので、外部から直接叩くことはできない。
 * そのため、悪用してこのドメインから任意の宛先へメールを送らせることができない。
 * （公開エンドポイントの notify-submission.mjs はChatworkへの控え専用で、メールは送らない）
 *
 * RESEND_API_KEY が未設定のあいだは何もせず終了するため、キーを登録した時点で有効になる。
 *   RESEND_API_KEY … Resendのシークレットキー
 *   RESEND_FROM    … 送信元（例: 介護経営パートナーズ <info@kaigokeiei-partners.jp>）
 *   REPLY_TO_EMAIL … 返信先（kaigokeiei-partners.jp にはメールボックスが無いため必須）
 */

const DEFAULT_FROM = '介護経営パートナーズ <info@kaigokeiei-partners.jp>';
const DEFAULT_REPLY_TO = 'hide2520@gmail.com';

const isEmail = (v) => typeof v === 'string' && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.trim());
const clip = (v, n = 2000) => String(v ?? '').slice(0, n);

export default async (req) => {
  const ok = () => new Response('ok', { status: 200 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return ok(); // 未設定のあいだは無効

  let data = {};
  try {
    const body = await req.json();
    data = body?.payload?.data ?? body?.data ?? {};
  } catch {
    return ok();
  }

  const to = String(data.email ?? '').trim();
  if (!isEmail(to)) return ok();

  const name = clip(data.name, 100) || 'ご担当者';
  const company = clip(data.company, 200);
  const request = clip(data.request, 200);
  const message = clip(data.message);

  const text = [
    `${name} 様`,
    '',
    'この度は、介護経営パートナーズへお問い合わせいただき、誠にありがとうございます。',
    '以下の内容で承りました。内容を確認の上、担当より折り返しご連絡いたします。',
    '',
    '────────────────────',
    company ? `会社名／屋号: ${company}` : null,
    request ? `ご相談内容: ${request}` : null,
    'お問い合わせ内容:',
    message,
    '────────────────────',
    '',
    '介護経営パートナーズ',
    'https://kaigokeiei-partners.jp',
    '────────────────────',
    '※このメールはお問い合わせ受付時に自動でお送りしています。',
    '　ご返信いただければ担当者が確認いたします。',
  ].filter((l) => l !== null).join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || DEFAULT_FROM,
        to: [to],
        reply_to: process.env.REPLY_TO_EMAIL || DEFAULT_REPLY_TO,
        subject: '【介護経営パートナーズ】お問い合わせありがとうございます',
        text,
      }),
    });
    if (!res.ok) console.error('自動返信の送信に失敗', res.status, await res.text());
  } catch (e) {
    console.error('自動返信で例外', e);
  }

  return ok();
};
