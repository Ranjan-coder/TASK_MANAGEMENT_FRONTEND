import { apiClient } from "./client";
import type { ApiResponse } from "@/types";

/**
 * The company's project workflow (project-workflow-plan.md) and a project's place
 * in it. Shapes mirror backend modules/workflows (engine/navigate.js views).
 */

// ── Tree (what the editor edits) ──────────────────────────────────────────────

export interface ChecklistItem {
  key?: string;
  label: string;
}

export interface SubStageDef {
  key?: string; // missing on new items: the server gives one
  name: string;
  customerName?: string;
  showToCustomer?: boolean;
  optional?: boolean;
  durationDays?: number | null;
}

export interface StageDef {
  key?: string;
  name: string;
  customerName?: string;
  description?: string;
  departmentId?: string | null;
  handlers?: string[];
  subOrder?: "sequential" | "any";
  subStages: SubStageDef[];
  durationDays?: number | null; // E1
  gates?: { approval?: boolean; payment?: boolean; checklist?: ChecklistItem[] }; // E3
  paymentDueDays?: number | null; // E4
  entryMessage?: string; // E5
}

export interface WorkflowTree {
  stages: StageDef[];
}

export interface DiffSummary {
  added: { kind: "stage" | "sub"; key: string; name: string; stageKey?: string }[];
  removed: { kind: "stage" | "sub"; key: string; name: string; stageKey?: string }[];
  renamed: { kind: "stage" | "sub"; key: string; from: string; to: string; stageKey?: string }[];
  changed: { kind: "stage" | "sub"; key: string; stageKey?: string; fields: string[] }[];
  stageOrderChanged: boolean;
  structural: boolean;
  touchedStages: string[];
  removedSteps: string[];
  empty: boolean;
}

// ── Views (what a project shows) ──────────────────────────────────────────────

export type StepStatus = "done" | "current" | "upcoming" | "todo" | "inactive";

export interface Blocker {
  code: string;
  message: string;
  items?: string[];
}

export interface ExtraItem {
  _id: string;
  stageKey: string;
  note: string;
  done: boolean;
}

export interface StaffStage {
  key: string;
  name: string;
  customerName: string;
  status: "done" | "current" | "upcoming";
  any: boolean;
  durationDays: number | null;
  gates: { approval: boolean; payment: boolean; checklist: ChecklistItem[] };
  subs: { key: string; path: string; name: string; optional: boolean; showToCustomer: boolean; status: StepStatus }[];
  extras: ExtraItem[];
  checklist: { key: string; label: string; done: boolean }[];
}

export interface StaffFlowView {
  stepKey: string;
  stageKey: string;
  progress: { done: number; total: number; percent: number };
  next: string | null;
  prev: string | null;
  blockers: Blocker[];
  stages: StaffStage[];
}

export interface CustomerFlowView {
  progress: { done: number; total: number; percent: number };
  stages: {
    key: string;
    name: string;
    status: "done" | "current" | "upcoming";
    subs: { name: string; status: StepStatus }[];
    extras: { note: string; done: boolean }[];
  }[];
}

/** What every project action returns (the full staff view). */
export interface ProjectFlowResult {
  conversationId: string;
  status: "active" | "on_hold" | "completed";
  stage: string;
  version: number;
  flow: StaffFlowView;
  move?: "next" | "back" | "jump";
  overridden?: boolean;
}

export interface EditorState {
  name: string;
  version: number;
  tree: WorkflowTree;
  draft: WorkflowTree | null;
  draftRevision: number;
  draftUpdatedAt: string | null;
  canEdit: "all" | string[]; // admins: all; handlers: their stage keys
  olderProjects: number;
  preview: CustomerFlowView;
  offer: WorkflowOffer | null;
}

/** A newer version of the standard workflow this company started from (W7). */
export interface WorkflowOffer {
  templateName: string;
  fromVersion: number;
  toVersion: number;
  summary: DiffSummary;
  pending: boolean; // already merged into the draft
}

export interface MergeConflict {
  kind: "stage" | "sub";
  stageKey: string;
  subKey?: string;
  name: string;
  field: string;
  ours: unknown;
  theirs: unknown;
}

/** E2: how long projects really spend in each stage */
export interface StageReport {
  days: number;
  projects: number;
  bottleneck: string | null;
  rows: {
    stage: string;
    name: string;
    targetDays: number | null;
    finished: number;
    averageDays: number | null;
    medianDays: number | null;
    overTargetPct: number | null;
    inStageNow: number;
    overdueNow: number;
    older?: boolean;
  }[];
}

// ── Product owner: standard workflows ─────────────────────────────────────────

export interface TemplateRow {
  _id: string;
  name: string;
  description: string;
  defaultForNewCompanies: boolean;
  currentVersion: number;
  hasDraft: boolean;
  archived: boolean;
  companies: number;
  updatedAt: string;
}

export interface TemplateDetail extends Omit<TemplateRow, "hasDraft" | "companies"> {
  tree: WorkflowTree;
  draft: WorkflowTree | null;
  draftRevision: number;
  preview: CustomerFlowView | null;
  versions: { version: number; publishedAt: string }[];
}

