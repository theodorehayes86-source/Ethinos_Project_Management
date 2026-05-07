export default function Slide3WhatIsFlowPro() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "#020116" }}>
      {/* Subtle green glow — bottom left */}
      <div
        className="absolute bottom-0 left-0"
        style={{ width: "30vw", height: "35vh", background: "radial-gradient(ellipse at bottom left, rgba(40,167,69,0.15) 0%, transparent 70%)" }}
      />
      {/* Accent top right */}
      <div
        className="absolute top-0 right-0"
        style={{ width: "0.35vw", height: "40vh", background: "#28A745", opacity: 0.5 }}
      />

      <div className="absolute inset-0 flex px-[7vw] py-[7vh]">
        {/* Left: heading + description */}
        <div className="flex flex-col justify-center pr-[4vw]" style={{ width: "40%" }}>
          <div className="mb-[2.5vh]" style={{ width: "3vw", height: "0.4vh", background: "#28A745" }} />
          <h2
            className="font-display font-extrabold tracking-tight text-white leading-tight"
            style={{ fontSize: "4vw", textWrap: "balance" }}
          >
            What Is Flow Pro?
          </h2>
          <p
            className="font-body mt-[2.5vh] text-white"
            style={{ fontSize: "2.1vw", opacity: 0.7, lineHeight: "1.55", textWrap: "pretty" }}
          >
            A full-stack project management platform purpose-built for Ethinos.
          </p>
        </div>

        {/* Right: 2×2 feature cards */}
        <div className="flex flex-col justify-center gap-[2vh]" style={{ width: "60%" }}>
          <div className="flex gap-[2vw]">
            <div
              className="flex-1 rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(40,167,69,0.35)" }}
            >
              <div className="mb-[1.5vh]" style={{ width: "1.8vw", height: "0.3vh", background: "#28A745" }} />
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.35" }}>
                Client &amp; project task management
              </p>
            </div>
            <div
              className="flex-1 rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(40,167,69,0.35)" }}
            >
              <div className="mb-[1.5vh]" style={{ width: "1.8vw", height: "0.3vh", background: "#28A745" }} />
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.35" }}>
                Live time tracking with timer
              </p>
            </div>
          </div>
          <div className="flex gap-[2vw]">
            <div
              className="flex-1 rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(40,167,69,0.35)" }}
            >
              <div className="mb-[1.5vh]" style={{ width: "1.8vw", height: "0.3vh", background: "#28A745" }} />
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.35" }}>
                Role-based access for all ~80 staff
              </p>
            </div>
            <div
              className="flex-1 rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(40,167,69,0.35)" }}
            >
              <div className="mb-[1.5vh]" style={{ width: "1.8vw", height: "0.3vh", background: "#28A745" }} />
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.35" }}>
                Desktop, mobile &amp; timer widget
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
