export interface CalendarAttendee {
  email: string;
}

export interface CalendarEventInput {
  calendarId: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location: string;
  attendees: CalendarAttendee[];
}

interface ZohoCalendarConfig {
  apiBaseUrl: string;
  accessToken: string;
}

interface ZohoEventResponse {
  events?: Array<{
    uid?: string;
    etag?: string | number;
  }>;
}

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super("Zoho Calendar is not configured.");
    this.name = "CalendarNotConfiguredError";
  }
}

function getConfig(): ZohoCalendarConfig {
  const accessToken = process.env.ZOHO_CALENDAR_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new CalendarNotConfiguredError();
  }

  return {
    apiBaseUrl:
      process.env.ZOHO_CALENDAR_API_BASE_URL?.trim().replace(/\/+$/, "") ||
      "https://calendar.zoho.com/api/v1",
    accessToken,
  };
}

function formatZohoUtc(value: Date): string {
  const iso = value.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventData(input: CalendarEventInput) {
  return {
    title: input.title,
    description: input.description ?? "",
    location: input.location,
    dateandtime: {
      timezone: input.timezone,
      start: formatZohoUtc(input.startAt),
      end: formatZohoUtc(input.endAt),
    },
    isallday: false,
    isprivate: false,
    attendees: input.attendees.map((attendee) => ({
      email: attendee.email,
      status: "NEEDS-ACTION",
      permission: 1,
      attendance: 1,
    })),
    notify_attendee: 1,
    notifyType: 1,
  };
}

async function requestZoho(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const config = getConfig();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${config.accessToken}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(`Zoho Calendar request failed with HTTP ${response.status}.`);
  }

  return response.json();
}

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<string> {
  const config = getConfig();
  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(input.calendarId)}/events`,
  );
  url.searchParams.set("eventdata", JSON.stringify(eventData(input)));

  const response = (await requestZoho(url.toString(), {
    method: "POST",
  })) as ZohoEventResponse;

  const uid = response.events?.[0]?.uid;
  if (!uid) {
    throw new Error("Zoho Calendar did not return an event UID.");
  }

  return uid;
}

async function getCalendarEvent(
  calendarId: string,
  eventUid: string,
): Promise<{ etag: string }> {
  const config = getConfig();
  const url = `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventUid)}`;
  const response = (await requestZoho(url, { method: "GET" })) as ZohoEventResponse;
  const etag = response.events?.[0]?.etag;

  if (etag === undefined) {
    throw new Error("Zoho Calendar did not return the event etag.");
  }

  return { etag: String(etag) };
}

export async function updateCalendarEvent(
  input: CalendarEventInput & { eventUid: string },
): Promise<void> {
  const config = getConfig();
  const { etag } = await getCalendarEvent(input.calendarId, input.eventUid);
  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventUid)}`,
  );
  url.searchParams.set(
    "eventdata",
    JSON.stringify({
      ...eventData(input),
      etag,
      uid: input.eventUid,
    }),
  );

  await requestZoho(url.toString(), {
    method: "PUT",
    headers: {
      etag,
    },
  });
}

export async function deleteCalendarEvent(
  calendarId: string,
  eventUid: string,
): Promise<void> {
  const config = getConfig();
  const { etag } = await getCalendarEvent(calendarId, eventUid);
  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventUid)}`,
  );
  url.searchParams.set(
    "eventdata",
    JSON.stringify({ uid: eventUid, etag }),
  );

  await requestZoho(url.toString(), {
    method: "DELETE",
  });
}

export function isCalendarConfigured(): boolean {
  return Boolean(process.env.ZOHO_CALENDAR_ACCESS_TOKEN?.trim());
}
