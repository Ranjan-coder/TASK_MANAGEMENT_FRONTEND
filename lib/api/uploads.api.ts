import apiClient from "./client";

export const uploadsApi = {
  uploadFile: (formData: FormData) =>
    apiClient.post("/uploads", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    }),

  uploadAvatar: (formData: FormData) =>
    apiClient.post("/uploads/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    }),

  attachLink: (data: { url: string; title?: string; entityType: string; entityId: string }) =>
    apiClient.post("/uploads/link", data),

  getAttachment: (id: string) => apiClient.get(`/uploads/${id}`),

  deleteAttachment: (id: string) => apiClient.delete(`/uploads/${id}`)
};
