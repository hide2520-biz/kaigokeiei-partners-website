/**
 * 問い合わせフォームの二重通知（Netlify Formsとは独立した経路）
 *
 * 背景: 2026-09-11に、GA4上は送信完了しているのにNetlify Formsに記録が残らず、
 * 通知メールも届かない問い合わせが1件発生した（honeypotにブラウザの自動入力が
 * 値を入れ、Netlifyが「ボットの送信」として黙って破棄したとみられる）。
 * Netlify Formsの処理層に依存しない経路で内容を控えるため、フォーム送信と同時に
 * この関数を呼び、Chatworkのマイチャットへ流す。
 *
 * 認証情報は環境変数から読む（このリポジトリは公開リポジトリのため直書き禁止）。
 *   CHATWORK_API_TOKEN / CHATWORK_ROOM_ID
 */

const FIELD_LABELS = {
  company: '会社名／屋号',
  name: '氏名',
  position: '役職',
  tel: '電話番号',
  email: 'メールアドレス',
  request: 'ご相談内容の区分',
  message: 'お問い合わせ内容',
};

const MAX_VALUE_LEN = 1000;
const MAX_FIELDS = 30;

export default async (req) => {
  // 常に200を返す（フォーム送信側の挙動に影響させないため）
  const ok = () => new Response('ok', { status: 200 });

  if (req.method !== 'POST') return ok();

  // 自サイトからの送信のみ受け付ける（総当たりの悪用を軽く防ぐ）
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!origin.includes('kaigokeiei-partners.jp') && !origin.includes('netlify.app')) return ok();

  const token = process.env.CHATWORK_API_TOKEN;
  const roomId = process.env.CHATWORK_ROOM_ID;
  if (!token || !roomId) {
    console.error('CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が未設定');
    return ok();
  }

  let data = {};
  try {
    data = await req.json();
  } catch {
    return ok();
  }

  const entries = Object.entries(data)
    .filter(([k]) => k !== 'form-name')
    .slice(0, MAX_FIELDS);

  const botField = String(data['bot-field'] ?? '').trim();
  const lines = entries
    .filter(([k]) => k !== 'bot-field')
    .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${String(v ?? '').slice(0, MAX_VALUE_LEN)}`);

  // honeypotに値が入っている＝Netlify Formsはこの送信を破棄する。
  // その場合でもこの通知だけは残るので、取りこぼしに即気づける。
  const warning = botField
    ? '[info]【要注意】スパム判定用の項目に値が入っています。Netlify Forms側には記録が残らない可能性が高いため、この通知の内容が唯一の控えです。[/info]\n'
    : '';

  const body =
    `[info][title]介護経営パートナーズ 問い合わせ（フォームからの直接通知）[/title]` +
    `${warning}${lines.join('\n')}\n\n` +
    `受信: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n` +
    `※Netlifyからのメール通知と重複します。メールが届かない場合はNetlify側で破棄されています。[/info]`;

  try {
    const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'X-ChatWorkToken': token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ body }),
    });
    if (!res.ok) console.error('Chatwork通知に失敗', res.status, await res.text());
  } catch (e) {
    console.error('Chatwork通知で例外', e);
  }

  return ok();
};
