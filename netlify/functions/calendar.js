// netlify/functions/calendar.js
// Handles: GET /availability?date=2026-06-01
//          POST /booking (create event + Meet link)

const { google } = require('googleapis');

function getAuth() {
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  if (!raw) throw new Error('GOOGLE_PRIVATE_KEY is not set');
  // Normalize newlines regardless of how Netlify stores them
  const privateKey = raw.replace(/\\n/g, '\n').replace(/\n/g, '\n');
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // ─────────────────────────────────────────
  // GET: Return busy slots for a given date
  // ─────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const date = event.queryStringParameters?.date;
    if (!date) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'date required' }) };
    }

    const timeMin = new Date(date + 'T00:00:00+02:00').toISOString();
    const timeMax = new Date(date + 'T23:59:59+02:00').toISOString();

    try {
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone: 'Europe/Rome',
          items: [{ id: calendarId }],
        },
      });

      const busy = res.data.calendars[calendarId]?.busy || [];

      // Convert busy periods to blocked time ranges in minutes
      const blockedRanges = busy.map(b => {
        const start = new Date(b.start);
        const end = new Date(b.end);
        const startMin = start.getHours() * 60 + start.getMinutes();
        const endMin = end.getHours() * 60 + end.getMinutes();
        return { startMin, endMin };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ date, blockedRanges }),
      };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ─────────────────────────────────────────
  // POST: Create calendar event + Meet link
  // ─────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { date, time, studentName, studentEmail, duration = 50, lessonType = 'standard' } = body;

    if (!date || !time || !studentName || !studentEmail) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    // Build start/end times (Rome timezone = UTC+2)
    const [h, m] = time.split(':').map(Number);
    const startDate = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+02:00`);
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const title = lessonType === 'trial'
      ? `🇩🇪 Probestunde – ${studentName}`
      : `🇩🇪 Deutschstunde – ${studentName}`;

    try {
      const eventRes = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: 1, // enables Meet link generation
        requestBody: {
          summary: title,
          description: `German Story Flow – Private Lesson\nStudent: ${studentName}\nEmail: ${studentEmail}\nType: ${lessonType === 'trial' ? 'Trial (25 min)' : 'Standard (50 min)'}`,
          start: {
            dateTime: startDate.toISOString(),
            timeZone: 'Europe/Rome',
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone: 'Europe/Rome',
          },
          attendees: [
            { email: studentEmail, displayName: studentName },
          ],
          conferenceData: {
            createRequest: {
              requestId: `gsf-${date}-${time}-${studentEmail}`.replace(/[^a-z0-9]/gi, '-'),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
        },
      });

      const meetLink = eventRes.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
      const eventId = eventRes.data.id;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, eventId, meetLink }),
      };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ─────────────────────────────────────────
  // DELETE: Remove a calendar event (for rescheduling)
  // ─────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    let body;
    try { body = JSON.parse(event.body); } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }
    const { eventId } = body;
    if (!eventId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'eventId required' }) };
    try {
      await calendar.events.delete({ calendarId, eventId });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch(err) {
      // Non-fatal: event may already be deleted
      console.warn('Delete event failed:', err.message);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, warning: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
