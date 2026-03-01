import { randomUUID } from "node:crypto";

export function generateUUID(): string {
  return randomUUID();
}

