export type Role = "superadmin" | "admin" | "user";
export type TaskStatus = "todo" | "in_progress" | "in_review" | "completed" | "blocked" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  department?: string;
  designation?: string;
  status: "active" | "inactive" | "suspended";
  isTwoFactorEnabled: boolean;
  createdAt: string;
}

export interface Attachment {
  _id: string;
  fileName: string;
  originalName: string;
  fileType: "pdf" | "doc" | "docx" | "xls" | "xlsx" | "image" | "link" | "other";
  mimeType: string;
  fileSize: number;
  url: string;
  uploadedBy: User | string;
  createdAt: string;
}

export interface ActivityItem {
  _id: string;
  action: "created" | "status_changed" | "priority_changed" | "reassigned" | "commented" | "edited";
  performedBy: User;
  meta: Record<string, any>;
  timestamp: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: User[];
  assignedBy: User;
  dueDate?: string;
  startDate?: string;
  completedAt?: string;
  tags: string[];
  category: string;
  attachments: Attachment[];
  watchers?: User[];
  activityLog: ActivityItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  task: string;
  author: User;
  text: string;
  mentions: User[];
  attachments: Attachment[];
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  recipient: string;
  sender?: User;
  type: string;
  title: string;
  message: string;
  relatedTask?: Task;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    pages?: number;
  };
}
