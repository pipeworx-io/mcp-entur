interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Entur MCP — Norway public transport, nationwide, all modes (developer.entur.org)
 *
 * Tools:
 * - entur_departures: real-time departures from any Norwegian stop (rail/metro/tram/bus/ferry)
 * - entur_journey: door-to-door trip planning between any two Norwegian places
 * - entur_stops_search: search Norwegian stops/stations/places (NSR ids + coordinates)
 *
 * Auth: keyless. Entur requires an ET-Client-Name header identifying the caller;
 * we send "pipeworx-gateway" on every request.
 *
 * Upstream: GraphQL JourneyPlanner v3 (api.entur.io/journey-planner/v3/graphql)
 * + Pelias geocoder (api.entur.io/geocoder/v1/autocomplete) for name → NSR id.
 */


const GRAPHQL_URL = 'https://api.entur.io/journey-planner/v3/graphql';
const GEOCODER_URL = 'https://api.entur.io/geocoder/v1/autocomplete';
const CLIENT_NAME = 'pipeworx-gateway';

const tools: McpToolExport['tools'] = [
  {
    name: 'entur_departures',
    description:
      'Real-time departures board for any public-transport stop in Norway — train, tram, metro, bus, and ferry departures for Oslo, Bergen, Trondheim, Stavanger and every other Norwegian stop, from Entur (the national journey-planning authority covering Vy, Flytoget, Ruter, Skyss, AtB, formerly NSB). Returns line, destination, aimed vs expected time, delay in minutes, platform/quay, and realtime flag. Example: entur_departures({ stop: "Oslo S", mode: "rail" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        stop: {
          type: 'string',
          description: 'Stop or station name, e.g. "Oslo S", "Bergen stasjon", "Trondheim S", "Jernbanetorget" — or a raw NSR id like "NSR:StopPlace:59872"',
        },
        mode: {
          type: 'string',
          enum: ['rail', 'metro', 'tram', 'bus', 'water', 'coach', 'air'],
          description: 'Optional transport-mode filter. "water" = ferry/boat, "rail" = train.',
        },
        limit: { type: 'number', description: 'Max departures to return, 1-50 (default 10)' },
      },
      required: ['stop'],
    },
  },
  {
    name: 'entur_journey',
    description:
      'Entur journey planner — plan a public-transport trip between any two places in Norway (Oslo to Bergen train, airport connections, city tram/metro/bus routes, ferries). Returns door-to-door itineraries with legs (mode, line, operator like Vy or Flytoget, aimed and expected times), total duration, transfer count, and walking distance. Example: entur_journey({ from: "Oslo S", to: "Bergen stasjon" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        from: { type: 'string', description: 'Origin — place/station name or NSR id, e.g. "Oslo S"' },
        to: { type: 'string', description: 'Destination — place/station name or NSR id, e.g. "Bergen stasjon"' },
        depart_at: {
          type: 'string',
          description: 'Optional departure time, ISO 8601 (e.g. "2026-07-20T08:00:00+02:00"). Default: now.',
        },
        modes: {
          type: 'array',
          items: { type: 'string', enum: ['rail', 'metro', 'tram', 'bus', 'water', 'coach', 'air'] },
          description: 'Optional: restrict transit legs to these modes, e.g. ["rail"] for train-only',
        },
        max_trips: { type: 'number', description: 'Max itineraries to return, 1-10 (default 3)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'entur_stops_search',
    description:
      'Search Norwegian public-transport stops, train stations, tram/metro/bus stops, ferry quays and places by name via the Entur national stop-register geocoder. Returns official name, NSR id (usable in entur_departures and entur_journey), locality, categories, transport modes, and coordinates. Example: entur_stops_search({ query: "Trondheim" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Place or stop name to search, e.g. "Trondheim", "Nationaltheatret"' },
        limit: { type: 'number', description: 'Max results, 1-25 (default 10)' },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------

const VALID_MODES = ['rail', 'metro', 'tram', 'bus', 'water', 'coach', 'air'] as const;
const MODE_ALIASES: Record<string, string> = {
  train: 'rail',
  subway: 'metro',
  underground: 'metro',
  ferry: 'water',
  boat: 'water',
};

function normalizeMode(raw: unknown, tool: string): string {
  const mode = MODE_ALIASES[String(raw).toLowerCase()] ?? String(raw).toLowerCase();
  if (!VALID_MODES.includes(mode as (typeof VALID_MODES)[number])) {
    throw new Error(
      `${tool}: unknown mode "${raw}". Use one of: ${VALID_MODES.join(', ')} (ferry = "water", train = "rail").`,
    );
  }
  return mode;
}

async function etFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, {
      ...init,
      headers: { 'ET-Client-Name': CLIENT_NAME, Accept: 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Entur: upstream timeout after 8s. Retry once.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function gql(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await etFetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Entur JourneyPlanner error: HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) throw new Error(`Entur JourneyPlanner error: ${body.errors[0].message}`);
  return body.data ?? {};
}

// ---------------------------------------------------------------------------
// Geocoder: place name → NSR StopPlace id

interface GeoFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    id?: string;
    name?: string;
    label?: string;
    layer?: string;
    locality?: string;
    county?: string;
    category?: string[];
    mode?: Array<Record<string, unknown>>;
  };
}

