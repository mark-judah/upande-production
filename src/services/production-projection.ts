import { apiClient, HttpError, mapAxiosError } from './api';

export interface ProjectionWeek {
  name: string;
  weekNo: number;
  projectedQty: number;
  actualHarvest: number;
  revisedForecast: number;
  customComment: string;
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
    weeks: (m.weeks ?? []).map((w) => ({
      name: String(w.name ?? ''),
      weekNo: Number(w.week_no ?? 0),
      projectedQty: Number(w.projected_qty ?? 0),
      actualHarvest: Number(w.actual_harvest ?? 0),
      revisedForecast: Number(w.revised_forecast ?? 0),
      customComment: String(w.custom_comment ?? ''),
    })),
  };
}

export const productionProjectionApi = {
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
