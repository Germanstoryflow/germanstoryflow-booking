// netlify/functions/notify.js
// Sends booking confirmation email via Resend (free tier: 3000/month)
// Setup: add RESEND_API_KEY to Netlify environment variables
// Get free key at: resend.com

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { studentName, studentEmail, date, time, duration, price, lessonType, meetLink, paymentMethod, lang = 'de', iban = '', bankName = '', paypalMe = '' } = body;

  const endTime = (() => {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + duration;
    return String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
  })();

  const subjects = {
    de: `✅ Buchung bestätigt – ${date} ${time} Uhr`,
    en: `✅ Booking confirmed – ${date} at ${time}`,
    it: `✅ Prenotazione confermata – ${date} alle ${time}`
  };

  const bodies = {
    de: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#1D9E75;">🇩🇪 German Story Flow</h2>
      <p>Hallo ${studentName},</p>
      <p>deine Buchung ist bestätigt!</p>
      <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin:16px 0;">
        <p><strong>📅 Datum:</strong> ${date}</p>
        <p><strong>🕐 Uhrzeit:</strong> ${time} – ${endTime} Uhr</p>
        <p><strong>⏱ Dauer:</strong> ${duration} Minuten ${lessonType === 'trial' ? '(Probestunde)' : ''}</p>
        <p><strong>💶 Preis:</strong> €${price}</p>
        <p><strong>💳 Zahlung:</strong> ${paymentMethod === 'paypal' ? 'PayPal' : 'Banküberweisung'}</p>
        ${meetLink ? `<p><strong>🎥 Google Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''}
      </div>
      ${paymentMethod === 'bank' ? `<p style="color:#856404;background:#fff3cd;padding:12px;border-radius:8px;">Bitte überweise <strong>€${price}</strong> an:<br><strong>${bankName}</strong><br>IBAN: <strong>${iban}</strong><br>Verwendungszweck: <strong>${studentName} ${date}</strong></p>` : ''}
      ${paymentMethod === 'paypal' && paypalMe ? `<p><a href="https://${paypalMe}" style="background:#0070ba;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px;">💳 Jetzt mit PayPal bezahlen</a></p>` : ''}
      <p>Bis bald! 🇩🇪</p>
      <p style="color:#70757a;font-size:12px;">German Story Flow · buchen.germanstoryflow.de</p>
    </div>`,
    en: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#1D9E75;">🇩🇪 German Story Flow</h2>
      <p>Hi ${studentName},</p>
      <p>your booking is confirmed!</p>
      <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin:16px 0;">
        <p><strong>📅 Date:</strong> ${date}</p>
        <p><strong>🕐 Time:</strong> ${time} – ${endTime}</p>
        <p><strong>⏱ Duration:</strong> ${duration} min ${lessonType === 'trial' ? '(Trial lesson)' : ''}</p>
        <p><strong>💶 Price:</strong> €${price}</p>
        <p><strong>💳 Payment:</strong> ${paymentMethod === 'paypal' ? 'PayPal' : 'Bank transfer'}</p>
        ${meetLink ? `<p><strong>🎥 Google Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''}
      </div>
      <p>See you soon! 🇩🇪</p>
      <p style="color:#70757a;font-size:12px;">German Story Flow · buchen.germanstoryflow.de</p>
    </div>`,
    it: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#1D9E75;">🇩🇪 German Story Flow</h2>
      <p>Ciao ${studentName},</p>
      <p>la tua prenotazione è confermata!</p>
      <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin:16px 0;">
        <p><strong>📅 Data:</strong> ${date}</p>
        <p><strong>🕐 Orario:</strong> ${time} – ${endTime}</p>
        <p><strong>⏱ Durata:</strong> ${duration} min ${lessonType === 'trial' ? '(Lezione di prova)' : ''}</p>
        <p><strong>💶 Prezzo:</strong> €${price}</p>
        <p><strong>💳 Pagamento:</strong> ${paymentMethod === 'paypal' ? 'PayPal' : 'Bonifico'}</p>
        ${meetLink ? `<p><strong>🎥 Google Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''}
      </div>
      <p>A presto! 🇩🇪</p>
      <p style="color:#70757a;font-size:12px;">German Story Flow · buchen.germanstoryflow.de</p>
    </div>`
  };

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('RESEND_API_KEY not set – skipping email');
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, skipped: true }) };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'German Story Flow <buchen@germanstoryflow.de>',
        to: [studentEmail],
        subject: subjects[lang] || subjects.de,
        html: bodies[lang] || bodies.de
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Resend error');
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch(err) {
    console.error('Email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
