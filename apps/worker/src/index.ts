// @videogen/worker — background job worker (BullMQ + Redis, ADR-006).
// Phase 1+2 does not ship media/render jobs; queue workers are added with the
// research/script/storyboard job tasks. This placeholder keeps the workspace
// wiring green and matches ADR-001's apps/* layout.

import { AI_VERSION } from "@videogen/ai";

console.log(`[worker] videogen worker booting (version ${AI_VERSION})`);
console.log("[worker] no queues registered yet — Phase 1+2 runs the workflow in-process via the API.");

export const WORKER_READY = true;
