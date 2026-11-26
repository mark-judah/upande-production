import { api } from './api';

/** A greenhouse with a running crop cycle of the line's variety. */
export interface GrowingGreenhouse {
  name: string;
  label: string;
  farm: string;
  area: number;
}

/** A greenhouse Allocation Planning planned the line to: its stems to harvest and those harvested so far. */
export interface PlannedGreenhouse {
  greenhouse: string;
  stems: number;
  harvested: number;
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
  /** Where the line is planned to be harvested (empty: not planned yet). */
  plan: PlannedGreenhouse[];
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
  /** Its place in Allocation Planning's sequence for the delivery day (0: not planned yet) and its team. */
  sequence: number;
  team: string;
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
  plan?: { greenhouse?: string; stems?: number; harvested?: number }[];
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
  sequence?: number;
  team?: string;
  items?: RawLine[];
}

interface RawResponse {
  data?: { orders?: RawOrder[]; error?: string };
}

export const seaFreightApi = {
  /** The reasons an order may be finished under harvest (the Under Pack Reason list). */
  async underHarvestReasons(): Promise<{ name: string; label: string }[]> {
    const body = await api<{ data?: { reasons?: { name?: string; label?: string }[] } }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListUnderHarvestReasons',
      data: {},
    });
    return (body.data?.reasons ?? []).map((r) => ({ name: String(r.name ?? ''), label: String(r.label ?? r.name ?? '') }));
  },

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
      sequence: Number(o.sequence ?? 0),
      team: String(o.team ?? ''),
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
        plan: (l.plan ?? []).map((p) => ({
          greenhouse: String(p.greenhouse ?? ''),
          stems: Number(p.stems ?? 0),
          harvested: Number(p.harvested ?? 0),
        })),
      })),
    }));
  },

  /** Finish an order short of its plan (under harvest) with a reason: it goes to the packhouse as it is. An order
   *  harvested to plan is finished by the server on its own. */
  async markDone(salesOrder: string, reason?: string, notes?: string): Promise<string> {
    const body = await api<{ data?: { message?: string; error?: string } }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionMarkSeaFreightDone',
      data: { sales_order: salesOrder, reason: reason ?? '', notes: notes ?? '' },
    });
    if (body.data?.error) throw new Error(body.data.error);
    return String(body.data?.message ?? 'Marked as harvested.');
  },
};
