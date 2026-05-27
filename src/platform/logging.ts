export type InstantFormLogLevel = "debug" | "info" | "warn" | "error";

export type InstantFormLogRecord = {
  timestamp?: string;
  level: InstantFormLogLevel;
  event: string;
  requestId?: string;
  routeKey?: string;
  formName?: string;
  pageName?: string;
  stepKey?: string;
  submissionId?: string;
  status?: number;
  durationMs?: number;
  critical?: boolean;
  data?: unknown;
};

export type InstantFormLogger = (record: InstantFormLogRecord) => void;

const requestIds = new WeakMap<Request, string>();
const requestIdPattern = /^[a-zA-Z0-9._:-]{1,200}$/u;

export function createJsonStdoutLogger(write: (line: string) => void = (line) => console.log(line)): InstantFormLogger {
  return (record) => {
    write(JSON.stringify(normalizeLogRecord(record)));
  };
}

export function logInstantFormEvent(logger: InstantFormLogger | undefined, record: InstantFormLogRecord): void {
  if (!logger) {
    return;
  }

  const normalizedRecord = normalizeLogRecord(record);

  try {
    logger(normalizedRecord);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[instant-forms] event logger failed", {
      event: normalizedRecord.event,
      requestId: normalizedRecord.requestId,
      message,
    });
  }
}

export function assignRequestId(request: Request): string {
  const existingRequestId = requestIds.get(request);
  if (existingRequestId) {
    return existingRequestId;
  }

  const incomingRequestId = request.headers.get("x-request-id")?.trim();
  const requestId = incomingRequestId && requestIdPattern.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
  requestIds.set(request, requestId);

  return requestId;
}

export function getRequestId(request: Request): string {
  return requestIds.get(request) ?? assignRequestId(request);
}

function normalizeLogRecord(record: InstantFormLogRecord): InstantFormLogRecord & { timestamp: string } {
  return {
    ...record,
    timestamp: record.timestamp ?? new Date().toISOString(),
  };
}
