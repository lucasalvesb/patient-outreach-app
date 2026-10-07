import type { OutreachAction, OutreachRecord } from "../api/types";
import { ACTIONS } from "./actions";

const CLOSING_TYPES = new Set(ACTIONS.filter((action) => action.closesRecord).map((action) => action.type));

/** The call that closed the record, if it is closed (actions are newest first). */
export function closingAction(record: OutreachRecord): OutreachAction | undefined {
  if (record.status !== "closed") return undefined;
  return record.actions.find((action) => CLOSING_TYPES.has(action.action_type));
}
