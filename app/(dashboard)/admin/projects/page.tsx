"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, X, FolderKanban, Lock } from "lucide-react";
import { toast } from "sonner";
import { projectsApi, type AdminProject, type ProjectStatus, type PersonRef } from "@/lib/api/projects.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { createProjectGroupKeys } from "@/lib/crypto/conversationKeys";
import { ChatKeysLockedError } from "@/lib/crypto/keyStore";
import { useAuthStore } from "@/store/authStore";
import { UserPicker, type PickedUser } from "@/components/admin/UserPicker";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/api/projectExtras.api";

const STATUS_LABEL: Record<ProjectStatus, string> = { active: "Active", on_hold: "On hold", completed: "Completed" };
const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  on_hold: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-slate-500/15 text-slate-300 border-slate-500/30"
};

const toPicked = (p?: PersonRef | null): PickedUser[] => (p ? [{ _id: p._id, name: p.name, email: p.email, phone: p.phone }] : []);

interface FormState {
  name: string;
  status: ProjectStatus;
  customers: PickedUser[];
  lead: PickedUser[];
  backup: PickedUser[];
  manager: PickedUser[];
  staff: PickedUser[];
}

const emptyForm = (): FormState => ({ name: "", status: "active", customers: [], lead: [], backup: [], manager: [], staff: [] });

const fromProject = (p: AdminProject): FormState => {
  const roleIds = new Set([p.project.leadDesigner?._id, p.project.backupDesigner?._id, p.project.manager?._id, ...p.project.customers.map((c) => c._id)]);
  return {
    name: p.name || "",
    status: p.project.status,
    customers: p.project.customers.map((c) => ({ _id: c._id, name: c.name, email: c.email, phone: c.phone })),
    lead: toPicked(p.project.leadDesigner),
    backup: toPicked(p.project.backupDesigner),
    manager: toPicked(p.project.manager),
    staff: p.members
      .filter((m) => !roleIds.has(m.user._id))
      .map((m) => ({ _id: m.user._id, name: m.user.name, publicKey: m.user.publicKey, keyVersion: m.user.keyVersion }))
  };
};

