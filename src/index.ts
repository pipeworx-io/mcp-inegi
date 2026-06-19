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
 * INEGI MCP — Mexico's national statistics office (INEGI) Indicators API.
 *
 * Fills the Mexico statistics gap (complements the banxico central-bank pack).
 * INEGI's signature is geographic granularity — most indicators resolve at
 * national, state (01–32), or municipality (5-digit) level. Source: the INEGI
 * Banco de Indicadores API (inegi.org.mx), authenticated with a free token.
 * Pipeworx provides a shared platform token (PLATFORM_INEGI_TOKEN, injected as
 * _apiKey by the gateway); pass _apiKey to use your own.
 *
 * Tools:
 * - inegi_population: total population, national / by state / by municipality
 * - inegi_indicator:  any INEGI indicator by id + geography (escape hatch)
 */


const API_BASE = 'https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR';

const API_KEY_PROP = {
  type: 'string' as const,
  description: 'Optional — your own free INEGI API token. Omit to use the shared Pipeworx token.',
};

const AREA_HELP =
  'Geographic area: "00" = national (default), "01"–"32" = state (e.g. "09" = Mexico City/CDMX, "07" = Chiapas, "15" = México state), or a 5-digit municipality code (state+municipio).';

const tools: McpToolExport['tools'] = [
  {
    name: 'inegi_population',
    description:
      "Total population of Mexico — nationally OR for a specific state/municipality (INEGI census/projection). PREFER OVER WEB SEARCH for \"population of Mexico\", \"population of Mexico City / Jalisco / a Mexican state\". INEGI's strength is the geographic detail. Returns the value with its reference year.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        area: { type: 'string', description: AREA_HELP },
        _apiKey: API_KEY_PROP,
      },
      required: [],
    },
  },
  {
    name: 'inegi_indicator',
    description:
      'Fetch any INEGI indicator by its numeric id, at a chosen geographic level — escape hatch for the full Banco de Indicadores (GDP, employment/ENOE, economic census, prices, etc.). Returns the latest value (or full history). Find indicator ids with INEGI\'s "Constructor de consultas" at inegi.org.mx/app/indicadores. NOTE: for Mexico inflation, interest rates, and the peso exchange rate, the banxico pack is usually the better source.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        indicator_id: { type: 'string', description: 'INEGI indicator id, e.g. "1002000001" (total population).' },
        area: { type: 'string', description: AREA_HELP },
        source: { type: 'string', description: 'Data bank: "BISE" (Banco de Indicadores, default) or "BIE" (Banco de Información Económica — economic time series).', enum: ['BISE', 'BIE'] },
        all_history: { type: 'boolean', description: 'Return the full time series instead of just the latest observation. Default false.' },
        _apiKey: API_KEY_PROP,
      },
      required: ['indicator_id'],
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

interface RawObs { TIME_PERIOD?: string; OBS_VALUE?: string; OBS_NOTE?: string }
interface RawSeries {
  INDICADOR?: string; FREQ?: string; UNIT?: string; UNIT_MULT?: string;
  SOURCE?: string; LASTUPDATE?: string; OBSERVATIONS?: RawObs[];
}

async function inegiFetch(
  token: string,
  indicatorId: string,
  area: string,
  recientes: boolean,
  source: string,
): Promise<RawSeries> {
  if (!token || !token.trim()) {
    throw new Error('INEGI token missing. The shared token is normally injected; to use your own pass _apiKey (free at inegi.org.mx/app/desarrolladores).');
  }
  const id = indicatorId.trim().replace(/[^0-9]/g, '');
  if (!id) throw new Error('indicator_id must be numeric, e.g. "1002000001".');
  const ar = (area || '00').trim().replace(/[^0-9]/g, '') || '00';
  const src = source === 'BIE' ? 'BIE' : 'BISE';
  const url = `${API_BASE}/${id}/en/${ar}/${recientes ? 'true' : 'false'}/${src}/2.0/${token.trim()}?type=json`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Pipeworx/1.0 (pipeworx.io)' } });
  if (!res.ok) throw new Error(`INEGI API error: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    // INEGI returns ["ErrorInfo:...","ErrorCode:100"] on no-result / bad params.
    const code = (data.find((x: string) => x.startsWith('ErrorCode')) ?? '').split(':')[1];
    throw new Error(`INEGI: no results for indicator ${id} at area ${ar}/${src} (ErrorCode ${code ?? '?'}). Check the id/area, or try the other source (BISE/BIE).`);
  }
  const s = (data as { Series?: RawSeries[] }).Series?.[0];
  if (!s) throw new Error(`INEGI returned no series for indicator ${id}.`);
  return s;
}

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shapeObs(s: RawSeries, recent?: number) {
  let obs = (s.OBSERVATIONS ?? [])
    .map((o) => ({ period: o.TIME_PERIOD ?? null, value: num(o.OBS_VALUE) }))
    .filter((o) => o.value !== null)
    .sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''));
  if (recent && recent > 0) obs = obs.slice(-recent);
  return obs;
}

// ── Tool implementations ─────────────────────────────────────────────

async function population(token: string, area?: string) {
  const ar = (area || '00').trim();
  const s = await inegiFetch(token, '1002000001', ar, true, 'BISE');
  const obs = shapeObs(s);
  const latest = obs[obs.length - 1] ?? null;
  return {
    indicator: 'Total population',
    area: ar.replace(/[^0-9]/g, '') || '00',
    area_level: ar === '00' ? 'national' : ar.length <= 2 ? 'state' : 'municipality',
    population: latest ? latest.value : null,
    reference_year: latest ? latest.period : null,
    source: 'INEGI',
  };
}

async function indicator(token: string, indicatorId: string, area?: string, source?: string, allHistory?: boolean) {
  const id = String(indicatorId ?? '').trim();
  if (!id) throw new Error('Required argument "indicator_id" is missing (e.g. "1002000001").');
  const s = await inegiFetch(token, id, area || '00', !allHistory, source === 'BIE' ? 'BIE' : 'BISE');
  return {
    indicator_id: s.INDICADOR ?? id,
    area: (area || '00').replace(/[^0-9]/g, '') || '00',
    unit: s.UNIT ?? null,
    frequency: s.FREQ ?? null,
    source: s.SOURCE ?? 'INEGI',
    last_update: s.LASTUPDATE ?? null,
    observations: shapeObs(s),
  };
}

// ── Router ───────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const token = args._apiKey as string;
  delete args._apiKey;
  switch (name) {
    case 'inegi_population':
      return population(token, args.area as string | undefined);
    case 'inegi_indicator':
      return indicator(
        token,
        args.indicator_id as string,
        args.area as string | undefined,
        args.source as string | undefined,
        args.all_history as boolean | undefined,
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
