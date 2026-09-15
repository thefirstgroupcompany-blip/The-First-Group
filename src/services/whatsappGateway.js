// Direct WhatsApp API Gateway Integration for The First Group

// 1. Official Meta WhatsApp Cloud API (Free 1000 chats/month directly from Facebook)
export const sendMetaWhatsAppMessage = async ({ to, message, phoneNumberId, accessToken }) => {
  if (!phoneNumberId || !accessToken) {
    throw new Error('يرجى إدخال Phone Number ID و Access Token الخاص بـ Meta Cloud API');
  }

  let cleanTo = String(to).trim().replace(/\D/g, '');
  if (cleanTo.startsWith('01')) {
    cleanTo = '2' + cleanTo;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        preview_url: true,
        body: message
      }
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data;
};

// 2. Generic Webhook / UltraMsg Dispatcher
export const sendLiveWhatsAppMessage = async ({ to, message, instanceId, token }) => {
  if (!instanceId || !token) {
    throw new Error('يرجى إدخال Instance ID و API Token');
  }

  let cleanTo = String(to).trim().replace(/\D/g, '');
  if (cleanTo.startsWith('01')) {
    cleanTo = '2' + cleanTo;
  }

  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;

  const params = new URLSearchParams();
  params.append('token', token);
  params.append('to', cleanTo);
  params.append('body', message);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
};