async function geocode(text: string, size = 10): Promise<GeoFeature[]> {
  const params = new URLSearchParams({ text, size: String(size), lang: 'en' });
  const res = await etFetch(`${GEOCODER_URL}?${params}`);
  if (!res.ok) throw new Error(`Entur geocoder error: HTTP ${res.status}`);
  const body = (await res.json()) as { features?: GeoFeature[] };
  return body.features ?? [];
}

/** Resolve a user-supplied stop name (or raw NSR id) to an NSR:StopPlace id. */
async function resolveStopPlace(raw: string, tool: string): Promise<{ id: string; name: string }> {
  const text = raw.trim();
  if (/^NSR:(StopPlace|GroupOfStopPlaces):\d+$/i.test(text)) return { id: text, name: text };
  const features = await geocode(text);
  const stop = features.find((f) => /^NSR:StopPlace:/.test(f.properties?.id ?? ''));
  if (!stop?.properties?.id) {
    const suggestions = features
      .map((f) => f.properties?.label)
      .filter(Boolean)
      .slice(0, 3);
    throw new Error(
      `${tool}: no Norwegian stop found for "${text}".${suggestions.length ? ` Nearby matches: ${suggestions.join('; ')}.` : ''} Try entur_stops_search to find the right stop name, then pass its nsr_id.`,
    );
  }
  return { id: stop.properties.id, name: stop.properties.name ?? text };
}

// ---------------------------------------------------------------------------

function delayMinutes(aimed?: string | null, expected?: string | null): number | null {
  if (!aimed || !expected) return null;
  const a = Date.parse(aimed);
  const e = Date.parse(expected);
  if (Number.isNaN(a) || Number.isNaN(e)) return null;
  return Math.round((e - a) / 60000);
}

interface Situation {
  summary?: Array<{ language?: string; value?: string }>;
}

function situationText(situations?: Situation[]): string[] | undefined {
  if (!situations?.length) return undefined;
  const texts = situations
    .map((s) => {
      const en = s.summary?.find((t) => t.language === 'en');
      return (en ?? s.summary?.[0])?.value;
    })
    .filter((v): v is string => Boolean(v));
  return texts.length ? texts : undefined;
}

// ---------------------------------------------------------------------------
// entur_departures

interface EstimatedCall {
  aimedDepartureTime?: string;
  expectedDepartureTime?: string;
  realtime?: boolean;
  cancellation?: boolean;
  quay?: { publicCode?: string; name?: string };
  destinationDisplay?: { frontText?: string };
  serviceJourney?: {
    line?: { publicCode?: string; name?: string; transportMode?: string; authority?: { name?: string } };
  };
  situations?: Situation[];
}

const DEPARTURES_QUERY = `
query($id: String!, $n: Int!, $modes: [TransportMode]) {
  stopPlace(id: $id) {
    id name transportMode
    estimatedCalls(numberOfDepartures: $n, whiteListedModes: $modes) {
      aimedDepartureTime expectedDepartureTime realtime cancellation
      quay { publicCode name }
      destinationDisplay { frontText }
      serviceJourney { line { publicCode name transportMode authority { name } } }
      situations { summary { language value } }
    }
  }
}`;

