import apiClient from "./client";

export const commentsApi = {
  getComments: (taskId: string) =>
    apiClient.get(`/tasks/${taskId}/comments`),

  addComment: (taskId: string, data: { text: string; mentions?: string[]; attachments?: string[] }) =>
    apiClient.post(`/tasks/${taskId}/comments`, data),

  updateComment: (commentId: string, data: { text: string }) =>
    apiClient.patch(`/comments/${commentId}`, data),

  deleteComment: (commentId: string) =>
    apiClient.delete(`/comments/${commentId}`)
};
