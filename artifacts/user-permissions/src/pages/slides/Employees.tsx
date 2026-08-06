export default function Employees() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      <div className="absolute top-0 left-0 w-full h-[1vh] bg-gradient-to-r from-primary via-accent to-transparent" />
      <div className="relative h-full grid grid-cols-[38%_62%]">
        <div className="bg-[#101427] flex flex-col justify-center pl-[6vw] pr-[3vw]">
          <p className="font-body text-[1.5vw] font-semibold tracking-[0.25em] uppercase text-[#7dd3fc]">
            Role scope · 1 of 4
          </p>
          <h2 className="font-display font-bold text-[3.6vw] leading-[1.1] text-white tracking-tight mt-[2vh]">
            Employees &amp; Executives
          </h2>
          <p className="font-body text-[1.8vw] text-white/70 mt-[3vh] leading-relaxed">
            The narrowest scope: their own work, their own clients.
          </p>
        </div>
        <div className="flex flex-col justify-center pl-[5vw] pr-[6vw] gap-[3.4vh]">
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">My Tasks:</span> only tasks assigned to them — nothing else
          </p>
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">Clients:</span> only their Assigned Projects
          </p>
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">Task categories:</span> Universal + their own department
          </p>
          <p className="font-body text-[2vw] leading-snug">
            No Team View, no approvals, no checklist dashboards, no reports
          </p>
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">QC:</span> only status updates on their own tasks
          </p>
        </div>
      </div>
    </div>
  );
}
