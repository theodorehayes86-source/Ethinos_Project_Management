export default function BuildingBlocks() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      <div className="absolute top-0 left-0 w-full h-[1vh] bg-gradient-to-r from-primary via-accent to-transparent" />
      <div className="absolute top-[-12vh] right-[-8vw] w-[34vw] h-[34vw] rounded-full bg-primary/5" />
      <div className="relative h-full flex flex-col px-[7vw] py-[9vh]">
        <p className="font-body text-[1.5vw] font-semibold tracking-[0.25em] uppercase text-accent">
          How access is decided
        </p>
        <h2 className="font-display font-bold text-[4vw] tracking-tight mt-[1.5vh]">
          The Building Blocks of Access
        </h2>
        <div className="flex flex-col gap-[2.6vh] mt-[5vh]">
          <div className="flex items-baseline gap-[2vw]">
            <span className="font-display font-bold text-[2.4vw] text-primary w-[4vw] shrink-0">01</span>
            <p className="font-body text-[2vw] leading-snug">
              <span className="font-semibold">Assigned Projects</span> — a user only accesses clients listed on their profile (&lsquo;All&rsquo; = every client)
            </p>
          </div>
          <div className="flex items-baseline gap-[2vw]">
            <span className="font-display font-bold text-[2.4vw] text-primary w-[4vw] shrink-0">02</span>
            <p className="font-body text-[2vw] leading-snug">
              <span className="font-semibold">Reporting line</span> — managers see their direct reports and reporting subtree
            </p>
          </div>
          <div className="flex items-baseline gap-[2vw]">
            <span className="font-display font-bold text-[2.4vw] text-primary w-[4vw] shrink-0">03</span>
            <p className="font-body text-[2vw] leading-snug">
              <span className="font-semibold">Client Owners</span> — Business Heads / CSMs own specific clients (set by admins)
            </p>
          </div>
          <div className="flex items-baseline gap-[2vw]">
            <span className="font-display font-bold text-[2.4vw] text-primary w-[4vw] shrink-0">04</span>
            <p className="font-body text-[2vw] leading-snug">
              <span className="font-semibold">Department</span> — controls task categories and QC routing, not client access
            </p>
          </div>
          <div className="flex items-baseline gap-[2vw]">
            <span className="font-display font-bold text-[2.4vw] text-accent w-[4vw] shrink-0">05</span>
            <p className="font-body text-[2vw] leading-snug font-semibold text-accent">
              Every rule applies the same on desktop and mobile
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
