import {
  getZohoAccessToken,
  isZohoServiceConfigured,
} from "./zoho-oauth";

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
}

interface ZohoEventResponse {
  events?: Array<Record<string, unknown>>;
}

interface ZohoCalendarResponse {
  calendars?: Array<Record<string, unknown>>;
}

const COMMITTEE_CALENDAR_PREFIX =
  "Nairobi Club - ";

const COMMITTEE_CALENDAR_COLOR =
  "#0B2A50";

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super(
      "Zoho Calendar is not configured.",
    );
    this.name =
      "CalendarNotConfiguredError";
  }
}

function getConfig(): ZohoCalendarConfig {
  return {
    apiBaseUrl:
      process.env.ZOHO_CALENDAR_API_BASE_URL
        ?.trim()
        .replace(/\/+$/, "") ||
      "https://calendar.zoho.com/api/v1",
  };
}

function committeeCalendarName(
  committeeName: string,
): string {
  const cleanName =
    committeeName
      .trim()
      .replace(/\s+/g, " ");

  if (!cleanName) {
    throw new Error(
      "Committee name is required for calendar provisioning.",
    );
  }

  const candidate =
    `${COMMITTEE_CALENDAR_PREFIX}${cleanName}`;

  if (candidate.length <= 50) {
    return candidate;
  }

  return (
    candidate
      .slice(0, 47)
      .trimEnd() + "..."
  );
}

function committeeCalendarDescription(
  committeeName: string,
): string {
  return (
    `Nairobi Club Committee Register calendar for ${committeeName.trim()}.`
  ).slice(0, 1000);
}

function formatZohoUtc(
  value: Date,
): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function eventData(
  input: CalendarEventInput,
) {
  return {
    title:
      input.title,
    description:
      input.description ?? "",
    location:
      input.location,
    dateandtime: {
      timezone:
        input.timezone,
      start:
        formatZohoUtc(
          input.startAt,
        ),
      end:
        formatZohoUtc(
          input.endAt,
        ),
    },
    isallday:
      false,
    isprivate:
      false,
    attendees:
      input.attendees.map(
        (attendee) => ({
          email:
            attendee.email,
          status:
            "NEEDS-ACTION",
          permission:
            1,
          attendance:
            1,
        }),
      ),
    notify_attendee:
      1,
    notifyType:
      1,
  };
}

async function requestZoho(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  if (!isCalendarConfigured()) {
    throw new CalendarNotConfiguredError();
  }

  const accessToken =
    await getZohoAccessToken(
      "CALENDAR",
    );

  const response =
    await fetch(
      url,
      {
        ...init,
        headers: {
          Authorization:
            `Zoho-oauthtoken ${accessToken}`,
          Accept:
            "application/json",
          ...(init.headers ?? {}),
        },
      },
    );

  if (!response.ok) {
    const body =
      await response
        .text()
        .catch(
          () => "",
        );

    const suffix =
      body
        ? ` ${body.slice(0, 500)}`
        : "";

    throw new Error(
      `Zoho Calendar request failed with HTTP ${response.status}.${suffix}`,
    );
  }

  if (response.status === 204) {
    return {};
  }

  return response
    .json()
    .catch(
      () => ({}),
    );
}

export async function createCommitteeCalendar(
  committeeName: string,
): Promise<string> {
  const config =
    getConfig();

  const url =
    new URL(
      `${config.apiBaseUrl}/calendars`,
    );

  url.searchParams.set(
    "calendarData",
    JSON.stringify({
      name:
        committeeCalendarName(
          committeeName,
        ),
      color:
        COMMITTEE_CALENDAR_COLOR,
      textcolor:
        "#FFFFFF",
      include_infreebusy:
        true,
      timezone:
        "Africa/Nairobi",
      description:
        committeeCalendarDescription(
          committeeName,
        ),
      private:
        "disable",
      public:
        "disable",
      status:
        true,
    }),
  );

  const response =
    (await requestZoho(
      url.toString(),
      {
        method:
          "POST",
      },
    )) as ZohoCalendarResponse;

  const uid =
    response.calendars?.[0]
      ?.uid;

  if (
    typeof uid !== "string" ||
    !uid.trim()
  ) {
    throw new Error(
      "Zoho Calendar did not return a calendar UID.",
    );
  }

  return uid.trim();
}

export async function updateCommitteeCalendar(
  calendarId: string,
  committeeName: string,
): Promise<void> {
  const config =
    getConfig();

  const url =
    new URL(
      `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}`,
    );

  url.searchParams.set(
    "calendarData",
    JSON.stringify({
      name:
        committeeCalendarName(
          committeeName,
        ),
      description:
        committeeCalendarDescription(
          committeeName,
        ),
      timezone:
        "Africa/Nairobi",
    }),
  );

  await requestZoho(
    url.toString(),
    {
      method:
        "PUT",
    },
  );
}

