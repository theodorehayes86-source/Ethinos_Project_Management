export default function Slide5TimeTracking() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "#020116" }}>
      {/* Background radial accent */}
      <div
        className="absolute"
        style={{
          top: "50%",
          right: "5vw",
          transform: "translateY(-50%)",
          width: "38vw",
          height: "38vw",
          background: "radial-gradient(circle, rgba(40,167,69,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />

      <div className="absolute inset-0 flex px-[7vw] py-[7vh]">
        {/* Left: heading + body + bullets */}
        <div className="flex flex-col justify-center pr-[4vw]" style={{ width: "55%" }}>
          <div className="mb-[2.5vh]" style={{ width: "3vw", height: "0.4vh", background: "#28A745" }} />
          <h2
            className="font-display font-extrabold tracking-tight text-white leading-tight"
            style={{ fontSize: "4.2vw", textWrap: "balance" }}
          >
            Time Tracking
          </h2>
          <p
            className="font-body text-white mt-[2.5vh]"
            style={{ fontSize: "2.1vw", opacity: 0.72, lineHeight: "1.55", textWrap: "pretty" }}
          >
            Start, pause, and stop timers on any task — directly from your browser or the Ethinos Timer Pro desktop widget.
          </p>
          <div className="mt-[3vh] flex flex-col gap-[1.8vh]">
            <div className="flex items-start gap-[1.2vw]">
              <div
                className="shrink-0 mt-[0.8vh]"
                style={{ width: "0.6vw", height: "0.6vw", background: "#28A745", borderRadius: "50%" }}
              />
              <p className="font-body text-white" style={{ fontSize: "2vw", opacity: 0.8, lineHeight: "1.4" }}>
                Live elapsed time visible to the whole team
              </p>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <div
                className="shrink-0 mt-[0.8vh]"
                style={{ width: "0.6vw", height: "0.6vw", background: "#28A745", borderRadius: "50%" }}
              />
              <p className="font-body text-white" style={{ fontSize: "2vw", opacity: 0.8, lineHeight: "1.4" }}>
                Automatic alerts at 4 hours
              </p>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <div
                className="shrink-0 mt-[0.8vh]"
                style={{ width: "0.6vw", height: "0.6vw", background: "#28A745", borderRadius: "50%" }}
              />
              <p className="font-body text-white" style={{ fontSize: "2vw", opacity: 0.8, lineHeight: "1.4" }}>
                Edit and correct logged time when needed
              </p>
            </div>
          </div>
        </div>

        {/* Right: decorative timer display */}
        <div className="flex flex-col items-center justify-center" style={{ width: "45%" }}>
          <p className="font-body font-semibold mb-[1.5vh]" style={{ fontSize: "1.6vw", color: "#28A745", letterSpacing: "0.15em" }}>
            TIMER PRO
          </p>
          <div
            className="flex items-center justify-center rounded-[1vw]"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(40,167,69,0.4)",
              width: "32vw",
              height: "14vh",
            }}
          >
            <span
              className="font-display font-extrabold tracking-tighter"
              style={{ fontSize: "7vw", color: "#28A745", letterSpacing: "-0.03em" }}
            >
              04:00:00
            </span>
          </div>
          <p
            className="font-body mt-[1.5vh] text-center"
            style={{ fontSize: "1.7vw", color: "#6B7280", lineHeight: "1.4" }}
          >
            Desktop widget + mobile companion
          </p>
        </div>
      </div>
    </div>
  );
}
