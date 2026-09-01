export type AppErrorCode = "DATABASE" | "INVALID" | "IO" | "UNKNOWN";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export interface ProbeEvent {
  id: string;
  message: string;
  createdAt: string;
}

export interface DatabaseInfo {
  path: string;
  schemaVersion: number;
  appVersion: string;
  integrityOk: boolean;
}

export interface ProbeRepository {
  getDatabaseInfo(): Promise<DatabaseInfo>;
  insert(event: ProbeEvent): Promise<ProbeEvent>;
  list(): Promise<ProbeEvent[]>;
}
