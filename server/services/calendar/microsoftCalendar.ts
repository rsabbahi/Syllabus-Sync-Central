import type { NormalizedEvent } from './icsParser';

export function getMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI || '',
    scope: 'Calendars.Read offline_access',
    state,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI || '',
      grant_type: 'authorization_code',
      scope: 'Calendars.Read offline_access',
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error_description || 'Microsoft token exchange failed');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      scope: 'Calendars.Read offline_access',
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error_description || 'Microsoft token refresh failed');
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function fetchMicrosoftEvents(accessToken: string): Promise<NormalizedEvent[]> {
  const now = new Date();
  const sixMonthsLater = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: sixMonthsLater.toISOString(),
    $top: '250',
    $select: 'id,subject,start,end,body,location,isAllDay',
  });

  // Request UTC times so we don't need to handle Windows timezone names
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'outlook.timezone="UTC"',
      },
    }
  );

  if (!res.ok) {
    const err = (await res.json()) as any;
    throw new Error(err.error?.message || 'Failed to fetch Microsoft Calendar events');
  }

  const data = (await res.json()) as any;
  const events: NormalizedEvent[] = [];

  for (const item of data.value || []) {
    const startStr = item.start?.dateTime;
    if (!startStr) continue;
    // Microsoft returns UTC datetime strings without Z suffix when using the Prefer header
    const start = new Date(startStr.endsWith('Z') ? startStr : startStr + 'Z');
    if (isNaN(start.getTime())) continue;

    if (item.isAllDay) start.setHours(23, 59, 59, 0);

    const endStr = item.end?.dateTime;
    const end = endStr
      ? new Date(endStr.endsWith('Z') ? endStr : endStr + 'Z')
      : null;

    // Strip HTML from body content
    const rawBody = item.body?.content || '';
    const description = rawBody.replace(/<[^>]+>/g, '').trim() || null;

    events.push({
      externalId: item.id,
      title: item.subject || 'Untitled Event',
      startDate: start,
      endDate: end && !isNaN(end.getTime()) ? end : null,
      description: description || null,
      location: item.location?.displayName || null,
    });
  }

  return events;
}
