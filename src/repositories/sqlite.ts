import { invoke } from "@tauri-apps/api/core";

import { AppError, type DatabaseInfo, type ProbeEvent, type ProbeRepository } from "./types";

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("database error:")) {
    return new AppError("DATABASE", message);
  }
  if (message.startsWith("io error:")) {
    return new AppError("IO", message);
  }
  return new AppError("INVALID", message);
}

export class SqliteProbeRepository implements ProbeRepository {
  async getDatabaseInfo(): Promise<DatabaseInfo> {
    try {
      return await invoke<DatabaseInfo>("get_database_info");
    } catch (error) {
      throw toAppError(error);
    }
  }

  async insert(event: ProbeEvent): Promise<ProbeEvent> {
    try {
      return await invoke<ProbeEvent>("probe_insert", { event });
    } catch (error) {
      throw toAppError(error);
    }
  }

  async list(): Promise<ProbeEvent[]> {
    try {
      return await invoke<ProbeEvent[]>("probe_list");
    } catch (error) {
      throw toAppError(error);
    }
  }
}
