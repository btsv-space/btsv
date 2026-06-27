export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function commitTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