export default function ProjectsAdminPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ProjectStatus | "all">("active");
  const [editing, setEditing] = useState<{ project: AdminProject | null } | null>(null);
  // Leadership and "view projects" holders see the list; only admins set projects up
  const me = useAuthStore((s) => s.user);
  const admin = me?.role === "superadmin" || me?.role === "admin";
  const { data: projects, isLoading } = useQuery({
    queryKey: ["admin-projects", filter],
    queryFn: () => projectsApi.list(filter === "all" ? undefined : filter)
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-slate-400">Each project is a private chat between the customer and their design team.</p>
        </div>
        {admin && (
          <button onClick={() => setEditing({ project: null })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">
            <Plus className="h-4 w-4" /> New project
          </button>
        )}
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter projects">
        {(["active", "on_hold", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border", filter === f ? "bg-violet-600 border-violet-600 text-white" : "border-slate-700 text-slate-300")}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-32 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : !projects || projects.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-700 text-center space-y-2">
          <FolderKanban className="h-6 w-6 text-slate-500 mx-auto" />
          <p className="text-white font-semibold">No projects here</p>
          <p className="text-sm text-slate-400">Create a project to connect a customer with their designer.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p._id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500">Last activity {new Date(p.lastActivityAt).toLocaleString("en-IN")}</p>
                </div>
                <span className={cn("shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold", STATUS_STYLE[p.project.status])}>
                  {STATUS_LABEL[p.project.status]}
                </span>
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Customer</dt>
                <dd className="text-slate-200">{p.project.customers.map((c) => `${c.name}${c.phone ? ` (${c.phone})` : ""}`).join(", ")}</dd>
                <dt className="text-slate-500">Stage</dt>
                <dd className="text-slate-200">{stageLabel((p.project as { stage?: string }).stage)}</dd>
                <dt className="text-slate-500">Lead designer</dt>
                <dd className="text-slate-200">{p.project.leadDesigner?.name}</dd>
                {p.project.backupDesigner && (<><dt className="text-slate-500">Backup</dt><dd className="text-slate-200">{p.project.backupDesigner.name}</dd></>)}
                {p.project.manager && (<><dt className="text-slate-500">Manager</dt><dd className="text-slate-200">{p.project.manager.name}</dd></>)}
                <dt className="text-slate-500">People</dt>
                <dd className="text-slate-200">{p.members.length}</dd>
              </dl>
              {admin && (
                <button onClick={() => setEditing({ project: p })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs hover:border-slate-500">
                  <Pencil className="h-3.5 w-3.5" /> Edit team &amp; status
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ProjectEditor
          project={editing.project}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
          }}
        />
      )}
    </div>
  );
}

function ProjectEditor({ project, onClose, onSaved }: { project: AdminProject | null; onClose: () => void; onSaved: () => void }) {
  const me = useAuthStore((s) => s.user);
  const [form, setForm] = useState<FormState>(project ? fromProject(project) : emptyForm());
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const team = () => ({
    customerIds: form.customers.map((u) => u._id),
    leadDesignerId: form.lead[0]?._id,
    backupDesignerId: form.backup[0]?._id ?? null,
    managerId: form.manager[0]?._id ?? null,
    staffIds: form.staff.map((u) => u._id)
  });

  const save = useMutation({
    mutationFn: async () => {
      const t = team();
      if (!t.leadDesignerId) throw new Error("Choose a lead designer");
      if (t.customerIds.length === 0) throw new Error("Add at least one customer");
      if (project) {
        return projectsApi.update(project._id, { ...t, leadDesignerId: t.leadDesignerId, name: form.name.trim(), status: form.status });
      }
      if (!me) throw new Error("Not signed in");
      // First chat key: made here, wrapped only for the team (this admin isn't a member)
      const everyone = [...form.customers, ...form.lead, ...form.backup, ...form.manager, ...form.staff];
      const unique = everyone.filter((u, i) => everyone.findIndex((x) => x._id === u._id) === i);
      let encryptedGroupKeys = {};
      try {
        ({ keys: encryptedGroupKeys } = await createProjectGroupKeys(me._id, unique));
      } catch (err) {
        if (err instanceof ChatKeysLockedError) throw new Error("Open Chat once and unlock it, then create the project.");
        throw err;
      }
      return projectsApi.create({ ...t, leadDesignerId: t.leadDesignerId, name: form.name.trim(), encryptedGroupKeys });
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : "Project chat created — the team has been notified");
      onSaved();
    },
    onError: (err: any) => toast.error(err?.response ? apiErrorMessage(err, "Couldn't save the project") : err?.message || "Couldn't save the project")
  });

  const taken = (except: keyof FormState) =>
    (["customers", "lead", "backup", "manager", "staff"] as const)
      .filter((k) => k !== except)
      .flatMap((k) => form[k].map((u) => u._id));

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="w-full max-w-xl max-h-full sm:max-h-[92vh] overflow-y-auto bg-slate-900 sm:rounded-2xl border border-slate-700 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="project-editor-title" className="text-lg font-semibold text-white">{project ? "Edit project" : "New project"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="p-name" className="block text-xs font-medium text-slate-300 mb-1">Project name</label>
            <input
              id="p-name"
              required
              minLength={3}
              maxLength={100}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Mehta Residence – 3BHK"
              className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <UserPicker id="p-customers" label="Customer(s)" kind="customer" multiple required value={form.customers} onChange={(v) => set("customers", v)} exclude={taken("customers")} />
          <UserPicker id="p-lead" label="Lead designer" kind="staff" required value={form.lead} onChange={(v) => set("lead", v)} exclude={taken("lead")} />
          <UserPicker id="p-backup" label="Backup designer" kind="staff" value={form.backup} onChange={(v) => set("backup", v)} exclude={taken("backup")} />
          <UserPicker id="p-manager" label="Project manager" kind="staff" value={form.manager} onChange={(v) => set("manager", v)} exclude={taken("manager")} />
          <UserPicker id="p-staff" label="Other team members" kind="staff" multiple value={form.staff} onChange={(v) => set("staff", v)} exclude={taken("staff")} />

          {project && (
            <div>
              <label htmlFor="p-status" className="block text-xs font-medium text-slate-300 mb-1">Status</label>
              <select id="p-status" value={form.status} onChange={(e) => set("status", e.target.value as ProjectStatus)} className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm">
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          <p className="flex items-start gap-2 text-[11px] text-slate-500">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            The chat is end-to-end encrypted between these people. You set it up but aren&apos;t a member, so you can&apos;t read it. People
            marked • haven&apos;t opened Chat yet and get access automatically when they do. Anyone you remove loses access immediately.
          </p>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
          <button type="submit" disabled={save.isPending} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold">
            {save.isPending ? "Saving..." : project ? "Save changes" : "Create project chat"}
          </button>
        </div>
      </form>
    </div>
  );
}