export async function deleteCommitteeCalendar(
  calendarId: string,
): Promise<void> {
  const config =
    getConfig();

  await requestZoho(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}`,
    {
      method:
        "DELETE",
    },
  );
}

export async function getCalendarEventSnapshot(
  calendarId: string,
  eventUid: string,
): Promise<CalendarEventSnapshot> {
  const config =
    getConfig();

  const url =
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}` +
    `/events/${encodeURIComponent(eventUid)}`;

  const response =
    (await requestZoho(
      url,
      {
        method:
          "GET",
      },
    )) as ZohoEventResponse;

  const event =
    response.events?.[0];

  if (!event) {
    throw new Error(
      "Zoho Calendar did not return the requested event.",
    );
  }

  const uid =
    event.uid;

  const etag =
    event.etag;

  if (
    typeof uid !== "string" ||
    !uid
  ) {
    throw new Error(
      "Zoho Calendar event snapshot is missing its UID.",
    );
  }

  if (
    etag === undefined ||
    etag === null
  ) {
    throw new Error(
      "Zoho Calendar event snapshot is missing its etag.",
    );
  }

  return {
    uid,
    etag:
      String(etag),
    resource:
      event,
  };
}

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<string> {
  const config =
    getConfig();

  const url =
    new URL(
      `${config.apiBaseUrl}/calendars/${encodeURIComponent(input.calendarId)}/events`,
    );

  url.searchParams.set(
    "eventdata",
    JSON.stringify(
      eventData(
        input,
      ),
    ),
  );

  const response =
    (await requestZoho(
      url.toString(),
      {
        method:
          "POST",
      },
    )) as ZohoEventResponse;

  const uid =
    response.events?.[0]
      ?.uid;

  if (
    typeof uid !== "string" ||
    !uid
  ) {
    throw new Error(
      "Zoho Calendar did not return an event UID.",
    );
  }

  return uid;
}

export async function updateCalendarEvent(
  input:
    CalendarEventInput & {
      eventUid: string;
    },
): Promise<void> {
  const config =
    getConfig();

  const snapshot =
    await getCalendarEventSnapshot(
      input.calendarId,
      input.eventUid,
    );

  const url =
    new URL(
      `${config.apiBaseUrl}/calendars/${encodeURIComponent(input.calendarId)}` +
        `/events/${encodeURIComponent(input.eventUid)}`,
    );

  url.searchParams.set(
    "eventdata",
    JSON.stringify({
      ...eventData(
        input,
      ),
      etag:
        snapshot.etag,
      uid:
        input.eventUid,
    }),
  );

  await requestZoho(
    url.toString(),
    {
      method:
        "PUT",
      headers: {
        etag:
          snapshot.etag,
      },
    },
  );
}

export async function restoreCalendarEvent(
  calendarId: string,
  eventUid: string,
  resource: Record<string, unknown>,
): Promise<void> {
  const config =
    getConfig();

  const current =
    await getCalendarEventSnapshot(
      calendarId,
      eventUid,
    );

  const restoredResource:
    Record<string, unknown> = {
      ...resource,
      uid:
        eventUid,
      etag:
        current.etag,
    };

  const url =
    new URL(
      `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}` +
        `/events/${encodeURIComponent(eventUid)}`,
    );

  url.searchParams.set(
    "eventdata",
    JSON.stringify(
      restoredResource,
    ),
  );

  await requestZoho(
    url.toString(),
    {
      method:
        "PUT",
      headers: {
        etag:
          current.etag,
      },
    },
  );
}

export async function deleteCalendarEvent(
  calendarId: string,
  eventUid: string,
): Promise<void> {
  const config =
    getConfig();

  const snapshot =
    await getCalendarEventSnapshot(
      calendarId,
      eventUid,
    );

  const url =
    new URL(
      `${config.apiBaseUrl}/calendars/${encodeURIComponent(calendarId)}` +
        `/events/${encodeURIComponent(eventUid)}`,
    );

  url.searchParams.set(
    "eventdata",
    JSON.stringify({
      uid:
        eventUid,
      etag:
        snapshot.etag,
    }),
  );

  await requestZoho(
    url.toString(),
    {
      method:
        "DELETE",
      headers: {
        etag:
          snapshot.etag,
      },
    },
  );
}

export async function deleteCalendarEventWithSnapshot(
  calendarId: string,
  eventUid: string,
): Promise<CalendarEventSnapshot> {
  const snapshot =
    await getCalendarEventSnapshot(
      calendarId,
      eventUid,
    );

  await deleteCalendarEvent(
    calendarId,
    eventUid,
  );

  return snapshot;
}

export function isCalendarConfigured(): boolean {
  return isZohoServiceConfigured(
    "CALENDAR",
  );
}