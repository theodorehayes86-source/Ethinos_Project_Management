export default function Admins() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#101427]">
      <div className="absolute top-0 left-0 w-full h-[1vh] bg-gradient-to-r from-accent via-primary to-transparent" />
      <div className="absolute top-[-10vh] right-[-6vw] w-[28vw] h-[28vw] rounded-full bg-[#7dd3fc]/5" />
      <div className="relative h-full flex flex-col px-[7vw] py-[9vh]">
        <p className="font-body text-[1.5vw] font-semibold tracking-[0.25em] uppercase text-[#7dd3fc]">
          Role scope · 4 of 4
        </p>
        <h2 className="font-display font-bold text-[4vw] tracking-tight text-white mt-[1.5vh]">
          Super Admin &amp; Director
        </h2>
        <div className="flex flex-col gap-[3.2vh] mt-[5vh]">
          <p className="font-body text-[2vw] leading-snug text-white/90">
            <span className="font-semibold text-white">Super Admin:</span> everything — all users, clients, tasks, org-wide Team View, all QC, Control Centre, password resets
          </p>
          <p className="font-body text-[2vw] leading-snug text-white/90">
            <span className="font-semibold text-white">Director:</span> all clients, checklists, metrics &amp; reports; Team View limited to own reporting tree
          </p>
          <p className="font-body text-[2vw] leading-snug text-white/90">
            <span className="font-semibold text-white">Control Centre</span> (users, clients, categories, templates): Super Admin + Director
          </p>
          <p className="font-body text-[2vw] leading-snug text-white/90">
            <span className="font-semibold text-white">Region filter:</span> admin roles only
          </p>
          <p className="font-body text-[2vw] leading-snug text-[#7dd3fc] font-semibold">
            Archived users and archived tasks are hidden everywhere, for everyone
          </p>
        </div>
      </div>
    </div>
  );
}