async function departures(args: Record<string, unknown>) {
  const raw = String(args.stop ?? args.station ?? args.stop_place ?? '').trim();
  if (!raw) throw new Error('entur_departures requires a stop, e.g. { stop: "Oslo S" }.');
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const mode = args.mode ? normalizeMode(args.mode, 'entur_departures') : undefined;

  const resolved = await resolveStopPlace(raw, 'entur_departures');
  const data = (await gql(DEPARTURES_QUERY, {
    id: resolved.id,
    n: limit,
    modes: mode ? [mode] : null,
  })) as {
    stopPlace?: {
      id: string;
      name: string;
      transportMode?: string[];
      estimatedCalls?: EstimatedCall[];
    };
  };
  const sp = data.stopPlace;
  if (!sp) {
    throw new Error(
      `entur_departures: NSR id "${resolved.id}" is unknown to the journey planner. Use entur_stops_search to find a valid stop.`,
    );
  }
  const calls = sp.estimatedCalls ?? [];
  return {
    stop: { name: sp.name, nsr_id: sp.id, modes_served: sp.transportMode },
    mode_filter: mode ?? null,
    count: calls.length,
    note:
      calls.length === 0
        ? `No upcoming departures${mode ? ` for mode "${mode}"` : ''} at ${sp.name}. Drop the mode filter or check modes_served.`
        : undefined,
    departures: calls.map((c) => ({
      line: c.serviceJourney?.line?.publicCode ?? null,
      line_name: c.serviceJourney?.line?.name ?? null,
      mode: c.serviceJourney?.line?.transportMode ?? null,
      operator: c.serviceJourney?.line?.authority?.name ?? null,
      destination: c.destinationDisplay?.frontText ?? null,
      aimed_time: c.aimedDepartureTime ?? null,
      expected_time: c.expectedDepartureTime ?? null,
      delay_minutes: delayMinutes(c.aimedDepartureTime, c.expectedDepartureTime),
      realtime: c.realtime ?? false,
      cancelled: c.cancellation ?? false,
      platform: c.quay?.publicCode ?? null,
      alerts: situationText(c.situations),
    })),
  };
}

// ---------------------------------------------------------------------------
// entur_journey

interface TripLeg {
  mode?: string;
  distance?: number;
  duration?: number;
  aimedStartTime?: string;
  expectedStartTime?: string;
  aimedEndTime?: string;
  expectedEndTime?: string;
  fromPlace?: { name?: string };
  toPlace?: { name?: string };
  line?: { publicCode?: string; name?: string; transportMode?: string; authority?: { name?: string } };
  situations?: Situation[];
}

interface TripPattern {
  aimedStartTime?: string;
  expectedStartTime?: string;
  aimedEndTime?: string;
  expectedEndTime?: string;
  duration?: number;
  walkDistance?: number;
  legs?: TripLeg[];
}

const TRIP_QUERY = `
query($from: Location!, $to: Location!, $n: Int!, $dt: DateTime, $modes: Modes) {
  trip(from: $from, to: $to, numTripPatterns: $n, dateTime: $dt, modes: $modes) {
    tripPatterns {
      aimedStartTime expectedStartTime aimedEndTime expectedEndTime duration walkDistance
      legs {
        mode distance duration
        aimedStartTime expectedStartTime aimedEndTime expectedEndTime
        fromPlace { name } toPlace { name }
        line { publicCode name transportMode authority { name } }
        situations { summary { language value } }
      }
    }
  }
}`;

function shapeLeg(l: TripLeg) {
  return {
    mode: l.mode ?? null,
    line: l.line?.publicCode ?? null,
    line_name: l.line?.name ?? null,
    operator: l.line?.authority?.name ?? null,
    from: l.fromPlace?.name ?? null,
    to: l.toPlace?.name ?? null,
    aimed_departure: l.aimedStartTime ?? null,
    expected_departure: l.expectedStartTime ?? null,
    aimed_arrival: l.aimedEndTime ?? null,
    expected_arrival: l.expectedEndTime ?? null,
    duration_minutes: l.duration != null ? Math.round(l.duration / 60) : null,
    distance_m: l.distance != null ? Math.round(l.distance) : null,
    alerts: situationText(l.situations),
  };
}

