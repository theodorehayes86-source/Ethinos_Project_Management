/**
 * Checklist data model — Firebase Realtime Database shapes
 *
 * Firebase paths:
 *   /checklistTemplates/{id}   — ChecklistTemplate
 *   /taskGroups/{id}           — TaskGroup
 *
 * Task object extensions (existing /clientLogs/{clientId}/{taskId}):
 *   taskType?:        'standard' | 'checklist'
 *   taskGroupId?:     string  (links to /taskGroups/{id})
 *   checklistAnswer?: 'yes' | 'no' | 'na' | null
 *   checklistNote?:   string | null
 *
 * Access control:
 *   /settings/conditions/checklistAccess  — string[]  (role names that can create checklist tasks / view reporting)
 */

export type ChecklistCadence = 'Daily' | 'Weekly' | 'Monthly';

export type ChecklistAnswerValue = 'yes' | 'no' | 'na' | null;

/** A single question within a checklist template */
export interface ChecklistQuestion {
  id: string;
  text: string;
  requiresInput: boolean;
  inputLabel: string;
  order: number;
}

/** A checklist template stored at /checklistTemplates/{id} */
export interface ChecklistTemplate {
  id: string;
  name: string;
  departmentId: string;
  cadence: ChecklistCadence;
  questions: ChecklistQuestion[];
  createdAt: number;
}

/**
 * A task group created when a checklist template is applied.
 * Stored at /taskGroups/{id}.
 * Each member task in /clientLogs/{clientId}/{taskId} will have
 * taskGroupId pointing back to this document.
 */
export interface TaskGroup {
  id: string;
  name: string;
  clientId: string;
  assigneeId: string;
  templateId: string;
  departmentId: string;
  cadence: ChecklistCadence;
  status: 'pending' | 'in-progress' | 'complete';
  createdAt: number;
}

/**
 * Extension fields added to existing task objects when taskType === 'checklist'.
 * These are merged into the task shape in /clientLogs/{clientId}/{taskId}.
 */
export interface ChecklistTaskFields {
  taskType: 'standard' | 'checklist';
  taskGroupId?: string;
  checklistAnswer?: ChecklistAnswerValue;
  checklistNote?: string | null;
}
