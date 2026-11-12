import { apiClient, HttpError, mapAxiosError } from './api';

export interface ProjectionWeek {
  name: string;
  weekNo: number;
  projectedQty: number;
  actualHarvest: number;
  revisedForecast: number;
  customComment: string;
  /** False within the locked weeks ahead (Production Settings). */
  editable: boolean;
}

export interface ProductionProjection {
  name: string;
  farm: string;
  greenhouse: string;
  cropVariety: string;
  cropType: string;
  colour: string;
  area: number;
  year: string;
  weeks: ProjectionWeek[];
}

export interface ProjectionUpdateRow {
  name: string;
  revised_forecast?: number;
  custom_comment?: string;
}

interface RawProjection {
  message?: {
    status?: string;
    name?: string;
    farm?: string;
    greenhouse?: string;
    crop_variety?: string;
    crop_type?: string;
    colour?: string;
    area?: number;
    year?: string;
    weeks?: Array<{
      name?: string;
      week_no?: number;
      projected_qty?: number;
      actual_harvest?: number;
      revised_forecast?: number;
      custom_comment?: string;
      editable?: boolean;
    }>;
    message?: string;
  };
}

interface RawUpdateResp {
  message?: { message?: string; status?: string };
}

function toProjection(raw: RawProjection): ProductionProjection {
  const m = raw.message ?? {};
  if (m.status && m.status !== 'success') {
    throw new HttpError(200, m.message ?? 'Projection lookup failed.', raw);
  }
  return {
    name: String(m.name ?? ''),
    farm: String(m.farm ?? ''),
    greenhouse: String(m.greenhouse ?? ''),
    cropVariety: String(m.crop_variety ?? ''),
    cropType: String(m.crop_type ?? ''),
    colour: String(m.colour ?? ''),
    area: Number(m.area ?? 0),
    year: String(m.year ?? ''),
    weeks: (m.weeks ?? []).map(toWeek),
  };
}

export interface WeekForecastRow {
  greenhouse: string;
  variety: string;
  projectionName: string;
  flagged: boolean;
  week: ProjectionWeek;
}

export interface WeekForecastPage {
  total: number;
  filled: number;
  /** False when this week is inside the locked weeks ahead. */
  editable: boolean;
  rows: WeekForecastRow[];
}

type RawWeek = NonNullable<NonNullable<RawProjection['message']>['weeks']>[number];

interface RawWeekPage {
  message?: {
    total?: number;
    filled?: number;
    editable?: boolean;
    rows?: { greenhouse?: string; variety?: string; projection_name?: string; flagged?: boolean; week?: RawWeek }[];
  };
}

function toWeek(w: RawWeek | undefined): ProjectionWeek {
  return {
    name: String(w?.name ?? ''),
    weekNo: Number(w?.week_no ?? 0),
    projectedQty: Number(w?.projected_qty ?? 0),
    actualHarvest: Number(w?.actual_harvest ?? 0),
    revisedForecast: Number(w?.revised_forecast ?? 0),
    customComment: String(w?.custom_comment ?? ''),
    // Older servers don't send it: keep the week editable there.
    editable: w?.editable ?? true,
  };
}

export const productionProjectionApi = {
  /** One page of greenhouse × variety rows for a single week. */
  async fetchWeekPage(params: {
    greenhouses: string[];
    year: string;
    weekNo: number;
    currentWeek: number;
    search: string;
    offBudgetOnly: boolean;
    start: number;
    pageLength: number;
  }): Promise<WeekForecastPage> {
    try {
      const res = await apiClient().request<RawWeekPage>({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.getWeekForecast',
        data: {
          greenhouses: params.greenhouses,
          year: params.year,
          week: params.weekNo,
          current_week: params.currentWeek,
          search: params.search,
          off_budget: params.offBudgetOnly ? 1 : 0,
          start: params.start,
          page_length: params.pageLength,
        },
        timeout: 90000,
      });
      const m = res.data?.message ?? {};
      return {
        total: Number(m.total ?? 0),
        filled: Number(m.filled ?? 0),
        editable: m.editable ?? true,
        rows: (m.rows ?? []).map((r) => ({
          greenhouse: String(r.greenhouse ?? ''),
          variety: String(r.variety ?? ''),
          projectionName: String(r.projection_name ?? ''),
          flagged: !!r.flagged,
          week: toWeek(r.week),
        })),
      };
    } catch (err) {
      throw mapAxiosError(err);
    }
  },


  async fetchProjection(
    greenhouse: string,
    variety: string,
    year: string,
  ): Promise<ProductionProjection> {
    try {
      const res = await apiClient().request<RawProjection>({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.getProductionProjection',
        data: { greenhouse, variety, year },
        timeout: 90000,
      });
      return toProjection(res.data ?? {});
    } catch (err) {
      throw mapAxiosError(err);
    }
  },

  async updateRevisedForecast(
    projectionName: string,
    weeks: ProjectionUpdateRow[],
  ): Promise<{ message: string }> {
    try {
      const res = await apiClient().request<RawUpdateResp>({
        method: 'POST',
        url: '/api/method/upande_agriculture.mobile.api.updateRevisedForecast',
        data: { projection_name: projectionName, weeks },
      });
      const inner = res.data?.message ?? {};
      return { message: String(inner.message ?? 'Projections updated.') };
    } catch (err) {
      throw mapAxiosError(err);
    }
  },
};