async function journey(args: Record<string, unknown>) {
  const fromRaw = String(args.from ?? args.origin ?? '').trim();
  const toRaw = String(args.to ?? args.destination ?? '').trim();
  if (!fromRaw || !toRaw) {
    throw new Error('entur_journey requires from and to, e.g. { from: "Oslo S", to: "Bergen stasjon" }.');
  }
  const n = Math.min(Math.max(Number(args.max_trips) || 3, 1), 10);
  const modeList = Array.isArray(args.modes)
    ? args.modes.map((m) => normalizeMode(m, 'entur_journey'))
    : undefined;
  const departAt = args.depart_at ? String(args.depart_at).trim() : undefined;
  if (departAt && Number.isNaN(Date.parse(departAt))) {
    throw new Error(
      `entur_journey: depart_at "${departAt}" is unparseable — use ISO 8601 like "2026-07-20T08:00:00+02:00".`,
    );
  }

  const [from, to] = await Promise.all([
    resolveStopPlace(fromRaw, 'entur_journey'),
    resolveStopPlace(toRaw, 'entur_journey'),
  ]);

  const data = (await gql(TRIP_QUERY, {
    from: { place: from.id },
    to: { place: to.id },
    n,
    dt: departAt ?? null,
    modes: modeList?.length ? { transportModes: modeList.map((m) => ({ transportMode: m })) } : null,
  })) as { trip?: { tripPatterns?: TripPattern[] } };

  const patterns = data.trip?.tripPatterns ?? [];
  return {
    from: { name: from.name, nsr_id: from.id },
    to: { name: to.name, nsr_id: to.id },
    depart_at: departAt ?? 'now',
    mode_filter: modeList ?? null,
    count: patterns.length,
    note:
      patterns.length === 0
        ? 'No itineraries found. Widen the time window, drop the modes filter, or verify both stops with entur_stops_search.'
        : undefined,
    itineraries: patterns.map((p) => {
      const transitLegs = (p.legs ?? []).filter((l) => l.mode && l.mode !== 'foot');
      return {
        aimed_start: p.aimedStartTime ?? null,
        expected_start: p.expectedStartTime ?? null,
        aimed_end: p.aimedEndTime ?? null,
        expected_end: p.expectedEndTime ?? null,
        duration_minutes: p.duration != null ? Math.round(p.duration / 60) : null,
        walk_distance_m: p.walkDistance != null ? Math.round(p.walkDistance) : null,
        transfers: Math.max(transitLegs.length - 1, 0),
        legs: (p.legs ?? []).map(shapeLeg),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// entur_stops_search

function flattenModes(mode?: Array<Record<string, unknown>>): string[] | undefined {
  if (!mode?.length) return undefined;
  const keys = [...new Set(mode.flatMap((m) => Object.keys(m)))];
  return keys.length ? keys : undefined;
}

async function stopsSearch(args: Record<string, unknown>) {
  const query = String(args.query ?? args.text ?? args.search ?? '').trim();
  if (!query) throw new Error('entur_stops_search requires a query, e.g. { query: "Trondheim" }.');
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  const features = await geocode(query, limit);
  return {
    query,
    count: features.length,
    results: features.map((f) => ({
      name: f.properties?.name ?? null,
      label: f.properties?.label ?? null,
      nsr_id: f.properties?.id ?? null,
      layer: f.properties?.layer ?? null,
      locality: f.properties?.locality ?? null,
      county: f.properties?.county ?? null,
      categories: f.properties?.category,
      modes: flattenModes(f.properties?.mode),
      latitude: f.geometry?.coordinates?.[1] ?? null,
      longitude: f.geometry?.coordinates?.[0] ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'entur_departures':
      return departures(args);
    case 'entur_journey':
      return journey(args);
    case 'entur_stops_search':
      return stopsSearch(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