export interface VersionRow {
  version: number;
  source: "standard" | "edit" | "update";
  publishedAt: string;
  publishedBy: string | null;
  projects: number;
  changes: { added: number; removed: number; renamed: number; changed: number } | null;
}

export interface MigrationPlan {
  fromVersion: number;
  toVersion: number;
  removed: { key: string; name: string }[];
  targets: { key: string; name: string }[];
}

const data = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data);

export const workflowApi = {
  // Editor
  editor: () => data<EditorState>(apiClient.get("/workflow/editor")),
  saveDraft: (tree: WorkflowTree, revision: number) =>
    data<{ draft: WorkflowTree; draftRevision: number; summary: DiffSummary; preview: CustomerFlowView }>(apiClient.put("/workflow/draft", { tree, revision })),
  discardDraft: (revision: number) => data<{ draftRevision: number }>(apiClient.post("/workflow/draft/discard", { revision })),
  publish: (revision: number) => data<{ version: number; summary: DiffSummary; projectsOnOlderVersions: number }>(apiClient.post("/workflow/publish", { revision })),
  versions: () => data<VersionRow[]>(apiClient.get("/workflow/versions")),
  migrationPlan: (fromVersion: number) => data<MigrationPlan>(apiClient.get(`/workflow/migrate/${fromVersion}`)),
  migrate: (fromVersion: number, mapping: Record<string, string>) => data<{ moved: number; toVersion: number }>(apiClient.post("/workflow/migrate", { fromVersion, mapping })),
  report: (days = 180) => data<StageReport>(apiClient.get("/workflow/report", { params: { days } })),
  applyOffer: () =>
    data<{ draft: WorkflowTree; draftRevision: number; conflicts: MergeConflict[]; changes: { added: { name: string }[]; removed: { name: string }[]; updated: { name: string }[] }; preview: CustomerFlowView }>(
      apiClient.post("/workflow/offer/apply")
    ),
  dismissOffer: () => data<{ dismissed: boolean }>(apiClient.post("/workflow/offer/dismiss")),

  // Product owner (console)
  templates: () => data<TemplateRow[]>(apiClient.get("/platform/workflows")),
  template: (id: string) => data<TemplateDetail>(apiClient.get(`/platform/workflows/${id}`)),
  createTemplate: (body: { name: string; description?: string; copyOf?: string | null }) => data<TemplateDetail>(apiClient.post("/platform/workflows", body)),
  updateTemplate: (id: string, body: { name?: string; description?: string; archived?: boolean }) => data<TemplateDetail>(apiClient.patch(`/platform/workflows/${id}`, body)),
  saveTemplateDraft: (id: string, tree: WorkflowTree, revision: number) =>
    data<{ draft: WorkflowTree; draftRevision: number; summary: DiffSummary; preview: CustomerFlowView }>(apiClient.put(`/platform/workflows/${id}/draft`, { tree, revision })),
  publishTemplate: (id: string, revision: number) => data<{ version: number; summary: DiffSummary }>(apiClient.post(`/platform/workflows/${id}/publish`, { revision })),
  setDefaultTemplate: (id: string) => data<TemplateRow[]>(apiClient.post(`/platform/workflows/${id}/default`)),

  // One project
  projectFlow: (projectId: string) => data<{ status: ProjectFlowResult["status"]; stage: string; version: number; flow: StaffFlowView; dueAt: string | null }>(apiClient.get(`/projects/${projectId}/flow`)),
  move: (projectId: string, body: { to: string; from: string; note?: string; override?: boolean }) => data<ProjectFlowResult>(apiClient.patch(`/projects/${projectId}/step`, body)),
  activate: (projectId: string, path: string, note: string) => data<ProjectFlowResult>(apiClient.post(`/projects/${projectId}/flow/activate`, { path, note })),
  deactivate: (projectId: string, path: string) => data<ProjectFlowResult>(apiClient.post(`/projects/${projectId}/flow/deactivate`, { path })),
  tick: (projectId: string, path: string, done: boolean) => data<ProjectFlowResult>(apiClient.post(`/projects/${projectId}/flow/tick`, { path, done })),
  addExtra: (projectId: string, stageKey: string, note: string) => data<ProjectFlowResult>(apiClient.post(`/projects/${projectId}/flow/extras`, { stageKey, note })),
  updateExtra: (projectId: string, extraId: string, action: "done" | "remove") => data<ProjectFlowResult>(apiClient.patch(`/projects/${projectId}/flow/extras/${extraId}`, { action })),
  checklist: (projectId: string, itemKey: string, done: boolean) => data<ProjectFlowResult>(apiClient.post(`/projects/${projectId}/flow/checklist`, { itemKey, done }))
};

/** The server's reason, or a fallback. */
export const flowError = (err: unknown, fallback = "That didn't work") => {
  const r = (err as { response?: { data?: { message?: string; errors?: { code?: string; blockers?: Blocker[] }[] } } })?.response?.data;
  return { message: r?.message || fallback, code: r?.errors?.[0]?.code, blockers: r?.errors?.[0]?.blockers };
};
