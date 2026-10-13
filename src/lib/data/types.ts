import type {
  LeadPayload,
  LocationKind,
  LocationPricesResponse,
  PublicLocation,
  SubmitLeadResponse,
} from "@/lib/contracts";

/** Where the calculator gets its prices and where it sends leads (ТЗ §2, §8). */
export interface CalculatorDataSource {
  listLocations(): Promise<PublicLocation[]>;
  getLocationPrices(kind: LocationKind, id: string): Promise<LocationPricesResponse>;
  submitLead(body: { lead: LeadPayload } | { retry_lead_id: string }): Promise<SubmitLeadResponse>;
}

/** No backend configured in a production build: shown as a calm "unavailable" state. */
export class DataUnavailableError extends Error {
  constructor(message = "Calculator data source is not configured") {
    super(message);
    this.name = "DataUnavailableError";
  }
}
