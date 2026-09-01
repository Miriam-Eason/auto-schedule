import type { ProbeEvent, ProbeRepository } from "./types";
import { AppError } from "./types";

function cloneEvent(event: ProbeEvent): ProbeEvent {
  return { ...event };
}

export class MemoryProbeRepository implements ProbeRepository {
  private readonly events: ProbeEvent[] = [];
  private readonly info = {
    path: ":memory:",
    schemaVersion: 1,
    appVersion: "0.1.0",
    integrityOk: true,
  };

  async getDatabaseInfo() {
    return { ...this.info };
  }

  async insert(event: ProbeEvent): Promise<ProbeEvent> {
    if (!event.id.trim()) {
      throw new AppError("INVALID", "probe id is required");
    }
    if (!event.message.trim()) {
      throw new AppError("INVALID", "probe message is required");
    }
    if (!event.createdAt.trim()) {
      throw new AppError("INVALID", "probe createdAt is required");
    }
    this.events.push(cloneEvent(event));
    return cloneEvent(event);
  }

  async list(): Promise<ProbeEvent[]> {
    return [...this.events]
      .sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return a.id < b.id ? 1 : -1;
        }
        return a.createdAt < b.createdAt ? 1 : -1;
      })
      .map(cloneEvent);
  }
}
