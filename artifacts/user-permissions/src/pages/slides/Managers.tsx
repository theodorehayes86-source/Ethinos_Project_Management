export default function Managers() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      <div className="absolute top-0 left-0 w-full h-[1vh] bg-gradient-to-r from-primary via-accent to-transparent" />
      <div className="relative h-full grid grid-cols-[38%_62%]">
        <div className="bg-primary flex flex-col justify-center pl-[6vw] pr-[3vw]">
          <p className="font-body text-[1.5vw] font-semibold tracking-[0.25em] uppercase text-[#c7d2fe]">
            Role scope · 2 of 4
          </p>
          <h2 className="font-display font-bold text-[3.6vw] leading-[1.1] text-white tracking-tight mt-[2vh]">
            Managers, Snr Managers &amp; Project Managers
          </h2>
          <p className="font-body text-[1.8vw] text-white/75 mt-[3vh] leading-relaxed">
            Scoped to the people who report to them.
          </p>
        </div>
        <div className="flex flex-col justify-center pl-[5vw] pr-[6vw] gap-[3.4vh]">
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">Team View:</span> direct reports, drill-down into their own reporting subtree only
          </p>
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">Tasks:</span> everything assigned within their subtree, for clients they can access
          </p>
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">Checklists:</span> clients where their subtree has checklist work
          </p>
          <p className="font-body text-[2vw] leading-snug">
            <span className="font-semibold">QC approvals:</span> only tasks routed to them as QC assignee (own department unless cross-dept)
          </p>
          <p className="font-body text-[2vw] leading-snug">
            No access to other branches of the organisation
          </p>
        </div>
      </div>
    </div>
  );
}
