import type { ActionType } from "../api/types";

export type ActionInfo = {
  type: ActionType;
  label: string;
  closesRecord: boolean;
};

// The call outcomes from the spec, in the order agents see them.
export const ACTIONS: ActionInfo[] = [
  { type: "no_answer", label: "No Answer", closesRecord: false },
  { type: "voicemail", label: "Voicemail", closesRecord: false },
  { type: "scheduled", label: "Scheduled", closesRecord: true },
  { type: "not_interested", label: "Not Interested", closesRecord: true },
];
