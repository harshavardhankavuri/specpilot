export interface DbAdapter {
  readonly dialect: "postgres" | "mssql";
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
