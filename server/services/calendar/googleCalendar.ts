import type { NormalizedEvent } from './icsParser';

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error_description || 'Google token exchange failed');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error_description || 'Google token refresh failed');
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function fetchGoogleEvents(accessToken: string): Promise<NormalizedEvent[]> {
  const now = new Date();
  const sixMonthsLater = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: sixMonthsLater.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = (await res.json()) as any;
    throw new Error(err.error?.message || 'Failed to fetch Google Calendar events');
  }

  const data = (await res.json()) as any;
  const events: NormalizedEvent[] = [];

  for (const item of data.items || []) {
    const startStr = item.start?.dateTime || item.start?.date;
    if (!startStr) continue;
    const start = new Date(startStr);
    if (isNaN(start.getTime())) continue;

    // All-day events have date only (no time) → end of day
    if (item.start?.date && !item.start?.dateTime) {
      start.setHours(23, 59, 59, 0);
    }

    const endStr = item.end?.dateTime || item.end?.date;
    const end = endStr ? new Date(endStr) : null;

    events.push({
      externalId: item.id,
      title: item.summary || 'Untitled Event',
      startDate: start,
      endDate: end && !isNaN(end.getTime()) ? end : null,
      description: item.description || null,
      location: item.location || null,
    });
  }

  return events;
}
