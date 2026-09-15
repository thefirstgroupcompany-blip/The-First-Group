const DEFAULT_BOT_TOKEN = '8182872390:AAFN9csS7W3tB0z1z3HPv8yjlv9xMyYmNS0';
const DEFAULT_CHAT_ID = '8060299797';

export async function sendTelegramMessage(text, options = {}) {
  const token = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TELEGRAM_BOT_TOKEN) 
    || (typeof process !== 'undefined' && process.env?.TELEGRAM_BOT_TOKEN) 
    || DEFAULT_BOT_TOKEN;

  const chatId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TELEGRAM_CHAT_ID) 
    || (typeof process !== 'undefined' && process.env?.TELEGRAM_CHAT_ID) 
    || DEFAULT_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram bot token or chat ID not set');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || 'HTML'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error:', data);
    }
    return data;
  } catch (e) {
    console.error('Failed to send Telegram message', e);
  }
}

