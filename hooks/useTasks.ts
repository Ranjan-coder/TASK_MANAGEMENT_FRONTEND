import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { ApiResponse, Task, TaskStatus } from "@/types";
import { toast } from "sonner";

export function useTasks(filters?: Record<string, any>) {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ["tasks", filters],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Task[]>>("/tasks", { params: filters });
      return res.data.data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const res = await apiClient.patch<ApiResponse<Task>>(`/tasks/${taskId}/status`, { status });
      return res.data.data;
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<Task[]>(["tasks", filters], (old) =>
        old ? old.map((t) => (t._id === updatedTask._id ? updatedTask : t)) : []
      );
      toast.success(`Task status updated to ${updatedTask.status}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to update task status");
    }
  });

  return {
    tasks: tasksQuery.data || [],
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    refetch: tasksQuery.refetch,
    updateStatus: updateStatusMutation.mutate
  };
}
