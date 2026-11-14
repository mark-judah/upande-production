import { api } from './api';

/** A greenhouse with a running crop cycle of the line's variety. */
export interface GrowingGreenhouse {
  name: string;
  label: string;
  farm: string;
  area: number;
}

export interface SeaFreightLine {
  /** Sales Order Item row name. */
  name: string;
  itemCode: string;
  itemName: string;
  /** What the order (its line or Specification) asks for; empty when it says nothing. */
  stemLength: string;
  cutStage: string;
  headSize: string;
  spec: string;
  boxes: number;
  orderedStems: number;
  harvestedStems: number;
  remainingStems: number;
  greenhouses: GrowingGreenhouse[];
}

export interface SeaFreightOrder {
  name: string;
  /** The Sales Order's order name (custom_order_name), when set. */
  orderName: string;
  customer: string;
  deliveryDate: string;
  orderDate: string;
  status: string;
  orderedStems: number;
  harvestedStems: number;
  items: SeaFreightLine[];
}

interface RawLine {
  name?: string;
  item_code?: string;
  item_name?: string;
  stem_length?: string;
  cut_stage?: string;
  head_size?: string;
  spec?: string;
  boxes?: number;
  ordered_stems?: number;
  harvested_stems?: number;
  remaining_stems?: number;
  greenhouses?: Array<{ name?: string; label?: string; farm?: string; area?: number }>;
}

interface RawOrder {
  name?: string;
  order_name?: string;
  customer?: string;
  delivery_date?: string;
  order_date?: string;
  status?: string;
  ordered_stems?: number;
  harvested_stems?: number;
  items?: RawLine[];
}

interface RawResponse {
  data?: { orders?: RawOrder[]; error?: string };
}

export const seaFreightApi = {
  /** Open Sales Orders with Mode Of Transport = Sea Freight, soonest delivery first. */
  async listOrders(): Promise<SeaFreightOrder[]> {
    const body = await api<RawResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListSeaFreightOrders',
      data: {},
    });
    if (body.data?.error) throw new Error(body.data.error);
    return (body.data?.orders ?? []).map((o) => ({
      name: String(o.name ?? ''),
      orderName: String(o.order_name ?? ''),
      customer: String(o.customer ?? ''),
      deliveryDate: String(o.delivery_date ?? ''),
      orderDate: String(o.order_date ?? ''),
      status: String(o.status ?? ''),
      orderedStems: Number(o.ordered_stems ?? 0),
      harvestedStems: Number(o.harvested_stems ?? 0),
      items: (o.items ?? []).map((l) => ({
        name: String(l.name ?? ''),
        itemCode: String(l.item_code ?? ''),
        itemName: String(l.item_name ?? l.item_code ?? ''),
        stemLength: String(l.stem_length ?? ''),
        cutStage: String(l.cut_stage ?? ''),
        headSize: String(l.head_size ?? ''),
        spec: String(l.spec ?? ''),
        boxes: Number(l.boxes ?? 0),
        orderedStems: Number(l.ordered_stems ?? 0),
        harvestedStems: Number(l.harvested_stems ?? 0),
        remainingStems: Number(l.remaining_stems ?? 0),
        greenhouses: (l.greenhouses ?? []).map((g) => ({
          name: String(g.name ?? ''),
          label: String(g.label ?? g.name ?? ''),
          farm: String(g.farm ?? ''),
          area: Number(g.area ?? 0),
        })),
      })),
    }));
  },

  /** Every line is 100% harvested: hand the order to the packhouse (it leaves this list). */
  async markDone(salesOrder: string): Promise<string> {
    const body = await api<{ data?: { message?: string; error?: string } }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionMarkSeaFreightDone',
      data: { sales_order: salesOrder },
    });
    if (body.data?.error) throw new Error(body.data.error);
    return String(body.data?.message ?? 'Marked as harvested.');
  },
};
