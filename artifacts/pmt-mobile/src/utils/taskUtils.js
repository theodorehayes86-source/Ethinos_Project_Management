import { parse, isBefore, startOfToday } from 'date-fns';

export const isTaskOverdue = (task, currentStatus) => {
  const status = currentStatus !== undefined ? currentStatus : task.status;
  if (!task.dueDate || status === 'Done') return false;
  try {
    const due = parse(task.dueDate, 'do MMM yyyy', new Date());
    return isBefore(due, startOfToday());
  } catch {
    return false;
  }
};
