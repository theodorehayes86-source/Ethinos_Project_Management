export default function Slide7GettingStarted() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "#020116" }}>
      {/* Subtle top-right glow */}
      <div
        className="absolute top-0 right-0"
        style={{
          width: "35vw",
          height: "40vh",
          background: "radial-gradient(ellipse at top right, rgba(40,167,69,0.14) 0%, transparent 70%)",
        }}
      />

      <div className="absolute inset-0 flex flex-col px-[7vw] py-[7vh]">
        {/* Heading */}
        <div>
          <div className="mb-[1.5vh]" style={{ width: "3vw", height: "0.4vh", background: "#28A745" }} />
          <h2
            className="font-display font-extrabold tracking-tight text-white leading-tight"
            style={{ fontSize: "4.2vw", textWrap: "balance" }}
          >
            Getting Started
          </h2>
          <p
            className="font-body text-white mt-[1.5vh]"
            style={{ fontSize: "2vw", opacity: 0.65, lineHeight: "1.5", textWrap: "pretty" }}
          >
            Sign in with your Microsoft 365 account — no new password needed.
          </p>
        </div>

        {/* 2×2 steps grid */}
        <div className="flex-1 flex flex-col justify-center gap-[2.5vh] mt-[1vh]">
          <div className="flex gap-[2.5vw]">
            <div
              className="flex-1 flex items-start gap-[1.5vw] rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span
                className="font-display font-extrabold shrink-0"
                style={{ fontSize: "3vw", color: "#28A745", lineHeight: "1" }}
              >
                1
              </span>
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.45", marginTop: "0.3vh" }}>
                Open Flow Pro in your browser
              </p>
            </div>
            <div
              className="flex-1 flex items-start gap-[1.5vw] rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span
                className="font-display font-extrabold shrink-0"
                style={{ fontSize: "3vw", color: "#28A745", lineHeight: "1" }}
              >
                2
              </span>
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.45", marginTop: "0.3vh" }}>
                Click 'Sign in with Microsoft'
              </p>
            </div>
          </div>
          <div className="flex gap-[2.5vw]">
            <div
              className="flex-1 flex items-start gap-[1.5vw] rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span
                className="font-display font-extrabold shrink-0"
                style={{ fontSize: "3vw", color: "#28A745", lineHeight: "1" }}
              >
                3
              </span>
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.45", marginTop: "0.3vh" }}>
                Download Ethinos Timer Pro for desktop
              </p>
            </div>
            <div
              className="flex-1 flex items-start gap-[1.5vw] rounded-[0.5vw] px-[2vw] py-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span
                className="font-display font-extrabold shrink-0"
                style={{ fontSize: "3vw", color: "#28A745", lineHeight: "1" }}
              >
                4
              </span>
              <p className="font-body font-semibold text-white" style={{ fontSize: "2vw", lineHeight: "1.45", marginTop: "0.3vh" }}>
                Download the mobile companion app
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
