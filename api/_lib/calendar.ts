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

export interface CalendarEventSnapshot {
  uid: string;
  etag: string;
  resource: Record<string, unknown>;
}

interface ZohoCalendarConfig {
  apiBaseUrl: string;
  accessToken: string;
}

interface ZohoEventResponse {
  events?: Array<Record<string, unknown>>;
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
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
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
    const body = await response.text().catch(() => "");
    const suffix = body ? ` ${body.slice(0, 500)}` : "";
    throw new Error(
      `Zoho Calendar request failed with HTTP ${response.status}.${suffix}`,
    );
  }

  return response.json();
}

export async function getCalendarEventSnapshot(
  calendarId: string,
  eventUid: string,
): Promise<CalendarEventSnapshot> {
  const config = getConfig();

  const url =
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}` +
    `/events/${encodeURIComponent(eventUid)}`;

  const response = (await requestZoho(url, {
    method: "GET",
  })) as ZohoEventResponse;

  const event = response.events?.[0];

  if (!event) {
    throw new Error("Zoho Calendar did not return the requested event.");
  }

  const uid = event.uid;
  const etag = event.etag;

  if (typeof uid !== "string" || !uid) {
    throw new Error("Zoho Calendar event snapshot is missing its UID.");
  }

  if (etag === undefined || etag === null) {
    throw new Error("Zoho Calendar event snapshot is missing its etag.");
  }

  return {
    uid,
    etag: String(etag),
    resource: event,
  };
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

  if (typeof uid !== "string" || !uid) {
    throw new Error("Zoho Calendar did not return an event UID.");
  }

  return uid;
}

export async function updateCalendarEvent(
  input: CalendarEventInput & { eventUid: string },
): Promise<void> {
  const config = getConfig();
  const snapshot = await getCalendarEventSnapshot(
    input.calendarId,
    input.eventUid,
  );

  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(input.calendarId)}` +
      `/events/${encodeURIComponent(input.eventUid)}`,
  );

  url.searchParams.set(
    "eventdata",
    JSON.stringify({
      ...eventData(input),
      etag: snapshot.etag,
      uid: input.eventUid,
    }),
  );

  await requestZoho(url.toString(), {
    method: "PUT",
    headers: {
      etag: snapshot.etag,
    },
  });
}

export async function restoreCalendarEvent(
  calendarId: string,
  eventUid: string,
  resource: Record<string, unknown>,
): Promise<void> {
  const config = getConfig();

  const current = await getCalendarEventSnapshot(calendarId, eventUid);

  const restoredResource: Record<string, unknown> = {
    ...resource,
    uid: eventUid,
    etag: current.etag,
  };

  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}` +
      `/events/${encodeURIComponent(eventUid)}`,
  );

  url.searchParams.set("eventdata", JSON.stringify(restoredResource));

  await requestZoho(url.toString(), {
    method: "PUT",
    headers: {
      etag: current.etag,
    },
  });
}

export async function deleteCalendarEvent(
  calendarId: string,
  eventUid: string,
): Promise<void> {
  const config = getConfig();
  const snapshot = await getCalendarEventSnapshot(calendarId, eventUid);

  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}` +
      `/events/${encodeURIComponent(eventUid)}`,
  );

  url.searchParams.set(
    "eventdata",
    JSON.stringify({
      uid: eventUid,
      etag: snapshot.etag,
    }),
  );

  await requestZoho(url.toString(), {
    method: "DELETE",
    headers: {
      etag: snapshot.etag,
    },
  });
}

export async function deleteCalendarEventWithSnapshot(
  calendarId: string,
  eventUid: string,
): Promise<CalendarEventSnapshot> {
  const snapshot = await getCalendarEventSnapshot(calendarId, eventUid);

  await deleteCalendarEvent(calendarId, eventUid);

  return snapshot;
}

export function isCalendarConfigured(): boolean {
  return Boolean(process.env.ZOHO_CALENDAR_ACCESS_TOKEN?.trim());
}
