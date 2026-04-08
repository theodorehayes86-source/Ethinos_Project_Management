import React, { useState } from "react";
import { TasksProvider } from "../context/TasksContext";
import Header from "../components/Header";
import TaskListPage from "./TaskListPage";
import TimerPage from "./TimerPage";
import { TaskLog } from "../types";

interface SelectedTask {
  task: TaskLog;
  clientName: string;
}

export default function MainApp() {
  const [selected, setSelected] = useState<SelectedTask | null>(null);

  return (
    <TasksProvider>
      <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 overflow-hidden">
        <Header />
        {selected ? (
          <TimerPage
            task={selected.task}
            clientName={selected.clientName}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                My Tasks
              </h2>
            </div>
            <TaskListPage
              onSelectTask={(task, clientName) => setSelected({ task, clientName })}
            />
          </div>
        )}
      </div>
    </TasksProvider>
  );
}
