export default function ClientOwners() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      <div className="absolute top-0 left-0 w-full h-[1vh] bg-gradient-to-r from-primary via-accent to-transparent" />
      <div className="absolute bottom-[-14vh] left-[-8vw] w-[30vw] h-[30vw] rounded-full bg-accent/5" />
      <div className="relative h-full flex flex-col px-[7vw] py-[8vh]">
        <p className="font-body text-[1.5vw] font-semibold tracking-[0.25em] uppercase text-accent">
          Role scope · 3 of 4
        </p>
        <h2 className="font-display font-bold text-[3.6vw] tracking-tight mt-[1.2vh]">
          Business Heads &amp; CSMs — Client Owners
        </h2>
        <div className="grid grid-cols-2 gap-[4vw] mt-[4.5vh] flex-1">
          <div className="flex flex-col gap-[3vh]">
            <p className="font-display font-bold text-[1.8vw] text-primary uppercase tracking-wide">
              What they see
            </p>
            <p className="font-body text-[1.9vw] leading-snug">
              See ALL tasks for their owned clients + clients owned by their direct reportee CSMs — across any department
            </p>
            <p className="font-body text-[1.9vw] leading-snug">
              <span className="font-semibold">Team View:</span> direct reportees + the teams allocated to those clients
            </p>
          </div>
          <div className="flex flex-col gap-[3vh]">
            <p className="font-display font-bold text-[1.8vw] text-[#9f1239] uppercase tracking-wide">
              What they never see
            </p>
            <p className="font-body text-[1.9vw] leading-snug">
              Personal tasks, other clients&rsquo; tasks, unrelated branches, archived users
            </p>
            <p className="font-body text-[1.9vw] leading-snug">
              Seeing a person &ne; seeing all their tasks — task visibility is always client-checked
            </p>
          </div>
        </div>
        <div className="bg-[#101427] rounded-[0.8vw] px-[2.5vw] py-[2.6vh]">
          <p className="font-body text-[1.9vw] text-white leading-snug">
            Enforced in every KPI, list, search, member detail and weekly board
          </p>
        </div>
      </div>
    </div>
  );
}
