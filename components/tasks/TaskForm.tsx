"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const taskSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]),
    category: z.string().optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional()
  })
  .refine(
    (data) => {
      const today = getTodayStr();
      if (data.startDate && data.startDate < today) {
        return false;
      }
      return true;
    },
    {
      message: "Start date cannot be earlier than today",
      path: ["startDate"]
    }
  )
  .refine(
    (data) => {
      const today = getTodayStr();
      if (data.dueDate && data.startDate && data.dueDate < data.startDate) {
        return false;
      }
      if (data.dueDate && !data.startDate && data.dueDate < today) {
        return false;
      }
      return true;
    },
    {
      message: "Due date cannot be earlier than start date",
      path: ["dueDate"]
    }
  );

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskFormProps {
  onSubmit: (data: TaskFormData) => Promise<void>;
  isLoading?: boolean;
}

export function TaskForm({ onSubmit, isLoading }: TaskFormProps) {
  const todayStr = getTodayStr();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      priority: "medium",
      category: "General",
      startDate: "",
      dueDate: ""
    }
  });

  const selectedStartDate = watch("startDate");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Task Title *
        </label>
        <Input placeholder="e.g. Build authentication endpoints" {...register("title")} />
        {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Description
        </label>
        <textarea
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
          placeholder="Detailed task specifications and requirements..."
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Priority
          </label>
          <select
            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
            {...register("priority")}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Category
          </label>
          <Input placeholder="e.g. Frontend, API, QA" {...register("category")} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Start Date
          </label>
          <Input type="date" min={todayStr} {...register("startDate")} />
          {errors.startDate && <p className="text-xs text-red-500">{errors.startDate.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Due Date
          </label>
          <Input type="date" min={selectedStartDate || todayStr} {...register("dueDate")} />
          {errors.dueDate && <p className="text-xs text-red-500">{errors.dueDate.message}</p>}
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Creating Task..." : "Create Task"}
        </Button>
      </div>
    </form>
  );
}
